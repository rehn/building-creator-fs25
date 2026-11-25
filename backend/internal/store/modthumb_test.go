package store

import "testing"

// A mod has a small preview picture, made by the editor from the view of the mod; a new picture is not a change of the mod (the version, and the zip made from it, stay).
func TestModThumbnail(t *testing.T) {
	s := openTest(t)
	u := mustUser(t, s, "anna@example.se")
	m, err := s.CreateMod(ctx, u.ID, "Gården", nil)
	if err != nil || m.Thumbnail != "" {
		t.Fatalf("new: %+v %v", m, err)
	}
	if err := s.PutModPackage(ctx, u.ID, m.ID, m.Version, []byte("PK")); err != nil {
		t.Fatal(err)
	}
	pic := "data:image/jpeg;base64,AAAA"
	got, err := s.UpdateMod(ctx, u.ID, m.ID, ModUpdate{Thumbnail: &pic}, m.Version)
	if err != nil || got.Thumbnail != pic || got.Version != m.Version {
		t.Fatalf("a picture alone: %+v %v", got, err)
	}
	if v, _ := s.ModPackageVersion(ctx, u.ID, m.ID); v != got.Version {
		t.Fatalf("the zip is still of the mod as it is: %d", v)
	}
	if list, _ := s.ListMods(ctx, u.ID); len(list) != 1 || list[0].Thumbnail != pic {
		t.Fatalf("the list has it: %+v", list)
	}
	if one, _ := s.GetMod(ctx, u.ID, m.ID); one.Thumbnail != pic {
		t.Fatalf("one has it: %+v", one)
	}
	// a change of the mod keeps the picture it has until a new one comes
	name := "Stora gården"
	got, err = s.UpdateMod(ctx, u.ID, m.ID, ModUpdate{Name: &name}, 0)
	if err != nil || got.Thumbnail != pic || got.Version != m.Version+1 {
		t.Fatalf("a rename: %+v %v", got, err)
	}
	none := ""
	if got, err = s.UpdateMod(ctx, u.ID, m.ID, ModUpdate{Thumbnail: &none}, 0); err != nil || got.Thumbnail != "" {
		t.Fatalf("taken away: %+v %v", got, err)
	}
}
