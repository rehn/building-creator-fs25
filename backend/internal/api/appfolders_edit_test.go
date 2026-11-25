package api

import (
	"testing"

	"building-creator-fs25/backend/internal/store"
)

// A folder is renamed and deleted in the app; deleting it takes what is in it out of it and deletes none of that.
func TestRenameAndDeleteFolderAPI(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)
	house := decode[store.Project](t, c.do("POST", "/api/projects", map[string]any{"name": "Huset"}))
	expect(t, c.do("PATCH", "/api/projects/"+house.ID, map[string]any{"folder": "Gården"}), 200)
	m := decode[store.Mod](t, c.do("POST", "/api/mods", map[string]any{"name": "Mod"}))
	expect(t, c.do("PATCH", "/api/mods/"+m.ID, map[string]any{"folder": "Gården", "version": m.Version}), 200)
	expect(t, c.do("POST", "/api/folders", map[string]any{"name": "Tom"}), 201)

	expectError(t, c.do("POST", "/api/folders/rename", map[string]any{"from": "Gården", "to": "Gården"}), 400, "invalid_folder")
	expectError(t, c.do("POST", "/api/folders/rename", map[string]any{"from": "Finns inte", "to": "Ny"}), 404, "not_found")
	expectError(t, c.do("POST", "/api/folders/rename", map[string]any{"from": "Tom", "to": "Gården"}), 409, "folder_exists")
	renamed := decode[struct{ Name string }](t, c.do("POST", "/api/folders/rename", map[string]any{"from": "Gården", "to": "Stora gården"}))
	if renamed.Name != "Stora gården" {
		t.Fatalf("renamed: %+v", renamed)
	}
	if g := decode[store.Mod](t, c.do("GET", "/api/mods/"+m.ID, nil)); g.Folder != "Stora gården" {
		t.Fatalf("the mod followed: %+v", g)
	}

	expectError(t, c.do("DELETE", "/api/folders?name=Finns+inte", nil), 404, "not_found")
	expectError(t, c.do("DELETE", "/api/folders", nil), 400, "invalid_folder")
	expect(t, c.do("DELETE", "/api/folders?name=Stora+g%C3%A5rden", nil), 204)
	if g := decode[store.Mod](t, c.do("GET", "/api/mods/"+m.ID, nil)); g.Folder != "" {
		t.Fatalf("the mod is out of it, and still there: %+v", g)
	}
	if p := decode[store.Project](t, c.do("GET", "/api/projects/"+house.ID, nil)); p.Folder != "" || p.Name != "Huset" {
		t.Fatalf("the building too: %+v", p)
	}
	list := decode[struct{ Folders []folderInfo }](t, c.do("GET", "/api/folders", nil)).Folders
	if len(list) != 1 || list[0].Name != "Tom" {
		t.Fatalf("what is left: %+v", list)
	}
}
