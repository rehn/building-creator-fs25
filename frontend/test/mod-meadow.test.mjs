// The grass of a hen yard ends a little outside the walls of the building at the fence (Lars: not so much grass up to the walls and in at an opening): the husbandry gets a clear task round
// the building as the cow barn has (kinds/cow.mjs meadowClear: a polygon, no fruit, bare ground), made from the outline of the real footprint of the building nearest the fence, grown 50 cm.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeModPackage } from "../src/editor/modExport.mjs";
import { addGroup, settingsFor } from "../src/lib/modObjects.mjs";

const text = bytes => (typeof bytes === "string" ? bytes : Buffer.from(bytes).toString("latin1"));
const house = {id: "a", kind: "building", name: "Huset", x: 20, z: 10, y: 0, rot: 0, data: {kind: "house", width: 10, depth: 8}};   // x 15 to 25, z 6 to 14
const barn = {id: "b", kind: "building", name: "Ladan", x: 60, z: 10, y: 0, rot: 0, data: {kind: "shed", width: 8, depth: 6}};      // x 56 to 64, z 7 to 13
const fenceNear = pts => addGroup([], "hens", settingsFor({width: 10, depth: 8}), [20, 10], {wall: "back"}).map(o => (o.type === "pasture" ? {...o, points: pts} : o));
const nodesOf = i3d => [...i3d.matchAll(/name="clearAreaPoint\d+" translation="([^"]+)"/g)].map(m => m[1].split(" ").map(Number));

test("a mod with a hen yard clears the grass round the building at the fence: a polygon 50 cm out from its walls, in the husbandry's clear task", async () => {
  // a fence out from the back wall (z 6) of the house
  const {files, middle} = await makeModPackage({name: "Hönsgården", posts: [house], objects: fenceNear([[25, 6], [25, -2], [15, -2], [15, 6]])});
  const xml = text(files.get("house.xml")), i3d = text(files.get("house.i3d"));
  assert.match(xml, /<clearTask>[\s\S]*<polygon>[\s\S]*<node node="clearAreaPoint1"\/>[\s\S]*<\/polygon>[\s\S]*<\/clearTask>/);
  assert.match(xml, /<terrainGroundType name="dirt"\/>/);
  const pts = nodesOf(i3d);
  assert.ok(pts.length >= 4, "a polygon");
  const xs = pts.map(p => p[0] + middle[0]), zs = pts.map(p => p[2] + middle[1]);
  assert.ok(Math.abs(Math.min(...xs) - 14.5) < 0.01 && Math.abs(Math.max(...xs) - 25.5) < 0.01, `50 cm out in x: ${Math.min(...xs)} to ${Math.max(...xs)}`);
  assert.ok(Math.abs(Math.min(...zs) - 5.5) < 0.01 && Math.abs(Math.max(...zs) - 14.5) < 0.01, `50 cm out in z: ${Math.min(...zs)} to ${Math.max(...zs)}`);
  for (const m of xml.matchAll(/<node node="(clearAreaPoint\d+)"\/>/g)) assert.ok(i3d.includes(`name="${m[1]}"`), m[1] + " is a node");
});

test("with several buildings it is the one nearest the fence; without a hen yard there is no clear task", async () => {
  const near = await makeModPackage({name: "Hönsgården", posts: [house, barn], objects: fenceNear([[64, 13], [64, 22], [56, 22], [56, 13]])});
  const pts = nodesOf(text(near.files.get("house.i3d"))).map(p => [p[0] + near.middle[0], p[2] + near.middle[1]]);
  assert.ok(pts.length >= 4 && pts.every(([x]) => x > 55 && x < 65), "round the barn, which the fence is at: " + JSON.stringify(pts));
  const none = await makeModPackage({name: "Gården", posts: [house]});
  assert.ok(!/clearTask/.test(text(none.files.get("house.xml"))));
});
