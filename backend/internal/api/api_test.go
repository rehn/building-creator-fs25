package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"house-to-i3d/backend/internal/auth"
	"house-to-i3d/backend/internal/store"
)

const origin = "http://localhost:3000"

func init() { auth.Iterations = 1000 }

func newTestServer(t *testing.T, edit ...func(*Config)) *Server {
	t.Helper()
	st, err := store.Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	cfg := Config{PublicURL: origin, AdminEmail: "admin@example.se", SessionTTL: 24 * time.Hour}
	for _, e := range edit {
		e(&cfg)
	}
	return New(st, cfg)
}

// client keeps cookies between requests, like a browser.
type client struct {
	t       *testing.T
	h       http.Handler
	cookies map[string]*http.Cookie
	ip      string
}

func newClient(t *testing.T, h http.Handler) *client {
	return &client{t: t, h: h, cookies: map[string]*http.Cookie{}, ip: "10.0.0.1"}
}

func (c *client) send(req *http.Request) *httptest.ResponseRecorder {
	req.RemoteAddr = c.ip + ":5555"
	for _, ck := range c.cookies {
		req.AddCookie(ck)
	}
	rec := httptest.NewRecorder()
	c.h.ServeHTTP(rec, req)
	for _, ck := range rec.Result().Cookies() {
		if ck.MaxAge < 0 || ck.Value == "" {
			delete(c.cookies, ck.Name)
		} else {
			c.cookies[ck.Name] = ck
		}
	}
	return rec
}

func (c *client) do(method, path string, body any) *httptest.ResponseRecorder {
	c.t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if s, ok := body.(string); ok {
			buf.WriteString(s)
		} else if err := json.NewEncoder(&buf).Encode(body); err != nil {
			c.t.Fatal(err)
		}
	}
	req := httptest.NewRequest(method, path, &buf)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if method != http.MethodGet {
		req.Header.Set("Origin", origin)
	}
	return c.send(req)
}

func decode[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(rec.Body.Bytes(), &v); err != nil {
		t.Fatalf("bad JSON %q: %v", rec.Body.String(), err)
	}
	return v
}

func expect(t *testing.T, rec *httptest.ResponseRecorder, status int) {
	t.Helper()
	if rec.Code != status {
		t.Fatalf("want status %d, got %d: %s", status, rec.Code, rec.Body.String())
	}
}

func expectError(t *testing.T, rec *httptest.ResponseRecorder, status int, code string) {
	t.Helper()
	expect(t, rec, status)
	if got := decode[apiError](t, rec).Error; got != code {
		t.Fatalf("want error %q, got %q", code, got)
	}
}

const pw = "ett bra lösenord"

func signupAdmin(t *testing.T, srv *Server) *client {
	t.Helper()
	c := newClient(t, srv)
	expect(t, c.do("POST", "/api/auth/signup", map[string]string{"email": "admin@example.se", "password": pw, "name": "Admin"}), 201)
	return c
}

func invite(t *testing.T, admin *client, email string) string {
	t.Helper()
	rec := admin.do("POST", "/api/admin/invites", map[string]string{"email": email})
	expect(t, rec, 201)
	res := decode[struct {
		Link string `json:"link"`
	}](t, rec)
	u, err := url.Parse(res.Link)
	if err != nil || !strings.HasPrefix(res.Link, origin+"/signup?invite=") {
		t.Fatalf("bad invite link %q", res.Link)
	}
	return u.Query().Get("invite")
}

func signupFriend(t *testing.T, srv *Server, admin *client, email string) *client {
	t.Helper()
	tok := invite(t, admin, email)
	c := newClient(t, srv)
	expect(t, c.do("POST", "/api/auth/signup", map[string]string{"email": email, "password": pw, "invite": tok}), 201)
	return c
}

func TestHealth(t *testing.T) {
	c := newClient(t, newTestServer(t))
	expect(t, c.do("GET", "/api/health", nil), 200)
}

func TestAdminCanSignUpWithoutInvite(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)
	if c.cookies[sessionCookie] == nil {
		t.Fatal("no session cookie after signup")
	}
	ck := c.cookies[sessionCookie]
	if !ck.HttpOnly || ck.SameSite != http.SameSiteLaxMode || ck.Path != "/" {
		t.Fatalf("session cookie not locked down: %+v", ck)
	}
	rec := c.do("GET", "/api/auth/me", nil)
	expect(t, rec, 200)
	me := decode[store.User](t, rec)
	if !me.IsAdmin || me.Email != "admin@example.se" || me.Name != "Admin" {
		t.Fatalf("unexpected user %+v", me)
	}
}

