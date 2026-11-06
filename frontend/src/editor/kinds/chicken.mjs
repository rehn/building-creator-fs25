// Chicken barn: an FS25 chickenHusbandryPasture you can walk into, modelled on the base game's
// chicken barns (data/placeables/rudolfHormann/chickenBarnBig is the 360-hen one).
// Imports only the i3d writer; the core hands in what it needs (see kinds/index.mjs).
import { tg, shape } from "../i3d.mjs";
import { roomOf, furnisher } from "../layout.mjs";
import { OPPOSITE, wallLength, yardFrame, shellOf, teleportFor, withPasture, pastureWallFor, cornerStripes, palletLines } from "./pasture.mjs";
import { objectOf, boxOf, iconOf, boxFrom, pastureOf } from "../objects.mjs";
import { tone, shade, strawBale } from "./props.mjs";
import { INNER_WALL } from "./innerwall.mjs";
import { placeOnWall, placeOnBuilding } from "../places.mjs";

/** Floor space per hen, as in the base game's 360-hen barn (about 2.2 per m², rounded up). */
export const HENS_PER_M2 = 2.5;
export const MAX_HENS = 360;
/** Feed storage per hen, in litres (the base game's chicken barns hold about 25 l per hen). */
const FEED_PER_HEN = 25;
export const henCap = p => Math.max(1, Math.min(MAX_HENS, Math.floor(HENS_PER_M2 * p.width * p.depth + 1e-9)));
const hensOf = p => Math.min(Math.round(p.hens), henCap(p));

/** Smallest starting pasture, like the base game's smallest (about 12 m along the barn, 6 m deep). */
const MIN_PASTURE_WIDTH = 12;

/**
 * Where a chicken barn's gameplay places are, from built geometry. All points in world space.
 *   fence:   posts on the ground from one corner of the pasture wall, out fenceDepth, across and back
 *            to the other corner (the base game's winding); 6 posts when the pasture is wider than
 *            the wall, so the fence runs back along the wall line. The player can reshape it.
 *   food:    feed pad {center, size}, low on the ground beside one of the other walls; marker on it
 *   pallet:  egg pallet spawn lines (2, [start, end]) and their trigger box, beside another one
 *   loading: animal trailer trigger box further out on the feed side; marker; teleport spot beyond
 *   info:    box around the barn; blocker: the barn's footprint, kept out of the walking area
 *   areas:   ground rectangles of the food and pallet places, for clearing and leveling
 * The feed and pallet sides are two of the three walls that aren't the pasture's, walls without a
 * door: the wall opposite the pasture for feed if it has no door, else a side wall without one.
 * The player moves and sizes them as game objects (objects.mjs, p.objects).
 */
export function henYard(geo, p) {
  // The game can't make a walking area for a tiny pasture (a 6 x 4.4 m one failed): at least 12 m wide.
  const yf = yardFrame(geo, p, MIN_PASTURE_WIDTH), {rectOf} = yf, pa = pastureOf(p);
  const {food, loading, pallets, info} = henObjects(geo, p, yf);
  // two spawn lines inside the pallet trigger, along its longer side: 50 cm in from its ends and 80 cm
  // either side of its middle
  const lines = palletLines(pallets.box);
  return {
    fence: pa ? pa.fence : yf.fence,
    food: {...food.box, marker: food.icon},
    pallet: {lines, trigger: pallets.box, stripes: cornerStripes(rectOf(pallets.box))},
    loading: {...loading.box, marker: loading.icon, teleport: teleportFor(loading, geo.dims)},
    info: info.box,
    blocker: {center: [0, 1, 0], size: [geo.dims.W, 2, geo.dims.D]},
    areas: [food.box, pallets.box].map(rectOf),
  };
}
/**
 * The hen house's game objects as {box, icon}: the building's (p.objects), or where they go to start
 * with: the feed pad and trailer spot on the feed side, the egg pallets on another wall, the info area
 * round the barn (the feed and pallet sides: walls that aren't the pasture's, walls without a door first).
 */
