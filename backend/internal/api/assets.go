package api

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"regexp"
	"strings"

	"building-creator-fs25/backend/internal/store"
)

const (
	maxAssetBytes = 50 << 20 // all of an item's files together
	maxAssetFiles = 30
	maxMetaBytes  = 64 << 10
)

// fileName: a plain file name as Giants Editor writes them (no folders), so the i3d's own
// references (its .shapes, its textures) still match when the files are put side by side.
var fileName = regexp.MustCompile(`^[A-Za-z0-9_][A-Za-z0-9 _.()+-]{0,99}$`)

func validMeta(raw []byte) bool {
	t := bytes.TrimSpace(raw)
	return len(t) <= maxMetaBytes && len(t) > 1 && t[0] == '{' && json.Valid(t)
}

func assetError(w http.ResponseWriter, err error) {
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "That item doesn't exist, or isn't yours.")
		return
	}
	internalError(w, err)
}

func (s *Server) listAssets(w http.ResponseWriter, r *http.Request, u store.User) {
	list, err := s.st.ListAssets(r.Context(), u.ID)
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

// createAsset imports an item: a multipart form with name, meta (JSON object) and files
// (exactly one .i3d, plus its .shapes, the .obj for the preview, textures ...).
func (s *Server) createAsset(w http.ResponseWriter, r *http.Request, u store.User) {
	if mt, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type")); mt != "multipart/form-data" {
		writeError(w, http.StatusUnsupportedMediaType, "unsupported_media_type", "Send the files as a form.")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxAssetBytes+(1<<20))
	mr, err := r.MultipartReader()
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_form", "Send the files as a form.")
		return
	}
	var name, meta, shared string
	var files []store.AssetFileData
	total := 0
	for {
		part, err := mr.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			tooBig(w, err)
			return
		}
		switch part.FormName() {
		case "name", "meta", "shared":
			b, err := io.ReadAll(io.LimitReader(part, maxMetaBytes+1))
			if err != nil {
				tooBig(w, err)
				return
			}
			switch part.FormName() {
			case "name":
				name = string(b)
			case "meta":
				meta = string(b)
			default:
				shared = string(b)
			}
		case "files":
			data, err := io.ReadAll(io.LimitReader(part, int64(maxAssetBytes-total+1)))
			if err != nil {
				tooBig(w, err)
				return
			}
			if total += len(data); total > maxAssetBytes {
				writeError(w, http.StatusRequestEntityTooLarge, "too_large", "The files are too big together (50 MB at most).")
				return
			}
			// The name as sent (FileName() would quietly drop folders): checkFiles turns paths away.
			_, params, _ := mime.ParseMediaType(part.Header.Get("Content-Disposition"))
			files = append(files, store.AssetFileData{Name: params["filename"], Data: data})
		}
	}

	name, ok := cleanText(name, 100)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid_name", "Use a name of 1 to 100 characters.")
		return
	}
	if meta == "" {
		meta = "{}"
	}
	if !validMeta([]byte(meta)) {
		writeError(w, http.StatusBadRequest, "invalid_meta", "The item's settings must be a JSON object.")
		return
	}
	if msg := checkFiles(files); msg != "" {
		writeError(w, http.StatusBadRequest, "invalid_files", msg)
		return
	}
	share := shared == "true"
	if share && !canShare(w, u) {
		return
	}
	a, err := s.st.CreateAsset(r.Context(), u.ID, name, json.RawMessage(meta), files)
	if err == nil && share {
		a, err = s.st.SetAssetShared(r.Context(), u.ID, a.ID, true)
	}
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, a)
}

// checkFiles returns what's wrong with an item's files, or "".
func checkFiles(files []store.AssetFileData) string {
	if len(files) > maxAssetFiles {
		return "Too many files (30 at most)."
	}
	seen, i3ds := map[string]bool{}, 0
	for _, f := range files {
		if !fileName.MatchString(f.Name) || strings.Contains(f.Name, "..") {
			return "\"" + f.Name + "\" isn't a plain file name. Use letters, digits, spaces and . _ - ( ) +."
		}
		k := strings.ToLower(f.Name)
		if seen[k] {
			return "\"" + f.Name + "\" is there twice."
		}
		seen[k] = true
		if strings.HasSuffix(k, ".i3d") {
			i3ds++
		}
	}
	if i3ds != 1 {
		return "An item needs exactly one .i3d file."
	}
	return ""
}

func tooBig(w http.ResponseWriter, err error) {
	var mb *http.MaxBytesError
	if errors.As(err, &mb) {
		writeError(w, http.StatusRequestEntityTooLarge, "too_large", "The files are too big together (50 MB at most).")
		return
	}
	writeError(w, http.StatusBadRequest, "invalid_form", "The upload was cut short. Try again.")
}

func (s *Server) assetFile(w http.ResponseWriter, r *http.Request, u store.User) {
	data, err := s.st.AssetFile(r.Context(), u.ID, r.PathValue("id"), r.PathValue("name"))
	if err != nil {
		assetError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.WriteHeader(http.StatusOK)
	w.Write(data)
}

// canShare: only the admin shares items with everyone. Writes the error and returns false otherwise.
func canShare(w http.ResponseWriter, u store.User) bool {
	if !u.IsAdmin {
		writeError(w, http.StatusForbidden, "forbidden", "Only the admin can share items with everyone.")
	}
	return u.IsAdmin
}

type assetInput struct {
	Name   *string         `json:"name"`
	Meta   json.RawMessage `json:"meta"`
	Shared *bool           `json:"shared"`
}

func (s *Server) updateAsset(w http.ResponseWriter, r *http.Request, u store.User) {
	var in assetInput
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
	var meta json.RawMessage
	if present(in.Meta) {
		if !validMeta(in.Meta) {
			writeError(w, http.StatusBadRequest, "invalid_meta", "The item's settings must be a JSON object.")
			return
		}
		meta = in.Meta
	}
	if in.Shared != nil && *in.Shared && !canShare(w, u) {
		return
	}
	a, err := s.st.UpdateAsset(r.Context(), u.ID, r.PathValue("id"), in.Name, meta)
	if err == nil && in.Shared != nil && *in.Shared != a.Shared {
		a, err = s.st.SetAssetShared(r.Context(), u.ID, a.ID, *in.Shared)
	}
	if err != nil {
		assetError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, a)
}

func (s *Server) deleteAsset(w http.ResponseWriter, r *http.Request, u store.User) {
	if err := s.st.DeleteAsset(r.Context(), u.ID, r.PathValue("id")); err != nil {
		assetError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
