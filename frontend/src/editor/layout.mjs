// Laying out a walk-in building's inside: the room, placed pieces (items), snapping and checks.
// Pure functions with no DOM, shared by the export, the editor and every kind's catalog.
//
// An item is {id, type, x, z, rot, ...its settings}: the centre of its footprint on the floor, in
// the building's own coordinates (metres, origin in the middle, +z out of the front wall), and a
// quarter turn rot (0, 90, 180, 270) about +y. In the item's own frame +x runs along it and +z is
// its front; a wall item's back (-z) goes against the wall.
//
// A catalog maps a type to its definition:
//   {name, mount: "wall" | "floor", params: [{k, label, min, max, step}], defaults,
//    size(item) -> [width along x, depth along z], height(item), build(c, item), collision}

/** Wall thickness of a walk-in building (the window and door reveals' depth). */
export const WALL_T = 0.15;
/** Snapping grid, metres. */
export const GRID = 0.25;
/** How far into the room the doorway is kept clear. */
const DOOR_CLEAR = 1.2;
const MAX_ITEMS = 200;

/** Each wall: o = its start corner at floor height F, u = along it, n = out of the building, L = length. */
export function wallFrames(W, D, F) {
  return {
    front: {o: [-W/2, F, D/2], u: [1, 0, 0], n: [0, 0, 1], L: W},
    back: {o: [W/2, F, -D/2], u: [-1, 0, 0], n: [0, 0, -1], L: W},
    right: {o: [W/2, F, D/2], u: [0, 0, -1], n: [1, 0, 0], L: D},
    left: {o: [-W/2, F, -D/2], u: [0, 0, 1], n: [-1, 0, 0], L: D},
  };
}

/** Most wings a house can have. */
export const MAX_WINGS = 4;
/** A wing's walls in the window list: "w1End" (its far end), "w1Left", "w1Right" (its sides, as you face its end). */
export const wingWallKey = (id, part) => `w${id}${part}`;
export const WING_PARTS = ["End", "Left", "Right"];
export const WING_WALLS = Array.from({length: MAX_WINGS}, (_, i) => WING_PARTS.map(s => wingWallKey(i + 1, s))).flat();
/** The wing a wall key belongs to (its id), or 0 for the house's own four walls. */
export const wingIdOf = key => { const m = /^w(\d+)(End|Left|Right)$/.exec(key || ""); return m ? +m[1] : 0; };
/** The roof's thickness (the model's too): a gable-end wing's roof stays under the house's gable overhang. */
const ROOF_T = 0.16;
/** A wing's own number of floors: the house's, or fewer (a lower wing). */
export const wingFloors = (P, w) => Math.max(1, Math.min(P.floors, Math.round(+w.floors || P.floors)));
/** A wing's wall height (the house's own floors' and knee wall when it is as tall as the house). */
/** Whether a wing has a half floor in its roof (1½-plan): its own setting, or the house's when it follows the house (floors 0). */
export const wingHalf = (P, w) => !!(+w.floors ? w.half : P.halfStorey);
/** A wing's roof pitch in degrees: its own (5 to 60), or the house's when 0. */
export const wingPitch = (P, w) => +w.pitch > 0 ? Math.min(60, Math.max(5, +w.pitch)) : P.roofPitch;
/** A wing's wall height: its floors, and the knee wall when it has a half floor. */
export const wingHeight = (P, w) => wingFloors(P, w) * P.floorHeight + (wingHalf(P, w) ? P.kneeWall : 0);
/**
 * The house's wings (P.wings: {id, wall, pos, width, depth, floors}), each as {id, ...} or {id, off: why}.
 * A wing that fits has: type, wall, s0, s1 (along that wall), sc, ww (width), wd (length out), floors,
 * half (1½-plan), pitch, tanW (its own roof pitch), H (wall height), frames {w1End, w1Left, w1Right}, rect {x0, x1, z0, z1}, at(s, d).
 * type: "valley" on a wall along the ridge when its roof reaches the house's slope (it meets it in a valley),
 * "eave" when it is lower than that (its roof runs up to the wall under the eaves), "gable" on a gable end
 * (a lower annex under the gable), "flat" under a flat roof. A wing has the house's roof pitch and overhang,
 * so the eaves line up; it is made narrower and moved along its wall when it has to be to fit. One that
 * overlaps an earlier wing, or can't be built, is {id, off: why}.
 */
