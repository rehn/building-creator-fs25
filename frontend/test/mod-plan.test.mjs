// The mod's 3D plan (docs/PLAN_MOD.md step 3): what the view needs from a building or a prop (its triangles in colours, its size), and how a post is
// placed beside the others. Pure functions: the three.js view itself (editor/modView.mjs) is not tested here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boundsOf, projectGroups, footprint, snapPost, turnedBy, mapKey, proceduralPicture } from "../src/editor/modPlan.mjs";
import { sanitize as sanitizeProp } from "../src/builder/model.mjs";
import { sanitize } from "../src/editor/model.mjs";

test("the box round some groups, and a box of nothing at the origin when there are none", () => {
  const groups = [{positions: [0, 0, 0, 4, 0, 0, 4, 3, 0]}, {positions: [0, 3, 0, 4, 3, 0, 2, 5, 2]}];
  assert.deepEqual(boundsOf(groups), {min: [0, 0, 0], max: [4, 5, 2]});
  assert.deepEqual(boundsOf([]), {min: [0, 0, 0], max: [0, 0, 0]});
});

test("a building's groups are as wide and deep as the building and stand on the ground", () => {
  const p = sanitize({kind: "house", width: 9, depth: 7});
  const b = boundsOf(projectGroups(p));
  assert.ok(b.max[0] - b.min[0] >= 9 && b.max[0] - b.min[0] < 14, "its width, and the eaves");
  assert.ok(b.max[2] - b.min[2] >= 7 && b.max[2] - b.min[2] < 12, "its depth");
  assert.ok(Math.abs(b.min[1]) < 1 && b.max[1] > 3, "on the ground, and a roof");
});

test("a building is drawn with its textures: the uvs are there and the walls, the roof and the trim name the surface they have", () => {
  const groups = projectGroups(sanitize({kind: "house", wallCladding: "vertical", roofMaterial: "tiles", wallColor: "#aa3322"}));
  for (const g of groups) assert.ok(g.uvs === null || g.uvs.length === g.positions.length / 3 * 2, `${g.name}: a uv pair for each corner`);
  const walls = groups.find(g => g.name === "walls"), roof = groups.find(g => g.name === "roof");
  assert.equal(walls.map.spec.kind, "vertical");
  assert.equal(walls.map.hex.length, 7, "the colour is a hex string (aged by the building's years)");
  assert.equal(roof.map.spec.kind, "tiles");
  assert.ok(groups.every(g => g.positions.length % 9 === 0), "whole triangles");
  assert.ok(!groups.some(g => g.name === "interior"), "the room behind the glass is left out");
  const glass = groups.find(g => g.name === "glass");
  assert.ok(!glass || glass.alpha <= 1);
});

test("a map has a name that says what it is made of, and a picture is as big as its base", () => {
  const one = {spec: {kind: "brick", w: 1, h: 0.6, age: 0}, hex: "#aa3322"};
  assert.equal(mapKey(one), mapKey({...one}));
  assert.notEqual(mapKey(one), mapKey({...one, hex: "#223344"}));
  assert.equal(mapKey({textureId: "abc"}), "t:abc");
  const pic = proceduralPicture(one);
  assert.equal(pic.rgba.length, pic.width * pic.height * 4);
  assert.ok(pic.width >= 64 && pic.width === pic.height);
});

test("a prop's groups are its parts where they stand, one group for each colour", () => {
  const prop = sanitizeProp({kind: "prop", parts: [{name: "a", shape: "box", x: 0, y: 0, z: 0, w: 2, h: 1, d: 1, color: "#ff0000"}, {name: "b", shape: "box", x: 3, y: 0, z: 0, w: 1, h: 1, d: 1, color: "#00ff00"}]});
  const groups = projectGroups(prop);
  assert.equal(groups.length, 2);
  assert.ok(groups.every(g => g.positions.length > 0));
  const b = boundsOf(groups);
  assert.ok(b.max[0] - b.min[0] > 3.5, "the two parts side by side");
  assert.ok(groups.every(g => g.uvs && g.uvs.length === g.positions.length / 3 * 2 && g.map === null), "a part with only a colour has no map");
});

