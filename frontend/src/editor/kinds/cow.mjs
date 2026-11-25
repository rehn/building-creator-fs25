// Cow barn: an FS25 cowHusbandryPasture (no milk, like the base game's small cow barn,
// data/placeables/brandless/animalHusbandries/cowBarnSmall) you can walk into. Cows graze in the
// pasture and eat and drink at troughs along the barn's pasture wall; feed and bales go in outside
// the fence, water is automatic. Swedish barn presets: a red ladugård, a small fähus, a lösdriftsstall.
// Imports only the i3d writer and the pure helpers; the core hands in the rest (see kinds/index.mjs).
import { tg, shape } from "../i3d.mjs";
import { roomOf, furnisher, wallsOf, footprint, toWorld, isSplitWall, WALL_T } from "../layout.mjs";
import { animalNav, navMesh, KEEP } from "../walkarea.mjs";
import { wallLength, yardFrame, shellOf, teleportFor, withPasture, pastureWallFor, cornerStripes, palletLines, footprintHull, contourClosure, navContourNodes, ccwFence } from "./pasture.mjs";
import { objectOf, objectsOf, boxOf, iconOf, boxFrom, pastureOf, insidePoly, footprints, blockersOf, animalEntrances } from "../objects.mjs";
import { placeOnWall, placeOnBuilding } from "../places.mjs";
import { tone, shade, arc, strawBale, strawLitter } from "./props.mjs";
import { INNER_WALL } from "./innerwall.mjs";
import { wallSlabs, PASTURE_GROUNDS, MAX_COWS, cowCap, cowsOf, COW, troughFrom, cowObjects, defaultsOf, cowScene, COW_MIN_WIDTH, COW_PLACEABLE } from "../mod/yard.mjs";
export { PASTURE_GROUNDS, MAX_COWS, cowCap, COW, troughFrom, defaultsOf, cowScene } from "../mod/yard.mjs";
const MIN_PASTURE_WIDTH = COW_MIN_WIDTH;

/* ---------- The doorway and the troughs ---------- */
/**
 * What a piece on the floor keeps the animals out of, as boxes {x0, x1, z0, z1}: its footprint, or, for a piece with solids of its own (an inner wall), those: the
 * stretches that reach the floor, the doorway open (animals can't open a door, so a wall with one is solid all along).
 */
function animalBlockers(it) {
  const def = CATALOG[it.type];
  if (!def || def.ghost) return [];
  if (!def.solids) return [footprint(it, def)];
  return def.solids(Math.round(it.door) >= 2 ? {...it, door: 3} : it, {ceil: 3}).filter(([, , , , y0]) => y0 < 0.3).map(([x0, x1, z0, z1]) => {
    const a = toWorld(it, x0, z0), b = toWorld(it, x1, z1);
    return {x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]), keep: KEEP.innerWall};
  });
}
/**
 * The walls across the building and across its parts (the walls between sections) as blocks on the floor for the animals, like an inner wall: all of each wall but its framed empty doorways
 * (a door in it, open or shut, counts as closed: animals don't open doors). [{x0, x1, z0, z1, keep}] in the plan; geo.opsByWall has the openings.
 */
function dividerBlocks(p, geo) {
  const out = [], frames = wallsOf(p);
  for (const key of Object.keys(frames)) {
    if (!isSplitWall(key)) continue;
    const w = frames[key], holes = ((geo.opsByWall || {})[key] || {ops: []}).ops.filter(o => o.kind === "hatch" && o.hole && o.t0 < 0.3).sort((a, b) => a.s0 - b.s0), parts = [];
    let s = 0;
    for (const o of holes) { if (o.s0 > s + 0.05) parts.push([s, o.s0]); s = Math.max(s, o.s1); }
    if (w.L > s + 0.05) parts.push([s, w.L]);
    for (const [a, b] of parts) {
      const q = [[a, -WALL_T], [a, 0], [b, -WALL_T], [b, 0]].map(([sv, d]) => [w.o[0] + w.u[0] * sv + w.n[0] * d, w.o[2] + w.u[2] * sv + w.n[2] * d]);
      out.push({x0: Math.min(...q.map(c => c[0])), x1: Math.max(...q.map(c => c[0])), z0: Math.min(...q.map(c => c[1])), z1: Math.max(...q.map(c => c[1])), keep: KEEP.innerWall});
    }
  }
  return out;
}
/**
 * Where the animals walk when they can go inside (p.animalsInside, and the pasture has its doorway): the yard (the fence, less the building and the troughs),
 * the building's floor (less the pieces standing on it), and the ramp through the doorway between them, as {rects, ramp} (walkarea.mjs animalNav). Null otherwise.
 */
