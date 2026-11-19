package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"
)

// What UpsertGenerated did.
type GenStatus string

const (
	Created GenStatus = "created" // a new building
	Updated GenStatus = "updated" // the building of that source id in that folder, made again
	Kept    GenStatus = "kept"    // a person has changed it since: it was left as it is
)

// UpsertGenerated is for a program that makes buildings (from OSM footprints, say): the building with this source id in this folder is made
// or, when there is one, made again with the new name and settings. A building a person has changed in the editor since it was generated is
// left alone (Kept). A regenerated building has no model until the caller sends one (the old model was made from the old settings).
// The source id and the folder are both needed; the same id in another folder, or for another user, is another building.
func (s *Store) UpsertGenerated(ctx context.Context, userID int64, folder, sourceID, name string, data json.RawMessage) (Project, GenStatus, error) {
	if folder == "" || sourceID == "" {
		return Project{}, "", errors.New("a generated building needs a folder and a source id")
	}
	var p Project
	var status GenStatus
	var err error
	// Two requests for the same id at once: the second one's insert is refused by the unique index, and it looks again.
	for attempt := 0; attempt < 2; attempt++ {
		if p, status, err = s.upsertGenerated(ctx, userID, folder, sourceID, name, data); err == nil {
			return p, status, nil
		}
	}
	return Project{}, "", err
}

func (s *Store) upsertGenerated(ctx context.Context, userID int64, folder, sourceID, name string, data json.RawMessage) (Project, GenStatus, error) {
	tx, err := s.begin(ctx)
	if err != nil {
		return Project{}, "", err
	}
	defer tx.Rollback()
	sel := `SELECT ` + projectCols + ` FROM projects WHERE user_id = ? AND folder = ? AND source_id = ?`
	if s.dialect == postgres {
		sel += " FOR UPDATE"
	}
	cur, err := scanProject(tx.queryRow(ctx, sel, userID, folder, sourceID))
	now := s.ms()
	switch {
	case errors.Is(err, ErrNotFound):
		id := newID()
		if _, err := tx.exec(ctx, `INSERT INTO projects (id, user_id, name, data, thumbnail, version, created_at, updated_at, folder, source_id, generated_version) VALUES (?, ?, ?, ?, '', 1, ?, ?, ?, ?, 1)`,
			id, userID, name, string(data), now, now, folder, sourceID); err != nil {
			return Project{}, "", err
		}
		if err := tx.Commit(); err != nil {
			return Project{}, "", err
		}
		p, err := s.GetProject(ctx, userID, id)
		return p, Created, err
	case err != nil:
		return Project{}, "", err
	case cur.Edited:
		return cur, Kept, nil
	}
	cur.Name, cur.Data, cur.Version, cur.UpdatedAt = name, data, cur.Version+1, time.UnixMilli(now)
	cur.setGenerated(cur.Version)
	cur.ModelVersion = 0
	if _, err := tx.exec(ctx, `UPDATE projects SET name = ?, data = ?, version = ?, generated_version = ?, updated_at = ? WHERE id = ?`,
		name, string(data), cur.Version, cur.Version, now, cur.ID); err != nil {
		return Project{}, "", err
	}
	if _, err := tx.exec(ctx, `DELETE FROM project_models WHERE project_id = ?`, cur.ID); err != nil {
		return Project{}, "", err
	}
	return cur, Updated, tx.Commit()
}
