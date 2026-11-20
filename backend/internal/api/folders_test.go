package api

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http/httptest"
	"strings"
	"testing"
)

// tokenCall sends a request with a token and no session (a program, not the app): JSON body if there is one.
func tokenCall(t *testing.T, srv *Server, token, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var rd *bytes.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	} else {
		rd = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, rd)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return newClient(t, srv).send(req)
}

// newMultipart writes the model files as the form the editor sends and returns its Content-Type.
func newMultipart(body *bytes.Buffer, files map[string][]byte) string {
	mw := multipart.NewWriter(body)
	for _, name := range []string{"obj", "mtl", "mod", "export"} {
		if data, ok := files[name]; ok {
			w, _ := mw.CreateFormFile(name, name)
			w.Write(data)
		}
	}
	mw.Close()
	return mw.FormDataContentType()
}

type genBuilding struct {
	ID        string
	Name      string
	Kind      string
	Folder    string
	SourceID  string
	Generated bool
	Edited    bool
	Version   int64
	HasModel  bool
}
type genReply struct {
	Status   string
	Building genBuilding
}

func makeToken(t *testing.T, c *client, name string, write bool) string {
	t.Helper()
	return decode[tokenReply](t, c.do("POST", "/api/tokens", map[string]any{"name": name, "write": write})).Token
}

func TestWriteTokenIsMadeOnPurpose(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)
	r := decode[struct{ Write bool }](t, c.do("POST", "/api/tokens", map[string]any{"name": "Läsare"}))
	w := decode[struct{ Write bool }](t, c.do("POST", "/api/tokens", map[string]any{"name": "Kartan", "write": true}))
	if r.Write || !w.Write {
		t.Fatalf("a token reads unless made to write: read=%v write=%v", r.Write, w.Write)
	}
	list := decode[[]struct {
		Name  string
		Write bool
	}](t, c.do("GET", "/api/tokens", nil))
	got := map[string]bool{}
	for _, x := range list {
		got[x.Name] = x.Write
	}
	if got["Läsare"] || !got["Kartan"] {
		t.Fatalf("listed: %+v", list)
	}
}

func TestGenerateBuildingsWithAToken(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)
	read, write := makeToken(t, c, "Läsare", false), makeToken(t, c, "Kartan", true)
	in := map[string]any{"folder": "Hallsberg", "sourceId": "way/1", "name": "Storgatan 4", "settings": map[string]any{"kind": "house", "width": 10}}

	// a reading token may not
	expectError(t, tokenCall(t, srv, read, "POST", "/api/v1/buildings", in), 403, "forbidden")
	expectError(t, tokenCall(t, srv, "", "POST", "/api/v1/buildings", in), 401, "unauthorized")

	rec := tokenCall(t, srv, write, "POST", "/api/v1/buildings", in)
	expect(t, rec, 201)
	a := decode[genReply](t, rec)
	if a.Status != "created" || a.Building.Folder != "Hallsberg" || a.Building.SourceID != "way/1" || !a.Building.Generated || a.Building.Edited || a.Building.Version != 1 || a.Building.Kind != "house" || a.Building.HasModel {
		t.Fatalf("created: %+v", a)
	}

	// again: the same building, made again (200, not 201)
	in["name"], in["settings"] = "Storgatan 5", map[string]any{"kind": "house", "width": 12}
	rec = tokenCall(t, srv, write, "POST", "/api/v1/buildings", in)
	expect(t, rec, 200)
	b := decode[genReply](t, rec)
	if b.Status != "updated" || b.Building.ID != a.Building.ID || b.Building.Version != 2 || b.Building.Name != "Storgatan 5" {
		t.Fatalf("updated: %+v", b)
	}
	if list := decode[struct{ Buildings []genBuilding }](t, tokenCall(t, srv, read, "GET", "/api/v1/buildings", nil)).Buildings; len(list) != 1 {
		t.Fatalf("one building: %+v", list)
	}

	// a person changes it in the app: it is left alone
	expect(t, c.do("PATCH", "/api/projects/"+a.Building.ID, map[string]any{"name": "Min stuga", "data": map[string]any{"kind": "house", "width": 99}, "version": b.Building.Version}), 200)
	rec = tokenCall(t, srv, write, "POST", "/api/v1/buildings", in)
	expect(t, rec, 200)
	k := decode[genReply](t, rec)
	if k.Status != "kept" || !k.Building.Edited || k.Building.Name != "Min stuga" {
		t.Fatalf("kept: %+v", k)
	}
}

