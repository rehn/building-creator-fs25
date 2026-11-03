package auth

import (
	"strings"
	"testing"
)

func init() { Iterations = 1000 } // keep tests fast; production uses 600 000

func TestHashAndCheckPassword(t *testing.T) {
	h, err := HashPassword("correct horse battery")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(h, "pbkdf2-sha256$1000$") {
		t.Fatalf("unexpected format %q", h)
	}
	if !CheckPassword(h, "correct horse battery") {
		t.Fatal("right password rejected")
	}
	if CheckPassword(h, "wrong horse battery") {
		t.Fatal("wrong password accepted")
	}
}

func TestHashesAreSalted(t *testing.T) {
	a, _ := HashPassword("same password here")
	b, _ := HashPassword("same password here")
	if a == b {
		t.Fatal("two hashes of the same password are identical")
	}
}

func TestOldIterationCountStillVerifies(t *testing.T) {
	Iterations = 500
	h, _ := HashPassword("an older password")
	Iterations = 1000
	if !CheckPassword(h, "an older password") {
		t.Fatal("hash made with another iteration count no longer verifies")
	}
}

func TestCheckPasswordRejectsGarbage(t *testing.T) {
	for _, enc := range []string{"", "plain", "pbkdf2-sha256$x$AAAA$AAAA", "md5$1$AAAA$AAAA", "pbkdf2-sha256$0$AAAA$AAAA", "pbkdf2-sha256$1000$!!$AAAA"} {
		if CheckPassword(enc, "x") {
			t.Errorf("accepted %q", enc)
		}
	}
}

func TestValidatePassword(t *testing.T) {
	if ValidatePassword("short") == nil {
		t.Error("accepted a 5 character password")
	}
	if err := ValidatePassword("tio tecken"); err != nil {
		t.Errorf("rejected a 10 character password: %v", err)
	}
	if ValidatePassword(strings.Repeat("a", 201)) == nil {
		t.Error("accepted a 201 character password")
	}
}

func TestNormalizeEmail(t *testing.T) {
	got, err := NormalizeEmail("  Anna.Svensson@Example.SE ")
	if err != nil || got != "anna.svensson@example.se" {
		t.Fatalf("got %q, %v", got, err)
	}
	for _, bad := range []string{"", "nope", "Anna <anna@example.se>", "a b@example.se", strings.Repeat("a", 250) + "@example.se"} {
		if _, err := NormalizeEmail(bad); err == nil {
			t.Errorf("accepted %q", bad)
		}
	}
}

func TestTokens(t *testing.T) {
	a, b := NewToken(), NewToken()
	if len(a) < 40 || a == b {
		t.Fatalf("weak or repeated tokens: %q %q", a, b)
	}
	h := HashToken(a)
	if len(h) != 64 || h != HashToken(a) || h == HashToken(b) {
		t.Fatalf("bad token hash %q", h)
	}
}