export function wingsOf(P) {
  if (!P || !Array.isArray(P.wings)) return [];
  const W = P.width, D = P.depth, F = P.foundation, main = wallFrames(W, D, F), out = [];
  const ridgeX = P.roofType === "hip" ? W >= D : P.ridge === "width";
  const tanP = Math.tan(P.roofPitch * Math.PI / 180), o = P.overhang, Lr = ridgeX ? W : D, span = ridgeX ? D : W;
  const top = F + P.floors * P.floorHeight + (P.halfStorey ? P.kneeWall : 0), eaveY = top - o * tanP;
  for (const w of P.wings.slice(0, MAX_WINGS)) {
    const key = main[w.wall] ? w.wall : "back", m = main[key], floors = wingFloors(P, w), Hw = wingHeight(P, w), topW = F + Hw;
    const pitch = wingPitch(P, w), tanW = Math.tan(pitch * Math.PI / 180);
    const alongRidge = (Math.abs(m.u[0]) > 0.5) === ridgeX;
    let type, half, maxW = Infinity;
    if (P.roofType === "flat") { type = "flat"; half = m.L / 2; }
    else if (alongRidge) {
      half = (P.roofType === "hip" ? Lr / 2 + o : Lr / 2 + Math.min(o, 0.5)) - o;
      // as wide as it is, its ridge is at topW + ww/2 tan: at the house's eaves or above it meets the slope (valley);
      // a lower wing runs up to the wall under the eaves, and stays under their overhang
      const wMin = 2 * (eaveY - topW) / tanW, wEave = 2 * (eaveY - ROOF_T - 0.1 - topW) / tanW;
      if (w.width < wMin) { type = "eave"; maxW = wEave; } else { type = "valley"; maxW = span; }
    } else if (P.roofType === "gable") {
      type = "gable";
      half = span / 2 - ROOF_T / tanP - 0.05;
    } else { out.push({id: w.id, off: "On a hip roof a wing goes on a long side, under the eaves."}); continue; }
    half = Math.min(half, m.L / 2);
    const ww = Math.min(w.width, 2 * half, maxW);
    if (ww < 2) { out.push({id: w.id, off: "There isn't room for a wing like that on that wall: make the house bigger, the wing lower or the overhang smaller."}); continue; }
    const cmax = half - ww / 2, c = Math.min(cmax, Math.max(-cmax, (w.pos - 0.5) * m.L));
    const sc = m.L / 2 + c, s0 = sc - ww / 2, s1 = sc + ww / 2, wd = w.depth;
    const at = (s, d) => [m.o[0] + m.u[0] * s + m.n[0] * d, F, m.o[2] + m.u[2] * s + m.n[2] * d];
    const neg = v => v.map(x => -x + 0), id = w.id;
    const frames = {
      [wingWallKey(id, "End")]: {o: at(s0, wd), u: m.u, n: m.n, L: ww},
      [wingWallKey(id, "Left")]: {o: at(s0, 0), u: m.n, n: neg(m.u), L: wd},
      [wingWallKey(id, "Right")]: {o: at(s1, wd), u: neg(m.n), n: m.u, L: wd},
    };
    const a = at(s0, 0), b = at(s1, wd);
    const rect = {x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[2], b[2]), z1: Math.max(a[2], b[2])};
    // one that overlaps an earlier wing, eaves and all (two on one wall too close, or two meeting at a corner), isn't built
    const g = o - 0.05, clash = out.find(q => q.rect && q.rect.x0 - o < rect.x1 + g && rect.x0 - o < q.rect.x1 + g && q.rect.z0 - o < rect.z1 + g && rect.z0 - o < q.rect.z1 + g);
    if (clash) { out.push({id, off: "It is too close to another wing (their eaves would touch): move it along the wall or onto another wall."}); continue; }
    out.push({id, type, wall: key, s0, s1, sc, ww, wd, floors, half: wingHalf(P, w), pitch, tanW, H: Hw, frames, rect, at});
  }
  return out;
}
/** The wings that fit (not {off}). */
export const liveWings = P => wingsOf(P).filter(w => w.frames);
/** Every wall of the building by key: the four, and each wing's three. */
export function wallsOf(P) {
  return Object.assign(wallFrames(P.width, P.depth, P.foundation), ...liveWings(P).map(w => w.frames));
}

/** Where an entry of the window list (a window, or a door made from one) is along its wall (length L): [s0, s1]. */
export function openingSpan(win, L) {
  const ww = Math.min(win.w, L - 0.4), c = Math.min(L - ww/2 - 0.2, Math.max(ww/2 + 0.2, win.pos * L));
  return [c - ww/2, c + ww/2];
}
/** The building's doors: the window list's ground-floor doors, in order. */
export const doorsOf = p => (p.windows || []).filter(w => w.type === "door" && w.floor === 0);

