// The maths of dragging a part in the modeller's view (view.mjs does the rest). Pure, no DOM; points are [x, y, z].
export const SNAP = 0.05;   // a part moves in steps of 5 cm

/** v to the nearest step (no step: as it is), without float dust and without -0. */
export function snapTo(v, step = SNAP) {
  const r = step > 0 ? Math.round(v / step) * step : v;
  return Math.round(r * 1000) / 1000 + 0;   // (+ 0: -0 becomes 0)
}

/** Where the ray from origin along dir meets the plane through point with the normal; null when it runs along the plane or the plane is behind it. */
export function rayPlane(origin, dir, point, normal) {
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], den = dot(dir, normal);
  if (Math.abs(den) < 1e-9) return null;
  const t = dot(point.map((p, i) => p - origin[i]), normal) / den;
  return t < 0 ? null : origin.map((o, i) => o + dir[i] * t);
}

/** The place of a part dragged from `from` to `to` (points of the mouse on the plane it is dragged in), starting at start: sideways keeps its height, vertical changes only the height. Snapped. */
export function dragTarget(start, from, to, vertical = false) {
  const d = to.map((v, i) => v - from[i]);
  return vertical ? [start[0], snapTo(start[1] + d[1]), start[2]] : [snapTo(start[0] + d[0]), start[1], snapTo(start[2] + d[2])];
}
