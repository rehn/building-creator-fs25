package api

import (
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"strings"

	"building-creator-fs25/backend/internal/store"
)

// maxModItems is the most posts (buildings and props) one mod holds; maxPlan is how far from the middle of the mod's plan one can stand (m).
const (
	maxModItems = 200
	maxPlan     = 5000
)

type modItemInput struct {
	ID   string  `json:"id"`
	Kind string  `json:"kind"`
	Ref  string  `json:"ref"`
	Type string  `json:"type"`
	X    float64 `json:"x"`
	Z    float64 `json:"z"`
	Rot  float64 `json:"rot"`
	Y    float64 `json:"y"`
}

type modInput struct {
	Name      *string         `json:"name"`
	Folder    *string         `json:"folder"`    // "" takes the mod out of its folder
	Thumbnail *string         `json:"thumbnail"` // the preview picture, a small JPEG or PNG data URL ("" takes it away)
	Data      json.RawMessage `json:"data"`
	Items     *[]modItemInput `json:"items"`
	Version   int64           `json:"version"`
}

func modError(w http.ResponseWriter, err error) {
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "That mod doesn't exist, or isn't yours.")
		return
	}
	internalError(w, err)
}

func finite(vs ...float64) bool {
	for _, v := range vs {
		if math.IsNaN(v) || math.IsInf(v, 0) || math.Abs(v) > maxPlan {
			return false
		}
	}
	return true
}

// checkMod validates what was sent and turns the items into the store's. It writes the error and returns false if something is bad.
func checkMod(w http.ResponseWriter, in *modInput) (store.ModUpdate, bool) {
	var upd store.ModUpdate
	if in.Name != nil {
		name, ok := cleanText(*in.Name, 100)
		if !ok {
			writeError(w, http.StatusBadRequest, "invalid_name", "Use a name of 1 to 100 characters.")
			return upd, false
		}
		upd.Name = &name
	}
	if in.Folder != nil {
		folder := ""
		if strings.TrimSpace(*in.Folder) != "" {
			var ok bool
			if folder, ok = cleanText(*in.Folder, maxFolderLen); !ok {
				writeError(w, http.StatusBadRequest, "invalid_folder", "Use a folder name of 1 to 80 characters.")
				return upd, false
			}
		}
		upd.Folder = &folder
	}
	if in.Thumbnail != nil {
		if !validThumbnail(*in.Thumbnail) {
			writeError(w, http.StatusBadRequest, "invalid_thumbnail", "The preview must be a small JPEG or PNG.")
			return upd, false
		}
		upd.Thumbnail = in.Thumbnail
	}
	if present(in.Data) {
		if !validData(in.Data) {
			writeError(w, http.StatusBadRequest, "invalid_data", "The mod's plan must be a JSON object under 1 MB.")
			return upd, false
		}
		upd.Data = in.Data
	}
	if in.Items != nil {
		if len(*in.Items) > maxModItems {
			writeError(w, http.StatusBadRequest, "too_many_items", "A mod holds at most 200 buildings and props.")
			return upd, false
		}
		items := make([]store.ModItem, 0, len(*in.Items))
		for _, it := range *in.Items {
			kindOK := it.Kind == store.ModBuilding || it.Kind == store.ModProp
			typ, typOK := it.Type, len(it.Type) <= 40
			if it.Type != "" {
				typ, typOK = cleanText(it.Type, 40)
			}
			if !kindOK || it.Ref == "" || len(it.Ref) > 64 || len(it.ID) > 64 || !typOK || !finite(it.X, it.Z) || !finite(it.Rot, it.Y) {
				writeError(w, http.StatusBadRequest, "invalid_item", "Each item needs a kind (building or prop), the id of the building or prop (a project of yours), a mod type of up to 40 characters and a place in the plan.")
				return upd, false
			}
			items = append(items, store.ModItem{ID: it.ID, Kind: it.Kind, Ref: it.Ref, Type: typ, X: it.X, Z: it.Z, Rot: it.Rot, Y: it.Y})
		}
		upd.Items = &items
	}
	return upd, true
}

func (s *Server) listMods(w http.ResponseWriter, r *http.Request, u store.User) {
	list, err := s.st.ListMods(r.Context(), u.ID)
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) getMod(w http.ResponseWriter, r *http.Request, u store.User) {
	m, err := s.st.GetMod(r.Context(), u.ID, r.PathValue("id"))
	if err != nil {
		modError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, m)
}

// createMod makes a mod: its name, and if sent its plan and its items.
func (s *Server) createMod(w http.ResponseWriter, r *http.Request, u store.User) {
	var in modInput
	if !decodeJSON(w, r, &in) {
		return
	}
	if in.Name == nil {
		name := "New mod"
		in.Name = &name
	}
	upd, ok := checkMod(w, &in)
	if !ok {
		return
	}
	m, err := s.st.CreateMod(r.Context(), u.ID, *upd.Name, upd.Data)
	if err == nil && upd.Items != nil {
		id := m.ID
		m, err = s.st.UpdateMod(r.Context(), u.ID, id, store.ModUpdate{Items: upd.Items}, 0)
		if err != nil {
			_ = s.st.DeleteMod(r.Context(), u.ID, id) // (a mod that can't have its items isn't made)
		}
	}
	if errors.Is(err, store.ErrBadRef) {
		writeError(w, http.StatusBadRequest, "invalid_ref", "An item points at a building or prop that isn't yours.")
		return
	}
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, m)
}

func (s *Server) updateMod(w http.ResponseWriter, r *http.Request, u store.User) {
	var in modInput
	if !decodeJSON(w, r, &in) {
		return
	}
	upd, ok := checkMod(w, &in)
	if !ok {
		return
	}
	m, err := s.st.UpdateMod(r.Context(), u.ID, r.PathValue("id"), upd, in.Version)
	switch {
	case errors.Is(err, store.ErrConflict):
		writeJSON(w, http.StatusConflict, apiError{Error: "version_conflict", Message: "This mod was changed somewhere else, for example in another tab.", Version: m.Version})
	case errors.Is(err, store.ErrBadRef):
		writeError(w, http.StatusBadRequest, "invalid_ref", "An item points at a building or prop that isn't yours.")
	case err != nil:
		modError(w, err)
	default:
		writeJSON(w, http.StatusOK, m)
	}
}

func (s *Server) deleteMod(w http.ResponseWriter, r *http.Request, u store.User) {
	if err := s.st.DeleteMod(r.Context(), u.ID, r.PathValue("id")); err != nil {
		modError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