/**
 * The room inside a walk-in building: the main part's floor inside its walls {x0, x1, z0, z1}, floor height F,
 * wall height H, the first door's keep-out rectangle (door), every keep-out as keepOut [{rect, what}], and:
 *   rects: the floor of every part (the main part first, then each wing: abutting rectangles, so the room is
 *          their union; the wing's walls open into the house through a passage)
 *   walls: the inside face of every stretch of wall round the room (a wall where a wing opens is in two
 *          pieces), {name, x0, x1, z0, z1 (the line), into: [x, z] (towards the room), rot (of an item facing
 *          into the room)}. name: the house's side ("front" ...), or the wing's wall ("w1Left" ...).
 * openings: other openings to keep clear inside, [{wall, s0, s1, clear, what}] (a hen hatch ...).
 */
export function roomOf(p, openings = []) {
  const W = p.width, D = p.depth, F = p.foundation, t = WALL_T;
  const H = p.floors * p.floorHeight + (p.halfStorey ? p.kneeWall : 0);
  const x0 = -W/2 + t, x1 = W/2 - t, z0 = -D/2 + t, z1 = D/2 - t;
  const frames = wallsOf(p), main = wallFrames(W, D, F);
  // A keep-out: the opening's width plus 30 cm each side, from the wall `clear` into the room.
  const keep = (wall, s0, s1, clear) => {
    const w = frames[wall], at = (s, d) => [w.o[0] + w.u[0] * s + w.n[0] * d, w.o[2] + w.u[2] * s + w.n[2] * d];
    const a = at(s0 - 0.3, -t), b = at(s1 + 0.3, -t - clear);
    return {x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1])};
  };
  // every door that opens is kept clear inside (one that stays shut needn't be)
  const doors = doorsOf(p).filter(w => w.opens !== false && frames[w.wall]).map(w => ({rect: keep(w.wall, ...openingSpan(w, frames[w.wall].L), DOOR_CLEAR), what: "a door"}));
  const door = doors.length ? doors[0].rect : null;
  const keepOut = [...doors, ...openings.map(o => ({rect: keep(o.wall, o.s0, o.s1, o.clear), what: o.what}))];
  // the floors: the main part's, and each wing's from the main wall's inside face to its far wall's inside face
  const rects = [{x0, x1, z0, z1}], names = [{back: "back", front: "front", left: "left", right: "right"}];
  for (const w of liveWings(p)) {
    const m = main[w.wall], at = (s, d) => [m.o[0] + m.u[0] * s + m.n[0] * d, m.o[2] + m.u[2] * s + m.n[2] * d];
    const a = at(w.s0 + t, -t), b = at(w.s1 - t, w.wd - t);
    rects.push({x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1])});
    // an edge's outward direction says which of the wing's walls it is
    const key = part => wingWallKey(w.id, part), n = part => w.frames[key(part)].n;
    const dir = {back: [0, -1], front: [0, 1], left: [-1, 0], right: [1, 0]}, nm = {};
    for (const side in dir) for (const part of WING_PARTS) if (Math.abs(n(part)[0] - dir[side][0]) < 1e-6 && Math.abs(n(part)[2] - dir[side][1]) < 1e-6) nm[side] = key(part);
    names.push(nm);
  }
  return {x0, x1, z0, z1, F, H, door, keepOut, rects, walls: wallSegments(rects, names)};
}

const EPS = 1e-6;
/** The stretches of the rectangles' edges that are walls (not shared with another rectangle): see roomOf. */
function wallSegments(rects, names) {
  const edges = [
    {side: "back", line: r => r.z0, span: r => [r.x0, r.x1], across: r => r.z1, horiz: true, into: [0, 1], rot: 0},
    {side: "front", line: r => r.z1, span: r => [r.x0, r.x1], across: r => r.z0, horiz: true, into: [0, -1], rot: 180},
    {side: "left", line: r => r.x0, span: r => [r.z0, r.z1], across: r => r.x1, horiz: false, into: [1, 0], rot: 90},
    {side: "right", line: r => r.x1, span: r => [r.z0, r.z1], across: r => r.x0, horiz: false, into: [-1, 0], rot: 270},
  ];
  const opposite = {back: "front", front: "back", left: "right", right: "left"}, out = [];
  rects.forEach((r, i) => {
    for (const e of edges) {
      let pieces = [e.span(r)];
      // a rectangle abutting on the other side of this edge covers that stretch
      const other = edges.find(x => x.side === opposite[e.side]);
      rects.forEach((q, j) => {
        if (j === i || Math.abs(other.line(q) - e.line(r)) > EPS) return;
        const [a, b] = other.span(q);
        pieces = pieces.flatMap(([u, v]) => [[u, Math.min(v, a)], [Math.max(u, b), v]]).filter(([u, v]) => v - u > EPS);
      });
      for (const [u, v] of pieces) {
        if (v - u < 0.05) continue;
        const c = e.line(r);
        out.push({name: names[i][e.side], ...(e.horiz ? {x0: u, x1: v, z0: c, z1: c} : {x0: c, x1: c, z0: u, z1: v}), into: e.into, rot: e.rot});
      }
    }
  });
  return out;
}

