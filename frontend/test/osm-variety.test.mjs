// Generated buildings should not all look alike: windows, door and colours vary, the same way every time for the same building,
// and what the OSM tags say always wins.
import { test } from "node:test";
import assert from "node:assert/strict";
import { osmToHouse } from "../src/editor/osm.mjs";
import { sanitize } from "../src/editor/model.mjs";
import { wingsOf } from "../src/editor/layout.mjs";

const RECT = [[0, 0], [10, 0], [10, 7], [0, 7]];
const L = [[0, 0], [12, 0], [12, 6], [6, 6], [6, 14], [0, 14]];
const ids = Array.from({ length: 40 }, (_, i) => `way/${1000 + i * 37}`);
const many = (tags = {}, footprint = RECT) => ids.map(id => osmToHouse({ footprint, tags, id }));
const distinct = (list, f) => new Set(list.map(f)).size;

test("the same building gets the same look every time, and another building another", () => {
  const a = osmToHouse({ footprint: RECT, tags: {}, id: "way/1" }), b = osmToHouse({ footprint: RECT, tags: {}, id: "way/1" });
  assert.deepEqual(a.settings, b.settings);
  const out = many();
  assert.ok(distinct(out, r => JSON.stringify(r.settings)) > 30, "40 buildings should hardly ever look the same");
});

test("a house varies in door colour and style, window style, count and size, and wall colours", () => {
  const out = many();
  assert.ok(distinct(out, r => r.settings.doorColor) >= 5, "door colours");
  assert.ok(distinct(out, r => r.settings.doorStyle) >= 3, "door styles");
  assert.ok(distinct(out, r => r.settings.winStyle) >= 2, "window styles");
  assert.ok(distinct(out, r => `${r.settings.winFront}${r.settings.winBack}${r.settings.winLeft}${r.settings.winRight}`) >= 8, "window counts");
  assert.ok(distinct(out, r => `${r.settings.winW}x${r.settings.winH}`) >= 3, "window sizes");
  assert.ok(distinct(out, r => r.settings.wallColor) >= 5, "wall colours");
  assert.ok(distinct(out, r => r.settings.roofColor) >= 3, "roof colours");
  assert.ok(distinct(out, r => r.settings.trimColor) >= 2, "trim colours");
  assert.ok(distinct(out, r => `${r.settings.doorWall}${r.settings.doorPos}`) >= 4, "door places");
  assert.ok(distinct(out, r => r.settings.entrance) >= 2, "porches");
  assert.ok(distinct(out, r => r.settings.chimney) === 2, "some have a chimney, some not");
});

test("the tags win over the variation", () => {
  const out = many({ "building:colour": "#aabbcc", "roof:colour": "#112233", "roof:material": "metal", "building:material": "wood", "roof:angle": "30" });
  for (const r of out) {
    assert.equal(r.settings.wallColor, "#AABBCC");
    assert.equal(r.settings.roofColor, "#112233");
    assert.equal(r.settings.roofMaterial, "seamed");
    assert.equal(r.settings.wallCladding, "lockpanel");
    assert.equal(r.settings.roofPitch, 30);
  }
});

test("the settings stay inside what the app takes, so sanitize changes nothing that was chosen", () => {
  for (const r of [...many(), ...many({ building: "garage" }), ...many({}, L), ...many({ "building:levels": "3" })]) {
    const p = sanitize(r.settings);
    for (const k of ["winW", "winH", "sill", "winStyle", "doorStyle", "doorColor", "trimColor", "wallColor", "roofColor", "wallCladding", "roofPitch", "chimney", "overhang"]) {
      if (k in r.settings) assert.equal(p[k], r.settings[k], `${k} was changed by sanitize`);
    }
    assert.ok(p.windows.some(w => w.type === "door"), "a building always has a door");
    if (!r.settings.wings) for (const wall of ["front", "back", "left", "right"]) {
      const n = p.windows.filter(w => w.type === "window" && w.wall === wall && w.floor === 0).length;
      assert.equal(n, r.settings["win" + wall[0].toUpperCase() + wall.slice(1)], `windows on ${wall}`);
    }
    for (const w of wingsOf(p)) assert.ok(!w.off, "a wing was left out: " + w.off);
  }
});

test("the door is never on a wall a wing stands against, and its width fits the wall", () => {
  for (const r of many({}, L)) {
    const p = sanitize(r.settings), door = p.windows.find(w => w.type === "door");
    assert.ok(door, "has a door");
    assert.ok(!p.wings.some(g => g.wall === door.wall), `the door is on ${door.wall}, where a wing stands`);
  }
});

test("a house has windows to the front and the back is not bare on every house", () => {
  const out = many({ "building:levels": "2" });
  assert.ok(out.every(r => r.settings.winFront >= 1), "the front has a window at least");
  assert.ok(out.some(r => r.settings.winBack === 0) || out.some(r => r.settings.winBack >= 3));
});

test("sheds vary too, but keep their own kind of door, with fewer windows", () => {
  const out = many({ building: "garage" });
  assert.ok(out.every(r => r.kind === "shed"));
  assert.ok(distinct(out, r => r.settings.doorColor) >= 3, "door colours");
  assert.ok(distinct(out, r => r.settings.wallColor) >= 3, "wall colours");
  assert.ok(out.every(r => r.settings.winFront + r.settings.winBack + r.settings.winLeft + r.settings.winRight <= 6));
  assert.ok(out.every(r => ["sheetslide", "sliding", "plank", "zbrace", "xbrace", "plain"].includes(r.settings.doorStyle)));
});

test("without an id the footprint decides, so the same shape in the same place looks the same", () => {
  const a = osmToHouse({ footprint: RECT, tags: {} }), b = osmToHouse({ footprint: RECT, tags: {} });
  assert.deepEqual(a.settings, b.settings);
  const c = osmToHouse({ footprint: RECT.map(([x, y]) => [x + 500, y + 300]), tags: {} });
  assert.notDeepEqual(a.settings, c.settings);
});
