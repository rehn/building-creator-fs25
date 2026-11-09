import test from "node:test";
import assert from "node:assert/strict";
import { sanitize, addPartOn, partStyle, splitAtOf } from "../src/editor/model.mjs";

test("a part added on a wall with a look of its own starts with that look", () => {
  const p = sanitize({
    width: 14, depth: 8, wallCladding: "lockpanel",
    wings: [{id: 1, wall: "back", pos: 0.5, width: 8, depth: 6, floors: 0}],
    wallZones: {w1Left: {split: "height", height: 1.3}},
    wallStyles: {w1Left: {lowerCladding: "plaster", lowerColor: "#cccccc", wallCladding: "horizontal"}},
  });
  const next = addPartOn(p, "w1Left"), part = next[next.length - 1];
  assert.equal(part.wallSplit, "height");
  assert.equal(part.splitHeight, 1.3);
  assert.equal(part.lowerCladding, "plaster");
  assert.equal(part.lowerColor, "#cccccc");
  assert.equal(part.wallCladding, "horizontal");
  const q = sanitize({...p, wings: next});
  assert.equal(splitAtOf(q, "w2End"), 1.3, "its walls are split where the wall it stands on is");
  assert.equal(partStyle(q, 2).lowerCladding, "plaster");
});

test("a part on a wall with nothing of its own follows its parent as before", () => {
  const p = sanitize({width: 14, depth: 8, wings: [{id: 1, wall: "back", pos: 0.5, width: 8, depth: 6, floors: 0}]});
  const part = addPartOn(p, "w1Left").pop();
  for (const k of ["wallSplit", "splitHeight", "wallCladding", "lowerCladding", "wallColor", "lowerColor"]) assert.equal(part[k], undefined, k);
});
