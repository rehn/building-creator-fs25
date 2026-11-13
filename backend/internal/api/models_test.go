package api

import (
	"archive/zip"
	"bytes"
	"fmt"
	"mime/multipart"
	"net/http/httptest"
	"strings"
	"testing"
)

// modZip is a game mod as the editor makes it: modDesc.xml, house.xml and house.i3d.
func modZip(t *testing.T, names ...string) []byte {
	t.Helper()
	if len(names) == 0 {
		names = []string{"modDesc.xml", "house.xml", "house.i3d"}
	}
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for _, n := range names {
		w, _ := zw.Create(n)
		fmt.Fprintf(w, "<!-- %s -->", n)
	}
	zw.Close()
	return buf.Bytes()
}

// putModel sends the model files the editor sends after a save.
func putModel(c *client, id string, version int64, files map[string][]byte) *httptest.ResponseRecorder {
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	for _, name := range []string{"obj", "mtl", "mod", "export"} {
		if data, ok := files[name]; ok {
			w, _ := mw.CreateFormFile(name, name)
			w.Write(data)
		}
	}
	mw.Close()
	req := httptest.NewRequest("PUT", fmt.Sprintf("/api/projects/%s/model?version=%d", id, version), &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("Origin", origin)
	return c.send(req)
}

func goodModel(t *testing.T, obj string) map[string][]byte {
	return map[string][]byte{"obj": []byte(obj), "mtl": []byte("newmtl walls\nKd 1 1 1\n"), "mod": modZip(t)}
}

func TestModelFilesAPI(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)
	friend := signupFriend(t, srv, c, "friend@example.se")
	tok := decode[tokenReply](t, c.do("POST", "/api/tokens", map[string]any{"name": "x"})).Token

	p := decode[struct {
		ID           string
		Version      int64
		ModelVersion int64
	}](t, c.do("POST", "/api/projects", map[string]any{"name": "Stugan", "data": map[string]any{"kind": "sheep"}}))

	// not saved with a model yet: listed, but no files
	type listed struct {
		Buildings []struct {
			ID       string
			Version  int64
			HasModel bool
			Mod, Obj string
		}
	}
	l := decode[listed](t, bearer(t, srv, tok, "/api/v1/buildings")).Buildings
	if len(l) != 1 || l[0].HasModel || l[0].Version != p.Version {
		t.Fatalf("listed without a model: %+v", l)
	}
	for _, f := range []string{"model.obj", "model.mtl", "mod.zip", "model.i3d"} {
		expectError(t, bearer(t, srv, tok, "/api/v1/buildings/"+p.ID+"/"+f), 404, "not_found")
	}

	// the editor saves, then sends the model of that version
	saved := decode[struct{ Version int64 }](t, c.do("PATCH", "/api/projects/"+p.ID, map[string]any{"data": map[string]any{"kind": "sheep", "w": 1}}))
	expect(t, putModel(c, p.ID, saved.Version, goodModel(t, "v 1 2 3\n")), 204)
	if g := decode[struct{ ModelVersion int64 }](t, c.do("GET", "/api/projects/"+p.ID, nil)); g.ModelVersion != saved.Version {
		t.Fatalf("the project says its model's version: %+v", g)
	}

	l = decode[listed](t, bearer(t, srv, tok, "/api/v1/buildings")).Buildings
	if !l[0].HasModel || l[0].Version != saved.Version {
		t.Fatalf("listed with the model: %+v", l)
	}
	obj := bearer(t, srv, tok, "/api/v1/buildings/"+p.ID+"/model.obj")
	expect(t, obj, 200)
	if obj.Body.String() != "v 1 2 3\n" || !strings.HasPrefix(obj.Header().Get("Content-Type"), "text/plain") || obj.Header().Get("ETag") == "" || obj.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("obj: %q %v", obj.Body.String(), obj.Header())
	}
	if cc := obj.Header().Get("Cache-Control"); !strings.Contains(cc, "must-revalidate") {
		t.Fatalf("cache: %q", cc)
	}
	if mtl := bearer(t, srv, tok, "/api/v1/buildings/"+p.ID+"/model.mtl"); !strings.HasPrefix(mtl.Body.String(), "newmtl walls") {
		t.Fatalf("mtl: %q", mtl.Body.String())
	}
	mod := bearer(t, srv, tok, "/api/v1/buildings/"+p.ID+"/mod.zip")
	expect(t, mod, 200)
	if mod.Header().Get("Content-Type") != "application/zip" || !bytes.Equal(mod.Body.Bytes(), modZip(t)) || !strings.Contains(mod.Header().Get("Content-Disposition"), "FS25_Stugan.zip") {
		t.Fatalf("mod: %v", mod.Header())
	}
	if i3d := bearer(t, srv, tok, "/api/v1/buildings/"+p.ID+"/model.i3d"); i3d.Body.String() != "<!-- house.i3d -->" {
		t.Fatalf("i3d out of the zip: %q", i3d.Body.String())
	}

	// the editor's full zip has folder entries and textures, and an export zip comes with it
	full := modZip(t, "modDesc.xml", "house.xml", "house.i3d", "textures/", "textures/walls_diffuse.png")
	files := goodModel(t, "v 7 8 9\n")
	files["mod"], files["export"] = full, modZip(t, "stugan/", "stugan/house.i3d")
	expect(t, putModel(c, p.ID, saved.Version, files), 204)
	if g := bearer(t, srv, tok, "/api/v1/buildings/"+p.ID+"/mod.zip"); !bytes.Equal(g.Body.Bytes(), files["export"]) {
		t.Fatal("mod.zip is the export zip")
	}

	// ETag: the same version is not sent twice
	req := httptest.NewRequest("GET", "/api/v1/buildings/"+p.ID+"/model.obj", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("If-None-Match", obj.Header().Get("ETag"))
	if rec := newClient(t, srv).send(req); rec.Code != 304 {
		t.Fatalf("etag: %d", rec.Code)
	}

	// every save is a new version, and the files follow it
	saved2 := decode[struct{ Version int64 }](t, c.do("PATCH", "/api/projects/"+p.ID, map[string]any{"data": map[string]any{"kind": "sheep", "w": 2}}))
	if saved2.Version <= saved.Version {
		t.Fatalf("versions: %d %d", saved.Version, saved2.Version)
	}
	// until the new model arrives the old one is served under its own version
	l = decode[listed](t, bearer(t, srv, tok, "/api/v1/buildings")).Buildings
	if l[0].Version != saved.Version {
		t.Fatalf("version of what is served: %+v", l)
	}
	expectError(t, putModel(c, p.ID, saved.Version, goodModel(t, "old\n")), 409, "version_conflict")
	expect(t, putModel(c, p.ID, saved2.Version, goodModel(t, "v 4 5 6\n")), 204)
	if bearer(t, srv, tok, "/api/v1/buildings/"+p.ID+"/model.obj").Body.String() != "v 4 5 6\n" {
		t.Fatal("new obj")
	}
	if l = decode[listed](t, bearer(t, srv, tok, "/api/v1/buildings")).Buildings; l[0].Version != saved2.Version {
		t.Fatalf("new version: %+v", l)
	}
	// a rename does not make the files stale
	c.do("PATCH", "/api/projects/"+p.ID, map[string]any{"name": "Nytt namn"})
	if l = decode[listed](t, bearer(t, srv, tok, "/api/v1/buildings")).Buildings; l[0].Version != saved2.Version || !l[0].HasModel {
		t.Fatalf("after a rename: %+v", l)
	}

	// not yours
	expectError(t, putModel(friend, p.ID, saved2.Version, goodModel(t, "x\n")), 404, "not_found")
	ftok := decode[tokenReply](t, friend.do("POST", "/api/tokens", map[string]any{"name": "y"})).Token
	expectError(t, bearer(t, srv, ftok, "/api/v1/buildings/"+p.ID+"/model.obj"), 404, "not_found")
	expectError(t, newClient(t, srv).do("GET", "/api/v1/buildings/"+p.ID+"/model.obj", nil), 401, "unauthorized")
}

