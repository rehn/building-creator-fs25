package api

import (
	"encoding/binary"
	"errors"
	"io"
	"math"
	"mime"
	"net/http"
	"strconv"

	"building-creator-fs25/backend/internal/store"
)

// Textures are photos the browser has made into game textures (the finished DDS files, see photoTexture.mjs). Private: never shared, not even
// by the admin, because the user answers for having the right to use the photo.
const (
	maxTextureFile     = 4 << 20 // one DDS file (2048 x 2048 with mips is about 2.8 MB)
	maxTexturesPerUser = 100
	minTextureSide     = 64
	maxTextureSide     = 2048
	maxTextureMeters   = 100.0
)

func textureError(w http.ResponseWriter, err error) {
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "That texture doesn't exist, or isn't yours.")
		return
	}
	internalError(w, err)
}

func validTextureSide(n int) bool {
	return n >= minTextureSide && n <= maxTextureSide && n&(n-1) == 0
}

func validMeters(m float64) bool { return m > 0 && m <= maxTextureMeters && !math.IsNaN(m) }

// ddsSide: the side of a DDS file with a header and some data, if it is square and says it is side x side.
func ddsSide(b []byte) (int, bool) {
	if len(b) <= 128 || string(b[:4]) != "DDS " {
		return 0, false
	}
	h, w := binary.LittleEndian.Uint32(b[12:]), binary.LittleEndian.Uint32(b[16:])
	return int(w), w == h && w <= maxTextureSide
}

func (s *Server) listTextures(w http.ResponseWriter, r *http.Request, u store.User) {
	list, err := s.st.ListTextures(r.Context(), u.ID)
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

// createTexture stores a texture: a multipart form with name, size, meters, thumb (a small JPEG data URL) and the files diffuse, normal, specular.
func (s *Server) createTexture(w http.ResponseWriter, r *http.Request, u store.User) {
	allowSlowUpload(w)
	if mt, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type")); mt != "multipart/form-data" {
		writeError(w, http.StatusUnsupportedMediaType, "unsupported_media_type", "Send the texture as a form.")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 3*maxTextureFile+maxThumbBytes+(1<<20))
	mr, err := r.MultipartReader()
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_form", "Send the texture as a form.")
		return
	}
	fields := map[string]string{}
	files := map[string][]byte{}
	for {
		part, err := mr.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			textureTooBig(w, err)
			return
		}
		name := part.FormName()
		switch name {
		case "name", "size", "meters", "thumb":
			b, err := io.ReadAll(io.LimitReader(part, maxThumbBytes+1))
			if err != nil {
				textureTooBig(w, err)
				return
			}
			fields[name] = string(b)
		case "diffuse", "normal", "specular":
			b, err := io.ReadAll(io.LimitReader(part, maxTextureFile+1))
			if err != nil {
				textureTooBig(w, err)
				return
			}
			if len(b) > maxTextureFile {
				writeError(w, http.StatusRequestEntityTooLarge, "too_large", "A texture file is too big (4 MB at most).")
				return
			}
			files[name] = b
		}
	}

	name, ok := cleanText(fields["name"], 100)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid_name", "Use a name of 1 to 100 characters.")
		return
	}
	size, err := strconv.Atoi(fields["size"])
	if err != nil || !validTextureSide(size) {
		writeError(w, http.StatusBadRequest, "invalid_size", "The size must be a power of two from 64 to 2048.")
		return
	}
	meters, err := strconv.ParseFloat(fields["meters"], 64)
	if err != nil || !validMeters(meters) {
		writeError(w, http.StatusBadRequest, "invalid_meters", "The real size must be more than 0 and at most 100 metres.")
		return
	}
	if !validThumbnail(fields["thumb"]) {
		writeError(w, http.StatusBadRequest, "invalid_thumb", "The preview picture is not valid or is too big.")
		return
	}
	for _, k := range []string{"diffuse", "normal", "specular"} {
		if side, ok := ddsSide(files[k]); !ok || side != size {
			writeError(w, http.StatusBadRequest, "invalid_files", "The "+k+" map is missing, or isn't a DDS file of the size given.")
			return
		}
	}
	if n, err := s.st.CountTextures(r.Context(), u.ID); err != nil {
		internalError(w, err)
		return
	} else if n >= maxTexturesPerUser {
		writeError(w, http.StatusConflict, "too_many", "You have the most textures allowed (100). Delete some first.")
		return
	}
	tx, err := s.st.CreateTexture(r.Context(), u.ID, store.TextureData{Name: name, Size: size, Meters: meters, Thumb: fields["thumb"],
		Diffuse: files["diffuse"], Normal: files["normal"], Specular: files["specular"]})
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, tx)
}

func textureTooBig(w http.ResponseWriter, err error) {
	var mb *http.MaxBytesError
	if errors.As(err, &mb) {
		writeError(w, http.StatusRequestEntityTooLarge, "too_large", "The texture is too big.")
		return
	}
	writeError(w, http.StatusBadRequest, "invalid_form", "The upload was cut short. Try again.")
}

// textureFile sends one DDS file of a texture: /api/textures/{id}/{diffuse|normal|specular}.
func (s *Server) textureFile(w http.ResponseWriter, r *http.Request, u store.User) {
	data, err := s.st.TextureFile(r.Context(), u.ID, r.PathValue("id"), r.PathValue("kind"))
	if err != nil {
		textureError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Cache-Control", "private, no-cache")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Write(data)
}

type textureInput struct {
	Name   *string  `json:"name"`
	Meters *float64 `json:"meters"`
}

func (s *Server) updateTexture(w http.ResponseWriter, r *http.Request, u store.User) {
	var in textureInput
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
	if in.Meters != nil && !validMeters(*in.Meters) {
		writeError(w, http.StatusBadRequest, "invalid_meters", "The real size must be more than 0 and at most 100 metres.")
		return
	}
	tx, err := s.st.UpdateTexture(r.Context(), u.ID, r.PathValue("id"), in.Name, in.Meters)
	if err != nil {
		textureError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, tx)
}

func (s *Server) deleteTexture(w http.ResponseWriter, r *http.Request, u store.User) {
	if err := s.st.DeleteTexture(r.Context(), u.ID, r.PathValue("id")); err != nil {
		textureError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
