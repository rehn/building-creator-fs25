// The fence in the building tree is a folder with a node for each of its posts, once the fence is drawn by hand.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildingTree, PRESETS } from "../src/editor/model.mjs";
import { fencePoints } from "../src/editor/objects.mjs";

const barn = () => sanitize({...PRESETS.find(x => x.id === "ladugard").settings});
const pastureNode = p => buildingTree(p).game.children.find(c => c.otype === "pasture");

test("fence in the tree: a rectangle has no posts of its own to choose", () => {
  assert.deepEqual(pastureNode(barn()).children || [], []);
});

test("fence in the tree: a hand-drawn fence has a post node for each post, in order, with where it starts and stops", () => {
  const p0 = barn(), points = fencePoints(p0);
  const p = sanitize({...p0, objects: p0.objects.map(o => o.type === "pasture" ? {...o, points} : o)});
  const node = pastureNode(p), pasture = p.objects.find(o => o.type === "pasture");
  assert.equal(node.children.length, pasture.points.length);
  assert.deepEqual(node.children.map(c => c.index), pasture.points.map((_, i) => i));
  assert.ok(node.children.every(c => c.type === "post" && c.id === pasture.id));
  assert.deepEqual(node.children.map(c => c.name).slice(0, 2), ["Post 1", "Post 2"]);
  assert.equal(node.children[0].role, "start");
  assert.equal(node.children.at(-1).role, "stop");
  assert.equal(node.children[1].role, "");
});
