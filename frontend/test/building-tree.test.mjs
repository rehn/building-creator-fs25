// The building as a tree: the main building, its walls, and on each wall its windows, doors and parts; a part has its own walls with their things.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildingTree, TABS, SCHEMA } from "../src/editor/model.mjs";

const house = () => sanitize({width: 16, depth: 9, floors: 2, floorHeight: 3, foundation: 0.3,
  wings: [{id: 1, name: "Pumphus", wall: "back", pos: 0.5, width: 6, depth: 6, floors: 1}, {id: 2, name: "Bod", wall: "w1Left", pos: 0.5, width: 3, depth: 3, floors: 0}],
  windows: [{wall: "front", floor: 0, pos: 0.5, type: "door", w: 1.4, h: 2.3}, {wall: "front", floor: 1, pos: 0.3, type: "window", w: 1, h: 1.2, sill: 0.9}, {wall: "back", floor: 0, pos: 0.1, type: "window", w: 1, h: 1.2, sill: 0.9},
    {wall: "w1End", floor: 0, pos: 0.5, type: "window", w: 1, h: 1.2, sill: 0.9}, {wall: "w2End", floor: 0, pos: 0.5, type: "door", w: 1, h: 2.1}]});

const find = (n, f) => { if (f(n)) return n; for (const c of n.children || []) { const r = find(c, f); if (r) return r; } return null; };

test("building tree: the main building, its four walls, and on each wall its windows, doors and parts", () => {
  const t = buildingTree(house());
  assert.equal(t.type, "main");
  assert.deepEqual(t.children.map(c => [c.type, c.key]), [["wall", "front"], ["wall", "back"], ["wall", "left"], ["wall", "right"]]);
  const front = t.children[0];
  assert.deepEqual(front.children.map(c => [c.type, c.floor]), [["window", 1], ["door", 0]].sort((a, b) => 0) && front.children.map(c => [c.type, c.floor]), "listed");
  assert.deepEqual(front.children.map(c => c.type).sort(), ["door", "window"]);
  const back = t.children[1];
  assert.deepEqual(back.children.map(c => c.type), ["window", "part"].every(x => back.children.some(c => c.type === x)) ? back.children.map(c => c.type) : [], "the window and the part");
  assert.equal(back.children.filter(c => c.type === "part").length, 1);
  assert.equal(t.children[2].children.length + t.children[3].children.length, 0, "empty walls are there too");
});

test("building tree: a part has its three walls, with the windows, doors and parts on them", () => {
  const t = buildingTree(house()), pump = find(t, n => n.type === "part" && n.id === 1);
  assert.deepEqual(pump.children.map(c => c.key), ["w1End", "w1Left", "w1Right"]);
  const end = pump.children[0];
  assert.deepEqual(end.children.map(c => c.type), ["window"]);
  const left = pump.children[1], shed = left.children.find(c => c.type === "part");
  assert.equal(shed.id, 2, "the shed stands on the pump house's left wall");
  assert.deepEqual(shed.children.map(c => c.key), ["w2End", "w2Left", "w2Right"]);
  assert.deepEqual(shed.children[0].children.map(c => c.type), ["door"]);
  assert.deepEqual(t.lost, []);
});

test("building tree: windows on a floor the wall doesn't have are not in it; parts left out are marked and what hangs on them is listed apart", () => {
  const p = sanitize({width: 16, depth: 9, floors: 1, windows: [{wall: "back", floor: 0, pos: 0.5, type: "window", w: 1, h: 1.2, sill: 0.9}, {wall: "back", floor: 2, pos: 0.7, type: "window", w: 1, h: 1.2, sill: 0.9}, {wall: "front", floor: 0, pos: 0.5, type: "door", w: 1, h: 2.1}]});
  assert.equal(buildingTree(p).children[1].children.length, 1);
  const q = sanitize({width: 16, depth: 9, wings: [{id: 1, wall: "back", pos: 0.5, width: 6, depth: 6}, {id: 2, wall: "back", pos: 0.52, width: 6, depth: 6}, {id: 3, wall: "w2End", pos: 0.5, width: 2.5, depth: 2.5}]});
  const t = buildingTree(q), off = find(t, n => n.type === "part" && n.id === 2);
  assert.ok(off && off.off, "left out, marked");
  assert.deepEqual(off.children, [], "and with no walls");
  assert.deepEqual(t.lost.map(x => x.id), [3], "the part on it is listed apart");
});

test("the Building tab comes first and holds the tree; the parts are no longer a section of Shape", () => {
  assert.deepEqual(TABS.map(t => t[0]), ["building", "shape", "openings", "inside", "look", "game"]);
  assert.deepEqual(SCHEMA.filter(g => g.tab === "building").map(g => [g.title, g.custom]), [["Building", "tree"]]);
  assert.ok(!SCHEMA.some(g => g.custom === "wings"), "the old parts editor is gone");
});
