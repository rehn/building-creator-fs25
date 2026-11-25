package store

import "context"

// DeleteFolder deletes a folder of the user's and takes what is in it out of it: the buildings, props and mods stay (in no folder, unchanged: not their version).
// ErrNotFound when there is no such folder, ErrFolderClash when a building a map program made would meet one with the same source id that is in no folder.
func (s *Store) DeleteFolder(ctx context.Context, userID int64, name string) error {
	return s.inTx(ctx, func(tx *txx) error {
		var clash int
		if err := tx.queryRow(ctx, `SELECT COUNT(*) FROM projects a JOIN projects b ON b.user_id = a.user_id AND b.folder = '' AND b.source_id = a.source_id
			WHERE a.user_id = ? AND a.folder = ? AND a.source_id <> ''`, userID, name).Scan(&clash); err != nil {
			return err
		}
		if clash > 0 {
			return ErrFolderClash
		}
		var n int64
		for _, q := range []string{`UPDATE projects SET folder = '' WHERE user_id = ? AND folder = ?`, `UPDATE mods SET folder = '' WHERE user_id = ? AND folder = ?`, `DELETE FROM folders WHERE user_id = ? AND name = ?`} {
			res, err := tx.exec(ctx, q, userID, name)
			if err != nil {
				return err
			}
			c, err := res.RowsAffected()
			if err != nil {
				return err
			}
			n += c
		}
		if n == 0 {
			return ErrNotFound
		}
		return nil
	})
}
