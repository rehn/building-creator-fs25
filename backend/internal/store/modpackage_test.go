package store

import (
	"errors"
	"testing"
)

// The zip of a whole mod (the game mod, made in the browser) is kept with the version of the mod it was made from.
func TestModPackage(t *testing.T) {
	s := openTest(t)
	u := mustUser(t, s, "anna@example.se")
	other := mustUser(t, s, "bo@example.se")
	m, err := s.CreateMod(ctx, u.ID, "Gården", nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetModPackage(ctx, u.ID, m.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("none yet: %v", err)
	}
	if v, err := s.ModPackageVersion(ctx, u.ID, m.ID); err != nil || v != 0 {
		t.Fatalf("version of none: %d %v", v, err)
	}

	if err := s.PutModPackage(ctx, u.ID, m.ID, m.Version, []byte("PK one")); err != nil {
		t.Fatal(err)
	}
	got, err := s.GetModPackage(ctx, u.ID, m.ID)
	if err != nil || got.Version != m.Version || string(got.Zip) != "PK one" || got.UpdatedAt.IsZero() {
		t.Fatalf("stored: %+v %v", got, err)
	}
	// a second one replaces the first
	if err := s.PutModPackage(ctx, u.ID, m.ID, m.Version, []byte("PK two")); err != nil {
		t.Fatal(err)
	}
	if got, _ = s.GetModPackage(ctx, u.ID, m.ID); string(got.Zip) != "PK two" {
		t.Fatalf("replaced: %+v", got)
	}

	// made from an old version of the mod: refused (the mod was saved again)
	m2, _ := s.UpdateMod(ctx, u.ID, m.ID, ModUpdate{Data: []byte(`{"a":1}`)}, 0)
	if err := s.PutModPackage(ctx, u.ID, m.ID, m.Version, []byte("old")); !errors.Is(err, ErrConflict) {
		t.Fatalf("old version: %v", err)
	}
	if v, _ := s.ModPackageVersion(ctx, u.ID, m.ID); v != m.Version || v == m2.Version {
		t.Fatalf("the stored one says which version it is from: %d", v)
	}

	// someone else's mod, and a mod that is gone
	if err := s.PutModPackage(ctx, other.ID, m.ID, m2.Version, []byte("x")); !errors.Is(err, ErrNotFound) {
		t.Fatalf("not yours: %v", err)
	}
	if _, err := s.GetModPackage(ctx, other.ID, m.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("not yours to read: %v", err)
	}
	if err := s.DeleteMod(ctx, u.ID, m.ID); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := s.queryRow(ctx, `SELECT COUNT(*) FROM mod_packages`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("the package goes with the mod: %d %v", n, err)
	}
}