/** Whether the rectangle f is inside the room (all of it, within the union of its floors). */
export function inRoom(room, f, eps = 1e-6) {
  const rs = room.rects || [room];
  if (rs.length === 1) return f.x0 >= rs[0].x0 - eps && f.x1 <= rs[0].x1 + eps && f.z0 >= rs[0].z0 - eps && f.z1 <= rs[0].z1 + eps;
  const cuts = (lo, hi, key) => [lo, hi, ...rs.flatMap(r => key(r))].filter(v => v >= lo && v <= hi).sort((a, b) => a - b);
  const xs = cuts(f.x0, f.x1, r => [r.x0, r.x1]), zs = cuts(f.z0, f.z1, r => [r.z0, r.z1]);
  for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < zs.length; j++) {
    if (xs[i + 1] - xs[i] < eps || zs[j + 1] - zs[j] < eps) continue;
    const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
    if (!rs.some(r => cx >= r.x0 && cx <= r.x1 && cz >= r.z0 && cz <= r.z1)) return false;
  }
  return true;
}
/** The rectangle round all of the room's floors. */
export const roomBox = room => { const rs = room.rects || [room]; return {x0: Math.min(...rs.map(r => r.x0)), x1: Math.max(...rs.map(r => r.x1)), z0: Math.min(...rs.map(r => r.z0)), z1: Math.max(...rs.map(r => r.z1))}; };

const R = rot => rot * Math.PI / 180;
/** The world (x, z) of the point (lx, lz) in the item's own frame. */
export function toWorld(item, lx, lz) {
  const r = R(item.rot), c = Math.cos(r), s = Math.sin(r);
  return [item.x + lx * c + lz * s, item.z - lx * s + lz * c];
}

/** The rectangle an item covers on the floor. */
export function footprint(item, def) {
  const [w, d] = def.size(item);
  // (a quarter turn exactly; any other angle: the box round the turned rectangle)
  const quarter = item.rot % 90 === 0, turned = item.rot % 180 !== 0, c = Math.abs(Math.cos(R(item.rot))), s = Math.abs(Math.sin(R(item.rot)));
  const hx = (quarter ? (turned ? d : w) : w * c + d * s) / 2, hz = (quarter ? (turned ? w : d) : w * s + d * c) / 2;
  return {x0: item.x - hx, x1: item.x + hx, z0: item.z - hz, z1: item.z + hz};
}

const snap = v => Math.round(v / GRID) * GRID + 0; // (+ 0 turns -0 into 0)
const clamp = (v, lo, hi) => lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));
/**
 * Where an item ends up when dropped. Every piece is free to stand anywhere in the room (kept inside it, on the grid);
 * a wall piece (a counter, a bed, a wardrobe) that is put within WALL_REACH of a wall, or an inner wall's face, is drawn
 * up against it, facing away from it. `fine` (the position sliders, turning) = to the centimetre, no drawing to walls;
 * `toWall` (a new piece) = a wall piece always goes to the nearest wall.
 */
