package store

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"path/filepath"
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

func TestSharedAssets(t *testing.T) {
	s := openTest(t)
	admin, bo := mustUser(t, s, "admin@example.se"), mustUser(t, s, "bo@example.se")
	a, err := s.CreateAsset(ctx, admin.ID, "Cow feeder", json.RawMessage(`{}`), feederFiles())
	if err != nil || a.Shared || !a.Mine {
		t.Fatalf("an item starts out private and the owner's: %+v %v", a, err)
	}
	if list, _ := s.ListAssets(ctx, bo.ID); len(list) != 0 {
		t.Fatal("private items are private")
	}
	on := true
	if a, err = s.SetAssetShared(ctx, admin.ID, a.ID, on); err != nil || !a.Shared {
		t.Fatalf("shared: %+v %v", a, err)
	}

	// Everyone sees a shared item and can use its files, but it stays the owner's.
	list, err := s.ListAssets(ctx, bo.ID)
	if err != nil || len(list) != 1 || !list[0].Shared || list[0].Mine || len(list[0].Files) != 3 {
		t.Fatalf("bo's list: %+v %v", list, err)
	}
	if _, err := s.AssetFile(ctx, bo.ID, a.ID, "cow-feeder.i3d"); err != nil {
		t.Fatal("bo can't read a shared item's files:", err)
	}
	name := "Mine"
	if _, err := s.UpdateAsset(ctx, bo.ID, a.ID, &name, nil); !errors.Is(err, ErrNotFound) {
		t.Fatal("bo can change a shared item")
	}
	if _, err := s.SetAssetShared(ctx, bo.ID, a.ID, false); !errors.Is(err, ErrNotFound) {
		t.Fatal("bo can unshare it")
	}
	if err := s.DeleteAsset(ctx, bo.ID, a.ID); !errors.Is(err, ErrNotFound) {
		t.Fatal("bo can delete a shared item")
	}
	if list, _ := s.ListAssets(ctx, admin.ID); len(list) != 1 || !list[0].Mine {
		t.Fatal("the owner still owns it")
	}

	if _, err := s.SetAssetShared(ctx, admin.ID, a.ID, false); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AssetFile(ctx, bo.ID, a.ID, "cow-feeder.i3d"); !errors.Is(err, ErrNotFound) {
		t.Fatal("unshared, it's private again")
	}
}

func TestAssetsTableGetsSharedColumn(t *testing.T) {
	// A database from before sharing: the column is added when it's opened.
	path := filepath.Join(t.TempDir(), "old.db")
	db, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE assets (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, name TEXT NOT NULL, meta TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	db.Close()
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	u := mustUser(t, s, "anna@example.se")
	if _, err := s.CreateAsset(ctx, u.ID, "X", json.RawMessage(`{}`), feederFiles()); err != nil {
		t.Fatal(err)
	}
}