func TestSignupNeedsInvite(t *testing.T) {
	srv := newTestServer(t)
	c := newClient(t, srv)
	expectError(t, c.do("POST", "/api/auth/signup", map[string]string{"email": "random@example.se", "password": pw}), 403, "invite_required")
}

func TestInviteFlow(t *testing.T) {
	srv := newTestServer(t)
	admin := signupAdmin(t, srv)
	tok := invite(t, admin, "Friend@Example.se")

	anon := newClient(t, srv)
	rec := anon.do("GET", "/api/invites/"+tok, nil)
	expect(t, rec, 200)
	if got := decode[map[string]string](t, rec)["email"]; got != "friend@example.se" {
		t.Fatalf("invite lookup returned %q", got)
	}

	expectError(t, anon.do("POST", "/api/auth/signup", map[string]string{"email": "someone.else@example.se", "password": pw, "invite": tok}), 403, "invite_required")

	friend := newClient(t, srv)
	rec = friend.do("POST", "/api/auth/signup", map[string]string{"email": "friend@example.se", "password": pw, "invite": tok})
	expect(t, rec, 201)
	if decode[store.User](t, rec).IsAdmin {
		t.Fatal("invited user became admin")
	}
	if decode[store.User](t, rec).Name != "friend" {
		t.Fatal("name should default to the part before @")
	}

	expect(t, anon.do("GET", "/api/invites/"+tok, nil), 404)
	expectError(t, newClient(t, srv).do("POST", "/api/auth/signup", map[string]string{"email": "friend2@example.se", "password": pw, "invite": tok}), 403, "invite_required")
}

func TestSignupValidation(t *testing.T) {
	srv := newTestServer(t)
	c := newClient(t, srv)
	expectError(t, c.do("POST", "/api/auth/signup", map[string]string{"email": "admin@example.se", "password": "kort"}), 400, "weak_password")
	expectError(t, c.do("POST", "/api/auth/signup", map[string]string{"email": "inte en adress", "password": pw}), 400, "invalid_email")
	expectError(t, c.do("POST", "/api/auth/signup", `{"email":`), 400, "invalid_json")
	signupAdmin(t, srv)
	expectError(t, c.do("POST", "/api/auth/signup", map[string]string{"email": "admin@example.se", "password": pw}), 409, "email_taken")
}

func TestLoginAndLogout(t *testing.T) {
	srv := newTestServer(t)
	signupAdmin(t, srv)
	c := newClient(t, srv)
	expectError(t, c.do("POST", "/api/auth/login", map[string]string{"email": "admin@example.se", "password": "fel lösenord!"}), 401, "invalid_credentials")
	expectError(t, c.do("POST", "/api/auth/login", map[string]string{"email": "ghost@example.se", "password": pw}), 401, "invalid_credentials")
	expect(t, c.do("POST", "/api/auth/login", map[string]string{"email": "ADMIN@example.se", "password": pw}), 200)
	expect(t, c.do("GET", "/api/auth/me", nil), 200)
	old := *c.cookies[sessionCookie]
	expect(t, c.do("POST", "/api/auth/logout", nil), 204)
	expect(t, c.do("GET", "/api/auth/me", nil), 401)
	// the old cookie must not work any more, even if a client keeps it
	c.cookies[sessionCookie] = &old
	expect(t, c.do("GET", "/api/auth/me", nil), 401)
}

func TestLoginIsRateLimited(t *testing.T) {
	srv := newTestServer(t)
	signupAdmin(t, srv)
	c := newClient(t, srv)
	for i := 0; i < loginAttempts; i++ {
		expect(t, c.do("POST", "/api/auth/login", map[string]string{"email": "admin@example.se", "password": "fel lösenord!"}), 401)
	}
	expectError(t, c.do("POST", "/api/auth/login", map[string]string{"email": "admin@example.se", "password": pw}), 429, "too_many_attempts")
	other := newClient(t, srv)
	other.ip = "10.0.0.2"
	expect(t, other.do("POST", "/api/auth/login", map[string]string{"email": "admin@example.se", "password": pw}), 200)
}

