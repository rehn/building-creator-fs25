// A mod with hens (docs/PLAN_MOD.md): the hen yard's game objects (feed pad, animal trailer spot, egg pallets, info area, the fence) belong to the mod, and the whole mod is
// then ONE chicken barn placeable, exported the way a hen house is (kinds/chicken.mjs henScene), with the mod's buildings cut out of the animals' walking area.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeModPackage } from "../src/editor/modExport.mjs";
import { addGroup, removeGroup, groupsFree, settingsFor, groupOf, GROUPS } from "../src/lib/modObjects.mjs";

const text = bytes => (typeof bytes === "string" ? bytes : Buffer.from(bytes).toString("latin1"));
const posts = [
  {id: "a", kind: "building", name: "Huset", x: 20, z: 10, y: 0, rot: 0, data: {kind: "house", width: 10, depth: 8}},
  {id: "b", kind: "building", name: "Ladan", x: 40, z: 10, y: 0, rot: 90, data: {kind: "shed", width: 8, depth: 6}},
];
const yard = () => addGroup([], "hens", settingsFor({width: 30, depth: 12}), [30, 10]);

test("the hen group is the feed pad, trailer spot, egg pallets, info area and a fence of posts, put round where the mod is", () => {
  const objects = yard();
  assert.deepEqual(objects.map(o => o.type).sort(), ["food", "info", "loading", "pallets", "pasture"]);
  assert.ok(GROUPS.some(g => g.id === "hens"), "the page offers it");
  assert.ok(objects.every(o => groupOf(o.type) === "hens"));
  const fence = objects.find(o => o.type === "pasture");
  assert.ok(Array.isArray(fence.points) && fence.points.length >= 4, "a fence the player can shape: its posts");
  const xs = fence.points.map(q => q[0]), zs = fence.points.map(q => q[1]);
  assert.ok(Math.min(...xs) > 30 - 30 && Math.max(...xs) < 30 + 40 && Math.min(...zs) > 10 - 30 && Math.max(...zs) < 10 + 40, "near the mod: " + JSON.stringify(fence.points));
  assert.equal(new Set(objects.map(o => o.id)).size, objects.length, "ids of their own");
});

test("a mod has one hen yard: it is not offered again, and it comes and goes as a whole", () => {
  const objects = yard();
  assert.ok(!groupsFree(objects).some(g => g.id === "hens"));
  assert.equal(addGroup(objects, "hens", settingsFor({width: 30, depth: 12})), objects);
  const left = removeGroup([...objects, ...addGroup([], "sleep", settingsFor({width: 30, depth: 12}))], objects.find(o => o.type === "food").id);
  assert.deepEqual(left.map(o => o.type), ["sleep"], "the whole yard goes");
});

test("a mod with hens is a chicken barn placeable with the yard's husbandry, as the hen house writes it", async () => {
  const {files, middle} = await makeModPackage({name: "Hönsgården", posts, objects: yard(), hens: 40});
  const xml = text(files.get("house.xml")), i3d = text(files.get("house.i3d"));
  assert.match(xml, /<placeable type="chickenHusbandryPasture">/);
  assert.match(xml, /<husbandry saveId="Animals_CHICKEN"/);
  assert.match(xml, /baseMaxNumAnimals="40" maxNumAnimals="40"/, "the hens the mod was asked for");
  for (const n of ["exactFillRootNodeFood", "loadingTrigger", "infoTrigger", "palletTrigger", "teleportNode", "markerFood", "markerAnimals", "palletAreaStart01", "navigationRootNode", "fence1Node1"])
    assert.ok(i3d.includes(`name="${n}"`), n + " is a node");
  assert.match(xml, /<animals type="CHICKEN"/);
  assert.equal((xml.match(/<hotspots>/g) || []).length, 1, "one hotspots block");
  assert.equal((xml.match(/<triggerMarkers>/g) || []).length, 1, "one triggerMarkers block");
  assert.equal((xml.match(/<animatedObjects>/g) || []).length, 1, "the doors of the buildings are still there, once");
  // every node the XML names is in the i3d
  for (const m of xml.matchAll(/(?:node|triggerNode|startNode|endNode|exactFillRootNode|rootNode|linkNode|teleportNode|spawnNode)="([A-Za-z0-9_]+)"/g)) if (m[1] !== "0") assert.ok(i3d.includes(`name="${m[1]}"`), `${m[1]} is a node of the i3d`);
  // the fence is the mod's, moved by minus the middle
  const fence = yard().find(o => o.type === "pasture").points, posts1 = [...i3d.matchAll(/name="fence1Node1" translation="([^"]+)"/g)];
  assert.equal(posts1.length, 1);
  assert.ok(fence.length >= 4 && (i3d.match(/name="fence1Node\d+"/g) || []).length === fence.length, "one node per post");
  const got = posts1[0][1].split(" ").map(Number), a = fence[0], b = fence[fence.length - 1], want = [[a[0] - middle[0], a[1] - middle[1]], [b[0] - middle[0], b[1] - middle[1]]];
  assert.ok(want.some(w => Math.abs(got[0] - w[0]) < 0.01 && Math.abs(got[2] - w[1]) < 0.01), "the first node is a post of the fence: " + got + " vs " + JSON.stringify(want));
});

