// A game object can stand above the ground: y is the height of its bottom (left out when 0, so every saved object is as it was). The box, the icon and the markers of the export
// follow it. A mod's object can be set to a height too (lib/modObjects.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildI3d } from "../src/editor/model.mjs";
import { boxOf, iconOf, OBJECT_LIMITS } from "../src/editor/objects.mjs";
import { addGroup, setObjectOf, settingsFor } from "../src/lib/modObjects.mjs";

const workshop = {type: "workshop", x: 1, z: 2, w: 6, d: 3, h: 3.5, ix: 0, iz: 0};
const translation = (i3d, name) => i3d.match(new RegExp(`name="${name}"[^>]*translation="([^"]+)"`))[1].split(" ").map(Number);

test("the box and the icon of an object stand on the ground, or y above it", () => {
  assert.deepEqual(boxOf(workshop).center, [1, 1.75, 2]);
  assert.deepEqual(boxOf({...workshop, y: 2}).center, [1, 3.75, 2]);
  assert.deepEqual(boxOf({...workshop, y: 2}).size, [6, 3.5, 3], "the size is the same");
  assert.deepEqual(iconOf(workshop), [1, 0, 2]);
  assert.deepEqual(iconOf({...workshop, y: 2}), [1, 2, 2]);
});

test("y is kept within its range, and left out when 0 so a saved object is as it was", () => {
  const objs = p => sanitize({kind: "house", objects: [p]}).objects.find(o => o.type === "workshop");
  assert.equal("y" in objs(workshop), false);
  assert.equal("y" in objs({...workshop, y: 0}), false);
  assert.equal(objs({...workshop, y: 1.25}).y, 1.25);
  assert.equal(objs({...workshop, y: 999}).y, OBJECT_LIMITS.y[1]);
  assert.equal(objs({...workshop, y: -999}).y, OBJECT_LIMITS.y[0]);
  assert.equal("y" in objs({...workshop, y: "high"}), false);
});

test("the export puts the workshop's triggers and icon at that height", () => {
  const low = buildI3d(sanitize({kind: "house", objects: [workshop]})), high = buildI3d(sanitize({kind: "house", objects: [{...workshop, y: 2}]}));
  assert.equal(translation(high, "markerWrench")[1] - translation(low, "markerWrench")[1], 2, "the icon is 2 m higher");
  assert.equal(translation(high, "vehicleTrigger")[1] - translation(low, "vehicleTrigger")[1], 2, "so is the trigger box");
});

test("a mod's object can be set to a height, and 0 takes it back to the ground", () => {
  const list = addGroup([], "sleep", settingsFor({width: 10, depth: 8}));
  const raised = setObjectOf(list, list[0].id, {y: 1.5});
  assert.equal(raised[0].y, 1.5);
  assert.equal(setObjectOf(raised, list[0].id, {y: 0})[0].y, undefined);
  assert.equal(setObjectOf(list, list[0].id, {y: 500})[0].y, OBJECT_LIMITS.y[1]);
});
