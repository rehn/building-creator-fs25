// Cow barn: an FS25 cowHusbandryPasture (no milk, like the base game's small cow barn,
// data/placeables/brandless/animalHusbandries/cowBarnSmall) you can walk into. Cows graze in the
// pasture and eat and drink at troughs along the barn's pasture wall; feed and bales go in outside
// the fence, water is automatic. Swedish barn presets: a red ladugård, a small fähus, a lösdriftsstall.
// Imports only the i3d writer and the pure helpers; the core hands in the rest (see kinds/index.mjs).
import { roomOf, furnisher } from "../layout.mjs";
import { tone, shade, arc, strawBale, strawLitter } from "./props.mjs";
import { INNER_WALL } from "./innerwall.mjs";
import { shopFor } from "./shop.mjs";
const BARNS = {category: "sheds", type: "placeable", brush: "buildings", tab: "sheds"};   // (the shop place of the kind: shop.mjs lets the player choose another)
import { cowCap } from "../mod/yard.mjs";
export { PASTURE_GROUNDS, MAX_COWS, cowCap, COW, troughFrom } from "../mod/yard.mjs";

/* ---------- Inside ---------- */
export const COLORS = {concrete: "#9A968C", floor: "#8A857B", rubber: "#2E2E2C", steel: "#A9AFB3", wood: "#A47A4E", straw: "#DDBF73", hay: "#B7B064", bale: "#D9BC6A",
  galv: "#B3B9BC", galvDark: "#8D9498", kerb: "#86827A", table: "#A9A59B", sawdust: "#B09B74", brisket: "#44523F",
  silage: "#857C45", plank: "#9C7148", iron: "#3A3A3A", bowl: "#56656D", water: "#7FA0AE", bucketRed: "#B23A2E", bucketWhite: "#E8E6E0"};
/** The floor: concrete over the whole room. */
function furnish(c) { c.floor(COLORS.floor, "concrete"); }

/**
 * The pieces a cow barn can have (see layout.mjs for what a catalog entry is). build(c, it) draws
 * in the piece's own frame with the kit in props.mjs; y is up from the floor, -z is the wall side
 * of a wall piece.
 */
