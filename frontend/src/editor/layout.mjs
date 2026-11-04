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

/** Where the door is along its wall (length L): [s0, s1]. */
export function doorSpan(p, L) {
  const dw = Math.min(p.doorW, L - 0.6), c = L/2 + p.doorPos * Math.max(0, L/2 - p.doorW/2 - 0.3);
  return [c - dw/2, c + dw/2];
}

/**
 * The room inside a walk-in building: the floor inside the walls {x0, x1, z0, z1}, floor height F,
 * wall height H, the doorway's keep-out rectangle (door), every keep-out as keepOut [{rect, what}],
 * and each wall's inside face as
 * {x0, x1, z0, z1 (the line), into: [x, z] (towards the room), rot (of an item facing into the room)}.
 * openings: other openings to keep clear inside, [{wall, s0, s1, clear, what}] (a hen hatch ...).
 */
export function roomOf(p, openings = []) {
  const W = p.width, D = p.depth, F = p.foundation, t = WALL_T;
  const H = p.floors * p.floorHeight + (p.halfStorey ? p.kneeWall : 0);
  const x0 = -W/2 + t, x1 = W/2 - t, z0 = -D/2 + t, z1 = D/2 - t;
  const frames = wallFrames(W, D, F);
  // A keep-out: the opening's width plus 30 cm each side, from the wall `clear` into the room.
  const keep = (wall, s0, s1, clear) => {
    const w = frames[wall], at = (s, d) => [w.o[0] + w.u[0] * s + w.n[0] * d, w.o[2] + w.u[2] * s + w.n[2] * d];
    const a = at(s0 - 0.3, -t), b = at(s1 + 0.3, -t - clear);
    return {x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1])};
  };
  const door = keep(p.doorWall, ...doorSpan(p, frames[p.doorWall].L), DOOR_CLEAR);
  const keepOut = [{rect: door, what: "the door"}, ...openings.map(o => ({rect: keep(o.wall, o.s0, o.s1, o.clear), what: o.what}))];
  const walls = [
    {name: "back", x0, x1, z0, z1: z0, into: [0, 1], rot: 0},
    {name: "front", x0, x1, z0: z1, z1, into: [0, -1], rot: 180},
    {name: "left", x0, x1: x0, z0, z1, into: [1, 0], rot: 90},
    {name: "right", x0: x1, x1, z0, z1, into: [-1, 0], rot: 270},
  ];
  return {x0, x1, z0, z1, F, H, door, keepOut, walls, doorWall: p.doorWall};
}

const R = rot => rot * Math.PI / 180;
/** The world (x, z) of the point (lx, lz) in the item's own frame. */
export function toWorld(item, lx, lz) {
  const r = R(item.rot), c = Math.cos(r), s = Math.sin(r);
  return [item.x + lx * c + lz * s, item.z - lx * s + lz * c];
}

/** The rectangle an item covers on the floor. */
export function footprint(item, def) {
  const [w, d] = def.size(item), turned = item.rot % 180 !== 0;
  const hx = (turned ? d : w) / 2, hz = (turned ? w : d) / 2;
  return {x0: item.x - hx, x1: item.x + hx, z0: item.z - hz, z1: item.z + hz};
}

const snap = v => Math.round(v / GRID) * GRID + 0; // (+ 0 turns -0 into 0)
const clamp = (v, lo, hi) => lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));
/**
 * Where an item ends up when dropped: a wall item against the nearest inside wall, facing the room,
 * slid along it to the grid; a floor item on the grid. Both kept inside the room.
 */
export function snapItem(item, def, room) {
  const [w, d] = def.size(item);
  if (def.mount === "wall") {
    const dist = wl => wl.x0 === wl.x1 ? Math.abs(item.x - wl.x0) : Math.abs(item.z - wl.z0);
    const wl = room.walls.reduce((best, x) => dist(x) < dist(best) ? x : best);
    if (wl.x0 === wl.x1) {
      const z = clamp(snap(item.z), room.z0 + w/2, room.z1 - w/2);
      return {...item, rot: wl.rot, x: wl.x0 + wl.into[0] * d/2, z};
    }
    const x = clamp(snap(item.x), room.x0 + w/2, room.x1 - w/2);
    return {...item, rot: wl.rot, x, z: wl.z0 + wl.into[1] * d/2};
  }
  const f = footprint({...item, x: 0, z: 0}, def);
  return {...item, x: clamp(snap(item.x), room.x0 - f.x0, room.x1 - f.x1), z: clamp(snap(item.z), room.z0 - f.z0, room.z1 - f.z1)};
}

const overlap = (a, b, eps = 1e-6) => a.x0 < b.x1 - eps && b.x0 < a.x1 - eps && a.z0 < b.z1 - eps && b.z0 < a.z1 - eps;
/** What's wrong with each item, if anything: Map id -> message. Outside first, then keep-outs, then overlaps. */
export function problems(items, catalog, room) {
  const out = new Map(), rects = items.map(it => [it, footprint(it, catalog[it.type])]);
  for (const [it, f] of rects) {
    if (f.x0 < room.x0 - 1e-6 || f.x1 > room.x1 + 1e-6 || f.z0 < room.z0 - 1e-6 || f.z1 > room.z1 + 1e-6) out.set(it.id, "Sticks out through a wall (outside the room)");
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
      rot: ((Math.round(num(it.rot, -720, 720, 0) / 90) * 90) % 360 + 360) % 360};
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
  const cx = (room.x0 + room.x1) / 2, cz = (room.z0 + room.z1) / 2, spots = [];
  for (let x = room.x0; x <= room.x1 + 1e-9; x += GRID) for (let z = room.z0; z <= room.z1 + 1e-9; z += GRID) spots.push([x, z]);
  spots.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cz) - Math.hypot(b[0] - cx, b[1] - cz));
  for (const [x, z] of spots) {
    const it = snapItem({...base, x, z}, def, room);
    if (!problems([...items, it], catalog, room).has(id)) return it;
  }
  return snapItem({...base, x: cx, z: cz}, def, room);
}

/** A floor piece turned a quarter (and kept inside); a wall piece always faces the room, so stays as is. */
export function rotateItem(item, def, room) {
  if (def.mount === "wall") return item;
  return snapItem({...item, rot: (item.rot + 90) % 360}, def, room);
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