const WALL_REACH = 0.4;
export function snapItem(item, def, room, others = [], catalog = {}, fine = false, toWall = false) {
  const sn = fine ? v => +v.toFixed(2) + 0 : snap;   // (fine: to the centimetre, for the position sliders)
  const [w, d] = def.size(item);
  if (def.mount === "wall" && !fine) {
    // the nearest stretch of wall (its distance from the point to the stretch, not to its line)
    const dist = wl => Math.hypot(Math.max(wl.x0 - item.x, 0, item.x - wl.x1), Math.max(wl.z0 - item.z, 0, item.z - wl.z1));
    // an inner wall's face wins when the piece is put near it (its middle within the piece's half depth and INNER_NEAR of the
    // face), even if a room wall is nearer; else the nearest room wall, as ever
    const nearest = list => list.reduce((best, x) => dist(x) < dist(best) ? x : best);
    const inner = innerFaces(room, others, catalog).filter(f => dist(f) < INNER_NEAR + d / 2);
    const wl = nearest(inner.length ? inner : room.walls);
    if (toWall || dist(wl) <= d / 2 + WALL_REACH) {
      if (wl.x0 === wl.x1) {
        const z = clamp(sn(item.z), wl.z0 + w/2, wl.z1 - w/2);
        return {...item, rot: wl.rot, x: wl.x0 + wl.into[0] * d/2, z};
      }
      const x = clamp(sn(item.x), wl.x0 + w/2, wl.x1 - w/2);
      return {...item, rot: wl.rot, x, z: wl.z0 + wl.into[1] * d/2};
    }
  }
  // a floor piece, kept in the part of the room nearest to it
  const f = footprint({...item, x: 0, z: 0}, def), at = r => ({...item, x: clamp(sn(item.x), r.x0 - f.x0, r.x1 - f.x1), z: clamp(sn(item.z), r.z0 - f.z0, r.z1 - f.z1)});
  // where it is put if that is inside the room (it may straddle two parts), else the nearest spot in each part
  const bx = roomBox(room), here = {...item, x: clamp(sn(item.x), bx.x0 - f.x0, bx.x1 - f.x1), z: clamp(sn(item.z), bx.z0 - f.z0, bx.z1 - f.z1)};
  const tries = [here, ...(room.rects || [room]).map(at)], fits = tries.filter(q => inRoom(room, footprint(q, def)));
  if (def.snapWalls && !inRoom(room, footprint(here, def))) {
    // too long for the part it is put in: as long as that part is there (a wall into a wing narrower than it)
    const r = (room.rects || [room]).find(r => item.x >= r.x0 && item.x <= r.x1 && item.z >= r.z0 && item.z <= r.z1), len = def.params.find(g => g.k === "length");
    const room1 = r && (item.rot % 180 === 0 ? r.x1 - r.x0 : r.z1 - r.z0), fit = r && Math.floor(room1 * 100) / 100;
    if (r && fit >= len.min && fit < item.length) return snapItem({...item, length: fit}, def, room, others, catalog);
  }
  const far = q => Math.hypot(q.x - item.x, q.z - item.z);
  const placed = (fits.length ? fits : tries).reduce((best, q) => far(q) < far(best) ? q : best);
  return def.snapWalls && !fine ? endsToWalls(placed, def, room, others, catalog) : placed;
}

/** The two faces of every inner wall (def.snapWalls, with def.runs: the solid stretches along it) as wall stretches like room.walls'. */
function innerFaces(room, others, catalog) {
  const out = [], rotOf = ([i, j]) => (room.walls.find(w => w.into[0] === i && w.into[1] === j) || {}).rot;
  for (const o of others) {
    const def = catalog[o.type];
    if (!def || !def.snapWalls || !def.runs) continue;
    const t = def.size(o)[1] / 2;
    for (const s of [-1, 1]) {
      const c = toWorld(o, 0, 0), n = toWorld(o, 0, s), into = [Math.round(n[0] - c[0]), Math.round(n[1] - c[1])], rot = rotOf(into);
      if (rot === undefined) continue;
      for (const [a, b] of def.runs(o)) {
        const p = toWorld(o, a, s * t), q = toWorld(o, b, s * t);
        out.push({name: "inner" + o.id, x0: Math.min(p[0], q[0]), x1: Math.max(p[0], q[0]), z0: Math.min(p[1], q[1]), z1: Math.max(p[1], q[1]), into, rot});
      }
    }
  }
  return out;
}

/** How near (m) beyond its half depth) a wall piece must be put to an inner wall's face to stand against it, and then it does, even if a room wall is nearer. */
const INNER_NEAR = 0.8;
/** How near (m) an end of an inner wall must come to a wall of the room to be drawn to it. */
const SNAP_END = 0.25;
/**
 * An inner wall (def.snapWalls) with its ends drawn to the walls of the room: an end within SNAP_END (a quarter metre) of a wall
 * that crosses its direction is moved up against it; with both ends near walls it is made exactly as long as
 * the room is there. Walls are those the wall's own line meets (a wing's too).
 */
