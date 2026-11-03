// Package store keeps users, sessions, invites and projects in SQLite.
package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base32"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

var (
	ErrNotFound   = errors.New("not found")
	ErrEmailTaken = errors.New("email already registered")
	ErrConflict   = errors.New("conflict")
)

type Store struct {
	db *sql.DB
	// Now is the clock; tests replace it.
	Now func() time.Time
}

const schema = `
CREATE TABLE IF NOT EXISTS users (
	id            INTEGER PRIMARY KEY,
	email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
	name          TEXT    NOT NULL DEFAULT '',
	password_hash TEXT,
	google_sub    TEXT    UNIQUE,
	is_admin      INTEGER NOT NULL DEFAULT 0,
	created_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
	token_hash TEXT    PRIMARY KEY,
	user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	expires_at INTEGER NOT NULL,
	created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS invites (
	id         INTEGER PRIMARY KEY,
	email      TEXT    NOT NULL COLLATE NOCASE,
	token_hash TEXT    NOT NULL UNIQUE,
	created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
	created_at INTEGER NOT NULL,
	expires_at INTEGER NOT NULL,
	used_at    INTEGER
);
CREATE INDEX IF NOT EXISTS invites_email ON invites(email);
CREATE TABLE IF NOT EXISTS projects (
	id         TEXT    PRIMARY KEY,
	user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	name       TEXT    NOT NULL,
	data       TEXT    NOT NULL,
	thumbnail  TEXT    NOT NULL DEFAULT '',
	version    INTEGER NOT NULL DEFAULT 1,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS projects_user ON projects(user_id, updated_at DESC);
`

// Open opens (and creates if needed) the database at path. Use ":memory:" for tests.
func Open(path string) (*Store, error) {
	dsn := "file:" + path + "?_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)"
	if path != ":memory:" {
		dsn += "&_pragma=journal_mode(WAL)"
	}
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	// One connection: SQLite allows one writer anyway, and ":memory:" needs a single connection.
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return nil, fmt.Errorf("creating schema: %w", err)
	}
	return &Store{db: db, Now: time.Now}, nil
}

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) ms() int64 { return s.Now().UnixMilli() }

func isUnique(err error) bool {
	return err != nil && strings.Contains(err.Error(), "UNIQUE constraint failed")
}

func nullStr(v string) sql.NullString { return sql.NullString{String: v, Valid: v != ""} }

/* ---------- Users ---------- */

type User struct {
	ID          int64     `json:"id"`
	Email       string    `json:"email"`
	Name        string    `json:"name"`
	IsAdmin     bool      `json:"isAdmin"`
	HasPassword bool      `json:"hasPassword"`
	HasGoogle   bool      `json:"hasGoogle"`
	CreatedAt   time.Time `json:"createdAt"`
}

type NewUser struct {
	Email        string
	Name         string
	PasswordHash string
	GoogleSub    string
	IsAdmin      bool
}

const userCols = "id, email, name, password_hash, google_sub, is_admin, created_at"

type scanner interface{ Scan(dest ...any) error }

func scanUser(row scanner) (User, string, error) {
	var u User
	var hash, sub sql.NullString
	var created int64
	err := row.Scan(&u.ID, &u.Email, &u.Name, &hash, &sub, &u.IsAdmin, &created)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, "", ErrNotFound
	}
	if err != nil {
		return User{}, "", err
	}
	u.HasPassword = hash.Valid && hash.String != ""
	u.HasGoogle = sub.Valid && sub.String != ""
	u.CreatedAt = time.UnixMilli(created)
	return u, hash.String, nil
}