func TestGenerateInputIsChecked(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)
	w := makeToken(t, c, "Kartan", true)
	ok := func() map[string]any {
		return map[string]any{"folder": "Hallsberg", "sourceId": "way/1", "name": "Hus", "settings": map[string]any{"kind": "house"}}
	}
	for _, x := range []struct{ field, code string }{
		{"folder", "invalid_folder"}, {"sourceId", "invalid_source_id"}, {"name", "invalid_name"}, {"settings", "invalid_data"},
	} {
		in := ok()
		delete(in, x.field)
		expectError(t, tokenCall(t, srv, w, "POST", "/api/v1/buildings", in), 400, x.code)
	}
	for _, x := range []struct {
		field string
		value any
		code  string
	}{
		{"folder", strings.Repeat("a", 81), "invalid_folder"}, {"folder", "  ", "invalid_folder"}, {"folder", "a\nb", "invalid_folder"},
		{"sourceId", strings.Repeat("a", 201), "invalid_source_id"}, {"settings", "not an object", "invalid_data"}, {"settings", []int{1}, "invalid_data"},
		{"name", strings.Repeat("a", 101), "invalid_name"},
	} {
		in := ok()
		in[x.field] = x.value
		expectError(t, tokenCall(t, srv, w, "POST", "/api/v1/buildings", in), 400, x.code)
	}
	// a folder is trimmed
	in := ok()
	in["folder"] = "  Hallsberg  "
	if r := decode[genReply](t, tokenCall(t, srv, w, "POST", "/api/v1/buildings", in)); r.Building.Folder != "Hallsberg" {
		t.Fatalf("trimmed: %+v", r)
	}
	// and nothing was made by the refused ones
	if list := decode[struct{ Buildings []genBuilding }](t, tokenCall(t, srv, w, "GET", "/api/v1/buildings", nil)).Buildings; len(list) != 1 {
		t.Fatalf("only the good one: %+v", list)
	}
}

func TestWriteTokenSendsTheModel(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)
	other := signupFriend(t, srv, c, "friend@example.se")
	read, write := makeToken(t, c, "Läsare", false), makeToken(t, c, "Kartan", true)
	g := decode[genReply](t, tokenCall(t, srv, write, "POST", "/api/v1/buildings", map[string]any{"folder": "H", "sourceId": "way/1", "name": "Hus", "settings": map[string]any{"kind": "house"}})).Building

	send := func(token string) *httptest.ResponseRecorder {
		var body bytes.Buffer
		files := goodModel(t, "o Hus\n")
		mw := newMultipart(&body, files)
		req := httptest.NewRequest("PUT", "/api/v1/buildings/"+g.ID+"/model?version=1", &body)
		req.Header.Set("Content-Type", mw)
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		return newClient(t, srv).send(req)
	}
	expectError(t, send(read), 403, "forbidden")
	expectError(t, send(""), 401, "unauthorized")
	expect(t, send(write), 204)
	got := decode[struct{ Buildings []genBuilding }](t, tokenCall(t, srv, read, "GET", "/api/v1/buildings", nil)).Buildings
	if len(got) != 1 || !got[0].HasModel {
		t.Fatalf("it has its model now: %+v", got)
	}
	if rec := tokenCall(t, srv, read, "GET", "/api/v1/buildings/"+g.ID+"/model.obj", nil); rec.Code != 200 || !strings.Contains(rec.Body.String(), "Hus") {
		t.Fatalf("the model: %d %s", rec.Code, rec.Body.String())
	}
	// not someone else's building
	otherWrite := makeToken(t, other, "Annans", true)
	expectError(t, send(otherWrite), 404, "not_found")
}

