package api

import (
	"strings"
	"testing"

	"building-creator-fs25/backend/internal/store"
)

type folderInfo struct {
	Name      string `json:"name"`
	Buildings int    `json:"buildings"`
	Mods      int    `json:"mods"`
}

// The app's folders: made on their own, used by a mod as by a building, listed together.
func TestGlobalFoldersAPI(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)
	tok := decode[tokenReply](t, c.do("POST", "/api/tokens", map[string]any{"name": "Kartan"})).Token

	expectError(t, c.do("POST", "/api/folders", map[string]any{"name": "   "}), 400, "invalid_folder")
	expect(t, c.do("POST", "/api/folders", map[string]any{"name": "Gården"}), 201)
	expect(t, c.do("POST", "/api/folders", map[string]any{"name": "Gården"}), 200)

	house := decode[store.Project](t, c.do("POST", "/api/projects", map[string]any{"name": "Huset"}))
	expect(t, c.do("PATCH", "/api/projects/"+house.ID, map[string]any{"folder": "Hallsberg"}), 200)
	m := decode[store.Mod](t, c.do("POST", "/api/mods", map[string]any{"name": "Stora gården"}))
	expectError(t, c.do("PATCH", "/api/mods/"+m.ID, map[string]any{"folder": strings.Repeat("a", 90), "version": m.Version}), 400, "invalid_folder")
	moved := decode[store.Mod](t, c.do("PATCH", "/api/mods/"+m.ID, map[string]any{"folder": "Hallsberg", "version": m.Version}))
	if moved.Folder != "Hallsberg" || moved.Version != m.Version {
		t.Fatalf("a move is not a change of the mod: %+v", moved)
	}

	list := decode[struct{ Folders []folderInfo }](t, c.do("GET", "/api/folders", nil)).Folders
	if len(list) != 2 || list[0] != (folderInfo{Name: "Gården"}) || list[1] != (folderInfo{Name: "Hallsberg", Buildings: 1, Mods: 1}) {
		t.Fatalf("folders: %+v", list)
	}
	// the programs see the folder of a mod; their own folder list is of buildings
	got := decode[struct{ Folder string }](t, bearer(t, srv, tok, "/api/v1/mods/"+m.ID))
	if got.Folder != "Hallsberg" {
		t.Fatalf("v1 mod: %+v", got)
	}
	v1 := decode[struct{ Folders []folderInfo }](t, bearer(t, srv, tok, "/api/v1/folders")).Folders
	if len(v1) != 1 || v1[0].Name != "Hallsberg" {
		t.Fatalf("v1 folders: %+v", v1)
	}
	expect(t, c.do("PATCH", "/api/mods/"+m.ID, map[string]any{"folder": "", "version": m.Version}), 200)
	if g := decode[store.Mod](t, c.do("GET", "/api/mods/"+m.ID, nil)); g.Folder != "" {
		t.Fatalf("taken out: %+v", g)
	}
}
