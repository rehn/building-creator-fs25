package api

import (
	"bytes"
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"

	"building-creator-fs25/backend/internal/auth"
	"building-creator-fs25/backend/internal/store"
)

/* ---------- Sign in with the map app ---------- */

// The map app (fs25map-creator) holds the accounts. A person who logs in there arrives with a one-use code, which we trade (with
// the secret the two apps share) for who they are. We keep our own session; nothing from the map app's cookie is read here.

const (
	ssoClientID  = "building" // how the map app knows this app
	ssoStateName = "hx_sso_state"
	ssoPath      = "/api/auth/sso"
)

func (c Config) SSOEnabled() bool       { return c.SSOURL != "" && c.SSOSecret != "" }
func (c Config) SSORedirectURL() string { return c.PublicURL + ssoPath + "/callback" }

func (s *Server) ssoStart(w http.ResponseWriter, r *http.Request) {
	if !s.cfg.SSOEnabled() {
		writeError(w, http.StatusNotFound, "not_found", "Sign-in with the map app isn't set up.")
		return
	}
	state := auth.NewToken()
	http.SetCookie(w, &http.Cookie{Name: ssoStateName, Value: state, Path: ssoPath, MaxAge: 600, HttpOnly: true, Secure: s.cfg.SecureCookies, SameSite: http.SameSiteLaxMode})
	q := url.Values{"client_id": {ssoClientID}, "redirect_uri": {s.cfg.SSORedirectURL()}, "state": {state}}
	http.Redirect(w, r, s.cfg.SSOURL+"/sso/authorize?"+q.Encode(), http.StatusFound)
}

func (s *Server) ssoCallback(w http.ResponseWriter, r *http.Request) {
	if !s.cfg.SSOEnabled() {
		writeError(w, http.StatusNotFound, "not_found", "Sign-in with the map app isn't set up.")
		return
	}
	state, _ := r.Cookie(ssoStateName)
	s.clearCookie(w, ssoStateName, ssoPath)
	fail := func(err error) {
		if err != nil {
			log.Printf("map app sign-in: %v", err)
		}
		http.Redirect(w, r, "/login?error=sso_failed", http.StatusFound)
	}
	q := r.URL.Query()
	if state == nil || state.Value == "" || subtle.ConstantTimeCompare([]byte(state.Value), []byte(q.Get("state"))) != 1 {
		fail(errors.New("state mismatch"))
		return
	}
	if q.Get("code") == "" {
		fail(nil) // cancelled over there
		return
	}
	info, err := s.ssoUser(r.Context(), q.Get("code"))
	if err != nil {
		fail(err)
		return
	}
	if !info.EmailVerified || info.Sub == "" {
		fail(errors.New("email not verified"))
		return
	}
	email, err := auth.NormalizeEmail(info.Email)
	if err != nil {
		fail(err)
		return
	}
	u, err := s.ssoAccount(r.Context(), info, email)
	if err != nil {
		fail(err)
		return
	}
	if err := s.startSession(w, r, u); err != nil {
		fail(err)
		return
	}
	http.Redirect(w, r, "/", http.StatusFound)
}

type ssoInfo struct {
	Sub           string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"emailVerified"`
	Name          string `json:"name"`
}

// ssoUser trades the code for the user.
func (s *Server) ssoUser(ctx context.Context, code string) (ssoInfo, error) {
	body, _ := json.Marshal(map[string]string{"code": code, "clientSecret": s.cfg.SSOSecret, "redirectUri": s.cfg.SSORedirectURL()})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.cfg.SSOURL+"/api/sso/token", bytes.NewReader(body))
	if err != nil {
		return ssoInfo{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	var info ssoInfo
	if err := s.fetchJSON(req, &info); err != nil {
		return ssoInfo{}, fmt.Errorf("token exchange: %w", err)
	}
	return info, nil
}

// ssoAccount finds or makes the account for a map app user: by their id, then by email (and links it), else a new one. The map app
// has already let them in (invites live there), so nobody needs an invite here; only ADMIN_EMAIL makes an admin.
func (s *Server) ssoAccount(ctx context.Context, info ssoInfo, email string) (store.User, error) {
	u, err := s.st.UserBySSOSub(ctx, info.Sub)
	if err == nil {
		return u, nil
	}
	if !errors.Is(err, store.ErrNotFound) {
		return store.User{}, err
	}
	u, _, err = s.st.UserByEmail(ctx, email)
	if err == nil {
		if err := s.st.LinkSSO(ctx, u.ID, info.Sub); err != nil {
			return store.User{}, err
		}
		return s.st.UserByID(ctx, u.ID)
	}
	if !errors.Is(err, store.ErrNotFound) {
		return store.User{}, err
	}
	name, ok := displayName(info.Name, email)
	if !ok {
		name, _ = displayName("", email)
	}
	return s.st.CreateUser(ctx, store.NewUser{Email: email, Name: name, SSOSub: info.Sub, IsAdmin: s.cfg.AdminEmail != "" && email == s.cfg.AdminEmail}, 0)
}
