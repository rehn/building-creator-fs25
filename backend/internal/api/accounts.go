package api

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"house-to-i3d/backend/internal/auth"
	"house-to-i3d/backend/internal/store"
)

/* ---------- Email and password ---------- */

func (s *Server) signup(w http.ResponseWriter, r *http.Request) {
	if !s.signups.allow(clientIP(r, s.cfg.TrustProxy)) {
		writeError(w, http.StatusTooManyRequests, "too_many_attempts", "Too many sign-ups. Try again later.")
		return
	}
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Name     string `json:"name"`
		Invite   string `json:"invite"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	email, err := auth.NormalizeEmail(in.Email)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_email", "That email address doesn't look right.")
		return
	}
	if err := auth.ValidatePassword(in.Password); err != nil {
		writeError(w, http.StatusBadRequest, "weak_password", fmt.Sprintf("Use a password of %d to %d characters.", auth.MinPassword, auth.MaxPassword))
		return
	}
	name, ok := displayName(in.Name, email)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid_name", "Use a name of up to 80 characters.")
		return
	}
	nu := store.NewUser{Email: email, Name: name}
	var inviteID int64
	if s.cfg.AdminEmail != "" && email == s.cfg.AdminEmail {
		nu.IsAdmin = true
	} else {
		inv, err := s.st.InviteByToken(r.Context(), auth.HashToken(in.Invite))
		if in.Invite == "" || err != nil || inv.Email != email {
			writeError(w, http.StatusForbidden, "invite_required", "You need an invite for this email address.")
			return
		}
		inviteID = inv.ID
	}
	if nu.PasswordHash, err = auth.HashPassword(in.Password); err != nil {
		internalError(w, err)
		return
	}
	u, err := s.st.CreateUser(r.Context(), nu, inviteID)
	switch {
	case errors.Is(err, store.ErrEmailTaken):
		writeError(w, http.StatusConflict, "email_taken", "There's already an account with that email. Log in instead.")
		return
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusForbidden, "invite_required", "That invite has already been used.")
		return
	case err != nil:
		internalError(w, err)
		return
	}
	if err := s.startSession(w, r, u); err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, u)
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	email, _ := auth.NormalizeEmail(in.Email)
	key := clientIP(r, s.cfg.TrustProxy) + "|" + email
	if !s.logins.allow(key) {
		writeError(w, http.StatusTooManyRequests, "too_many_attempts", "Too many attempts. Wait 15 minutes and try again.")
		return
	}
	u, hash, err := s.st.UserByEmail(r.Context(), email)
	if err != nil && !errors.Is(err, store.ErrNotFound) {
		internalError(w, err)
		return
	}
	if err != nil || hash == "" {
		auth.CheckPassword(s.dummy, in.Password) // same work as a real check
		writeError(w, http.StatusUnauthorized, "invalid_credentials", "Wrong email or password.")
		return
	}
	if !auth.CheckPassword(hash, in.Password) {
		writeError(w, http.StatusUnauthorized, "invalid_credentials", "Wrong email or password.")
		return
	}
	s.logins.reset(key)
	if err := s.startSession(w, r, u); err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, u)
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if ck, err := r.Cookie(sessionCookie); err == nil && ck.Value != "" {
		if err := s.st.DeleteSession(r.Context(), auth.HashToken(ck.Value)); err != nil {
			internalError(w, err)
			return
		}
	}
	s.clearCookie(w, sessionCookie, "/")
	w.WriteHeader(http.StatusNoContent)
}

/* ---------- Invites ---------- */

// inviteInfo lets the sign-up page show which email an invite is for.
func (s *Server) inviteInfo(w http.ResponseWriter, r *http.Request) {
	inv, err := s.st.InviteByToken(r.Context(), auth.HashToken(r.PathValue("token")))
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "This invite has expired or been used.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"email": inv.Email})
}

func (s *Server) listInvites(w http.ResponseWriter, r *http.Request, _ store.User) {
	list, err := s.st.ListInvites(r.Context())
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) createInvite(w http.ResponseWriter, r *http.Request, u store.User) {
	var in struct {
		Email string `json:"email"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	email, err := auth.NormalizeEmail(in.Email)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_email", "That email address doesn't look right.")
		return
	}
	if _, _, err := s.st.UserByEmail(r.Context(), email); err == nil {
		writeError(w, http.StatusConflict, "already_member", "That person already has an account.")
		return
	}
	token := auth.NewToken()
	inv, err := s.st.CreateInvite(r.Context(), email, auth.HashToken(token), u.ID, time.Now().Add(inviteTTL))
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"invite": inv,
		"link":   s.cfg.PublicURL + "/signup?invite=" + url.QueryEscape(token),
	})
}

