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
  assert.deepEqual(objects.map(o => o.type).sort(), ["feedTrough", "food", "info", "loading", "pallets", "pasture", "waterTrough"]);
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

test("the buildings are cut out of the animals' walking area, one blocker for each (and one for each trough)", async () => {
  const {files} = await makeModPackage({name: "Hönsgården", posts, objects: yard()});
  const i3d = text(files.get("house.i3d"));
  assert.ok(i3d.includes('name="navmeshBlocker"') && i3d.includes('name="navmeshBlocker2"'), "a blocker for the house and one for the barn");
  assert.equal((i3d.match(/name="navmeshBlocker\d*"/g) || []).length, 4, "the house, the barn, the feed trough and the water trough");
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

test("a fence post near a corner of a building goes to the corner, near a wall onto the line of the wall (as in the cow pasture), else to the grid", () => {
  assert.deepEqual(snapFencePost([10.4, 6.3], rects), [10, 6], "a corner within 80 cm");
  assert.deepEqual(snapFencePost([4.1, 6.3], rects), [4, 6], "onto the line of the wall (40 cm), along it to the grid");
  assert.deepEqual(snapFencePost([20.1, 14.9], rects), [20, 15], "the 25 cm grid");
  assert.deepEqual(snapFencePost([20.1, 14.9], rects, {off: true}), [20.1, 14.9], "Alt: where it is, to a centimetre");
});

test("a fence post is never inside a building: it is put out through the nearest side", () => {
  assert.deepEqual(snapFencePost([5, 5], rects), [5, 6]);
  assert.deepEqual(snapFencePost([1.5, 3], rects), [0, 3]);
  assert.deepEqual(snapFencePost([5, 6.05], rects, {off: true}), [5, 6.05], "Alt: where it is");
});

test("the posts that stand inside a building are found, and the mod says so when it is made", async () => {
  assert.deepEqual(postsInside([[5, 3], [11, 3], [0, 0], [5, 6.2], [5, 6.05]], rects), [0], "on a wall (or a corner) is not inside, as in the cow pasture; only inside is told");
  const bad = [{id: "a", kind: "building", name: "Huset", x: 20, z: 10, y: 0, rot: 0, data: {kind: "house", width: 10, depth: 8}}];
  const objects = yard().map(o => (o.type === "pasture" ? {...o, points: [[20, 10], [20, -5], [45, -5], [45, 10]]} : o));
  const {warnings} = await makeModPackage({name: "Hönsgården", posts: bad, objects});
  assert.ok(warnings.some(w => /post/i.test(w) && /inside/i.test(w)), JSON.stringify(warnings));
  const fine = await makeModPackage({name: "Hönsgården", posts: bad, objects: yard()});
  assert.ok(!fine.warnings.some(w => /inside|runs through/i.test(w)), JSON.stringify(fine.warnings));
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

test("the stretches of fence that run through a building are found, one along a wall or touching a corner is not", () => {
  const house = [{x0: 0, x1: 10, z0: 0, z1: 6}];
  // posts all outside, a stretch (post 1 to 2) across the corner of the house
  assert.deepEqual(edgesThrough([[-2, 3], [3, -2], [12, -2], [12, 8], [-2, 8]], house), [0], "the first stretch cuts across the corner of the house");
  assert.deepEqual(edgesThrough([[-1, -1], [11, -1], [11, 7], [-1, 7]], house), [], "a fence round the house");
  assert.deepEqual(edgesThrough([[0, 6], [10, 6], [10, 12], [0, 12]], house), [], "the first stretch runs along the wall: touching is not through (the cow pasture has it so, and it works in the game)");
  // the stretch that went 3 cm into a house (an earlier try in the game): posts 1 and 6 on the wall line z 1.525, post 5 15 cm further north
  const wall = [{x0: -6.005, x1: 0.855, z0: -4.367, z1: 1.525}];
  const game = [[0.855, 1.525], [4.425, 1.375], [4.425, 8.625], [-9.575, 1.375], [-9.575, 1.375], [-5.325, 1.525]];
  assert.deepEqual(edgesThrough([[0.855, 1.525], [4.425, 1.375], [4.425, 8.625], [-8.575, 8.625], [-8.575, 1.375], [-5.325, 1.525]], wall), [4], "post 5 to 6");
  assert.ok(game.length === 6);
});

// ---- the hen yard starts against the house the door belongs to ----
import { entranceBuilding } from "../src/lib/modObjects.mjs";

test("the entrance building is the first building with a ground floor door on a main wall, and its wall", () => {
  const b = (doorWall, rot = 0) => ({kind: "building", x: 0, z: 0, rot, data: {kind: "house", width: 10, depth: 8, doorWall}});
  assert.deepEqual(entranceBuilding([{kind: "prop", rot: 0, data: {}}, b("left"), b("front")]), {wall: "left", index: 1});
  assert.deepEqual(entranceBuilding([b("front", 90)]), {wall: "right", index: 0});
  assert.deepEqual(entranceBuilding([]), {wall: "back", index: -1});
});

// ---- a fence round two walls of a house (as the cow barn's pasture can go), the way back round the corner ----
test("a fence that starts at one corner of a house and ends at another, round two walls, gets the way back along the house round the corner, outside the house", async () => {
  const one = [{id: "a", kind: "building", name: "Huset", x: 20, z: 10, y: 0, rot: 0, data: {kind: "house", width: 10, depth: 8}}];   // x 15 to 25, z 6 to 14 (a little more: the roof)
  const {files, middle} = await makeModPackage({name: "Hönsgården", posts: one, objects: yard()});
  const i3d0 = text(files.get("house.i3d")), blocker = i3d0.match(/name="navmeshBlocker" translation="([^"]+)"/)[1].split(" ").map(Number);
  assert.ok(blocker.length === 3, "the house is a blocker");
  // the house's own rectangle in the mod's coordinates, from the generated blocker's middle and the plan
  const mp = await import("../src/editor/modPlan.mjs"), f = mp.feetOf([{x: 20, z: 10, rot: 0, bounds: mp.boundsOf(mp.projectGroups(one[0].data)), feet: mp.buildingFeet(one[0].data)}])[0];   // the real walls: x 15 to 25, z 6 to 14
  const g = 0.15, pts = [[f.x1 + g, f.z0 - g], [f.x1 + 8, f.z0 - g], [f.x1 + 8, f.z1 + 8], [f.x0 - g, f.z1 + 8], [f.x0 - g, f.z1 + g]];   // from the NE corner, east, south, west, up to the SW corner
  const objects = yard().map(o => (o.type === "pasture" ? {...o, points: pts} : o));
  const out = await makeModPackage({name: "Hönsgården", posts: one, objects});
  assert.deepEqual(out.warnings, [], "nothing touches the house");
  const i3d = text(out.files.get("house.i3d")), xml = text(out.files.get("house.xml"));
  const contour = [...i3d.matchAll(/name="navContourNode\d+" translation="([^"]+)"/g)].map(m => m[1].split(" ").map(Number));
  assert.ok(contour.length >= 2, "the way back from the last post to the first runs round the corners of the house: " + JSON.stringify(contour));
  assert.match(xml, /<additionalNavMeshNodes>/);
  const m = out.middle, r = {x0: f.x0 - m[0], x1: f.x1 - m[0], z0: f.z0 - m[1], z1: f.z1 - m[1]};
  for (const [x, , z] of contour) assert.ok(!(x > r.x0 + 1e-6 && x < r.x1 - 1e-6 && z > r.z0 + 1e-6 && z < r.z1 - 1e-6), `${x},${z} is outside the house`);
});

test("a fence with its end posts on the wall of a house, as the cow pasture has it, gives no warning when the mod is made", async () => {
  const one = [{id: "a", kind: "building", name: "Huset", x: 20, z: 10, y: 0, rot: 0, data: {kind: "house", width: 10, depth: 8}}];
  const {feetOf, boundsOf, projectGroups, buildingFeet} = await import("../src/editor/modPlan.mjs");
  const f = feetOf([{x: 20, z: 10, rot: 0, bounds: boundsOf(projectGroups(one[0].data)), feet: buildingFeet(one[0].data)}])[0];
  const pts = [[f.x1, f.z1], [f.x1, f.z1 + 8], [f.x0, f.z1 + 8], [f.x0, f.z1]];   // from corner to corner on the south wall, out 8 m
  const objects = yard().map(o => (o.type === "pasture" ? {...o, points: pts} : o));
  const {warnings} = await makeModPackage({name: "Hönsgården", posts: one, objects});
  assert.deepEqual(warnings, []);
});

// ---- the fence snaps to the real walls of a building (its footprint: the main building and its wings), as in the cow pasture, not to the roof's edge ----
import { buildingFeet } from "../src/editor/modPlan.mjs";

test("what a building stands on is its real footprint (walls, wings), put where the post stands and turned; a prop has only its bounds", () => {
  const bounds = {min: [-5.6, 0, -4.6], max: [5.6, 6, 4.6]};   // the mesh: with the roof's overhang
  const feet = [{x0: -5, x1: 5, z0: -4, z1: 4}];
  assert.deepEqual(feetOf([{x: 20, z: 10, rot: 0, bounds, feet}]), [{x0: 15, x1: 25, z0: 6, z1: 14}], "the walls, not the roof");
  const turned = feetOf([{x: 20, z: 10, rot: 90, bounds, feet}])[0];
  assert.deepEqual([turned.x0, turned.x1, turned.z0, turned.z1].map(v => Math.round(v * 1000) / 1000), [16, 24, 5, 15], "turned a quarter");
  assert.deepEqual(feetOf([{x: 0, z: 0, rot: 0, bounds}]), [{x0: -5.6, x1: 5.6, z0: -4.6, z1: 4.6}], "no footprint (a prop): its bounds");
  const l = buildingFeet({kind: "house", width: 10, depth: 8});
  assert.deepEqual(l[0], {x0: -5, x1: 5, z0: -4, z1: 4}, "from the building's settings");
});

test("the animals' blockers are the buildings' real footprints, so they are where the walls are", async () => {
  const one = [{id: "a", kind: "building", name: "Huset", x: 20, z: 10, y: 0, rot: 0, data: {kind: "house", width: 10, depth: 8}}];
  const {files, middle} = await makeModPackage({name: "Hönsgården", posts: one, objects: yard()});
  const at = text(files.get("house.i3d")).match(/name="navmeshBlocker" translation="([^"]+)"/)[1].split(" ").map(Number);
  assert.ok(Math.abs(at[0] - (20 - middle[0])) < 0.01 && Math.abs(at[2] - (10 - middle[1])) < 0.01, "the blocker's middle is the house's own middle: " + at + " vs " + (20 - middle[0]) + "," + (10 - middle[1]));
});

// ---- a new post made by dragging a dot between two posts ----
import { insertPoint } from "../src/lib/modObjects.mjs";

test("a post put in after post i at a place the player gives (the fence has at most 40 posts)", () => {
  const objects = yard(), f = fenceOf(objects), n = f.points.length;
  const more = insertPoint(objects, f.id, 1, {x: 33.3333, z: -2});
  assert.equal(fenceOf(more).points.length, n + 1);
  assert.deepEqual(fenceOf(more).points[2], [33.333, -2]);
  assert.deepEqual(fenceOf(more).points[1], f.points[1]);
  assert.equal(insertPoint(objects, f.id, 99, {x: 1, z: 1}), objects, "no such post");
  let full = objects;
  for (let i = 0; i < 60; i++) full = insertPoint(full, f.id, 0, {x: i, z: i});
  assert.equal(fenceOf(full).points.length, 40);
});

// ---- the fence is stood 15 cm off the walls when the mod is made (the hen type has no walking shape, so a fence that touches a building gave the meadow warning in the game) ----
import { keepClear } from "../src/editor/modPlan.mjs";

test("a fence post on a wall or at a corner of a building is moved 15 cm out from it, the other posts stay", () => {
  const r = [{x0: -2, x1: 2, z0: -1.5, z1: 1.5}];
  const out = keepClear([[-2, -1.5], [-5.5, -2.75], [-5.5, -7.5], [3.5, -7.5], [3.5, -3], [2, -1.5]], r);
  assert.deepEqual(out[0], [-2.15, -1.65], "a corner: out from both walls");
  assert.deepEqual(out[5], [2.15, -1.65]);
  assert.deepEqual(out.slice(1, 5), [[-5.5, -2.75], [-5.5, -7.5], [3.5, -7.5], [3.5, -3]], "the others are not touched");
  assert.deepEqual(keepClear([[0, -1.5], [0, -9]], r)[0], [0, -1.65], "on a wall: out from it");
  assert.deepEqual(keepClear([[0, -1.6]], r), [[0, -1.6]], "already clear of it by 10 cm: stays");
  assert.deepEqual(keepClear([[0, 0]], r), [[0, 0]], "inside: left to the warning");
});

test("the generated fence stands 15 cm off the house when its posts were put on the wall", async () => {
  const one = [{id: "a", kind: "building", name: "Huset", x: 20, z: 10, y: 0, rot: 0, data: {kind: "house", width: 10, depth: 8}}];
  const mp = await import("../src/editor/modPlan.mjs"), f = mp.feetOf([{x: 20, z: 10, rot: 0, bounds: mp.boundsOf(mp.projectGroups(one[0].data)), feet: mp.buildingFeet(one[0].data)}])[0];
  const pts = [[f.x1, f.z1], [f.x1, f.z1 + 8], [f.x0, f.z1 + 8], [f.x0, f.z1]];
  const objects = yard().map(o => (o.type === "pasture" ? {...o, points: pts} : o));
  const {files, middle, warnings} = await makeModPackage({name: "Hönsgården", posts: one, objects});
  assert.deepEqual(warnings, []);
  const nodes = [...text(files.get("house.i3d")).matchAll(/name="fence1Node\d+" translation="([^"]+)"/g)].map(m => m[1].split(" ").map(Number));
  const r = {x0: f.x0 - middle[0], x1: f.x1 - middle[0], z0: f.z0 - middle[1], z1: f.z1 - middle[1]};
  const away = ([x, , z]) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
  assert.equal(nodes.length, 4);
  for (const n of nodes) assert.ok(away(n) > 0.14, `post ${n} is ${away(n)} from the house`);
});

// ---- the whole side on the wall line is stood off, not only the posts at the building (seen in the game: the posts out along the wall line stayed on it, a 15 cm jog at the ends, and the fence gave the meadow warning) ----
test("posts out along the line of a wall, beyond the building, are stood off with the ones at it, so the whole side is on one line 15 cm out", () => {
  const r = [{x0: -7.5, x1: 7.5, z0: -4.5, z1: 4.5}];
  const out = keepClear([[7.35, 4.5], [11.5, 4.5], [11.5, 14.75], [-13.25, 13.75], [-13.25, 4.5], [-7.35, 4.5]], r);
  assert.deepEqual(out.map(q => q[1]), [4.65, 4.65, 14.75, 13.75, 4.65, 4.65], "the four on the wall line, all 15 cm out");
  assert.deepEqual(out.map(q => q[0]), [7.35, 11.5, 11.5, -13.25, -13.25, -7.35], "along it nothing moves");
  assert.deepEqual(keepClear([[0, 4.5000001]], r), [[0, 4.65]]);
  assert.deepEqual(keepClear([[20, 10]], r), [[20, 10]], "far from every line it was on: stays");
  assert.deepEqual(keepClear([[0, 0]], r), [[0, 0]], "inside: left to the warning");
});

// ---- the game's fence is made of 2 m panels; a stretch whose rest (length mod 2) is between 0.6 and about 1.5 m is cut short in the game, leaving a hole ----
import { fitPanels, panelRest } from "../src/editor/modPlan.mjs";

const lengthsOf = pts => pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
const fits = L => { const r = panelRest(L); return r <= 0.56 || r >= 1.59; };

test("the stretches that the game cuts short are the ones with a rest of 0.6 to 1.5 m after the 2 m panels (read from the segments it made)", () => {
  // (length, was it cut?) from Lars savegames: FS25_HentestFencechanged, FS25_ModHons, FS25_Hons2, the cow barn and the hen yards that were whole
  for (const [L, cut] of [[24.77, true], [9.25, true], [9.0, true], [4.75, true], [7.354, true], [10.25, false], [9.603, false], [13.85, false], [14.5, false], [16, false], [4, false], [5.75, false], [3.588, false]])
    assert.equal(panelRest(L) > 0.6005 && panelRest(L) < 1.55, cut, `${L}: rest ${panelRest(L).toFixed(3)}`);   // (what the game was seen to do: not the margin the fit keeps)
});

test("fitting the posts to the panels: every stretch gets a length that is made whole and nothing moves more than about a metre", () => {
  const game = [[6.475, 4.75], [10.475, 4.6], [10.475, 14.85], [-14.275, 13.85], [-14.275, 4.6], [-8.525, 4.75]];   // the fence of FS25_HentestFencechanged as the game got it
  assert.ok(lengthsOf(game).some(L => !fits(L)), "it has stretches that are cut");
  const out = fitPanels(game);
  for (const L of lengthsOf(out)) assert.ok(fits(L), `a stretch of ${L.toFixed(3)} is cut`);
  out.forEach((q, i) => assert.ok(Math.hypot(q[0] - game[i][0], q[1] - game[i][1]) < 1.3, `post ${i + 1} moved ${Math.hypot(q[0] - game[i][0], q[1] - game[i][1])}`));
  // a stretch that is whole already is not touched: 4 m, 10.25 m
});

test("a fence that is whole already stays as it is, and any fence can be fitted: the posts follow their stretch, so a side along a wall stays along it", () => {
  const whole = [[0, 0], [9.6, 0], [9.6, 14.5], [-4, 14.5]];
  assert.deepEqual(fitPanels(whole), whole);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 200; k++) {
    const pts = Array.from({length: 2 + Math.floor(rnd() * 7)}, () => [Math.round(rnd() * 400) / 10 - 20, Math.round(rnd() * 400) / 10 - 20]);
    const out = fitPanels(pts);
    lengthsOf(out).forEach((L, i) => assert.ok(L < 0.01 || fits(L), `random ${k}: stretch ${i + 1} is ${L}`));
  }
});

test("posts on a wall line only slide along it: the free corner takes the fitting, so a side along the wall stays straight (the fence of FS25_HentestFencechanged)", () => {
  // as the export has it: the posts at the building (1, 2, 5, 6) 15 cm out from the wall, so pinned to z 4.65; the far corners (3, 4) free
  const pts = [[7.35, 4.65], [11.5, 4.65], [11.5, 14.75], [-13.25, 13.75], [-13.25, 4.65], [-7.35, 4.65]];
  const pins = [{z: true}, {z: true}, {}, {}, {z: true}, {z: true}];
  const out = fitPanels(pts, pins);
  for (const L of lengthsOf(out)) assert.ok(fits(L), `a stretch of ${L.toFixed(3)} is cut`);
  for (const i of [0, 1, 4, 5]) assert.equal(out[i][1], 4.65, `post ${i + 1} stays on the wall line`);
  out.forEach((q, i) => assert.ok(Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]) < 1.3, `post ${i + 1} moved ${Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]).toFixed(2)}`));
});