const stallDepth = 2.3, PIPE = 0.03;
export const CATALOG = {
  innerwall: INNER_WALL,
  stalls: {name: "Cubicles (liggbås)", mount: "wall", collision: true,
    params: [{k: "count", label: "Cubicles", min: 1, max: 24, step: 1}], defaults: {count: 6},
    size: it => [it.count * 1.2, stallDepth], height: () => 1.25,
    build(c, it) {
      const w = it.count * 1.2, z0 = -stallDepth / 2, zk = z0 + 2.1, bed = 0.18;
      // the raised bed, with a steel-edged kerb at the back, towards the dung alley
      c.paint(COLORS.kerb, "concrete"); c.box(-w / 2, w / 2, z0, zk, 0, bed);
      c.paint(COLORS.galvDark, "galv"); c.box(-w / 2, w / 2, zk - 0.02, zk, 0.01, bed + 0.01);
      for (let i = 0; i < it.count; i++) {
        const x0 = -w / 2 + i * 1.2;
        // a rubber mat per cubicle, with grooves, and sawdust where the cow lies
        c.paint(tone(COLORS.rubber, i), "rubber"); c.box(x0 + 0.02, x0 + 1.18, z0 + 0.5, zk - 0.03, bed, bed + 0.02);
        c.paint(shade(COLORS.rubber, 0.6), "rubber");
        for (let g = 0; g < 4; g++) { const z = z0 + 0.75 + g * 0.3; c.box(x0 + 0.05, x0 + 1.15, z, z + 0.012, bed + 0.02, bed + 0.024); }
        // sawdust kicked about where she lies: overlapping flat drifts, so the edge is ragged and round
        for (let k = 0; k < 7; k++) {
          const h = ((i * 7 + k * 13) % 17) / 17, cx = x0 + 0.3 + 0.6 * ((k * 5 + i * 3) % 7) / 6, cz = zk - 0.35 - 0.8 * ((k * 3 + i) % 5) / 4;
          const r = Math.min(0.1 + 0.15 * h, cx - x0 - 0.04, x0 + 1.16 - cx, cz - z0 - 0.52, zk - 0.05 - cz);
          c.paint(tone(COLORS.sawdust, i + k), "litter");
          c.cyl(cx, cz, bed + 0.02, r, 0.002 + 0.0012 * k, 11);   // (each a little higher than the last: no flicker where they overlap)
        }
      }
      // the brisket board: where the cow's chest rests, so she lies far enough back
      c.paint(COLORS.brisket, "plastic"); c.box(-w / 2 + 0.01, w / 2 - 0.01, z0 + 0.4, z0 + 0.48, bed, bed + 0.11);
      c.paint(COLORS.galv, "galv");
      // head rail along the wall
      c.rod([-w / 2 + PIPE, 0.95, z0 + 0.12], [w / 2 - PIPE, 0.95, z0 + 0.12], PIPE, 8);
      // a bent loop between each pair of cubicles (and at both ends of the row)
      for (let i = 0; i <= it.count; i++) {
        const x = Math.max(-w / 2 + PIPE + 0.005, Math.min(w / 2 - PIPE - 0.005, -w / 2 + i * 1.2)), at = (z, y) => [x, y, z];
        const zp = z0 + 0.25, zt = z0 + 1.35;
        const loop = [at(zp, bed), at(zp, 0.95), ...arc(at, zp + 0.2, 0.95, 0.2, Math.PI, Math.PI / 2, 3).slice(1),
          at(zt, 1.15), ...arc(at, zt, 0.85, 0.3, Math.PI / 2, -Math.PI / 2, 6).slice(1), at(z0 + 0.6, 0.55), at(zp, 0.55)];
        c.pipe(loop, PIPE, 8);
        c.paint(COLORS.galvDark, "galv");
        c.box(Math.max(-w / 2, x - 0.06), Math.min(w / 2, x + 0.06), zp - 0.06, zp + 0.06, bed, bed + 0.012);   // foot plate
        // the neck rail clamp: a sleeve round the rail, bolted down onto the loop
        const xa = Math.max(-w / 2 + 0.035, x - 0.035), xb = Math.min(w / 2 - 0.035, x + 0.035);
        c.rod([xa, 1.205, z0 + 1.05], [xb, 1.205, z0 + 1.05], 0.031, 10);
        c.box(x - 0.012, x + 0.012, z0 + 1.035, z0 + 1.065, 1.15, 1.18);
        c.paint(COLORS.galv, "galv");
      }
      // the neck rail across the loops
      c.rod([-w / 2 + 0.03, 1.205, z0 + 1.05], [w / 2 - 0.03, 1.205, z0 + 1.05], 0.025, 8);
    }},
  feedfence: {name: "Feeding fence (foderhäck)", mount: "floor", collision: true,
    params: [{k: "length", label: "Length", min: 2, max: 60, step: 0.1, unit: " m"}], defaults: {length: 6},
    size: it => [it.length, 0.5], height: () => 1.3,
    build(c, it) {
      const L = it.length, xA = -L / 2, xB = L / 2;
      // the curb the fence stands on, the smooth feed table in front (+z) with silage pushed up to it
      c.paint(COLORS.concrete, "concrete"); c.box(xA, xB, -0.2, 0.06, 0, 0.18);
      c.paint(COLORS.table, "concrete"); c.box(xA, xB, 0.06, 0.25, 0, 0.03);
      // one long heap, then overlapping lumps on it (not a row of blocks)
      c.paint(COLORS.silage, "straw"); c.box(xA + 0.04, xB - 0.04, 0.075, 0.245, 0.03, 0.1);
      for (let x = xA + 0.06, k = 0; x < xB - 0.2; x += 0.23, k++) {
        const x1 = Math.min(xB - 0.05, x + 0.42), h = [0.05, 0.03, 0.06, 0.035, 0.045][k % 5], z0 = 0.09 + (k % 3) * 0.02;
        c.paint(shade(COLORS.silage, [0, -0.2, 0.15][k % 3]), "straw"); c.box(x, x1, z0, 0.24 - (k % 2) * 0.02, 0.1, 0.1 + h);
      }
      c.paint(COLORS.hay, "straw");
      for (let x = xA + 0.3, k = 0; x < xB - 0.3; x += 0.55, k++) c.board([x, 0.14, 0.12], [x + 0.18, 0.12 + (k % 3) * 0.02, 0.2], 0.012, 0.006);
      // posts, rails and the self-locking yokes
      c.paint(COLORS.galvDark, "galv");
      const nPost = Math.max(1, Math.ceil(L / 2.4));
      for (let k = 0; k <= nPost; k++) { const x = xA + 0.045 + k * (L - 0.09) / nPost; c.box(x - 0.04, x + 0.04, -0.04, 0.04, 0.18, 1.25); }
      c.paint(COLORS.galv, "galv");
      c.rod([xA + 0.01, 1.22, 0], [xB - 0.01, 1.22, 0], PIPE, 8);
      c.rod([xA + 0.01, 0.3, 0], [xB - 0.01, 0.3, 0], PIPE, 8);
      for (let x = xA + 0.15; x + 0.5 < xB - 0.08; x += 0.7) {
        c.rod([x, 0.3, 0], [x, 1.22, 0], 0.021, 6);
        c.pipe([[x + 0.22, 0.3, 0], [x + 0.22, 0.82, 0], [x + 0.42, 1.22, 0]], 0.021, 6);
        c.box(x + 0.19, x + 0.25, -0.03, 0.03, 0.3, 0.36);             // the yoke's pivot
      }
      c.paint(COLORS.galvDark, "galv");
      c.box(xA + 0.05, xB - 0.05, -0.05, -0.035, 1.12, 1.17);          // the locking bar on the cows' side
      c.rod([xA + 0.08, 1.14, -0.05], [xA + 0.08, 0.98, -0.16], 0.012, 6);   // and its lever
    }},
  calfpen: {name: "Calf pen (kalvbox)", mount: "floor", collision: true, params: [], defaults: {},
    size: () => [2.4, 2], height: () => 1.1,
    build(c) {
      strawLitter(c, -1.15, 1.15, -0.95, 0.95, 0, COLORS.straw);
      // posts at the corners, in the middle of the long sides and either side of the gate
      const posts = [[-1.155, -0.955], [1.155, -0.955], [-1.155, 0.955], [1.155, 0.955], [0, -0.955], [-0.4, 0.955], [0.55, 0.955]];
      posts.forEach(([x, z], k) => { c.paint(tone(COLORS.plank, k + 1), "wood"); c.box(x - 0.045, x + 0.045, z - 0.045, z + 0.045, 0, 1.1); });
      // planks with gaps, each a little different
      const ys = [0.14, 0.38, 0.62, 0.86], plank = (k, x0, x1, z0, z1, y) => { c.paint(tone(COLORS.plank, k), "wood"); c.box(x0, x1, z0, z1, y, y + 0.13); };
      ys.forEach((y, j) => {
        plank(j, -1.2, 1.2, -1, -0.97, y);                                             // back
        plank(j + 1, -1.2, -1.17, -0.91, 0.91, y); plank(j + 2, 1.17, 1.2, -0.91, 0.91, y);   // ends
        plank(j + 1, -1.2, -0.445, 0.97, 1, y); plank(j, 0.595, 1.2, 0.97, 1, y);      // front, either side of the gate
        plank(j + 2, -0.34, 0.49, 0.94, 0.97, y);                                      // the gate
      });
      // the gate's brace, hinges and latch
      c.paint(tone(COLORS.plank, 2), "wood"); c.board([-0.3, 0.2, 0.93], [0.45, 0.95, 0.93], 0.012, 0.1);
      c.paint(COLORS.iron, "steel");
      for (const y of [0.18, 0.9]) c.box(-0.42, -0.2, 0.935, 0.972, y, y + 0.04);
      c.box(0.42, 0.52, 0.93, 0.972, 0.66, 0.7); c.rod([0.47, 0.68, 0.95], [0.6, 0.68, 0.95], 0.008, 6);
      // two buckets hanging inside the front
      [[-0.8, COLORS.bucketRed], [0.85, COLORS.bucketWhite]].forEach(([x, col]) => {
        c.paint(COLORS.iron, "steel"); c.box(x - 0.05, x + 0.05, 0.9, 0.94, 0.72, 0.8);
        c.paint(col, "plastic"); c.cone(x, 0.78, 0.55, 0.095, 0.125, 0.24, 16); c.cyl(x, 0.78, 0.79, 0.13, 0.012, 16);
        c.paint(COLORS.iron, "steel"); c.pipe(arc((u, v) => [x + u, v, 0.78], 0, 0.8, 0.12, 0, Math.PI, 5), 0.005, 4);
      });
    }},
  hayrack: {name: "Hay rack (höhäck)", mount: "wall", collision: true, params: [], defaults: {},
    size: () => [1.6, 0.6], height: () => 1.7,
    build(c) {
      const xA = -0.8, xB = 0.8, zw = -0.29;
      // the trough: bottom, a front board and end boards, on two legs
      c.paint(tone(COLORS.plank, 0), "wood"); c.box(xA + 0.04, xB - 0.04, zw, 0.27, 0.55, 0.6);
      c.paint(tone(COLORS.plank, 1), "wood"); c.box(xA + 0.04, xB - 0.04, 0.23, 0.27, 0.6, 0.82);
      c.paint(tone(COLORS.plank, 2), "wood"); c.box(xA + 0.04, xB - 0.04, 0.23, 0.27, 0.82, 0.84);
      for (const x of [xA, xB - 0.04]) { c.paint(tone(COLORS.plank, 1), "wood"); c.box(x, x + 0.04, zw, 0.27, 0.0, 0.84); }
      // hay in the trough and packed behind the slats, higher at the wall
      for (let k = 0; k < 5; k++) {
        const y = 0.84 + k * 0.15, zf = -0.27 + (y + 0.075 - 0.82) / 0.85 * 0.42 - 0.05;
        c.paint(tone(COLORS.hay, k), "straw"); c.box(xA + 0.06, xB - 0.06, zw + 0.01, Math.max(zw + 0.06, zf), y - 0.02, y + 0.13);
      }
      c.paint(shade(COLORS.hay, 0.3), "straw"); c.box(xA + 0.08, xB - 0.08, -0.25, 0.2, 0.6, 0.68);
      for (let x = xA + 0.15, k = 0; x < xB - 0.1; x += 0.22, k++) c.board([x, 0.72, 0.05 + (k % 2) * 0.08], [x + 0.06, 0.62, 0.22], 0.01, 0.006);
      // slats leaning out from the wall, framed by side boards and rails
      c.paint(tone(COLORS.plank, 2), "wood");
      for (let x = xA + 0.12; x < xB - 0.08; x += 0.12) c.board([x, 0.86, -0.25], [x, 1.62, 0.17], 0.028, 0.028);
      c.paint(tone(COLORS.plank, 0), "wood");
      for (const x of [xA + 0.03, xB - 0.03]) c.board([x, 0.86, -0.25], [x, 1.62, 0.17], 0.05, 0.08);
      c.box(xA, xB, 0.12, 0.2, 1.6, 1.68); c.box(xA, xB, -0.29, -0.21, 0.82, 0.9);
      c.paint(COLORS.iron, "steel"); for (const x of [xA + 0.02, xB - 0.06]) c.box(x, x + 0.04, -0.3, -0.27, 1.5, 1.7);   // wall brackets
    }},
  waterbowl: {name: "Water bowl (vattenkopp)", mount: "wall", params: [], defaults: {},
    size: () => [0.4, 0.35], height: () => 0.8,
    build(c) {
      const zc = 0.015;
      c.paint(COLORS.galvDark, "galv");
      c.box(-0.06, 0.06, -0.175, -0.16, 0.42, 0.72);                                 // plate on the wall
      c.box(-0.03, 0.03, -0.16, zc - 0.05, 0.46, 0.5);                               // the arm under the bowl
      c.paint(COLORS.galv, "galv");
      c.rod([-0.2, 0.765, -0.145], [0.2, 0.765, -0.145], 0.015, 8);                    // the water pipe along the wall
      c.pipe([[0, 0.765, -0.145], [0, 0.7, -0.13], [0, 0.6, -0.1]], 0.012, 6);       // down to the valve
      c.paint(COLORS.bowl, "steel");
      c.cone(0, zc, 0.5, 0.06, 0.13, 0.08, 20);                                       // the cast bowl
      for (let k = 0; k < 16; k++) {                                                  // its rim
        const a0 = k / 16 * Math.PI * 2, a1 = (k + 1) / 16 * Math.PI * 2, r = 0.138;
        c.board([r * Math.cos(a0), 0.6, zc + r * Math.sin(a0)], [r * Math.cos(a1), 0.6, zc + r * Math.sin(a1)], 0.014, 0.05);
      }
      c.paint(COLORS.water); c.cyl(0, zc, 0.58, 0.128, 0.006, 20);
      c.paint(COLORS.iron, "steel"); c.board([0, 0.6, zc - 0.09], [0, 0.635, zc - 0.02], 0.06, 0.01);   // the paddle the cow presses
    }},
  bale: {name: "Straw bale", mount: "floor", collision: true, params: [], defaults: {},
    size: () => [0.9, 0.5], height: () => 0.4,
    build(c) { strawBale(c, 0, 0, 0, COLORS.bale); }},
};