test("the buildings are cut out of the animals' walking area, one blocker for each", async () => {
  const {files} = await makeModPackage({name: "Hönsgården", posts, objects: yard()});
  const i3d = text(files.get("house.i3d"));
  assert.ok(i3d.includes('name="navmeshBlocker"') && i3d.includes('name="navmeshBlocker2"'), "a blocker for the house and one for the barn");
  assert.ok(!i3d.includes('name="navmeshBlocker3"'));
});

test("with a sleep point too, the placeable is the mod's own type built on the chicken barn", async () => {
  const objects = [...yard(), ...addGroup([], "sleep", settingsFor({width: 30, depth: 12}), [30, 10]).map(o => ({...o, id: o.id + 10}))];
  const {files} = await makeModPackage({name: "Hönsgården", posts, objects});
  assert.match(text(files.get("modDesc.xml")), /parent="chickenHusbandryPasture"/);
  assert.match(text(files.get("modDesc.xml")), /<specialization name="farmhouse"\/>/);
  assert.match(text(files.get("house.xml")), /<farmhouse spawnNode="spawnPoint">/);
  assert.match(text(files.get("house.xml")), /<husbandry saveId="Animals_CHICKEN"/);
});

test("without the group the mod is as before: no husbandry, no chicken placeable", async () => {
  const {files} = await makeModPackage({name: "Gården", posts});
  const xml = text(files.get("house.xml"));
  assert.ok(!/husbandry|chickenHusbandryPasture/.test(xml));
});

// ---- the fence's posts and the hens, as the page edits them ----
import { setPoint, addPoint, removePoint, hensOfData, MIN_POSTS } from "../src/lib/modObjects.mjs";

const fenceOf = objects => objects.find(o => o.type === "pasture");

test("a post of the fence is moved to a place (to a millimetre, within the editor's limits), the others stay", () => {
  const objects = yard(), f = fenceOf(objects), moved = setPoint(objects, f.id, 1, {x: 33.3333, z: -7});
  assert.deepEqual(fenceOf(moved).points[1], [33.333, -7]);
  assert.deepEqual(fenceOf(moved).points[0], f.points[0]);
  assert.deepEqual(fenceOf(setPoint(objects, f.id, 1, {x: 9999, z: -9999})).points[1], [80, -80], "kept within the limits");
  assert.equal(setPoint(objects, f.id, 99, {x: 1, z: 1}), objects, "no such post: nothing changes");
  assert.deepEqual(objects.find(o => o.type === "food"), moved.find(o => o.type === "food"));
});

test("a new post goes in after a post, in the middle of that stretch of fence (the last stretch closes to the first)", () => {
  const objects = yard(), f = fenceOf(objects), n = f.points.length;
  const more = fenceOf(addPoint(objects, f.id, 0)).points;
  assert.equal(more.length, n + 1);
  const mid = (a, b) => [Math.round((a[0] + b[0]) / 2 * 1000) / 1000, Math.round((a[1] + b[1]) / 2 * 1000) / 1000];
  assert.deepEqual(more[1], mid(f.points[0], f.points[1]));
  const last = fenceOf(addPoint(objects, f.id, n - 1)).points;
  assert.deepEqual(last[n], mid(f.points[n - 1], f.points[0]));
});