func TestModelUploadIsChecked(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)
	p := decode[struct {
		ID      string
		Version int64
	}](t, c.do("POST", "/api/projects", map[string]any{"name": "Stugan"}))

	for name, files := range map[string]map[string][]byte{
		"no obj":          {"mtl": []byte("a"), "mod": modZip(t)},
		"no mtl":          {"obj": []byte("a"), "mod": modZip(t)},
		"no mod":          {"obj": []byte("a"), "mtl": []byte("a")},
		"empty obj":       {"obj": nil, "mtl": []byte("a"), "mod": modZip(t)},
		"mod is no zip":   {"obj": []byte("a"), "mtl": []byte("a"), "mod": []byte("not a zip")},
		"mod lacks files": {"obj": []byte("a"), "mtl": []byte("a"), "mod": modZip(t, "modDesc.xml")},
		"mod has a path":  {"obj": []byte("a"), "mtl": []byte("a"), "mod": modZip(t, "modDesc.xml", "house.xml", "house.i3d", "../evil")},
	} {
		if rec := putModel(c, p.ID, p.Version, files); rec.Code != 400 {
			t.Errorf("%s: %d %s", name, rec.Code, rec.Body.String())
		}
	}
	for _, v := range []string{"", "abc", "0"} {
		req := httptest.NewRequest("PUT", "/api/projects/"+p.ID+"/model?version="+v, strings.NewReader(""))
		req.Header.Set("Origin", origin)
		if rec := c.send(req); rec.Code != 400 && rec.Code != 415 {
			t.Errorf("version %q: %d", v, rec.Code)
		}
	}
	// the app's own origin only, like every change
	req := httptest.NewRequest("PUT", fmt.Sprintf("/api/projects/%s/model?version=%d", p.ID, p.Version), strings.NewReader(""))
	req.Header.Set("Origin", "https://evil.example")
	expectError(t, c.send(req), 403, "bad_origin")
	expectError(t, putModel(newClient(t, srv), p.ID, p.Version, goodModel(t, "x")), 401, "unauthorized")
}