function animalsInside(p, geo, fence, blockers) {
  const entrances = p.animalsInside === false ? [] : animalEntrances(p);
  if (!entrances.length || !fence || fence.length < 3) return null;
  const w = wallsOf(p)[entrances[0].wall];
  if (!w) return null;
  // (the ramp, and a way out over the margin kept off the wall)
  const F = p.foundation || 0, run = Math.max(F > 0.02 ? Math.max(0.8, F * 5) : 0.6, KEEP.wall + 0.4);
  const at = (s, d) => [w.o[0] + w.u[0] * s + w.n[0] * d, w.o[2] + w.u[2] * s + w.n[2] * d];
  const rooms = roomOf(p, openings(p)).floorRects;
  const items = [...(p.items || []).flatMap(animalBlockers), ...dividerBlocks(p, geo)];
  const nav = animalNav({fence, blockers, rooms, items: items.map(b => ({...b})), doors: entrances.map(e => ({a: at(e.s0, run), b: at(e.s1, run), c: at(e.s1, -WALL_T), d: at(e.s0, -WALL_T)})), floorY: F < 0.03 ? F + 0.03 : F + 0.004});   // (the top of the floor: see FLOOR_LIFT in model.mjs)
  if (!nav) return null;
  nav.blockers = [...wallSlabs(p, entrances, openings(p)), ...items.map(box), ...blockers.filter(b => b.keep === KEEP.trough)];
  return nav;
}
/** A blocker box from a floor rectangle {x0, x1, z0, z1}: 2 m high. */
const box = r => ({center: [(r.x0 + r.x1) / 2, 1, (r.z0 + r.z1) / 2], size: [r.x1 - r.x0, 2, r.z1 - r.z0]});
/** The cows' doorway: an open hole in the pasture wall (1.6 x 2.2 m in the middle of the stretch it encloses, unless the pasture says where and how big), kept clear inside. */
export function openings(p) {
  if (p.pastureNoGap) return [];
  const L = wallLength(p, p.pastureWall), m = p.pastureMid ?? L / 2, w = p.pastureGapW ?? 1.6, h = Math.min(p.pastureGapH ?? 2.2, p.floors * p.floorHeight - 0.3);
  return [{wall: p.pastureWall, s0: m - w / 2, s1: m + w / 2, t1: h, clear: w, what: "the cows' doorway", plain: true, ramp: !!p.pastureRamp}];
}
/**
 * Where a cow barn's gameplay places are, from built geometry. All points in world space.
 *   fence:        as the hen house's (yardFrame), at least 16 m along the pasture wall
 *   feedTrough, waterTrough: {outer, inner (rects), top, bottom, planeMin, planeMax, plane: [x, z], size: [sx, sz]}
 *   foodPlaces, waterPlaces: [{pos, rot}] where cows stand to eat and drink, facing the trough
 *   food:         the feed pad (tip feed onto it) outside the fence; bales: where bales are dropped
 *   loading:      animal trailer spot further out on the feed side; info; blockers: kept out of the walking area
 *   markers:      {food, bales, animals, teleport}; areas: ground leveled for the troughs and the pad
 */
