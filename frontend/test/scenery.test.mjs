// Scenery mode: a building's i3d as plain scenery for a map's own i3d (a ReferenceNode): the outside shell and a solid collision,
// nothing that only means something with the placeable XML (areas, triggers, the animals' navigation, the inside, animated doors).
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, i3dFiles, sceneryBoxes, sceneryKeeps, KINDS, PRESETS } from "../src/editor/model.mjs";
import { makeSceneryFiles, makeModFiles, shrink } from "../src/editor/headless.mjs";
import { osmToHouse } from "../src/editor/osm.mjs";

const nodeNames = text => [...text.slice(text.indexOf("<Scene>")).matchAll(/<(?:TransformGroup|Shape|ReferenceNode)\b[^>]*?name="([^"]+)"/g)].map(m => m[1]);
const i3d = (settings, scenery) => i3dFiles(sanitize(settings), { withTex: true, scenery })["house.i3d"];
const PLACEABLE_ONLY = /^(clearAreas|levelAreas|testAreas|tipOcclusionUpdateAreas|indoorAreas|doors|items|door\d+.*|.*Trigger|workShop|markerWrench|.*Area(Start|End|Width|Height)\d+)$/;
const INSIDE = /^(wallsIn|doorIn|interior|curtain|fittings\d*)$/;

test("scenery has the shell and a collision, and none of what the placeable XML needs", () => {
  const full = nodeNames(i3d({ kind: "house" })), sc = nodeNames(i3d({ kind: "house" }, true));
  assert.ok(full.some(n => PLACEABLE_ONLY.test(n)), "the full file has them (or this test shows nothing)");
  assert.ok(full.some(n => INSIDE.test(n)));
  assert.deepEqual(sc.filter(n => PLACEABLE_ONLY.test(n)), [], "placeable-only nodes");
  assert.deepEqual(sc.filter(n => INSIDE.test(n)), [], "the inside");
  for (const n of ["house", "visuals", "walls", "roof", "trim", "foundation", "collisions", "collision"]) assert.ok(sc.includes(n), "scenery has " + n);
  assert.ok(sc.length < full.length / 2, `${sc.length} nodes against ${full.length}`);
});

test("a door that stays shut is part of the shell: no leaves that move, but the door is drawn", () => {
  const sc = nodeNames(i3d({ kind: "house" }, true));
  assert.ok(!sc.some(n => /Leaf\d/.test(n)), "no leaves");
  assert.ok(sc.includes("door"), "the door is drawn");
});

test("the glass is opaque, since there is nothing behind it", () => {
  const glass = text => (/<Material name="glass_mat"[^>]*>/.exec(text) || [""])[0];
  assert.match(glass(i3d({ kind: "house" })), /alphaBlending/, "see-through in the full file");
  assert.doesNotMatch(glass(i3d({ kind: "house" }, true)), /alphaBlending/);
});

test("scenery leaves the textures of the inside out and keeps those of the outside", () => {
  const tex = text => [...text.matchAll(/filename="([^"]*\.dds)"/g)].map(m => m[1]);
  const full = tex(i3d({ kind: "house" })), sc = tex(i3d({ kind: "house" }, true));
  assert.ok(full.some(n => /fit_|interior|glass_diffuse/.test(n)));
  assert.deepEqual(sc.filter(n => /fit_|interior|glass_diffuse|wallsIn|doorIn/.test(n)), []);
  for (const n of ["textures/walls_diffuse.dds", "textures/roof_diffuse.dds"]) assert.ok(sc.includes(n), n);
  assert.ok(sc.length <= 14 && sc.length < full.length / 2, `${sc.length} of ${full.length}`);
});

test("the collision is solid: a box for the main part and one for each wing, as high as the walls", () => {
  const plain = sceneryBoxes(sanitize({ kind: "house", width: 10, depth: 7 }));
  assert.equal(plain.length, 1);
  assert.deepEqual(plain[0].center.map(v => +v.toFixed(3)), [0, +(plain[0].size[1] / 2).toFixed(3), 0]);
  assert.deepEqual([plain[0].size[0], plain[0].size[2]], [10, 7]);
  assert.ok(plain[0].size[1] > 4, "taller than a person");
  const L = osmToHouse({ footprint: [[0, 0], [12, 0], [12, 6], [6, 6], [6, 14], [0, 14]], tags: { building: "house" } });
  const boxes = sceneryBoxes(sanitize(L.settings));
  assert.equal(boxes.length, 1 + L.settings.wings.length);
  const names = nodeNames(i3d(L.settings, true));
  assert.ok(names.filter(n => /^collision/.test(n)).length >= boxes.length);
  // a wing's box stands outside the main part's
  const [main, wing] = boxes, out = (a, b) => Math.abs(a.center[0] - b.center[0]) >= (a.size[0] + b.size[0]) / 2 - 1e-6 || Math.abs(a.center[2] - b.center[2]) >= (a.size[2] + b.size[2]) / 2 - 1e-6;
  assert.ok(out(main, wing), "the wing is beside the main part, not inside it");
});

