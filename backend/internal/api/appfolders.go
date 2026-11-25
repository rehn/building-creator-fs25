package api

import (
	"net/http"

	"building-creator-fs25/backend/internal/store"
)

// The app's folders (store/folders.go): one list for the buildings, the props and the mods.

func (s *Server) listAppFolders(w http.ResponseWriter, r *http.Request, u store.User) {
	list, err := s.st.AllFolders(r.Context(), u.ID)
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"folders": list})
}

// createAppFolder makes a folder that nothing is in yet (201; 200 when it was there).
func (s *Server) createAppFolder(w http.ResponseWriter, r *http.Request, u store.User) {
	var in struct {
		Name string `json:"name"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	name, ok := cleanText(in.Name, maxFolderLen)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid_folder", "Use a folder name of 1 to 80 characters.")
		return
	}
	before, err := s.st.AllFolders(r.Context(), u.ID)
	if err == nil {
		err = s.st.CreateFolder(r.Context(), u.ID, name)
	}
	if err != nil {
		internalError(w, err)
		return
	}
	status := http.StatusCreated
	for _, f := range before {
		if f.Name == name {
			status = http.StatusOK
		}
	}
	writeJSON(w, status, map[string]any{"name": name})
}
