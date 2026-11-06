// Game objects: what the game needs around a building (where you sleep, tip feed, drop bales, load
// animals, collect egg pallets, see the info box) and the pasture's fence, as objects in a list
// (p.objects) that the player adds, drags and sizes. Each kind of building says which it can have,
// which it must have, and where they go to start with (kind.objects). Pure; no DOM.
//
// A box object: {id, type, x, z (its middle on the ground), w (along x), d (along z), h, ix, iz (its icon,
// from the middle)}. The pasture: {id, type: "pasture", wall, a (m from the wall's start), b (m from its
// end: 0 is the far corner, so a pasture snapped to the corners stays there when the building changes
// size; less than 0 runs past the corner), depth (m out from the wall)}.
import { wallsOf, liveWings } from "./layout.mjs";
/** The building's own four walls (a pasture goes on one of them). */
const WALLS = ["front", "back", "left", "right"];

export const OBJECT_TYPES = {
  sleep: {name: "Sleep point", glyph: "sleep", icon: true, size: [1.8, 1.8, 2.2],
    hint: "Walk into the box to get the option to sleep; the bed icon floats over it. With a sleep point the house is a farmhouse in the game."},
  food: {name: "Feed pad", glyph: "food", icon: true, size: [4, 3, 0.3],
    hint: "Tip feed onto it from a trailer, shovel, auger or mixer. Low on the ground; its icon shows in the game."},
  bales: {name: "Bale drop", glyph: "bales", icon: true, size: [4, 3, 2.5],
    hint: "Drop bales here; the game unpacks them into the feed."},
  loading: {name: "Animal trailer spot", glyph: "animals", icon: true, size: [4, 4, 3],
    hint: "Where a livestock trailer loads and unloads the animals. The map's teleport point is 3 m further out from the building."},
  pallets: {name: "Egg pallets", glyph: "pallet", icon: false, size: [4, 3.2, 2.5],
    hint: "Where egg pallets appear (two rows inside it), with warning stripes in its corners."},
  feedTrough: {name: "Feed trough", glyph: null, icon: false, size: [3, 0.7, 0.75],
    hint: "Where the animals eat. Put it where they can get to it, inside the fence (against the barn wall or free in the pasture); the long side is where they stand, and the height is the top edge. The feed pad fills it."},
  waterTrough: {name: "Water trough", glyph: null, icon: false, size: [2, 0.7, 0.7],
    hint: "Where the animals drink (the water is automatic). Put it inside the fence, where they can get to it; the long side is where they stand."},
  info: {name: "Info area", glyph: null, icon: false, size: [10, 10, 3],
    hint: "Standing in it shows the building's info box. It usually goes round the whole building."},
  pasture: {name: "Pasture (fence)", glyph: null, icon: false,
    hint: "The fence, out from one wall. Its ends snap to the building's corners; the animals' way out is in the middle of the wall it encloses. In the game you can still drag the fence to any shape when placing the building."},
};
/** What the kind calls a type of object, and its hint (a sheep barn's pallets are wool): OBJECT_TYPES overridden by kind.objects.labels. */
export const objectInfo = (kind, type) => ({...OBJECT_TYPES[type], ...((kind.objects && kind.objects.labels && kind.objects.labels[type]) || {})});
/** Ranges: positions and sizes of box objects, icons, and a pasture's ends along its wall. */
export const OBJECT_LIMITS = {x: [-80, 80], z: [-80, 80], w: [0.5, 70], d: [0.5, 70], h: [0.2, 8], ix: [-10, 10], iz: [-10, 10], end: [-40, 40]};
/** The opening to the pasture: width and height ranges, and what it is to start with. */
export const GAP_LIMITS = {w: [0.8, 10], h: [1.2, 8]};
export const GAP_DEFAULT = {w: 1.6, h: 2.2};
export const TROUGH_KINDS = ["cow", "sheep"];
const GRID = 0.25, CORNER_SNAP = 0.6;

const num = (v, d) => { v = +v; return Number.isFinite(v) ? v : d; };
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));
const round = v => +v.toFixed(3);
const snap = v => Math.round(v / GRID) * GRID;

/** The kind's objects spec, or one with nothing. */
const specOf = kind => kind.objects || {types: [], required: [], defaults: () => []};

/**
 * The objects as the building can have them: known types its kind takes, one of each, numbers in range;
 * any it must have and doesn't get the kind's default. p: the building's settings (for its walls).
 */