func TestForwardedForIsOnlyTrustedWhenConfigured(t *testing.T) {
	if got := clientIP(httptest.NewRequest("GET", "/", nil), false); got != "192.0.2.1" {
		t.Fatalf("got %q", got)
	}
	r := httptest.NewRequest("GET", "/", nil)
	r.Header.Set("X-Forwarded-For", "203.0.113.9, 10.0.0.1")
	if got := clientIP(r, false); got != "192.0.2.1" {
		t.Fatalf("untrusted header used: %q", got)
	}
	if got := clientIP(r, true); got != "203.0.113.9" {
		t.Fatalf("trusted header ignored: %q", got)
	}
}

func TestEndpointsNeedLogin(t *testing.T) {
	c := newClient(t, newTestServer(t))
	for _, path := range []string{"/api/auth/me", "/api/projects", "/api/projects/x", "/api/admin/invites"} {
		expectError(t, c.do("GET", path, nil), 401, "unauthorized")
	}
}

func TestAdminEndpointsNeedAdmin(t *testing.T) {
	srv := newTestServer(t)
	admin := signupAdmin(t, srv)
	friend := signupFriend(t, srv, admin, "friend@example.se")
	expectError(t, friend.do("GET", "/api/admin/invites", nil), 403, "forbidden")
	expectError(t, friend.do("POST", "/api/admin/invites", map[string]string{"email": "x@example.se"}), 403, "forbidden")
	rec := admin.do("GET", "/api/admin/invites", nil)
	expect(t, rec, 200)
	list := decode[[]store.Invite](t, rec)
	if len(list) != 1 || list[0].UsedAt == nil {
		t.Fatalf("want one used invite, got %+v", list)
	}
}

func TestDeleteInvite(t *testing.T) {
	srv := newTestServer(t)
	admin := signupAdmin(t, srv)
	tok := invite(t, admin, "friend@example.se")
	list := decode[[]store.Invite](t, admin.do("GET", "/api/admin/invites", nil))
	expect(t, admin.do("DELETE", fmt.Sprintf("/api/admin/invites/%d", list[0].ID), nil), 204)
	expect(t, newClient(t, srv).do("GET", "/api/invites/"+tok, nil), 404)
	expect(t, admin.do("DELETE", fmt.Sprintf("/api/admin/invites/%d", list[0].ID), nil), 404)
}

func TestCrossSiteRequestsAreRejected(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)
	req := httptest.NewRequest("POST", "/api/projects", strings.NewReader(`{"name":"x"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "https://evil.example")
	expectError(t, c.send(req), 403, "bad_origin")

	req = httptest.NewRequest("POST", "/api/projects", strings.NewReader(`{"name":"x"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Sec-Fetch-Site", "cross-site")
	expectError(t, c.send(req), 403, "bad_origin")

	req = httptest.NewRequest("POST", "/api/projects", strings.NewReader(`{"name":"x"}`))
	req.Header.Set("Content-Type", "text/plain")
	req.Header.Set("Origin", origin)
	expectError(t, c.send(req), 415, "unsupported_media_type")
}

func TestProjectLifecycle(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)

	rec := c.do("POST", "/api/projects", map[string]any{"name": "Stugan", "data": map[string]any{"width": 10}})
	expect(t, rec, 201)
	p := decode[store.Project](t, rec)
	if p.Name != "Stugan" || p.Version != 1 || string(p.Data) != `{"width":10}` {
		t.Fatalf("unexpected project %+v", p)
	}

	rec = c.do("POST", "/api/projects", map[string]any{})
	expect(t, rec, 201)
	if q := decode[store.Project](t, rec); q.Name != "New house" || string(q.Data) != "{}" {
		t.Fatalf("defaults not applied: %+v", q)
	}

	list := decode[[]store.ProjectSummary](t, c.do("GET", "/api/projects", nil))
	if len(list) != 2 {
		t.Fatalf("want 2 projects, got %d", len(list))
	}

	rec = c.do("PATCH", "/api/projects/"+p.ID, map[string]any{"name": "Stugan vid sjön", "data": map[string]any{"width": 12}, "thumbnail": "data:image/jpeg;base64,/9j/AA==", "version": 1})
	expect(t, rec, 200)
	p = decode[store.Project](t, rec)
	if p.Version != 2 || p.Name != "Stugan vid sjön" || string(p.Data) != `{"width":12}` {
		t.Fatalf("update not applied: %+v", p)
	}

	rec = c.do("PATCH", "/api/projects/"+p.ID, map[string]any{"name": "Krock", "version": 1})
	expectError(t, rec, 409, "version_conflict")

	rec = c.do("POST", "/api/projects/"+p.ID+"/duplicate", nil)
	expect(t, rec, 201)
	if d := decode[store.Project](t, rec); d.Name != "Stugan vid sjön (copy)" || d.ID == p.ID {
		t.Fatalf("unexpected copy %+v", d)
	}

	expect(t, c.do("GET", "/api/projects/"+p.ID, nil), 200)
	expect(t, c.do("DELETE", "/api/projects/"+p.ID, nil), 204)
	expectError(t, c.do("GET", "/api/projects/"+p.ID, nil), 404, "not_found")
}

func TestProjectValidation(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)
	expectError(t, c.do("POST", "/api/projects", map[string]any{"name": "x", "data": []int{1, 2}}), 400, "invalid_data")
	expectError(t, c.do("POST", "/api/projects", map[string]any{"name": strings.Repeat("x", 101)}), 400, "invalid_name")
	p := decode[store.Project](t, c.do("POST", "/api/projects", map[string]any{"name": "ok"}))
	expectError(t, c.do("PATCH", "/api/projects/"+p.ID, map[string]any{"name": "  "}), 400, "invalid_name")
	expectError(t, c.do("PATCH", "/api/projects/"+p.ID, map[string]any{"thumbnail": "javascript:alert(1)"}), 400, "invalid_thumbnail")
	expectError(t, c.do("PATCH", "/api/projects/"+p.ID, map[string]any{"data": strings.Repeat("x", 10)}), 400, "invalid_data")
	big := map[string]any{"data": map[string]string{"x": strings.Repeat("a", maxDataBytes)}}
	rec := c.do("PATCH", "/api/projects/"+p.ID, big)
	if rec.Code != 400 && rec.Code != 413 {
		t.Fatalf("oversized data accepted: %d", rec.Code)
	}
}

