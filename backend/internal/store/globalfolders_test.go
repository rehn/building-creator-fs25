package store

import (
	"encoding/json"
	"errors"
	"testing"
)

// Folders are the app's own: a building, a prop and a mod can all be in one, and one can be made before anything is in it.
func TestGlobalFolders(t *testing.T) {
	s := openTest(t)
	u := mustUser(t, s, "anna@example.se")
	other := mustUser(t, s, "bo@example.se")

	if err := s.CreateFolder(ctx, u.ID, "Gården"); err != nil {
		t.Fatal(err)
	}
	if err := s.CreateFolder(ctx, u.ID, "Gården"); err != nil {
		t.Fatalf("making it again is fine: %v", err)
	}
	house, _ := s.CreateProject(ctx, u.ID, "Huset", json.RawMessage(`{}`))
	folder := "Hallsberg"
	if _, err := s.UpdateProject(ctx, u.ID, house.ID, ProjectUpdate{Folder: &folder}, 0); err != nil {
		t.Fatal(err)
	}
	m, _ := s.CreateMod(ctx, u.ID, "Mod", nil)
	if m.Folder != "" {
		t.Fatalf("a new mod is in no folder: %+v", m)
	}
	// (a move alone is not a change of the mod: its version, and so the zip made from it, stay)
	if err := s.PutModPackage(ctx, u.ID, m.ID, m.Version, []byte("PK")); err != nil {
		t.Fatal(err)
	}
	got, err := s.UpdateMod(ctx, u.ID, m.ID, ModUpdate{Folder: &folder}, m.Version)
	if err != nil || got.Folder != folder || got.Version != m.Version {
		t.Fatalf("moved: %+v %v", got, err)
	}
	if v, _ := s.ModPackageVersion(ctx, u.ID, m.ID); v != got.Version {
		t.Fatalf("the zip is still of the mod as it is: %d", v)
	}
	if list, _ := s.ListMods(ctx, u.ID); len(list) != 1 || list[0].Folder != folder {
		t.Fatalf("the list says it: %+v", list)
	}

	all, err := s.AllFolders(ctx, u.ID)
	if err != nil || len(all) != 2 || all[0] != (FolderInfo{Name: "Gården"}) || all[1] != (FolderInfo{Name: "Hallsberg", Projects: 1, Mods: 1}) {
		t.Fatalf("all folders: %+v %v", all, err)
	}
	// the map program's list is of buildings only, as before
	if list, _ := s.ListFolders(ctx, u.ID); len(list) != 1 || list[0].Name != "Hallsberg" || list[0].Count != 1 {
		t.Fatalf("the buildings' folders: %+v", list)
	}
	if o, _ := s.AllFolders(ctx, other.ID); len(o) != 0 {
		t.Fatalf("someone else's: %+v", o)
	}

	// a folder that is left empty stays if it was made, goes if it only came from what was in it
	none := ""
	if _, err := s.UpdateMod(ctx, u.ID, m.ID, ModUpdate{Folder: &none}, 0); err != nil {
		t.Fatal(err)
	}
	if _, err := s.UpdateProject(ctx, u.ID, house.ID, ProjectUpdate{Folder: &none}, 0); err != nil {
		t.Fatal(err)
	}
	if all, _ = s.AllFolders(ctx, u.ID); len(all) != 1 || all[0].Name != "Gården" {
		t.Fatalf("after: %+v", all)
	}

	// a rename takes the mods and the made folder with it, and not into a folder that holds something
	to := "Gården"
	if _, err := s.UpdateMod(ctx, u.ID, m.ID, ModUpdate{Folder: &to}, 0); err != nil {
		t.Fatal(err)
	}
	if _, err := s.RenameFolder(ctx, u.ID, "Gården", "Stora gården"); err != nil {
		t.Fatal(err)
	}
	if g, _ := s.GetMod(ctx, u.ID, m.ID); g.Folder != "Stora gården" {
		t.Fatalf("the mod followed: %+v", g)
	}
	if err := s.CreateFolder(ctx, u.ID, "Tom"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.RenameFolder(ctx, u.ID, "Tom", "Stora gården"); !errors.Is(err, ErrConflict) {
		t.Fatalf("into a folder that holds a mod: %v", err)
	}
	if _, err := s.RenameFolder(ctx, u.ID, "Tom", "Ny"); err != nil {
		t.Fatalf("an empty made folder can be renamed: %v", err)
	}
	if all, _ = s.AllFolders(ctx, u.ID); len(all) != 2 || all[0].Name != "Ny" || all[1].Name != "Stora gården" {
		t.Fatalf("after the renames: %+v", all)
	}
}
