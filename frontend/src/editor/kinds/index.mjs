// Building kinds. Each kind is a module with the same shape (see house.mjs and chicken.mjs):
//   id, name, plural      what it is ("Hen house"), and as a heading over a group ("Hen houses")
//   category              where "New" lists it (CATEGORIES)
//   walkIn                inside walls, hollow collision, a door that opens and a furnished inside
//   defaults, sections    its own settings and the editor sections for them (shown first)
//   hides                 titles of shared editor sections it doesn't use
//   normalize(p)          the settings as this kind uses them (applied when loading and exporting)
//   placeable(p)          FS25 placeable type, shop function and shop category
//   description(p)        default text for the mod list
//   furnish(c)            walk-in kinds: builds the inside (c: drawing context from the core)
//   scene(c)              extra i3d nodes, placeable XML and ground areas (c: export context)
//   places, gamePlaces(c) its game places (FS25 boxes and icons the player can move and size, see
//                         places.mjs): [{id, name, hint, wall, glyph}], and where they are for the preview
//   presets               starting points for "New"
// Kinds import only the i3d writer and the core's pure helpers (layout.mjs, places.mjs), never model.mjs,
// so there are no import cycles.
import house from "./house.mjs";
import chicken from "./chicken.mjs";
import cow from "./cow.mjs";

export const KINDS = [house, chicken, cow];
export const KIND = Object.fromEntries(KINDS.map(k => [k.id, k]));
/** The kind of a project's settings; saves without one are farmhouses. */
export const kindOf = p => KIND[p && p.kind] || house;

/**
 * Items grouped under their kind ({kind, items}), kinds in KINDS order, empty kinds left out,
 * the items' order kept. idOf(item) gives the item's kind id; missing or unknown ids are farmhouses.
 */
export function groupByKind(list, idOf) {
  return KINDS.map(kind => ({kind, items: list.filter(x => kindOf({kind: idOf(x)}) === kind)}))
    .filter(g => g.items.length);
}

/** Groups for "New", in order. Only groups with at least one kind are shown. */
export const CATEGORIES = [
  {id: "homes", name: "Homes", blurb: "Farmhouses you can sleep in."},
  {id: "animals", name: "Animal buildings", blurb: "Barns with a pasture, feeding and products."},
  {id: "sheds", name: "Sheds and storage", blurb: "Machine sheds and storage halls."},
  {id: "workshops", name: "Workshops", blurb: "Places to repair and paint vehicles."},
];
