package api

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"building-creator-fs25/backend/internal/auth"
	"building-creator-fs25/backend/internal/store"
)

// API tokens let another program read a user's buildings (GET /api/v1/...). The user makes them in the app (/api/tokens, with a
// session); the token is shown once and only its hash is kept. A token opens /api/v1 and nothing else.

const (
	maxTokens   = 20
	tokenPrefix = "bc_"
)

type tokenOut struct {
	store.Token
	Value string `json:"token,omitempty"` // only when it is made
}

func (s *Server) listTokens(w http.ResponseWriter, r *http.Request, u store.User) {
	list, err := s.st.ListTokens(r.Context(), u.ID)
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) createToken(w http.ResponseWriter, r *http.Request, u store.User) {
	var in struct {
		Name string `json:"name"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	name, ok := cleanText(in.Name, 80)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid_name", "Use a name of 1 to 80 characters.")
		return
	}
	n, err := s.st.CountTokens(r.Context(), u.ID)
	if err != nil {
		internalError(w, err)
		return
	}
	if n >= maxTokens {
		writeError(w, http.StatusBadRequest, "too_many_tokens", "That is the most tokens you can have. Delete one you don't use.")
		return
	}
	token := tokenPrefix + auth.NewToken()
	t, err := s.st.CreateToken(r.Context(), u.ID, name, auth.HashToken(token), token[:len(tokenPrefix)+4])
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, tokenOut{Token: t, Value: token})
}

func (s *Server) deleteToken(w http.ResponseWriter, r *http.Request, u store.User) {
	err := s.st.DeleteToken(r.Context(), u.ID, r.PathValue("id"))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "That token doesn't exist.")
		return
	}
	if err != nil {
		internalError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

/* ---------- /api/v1: read-only, with a token ---------- */

func (s *Server) requireToken(next userHandler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		token = strings.TrimSpace(token)
		if ok && strings.HasPrefix(token, tokenPrefix) {
			u, err := s.st.TokenUser(r.Context(), auth.HashToken(token))
			if err == nil {
				next(w, r, u)
				return
			}
			if !errors.Is(err, store.ErrNotFound) {
				log.Printf("token lookup: %v", err)
			}
		}
		w.Header().Set("WWW-Authenticate", `Bearer realm="building-creator"`)
		writeError(w, http.StatusUnauthorized, "unauthorized", `Send a valid API token as "Authorization: Bearer <token>".`)
	}
}

// building is what the API tells another program about a building. Settings (what the editor saves) only when one is fetched.
type building struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Kind string `json:"kind"`
	Icon string `json:"icon"` // path of the picture, "" without one
	I3d  string `json:"i3d"`  // paths of the model files
	Obj  string `json:"obj"`
	Mtl  string `json:"mtl"` // the colours the obj refers to
	Mod  string `json:"mod"` // the game mod (zip: modDesc, placeable XML, i3d)
	// Version is the version of the files served (the building's own version until its first model is stored). It goes up with
	// every save that sends a model, so a program can keep what it made from a model for as long as the version is the same.
	Version int64 `json:"version"`
	// HasModel: the files above exist. Buildings not saved since the models were kept have none (404) until they are saved again.
	HasModel  bool            `json:"hasModel"`
	UpdatedAt time.Time       `json:"updatedAt"`
	Settings  json.RawMessage `json:"settings,omitempty"`
}

func newBuilding(p store.ProjectSummary, kind string) building {
	if kind == "" {
		kind = "house"
	}
	id, version := p.ID, p.Version
	if p.ModelVersion > 0 {
		version = p.ModelVersion
	}
	base := "/api/v1/buildings/" + id
	b := building{ID: id, Name: p.Name, Kind: kind, Version: version, HasModel: p.ModelVersion > 0, UpdatedAt: p.UpdatedAt, I3d: base + "/model.i3d", Obj: base + "/model.obj", Mtl: base + "/model.mtl", Mod: base + "/mod.zip"}
	if p.Thumbnail != "" {
		b.Icon = base + "/icon"
	}
	return b
}

func (s *Server) listBuildings(w http.ResponseWriter, r *http.Request, u store.User) {
	list, err := s.st.ListProjects(r.Context(), u.ID)
	if err != nil {
		internalError(w, err)
		return
	}
	out := make([]building, 0, len(list))
	for _, p := range list {
		out = append(out, newBuilding(p, p.Kind))
	}
	writeJSON(w, http.StatusOK, map[string]any{"buildings": out})
}

func (s *Server) getBuilding(w http.ResponseWriter, r *http.Request, u store.User) {
	p, err := s.st.GetProject(r.Context(), u.ID, r.PathValue("id"))
	if err != nil {
		projectError(w, err)
		return
	}
	var d struct {
		Kind string `json:"kind"`
	}
	_ = json.Unmarshal(p.Data, &d)
	b := newBuilding(p.ProjectSummary, d.Kind)
	b.Settings = p.Data
	writeJSON(w, http.StatusOK, b)
}

// buildingIcon sends the saved preview picture as an image.
func (s *Server) buildingIcon(w http.ResponseWriter, r *http.Request, u store.User) {
	p, err := s.st.GetProject(r.Context(), u.ID, r.PathValue("id"))
	if err != nil {
		projectError(w, err)
		return
	}
	for _, f := range [][2]string{{"data:image/png;base64,", "image/png"}, {"data:image/jpeg;base64,", "image/jpeg"}} {
		if rest, ok := strings.CutPrefix(p.Thumbnail, f[0]); ok {
			if img, err := base64.StdEncoding.DecodeString(rest); err == nil {
				w.Header().Set("Content-Type", f[1])
				w.Write(img)
				return
			}
		}
	}
	writeError(w, http.StatusNotFound, "not_found", "This building has no picture yet.")
}

// cors lets other sites call /api/v1 from a browser. That is safe: it takes a token in a header, never a cookie.
// It answers a preflight request itself and says so.
func cors(w http.ResponseWriter, r *http.Request) (done bool) {
	h := w.Header()
	h.Set("Access-Control-Allow-Origin", "*")
	h.Set("Access-Control-Expose-Headers", "Content-Disposition, ETag")
	if r.Method != http.MethodOptions {
		return false
	}
	h.Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	h.Set("Access-Control-Allow-Headers", "Authorization")
	h.Set("Access-Control-Max-Age", "86400")
	w.WriteHeader(http.StatusNoContent)
	return true
}
