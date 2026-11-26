package store

import (
	"bytes"
	"errors"
	"testing"
)

// A saved texture is edited again (Lars, 2026-11-25): the finished maps are replaced, and what the new ones do not say (the name, the real size) stays.
func TestReplaceTexture(t *testing.T) {
	s := openTest(t)
	u := mustUser(t, s, "anna@example.se")
	other := mustUser(t, s, "bo@example.se")
	tx, err := s.CreateTexture(ctx, u.ID, sampleTexture())
	if err != nil {
		t.Fatal(err)
	}
	next := TextureData{Size: 512, Thumb: "data:image/jpeg;base64,BBBB", Diffuse: []byte("DDS d2"), Normal: []byte("DDS n2"), Specular: []byte("DDS s2")}
	got, err := s.ReplaceTexture(ctx, u.ID, tx.ID, next)
	if err != nil || got.Size != 512 || got.Thumb != next.Thumb || got.Name != tx.Name || got.Meters != tx.Meters || got.ID != tx.ID {
		t.Fatalf("replaced: %+v %v", got, err)
	}
	for kind, want := range map[string]string{"diffuse": "DDS d2", "normal": "DDS n2", "specular": "DDS s2"} {
		b, err := s.TextureFile(ctx, u.ID, tx.ID, kind)
		if err != nil || !bytes.Equal(b, []byte(want)) {
			t.Fatalf("%s: %q %v", kind, b, err)
		}
	}
	// a name and a real size that come with it are changed too
	next.Name, next.Meters = "Plåt, ny", 3
	if got, err = s.ReplaceTexture(ctx, u.ID, tx.ID, next); err != nil || got.Name != "Plåt, ny" || got.Meters != 3 {
		t.Fatalf("with a name and a size: %+v %v", got, err)
	}
	if _, err := s.ReplaceTexture(ctx, other.ID, tx.ID, next); !errors.Is(err, ErrNotFound) {
		t.Fatalf("someone else's: %v", err)
	}
	if _, err := s.ReplaceTexture(ctx, u.ID, "nope", next); !errors.Is(err, ErrNotFound) {
		t.Fatalf("no such texture: %v", err)
	}
	if b, _ := s.TextureFile(ctx, u.ID, tx.ID, "diffuse"); !bytes.Equal(b, []byte("DDS d2")) {
		t.Fatalf("what was refused changed nothing: %q", b)
	}
}
