package store

import (
	"errors"
	"testing"
)

func TestModelFiles(t *testing.T) {
	s := openTest(t)
	u := mustUser(t, s, "anna@example.se")
	other := mustUser(t, s, "bo@example.se")
	p, err := s.CreateProject(ctx, u.ID, "Stugan", []byte(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	if p.ModelVersion != 0 {
		t.Fatalf("a new building has no model: %+v", p)
	}
	if _, err := s.GetModel(ctx, u.ID, p.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("no model yet: %v", err)
	}

	// the editor saves (version 2), then sends the model made for that version
	p, _ = s.UpdateProject(ctx, u.ID, p.ID, ProjectUpdate{Data: []byte(`{"a":1}`)}, 0)
	m := Model{Obj: []byte("v 1 2 3\n"), Mtl: []byte("newmtl a\n"), Mod: []byte("PK mod")}
	if err := s.PutModel(ctx, u.ID, p.ID, p.Version, m); err != nil {
		t.Fatal(err)
	}
	got, err := s.GetModel(ctx, u.ID, p.ID)
	if err != nil || got.Version != p.Version || string(got.Obj) != "v 1 2 3\n" || string(got.Mtl) != "newmtl a\n" || string(got.Mod) != "PK mod" || got.UpdatedAt.IsZero() {
		t.Fatalf("stored: %+v %v", got, err)
	}
	if q, _ := s.GetProject(ctx, u.ID, p.ID); q.ModelVersion != p.Version {
		t.Fatalf("project says which version the model is: %+v", q)
	}
	if l, _ := s.ListProjects(ctx, u.ID); len(l) != 1 || l[0].ModelVersion != p.Version {
		t.Fatalf("list: %+v", l)
	}

	// a model for an old version is refused: a newer save is on its way with its own
	newer, _ := s.UpdateProject(ctx, u.ID, p.ID, ProjectUpdate{Data: []byte(`{"a":2}`)}, 0)
	if err := s.PutModel(ctx, u.ID, p.ID, p.Version, m); !errors.Is(err, ErrConflict) {
		t.Fatalf("old version: %v", err)
	}
	if g, _ := s.GetModel(ctx, u.ID, p.ID); g.Version != p.Version {
		t.Fatalf("the model stays as it was until the new one comes: %+v", g)
	}
	m.Obj = []byte("v 4 5 6\n")
	if err := s.PutModel(ctx, u.ID, p.ID, newer.Version, m); err != nil {
		t.Fatal(err)
	}
	if g, _ := s.GetModel(ctx, u.ID, p.ID); g.Version != newer.Version || string(g.Obj) != "v 4 5 6\n" {
		t.Fatalf("replaced: %+v", g)
	}

	// someone else's building
	if err := s.PutModel(ctx, other.ID, p.ID, newer.Version, m); !errors.Is(err, ErrNotFound) {
		t.Fatalf("not yours: %v", err)
	}
	if _, err := s.GetModel(ctx, other.ID, p.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("not yours: %v", err)
	}

	// deleted with the building
	if err := s.DeleteProject(ctx, u.ID, p.ID); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := s.queryRow(ctx, `SELECT COUNT(*) FROM project_models`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("model left behind: %d %v", n, err)
	}
}
