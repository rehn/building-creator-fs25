package store

import (
	"errors"
	"testing"
)

func TestTokenLifecycle(t *testing.T) {
	s := openTest(t)
	u := mustUser(t, s, "anna@example.se")
	other := mustUser(t, s, "bo@example.se")

	tok, err := s.CreateToken(ctx, u.ID, "Min renderare", "hash1", "bc_abcd")
	if err != nil {
		t.Fatal(err)
	}
	if tok.ID == "" || tok.Name != "Min renderare" || tok.Prefix != "bc_abcd" || tok.LastUsedAt != nil {
		t.Fatalf("created: %+v", tok)
	}

	got, err := s.TokenUser(ctx, "hash1")
	if err != nil || got.ID != u.ID {
		t.Fatalf("token's user: %+v %v", got, err)
	}
	if _, err := s.TokenUser(ctx, "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown token: %v", err)
	}

	list, err := s.ListTokens(ctx, u.ID)
	if err != nil || len(list) != 1 || list[0].LastUsedAt == nil {
		t.Fatalf("listed, with the use noted: %+v %v", list, err)
	}
	if l, _ := s.ListTokens(ctx, other.ID); len(l) != 0 {
		t.Fatalf("someone else's tokens: %+v", l)
	}
	if n, _ := s.CountTokens(ctx, u.ID); n != 1 {
		t.Fatalf("count: %d", n)
	}

	if err := s.DeleteToken(ctx, other.ID, tok.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("deleting another user's token: %v", err)
	}
	if err := s.DeleteToken(ctx, u.ID, tok.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.TokenUser(ctx, "hash1"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("deleted token still works: %v", err)
	}
}
