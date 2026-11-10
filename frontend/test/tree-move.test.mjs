// Moving things by dragging in the tree: a window, door or part put before or after another on the same wall (the things on that stretch are laid out again in the new order),
// or put on another wall beside something there.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, moveBeside, moveToWall, wallItems } from "../src/editor/model.mjs";
import { liveWings } from "../src/editor/layout.mjs";

const win = (wall, pos, floor = 0, extra = {}) => ({wall, floor, pos, type: "window", w: 1, h: 1.2, sill: 0.9, ...extra});
const house = (windows, wings = []) => sanitize({width: 20, depth: 8, floors: 2, items: [], windows: [{wall: "right", floor: 0, pos: 0.5, type: "door", w: 1, h: 2.1}, ...windows], wings});
const idsAlong = (p, wall, floor) => wallItems(p, wall).filter(i => i.floor === floor || i.kind === "part").map(i => `${i.kind}${i.id}`);

test("move beside: the order of what is on a wall changes, and the stretch they fill stays the same", () => {
  const p = house([win("front", 0.1), win("front", 0.4), win("front", 0.8)]);
  const [a, b, c] = p.windows.filter(w => w.wall === "front");
  assert.deepEqual(idsAlong(p, "front", 0), [a, b, c].map(w => "window" + w.id));
  const before = wallItems(p, "front").filter(i => i.floor === 0), ext = [Math.min(...before.map(i => i.s0)), Math.max(...before.map(i => i.s1))];
  const r = moveBeside(p, {kind: "win", id: c.id}, {kind: "win", id: a.id}, false);
  assert.ok(r.windows, JSON.stringify(r));
  const q = sanitize({...p, windows: r.windows});
  assert.deepEqual(idsAlong(q, "front", 0), [c, a, b].map(w => "window" + w.id), "c now first");
  const after = wallItems(q, "front").filter(i => i.floor === 0);
  assert.ok(Math.abs(Math.min(...after.map(i => i.s0)) - ext[0]) < 0.02 && Math.abs(Math.max(...after.map(i => i.s1)) - ext[1]) < 0.02, "same stretch");
  for (let i = 1; i < after.length; i++) assert.ok(after[i].s0 - after[i - 1].s1 >= 0.2 - 1e-6, "clear of each other");
  const r2 = moveBeside(p, {kind: "win", id: a.id}, {kind: "win", id: c.id}, true);
  assert.deepEqual(idsAlong(sanitize({...p, windows: r2.windows}), "front", 0), [b, c, a].map(w => "window" + w.id), "a after c");
});

test("move beside: windows of different widths do not overlap afterwards", () => {
  const p = house([win("front", 0.1, 0, {w: 2.4}), win("front", 0.5, 0, {w: 0.6}), win("front", 0.85, 0, {w: 1.5})]);
  const ids = p.windows.filter(w => w.wall === "front").map(w => w.id);
  const r = moveBeside(p, {kind: "win", id: ids[2]}, {kind: "win", id: ids[0]}, false), q = sanitize({...p, windows: r.windows}), items = wallItems(q, "front").filter(i => i.floor === 0);
  assert.deepEqual(items.map(i => i.id), [ids[2], ids[0], ids[1]]);
  for (let i = 1; i < items.length; i++) assert.ok(items[i].s0 - items[i - 1].s1 >= 0.2 - 1e-6);
  assert.ok(items.every(i => !i.hidden));
});

test("move beside: parts and doors are in the same list on the ground floor, windows on other floors are a list of their own", () => {
  const p = house([win("back", 0.1), win("back", 0.8), win("back", 0.3, 1), win("back", 0.7, 1)], [{wall: "back", pos: 0.5, width: 4, depth: 5, floors: 1}]);
  const [w1, w2, up1, up2] = p.windows.filter(w => w.wall === "back");
  assert.deepEqual(idsAlong(p, "back", 0), [`window${w1.id}`, "part1", `window${w2.id}`]);
  const r = moveBeside(p, {kind: "part", id: 1}, {kind: "win", id: w1.id}, false);
  assert.ok(r.wings && r.windows, "a part can go before a window");
  const q = sanitize({...p, wings: r.wings, windows: r.windows});
  assert.deepEqual(idsAlong(q, "back", 0), ["part1", `window${w1.id}`, `window${w2.id}`]);
  assert.ok(liveWings(q).some(g => g.id === 1), "the part is still built");
  const bad = moveBeside(p, {kind: "win", id: up1.id}, {kind: "win", id: w1.id}, false);
  assert.ok(bad.error, "not between lists: that is a move to another floor");
  void up2;
});

test("move to a wall: a window goes to the other wall, next to what is there, keeping its size", () => {
  const p = house([win("front", 0.2), win("back", 0.5)]);
  const mine = p.windows.find(w => w.wall === "front"), there = p.windows.find(w => w.wall === "back");
  const near = wallItems(p, "back").find(i => i.id === there.id);
  const r = moveToWall(p, {kind: "win", id: mine.id}, "back", 0, near, true), moved = r.windows.find(w => w.id === mine.id);
  assert.equal(moved.wall, "back");
  assert.equal(moved.w, mine.w);
  const q = sanitize({...p, windows: r.windows}), items = wallItems(q, "back");
  assert.deepEqual(items.map(i => i.id), [there.id, mine.id], "after the one that was there");
  assert.ok(items[1].s0 - items[0].s1 >= 0.2 - 1e-6);
  assert.equal(moveToWall(p, {kind: "win", id: mine.id}, "back", 1).windows.find(w => w.id === mine.id).floor, 1, "onto the upper floor of the wall");
});

test("move to a wall: a door only to the ground floor; no room is an error", () => {
  const p = house([win("front", 0.5)]), door = p.windows.find(w => w.type === "door");
  assert.ok(moveToWall(p, {kind: "win", id: door.id}, "back", 1).error);
  assert.equal(moveToWall(p, {kind: "win", id: door.id}, "back", 0).windows.find(w => w.id === door.id).wall, "back");
  const tight = sanitize({width: 3, depth: 8, floors: 1, items: [], windows: [{wall: "front", floor: 0, pos: 0.5, type: "window", w: 1, h: 1.2, sill: 0.9}, {wall: "back", floor: 0, pos: 0.5, type: "door", w: 1, h: 2.1}, {wall: "right", floor: 0, pos: 0.5, type: "window", w: 1, h: 1.2, sill: 0.9}]});
  const toFront = moveToWall(tight, {kind: "win", id: tight.windows.find(w => w.wall === "right").id}, "front", 0);
  assert.ok(toFront.error, "a 3 m wall with a window in the middle has no room for another");
});

test("move to a wall: a part goes to another wall, not onto itself or what stands on it", () => {
  const p = house([], [{wall: "back", pos: 0.3, width: 4, depth: 5, floors: 1}, {wall: "w1Left", pos: 0.5, width: 2.5, depth: 3, floors: 1}]);
  const r = moveToWall(p, {kind: "part", id: 1}, "front", 0);
  assert.ok(r.wings, JSON.stringify(r));
  assert.equal(r.wings.find(w => w.id === 1).wall, "front");
  const q = sanitize({...p, wings: r.wings});
  assert.ok(liveWings(q).some(g => g.id === 1) && liveWings(q).some(g => g.id === 2), "it and its child are built");
  assert.ok(moveToWall(p, {kind: "part", id: 1}, "w1End", 0).error, "not onto itself");
  assert.ok(moveToWall(p, {kind: "part", id: 1}, "w2End", 0).error, "not onto its own child");
  assert.ok(moveToWall(p, {kind: "part", id: 1}, "front", 1).error, "parts stand on the ground floor");
});
