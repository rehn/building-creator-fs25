package store

import (
	"encoding/json"
	"errors"
	"testing"
)

// A folder is deleted without deleting what is in it: the buildings, props and mods stay, in no folder.
func TestDeleteFolder(t *testing.T) {
	s := openTest(t)
	u := mustUser(t, s, "anna@example.se")
	other := mustUser(t, s, "bo@example.se")
	house, _ := s.CreateProject(ctx, u.ID, "Huset", json.RawMessage(`{}`))
	folder := "Gården"
	if _, err := s.UpdateProject(ctx, u.ID, house.ID, ProjectUpdate{Folder: &folder}, 0); err != nil {
		t.Fatal(err)
	}
	m, _ := s.CreateMod(ctx, u.ID, "Mod", nil)
	if _, err := s.UpdateMod(ctx, u.ID, m.ID, ModUpdate{Folder: &folder}, 0); err != nil {
		t.Fatal(err)
	}
	if err := s.CreateFolder(ctx, u.ID, "Tom"); err != nil {
		t.Fatal(err)
	}
	if err := s.CreateFolder(ctx, other.ID, "Gården"); err != nil {
		t.Fatal(err)
	}
	before, _ := s.GetProject(ctx, u.ID, house.ID)

	if err := s.DeleteFolder(ctx, u.ID, "Finns inte"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("no such folder: %v", err)
	}
	if err := s.DeleteFolder(ctx, u.ID, "Tom"); err != nil {
		t.Fatalf("an empty made folder: %v", err)
	}
	if err := s.DeleteFolder(ctx, u.ID, folder); err != nil {
		t.Fatal(err)
	}
	after, err := s.GetProject(ctx, u.ID, house.ID)
	if err != nil || after.Folder != "" || after.Version != before.Version {
		t.Fatalf("the building stays, out of the folder, unchanged: %+v %v", after, err)
	}
	if g, err := s.GetMod(ctx, u.ID, m.ID); err != nil || g.Folder != "" {
		t.Fatalf("the mod stays: %+v %v", g, err)
	}
	if all, _ := s.AllFolders(ctx, u.ID); len(all) != 0 {
		t.Fatalf("no folders left: %+v", all)
	}
	if o, _ := s.AllFolders(ctx, other.ID); len(o) != 1 {
		t.Fatalf("a folder of the same name that is someone else's stays: %+v", o)
	}

	// buildings a map program made have source ids: two with the same one in no folder would clash, so it is refused
	a, _, err := s.UpsertGenerated(ctx, u.ID, "Karta", "way/1", "Ett", json.RawMessage(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	loose, _, err := s.UpsertGenerated(ctx, u.ID, "Annan", "way/1", "Ett", json.RawMessage(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	out := ""
	if _, err := s.UpdateProject(ctx, u.ID, loose.ID, ProjectUpdate{Folder: &out}, 0); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteFolder(ctx, u.ID, "Karta"); !errors.Is(err, ErrFolderClash) {
		t.Fatalf("a clash: %v", err)
	}
	if got, _ := s.GetProject(ctx, u.ID, a.ID); got.Folder != "Karta" {
		t.Fatalf("nothing changed: %+v", got)
	}
}