function henObjects(geo, p, yf = yardFrame(geo, p, MIN_PASTURE_WIDTH)) {
  const {feedKey, otherKey, frames, mid} = yf, {W, D} = geo.dims;
  const start = {
    // Feed pad: low on the ground, so a tipping trailer's or auger's raycast starts above it.
    food: placeOnWall(frames, feedKey, w => { const [c, len] = mid(w); return {s: c, d: 1.75, along: Math.max(2.5, Math.min(4, len)), out: 3, h: 0.3, icon: [c, 1.75]}; }),
    loading: placeOnWall(frames, feedKey, w => { const [c, len] = mid(w); return {s: c, d: 5.5, along: Math.min(4, len), out: 4, h: 3, icon: [c, 5.5]}; }),
    pallets: placeOnWall(frames, otherKey, w => {
      const [c, len] = mid(w), lines = Math.min(4.8, Math.max(1.2, len - 1));
      return {s: c, d: 2.8, along: Math.min(lines + 1, len), out: 3.2, h: 2.5, icon: null};
    }),
    info: {box: placeOnBuilding({center: [0, 1.5, 0], size: [W + 2, 3, D + 2]}), icon: null},
  };
  const out = {};
  for (const t of ["food", "loading", "pallets", "info"]) {
    const o = objectOf(p, t);
    out[t] = o ? {box: boxOf(o), icon: iconOf(o)} : start[t];
  }
  return out;
}
/** Where the hen house's objects go to start with (kind.objects.defaults): from its pasture wall and depth. */
function defaultObjects(p) {
  const q = {...p, pastureWall: pastureWallFor(p), objects: undefined}, y = henObjects(shellOf(q), q);
  return [
    ...["food", "loading", "pallets", "info"].map(t => boxFrom(t, y[t].box, t === "food" || t === "loading" ? y[t].icon : null)),
    // (a new barn's pasture goes on a wall without a door, if it can)
    {type: "pasture", wall: q.pastureWall, a: 0, b: 0, depth: p.fenceDepth},
  ];
}

/** The hen hatch: 40 x 50 cm at floor level in the middle of the pasture wall, kept clear 80 cm inside. */
function openings(p) {
  const L = (p.pastureWall === "front" || p.pastureWall === "back") ? p.width : p.depth, m = p.pastureMid ?? L / 2;
  return [{wall: p.pastureWall, s0: m - 0.2, s1: m + 0.2, t1: 0.5, clear: 0.8, what: "the hen hatch"}];
}

/* ---------- Interior ---------- */
const COOP = {litter: "#B8935A", straw: "#DDBF73", bale: "#D9BC6A", wood: "#A47A4E", ply: "#C29C68", dark: "#4A3422", metal: "#A3A9AD",
  galv: "#BCC2C5", pipe: "#D4D8DB", red: "#B8382C", feed: "#C49A4C", water: "#8FA9B5", egg: "#F1E8D6", eggBrown: "#C79166",
  hose: "#2E2F30", wire: "#7D8388", dung: "#6A5B44", chalk: "#DCD6C8"};

/** The floor: litter over the whole room. c: {floor(color)} from the core. */
function furnish(c) { c.floor(COOP.litter, "litter"); }

/** A wire or chain from y up to the ceiling (c.H), at (x, z) of the piece. */
const hanger = (c, x, z, y) => { c.paint(COOP.wire, "steel"); c.rod([x, y, z], [x, c.H, z], 0.004, 4); };

/**
 * The pieces a hen house can have (see layout.mjs for what a catalog entry is). build(c, it) draws
 * in the piece's own frame with the kit in props.mjs; y is up from the floor, -z is the wall side
 * of a wall piece, c.H the wall height (hanging things go up to it).
 */
