// Sheds and garages: a walk-in building of the "sheds" category. A vehicle workshop is a game object (not a kind of its own): with one,
// the export is a garageWorkshopSolarPanels placeable with the workshop's triggers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, buildI3d, placeableXml, catalogFor, PRESETS } from "../src/editor/model.mjs";
import { kindOf } from "../src/editor/kinds/index.mjs";
import { cleanObjects } from "../src/editor/objects.mjs";

const preset = id => PRESETS.find(x => x.id === id);

test("shed presets: garage, machine shed and woodshed exist and build", () => {
  for (const id of ["garage", "maskinhall", "vedbod"]) {
    const x = preset(id);
    assert.ok(x, id);
    assert.equal(x.kind, "shed");
    assert.equal(x.category, "sheds");
    const p = sanitize(x.settings);
    assert.equal(p.kind, "shed");
    assert.ok(buildGeometry(p).G.walls.i.length > 0, `${id}: has walls`);
    assert.match(buildI3d(p), /<\/i3D>/);
  }
});

test("a shed is walk-in with a catalog for a workbench, shelves and a lift", () => {
  const p = sanitize(preset("garage").settings), kind = kindOf(p), cat = catalogFor(p);
  assert.equal(kind.walkIn, true);
  for (const t of ["workbench", "toolwall", "shelves", "lift"]) assert.ok(cat[t], t);
});

test("a vehicle workshop is a game object that can be added, and only once", () => {
  const p = sanitize(preset("garage").settings), kind = kindOf(p);
  assert.ok(kind.objects.types.includes("workshop"));
  assert.ok(!kind.objects.required.includes("workshop"), "optional");
  const objs = cleanObjects([{type: "workshop", x: 0, z: 0}, {type: "workshop", x: 1, z: 1}], kind, p);
  assert.equal(objs.filter(o => o.type === "workshop").length, 1);
});

test("without a workshop the shed is a plain placeable; with one it has the workshop's triggers", () => {
  const base = sanitize({...preset("garage").settings, objects: []}), plain = placeableXml(base, "Garage");
  assert.match(plain, /<placeable type="simplePlaceable">/);
  assert.doesNotMatch(plain, /<workshop>/);
  const w = sanitize({...base, objects: [{type: "workshop", x: 0, z: 0, w: 6, d: 4, h: 3, ix: 0, iz: 0}]});
  const xml = placeableXml(w, "Garage"), i3d = buildI3d(w);
  assert.match(xml, /<placeable type="garageWorkshopSolarPanels">/);
  assert.match(xml, /<workshop>\s*<sellingPoint playerTriggerNode="playerTrigger" iconNode="markerWrench" sellTriggerNode="vehicleTrigger"/);
  assert.match(xml, /markerIconWrench\.i3d/);
  for (const n of ["vehicleTrigger", "playerTrigger", "markerWrench"]) {
    assert.match(i3d, new RegExp(`name="${n}"`), n);
    assert.match(xml, new RegExp(`<i3dMapping id="${n}"`), `${n} mapped`);
  }
  assert.match(i3d, /name="vehicleTrigger"[^>]*collisionFilterMask="0x10000"/);
  assert.match(i3d, /name="playerTrigger"[^>]*collisionFilterMask="0x100000"/);
});
