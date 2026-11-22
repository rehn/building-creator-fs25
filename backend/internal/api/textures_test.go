package api

import (
	"bytes"
	"encoding/binary"
	"mime/multipart"
	"net/http/httptest"
	"strings"
	"testing"

	"building-creator-fs25/backend/internal/store"
)

// dds is a stand-in DDS file: the header the API checks (magic, height, width) and some bytes.
func dds(side int, fill byte) []byte {
	b := make([]byte, 128+64)
	copy(b, "DDS ")
	binary.LittleEndian.PutUint32(b[4:], 124)
	binary.LittleEndian.PutUint32(b[12:], uint32(side))
	binary.LittleEndian.PutUint32(b[16:], uint32(side))
	for i := 128; i < len(b); i++ {
		b[i] = fill
	}
	return b
}

type texForm struct {
	fields map[string]string
	files  map[string][]byte
}

func goodTexture() texForm {
	return texForm{
		fields: map[string]string{"name": "Rostig plåt", "size": "256", "meters": "1.5", "thumb": "data:image/jpeg;base64,AAAA"},
		files:  map[string][]byte{"diffuse": dds(256, 1), "normal": dds(256, 2), "specular": dds(256, 3)},
	}
}

func (c *client) postTexture(f texForm) *httptest.ResponseRecorder {
	c.t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	for k, v := range f.fields {
		mw.WriteField(k, v)
	}
	for k, v := range f.files {
		fw, _ := mw.CreateFormFile(k, k+".dds")
		fw.Write(v)
	}
	mw.Close()
	req := httptest.NewRequest("POST", "/api/textures", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("Origin", origin)
	return c.send(req)
}

func TestTextureLifecycleAPI(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)
	rec := c.postTexture(goodTexture())
	expect(t, rec, 201)
	tx := decode[store.Texture](t, rec)
	if tx.Name != "Rostig plåt" || tx.Size != 256 || tx.Meters != 1.5 || tx.Thumb == "" {
		t.Fatalf("created: %+v", tx)
	}
	if list := decode[[]store.Texture](t, c.do("GET", "/api/textures", nil)); len(list) != 1 || list[0].ID != tx.ID {
		t.Fatalf("list: %+v", list)
	}
	rec = c.do("GET", "/api/textures/"+tx.ID+"/normal", nil)
	expect(t, rec, 200)
	if !bytes.Equal(rec.Body.Bytes(), dds(256, 2)) {
		t.Fatal("the normal map comes back as it went in")
	}
	rec = c.do("PATCH", "/api/textures/"+tx.ID, map[string]any{"name": "Plåt", "meters": 2.0})
	expect(t, rec, 200)
	if q := decode[store.Texture](t, rec); q.Name != "Plåt" || q.Meters != 2 {
		t.Fatalf("changed: %+v", q)
	}
	expect(t, c.do("DELETE", "/api/textures/"+tx.ID, nil), 204)
	expectError(t, c.do("GET", "/api/textures/"+tx.ID+"/diffuse", nil), 404, "not_found")
	expectError(t, c.do("DELETE", "/api/textures/"+tx.ID, nil), 404, "not_found")
}

func TestTextureValidation(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)
	bad := func(code string, mut func(f *texForm)) {
		t.Helper()
		f := goodTexture()
		mut(&f)
		expectError(t, c.postTexture(f), 400, code)
	}
	bad("invalid_name", func(f *texForm) { f.fields["name"] = "  " })
	bad("invalid_name", func(f *texForm) { f.fields["name"] = strings.Repeat("x", 101) })
	bad("invalid_size", func(f *texForm) { f.fields["size"] = "300" })
	bad("invalid_size", func(f *texForm) { f.fields["size"] = "32" })
	bad("invalid_size", func(f *texForm) { f.fields["size"] = "4096" })
	bad("invalid_size", func(f *texForm) { f.fields["size"] = "abc" })
	bad("invalid_meters", func(f *texForm) { f.fields["meters"] = "0" })
	bad("invalid_meters", func(f *texForm) { f.fields["meters"] = "-1" })
	bad("invalid_meters", func(f *texForm) { f.fields["meters"] = "1000" })
	bad("invalid_meters", func(f *texForm) { f.fields["meters"] = "x" })
	bad("invalid_thumb", func(f *texForm) { f.fields["thumb"] = "http://evil/x.jpg" })
	bad("invalid_thumb", func(f *texForm) { f.fields["thumb"] = "data:image/jpeg;base64," + strings.Repeat("A", 300<<10) })
	bad("invalid_files", func(f *texForm) { delete(f.files, "specular") })
	bad("invalid_files", func(f *texForm) { f.files["diffuse"] = []byte("not a dds file at all, just text") })
	bad("invalid_files", func(f *texForm) { f.files["normal"] = dds(128, 2) }) // a different size than the form says
	bad("invalid_files", func(f *texForm) { f.files["diffuse"] = dds(256, 1)[:100] })

	// not a form
	req := httptest.NewRequest("POST", "/api/textures", strings.NewReader(`{"name":"x"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", origin)
	expectError(t, c.send(req), 415, "unsupported_media_type")
}

func TestTexturesArePrivateAPI(t *testing.T) {
	srv := newTestServer(t)
	admin := signupAdmin(t, srv)
	tx := decode[store.Texture](t, admin.postTexture(goodTexture()))
	friend := signupFriend(t, srv, admin, "friend@example.se")
	if list := decode[[]store.Texture](t, friend.do("GET", "/api/textures", nil)); len(list) != 0 {
		t.Fatal("another user sees the texture")
	}
	expectError(t, friend.do("GET", "/api/textures/"+tx.ID+"/diffuse", nil), 404, "not_found")
	expectError(t, friend.do("PATCH", "/api/textures/"+tx.ID, map[string]any{"name": "Mine"}), 404, "not_found")
	expectError(t, friend.do("DELETE", "/api/textures/"+tx.ID, nil), 404, "not_found")
	expectError(t, newClient(t, srv).do("GET", "/api/textures", nil), 401, "unauthorized")
}

func TestTextureLimitPerUser(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)
	for i := 0; i < maxTexturesPerUser; i++ {
		if _, err := srv.st.CreateTexture(t.Context(), 1, store.TextureData{Name: "t", Size: 64, Meters: 1, Thumb: "", Diffuse: []byte{1}, Normal: []byte{1}, Specular: []byte{1}}); err != nil {
			t.Fatal(err)
		}
	}
	expectError(t, c.postTexture(goodTexture()), 409, "too_many")
}
