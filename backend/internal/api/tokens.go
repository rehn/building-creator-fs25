package api

import (
	"encoding/base64"
	"encoding/json"
	"encoding/xml"
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
		Name  string `json:"name"`
		Write bool   `json:"write"` // may also create buildings and send their models
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
	t, err := s.st.CreateTokenScoped(r.Context(), u.ID, name, auth.HashToken(token), token[:len(tokenPrefix)+4], in.Write)
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

// bearerToken is the API token a request sends in its Authorization header, "" if it has none that looks like one.
func bearerToken(r *http.Request) string {
	token, found := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	token = strings.TrimSpace(token)
	if found && strings.HasPrefix(token, tokenPrefix) {
		return token
	}
	return ""
}

// tokenAuth finds the user a request's token belongs to, and whether the token may write. It answers 401 itself when there is none.
func (s *Server) tokenAuth(w http.ResponseWriter, r *http.Request) (u store.User, write, ok bool) {
	if token := bearerToken(r); token != "" {
		u, write, err := s.st.TokenAuth(r.Context(), auth.HashToken(token))
		if err == nil {
			return u, write, true
		}
		if !errors.Is(err, store.ErrNotFound) {
			log.Printf("token lookup: %v", err)
		}
	}
	w.Header().Set("WWW-Authenticate", `Bearer realm="building-creator"`)
	writeError(w, http.StatusUnauthorized, "unauthorized", `Send a valid API token as "Authorization: Bearer <token>".`)
	return store.User{}, false, false
}

// requireToken lets in any token: it reads.
func (s *Server) requireToken(next userHandler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if u, _, ok := s.tokenAuth(w, r); ok {
			next(w, r, u)
		}
	}
}

// requireWriteToken lets in a token made to write (it may create buildings and send their models, never delete or change what a person made).
func (s *Server) requireWriteToken(next userHandler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u, write, ok := s.tokenAuth(w, r)
		if !ok {
			return
		}
		if !write {
			writeError(w, http.StatusForbidden, "forbidden", "This token can only read. Make a token that may write under API in the app.")
			return
		}
		next(w, r, u)
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
	// Folder is the map the building belongs to ("" for none). SourceID, Generated and Edited are for what a program generated: its own id for
	// the building, and whether a person has changed it since (a building edited in the app is left alone when it is generated again).
	Folder    string `json:"folder"`
	SourceID  string `json:"sourceId,omitempty"`
	Generated bool   `json:"generated,omitempty"`
	Edited    bool   `json:"edited,omitempty"`
	// Placeable: what the game needs to load the building's house.xml (only when one is fetched, and it has a model).
	Placeable *placeableInfo `json:"placeable,omitempty"`
}

// placeableInfo is the type of the building's placeable. A building of a kind the game has no type for (the dealership) comes with
// types its mod defines in its modDesc, named "<mod name>.<name>" in house.xml: a program that copies house.xml into another mod (a map)
// has to define them there (<placeableTypes> in that mod's modDesc) and name its own mod in the type, or the game says "Unknown type".
type placeableInfo struct {
	Type        string       `json:"type"`        // as house.xml says: "gardenShed", "FS25_Maskinaffar.dealership"
	CustomTypes []customType `json:"customTypes"` // the types the mod's modDesc defines (empty for the game's own)
}

type customType struct {
	Name            string   `json:"name"` // without the mod name
	Parent          string   `json:"parent"`
	ClassName       string   `json:"className"`
	Filename        string   `json:"filename"`
	Specializations []string `json:"specializations"`
}