export function cleanObjects(list, kind, p) {
  const spec = specOf(kind), out = [], seen = new Set();
  let id = 0;
  for (const o of Array.isArray(list) ? list : []) {
    if (!o || !spec.types.includes(o.type) || seen.has(o.type)) continue;
    const c = o.type === "pasture" ? cleanPasture(o, spec.pasture, p) : cleanBox(o);
    if (!c) continue;
    seen.add(o.type); out.push({id: ++id, ...c});
  }
  const missing = spec.required.filter(t => !seen.has(t));
  if (missing.length) {
    const defs = spec.defaults(p);
    for (const t of missing) { const d = defs.find(x => x.type === t); if (d) out.push({...(t === "pasture" ? cleanPasture(d, spec.pasture, p) : cleanBox(d)), id: ++id}); }
  }
  return out;
}
function cleanBox(o) {
  const def = OBJECT_TYPES[o.type].size, L = OBJECT_LIMITS;
  return {type: o.type, x: round(clamp(num(o.x, 0), L.x)), z: round(clamp(num(o.z, 0), L.z)),
    w: round(clamp(num(o.w, def[0]), L.w)), d: round(clamp(num(o.d, def[1]), L.d)), h: round(clamp(num(o.h, def[2]), L.h)),
    ix: round(clamp(num(o.ix, 0), L.ix)), iz: round(clamp(num(o.iz, 0), L.iz))};
}
/** A pasture on a wall of the building, at least minWidth wide (spread evenly past the ends if need be). */
function cleanPasture(o, ps = {minWidth: 0, depth: [2, 60]}, p) {
  const walls = wallsOf(p), wall = walls[o.wall] && WALLS.includes(o.wall) ? o.wall : "back", L = walls[wall].L;
  let a = clamp(num(o.a, 0), OBJECT_LIMITS.end), b = clamp(num(o.b, 0), OBJECT_LIMITS.end);
  if (a > L - b - 1) { const m = (a + L - b) / 2; a = m - 0.5; b = L - m - 0.5; }
  const short = ps.minWidth - (L - a - b);
  if (short > 0) { a -= short / 2; b -= short / 2; }
  // a fence drawn by hand: its posts [[x, z] ...] from where it starts to where it stops (the wall, a and b then only say where the animals go out)
  const pts = Array.isArray(o.points) ? o.points.filter(q => Array.isArray(q) && Number.isFinite(+q[0]) && Number.isFinite(+q[1]) && q[0] !== null && q[1] !== null).slice(0, MAX_FENCE_POINTS)
    .map(q => [round(clamp(+q[0], OBJECT_LIMITS.x)), round(clamp(+q[1], OBJECT_LIMITS.z))]) : [];
  // the opening to the pasture (a doorway or hatch): where along the wall (its middle) and how big; left out until the player sets it
  const has = v => v !== undefined && v !== null && v !== "" && Number.isFinite(+v);
  const gw = has(o.gapW) ? clamp(+o.gapW, GAP_LIMITS.w) : null, half = (gw ?? GAP_DEFAULT.w) / 2;
  const gapAt = has(o.gapAt) ? clamp(+o.gapAt, [half, Math.max(half, L - half)]) : null;
  return {type: "pasture", wall, a: round(a), b: round(b), depth: round(clamp(num(o.depth, ps.depth[0]), ps.depth)),
    ...(gapAt !== null ? {gapAt: round(gapAt)} : {}), ...(gw !== null ? {gapW: round(gw)} : {}), ...(has(o.gapH) ? {gapH: round(clamp(+o.gapH, GAP_LIMITS.h))} : {}),
    ...(o.noGap ? {noGap: true} : {}), ...(pts.length >= 2 ? {points: pts} : {})};
}

/** The building's object of a type, or null. */
export const objectOf = (p, type) => (p.objects || []).find(o => o.type === type) || null;
/** A box object as a world-axis box {center, size}, standing on the ground. */
export const boxOf = o => ({center: [o.x, o.h / 2, o.z], size: [o.w, o.h, o.d]});
/** Where a box object's icon is, on the ground. */
export const iconOf = o => [o.x + o.ix, 0, o.z + o.iz];
/** A box from a world-axis box {center, size} and an icon point (as the kinds place them to start with). */
export function boxFrom(type, box, icon = null) {
  const [x, , z] = box.center, [w, h, d] = box.size;
  return {type, x, z, w, d, h, ix: icon ? icon[0] - x : 0, iz: icon ? icon[2] - z : 0};
}

