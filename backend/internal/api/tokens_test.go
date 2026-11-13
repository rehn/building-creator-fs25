package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type tokenReply struct {
	ID     string
	Name   string
	Prefix string
	Token  string
}

// bearer sends a GET with the token and no session.
func bearer(t *testing.T, srv *Server, token, path string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest("GET", path, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return newClient(t, srv).send(req)
}

const tinyPNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

func TestTokenLifecycleAPI(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)

	rec := c.do("POST", "/api/tokens", map[string]any{"name": "Min renderare"})
	expect(t, rec, 201)
	tok := decode[tokenReply](t, rec)
	if !strings.HasPrefix(tok.Token, "bc_") || tok.Name != "Min renderare" || !strings.HasPrefix(tok.Token, tok.Prefix) || tok.Prefix == tok.Token {
		t.Fatalf("created: %+v", tok)
	}
	list := decode[[]tokenReply](t, c.do("GET", "/api/tokens", nil))
	if len(list) != 1 || list[0].ID != tok.ID || list[0].Token != "" {
		t.Fatalf("the list never shows the token itself: %+v", list)
	}
	expectError(t, c.do("POST", "/api/tokens", map[string]any{"name": " "}), 400, "invalid_name")
	expectError(t, newClient(t, srv).do("GET", "/api/tokens", nil), 401, "unauthorized")

	// A token is not a login: it opens only /api/v1.
	if rec := bearer(t, srv, tok.Token, "/api/tokens"); rec.Code != 401 {
		t.Fatalf("token on a session route: %d", rec.Code)
	}
	expect(t, bearer(t, srv, tok.Token, "/api/v1/buildings"), 200)

	expect(t, c.do("DELETE", "/api/tokens/"+tok.ID, nil), 204)
	expectError(t, c.do("DELETE", "/api/tokens/"+tok.ID, nil), 404, "not_found")
	expectError(t, bearer(t, srv, tok.Token, "/api/v1/buildings"), 401, "unauthorized")
}

func TestTokenLimit(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)
	for i := 0; i < maxTokens; i++ {
		expect(t, c.do("POST", "/api/tokens", map[string]any{"name": "t"}), 201)
	}
	expectError(t, c.do("POST", "/api/tokens", map[string]any{"name": "t"}), 400, "too_many_tokens")
}

func TestBuildingsAPI(t *testing.T) {
	srv := newTestServer(t)
	admin := signupAdmin(t, srv)
	friend := signupFriend(t, srv, admin, "friend@example.se")

	mine := decode[struct{ ID string }](t, admin.do("POST", "/api/projects", map[string]any{
		"name": "Stugan", "data": map[string]any{"kind": "chicken", "width": 6}, "thumbnail": tinyPNG}))
	bare := decode[struct{ ID string }](t, admin.do("POST", "/api/projects", map[string]any{"name": "Utan bild"}))
	theirs := decode[struct{ ID string }](t, friend.do("POST", "/api/projects", map[string]any{"name": "Annans"}))

	tok := decode[tokenReply](t, admin.do("POST", "/api/tokens", map[string]any{"name": "x"})).Token

	type building struct {
		ID, Name, Kind, Icon string
		Settings             map[string]any
		I3d, Obj             string
	}
	list := decode[struct{ Buildings []building }](t, bearer(t, srv, tok, "/api/v1/buildings")).Buildings
	if len(list) != 2 {
		t.Fatalf("only my buildings: %+v", list)
	}
	by := map[string]building{}
	for _, b := range list {
		by[b.ID] = b
	}
	b := by[mine.ID]
	if b.Name != "Stugan" || b.Kind != "chicken" || b.Icon != "/api/v1/buildings/"+mine.ID+"/icon" || b.I3d == "" || b.Obj == "" || b.Settings != nil {
		t.Fatalf("listed: %+v", b)
	}
	if by[bare.ID].Kind != "house" || by[bare.ID].Icon != "" {
		t.Fatalf("a house without a picture: %+v", by[bare.ID])
	}

	one := decode[building](t, bearer(t, srv, tok, "/api/v1/buildings/"+mine.ID))
	if one.Settings["width"] != float64(6) || one.Name != "Stugan" {
		t.Fatalf("one with its settings: %+v", one)
	}
	expectError(t, bearer(t, srv, tok, "/api/v1/buildings/"+theirs.ID), 404, "not_found")

	img := bearer(t, srv, tok, "/api/v1/buildings/"+mine.ID+"/icon")
	expect(t, img, 200)
	if img.Header().Get("Content-Type") != "image/png" || !strings.HasPrefix(img.Body.String(), "\x89PNG") {
		t.Fatalf("icon: %q %q", img.Header().Get("Content-Type"), img.Body.String())
	}
	expectError(t, bearer(t, srv, tok, "/api/v1/buildings/"+bare.ID+"/icon"), 404, "not_found")

	// Wrong or missing tokens; a session cookie is no substitute.
	expectError(t, bearer(t, srv, "", "/api/v1/buildings"), 401, "unauthorized")
	expectError(t, bearer(t, srv, "bc_wrong", "/api/v1/buildings"), 401, "unauthorized")
	expectError(t, admin.do("GET", "/api/v1/buildings", nil), 401, "unauthorized")
}

func TestV1AllowsOtherSites(t *testing.T) {
	srv := newTestServer(t)
	req := httptest.NewRequest(http.MethodOptions, "/api/v1/buildings", nil)
	req.Header.Set("Origin", "https://other.example")
	req.Header.Set("Access-Control-Request-Method", "GET")
	req.Header.Set("Access-Control-Request-Headers", "authorization")
	rec := newClient(t, srv).send(req)
	if rec.Code != 204 || rec.Header().Get("Access-Control-Allow-Origin") != "*" || !strings.Contains(strings.ToLower(rec.Header().Get("Access-Control-Allow-Headers")), "authorization") {
		t.Fatalf("preflight: %d %v", rec.Code, rec.Header())
	}
	rec = newClient(t, srv).send(httptest.NewRequest("GET", "/api/v1/buildings", nil))
	if rec.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("errors carry it too: %v", rec.Header())
	}
	// ... but the app's own routes do not.
	rec = newClient(t, srv).send(httptest.NewRequest("GET", "/api/projects", nil))
	if rec.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatalf("session routes must stay closed to other sites")
	}
}
