// The floor inside: as the inside look gives it, or a surface and colour of the building's own, and a look of its own for a part and for a section of a long building.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, floorLookAt, FLOOR_SURFACES } from "../src/editor/model.mjs";
import { roomOf } from "../src/editor/layout.mjs";

const tris = p => buildGeometry(sanitize(p)).G.fittings.i.length / 3;
const colors = p => { const g = buildGeometry(sanitize(p)).G.fittings; return new Set(g.c ? Array.from({length: g.c.length / 3}, (_, i) => g.c.slice(i * 3, i * 3 + 3).map(v => v.toFixed(3)).join(",")) : []); };
const wing = (o = {}) => ({id: 1, wall: "back", pos: 0.5, width: 6, depth: 6, floors: 0, ...o});

test("a building's floor is the inside look's until it is chosen", () => {
  for (const kind of ["house", "cow", "chicken", "shed"]) {
    const p = sanitize({kind});
    assert.equal(p.floorSurface, "kind");
    assert.equal(floorLookAt(p, 0, 0), null);
  }
});

test("a floor of the building's own: its surface and colour", () => {
  const a = sanitize({kind: "shed", floorSurface: "boards", floorColor: "#3355aa"});
  assert.deepEqual(floorLookAt(a, 0, 0), ["#3355aa", "boards"]);
  assert.notDeepEqual([...colors({kind: "shed", floorSurface: "boards", floorColor: "#3355aa"})].sort(), [...colors({kind: "shed"})].sort(), "the floor is drawn in the new colour");
  assert.equal(tris({kind: "shed", floorSurface: "boards", floorColor: "#3355aa"}), tris({kind: "shed"}), "one floor, as before");
  assert.equal(sanitize({floorSurface: "lava"}).floorSurface, "kind", "an unknown surface is the inside look's");
  for (const [id] of FLOOR_SURFACES) assert.equal(sanitize({floorSurface: id}).floorSurface, id);
});

test("a part can have a floor of its own", () => {
  const base = {kind: "shed", width: 12, depth: 8, wings: [wing()]};
  const p = sanitize({...base, floorLooks: {"1": {surface: "litter", color: "#884400"}}});
  assert.deepEqual(floorLookAt(p, 1, 0), ["#884400", "litter"]);
  assert.equal(floorLookAt(p, 0, 0), null, "the main building keeps its own");
  assert.equal(tris(p), tris(base), "a part's floor is a piece of its own already");
  assert.notDeepEqual([...colors(p)].sort(), [...colors(base)].sort());
});

test("a section of a long building can have a floor of its own: the floor is cut at the divider", () => {
  const base = {kind: "shed", width: 24, depth: 8, splits: [{at: 12}]};
  const p = sanitize({...base, floorLooks: {"0:1": {surface: "litter", color: "#884400"}}});
  assert.deepEqual(floorLookAt(p, 0, 1), ["#884400", "litter"]);
  assert.equal(floorLookAt(p, 0, 0), null);
  const areas = roomOf(p, []).floorAreas.filter(a => a.wid === 0);
  assert.equal(areas.length, 2);
  assert.ok(Math.abs(areas[0].x1 - areas[1].x0) < 1e-9, "the two pieces meet at the divider");
  assert.equal(tris(p), tris(base) + 12, "two floors where one box was: a box more");
  assert.equal(tris({...base, floorLooks: {"0:1": {surface: "kind", color: "#884400"}}}), tris(base), "the same look in both sections is one floor");
});

test("a section's look beats its part's, which beats the building's", () => {
  const p = sanitize({kind: "shed", width: 12, depth: 8, floorSurface: "concrete", floorColor: "#111111", wings: [wing({splits: [{at: 3}]})],
    floorLooks: {"1": {surface: "wood", color: "#222222"}, "1:1": {surface: "litter", color: "#333333"}}});
  assert.ok(p.wings[0].splits.length === 1);
  assert.deepEqual(floorLookAt(p, 0, 0), ["#111111", "concrete"]);
  assert.deepEqual(floorLookAt(p, 1, 0), ["#222222", "wood"]);
  assert.deepEqual(floorLookAt(p, 1, 1), ["#333333", "litter"]);
});

test("looks of a part or a section that is not there are dropped", () => {
  const p = sanitize({kind: "shed", width: 12, depth: 8, floorLooks: {"3": {surface: "wood"}, "0:2": {surface: "wood"}, "0": {surface: "wood"}, "x": {surface: "wood"}, "0:1": {surface: "nope"}}});
  assert.deepEqual(p.floorLooks, {});
  assert.deepEqual(sanitize({kind: "shed", floorLooks: "no"}).floorLooks, {});
});
