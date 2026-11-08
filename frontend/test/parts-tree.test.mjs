// Parts as a tree (docs/PLAN_PARTS.md, step 1): a wing can stand on a wing's wall, any depth (up to MAX_WINGS parts); it inherits floors, floor height
// and roof pitch from its parent; it only meets its parent with the roof, so one that would touch another part is left out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, WALL_NAMES } from "../src/editor/model.mjs";
import { wingsOf, liveWings, wallsOf, MAX_WINGS, wingIdOf } from "../src/editor/layout.mjs";

// the house: 16 x 9 m, ridge along the width, one wing on the back wall (6 wide, 8 long) and one on that wing's left wall
const base = (wings, extra = {}) => sanitize({width: 16, depth: 9, floors: 1, floorHeight: 3, roofPitch: 35, ridge: "width", wings, ...extra});
const W1 = {id: 1, wall: "back", pos: 0.5, width: 6, depth: 8, floors: 0};
const touch = (a, b) => {   // two rectangles that share part of an edge, no more
  const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
  return (Math.abs(ox) < 1e-6 && oz > 1e-6) || (Math.abs(oz) < 1e-6 && ox > 1e-6);
};

test("parts tree: at most 12 parts, and a part's wall can be a wall of another part", () => {
  assert.equal(MAX_WINGS, 12);
  assert.equal(sanitize({wings: Array.from({length: 20}, () => ({wall: "back"}))}).wings.length, 12);
  for (let i = 1; i <= 12; i++) for (const s of ["End", "Left", "Right"]) assert.ok(WALL_NAMES[`w${i}${s}`], `w${i}${s}`);
  const p = base([W1, {id: 2, wall: "w1Left", pos: 0.5, width: 3, depth: 3, floors: 0}, {id: 3, wall: "w2End", pos: 0.5, width: 2, depth: 2, floors: 0}]);
  assert.deepEqual(p.wings.map(w => [w.id, w.wall]), [[1, "back"], [2, "w1Left"], [3, "w2End"]]);
  assert.equal(wingIdOf("w2End"), 2);
});

test("parts tree: a part whose parent is missing, later in the list or itself is dropped, with what hangs on it", () => {
  assert.deepEqual(base([{id: 2, wall: "w1Left", pos: 0.5, width: 3, depth: 3}]).wings, [], "no parent");
  assert.deepEqual(base([{id: 1, wall: "w2End", pos: 0.5, width: 3, depth: 3}, {id: 2, wall: "back", pos: 0.5, width: 5, depth: 5}]).wings.map(w => w.id), [2], "a parent later in the list");
  assert.deepEqual(base([{id: 1, wall: "w1End", pos: 0.5, width: 3, depth: 3}]).wings, [], "its own wall");
  const p = base([W1, {id: 2, wall: "w1Left", pos: 0.5, width: 3, depth: 3}, {id: 3, wall: "w2End", pos: 0.5, width: 2, depth: 2}]);
  assert.equal(p.wings.length, 3);
  const q = sanitize({...p, wings: p.wings.filter(w => w.id !== 1)});
  assert.deepEqual(q.wings, [], "without wing 1 the ones on it go too");
});

