package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

// A Mod is a container of buildings and free-standing props (docs/PLAN_MOD.md): the things it holds are listed as Items, each placed in
// the mod's own plan, and the mod follows them live (it stores their ids, not copies). A thing may be in several mods. Data is the mod's own
// part of the plan (the game objects added on its page): the server only stores it, the editor reads it.
type Mod struct {
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	Data      json.RawMessage `json:"data,omitempty"` // only when one mod is fetched
	Items     []ModItem       `json:"items,omitempty"`
	ItemCount int             `json:"itemCount"`
	Version   int64           `json:"version"`
	CreatedAt time.Time       `json:"createdAt"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

// A ModItem is one post of a mod: a building or a prop (both are projects: a prop is a project of kind "prop", made in the modeller) with the place it has in the mod's plan and the
// mod type it is generated with (the building has no type of its own; "" is a plain building). Name and Missing are read from what it
// points at: a thing that was deleted is Missing and stays in the list until it is taken out.
type ModItem struct {
	ID   string  `json:"id"`
	Kind string  `json:"kind"` // ModBuilding or ModProp
	Ref  string  `json:"ref"`  // the project's id
	Type string  `json:"type"`
	X    float64 `json:"x"`
	Z    float64 `json:"z"`
	Rot  float64 `json:"rot"` // degrees
	// Objects: the game objects put on this post (sleep point, workshop ...), as the editor keeps them (objects.mjs), in the post's own coordinates.
	// The server only stores the list.
	Objects json.RawMessage `json:"objects"`
	Name    string          `json:"name"`
	Missing bool            `json:"missing"`
}

const (
	ModBuilding = "building"
	ModProp     = "prop"
)

// ErrBadRef: an item points at a project that is not the user's.
var ErrBadRef = errors.New("store: a mod item points at something the user can't use")

// ModUpdate: what is changed (nil / empty: left as it is). Items replaces the whole list.
type ModUpdate struct {
	Name  *string
	Data  json.RawMessage
	Items *[]ModItem
}

// CreateMod stores a new, empty mod.
func (s *Store) CreateMod(ctx context.Context, userID int64, name string, data json.RawMessage) (Mod, error) {
	if len(data) == 0 {
		data = json.RawMessage(`{}`)
	}
	id, now := newID(), s.ms()
	if _, err := s.exec(ctx, `INSERT INTO mods (id, user_id, name, data, version, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)`,
		id, userID, name, string(data), now, now); err != nil {
		return Mod{}, err
	}
	return s.GetMod(ctx, userID, id)
}

func scanMod(row scanner, withData bool) (Mod, error) {
	var m Mod
	var data string
	var created, updated int64
	var err error
	if withData {
		err = row.Scan(&m.ID, &m.Name, &m.Version, &created, &updated, &m.ItemCount, &data)
	} else {
		err = row.Scan(&m.ID, &m.Name, &m.Version, &created, &updated, &m.ItemCount)
	}
	if errors.Is(err, sql.ErrNoRows) {
		return Mod{}, ErrNotFound
	}
	if err != nil {
		return Mod{}, err
	}
	if withData {
		m.Data = json.RawMessage(data)
	}
	m.CreatedAt, m.UpdatedAt = time.UnixMilli(created), time.UnixMilli(updated)
	return m, nil
}

const modCols = `m.id, m.name, m.version, m.created_at, m.updated_at, (SELECT COUNT(*) FROM mod_items i WHERE i.mod_id = m.id)`

// modItemsSQL reads a mod's items with the names of the projects they point at.
const modItemsSQL = `SELECT i.id, i.kind, i.ref_id, i.type, i.x, i.z, i.rot, i.objects, COALESCE(p.name, ''), CASE WHEN p.id IS NULL THEN 1 ELSE 0 END
	FROM mod_items i
	JOIN mods m ON m.id = i.mod_id
	LEFT JOIN projects p ON p.id = i.ref_id AND p.user_id = m.user_id
	WHERE i.mod_id = ? ORDER BY i.pos`

func (s *Store) modItems(ctx context.Context, q interface {
	query(context.Context, string, ...any) (*sql.Rows, error)
}, id string) ([]ModItem, error) {
	rows, err := q.query(ctx, modItemsSQL, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []ModItem{}
	for rows.Next() {
		var it ModItem
		var missing int
		var objects string
		if err := rows.Scan(&it.ID, &it.Kind, &it.Ref, &it.Type, &it.X, &it.Z, &it.Rot, &objects, &it.Name, &missing); err != nil {
			return nil, err
		}
		it.Objects = json.RawMessage(objects)
		it.Missing = missing == 1
		items = append(items, it)
	}
	return items, rows.Err()
}

// GetMod returns a mod of the user's with its plan data and its items, else ErrNotFound.
func (s *Store) GetMod(ctx context.Context, userID int64, id string) (Mod, error) {
	m, err := scanMod(s.queryRow(ctx, `SELECT `+modCols+`, m.data FROM mods m WHERE m.id = ? AND m.user_id = ?`, id, userID), true)
	if err != nil {
		return Mod{}, err
	}
	if m.Items, err = s.modItems(ctx, s, id); err != nil {
		return Mod{}, err
	}
	return m, nil
}

// ListMods returns the user's mods (without their plans and items, with how many items), the last changed first.
func (s *Store) ListMods(ctx context.Context, userID int64) ([]Mod, error) {
	rows, err := s.query(ctx, `SELECT `+modCols+` FROM mods m WHERE m.user_id = ? ORDER BY m.updated_at DESC, m.id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []Mod{}
	for rows.Next() {
		m, err := scanMod(rows, false)
		if err != nil {
			return nil, err
		}
		list = append(list, m)
	}
	return list, rows.Err()
}

