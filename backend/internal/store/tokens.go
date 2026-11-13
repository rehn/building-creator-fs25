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
}

// CreateToken stores a new token (by its hash).
func (s *Store) CreateToken(ctx context.Context, userID int64, name, hash, prefix string) (Token, error) {
	id, now := newID(), s.ms()
	if _, err := s.exec(ctx, `INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		id, userID, name, hash, prefix, now); err != nil {
		return Token{}, err
	}
	return Token{ID: id, Name: name, Prefix: prefix, CreatedAt: time.UnixMilli(now)}, nil
}

// TokenUser returns the owner of the token with this hash. A use is noted (at most once a minute).
func (s *Store) TokenUser(ctx context.Context, hash string) (User, error) {
	u, _, err := scanUser(s.queryRow(ctx, `SELECT u.id, u.email, u.name, u.password_hash, u.google_sub, u.is_admin, u.created_at
		FROM api_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?`, hash))
	if err != nil {
		return User{}, err
	}
	now := s.ms()
	_, err = s.exec(ctx, `UPDATE api_tokens SET last_used_at = ? WHERE token_hash = ? AND (last_used_at IS NULL OR last_used_at < ?)`, now, hash, now-60_000)
	return u, err
}

// ListTokens returns a user's tokens, the newest first.
func (s *Store) ListTokens(ctx context.Context, userID int64) ([]Token, error) {
	rows, err := s.query(ctx, `SELECT id, name, prefix, created_at, last_used_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC, id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []Token{}
	for rows.Next() {
		var t Token
		var created int64
		var used sql.NullInt64
		if err := rows.Scan(&t.ID, &t.Name, &t.Prefix, &created, &used); err != nil {
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
