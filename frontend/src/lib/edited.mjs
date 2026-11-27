// The shape of a building as it is NOW, from its settings (what a person has made of it in the app), for a map program that placed it from an OSM footprint.
// Pure, no DOM. A generated building does not remember where it stands on the map (the program does), so the middle of its main part is given.
//
//   editedGeometry(settings, origin) -> {local, placement?, footprint?}
//     local      the parts in the building's own coordinates, metres: x along the front wall, z towards the front (north is -z), the middle of the main part at 0, 0
//     origin     {x, y, angle}: where the middle of the main part stands, in the map's plane (x east, y north), and the angle of its width axis (degrees counter-clockwise
//                from east); then placement and footprint come in the shape /api/v1/generate answers with. Without it, only local.
import { sanitize } from "../editor/model.mjs";
import { liveWings } from "../editor/layout.mjs";

const clean = n => +n.toFixed(3);
const turn = (x, y, deg) => { const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [x * c - y * s, x * s + y * c]; };

export function editedGeometry(settings, origin) {
  const p = sanitize(settings);
  const rects = [{ part: "main", x0: -p.width / 2, x1: p.width / 2, z0: -p.depth / 2, z1: p.depth / 2 }, ...liveWings(p).map(w => ({ part: "wing", ...w.rect }))];
  const local = { width: p.width, depth: p.depth, parts: rects.map(r => ({ part: r.part, x: clean((r.x0 + r.x1) / 2), z: clean((r.z0 + r.z1) / 2), width: clean(r.x1 - r.x0), depth: clean(r.z1 - r.z0) })) };
  if (!origin) return { local };
  // the building's z points to the front and the plane's y to the north, so the plane's "b" axis (towards the back) is -z
  const parts = local.parts.map(q => { const [dx, dy] = turn(q.x, -q.z, origin.angle); return { part: q.part, x: clean(origin.x + dx), y: clean(origin.y + dy), width: q.width, depth: q.depth }; });
  return {
    local,
    placement: { x: origin.x, y: origin.y, angle: origin.angle, width: p.width, depth: p.depth },
    footprint: { angle: origin.angle, parts },
  };
}
