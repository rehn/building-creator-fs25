// Grain silo: an intake hall with round silos beside it. The intake (the game's unload station and the selling station that buys the grain the player chooses) is a game
// object any building can have (kinds/grainintake.mjs); the silo is a building with one, and with the silos drawn beside the hall. It is never in the shop: like the base
// game's own selling points (mapUS/sellingPoints/grainRiverSilo01Triggers) it has canBeSold and showInStore false, and a map places it.
// The hall is a shed's (kinds/shed.mjs). Imports only the i3d writer, the objects and the shed (see kinds/index.mjs).
import { tg } from "../i3d.mjs";
import { grainsFor, intakeDefaults } from "./grainintake.mjs";
import shed from "./shed.mjs";

const MAX_SILOS = 4;
/** Where the silos stand: [{x, z, r, h}], side by side along the chosen side, a roof's overhang away from the wall. */
export function siloSpots(p) {
  const n = Math.max(0, Math.min(MAX_SILOS, Math.round(+p.siloCount || 0))), r = +p.siloRadius, h = +p.siloHeight;
  const W = +p.width, D = +p.depth, gap = (+p.overhang || 0) + 0.6, step = 2 * r + 0.5;
  return Array.from({length: n}, (_, k) => {
    const a = (k - (n - 1) / 2) * step, out = r + gap;
    switch (p.siloSide) {
      case "front": return {x: a, z: D / 2 + out, r, h};
      case "left": return {x: -W / 2 - out, z: a, r, h};
      case "right": return {x: W / 2 + out, z: a, r, h};
      default: return {x: a, z: -D / 2 - out, r, h};
    }
  });
}

const COL = {steel: "#B3B9BC", rib: "#6A7378", frame: "#6F7A80", band: "#363B40", pipe: "#8A9296", concrete: "#9A968C"};
const OUT = {back: [0, -1], front: [0, 1], left: [-1, 0], right: [1, 0]};

/**
 * The silos, outside the walls, like a Swedish farm silo of galvanised sheet: a tank on a concrete ring with horizontal ribs, vertical posts, a dark
 * name band, a low cone roof, a ladder with landings up the side away from the hall and a filling pipe bent over the roof edge. A solid collision box.
 */
function outside(c) {
  const out = OUT[c.p.siloSide] || OUT.back, tn = [-out[1], out[0]];
  for (const s of siloSpots(c.p)) {
    const at = y => [s.x, y, s.z], seg = Math.max(16, Math.round(s.r * 5)), top = 0.35 + s.h, rise = s.r * 0.3, y0 = 0.5;
    // a point `rad` out from the silo's middle (away from the hall) and `t` along the side, at height y (the sides are axis-aligned)
    const pos = (rad, t, y) => [s.x + out[0] * rad + tn[0] * t, y, s.z + out[1] * rad + tn[1] * t];
    c.paint(COL.concrete, "concrete"); c.cyl(at(0), s.r + 0.15, 0.35, seg);
    // (the tank starts a hair under the ring's top, the roof a hair under the tank's top: no two faces in one plane)
    c.paint(COL.steel, "galv"); c.cyl(at(0.33), s.r, s.h + 0.02, seg);
    c.paint(COL.rib, "galv");
    for (let y = 0.35 + 0.6; y < top - 0.2; y += 0.6) c.cyl(at(y), s.r + 0.03, 0.07, seg);
    c.paint(COL.band, "galv"); c.cyl(at(top * 0.58), s.r + 0.06, 1.3, seg);
    c.paint(COL.frame, "galv");
    const n = Math.max(6, Math.round(s.r * 2.2)), ao = Math.atan2(out[1], out[0]);
    for (let k = 0; k < n; k++) {
      const a = ao + (k + 0.5) / n * 2 * Math.PI, r = s.r + 0.08;
      c.rod([s.x + r * Math.cos(a), 0.35, s.z + r * Math.sin(a)], [s.x + r * Math.cos(a), top, s.z + r * Math.sin(a)], 0.05, 4);
    }
    c.paint(COL.steel, "galv"); c.cone(at(top - 0.03), s.r + 0.1, s.r * 0.12, rise + 0.03, seg);
    c.paint(COL.rib, "galv"); c.cyl(at(top + rise - 0.05), 0.4, 0.4, 8);
    // the ladder: two rails with rungs, held off the tank by brackets, from near the ground to a little over the roof edge
    c.paint(COL.frame, "galv");
    const lr = s.r + 0.5, yTop = top + 0.9;
    for (const t of [-0.22, 0.22]) {
      c.rod(pos(lr, t, y0), pos(lr, t, yTop), 0.025, 4);
      for (let y = 2; y < top; y += 3) c.rod(pos(s.r + 0.05, t, y), pos(lr, t, y), 0.02, 4);
    }
    for (let y = y0 + 0.3; y < yTop; y += 0.35) c.rod(pos(lr, -0.22, y), pos(lr, 0.22, y), 0.015, 4);
    // landings every 4.5 m: a plate, two side rails and the outer rail broken where the ladder passes
    for (let y = 4.5; y < top - 1; y += 4.5) {
      const A = pos(s.r - 0.1, -0.7, y), B = pos(s.r + 1, 0.7, y + 0.05);
      c.abox("fittings", [Math.min(A[0], B[0]), y, Math.min(A[2], B[2])], [Math.max(A[0], B[0]), y + 0.05, Math.max(A[2], B[2])]);
      for (const t of [-0.7, 0.7]) {
        c.rod(pos(s.r, t, y + 1), pos(s.r + 1, t, y + 1), 0.025, 4);
        c.rod(pos(s.r + 1, t, y), pos(s.r + 1, t, y + 1), 0.025, 4);
      }
      for (const [t0, t1] of [[-0.7, -0.3], [0.3, 0.7]]) c.rod(pos(s.r + 1, t0, y + 1), pos(s.r + 1, t1, y + 1), 0.025, 4);
    }
    // the filling pipe up beside the ladder, over the roof edge and in towards the middle, ending in a downward elbow
    c.paint(COL.pipe, "galv");
    c.tube([pos(s.r + 0.3, 0.8, 0.4), pos(s.r + 0.3, 0.8, top + 0.9), pos(s.r, 0.8, top + 1.1), pos(s.r * 0.5, 0.8, top + 1.1), pos(s.r * 0.5, 0.8, top + 0.8)], 0.11, 10);
    const q = s.r * 0.8;
    c.abox("collision", [s.x - q, 0, s.z - q], [s.x + q, top + rise, s.z + q]);
  }
}