export function cowYard(geo, p, cfg = COW) {
  const yf = yardFrame(geo, p, cfg.minWidth), {at, boxAt, rectOf} = yf;
  // The pasture: the building's pasture object, or (placing things to start with) its wall and depth.
  const pa = pastureOf(p), past = pa ? pa.w : yf.past, fence = ccwFence(pa ? pa.fence : yf.fence);
  const {feedTroughs: fts, waterTroughs: wts} = cowObjects(geo, p, yf, cfg);
  const fromObj = e => (({center: [x, , z], size: [w, h, d]}) => ({x, z, w, d, h, asset: e.look && e.look.asset, rot: e.look && e.look.rot}))(e.box);
  const rects = footprints(p);
  // (every trough has places where animals stand; the game has one fill plane for the food and one for the water: the first trough's)
  const feedTroughs = fts.map(e => troughFrom(fromObj(e), fence, rects)), waterTroughs = wts.map(e => troughFrom(fromObj(e), fence, rects));
  const feedTrough = feedTroughs[0] || null, waterTrough = waterTroughs[0] || null;
  const foodPlaces = feedTroughs.flatMap(t => t.places), waterPlaces = waterTroughs.flatMap(t => t.places);
  const troughs = [...feedTroughs, ...waterTroughs];
  // The game objects: where the building has them (objects.mjs); to start with, the feed pad and bales
  // outside the fence on the feed side, the trailer spot further out, the info area round the barn.
  const {food, bales, loading, info, pallets} = cowObjects(geo, p, yf, cfg);
  // (the area as the game makes it: the fence, closed along the building)
  const contour = [...fence, ...navContourNodes(fence, footprints(p)).map(([x, z]) => [x, 0, z])];
  const nav = animalsInside(p, geo, contour, [...blockersOf(p).map(b => ({...b, keep: KEEP.wall})), ...troughs.map(t => ({...t.box, keep: KEEP.trough}))]);
  return {
    nav, contour,
    ...(pallets && {pallet: {lines: palletLines(pallets.box), trigger: pallets.box, stripes: cornerStripes(rectOf(pallets.box))}}),
    fence, feedTrough, waterTrough, feedTroughs, waterTroughs, foodPlaces, waterPlaces, food: food.box, bales: bales && bales.box, loading: loading.box, info: info.box,
    blockers: [...blockersOf(p), ...troughs.map(t => t.box)],
    markers: {food: food.icon, bales: bales && bales.icon, animals: loading.icon, teleport: teleportFor(loading, geo.dims)},
    areas: [food.box, ...(bales ? [bales.box] : []), ...(pallets ? [pallets.box] : []), ...troughs.map(t => t.box)].map(rectOf),
  };
}
/** The troughs, drawn outside the walls (c: {p, geo, abox, paint} from the core). The fill planes are separate i3d nodes. */
export const outsideOf = cfg => c => {
  const y = cowYard(c.geo, c.p, cfg);
  for (const t of [...y.feedTroughs, ...y.waterTroughs]) drawTrough(c, t);
};
/** A trough (troughFrom's): the user's item it looks like if it has one, else planks round a hollow, with collision. */
export function drawTrough(c, t) {
  // one of the user's items: its own model and collision, in the box's place
  if (t.asset && c.asset(t.asset, t.plane[0], t.plane[1], t.rot || 0)) return;
  c.paint(COLORS.concrete, "concrete");
  const o = t.outer, i = t.inner;
  c.abox("fittings", [o.x0, 0, o.z0], [o.x1, t.bottom, o.z1]);                 // the base, up to the trough's floor
  for (const [a, b] of [[[o.x0, o.z0], [i.x0, o.z1]], [[i.x1, o.z0], [o.x1, o.z1]], [[i.x0, o.z0], [i.x1, i.z0]], [[i.x0, i.z1], [i.x1, o.z1]]])
    c.abox("fittings", [a[0], t.bottom, a[1]], [b[0], t.top, b[1]]);          // its four sides
  c.abox("collision", [o.x0, 0, o.z0], [o.x1, t.top, o.z1]);
}

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
  const room = roomOf(p, openings(p)), n = cowsOf(p), f = furnisher(room, CATALOG), {items} = f;
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

