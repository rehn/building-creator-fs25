package store

import (
	"context"
)

// The folders are the app's own: a building, a prop and a mod are each in one or in none, by its name. A folder exists while something is in it, and
// also from when it is made (CreateFolder) until it is renamed, so that one can be made before anything is put in it. (ListFolders, the map programs'
// list, is of buildings only.)

// FolderInfo is a folder with how many projects (buildings and props) and mods are in it.
type FolderInfo struct {
	Name     string `json:"name"`
	Projects int    `json:"buildings"`
	Mods     int    `json:"mods"`
}

// CreateFolder makes a folder that nothing is in yet. Making one that exists is fine.
func (s *Store) CreateFolder(ctx context.Context, userID int64, name string) error {
	_, err := s.exec(ctx, `INSERT INTO folders (user_id, name, created_at) VALUES (?, ?, ?) ON CONFLICT (user_id, name) DO NOTHING`, userID, name, s.ms())
	return err
}

// AllFolders returns every folder of the user's: the ones that were made and the ones something is in, by name, with what is in each.
func (s *Store) AllFolders(ctx context.Context, userID int64) ([]FolderInfo, error) {
	rows, err := s.query(ctx, `SELECT name, CAST(SUM(p) AS INTEGER), CAST(SUM(m) AS INTEGER) FROM (
		SELECT name, 0 AS p, 0 AS m FROM folders WHERE user_id = ?
		UNION ALL SELECT folder, COUNT(*), 0 FROM projects WHERE user_id = ? AND folder <> '' GROUP BY folder
		UNION ALL SELECT folder, 0, COUNT(*) FROM mods WHERE user_id = ? AND folder <> '' GROUP BY folder
	) x GROUP BY name ORDER BY name`, userID, userID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []FolderInfo{}
	for rows.Next() {
		var f FolderInfo
		if err := rows.Scan(&f.Name, &f.Projects, &f.Mods); err != nil {
			return nil, err
		}
		list = append(list, f)
	}
	return list, rows.Err()
}
