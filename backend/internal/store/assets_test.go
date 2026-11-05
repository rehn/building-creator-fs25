package store

import (
	"bytes"
	"encoding/json"
	"errors"
	"testing"
)

func feederFiles() []AssetFileData {
	return []AssetFileData{
		{Name: "cow-feeder.i3d", Data: []byte("<i3D/>")},
		{Name: "cow-feeder.i3d.shapes", Data: []byte{0x0a, 0x00, 0x97, 0xff}},
		{Name: "cow-feeder.obj", Data: []byte("v 0 0 0\n")},
	}
}

func TestAssetLifecycle(t *testing.T) {
	s := openTest(t)
	u := mustUser(t, s, "anna@example.se")
	a, err := s.CreateAsset(ctx, u.ID, "Cow feeder", json.RawMessage(`{"mount":"wall"}`), feederFiles())
	if err != nil {
		t.Fatal(err)
	}
	if a.ID == "" || a.Name != "Cow feeder" || string(a.Meta) != `{"mount":"wall"}` || len(a.Files) != 3 {
		t.Fatalf("created: %+v", a)
	}
	if f := a.Files[1]; f.Name != "cow-feeder.i3d.shapes" || f.Size != 4 {
		t.Fatalf("files are listed in order with their size: %+v", a.Files)
	}

	data, err := s.AssetFile(ctx, u.ID, a.ID, "cow-feeder.i3d.shapes")
	if err != nil || !bytes.Equal(data, []byte{0x0a, 0x00, 0x97, 0xff}) {
		t.Fatalf("binary file comes back unchanged: %v %v", data, err)
	}
	if _, err := s.AssetFile(ctx, u.ID, a.ID, "nope.png"); !errors.Is(err, ErrNotFound) {
		t.Fatal("a file that isn't there")
	}

	name := "Foderbord"
	b, err := s.UpdateAsset(ctx, u.ID, a.ID, &name, json.RawMessage(`{"mount":"floor"}`))
	if err != nil || b.Name != "Foderbord" || string(b.Meta) != `{"mount":"floor"}` || len(b.Files) != 3 {
		t.Fatalf("updated: %+v %v", b, err)
	}
	if b, err = s.UpdateAsset(ctx, u.ID, a.ID, nil, nil); err != nil || b.Name != "Foderbord" {
		t.Fatalf("an empty update changes nothing: %+v %v", b, err)
	}

	list, err := s.ListAssets(ctx, u.ID)
	if err != nil || len(list) != 1 || list[0].ID != a.ID || len(list[0].Files) != 3 {
		t.Fatalf("list: %+v %v", list, err)
	}

	if err := s.DeleteAsset(ctx, u.ID, a.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AssetFile(ctx, u.ID, a.ID, "cow-feeder.i3d"); !errors.Is(err, ErrNotFound) {
		t.Fatal("the files go with the item")
	}
	if list, _ := s.ListAssets(ctx, u.ID); len(list) != 0 {
		t.Fatal("deleted item still listed")
	}
}

func TestAssetsArePrivate(t *testing.T) {
	s := openTest(t)
	anna, bo := mustUser(t, s, "anna@example.se"), mustUser(t, s, "bo@example.se")
	a, err := s.CreateAsset(ctx, anna.ID, "Cow feeder", json.RawMessage(`{}`), feederFiles())
	if err != nil {
		t.Fatal(err)
	}
	if list, _ := s.ListAssets(ctx, bo.ID); len(list) != 0 {
		t.Fatal("another user sees the item")
	}
	if _, err := s.AssetFile(ctx, bo.ID, a.ID, "cow-feeder.i3d"); !errors.Is(err, ErrNotFound) {
		t.Fatal("another user can read the files")
	}
	name := "Mine"
	if _, err := s.UpdateAsset(ctx, bo.ID, a.ID, &name, nil); !errors.Is(err, ErrNotFound) {
		t.Fatal("another user can rename the item")
	}
	if err := s.DeleteAsset(ctx, bo.ID, a.ID); !errors.Is(err, ErrNotFound) {
		t.Fatal("another user can delete the item")
	}
}
