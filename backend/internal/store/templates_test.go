package store

import (
	"bytes"
	"encoding/json"
	"errors"
	"testing"
)

func barnPhotos() []TemplatePhoto {
	return []TemplatePhoto{
		{Type: "image/jpeg", Data: []byte{0xff, 0xd8, 0xff, 0x01}},
		{Type: "image/png", Data: []byte{0x89, 'P', 'N', 'G'}},
	}
}

func TestTemplateLifecycle(t *testing.T) {
	s := openTest(t)
	admin := mustUser(t, s, "admin@example.se")
	tp, err := s.CreateTemplate(ctx, admin.ID, TemplateInput{Kind: "cow", Name: "Ladugård i Dalarna", Blurb: "Red, long and low."}, barnPhotos())
	if err != nil {
		t.Fatal(err)
	}
	if tp.ID == "" || tp.Kind != "cow" || tp.Name != "Ladugård i Dalarna" || tp.Blurb != "Red, long and low." || tp.Photos != 2 {
		t.Fatalf("created: %+v", tp)
	}
	if tp.Published || string(tp.Settings) != "{}" || tp.Suggestion != nil || tp.ProjectID != "" {
		t.Fatalf("a new template is a draft with no settings yet: %+v", tp)
	}

	ph, err := s.TemplatePhoto(ctx, tp.ID, 1)
	if err != nil || ph.Type != "image/png" || !bytes.Equal(ph.Data, []byte{0x89, 'P', 'N', 'G'}) {
		t.Fatalf("photo comes back unchanged: %+v %v", ph, err)
	}
	if _, err := s.TemplatePhoto(ctx, tp.ID, 2); !errors.Is(err, ErrNotFound) {
		t.Fatal("no third photo")
	}

	if list, _ := s.ListTemplates(ctx, false); len(list) != 0 {
		t.Fatalf("drafts aren't listed for everyone: %+v", list)
	}
	if list, _ := s.ListTemplates(ctx, true); len(list) != 1 || list[0].ID != tp.ID {
		t.Fatalf("the admin sees drafts: %+v", list)
	}

	name, thumb, pid, pub := "Dalaladugård", "data:image/png;base64,AAAA", "abc", true
	up, err := s.UpdateTemplate(ctx, tp.ID, TemplateUpdate{
		Name: &name, Settings: json.RawMessage(`{"kind":"cow","width":30}`), Thumbnail: &thumb,
		ProjectID: &pid, Suggestion: json.RawMessage(`{"notes":"red"}`), Published: &pub,
	})
	if err != nil {
		t.Fatal(err)
	}
	if up.Name != "Dalaladugård" || up.Blurb != "Red, long and low." || string(up.Settings) != `{"kind":"cow","width":30}` ||
		up.Thumbnail != thumb || up.ProjectID != "abc" || string(up.Suggestion) != `{"notes":"red"}` || !up.Published || up.Photos != 2 {
		t.Fatalf("updated: %+v", up)
	}
	if up, err = s.UpdateTemplate(ctx, tp.ID, TemplateUpdate{}); err != nil || up.Name != "Dalaladugård" || !up.Published {
		t.Fatalf("an empty update changes nothing: %+v %v", up, err)
	}
	list, err := s.ListTemplates(ctx, false)
	if err != nil || len(list) != 1 || string(list[0].Settings) != `{"kind":"cow","width":30}` {
		t.Fatalf("published templates are listed for everyone, with their settings: %+v %v", list, err)
	}

	if err := s.DeleteTemplate(ctx, tp.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.TemplatePhoto(ctx, tp.ID, 0); !errors.Is(err, ErrNotFound) {
		t.Fatal("the photos go with the template")
	}
	if _, err := s.GetTemplate(ctx, tp.ID); !errors.Is(err, ErrNotFound) {
		t.Fatal("deleted")
	}
	if err := s.DeleteTemplate(ctx, tp.ID); !errors.Is(err, ErrNotFound) {
		t.Fatal("deleting twice")
	}
	if _, err := s.UpdateTemplate(ctx, "nope", TemplateUpdate{Name: &name}); !errors.Is(err, ErrNotFound) {
		t.Fatal("updating a missing template")
	}
}
