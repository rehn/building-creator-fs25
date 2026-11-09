package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

// An Asset is an item a user imported to place in their buildings (a feeder made in Giants
// Editor ...): its files (the i3d, its .shapes, an .obj for the preview, textures) and
// settings the editor keeps in Meta (how it mounts, its size ...). The server only stores them.
// A shared asset (the admin shares them) is listed for everyone, who can use its files; only
// its owner can change or delete it.
type Asset struct {
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	Meta      json.RawMessage `json:"meta"`
	Files     []AssetFile     `json:"files"`
	Shared    bool            `json:"shared"`
	Mine      bool            `json:"mine"` // the user asking owns it
	CreatedAt time.Time       `json:"createdAt"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

// AssetFile is a file of an asset as listed: its name and size in bytes.
type AssetFile struct {
	Name string `json:"name"`
	Size int64  `json:"size"`
}

// AssetFileData is a file of an asset with its contents.
type AssetFileData struct {
	Name string
	Data []byte
}

// CreateAsset stores a new asset and its files (names must be unique; the API checks them).
func (s *Store) CreateAsset(ctx context.Context, userID int64, name string, meta json.RawMessage, files []AssetFileData) (Asset, error) {
	id, now := newID(), s.ms()
	err := s.inTx(ctx, func(tx *txx) error {
		if _, err := tx.exec(ctx, `INSERT INTO assets (id, user_id, name, meta, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
			id, userID, name, string(meta), now, now); err != nil {
			return err
		}
		for i, f := range files {
			if _, err := tx.exec(ctx, `INSERT INTO asset_files (asset_id, pos, name, size, data) VALUES (?, ?, ?, ?, ?)`,
				id, i, f.Name, len(f.Data), f.Data); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return Asset{}, err
	}
	return s.GetAsset(ctx, userID, id)
}

// GetAsset returns an asset (without file contents) if it belongs to userID, else ErrNotFound.
func (s *Store) GetAsset(ctx context.Context, userID int64, id string) (Asset, error) {
	list, err := s.assets(ctx, userID, `a.user_id = ? AND a.id = ?`, userID, id)
	if err != nil {
		return Asset{}, err
	}
	if len(list) == 0 {
		return Asset{}, ErrNotFound
	}
	return list[0], nil
}

// ListAssets returns a user's own assets and the shared ones, the last changed first.
func (s *Store) ListAssets(ctx context.Context, userID int64) ([]Asset, error) {
	return s.assets(ctx, userID, `(a.user_id = ? OR a.shared)`, userID)
}

// SetAssetShared shares (or stops sharing) one of the user's assets. Who may share is the API's call.
func (s *Store) SetAssetShared(ctx context.Context, userID int64, id string, shared bool) (Asset, error) {
	res, err := s.exec(ctx, `UPDATE assets SET shared = ?, updated_at = ? WHERE id = ? AND user_id = ?`, shared, s.ms(), id, userID)
	if err != nil {
		return Asset{}, err
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return Asset{}, ErrNotFound
	}
	return s.GetAsset(ctx, userID, id)
}

// assets lists assets matching where, as seen by userID (Mine).
func (s *Store) assets(ctx context.Context, userID int64, where string, args ...any) ([]Asset, error) {
	rows, err := s.query(ctx, `SELECT a.id, a.name, a.meta, a.shared, a.user_id, a.created_at, a.updated_at, f.name, f.size
		FROM assets a LEFT JOIN asset_files f ON f.asset_id = a.id
		WHERE `+where+` ORDER BY a.updated_at DESC, a.id, f.pos`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []Asset{}
	for rows.Next() {
		var a Asset
		var meta string
		var created, updated, owner int64
		var fname sql.NullString
		var fsize sql.NullInt64
		if err := rows.Scan(&a.ID, &a.Name, &meta, &a.Shared, &owner, &created, &updated, &fname, &fsize); err != nil {
			return nil, err
		}
		a.Mine = owner == userID
		if n := len(list); n == 0 || list[n-1].ID != a.ID {
			a.Meta, a.Files = json.RawMessage(meta), []AssetFile{}
			a.CreatedAt, a.UpdatedAt = time.UnixMilli(created), time.UnixMilli(updated)
			list = append(list, a)
		}
		if fname.Valid {
			last := &list[len(list)-1]
			last.Files = append(last.Files, AssetFile{Name: fname.String, Size: fsize.Int64})
		}
	}
	return list, rows.Err()
}

// UpdateAsset changes an asset's name and/or meta (nil: unchanged).
func (s *Store) UpdateAsset(ctx context.Context, userID int64, id string, name *string, meta json.RawMessage) (Asset, error) {
	cur, err := s.GetAsset(ctx, userID, id)
	if err != nil {
		return Asset{}, err
	}
	if name == nil && meta == nil {
		return cur, nil
	}
	n, m := cur.Name, string(cur.Meta)
	if name != nil {
		n = *name
	}
	if meta != nil {
		m = string(meta)
	}
	if _, err := s.exec(ctx, `UPDATE assets SET name = ?, meta = ?, updated_at = ? WHERE id = ? AND user_id = ?`, n, m, s.ms(), id, userID); err != nil {
		return Asset{}, err
	}
	return s.GetAsset(ctx, userID, id)
}

// DeleteAsset removes an asset and its files.
func (s *Store) DeleteAsset(ctx context.Context, userID int64, id string) error {
	return s.inTx(ctx, func(tx *txx) error {
		res, err := tx.exec(ctx, `DELETE FROM assets WHERE id = ? AND user_id = ?`, id, userID)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n != 1 {
			return ErrNotFound
		}
		// The foreign key cascades too; this keeps it right if it ever doesn't.
		_, err = tx.exec(ctx, `DELETE FROM asset_files WHERE asset_id = ?`, id)
		return err
	})
}

// AssetFile returns the contents of a file of one of a user's assets or a shared one, or ErrNotFound.
func (s *Store) AssetFile(ctx context.Context, userID int64, id, name string) ([]byte, error) {
	var data []byte
	err := s.queryRow(ctx, `SELECT f.data FROM asset_files f JOIN assets a ON a.id = f.asset_id
		WHERE a.id = ? AND (a.user_id = ? OR a.shared) AND f.name = ?`, id, userID, name).Scan(&data)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return data, err
}
