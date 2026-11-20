package store

import (
	"encoding/json"
	"errors"
	"testing"
)

func TestProjectFolders(t *testing.T) {
	s := openTest(t)
	u := mustUser(t, s, "anna@example.se")
	other := mustUser(t, s, "bo@example.se")

	a, _ := s.CreateProject(ctx, u.ID, "Ladan", json.RawMessage(`{}`))
	b, _ := s.CreateProject(ctx, u.ID, "Stugan", json.RawMessage(`{}`))
	c, _ := s.CreateProject(ctx, u.ID, "Garaget", json.RawMessage(`{}`))
	if a.Folder != "" {
		t.Fatalf("a new building is in no folder: %q", a.Folder)
	}
	for _, x := range []struct {
		id, folder string
	}{{a.ID, "Hallsberg"}, {b.ID, "Hallsberg"}, {c.ID, "Askersund"}} {
		f := x.folder
		if _, err := s.UpdateProject(ctx, u.ID, x.id, ProjectUpdate{Folder: &f}, 0); err != nil {
			t.Fatal(err)
		}
	}
	all, _ := s.ListProjects(ctx, u.ID)
	if len(all) != 3 {
		t.Fatalf("all: %d", len(all))
	}
	for _, p := range all {
		if p.Folder == "" {
			t.Fatalf("the list says the folder: %+v", p)
		}
	}
	in, err := s.ListProjectsIn(ctx, u.ID, "Hallsberg")
	if err != nil || len(in) != 2 {
		t.Fatalf("in Hallsberg: %d %v", len(in), err)
	}
	if none, _ := s.ListProjectsIn(ctx, u.ID, "Nowhere"); len(none) != 0 {
		t.Fatalf("a folder with nothing: %+v", none)
	}
	if mine, _ := s.ListProjectsIn(ctx, other.ID, "Hallsberg"); len(mine) != 0 {
		t.Fatalf("someone else's folder: %+v", mine)
	}

	folders, err := s.ListFolders(ctx, u.ID)
	if err != nil || len(folders) != 2 || folders[0].Name != "Askersund" || folders[0].Count != 1 || folders[1].Name != "Hallsberg" || folders[1].Count != 2 {
		t.Fatalf("folders: %+v %v", folders, err)
	}
	// moved out of every folder: an empty name means none
	none := ""
	if _, err := s.UpdateProject(ctx, u.ID, c.ID, ProjectUpdate{Folder: &none}, 0); err != nil {
		t.Fatal(err)
	}
	if folders, _ = s.ListFolders(ctx, u.ID); len(folders) != 1 || folders[0].Name != "Hallsberg" {
		t.Fatalf("a folder with no building is gone: %+v", folders)
	}
	if loose, _ := s.ListProjectsIn(ctx, u.ID, ""); len(loose) != 1 || loose[0].ID != c.ID {
		t.Fatalf("the buildings in no folder: %+v", loose)
	}
	// a rename keeps the folder
	n := "Nya stugan"
	if p, _ := s.UpdateProject(ctx, u.ID, b.ID, ProjectUpdate{Name: &n}, 0); p.Folder != "Hallsberg" {
		t.Fatalf("a rename lost the folder: %+v", p)
	}
}

func TestUpsertGenerated(t *testing.T) {
	s := openTest(t)
	u := mustUser(t, s, "anna@example.se")
	other := mustUser(t, s, "bo@example.se")
	one, two := json.RawMessage(`{"kind":"house","width":10}`), json.RawMessage(`{"kind":"house","width":12}`)

	p, status, err := s.UpsertGenerated(ctx, u.ID, "Hallsberg", "way/1", "Storgatan 4", one)
	if err != nil || status != Created {
		t.Fatalf("first: %v %v", status, err)
	}
	if p.Folder != "Hallsberg" || p.SourceID != "way/1" || !p.Generated || p.Edited || p.Version != 1 || p.Name != "Storgatan 4" {
		t.Fatalf("created: %+v", p)
	}

	// the same id in the same folder again updates it, and does not make a second
	q, status, err := s.UpsertGenerated(ctx, u.ID, "Hallsberg", "way/1", "Storgatan 5", two)
	if err != nil || status != Updated || q.ID != p.ID {
		t.Fatalf("second: %v %v %+v", status, err, q)
	}
	if q.Version != 2 || q.Edited || q.Name != "Storgatan 5" || string(q.Data) != string(two) {
		t.Fatalf("updated: %+v", q)
	}
	if list, _ := s.ListProjects(ctx, u.ID); len(list) != 1 {
		t.Fatalf("one building, not two: %d", len(list))
	}

	// the model of the old settings is not the building's any more
	if err := s.PutModel(ctx, u.ID, p.ID, 2, Model{Obj: []byte("o"), Mtl: []byte("m"), Mod: []byte("z")}); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.UpsertGenerated(ctx, u.ID, "Hallsberg", "way/1", "Storgatan 5", one); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetModel(ctx, u.ID, p.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("the model of the settings before is gone: %v", err)
	}

	// a person changes it in the editor: it is hers now, and regenerating leaves it
	n := "Min stuga"
	edited, err := s.UpdateProject(ctx, u.ID, p.ID, ProjectUpdate{Name: &n, Data: json.RawMessage(`{"kind":"house","width":99}`)}, 0)
	if err != nil {
		t.Fatal(err)
	}
	got, _ := s.GetProject(ctx, u.ID, p.ID)
	if !got.Edited || !got.Generated {
		t.Fatalf("edited by a person: %+v", got)
	}
	k, status, err := s.UpsertGenerated(ctx, u.ID, "Hallsberg", "way/1", "Storgatan 9", two)
	if err != nil || status != Kept {
		t.Fatalf("kept: %v %v", status, err)
	}
	if k.Version != edited.Version || k.Name != "Min stuga" || string(k.Data) != `{"kind":"house","width":99}` {
		t.Fatalf("the edited building was changed: %+v", k)
	}

	// the same id in another folder, or for another user, is another building
	o, status, _ := s.UpsertGenerated(ctx, u.ID, "Askersund", "way/1", "Storgatan 4", one)
	if status != Created || o.ID == p.ID {
		t.Fatalf("another folder: %v %+v", status, o)
	}
	m, status, _ := s.UpsertGenerated(ctx, other.ID, "Hallsberg", "way/1", "Storgatan 4", one)
	if status != Created || m.ID == p.ID {
		t.Fatalf("another user: %v %+v", status, m)
	}
	// a building made in the editor has no source id, so two of them are not one
	if _, _, err := s.UpsertGenerated(ctx, u.ID, "Hallsberg", "", "x", one); err == nil {
		t.Fatal("an upsert without a source id is refused")
	}
}

