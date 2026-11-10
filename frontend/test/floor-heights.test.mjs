// Each floor can have its own height: floorHeight is the ground floor's, floor2Height and floor3Height are the floors above
// (0 = as the ground floor). A part inherits its parent's heights unless it sets its own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry } from "../src/editor/model.mjs";
import { floorsOf, totalHeight, floorBase, liveWings } from "../src/editor/layout.mjs";

const maxY = (G, m) => { let y = -Infinity; const g = G[m]; for (let k = 1; k < g.p.length; k += 3) y = Math.max(y, g.p[k]); return y; };
const minYAbove = (G, m, y0) => { let y = Infinity; const g = G[m]; for (let k = 1; k < g.p.length; k += 3) if (g.p[k] > y0) y = Math.min(y, g.p[k]); return y; };

test("floor heights: the settings are kept; low values mean the ground floor's height", () => {
  const p = sanitize({floors: 3, floorHeight: 2.5, floor2Height: 3.5, floor3Height: 2.2});
  assert.equal(p.floor2Height, 3.5);
  assert.equal(p.floor3Height, 0);
  assert.equal(sanitize({}).floor2Height, 0);
  assert.deepEqual(floorsOf(p), [2.5, 3.5, 2.5]);
  assert.equal(totalHeight(p), 8.5);
  assert.equal(floorBase(floorsOf(p), 2), 6);
  // (floors that don't exist don't count)
  assert.deepEqual(floorsOf(sanitize({floors: 1, floorHeight: 2.5, floor2Height: 3.5})), [2.5]);
});

test("floor heights: the walls are as tall as the floors together", () => {
  const base = {floors: 2, floorHeight: 2.5, items: []};
  const a = buildGeometry(sanitize(base)).G, b = buildGeometry(sanitize({...base, floor2Height: 3.5})).G;
  assert.ok(Math.abs(maxY(b, "walls") - maxY(a, "walls") - 1) < 1e-6, "one metre taller");
  assert.ok(Math.abs(maxY(b, "roof") - maxY(a, "roof") - 1) < 1e-6, "the roof follows");
});

test("floor heights: the upper-floor windows stand on their floor, under its top", () => {
  const p = sanitize({floors: 2, floorHeight: 2.5, floor2Height: 3.5, items: [], windows: [{id: 1, wall: "front", floor: 1, pos: 0.5, w: 1, h: 1.2, sill: 0.9, type: "window"},
    {id: 2, wall: "front", floor: 0, pos: 0.2, w: 0.9, h: 2, sill: 0, type: "door"}]});
  const G = buildGeometry(p).G, F = p.foundation;
  const lo = minYAbove(G, "glass", F + 2.6), hi = maxY(G, "glass");
  assert.ok(Math.abs(lo - (F + 2.5 + 0.9)) < 0.02, `glass starts at ${lo - F}`);
  assert.ok(hi <= F + 6 - 0.2 + 1e-6, "under the ceiling of the floor");
});

test("floor heights: a part takes its parent's heights, or its own", () => {
  const p = sanitize({floors: 2, floorHeight: 2.5, floor2Height: 3.5, wings: [{wall: "back", pos: 0.5, width: 5, depth: 5, floors: 0}]});
  assert.deepEqual(liveWings(p)[0].hs, [2.5, 3.5]);
  assert.equal(liveWings(p)[0].H, 6);
  const q = sanitize({floors: 2, floorHeight: 2.5, floor2Height: 3.5, wings: [{wall: "back", pos: 0.5, width: 5, depth: 5, floors: 0, floorHeight: 3, floor2Height: 4}]});
  assert.deepEqual(liveWings(q)[0].hs, [3, 4]);
  const r = sanitize({floors: 2, floorHeight: 2.5, floor2Height: 3.5, wings: [{wall: "back", pos: 0.5, width: 5, depth: 5, floors: 1}]});
  assert.deepEqual(liveWings(r)[0].hs, [2.5], "one floor: the ground floor's");
});