test("parts tree: a part on a wing's side stands against that wall, outside the wing", () => {
  const p = base([W1, {id: 2, wall: "w1Left", pos: 0.5, width: 3, depth: 3, floors: 0}]), [w1, w2] = wingsOf(p);
  assert.ok(w1.frames && w2.frames, JSON.stringify([w1.off, w2.off]));
  assert.equal(w2.parent, 1);
  assert.equal(w1.parent, 0);
  assert.ok(touch(w1.rect, w2.rect), `${JSON.stringify(w1.rect)} / ${JSON.stringify(w2.rect)}`);
  assert.ok(Math.abs((w2.rect.x1 - w2.rect.x0) * (w2.rect.z1 - w2.rect.z0) - 3 * 3) < 1e-6 || Math.abs((w2.rect.x1 - w2.rect.x0) - 3) < 1e-6 || Math.abs((w2.rect.z1 - w2.rect.z0) - 3) < 1e-6);
  assert.deepEqual(Object.keys(wallsOf(p)).sort(), ["back", "front", "left", "right", "w1End", "w1Left", "w1Right", "w2End", "w2Left", "w2Right"].sort());
  // its walls face outwards: from the middle of each wall, a step along its normal leaves every rectangle
  const inside = (r, x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
  for (const k of ["w2End", "w2Left", "w2Right"]) {
    const f = wallsOf(p)[k], mx = f.o[0] + f.u[0] * f.L / 2, mz = f.o[2] + f.u[2] * f.L / 2;
    assert.ok(!inside(w2.rect, mx + f.n[0] * 0.05, mz + f.n[2] * 0.05), `${k} faces out`);
    assert.ok(inside(w2.rect, mx - f.n[0] * 0.05, mz - f.n[2] * 0.05), `${k} has the part behind it`);
  }
  // a part on the far end of a wing goes straight on
  const q = base([W1, {id: 2, wall: "w1End", pos: 0.5, width: 3, depth: 3, floors: 0}]), [, e] = wingsOf(q);
  assert.ok(e.frames && touch(wingsOf(q)[0].rect, e.rect));
  assert.ok(Math.abs(e.rect.z0 - (-4.5 - 8 - 3)) < 1e-6, "3 m past the wing's end");
});

test("parts tree: a part inherits floors, floor height, half floor and roof pitch from its parent unless it sets its own", () => {
  const p = base([{...W1, floors: 1, floorHeight: 3.6, pitch: 25}, {id: 2, wall: "w1Left", pos: 0.5, width: 3, depth: 3, floors: 0, floorHeight: 0, pitch: 0}], {floors: 2});
  const [w1, w2] = liveWings(p);
  assert.deepEqual([w1.floors, w1.fh, w1.pitch], [1, 3.6, 25]);
  assert.deepEqual([w2.floors, w2.fh, w2.pitch, w2.H], [1, 3.6, 25, 3.6], "the same as its parent");
  const q = base([{...W1, floors: 1, floorHeight: 3.6}, {id: 2, wall: "w1Left", pos: 0.5, width: 3, depth: 3, floors: 3, floorHeight: 2.5, pitch: 40}], {floors: 2});
  const [, v] = liveWings(q);
  assert.equal(v.floors, 1, "no more floors than its parent");
  assert.deepEqual([v.fh, v.pitch, v.H], [2.5, 40, 2.5]);
});

test("parts tree: how a part's roof meets its parent's (valley, under the eaves, a gable end) follows the parent's roof", () => {
  // wing 1: 6 m wide, one floor of 3 m, pitch 35. A child of the same height and as wide meets its slope in a valley;
  const kid = (extra, w1 = {}) => liveWings(base([{...W1, ...w1}, {id: 2, wall: "w1Left", pos: 0.5, width: 3, depth: 3, floors: 0, ...extra}])).find(x => x.id === 2);
  assert.equal(kid({width: 6}).type, "valley");
  assert.equal(kid({width: 3}).type, "valley", "also a narrower one of the same height: its ridge is lower");
  // a child well under the parent's eaves runs up to the wall
  assert.equal(kid({width: 2.5, floorHeight: 2.3}, {floorHeight: 5}).type, "eave", "lower than the parent's eaves");
  assert.equal(liveWings(base([W1, {id: 2, wall: "w1End", pos: 0.5, width: 3, depth: 3}])).find(x => x.id === 2).type, "gable", "on a gable end");
  assert.equal(liveWings(base([W1, {id: 2, wall: "w1Left", pos: 0.5, width: 3, depth: 3}], {roofType: "flat"})).find(x => x.id === 2).type, "flat", "under a flat roof");
  // a child can't be wider than its parent's roof lets it in a valley
  assert.ok(kid({width: 20}).ww <= 8 + 1e-6, "kept narrow enough: " + kid({width: 20}).ww);
});

test("parts tree: a part that would touch another part than its parent is left out, with a reason", () => {
  // on wing 1's left wall close to the house: it would stand against the house's back wall too
  const near = base([W1, {id: 2, wall: "w1Left", pos: 0.04, width: 2.5, depth: 3, floors: 0}]), w = wingsOf(near).find(x => x.id === 2);
  assert.ok(w.off && /close|touch/i.test(w.off), JSON.stringify(w));
  assert.equal(liveWings(near).length, 1);
  // a sibling too close
  const two = base([W1, {id: 2, wall: "w1Left", pos: 0.5, width: 3, depth: 3, floors: 0}, {id: 3, wall: "w1Left", pos: 0.55, width: 3, depth: 3, floors: 0}]);
  assert.ok(wingsOf(two).find(x => x.id === 3).off);
  // and one that's left out takes its children with it (they are left out too)
  const kids = base([W1, {id: 2, wall: "w1Left", pos: 0.04, width: 2.5, depth: 3, floors: 0}, {id: 3, wall: "w2End", pos: 0.5, width: 2, depth: 2, floors: 0}]);
  assert.ok(wingsOf(kids).find(x => x.id === 3).off, "no parent, no part");
  assert.deepEqual(liveWings(kids).map(x => x.id), [1]);
});

test("parts tree: a nested part has walls to put windows and doors on, and the building builds", () => {
  const p = base([W1, {id: 2, wall: "w1Left", pos: 0.5, width: 3, depth: 3, floors: 0}, {id: 3, wall: "w2End", pos: 0.5, width: 2, depth: 2, floors: 0}], {
    windows: [{wall: "front", floor: 0, pos: 0.5, type: "door", w: 1.4, h: 2.3}, {wall: "w2End", floor: 0, pos: 0.5, type: "door", w: 1, h: 2.1}, {wall: "w3Left", floor: 0, pos: 0.5, type: "window", w: 0.8, h: 1, sill: 0.9}]});
  assert.ok(p.windows.some(w => w.wall === "w3Left"));
  const geo = buildGeometry(p);
  assert.ok(geo.opsByWall.w3Left.ops.some(o => o.kind === "window"));
  assert.ok(geo.opsByWall.w2End.ops.some(o => o.kind === "open"), "the passage from wing 2 into the part on its end");
  assert.ok(geo.opsByWall.w1Left.ops.some(o => o.kind === "open"), "and from wing 1 into wing 2");
  // windows on a nested part are dropped with it
  const q = sanitize({...p, wings: p.wings.filter(w => w.id !== 3)});
  assert.ok(!q.windows.some(w => w.wall === "w3Left"));
});

test("parts tree: the most parts is a setting (setMaxParts, from the MAX_PARTS variable): 12 to start with, never beyond the hard limit", async () => {
  const layout = await import("../src/editor/layout.mjs"), model = await import("../src/editor/model.mjs");
  const many = n => Array.from({length: n}, (_, i) => ({id: i + 1, wall: "back", pos: 0.5}));
  try {
    assert.equal(layout.MAX_WINGS, 12);
    assert.equal(sanitize({wings: many(30)}).wings.length, 12);
    layout.setMaxParts(3);
    assert.equal(layout.MAX_WINGS, 3, "read live");
    assert.equal(model.MAX_WINGS, 3, "also through the model's re-export");
    assert.equal(sanitize({wings: many(30)}).wings.length, 3);
    layout.setMaxParts(25);
    assert.equal(sanitize({wings: many(30)}).wings.length, 25);
    layout.setMaxParts(500);
    assert.equal(layout.MAX_WINGS, layout.HARD_MAX_PARTS, "kept to the hard limit");
    layout.setMaxParts("junk");
    assert.equal(layout.MAX_WINGS, 12, "nonsense gives the default");
    layout.setMaxParts(0);
    assert.equal(layout.MAX_WINGS, 1, "at least one");
    // every wall a part can have has a name, up to the hard limit
    for (let i = 1; i <= layout.HARD_MAX_PARTS; i++) for (const s of ["End", "Left", "Right"]) assert.ok(model.WALL_NAMES[`w${i}${s}`], `w${i}${s}`);
  } finally { layout.setMaxParts(12); }
});
