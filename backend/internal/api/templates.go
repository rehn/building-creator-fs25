package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"mime"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"house-to-i3d/backend/internal/store"
	"house-to-i3d/backend/internal/vision"
)

const (
	maxTemplatePhotos = 8
	maxPhotoBytes     = 8 << 20 // one photo; the wizard sends them smaller
	maxGuideBytes     = 64 << 10
	maxSchemaBytes    = 128 << 10
	maxNotesChars     = 2000
	maxBlurbChars     = 300
	// Claude takes a while to look at the photos; the server's usual write timeout is shorter.
	suggestTimeout = 4 * time.Minute // under the web proxy's 5 minutes
)

var kindID = regexp.MustCompile(`^[a-z][a-z0-9]{0,19}$`)

// photoTypes: what a photo may be, by its bytes (not by what the browser says it is).
var photoTypes = map[string]bool{"image/jpeg": true, "image/png": true, "image/webp": true}

func templateError(w http.ResponseWriter, err error) {
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "That template doesn't exist.")
		return
	}
	internalError(w, err)
}

// visionStatus: whether the API can ask Claude (it has an ANTHROPIC_API_KEY); else the wizard offers only the chat.
func (s *Server) visionStatus(w http.ResponseWriter, r *http.Request, u store.User) {
	writeJSON(w, http.StatusOK, map[string]bool{"enabled": s.cfg.Vision != nil})
}

// listTemplates: the published templates, for everyone's "New".
func (s *Server) listTemplates(w http.ResponseWriter, r *http.Request, u store.User) {
	list, err := s.st.ListTemplates(r.Context(), false)
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) listAllTemplates(w http.ResponseWriter, r *http.Request, u store.User) {
	list, err := s.st.ListTemplates(r.Context(), true)
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) getTemplate(w http.ResponseWriter, r *http.Request, u store.User) {
	t, err := s.st.GetTemplate(r.Context(), r.PathValue("id"))
	if err != nil {
		templateError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, t)
}

// templatePhoto sends photo n of a template: anyone may see a published template's, only the admin a draft's.
func (s *Server) templatePhoto(w http.ResponseWriter, r *http.Request, u store.User) {
	n, err := strconv.Atoi(r.PathValue("n"))
	if err != nil || n < 0 {
		templateError(w, store.ErrNotFound)
		return
	}
	t, err := s.st.GetTemplate(r.Context(), r.PathValue("id"))
	if err == nil && !t.Published && !u.IsAdmin {
		err = store.ErrNotFound
	}
	if err != nil {
		templateError(w, err)
		return
	}
	p, err := s.st.TemplatePhoto(r.Context(), t.ID, n)
	if err != nil {
		templateError(w, err)
		return
	}
	w.Header().Set("Content-Type", p.Type)
	w.Header().Set("Cache-Control", "private, max-age=3600")
	w.Write(p.Data)
}

// createTemplate starts a template: a multipart form with kind, name, blurb and photos.
func (s *Server) createTemplate(w http.ResponseWriter, r *http.Request, u store.User) {
	if mt, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type")); mt != "multipart/form-data" {
		writeError(w, http.StatusUnsupportedMediaType, "unsupported_media_type", "Send the photos as a form.")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, (maxTemplatePhotos+1)*maxPhotoBytes)
	mr, err := r.MultipartReader()
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_form", "Send the photos as a form.")
		return
	}
	fields := map[string]string{}
	var photos []store.TemplatePhoto
	badPhotos := ""
	for {
		part, err := mr.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			tooBig(w, err)
			return
		}
		switch name := part.FormName(); name {
		case "kind", "name", "blurb":
			b, err := io.ReadAll(io.LimitReader(part, 4<<10))
			if err != nil {
				tooBig(w, err)
				return
			}
			fields[name] = string(b)
		case "photos":
			data, err := io.ReadAll(io.LimitReader(part, maxPhotoBytes+1))
			if err != nil {
				tooBig(w, err)
				return
			}
			typ := http.DetectContentType(data)
			switch {
			case len(data) > maxPhotoBytes:
				badPhotos = "A photo can be 8 MB at most."
			case !photoTypes[typ]:
				badPhotos = "Photos must be JPEG, PNG or WebP."
			}
			photos = append(photos, store.TemplatePhoto{Type: typ, Data: data})
		}
	}
	name, ok := cleanText(fields["name"], 100)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid_name", "Use a name of 1 to 100 characters.")
		return
	}
	if !kindID.MatchString(fields["kind"]) {
		writeError(w, http.StatusBadRequest, "invalid_kind", "Choose what kind of building it is.")
		return
	}
	blurb, ok := cleanBlurb(fields["blurb"])
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid_blurb", "Keep the description to 300 characters on one line.")
		return
	}
	if len(photos) == 0 || len(photos) > maxTemplatePhotos {
		badPhotos = "Add 1 to 8 photos."
	}
	if badPhotos != "" {
		writeError(w, http.StatusBadRequest, "invalid_photos", badPhotos)
		return
	}
	t, err := s.st.CreateTemplate(r.Context(), u.ID, store.TemplateInput{Kind: fields["kind"], Name: name, Blurb: blurb}, photos)
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, t)
}

// cleanBlurb: empty, or text like cleanText's.
func cleanBlurb(s string) (string, bool) {
	if strings.TrimSpace(s) == "" {
		return "", true
	}
	return cleanText(s, maxBlurbChars)
}

type templatePatch struct {
	Name      *string         `json:"name"`
	Blurb     *string         `json:"blurb"`
	Settings  json.RawMessage `json:"settings"`
	Thumbnail *string         `json:"thumbnail"`
	ProjectID *string         `json:"projectId"`
	Published *bool           `json:"published"`
	// an answer pasted from a chat with Claude, kept like one from the API
	Suggestion json.RawMessage `json:"suggestion"`
}