/**
 * The pasture in the building: its wall's frame w, the stretch of the wall it encloses [ea, eb] and its
 * middle (where the animals go out), and the fence posts from one end round to the other (the base
 * game's winding: when it runs past a corner, back along the wall's line to the building). A pasture with points is a fence the player drew:
 * those posts in that order (its wall, a and b still say where the animals go out).
 */
export function pastureOf(p, o = objectOf(p, "pasture")) {
  if (!o) return null;
  const w = wallsOf(p)[o.wall];
  if (!w) return null;
  const L = w.L, s0 = o.a, s1 = L - o.b, post = 0.15, d = o.depth;
  const at = (s, dd) => [w.o[0] + w.u[0] * s + w.n[0] * dd, 0, w.o[2] + w.u[2] * s + w.n[2] * dd];
  const free = Array.isArray(o.points) && o.points.length >= 2;
  let fence = [];
  if (free) fence = o.points.map(([x, z]) => [x, 0, z]);
  else {
    if (s1 > L + 1e-6) fence.push(at(L, post));
    fence.push(at(s1, post), at(s1, d), at(s0, d), at(s0, post));
    if (s0 < -1e-6) fence.push(at(0, post));
  }
  const ea = Math.max(0, s0), eb = Math.min(L, s1);
  const pts = [at(s0, 0), at(s1, d), ...fence];
  const rect = {x0: Math.min(...pts.map(q => q[0])), x1: Math.max(...pts.map(q => q[0])), z0: Math.min(...pts.map(q => q[2])), z1: Math.max(...pts.map(q => q[2]))};
  const gapW = o.gapW ?? GAP_DEFAULT.w, gapH = o.gapH ?? GAP_DEFAULT.h, mid = o.gapAt ?? (ea + eb) / 2;
  return {wall: o.wall, w, L, s0, s1, ea, eb, mid, gapW, gapH, noGap: !!o.noGap, depth: d, fence, rect, at, free};
}

/** Box objects snap to a 25 cm grid and are kept out of the building (pushed out the shortest way). */
export function snapBox(o, p) {
  let x = snap(o.x), z = snap(o.z);
  if (o.type !== "info") for (const r of footprints(p)) {
    const hx = o.w / 2, hz = o.d / 2;
    if (x + hx <= r.x0 || x - hx >= r.x1 || z + hz <= r.z0 || z - hz >= r.z1) continue;
    const moves = [[r.x0 - hx - x, 0], [r.x1 + hx - x, 0], [0, r.z0 - hz - z], [0, r.z1 + hz - z]];
    const [mx, mz] = moves.reduce((m, v) => Math.hypot(...v) < Math.hypot(...m) ? v : m);
    x += mx; z += mz;
  }
  return {...o, x: round(x), z: round(z)};
}
/** Most posts of a fence drawn by hand. */
export const MAX_FENCE_POINTS = 40;
/** The fence as it is now, as posts [[x, z] ...] to start drawing it by hand from. */
export const fencePoints = p => { const pa = pastureOf(p); return pa ? pa.fence.map(q => [round(q[0]), round(q[2])]) : []; };
/**
 * Where a fence post dragged to q = [x, z] goes: a corner of the building within 80 cm (a fence starts and stops at a corner), else onto the line of
 * a wall within 40 cm, else the 25 cm grid; never inside the building.
 */
