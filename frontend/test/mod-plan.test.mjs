// The mod's 3D plan (docs/PLAN_MOD.md step 3): what the view needs from a building or a prop (its triangles in colours, its size), and how a post is
// placed beside the others. Pure functions: the three.js view itself (editor/modView.mjs) is not tested here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseObj, boundsOf, projectGroups, footprint, snapPost, turnedBy } from "../src/editor/modPlan.mjs";
import { sanitize as sanitizeProp } from "../src/builder/model.mjs";
import { sanitize } from "../src/editor/model.mjs";

const OBJ = "g wall\nusemtl wall\nv 0 0 0\nv 4 0 0\nv 4 3 0\nv 0 3 0\nf 1/1/1 2/2/2 3/3/3\nf 1/1/1 3/3/3 4/4/4\ng roof\nusemtl roof\nv 0 3 0\nv 4 3 0\nv 2 5 2\nf 5/5/5 6/6/6 7/7/7\n";
const MTL = "newmtl wall\nKd 1 0 0\nd 1\n\nnewmtl roof\nKd 0 0.5 0\nd 0.5\n";

test("an obj becomes one group per material: its colour, its see-through and its triangles as plain numbers", () => {
  const groups = parseObj(OBJ, MTL);
  assert.deepEqual(groups.map(g => g.name), ["wall", "roof"]);
  assert.deepEqual(groups[0].color, [1, 0, 0]);
  assert.equal(groups[0].positions.length, 2 * 3 * 3, "two triangles of three corners with three numbers each");
  assert.deepEqual(groups[0].positions.slice(0, 6), [0, 0, 0, 4, 0, 0]);
  assert.equal(groups[1].alpha, 0.5);
  assert.deepEqual(boundsOf(groups), {min: [0, 0, 0], max: [4, 5, 2]});
});

test("a building's groups are as wide and deep as the building and stand on the ground", () => {
  const p = sanitize({kind: "house", width: 9, depth: 7});
  const b = boundsOf(projectGroups(p));
  assert.ok(b.max[0] - b.min[0] >= 9 && b.max[0] - b.min[0] < 14, "its width, and the eaves");
  assert.ok(b.max[2] - b.min[2] >= 7 && b.max[2] - b.min[2] < 12, "its depth");
  assert.ok(Math.abs(b.min[1]) < 1 && b.max[1] > 3, "on the ground, and a roof");
});

test("a prop's groups are its parts where they stand, one group for each colour", () => {
  const prop = sanitizeProp({kind: "prop", parts: [{name: "a", shape: "box", x: 0, y: 0, z: 0, w: 2, h: 1, d: 1, color: "#ff0000"}, {name: "b", shape: "box", x: 3, y: 0, z: 0, w: 1, h: 1, d: 1, color: "#00ff00"}]});
  const groups = projectGroups(prop);
  assert.equal(groups.length, 2);
  assert.ok(groups.every(g => g.positions.length > 0));
  const b = boundsOf(groups);
  assert.ok(b.max[0] - b.min[0] > 3.5, "the two parts side by side");
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
