// A big sliding door in sheet metal: always two halves that slide apart (towards the two sides) along a rail, made of corrugated sheet in the door colour.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, buildI3d, placeableXml, surfaceSpec, PRESETS } from "../src/editor/model.mjs";
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

test("on two tracks: the halves hang at different depths, overlap in the middle and slide past each other's side", () => {
  const p = shed({windows: [{wall: "front", floor: 0, pos: 0.5, type: "door", w: 6, h: 3, style: "sheetpass", opens: true}]});
  const geo = buildGeometry(p), leaves = geo.doors[0].leaves;
  assert.equal(leaves.length, 2);
  const zs = leaves.map(l => l.box.center[2]);
  assert.ok(Math.abs(zs[0] - zs[1]) > 0.05, `two tracks: ${zs.map(v => v.toFixed(3))}`);
  const x = leaves.map(l => [l.box.center[0] - l.box.size[0] / 2, l.box.center[0] + l.box.size[0] / 2]).sort((a, b) => a[0] - b[0]);
  assert.ok(x[0][1] > x[1][0] + 0.1, "the halves overlap in the middle");
  const dx = leaves.map(l => l.motion.translation[0]);
  assert.ok(dx[0] * dx[1] < 0, "to either side");
  const xml = buildI3d(p);
  assert.match(xml, /name="door1Leaf1DoorSheet"/);
});

test("a door as high as 12 m needs a ground floor of 12 m, and gets one", () => {
  assert.equal(sanitize({kind: "shed", floorHeight: 12}).floorHeight, 12);
});

test("two tracks: the halves swap places, so each has its own trigger and its own animation (both open = closed again)", () => {
  const p = shed({windows: [{wall: "front", floor: 0, pos: 0.5, type: "door", w: 6, h: 3, style: "sheetpass", opens: true}]});
  const leaves = buildGeometry(p).doors[0].leaves;
  const [l, r] = [...leaves].sort((a, b) => a.box.center[0] - b.box.center[0]);
  assert.ok(l.motion.translation[0] > 2.5, `the left half slides right (${l.motion.translation[0].toFixed(2)})`);
  assert.ok(r.motion.translation[0] < -2.5, `the right half slides left (${r.motion.translation[0].toFixed(2)})`);
  assert.ok(Math.abs(l.motion.translation[0] + r.motion.translation[0]) < 0.3, "as far each way: they end up where the other stood");
  const i3d = buildI3d(p);
  assert.match(i3d, /name="door1Leaf1Trigger"/);
  assert.match(i3d, /name="door1Leaf2Trigger"/);
  assert.doesNotMatch(i3d, /name="door1Trigger"/);
  const xml = placeableXml(p, "Hangar");
  assert.equal([...xml.matchAll(/<animatedObject saveId=/g)].length, 2);
  assert.match(xml, /triggerNode="door1Leaf1Trigger"/);
  assert.match(xml, /triggerNode="door1Leaf2Trigger"/);
});

test("a door with two halves that open together has one trigger", () => {
  const p = shed();
  assert.match(buildI3d(p), /name="door1Trigger"/);
  assert.equal([...placeableXml(p, "Hangar").matchAll(/<animatedObject saveId=/g)].length, 1);
});
