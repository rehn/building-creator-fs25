package api

import (
	"bytes"
	"mime/multipart"
	"net/http/httptest"
	"testing"

	"building-creator-fs25/backend/internal/store"
)

func (c *client) putTexture(id string, f texForm) *httptest.ResponseRecorder {
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
	req := httptest.NewRequest("PUT", "/api/textures/"+id, &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("Origin", origin)
	return c.send(req)
}

// A texture that was saved is edited again: the editor sends the finished maps and the new picture, and they replace the old ones; the name and the real size stay unless sent.
func TestReplaceTextureAPI(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)
	friend := signupFriend(t, srv, c, "friend@example.se")
	tx := decode[store.Texture](t, c.postTexture(goodTexture()))

	edited := texForm{
		fields: map[string]string{"size": "512", "thumb": "data:image/jpeg;base64,BBBB"},
		files:  map[string][]byte{"diffuse": dds(512, 7), "normal": dds(512, 8), "specular": dds(512, 9)},
	}
	rec := c.putTexture(tx.ID, edited)
	expect(t, rec, 200)
	got := decode[store.Texture](t, rec)
	if got.ID != tx.ID || got.Size != 512 || got.Name != tx.Name || got.Meters != tx.Meters || got.Thumb != "data:image/jpeg;base64,BBBB" {
		t.Fatalf("replaced: %+v", got)
	}
	if rec = c.do("GET", "/api/textures/"+tx.ID+"/diffuse", nil); !bytes.Equal(rec.Body.Bytes(), dds(512, 7)) {
		t.Fatal("the new diffuse map comes back")
	}

	// the name and the size can come with it
	edited.fields["name"], edited.fields["meters"] = "Plåt, rättad", "2.5"
	if got = decode[store.Texture](t, c.putTexture(tx.ID, edited)); got.Name != "Plåt, rättad" || got.Meters != 2.5 {
		t.Fatalf("with a name and a size: %+v", got)
	}

	// what is wrong is refused and nothing changes
	bad := texForm{fields: map[string]string{"size": "256", "thumb": "data:image/jpeg;base64,BBBB"}, files: edited.files} // (the maps are 512)
	expectError(t, c.putTexture(tx.ID, bad), 400, "invalid_files")
	expectError(t, c.putTexture(tx.ID, texForm{fields: map[string]string{"size": "100", "thumb": "data:image/jpeg;base64,BBBB"}, files: edited.files}), 400, "invalid_size")
	expectError(t, c.putTexture(tx.ID, texForm{fields: map[string]string{"size": "512", "thumb": "http://x/y.png"}, files: edited.files}), 400, "invalid_thumb")
	expectError(t, c.putTexture(tx.ID, texForm{fields: map[string]string{"size": "512", "thumb": "data:image/jpeg;base64,BBBB", "meters": "0"}, files: edited.files}), 400, "invalid_meters")
	expectError(t, c.putTexture(tx.ID, texForm{fields: map[string]string{"size": "512", "thumb": "data:image/jpeg;base64,BBBB", "name": "  "}, files: edited.files}), 400, "invalid_name")
	if rec = c.do("GET", "/api/textures/"+tx.ID+"/diffuse", nil); !bytes.Equal(rec.Body.Bytes(), dds(512, 7)) {
		t.Fatal("a refused edit changed nothing")
	}
	// someone else's, and one that is not there
	expectError(t, friend.putTexture(tx.ID, edited), 404, "not_found")
	expectError(t, c.putTexture("nope", edited), 404, "not_found")
}