const nestDepth = 0.6, perchReach = tiers => 0.25 + 0.3 * (tiers - 1) + 0.05;
const CATALOG = {
  innerwall: INNER_WALL,
  nests: {name: "Nest boxes", mount: "wall", collision: true,
    params: [{k: "count", label: "Boxes per row", min: 1, max: 60, step: 1}, {k: "tiers", label: "Rows", min: 1, max: 3, step: 1}],
    defaults: {count: 6, tiers: 1},
    size: it => [it.count * 0.35, nestDepth], height: it => 0.5 + it.tiers * 0.42,
    build(c, it) {
      const w = it.count * 0.35, xA = -w / 2, xB = w / 2, zb = -nestDepth / 2, zf = zb + 0.42;
      for (let k = 0; k < it.tiers; k++) {
        const yb = 0.5 + k * 0.42, top = k === it.tiers - 1;
        c.paint(COOP.dark, "wood"); c.box(xA, xB, zb, zb + 0.012, yb, yb + 0.37);                     // back, dark in the boxes
        c.paint(COOP.ply, "wood"); c.box(xA, xB, zb, zf, yb, yb + 0.02);                               // floor
        for (let i = 0; i < it.count; i++) {
          const x0 = xA + i * 0.35;
          c.paint(tone(COOP.wood, i + k), "wood"); c.box(x0 + 0.01, x0 + 0.34, zf - 0.02, zf, yb, yb + 0.11);   // front lip, board by board
          c.paint(tone(COOP.straw, i * 2 + k), "straw"); c.box(x0 + 0.02, x0 + 0.33, zb + 0.015, zf - 0.02, yb + 0.02, yb + 0.06);
          c.paint(shade(COOP.straw, 0.3), "straw");
          c.board([x0 + 0.08, yb + 0.06, zb + 0.08], [x0 + 0.2, yb + 0.075, zb + 0.2], 0.03, 0.01);
          c.board([x0 + 0.27, yb + 0.06, zb + 0.1], [x0 + 0.17, yb + 0.07, zb + 0.28], 0.03, 0.01);
          // an egg or two
          if ((i + k) % 2 === 0) { c.paint((i + k) % 4 ? COOP.eggBrown : COOP.egg); c.cyl(x0 + 0.15 + (i % 3) * 0.03, zb + 0.2, yb + 0.06, 0.022, 0.045, 8); }
          // the nest curtain: red strips over the top of the opening, so it's dark inside
          c.paint(COOP.red, "plastic");
          for (let s = 0; s < 4; s++) c.box(x0 + 0.03 + s * 0.075, x0 + 0.1 + s * 0.075, zf - 0.006, zf - 0.002, yb + 0.21, yb + 0.35);
        }
        c.paint(COOP.wood, "wood");
        for (let i = 0; i <= it.count; i++) {                                                    // dividers and end walls
          const x = xA + i * 0.35, t = i === 0 || i === it.count ? 0.018 : 0.01;
          c.box(Math.max(xA, x - t), Math.min(xB, x + t), zb, zf, yb, yb + 0.37);
        }
        c.paint(COOP.ply, "wood"); c.box(xA, xB, zb, zf, yb + 0.35, yb + 0.37);                         // ceiling of the row
        c.paint(tone(COOP.wood, 1), "wood"); c.box(xA, xB, zf - 0.02, zf, yb + 0.33, yb + 0.37);        // header board
        if (top) {
          // a sloping lid, so hens can't roost on top
          c.paint(tone(COOP.wood, 2), "wood");
          c.board([0, yb + 0.415, zb + 0.015], [0, yb + 0.375, zf], w - 0.004, 0.015);
        }
        // landing bar on brackets, in front of the row
        c.paint(COOP.wood, "wood");
        c.rod([xA + 0.02, yb - 0.09, zb + 0.56], [xB - 0.02, yb - 0.09, zb + 0.56], 0.02, 6);
        for (const x of [xA + 0.04, xB - 0.05, ...(it.count > 5 ? [0] : [])])
          c.board([x, yb - 0.02, zf - 0.01], [x, yb - 0.09, zb + 0.56], 0.02, 0.03);
      }
      // legs and a brace under the bottom row
      c.paint(tone(COOP.wood, 1), "wood");
      for (const x of [xA + 0.005, xB - 0.045]) {
        c.box(x, x + 0.04, zf - 0.05, zf - 0.01, 0, 0.5);
        c.board([x + 0.02, 0.04, zf - 0.03], [x + 0.02, 0.46, zb + 0.03], 0.03, 0.03);
      }
    }},
  perch: {name: "Perch ladder", mount: "wall", collision: true,
    params: [{k: "length", label: "Length", min: 0.6, max: 12, step: 0.1, unit: " m"}, {k: "tiers", label: "Bars", min: 2, max: 4, step: 1}],
    defaults: {length: 2, tiers: 3},
    size: it => [it.length, perchReach(it.tiers)], height: it => 0.45 + 0.3 * (it.tiers - 1),
    build(c, it) {
      const L = it.length, d = perchReach(it.tiers), n = Math.floor(L / 1.5), top = 0.45 + 0.3 * (it.tiers - 1);
      const xs = [-L / 2 + 0.03, ...Array.from({length: n}, (_, i) => -L / 2 + (i + 1) * L / (n + 1)), L / 2 - 0.03];
      // droppings under the ladder: a dark, trodden patch with white flecks
      c.paint(COOP.dung, "litter"); c.box(-L / 2 + 0.02, L / 2 - 0.02, -d / 2 + 0.03, d / 2 - 0.02, 0, 0.008);
      c.paint(COOP.chalk);
      for (let x = -L / 2 + 0.15, k = 0; x < L / 2 - 0.1; x += 0.23, k++) {
        const z = -d / 2 + 0.1 + ((k * 7) % 5) / 5 * (d - 0.2);
        c.box(x - 0.015, x + 0.015, z - 0.012, z + 0.012, 0.008, 0.012);
      }
      // stringers from the floor in front up to the wall, a cleat on the wall
      c.paint(tone(COOP.wood, 1), "wood");
      for (const x of xs) c.board([x, 0.05, d / 2 - 0.045], [x, top - 0.02, -d / 2 + 0.05], 0.035, 0.07);
      c.box(-L / 2, L / 2, -d / 2, -d / 2 + 0.025, top - 0.08, top + 0.0);
      // round perches, worn lighter on top
      for (let k = 0; k < it.tiers; k++) {
        const y = 0.45 + 0.3 * k - 0.025, z = -d / 2 + 0.25 + 0.3 * (it.tiers - 1 - k);
        c.paint(tone(COOP.ply, k), "wood");
        c.rod([-L / 2, y, z], [L / 2, y, z], 0.022, 8);
      }
    }},
  feeder: {name: "Tube feeder", mount: "floor", params: [], defaults: {},
    size: () => [0.4, 0.4], height: () => 0.7,
    build(c) {
      c.paint(COOP.galv, "galv");
      c.cone(0, 0, 0.1, 0.12, 0.19, 0.06, 20);                 // the flared pan
      c.cyl(0, 0, 0.16, 0.195, 0.012, 20);                    // its rolled rim
      c.paint(COOP.feed, "litter"); c.cone(0, 0, 0.172, 0.17, 0.09, 0.02, 16);
      c.paint(shade(COOP.galv, -0.4), "galv"); c.cone(0, 0, 0.17, 0.11, 0.07, 0.06, 16);   // spreader cone
      for (let k = 0; k < 8; k++) {                            // the grill over the pan
        const a = k / 8 * Math.PI * 2;
        c.rod([0.07 * Math.cos(a), 0.2, 0.07 * Math.sin(a)], [0.18 * Math.cos(a), 0.18, 0.18 * Math.sin(a)], 0.004, 4);
      }
      c.paint(COOP.red, "plastic"); c.cyl(0, 0, 0.22, 0.085, 0.38, 16);  // the tube
      c.paint(shade(COOP.red, -0.5), "plastic"); c.cyl(0, 0, 0.4, 0.088, 0.012, 16);
      c.paint(COOP.red, "plastic"); c.cone(0, 0, 0.6, 0.095, 0.03, 0.07, 16);   // lid
      c.paint(COOP.wire, "steel"); c.rod([-0.04, 0.6, 0], [0, 0.69, 0], 0.004, 4); c.rod([0.04, 0.6, 0], [0, 0.69, 0], 0.004, 4);
      hanger(c, 0, 0, 0.69);
    }},
  drinker: {name: "Bell drinker", mount: "floor", params: [], defaults: {},
    size: () => [0.36, 0.36], height: () => 0.5,
    build(c) {
      c.paint(COOP.red, "plastic");
      c.cone(0, 0, 0.13, 0.13, 0.175, 0.06, 20);               // the drinking ring
      c.paint(COOP.water); c.cyl(0, 0, 0.19, 0.16, 0.004, 20);
      c.paint(shade(COOP.red, 0.25), "plastic"); c.cone(0, 0, 0.19, 0.125, 0.04, 0.22, 20);   // the bell
      c.paint(shade(COOP.red, -0.35), "plastic");
      c.cyl(0, 0, 0.19, 0.13, 0.012, 20);                      // the lip between bell and water
      for (let k = 0; k < 6; k++) {                            // ribs down the bell
        const a = k / 6 * Math.PI * 2, [ca, sa] = [Math.cos(a), Math.sin(a)];
        c.board([0.045 * ca, 0.4, 0.045 * sa], [0.128 * ca, 0.2, 0.128 * sa], 0.012, 0.012);
      }
      c.paint(COOP.galv, "galv"); c.cyl(0, 0, 0.41, 0.035, 0.05, 12);  // valve and ballast cap
      c.paint(COOP.wire, "steel"); c.pipe([[0, 0.46, 0], [0, 0.49, 0.015], [0, 0.5, 0], [-0.01, 0.53, -0.01]], 0.004, 4);   // the hook
      c.paint(COOP.hose, "rubber");
      c.pipe([[0.02, 0.45, 0], [0.04, 0.6, 0.03], [0.08, 0.9, 0.08], [0.1, c.H, 0.1]], 0.008, 6);
      hanger(c, -0.01, 0, 0.46);
    }},
  trough: {name: "Feeder trough", mount: "floor",
    params: [{k: "length", label: "Length", min: 1, max: 60, step: 0.1, unit: " m"}], defaults: {length: 4},
    size: it => [it.length, 0.2], height: () => 0.4,
    build(c, it) {
      const L = it.length, xA = -L / 2 + 0.01, xB = L / 2 - 0.01;
      c.paint(COOP.galv, "galv");
      c.box(xA, xB, -0.035, 0.035, 0.25, 0.265);                                   // a V of galvanised steel, in steps
      for (const s of [-1, 1]) {
        c.box(xA, xB, s > 0 ? 0.035 : -0.055, s > 0 ? 0.055 : -0.035, 0.255, 0.31);
        c.box(xA, xB, s > 0 ? 0.055 : -0.075, s > 0 ? 0.075 : -0.055, 0.3, 0.36);
        c.rod([xA, 0.365, s * 0.08], [xB, 0.365, s * 0.08], 0.009, 6);             // rolled lip
      }
      c.paint(COOP.feed, "litter"); c.box(xA + 0.01, xB - 0.01, -0.06, 0.06, 0.3, 0.335);
      c.paint(shade(COOP.feed, -0.4), "litter");
      for (let x = xA + 0.2; x < xB - 0.1; x += 0.45) c.box(x - 0.05, x + 0.05, -0.03, 0.04, 0.335, 0.345);
      c.paint(shade(COOP.galv, -0.4), "galv");
      for (const x of [xA, xB - 0.012]) c.box(x, x + 0.012, -0.085, 0.085, 0.25, 0.37);   // end caps
      // the anti-roost spinner on its wire, so hens can't sit on the trough
      c.paint(COOP.red, "plastic"); c.rod([xA + 0.01, 0.385, 0], [xB - 0.01, 0.385, 0], 0.011, 6);
      c.paint(COOP.wire, "steel");
      for (const x of [xA + 0.006, xB - 0.006]) c.box(x - 0.004, x + 0.004, -0.004, 0.004, 0.37, 0.385);
      for (let x = xA + 0.25; x < xB; x += 1.5) { c.box(x - 0.01, x + 0.01, -0.085, 0.085, 0.36, 0.37); hanger(c, x, 0, 0.37); }
    }},
  nipples: {name: "Nipple drinker line", mount: "floor",
    params: [{k: "length", label: "Length", min: 1, max: 60, step: 0.1, unit: " m"}], defaults: {length: 4},
    size: it => [it.length, 0.1], height: () => 0.55,
    build(c, it) {
      const L = it.length, xA = -L / 2 + 0.01, xB = L / 2 - 0.01;
      c.paint(COOP.pipe, "plastic"); c.box(xA + 0.15, xB, -0.012, 0.012, 0.5, 0.524);          // the square water pipe
      c.paint(COOP.galv, "galv"); c.box(xA + 0.15, xB, -0.018, 0.018, 0.524, 0.536);        // the profile it hangs from
      c.paint(COOP.wire, "steel"); c.rod([xA + 0.17, 0.545, 0], [xB, 0.545, 0], 0.003, 4);   // anti-roost wire
      for (let x = xA + 0.28; x < xB - 0.05; x += 0.25) {
        c.paint(COOP.galv, "galv"); c.cyl(x, 0, 0.475, 0.006, 0.025, 6);                    // nipple
        c.paint(COOP.red, "plastic"); c.cone(x + 0.025, 0, 0.465, 0.008, 0.02, 0.018, 8);      // drip cup
        c.box(x + 0.006, x + 0.02, -0.003, 0.003, 0.48, 0.5);
      }
      // the pressure regulator at the start, fed by a hose from above
      c.paint(COOP.pipe, "plastic"); c.box(xA, xA + 0.14, -0.045, 0.045, 0.44, 0.54);
      c.paint(COOP.red, "plastic"); c.box(xA + 0.03, xA + 0.11, -0.047, 0.047, 0.5, 0.53);
      c.paint(COOP.water); c.cyl(xA + 0.07, 0, 0.54, 0.018, 0.01, 8);              // sight tube cap
      c.paint(COOP.hose, "rubber"); c.pipe([[xA + 0.04, 0.54, 0.02], [xA + 0.05, 0.8, 0.03], [xA + 0.06, c.H, 0.03]], 0.008, 6);
      for (let x = xA + 0.6; x < xB; x += 1.5) hanger(c, x, 0, 0.536);
    }},
  bale: {name: "Straw bale", mount: "floor", collision: true, params: [], defaults: {},
    size: () => [0.9, 0.5], height: () => 0.4,
    build(c) { strawBale(c, 0, 0, 0, COOP.bale); }},
};

