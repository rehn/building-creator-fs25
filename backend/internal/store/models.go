package store

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// A Model is the files of a building the editor made when it saved: an OBJ and its MTL for drawing, and the game mod (a zip with
// modDesc.xml, house.xml and house.i3d). Version is the version of the building they were made from.
type Model struct {
	Version   int64
	Obj, Mtl  []byte
	Mod       []byte
	Export    []byte // what "Export model" gives: a folder with house.i3d, placeable_snippet.xml, textures and items
	UpdatedAt time.Time
}

// PutModel stores the model of a building of the user's, which must be made from its current version (else ErrConflict:
// a later save is on its way with a model of its own). It replaces the one before.
func (s *Store) PutModel(ctx context.Context, userID int64, projectID string, version int64, m Model) error {
	if m.Export == nil {
		m.Export = []byte{}
	}
	return s.inTx(ctx, func(tx *txx) error {
		sel := `SELECT version FROM projects WHERE id = ? AND user_id = ?`
		if s.dialect == postgres {
			sel += " FOR UPDATE"
		}
		var cur int64
		if err := tx.queryRow(ctx, sel, projectID, userID).Scan(&cur); errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		} else if err != nil {
			return err
		}
		if cur != version {
			return ErrConflict
		}
		if _, err := tx.exec(ctx, `DELETE FROM project_models WHERE project_id = ?`, projectID); err != nil {
			return err
		}
		_, err := tx.exec(ctx, `INSERT INTO project_models (project_id, version, obj, mtl, mod_zip, export_zip, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
			projectID, version, m.Obj, m.Mtl, m.Mod, m.Export, s.ms())
		return err
	})
}

// GetModel returns the model of a building of the user's, or ErrNotFound if it has none (not saved since models were kept).
func (s *Store) GetModel(ctx context.Context, userID int64, projectID string) (Model, error) {
	var m Model
	var updated int64
	err := s.queryRow(ctx, `SELECT m.version, m.obj, m.mtl, m.mod_zip, m.export_zip, m.updated_at FROM project_models m JOIN projects p ON p.id = m.project_id
		WHERE m.project_id = ? AND p.user_id = ?`, projectID, userID).Scan(&m.Version, &m.Obj, &m.Mtl, &m.Mod, &m.Export, &updated)
	if errors.Is(err, sql.ErrNoRows) {
		return Model{}, ErrNotFound
	}
	m.UpdatedAt = time.UnixMilli(updated)
	return m, err
}
