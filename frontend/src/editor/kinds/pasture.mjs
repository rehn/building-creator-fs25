// What animal buildings with a pasture share: the fence from the pasture wall, and where the places
// outside go (feed on one wall, something else on another, walls without a door first).
// Pure; used by the hen house and the cow barn.
import { wallsOf } from "../layout.mjs";
import { pastureOf } from "../objects.mjs";

export const OPPOSITE = {front: "back", back: "front", left: "right", right: "left"};
export const wallLength = (p, wall) => (wall === "front" || wall === "back") ? p.width : p.depth;
/** The walls with a door (the window list's ground-floor doors). */
export const doorWalls = p => new Set((p.windows || []).filter(w => w.type === "door" && w.floor === 0).map(w => w.wall));
/**
 * The pasture's wall: the one asked for, unless it has a door; then the opposite wall, or else any
 * wall without a door. If every wall has a door it stays.
 */
export function pastureWallFor(p) {
  const doors = doorWalls(p), want = p.pastureWall;
  if (!doors.has(want)) return want;
  return [OPPOSITE[want], "back", "front", "left", "right"].find(k => !doors.has(k)) || want;
}

/**
 * The yard around an animal building, from built geometry.
 *   fence:    posts on the ground from one corner of the pasture wall, out p.fenceDepth, across and
 *             back to the other corner (the base game's winding). If the pasture is wider than the
 *             wall (at least minWidth along it: the game can't make a walking area for a tiny one),
 *             the fence runs back along the wall line to the barn's corners, as in the base game's cow barn.
 *   past:     the pasture wall's frame {o, u, n, L}
 *   feed, other: the frames of the two walls (not the pasture's; walls without a door first) the outside places go
 *             on: the wall opposite the pasture for feed if it's free, else a side wall; feedKey, otherKey: their keys
 *   frames:   every wall's frame by key; mid(w): the middle of the stretch of wall w clear of the fence, and its length
 *   at(w, s, d, y), boxAt(w, s, d, along, out, h), rectOf(box): points and world-axis boxes by a wall
 *   clear(w): along wall w, the stretch [a, b] at least 1 m behind the pasture wall (the fence line)
 */
export function yardFrame(geo, p, minWidth) {
  const walls = geo.opsByWall, past = walls[p.pastureWall].w, opp = OPPOSITE[p.pastureWall];
  const sides = Object.keys(walls).filter(k => k !== p.pastureWall && k !== opp);
  // walls without a door first
  const doors = doorWalls(p), order = [opp, ...sides];
  const [feedSide, otherSide] = [...order.filter(k => !doors.has(k)), ...order.filter(k => doors.has(k))];
  const at = (w, s, d, y = 0) => [w.o[0] + w.u[0]*s + w.n[0]*d, y, w.o[2] + w.u[2]*s + w.n[2]*d];
  // World-axis box in front of wall w: centred at s along it and d out, `along` wide, `out` deep, h high.
  const boxAt = (w, s, d, along, out, h) => {
    const c = at(w, s, d, h / 2), ax = Math.abs(w.u[0]) > 0.5;
    return {center: c, size: ax ? [along, h, out] : [out, h, along]};
  };
  const rectOf = b => ({x0: b.center[0] - b.size[0]/2, x1: b.center[0] + b.size[0]/2, z0: b.center[2] - b.size[2]/2, z1: b.center[2] + b.size[2]/2});
  const fd = p.fenceDepth, L = past.L, post = 0.15, half = Math.max(L, minWidth) / 2;
  const fence = L < minWidth - 1e-9
    ? [at(past, L, post), at(past, L/2 + half, post), at(past, L/2 + half, fd), at(past, L/2 - half, fd), at(past, L/2 - half, post), at(past, 0, post)]
    : [at(past, L, post), at(past, L, fd), at(past, 0, fd), at(past, 0, post)];
  const clear = w => {
    const ahead = s => { const q = at(w, s, 0); return (q[0] - past.o[0]) * past.n[0] + (q[2] - past.o[2]) * past.n[2]; };
    const a0 = ahead(0), a1 = ahead(w.L);
    return Math.abs(a0 - a1) < 1e-6 ? [0, w.L] : Math.abs(a0) < Math.abs(a1) ? [1, w.L] : [0, w.L - 1];
  };
  const frames = Object.fromEntries(Object.entries(walls).map(([k, e]) => [k, e.w]));
  return {fence, past, feed: walls[feedSide].w, other: walls[otherSide].w, feedKey: feedSide, otherKey: otherSide, frames, at, boxAt, rectOf, clear,
    // the middle of the stretch clear of the fence on wall w, and its length
    mid: w => { const [a, b] = clear(w); return [(a + b) / 2, b - a]; }};
}

/** The building's walls as buildGeometry gives them ({opsByWall, dims}), without building it: for where things go to start with. */
export const shellOf = p => ({opsByWall: Object.fromEntries(Object.entries(wallsOf(p)).map(([k, w]) => [k, {w, ops: []}])), dims: {W: p.width, D: p.depth}});
/** The map's teleport point for an animal trailer spot {box}: 3 m further out from the building than its middle. */
export function teleportFor(l, {W, D}) {
  const [x, , z] = l.box.center, alongX = Math.abs(x) - W / 2 > Math.abs(z) - D / 2;
  return alongX ? [x + Math.sign(x || 1) * 3, 0, z] : [x, 0, z + Math.sign(z || 1) * 3];
}
/**
 * The settings the rest of the kind reads, from its pasture object: pastureWall, fenceDepth and
 * pastureMid (where on that wall the animals go out: the middle of the stretch the pasture encloses).
 */
export function withPasture(q) {
  const pa = pastureOf(q);
  return pa ? {...q, pastureWall: pa.wall, fenceDepth: pa.depth, pastureMid: pa.mid} : q;
}