func TestWriteTokens(t *testing.T) {
	s := openTest(t)
	u := mustUser(t, s, "anna@example.se")
	r, err := s.CreateToken(ctx, u.ID, "Läsare", "hashR", "bc_r")
	if err != nil || r.Write {
		t.Fatalf("a token reads unless it is made to write: %+v %v", r, err)
	}
	w, err := s.CreateTokenScoped(ctx, u.ID, "Kartan", "hashW", "bc_w", true)
	if err != nil || !w.Write {
		t.Fatalf("write token: %+v %v", w, err)
	}
	if _, write, err := s.TokenAuth(ctx, "hashR"); err != nil || write {
		t.Fatalf("read token: %v %v", write, err)
	}
	if got, write, err := s.TokenAuth(ctx, "hashW"); err != nil || !write || got.ID != u.ID {
		t.Fatalf("write token: %v %v", write, err)
	}
	if _, _, err := s.TokenAuth(ctx, "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown: %v", err)
	}
	list, _ := s.ListTokens(ctx, u.ID)
	writes := 0
	for _, x := range list {
		if x.Write {
			writes++
		}
	}
	if len(list) != 2 || writes != 1 {
		t.Fatalf("listed: %+v", list)
	}
}

func TestRenameFolder(t *testing.T) {
	s := openTest(t)
	u := mustUser(t, s, "anna@example.se")
	other := mustUser(t, s, "bo@example.se")
	d := json.RawMessage(`{"kind":"house"}`)
	a, _, _ := s.UpsertGenerated(ctx, u.ID, "Hallsberg", "way/1", "A", d)
	s.UpsertGenerated(ctx, u.ID, "Hallsberg", "way/2", "B", d)
	s.UpsertGenerated(ctx, u.ID, "Askersund", "way/1", "C", d)
	s.UpsertGenerated(ctx, other.ID, "Hallsberg", "way/1", "D", d)

	n, err := s.RenameFolder(ctx, u.ID, "Hallsberg", "Hallsberg 2026")
	if err != nil || n != 2 {
		t.Fatalf("rename: %d %v", n, err)
	}
	if list, _ := s.ListFolders(ctx, u.ID); len(list) != 2 || list[0].Name != "Askersund" || list[1].Name != "Hallsberg 2026" || list[1].Count != 2 {
		t.Fatalf("folders: %+v", list)
	}
	if list, _ := s.ListFolders(ctx, other.ID); len(list) != 1 || list[0].Name != "Hallsberg" {
		t.Fatalf("somebody else's folder is not touched: %+v", list)
	}
	// a rename is not an edit: the building stays generated, and generating it again in the new folder updates it
	p, _ := s.GetProject(ctx, u.ID, a.ID)
	if p.Folder != "Hallsberg 2026" || p.Version != a.Version || p.Edited || !p.Generated {
		t.Fatalf("after: %+v", p)
	}
	if q, status, _ := s.UpsertGenerated(ctx, u.ID, "Hallsberg 2026", "way/1", "A", d); status != Updated || q.ID != a.ID {
		t.Fatalf("regenerate: %v %+v", status, q)
	}

	if _, err := s.RenameFolder(ctx, u.ID, "Nowhere", "X"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("no such folder: %v", err)
	}
	if _, err := s.RenameFolder(ctx, u.ID, "Askersund", "Hallsberg 2026"); !errors.Is(err, ErrConflict) {
		t.Fatalf("the new name is taken: %v", err)
	}
}