test("a post can be taken away while the fence keeps three; the fence has at most as many posts as the editor allows", () => {
  let objects = yard();
  const f = fenceOf(objects);
  objects = removePoint(objects, f.id, 0);
  assert.equal(fenceOf(objects).points.length, f.points.length - 1);
  while (fenceOf(objects).points.length > MIN_POSTS) objects = removePoint(objects, f.id, 0);
  assert.equal(fenceOf(objects).points.length, MIN_POSTS);
  assert.equal(removePoint(objects, f.id, 0), objects, "three stay");
  for (let i = 0; i < 60; i++) objects = addPoint(objects, f.id, 0);
  assert.equal(fenceOf(objects).points.length, 40, "MAX_FENCE_POINTS");
});

test("the number of hens is kept in the mod's data, between 1 and the barn's most, 30 to start with", () => {
  assert.equal(hensOfData(undefined), 30);
  assert.equal(hensOfData({hens: 120}), 120);
  assert.equal(hensOfData({hens: 0}), 1);
  assert.equal(hensOfData({hens: 99999}), 360);
  assert.equal(hensOfData({hens: "x"}), 30);
});

// ---- the fence starts on the side the door faces ----
import { entranceWall } from "../src/lib/modObjects.mjs";

const centre = pts => [pts.reduce((s, q) => s + q[0], 0) / pts.length, pts.reduce((s, q) => s + q[1], 0) / pts.length];

test("the entrance wall is the side of the mod the first building's ground floor door faces, turned with the building", () => {
  const b = (doorWall, rot = 0) => ({kind: "building", x: 0, z: 0, rot, data: {kind: "house", width: 10, depth: 8, doorWall}});
  assert.equal(entranceWall([b("front")]), "front");
  assert.equal(entranceWall([b("back")]), "back");
  assert.equal(entranceWall([b("left")]), "left");
  assert.equal(entranceWall([b("front", 90)]), "right", "turned a quarter, the front faces +x (three.js turns x' = x cos + z sin)");
  assert.equal(entranceWall([b("front", 180)]), "back");
  assert.equal(entranceWall([{kind: "prop", rot: 0, data: {}}, b("left")]), "left", "a prop has no door");
  assert.equal(entranceWall([]), "back", "nothing to go by: the back, as before");
});

test("a hen yard goes on the wall asked for: its fence stands out on that side of the mod, not on the opposite one", () => {
  const p = settingsFor({width: 30, depth: 12}), mid = [0, 0];
  for (const [wall, axis, sign] of [["front", 1, 1], ["back", 1, -1], ["right", 0, 1], ["left", 0, -1]]) {
    const objects = addGroup([], "hens", p, mid, {wall}), f = objects.find(o => o.type === "pasture");
    assert.equal(f.wall, wall);
    assert.ok(sign * centre(f.points)[axis] > 0, `${wall}: the fence is on its side ${JSON.stringify(f.points)}`);
  }
});

// ---- a fence post snaps to the buildings, and one inside a building is told ----
import { snapFencePost, postsInside } from "../src/editor/modPlan.mjs";

const rects = [{x0: 0, x1: 10, z0: 0, z1: 6}];

test("a fence post near a corner of a building goes to the corner, near a wall onto the line of the wall, else to the grid", () => {
  assert.deepEqual(snapFencePost([10.4, 6.3], rects), [10, 6], "a corner within 80 cm");
  assert.deepEqual(snapFencePost([4.1, 6.3], rects), [4, 6], "onto the line of the wall (40 cm), along it to the grid");
  assert.deepEqual(snapFencePost([20.1, 14.9], rects), [20, 15], "the 25 cm grid");
  assert.deepEqual(snapFencePost([20.1, 14.9], rects, {off: true}), [20.1, 14.9], "Alt: where it is, to a centimetre");
});

test("a fence post is never inside a building: it is put out through the nearest side", () => {
  assert.deepEqual(snapFencePost([5, 5], rects), [5, 6]);
  assert.deepEqual(snapFencePost([1.5, 3], rects), [0, 3]);
});

