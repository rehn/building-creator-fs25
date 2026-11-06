// Sheep barn: an FS25 sheepHusbandry (like the base game's sheep barns, data/placeables/brandless/animalHusbandries/
// sheepBarnSmall and rudolfHormann/sheepBarnBig) you can walk into. Sheep graze in the pasture and eat hay at a trough
// along the barn's pasture wall; wool (and goat milk) comes out on pallets. It is built on the cow barn's module
// (cow.mjs): the same yard, outside troughs, game objects and export, with its own animal, pieces and presets.
import { roomOf, furnisher } from "../layout.mjs";
import { withPasture } from "./pasture.mjs";
import { COW, COLORS, CATALOG as COW_CATALOG, openings, cowYard, outsideOf, sceneOf, defaultsOf } from "./cow.mjs";
import { tone } from "./props.mjs";
import { INNER_WALL } from "./innerwall.mjs";

/** About one sheep per 1.5 m² of floor; at most 70 (the base game's biggest sheep barn takes 68). */
export const M2_PER_SHEEP = 1.5;
export const MAX_SHEEP = 70;
export const sheepCap = p => Math.max(1, Math.min(MAX_SHEEP, Math.floor(p.width * p.depth / M2_PER_SHEEP + 1e-9)));
const sheepOf = p => Math.min(Math.round(p.sheep), sheepCap(p));
/** Hay storage per sheep, in litres (the base game's sheep barns hold about 160). */
const FOOD_PER_SHEEP = 160;
const MIN_PASTURE_WIDTH = 12;
export const SHEEP = {...COW, count: sheepOf, minWidth: MIN_PASTURE_WIDTH, foodPer: FOOD_PER_SHEEP, animal: "SHEEP", fill: "DRYGRASS_WINDROW",
  fence: "sheepNetFence/sheepNetFence", pallets: {fills: "WOOL GOATMILK", max: 8}};
export const sheepYard = (geo, p) => cowYard(geo, p, SHEEP);

const LITTER = "#C9AE6B";
/** The floor: deep straw litter over the whole room. */
function furnish(c) { c.floor(LITTER, "litter"); }

/**
 * The pieces a sheep barn can have: the cow barn's hay rack, water bowl and bale, a lambing pen, and a long
 * feed trough for hay along a wall.
 */
const CATALOG = {
  innerwall: INNER_WALL,
  feedtrough: {name: "Hay trough (foderrenna)", mount: "wall", collision: true,
    params: [{k: "length", label: "Length", min: 1, max: 12, step: 0.1, unit: " m"}], defaults: {length: 4},
    size: it => [it.length, 0.55], height: () => 0.9,
    build(c, it) {
      const L = it.length, xA = -L / 2, xB = L / 2, zw = -0.26;
      // a plank trough on legs with hay in it and a slatted rack leaning over it
      c.paint(tone(COLORS.plank, 0), "wood"); c.box(xA, xB, zw, 0.26, 0.4, 0.44);
      c.paint(tone(COLORS.plank, 1), "wood"); c.box(xA, xB, 0.22, 0.26, 0.44, 0.62); c.box(xA, xB, zw, zw + 0.04, 0.44, 0.7);
      const legs = Math.max(1, Math.ceil(L / 1.5));
      for (let k = 0; k <= legs; k++) { const x = xA + 0.05 + k * (L - 0.1) / legs; c.paint(tone(COLORS.plank, k), "wood"); c.box(x - 0.05, x + 0.05, zw, 0.26, 0, 0.4); }
      c.paint(COLORS.hay, "straw"); c.box(xA + 0.05, xB - 0.05, zw + 0.05, 0.2, 0.44, 0.62);
      for (let x = xA + 0.15, k = 0; x < xB - 0.15; x += 0.3, k++) c.board([x, 0.6, -0.15 + (k % 2) * 0.1], [x + 0.1, 0.66, 0.15], 0.012, 0.006);
      c.paint(tone(COLORS.plank, 2), "wood");
      for (let x = xA + 0.1; x < xB - 0.05; x += 0.1) c.board([x, 0.62, -0.2], [x, 0.9, 0.12], 0.02, 0.02);
    }},
  hayrack: COW_CATALOG.hayrack,
  waterbowl: COW_CATALOG.waterbowl,
  lambpen: {...COW_CATALOG.calfpen, name: "Lambing pen (lammbox)"},
  bale: COW_CATALOG.bale,
};