function endsToWalls(it, def, room, others = [], catalog = {}) {
  const alongX = it.rot % 180 === 0, half = it.length / 2, c = alongX ? it.x : it.z, cross = alongX ? it.z : it.x;
  const lines = room.walls.filter(w => alongX ? w.x0 === w.x1 && cross >= w.z0 - 0.01 && cross <= w.z1 + 0.01 : w.z0 === w.z1 && cross >= w.x0 - 0.01 && cross <= w.x1 + 0.01)
    .map(w => alongX ? w.x0 : w.z0);
  // other inner walls across this one that its line meets: the end stops at the face turned towards it (a T-junction)
  for (const o of others) {
    if (o.id === it.id || !catalog[o.type] || !catalog[o.type].snapWalls || (o.rot % 180 === 0) === alongX) continue;
    const oc = alongX ? o.x : o.z, ocross = alongX ? o.z : o.x, oh = o.length / 2, t = catalog[o.type].size(o)[1] / 2;
    if (cross < ocross - oh - 0.01 || cross > ocross + oh + 0.01) continue;
    lines.push(oc <= c ? oc + t : oc - t);
  }
  const near = (v, side) => lines.filter(l => (side < 0 ? l <= c : l >= c) && Math.abs(l - v) < SNAP_END).sort((a, b) => Math.abs(a - v) - Math.abs(b - v))[0];
  const lo = near(c - half, -1), hi = near(c + half, 1), len = def.params.find(f => f.k === "length");
  let length = it.length, mid = c;
  if (lo !== undefined && hi !== undefined && Math.floor((hi - lo) * 100) / 100 <= len.max && hi - lo >= len.min) { length = Math.floor((hi - lo) * 100) / 100; mid = (lo + hi) / 2; }
  else if (lo !== undefined) mid = lo + half;
  else if (hi !== undefined) mid = hi - half;
  else return it;
  return {...it, length: +length.toFixed(2), [alongX ? "x" : "z"]: +mid.toFixed(3)};
}

const overlap = (a, b, eps = 1e-6) => a.x0 < b.x1 - eps && b.x0 < a.x1 - eps && a.z0 < b.z1 - eps && b.z0 < a.z1 - eps;
/** What's wrong with each item, if anything: Map id -> message. Outside first, then keep-outs, then overlaps. */
export function problems(items, catalog, room) {
  // (pieces the catalog doesn't have, from another kind of building, are left out like the build leaves them out)
  const out = new Map(), rects = items.filter(it => catalog[it.type]).map(it => [it, footprint(it, catalog[it.type])]);
  for (const [it, f] of rects) {
    if (!inRoom(room, f)) out.set(it.id, "Sticks out through a wall (outside the room)");
    else {
      const k = room.keepOut.find(k => overlap(f, k.rect));
      if (k) out.set(it.id, `Blocks ${k.what}`);
    }
  }
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    if (!overlap(rects[i][1], rects[j][1])) continue;
    for (const it of [rects[i][0], rects[j][0]]) if (!out.has(it.id)) out.set(it.id, "Overlaps another piece");
  }
  return out;
}

const num = (v, lo, hi, d) => { v = +v; return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
/** Items from a save: known types only, settings clamped to their range, quarter turns, ids 1, 2, 3 ... */
export function cleanItems(arr, catalog) {
  if (!Array.isArray(arr)) return [];
  return arr.filter(it => it && typeof it === "object" && Object.hasOwn(catalog, it.type)).slice(0, MAX_ITEMS).map((it, i) => {
    const def = catalog[it.type], out = {id: i + 1, type: it.type, x: num(it.x, -50, 50, 0), z: num(it.z, -50, 50, 0),
      // quarter turns, or any angle (to the degree) for pieces that are not inner walls
      rot: (((def.snapWalls ? Math.round(num(it.rot, -720, 720, 0) / 90) * 90 : Math.round(num(it.rot, -720, 720, 0))) % 360) + 360) % 360};
    for (const f of def.params) {
      const v = num(it[f.k], f.min, f.max, def.defaults[f.k]);
      out[f.k] = +(Math.round(v / f.step) * f.step).toFixed(3);
    }
    return out;
  });
}

/* ---------- Editing ---------- */
const inside = (f, x, z) => x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1;
/** The id of the piece under (x, z), the last one if several overlap, or null. */
export function itemAt(items, catalog, x, z) {
  for (let k = items.length - 1; k >= 0; k--) if (inside(footprint(items[k], catalog[items[k].type]), x, z)) return items[k].id;
  return null;
}

/**
 * A new piece of `type`, with its default settings and the next id, at the free spot nearest the
 * middle of the room: snapped, inside, clear of the keep-outs and the other pieces. If nothing is
 * free it goes in the middle (and shows a problem until moved).
 */
export function placeNew(type, items, catalog, room) {
  const def = catalog[type], id = items.reduce((m, it) => Math.max(m, it.id), 0) + 1;
  const base = {id, type, x: 0, z: 0, rot: 0, ...def.defaults};
  const bx = roomBox(room), cx = (room.x0 + room.x1) / 2, cz = (room.z0 + room.z1) / 2, spots = [];
  for (let x = bx.x0; x <= bx.x1 + 1e-9; x += GRID) for (let z = bx.z0; z <= bx.z1 + 1e-9; z += GRID) spots.push([x, z]);
  spots.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cz) - Math.hypot(b[0] - cx, b[1] - cz));
  for (const [x, z] of spots) {
    const it = snapItem({...base, x, z}, def, room, items, catalog, false, true);
    if (!problems([...items, it], catalog, room).has(id)) return it;
  }
  return snapItem({...base, x: cx, z: cz}, def, room, items, catalog, false, true);
}

