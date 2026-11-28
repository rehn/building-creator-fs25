// The modeller's view: dragging a part with the mouse (the maths; the view itself needs a browser). Pure, no DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { snapTo, rayPlane, dragTarget, SNAP } from "../src/builder/drag.mjs";

const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, `${m}: ${a} is not ${b}`);

test("snapTo: to the nearest step, without float dust, -0 is 0", () => {
  assert.equal(SNAP, 0.05);
  assert.equal(snapTo(0.123), 0.1);
  assert.equal(snapTo(0.126), 0.15);
  assert.equal(snapTo(-0.02), 0);
  assert.ok(Object.is(snapTo(-0.01), 0));
  assert.equal(snapTo(1.2999999), 1.3);
  assert.equal(snapTo(0.123, 0), 0.123);   // (no step: as it is)
});

test("rayPlane: where a ray meets a plane, null when it runs along it or away from it", () => {
  assert.deepEqual(rayPlane([0, 5, 0], [0, -1, 0], [0, 1, 0], [0, 1, 0]), [0, 1, 0]);
  const p = rayPlane([0, 5, 0], [1, -1, 0], [0, 0, 0], [0, 1, 0]);
  near(p[0], 5, "x"); near(p[1], 0, "y");
  assert.equal(rayPlane([0, 5, 0], [1, 0, 0], [0, 0, 0], [0, 1, 0]), null, "parallel");
  assert.equal(rayPlane([0, 5, 0], [0, 1, 0], [0, 0, 0], [0, 1, 0]), null, "behind");
});

test("dragTarget: sideways keeps the height and follows the mouse on the ground, snapped", () => {
  assert.deepEqual(dragTarget([1, 0.5, 2], [3, 1, 3], [3.33, 1, 2.52]), [1.35, 0.5, 1.5]);
  assert.deepEqual(dragTarget([1, 0.5, 2], [3, 1, 3], [3, 1, 3]), [1, 0.5, 2]);
});

test("dragTarget: vertical (shift) changes only the height", () => {
  assert.deepEqual(dragTarget([1, 0.5, 2], [3, 1, 3], [9, 1.62, 7], true), [1, 1.1, 2]);
});
