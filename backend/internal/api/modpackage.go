package api

import (
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"building-creator-fs25/backend/internal/store"
)

// The game mod of a whole mod is made by the editor, in the browser (the export is JavaScript), as one zip, and sent here with the version of the mod it
// was made from (PUT /api/mods/{id}/package). Other programs fetch it with a token (GET /api/v1/mods/{id}/mod.zip). docs/PLAN_MALLAR.md step 3b.

// modPackageV1 tells a program that a mod has a package: the version of the mod it was made from, whether the mod is unchanged since, and where to fetch it.
type modPackageV1 struct {
	Version  int64  `json:"version"`
	UpToDate bool   `json:"upToDate"`
	Zip      string `json:"zip"`
}

func (s *Server) packageOf(r *http.Request, u store.User, m store.Mod) (*modPackageV1, error) {
	v, err := s.st.ModPackageVersion(r.Context(), u.ID, m.ID)
	if err != nil || v == 0 {
		return nil, err
	}
	return &modPackageV1{Version: v, UpToDate: v == m.Version, Zip: "/api/v1/mods/" + m.ID + "/mod.zip"}, nil
}

func (s *Server) putModPackage(w http.ResponseWriter, r *http.Request, u store.User) {
	allowSlowUpload(w)
	version, err := strconv.ParseInt(r.URL.Query().Get("version"), 10, 64)
	if err != nil || version < 1 {
		writeError(w, http.StatusBadRequest, "invalid_version", "Say which saved version of the mod the zip is made from (?version=).")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxModelBytes)
	data, err := io.ReadAll(r.Body)
	if err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			writeError(w, http.StatusRequestEntityTooLarge, "too_large", "That's too much data.")
		} else {
			writeError(w, http.StatusBadRequest, "invalid_package", "Send the zip as the body.")
		}
		return
	}
	if msg := checkZip(data, "The package", "modDesc.xml"); msg != "" {
		writeError(w, http.StatusBadRequest, "invalid_package", msg)
		return
	}
	switch err := s.st.PutModPackage(r.Context(), u.ID, r.PathValue("id"), version, data); {
	case errors.Is(err, store.ErrConflict):
		writeError(w, http.StatusConflict, "version_conflict", "The mod was saved again since. The zip of that save is on its way.")
	case err != nil:
		modError(w, err)
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

func (s *Server) modPackageFile(w http.ResponseWriter, r *http.Request, u store.User) {
	m, err := s.st.GetMod(r.Context(), u.ID, r.PathValue("id"))
	if err != nil {
		modError(w, err)
		return
	}
	pkg, err := s.st.GetModPackage(r.Context(), u.ID, m.ID)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "This mod has no game mod yet. Open it in the editor and press Generate game mod.")
		return
	}
	if err != nil {
		internalError(w, err)
		return
	}
	etag := `"v` + strconv.FormatInt(pkg.Version, 10) + `-` + strconv.FormatInt(pkg.UpdatedAt.UnixMilli(), 10) + `"`
	w.Header().Set("ETag", etag)
	w.Header().Set("Cache-Control", "private, max-age=0, must-revalidate")
	if strings.Contains(r.Header.Get("If-None-Match"), etag) {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `inline; filename="`+modFileName(m.Name)+`.zip"`)
	w.Write(pkg.Zip)
}