func TestFoldersInTheAPI(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)
	read, write := makeToken(t, c, "Läsare", false), makeToken(t, c, "Kartan", true)
	for _, x := range [][2]string{{"Hallsberg", "way/1"}, {"Hallsberg", "way/2"}, {"Askersund", "way/1"}} {
		expect(t, tokenCall(t, srv, write, "POST", "/api/v1/buildings", map[string]any{"folder": x[0], "sourceId": x[1], "name": x[1], "settings": map[string]any{"kind": "house"}}), 201)
	}
	expect(t, c.do("POST", "/api/projects", map[string]any{"name": "Egen", "data": map[string]any{"kind": "house"}}), 201)

	list := func(q string) []genBuilding {
		return decode[struct{ Buildings []genBuilding }](t, tokenCall(t, srv, read, "GET", "/api/v1/buildings"+q, nil)).Buildings
	}
	if n := len(list("")); n != 4 {
		t.Fatalf("all: %d", n)
	}
	if n := len(list("?folder=Hallsberg")); n != 2 {
		t.Fatalf("Hallsberg: %d", n)
	}
	if n := len(list("?folder=Nowhere")); n != 0 {
		t.Fatalf("a folder with nothing: %d", n)
	}
	if l := list("?folder="); len(l) != 1 || l[0].Name != "Egen" {
		t.Fatalf("the ones in no folder: %+v", l)
	}
	folders := decode[struct {
		Folders []struct {
			Name  string
			Count int
		}
	}](t, tokenCall(t, srv, read, "GET", "/api/v1/folders", nil)).Folders
	if len(folders) != 2 || folders[0].Name != "Askersund" || folders[0].Count != 1 || folders[1].Name != "Hallsberg" || folders[1].Count != 2 {
		t.Fatalf("folders: %+v", folders)
	}
	// one building, with its folder and where it came from
	one := decode[genBuilding](t, tokenCall(t, srv, read, "GET", "/api/v1/buildings/"+list("?folder=Askersund")[0].ID, nil))
	if one.Folder != "Askersund" || one.SourceID != "way/1" || !one.Generated {
		t.Fatalf("one: %+v", one)
	}
}

func TestFoldersInTheApp(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)
	p := decode[struct {
		ID      string
		Folder  string
		Version int64
	}](t, c.do("POST", "/api/projects", map[string]any{"name": "Ladan", "data": map[string]any{"kind": "house"}}))
	if p.Folder != "" {
		t.Fatalf("a new building is in no folder: %q", p.Folder)
	}
	moved := decode[struct {
		Folder  string
		Version int64
	}](t, c.do("PATCH", "/api/projects/"+p.ID, map[string]any{"folder": "Hallsberg", "version": p.Version}))
	if moved.Folder != "Hallsberg" {
		t.Fatalf("moved: %+v", moved)
	}
	list := decode[[]struct{ Folder string }](t, c.do("GET", "/api/projects", nil))
	if len(list) != 1 || list[0].Folder != "Hallsberg" {
		t.Fatalf("the list says the folder: %+v", list)
	}
	expectError(t, c.do("PATCH", "/api/projects/"+p.ID, map[string]any{"folder": strings.Repeat("a", 81), "version": moved.Version}), 400, "invalid_folder")
	// out of the folder again: an empty name
	if out := decode[struct{ Folder string }](t, c.do("PATCH", "/api/projects/"+p.ID, map[string]any{"folder": "", "version": moved.Version})); out.Folder != "" {
		t.Fatalf("out of the folder: %+v", out)
	}
}

