package api

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"house-to-i3d/backend/internal/store"
)

type projectInput struct {
	Name      *string         `json:"name"`
	Data      json.RawMessage `json:"data"`
	Thumbnail *string         `json:"thumbnail"`
	Version   int64           `json:"version"`
}

// present reports whether a JSON field was sent with a non-null value.
func present(raw json.RawMessage) bool {
	t := bytes.TrimSpace(raw)
	return len(t) > 0 && !bytes.Equal(t, []byte("null"))
}

// validData accepts a JSON object of up to maxDataBytes. The editor
// checks each setting; the server only stores the object.
func validData(raw json.RawMessage) bool {
	t := bytes.TrimSpace(raw)
	return len(t) <= maxDataBytes && len(t) > 1 && t[0] == '{' && json.Valid(t)
}

// validThumbnail accepts "" or a small base64 JPEG or PNG data URL.
func validThumbnail(t string) bool {
	if t == "" {
		return true
	}
	if len(t) > maxThumbBytes {
		return false
	}
	for _, prefix := range []string{"data:image/jpeg;base64,", "data:image/png;base64,"} {
		if rest, ok := strings.CutPrefix(t, prefix); ok {
			_, err := base64.StdEncoding.DecodeString(rest)
			return err == nil
		}
	}
	return false
}

// checkInput validates the fields that were sent. It writes the error and returns false if one is bad.
func checkInput(w http.ResponseWriter, in *projectInput) bool {
	if in.Name != nil {
		name, ok := cleanText(*in.Name, 100)
		if !ok {
			writeError(w, http.StatusBadRequest, "invalid_name", "Use a name of 1 to 100 characters.")
			return false
		}
		in.Name = &name
	}
	if present(in.Data) && !validData(in.Data) {
		writeError(w, http.StatusBadRequest, "invalid_data", "The house settings must be a JSON object under 1 MB.")
		return false
	}
	if in.Thumbnail != nil && !validThumbnail(*in.Thumbnail) {
		writeError(w, http.StatusBadRequest, "invalid_thumbnail", "The preview must be a small JPEG or PNG.")
		return false
	}
	return true
}

func projectError(w http.ResponseWriter, err error) {
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "That house doesn't exist, or isn't yours.")
		return
	}
	internalError(w, err)
}

func (s *Server) listProjects(w http.ResponseWriter, r *http.Request, u store.User) {
	list, err := s.st.ListProjects(r.Context(), u.ID)
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) createProject(w http.ResponseWriter, r *http.Request, u store.User) {
	var in projectInput
	if !decodeJSON(w, r, &in) {
		return
	}
	if in.Name == nil {
		name := "New house"
		in.Name = &name
	}
	if !checkInput(w, &in) {
		return
	}
	data := json.RawMessage("{}")
	if present(in.Data) {
		data = in.Data
	}
	p, err := s.st.CreateProject(r.Context(), u.ID, *in.Name, data)
	if err != nil {
		internalError(w, err)
		return
	}
	if in.Thumbnail != nil && *in.Thumbnail != "" {
		if p, err = s.st.UpdateProject(r.Context(), u.ID, p.ID, store.ProjectUpdate{Thumbnail: in.Thumbnail}, 0); err != nil {
			internalError(w, err)
			return
		}
	}
	writeJSON(w, http.StatusCreated, p)
}

func (s *Server) getProject(w http.ResponseWriter, r *http.Request, u store.User) {
	p, err := s.st.GetProject(r.Context(), u.ID, r.PathValue("id"))
	if err != nil {
		projectError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (s *Server) updateProject(w http.ResponseWriter, r *http.Request, u store.User) {
	var in projectInput
	if !decodeJSON(w, r, &in) || !checkInput(w, &in) {
		return
	}
	upd := store.ProjectUpdate{Name: in.Name, Thumbnail: in.Thumbnail}
	if present(in.Data) {
		upd.Data = in.Data
	}
	p, err := s.st.UpdateProject(r.Context(), u.ID, r.PathValue("id"), upd, in.Version)
	if errors.Is(err, store.ErrConflict) {
		writeJSON(w, http.StatusConflict, apiError{Error: "version_conflict", Message: "This house was changed somewhere else, for example in another tab.", Version: p.Version})
		return
	}
	if err != nil {
		projectError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (s *Server) deleteProject(w http.ResponseWriter, r *http.Request, u store.User) {
	if err := s.st.DeleteProject(r.Context(), u.ID, r.PathValue("id")); err != nil {
		projectError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) duplicateProject(w http.ResponseWriter, r *http.Request, u store.User) {
	src, err := s.st.GetProject(r.Context(), u.ID, r.PathValue("id"))
	if err != nil {
		projectError(w, err)
		return
	}
	name := src.Name + " (copy)"
	if rs := []rune(name); len(rs) > 100 {
		name = string(rs[:100])
	}
	p, err := s.st.DuplicateProject(r.Context(), u.ID, src.ID, name)
	if err != nil {
		projectError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, p)
}