test("the posts that stand inside a building are found, and the mod says so when it is made", async () => {
  assert.deepEqual(postsInside([[5, 3], [11, 3], [0, 0], [5, 6.001]], rects), [0], "on a wall is not inside");
  const bad = [{id: "a", kind: "building", name: "Huset", x: 20, z: 10, y: 0, rot: 0, data: {kind: "house", width: 10, depth: 8}}];
  const objects = yard().map(o => (o.type === "pasture" ? {...o, points: [[20, 10], [20, -5], [45, -5], [45, 10]]} : o));
  const {warnings} = await makeModPackage({name: "Hönsgården", posts: bad, objects});
  assert.ok(warnings.some(w => /post/i.test(w) && /inside/i.test(w)), JSON.stringify(warnings));
  const fine = await makeModPackage({name: "Hönsgården", posts: bad, objects: yard()});
  assert.ok(!fine.warnings.some(w => /inside/i.test(w)), JSON.stringify(fine.warnings));
});

// ---- the warning in the editor ----
import { feetOf } from "../src/editor/modPlan.mjs";
import { fenceProblems } from "../src/lib/modObjects.mjs";

test("what the posts stand on seen from above: each post's footprint at its place (turned)", () => {
  const b = {min: [-5, 0, -4], max: [5, 3, 4]};
  assert.deepEqual(feetOf([{x: 20, z: 10, rot: 0, bounds: b}]), [{x0: 15, x1: 25, z0: 6, z1: 14}]);
  assert.deepEqual(feetOf([{x: 0, z: 0, rot: 90, bounds: b}]), [{x0: -4, x1: 4, z0: -5, z1: 5}], "turned a quarter, the sides change places");
});

test("the fences with a post inside a building: Map fence id -> the posts (0-based), none for a fence that is clear", () => {
  const objects = yard(), f = objects.find(o => o.type === "pasture");
  assert.equal(fenceProblems(objects, [{x0: 0, x1: 1, z0: 0, z1: 1}]).size, 0);
  const wrecked = objects.map(o => (o === f ? {...o, points: [[20, 10], [20, -5], [45, -5], [45, 10]]} : o));
  const got = fenceProblems(wrecked, [{x0: 15, x1: 25, z0: 6, z1: 14}]);
  assert.deepEqual([...got.keys()], [f.id]);
  assert.deepEqual(got.get(f.id).posts, [0]);
  assert.deepEqual(got.get(f.id).edges, [], "the stretches that end in that post are not told again");
  assert.equal(fenceProblems([], []).size, 0);
});

// ---- a stretch of fence through a building (seen in the game: the stretch from post 5 to 6 ran 3 cm into the house) ----
import { edgesThrough } from "../src/editor/modPlan.mjs";

test("the stretches of fence that run through a building are found, one that only touches or follows a wall is not", () => {
  const house = [{x0: 0, x1: 10, z0: 0, z1: 6}];
  // posts all outside, a stretch (post 1 to 2) across the corner of the house
  assert.deepEqual(edgesThrough([[-2, 3], [3, -2], [12, -2], [12, 8], [-2, 8]], house), [0], "the first stretch cuts across the corner of the house");
  assert.deepEqual(edgesThrough([[-1, -1], [11, -1], [11, 7], [-1, 7]], house), [], "a fence round the house");
  assert.deepEqual(edgesThrough([[0, 6], [10, 6], [10, 12], [0, 12]], house), [], "the first stretch runs along the wall: touching is not through");
  // the case from the game: the stretch rises 15 cm over 3 m and ends on the wall line, so it is inside the house for 68 cm, 3 cm deep at most
  const wall = [{x0: -6.005, x1: 0.855, z0: -4.367, z1: 1.525}];
  const game = [[0.855, 1.525], [4.425, 1.375], [4.425, 8.625], [-8.575, 8.625], [-8.575, 1.375], [-5.325, 1.525]];
  assert.deepEqual(edgesThrough(game, wall), [4], "post 5 to 6");
  // snapped onto the wall line the same fence is clear
  assert.deepEqual(edgesThrough(game.map(([x, z]) => [x, z === 1.375 ? 1.525 : z]), wall), []);
});