for (const [k, g] of Object.entries({"innerwall":"Walls and doors","stalls":"Housing","calfpen":"Housing","feedfence":"Feeding and water","hayrack":"Feeding and water","waterbowl":"Feeding and water","bale":"Straw and bales"})) if (CATALOG[k]) CATALOG[k].group = g;   // (the palette's groups)

/**
 * Fills the inside to match the barn's size and cows, in the free space: rows of cubicles (one per
 * cow) along the longest free walls, a feeding fence down the middle of a bigger barn (hay racks in
 * a small fähus), water bowls (one per 10 cows), a calf pen and a couple of straw bales.
 * Returns {style, items}.
 */
function autoFurnish(p) {
  const room = roomOf(p, []), n = cowCap(p), f = furnisher(room, CATALOG), {items} = f;
  const style = n <= 10 ? "fahus" : n <= 40 ? "ladugard" : "losdrift";
  let placed = 0;
  for (let k = 0; k < 6 && placed < n; k++) {
    const s = f.longest(room.walls, stallDepth);
    if (!s || s.len < 1.3) break;
    const count = Math.min(24, Math.floor((s.len - 0.1) / 1.2), n - placed);
    f.onWall(s, "stalls", {count});
    placed += count;
  }
  let fed = false;
  if (style !== "fahus") {
    const alongX = room.x1 - room.x0 >= room.z1 - room.z0, c = alongX ? (room.z0 + room.z1) / 2 : (room.x0 + room.x1) / 2;
    const line = f.freeLine(c, alongX, 0.7), length = line ? Math.min(30, Math.floor((line[1] - line[0] - 0.4) * 10) / 10) : 0;
    if (length >= 2) { f.add("feedfence", alongX ? (line[0] + line[1]) / 2 : c, alongX ? c : (line[0] + line[1]) / 2, alongX ? 0 : 90, {length}); fed = true; }
  }
  if (!fed) for (let k = 0; k < Math.max(1, Math.ceil(n / 6)); k++) { const s = f.longest(room.walls, 0.6); if (s && s.len >= 1.7) f.onWall(s, "hayrack", {}); }
  for (let k = 0; k < Math.min(4, Math.max(1, Math.ceil(n / 10))); k++) { const s = f.longest(room.walls, 0.35); if (s && s.len >= 0.5) f.onWall(s, "waterbowl", {}); }
  f.onFloor("calfpen");
  f.onFloor("bale"); f.onFloor("bale");
  return {style, items};
}

