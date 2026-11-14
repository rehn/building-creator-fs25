package api

import (
	"archive/zip"
	"bytes"
	"errors"
	"io"
	"net/http"
	"path"
	"strconv"
	"strings"
	"unicode"

	"building-creator-fs25/backend/internal/store"
)

// The model files of a building (OBJ and MTL to draw it, the game mod as a zip) are made by the editor, in the browser, when it saves,
// and sent here (PUT /api/projects/{id}/model, made from the version that save gave). Other programs read them with a token.

const (
	maxModelBytes = 64 << 20 // the whole upload
	maxObjBytes   = 32 << 20
	maxModUnpack  = 128 << 20 // what a mod zip may unpack to
)

// modelFiles are the file names of /api/v1/buildings/{id}/...
var modelFiles = []string{"model.obj", "model.mtl", "mod.zip", "model.i3d", "model.zip", "game-mod.zip"}

// requiredInMod are the files a game mod zip must have, at its root.
var requiredInMod = []string{"modDesc.xml", "house.xml", "house.i3d"}

func (s *Server) putModel(w http.ResponseWriter, r *http.Request, u store.User) {
	version, err := strconv.ParseInt(r.URL.Query().Get("version"), 10, 64)
	if err != nil || version < 1 {
		writeError(w, http.StatusBadRequest, "invalid_version", "Say which saved version the files are made from (?version=).")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxModelBytes)
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			writeError(w, http.StatusRequestEntityTooLarge, "too_large", "That's too much data.")
		} else {
			writeError(w, http.StatusBadRequest, "invalid_model", "Send the files as a form: obj, mtl and mod.")
		}
		return
	}
	defer r.MultipartForm.RemoveAll()
	var m store.Model
	for name, dst := range map[string]*[]byte{"obj": &m.Obj, "mtl": &m.Mtl, "mod": &m.Mod} {
		f, _, err := r.FormFile(name)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_model", "The file "+name+" is missing.")
			return
		}
		data, err := io.ReadAll(io.LimitReader(f, maxModelBytes+1))
		f.Close()
		if err != nil || len(data) == 0 || (name != "mod" && len(data) > maxObjBytes) {
			writeError(w, http.StatusBadRequest, "invalid_model", "The file "+name+" is empty or too big.")
			return
		}
		*dst = data
	}
	// The export zip is optional (an older editor sends none): what "Export model" gives.
	if f, _, err := r.FormFile("export"); err == nil {
		m.Export, err = io.ReadAll(io.LimitReader(f, maxModelBytes+1))
		f.Close()
		if err != nil || len(m.Export) > maxModelBytes {
			writeError(w, http.StatusBadRequest, "invalid_model", "The file export is too big.")
			return
		}
		if _, err := zip.NewReader(bytes.NewReader(m.Export), int64(len(m.Export))); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_model", "The export is not a zip file.")
			return
		}
	}
	if msg := checkModZip(m.Mod); msg != "" {
		writeError(w, http.StatusBadRequest, "invalid_model", msg)
		return
	}
	switch err := s.st.PutModel(r.Context(), u.ID, r.PathValue("id"), version, m); {
	case errors.Is(err, store.ErrConflict):
		writeError(w, http.StatusConflict, "version_conflict", "The building was saved again since. The files of that save are on their way.")
	case err != nil:
		projectError(w, err)
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

// checkModZip returns what is wrong with a game mod zip ("" if it is fine): it must open, hold what a mod needs at its root, only
// plain relative paths, and not unpack to something huge.
func checkModZip(data []byte) string {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "The mod is not a zip file."
	}
	have, total := map[string]bool{}, uint64(0)
	for _, f := range zr.File {
		n := strings.TrimSuffix(f.Name, "/") // a folder entry, as the editor's zip has for textures/
		if n == "" || strings.HasPrefix(n, "/") || strings.Contains(n, "\\") || path.Clean(n) != n || strings.HasPrefix(n, "..") {
			return "The mod has a file name that is not allowed."
		}
		have[n] = true
		if total += f.UncompressedSize64; total > maxModUnpack {
			return "The mod is too big."
		}
	}
	for _, n := range requiredInMod {
		if !have[n] {
			return "The mod has no " + n + "."
		}
	}
	return ""
}

