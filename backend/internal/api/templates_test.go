package api

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http/httptest"
	"net/textproto"
	"strings"
	"testing"

	"building-creator-fs25/backend/internal/store"
	"building-creator-fs25/backend/internal/vision"
)

var (
	jpeg = append([]byte{0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 'J', 'F', 'I', 'F', 0}, make([]byte, 64)...)
	png  = append([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}, make([]byte, 64)...)
)

type photoForm struct {
	kind, name, blurb string
	photos            [][]byte
}

// newTemplate posts the wizard's first steps: a multipart form with kind, name, blurb and photos.
func (c *client) newTemplate(f photoForm) *httptest.ResponseRecorder {
	c.t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	mw.WriteField("kind", f.kind)
	mw.WriteField("name", f.name)
	mw.WriteField("blurb", f.blurb)
	for i, p := range f.photos {
		h := textproto.MIMEHeader{}
		h.Set("Content-Disposition", `form-data; name="photos"; filename="photo`+string(rune('0'+i))+`.jpg"`)
		h.Set("Content-Type", "image/jpeg")
		fw, _ := mw.CreatePart(h)
		fw.Write(p)
	}
	mw.Close()
	req := httptest.NewRequest("POST", "/api/admin/templates", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("Origin", origin)
	return c.send(req)
}

type fakeVision struct {
	got    vision.Request
	answer string
	err    error
}

func (f *fakeVision) Suggest(ctx context.Context, req vision.Request) (json.RawMessage, error) {
	f.got = req
	return json.RawMessage(f.answer), f.err
}

func barn() photoForm {
	return photoForm{kind: "cow", name: "Ladugård i Dalarna", blurb: "Long and red.", photos: [][]byte{jpeg, png}}
}

func TestTemplateWizard(t *testing.T) {
	fv := &fakeVision{answer: `{"seen":"a red barn","settings":{"width":30},"openings":[],"notes":"check the doors"}`}
	srv := newTestServer(t, func(c *Config) { c.Vision = fv })
	admin := signupAdmin(t, srv)

	rec := admin.newTemplate(barn())
	expect(t, rec, 201)
	tp := decode[store.Template](t, rec)
	if tp.Kind != "cow" || tp.Name != "Ladugård i Dalarna" || tp.Photos != 2 || tp.Published {
		t.Fatalf("created: %+v", tp)
	}

	rec = admin.do("GET", "/api/templates/"+tp.ID+"/photos/1", nil)
	expect(t, rec, 200)
	if rec.Header().Get("Content-Type") != "image/png" || !bytes.Equal(rec.Body.Bytes(), png) {
		t.Fatalf("the photo comes back as it was sent, with its real type: %q", rec.Header().Get("Content-Type"))
	}

	schema := map[string]any{"type": "object"}
	rec = admin.do("POST", "/api/admin/templates/"+tp.ID+"/suggest", map[string]any{"guide": "width: front wall", "notes": "30 m long", "schema": schema})
	expect(t, rec, 200)
	tp = decode[store.Template](t, rec)
	if !strings.Contains(string(tp.Suggestion), "check the doors") {
		t.Fatalf("the suggestion is kept with the template: %s", tp.Suggestion)
	}
	if fv.got.Kind != "cow" || fv.got.Guide != "width: front wall" || fv.got.Notes != "30 m long" || len(fv.got.Photos) != 2 ||
		fv.got.Photos[0].Type != "image/jpeg" || !bytes.Equal(fv.got.Photos[1].Data, png) || string(fv.got.Schema) != `{"type":"object"}` {
		t.Fatalf("Claude gets the photos, guide, notes and schema: %+v", fv.got)
	}

	fv.err = vision.Error("Claude declined to read these photos. Try other photos.")
	rec = admin.do("POST", "/api/admin/templates/"+tp.ID+"/suggest", map[string]any{"guide": "g", "schema": schema})
	expectError(t, rec, 502, "vision_failed")
	if !strings.Contains(decode[apiError](t, rec).Message, "declined") {
		t.Fatal("Claude's own failures are shown as they are")
	}

	rec = admin.do("PATCH", "/api/admin/templates/"+tp.ID, map[string]any{"published": true})
	expectError(t, rec, 400, "no_settings")

	rec = admin.do("PATCH", "/api/admin/templates/"+tp.ID, map[string]any{
		"settings": map[string]any{"kind": "cow", "width": 30}, "thumbnail": "data:image/png;base64,AAAA", "projectId": "p1", "published": true, "name": "Dalaladugård",
	})
	expect(t, rec, 200)
	tp = decode[store.Template](t, rec)
	if !tp.Published || tp.Name != "Dalaladugård" || tp.ProjectID != "p1" || !strings.Contains(string(tp.Settings), `"width":30`) {
		t.Fatalf("published: %+v", tp)
	}
	expectError(t, admin.do("PATCH", "/api/admin/templates/"+tp.ID, map[string]any{"thumbnail": "javascript:x"}), 400, "invalid_thumbnail")
	expectError(t, admin.do("PATCH", "/api/admin/templates/"+tp.ID, map[string]any{"settings": []int{1}}), 400, "invalid_settings")

	// Everyone sees what's published.
	friend := signupFriend(t, srv, admin, "van@example.se")
	list := decode[[]store.Template](t, friend.do("GET", "/api/templates", nil))
	if len(list) != 1 || list[0].ID != tp.ID {
		t.Fatalf("published templates are for everyone: %+v", list)
	}
	expect(t, friend.do("GET", "/api/templates/"+tp.ID+"/photos/0", nil), 200)

	expect(t, admin.do("PATCH", "/api/admin/templates/"+tp.ID, map[string]any{"published": false}), 200)
	if list := decode[[]store.Template](t, friend.do("GET", "/api/templates", nil)); len(list) != 0 {
		t.Fatal("drafts aren't for everyone")
	}
	expect(t, friend.do("GET", "/api/templates/"+tp.ID+"/photos/0", nil), 404)
	if list := decode[[]store.Template](t, admin.do("GET", "/api/admin/templates", nil)); len(list) != 1 {
		t.Fatal("the admin sees drafts")
	}

	// Only the admin makes them.
	expectError(t, friend.newTemplate(barn()), 403, "forbidden")
	expectError(t, friend.do("POST", "/api/admin/templates/"+tp.ID+"/suggest", map[string]any{"guide": "g", "schema": schema}), 403, "forbidden")
	expectError(t, friend.do("PATCH", "/api/admin/templates/"+tp.ID, map[string]any{"published": true}), 403, "forbidden")
	expectError(t, friend.do("DELETE", "/api/admin/templates/"+tp.ID, nil), 403, "forbidden")

	expect(t, admin.do("DELETE", "/api/admin/templates/"+tp.ID, nil), 204)
	expect(t, admin.do("GET", "/api/admin/templates/"+tp.ID, nil), 404)
}

func TestTemplateValidation(t *testing.T) {
	srv := newTestServer(t)
	admin := signupAdmin(t, srv)
	bad := func(edit func(*photoForm), code string) {
		t.Helper()
		f := barn()
		edit(&f)
		expectError(t, admin.newTemplate(f), 400, code)
	}
	bad(func(f *photoForm) { f.name = "" }, "invalid_name")
	bad(func(f *photoForm) { f.kind = "Cow; drop" }, "invalid_kind")
	bad(func(f *photoForm) { f.blurb = strings.Repeat("x", 301) }, "invalid_blurb")
	bad(func(f *photoForm) { f.photos = nil }, "invalid_photos")
	bad(func(f *photoForm) { f.photos = [][]byte{[]byte("<svg onload=alert(1)>")} }, "invalid_photos")
	bad(func(f *photoForm) {
		f.photos = nil
		for range maxTemplatePhotos + 1 {
			f.photos = append(f.photos, jpeg)
		}
	}, "invalid_photos")

	rec := admin.newTemplate(barn())
	expect(t, rec, 201)
	tp := decode[store.Template](t, rec)
	expectError(t, admin.do("POST", "/api/admin/templates/"+tp.ID+"/suggest", map[string]any{"guide": "g", "schema": map[string]any{}}), 503, "vision_off")
	expect(t, admin.do("GET", "/api/templates/"+tp.ID+"/photos/9", nil), 404)
	expect(t, admin.do("GET", "/api/templates/"+tp.ID+"/photos/x", nil), 404)
}

func TestTemplatePastedAnswer(t *testing.T) {
	srv := newTestServer(t)
	admin := signupAdmin(t, srv)
	if decode[map[string]bool](t, admin.do("GET", "/api/admin/vision", nil))["enabled"] {
		t.Fatal("no key: the API option is off")
	}
	tp := decode[store.Template](t, admin.newTemplate(barn()))
	rec := admin.do("PATCH", "/api/admin/templates/"+tp.ID, map[string]any{"suggestion": map[string]any{"seen": "an L", "settings": map[string]any{"wing": true}}})
	expect(t, rec, 200)
	if got := decode[store.Template](t, rec); !strings.Contains(string(got.Suggestion), `"an L"`) {
		t.Fatalf("an answer pasted from a chat is kept like Claude's: %s", got.Suggestion)
	}
	expectError(t, admin.do("PATCH", "/api/admin/templates/"+tp.ID, map[string]any{"suggestion": "text"}), 400, "invalid_suggestion")
	friend := signupFriend(t, srv, admin, "van@example.se")
	expectError(t, friend.do("GET", "/api/admin/vision", nil), 403, "forbidden")

	on := newTestServer(t, func(c *Config) { c.Vision = &fakeVision{} })
	if !decode[map[string]bool](t, signupAdmin(t, on).do("GET", "/api/admin/vision", nil))["enabled"] {
		t.Fatal("with a key: the API option is on")
	}
}
