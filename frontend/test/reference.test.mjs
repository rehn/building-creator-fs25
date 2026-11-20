// The reference building (GET /api/v1/reference-building): an asymmetric L with a red front wall, once as it is and once turned 30 degrees,
// so a map program can see in Giants Editor whether it places and turns buildings the right way.
import { test } from "node:test";
import assert from "node:assert/strict";
import { referenceBuildings } from "../src/lib/reference.mjs";
import { wingsOf } from "../src/editor/layout.mjs";
import { sanitize } from "../src/editor/model.mjs";

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.01, `${msg}: ${a} vs ${b}`);

test("reference building: the same L at 0 and 30 degrees, main part 12 x 8 with a 5 x 6 wing at the back", () => {
  const list = referenceBuildings();
  assert.deepEqual(list.map(b => b.id), ["reference/L-0", "reference/L-30"]);
  const [a, b] = list;
  for (const x of list) {
    assert.equal(x.result.ok, true);
    assert.equal(x.result.placement.width, 12);
    assert.equal(x.result.placement.depth, 8);
    assert.equal(x.result.footprint.parts.length, 2);
    assert.equal(x.result.footprint.parts[1].part, "wing");
    assert.equal(x.settings.wings[0].wall, "back");
  }
  assert.equal(a.result.placement.angle, 0);
  assert.equal(b.result.placement.angle, 30);
  assert.deepEqual([a.result.placement.x, a.result.placement.y], [106, 204]);
  assert.deepEqual([b.result.placement.x, b.result.placement.y], [106, 204]);
  // the wing at 30 degrees is the wing at 0 turned about the middle of the main part
  const w0 = a.result.footprint.parts[1], w30 = b.result.footprint.parts[1];
  near(w30.x, 106 + 3.5 * Math.cos(Math.PI / 6) - 7 * Math.sin(Math.PI / 6), "wing x");
  near(w30.y, 204 + 3.5 * Math.sin(Math.PI / 6) + 7 * Math.cos(Math.PI / 6), "wing y");
  assert.deepEqual([w0.x, w0.y], [109.5, 211]);
});

test("reference building: the front wall is the red one, and says where it is in the map's plane", () => {
  const [a, b] = referenceBuildings();
  for (const x of [a, b]) {
    assert.equal(x.settings.wallStyles.front.wallColor, "#c0392b");
    assert.notEqual(x.settings.wallColor, "#c0392b");
  }
  // at 0 degrees the front is the south wall (y = 200) from the west corner to the east one; at 30 it is turned about the middle
  assert.deepEqual(a.frontWall, { from: [100, 200], to: [112, 200], faces: "south" });
  near(b.frontWall.from[0], 106 + (-6) * Math.cos(Math.PI / 6) - (-4) * Math.sin(Math.PI / 6), "from x");
  near(b.frontWall.from[1], 204 + (-6) * Math.sin(Math.PI / 6) + (-4) * Math.cos(Math.PI / 6), "from y");
  assert.equal(b.frontWall.faces, "south turned 30 degrees counter-clockwise");
});

test("reference building: the settings build the wing on the back wall, nothing is off", () => {
  const p = sanitize(referenceBuildings()[0].settings);
  const w = wingsOf(p);
  assert.equal(w.length, 1);
  assert.equal(w[0].off, undefined);
});
