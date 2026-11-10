// Doors can be up to 20 m wide and 12 m high (a hangar's), in the settings, the editor's sliders and the building.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry } from "../src/editor/model.mjs";

const hangar = (w, h, style = "sheetslide") => sanitize({kind: "shed", width: 30, depth: 20, floors: 1, floorHeight: 9, foundation: 0.1, items: [],
  windows: [{wall: "front", floor: 0, pos: 0.5, type: "door", w, h, style, opens: true}]});

test("a door keeps a width of 20 m and a height of 12 m (and no more)", () => {
  const d = sanitize({kind: "shed", windows: [{wall: "front", floor: 0, pos: 0.5, type: "door", w: 20, h: 12}]}).windows.find(x => x.type === "door");
  assert.deepEqual([d.w, d.h], [20, 12]);
  const e = sanitize({kind: "shed", windows: [{wall: "front", floor: 0, pos: 0.5, type: "door", w: 50, h: 40}]}).windows.find(x => x.type === "door");
  assert.deepEqual([e.w, e.h], [20, 12]);
});

test("a 20 m wide sliding door is built as two leaves of about 10 m", () => {
  const p = hangar(20, 8), leaves = buildGeometry(p).doors[0].leaves;
  assert.equal(leaves.length, 2);
  for (const l of leaves) assert.ok(l.box.size[0] > 9.5 && l.box.size[0] < 11, `a leaf is ${l.box.size[0].toFixed(2)} m wide`);
});

test("a door as high as 12 m is possible on a tall building", () => {
  const p = sanitize({kind: "shed", width: 30, depth: 20, floors: 1, floorHeight: 12.5, foundation: 0.1, items: [],
    windows: [{wall: "front", floor: 0, pos: 0.5, type: "door", w: 10, h: 12, style: "sheetslide", opens: true}]});
  const door = p.windows.find(x => x.type === "door");
  assert.equal(door.h, 12);
  const leaf = buildGeometry(p).doors[0].leaves[0];
  assert.ok(leaf.box.size[1] > 11.5, `leaf height ${leaf.box.size[1].toFixed(2)}`);
});