func TestProjectsArePrivate(t *testing.T) {
	srv := newTestServer(t)
	admin := signupAdmin(t, srv)
	friend := signupFriend(t, srv, admin, "friend@example.se")
	p := decode[store.Project](t, admin.do("POST", "/api/projects", map[string]any{"name": "Mitt hus"}))

	expectError(t, friend.do("GET", "/api/projects/"+p.ID, nil), 404, "not_found")
	expectError(t, friend.do("PATCH", "/api/projects/"+p.ID, map[string]any{"name": "Kapat"}), 404, "not_found")
	expectError(t, friend.do("DELETE", "/api/projects/"+p.ID, nil), 404, "not_found")
	expectError(t, friend.do("POST", "/api/projects/"+p.ID+"/duplicate", nil), 404, "not_found")
	if list := decode[[]store.ProjectSummary](t, friend.do("GET", "/api/projects", nil)); len(list) != 0 {
		t.Fatalf("friend sees %d of the admin's projects", len(list))
	}
}

// fakeGoogle stands in for Google's token and userinfo endpoints.
func fakeGoogle(t *testing.T, user map[string]any) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /token", func(w http.ResponseWriter, r *http.Request) {
		r.ParseForm()
		if r.Form.Get("code") != "good-code" || r.Form.Get("client_secret") != "secret" || r.Form.Get("redirect_uri") != origin+"/api/auth/google/callback" {
			http.Error(w, `{"error":"invalid_grant"}`, 400)
			return
		}
		json.NewEncoder(w).Encode(map[string]string{"access_token": "at", "token_type": "Bearer"})
	})
	mux.HandleFunc("GET /userinfo", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer at" {
			http.Error(w, "no", 401)
			return
		}
		json.NewEncoder(w).Encode(user)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func withGoogle(g *httptest.Server) func(*Config) {
	return func(c *Config) {
		c.GoogleClientID, c.GoogleClientSecret = "id", "secret"
		c.googleEndpoints = &googleEndpoints{Auth: "https://accounts.example/auth", Token: g.URL + "/token", UserInfo: g.URL + "/userinfo"}
	}
}

// googleLogin runs start + callback and returns where the user ends up.
func googleLogin(t *testing.T, c *client, invite string) string {
	t.Helper()
	path := "/api/auth/google/start"
	if invite != "" {
		path += "?invite=" + url.QueryEscape(invite)
	}
	rec := c.do("GET", path, nil)
	expect(t, rec, 302)
	loc, _ := url.Parse(rec.Header().Get("Location"))
	if !strings.HasPrefix(loc.String(), "https://accounts.example/auth?") || loc.Query().Get("client_id") != "id" {
		t.Fatalf("bad redirect %q", loc)
	}
	state := loc.Query().Get("state")
	rec = c.do("GET", "/api/auth/google/callback?code=good-code&state="+url.QueryEscape(state), nil)
	expect(t, rec, 302)
	return rec.Header().Get("Location")
}

