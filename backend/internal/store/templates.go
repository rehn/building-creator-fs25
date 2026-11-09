package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

// A Template is a starting design for "New" that the admin made for everyone, usually from photos
// of a real building: Claude suggests the settings from the photos (Suggestion), the admin adjusts
// them in an ordinary project of theirs (ProjectID) and publishes the result (Settings, Thumbnail).
// Drafts are only listed for the admin. The photos stay with it (template_photos).
type Template struct {
	ID         string          `json:"id"`
	Kind       string          `json:"kind"`
	Name       string          `json:"name"`
	Blurb      string          `json:"blurb"`
	Settings   json.RawMessage `json:"settings"`
	Thumbnail  string          `json:"thumbnail"`
	Suggestion json.RawMessage `json:"suggestion"`
	ProjectID  string          `json:"projectId"`
	Published  bool            `json:"published"`
	Photos     int             `json:"photos"` // how many
	CreatedAt  time.Time       `json:"createdAt"`
	UpdatedAt  time.Time       `json:"updatedAt"`
}

// TemplateInput is what a new template starts with.
type TemplateInput struct {
	Kind, Name, Blurb string
}

// TemplatePhoto is a photo of the building: its MIME type and bytes.
type TemplatePhoto struct {
	Type string
	Data []byte
}

// TemplateUpdate holds the fields to change; nil or empty fields are left alone.
type TemplateUpdate struct {
	Name, Blurb, Thumbnail, ProjectID *string
	Settings, Suggestion              json.RawMessage
	Published                         *bool
}

// CreateTemplate stores a new draft template and its photos.
func (s *Store) CreateTemplate(ctx context.Context, userID int64, in TemplateInput, photos []TemplatePhoto) (Template, error) {
	id, now := newID(), s.ms()
	err := s.inTx(ctx, func(tx *txx) error {
		if _, err := tx.exec(ctx, `INSERT INTO templates (id, kind, name, blurb, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
			id, in.Kind, in.Name, in.Blurb, userID, now, now); err != nil {
			return err
		}
		for i, p := range photos {
			if _, err := tx.exec(ctx, `INSERT INTO template_photos (template_id, pos, type, data) VALUES (?, ?, ?, ?)`, id, i, p.Type, p.Data); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return Template{}, err
	}
	return s.GetTemplate(ctx, id)
}

const templateCols = `t.id, t.kind, t.name, t.blurb, t.settings, t.thumbnail, t.suggestion, t.project_id, t.published, t.created_at, t.updated_at,
	(SELECT count(*) FROM template_photos p WHERE p.template_id = t.id)`

func scanTemplate(row scanner) (Template, error) {
	var t Template
	var settings string
	var suggestion sql.NullString
	var created, updated int64
	err := row.Scan(&t.ID, &t.Kind, &t.Name, &t.Blurb, &settings, &t.Thumbnail, &suggestion, &t.ProjectID, &t.Published, &created, &updated, &t.Photos)
	if errors.Is(err, sql.ErrNoRows) {
		return Template{}, ErrNotFound
	}
	if err != nil {
		return Template{}, err
	}
	t.Settings = json.RawMessage(settings)
	if suggestion.Valid {
		t.Suggestion = json.RawMessage(suggestion.String)
	}
	t.CreatedAt, t.UpdatedAt = time.UnixMilli(created), time.UnixMilli(updated)
	return t, nil
}

// GetTemplate returns a template, draft or not (who may see drafts is the API's call).
func (s *Store) GetTemplate(ctx context.Context, id string) (Template, error) {
	return scanTemplate(s.queryRow(ctx, `SELECT `+templateCols+` FROM templates t WHERE t.id = ?`, id))
}

// ListTemplates returns the published templates, or every one with drafts, the last changed first.
func (s *Store) ListTemplates(ctx context.Context, drafts bool) ([]Template, error) {
	q := `SELECT ` + templateCols + ` FROM templates t`
	if !drafts {
		q += ` WHERE t.published`
	}
	rows, err := s.query(ctx, q+` ORDER BY t.updated_at DESC, t.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []Template{}
	for rows.Next() {
		t, err := scanTemplate(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, t)
	}
	return list, rows.Err()
}

// TemplatePhoto returns photo n (from 0) of a template.
func (s *Store) TemplatePhoto(ctx context.Context, id string, n int) (TemplatePhoto, error) {
	var p TemplatePhoto
	err := s.queryRow(ctx, `SELECT type, data FROM template_photos WHERE template_id = ? AND pos = ?`, id, n).Scan(&p.Type, &p.Data)
	if errors.Is(err, sql.ErrNoRows) {
		return p, ErrNotFound
	}
	return p, err
}

// UpdateTemplate changes the fields that are set.
func (s *Store) UpdateTemplate(ctx context.Context, id string, u TemplateUpdate) (Template, error) {
	var t Template
	err := s.inTx(ctx, func(tx *txx) error {
		var err error
		if t, err = scanTemplate(tx.queryRow(ctx, `SELECT `+templateCols+` FROM templates t WHERE t.id = ?`, id)); err != nil {
			return err
		}
		set := func(dst *string, v *string) {
			if v != nil {
				*dst = *v
			}
		}
		set(&t.Name, u.Name)
		set(&t.Blurb, u.Blurb)
		set(&t.Thumbnail, u.Thumbnail)
		set(&t.ProjectID, u.ProjectID)
		if len(u.Settings) > 0 {
			t.Settings = u.Settings
		}
		if len(u.Suggestion) > 0 {
			t.Suggestion = u.Suggestion
		}
		if u.Published != nil {
			t.Published = *u.Published
		}
		var suggestion sql.NullString
		if t.Suggestion != nil {
			suggestion = sql.NullString{String: string(t.Suggestion), Valid: true}
		}
		now := s.ms()
		t.UpdatedAt = time.UnixMilli(now)
		_, err = tx.exec(ctx, `UPDATE templates SET name = ?, blurb = ?, settings = ?, thumbnail = ?, suggestion = ?, project_id = ?, published = ?, updated_at = ? WHERE id = ?`,
			t.Name, t.Blurb, string(t.Settings), t.Thumbnail, suggestion, t.ProjectID, t.Published, now, id)
		return err
	})
	if err != nil {
		return Template{}, err
	}
	return t, nil
}

// DeleteTemplate removes a template and its photos.
func (s *Store) DeleteTemplate(ctx context.Context, id string) error {
	res, err := s.exec(ctx, `DELETE FROM templates WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return ErrNotFound
	}
	return nil
}