for (const [k, g] of Object.entries({"innerwall":"Walls and doors","feedtrough":"Feeding and water","lambpen":"Housing"})) if (CATALOG[k]) CATALOG[k].group = g;   // (the palette's groups)

/** Fills the inside: hay troughs and racks along the longest free walls, water bowls, a lambing pen per 20 sheep, bales. */
function autoFurnish(p) {
  const room = roomOf(p, openings(p)), n = sheepOf(p), f = furnisher(room, CATALOG), {items} = f;
  for (let k = 0; k < Math.min(3, Math.max(1, Math.ceil(n / 12))); k++) {
    const s = f.longest(room.walls, 0.6);
    if (!s || s.len < 1.3) break;
    f.onWall(s, "feedtrough", {length: Math.max(1, Math.min(12, Math.floor((s.len - 0.1) * 10) / 10, Math.round(n * 4) / 10))});
  }
  for (let k = 0; k < Math.max(1, Math.ceil(n / 15)); k++) { const s = f.longest(room.walls, 0.6); if (s && s.len >= 1.7) f.onWall(s, "hayrack", {}); }
  for (let k = 0; k < Math.min(4, Math.max(1, Math.ceil(n / 15))); k++) { const s = f.longest(room.walls, 0.35); if (s && s.len >= 0.5) f.onWall(s, "waterbowl", {}); }
  for (let k = 0; k < Math.max(1, Math.floor(n / 20)); k++) f.onFloor("lambpen");
  f.onFloor("bale"); f.onFloor("bale");
  return {style: n <= 15 ? "fahus" : "farstall", items};
}