// CreateUser adds a user. If inviteID is not 0, the invite is marked used in
// the same transaction, and the user is not created if the invite is gone.
func (s *Store) CreateUser(ctx context.Context, nu NewUser, inviteID int64) (User, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return User{}, err
	}
	defer tx.Rollback()
	now := s.ms()
	if inviteID != 0 {
		res, err := tx.ExecContext(ctx, `UPDATE invites SET used_at = ? WHERE id = ? AND used_at IS NULL AND expires_at > ?`, now, inviteID, now)
		if err != nil {
			return User{}, err
		}
		if n, _ := res.RowsAffected(); n != 1 {
			return User{}, ErrNotFound
		}
	}
	res, err := tx.ExecContext(ctx, `INSERT INTO users (email, name, password_hash, google_sub, is_admin, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		nu.Email, nu.Name, nullStr(nu.PasswordHash), nullStr(nu.GoogleSub), nu.IsAdmin, now)
	if isUnique(err) {
		if strings.Contains(err.Error(), "users.email") {
			return User{}, ErrEmailTaken
		}
		return User{}, ErrConflict
	}
	if err != nil {
		return User{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return User{}, err
	}
	u, _, err := scanUser(tx.QueryRowContext(ctx, `SELECT `+userCols+` FROM users WHERE id = ?`, id))
	if err != nil {
		return User{}, err
	}
	return u, tx.Commit()
}

// UserByEmail returns the user and their password hash ("" if they have none).
func (s *Store) UserByEmail(ctx context.Context, email string) (User, string, error) {
	return scanUser(s.db.QueryRowContext(ctx, `SELECT `+userCols+` FROM users WHERE email = ?`, email))
}

func (s *Store) UserByID(ctx context.Context, id int64) (User, error) {
	u, _, err := scanUser(s.db.QueryRowContext(ctx, `SELECT `+userCols+` FROM users WHERE id = ?`, id))
	return u, err
}

func (s *Store) UserByGoogleSub(ctx context.Context, sub string) (User, error) {
	u, _, err := scanUser(s.db.QueryRowContext(ctx, `SELECT `+userCols+` FROM users WHERE google_sub = ?`, sub))
	return u, err
}

func (s *Store) LinkGoogle(ctx context.Context, userID int64, sub string) error {
	res, err := s.db.ExecContext(ctx, `UPDATE users SET google_sub = ? WHERE id = ?`, sub, userID)
	if isUnique(err) {
		return ErrConflict
	}
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) CountUsers(ctx context.Context) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&n)
	return n, err
}

/* ---------- Sessions ---------- */

func (s *Store) CreateSession(ctx context.Context, userID int64, tokenHash string, expires time.Time) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`,
		tokenHash, userID, expires.UnixMilli(), s.ms())
	return err
}

// SessionUser returns the user of a session that hasn't expired.
func (s *Store) SessionUser(ctx context.Context, tokenHash string) (User, error) {
	u, _, err := scanUser(s.db.QueryRowContext(ctx, `SELECT u.id, u.email, u.name, u.password_hash, u.google_sub, u.is_admin, u.created_at
		FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`, tokenHash, s.ms()))
	return u, err
}

func (s *Store) DeleteSession(ctx context.Context, tokenHash string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE token_hash = ?`, tokenHash)
	return err
}

func (s *Store) DeleteExpiredSessions(ctx context.Context) (int64, error) {
	res, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE expires_at <= ?`, s.ms())
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

/* ---------- Invites ---------- */

type Invite struct {
	ID        int64      `json:"id"`
	Email     string     `json:"email"`
	CreatedAt time.Time  `json:"createdAt"`
	ExpiresAt time.Time  `json:"expiresAt"`
	UsedAt    *time.Time `json:"usedAt,omitempty"`
}

const inviteCols = "id, email, created_at, expires_at, used_at"

func scanInvite(row scanner) (Invite, error) {
	var inv Invite
	var created, expires int64
	var used sql.NullInt64
	err := row.Scan(&inv.ID, &inv.Email, &created, &expires, &used)
	if errors.Is(err, sql.ErrNoRows) {
		return Invite{}, ErrNotFound
	}
	if err != nil {
		return Invite{}, err
	}
	inv.CreatedAt, inv.ExpiresAt = time.UnixMilli(created), time.UnixMilli(expires)
	if used.Valid {
		t := time.UnixMilli(used.Int64)
		inv.UsedAt = &t
	}
	return inv, nil
}

// CreateInvite adds an invite for email, replacing any open invite for it.
func (s *Store) CreateInvite(ctx context.Context, email, tokenHash string, createdBy int64, expires time.Time) (Invite, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Invite{}, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM invites WHERE email = ? AND used_at IS NULL`, email); err != nil {
		return Invite{}, err
	}
	res, err := tx.ExecContext(ctx, `INSERT INTO invites (email, token_hash, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`,
		email, tokenHash, createdBy, s.ms(), expires.UnixMilli())
	if err != nil {
		return Invite{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Invite{}, err
	}
	inv, err := scanInvite(tx.QueryRowContext(ctx, `SELECT `+inviteCols+` FROM invites WHERE id = ?`, id))
	if err != nil {
		return Invite{}, err
	}
	return inv, tx.Commit()
}

// InviteByToken returns an unused, unexpired invite.
func (s *Store) InviteByToken(ctx context.Context, tokenHash string) (Invite, error) {
	return scanInvite(s.db.QueryRowContext(ctx, `SELECT `+inviteCols+` FROM invites WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`, tokenHash, s.ms()))
}

// OpenInviteForEmail returns the newest unused, unexpired invite for email.
func (s *Store) OpenInviteForEmail(ctx context.Context, email string) (Invite, error) {
	return scanInvite(s.db.QueryRowContext(ctx, `SELECT `+inviteCols+` FROM invites WHERE email = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1`, email, s.ms()))
}

func (s *Store) ListInvites(ctx context.Context) ([]Invite, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+inviteCols+` FROM invites ORDER BY created_at DESC, id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []Invite{}
	for rows.Next() {
		inv, err := scanInvite(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, inv)
	}
	return list, rows.Err()
}

func (s *Store) DeleteInvite(ctx context.Context, id int64) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM invites WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return ErrNotFound
	}
	return nil
}

