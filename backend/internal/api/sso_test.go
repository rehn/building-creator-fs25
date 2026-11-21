package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"building-creator-fs25/backend/internal/store"
)

// fakeMapApp stands in for the map app (fs25map-creator), which holds the accounts: it trades a one-use code for the user.
func fakeMapApp(t *testing.T, user map[string]any) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/sso/token", func(w http.ResponseWriter, r *http.Request) {
		var in struct{ Code, ClientSecret, RedirectURI string }
		json.NewDecoder(r.Body).Decode(&in)
		if in.Code != "good-code" || in.ClientSecret != "sso-secret" || in.RedirectURI != origin+"/api/auth/sso/callback" {
			http.Error(w, `{"error":"invalid_grant"}`, 400)
			return
		}
		json.NewEncoder(w).Encode(user)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func withSSO(m *httptest.Server) func(*Config) {
	return func(c *Config) { c.SSOURL, c.SSOSecret = m.URL, "sso-secret" }
}

// ssoLogin runs start + callback and returns where the user ends up.
func ssoLogin(t *testing.T, c *client, srv *httptest.Server) string {
	t.Helper()
	rec := c.do("GET", "/api/auth/sso/start", nil)
	expect(t, rec, 302)
	loc, _ := url.Parse(rec.Header().Get("Location"))
	if !strings.HasPrefix(loc.String(), srv.URL+"/sso/authorize?") || loc.Query().Get("client_id") != "building" ||
		loc.Query().Get("redirect_uri") != origin+"/api/auth/sso/callback" {
		t.Fatalf("bad redirect %q", loc)
	}
	rec = c.do("GET", "/api/auth/sso/callback?code=good-code&state="+url.QueryEscape(loc.Query().Get("state")), nil)
	expect(t, rec, 302)
	return rec.Header().Get("Location")
}

func TestSSONewUserNeedsNoInvite(t *testing.T) {
	m := fakeMapApp(t, map[string]any{"sub": "u-1", "email": "Anna@example.se", "emailVerified": true, "name": "Anna"})
	srv := newTestServer(t, withSSO(m))
	signupAdmin(t, srv) // somebody else is the admin
	c := newClient(t, srv)
	if dest := ssoLogin(t, c, m); dest != "/" {
		t.Fatalf("ended up at %q", dest)
	}
	me := decode[store.User](t, c.do("GET", "/api/auth/me", nil))
	if me.IsAdmin || !me.HasSSO || me.HasPassword || me.Name != "Anna" || me.Email != "anna@example.se" {
		t.Fatalf("unexpected user %+v", me)
	}
	c2 := newClient(t, srv)
	ssoLogin(t, c2, m)
	if decode[store.User](t, c2.do("GET", "/api/auth/me", nil)).ID != me.ID {
		t.Fatal("a second login made a new account")
	}
}

func TestSSOLinksTheAccountWithThatEmail(t *testing.T) {
	m := fakeMapApp(t, map[string]any{"sub": "u-1", "email": "admin@example.se", "emailVerified": true})
	srv := newTestServer(t, withSSO(m))
	signupAdmin(t, srv)
	c := newClient(t, srv)
	ssoLogin(t, c, m)
	me := decode[store.User](t, c.do("GET", "/api/auth/me", nil))
	if !me.HasSSO || !me.HasPassword || !me.IsAdmin {
		t.Fatalf("not linked: %+v", me)
	}
}

func TestSSOAdminEmailBecomesAdmin(t *testing.T) {
	m := fakeMapApp(t, map[string]any{"sub": "u-1", "email": "admin@example.se", "emailVerified": true})
	srv := newTestServer(t, withSSO(m))
	c := newClient(t, srv)
	ssoLogin(t, c, m)
	if !decode[store.User](t, c.do("GET", "/api/auth/me", nil)).IsAdmin {
		t.Fatal("the admin's email did not give the admin")
	}
}

func TestSSORejectsUnverifiedEmail(t *testing.T) {
	m := fakeMapApp(t, map[string]any{"sub": "u-1", "email": "admin@example.se", "emailVerified": false})
	srv := newTestServer(t, withSSO(m))
	c := newClient(t, srv)
	if dest := ssoLogin(t, c, m); dest != "/login?error=sso_failed" {
		t.Fatalf("ended up at %q", dest)
	}
	expect(t, c.do("GET", "/api/auth/me", nil), 401)
}

func TestSSOCallbackChecksState(t *testing.T) {
	m := fakeMapApp(t, map[string]any{"sub": "u-1", "email": "admin@example.se", "emailVerified": true})
	srv := newTestServer(t, withSSO(m))
	c := newClient(t, srv)
	expect(t, c.do("GET", "/api/auth/sso/start", nil), 302)
	rec := c.do("GET", "/api/auth/sso/callback?code=good-code&state=forged", nil)
	expect(t, rec, 302)
	if rec.Header().Get("Location") != "/login?error=sso_failed" {
		t.Fatalf("forged state accepted: %q", rec.Header().Get("Location"))
	}
	expect(t, c.do("GET", "/api/auth/me", nil), 401)
}

func TestSSOBadCodeFails(t *testing.T) {
	m := fakeMapApp(t, map[string]any{"sub": "u-1", "email": "admin@example.se", "emailVerified": true})
	srv := newTestServer(t, withSSO(m))
	c := newClient(t, srv)
	rec := c.do("GET", "/api/auth/sso/start", nil)
	loc, _ := url.Parse(rec.Header().Get("Location"))
	rec = c.do("GET", "/api/auth/sso/callback?code=stale&state="+url.QueryEscape(loc.Query().Get("state")), nil)
	if rec.Header().Get("Location") != "/login?error=sso_failed" {
		t.Fatalf("ended up at %q", rec.Header().Get("Location"))
	}
}

func TestSSODisabled(t *testing.T) {
	srv := newTestServer(t)
	c := newClient(t, srv)
	if decode[map[string]bool](t, c.do("GET", "/api/auth/config", nil))["sso"] {
		t.Fatal("SSO reported as enabled")
	}
	expect(t, c.do("GET", "/api/auth/sso/start", nil), 404)
}

func TestSSOEnabledInConfig(t *testing.T) {
	m := fakeMapApp(t, map[string]any{})
	c := newClient(t, newTestServer(t, withSSO(m)))
	if !decode[map[string]bool](t, c.do("GET", "/api/auth/config", nil))["sso"] {
		t.Fatal("SSO not reported")
	}
}

// The server may reach the map app by an internal address (a cluster service) the browser cannot: the browser goes to the public one.
func TestSSOBrowserGoesToThePublicAddress(t *testing.T) {
	m := fakeMapApp(t, map[string]any{"sub": "u-1", "email": "admin@example.se", "emailVerified": true})
	srv := newTestServer(t, withSSO(m), func(c *Config) { c.SSOPublicURL = "https://karta.example.se" })
	c := newClient(t, srv)
	rec := c.do("GET", "/api/auth/sso/start", nil)
	expect(t, rec, 302)
	if loc := rec.Header().Get("Location"); !strings.HasPrefix(loc, "https://karta.example.se/sso/authorize?") {
		t.Fatalf("redirect %q", loc)
	}
	// the code is still traded at the internal address
	loc, _ := url.Parse(rec.Header().Get("Location"))
	rec = c.do("GET", "/api/auth/sso/callback?code=good-code&state="+url.QueryEscape(loc.Query().Get("state")), nil)
	if rec.Header().Get("Location") != "/" {
		t.Fatalf("ended up at %q", rec.Header().Get("Location"))
	}
}
