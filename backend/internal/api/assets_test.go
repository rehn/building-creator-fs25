package api

import (
	"bytes"
	"mime/multipart"
	"net/http/httptest"
	"strings"
	"testing"

	"house-to-i3d/backend/internal/store"
)

type upload struct {
	name, meta string
	files      map[string][]byte
	order      []string
}

// importAsset posts an item the way the browser does: a multipart form with name, meta and files.
func (c *client) importAsset(u upload) *httptest.ResponseRecorder {
	c.t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	if u.name != "" {
		mw.WriteField("name", u.name)
	}
	if u.meta != "" {
		mw.WriteField("meta", u.meta)
	}
	for _, n := range u.order {
		fw, err := mw.CreateFormFile("files", n)
		if err != nil {
			c.t.Fatal(err)
		}
		fw.Write(u.files[n])
	}
	mw.Close()
	req := httptest.NewRequest("POST", "/api/assets", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("Origin", origin)
	return c.send(req)
}

func feeder() upload {
	f := map[string][]byte{
		"cow-feeder.i3d":        []byte(`<i3D><Shapes externalShapesFile="cow-feeder.i3d.shapes"/></i3D>`),
		"cow-feeder.i3d.shapes": {0x0a, 0x00, 0x97, 0xff, 0x00},
		"cow-feeder.obj":        []byte("v 0 0 0\n"),
	}
	return upload{name: "Cow feeder", meta: `{"mount":"wall"}`, files: f, order: []string{"cow-feeder.i3d", "cow-feeder.i3d.shapes", "cow-feeder.obj"}}
}

func TestAssetLifecycle(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)

	rec := c.importAsset(feeder())
	expect(t, rec, 201)
	a := decode[store.Asset](t, rec)
	if a.Name != "Cow feeder" || string(a.Meta) != `{"mount":"wall"}` || len(a.Files) != 3 || a.Files[1].Size != 5 {
		t.Fatalf("imported: %+v", a)
	}

	rec = c.do("GET", "/api/assets/"+a.ID+"/files/cow-feeder.i3d.shapes", nil)
	expect(t, rec, 200)
	if !bytes.Equal(rec.Body.Bytes(), []byte{0x0a, 0x00, 0x97, 0xff, 0x00}) {
		t.Fatalf("file contents: %v", rec.Body.Bytes())
	}
	expectError(t, c.do("GET", "/api/assets/"+a.ID+"/files/other.png", nil), 404, "not_found")

	list := decode[[]store.Asset](t, c.do("GET", "/api/assets", nil))
	if len(list) != 1 || list[0].ID != a.ID {
		t.Fatalf("list: %+v", list)
	}

	rec = c.do("PATCH", "/api/assets/"+a.ID, map[string]any{"name": "Foderbord", "meta": map[string]any{"mount": "floor"}})
	expect(t, rec, 200)
	if b := decode[store.Asset](t, rec); b.Name != "Foderbord" || string(b.Meta) != `{"mount":"floor"}` {
		t.Fatalf("updated: %+v", b)
	}

	expect(t, c.do("DELETE", "/api/assets/"+a.ID, nil), 204)
	expectError(t, c.do("DELETE", "/api/assets/"+a.ID, nil), 404, "not_found")
}

func TestAssetImportValidation(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)

	u := feeder()
	u.order = []string{"cow-feeder.obj"}
	expectError(t, c.importAsset(u), 400, "invalid_files") // no i3d

	u = feeder()
	u.files["second.i3d"] = []byte("<i3D/>")
	u.order = append(u.order, "second.i3d")
	expectError(t, c.importAsset(u), 400, "invalid_files") // two i3d files

	u = feeder()
	u.files["../evil.png"] = []byte("x")
	u.order = append(u.order, "../evil.png")
	expectError(t, c.importAsset(u), 400, "invalid_files") // a path, not a name

	u = feeder()
	u.order = append(u.order, "cow-feeder.obj")
	expectError(t, c.importAsset(u), 400, "invalid_files") // the same name twice

	u = feeder()
	u.name = strings.Repeat("x", 101)
	expectError(t, c.importAsset(u), 400, "invalid_name")

	u = feeder()
	u.meta = `[1,2]`
	expectError(t, c.importAsset(u), 400, "invalid_meta")

	u = feeder()
	u.files["big.png"] = make([]byte, maxAssetBytes+1)
	u.order = append(u.order, "big.png")
	if rec := c.importAsset(u); rec.Code != 413 && rec.Code != 400 {
		t.Fatalf("oversized item accepted: %d", rec.Code)
	}

	req := httptest.NewRequest("POST", "/api/assets", strings.NewReader(`{"name":"x"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", origin)
	expectError(t, c.send(req), 415, "unsupported_media_type")
}

func TestAssetsArePrivate(t *testing.T) {
	srv := newTestServer(t)
	admin := signupAdmin(t, srv)
	rec := admin.importAsset(feeder())
	expect(t, rec, 201)
	a := decode[store.Asset](t, rec)

	friend := signupFriend(t, srv, admin, "friend@example.se")
	if list := decode[[]store.Asset](t, friend.do("GET", "/api/assets", nil)); len(list) != 0 {
		t.Fatal("another user sees the item")
	}
	expectError(t, friend.do("GET", "/api/assets/"+a.ID+"/files/cow-feeder.i3d", nil), 404, "not_found")
	expectError(t, friend.do("PATCH", "/api/assets/"+a.ID, map[string]any{"name": "Mine"}), 404, "not_found")
	expectError(t, friend.do("DELETE", "/api/assets/"+a.ID, nil), 404, "not_found")

	anon := newClient(t, srv)
	expectError(t, anon.do("GET", "/api/assets", nil), 401, "unauthorized")
}
