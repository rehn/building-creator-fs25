package store

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// A ModPackage is the game mod of a whole mod as one zip (modDesc.xml, the placeable, its i3d, textures ...), made in the browser (the export is JavaScript)
// and kept so that other programs, such as the map app, can fetch it. Version is the version of the mod it was made from: a mod saved after that has a
// newer version, and the package is out of date.
type ModPackage struct {
	Version   int64
	Zip       []byte
	UpdatedAt time.Time
}

// PutModPackage stores the package of a mod of the user's, which must be made from the mod's current version (else ErrConflict: the mod was saved again
// and a package of that version is on its way). It replaces the one before.
func (s *Store) PutModPackage(ctx context.Context, userID int64, modID string, version int64, zip []byte) error {
	return s.inTx(ctx, func(tx *txx) error {
		sel := `SELECT version FROM mods WHERE id = ? AND user_id = ?`
		if s.dialect == postgres {
			sel += " FOR UPDATE"
		}
		var cur int64
		if err := tx.queryRow(ctx, sel, modID, userID).Scan(&cur); errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		} else if err != nil {
			return err
		}
		if cur != version {
			return ErrConflict
		}
		if _, err := tx.exec(ctx, `DELETE FROM mod_packages WHERE mod_id = ?`, modID); err != nil {
			return err
		}
		_, err := tx.exec(ctx, `INSERT INTO mod_packages (mod_id, version, zip, updated_at) VALUES (?, ?, ?, ?)`, modID, version, zip, s.ms())
		return err
	})
}

// GetModPackage returns the package of a mod of the user's, or ErrNotFound if the mod is not theirs or has none.
func (s *Store) GetModPackage(ctx context.Context, userID int64, modID string) (ModPackage, error) {
	var p ModPackage
	var updated int64
	err := s.queryRow(ctx, `SELECT k.version, k.zip, k.updated_at FROM mod_packages k JOIN mods m ON m.id = k.mod_id WHERE k.mod_id = ? AND m.user_id = ?`,
		modID, userID).Scan(&p.Version, &p.Zip, &updated)
	if errors.Is(err, sql.ErrNoRows) {
		return ModPackage{}, ErrNotFound
	}
	p.UpdatedAt = time.UnixMilli(updated)
	return p, err
}

// ModPackageVersion is the version of the mod the stored package was made from, 0 when there is none.
func (s *Store) ModPackageVersion(ctx context.Context, userID int64, modID string) (int64, error) {
	var v int64
	err := s.queryRow(ctx, `SELECT k.version FROM mod_packages k JOIN mods m ON m.id = k.mod_id WHERE k.mod_id = ? AND m.user_id = ?`, modID, userID).Scan(&v)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil
	}
	return v, err
}
