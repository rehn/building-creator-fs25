// Package auth has password hashing, login tokens and input checks.
package auth

import (
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net/mail"
	"strconv"
	"strings"
	"unicode/utf8"
)

// Iterations for new password hashes (OWASP 2023 recommendation for PBKDF2-SHA256).
// Existing hashes keep their own count, so this can be raised later.
var Iterations = 600_000

const (
	scheme      = "pbkdf2-sha256"
	keyLen      = 32
	MinPassword = 10
	MaxPassword = 200
)

var (
	ErrWeakPassword = fmt.Errorf("password must be %d to %d characters", MinPassword, MaxPassword)
	ErrInvalidEmail = errors.New("invalid email address")
)

// HashPassword returns "pbkdf2-sha256$<iterations>$<salt>$<key>".
func HashPassword(password string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key, err := pbkdf2.Key(sha256.New, password, salt, Iterations, keyLen)
	if err != nil {
		return "", err
	}
	enc := base64.RawStdEncoding
	return fmt.Sprintf("%s$%d$%s$%s", scheme, Iterations, enc.EncodeToString(salt), enc.EncodeToString(key)), nil
}

// CheckPassword reports whether password matches a hash from HashPassword.
func CheckPassword(encoded, password string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 4 || parts[0] != scheme {
		return false
	}
	iter, err := strconv.Atoi(parts[1])
	if err != nil || iter < 1 || iter > 10_000_000 {
		return false
	}
	enc := base64.RawStdEncoding
	salt, err := enc.DecodeString(parts[2])
	if err != nil || len(salt) == 0 {
		return false
	}
	want, err := enc.DecodeString(parts[3])
	if err != nil || len(want) == 0 {
		return false
	}
	got, err := pbkdf2.Key(sha256.New, password, salt, iter, len(want))
	if err != nil {
		return false
	}
	return subtle.ConstantTimeCompare(got, want) == 1
}

// ValidatePassword checks the length rules for new passwords.
func ValidatePassword(password string) error {
	n := utf8.RuneCountInString(password)
	if n < MinPassword || n > MaxPassword {
		return ErrWeakPassword
	}
	return nil
}

// NormalizeEmail trims and lowercases an address and rejects anything that
// isn't a plain address (no display names).
func NormalizeEmail(s string) (string, error) {
	s = strings.ToLower(strings.TrimSpace(s))
	if s == "" || len(s) > 254 || !strings.Contains(s, "@") {
		return "", ErrInvalidEmail
	}
	a, err := mail.ParseAddress(s)
	if err != nil || a.Name != "" || a.Address != s {
		return "", ErrInvalidEmail
	}
	return s, nil
}

// NewToken returns a random URL-safe token with 256 bits of entropy.
func NewToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err) // crypto/rand never fails on supported platforms
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

// HashToken is what gets stored for session and invite tokens, so a leaked
// database doesn't give working tokens.
func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
