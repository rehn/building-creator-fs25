package api

import (
	"strings"
	"testing"

	"building-creator-fs25/backend/internal/store"
)

// The preview picture of a mod: sent with PATCH like a building's, only a small JPEG or PNG, shown in the list; a picture alone does not change the mod's version.
func TestModThumbnailAPI(t *testing.T) {
	srv := newTestServer(t)
	c := signupAdmin(t, srv)
	m := decode[store.Mod](t, c.do("POST", "/api/mods", map[string]any{"name": "Gården"}))

	expectError(t, c.do("PATCH", "/api/mods/"+m.ID, map[string]any{"thumbnail": "http://example.com/x.png", "version": m.Version}), 400, "invalid_thumbnail")
	expectError(t, c.do("PATCH", "/api/mods/"+m.ID, map[string]any{"thumbnail": "data:image/jpeg;base64," + strings.Repeat("A", 400<<10), "version": m.Version}), 400, "invalid_thumbnail")
	pic := "data:image/jpeg;base64,AAAA"
	got := decode[store.Mod](t, c.do("PATCH", "/api/mods/"+m.ID, map[string]any{"thumbnail": pic, "version": m.Version}))
	if got.Thumbnail != pic || got.Version != m.Version {
		t.Fatalf("saved: %+v", got)
	}
	list := decode[[]store.Mod](t, c.do("GET", "/api/mods", nil))
	if len(list) != 1 || list[0].Thumbnail != pic {
		t.Fatalf("the list: %+v", list)
	}
}
