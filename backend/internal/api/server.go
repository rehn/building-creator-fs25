// Package api is the HTTP API: accounts, invites and projects.
package api

import (
	"encoding/json"
	"errors"
	"log"
	"mime"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"

	"building-creator-fs25/backend/internal/auth"
	"building-creator-fs25/backend/internal/store"
	"building-creator-fs25/backend/internal/vision"
)

type Config struct {
	PublicURL          string // e.g. https://hus.example.se, no trailing slash
	Version            string // the release this runs (APP_VERSION, set by the image: 1.2.3, edge or dev), shown by /api/health
	AdminEmail         string // can sign up without an invite and becomes admin
	GoogleClientID     string
	GoogleClientSecret string
	// SSOURL (the map app's address) with SSOSecret (shared with it) turns on "Sign in with the map app", where the accounts live.
	// SSOPublicURL is the same app's address as the browser reaches it, when SSOURL (the server's way to it, maybe a cluster-internal
	// service address) is not; empty: SSOURL.
	SSOURL, SSOPublicURL, SSOSecret string
	SecureCookies                   bool // true when PublicURL is https
	TrustProxy                      bool // use X-Forwarded-For for rate limiting
	SessionTTL                      time.Duration
	Vision                          vision.Suggester // suggests template settings from photos; nil without ANTHROPIC_API_KEY

	googleEndpoints *googleEndpoints // tests point this at a fake Google
}

func (c Config) GoogleEnabled() bool { return c.GoogleClientID != "" && c.GoogleClientSecret != "" }

func (c Config) GoogleRedirectURL() string { return c.PublicURL + "/api/auth/google/callback" }

const (
	sessionCookie = "hx_session"
	loginAttempts = 10               // per IP and email, per 15 minutes
	maxDataBytes  = 1 << 20          // house settings
	maxThumbBytes = 300 << 10        // preview image as a data URL
	maxBodyBytes  = 2 * maxDataBytes // whole request body
	inviteTTL     = 14 * 24 * time.Hour
)

type Server struct {
	st      *store.Store
	cfg     Config
	google  googleEndpoints
	client  *http.Client
	logins  *limiter
	signups *limiter
	mux     *http.ServeMux
	dummy   string // hash checked for unknown emails, so login time doesn't reveal them
}

func New(st *store.Store, cfg Config) *Server {
	if cfg.SessionTTL == 0 {
		cfg.SessionTTL = 30 * 24 * time.Hour
	}
	s := &Server{
		st:      st,
		cfg:     cfg,
		google:  defaultGoogle,
		client:  &http.Client{Timeout: 10 * time.Second},
		logins:  newLimiter(loginAttempts, 15*time.Minute),
		signups: newLimiter(20, time.Hour),
		mux:     http.NewServeMux(),
	}
	if cfg.googleEndpoints != nil {
		s.google = *cfg.googleEndpoints
	}
	s.dummy, _ = auth.HashPassword(auth.NewToken())
	s.routes()
	return s
}