/** What the pieces add up to: nest boxes, metres of perch, feeders and drinkers. */
function summary(items) {
  const sum = (type, f) => items.filter(it => it.type === type).reduce((s, it) => s + f(it), 0);
  return {nests: sum("nests", it => it.count * it.tiers), perch: sum("perch", it => it.length * it.tiers),
    feeders: sum("feeder", () => 1) + sum("trough", () => 1), drinkers: sum("drinker", () => 1) + sum("nipples", () => 1)};
}

for (const [k, g] of Object.entries({"innerwall":"Walls and doors","nests":"Roosting and nests","perch":"Roosting and nests","feeder":"Feeding and water","drinker":"Feeding and water","trough":"Feeding and water","nipples":"Feeding and water","bale":"Straw and bales"})) if (CATALOG[k]) CATALOG[k].group = g;   // (the palette's groups)
const step = (v, s) => +(Math.floor(v / s + 1e-9) * s).toFixed(3);
/**
 * Fills the inside to match the barn's size and hens, using the free wall space (clear of the door,
 * the hen hatch and what's already placed): nest boxes (about one per 5 hens) on the wall opposite
 * the pasture if it has room, perch ladders on the longest free stretches (20 cm per hen), then
 * feeders and drinkers nearest the middle, or troughs and nipple lines down a big barn.
 * Returns {style, items}.
 */
