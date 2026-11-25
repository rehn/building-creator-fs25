package api

import (
	"errors"
	"net/http"

	"building-creator-fs25/backend/internal/store"
)

// renameAppFolder renames a folder (POST /api/folders/rename {from, to}): what is in it, buildings, props and mods, follows. Not into a name that holds something (409).
func (s *Server) renameAppFolder(w http.ResponseWriter, r *http.Request, u store.User) {
	var in struct {
		From string `json:"from"`
		To   string `json:"to"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	from, ok1 := cleanText(in.From, maxFolderLen)
	to, ok2 := cleanText(in.To, maxFolderLen)
	if !ok1 || !ok2 || from == to {
		writeError(w, http.StatusBadRequest, "invalid_folder", "Say from and to: two different folder names of 1 to 80 characters.")
		return
	}
	switch _, err := s.st.RenameFolder(r.Context(), u.ID, from, to); {
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "There is no folder with that name.")
	case errors.Is(err, store.ErrConflict):
		writeError(w, http.StatusConflict, "folder_exists", "There is something in that folder already. Pick a name that is not used.")
	case err != nil:
		internalError(w, err)
	default:
		writeJSON(w, http.StatusOK, map[string]any{"name": to})
	}
}

// deleteAppFolder deletes a folder (DELETE /api/folders?name=): what is in it stays, in no folder.
func (s *Server) deleteAppFolder(w http.ResponseWriter, r *http.Request, u store.User) {
	name, ok := cleanText(r.URL.Query().Get("name"), maxFolderLen)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid_folder", "Say which folder (?name=).")
		return
	}
	switch err := s.st.DeleteFolder(r.Context(), u.ID, name); {
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "There is no folder with that name.")
	case errors.Is(err, store.ErrFolderClash):
		writeError(w, http.StatusConflict, "folder_clash", "Some buildings in it come from the map program and have the same id as buildings that are in no folder. Move them first.")
	case err != nil:
		internalError(w, err)
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}
