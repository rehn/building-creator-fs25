// The mod's list of posts (docs/PLAN_MOD.md step 3): what the /mods pages do to it before it is saved (the server keeps the list, backend/internal/store/mods.go).
import { test } from "node:test";
import assert from "node:assert/strict";
import { addPost, removePost, setPostType, placePost, countsOf, choices, payload } from "../src/lib/mods.mjs";

const post = (id, kind, ref, extra = {}) => ({id, kind, ref, type: "", x: 0, z: 0, rot: 0, name: ref, missing: false, ...extra});

test("a new post is a plain building or prop, one row further along than the last, and the same thing is not added twice", () => {
  let list = addPost([], "building", "h1");
  assert.deepEqual(list, [{id: "", kind: "building", ref: "h1", type: "", x: 0, z: 0, rot: 0}]);
  list = addPost(list, "prop", "p1");
  assert.equal(list.length, 2);
  assert.ok(list[1].x > list[0].x, "placed beside the first, not on top of it");
  assert.equal(addPost(list, "building", "h1"), list, "already in the mod: the list stays as it is");
});

test("removing and setting the type leave the others and do not change the list given", () => {
  const list = [post("a", "building", "h1"), post("b", "prop", "p1")];
  const without = removePost(list, "a");
  assert.deepEqual(without.map(p => p.id), ["b"]);
  const typed = setPostType(list, "a", "shop");
  assert.equal(typed[0].type, "shop");
  assert.equal(typed[1], list[1]);
  assert.equal(list[0].type, "", "the original is untouched");
});

test("counts for the tabs", () => {
  assert.deepEqual(countsOf([]), {building: 0, prop: 0});
  assert.deepEqual(countsOf([post("a", "building", "h1"), post("b", "building", "h2"), post("c", "prop", "p1")]), {building: 2, prop: 1});
});

test("what can be added: the projects of that kind that are not in the mod yet", () => {
  const projects = [{id: "h1", kind: "house"}, {id: "h2", kind: "cow"}, {id: "p1", kind: "prop"}, {id: "p2", kind: "prop"}, {id: "h3"}];
  const list = [post("a", "building", "h1"), post("b", "prop", "p1")];
  assert.deepEqual(choices(projects, list, "building").map(p => p.id), ["h2", "h3"], "a project with no kind is a farmhouse");
  assert.deepEqual(choices(projects, list, "prop").map(p => p.id), ["p2"]);
});

test("what is sent to the server has only what it stores", () => {
  const sent = payload([post("a", "building", "h1", {type: "shop", x: 2, z: -1, rot: 90, missing: true})]);
  assert.deepEqual(sent, [{id: "a", kind: "building", ref: "h1", type: "shop", x: 2, z: -1, rot: 90}]);
});

test("placing a post changes its place only, and keeps the turn within 0 to 360", () => {
  const list = [post("a", "building", "h1", {x: 1}), post("b", "prop", "p1")];
  const moved = placePost(list, "a", {x: 5.5, z: -2});
  assert.deepEqual([moved[0].x, moved[0].z, moved[0].rot], [5.5, -2, 0]);
  assert.equal(moved[1], list[1]);
  assert.equal(placePost(list, "a", {rot: -90})[0].rot, 270);
  assert.equal(placePost(list, "a", {rot: 450})[0].rot, 90);
  assert.equal(list[0].x, 1, "the original is untouched");
});