func (s *Server) deleteInvite(w http.ResponseWriter, r *http.Request, _ store.User) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err == nil {
		err = s.st.DeleteInvite(r.Context(), id)
	}
	if err != nil {
		if errors.Is(err, store.ErrNotFound) || errors.Is(err, strconv.ErrSyntax) || errors.Is(err, strconv.ErrRange) {
			writeError(w, http.StatusNotFound, "not_found", "No such invite.")
			return
		}
		internalError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

/* ---------- Sign in with Google ---------- */

type googleEndpoints struct{ Auth, Token, UserInfo string }

var defaultGoogle = googleEndpoints{
	Auth:     "https://accounts.google.com/o/oauth2/v2/auth",
	Token:    "https://oauth2.googleapis.com/token",
	UserInfo: "https://openidconnect.googleapis.com/v1/userinfo",
}

const (
	stateCookie  = "hx_oauth_state"
	inviteCookie = "hx_oauth_invite"
	oauthPath    = "/api/auth/google"
)

var errNotInvited = errors.New("not invited")

func (s *Server) tempCookie(w http.ResponseWriter, name, value string) {
	http.SetCookie(w, &http.Cookie{Name: name, Value: value, Path: oauthPath, MaxAge: 600, HttpOnly: true, Secure: s.cfg.SecureCookies, SameSite: http.SameSiteLaxMode})
}

func (s *Server) googleStart(w http.ResponseWriter, r *http.Request) {
	if !s.cfg.GoogleEnabled() {
		writeError(w, http.StatusNotFound, "not_found", "Google sign-in isn't set up.")
		return
	}
	state := auth.NewToken()
	s.tempCookie(w, stateCookie, state)
	if inv := r.URL.Query().Get("invite"); inv != "" {
		s.tempCookie(w, inviteCookie, inv)
	}
	q := url.Values{
		"client_id":     {s.cfg.GoogleClientID},
		"redirect_uri":  {s.cfg.GoogleRedirectURL()},
		"response_type": {"code"},
		"scope":         {"openid email profile"},
		"state":         {state},
		"prompt":        {"select_account"},
	}
	http.Redirect(w, r, s.google.Auth+"?"+q.Encode(), http.StatusFound)
}

func (s *Server) googleCallback(w http.ResponseWriter, r *http.Request) {
	if !s.cfg.GoogleEnabled() {
		writeError(w, http.StatusNotFound, "not_found", "Google sign-in isn't set up.")
		return
	}
	var inviteToken string
	if ck, err := r.Cookie(inviteCookie); err == nil {
		inviteToken = ck.Value
	}
	state, _ := r.Cookie(stateCookie)
	s.clearCookie(w, stateCookie, oauthPath)
	s.clearCookie(w, inviteCookie, oauthPath)
	fail := func(code string, err error) {
		if err != nil {
			log.Printf("google sign-in: %v", err)
		}
		http.Redirect(w, r, "/login?error="+code, http.StatusFound)
	}

	q := r.URL.Query()
	if state == nil || state.Value == "" || subtle.ConstantTimeCompare([]byte(state.Value), []byte(q.Get("state"))) != 1 {
		fail("google_failed", errors.New("state mismatch"))
		return
	}
	if q.Get("code") == "" {
		fail("google_failed", nil) // the user cancelled at Google
		return
	}
	info, err := s.googleUser(r.Context(), q.Get("code"))
	if err != nil {
		fail("google_failed", err)
		return
	}
	if !info.EmailVerified || info.Sub == "" {
		fail("google_failed", errors.New("email not verified"))
		return
	}
	email, err := auth.NormalizeEmail(info.Email)
	if err != nil {
		fail("google_failed", err)
		return
	}
	u, err := s.googleAccount(r.Context(), info, email, inviteToken)
	if errors.Is(err, errNotInvited) {
		fail("not_invited", nil)
		return
	}
	if err != nil {
		fail("google_failed", err)
		return
	}
	if err := s.startSession(w, r, u); err != nil {
		fail("google_failed", err)
		return
	}
	http.Redirect(w, r, "/", http.StatusFound)
}

type googleInfo struct {
	Sub           string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
}

// googleUser trades the code from Google for the user's profile.
func (s *Server) googleUser(ctx context.Context, code string) (googleInfo, error) {
	form := url.Values{
		"code":          {code},
		"client_id":     {s.cfg.GoogleClientID},
		"client_secret": {s.cfg.GoogleClientSecret},
		"redirect_uri":  {s.cfg.GoogleRedirectURL()},
		"grant_type":    {"authorization_code"},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.google.Token, strings.NewReader(form.Encode()))
	if err != nil {
		return googleInfo{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	var tok struct {
		AccessToken string `json:"access_token"`
	}
	if err := s.fetchJSON(req, &tok); err != nil {
		return googleInfo{}, fmt.Errorf("token exchange: %w", err)
	}
	if tok.AccessToken == "" {
		return googleInfo{}, errors.New("token exchange: no access token")
	}
	req, err = http.NewRequestWithContext(ctx, http.MethodGet, s.google.UserInfo, nil)
	if err != nil {
		return googleInfo{}, err
	}
	req.Header.Set("Authorization", "Bearer "+tok.AccessToken)
	var info googleInfo
	if err := s.fetchJSON(req, &info); err != nil {
		return googleInfo{}, fmt.Errorf("userinfo: %w", err)
	}
	return info, nil
}

func (s *Server) fetchJSON(req *http.Request, v any) error {
	res, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return err
	}
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("status %d", res.StatusCode)
	}
	return json.Unmarshal(body, v)
}

// googleAccount finds or creates the account for a Google user: by Google id,
// then by email (linking Google to it), then as a new account if they are
// the admin or have an open invite.
func (s *Server) googleAccount(ctx context.Context, info googleInfo, email, inviteToken string) (store.User, error) {
	u, err := s.st.UserByGoogleSub(ctx, info.Sub)
	if err == nil {
		return u, nil
	}
	if !errors.Is(err, store.ErrNotFound) {
		return store.User{}, err
	}
	u, _, err = s.st.UserByEmail(ctx, email)
	if err == nil {
		if err := s.st.LinkGoogle(ctx, u.ID, info.Sub); err != nil {
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
	nu := store.NewUser{Email: email, Name: name, GoogleSub: info.Sub}
	if s.cfg.AdminEmail != "" && email == s.cfg.AdminEmail {
		nu.IsAdmin = true
		return s.st.CreateUser(ctx, nu, 0)
	}
	inv, err := s.inviteFor(ctx, email, inviteToken)
	if err != nil {
		return store.User{}, err
	}
	u, err = s.st.CreateUser(ctx, nu, inv.ID)
	if errors.Is(err, store.ErrNotFound) {
		return store.User{}, errNotInvited
	}
	return u, err
}

// inviteFor returns the invite from the link if it matches email, else any open invite for email.
func (s *Server) inviteFor(ctx context.Context, email, token string) (store.Invite, error) {
	if token != "" {
		inv, err := s.st.InviteByToken(ctx, auth.HashToken(token))
		if err == nil && inv.Email == email {
			return inv, nil
		}
	}
	inv, err := s.st.OpenInviteForEmail(ctx, email)
	if errors.Is(err, store.ErrNotFound) {
		return store.Invite{}, errNotInvited
	}
	return inv, err
}