const swedishRed = {wallCladding: "lockpanel", wallColor: "#8E2A1E", trimColor: "#F2EFE8"};
export default {
  id: "sheep",
  name: "Sheep barn",
  plural: "Sheep barns",
  category: "animals",
  walkIn: true,
  glyph: "sheep",
  defaults: {sheep: 20, pastureWall: "back", fenceDepth: 14, winStyle: "stall", doorStyle: "xbrace"},
  sections: [
    {title: "Sheep", tab: "game", hint: "Sheep graze in the pasture and come in through a doorway in the pasture side; they eat hay and drink at troughs along that wall. Fill feed (or drop bales) at the feed place outside the fence; water is automatic. Wool comes out on pallets beside the barn. The pasture, the feed pad, the wool pallets and the rest are under Game objects.", fields: [
      {k: "sheep", label: "Sheep", min: 1, max: MAX_SHEEP, step: 1}]},
  ],
  hides: ["Interior", "Kupor (dormers)"],
  /** Settings as this kind uses them: no sleep point, rooms or dormers; at least 6 x 6 m; no more sheep than fit. */
  normalize: p => {
    const q = {...p, interior: false, dormers: [], width: Math.max(6, p.width), depth: Math.max(6, p.depth)};
    return withPasture({...q, sheep: Math.min(q.sheep, sheepCap(q))});
  },
  openings,
  placeable: () => ({type: "sheepHusbandry",
    fn: ["$l10n_function_animalPenSheep", "$l10n_function_adjustableMeadow"],
    shop: {category: "animalpens", type: "husbandry", brush: "animals", tab: "sheeps"},
    note: `Sheep barn: use <placeable type="sheepHusbandry" ...>, as in the base game's sheep barns.`}),
  description: p => `A ${(+p.width).toFixed(1)} x ${(+p.depth).toFixed(1)} m sheep barn for ${sheepOf(p)} sheep, made with House to i3d.`,
  furnish,
  outside: outsideOf(SHEEP),
  yard: sheepYard,
  catalog: CATALOG,
  autoFurnish,
  scene: sceneOf(SHEEP),
  // the game objects: the bale drop is optional; wool comes out on pallets
  objects: {types: ["food", "bales", "loading", "pallets", "info", "pasture"], required: ["food", "loading", "pallets", "info", "pasture"],
    pasture: {minWidth: MIN_PASTURE_WIDTH, depth: [8, 60]}, defaults: defaultsOf(SHEEP),
    labels: {pallets: {name: "Wool pallets", hint: "Where wool (and goat milk) pallets appear (two rows inside it), with warning stripes in its corners."}}},
  presets: [
    {id: "farhus", name: "Fårhus", blurb: "8 × 6 m small red sheep shed for 12 sheep, a red tile roof and a plain door.", settings: {
      sheep: 12, pastureWall: "back", fenceDepth: 12, ...swedishRed, wallColor: "#7A2418",
      width: 8, depth: 6, floors: 1, floorHeight: 2.5, foundation: 0.4, foundationColor: "#8C8A84", roofType: "gable", ridge: "width", roofPitch: 32, overhang: 0.4,
      roofMaterial: "tiles", roofColor: "#7A2E1F", chimney: false, gutters: false, downpipes: 0, ventilators: 0,
      winFront: 2, winBack: 0, winLeft: 1, winRight: 1, winW: 0.7, winH: 0.5, sill: 1.4,
      doorWall: "front", doorPos: -0.5, doorW: 1.2, doorH: 2.1, doorColor: "#F2EFE8", entrance: "none", doorStyle: "zbrace",
      modPrice: 9000, modUpkeep: 25}},
    {id: "farstall", name: "Fårstall", blurb: "14 × 8 m red sheep barn for 40 sheep with a falu red front, white trim and a stone base.", settings: {
      sheep: 40, pastureWall: "back", fenceDepth: 16, ...swedishRed,
      width: 14, depth: 8, floors: 1, floorHeight: 3, foundation: 0.5, foundationColor: "#8C8A84", roofType: "gable", ridge: "width", roofPitch: 35, overhang: 0.5,
      roofMaterial: "tiles", roofColor: "#2F2F2F", chimney: false, gutters: true, downpipes: 2, ventilators: 1,
      winFront: 4, winBack: 4, winLeft: 1, winRight: 0, winW: 0.8, winH: 0.6, sill: 1.5,
      doorWall: "left", doorPos: 0, doorW: 2.2, doorH: 2.4, doorColor: "#5B1E16", entrance: "none",
      modPrice: 24000, modUpkeep: 60}},
    {id: "storfarstall", name: "Stor fårstall", blurb: "24 × 12 m big sheep barn for 68 sheep with a low metal roof and ventilators along the ridge.", settings: {
      sheep: 68, pastureWall: "front", fenceDepth: 24,
      wallCladding: "lockpanel", wallColor: "#A8A398", trimColor: "#3B3F42",
      width: 24, depth: 12, floors: 1, floorHeight: 3.4, foundation: 0.3, foundationColor: "#8C8A84", roofType: "gable", ridge: "width", roofPitch: 15, overhang: 0.5,
      roofMaterial: "metal", roofColor: "#4A4F52", chimney: false, gutters: true, downpipes: 2, ventilators: 3,
      winFront: 6, winBack: 6, winLeft: 0, winRight: 0, winW: 1.4, winH: 0.6, sill: 1.5,
      doorWall: "right", doorPos: 0, doorW: 2.5, doorH: 2.6, doorColor: "#3B3F42", entrance: "none", doorStyle: "sliding", winStyle: "single",
      modPrice: 70000, modUpkeep: 150}},
  ],
};
