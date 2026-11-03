package store

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"testing"
	"time"
)

var ctx = context.Background()

func openTest(t *testing.T) *Store {
	t.Helper()
	s, err := Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func mustUser(t *testing.T, s *Store, email string) User {
	t.Helper()
	u, err := s.CreateUser(ctx, NewUser{Email: email, Name: "Test", PasswordHash: "hash"}, 0)
	if err != nil {
		t.Fatal(err)
	}
	return u
}

func TestOpenTwiceKeepsData(t *testing.T) {
	path := filepath.Join(t.TempDir(), "app.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	mustUser(t, s, "anna@example.se")
	s.Close()
	s, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if n, _ := s.CountUsers(ctx); n != 1 {
		t.Fatalf("want 1 user after reopening, got %d", n)
	}
}

func TestUsers(t *testing.T) {
	s := openTest(t)
	u := mustUser(t, s, "anna@example.se")
	if u.ID == 0 || u.Email != "anna@example.se" || !u.HasPassword || u.HasGoogle {
		t.Fatalf("unexpected user %+v", u)
	}
	got, hash, err := s.UserByEmail(ctx, "ANNA@example.se")
	if err != nil || got.ID != u.ID || hash != "hash" {
		t.Fatalf("lookup by email is not case-insensitive: %+v %q %v", got, hash, err)
	}
	if _, err := s.CreateUser(ctx, NewUser{Email: "Anna@Example.se"}, 0); !errors.Is(err, ErrEmailTaken) {
		t.Fatalf("want ErrEmailTaken, got %v", err)
	}
	if _, _, err := s.UserByEmail(ctx, "nobody@example.se"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("want ErrNotFound, got %v", err)
	}
	if err := s.LinkGoogle(ctx, u.ID, "google-123"); err != nil {
		t.Fatal(err)
	}
	g, err := s.UserByGoogleSub(ctx, "google-123")
	if err != nil || g.ID != u.ID || !g.HasGoogle {
		t.Fatalf("google link failed: %+v %v", g, err)
	}
	byID, err := s.UserByID(ctx, u.ID)
	if err != nil || byID.Email != u.Email {
		t.Fatalf("lookup by id: %+v %v", byID, err)
	}
}

func TestCreateUserUsesInviteOnce(t *testing.T) {
	s := openTest(t)
	admin := mustUser(t, s, "admin@example.se")
	inv, err := s.CreateInvite(ctx, "friend@example.se", "tokhash", admin.ID, time.Now().Add(time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateUser(ctx, NewUser{Email: "friend@example.se"}, inv.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.InviteByToken(ctx, "tokhash"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("used invite still valid: %v", err)
	}
	if _, err := s.CreateUser(ctx, NewUser{Email: "other@example.se"}, inv.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("invite used twice: %v", err)
	}
	if n, _ := s.CountUsers(ctx); n != 2 {
		t.Fatalf("failed signup left a user behind: %d users", n)
	}
}

func TestInvites(t *testing.T) {
	s := openTest(t)
	admin := mustUser(t, s, "admin@example.se")
	if _, err := s.CreateInvite(ctx, "f@example.se", "old", admin.ID, time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	inv, err := s.CreateInvite(ctx, "f@example.se", "new", admin.ID, time.Now().Add(time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.InviteByToken(ctx, "old"); !errors.Is(err, ErrNotFound) {
		t.Fatal("a new invite should replace the open one for the same email")
	}
	got, err := s.OpenInviteForEmail(ctx, "F@example.se")
	if err != nil || got.ID != inv.ID {
		t.Fatalf("open invite lookup: %+v %v", got, err)
	}
	if _, err := s.CreateInvite(ctx, "late@example.se", "expired", admin.ID, time.Now().Add(-time.Minute)); err != nil {
		t.Fatal(err)
	}
	if _, err := s.InviteByToken(ctx, "expired"); !errors.Is(err, ErrNotFound) {
		t.Fatal("expired invite accepted")
	}
	list, _ := s.ListInvites(ctx)
	if len(list) != 2 {
		t.Fatalf("want 2 invites, got %d", len(list))
	}
	if err := s.DeleteInvite(ctx, inv.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteInvite(ctx, inv.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("deleting twice: %v", err)
	}
}

func TestSessions(t *testing.T) {
	s := openTest(t)
	u := mustUser(t, s, "anna@example.se")
	if err := s.CreateSession(ctx, u.ID, "live", time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if err := s.CreateSession(ctx, u.ID, "dead", time.Now().Add(-time.Second)); err != nil {
		t.Fatal(err)
	}
	if got, err := s.SessionUser(ctx, "live"); err != nil || got.ID != u.ID {
		t.Fatalf("live session: %+v %v", got, err)
	}
	if _, err := s.SessionUser(ctx, "dead"); !errors.Is(err, ErrNotFound) {
		t.Fatal("expired session accepted")
	}
	if n, _ := s.DeleteExpiredSessions(ctx); n != 1 {
		t.Fatalf("want 1 expired session removed, got %d", n)
	}
	if err := s.DeleteSession(ctx, "live"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SessionUser(ctx, "live"); !errors.Is(err, ErrNotFound) {
		t.Fatal("session still valid after logout")
	}
}

func TestProjects(t *testing.T) {
	s := openTest(t)
	anna, bo := mustUser(t, s, "anna@example.se"), mustUser(t, s, "bo@example.se")
	p, err := s.CreateProject(ctx, anna.ID, "Stugan", json.RawMessage(`{"width":10}`))
	if err != nil {
		t.Fatal(err)
	}
	if p.ID == "" || p.Version != 1 || string(p.Data) != `{"width":10}` {
		t.Fatalf("unexpected project %+v", p)
	}
	if _, err := s.GetProject(ctx, bo.ID, p.ID); !errors.Is(err, ErrNotFound) {
		t.Fatal("another user can read the project")
	}
	name, thumb := "Stugan vid sjön", "data:image/jpeg;base64,AAAA"
	up, err := s.UpdateProject(ctx, anna.ID, p.ID, ProjectUpdate{Name: &name, Data: json.RawMessage(`{"width":12}`), Thumbnail: &thumb}, 1)
	if err != nil {
		t.Fatal(err)
	}
	if up.Version != 2 || up.Name != name || string(up.Data) != `{"width":12}` || up.Thumbnail != thumb {
		t.Fatalf("update not applied: %+v", up)
	}
	cur, err := s.UpdateProject(ctx, anna.ID, p.ID, ProjectUpdate{Name: &name}, 1)
	if !errors.Is(err, ErrConflict) || cur.Version != 2 {
		t.Fatalf("stale version: want ErrConflict and current version 2, got %v %d", err, cur.Version)
	}
	if _, err := s.UpdateProject(ctx, bo.ID, p.ID, ProjectUpdate{Name: &name}, 0); !errors.Is(err, ErrNotFound) {
		t.Fatal("another user can update the project")
	}
	cp, err := s.DuplicateProject(ctx, anna.ID, p.ID, "Kopia")
	if err != nil || cp.ID == p.ID || string(cp.Data) != `{"width":12}` || cp.Version != 1 || cp.Thumbnail != thumb {
		t.Fatalf("duplicate: %+v %v", cp, err)
	}
	list, _ := s.ListProjects(ctx, anna.ID)
	if len(list) != 2 {
		t.Fatalf("want 2 projects, got %d", len(list))
	}
	if other, _ := s.ListProjects(ctx, bo.ID); len(other) != 0 {
		t.Fatal("another user sees the projects")
	}
	if err := s.DeleteProject(ctx, bo.ID, p.ID); !errors.Is(err, ErrNotFound) {
		t.Fatal("another user can delete the project")
	}
	if err := s.DeleteProject(ctx, anna.ID, p.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetProject(ctx, anna.ID, p.ID); !errors.Is(err, ErrNotFound) {
		t.Fatal("deleted project still there")
	}
}

func TestListProjectsNewestFirst(t *testing.T) {
	s := openTest(t)
	u := mustUser(t, s, "anna@example.se")
	clock := time.Unix(1_700_000_000, 0)
	s.Now = func() time.Time { clock = clock.Add(time.Second); return clock }
	a, _ := s.CreateProject(ctx, u.ID, "A", json.RawMessage(`{}`))
	if _, err := s.CreateProject(ctx, u.ID, "B", json.RawMessage(`{}`)); err != nil {
		t.Fatal(err)
	}
	n := "A2"
	if _, err := s.UpdateProject(ctx, u.ID, a.ID, ProjectUpdate{Name: &n}, 0); err != nil {
		t.Fatal(err)
	}
	list, _ := s.ListProjects(ctx, u.ID)
	if len(list) != 2 || list[0].Name != "A2" {
		t.Fatalf("want the last edited project first, got %+v", list)
	}
}