// ---- the editor tells which stretches the game would cut (a hole) ----
import { stretchCuts } from "../src/editor/modPlan.mjs";

test("the stretches the game would cut, as it gets them (the posts at the building stood 15 cm off): where, how long, how much it cuts, and the whole length the mod is made with", () => {
  const house = [{x0: -7.5, x1: 7.5, z0: -4.5, z1: 4.5}];
  const fence = [[7.35, 4.5], [11.5, 4.5], [11.5, 14.75], [-13.25, 13.75], [-13.25, 4.5], [-7.35, 4.5]];   // the fence of hentest_fencechanged, as the player put it
  const cuts = stretchCuts(fence, house);
  assert.deepEqual(cuts.map(c => c.i), [2, 3], "post 3 to 4 and post 4 to 5");
  assert.ok(Math.abs(cuts[0].length - 24.77) < 0.01 && Math.abs(cuts[0].cut - 0.17) < 0.01, JSON.stringify(cuts[0]));
  assert.ok(Math.abs(cuts[1].length - 9.1) < 0.01 && Math.abs(cuts[1].cut - 0.5) < 0.01, JSON.stringify(cuts[1]));
  assert.ok(cuts.every(c => fits(c.to)), "the length it is made with is whole");
  assert.deepEqual(stretchCuts([[0, 0], [9.6, 0], [9.6, 14.5], [-4, 14.5]], house), [], "a whole fence has none");
  assert.deepEqual(stretchCuts([], house), []);
});
