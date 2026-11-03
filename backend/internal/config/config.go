// Package config reads the server settings from environment variables.
package config

import (
	"fmt"
	"net/url"
	"strings"
	"time"

	"house-to-i3d/backend/internal/api"
	"house-to-i3d/backend/internal/auth"
)

type Config struct {
	Addr         string
	DatabasePath string
	API          api.Config
}

// Load builds the config from getenv (os.Getenv in production).
//
//	PUBLIC_URL            required, the address people open, e.g. https://hus.example.se
//	ADMIN_EMAIL           this address can sign up without an invite and becomes admin
//	GOOGLE_CLIENT_ID      with GOOGLE_CLIENT_SECRET, turns on "Sign in with Google"
//	GOOGLE_CLIENT_SECRET
//	LISTEN_ADDR           default :8080
//	DATABASE_PATH         default /data/house-to-i3d.db
//	TRUST_PROXY           "true" when the API is only reachable through the web app
func Load(getenv func(string) string) (Config, error) {
	c := Config{
		Addr:         or(getenv("LISTEN_ADDR"), ":8080"),
		DatabasePath: or(getenv("DATABASE_PATH"), "/data/house-to-i3d.db"),
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
