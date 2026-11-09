// Package config reads the server settings from environment variables.
package config

import (
	"fmt"
	"net/url"
	"strings"
	"time"

	"building-creator-fs25/backend/internal/api"
	"building-creator-fs25/backend/internal/auth"
	"building-creator-fs25/backend/internal/store"
	"building-creator-fs25/backend/internal/vision"
)

type Config struct {
	Addr         string
	DatabasePath string
	DatabaseURL  string // Postgres; when set it is used instead of DatabasePath
	API          api.Config
}

// Database is what to pass to store.Open: the Postgres URL if there is one, else the SQLite path.
func (c Config) Database() string {
	if c.DatabaseURL != "" {
		return c.DatabaseURL
	}
	return c.DatabasePath
}

// Load builds the config from getenv (os.Getenv in production).
//
//	PUBLIC_URL            required, the address people open, e.g. https://hus.example.se
//	ADMIN_EMAIL           this address can sign up without an invite and becomes admin
//	GOOGLE_CLIENT_ID      with GOOGLE_CLIENT_SECRET, turns on "Sign in with Google"
//	GOOGLE_CLIENT_SECRET
//	LISTEN_ADDR           default :8080
//	DATABASE_PATH         SQLite file, default /data/building-creator-fs25.db
//	DATABASE_URL          postgres://user:pass@host:5432/db, use Postgres instead of SQLite
//	TRUST_PROXY           "true" when the API is only reachable through the web app
//	ANTHROPIC_API_KEY     lets the admin's template wizard ask Claude to read photos of a building
func Load(getenv func(string) string) (Config, error) {
	c := Config{
		Addr:         or(getenv("LISTEN_ADDR"), ":8080"),
		DatabasePath: or(getenv("DATABASE_PATH"), "/data/building-creator-fs25.db"),
		DatabaseURL:  strings.TrimSpace(getenv("DATABASE_URL")),
	}
	if c.DatabaseURL != "" && !store.IsPostgresURL(c.DatabaseURL) {
		return c, fmt.Errorf("DATABASE_URL must be a Postgres URL, like postgres://user:password@host:5432/house")
	}
	raw := strings.TrimRight(strings.TrimSpace(getenv("PUBLIC_URL")), "/")
	u, err := url.Parse(raw)
	if raw == "" || err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return c, fmt.Errorf("PUBLIC_URL must be set to the app's address, like https://hus.example.se")
	}
	c.API = api.Config{
		PublicURL:          raw,
		SecureCookies:      u.Scheme == "https",
		GoogleClientID:     strings.TrimSpace(getenv("GOOGLE_CLIENT_ID")),
		GoogleClientSecret: strings.TrimSpace(getenv("GOOGLE_CLIENT_SECRET")),
		TrustProxy:         strings.EqualFold(strings.TrimSpace(getenv("TRUST_PROXY")), "true"),
		SessionTTL:         30 * 24 * time.Hour,
	}
	if key := strings.TrimSpace(getenv("ANTHROPIC_API_KEY")); key != "" {
		c.API.Vision = vision.New(key)
	}
	if a := strings.TrimSpace(getenv("ADMIN_EMAIL")); a != "" {
		email, err := auth.NormalizeEmail(a)
		if err != nil {
			return c, fmt.Errorf("ADMIN_EMAIL is not a valid email address")
		}
		c.API.AdminEmail = email
	}
	return c, nil
}

func or(v, def string) string {
	if v = strings.TrimSpace(v); v != "" {
		return v
	}
	return def
}