export function snapFencePoint(p, q) {
  const rects = footprints(p);
  let best = null;
  for (const r of rects) for (const c of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]]) {
    const dd = Math.hypot(c[0] - q[0], c[1] - q[1]);
    if (dd < 0.8 && (!best || dd < best.dd)) best = {dd, at: c};
  }
  if (best) return [round(best.at[0]), round(best.at[1])];
  let x = snap(q[0]), z = snap(q[1]);
  for (const r of rects) {
    // onto a wall's line, along it
    if (q[0] > r.x0 - 0.4 && q[0] < r.x1 + 0.4) { if (Math.abs(q[1] - r.z0) < 0.4) z = r.z0; else if (Math.abs(q[1] - r.z1) < 0.4) z = r.z1; }
    if (q[1] > r.z0 - 0.4 && q[1] < r.z1 + 0.4) { if (Math.abs(q[0] - r.x0) < 0.4) x = r.x0; else if (Math.abs(q[0] - r.x1) < 0.4) x = r.x1; }
  }
  // not inside the building: out through the nearest side
  for (const r of rects) if (x > r.x0 + 1e-6 && x < r.x1 - 1e-6 && z > r.z0 + 1e-6 && z < r.z1 - 1e-6) {
    const moves = [[r.x0 - x, 0], [r.x1 - x, 0], [0, r.z0 - z], [0, r.z1 - z]], [mx, mz] = moves.reduce((m, v) => Math.hypot(...v) < Math.hypot(...m) ? v : m);
    x += mx; z += mz;
  }
  return [round(x), round(z)];
}
/** A pasture's ends snap to the wall's corners (within 60 cm), else to the grid; it keeps its minimum width. */
export function snapPasture(o, kind, p) {
  const L = (wallsOf(p)[o.wall] || {L: 0}).L, end = v => Math.abs(v) < CORNER_SNAP ? 0 : snap(v);
  return {...cleanPasture({...o, a: end(o.a), b: end(o.b), depth: snap(o.depth), points: o.points}, specOf(kind).pasture, p), id: o.id};
}

/** The building's footprints on the ground: its rectangle and its wing's. */
export function footprints(p) {
  const out = [{x0: -p.width / 2, x1: p.width / 2, z0: -p.depth / 2, z1: p.depth / 2}];
  for (const w of liveWings(p)) out.push(w.rect);
  return out;
}

const overlap = (a, b, m = 0) => a.x0 < b.x1 - m && b.x0 < a.x1 - m && a.z0 < b.z1 - m && b.z0 < a.z1 - m;
const rectOf = o => ({x0: o.x - o.w / 2, x1: o.x + o.w / 2, z0: o.z - o.d / 2, z1: o.z + o.d / 2});

/**
 * What's wrong with the objects, to show the player: Map id -> message. A box in the building or in
 * the pasture, boxes on top of each other (the info area goes round things, so it's left out), a door
 * on the stretch of wall the pasture encloses.
 */
export function objectProblems(p) {
  const out = new Map(), boxes = (p.objects || []).filter(o => o.type !== "pasture" && o.type !== "info"), past = pastureOf(p);
  for (const o of boxes) {
    const r = rectOf(o), trough = o.type === "feedTrough" || o.type === "waterTrough";
    if (footprints(p).some(f => overlap(r, f, 0.01))) out.set(o.id, "It’s in the building");
    else if (trough) { if (past && !insidePoly(past.fence, o.x, o.z)) out.set(o.id, "The animals can’t reach it: put it inside the fence"); }
    else if (past && overlap(r, past.rect, 0.01)) out.set(o.id, "It’s in the pasture, behind the fence");
    // (the bale drop may lie over the feed pad, as it does to start with: one is solid, the other a trigger)
    else { const pair = q => [o.type, q.type].sort().join() === "bales,food", other = boxes.find(q => q !== o && !pair(q) && overlap(r, rectOf(q), 0.01)); if (other) out.set(o.id, `It’s on top of the ${OBJECT_TYPES[other.type].name.toLowerCase()}`); }
  }
  if (past) {
    const po = objectOf(p, "pasture"), L = past.L;
    const door = (p.windows || []).find(w => w.type === "door" && w.floor === 0 && w.wall === past.wall && w.pos * L > past.ea && w.pos * L < past.eb);
    if (door) out.set(po.id, "A door opens into the pasture: move the door or the pasture");
    else if (liveWings(p).some(w => overlap(w.rect, past.rect, 0.01))) out.set(po.id, "A wing stands in the pasture: move the wing or the pasture");
  }
  return out;
}

/** Is the point inside the polygon of posts [[x, y, z] ...] (seen from above)? */
export function insidePoly(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, , zi] = poly[i], [xj, , zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
}
/** What the building lacks, for the player to read (no ids to hang it on): a kind with troughs that has none of one. */
export function objectWarnings(p) {
  const out = [];
  if (!TROUGH_KINDS.includes(p.kind)) return out;
  for (const t of ["feedTrough", "waterTrough"]) if (!objectOf(p, t))
    out.push(t === "feedTrough" ? "No feed trough: the animals have nothing to eat from. Add one under Game objects." : "No water trough: the animals have nothing to drink from. Add one under Game objects.");
  return out;
}
