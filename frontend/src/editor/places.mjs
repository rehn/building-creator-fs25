// Where the kinds put their game objects to start with (a farmhouse's sleep box, a barn's feed pad, bale drop, animal
// trailer spot ...): a box and an icon beside a wall (placeOnWall) or round the building (placeOnBuilding). The objects
// themselves, once placed, are in objects.mjs. Pure, no DOM; kinds import it.

/**
 * Where a place goes, by a wall. walls: {key: frame {o, u, n, L}}; auto: the wall the kind puts it on;
 * def(w, key): its default on wall w {s (along), d (out), along (width), out (depth), h, icon: [s, d] | null}.
 * Returns {wall, w, s, d, along, out, h, box {center, size} (world axes, from the ground up), icon (a
 * point on the ground, y = iconY) | null}.
 */
export function placeOnWall(walls, wall, def, iconY = 0) {
  const w = walls[wall], d0 = def(w, wall), {s, d, along, out, h} = d0;
  const at = (s, d, y) => [w.o[0] + w.u[0] * s + w.n[0] * d, y, w.o[2] + w.u[2] * s + w.n[2] * d];
  const ax = Math.abs(w.u[0]) > 0.5;
  const box = {center: at(s, d, h / 2), size: ax ? [along, h, out] : [out, h, along]};
  const icon = d0.icon ? at(d0.icon[0], d0.icon[1], iconY) : null;
  return {wall, w, s, d, along, out, h, box, icon, at};
}

/**
 * A place in the building's own axes (an info area around the building). def: {center, size}.
 */
export function placeOnBuilding(def) {
  return {center: [def.center[0], def.size[1] / 2, def.center[2]], size: def.size};
}
