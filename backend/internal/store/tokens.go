package store

import (
	"context"
	"database/sql"
	"time"
)

// A Token is an API token a user makes in the app, for other programs to read their buildings. Only the hash is kept; Prefix
// (the first characters of the token) is there so the user can tell the tokens apart in the list.
type Token struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	Prefix     string     `json:"prefix"`
	CreatedAt  time.Time  `json:"createdAt"`
	LastUsedAt *time.Time `json:"lastUsedAt"` // nil: never used
	Write      bool       `json:"write"`      // may create buildings and send their models (a token reads only otherwise)
}

// CreateToken stores a new token that reads (by its hash).
func (s *Store) CreateToken(ctx context.Context, userID int64, name, hash, prefix string) (Token, error) {
	return s.CreateTokenScoped(ctx, userID, name, hash, prefix, false)
}

// CreateTokenScoped stores a new token; write says it may also create buildings and send their models.
func (s *Store) CreateTokenScoped(ctx context.Context, userID int64, name, hash, prefix string, write bool) (Token, error) {
	id, now := newID(), s.ms()
	if _, err := s.exec(ctx, `INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at, can_write) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		id, userID, name, hash, prefix, now, write); err != nil {
		return Token{}, err
	}
	return Token{ID: id, Name: name, Prefix: prefix, CreatedAt: time.UnixMilli(now), Write: write}, nil
}

// TokenUser returns the owner of the token with this hash. A use is noted (at most once a minute).
func (s *Store) TokenUser(ctx context.Context, hash string) (User, error) {
	u, _, err := s.TokenAuth(ctx, hash)
	return u, err
}

// TokenAuth is TokenUser, and says whether the token may write.
func (s *Store) TokenAuth(ctx context.Context, hash string) (User, bool, error) {
	var write bool
	row := s.queryRow(ctx, `SELECT u.id, u.email, u.name, u.password_hash, u.google_sub, u.is_admin, u.created_at, t.can_write
		FROM api_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?`, hash)
	u, _, err := scanUser(scanWith{row, &write})
	if err != nil {
		return User{}, false, err
	}
	now := s.ms()
	_, err = s.exec(ctx, `UPDATE api_tokens SET last_used_at = ? WHERE token_hash = ? AND (last_used_at IS NULL OR last_used_at < ?)`, now, hash, now-60_000)
	return u, write, err
}

// ListTokens returns a user's tokens, the newest first.
func (s *Store) ListTokens(ctx context.Context, userID int64) ([]Token, error) {
	rows, err := s.query(ctx, `SELECT id, name, prefix, created_at, last_used_at, can_write FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC, id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []Token{}
	for rows.Next() {
		var t Token
		var created int64
		var used sql.NullInt64
		if err := rows.Scan(&t.ID, &t.Name, &t.Prefix, &created, &used, &t.Write); err != nil {
			return nil, err
		}
		t.CreatedAt = time.UnixMilli(created)
		if used.Valid {
			u := time.UnixMilli(used.Int64)
			t.LastUsedAt = &u
		}
		list = append(list, t)
	}
	return list, rows.Err()
}

func (s *Store) CountTokens(ctx context.Context, userID int64) (int, error) {
	var n int
	err := s.queryRow(ctx, `SELECT COUNT(*) FROM api_tokens WHERE user_id = ?`, userID).Scan(&n)
	return n, err
}

// DeleteToken removes one of the user's tokens.
func (s *Store) DeleteToken(ctx context.Context, userID int64, id string) error {
	res, err := s.exec(ctx, `DELETE FROM api_tokens WHERE id = ? AND user_id = ?`, id, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return ErrNotFound
	}
	return nil
}

// scanWith scans a row's columns and then one more value: a query that selects a user and one more column.
type scanWith struct {
	row   scanner
	extra any
}

func (s scanWith) Scan(dest ...any) error { return s.row.Scan(append(dest, s.extra)...) }