func (s *Server) routes() {
	m := s.mux
	m.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "version": s.cfg.Version})
	})
	m.HandleFunc("GET /api/auth/config", func(w http.ResponseWriter, r *http.Request) {
		out := map[string]any{"google": s.cfg.GoogleEnabled(), "sso": s.cfg.SSOEnabled()}
		if s.cfg.SSOEnabled() {
			out["ssoUrl"] = s.cfg.ssoBrowserURL() // the header's switch to the map app
		}
		writeJSON(w, http.StatusOK, out)
	})
	m.HandleFunc("POST /api/auth/signup", s.signup)
	m.HandleFunc("POST /api/auth/login", s.login)
	m.HandleFunc("POST /api/auth/logout", s.logout)
	m.HandleFunc("GET /api/auth/me", s.requireUser(func(w http.ResponseWriter, r *http.Request, u store.User) {
		writeJSON(w, http.StatusOK, u)
	}))
	m.HandleFunc("GET /api/auth/google/start", s.googleStart)
	m.HandleFunc("GET /api/auth/google/callback", s.googleCallback)
	m.HandleFunc("GET /api/auth/sso/start", s.ssoStart)
	m.HandleFunc("GET /api/auth/sso/callback", s.ssoCallback)
	m.HandleFunc("GET /api/invites/{token}", s.inviteInfo)

	m.HandleFunc("GET /api/projects", s.requireUser(s.listProjects))
	m.HandleFunc("POST /api/projects", s.requireUser(s.createProject))
	m.HandleFunc("GET /api/projects/{id}", s.requireUser(s.getProject))
	m.HandleFunc("PATCH /api/projects/{id}", s.requireUser(s.updateProject))
	m.HandleFunc("DELETE /api/projects/{id}", s.requireUser(s.deleteProject))
	m.HandleFunc("POST /api/projects/{id}/duplicate", s.requireUser(s.duplicateProject))
	m.HandleFunc("PUT /api/projects/{id}/model", s.requireUser(s.putModel))

	m.HandleFunc("GET /api/tokens", s.requireUser(s.listTokens))
	m.HandleFunc("POST /api/tokens", s.requireUser(s.createToken))
	m.HandleFunc("DELETE /api/tokens/{id}", s.requireUser(s.deleteToken))
	m.HandleFunc("GET /api/v1/buildings", s.requireToken(s.listBuildings))
	m.HandleFunc("POST /api/v1/buildings", s.requireWriteToken(s.generateBuilding))
	m.HandleFunc("GET /api/v1/folders", s.requireToken(s.listFolders))
	m.HandleFunc("POST /api/v1/folders/rename", s.requireWriteToken(s.renameFolder))
	m.HandleFunc("GET /api/v1/me", s.requireToken(s.me))
	m.HandleFunc("PUT /api/v1/buildings/{id}/model", s.requireWriteToken(s.putModel))
	m.HandleFunc("GET /api/v1/buildings/{id}", s.requireToken(s.getBuilding))
	m.HandleFunc("GET /api/v1/buildings/{id}/icon", s.requireToken(s.buildingIcon))
	for _, file := range modelFiles {
		m.HandleFunc("GET /api/v1/buildings/{id}/"+file, s.requireToken(s.modelFile(file)))
	}

	m.HandleFunc("GET /api/assets", s.requireUser(s.listAssets))
	m.HandleFunc("POST /api/assets", s.requireUser(s.createAsset))
	m.HandleFunc("PATCH /api/assets/{id}", s.requireUser(s.updateAsset))
	m.HandleFunc("PUT /api/assets/{id}", s.requireUser(s.replaceAsset))
	m.HandleFunc("DELETE /api/assets/{id}", s.requireUser(s.deleteAsset))
	m.HandleFunc("GET /api/assets/{id}/files/{name}", s.requireUser(s.assetFile))
	m.HandleFunc("GET /api/mods", s.requireUser(s.listMods))
	m.HandleFunc("POST /api/mods", s.requireUser(s.createMod))
	m.HandleFunc("GET /api/mods/{id}", s.requireUser(s.getMod))
	m.HandleFunc("PATCH /api/mods/{id}", s.requireUser(s.updateMod))
	m.HandleFunc("DELETE /api/mods/{id}", s.requireUser(s.deleteMod))
	m.HandleFunc("GET /api/parts", s.requireUser(s.listParts))
	m.HandleFunc("POST /api/parts", s.requireUser(s.createPart))
	m.HandleFunc("GET /api/parts/{id}", s.requireUser(s.getPart))
	m.HandleFunc("PATCH /api/parts/{id}", s.requireUser(s.updatePart))
	m.HandleFunc("DELETE /api/parts/{id}", s.requireUser(s.deletePart))
	m.HandleFunc("GET /api/textures", s.requireUser(s.listTextures))
	m.HandleFunc("POST /api/textures", s.requireUser(s.createTexture))
	m.HandleFunc("GET /api/textures/{id}/{kind}", s.requireUser(s.textureFile))
	m.HandleFunc("PATCH /api/textures/{id}", s.requireUser(s.updateTexture))
	m.HandleFunc("DELETE /api/textures/{id}", s.requireUser(s.deleteTexture))

	m.HandleFunc("GET /api/templates", s.requireUser(s.listTemplates))
	m.HandleFunc("GET /api/templates/{id}/photos/{n}", s.requireUser(s.templatePhoto))
	m.HandleFunc("GET /api/admin/vision", s.requireAdmin(s.visionStatus))
	m.HandleFunc("GET /api/admin/templates", s.requireAdmin(s.listAllTemplates))
	m.HandleFunc("POST /api/admin/templates", s.requireAdmin(s.createTemplate))
	m.HandleFunc("GET /api/admin/templates/{id}", s.requireAdmin(s.getTemplate))
	m.HandleFunc("PATCH /api/admin/templates/{id}", s.requireAdmin(s.updateTemplate))
	m.HandleFunc("DELETE /api/admin/templates/{id}", s.requireAdmin(s.deleteTemplate))
	m.HandleFunc("POST /api/admin/templates/{id}/suggest", s.requireAdmin(s.suggestTemplate))

	m.HandleFunc("GET /api/admin/invites", s.requireAdmin(s.listInvites))
	m.HandleFunc("POST /api/admin/invites", s.requireAdmin(s.createInvite))
	m.HandleFunc("DELETE /api/admin/invites/{id}", s.requireAdmin(s.deleteInvite))

	m.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusNotFound, "not_found", "Not found.")
	})
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if strings.HasPrefix(r.URL.Path, "/api/v1/") && cors(w, r) {
		return
	}
	// /api/v1 takes a token in a header and never a cookie, so another site making a request in the user's browser gets nothing (no CSRF).
	if !strings.HasPrefix(r.URL.Path, "/api/v1/") && !s.sameOrigin(r) {
		writeError(w, http.StatusForbidden, "bad_origin", "Requests must come from the app itself.")
		return
	}
	s.mux.ServeHTTP(w, r)
}