/** The silos are solid ground the building uses: the clear and level areas take them in (the intake, if any, is exported by gameobjects.mjs). */
function scene(c) {
  return {nodes: [], xml: "", areas: siloSpots(c.p).map(s => ({x0: s.x - s.r - 0.2, x1: s.x + s.r + 0.2, z0: s.z - s.r - 0.2, z1: s.z + s.r + 0.2}))};
}

const base = {...shed.presets.find(x => x.id === "maskinhall").settings};
export default {
  id: "grainsilo",
  name: "Grain silo",
  plural: "Grain silos",
  category: "stations",
  walkIn: true,
  // (the grain settings are every building's: buyWheat ..., grainPrice, siloHopper, in the What it buys section; a silo starts by buying five kinds)
  defaults: {...shed.defaults, openFront: true, siloCount: 2, siloRadius: 3.5, siloHeight: 14, siloSide: "back",
    ...Object.fromEntries(["buyWheat", "buyBarley", "buyOat", "buyCanola", "buyMaize"].map(k => [k, true]))},
  sections: [
    {title: "Silos", tab: "building", detail: true, hint: "Round tanks beside the hall, in a row along the side you choose. They are solid: vehicles and players cannot walk through them.", fields: [
      {k: "siloCount", label: "Number of silos", min: 0, max: MAX_SILOS, step: 1},
      {k: "siloRadius", label: "Radius", min: 1.5, max: 8, step: 0.1, unit: " m"},
      {k: "siloHeight", label: "Height of the tank", min: 5, max: 30, step: 0.5, unit: " m"},
      {k: "siloSide", label: "Side of the hall", type: "select", options: [["back", "Back"], ["front", "Front"], ["left", "Left"], ["right", "Right"]]}]},
    ...shed.sections,
  ],
  hides: shed.hides,
  normalize: shed.normalize,
  /** A selling station like the game's own: not for sale, not sellable (the selling station type: gameobjects.mjs sharedPlaceable, for the intake). */
  placeable: () => ({type: "simplePlaceable", fn: "$l10n_function_decoration", sellable: false, shop: {category: "placeableMisc", type: "placeable", brush: "buildings", tab: "sheds"}}),
  description: p => `A ${(+p.width).toFixed(1)} x ${(+p.depth).toFixed(1)} m grain silo made with House to i3d. It buys ${grainsFor(p).length} kinds of grain.`,
  furnish: shed.furnish,
  catalog: shed.catalog,
  autoFurnish: shed.autoFurnish,
  outside,
  scene,
  objects: {types: ["intake"], required: ["intake"], defaults: intakeDefaults, labels: {}},
  presets: [
    {id: "kornsilo", name: "Kornsilo", blurb: "14 × 10 m intake hall, open at the front, with two galvanised silos behind it: the map's grain buyer.", settings: {
      ...base, width: 14, depth: 10, floorHeight: 5, openFront: true, winBack: 0, doorWall: "left", doorPos: 0, doorW: 1.1, doorH: 2.1, doorStyle: "plank",
      siloCount: 2, siloRadius: 3.5, siloHeight: 14, siloSide: "back", modPrice: 0, modUpkeep: 0}},
    {id: "spannmalsdepa", name: "Spannmålsdepå", blurb: "24 × 14 m hall with four big silos along the back, for a larger map.", settings: {
      ...base, width: 24, depth: 14, floorHeight: 6, openFront: true, winBack: 0, doorWall: "left", doorPos: 0, doorW: 1.1, doorH: 2.1, doorStyle: "plank",
      siloCount: 4, siloRadius: 4.2, siloHeight: 18, siloSide: "back", modPrice: 0, modUpkeep: 0}},
  ],
};