func (s *Server) updateTemplate(w http.ResponseWriter, r *http.Request, u store.User) {
	var in templatePatch
	if !decodeJSON(w, r, &in) {
		return
	}
	if in.Name != nil {
		name, ok := cleanText(*in.Name, 100)
		if !ok {
			writeError(w, http.StatusBadRequest, "invalid_name", "Use a name of 1 to 100 characters.")
			return
		}
		in.Name = &name
	}
	if in.Blurb != nil {
		blurb, ok := cleanBlurb(*in.Blurb)
		if !ok {
			writeError(w, http.StatusBadRequest, "invalid_blurb", "Keep the description to 300 characters on one line.")
			return
		}
		in.Blurb = &blurb
	}
	if present(in.Settings) && !validData(in.Settings) {
		writeError(w, http.StatusBadRequest, "invalid_settings", "The settings must be a JSON object.")
		return
	}
	if in.Thumbnail != nil && !validThumbnail(*in.Thumbnail) {
		writeError(w, http.StatusBadRequest, "invalid_thumbnail", "The preview must be a small JPEG or PNG.")
		return
	}
	sg := bytes.TrimSpace(in.Suggestion)
	if present(in.Suggestion) && (len(sg) > maxSchemaBytes || sg[0] != '{' || !json.Valid(sg)) {
		writeError(w, http.StatusBadRequest, "invalid_suggestion", "The answer must be a JSON object.")
		return
	}
	if in.ProjectID != nil && len(*in.ProjectID) > 40 {
		writeError(w, http.StatusBadRequest, "invalid_project", "That isn't a project.")
		return
	}
	if in.Published != nil && *in.Published && !present(in.Settings) {
		cur, err := s.st.GetTemplate(r.Context(), r.PathValue("id"))
		if err != nil {
			templateError(w, err)
			return
		}
		if bytes.Equal(bytes.TrimSpace(cur.Settings), []byte("{}")) {
			writeError(w, http.StatusBadRequest, "no_settings", "Adjust the building in the editor before publishing it.")
			return
		}
	}
	upd := store.TemplateUpdate{Name: in.Name, Blurb: in.Blurb, Thumbnail: in.Thumbnail, ProjectID: in.ProjectID, Published: in.Published}
	if present(in.Settings) {
		upd.Settings = in.Settings
	}
	if present(in.Suggestion) {
		upd.Suggestion = json.RawMessage(sg)
	}
	t, err := s.st.UpdateTemplate(r.Context(), r.PathValue("id"), upd)
	if err != nil {
		templateError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, t)
}

func (s *Server) deleteTemplate(w http.ResponseWriter, r *http.Request, u store.User) {
	if err := s.st.DeleteTemplate(r.Context(), r.PathValue("id")); err != nil {
		templateError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type suggestInput struct {
	Guide  string          `json:"guide"`
	Notes  string          `json:"notes"`
	Schema json.RawMessage `json:"schema"`
}

// suggestTemplate asks Claude for settings from the template's photos and keeps the answer with it.
// The editor sends what its settings are (guide) and the answer's shape (schema).
func (s *Server) suggestTemplate(w http.ResponseWriter, r *http.Request, u store.User) {
	var in suggestInput
	if !decodeJSON(w, r, &in) {
		return
	}
	if s.cfg.Vision == nil {
		writeError(w, http.StatusServiceUnavailable, "vision_off", "Claude isn't set up on this server: give the API an ANTHROPIC_API_KEY. You can still adjust the building by hand.")
		return
	}
	sch := bytes.TrimSpace(in.Schema)
	if in.Guide == "" || len(in.Guide) > maxGuideBytes || len(sch) > maxSchemaBytes || len(sch) < 2 || sch[0] != '{' || !json.Valid(sch) {
		writeError(w, http.StatusBadRequest, "invalid_request", "The guide or schema is missing or too big.")
		return
	}
	if utf8.RuneCountInString(in.Notes) > maxNotesChars {
		writeError(w, http.StatusBadRequest, "invalid_notes", "Keep the notes to 2000 characters.")
		return
	}
	t, err := s.st.GetTemplate(r.Context(), r.PathValue("id"))
	if err != nil {
		templateError(w, err)
		return
	}
	req := vision.Request{Kind: t.Kind, Guide: in.Guide, Notes: in.Notes, Schema: json.RawMessage(sch)}
	for n := range t.Photos {
		p, err := s.st.TemplatePhoto(r.Context(), t.ID, n)
		if err != nil {
			internalError(w, err)
			return
		}
		req.Photos = append(req.Photos, vision.Photo{Type: p.Type, Data: p.Data})
	}
	http.NewResponseController(w).SetWriteDeadline(time.Now().Add(suggestTimeout + 10*time.Second))
	ctx, cancel := context.WithTimeout(r.Context(), suggestTimeout)
	defer cancel()
	answer, err := s.cfg.Vision.Suggest(ctx, req)
	if err != nil {
		var ve vision.Error
		msg := "Couldn't reach Claude. Try again in a moment."
		if errors.As(err, &ve) {
			msg = string(ve)
		} else {
			log.Printf("suggest template %s: %v", t.ID, err)
		}
		writeError(w, http.StatusBadGateway, "vision_failed", msg)
		return
	}
	t, err = s.st.UpdateTemplate(r.Context(), t.ID, store.TemplateUpdate{Suggestion: answer})
	if err != nil {
		templateError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, t)
}
