// A big sliding door in sheet metal: always two halves that slide apart (towards the two sides) along a rail, made of corrugated sheet in the door colour.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, buildI3d, surfaceSpec, PRESETS } from "../src/editor/model.mjs";
import { DOOR_STYLE_IDS } from "../src/editor/openings.mjs";

const shed = (extra = {}) => sanitize({kind: "shed", width: 8, depth: 6, floors: 1, floorHeight: 3.4, foundation: 0.1, items: [], windows: [{wall: "front", floor: 0, pos: 0.5, type: "door", w: 3, h: 2.8, style: "sheetslide", opens: true}], ...extra});

test("the style exists and makes a pair of leaves that slide to opposite sides", () => {
  assert.ok(DOOR_STYLE_IDS.includes("sheetslide"));
  const leaves = buildGeometry(shed()).doors[0].leaves;
  assert.equal(leaves.length, 2);
  const dx = leaves.map(l => l.motion.translation[0]);
  assert.ok(dx[0] * dx[1] < 0, `opposite ways (${dx})`);
  assert.ok(Math.abs(dx[0]) > 1.4 && Math.abs(dx[1]) > 1.4, "far enough to clear the opening");
});

test("a narrow door of this style is a pair too", () => {
  const narrow = shed({windows: [{wall: "front", floor: 0, pos: 0.5, type: "door", w: 1.2, h: 2.2, style: "sheetslide", opens: true}]});
  assert.equal(buildGeometry(narrow).doors[0].leaves.length, 2);
});

test("it is corrugated sheet in the door colour, and the export moves both leaves", () => {
  const p = shed(), geo = buildGeometry(p);
  assert.ok(geo.G.doorSheet.p.length > 24, "a material of its own with the leaves");
  const s = surfaceSpec(p, "doorSheet");
  assert.equal(s.kind, "corrugated");
  const xml = buildI3d(p);
  assert.match(xml, /name="door1Leaf1DoorSheet"/);
  assert.match(xml, /name="door1Leaf2DoorSheet"/);
});

test("the garage and the machine hall have it to start with", () => {
  for (const id of ["garage", "maskinhall"]) assert.equal(PRESETS.find(x => x.id === id).settings.doorStyle, "sheetslide", id);
});
