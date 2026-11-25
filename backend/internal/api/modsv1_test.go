package api

import (
	"strings"
	"testing"

	"building-creator-fs25/backend/internal/store"
)

type v1Mod struct {
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	Version   int64           `json:"version"`
	ItemCount int             `json:"itemCount"`
	Items     []store.ModItem `json:"items"`
	Data      map[string]any  `json:"data"`
}

// A program with a token reads the user's mods (the list without items and plan, one with both), and only its own user's.
func TestModsV1(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)
	tok := decode[tokenReply](t, c.do("POST", "/api/tokens", map[string]any{"name": "Kartan"}))
	house := decode[store.Project](t, c.do("POST", "/api/projects", map[string]any{"name": "Huset"}))
	m := decode[store.Mod](t, c.do("POST", "/api/mods", map[string]any{"name": "Gården"}))
	expect(t, c.do("PATCH", "/api/mods/"+m.ID, map[string]any{"version": 1, "data": map[string]any{"objects": []any{}},
		"items": []map[string]any{{"id": "a", "kind": "building", "ref": house.ID, "type": "", "x": 1, "z": 2}}}), 200)

	expectError(t, bearer(t, srv, "", "/api/v1/mods"), 401, "unauthorized")
	list := decode[struct{ Mods []v1Mod }](t, bearer(t, srv, tok.Token, "/api/v1/mods"))
	if len(list.Mods) != 1 || list.Mods[0].Name != "Gården" || list.Mods[0].ItemCount != 1 || len(list.Mods[0].Items) != 0 {
		t.Fatalf("list: %+v", list)
	}
	got := decode[v1Mod](t, bearer(t, srv, tok.Token, "/api/v1/mods/"+m.ID))
	if got.ID != m.ID || len(got.Items) != 1 || got.Items[0].Ref != house.ID || got.Items[0].Name != "Huset" || got.Data["objects"] == nil {
		t.Fatalf("one: %+v", got)
	}
	expectError(t, bearer(t, srv, tok.Token, "/api/v1/mods/nope"), 404, "not_found")
	if !strings.Contains(bearer(t, srv, tok.Token, "/api/v1/mods/"+m.ID).Body.String(), "/api/v1/buildings/"+house.ID) {
		t.Fatalf("an item says where its building is")
	}
}