// sameOrigin blocks cross-site requests that change things (CSRF), on top of SameSite cookies.
func (s *Server) sameOrigin(r *http.Request) bool {
	switch r.Method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return true
	}
	if o := r.Header.Get("Origin"); o != "" {
		return o == s.cfg.PublicURL
	}
	return r.Header.Get("Sec-Fetch-Site") != "cross-site"
}

/* ---------- Sessions ---------- */

func (s *Server) currentUser(r *http.Request) (store.User, bool) {
	ck, err := r.Cookie(sessionCookie)
	if err != nil || ck.Value == "" {
		return store.User{}, false
	}
	u, err := s.st.SessionUser(r.Context(), auth.HashToken(ck.Value))
	if err != nil {
		if !errors.Is(err, store.ErrNotFound) {
			log.Printf("session lookup: %v", err)
		}
		return store.User{}, false
	}
	return u, true
}

type userHandler func(http.ResponseWriter, *http.Request, store.User)

func (s *Server) requireUser(next userHandler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u, ok := s.currentUser(r)
		if !ok {
			writeError(w, http.StatusUnauthorized, "unauthorized", "Log in first.")
			return
		}
		next(w, r, u)
	}
}

func (s *Server) requireAdmin(next userHandler) http.HandlerFunc {
	return s.requireUser(func(w http.ResponseWriter, r *http.Request, u store.User) {
		if !u.IsAdmin {
			writeError(w, http.StatusForbidden, "forbidden", "Only the admin can do this.")
			return
		}
		next(w, r, u)
	})
}

func (s *Server) startSession(w http.ResponseWriter, r *http.Request, u store.User) error {
	token := auth.NewToken()
	expires := time.Now().Add(s.cfg.SessionTTL)
	if err := s.st.CreateSession(r.Context(), u.ID, auth.HashToken(token), expires); err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Value: token, Path: "/", Expires: expires, MaxAge: int(s.cfg.SessionTTL.Seconds()),
		HttpOnly: true, Secure: s.cfg.SecureCookies, SameSite: http.SameSiteLaxMode,
	})
	return nil
}