/* ---------- Projects ---------- */

type ProjectSummary struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Thumbnail string    `json:"thumbnail"`
	Version   int64     `json:"version"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Project struct {
	ProjectSummary
	Data json.RawMessage `json:"data"`
}

// ProjectUpdate holds the fields to change; nil or empty fields are left alone.
type ProjectUpdate struct {
	Name      *string
	Data      json.RawMessage
	Thumbnail *string
}

func newID() string {
	b := make([]byte, 10)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return strings.ToLower(base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b))
}

func scanProject(row scanner) (Project, error) {
	var p Project
	var data string
	var created, updated int64
	err := row.Scan(&p.ID, &p.Name, &p.Thumbnail, &p.Version, &created, &updated, &data)
	if errors.Is(err, sql.ErrNoRows) {
		return Project{}, ErrNotFound
	}
	if err != nil {
		return Project{}, err
	}
	p.CreatedAt, p.UpdatedAt = time.UnixMilli(created), time.UnixMilli(updated)
	p.Data = json.RawMessage(data)
	return p, nil
}

const projectCols = "id, name, thumbnail, version, created_at, updated_at, data"

func (s *Store) CreateProject(ctx context.Context, userID int64, name string, data json.RawMessage) (Project, error) {
	return s.insertProject(ctx, userID, name, data, "")
}

func (s *Store) insertProject(ctx context.Context, userID int64, name string, data json.RawMessage, thumbnail string) (Project, error) {
	id, now := newID(), s.ms()
	_, err := s.db.ExecContext(ctx, `INSERT INTO projects (id, user_id, name, data, thumbnail, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
		id, userID, name, string(data), thumbnail, now, now)
	if err != nil {
		return Project{}, err
	}
	return s.GetProject(ctx, userID, id)
}

// ListProjects returns a user's projects, the last edited first.
func (s *Store) ListProjects(ctx context.Context, userID int64) ([]ProjectSummary, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, name, thumbnail, version, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC, id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []ProjectSummary{}
	for rows.Next() {
		var p ProjectSummary
		var created, updated int64
		if err := rows.Scan(&p.ID, &p.Name, &p.Thumbnail, &p.Version, &created, &updated); err != nil {
			return nil, err
		}
		p.CreatedAt, p.UpdatedAt = time.UnixMilli(created), time.UnixMilli(updated)
		list = append(list, p)
	}
	return list, rows.Err()
}

// GetProject returns a project if it belongs to userID, else ErrNotFound.
func (s *Store) GetProject(ctx context.Context, userID int64, id string) (Project, error) {
	return scanProject(s.db.QueryRowContext(ctx, `SELECT `+projectCols+` FROM projects WHERE id = ? AND user_id = ?`, id, userID))
}

// UpdateProject changes a project. If ifVersion is not 0 and the project is at
// another version, nothing changes and the current project is returned with ErrConflict.
func (s *Store) UpdateProject(ctx context.Context, userID int64, id string, u ProjectUpdate, ifVersion int64) (Project, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Project{}, err
	}
	defer tx.Rollback()
	cur, err := scanProject(tx.QueryRowContext(ctx, `SELECT `+projectCols+` FROM projects WHERE id = ? AND user_id = ?`, id, userID))
	if err != nil {
		return Project{}, err
	}
	if ifVersion != 0 && ifVersion != cur.Version {
		return cur, ErrConflict
	}
	if u.Name != nil {
		cur.Name = *u.Name
	}
	if len(u.Data) > 0 {
		cur.Data = u.Data
	}
	if u.Thumbnail != nil {
		cur.Thumbnail = *u.Thumbnail
	}
	cur.Version++
	now := s.ms()
	cur.UpdatedAt = time.UnixMilli(now)
	if _, err := tx.ExecContext(ctx, `UPDATE projects SET name = ?, data = ?, thumbnail = ?, version = ?, updated_at = ? WHERE id = ?`,
		cur.Name, string(cur.Data), cur.Thumbnail, cur.Version, now, id); err != nil {
		return Project{}, err
	}
	return cur, tx.Commit()
}

func (s *Store) DeleteProject(ctx context.Context, userID int64, id string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM projects WHERE id = ? AND user_id = ?`, id, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return ErrNotFound
	}
	return nil
}

// DuplicateProject copies a project (data and thumbnail) under a new name.
func (s *Store) DuplicateProject(ctx context.Context, userID int64, id, name string) (Project, error) {
	src, err := s.GetProject(ctx, userID, id)
	if err != nil {
		return Project{}, err
	}
	return s.insertProject(ctx, userID, name, src.Data, src.Thumbnail)
}
