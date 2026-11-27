// The geometry of a building as it is now (after a person edited it in the app), from its settings and where its middle stands on the map.
import { test } from "node:test";
import assert from "node:assert/strict";
import { osmToHouse } from "../src/editor/osm.mjs";
import { editedGeometry } from "../src/lib/edited.mjs";

// an L: 12 x 8 main part and a 5 x 6 wing at the back towards the east end, turned 30 degrees
const turn = (x, y, d) => { const r = d * Math.PI / 180; return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)]; };
const L = (deg, [cx, cy]) => [[-6, -4], [6, -4], [6, 7], [1, 7], [1, 4], [-6, 4]].map(([x, y]) => { const [a, b] = turn(x, y, deg); return [cx + a, cy + b]; });
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.15, `${msg}: ${a} vs ${b}`);

for (const deg of [0, 30]) test(`editedGeometry: a building nobody changed gives the footprint it was made from (turned ${deg})`, () => {
  const r = osmToHouse({ footprint: L(deg, [100, 200]), tags: { building: "house" }, id: "way/1" });
  assert.ok(r.ok);
  const g = editedGeometry(r.settings, r.placement);
  assert.equal(g.placement.x, r.placement.x);
  assert.equal(g.placement.angle, r.placement.angle);
  close(g.placement.width, r.placement.width, "width");
  close(g.placement.depth, r.placement.depth, "depth");
  assert.equal(g.footprint.parts.length, r.footprint.parts.length);
  r.footprint.parts.forEach((p, i) => {
    const q = g.footprint.parts[i];
    assert.equal(q.part, p.part);
    for (const k of ["x", "y", "width", "depth"]) close(q[k], p[k], `part ${i} ${k}`);
  });
});

test("editedGeometry: a bigger main part and a removed wing show in the placement and the parts", () => {
  const r = osmToHouse({ footprint: L(0, [100, 200]), tags: { building: "house" }, id: "way/1" });
  const g = editedGeometry({ ...r.settings, width: 14, depth: 9, wings: [] }, r.placement);
  assert.equal(g.placement.width, 14);
  assert.equal(g.placement.depth, 9);
  assert.equal(g.footprint.parts.length, 1);
  assert.equal(g.footprint.parts[0].part, "main");
  assert.equal(g.footprint.parts[0].x, 100);
});

test("editedGeometry: the building's own coordinates, front wall towards +z", () => {
  const r = osmToHouse({ footprint: L(0, [100, 200]), tags: { building: "house" }, id: "way/1" });
  const g = editedGeometry(r.settings, null);
  assert.equal(g.placement, undefined);
  assert.equal(g.local.parts[0].part, "main");
  assert.equal(g.local.parts[0].x, 0);
  assert.equal(g.local.parts[0].z, 0);
  const wing = g.local.parts[1];
  assert.ok(wing.z < 0, "the wing is at the back (north, -z)");
  assert.ok(wing.x > 0, "and towards the east end");
});
