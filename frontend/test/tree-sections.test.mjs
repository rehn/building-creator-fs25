// The building as a tree when it has dividers: building > section > floor > wall > openings. Without dividers there is one section and no section level.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildingTree } from "../src/editor/model.mjs";

const find = (n, f) => { if (f(n)) return n; for (const c of n.children || []) { const r = find(c, f); if (r) return r; } return null; };
const all = (n, f, out = []) => { if (f(n)) out.push(n); for (const c of n.children || []) all(c, f, out); return out; };
const win = (wall, pos, floor, extra = {}) => ({wall, floor, pos, type: "window", w: 1, h: 1.2, sill: 0.9, ...extra});
// 20 m long, two floors; from 10 m on one floor
const hall = (windows = [], s = {}) => sanitize({width: 20, depth: 8, ridge: "width", floors: 2, items: [], splits: [{at: 10, floors: 1}],
  windows: [{wall: "front", floor: 0, pos: 0.1, type: "door", w: 1, h: 2.1}, ...windows], ...s});

test("tree with dividers: a node for each section under the building, with its own floors", () => {
  const t = buildingTree(hall());
  assert.deepEqual(t.children.map(c => [c.type, c.index, c.floors]), [["section", 0, 2], ["section", 1, 1]]);
  assert.deepEqual([t.children[0].from, t.children[0].to, t.children[1].from, t.children[1].to], [0, 10, 10, 20]);
  assert.deepEqual(t.children[0].children.map(c => [c.type, c.floor, c.section]), [["floor", 0, 0], ["floor", 1, 0]]);
  assert.deepEqual(t.children[1].children.map(c => [c.type, c.floor, c.section]), [["floor", 0, 1]]);
});

test("tree with dividers: the long walls are in every section with their stretch, an end wall in one, a divider with the side with more floors", () => {
  const t = buildingTree(hall()), walls = (s, f) => t.children[s].children[f].children.map(w => [w.key, w.span || null]);
  assert.deepEqual(walls(0, 0), [["front", [0, 10]], ["back", [10, 20]], ["left", null], ["s1", null]], "first section: the front's first half is the back's second half");
  assert.deepEqual(walls(1, 0), [["front", [10, 20]], ["back", [0, 10]], ["right", null]]);
  assert.deepEqual(walls(0, 1).map(w => w[0]), ["front", "back", "left", "s1"], "the upper floor of the first section");
});

test("tree with dividers: openings are under the section they stand in, a window on a floor the section lacks is listed under that floor, marked", () => {
  const p = hall([win("front", 0.25, 1), win("front", 0.75, 0), win("front", 0.75, 1), win("s1", 0.5, 1)]);
  const t = buildingTree(p), ids = (n, key) => all(n, w => w.type === "wall" && w.key === key).flatMap(w => (w.children || []).map(c => `${c.type}${c.floor}`));
  assert.deepEqual(ids(t.children[0].children[1], "front"), ["window1"], "the upper floor window of the first section");
  assert.deepEqual(ids(t.children[1].children[0], "front"), ["window0"], "the ground floor window of the second");
  const lost = t.children[1].children.find(f => f.floor === 1);
  assert.ok(lost && lost.missing, "a floor node the section doesn't have, there because something hidden stands on it");
  assert.deepEqual(ids(lost, "front"), ["window1"]);
  assert.equal(t.children[1].children.length, 2);
  assert.ok(!buildingTree(hall()).children[1].children.some(f => f.missing), "no such node when nothing is on it");
  assert.deepEqual(ids(t.children[0].children[1], "s1"), ["window1"], "a window in the divider on its upper floor");
});

test("tree: no dividers, no section level", () => {
  const t = buildingTree(sanitize({width: 20, depth: 8, floors: 2}));
  assert.deepEqual(t.children.map(c => c.type), ["floor", "floor"]);
});

test("tree with dividers in a part: its sections, floors and walls", () => {
  const p = sanitize({width: 12, depth: 8, floors: 2, wings: [{wall: "back", pos: 0.5, width: 6, depth: 10, floors: 0, splits: [{at: 5, floors: 1}]}], windows: [{wall: "front", floor: 0, pos: 0.2, type: "door", w: 1, h: 2.1}]});
  const part = find(buildingTree(p), n => n.type === "part");
  assert.deepEqual(part.children.map(c => [c.type, c.part, c.index, c.floors]), [["section", 1, 0, 2], ["section", 1, 1, 1]]);
  assert.deepEqual(part.children[0].children[0].children.map(w => w.key), ["w1Left", "w1Right", "w1D1"], "the first section: the sides and the divider (the end wall is in the last)");
  assert.deepEqual(part.children[1].children[0].children.map(w => w.key), ["w1End", "w1Left", "w1Right"]);
});
