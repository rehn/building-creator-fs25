package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

// A Part is a part of a building saved to be put on other buildings (a pump house, a wing ...): the editor's part file as Data, and
// a few numbers about it for the list as Info. A shared part (the admin shares them) is listed for everyone, who can use it; only its
// owner changes or deletes it. The server only stores them.
type Part struct {
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	Info      json.RawMessage `json:"info"`
	Data      json.RawMessage `json:"data,omitempty"` // only when one part is fetched
	Shared    bool            `json:"shared"`
	Mine      bool            `json:"mine"` // the user asking owns it
	CreatedAt time.Time       `json:"createdAt"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

// CreatePart stores a new part (info nil: an empty object).
func (s *Store) CreatePart(ctx context.Context, userID int64, name string, info, data json.RawMessage) (Part, error) {
	if len(info) == 0 {
		info = json.RawMessage(`{}`)
	}
	id, now := newID(), s.ms()
	if _, err := s.exec(ctx, `INSERT INTO parts (id, user_id, name, info, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		id, userID, name, string(info), string(data), now, now); err != nil {
		return Part{}, err
	}
	return s.GetPart(ctx, userID, id)
}

const partCols = `p.id, p.name, p.info, p.shared, p.user_id, p.created_at, p.updated_at`

func scanPart(row scanner, userID int64, withData bool) (Part, error) {
	var p Part
	var info, data string
	var created, updated, owner int64
	var err error
	if withData {
		err = row.Scan(&p.ID, &p.Name, &info, &p.Shared, &owner, &created, &updated, &data)
	} else {
		err = row.Scan(&p.ID, &p.Name, &info, &p.Shared, &owner, &created, &updated)
	}
	if errors.Is(err, sql.ErrNoRows) {
		return Part{}, ErrNotFound
	}
	if err != nil {
		return Part{}, err
	}
	p.Info, p.Mine = json.RawMessage(info), owner == userID
	if withData {
		p.Data = json.RawMessage(data)
	}
	p.CreatedAt, p.UpdatedAt = time.UnixMilli(created), time.UnixMilli(updated)
	return p, nil
}

// GetPart returns a part with its file if it is the user's or shared, else ErrNotFound.
func (s *Store) GetPart(ctx context.Context, userID int64, id string) (Part, error) {
	return scanPart(s.queryRow(ctx, `SELECT `+partCols+`, p.data FROM parts p WHERE p.id = ? AND (p.user_id = ? OR p.shared)`, id, userID), userID, true)
}

// ListParts returns a user's own parts and the shared ones (without their files), the last changed first.
func (s *Store) ListParts(ctx context.Context, userID int64) ([]Part, error) {
	rows, err := s.query(ctx, `SELECT `+partCols+` FROM parts p WHERE p.user_id = ? OR p.shared ORDER BY p.updated_at DESC, p.id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []Part{}
	for rows.Next() {
		p, err := scanPart(rows, userID, false)
		if err != nil {
			return nil, err
		}
		list = append(list, p)
	}
	return list, rows.Err()
}

// UpdatePart renames one of the user's parts.
func (s *Store) UpdatePart(ctx context.Context, userID int64, id string, name *string) (Part, error) {
	cur, err := s.ownPart(ctx, userID, id)
	if err != nil {
		return Part{}, err
	}
	if name == nil {
		return cur, nil
	}
	if _, err := s.exec(ctx, `UPDATE parts SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?`, *name, s.ms(), id, userID); err != nil {
		return Part{}, err
	}
	return s.ownPart(ctx, userID, id)
}

// SetPartShared shares (or stops sharing) one of the user's parts. Who may share is the API's call.
func (s *Store) SetPartShared(ctx context.Context, userID int64, id string, shared bool) (Part, error) {
	res, err := s.exec(ctx, `UPDATE parts SET shared = ?, updated_at = ? WHERE id = ? AND user_id = ?`, shared, s.ms(), id, userID)
	if err != nil {
		return Part{}, err
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return Part{}, ErrNotFound
	}
	return s.ownPart(ctx, userID, id)
}

// ownPart returns a part (with its file) only if the user owns it.
func (s *Store) ownPart(ctx context.Context, userID int64, id string) (Part, error) {
	return scanPart(s.queryRow(ctx, `SELECT `+partCols+`, p.data FROM parts p WHERE p.id = ? AND p.user_id = ?`, id, userID), userID, true)
}

// DeletePart removes one of the user's parts.
func (s *Store) DeletePart(ctx context.Context, userID int64, id string) error {
	res, err := s.exec(ctx, `DELETE FROM parts WHERE id = ? AND user_id = ?`, id, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return ErrNotFound
	}
	return nil
}
