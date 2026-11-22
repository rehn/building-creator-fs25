package store

import (
	"bytes"
	"errors"
	"testing"
)

func sampleTexture() TextureData {
	return TextureData{Name: "Rostig plåt", Size: 256, Meters: 1.5, Thumb: "data:image/jpeg;base64,AAAA",
		Diffuse: []byte("DDS d"), Normal: []byte("DDS n"), Specular: []byte("DDS s")}
}

func TestTextureLifecycle(t *testing.T) {
	s := openTest(t)
	u := mustUser(t, s, "anna@example.se")
	tx, err := s.CreateTexture(ctx, u.ID, sampleTexture())
	if err != nil {
		t.Fatal(err)
	}
	if tx.ID == "" || tx.Name != "Rostig plåt" || tx.Size != 256 || tx.Meters != 1.5 || tx.Thumb == "" {
		t.Fatalf("created: %+v", tx)
	}
	list, err := s.ListTextures(ctx, u.ID)
	if err != nil || len(list) != 1 || list[0].ID != tx.ID {
		t.Fatalf("listed: %+v %v", list, err)
	}
	for kind, want := range map[string]string{"diffuse": "DDS d", "normal": "DDS n", "specular": "DDS s"} {
		got, err := s.TextureFile(ctx, u.ID, tx.ID, kind)
		if err != nil || !bytes.Equal(got, []byte(want)) {
			t.Fatalf("%s: %q %v", kind, got, err)
		}
	}
	if _, err := s.TextureFile(ctx, u.ID, tx.ID, "height"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown kind: %v", err)
	}

	name, meters := "Plåt, ny", 2.0
	q, err := s.UpdateTexture(ctx, u.ID, tx.ID, &name, &meters)
	if err != nil || q.Name != name || q.Meters != 2 || q.Size != 256 {
		t.Fatalf("changed: %+v %v", q, err)
	}
	if err := s.DeleteTexture(ctx, u.ID, tx.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetTexture(ctx, u.ID, tx.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("deleted: %v", err)
	}
	if err := s.DeleteTexture(ctx, u.ID, tx.ID); !errors.Is(err, ErrNotFound) {
		t.Fatal("deleting twice")
	}
}

func TestTexturesArePrivate(t *testing.T) {
	s := openTest(t)
	a, b := mustUser(t, s, "anna@example.se"), mustUser(t, s, "bo@example.se")
	tx, err := s.CreateTexture(ctx, a.ID, sampleTexture())
	if err != nil {
		t.Fatal(err)
	}
	if list, _ := s.ListTextures(ctx, b.ID); len(list) != 0 {
		t.Fatalf("another user sees it: %+v", list)
	}
	if _, err := s.GetTexture(ctx, b.ID, tx.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("get: %v", err)
	}
	if _, err := s.TextureFile(ctx, b.ID, tx.ID, "diffuse"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("file: %v", err)
	}
	n := "x"
	if _, err := s.UpdateTexture(ctx, b.ID, tx.ID, &n, nil); !errors.Is(err, ErrNotFound) {
		t.Fatalf("update: %v", err)
	}
	if err := s.DeleteTexture(ctx, b.ID, tx.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("delete: %v", err)
	}
}

func TestCountTexturesAndCascade(t *testing.T) {
	s := openTest(t)
	u := mustUser(t, s, "anna@example.se")
	for i := 0; i < 3; i++ {
		if _, err := s.CreateTexture(ctx, u.ID, sampleTexture()); err != nil {
			t.Fatal(err)
		}
	}
	if n, err := s.CountTextures(ctx, u.ID); err != nil || n != 3 {
		t.Fatalf("count: %d %v", n, err)
	}
}
