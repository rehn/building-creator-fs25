// The frame of a mod (docs/PLAN_MOD.md, editor/modExport.mjs): the building the mod's one placeable is exported from. It draws nothing itself (the mod's buildings and props are in its i3d),
// it carries the mod's game objects. It is a shed (the objects every kind can have: a sleep point, a workshop ...) that can also be a chicken barn: when the mod has a hen yard (the feed pad,
// the animal trailer spot, the egg pallets, the info area and the fence of kinds/chicken.mjs) the placeable is the game's chicken barn and its husbandry is written as the hen house writes it,
// the mod's buildings cut out of the walking area. A mod has ONE kind of animals (p.animal: hens, cows or sheep, Lars 2026-11-25): with a cow yard or a sheep yard the placeable is the game's cow barn or sheep
// barn and the husbandry is written as those barns write it (kinds/cow.mjs cowScene), the troughs drawn as nodes. Not in KINDS: no one makes a new frame, only the mod export does.
// Not tried in the game: that the game takes a chicken, cow or sheep barn whose buildings are several, and a fence round them all.
import shed from "./shed.mjs";
import { henScene, HEN_PLACEABLE, MAX_HENS, cowScene, COW, MAX_COWS, SHEEP, MAX_SHEEP, PASTURE_GROUNDS, troughFrom, COW_PLACEABLE, SHEEP_PLACEABLE } from "../mod/yard.mjs";
import { palletLines, cornerStripes, teleportFor, ccwFence, navContourNodes, buildingOutline } from "./pasture.mjs";
import { insideNav } from "./modinside.mjs";
import { KEEP } from "../walkarea.mjs";
import { objectOf, objectsOf, boxOf, iconOf, pastureOf } from "../objects.mjs";
import { sharedDefaults, turnNodes } from "./gameobjects.mjs";

/** The nodes (by name) of each object of the hen yard that turn with it: what belongs to its box (the fence does not turn; the troughs are turned in their own way, chicken.mjs drawTrough). */
const HEN_PARTS = {food: ["exactFillRootNodeFood", "markerFood"], bales: ["baleTrigger", "markerBales"], loading: ["loadingTrigger", "markerAnimals", "teleportNode"], info: ["infoTrigger"],
  pallets: ["palletTrigger", "palletAreaStart01", "palletAreaStart02", "warningStripes01"]};
/** The object types of a hen yard (objects.mjs OBJECT_TYPES): the feed pad, trailer spot, egg pallets, info area and the fence. */
export const HEN_TYPES = ["food", "loading", "pallets", "info", "pasture", "feedTrough", "waterTrough"];
/** The object types of a cow yard: the hens' without the egg pallets, and the bale drop. */
export const COW_TYPES = ["food", "bales", "loading", "info", "pasture", "feedTrough", "waterTrough"];
/** The object types of a sheep yard: the cows', and the wool pallets. */
export const SHEEP_TYPES = [...COW_TYPES, "pallets"];
/** The animals a mod can have, one kind to a mod: the husbandry of each (the cow barn's and the sheep barn's, kinds/cow.mjs) and the most of them. */
const YARDS = {cows: {cfg: COW, placeable: COW_PLACEABLE, max: MAX_COWS}, sheep: {cfg: SHEEP, placeable: SHEEP_PLACEABLE, max: MAX_SHEEP}};
/** The kind of animals of a mod's settings: "hens" (the first mods had only those), "cows" or "sheep". */
export const animalOf = p => (p && YARDS[p.animal] ? p.animal : "hens");
/** How many animals the mod is made for (hens, cows or sheep, each to the most the game's biggest barn holds). */
export const countOf = p => {
  const a = animalOf(p);
  return a === "hens" ? hensOf(p) : Math.max(1, Math.min(YARDS[a].max, Math.round(+p[a]) || 1));
};
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
  const food = boxOf(o("food")), loading = boxOf(o("loading")), pallets = o("pallets") ? boxOf(o("pallets")) : null, info = boxOf(o("info")), bales = o("bales") ? boxOf(o("bales")) : null;
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
  const teleport = teleportFor({box: loading}, geo.dims);
  return {
    nav,
    clear: clearOf(host, fence),
    fence,
    food: {...food, marker: iconOf(o("food"))},
    pallet: pallets && {lines: palletLines(pallets), trigger: pallets, stripes: cornerStripes(rectOf(pallets))},
    loading: {...loading, marker: iconOf(o("loading")), teleport},
    info,
    feedTroughs, waterTroughs,
    // (what the cow barn's scene reads, cowScene: the bale drop, the icons, the first trough's food and water planes and the places the animals stand)
    bales: bales && {...bales, marker: iconOf(o("bales"))},
    markers: {food: iconOf(o("food")), bales: bales && iconOf(o("bales")), animals: iconOf(o("loading")), teleport},
    feedTrough: feedTroughs[0] || null, waterTrough: waterTroughs[0] || null,
    foodPlaces: feedTroughs.flatMap(t => t.places), waterPlaces: waterTroughs.flatMap(t => t.places),
    blockers: [...feet.map(r => ({center: [(r.x0 + r.x1) / 2, 1, (r.z0 + r.z1) / 2], size: [r.x1 - r.x0, 2, r.z1 - r.z0]})), ...troughBoxes],
    areas: [{...food, turn: o("food").turn}, ...(bales ? [{...bales, turn: o("bales").turn}] : []), ...(pallets ? [{...pallets, turn: o("pallets").turn}] : []), ...troughBoxes].map(rectOf),
  };
}

