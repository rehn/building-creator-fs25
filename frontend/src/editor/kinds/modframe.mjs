// The frame of a mod (docs/PLAN_MOD.md, editor/modExport.mjs): the building the mod's one placeable is exported from. It draws nothing itself (the mod's buildings and props are in its i3d),
// it carries the mod's game objects. It is a shed (the objects every kind can have: a sleep point, a workshop ...) that can also be a chicken barn: when the mod has a hen yard (the feed pad,
// the animal trailer spot, the egg pallets, the info area and the fence of kinds/chicken.mjs) the placeable is the game's chicken barn and its husbandry is written as the hen house writes it,
// the mod's buildings cut out of the walking area. Not in KINDS: no one makes a new frame, only the mod export does.
// Not tried in the game: that the game takes a chicken barn whose buildings are several, and a fence round them all.
import shed from "./shed.mjs";
import { henScene, HEN_PLACEABLE, MAX_HENS } from "./chicken.mjs";
import { palletLines, cornerStripes, teleportFor, ccwFence, navContourNodes, buildingOutline } from "./pasture.mjs";
import { insideNav } from "./modinside.mjs";
import { KEEP } from "../walkarea.mjs";
import { objectOf, objectsOf, boxOf, iconOf, pastureOf } from "../objects.mjs";
import { troughFrom } from "./cow.mjs";
import { sharedDefaults, turnNodes } from "./gameobjects.mjs";

/** The nodes (by name) of each object of the hen yard that turn with it: what belongs to its box (the fence does not turn; the troughs are turned in their own way, chicken.mjs drawTrough). */
const HEN_PARTS = {food: ["exactFillRootNodeFood", "markerFood"], loading: ["loadingTrigger", "markerAnimals", "teleportNode"], info: ["infoTrigger"],
  pallets: ["palletTrigger", "palletAreaStart01", "palletAreaStart02", "warningStripes01"]};
/** The object types of a hen yard (objects.mjs OBJECT_TYPES): the feed pad, trailer spot, egg pallets, info area and the fence. */
export const HEN_TYPES = ["food", "loading", "pallets", "info", "pasture", "feedTrough", "waterTrough"];
/** The smallest fence the game makes a walking area for (the hen house's own limit). */
const PASTURE = {minWidth: 12, depth: [6, 40]};
const hasYard = p => !!objectOf(p, "food") && !!objectOf(p, "pasture");
export const hensOf = p => Math.max(1, Math.min(MAX_HENS, Math.round(p.hens)));

/** How far outside the walls the grass is cleared round the building at the fence (the cow barn has 50 cm). */
export const CLEAR_MARGIN = 0.5;
/** The distance from a point to a rectangle {x0, x1, z0, z1} (0 inside it). */
const distTo = (r, x, z) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
/** The polygon [[x, z] ...] to clear the grass in: the outline of the real footprint of the building nearest the fence (host.postFeet: [{kind, rects}] in the frame's coordinates), grown CLEAR_MARGIN; [] when there is none. */
function clearOf(host, fence) {
  const along = [];   // (points along the fence, every 50 cm)
  for (let i = 0; i + 1 < fence.length; i++) {
    const [ax, , az] = fence[i], [bx, , bz] = fence[i + 1], k = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5));
    for (let s = 0; s <= k; s++) along.push([ax + (bx - ax) * s / k, az + (bz - az) * s / k]);
  }
  let best = null;
  for (const b of ((host && host.postFeet) || []).filter(q => q.kind === "building" && q.rects.length)) {
    const d = Math.min(...b.rects.flatMap(r => along.map(([x, z]) => distTo(r, x, z))));
    if (!best || d < best.d) best = {d, rects: b.rects};
  }
  return best ? buildingOutline(best.rects, CLEAR_MARGIN) : [];
}

// (the ground a box covers: a turned one, the box round it)
const rectOf = b => { const a = (b.turn || 0) * Math.PI / 180, hx = (Math.abs(Math.cos(a)) * b.size[0] + Math.abs(Math.sin(a)) * b.size[2]) / 2, hz = (Math.abs(Math.sin(a)) * b.size[0] + Math.abs(Math.cos(a)) * b.size[2]) / 2; return {x0: b.center[0] - hx, x1: b.center[0] + hx, z0: b.center[2] - hz, z1: b.center[2] + hz}; };

/** The yard (as henYard gives it) from the mod's objects: p.objects in the frame's coordinates, host.footprints (what the walking area goes round) the mod's buildings and props. */
function yardOf(p, geo, host) {
  const o = t => objectOf(p, t), pa = pastureOf(p);
  const food = boxOf(o("food")), loading = boxOf(o("loading")), pallets = boxOf(o("pallets")), info = boxOf(o("info"));
  const feet = (host && host.footprints) || [], fence = ccwFence(pa.fence);
  // the troughs (cow.mjs troughFrom: where the hens stand to eat, the food plane): drawn, and obstacles in the hens' area
  const asTrough = o => troughFrom({x: o.x, z: o.z, w: o.w, d: o.d, h: o.h, turn: o.turn}, fence, feet);
  const feedTroughs = objectsOf(p, "feedTrough").map(asTrough), waterTroughs = objectsOf(p, "waterTrough").map(asTrough), troughBoxes = [...feedTroughs, ...waterTroughs].map(t => t.box);
  // the hens walk inside the chosen building (host.inside: {settings, place}): its floor and the doorways that face the fence; the answer (or why not) is left in host.insideResult for the warnings
  let nav = null;
  if (host && host.inside) {
    const contour = [...fence, ...navContourNodes(fence, feet).map(([x, z]) => [x, 0, z])];
    const blockers = [...feet.map(r => ({center: [(r.x0 + r.x1) / 2, 1, (r.z0 + r.z1) / 2], size: [r.x1 - r.x0, 2, r.z1 - r.z0], keep: KEEP.wall})), ...troughBoxes.map(b => ({...b, keep: KEEP.trough}))];
    host.insideResult = insideNav({settings: host.inside.settings, place: host.inside.place, contour, blockers});
    nav = host.insideResult.nav;
  }
  return {
    nav,
    clear: clearOf(host, fence),
    fence,
    food: {...food, marker: iconOf(o("food"))},
    pallet: {lines: palletLines(pallets), trigger: pallets, stripes: cornerStripes(rectOf(pallets))},
    loading: {...loading, marker: iconOf(o("loading")), teleport: teleportFor({box: loading}, geo.dims)},
    info,
    feedTroughs, waterTroughs,
    blockers: [...feet.map(r => ({center: [(r.x0 + r.x1) / 2, 1, (r.z0 + r.z1) / 2], size: [r.x1 - r.x0, 2, r.z1 - r.z0]})), ...troughBoxes],
    areas: [{...food, turn: o("food").turn}, {...pallets, turn: o("pallets").turn}, ...troughBoxes].map(rectOf),
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
    const out = henScene(c, yardOf(c.p, c.geo, c.host), hensOf(c.p), c.host.footprints || []);
    // (an object that is turned: its nodes turn about its middle)
    let nodes = out.nodes;
    for (const [type, names] of Object.entries(HEN_PARTS)) { const o = objectOf(c.p, type); if (o && o.turn) nodes = turnNodes(nodes, names, [o.x, o.z], o.turn); }
    return {...out, nodes};
  },
};
