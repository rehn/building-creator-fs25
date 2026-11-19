package api

import "testing"

type meReply struct {
	TokenName  string
	Write      bool
	AppVersion string
}

func TestMeSaysWhatTheTokenMayDo(t *testing.T) {
	srv := newTestServer(t, func(c *Config) { c.Version = "1.2.3" })
	c := signupAdmin(t, srv)
	read, write := makeToken(t, c, "Läsare", false), makeToken(t, c, "Kartan", true)

	r := decode[meReply](t, tokenCall(t, srv, read, "GET", "/api/v1/me", nil))
	if r.TokenName != "Läsare" || r.Write || r.AppVersion != "1.2.3" {
		t.Fatalf("read token: %+v", r)
	}
	w := decode[meReply](t, tokenCall(t, srv, write, "GET", "/api/v1/me", nil))
	if w.TokenName != "Kartan" || !w.Write {
		t.Fatalf("write token: %+v", w)
	}
	expectError(t, tokenCall(t, srv, "", "GET", "/api/v1/me", nil), 401, "unauthorized")
	expectError(t, tokenCall(t, srv, "bc_nope", "GET", "/api/v1/me", nil), 401, "unauthorized")
	// the session of the app is not a token
	expectError(t, c.do("GET", "/api/v1/me", nil), 401, "unauthorized")
}

func TestMeShowsATokenThatWasDeletedAsGone(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)
	tok := decode[tokenReply](t, c.do("POST", "/api/tokens", map[string]any{"name": "Kartan", "write": true}))
	expect(t, tokenCall(t, srv, tok.Token, "GET", "/api/v1/me", nil), 200)
	expect(t, c.do("DELETE", "/api/tokens/"+tok.ID, nil), 204)
	expectError(t, tokenCall(t, srv, tok.Token, "GET", "/api/v1/me", nil), 401, "unauthorized")
}
