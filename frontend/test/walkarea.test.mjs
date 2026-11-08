import test from "node:test";
import assert from "node:assert/strict";
import { walkArea, areaOf } from "../src/editor/walkarea.mjs";
import { sanitize, PRESETS } from "../src/editor/model.mjs";
import { kindOf } from "../src/editor/kinds/index.mjs";
import { buildGeometry } from "../src/editor/model.mjs";

const square = [[0, 0, 0], [10, 0, 0], [10, 0, 10], [0, 0, 10], [0, 0, 0]];

test("the area inside the fence, less what is cut out of it", () => {
  const full = walkArea(square, [], 0.1);
  assert.ok(Math.abs(areaOf(full) - 100) < 1.5, `100 m2, got ${areaOf(full)}`);
  const cut = walkArea(square, [{center: [2, 1, 2], size: [4, 2, 4]}], 0.1);
  assert.ok(Math.abs(areaOf(cut) - 84) < 1.5, `100 - 16 m2, got ${areaOf(cut)}`);
  const keep = walkArea(square, [{center: [2, 1, 2], size: [4, 2, 4]}], 0.1, 0.5);
  assert.ok(areaOf(keep) < areaOf(cut), "a margin takes more away");
});

test("no fence, no area", () => assert.equal(walkArea(null), null));

test("a cow barn's walking area leaves out the building and every part of it", () => {
  const p = sanitize({...PRESETS.find(x => x.id === "ladugard").settings, wings: [{id: 1, wall: "back", pos: 0.5, width: 5, depth: 4, floors: 0}]});
  const geo = buildGeometry(p), y = kindOf(p).yard(geo, p);
  assert.ok(y.fence.length >= 4 && y.blockers.length >= 2, "a fence and the building's blockers (the main one and the part)");
  const area = walkArea(y.fence, y.blockers, 0.25);
  const free = areaOf(walkArea(y.fence, [], 0.25));
  assert.ok(areaOf(area) < free - 10, "the building is cut out");
});

import { cellRects, animalNav, navMesh } from "../src/editor/walkarea.mjs";

test("cell rectangles cover exactly the cells that are set", () => {
  const w = walkArea(square, [{center: [2, 1, 2], size: [4, 2, 4]}], 0.25);
  const rects = cellRects(w);
  const area = rects.reduce((s, r) => s + (r.x1 - r.x0) * (r.z1 - r.z0), 0);
  assert.ok(Math.abs(area - areaOf(w)) < 1e-6, `${area} vs ${areaOf(w)}`);
  assert.ok(rects.length < 40, `merged (${rects.length} rectangles)`);
});

test("animals walk inside through the doorway: the building's floor at its height and a ramp up to it", () => {
  // the yard x 0..10, z 0..10; the building x 0..10, z -6..0 is outside the fence but its doorway is on z = 0 (x 4..5.6): the strip from z 1 to z -0.15
  const fence = [[0, 0, 0], [10, 0, 0], [10, 0, 10], [0, 0, 10], [0, 0, 0]];
  const door = {a: [4, 1], b: [5.6, 1], c: [5.6, -0.15], d: [4, -0.15]};
  const nav = animalNav({fence, blockers: [], rooms: [{x0: 0.15, x1: 9.85, z0: -5.85, z1: -0.15}], items: [{x0: 1, x1: 3, z0: -3, z1: -1}], door, floorY: 0.4});
  const inside = nav.rects.filter(r => r.y === 0.4), outside = nav.rects.filter(r => r.y === 0);
  assert.ok(inside.length && outside.length, "both");
  const A = rs => rs.reduce((s, r) => s + (r.x1 - r.x0) * (r.z1 - r.z0), 0);
  assert.ok(Math.abs(A(inside) - (9.7 * 5.7 - 2 * 2)) < 1, `inside ${A(inside)}`);
  assert.ok(Math.abs(A(outside) - (100 - 1.6 * 1)) < 1.5, `the yard less the ramp, ${A(outside)}`);
  const m = navMesh(nav);
  assert.equal(m.i.length / 3, (nav.rects.length + 1) * 2, "two triangles for each rectangle and for the ramp");
  assert.ok(m.p.some((v, k) => k % 3 === 1 && v === 0.4) && m.p.some((v, k) => k % 3 === 1 && v === 0), "heights");
  // every triangle faces up
  for (let t = 0; t < m.i.length; t += 3) {
    const P = [0, 1, 2].map(e => m.p.slice(m.i[t + e] * 3, m.i[t + e] * 3 + 3));
    const a = P[1].map((v, k) => v - P[0][k]), b = P[2].map((v, k) => v - P[0][k]);
    assert.ok(a[2] * b[0] - a[0] * b[2] > -1e-9, "faces up");
  }
});