func (s *Server) clearCookie(w http.ResponseWriter, name, path string) {
	http.SetCookie(w, &http.Cookie{Name: name, Value: "", Path: path, MaxAge: -1, HttpOnly: true, Secure: s.cfg.SecureCookies, SameSite: http.SameSiteLaxMode})
}

/* ---------- Helpers ---------- */

type apiError struct {
	Error   string `json:"error"`
	Message string `json:"message"`
	Version int64  `json:"version,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("writing response: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, apiError{Error: code, Message: message})
}

func internalError(w http.ResponseWriter, err error) {
	log.Printf("internal error: %v", err)
	writeError(w, http.StatusInternalServerError, "internal", "Something went wrong. Try again.")
}

// uploadTimeout is how long an upload route may take to read its body and answer. The server's ReadTimeout (30 s) covers the whole
// request including the body, which is too short for a model or an item over a slow connection.
const uploadTimeout = 10 * time.Minute

// allowSlowUpload gives this request its own, longer read and write deadline (call it first in a handler that takes big uploads).
func allowSlowUpload(w http.ResponseWriter) {
	rc := http.NewResponseController(w)
	d := time.Now().Add(uploadTimeout)
	if err := rc.SetReadDeadline(d); err != nil {
		log.Printf("upload read deadline: %v", err)
	}
	if err := rc.SetWriteDeadline(d); err != nil {
		log.Printf("upload write deadline: %v", err)
	}
}

// decodeJSON reads a JSON body into v, or writes an error and returns false.
func decodeJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	mt, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if mt != "application/json" {
		writeError(w, http.StatusUnsupportedMediaType, "unsupported_media_type", "Send JSON.")
		return false
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			writeError(w, http.StatusRequestEntityTooLarge, "too_large", "That's too much data.")
		} else {
			writeError(w, http.StatusBadRequest, "invalid_json", "The request isn't valid JSON.")
		}
		return false
	}
	return true
}

// cleanText trims s and checks it is 1 to max characters with no control characters.
func cleanText(s string, max int) (string, bool) {
	s = strings.TrimSpace(s)
	n := utf8.RuneCountInString(s)
	if n == 0 || n > max || !utf8.ValidString(s) {
		return s, false
	}
	for _, r := range s {
		if unicode.IsControl(r) {
			return s, false
		}
	}
	return s, true
}

// displayName uses the given name, or the part of the email before @.
func displayName(name, email string) (string, bool) {
	if strings.TrimSpace(name) == "" {
		name, _, _ = strings.Cut(email, "@")
	}
	return cleanText(name, 80)
}

func clientIP(r *http.Request, trustProxy bool) string {
	if trustProxy {
		if first, _, _ := strings.Cut(r.Header.Get("X-Forwarded-For"), ","); strings.TrimSpace(first) != "" {
			return strings.TrimSpace(first)
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

/* ---------- Rate limiting ---------- */

// limiter allows max hits per key in a fixed time window.
type limiter struct {
	mu     sync.Mutex
	max    int
	window time.Duration
	hits   map[string]*bucket
}

type bucket struct {
	n     int
	start time.Time
}

func newLimiter(max int, window time.Duration) *limiter {
	return &limiter{max: max, window: window, hits: map[string]*bucket{}}
}

func (l *limiter) allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	if len(l.hits) > 10_000 {
		for k, b := range l.hits {
			if now.Sub(b.start) > l.window {
				delete(l.hits, k)
			}
		}
	}
	b := l.hits[key]
	if b == nil || now.Sub(b.start) > l.window {
		b = &bucket{start: now}
		l.hits[key] = b
	}
	b.n++
	return b.n <= l.max
}

func (l *limiter) reset(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.hits, key)
}