test("the footprint is the box as it stands after turning, seen from above (three's turn about y: x' = x cos + z sin, z' = -x sin + z cos)", () => {
  const box = {min: [-2, 0, -1], max: [2, 3, 1]};
  const same = footprint(box, 0), turned = footprint(box, 90), half = footprint(box, 45);
  assert.deepEqual(same, {minX: -2, maxX: 2, minZ: -1, maxZ: 1});
  assert.ok(Math.abs(turned.minX + 1) < 1e-9 && Math.abs(turned.maxX - 1) < 1e-9 && Math.abs(turned.minZ + 2) < 1e-9 && Math.abs(turned.maxZ - 2) < 1e-9);
  assert.ok(half.maxX > 2 && half.maxX < 2.2 + 1, "a corner reaches further when turned 45");
  // a box off its origin moves with the turn: its middle (5, 0) turned 90 lands at (0, -5)
  const off = footprint({min: [4, 0, -1], max: [6, 1, 1]}, 90);
  assert.ok(Math.abs((off.minZ + off.maxZ) / 2 + 5) < 1e-9 && Math.abs((off.minX + off.maxX) / 2) < 1e-9);
});

test("turning a post goes by whole turns and stays in 0 to 360", () => {
  assert.equal(turnedBy(0, 90), 90);
  assert.equal(turnedBy(270, 90), 0);
  assert.equal(turnedBy(0, -90), 270);
  assert.equal(turnedBy(45.5, 90), 135.5);
});

const A = {x: 0, z: 0, rot: 0, bounds: {min: [-2, 0, -2], max: [2, 3, 2]}};
const B = {x: 0, z: 0, rot: 0, bounds: {min: [-1, 0, -1], max: [1, 2, 1]}};

test("a post snaps to the grid, and to the edge of another post when it is near it", () => {
  assert.deepEqual(snapPost({...B, x: 10.26, z: -7.8}, [], {grid: 0.5}), {x: 10.5, z: -8});
  // B's left edge is at x - 1: 3.2 puts it 0.2 m from A's right edge (2.0)? no: B's left edge is 2.2, so it snaps to touch A at x = 3
  assert.deepEqual(snapPost({...B, x: 3.2, z: 0.2}, [A], {grid: 0.5, reach: 0.6}), {x: 3, z: 0});
  // from the other side, and along the edges (the walls in line)
  assert.equal(snapPost({...B, x: -3.15, z: 5}, [A], {grid: 0.5, reach: 0.6}).x, -3);
  assert.equal(snapPost({...B, x: 6, z: 1.1}, [A], {grid: 0.5, reach: 0.6}).z, 1, "its far edge in line with A's: 2 - 1");
  // too far to snap to the edge: the grid only
  assert.deepEqual(snapPost({...B, x: 5.1, z: 9}, [A], {grid: 0.5, reach: 0.4}), {x: 5, z: 9});
});

test("snapping off (Alt held) leaves the place as it is; a post is not snapped to itself", () => {
  assert.deepEqual(snapPost({...B, x: 3.2, z: 0.2}, [A], {off: true}), {x: 3.2, z: 0.2});
  assert.deepEqual(snapPost({...A, x: 1.1, z: 0.1}, [], {grid: 0.5}), {x: 1, z: 0});
});

test("a turned post snaps by its turned footprint", () => {
  const wide = {x: 0, z: 0, rot: 90, bounds: {min: [-3, 0, -1], max: [3, 2, 1]}};   // 6 along x, turned to 2 along x and 6 along z
  assert.deepEqual(snapPost({...wide, x: 3.1, z: 0}, [A], {grid: 0.5, reach: 0.6}), {x: 3, z: 0});
});