// placeableOf reads the placeable type and the mod's own types out of its game mod zip; nil if it has no house.xml.
func placeableOf(mod []byte) *placeableInfo {
	houseXML, err := fileInZip(mod, "house.xml")
	if err != nil {
		return nil
	}
	var house struct {
		Type string `xml:"type,attr"`
	}
	if xml.Unmarshal(houseXML, &house) != nil || house.Type == "" {
		return nil
	}
	info := &placeableInfo{Type: house.Type, CustomTypes: []customType{}}
	if desc, err := fileInZip(mod, "modDesc.xml"); err == nil {
		var d struct {
			Types []struct {
				Name            string `xml:"name,attr"`
				Parent          string `xml:"parent,attr"`
				ClassName       string `xml:"className,attr"`
				Filename        string `xml:"filename,attr"`
				Specializations []struct {
					Name string `xml:"name,attr"`
				} `xml:"specialization"`
			} `xml:"placeableTypes>type"`
		}
		if xml.Unmarshal(desc, &d) == nil {
			for _, t := range d.Types {
				c := customType{Name: t.Name, Parent: t.Parent, ClassName: t.ClassName, Filename: t.Filename, Specializations: []string{}}
				for _, sp := range t.Specializations {
					c.Specializations = append(c.Specializations, sp.Name)
				}
				info.CustomTypes = append(info.CustomTypes, c)
			}
		}
	}
	return info
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
	b := building{Folder: p.Folder, SourceID: p.SourceID, Generated: p.Generated, Edited: p.Edited, ID: id, Name: p.Name, Kind: kind, Version: version, HasModel: p.ModelVersion > 0, UpdatedAt: p.UpdatedAt, I3d: base + "/model.i3d", Obj: base + "/model.obj", Mtl: base + "/model.mtl", Mod: base + "/mod.zip"}
	if p.Thumbnail != "" {
		b.Icon = base + "/icon"
	}
	return b
}

func (s *Server) listBuildings(w http.ResponseWriter, r *http.Request, u store.User) {
	// ?folder=Name lists one folder's buildings; ?folder= the ones in no folder; without it all of them.
	list, err := s.st.ListProjects(r.Context(), u.ID)
	if r.URL.Query().Has("folder") {
		list, err = s.st.ListProjectsIn(r.Context(), u.ID, strings.TrimSpace(r.URL.Query().Get("folder")))
	}
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
	if p.ModelVersion > 0 {
		if m, err := s.st.GetModel(r.Context(), u.ID, p.ID); err == nil {
			b.Placeable = placeableOf(m.Mod)
		}
	}
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
	h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
	h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type, If-None-Match")
	h.Set("Access-Control-Max-Age", "86400")
	w.WriteHeader(http.StatusNoContent)
	return true
}

// listFolders tells which folders (maps) the buildings are in and how many each holds.
func (s *Server) listFolders(w http.ResponseWriter, r *http.Request, u store.User) {
	list, err := s.st.ListFolders(r.Context(), u.ID)
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"folders": list})
}

// generateBuilding makes a building for a program (a map builder that has OSM footprints, say) or, when it made one with this source id in
// this folder before, makes it again. The settings are what the editor saves; the editor makes the building of them when someone opens it,
// and a program that wants the files sends them with PUT .../model (the version in the answer). A building a person has changed since is left
// as it is: status "kept". 201 when made, 200 otherwise.
func (s *Server) generateBuilding(w http.ResponseWriter, r *http.Request, u store.User) {
	var in struct {
		Folder   string          `json:"folder"`
		SourceID string          `json:"sourceId"`
		Name     string          `json:"name"`
		Settings json.RawMessage `json:"settings"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	folder, ok := cleanText(in.Folder, maxFolderLen)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid_folder", "Say the folder (the map) the building goes in: 1 to 80 characters.")
		return
	}
	source, ok := cleanText(in.SourceID, 200)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid_source_id", "Give the building an id of your own (such as the OSM id): 1 to 200 characters.")
		return
	}
	name, ok := cleanText(in.Name, 100)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid_name", "Use a name of 1 to 100 characters.")
		return
	}
	if !present(in.Settings) || !validData(in.Settings) {
		writeError(w, http.StatusBadRequest, "invalid_data", "The house settings must be a JSON object under 1 MB.")
		return
	}
	p, status, err := s.st.UpsertGenerated(r.Context(), u.ID, folder, source, name, in.Settings)
	if err != nil {
		internalError(w, err)
		return
	}
	var d struct {
		Kind string `json:"kind"`
	}
	_ = json.Unmarshal(p.Data, &d)
	code := http.StatusOK
	if status == store.Created {
		code = http.StatusCreated
	}
	writeJSON(w, code, map[string]any{"status": status, "building": newBuilding(p.ProjectSummary, d.Kind)})
}

// me tells a program what the token it sent may do: for a settings page with a "Test" button, say. Nothing about the person.
func (s *Server) me(w http.ResponseWriter, r *http.Request, u store.User) {
	t, err := s.st.TokenInfo(r.Context(), auth.HashToken(bearerToken(r)))
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"tokenName": t.Name, "write": t.Write, "appVersion": s.cfg.Version})
}