function autoFurnish(p) {
  const room = roomOf(p, openings(p)), n = hensOf(p);
  const style = n <= 40 ? "backyard" : n <= 150 ? "floor" : "commercial";
  const f = furnisher(room, CATALOG), {items} = f;
  // (a wall with a wing opening into it is in two pieces: the longer one)
  const len = wl => wl.x1 - wl.x0 + wl.z1 - wl.z0, byName = {};
  for (const wl of room.walls) if (!byName[wl.name] || len(wl) > len(byName[wl.name])) byName[wl.name] = wl;
  const opposite = byName[OPPOSITE[p.pastureWall]];

  // Nest boxes: about one per 5 hens, on the wall opposite the pasture if it has room, else the longest free stretch.
  const want = Math.ceil(n / 5);
  let ns = f.longest([opposite], nestDepth);
  if (!ns || ns.len < Math.min(want, 4) * 0.35 + 0.1) ns = f.longest(room.walls, nestDepth);
  if (ns && ns.len >= 0.45) {
    const perRow = Math.max(1, Math.floor((ns.len - 0.1) / 0.35));
    const tiers = Math.min({backyard: 2, floor: 2, commercial: 3}[style], Math.ceil(want / perRow));
    f.onWall(ns, "nests", {count: Math.max(1, Math.min(perRow, Math.floor(want / tiers))), tiers});
  }

  // Perch ladders: 20 cm per hen, on the longest free stretches of wall.
  const most = {backyard: 2, floor: 3, commercial: 4}[style];
  let perch = 0;
  for (let k = 0; k < most && perch < n * 0.2; k++) {
    const s4 = f.longest(room.walls, perchReach(4));
    if (!s4 || s4.len < 0.7) break;
    const tiers = Math.max(2, Math.min(4, Math.ceil((n * 0.2 - perch) / (s4.len - 0.1))));
    const s = f.longest(room.walls, perchReach(tiers)), length = Math.min(12, step(s.len - 0.1, 0.1));
    if (length < 0.6) break;
    f.onWall(s, "perch", {length, tiers});
    perch += length * tiers;
  }

  if (style === "commercial") {
    // Feeder troughs and nipple drinker lines down the length of the barn.
    const alongX = room.x1 - room.x0 >= room.z1 - room.z0, rot = alongX ? 0 : 90;
    const [lo, hi] = alongX ? [room.z0, room.z1] : [room.x0, room.x1];
    for (const [type, fr] of [["trough", 0.3], ["trough", 0.7], ["nipples", 0.43], ["nipples", 0.57]]) {
      const c = lo + (hi - lo) * fr, line = f.freeLine(c, alongX), length = line ? Math.min(30, step(line[1] - line[0] - 0.2, 0.1)) : 0;
      if (length >= 1) f.add(type, alongX ? (line[0] + line[1]) / 2 : c, alongX ? c : (line[0] + line[1]) / 2, rot, {length});
    }
  }
  // Tube feeders (one per 25 hens) and bell drinkers (one per 40), unless troughs and lines were
  // placed: one of each first, so a small coop that only has room for two gets both.
  const has = t => items.some(it => it.type === t);
  const feeders = has("trough") ? 0 : Math.max(1, Math.ceil(n / 25)), drinkers = has("nipples") ? 0 : Math.max(1, Math.ceil(n / 40));
  const order = [...(feeders ? ["feeder"] : []), ...(drinkers ? ["drinker"] : []),
    ...Array(Math.max(0, feeders - 1)).fill("feeder"), ...Array(Math.max(0, drinkers - 1)).fill("drinker")];
  for (const type of order) f.onFloor(type);
  return {style, items};
}