/** A piece turned a quarter where it stands (kept inside the room; a wall piece next to a wall stays next to it, turned). */
export function rotateItem(item, def, room, others = [], catalog = {}) {
  return snapItem({...item, rot: (item.rot + 90) % 360}, def, room, others, catalog, true);
}

/**
 * The catalog's pieces for the palette, in groups: [{name, types}], groups in the order their first piece comes, pieces
 * without a group last under "Other"; imported items (asset) and the ones that are missing are left out.
 */
export function pieceGroups(catalog) {
  const groups = new Map();
  for (const [type, def] of Object.entries(catalog)) {
    if (def.asset || def.missing) continue;
    const name = def.group || "Other";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(type);
  }
  const other = groups.get("Other"); groups.delete("Other");
  return [...groups, ...(other ? [["Other", other]] : [])].map(([name, types]) => ({name, types}));
}

/** Undo and redo over copies of a state (the pieces list). */
export class History {
  constructor(state, limit = 100) { this.past = []; this.future = []; this.now = clone(state); this.limit = limit; }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  /** A new state after an edit; it drops anything that could be redone. */
  push(state) {
    this.past.push(this.now); if (this.past.length > this.limit) this.past.shift();
    this.now = clone(state); this.future = [];
  }
  undo() { if (this.canUndo) { this.future.push(this.now); this.now = this.past.pop(); } return clone(this.now); }
  redo() { if (this.canRedo) { this.past.push(this.now); this.now = this.future.pop(); } return clone(this.now); }
}
const clone = v => JSON.parse(JSON.stringify(v));

/* ---------- Filling a room automatically ---------- */
/**
 * Helpers a kind's autoFurnish uses to place pieces in free space: the room's keep-outs and every
 * piece already placed are kept clear. Returns {items, add, freeAlong, longest, onWall, onFloor,
 * freeLine}; items is the list being built (ids 1, 2, 3 ...).
 *   freeAlong(wall, deep)  free stretches {wl, a, b, len} along a wall for a piece `deep` into the room
 *   longest(walls, deep)   the longest of those over several walls
 *   onWall(stretch, type, params)   a wall piece centred on a stretch, back to the wall
 *   onFloor(type, rot, params)      a floor piece at the free grid spot nearest the room's middle
 *   freeLine(c, alongX, width)      the longest free stretch [u, v] of a line across the room at c
 */