func TestGoogleLoginForAdmin(t *testing.T) {
	g := fakeGoogle(t, map[string]any{"sub": "g-1", "email": "Admin@example.se", "email_verified": true, "name": "Admin G"})
	srv := newTestServer(t, withGoogle(g))
	c := newClient(t, srv)
	if dest := googleLogin(t, c, ""); dest != "/" {
		t.Fatalf("ended up at %q", dest)
	}
	me := decode[store.User](t, c.do("GET", "/api/auth/me", nil))
	if !me.IsAdmin || !me.HasGoogle || me.HasPassword || me.Name != "Admin G" {
		t.Fatalf("unexpected user %+v", me)
	}
	// second login finds the same account by Google id
	c2 := newClient(t, srv)
	googleLogin(t, c2, "")
	if decode[store.User](t, c2.do("GET", "/api/auth/me", nil)).ID != me.ID {
		t.Fatal("second Google login made a new account")
	}
}

func TestGoogleLoginLinksExistingAccount(t *testing.T) {
	g := fakeGoogle(t, map[string]any{"sub": "g-1", "email": "admin@example.se", "email_verified": true})
	srv := newTestServer(t, withGoogle(g))
	signupAdmin(t, srv)
	c := newClient(t, srv)
	googleLogin(t, c, "")
	me := decode[store.User](t, c.do("GET", "/api/auth/me", nil))
	if !me.HasGoogle || !me.HasPassword {
		t.Fatalf("account not linked: %+v", me)
	}
}

func TestGoogleLoginNeedsInvite(t *testing.T) {
	g := fakeGoogle(t, map[string]any{"sub": "g-2", "email": "stranger@example.se", "email_verified": true})
	srv := newTestServer(t, withGoogle(g))
	c := newClient(t, srv)
	if dest := googleLogin(t, c, ""); dest != "/login?error=not_invited" {
		t.Fatalf("ended up at %q", dest)
	}
	expect(t, c.do("GET", "/api/auth/me", nil), 401)
}

func TestGoogleLoginWithInvite(t *testing.T) {
	g := fakeGoogle(t, map[string]any{"sub": "g-3", "email": "friend@example.se", "email_verified": true})
	srv := newTestServer(t, withGoogle(g))
	admin := signupAdmin(t, srv)
	tok := invite(t, admin, "friend@example.se")
	c := newClient(t, srv)
	if dest := googleLogin(t, c, tok); dest != "/" {
		t.Fatalf("ended up at %q", dest)
	}
	expect(t, c.do("GET", "/api/auth/me", nil), 200)
	expect(t, newClient(t, srv).do("GET", "/api/invites/"+tok, nil), 404)
}

func TestGoogleLoginRejectsUnverifiedEmail(t *testing.T) {
	g := fakeGoogle(t, map[string]any{"sub": "g-4", "email": "admin@example.se", "email_verified": false})
	srv := newTestServer(t, withGoogle(g))
	c := newClient(t, srv)
	if dest := googleLogin(t, c, ""); dest != "/login?error=google_failed" {
		t.Fatalf("ended up at %q", dest)
	}
}

func TestGoogleCallbackChecksState(t *testing.T) {
	g := fakeGoogle(t, map[string]any{"sub": "g-1", "email": "admin@example.se", "email_verified": true})
	srv := newTestServer(t, withGoogle(g))
	c := newClient(t, srv)
	expect(t, c.do("GET", "/api/auth/google/start", nil), 302)
	rec := c.do("GET", "/api/auth/google/callback?code=good-code&state=forged", nil)
	expect(t, rec, 302)
	if rec.Header().Get("Location") != "/login?error=google_failed" {
		t.Fatalf("forged state accepted: %q", rec.Header().Get("Location"))
	}
	expect(t, c.do("GET", "/api/auth/me", nil), 401)
}

func TestGoogleDisabled(t *testing.T) {
	srv := newTestServer(t)
	c := newClient(t, srv)
	rec := c.do("GET", "/api/auth/config", nil)
	expect(t, rec, 200)
	if decode[map[string]bool](t, rec)["google"] {
		t.Fatal("Google reported as enabled")
	}
	expect(t, c.do("GET", "/api/auth/google/start", nil), 404)
}