/* ---------- Export ---------- */
/**
 * Scene nodes and placeable XML for the pasture. c: export context from the core
 * {p, geo, doc, box(name, {center, size}, attrs), trigger(group, mask)}.
 */
function scene(c) {
  const {p, geo, doc} = c, y = henYard(geo, p), n = hensOf(p);
  const stripesMat = doc.material("warningStripes_mat", {}, ["diffuse", "normal", "specular"].map((k, i) =>
    [["Texture", "Normalmap", "Glossmap"][i], `$data/shared/warningStripes_${k}.png`])); // the game finds the .dds
  const nodes = [tg("chickenFeatures", [0, 0, 0], [
    // Solid, not a trigger: unloading finds it with a raycast. It only collides with triggers.
    c.box("exactFillRootNodeFood", y.food, {static: true, collisionFilterGroup: "0x40000000", collisionFilterMask: "0x20000000"}),
    tg("markerFood", y.food.marker),
    c.box("loadingTrigger", y.loading, c.trigger("0x20000000", "0x110000")),
    tg("markerAnimals", y.loading.marker),
    c.box("infoTrigger", y.info, c.trigger("0x20000000", "0x110000")),
    tg("teleportNode", y.loading.teleport),
    c.box("palletTrigger", y.pallet.trigger, c.trigger("0x20000000", "0x10000")),
    ...y.pallet.lines.map(([a, b], i) => tg(`palletAreaStart0${i + 1}`, a, [tg(`palletAreaEnd0${i + 1}`, b.map((v, k) => v - a[k]))])),
    // Like the base game's horse barn: the footprint is cut out of the walking area made from the fence.
    tg("navigationRootNode", [0, 0, 0], [c.box("navmeshBlocker", y.blocker, {static: true, collisionFilterGroup: "0x800000", collisionFilterMask: "0x1", buildNavMeshMask: "0xfe"})]),
    tg("fence1", [0, 0, 0], y.fence.map((q, i) => tg(`fence1Node${i + 1}`, q))),
    // Hidden until the game's trigger marker setting shows it; projected onto the terrain.
    shape("warningStripes01", {translation: [0, 0.02, 0], shapeId: doc.shape("warningStripes", y.pallet.stripes), castsShadows: false, receiveShadows: true,
      nonRenderable: true, terrainDecal: true, materialIds: stripesMat, clipDistance: 100}),
  ])];
  const xml = `
    <triggerMarkers>
        <triggerMarker node="markerFood" filename="$data/shared/assets/marker/markerIconFood.i3d" adjustToGround="true"/>
        <triggerMarker node="markerAnimals" filename="$data/shared/assets/marker/markerIconAnimals.i3d" adjustToGround="true"/>
        <!-- Stripes around the egg pallets, shown or hidden with the game's trigger marker setting. -->
        <triggerMarker node="warningStripes01"/>
    </triggerMarkers>

    <hotspots>
        <hotspot type="CHICKEN" teleportNode="teleportNode"/>
    </hotspots>

    <infoTrigger triggerNode="infoTrigger"/>

    <husbandry saveId="Animals_CHICKEN" hasStatistics="false">
        <!-- The walking area is made from the fence when the barn is placed; the barn itself is blocked out. -->
        <animals type="CHICKEN" baseMaxNumAnimals="${n}" maxNumAnimals="${n}">
            <navigation rootNode="navigationRootNode"/>
            <loadingTrigger node="loadingTrigger"/>
        </animals>
        <food capacity="${n * FEED_PER_HEN}">
            <unloadTrigger exactFillRootNode="exactFillRootNodeFood"/>
        </food>
        <pallets>
            <palletSpawner fillTypes="EGG" maxNumPallets="6">
                <palletTrigger node="palletTrigger"/>
                <spawnPlaces>
                    <spawnPlace startNode="palletAreaStart01" endNode="palletAreaEnd01"/>
                    <spawnPlace startNode="palletAreaStart02" endNode="palletAreaEnd02"/>
                </spawnPlaces>
            </palletSpawner>
        </pallets>
        <fence xmlFilename="$data/placeables/brandless/fences/husbandries/chickenNetFence/chickenNetFence.xml">
            <sections>
                <section segmentId="SEGMENT" customizable="true">
${y.fence.map((_, i) => `                    <node node="fence1Node${i + 1}"/>`).join("\n")}
                </section>
            </sections>
        </fence>
        <meadow>
            <createTask weedState="0">
                <decoFoliage name="grassShort"/>
                <ground type="NONE"/>
                <terrainGroundType name="grass"/>
            </createTask>
        </meadow>
    </husbandry>
`;
  return {nodes, xml, areas: y.areas};
}

