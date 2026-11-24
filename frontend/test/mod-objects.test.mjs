// Game objects of a mod (docs/PLAN_MOD.md): the whole mod is ONE placeable, so they belong to the mod (mod.data.objects), one of each group, in the mod's coordinates; added and
// taken away by group (a shop counter comes with its delivery place). Pure functions of lib/modObjects.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GROUPS, groupsFree, addGroup, removeGroup, setObjectOf, settingsFor, groupOf, objectsOfData } from "../src/lib/modObjects.mjs";

const house = settingsFor({width: 10, depth: 8, foundation: 0.4});

test("the groups the mod can take are the shared ones and the hen yard, named for the player", () => {
  assert.deepEqual(GROUPS.map(g => g.id), ["sleep", "workshop", "vehicleshop", "intake", "pump", "warehouse", "hens"]);
  assert.ok(GROUPS.every(g => g.name && g.types.length));
  assert.equal(groupOf("spawn"), "vehicleshop");
  assert.equal(groupOf("pasture"), "hens", "the fence is part of the hen yard");
  assert.equal(groupOf("feedTrough"), null, "the other animals' objects are not here yet");
});

test("adding a group puts all its objects where they go to start with, moved to the middle of the mod, with ids of their own", () => {
  const list = addGroup([], "vehicleshop", house, [20, -5]);
  assert.deepEqual(list.map(o => o.type).sort(), ["counter", "spawn"]);
  assert.deepEqual(list.map(o => o.id), [1, 2]);
  const plain = addGroup([], "vehicleshop", house);
  assert.ok(Math.abs(list[0].x - plain[0].x - 20) < 1e-9 && Math.abs(list[0].z - plain[0].z + 5) < 1e-9, "moved by the middle given");
  const more = addGroup(list, "sleep", house);
  assert.deepEqual(more.map(o => o.id), [1, 2, 3], "the next id after the highest");
  assert.equal(addGroup(more, "sleep", house), more, "the game takes one of each: a group the mod has is not added twice");
  assert.equal(list.length, 2, "the list given is not changed");
});

test("which groups can still be added", () => {
  assert.equal(groupsFree([]).length, GROUPS.length);
  const free = groupsFree(addGroup([], "sleep", house)).map(g => g.id);
  assert.ok(!free.includes("sleep") && free.includes("workshop") && free.length === GROUPS.length - 1);
});

test("taking an object away takes its whole group with it", () => {
  const list = addGroup(addGroup([], "vehicleshop", house), "sleep", house);
  const counter = list.find(o => o.type === "counter");
  assert.deepEqual(removeGroup(list, counter.id).map(o => o.type), ["sleep"]);
  assert.equal(removeGroup(list, 999), list, "an object that is not there: nothing changes");
});

test("changing an object keeps its numbers within the editor's limits", () => {
  const list = addGroup([], "sleep", house), o = list[0];
  const c = setObjectOf(list, o.id, {x: 3.5, w: 999, h: 0})[0];
  assert.equal(c.x, 3.5);
  assert.equal(c.w, 70, "the widest an object can be");
  assert.equal(c.h, 0.2, "the lowest");
  assert.equal(list[0].x, o.x, "the list given is not changed");
});

test("the mod's objects come out of its plan data as a list, whatever is in it", () => {
  assert.deepEqual(objectsOfData(undefined), []);
  assert.deepEqual(objectsOfData({objects: "no"}), []);
  assert.deepEqual(objectsOfData({objects: [{id: 1, type: "sleep"}, null, {type: "x"}, {id: "a", type: "x"}]}), [{id: 1, type: "sleep"}]);
});

test("a prop's size is enough for the defaults (a house has a least size)", () => {
  const s = settingsFor({width: 3, depth: 2, foundation: 0});
  assert.ok(s.width >= 3 && s.depth >= 2);
  assert.ok(addGroup([], "workshop", s)[0].w > 0);
});