// modFileName is the name a building's game mod zip gets: FS25_ and the words of its name in CamelCase, ASCII only (as the editor does).
func modFileName(name string) string {
	fold := strings.NewReplacer("å", "a", "ä", "a", "ö", "o", "é", "e", "è", "e", "ü", "u", "ø", "o", "æ", "ae", "ß", "ss", "ñ", "n", "ç", "c",
		"Å", "A", "Ä", "A", "Ö", "O", "É", "E", "Ü", "U", "Ø", "O", "Æ", "Ae")
	var b strings.Builder
	for _, w := range strings.FieldsFunc(fold.Replace(name), func(r rune) bool { return r > unicode.MaxASCII || !(unicode.IsLetter(r) || unicode.IsDigit(r)) }) {
		b.WriteString(strings.ToUpper(w[:1]) + w[1:])
	}
	s := b.String()
	if s == "" {
		s = "House"
	} else if unicode.IsDigit(rune(s[0])) {
		s = "House" + s
	}
	if len(s) > 40 {
		s = s[:40]
	}
	return "FS25_" + s
}

// modelFile serves one of a building's stored model files to its owner's token. A building with no stored model has no files (404).
func (s *Server) modelFile(file string) func(http.ResponseWriter, *http.Request, store.User) {
	return func(w http.ResponseWriter, r *http.Request, u store.User) {
		p, err := s.st.GetProject(r.Context(), u.ID, r.PathValue("id"))
		if err != nil {
			projectError(w, err)
			return
		}
		etag := `"v` + strconv.FormatInt(p.ModelVersion, 10) + `"`
		if p.ModelVersion == 0 {
			writeError(w, http.StatusNotFound, "not_found", "This building has no model files yet. Open it in the editor and save it again.")
			return
		}
		w.Header().Set("ETag", etag)
		w.Header().Set("Cache-Control", "private, max-age=0, must-revalidate")
		if r.Header.Get("If-None-Match") == etag {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		m, err := s.st.GetModel(r.Context(), u.ID, p.ID)
		if err != nil {
			projectError(w, err)
			return
		}
		var body []byte
		ctype, name := "text/plain; charset=utf-8", file
		switch file {
		case "model.obj":
			body, name = m.Obj, strings.ToLower(modFileName(p.Name)[len("FS25_"):])+".obj"
		case "model.mtl":
			body = m.Mtl
		case "mod.zip":
			// What "Export model" gives (one folder with house.i3d, textures, items); a building saved without it gets the game mod.
			if len(m.Export) > 0 {
				body, ctype, name = m.Export, "application/zip", strings.ToLower(modFileName(p.Name)[len("FS25_"):])+".zip"
			} else {
				body, ctype, name = m.Mod, "application/zip", modFileName(p.Name)+".zip"
			}
		case "game-mod.zip":
			// The game mod itself (modDesc.xml, house.xml, house.i3d, textures, items, shop picture), which a map builder unpacks into a map.
			body, ctype, name = m.Mod, "application/zip", modFileName(p.Name)+".zip"
		case "model.zip":
			if len(m.Export) == 0 {
				writeError(w, http.StatusNotFound, "not_found", "This building has no export yet. Open it in the editor and save it again.")
				return
			}
			body, ctype, name = m.Export, "application/zip", strings.ToLower(modFileName(p.Name)[len("FS25_"):])+".zip"
		case "model.i3d":
			if body, err = fileInZip(m.Mod, "house.i3d"); err != nil {
				internalError(w, err)
				return
			}
			ctype, name = "application/xml; charset=iso-8859-1", strings.ToLower(modFileName(p.Name)[len("FS25_"):])+".i3d"
		}
		w.Header().Set("Content-Type", ctype)
		w.Header().Set("Content-Disposition", `inline; filename="`+name+`"`)
		w.Write(body)
	}
}

func fileInZip(data []byte, name string) ([]byte, error) {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, err
	}
	for _, f := range zr.File {
		if f.Name == name {
			rc, err := f.Open()
			if err != nil {
				return nil, err
			}
			defer rc.Close()
			return io.ReadAll(io.LimitReader(rc, maxModUnpack))
		}
	}
	return nil, errors.New(name + " is not in the zip")
}
