// Game places: the FS25 boxes and icons a building's export has (a farmhouse's sleep trigger and bed
// icon, a barn's feed pad, bale drop, animal trailer spot ...). Each kind lists its places
// (kind.places) and puts them where they go by default; the player can move each one, give it
// another size or put it on another wall, kept per building as p.places[id]. Pure, no DOM; kinds
// import it (it imports nothing of the core).

/**
 * One place's adjustment, as saved: wall "auto" (where the kind puts it) or a wall; along and out:
 * metres it moves along its wall and out from it; width, depth, height: its size (0: the kind's);
 * iconAlong, iconOut: metres its icon moves from the middle of the box.
 */
export const PLACE_DEFAULT = {wall: "auto", along: 0, out: 0, width: 0, depth: 0, height: 0, iconAlong: 0, iconOut: 0};
/** Limits: [min, max]. A size of 0 is "the kind's own". */
export const PLACE_LIMITS = {along: [-35, 35], out: [-20, 20], width: [0.5, 70], depth: [0.5, 70], height: [0.2, 8], iconAlong: [-10, 10], iconOut: [-10, 10]};
const WALL_KEYS = ["front", "back", "left", "right"];

const num = (v, d) => { v = +v; return isFinite(v) ? v : d; };
const round = v => +v.toFixed(3);
/** A kind's places' adjustments from anything (a save, a preset), cleaned: one per place, in range. */
export function cleanPlaces(obj, places = []) {
  const src = obj && typeof obj === "object" ? obj : {}, out = {};
  for (const pl of places) {
    const a = src[pl.id] && typeof src[pl.id] === "object" ? src[pl.id] : {}, q = {...PLACE_DEFAULT};
    if (pl.wall && WALL_KEYS.includes(a.wall)) q.wall = a.wall;
    for (const k of ["along", "out", "iconAlong", "iconOut"]) q[k] = round(Math.min(PLACE_LIMITS[k][1], Math.max(PLACE_LIMITS[k][0], num(a[k], 0))));
    // a size: 0 (or nothing) is the kind's; anything else in range
    for (const k of ["width", "depth", "height"]) { const v = num(a[k], 0); q[k] = v <= 0 ? 0 : round(Math.min(PLACE_LIMITS[k][1], Math.max(PLACE_LIMITS[k][0], v))); }
    out[pl.id] = q;
  }
  return out;
}

/**
 * Where a place goes, by a wall. walls: {key: frame {o, u, n, L}}; auto: the wall the kind puts it on;
 * def(w, key): its default on wall w {s (along), d (out), along (width), out (depth), h, icon: [s, d] | null}.
 * Returns {wall, w, s, d, along, out, h, box {center, size} (world axes, from the ground up), icon (a
 * point on the ground, y = iconY) | null}.
 */
export function placeOnWall(p, id, walls, auto, def, iconY = 0) {
  const a = (p.places && p.places[id]) || PLACE_DEFAULT;
  const wall = a.wall !== "auto" && walls[a.wall] ? a.wall : auto, w = walls[wall], d0 = def(w, wall);
  const s = d0.s + a.along, d = d0.d + a.out, along = a.width || d0.along, out = a.depth || d0.out, h = a.height || d0.h;
  const at = (s, d, y) => [w.o[0] + w.u[0] * s + w.n[0] * d, y, w.o[2] + w.u[2] * s + w.n[2] * d];
  const ax = Math.abs(w.u[0]) > 0.5;
  const box = {center: at(s, d, h / 2), size: ax ? [along, h, out] : [out, h, along]};
  // the icon keeps its place in the box as the box moves, and moves on its own too
  const icon = d0.icon ? at(d0.icon[0] + a.along + a.iconAlong, d0.icon[1] + a.out + a.iconOut, iconY) : null;
  return {wall, w, s, d, along, out, h, box, icon, at};
}

/**
 * A place in the building's own axes (an info area around the building): along moves it in x, out in
 * z; width is its size in x, depth in z. def: {center, size}.
 */
export function placeOnBuilding(p, id, def) {
  const a = (p.places && p.places[id]) || PLACE_DEFAULT;
  const size = [a.width || def.size[0], a.height || def.size[1], a.depth || def.size[2]];
  return {center: [def.center[0] + a.along, size[1] / 2, def.center[2] + a.out], size};
}
