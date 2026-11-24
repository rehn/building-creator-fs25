package api

import (
	"strings"
	"testing"

	"building-creator-fs25/backend/internal/store"
)

func TestModLifecycleAPI(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)
	house := decode[store.Project](t, c.do("POST", "/api/projects", map[string]any{"name": "Huset"}))

	rec := c.do("POST", "/api/mods", map[string]any{"name": "Gården"})
	expect(t, rec, 201)
	m := decode[store.Mod](t, rec)
	if m.Name != "Gården" || m.Version != 1 || len(m.Items) != 0 {
		t.Fatalf("created: %+v", m)
	}

	rec = c.do("PATCH", "/api/mods/"+m.ID, map[string]any{
		"version": 1,
		"data":    map[string]any{"objects": []any{}},
		"items": []map[string]any{
			{"id": "a", "kind": "building", "ref": house.ID, "type": "shop", "x": 2.5, "z": -1, "rot": 90, "y": 6},
		},
	})
	expect(t, rec, 200)
	m = decode[store.Mod](t, rec)
	if m.Version != 2 || len(m.Items) != 1 || m.Items[0].Name != "Huset" || m.Items[0].Type != "shop" || m.Items[0].X != 2.5 || m.Items[0].Y != 6 {
		t.Fatalf("updated: %+v", m)
	}

	got := decode[store.Mod](t, c.do("GET", "/api/mods/"+m.ID, nil))
	if len(got.Items) != 1 || !strings.Contains(string(got.Data), `"objects"`) {
		t.Fatalf("one with its plan and items: %+v", got)
	}
	list := decode[[]store.Mod](t, c.do("GET", "/api/mods", nil))
	if len(list) != 1 || list[0].ItemCount != 1 || len(list[0].Items) != 0 || len(list[0].Data) != 0 {
		t.Fatalf("list without plans: %+v", list)
	}

	// an old version is refused, with the current one
	rec = c.do("PATCH", "/api/mods/"+m.ID, map[string]any{"name": "Annat", "version": 1})
	expectError(t, rec, 409, "version_conflict")

	// a new name alone leaves the items
	rec = c.do("PATCH", "/api/mods/"+m.ID, map[string]any{"name": "Annat"})
	expect(t, rec, 200)
	if q := decode[store.Mod](t, rec); q.Name != "Annat" || len(q.Items) != 1 {
		t.Fatalf("renamed: %+v", q)
	}

	expect(t, c.do("DELETE", "/api/mods/"+m.ID, nil), 204)
	expectError(t, c.do("GET", "/api/mods/"+m.ID, nil), 404, "not_found")
	expectError(t, c.do("DELETE", "/api/mods/"+m.ID, nil), 404, "not_found")
	expect(t, c.do("GET", "/api/projects/"+house.ID, nil), 200) // (the building stays)
}

func TestModCreateWithItems(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)
	house := decode[store.Project](t, c.do("POST", "/api/projects", map[string]any{"name": "Huset"}))
	rec := c.do("POST", "/api/mods", map[string]any{"name": "Med hus", "items": []map[string]any{{"kind": "building", "ref": house.ID}}})
	expect(t, rec, 201)
	if m := decode[store.Mod](t, rec); len(m.Items) != 1 || m.Items[0].ID == "" {
		t.Fatalf("an item without an id gets one: %+v", m)
	}
	// a bad reference makes no mod
	expectError(t, c.do("POST", "/api/mods", map[string]any{"name": "Fel", "items": []map[string]any{{"kind": "building", "ref": "finns-inte"}}}), 400, "invalid_ref")
	if list := decode[[]store.Mod](t, c.do("GET", "/api/mods", nil)); len(list) != 1 {
		t.Fatalf("only the first mod: %+v", list)
	}
}

func TestModValidation(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)
	m := decode[store.Mod](t, c.do("POST", "/api/mods", map[string]any{"name": "M"}))
	expectError(t, c.do("POST", "/api/mods", map[string]any{"name": strings.Repeat("x", 101)}), 400, "invalid_name")
	expectError(t, c.do("POST", "/api/mods", map[string]any{"name": "  "}), 400, "invalid_name")
	expectError(t, c.do("PATCH", "/api/mods/"+m.ID, map[string]any{"data": []any{1}}), 400, "invalid_data")
	for name, it := range map[string]map[string]any{
		"unknown kind": {"kind": "tree", "ref": "x"},
		"no ref":       {"kind": "building", "ref": ""},
		"far away":     {"kind": "prop", "ref": "x", "x": 1e9},
		"too high":     {"kind": "prop", "ref": "x", "y": 1e9},
		"long type":    {"kind": "building", "ref": "x", "type": strings.Repeat("t", 41)},
	} {
		rec := c.do("PATCH", "/api/mods/"+m.ID, map[string]any{"items": []map[string]any{it}})
		if rec.Code != 400 {
			t.Fatalf("%s: %d %s", name, rec.Code, rec.Body)
		}
	}
	many := make([]map[string]any, maxModItems+1)
	for i := range many {
		many[i] = map[string]any{"kind": "building", "ref": "x"}
	}
	expectError(t, c.do("PATCH", "/api/mods/"+m.ID, map[string]any{"items": many}), 400, "too_many_items")
	expectError(t, c.do("PATCH", "/api/mods/nope", map[string]any{"name": "x"}), 404, "not_found")
}

func TestModsNeedLoginAndArePrivate(t *testing.T) {
	srv := newTestServer(t)
	admin := signupAdmin(t, srv)
	friend := signupFriend(t, srv, admin, "friend@example.se")
	house := decode[store.Project](t, admin.do("POST", "/api/projects", map[string]any{"name": "Huset"}))
	m := decode[store.Mod](t, admin.do("POST", "/api/mods", map[string]any{"name": "Admins"}))

	anon := newClient(t, srv)
	expectError(t, anon.do("GET", "/api/mods", nil), 401, "unauthorized")
	expectError(t, anon.do("POST", "/api/mods", map[string]any{"name": "x"}), 401, "unauthorized")

	if l := decode[[]store.Mod](t, friend.do("GET", "/api/mods", nil)); len(l) != 0 {
		t.Fatal("a mod is listed for another user")
	}
	expectError(t, friend.do("GET", "/api/mods/"+m.ID, nil), 404, "not_found")
	expectError(t, friend.do("PATCH", "/api/mods/"+m.ID, map[string]any{"name": "Mine"}), 404, "not_found")
	expectError(t, friend.do("DELETE", "/api/mods/"+m.ID, nil), 404, "not_found")
	// and the friend's mod can't hold the admin's building
	own := decode[store.Mod](t, friend.do("POST", "/api/mods", map[string]any{"name": "Friend's"}))
	expectError(t, friend.do("PATCH", "/api/mods/"+own.ID, map[string]any{"items": []map[string]any{{"kind": "building", "ref": house.ID}}}), 400, "invalid_ref")
}
