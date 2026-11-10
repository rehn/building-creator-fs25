package api

import (
	"strings"
	"testing"

	"building-creator-fs25/backend/internal/store"
)

func partBody(name string) map[string]any {
	return map[string]any{
		"name": name,
		"info": map[string]any{"parts": 2, "windows": 3},
		"data": map[string]any{"format": "building-creator-fs25-part", "version": 1, "name": name, "parts": []any{map[string]any{"id": 1}}, "windows": []any{}, "items": []any{}},
	}
}

func TestPartLifecycleAPI(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)

	rec := c.do("POST", "/api/parts", partBody("Pumphus"))
	expect(t, rec, 201)
	p := decode[store.Part](t, rec)
	if p.Name != "Pumphus" || !p.Mine || p.Shared || !strings.Contains(string(p.Info), `"parts":2`) {
		t.Fatalf("created: %+v", p)
	}
	list := decode[[]store.Part](t, c.do("GET", "/api/parts", nil))
	if len(list) != 1 || len(list[0].Data) != 0 {
		t.Fatalf("list without the files: %+v", list)
	}
	got := decode[store.Part](t, c.do("GET", "/api/parts/"+p.ID, nil))
	if !strings.Contains(string(got.Data), `"building-creator-fs25-part"`) {
		t.Fatalf("one with its file: %s", got.Data)
	}
	rec = c.do("PATCH", "/api/parts/"+p.ID, map[string]any{"name": "Pumphus med bod"})
	expect(t, rec, 200)
	if q := decode[store.Part](t, rec); q.Name != "Pumphus med bod" {
		t.Fatalf("renamed: %+v", q)
	}
	expect(t, c.do("DELETE", "/api/parts/"+p.ID, nil), 204)
	expectError(t, c.do("GET", "/api/parts/"+p.ID, nil), 404, "not_found")
	expectError(t, c.do("DELETE", "/api/parts/"+p.ID, nil), 404, "not_found")
}

func TestPartValidation(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)
	b := partBody("x")
	b["name"] = strings.Repeat("x", 101)
	expectError(t, c.do("POST", "/api/parts", b), 400, "invalid_name")
	b = partBody("x")
	b["name"] = "  "
	expectError(t, c.do("POST", "/api/parts", b), 400, "invalid_name")
	b = partBody("x")
	b["data"] = map[string]any{"format": "something else"}
	expectError(t, c.do("POST", "/api/parts", b), 400, "invalid_part")
	b = partBody("x")
	b["data"] = []any{1, 2}
	expectError(t, c.do("POST", "/api/parts", b), 400, "invalid_part")
	b = partBody("x")
	delete(b, "data")
	expectError(t, c.do("POST", "/api/parts", b), 400, "invalid_part")
	b = partBody("x")
	b["info"] = []any{1}
	expectError(t, c.do("POST", "/api/parts", b), 400, "invalid_info")
	b = partBody("x")
	b["data"].(map[string]any)["junk"] = strings.Repeat("x", maxPartBytes)
	if rec := c.do("POST", "/api/parts", b); rec.Code != 413 && rec.Code != 400 {
		t.Fatalf("an oversized part is accepted: %d", rec.Code)
	}
	expectError(t, newClient(t, srv).do("GET", "/api/parts", nil), 401, "unauthorized")
}

func TestPartsPrivateAndShared(t *testing.T) {
	srv := newTestServer(t)
	admin := signupAdmin(t, srv)
	friend := signupFriend(t, srv, admin, "friend@example.se")

	a := decode[store.Part](t, admin.do("POST", "/api/parts", partBody("Admin's")))
	if l := decode[[]store.Part](t, friend.do("GET", "/api/parts", nil)); len(l) != 0 {
		t.Fatal("a private part is listed for another user")
	}
	expectError(t, friend.do("GET", "/api/parts/"+a.ID, nil), 404, "not_found")
	expectError(t, friend.do("PATCH", "/api/parts/"+a.ID, map[string]any{"name": "Mine"}), 404, "not_found")
	expectError(t, friend.do("DELETE", "/api/parts/"+a.ID, nil), 404, "not_found")

	// only the admin shares
	expect(t, admin.do("PATCH", "/api/parts/"+a.ID, map[string]any{"shared": true}), 200)
	l := decode[[]store.Part](t, friend.do("GET", "/api/parts", nil))
	if len(l) != 1 || !l[0].Shared || l[0].Mine {
		t.Fatalf("shared, not theirs: %+v", l)
	}
	expect(t, friend.do("GET", "/api/parts/"+a.ID, nil), 200)
	expectError(t, friend.do("PATCH", "/api/parts/"+a.ID, map[string]any{"name": "Mine"}), 404, "not_found")
	b := partBody("Friend's")
	b["shared"] = true
	expectError(t, friend.do("POST", "/api/parts", b), 403, "forbidden")
	own := decode[store.Part](t, friend.do("POST", "/api/parts", partBody("Friend's")))
	expectError(t, friend.do("PATCH", "/api/parts/"+own.ID, map[string]any{"shared": true}), 403, "forbidden")
	// the admin can save one shared in one go, and stop sharing
	b = partBody("Admin's second")
	b["shared"] = true
	if s := decode[store.Part](t, admin.do("POST", "/api/parts", b)); !s.Shared {
		t.Fatalf("saved shared: %+v", s)
	}
	expect(t, admin.do("PATCH", "/api/parts/"+a.ID, map[string]any{"shared": false}), 200)
	expectError(t, friend.do("GET", "/api/parts/"+a.ID, nil), 404, "not_found")
}