/* ---------- Export ---------- */
/** Scene nodes and placeable XML for the pasture (c: export context from the core). */
export const sceneOf = cfg => c => cowScene(c, cowYard(c.geo, c.p, cfg), cfg, cfg.count(c.p), {rects: footprints(c.p), clear: footprintHull(c.p), ground: c.p.pastureGround, under: c.p.groundUnder});
/* ---------- The kind ---------- */
// (an old red barn: heavy studs, far apart and uneven, seen from inside)
const swedishRed = {wallCladding: "lockpanel", wallColor: "#8E2A1E", trimColor: "#F2EFE8", studSpacing: 0.9, studWidth: 0.08, studIrregular: 0.5};
export default {
  id: "cow",
  name: "Cow barn",
  plural: "Cow barns",
  category: "animals",
  walkIn: true,
  glyph: "cow",
  yard: (geo, p) => cowYard(geo, p),
  defaults: {ceiling: false, insideSame: true, animalsInside: true, pastureGround: "grass", cows: 12, pastureWall: "back", fenceDepth: 15, winStyle: "stall", doorStyle: "xbrace"},
  sections: [
    {title: "Cows", tab: "game", hint: "Cows graze in the pasture and come in through a wide doorway in the pasture side; they eat and drink at troughs along that wall. Fill feed (or drop bales) at the feed place outside the fence; water is automatic. The pasture, the feed pad and the rest are under Game objects. This is a barn without milking (like the game’s small cow barn).", fields: [
      {k: "cows", label: "Cows", min: 1, max: MAX_COWS, step: 1},
      {k: "pastureGround", cardRow: true, label: "Ground in the pasture", type: "select", options: PASTURE_GROUNDS},
      {k: "animalsInside", cardRow: true, label: "The animals can walk inside through the doorway", type: "check"}]},
  ],
  hides: ["Interior", "Kupor (dormers)"],
  /**
   * Settings as this kind uses them: no sleep point, rooms or dormers; at least 6 x 6 m (troughs on
   * both sides of the doorway); no more cows than fit; the pasture's wall and depth from its object.
   */
  normalize: p => {
    const q = {...p, interior: false, dormers: [], width: Math.max(6, p.width), depth: Math.max(6, p.depth)};
    return withPasture({...q, cows: Math.min(q.cows, cowCap(q))});
  },
  openings,
  placeable: () => COW_PLACEABLE,
  description: p => `A ${(+p.width).toFixed(1)} x ${(+p.depth).toFixed(1)} m cow barn for ${cowsOf(p)} cows, made with House to i3d.`,
  furnish,
  outside: outsideOf(COW),
  catalog: CATALOG,
  autoFurnish,
  scene: sceneOf(COW),
  // the game objects: the bale drop is optional
  objects: {types: ["food", "bales", "loading", "feedTrough", "waterTrough", "info", "pasture"], required: ["food", "loading", "info", "pasture"],
    pasture: {minWidth: MIN_PASTURE_WIDTH, depth: [10, 60], gapSize: true}, defaults: defaultsOf(COW)},
  presets: [
    {id: "ladugard", name: "Röd ladugård", blurb: "16 × 9 m red Swedish barn for 20 cows: falu red boards, white trim, a fieldstone base and lanterns on the ridge.", settings: {
      cows: 20, pastureWall: "back", fenceDepth: 18, ...swedishRed,
      width: 16, depth: 9, floors: 1, floorHeight: 3.2, foundation: 0.6, foundationColor: "#8C8A84", roofType: "gable", ridge: "width", roofPitch: 40, overhang: 0.5,
      roofMaterial: "tiles", roofColor: "#2F2F2F", chimney: false, gutters: true, downpipes: 2, ventilators: 2,
      winFront: 6, winBack: 6, winLeft: 1, winRight: 0, winW: 0.8, winH: 0.6, sill: 1.5,
      doorWall: "left", doorPos: 0, doorW: 2.4, doorH: 2.6, doorColor: "#5B1E16", entrance: "none",
      modPrice: 45000, modUpkeep: 120}},
    {id: "fahus", name: "Fähus", blurb: "8 × 6 m small cowshed for 6 cows, red boards and a red tile roof.", settings: {
      cows: 6, pastureWall: "back", fenceDepth: 14, ...swedishRed, wallColor: "#7A2418",
      width: 8, depth: 6, floors: 1, floorHeight: 2.6, foundation: 0.4, foundationColor: "#8C8A84", roofType: "gable", ridge: "width", roofPitch: 30, overhang: 0.4,
      roofMaterial: "tiles", roofColor: "#7A2E1F", chimney: false, gutters: false, downpipes: 0, ventilators: 0,
      winFront: 2, winBack: 0, winLeft: 1, winRight: 1, winW: 0.7, winH: 0.5, sill: 1.4,
      doorWall: "front", doorPos: -0.5, doorW: 1.2, doorH: 2.1, doorColor: "#F2EFE8", entrance: "none", doorStyle: "zbrace",
      modPrice: 15000, modUpkeep: 40}},
    {id: "losdriftsstall", name: "Lösdriftsstall", blurb: "30 × 16 m modern loose-housing barn for 70 cows, a low metal roof and lanterns along the ridge.", settings: {
      cows: 70, pastureWall: "front", fenceDepth: 30,
      wallCladding: "lockpanel", wallColor: "#A8A398", trimColor: "#3B3F42",
      width: 30, depth: 16, floors: 1, floorHeight: 3.6, foundation: 0.3, foundationColor: "#8C8A84", roofType: "gable", ridge: "width", roofPitch: 15, overhang: 0.5,
      roofMaterial: "metal", roofColor: "#4A4F52", chimney: false, gutters: true, downpipes: 2, ventilators: 4,
      winFront: 8, winBack: 8, winLeft: 0, winRight: 0, winW: 1.4, winH: 0.6, sill: 1.5,
      doorWall: "right", doorPos: 0, doorW: 2.5, doorH: 2.6, doorColor: "#3B3F42", entrance: "none", doorStyle: "sliding", winStyle: "single",
      modPrice: 140000, modUpkeep: 300}},
  ],
};
