// Command server runs the House to i3d API.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"building-creator-fs25/backend/internal/api"
	"building-creator-fs25/backend/internal/config"
	"building-creator-fs25/backend/internal/store"
)

func main() {
	healthcheck := flag.Bool("healthcheck", false, "check that the server on LISTEN_ADDR answers, for Docker's HEALTHCHECK")
	flag.Parse()
	if *healthcheck {
		os.Exit(checkHealth())
	}

	cfg, err := config.Load(os.Getenv)
	if err != nil {
		log.Fatal(err)
	}
	st, err := store.Open(cfg.Database())
	if err != nil {
		where := cfg.DatabasePath
		if cfg.DatabaseURL != "" {
			where = "from DATABASE_URL" // the URL holds the password, so don't log it
		}
		log.Fatalf("opening database %s: %v", where, err)
	}
	defer st.Close()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go cleanSessions(ctx, st)

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           api.New(st, cfg.API),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       2 * time.Minute,
	}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		srv.Shutdown(shutdown)
	}()

	db := "SQLite " + cfg.DatabasePath
	if cfg.DatabaseURL != "" {
		db = "Postgres"
	}
	log.Printf("listening on %s (public URL %s, Google sign-in %v, %s)", cfg.Addr, cfg.API.PublicURL, cfg.API.GoogleEnabled(), db)
	if cfg.API.AdminEmail == "" {
		log.Printf("warning: ADMIN_EMAIL is not set, so nobody can create the first account")
	}
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

func cleanSessions(ctx context.Context, st *store.Store) {
	t := time.NewTicker(time.Hour)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if n, err := st.DeleteExpiredSessions(ctx); err != nil {
				log.Printf("cleaning sessions: %v", err)
			} else if n > 0 {
				log.Printf("removed %d expired sessions", n)
			}
		}
	}
}

func checkHealth() int {
	port := "8080"
	if _, p, err := net.SplitHostPort(os.Getenv("LISTEN_ADDR")); err == nil && p != "" {
		port = p
	}
	c := http.Client{Timeout: 3 * time.Second}
	res, err := c.Get(fmt.Sprintf("http://127.0.0.1:%s/api/health", port))
	if err != nil || res.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}
