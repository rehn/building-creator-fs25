// Building kinds. Each kind is a module with the same shape (see house.mjs and chicken.mjs):
//   id, name, category    what it is and where "New" lists it (CATEGORIES)
//   walkIn                inside walls, hollow collision, a door that opens and a furnished inside
//   defaults, sections    its own settings and the editor sections for them (shown first)
//   hides                 titles of shared editor sections it doesn't use
//   normalize(p)          the settings as this kind uses them (applied when loading and exporting)
//   placeable(p)          FS25 placeable type, shop function and shop category
//   description(p)        default text for the mod list
//   furnish(c)            walk-in kinds: builds the inside (c: drawing context from the core)
//   scene(c)              extra i3d nodes, placeable XML and ground areas (c: export context)
//   presets               starting points for "New"
// Kinds import only the i3d writer, never the core, so there are no import cycles.
import house from "./house.mjs";
import chicken from "./chicken.mjs";
import cow from "./cow.mjs";

export const KINDS = [house, chicken, cow];
export const KIND = Object.fromEntries(KINDS.map(k => [k.id, k]));
/** The kind of a project's settings; saves without one are farmhouses. */
export const kindOf = p => KIND[p && p.kind] || house;

/** Groups for "New", in order. Only groups with at least one kind are shown. */
export const CATEGORIES = [
  {id: "homes", name: "Homes", blurb: "Farmhouses you can sleep in."},
  {id: "animals", name: "Animal buildings", blurb: "Barns with a pasture, feeding and products."},
  {id: "sheds", name: "Sheds and storage", blurb: "Machine sheds and storage halls."},
  {id: "workshops", name: "Workshops", blurb: "Places to repair and paint vehicles."},
];
