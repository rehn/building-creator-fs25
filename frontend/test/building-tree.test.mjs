// The building as a tree: the main building, its walls, and on each wall its windows, doors and parts; a part has its own walls with their things.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildingTree, TABS, SCHEMA } from "../src/editor/model.mjs";

const house = () => sanitize({width: 16, depth: 9, floors: 2, floorHeight: 3, foundation: 0.3,
  wings: [{id: 1, name: "Pumphus", wall: "back", pos: 0.5, width: 6, depth: 6, floors: 1}, {id: 2, name: "Bod", wall: "w1Left", pos: 0.5, width: 3, depth: 3, floors: 0}],
  windows: [{wall: "front", floor: 0, pos: 0.5, type: "door", w: 1.4, h: 2.3}, {wall: "front", floor: 1, pos: 0.3, type: "window", w: 1, h: 1.2, sill: 0.9}, {wall: "back", floor: 0, pos: 0.1, type: "window", w: 1, h: 1.2, sill: 0.9},
    {wall: "w1End", floor: 0, pos: 0.5, type: "window", w: 1, h: 1.2, sill: 0.9}, {wall: "w2End", floor: 0, pos: 0.5, type: "door", w: 1, h: 2.1}]});

const find = (n, f) => { if (f(n)) return n; for (const c of n.children || []) { const r = find(c, f); if (r) return r; } return null; };
const all = (n, f, out = []) => { if (f(n)) out.push(n); for (const c of n.children || []) all(c, f, out); return out; };

// the windows and doors in a floor's walls
const things = n => all(n, c => c.type === "window" || c.type === "door");

test("building tree: the main building, its floors, on each floor its four walls, and on each wall its windows, doors and parts", () => {
  const t = buildingTree(house());
  assert.equal(t.type, "main");
  assert.deepEqual(t.children.map(c => [c.type, c.part, c.floor]), [["floor", 0, 0], ["floor", 0, 1]], "a level for each floor");
  const [g, up] = t.children;
  assert.deepEqual(g.children.map(c => [c.type, c.key, c.floor]), [["wall", "front", 0], ["wall", "back", 0], ["wall", "left", 0], ["wall", "right", 0]]);
  assert.deepEqual(up.children.map(c => [c.key, c.floor]), [["front", 1], ["back", 1], ["left", 1], ["right", 1]], "the same walls on the next floor");
  assert.deepEqual(g.children[0].children.map(c => c.type), ["door"], "the door on the ground floor");
  assert.deepEqual(up.children[0].children.map(c => c.type), ["window"], "the window on the floor above");
  assert.deepEqual(g.children[1].children.map(c => c.type), ["window", "part"], "the part stands on the wall of the ground floor (in order along the wall)");
  assert.deepEqual(up.children[1].children, [], "not on the floor above");
  assert.deepEqual(things(g.children[2]), []);
});

test("building tree: a building with one floor has a single floor level", () => {
  const p = sanitize({width: 16, depth: 9, floors: 1, windows: [{wall: "front", floor: 0, pos: 0.5, type: "door", w: 1.4, h: 2.3}, {wall: "front", floor: 0, pos: 0.2, type: "window", w: 1, h: 1.2, sill: 0.9}]});
  const t = buildingTree(p);
  assert.deepEqual(t.children.map(c => c.floor), [0]);
  assert.deepEqual(t.children[0].children[0].children.map(c => c.type).sort(), ["door", "window"]);
  // a half floor (the attic) is a floor level too; a part with fewer floors has fewer
  assert.deepEqual(buildingTree(sanitize({floors: 1, halfStorey: true})).children.map(c => c.floor), [0, 1]);
  const q = sanitize({width: 16, depth: 9, floors: 2, wings: [{id: 1, wall: "back", pos: 0.5, width: 6, depth: 6, floors: 1}]});
  const pump = find(buildingTree(q), n => n.type === "part");
  assert.deepEqual(pump.children.map(c => [c.part, c.floor]), [[1, 0]], "one floor");
});

test("building tree: a part has its floors, and each floor its three walls, with the windows, doors and parts on them", () => {
  const t = buildingTree(house()), pump = find(t, n => n.type === "part" && n.id === 1);
  assert.deepEqual(pump.children.map(c => [c.part, c.floor]), [[1, 0]]);
  assert.deepEqual(pump.children[0].children.map(c => c.key), ["w1End", "w1Left", "w1Right"]);
  const end = pump.children[0].children[0];
  assert.deepEqual(things(end).map(c => c.type), ["window"]);
  const left = pump.children[0].children[1], shed = left.children.find(c => c.type === "part");
  assert.equal(shed.id, 2, "the shed stands on the pump house's left wall");
  assert.deepEqual(shed.children[0].children.map(c => c.key), ["w2End", "w2Left", "w2Right"]);
  assert.deepEqual(things(shed).map(c => c.type), ["door"]);
  assert.deepEqual(t.lost, []);
});

test("building tree: windows on a floor the building doesn't have are not in it; parts left out are marked and what hangs on them is listed apart", () => {
  const p = sanitize({width: 16, depth: 9, floors: 1, windows: [{wall: "back", floor: 0, pos: 0.5, type: "window", w: 1, h: 1.2, sill: 0.9}, {wall: "back", floor: 2, pos: 0.7, type: "window", w: 1, h: 1.2, sill: 0.9}, {wall: "front", floor: 0, pos: 0.5, type: "door", w: 1, h: 2.1}]});
  assert.equal(things(buildingTree(p).children[0].children[1]).length, 1);
  const q = sanitize({width: 16, depth: 9, wings: [{id: 1, wall: "back", pos: 0.5, width: 6, depth: 6}, {id: 2, wall: "back", pos: 0.52, width: 6, depth: 6}, {id: 3, wall: "w2End", pos: 0.5, width: 2.5, depth: 2.5}]});
  const t = buildingTree(q), off = find(t, n => n.type === "part" && n.id === 2);
  assert.ok(off && off.off, "left out, marked");
  assert.deepEqual(off.children, [], "and with no floors");
  assert.deepEqual(t.lost.map(x => x.id), [3], "the part on it is listed apart");
});

test("the Building tab comes first and holds the tree; the parts are no longer a section of Shape (there is no Shape tab)", () => {
  assert.deepEqual(TABS.map(t => t[0]), ["building", "inside", "settings", "game"]);
  assert.deepEqual(SCHEMA.filter(g => g.tab === "building" && !g.detail).map(g => [g.title, g.custom]), [["Building", "tree"]]);
  assert.ok(!SCHEMA.some(g => g.custom === "wings"), "the old parts editor is gone");
});

test("the game objects are a node of their own after the building: each object, by the name its kind gives it", () => {
  const cow = sanitize({kind: "cow", width: 16, depth: 9}), t = buildingTree(cow);
  assert.equal(t.game.type, "game");
  const flat = t.game.children.flatMap(c => c.type === "group" ? c.children : [c]);
  assert.ok(flat.length >= 3, "the pasture, the troughs ...");
  assert.deepEqual(flat.map(c => c.type), flat.map(() => "object"));
  assert.ok(flat.every(c => Number.isInteger(c.id) && c.name && c.otype), "id, name and type");
  assert.ok(flat.some(c => c.otype === "pasture"));
  assert.deepEqual([...flat.map(c => c.id)].sort(), cow.objects.map(o => o.id).sort(), "all of them");
  // a building without any (the kinds' lists decide) has no node
  assert.ok(buildingTree(sanitize({})).game === null || buildingTree(sanitize({})).game.type === "game");
});