test("every kind gives a scenery i3d without the game's nodes (areas, triggers, navigation, shop)", () => {
  const BAD = /(Trigger|Area|navigation|navmesh|indoor|workShop|vehicleSpawn|storeSpawn|shop|counter|animal|pasture|fence|marker)/i;
  for (const k of KINDS) {
    const text = i3d({ kind: k.id }, true), names = nodeNames(text);
    assert.deepEqual(names.filter(n => BAD.test(n)), [], k.id + ": " + names.filter(n => BAD.test(n)).join(", "));
    assert.ok(names.includes("walls") && names.includes("collisions"), k.id + " has a shell");
    assert.doesNotMatch(text, /<UserAttribute/, k.id);
  }
});

test("scenery files are the i3d, its shapes and the outside's textures, and nothing else", () => {
  const f = makeSceneryFiles({ kind: "house", wallColor: "#8E2A1E" }, "Hus");
  const names = [...f.files.keys()];
  assert.ok(names.includes("house.i3d") && names.includes("house.i3d.shapes"));
  assert.deepEqual(names.filter(n => !/^(house\.i3d(\.shapes)?|textures\/.+\.dds)$/.test(n)), [], "no modDesc, no house.xml, no pictures");
  const named = [...Buffer.from(f.files.get("house.i3d")).toString("latin1").matchAll(/filename="([^"]*)"/g)].map(m => m[1]);
  for (const n of named) assert.ok(f.files.has(n), `${n} is named but not made`);
  assert.ok(names.filter(n => n.endsWith(".dds")).length <= 14);
  const full = makeModFiles({ kind: "house", wallColor: "#8E2A1E" }, "Hus");
  const size = m => [...m.values()].reduce((a, d) => a + (typeof d === "string" ? d.length : d.length), 0);
  assert.ok(size(f.files) < size(full.mod) / 4, `${size(f.files)} against ${size(full.mod)} bytes`);
});

test("scenery textures are 512 px unless asked otherwise, and shrunk the right way", () => {
  const width = d => new DataView(d.buffer, d.byteOffset).getUint32(16, true), height = d => new DataView(d.buffer, d.byteOffset).getUint32(12, true);
  const dds = f => [...f.files].filter(([n]) => n.endsWith(".dds")).map(([, d]) => d);
  const big = makeSceneryFiles({ kind: "house" }, "H"), small = makeSceneryFiles({ kind: "house" }, "H", { textureSize: 256 }), full = makeSceneryFiles({ kind: "house" }, "H", { textureSize: 1024 });
  assert.ok(dds(big).every(d => width(d) === 512 && height(d) === 512));
  assert.ok(dds(small).every(d => width(d) === 256));
  assert.ok(dds(full).some(d => width(d) === 1024) && dds(full).every(d => width(d) <= 1024), "full size keeps the 1024 ones (some surfaces are 512 to begin with)");
  assert.ok([...small.files.values()].reduce((a, d) => a + d.length, 0) < [...big.files.values()].reduce((a, d) => a + d.length, 0) / 2);
  // a block of four pixels becomes their mean
  const px = new Uint8ClampedArray([0, 0, 0, 255, 100, 40, 200, 255, 200, 80, 0, 255, 100, 40, 200, 255]);
  assert.deepEqual([...shrink(px, 2, 1)], [100, 40, 100, 255]);
  assert.equal(shrink(px, 2, 4), px);
});

test("the full export is what it was: scenery is a mode, not a change", () => {
  const a = i3dFiles(sanitize({ kind: "house" }), { withTex: true })["house.i3d"], b = i3dFiles(sanitize({ kind: "house" }), { withTex: true, scenery: false })["house.i3d"];
  assert.equal(a, b);
  assert.ok(sceneryKeeps("walls") && sceneryKeeps("gutter") && !sceneryKeeps("fittings2") && !sceneryKeeps("wallsIn"));
  assert.ok(Object.keys(PRESETS).length > 0);
});