export function furnisher(room, catalog) {
  const items = [], taken = [];
  const add = (type, x, z, rot, params = {}) => {
    const it = {id: items.length + 1, type, x, z, rot, ...params};
    items.push(it); taken.push(footprint(it, catalog[type]));
    return it;
  };
  const blocked = (pad = 0) => [...room.keepOut.map(k => k.rect), ...taken].map(r => ({x0: r.x0 - pad, x1: r.x1 + pad, z0: r.z0 - pad, z1: r.z1 + pad}));
  const horiz = wl => wl.z0 === wl.z1;
  const cut = (free, a, b) => free.flatMap(([u, v]) => [[u, Math.min(v, a)], [Math.max(u, b), v]]).filter(([u, v]) => v - u > 1e-6);
  const freeAlong = (wl, deep) => {
    const [lo, hi] = horiz(wl) ? [wl.x0, wl.x1] : [wl.z0, wl.z1];
    const c0 = horiz(wl) ? wl.z0 : wl.x0, c1 = c0 + (horiz(wl) ? wl.into[1] : wl.into[0]) * deep;
    const strip = horiz(wl) ? {x0: lo, x1: hi, z0: Math.min(c0, c1), z1: Math.max(c0, c1)} : {x0: Math.min(c0, c1), x1: Math.max(c0, c1), z0: lo, z1: hi};
    let free = [[lo, hi]];
    for (const r of blocked(0.1)) if (overlap(r, strip)) free = cut(free, ...(horiz(wl) ? [r.x0, r.x1] : [r.z0, r.z1]));
    return free.map(([a, b]) => ({wl, a, b, len: b - a}));
  };
  const longest = (walls, deep) => walls.flatMap(wl => freeAlong(wl, deep)).sort((x, y) => y.len - x.len)[0];
  const onWall = (s, type, params) => {
    const [, d] = catalog[type].size(params), mid = (s.a + s.b) / 2;
    return horiz(s.wl) ? add(type, mid, s.wl.z0 + s.wl.into[1] * d / 2, s.wl.rot, params)
      : add(type, s.wl.x0 + s.wl.into[0] * d / 2, mid, s.wl.rot, params);
  };
  const bx = roomBox(room), cx = (bx.x0 + bx.x1) / 2, cz = (bx.z0 + bx.z1) / 2, spots = [];
  for (let x = bx.x0; x <= bx.x1 + 1e-9; x += GRID) for (let z = bx.z0; z <= bx.z1 + 1e-9; z += GRID) spots.push([x, z]);
  spots.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cz) - Math.hypot(b[0] - cx, b[1] - cz));
  const onFloor = (type, rot = 0, params = {}) => {
    for (const pad of [0.3, 0.1, 0]) for (const [x, z] of spots) {
      const f = footprint({x, z, rot, ...params}, catalog[type]);
      if (!inRoom(room, f)) continue;
      if (!blocked(pad).some(r => overlap(r, f))) return add(type, x, z, rot, params);
    }
    return null;
  };
  const freeLine = (c, alongX, width = 0.3) => {
    const line = alongX ? {x0: room.x0, x1: room.x1, z0: c - width / 2, z1: c + width / 2} : {x0: c - width / 2, x1: c + width / 2, z0: room.z0, z1: room.z1};
    let free = [[alongX ? room.x0 : room.z0, alongX ? room.x1 : room.z1]];
    for (const r of blocked(0.2)) if (overlap(r, line)) free = cut(free, ...(alongX ? [r.x0, r.x1] : [r.z0, r.z1]));
    return free.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0] || null;
  };
  return {items, add, freeAlong, longest, onWall, onFloor, freeLine};
}

/* ---------- Downpipes ---------- */
/** Most downpipes a house can have in all. */
export const MAX_PIPES = 24;
/** The walls with a gutter along them (a downpipe goes on one): a gable roof's two eave walls, all four under a hip roof, and each wing's two sides. */
export function eaveWalls(P) {
  if (P.roofType === "flat") return [];
  const ridgeX = P.roofType === "hip" ? P.width >= P.depth : P.ridge === "width";
  const main = P.roofType === "hip" ? ["front", "back", "left", "right"] : ridgeX ? ["front", "back"] : ["left", "right"];
  return [...main, ...liveWings(P).filter(w => w.type !== "flat").flatMap(w => [wingWallKey(w.id, "Left"), wingWallKey(w.id, "Right")])];
}
/** n downpipes spread along a wall of length L as fractions 0..1: at the ends (30 cm in), then evenly between; one goes at the right end. */
export function pipePositions(L, n) {
  const e = Math.min(0.4, 0.3 / Math.max(L, 0.5));
  return n <= 0 ? [] : n === 1 ? [1 - e] : Array.from({length: n}, (_, i) => e + (1 - 2 * e) * i / (n - 1));
}
/**
 * The downpipes a new house starts with, [{id, wall, pos}]: P.downpipes (0 to 2) on each eave wall of the house (one is at
 * the right end of the first wall and the left end of the second), and one at the far end of each wing's sides.
 */
export function autoPipes(P) {
  if (!P.gutters || !P.downpipes) return [];
  const walls = wallsOf(P), out = [];
  const add = (wall, pos) => out.push({id: out.length + 1, wall, pos: +pos.toFixed(3)});
  eaveWalls(P).forEach((key, i) => {
    const L = walls[key].L, wid = wingIdOf(key);
    if (wid) { const [e] = pipePositions(L, 1); add(key, key.endsWith("Left") ? e : 1 - e); return; }
    const ps = pipePositions(L, P.downpipes);
    (P.downpipes === 1 && i % 2 ? [1 - ps[0]] : ps).forEach(pos => add(key, pos));
  });
  return out;
}
/** A list of downpipes cleaned: on a wall with a gutter, a place 0..1 along it, at most MAX_PIPES. */
export function cleanPipes(arr, P) {
  const ok = new Set(eaveWalls(P));
  return (Array.isArray(arr) ? arr : []).filter(x => x && ok.has(x.wall)).slice(0, MAX_PIPES)
    .map((x, i) => ({id: i + 1, wall: x.wall, pos: +Math.min(1, Math.max(0, Number.isFinite(+x.pos) ? +x.pos : 0.5)).toFixed(3)}));
}