/* ---------- The kind ---------- */
// (an old red barn: heavy studs, far apart and uneven, seen from inside)
const swedishRed = {wallCladding: "lockpanel", wallColor: "#8E2A1E", trimColor: "#F2EFE8", studSpacing: 0.9, studWidth: 0.08, studIrregular: 0.5};
export default {
  id: "cow",
  name: "Cow barn",
  plural: "Cow barns",
  category: "animals",
  walkIn: true,
  defaults: {ceiling: false, insideSame: true, winStyle: "stall", doorStyle: "xbrace"},
  sections: [],
  hides: ["Interior", "Kupor (dormers)"],
  /** Settings as this kind uses them: no sleep point, rooms or dormers; at least 6 x 6 m. */
  normalize: p => ({...p, interior: false, dormers: [], width: Math.max(6, p.width), depth: Math.max(6, p.depth)}),
  placeable: p => ({type: "simplePlaceable", fn: "$l10n_function_decoration", shop: shopFor(p, BARNS)}),
  description: p => `A ${(+p.width).toFixed(1)} x ${(+p.depth).toFixed(1)} m cow barn made with House to i3d.`,
  furnish,
  catalog: CATALOG,
  autoFurnish,
  presets: [
    {id: "ladugard", name: "Röd ladugård", blurb: "16 × 9 m red Swedish barn for 20 cows: falu red boards, white trim, a fieldstone base and lanterns on the ridge.", settings: {
      ...swedishRed,
      width: 16, depth: 9, floors: 1, floorHeight: 3.2, foundation: 0.6, foundationColor: "#8C8A84", roofType: "gable", ridge: "width", roofPitch: 40, overhang: 0.5,
      roofMaterial: "tiles", roofColor: "#2F2F2F", chimney: false, gutters: true, downpipes: 2, ventilators: 2,
      winFront: 6, winBack: 6, winLeft: 1, winRight: 0, winW: 0.8, winH: 0.6, sill: 1.5,
      doorWall: "left", doorPos: 0, doorW: 2.4, doorH: 2.6, doorColor: "#5B1E16", entrance: "none",
      modPrice: 45000, modUpkeep: 120}},
    {id: "fahus", name: "Fähus", blurb: "8 × 6 m small cowshed for 6 cows, red boards and a red tile roof.", settings: {
      ...swedishRed, wallColor: "#7A2418",
      width: 8, depth: 6, floors: 1, floorHeight: 2.6, foundation: 0.4, foundationColor: "#8C8A84", roofType: "gable", ridge: "width", roofPitch: 30, overhang: 0.4,
      roofMaterial: "tiles", roofColor: "#7A2E1F", chimney: false, gutters: false, downpipes: 0, ventilators: 0,
      winFront: 2, winBack: 0, winLeft: 1, winRight: 1, winW: 0.7, winH: 0.5, sill: 1.4,
      doorWall: "front", doorPos: -0.5, doorW: 1.2, doorH: 2.1, doorColor: "#F2EFE8", entrance: "none", doorStyle: "zbrace",
      modPrice: 15000, modUpkeep: 40}},
    {id: "losdriftsstall", name: "Lösdriftsstall", blurb: "30 × 16 m modern loose-housing barn for 70 cows, a low metal roof and lanterns along the ridge.", settings: {
      fenceDepth: 30,
      wallCladding: "lockpanel", wallColor: "#A8A398", trimColor: "#3B3F42",
      width: 30, depth: 16, floors: 1, floorHeight: 3.6, foundation: 0.3, foundationColor: "#8C8A84", roofType: "gable", ridge: "width", roofPitch: 15, overhang: 0.5,
      roofMaterial: "metal", roofColor: "#4A4F52", chimney: false, gutters: true, downpipes: 2, ventilators: 4,
      winFront: 8, winBack: 8, winLeft: 0, winRight: 0, winW: 1.4, winH: 0.6, sill: 1.5,
      doorWall: "right", doorPos: 0, doorW: 2.5, doorH: 2.6, doorColor: "#3B3F42", entrance: "none", doorStyle: "sliding", winStyle: "single",
      modPrice: 140000, modUpkeep: 300}},
  ],
};