func TestTokensMayCallFromOtherSites(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)
	w := makeToken(t, c, "Kartan", true)
	req := httptest.NewRequest("POST", "/api/v1/buildings", strings.NewReader(`{"folder":"H","sourceId":"a","name":"x","settings":{"kind":"house"}}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+w)
	req.Header.Set("Origin", "https://karta.example.org")
	expect(t, newClient(t, srv).send(req), 201)
	// the app's own routes still refuse another site
	req = httptest.NewRequest("POST", "/api/projects", strings.NewReader(`{"name":"x"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "https://karta.example.org")
	expectError(t, c.send(req), 403, "bad_origin")
}

func TestTokensCannotDelete(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)
	w := makeToken(t, c, "Kartan", true)
	g := decode[genReply](t, tokenCall(t, srv, w, "POST", "/api/v1/buildings", map[string]any{"folder": "H", "sourceId": "a", "name": "x", "settings": map[string]any{"kind": "house"}})).Building
	if rec := tokenCall(t, srv, w, "DELETE", "/api/v1/buildings/"+g.ID, nil); rec.Code < 400 {
		t.Fatalf("a token deleted a building: %d", rec.Code)
	}
	if list := decode[[]struct{ ID string }](t, c.do("GET", "/api/projects", nil)); len(list) != 1 {
		t.Fatalf("it is still there: %+v", list)
	}
}

func TestRenameFolderInTheAPI(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)
	read, write := makeToken(t, c, "Läsare", false), makeToken(t, c, "Kartan", true)
	for _, x := range [][2]string{{"Hallsberg", "way/1"}, {"Hallsberg", "way/2"}, {"Askersund", "way/1"}} {
		expect(t, tokenCall(t, srv, write, "POST", "/api/v1/buildings", map[string]any{"folder": x[0], "sourceId": x[1], "name": x[1], "settings": map[string]any{"kind": "house"}}), 201)
	}
	rename := func(token string, from, to string) *httptest.ResponseRecorder {
		return tokenCall(t, srv, token, "POST", "/api/v1/folders/rename", map[string]any{"from": from, "to": to})
	}
	expect(t, rename(read, "Hallsberg", "X"), 403)
	expectError(t, rename(write, "Hallsberg", ""), 400, "invalid_folder")
	expectError(t, rename(write, "", "X"), 400, "invalid_folder")
	expectError(t, rename(write, "Hallsberg", "Hallsberg"), 400, "invalid_folder")
	expectError(t, rename(write, "Nowhere", "X"), 404, "not_found")
	expectError(t, rename(write, "Hallsberg", "Askersund"), 409, "folder_exists")

	got := decode[struct {
		Name  string
		Count int
	}](t, rename(write, "Hallsberg", "Hallsberg 2026"))
	if got.Name != "Hallsberg 2026" || got.Count != 2 {
		t.Fatalf("answer: %+v", got)
	}
	folders := decode[struct{ Folders []struct{ Name string } }](t, tokenCall(t, srv, read, "GET", "/api/v1/folders", nil)).Folders
	if len(folders) != 2 || folders[0].Name != "Askersund" || folders[1].Name != "Hallsberg 2026" {
		t.Fatalf("folders: %+v", folders)
	}
}

func TestMovingAGeneratedBuildingInTheApp(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)
	write := makeToken(t, c, "Kartan", true)
	made := decode[struct{ Building genBuilding }](t, tokenCall(t, srv, write, "POST", "/api/v1/buildings", map[string]any{"folder": "Hallsberg", "sourceId": "way/1", "name": "A", "settings": map[string]any{"kind": "house"}}))
	expect(t, tokenCall(t, srv, write, "POST", "/api/v1/buildings", map[string]any{"folder": "Askersund", "sourceId": "way/1", "name": "B", "settings": map[string]any{"kind": "house"}}), 201)
	id := made.Building.ID
	moved := decode[struct {
		Folder  string
		Version int64
		Edited  bool
	}](t, c.do("PATCH", "/api/projects/"+id, map[string]any{"folder": "Örebro"}))
	if moved.Folder != "Örebro" || moved.Edited {
		t.Fatalf("moved: %+v", moved)
	}
	expectError(t, c.do("PATCH", "/api/projects/"+id, map[string]any{"folder": "Askersund"}), 409, "folder_clash")
}
