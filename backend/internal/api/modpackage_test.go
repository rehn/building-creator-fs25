package api

import (
	"bytes"
	"fmt"
	"net/http/httptest"
	"testing"

	"building-creator-fs25/backend/internal/store"
)

func putPackage(c *client, id string, version int64, body []byte) *httptest.ResponseRecorder {
	req := httptest.NewRequest("PUT", fmt.Sprintf("/api/mods/%s/package?version=%d", id, version), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/zip")
	req.Header.Set("Origin", origin)
	return c.send(req)
}

// The browser makes the zip of a whole mod and sends it with the version of the mod it is made from; a program with a token fetches it.
func TestModPackageAPI(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)
	friend := signupFriend(t, srv, c, "friend@example.se")
	tok := decode[tokenReply](t, c.do("POST", "/api/tokens", map[string]any{"name": "Kartan"})).Token
	m := decode[store.Mod](t, c.do("POST", "/api/mods", map[string]any{"name": "Stora gården"}))

	// none yet: the mod says so, the file is not there
	type pkg struct {
		Package *struct {
			Version  int64  `json:"version"`
			UpToDate bool   `json:"upToDate"`
			Zip      string `json:"zip"`
		} `json:"package"`
	}
	if got := decode[pkg](t, bearer(t, srv, tok, "/api/v1/mods/"+m.ID)); got.Package != nil {
		t.Fatalf("no package yet: %+v", got.Package)
	}
	expectError(t, bearer(t, srv, tok, "/api/v1/mods/"+m.ID+"/mod.zip"), 404, "not_found")

	// what is sent must be a zip with a modDesc.xml, safe names, and made from the mod's current version
	expectError(t, putPackage(c, m.ID, m.Version, []byte("not a zip")), 400, "invalid_package")
	expectError(t, putPackage(c, m.ID, m.Version, modZip(t, "house.xml")), 400, "invalid_package")
	expectError(t, putPackage(c, m.ID, m.Version, modZip(t, "modDesc.xml", "../evil")), 400, "invalid_package")
	expectError(t, putPackage(c, m.ID, 0, modZip(t, "modDesc.xml")), 400, "invalid_version")
	expectError(t, putPackage(friend, m.ID, m.Version, modZip(t, "modDesc.xml")), 404, "not_found")
	expectError(t, putPackage(c, m.ID, m.Version+5, modZip(t, "modDesc.xml")), 409, "version_conflict")

	zipData := modZip(t, "modDesc.xml", "placeable.xml", "mod.i3d")
	expect(t, putPackage(c, m.ID, m.Version, zipData), 204)

	got := decode[pkg](t, bearer(t, srv, tok, "/api/v1/mods/"+m.ID))
	if got.Package == nil || got.Package.Version != m.Version || !got.Package.UpToDate || got.Package.Zip != "/api/v1/mods/"+m.ID+"/mod.zip" {
		t.Fatalf("the mod tells where the package is: %+v", got.Package)
	}
	rec := bearer(t, srv, tok, "/api/v1/mods/"+m.ID+"/mod.zip")
	expect(t, rec, 200)
	if !bytes.Equal(rec.Body.Bytes(), zipData) || rec.Header().Get("Content-Type") != "application/zip" || rec.Header().Get("ETag") == "" {
		t.Fatalf("the zip is served as it was sent: %q %v", rec.Header().Get("Content-Type"), rec.Header())
	}
	if rec.Header().Get("Content-Disposition") != `inline; filename="FS25_StoraGarden.zip"` {
		t.Fatalf("the file is named after the mod: %s", rec.Header().Get("Content-Disposition"))
	}
	again := httptest.NewRequest("GET", "/api/v1/mods/"+m.ID+"/mod.zip", nil)
	again.Header.Set("Authorization", "Bearer "+tok)
	again.Header.Set("If-None-Match", rec.Header().Get("ETag"))
	expect(t, newClient(t, srv).send(again), 304)

	// the mod is saved again: the package is still served, but says it is from an older version of the mod
	expect(t, c.do("PATCH", "/api/mods/"+m.ID, map[string]any{"version": m.Version, "data": map[string]any{"a": 1}}), 200)
	if got := decode[pkg](t, bearer(t, srv, tok, "/api/v1/mods/"+m.ID)); got.Package == nil || got.Package.UpToDate || got.Package.Version != m.Version {
		t.Fatalf("out of date: %+v", got.Package)
	}
	expect(t, bearer(t, srv, tok, "/api/v1/mods/"+m.ID+"/mod.zip"), 200)
	// someone else's token does not reach it
	ftok := decode[tokenReply](t, friend.do("POST", "/api/tokens", map[string]any{"name": "x"})).Token
	expectError(t, bearer(t, srv, ftok, "/api/v1/mods/"+m.ID+"/mod.zip"), 404, "not_found")
}
