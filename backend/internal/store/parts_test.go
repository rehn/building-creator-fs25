package store

import (
	"encoding/json"
	"errors"
	"testing"
)

const partFile = `{"format":"house-to-i3d-part","version":1,"name":"Pumphus","parts":[{"id":1}],"windows":[],"items":[]}`

func TestPartLifecycle(t *testing.T) {
	s := openTest(t)
	u := mustUser(t, s, "anna@example.se")
	p, err := s.CreatePart(ctx, u.ID, "Pumphus", json.RawMessage(`{"parts":1}`), json.RawMessage(partFile))
	if err != nil {
		t.Fatal(err)
	}
	if p.ID == "" || p.Name != "Pumphus" || string(p.Info) != `{"parts":1}` || !p.Mine || p.Shared {
		t.Fatalf("created: %+v", p)
	}
	if string(p.Data) != partFile {
		t.Fatalf("the file comes back as it went in: %s", p.Data)
	}

	list, err := s.ListParts(ctx, u.ID)
	if err != nil || len(list) != 1 || list[0].ID != p.ID || len(list[0].Data) != 0 {
		t.Fatalf("listed without the file: %+v %v", list, err)
	}

	name := "Pumphus med bod"
	q, err := s.UpdatePart(ctx, u.ID, p.ID, &name)
	if err != nil || q.Name != name || string(q.Data) != partFile {
		t.Fatalf("renamed: %+v %v", q, err)
	}
	if q, err = s.SetPartShared(ctx, u.ID, p.ID, true); err != nil || !q.Shared {
		t.Fatalf("shared: %+v %v", q, err)
	}

	if err := s.DeletePart(ctx, u.ID, p.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetPart(ctx, u.ID, p.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("deleted: %v", err)
	}
	if err := s.DeletePart(ctx, u.ID, p.ID); !errors.Is(err, ErrNotFound) {
		t.Fatal("deleting twice")
	}
}

func TestPartsAreOwnedAndShared(t *testing.T) {
	s := openTest(t)
	anna := mustUser(t, s, "anna@example.se")
	bo := mustUser(t, s, "bo@example.se")
	p, err := s.CreatePart(ctx, anna.ID, "Pumphus", nil, json.RawMessage(partFile))
	if err != nil {
		t.Fatal(err)
	}
	if string(p.Info) != `{}` {
		t.Fatalf("no info is an empty object: %s", p.Info)
	}
	if l, _ := s.ListParts(ctx, bo.ID); len(l) != 0 {
		t.Fatal("another user sees a private part")
	}
	if _, err := s.GetPart(ctx, bo.ID, p.ID); !errors.Is(err, ErrNotFound) {
		t.Fatal("another user reads a private part")
	}
	if _, err := s.SetPartShared(ctx, anna.ID, p.ID, true); err != nil {
		t.Fatal(err)
	}
	l, _ := s.ListParts(ctx, bo.ID)
	if len(l) != 1 || !l[0].Shared || l[0].Mine {
		t.Fatalf("a shared part is listed for everyone, not as theirs: %+v", l)
	}
	if g, err := s.GetPart(ctx, bo.ID, p.ID); err != nil || len(g.Data) == 0 || g.Mine {
		t.Fatalf("and can be read: %+v %v", g, err)
	}
	name := "Mitt"
	if _, err := s.UpdatePart(ctx, bo.ID, p.ID, &name); !errors.Is(err, ErrNotFound) {
		t.Fatal("changed by another user")
	}
	if _, err := s.SetPartShared(ctx, bo.ID, p.ID, false); !errors.Is(err, ErrNotFound) {
		t.Fatal("unshared by another user")
	}
	if err := s.DeletePart(ctx, bo.ID, p.ID); !errors.Is(err, ErrNotFound) {
		t.Fatal("deleted by another user")
	}
}
