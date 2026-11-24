// Game objects on the posts of a mod (docs/PLAN_MOD.md): the objects of one building or prop, in its own coordinates, added and taken away by group (a shop counter comes
// with its delivery place), and the objects the game takes only one of (a sleep point) when two posts both have it. Pure functions of lib/modObjects.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GROUPS, groupsFree, addGroup, removeGroup, setObjectOf, clashes, settingsFor, groupOf } from "../src/lib/modObjects.mjs";

const post = (id, objects = [], extra = {}) => ({id, kind: "building", ref: "r" + id, type: "", x: 0, z: 0, rot: 0, name: "Post " + id, missing: false, objects, ...extra});
const house = {width: 10, depth: 8, foundation: 0.4};

test("the groups a post can take are the shared ones, named for the player", () => {
  assert.deepEqual(GROUPS.map(g => g.id), ["sleep", "workshop", "vehicleshop", "intake", "pump", "warehouse"]);
  assert.ok(GROUPS.every(g => g.name && g.types.length));
  assert.equal(groupOf("spawn"), "vehicleshop");
  assert.equal(groupOf("pasture"), null);
});

test("adding a group puts all its objects on the post where they go to start with, with ids of their own", () => {
  const list = addGroup([post("a")], "a", "vehicleshop", settingsFor(house));
  const objs = list[0].objects;
  assert.deepEqual(objs.map(o => o.type).sort(), ["counter", "spawn"]);
  assert.deepEqual(objs.map(o => o.id), [1, 2]);
  const more = addGroup(list, "a", "sleep", settingsFor(house));
  assert.deepEqual(more[0].objects.map(o => o.id), [1, 2, 3], "the next id after the highest");
  assert.equal(addGroup(more, "a", "sleep", settingsFor(house)), more, "a group the post has already is not added twice");
  assert.deepEqual(list[0].objects.length, 2, "the list given is not changed");
});

test("which groups can still be added to a post", () => {
  const list = addGroup([post("a")], "a", "sleep", settingsFor(house));
  const free = groupsFree(list[0]).map(g => g.id);
  assert.ok(!free.includes("sleep") && free.includes("workshop") && free.length === GROUPS.length - 1);
});

test("taking an object away takes its whole group with it", () => {
  let list = addGroup([post("a")], "a", "vehicleshop", settingsFor(house));
  list = addGroup(list, "a", "sleep", settingsFor(house));
  const counter = list[0].objects.find(o => o.type === "counter");
  const left = removeGroup(list, "a", counter.id);
  assert.deepEqual(left[0].objects.map(o => o.type), ["sleep"]);
});

test("changing an object keeps its numbers within the editor's limits", () => {
  const list = addGroup([post("a")], "a", "sleep", settingsFor(house));
  const o = list[0].objects[0];
  const next = setObjectOf(list, "a", o.id, {x: 3.5, w: 999, h: 0});
  const c = next[0].objects[0];
  assert.equal(c.x, 3.5);
  assert.equal(c.w, 70, "the widest an object can be");
  assert.equal(c.h, 0.2, "the lowest");
  assert.equal(list[0].objects[0].x, o.x, "the list given is not changed");
});

test("two posts with the same one-of-a-kind object are told apart: the game takes one in a placeable", () => {
  let list = [post("a"), post("b"), post("c")];
  list = addGroup(list, "a", "sleep", settingsFor(house));
  list = addGroup(list, "b", "sleep", settingsFor(house));
  list = addGroup(list, "c", "workshop", settingsFor(house));
  const found = clashes(list);
  assert.equal(found.length, 1);
  assert.equal(found[0].group, "sleep");
  assert.deepEqual(found[0].posts, ["Post a", "Post b"]);
  assert.deepEqual(clashes([post("a")]), []);
});

test("a prop has settings from its size, so the defaults fit it", () => {
  const s = settingsFor({width: 3, depth: 2, foundation: 0});
  assert.ok(s.width >= 3 && s.depth >= 2, "never smaller than the prop (a house has a least size)");
  const list = addGroup([post("p", [], {kind: "prop"})], "p", "workshop", s);
  assert.ok(list[0].objects[0].w > 0);
});
