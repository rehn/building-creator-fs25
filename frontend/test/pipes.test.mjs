// Downpipes: a list (p.pipes: {id, wall, pos}) the player places per wall, instead of 0-2 at the corners.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry } from "../src/editor/model.mjs";
import { eaveWalls, autoPipes, pipePositions, MAX_PIPES } from "../src/editor/layout.mjs";

const at = (geo, i) => geo.downpipes[i].path[2];
const W1 = {id: 1, wall: "back", pos: 0.15, width: 6, depth: 5, floors: 0};

test("downpipes: a new house gets them from its count per side, at the ends of each wall with a gutter", () => {
  const p = sanitize({});
  assert.deepEqual(p.pipes.map(x => x.wall).sort(), ["back", "back", "front", "front"]);
  assert.equal(sanitize({downpipes: 1}).pipes.length, 2, "one per side");
  assert.deepEqual(sanitize({downpipes: 0}).pipes, []);
  assert.equal(sanitize({gutters: false}).pipes.length, 0);
  assert.equal(buildGeometry(p).downpipes.length, 4);
  const [a, b] = pipePositions(10, 2);
  assert.ok(a > 0.02 && a < 0.06 && Math.abs(a + b - 1) < 1e-9, "30 cm in from each end");
  assert.deepEqual(pipePositions(10, 3).map(v => +v.toFixed(2)), [0.03, 0.5, 0.97]);
});

test("downpipes: where the player puts them, that many and there", () => {
  const p = sanitize({pipes: [{wall: "front", pos: 0.5}, {wall: "front", pos: 0.8}, {wall: "back", pos: 0.1}]});
  assert.equal(p.pipes.length, 3);
  assert.deepEqual(p.pipes.map(x => x.id), [1, 2, 3]);
  const geo = buildGeometry(p);
  assert.equal(geo.downpipes.length, 3);
  // the first on the front wall (the middle: x = 0), 9 cm from it, going down to the ground
  const [x, y, z] = at(geo, 0);
  assert.ok(Math.abs(x) < 1e-9 && Math.abs(z - (p.depth / 2 + 0.09)) < 1e-9, `${x}, ${z}`);
  assert.ok(geo.downpipes[0].path[3][1] < 0.5);
  // none at all
  assert.equal(buildGeometry(sanitize({pipes: []})).downpipes.length, 0);
  assert.equal(sanitize({pipes: []}).pipes.length, 0, "an empty list stays empty");
});

test("downpipes: only on walls with a gutter; a list is kept and cleaned", () => {
  const p = sanitize({roofType: "gable", ridge: "width", pipes: [{wall: "left", pos: 0.5}, {wall: "front", pos: 7}, {wall: "front", pos: "x"}, {wall: "roof", pos: 0.5}, null]});
  assert.deepEqual(p.pipes.map(x => [x.wall, x.pos]), [["front", 1], ["front", 0.5]], "gable ends have no gutter; places are clamped");
  assert.deepEqual(eaveWalls(sanitize({roofType: "hip"})).sort(), ["back", "front", "left", "right"]);
  assert.deepEqual(eaveWalls(sanitize({ridge: "depth"})).sort(), ["left", "right"]);
  assert.deepEqual(eaveWalls(sanitize({roofType: "flat"})), []);
  assert.equal(sanitize({pipes: Array.from({length: 40}, () => ({wall: "front", pos: 0.5}))}).pipes.length, MAX_PIPES);
  // under a hip roof the ends have them too
  const hip = sanitize({roofType: "hip", pipes: [{wall: "left", pos: 0.5}]}), g = buildGeometry(hip);
  assert.equal(g.downpipes.length, 1);
  assert.ok(g.downpipes[0].path[2][0] < -hip.width / 2, "outside the left wall");
  // gutters off: the list stays, nothing is built
  const off = sanitize({gutters: false, pipes: [{wall: "front", pos: 0.5}]});
  assert.equal(off.pipes.length, 1);
  assert.equal(buildGeometry(off).downpipes.length, 0);
});

test("downpipes: a wing's sides take them too, but not a wall the wing stands against", () => {
  const p = sanitize({wings: [W1]});
  assert.deepEqual(autoPipes(p).filter(x => x.wall.startsWith("w1")).map(x => x.wall).sort(), ["w1Left", "w1Right"]);
  const mine = sanitize({wings: [W1], pipes: [{wall: "w1Left", pos: 0.5}, {wall: "w1Right", pos: 0.2}, {wall: "back", pos: 0.5}, {wall: "back", pos: 0.9}]});
  const geo = buildGeometry(mine);
  // the back pipe at 0.5 is under the wing (x 5..-1): left out; the one at 0.9 is clear of it
  assert.equal(geo.downpipes.length, 3);
  // a pipe asked for too near the wing's valley is moved out of it
  const near = sanitize({wings: [W1], pipes: [{wall: "w1Left", pos: 0}]}), q = buildGeometry(near).downpipes[0].path[2], wall = buildGeometry(near).opsByWall.w1Left.w;
  const s = (q[0] - wall.o[0]) * wall.u[0] + (q[2] - wall.o[2]) * wall.u[2];
  assert.ok(s >= 0.3, `${s}`);
});