export default {
  ...shed,
  id: "modframe",
  gameObjects: true,
  name: "Mod",
  plural: "Mods",
  presets: [],
  hosted: true,
  defaults: {...shed.defaults, hens: 30, cows: 12, sheep: 20, animal: "hens", pastureGround: "grass"},
  sections: [...shed.sections, {title: "Chickens", tab: "game", fields: [{k: "hens", label: "Hens", min: 1, max: MAX_HENS, step: 1}, {k: "cows", label: "Cows", min: 1, max: MAX_COWS, step: 1}, {k: "sheep", label: "Sheep", min: 1, max: MAX_SHEEP, step: 1},
    {k: "animal", label: "Animals", type: "select", options: [["hens", "Hens"], ["cows", "Cows"], ["sheep", "Sheep"]]}, {k: "pastureGround", label: "Ground in the pasture", type: "select", options: PASTURE_GROUNDS}]}],
  // the shed's workshop, the shared objects and the yard of the animals
  objects: {types: ["workshop", ...new Set([...HEN_TYPES, ...SHEEP_TYPES])], required: [], pasture: PASTURE, defaults: p => sharedDefaults(p, "workshop")},
  placeable: p => (!hasYard(p) ? shed.placeable(p) : animalOf(p) === "hens" ? HEN_PLACEABLE : YARDS[animalOf(p)].placeable),
  description: p => (hasYard(p) ? `A farm of buildings with a ${{hens: "hen", cows: "cow", sheep: "sheep"}[animalOf(p)]} yard for ${countOf(p)} ${animalOf(p)}, made with House to i3d.` : "A mod made with House to i3d."),
  /** The hen yard's nodes and XML, when the mod has one (c: the export context, with the host). */
  scene(c) {
    if (!hasYard(c.p) || !c.host) return {nodes: [], xml: "", areas: []};
    const y = yardOf(c.p, c.geo, c.host), a = animalOf(c.p);
    const out = a === "hens" ? henScene(c, y, hensOf(c.p), c.host.footprints || [])
      : cowScene(c, y, YARDS[a].cfg, countOf(c.p), {rects: c.host.footprints || [], clear: y.clear, ground: c.p.pastureGround, under: "dirt", troughs: true});
    // (an object that is turned: its nodes turn about its middle)
    let nodes = out.nodes;
    for (const [type, names] of Object.entries(HEN_PARTS)) { const o = objectOf(c.p, type); if (o && o.turn) nodes = turnNodes(nodes, names, [o.x, o.z], o.turn); }
    return {...out, nodes};
  },
};