// UpdateMod changes a mod. If ifVersion is not 0 and the mod is at another version, nothing changes and the current mod is returned
// with ErrConflict. A new list of items is checked first: every item must point at something the user can use (else ErrBadRef).
func (s *Store) UpdateMod(ctx context.Context, userID int64, id string, u ModUpdate, ifVersion int64) (Mod, error) {
	tx, err := s.begin(ctx)
	if err != nil {
		return Mod{}, err
	}
	defer tx.Rollback()
	sel := `SELECT ` + modCols + `, m.data FROM mods m WHERE m.id = ? AND m.user_id = ?`
	if s.dialect == postgres {
		sel += " FOR UPDATE" // two saves at once: the second waits, then sees the new version
	}
	cur, err := scanMod(tx.queryRow(ctx, sel, id, userID), true)
	if err != nil {
		return Mod{}, err
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
	if u.Items != nil {
		for _, it := range *u.Items {
			var n int
			if it.Kind != ModBuilding && it.Kind != ModProp {
				return Mod{}, ErrBadRef
			}
			if err = tx.queryRow(ctx, `SELECT COUNT(*) FROM projects WHERE id = ? AND user_id = ?`, it.Ref, userID).Scan(&n); err != nil {
				return Mod{}, err
			}
			if n != 1 {
				return Mod{}, ErrBadRef
			}
		}
		if _, err := tx.exec(ctx, `DELETE FROM mod_items WHERE mod_id = ?`, id); err != nil {
			return Mod{}, err
		}
		seen := map[string]bool{}
		for pos, it := range *u.Items {
			if it.ID == "" || seen[it.ID] {
				it.ID = newID()
			}
			seen[it.ID] = true
			if len(it.Objects) == 0 {
				it.Objects = json.RawMessage(`[]`)
			}
			if _, err := tx.exec(ctx, `INSERT INTO mod_items (mod_id, id, pos, kind, ref_id, type, x, z, rot, objects) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				id, it.ID, pos, it.Kind, it.Ref, it.Type, it.X, it.Z, it.Rot, string(it.Objects)); err != nil {
				return Mod{}, err
			}
		}
	}
	cur.Version++
	now := s.ms()
	if _, err := tx.exec(ctx, `UPDATE mods SET name = ?, data = ?, version = ?, updated_at = ? WHERE id = ?`, cur.Name, string(cur.Data), cur.Version, now, id); err != nil {
		return Mod{}, err
	}
	if cur.Items, err = s.modItems(ctx, tx, id); err != nil {
		return Mod{}, err
	}
	cur.ItemCount, cur.UpdatedAt = len(cur.Items), time.UnixMilli(now)
	return cur, tx.Commit()
}

// DeleteMod removes one of the user's mods (what it holds stays).
func (s *Store) DeleteMod(ctx context.Context, userID int64, id string) error {
	res, err := s.exec(ctx, `DELETE FROM mods WHERE id = ? AND user_id = ?`, id, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return ErrNotFound
	}
	return nil
}
