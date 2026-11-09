// The game closes the fence into the animals' area with a straight line from the last post back to the first. A pasture round a corner of the barn
// (an L) then took a triangle of the barn into the area, and the animals walked through its walls. The husbandry's additionalNavMeshNodes add points
// "along the building side" to that contour: the way back follows the building's outline instead.
import test from "node:test";
import assert from "node:assert/strict";
import { buildingOutline, contourClosure } from "../src/editor/kinds/pasture.mjs";
import { sanitize, buildI3d, placeableXml } from "../src/editor/model.mjs";
import { insidePoly } from "../src/editor/objects.mjs";

const rect = (x0, x1, z0, z1) => ({x0, x1, z0, z1});
const area = poly => poly.reduce((s, [x, z], i) => { const [x2, z2] = poly[(i + 1) % poly.length]; return s + x * z2 - x2 * z; }, 0) / 2;

test("the outline of an L of rectangles is one loop round them, counter-clockwise", () => {
  const o = buildingOutline([rect(-5, 5, -3, 3), rect(-9, -5, -1, 1)], 0);
  assert.equal(o.length, 8, JSON.stringify(o));
  assert.ok(area(o) > 0, "counter-clockwise");
  assert.ok(Math.abs(area(o) - (60 + 8)) < 1e-6, `area ${area(o)}`);
});

test("a pasture round the barn's corner closes along its walls, not through it", () => {
  const rects = [rect(-5, 5, -3, 3)];
  // from the back wall (z = -3) out and round to the right wall (x = 5): an L round the corner (5, -3)
  const fence = [[0, 0, -3.15], [0, 0, -12], [14, 0, -12], [14, 0, 0], [5.15, 0, 0]];
  const path = contourClosure(fence, rects, 0.15);
  assert.ok(path.length >= 1, "points along the building");
  const poly = [...fence, ...path.map(([x, z]) => [x, 0, z])];
  assert.ok(!insidePoly(poly, 0, 0) && !insidePoly(poly, 4, -2) && !insidePoly(poly, 4.9, -2.9), "the barn is not in the area");
  assert.ok(insidePoly(poly, 7, -6), "the pasture is");
  assert.ok(path.some(([x, z]) => Math.abs(x - 5.15) < 1e-6 && Math.abs(z + 3.15) < 1e-6), "round the corner");
});

test("a pasture along one wall needs nothing more (its closing line is beside the wall)", () => {
  const fence = [[-5, 0, -3.15], [-8, 0, -3.15], [-8, 0, -18], [8, 0, -18], [8, 0, -3.15], [5, 0, -3.15]];
  const path = contourClosure(fence, [rect(-5, 5, -3, 3)], 0.15);
  const poly = [...fence, ...path.map(([x, z]) => [x, 0, z])];
  assert.ok(!insidePoly(poly, 0, 0) && insidePoly(poly, 0, -10));
});

test("a fence that doesn't start or end at the building is left as it is", () => {
  assert.deepEqual(contourClosure([[20, 0, 0], [30, 0, 0], [30, 0, 10], [20, 0, 10]], [rect(-5, 5, -3, 3)], 0.15), []);
});

test("the export adds the points to the husbandry's fence, as nodes in the scene", () => {
  const base = sanitize({kind: "cow"});
  const pasture = base.objects.find(o => o.type === "pasture");
  // posts drawn by hand: from the back wall round the right-hand corner to the right wall
  const W = base.width, D = base.depth;
  const points = [[0, -D / 2 - 0.15], [0, -D / 2 - 10], [W / 2 + 10, -D / 2 - 10], [W / 2 + 10, 0], [W / 2 + 0.15, 0]];
  const p = sanitize({...base, objects: base.objects.map(o => o === pasture ? {...o, points} : o)});
  const xml = placeableXml(p, "x"), i3d = buildI3d(p);
  const block = /<additionalNavMeshNodes>([\s\S]*?)<\/additionalNavMeshNodes>/.exec(xml);
  assert.ok(block, "additionalNavMeshNodes");
  const names = [...block[1].matchAll(/node="([^"]+)"/g)].map(m => m[1]);
  assert.ok(names.length >= 1);
  for (const n of names) assert.ok(i3d.includes(`name="${n}"`), n);
});
