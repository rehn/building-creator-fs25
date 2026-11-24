package store

import (
	"encoding/json"
	"errors"
	"testing"
)

func TestModLifecycle(t *testing.T) {
	s := openTest(t)
	u := mustUser(t, s, "anna@example.se")
	house, _ := s.CreateProject(ctx, u.ID, "Huset", json.RawMessage(`{}`))
	barn, _ := s.CreateProject(ctx, u.ID, "Ladan", json.RawMessage(`{}`))
	prop, err := s.CreateProject(ctx, u.ID, "Brevlåda", json.RawMessage(`{"kind":"prop"}`))
	if err != nil {
		t.Fatal(err)
	}

	m, err := s.CreateMod(ctx, u.ID, "Gården", nil)
	if err != nil || m.ID == "" || m.Name != "Gården" || m.Version != 1 || string(m.Data) != `{}` || len(m.Items) != 0 {
		t.Fatalf("created: %+v %v", m, err)
	}

	// items: a building with a mod type, a plain building, a prop alone
	items := []ModItem{
		{ID: "a", Kind: ModBuilding, Ref: house.ID, Type: "sheepPasture", X: 1, Z: -2, Rot: 90},
		{Kind: ModBuilding, Ref: barn.ID},
		{ID: "c", Kind: ModProp, Ref: prop.ID, X: 5},
	}
	m, err = s.UpdateMod(ctx, u.ID, m.ID, ModUpdate{Items: &items, Data: json.RawMessage(`{"objects":[1]}`)}, 1)
	if err != nil || m.Version != 2 || m.ItemCount != 3 || len(m.Items) != 3 || string(m.Data) != `{"objects":[1]}` {
		t.Fatalf("updated: %+v %v", m, err)
	}
	if a := m.Items[0]; a.ID != "a" || a.Name != "Huset" || a.Type != "sheepPasture" || a.X != 1 || a.Z != -2 || a.Rot != 90 || a.Missing {
		t.Fatalf("the first item keeps its place and takes its name from the building: %+v", a)
	}
	if m.Items[1].ID == "" || m.Items[1].Name != "Ladan" || m.Items[2].Name != "Brevlåda" || m.Items[2].Kind != ModProp {
		t.Fatalf("the others: %+v", m.Items)
	}

	// the game objects on a post are kept as given, and an item without any has an empty list
	withObjects := []ModItem{{ID: "a", Kind: ModBuilding, Ref: house.ID, Objects: json.RawMessage(`[{"type":"sleep","x":1}]`)}, {ID: "b", Kind: ModProp, Ref: prop.ID}}
	if m, err = s.UpdateMod(ctx, u.ID, m.ID, ModUpdate{Items: &withObjects}, 0); err != nil || string(m.Items[0].Objects) != `[{"type":"sleep","x":1}]` || string(m.Items[1].Objects) != `[]` {
		t.Fatalf("objects: %+v %v", m.Items, err)
	}
	m, err = s.UpdateMod(ctx, u.ID, m.ID, ModUpdate{Items: &items}, 0)
	if err != nil {
		t.Fatal(err)
	}

	// it follows the building live: a rename shows, a deletion makes the item missing (and the mod keeps it)
	name := "Stora huset"
	if _, err := s.UpdateProject(ctx, u.ID, house.ID, ProjectUpdate{Name: &name}, 0); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteProject(ctx, u.ID, barn.ID); err != nil {
		t.Fatal(err)
	}
	got, err := s.GetMod(ctx, u.ID, m.ID)
	if err != nil || got.Items[0].Name != name || got.Items[0].Missing || !got.Items[1].Missing || got.Items[1].Name != "" || len(got.Items) != 3 {
		t.Fatalf("live: %+v %v", got.Items, err)
	}

	// one building in two mods
	other, _ := s.CreateMod(ctx, u.ID, "Andra", nil)
	if other, err = s.UpdateMod(ctx, u.ID, other.ID, ModUpdate{Items: &[]ModItem{{Kind: ModBuilding, Ref: house.ID}}}, 0); err != nil || other.ItemCount != 1 {
		t.Fatalf("the same building in a second mod: %+v %v", other, err)
	}

	list, err := s.ListMods(ctx, u.ID)
	if err != nil || len(list) != 2 || list[0].ID != other.ID || list[1].ItemCount != 3 || len(list[0].Items) != 0 || len(list[1].Data) != 0 {
		t.Fatalf("listed, the last changed first, without plans: %+v %v", list, err)
	}

	// deleting the mod leaves what it held
	if err := s.DeleteMod(ctx, u.ID, m.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetMod(ctx, u.ID, m.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("gone: %v", err)
	}
	if _, err := s.GetProject(ctx, u.ID, house.ID); err != nil {
		t.Fatalf("the building stays: %v", err)
	}
	if err := s.DeleteMod(ctx, u.ID, m.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("deleted twice: %v", err)
	}
}

func TestModRulesAndOwners(t *testing.T) {
	s := openTest(t)
	anna := mustUser(t, s, "anna@example.se")
	bo := mustUser(t, s, "bo@example.se")
	house, _ := s.CreateProject(ctx, anna.ID, "Huset", json.RawMessage(`{}`))
	prop, _ := s.CreateProject(ctx, anna.ID, "Staty", json.RawMessage(`{"kind":"prop"}`))
	m, _ := s.CreateMod(ctx, bo.ID, "Bos mod", nil)

	// Bo can't use Anna's building or her prop
	if _, err := s.UpdateMod(ctx, bo.ID, m.ID, ModUpdate{Items: &[]ModItem{{Kind: ModBuilding, Ref: house.ID}}}, 0); !errors.Is(err, ErrBadRef) {
		t.Fatalf("someone else's building: %v", err)
	}
	if _, err := s.UpdateMod(ctx, bo.ID, m.ID, ModUpdate{Items: &[]ModItem{{Kind: ModProp, Ref: prop.ID}}}, 0); !errors.Is(err, ErrBadRef) {
		t.Fatalf("someone else's prop: %v", err)
	}
	own, _ := s.CreateProject(ctx, bo.ID, "Bos staty", json.RawMessage(`{"kind":"prop"}`))
	if got, err := s.UpdateMod(ctx, bo.ID, m.ID, ModUpdate{Items: &[]ModItem{{Kind: ModProp, Ref: own.ID}}}, 0); err != nil || got.Items[0].Name != "Bos staty" {
		t.Fatalf("their own prop: %+v %v", got, err)
	}
	if _, err := s.UpdateMod(ctx, bo.ID, m.ID, ModUpdate{Items: &[]ModItem{{Kind: "tree", Ref: "x"}}}, 0); !errors.Is(err, ErrBadRef) {
		t.Fatalf("an unknown kind: %v", err)
	}
	if got, _ := s.GetMod(ctx, bo.ID, m.ID); len(got.Items) != 1 || got.Version != 2 {
		t.Fatalf("a refused update changes nothing: %+v", got)
	}

	// a mod belongs to its owner
	if _, err := s.GetMod(ctx, anna.ID, m.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("read: %v", err)
	}
	if _, err := s.UpdateMod(ctx, anna.ID, m.ID, ModUpdate{}, 0); !errors.Is(err, ErrNotFound) {
		t.Fatalf("update: %v", err)
	}
	if err := s.DeleteMod(ctx, anna.ID, m.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("delete: %v", err)
	}
	if list, _ := s.ListMods(ctx, anna.ID); len(list) != 0 {
		t.Fatalf("listed: %+v", list)
	}

	// the version check: a save from an old version is refused with the current mod
	cur, _ := s.GetMod(ctx, bo.ID, m.ID)
	newName := "Nytt"
	if _, err := s.UpdateMod(ctx, bo.ID, m.ID, ModUpdate{Name: &newName}, cur.Version); err != nil {
		t.Fatal(err)
	}
	got, err := s.UpdateMod(ctx, bo.ID, m.ID, ModUpdate{Name: &newName}, cur.Version)
	if !errors.Is(err, ErrConflict) || got.Version != cur.Version+1 {
		t.Fatalf("conflict: %+v %v", got, err)
	}
}
