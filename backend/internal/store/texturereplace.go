package store

import "context"

// ReplaceTexture replaces the finished maps and the preview of one of the user's textures (a texture that is edited again: the browser made the maps again from the edited picture).
// The name and the real size stay unless they are given (d.Name not empty, d.Meters more than 0). ErrNotFound when it is not the user's.
func (s *Store) ReplaceTexture(ctx context.Context, userID int64, id string, d TextureData) (Texture, error) {
	cur, err := s.GetTexture(ctx, userID, id)
	if err != nil {
		return Texture{}, err
	}
	name, meters := cur.Name, cur.Meters
	if d.Name != "" {
		name = d.Name
	}
	if d.Meters > 0 {
		meters = d.Meters
	}
	if _, err := s.exec(ctx, `UPDATE textures SET name = ?, size = ?, meters = ?, thumb = ?, diffuse = ?, normal = ?, specular = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
		name, d.Size, meters, d.Thumb, d.Diffuse, d.Normal, d.Specular, s.ms(), id, userID); err != nil {
		return Texture{}, err
	}
	return s.GetTexture(ctx, userID, id)
}
