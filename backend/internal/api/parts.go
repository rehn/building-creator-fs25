package api

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"

	"building-creator-fs25/backend/internal/store"
)

const (
	maxPartBytes = 256 << 10 // a part's file
	maxInfoBytes = 4 << 10
	partFormat   = "building-creator-fs25-part"
)

func partError(w http.ResponseWriter, err error) {
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "That part doesn't exist, or isn't yours.")
		return
	}
	internalError(w, err)
}

// validPart: the editor's part file, a JSON object with format "building-creator-fs25-part" (the editor checks the rest when it is used).
func validPart(raw []byte) bool {
	t := bytes.TrimSpace(raw)
	if len(t) > maxPartBytes || len(t) < 2 || t[0] != '{' {
		return false
	}
	var f struct {
		Format string `json:"format"`
	}
	return json.Unmarshal(t, &f) == nil && (f.Format == partFormat || f.Format == "house-to-i3d-part")
}

func validInfo(raw []byte) bool {
	t := bytes.TrimSpace(raw)
	return len(t) <= maxInfoBytes && len(t) > 1 && t[0] == '{' && json.Valid(t)
}

func (s *Server) listParts(w http.ResponseWriter, r *http.Request, u store.User) {
	list, err := s.st.ListParts(r.Context(), u.ID)
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) getPart(w http.ResponseWriter, r *http.Request, u store.User) {
	p, err := s.st.GetPart(r.Context(), u.ID, r.PathValue("id"))
	if err != nil {
		partError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

type partInput struct {
	Name   *string         `json:"name"`
	Info   json.RawMessage `json:"info"`
	Data   json.RawMessage `json:"data"`
	Shared *bool           `json:"shared"`
}

// createPart saves a part: its name, the part file (data) and a few numbers about it for the list (info).
func (s *Server) createPart(w http.ResponseWriter, r *http.Request, u store.User) {
	var in partInput
	if !decodeJSON(w, r, &in) {
		return
	}
	name := ""
	if in.Name != nil {
		name = *in.Name
	}
	name, ok := cleanText(name, 100)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid_name", "Use a name of 1 to 100 characters.")
		return
	}
	if !validPart(in.Data) {
		writeError(w, http.StatusBadRequest, "invalid_part", "That isn't a part file (or it is over 256 KB).")
		return
	}
	info := json.RawMessage(`{}`)
	if present(in.Info) {
		if !validInfo(in.Info) {
			writeError(w, http.StatusBadRequest, "invalid_info", "The part's info must be a small JSON object.")
			return
		}
		info = in.Info
	}
	share := in.Shared != nil && *in.Shared
	if share && !canShare(w, u) {
		return
	}
	p, err := s.st.CreatePart(r.Context(), u.ID, name, info, in.Data)
	if err == nil && share {
		p, err = s.st.SetPartShared(r.Context(), u.ID, p.ID, true)
	}
	if err != nil {
		internalError(w, err)
		return
	}
	p.Data = nil
	writeJSON(w, http.StatusCreated, p)
}

func (s *Server) updatePart(w http.ResponseWriter, r *http.Request, u store.User) {
	var in partInput
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
	if in.Shared != nil && *in.Shared && !canShare(w, u) {
		return
	}
	p, err := s.st.UpdatePart(r.Context(), u.ID, r.PathValue("id"), in.Name)
	if err == nil && in.Shared != nil && *in.Shared != p.Shared {
		p, err = s.st.SetPartShared(r.Context(), u.ID, p.ID, *in.Shared)
	}
	if err != nil {
		partError(w, err)
		return
	}
	p.Data = nil
	writeJSON(w, http.StatusOK, p)
}

func (s *Server) deletePart(w http.ResponseWriter, r *http.Request, u store.User) {
	if err := s.st.DeletePart(r.Context(), u.ID, r.PathValue("id")); err != nil {
		partError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
