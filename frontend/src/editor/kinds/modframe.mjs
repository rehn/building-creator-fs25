// The frame of a mod (docs/PLAN_MOD.md, editor/modExport.mjs): the building the mod's one placeable is exported from. It draws nothing itself (the mod's buildings and props are in its i3d),
// it carries the mod's game objects. It is a shed (the objects every kind can have: a sleep point, a workshop ...) that can also be a chicken barn: when the mod has a hen yard (the feed pad,
// the animal trailer spot, the egg pallets, the info area and the fence of kinds/chicken.mjs) the placeable is the game's chicken barn and its husbandry is written as the hen house writes it,
// the mod's buildings cut out of the walking area. Not in KINDS: no one makes a new frame, only the mod export does.
// Not tried in the game: that the game takes a chicken barn whose buildings are several, and a fence round them all.
import shed from "./shed.mjs";
import { henScene, HEN_PLACEABLE, MAX_HENS } from "./chicken.mjs";
import { palletLines, cornerStripes, teleportFor, ccwFence, navContourNodes } from "./pasture.mjs";
import { insideNav } from "./modinside.mjs";
import { KEEP } from "../walkarea.mjs";
import { objectOf, boxOf, iconOf, pastureOf } from "../objects.mjs";
import { sharedDefaults } from "./gameobjects.mjs";

/** The object types of a hen yard (objects.mjs OBJECT_TYPES): the feed pad, trailer spot, egg pallets, info area and the fence. */
export const HEN_TYPES = ["food", "loading", "pallets", "info", "pasture"];
/** The smallest fence the game makes a walking area for (the hen house's own limit). */
const PASTURE = {minWidth: 12, depth: [6, 40]};
const hasYard = p => !!objectOf(p, "food") && !!objectOf(p, "pasture");
export const hensOf = p => Math.max(1, Math.min(MAX_HENS, Math.round(p.hens)));

const rectOf = b => ({x0: b.center[0] - b.size[0] / 2, x1: b.center[0] + b.size[0] / 2, z0: b.center[2] - b.size[2] / 2, z1: b.center[2] + b.size[2] / 2});

/** The yard (as henYard gives it) from the mod's objects: p.objects in the frame's coordinates, host.footprints (what the walking area goes round) the mod's buildings and props. */
function yardOf(p, geo, host) {
  const o = t => objectOf(p, t), pa = pastureOf(p);
  const food = boxOf(o("food")), loading = boxOf(o("loading")), pallets = boxOf(o("pallets")), info = boxOf(o("info"));
  const feet = (host && host.footprints) || [], fence = ccwFence(pa.fence);
  // the hens walk inside the chosen building (host.inside: {settings, place}): its floor and the doorways that face the fence; the answer (or why not) is left in host.insideResult for the warnings
  let nav = null;
  if (host && host.inside) {
    const contour = [...fence, ...navContourNodes(fence, feet).map(([x, z]) => [x, 0, z])];
    const blockers = feet.map(r => ({center: [(r.x0 + r.x1) / 2, 1, (r.z0 + r.z1) / 2], size: [r.x1 - r.x0, 2, r.z1 - r.z0], keep: KEEP.wall}));
    host.insideResult = insideNav({settings: host.inside.settings, place: host.inside.place, contour, blockers});
    nav = host.insideResult.nav;
  }
  return {
    nav,
    fence,
    food: {...food, marker: iconOf(o("food"))},
    pallet: {lines: palletLines(pallets), trigger: pallets, stripes: cornerStripes(rectOf(pallets))},
    loading: {...loading, marker: iconOf(o("loading")), teleport: teleportFor({box: loading}, geo.dims)},
    info,
    blockers: feet.map(r => ({center: [(r.x0 + r.x1) / 2, 1, (r.z0 + r.z1) / 2], size: [r.x1 - r.x0, 2, r.z1 - r.z0]})),
    areas: [food, pallets].map(rectOf),
  };
}

export default {
  ...shed,
  id: "modframe",
  name: "Mod",
  plural: "Mods",
  presets: [],
  hosted: true,
  defaults: {...shed.defaults, hens: 30},
  sections: [...shed.sections, {title: "Chickens", tab: "game", fields: [{k: "hens", label: "Hens", min: 1, max: MAX_HENS, step: 1}]}],
  // the shed's workshop, the shared objects and the hen yard
  objects: {types: ["workshop", ...HEN_TYPES], required: [], pasture: PASTURE, defaults: p => sharedDefaults(p, "workshop")},
  placeable: p => (hasYard(p) ? HEN_PLACEABLE : shed.placeable(p)),
  description: p => (hasYard(p) ? `A farm of buildings with a hen yard for ${hensOf(p)} hens, made with House to i3d.` : "A mod made with House to i3d."),
  /** The hen yard's nodes and XML, when the mod has one (c: the export context, with the host). */
  scene(c) {
    if (!hasYard(c.p) || !c.host) return {nodes: [], xml: "", areas: []};
    return henScene(c, yardOf(c.p, c.geo, c.host), hensOf(c.p), c.host.footprints || []);
  },
};
