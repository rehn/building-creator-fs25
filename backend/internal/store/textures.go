package store

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// A Texture is a photo made into a game texture by the browser (crop, resize, seamless, normal and specular maps: see photoTexture.mjs): the three
// finished DDS files, a small picture for the list and the real size in metres. Private to the user: unlike items and parts it is never shared
// (the user answers for having the right to the photo). The server only stores them.
type Texture struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Size      int       `json:"size"`   // the side in pixels, a power of two
	Meters    float64   `json:"meters"` // the real side of the texture
	Thumb     string    `json:"thumb"`  // a small JPEG data URL
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// TextureData is a texture with its files, to be stored.
type TextureData struct {
	Name                      string
	Size                      int
	Meters                    float64
	Thumb                     string
	Diffuse, Normal, Specular []byte
}

const textureCols = `id, name, size, meters, thumb, created_at, updated_at`

func scanTexture(row scanner) (Texture, error) {
	var t Texture
	var created, updated int64
	err := row.Scan(&t.ID, &t.Name, &t.Size, &t.Meters, &t.Thumb, &created, &updated)
	if errors.Is(err, sql.ErrNoRows) {
		return Texture{}, ErrNotFound
	}
	if err != nil {
		return Texture{}, err
	}
	t.CreatedAt, t.UpdatedAt = time.UnixMilli(created), time.UnixMilli(updated)
	return t, nil
}

// CreateTexture stores a new texture for the user.
func (s *Store) CreateTexture(ctx context.Context, userID int64, d TextureData) (Texture, error) {
	id, now := newID(), s.ms()
	if _, err := s.exec(ctx, `INSERT INTO textures (id, user_id, name, size, meters, thumb, diffuse, normal, specular, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, userID, d.Name, d.Size, d.Meters, d.Thumb, d.Diffuse, d.Normal, d.Specular, now, now); err != nil {
		return Texture{}, err
	}
	return s.GetTexture(ctx, userID, id)
}

// GetTexture returns one of the user's textures (without its files), else ErrNotFound.
func (s *Store) GetTexture(ctx context.Context, userID int64, id string) (Texture, error) {
	return scanTexture(s.queryRow(ctx, `SELECT `+textureCols+` FROM textures WHERE id = ? AND user_id = ?`, id, userID))
}

// ListTextures returns the user's textures, the last changed first.
func (s *Store) ListTextures(ctx context.Context, userID int64) ([]Texture, error) {
	rows, err := s.query(ctx, `SELECT `+textureCols+` FROM textures WHERE user_id = ? ORDER BY updated_at DESC, id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []Texture{}
	for rows.Next() {
		t, err := scanTexture(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, t)
	}
	return list, rows.Err()
}

// CountTextures is how many textures the user has (the API limits it).
func (s *Store) CountTextures(ctx context.Context, userID int64) (int, error) {
	var n int
	err := s.queryRow(ctx, `SELECT COUNT(*) FROM textures WHERE user_id = ?`, userID).Scan(&n)
	return n, err
}

// TextureFile returns one of a texture's DDS files: kind is diffuse, normal or specular.
func (s *Store) TextureFile(ctx context.Context, userID int64, id, kind string) ([]byte, error) {
	switch kind {
	case "diffuse", "normal", "specular":
	default:
		return nil, ErrNotFound
	}
	var data []byte
	err := s.queryRow(ctx, `SELECT `+kind+` FROM textures WHERE id = ? AND user_id = ?`, id, userID).Scan(&data)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return data, err
}

// UpdateTexture changes the name and/or the real size in metres of one of the user's textures (nil: leave as it is).
func (s *Store) UpdateTexture(ctx context.Context, userID int64, id string, name *string, meters *float64) (Texture, error) {
	cur, err := s.GetTexture(ctx, userID, id)
	if err != nil {
		return Texture{}, err
	}
	if name == nil && meters == nil {
		return cur, nil
	}
	if name != nil {
		cur.Name = *name
	}
	if meters != nil {
		cur.Meters = *meters
	}
	if _, err := s.exec(ctx, `UPDATE textures SET name = ?, meters = ?, updated_at = ? WHERE id = ? AND user_id = ?`, cur.Name, cur.Meters, s.ms(), id, userID); err != nil {
		return Texture{}, err
	}
	return s.GetTexture(ctx, userID, id)
}

// DeleteTexture removes one of the user's textures.
func (s *Store) DeleteTexture(ctx context.Context, userID int64, id string) error {
	res, err := s.exec(ctx, `DELETE FROM textures WHERE id = ? AND user_id = ?`, id, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return ErrNotFound
	}
	return nil
}
