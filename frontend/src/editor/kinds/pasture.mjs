// What animal buildings with a pasture share: the fence from the pasture wall, and where the places
// outside go (feed on one wall, something else on another, never the people door's wall).
// Pure; used by the hen house and the cow barn.

export const OPPOSITE = {front: "back", back: "front", left: "right", right: "left"};
export const wallLength = (p, wall) => (wall === "front" || wall === "back") ? p.width : p.depth;

/**
 * The yard around an animal building, from built geometry.
 *   fence:    posts on the ground from one corner of the pasture wall, out p.fenceDepth, across and
 *             back to the other corner (the base game's winding). If the pasture is wider than the
 *             wall (at least minWidth along it: the game can't make a walking area for a tiny one),
 *             the fence runs back along the wall line to the barn's corners, as in the base game's cow barn.
 *   past:     the pasture wall's frame {o, u, n, L}
 *   feed, other: the frames of the two walls (not the pasture's, not the door's) the outside places go
 *             on: the wall opposite the pasture for feed if it's free, else a side wall
 *   at(w, s, d, y), boxAt(w, s, d, along, out, h), rectOf(box): points and world-axis boxes by a wall
 *   clear(w): along wall w, the stretch [a, b] at least 1 m behind the pasture wall (the fence line)
 */
export function yardFrame(geo, p, minWidth) {
  const walls = geo.opsByWall, past = walls[p.pastureWall].w, opp = OPPOSITE[p.pastureWall];
  const sides = Object.keys(walls).filter(k => k !== p.pastureWall && k !== opp);
  const [feedSide, otherSide] = [opp, ...sides].filter(k => k !== p.doorWall);
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
  return {fence, past, feed: walls[feedSide].w, other: walls[otherSide].w, at, boxAt, rectOf, clear};
}