/* ---------- The kind ---------- */
export default {
  id: "chicken",
  name: "Hen house",
  plural: "Hen houses",
  category: "animals",
  /** Walk-in: inside walls, hollow collision, a door that opens and a furnished inside. */
  walkIn: true,
  glyph: "hen",
  yard: (geo, p) => henYard(geo, p),
  defaults: {hens: 30, pastureWall: "back", fenceDepth: 8, winStyle: "single", doorStyle: "zbrace"},
  /** Editor sections only this kind has (shown first), and shared ones it doesn't use. */
  sections: [
    {title: "Chickens", side: "build", hint: "Hens go in and out through a small hatch in the middle of the wall the pasture encloses. The pasture (at least 12 m wide and 6 m deep: the game can't handle a smaller one), the feed pad, the egg pallets and the rest are under Game objects.", fields: [
      {k: "hens", label: "Hens", min: 1, max: MAX_HENS, step: 1}]},
  ],
  hides: ["Interior", "Kupor (dormers)"],
  /**
   * Settings as this kind uses them: no sleep point, rooms or dormers; no more hens than fit; and
   * the pasture on a wall without a door if it can be (the opposite one, else another).
   */
  normalize: p => withPasture({...p, interior: false, dormers: [], hens: Math.min(p.hens, henCap(p))}),
  openings,
  placeable: () => ({type: "chickenHusbandryPasture", fn: "$l10n_function_animalPenChicken",
    shop: {category: "animalpens", type: "husbandry", brush: "animals", tab: "chickens"},
    note: `Chicken barn: use <placeable type="chickenHusbandryPasture" ...>, as in the base game's chicken barns.`}),
  description: p => `A ${(+p.width).toFixed(1)} x ${(+p.depth).toFixed(1)} m chicken barn for ${hensOf(p)} hens, made with House to i3d.`,
  furnish,
  catalog: CATALOG,
  autoFurnish,
  summary,
  scene,
  objects: {types: ["food", "loading", "pallets", "info", "pasture"], required: ["food", "loading", "pallets", "info", "pasture"],
    pasture: {minWidth: MIN_PASTURE_WIDTH, depth: [6, 40]}, defaults: defaultObjects},
  presets: [
    {id: "gardenCoop", name: "Red garden coop", blurb: "4 × 3 m coop for 30 hens, red boards with white trim.", settings: {
      hens: 30, fenceDepth: 8,
      width: 4, depth: 3, floors: 1, floorHeight: 2.3, foundation: 0.2, roofType: "gable", ridge: "width", roofPitch: 35, overhang: 0.3,
      chimney: false, gutters: false, downpipes: 0, winFront: 1, winBack: 0, winLeft: 1, winRight: 0, winW: 0.6, winH: 0.5, sill: 1.2,
      doorWall: "front", pastureWall: "back", doorPos: 0.6, doorW: 0.8, doorH: 1.8, entrance: "none",
      wallCladding: "lockpanel", roofMaterial: "tiles", wallColor: "#8E2A1E", trimColor: "#F2EFE8", roofColor: "#2B2D2F", doorColor: "#F2EFE8",
      modPrice: 4500, modUpkeep: 10}},
    {id: "longHenHouse", name: "Long hen house", blurb: "9 × 5 m for 110 hens: low walls, a row of small windows and a metal roof.", settings: {
      hens: 110, fenceDepth: 14,
      width: 9, depth: 5, floors: 1, floorHeight: 2.4, foundation: 0.2, roofType: "gable", ridge: "width", roofPitch: 18, overhang: 0.4,
      chimney: false, gutters: true, downpipes: 1, winFront: 5, winBack: 0, winLeft: 0, winRight: 1, winW: 0.8, winH: 0.5, sill: 1.3,
      doorWall: "left", pastureWall: "front", doorPos: 0, doorW: 1.6, doorH: 2, entrance: "none", winStyle: "stall",
      wallCladding: "horizontal", roofMaterial: "metal", wallColor: "#E8E4DA", trimColor: "#3E5A4A", roofColor: "#4A4F52", doorColor: "#3E5A4A",
      modPrice: 22000, modUpkeep: 30}},
    {id: "poultryBarn", name: "Poultry barn", blurb: "20 × 8 m barn for 360 hens, as many as the biggest barn in the game.", settings: {
      hens: 360, fenceDepth: 20,
      width: 20, depth: 8, floors: 1, floorHeight: 3, foundation: 0.3, roofType: "gable", ridge: "width", roofPitch: 15, overhang: 0.5,
      chimney: false, gutters: true, downpipes: 2, winFront: 8, winBack: 8, winLeft: 0, winRight: 0, winW: 1.2, winH: 0.6, sill: 1.5,
      doorWall: "right", pastureWall: "front", doorPos: 0, doorW: 2.5, doorH: 2.6, entrance: "none", doorStyle: "sliding",
      wallCladding: "lockpanel", roofMaterial: "metal", wallColor: "#7C8A8F", trimColor: "#F2EFE8", roofColor: "#3B3F42", doorColor: "#F2EFE8",
      modPrice: 79000, modUpkeep: 100}},
  ],
};
