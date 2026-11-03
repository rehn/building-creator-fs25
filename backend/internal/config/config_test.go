package config

import "testing"

func env(m map[string]string) func(string) string { return func(k string) string { return m[k] } }

func TestPublicURLIsRequired(t *testing.T) {
	if _, err := Load(env(map[string]string{})); err == nil {
		t.Fatal("loaded without PUBLIC_URL")
	}
	if _, err := Load(env(map[string]string{"PUBLIC_URL": "not a url"})); err == nil {
		t.Fatal("loaded with an invalid PUBLIC_URL")
	}
}

func TestDefaults(t *testing.T) {
	c, err := Load(env(map[string]string{"PUBLIC_URL": "http://localhost:3000/"}))
	if err != nil {
		t.Fatal(err)
	}
	if c.API.PublicURL != "http://localhost:3000" || c.API.SecureCookies || c.Addr != ":8080" || c.DatabasePath != "/data/house-to-i3d.db" {
		t.Fatalf("unexpected defaults %+v", c)
	}
	if c.API.GoogleEnabled() {
		t.Fatal("Google enabled without credentials")
	}
}

func TestFullConfig(t *testing.T) {
	c, err := Load(env(map[string]string{
		"PUBLIC_URL": "https://hus.example.se", "ADMIN_EMAIL": " Me@Example.se ",
		"GOOGLE_CLIENT_ID": "id", "GOOGLE_CLIENT_SECRET": "secret",
		"LISTEN_ADDR": ":9000", "DATABASE_PATH": "/tmp/x.db", "TRUST_PROXY": "true",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if !c.API.SecureCookies || c.API.AdminEmail != "me@example.se" || !c.API.GoogleEnabled() || !c.API.TrustProxy {
		t.Fatalf("unexpected config %+v", c.API)
	}
	if c.Addr != ":9000" || c.DatabasePath != "/tmp/x.db" {
		t.Fatalf("unexpected addr or path %+v", c)
	}
	if c.API.GoogleRedirectURL() != "https://hus.example.se/api/auth/google/callback" {
		t.Fatalf("redirect url %q", c.API.GoogleRedirectURL())
	}
}

func TestInvalidAdminEmail(t *testing.T) {
	if _, err := Load(env(map[string]string{"PUBLIC_URL": "http://localhost:3000", "ADMIN_EMAIL": "nope"})); err == nil {
		t.Fatal("accepted an invalid ADMIN_EMAIL")
	}
}

func TestDatabaseURLChoosesPostgres(t *testing.T) {
	c, err := Load(env(map[string]string{"PUBLIC_URL": "http://localhost:3000", "DATABASE_URL": " postgres://u:p@db:5432/hus?sslmode=disable "}))
	if err != nil {
		t.Fatal(err)
	}
	if c.DatabaseURL != "postgres://u:p@db:5432/hus?sslmode=disable" {
		t.Fatalf("DatabaseURL %q", c.DatabaseURL)
	}
	if c.Database() != c.DatabaseURL {
		t.Fatalf("Database() = %q, want the URL", c.Database())
	}
	c, _ = Load(env(map[string]string{"PUBLIC_URL": "http://localhost:3000"}))
	if c.Database() != "/data/house-to-i3d.db" {
		t.Fatalf("without DATABASE_URL, Database() = %q, want the SQLite path", c.Database())
	}
}

func TestDatabaseURLMustBePostgres(t *testing.T) {
	for _, u := range []string{"mysql://x", "http://db", "not a url"} {
		if _, err := Load(env(map[string]string{"PUBLIC_URL": "http://localhost:3000", "DATABASE_URL": u})); err == nil {
			t.Fatalf("accepted DATABASE_URL %q", u)
		}
	}
	for _, u := range []string{"postgres://db/hus", "postgresql://u@db/hus"} {
		if _, err := Load(env(map[string]string{"PUBLIC_URL": "http://localhost:3000", "DATABASE_URL": u})); err != nil {
			t.Fatalf("rejected DATABASE_URL %q: %v", u, err)
		}
	}
}
