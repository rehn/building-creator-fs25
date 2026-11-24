// The grain intake (the game's unload station that buys the grain the player tips in it) as a game object any building can have (docs/PLAN_MOD.md step 1):
// the grain silo is a building with one. The price setting is grainPrice (sellPrice is the vehicle shop's).
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildI3d, placeableXml, modTypesFor, PRESETS } from "../src/editor/model.mjs";
import { kindOf } from "../src/editor/kinds/index.mjs";
import { allowedTypes, SHARED_GROUPS } from "../src/editor/objects.mjs";
import { SHARED, sharedDefaults } from "../src/editor/kinds/gameobjects.mjs";

const intake = {type: "intake", x: 0, z: 2, w: 5, d: 4, h: 2, ix: 0, iz: 0};
const sleep = {type: "sleep", x: 0, z: 6, w: 1.8, d: 1.8, h: 2.2, ix: 0, iz: 0};
const fills = xml => (xml.match(/fillTypes="([^"]*)"/) || [])[1];

test("every kind can have an intake", () => {
  for (const id of ["house", "shed", "chicken", "cow", "sheep", "dealership", "fuelstation", "grainsilo"]) assert.ok(allowedTypes(kindOf({kind: id})).includes("intake"), id);
  assert.deepEqual(SHARED_GROUPS.intake, ["intake"]);
  assert.deepEqual(SHARED.intake.types, ["intake"]);
  assert.equal(sharedDefaults(sanitize({kind: "house"}), "intake").length, 1);
});

test("a house with an intake is a selling station: the game's own type, the unload nodes and the grain the settings say", () => {
  const p = sanitize({kind: "house", objects: [intake], buyBarley: true, grainPrice: 150});
  const xml = placeableXml(p, "Silo");
  assert.match(xml, /<placeable type="sellingStation">/);
  assert.deepEqual(modTypesFor(p, "FS25_Silo"), []);
  assert.match(xml, /<sellingStation supportsExtension="false"/);
  assert.equal(fills(xml), "BARLEY");
  assert.match(xml, /priceScale="1\.5"/);
  const i3d = buildI3d(p);
  for (const n of ["unloadStationTrailer", "unloadNodeTrailer", "unloadMarkerTrailer", "unloadNodeAI"]) assert.ok(i3d.includes(`name="${n}"`), n);
  assert.match(xml, /markerIconUnload/);
  assert.match(xml, /<hotspot type="UNLOADING"/);
});

test("the station is turned 0 90 0, so its icon lands where the editor shows the box (x -> -z, z -> x: a point at local (a, b) is at world (b, -a))", () => {
  for (const [x, z] of [[3, -2], [-4, 1.5], [0, 5]]) {
    const p = sanitize({kind: "house", objects: [{...intake, x, z}]});
    const i3d = buildI3d(p);
    assert.match(i3d, /name="unloadStationTrailer"[^>]*rotation="0 90 0"/);
    const t = i3d.match(/name="unloadMarkerTrailer"[^>]*translation="([^"]+)"/)[1].split(" ").map(Number);
    assert.ok(Math.abs(t[2] - x) < 0.01 && Math.abs(-t[0] - z) < 0.01, `box at (${x}, ${z}): its marker is at world (${t[2]}, ${-t[0]})`);
  }
});

test("with no grain ticked it buys wheat; the hopper can be left out", () => {
  const p = sanitize({kind: "house", objects: [intake]});
  assert.equal(fills(placeableXml(p, "S")), "WHEAT");
  assert.match(placeableXml(p, "S"), /sellingStationGenericMedium/);
  assert.doesNotMatch(placeableXml(sanitize({kind: "house", objects: [intake], siloHopper: false}), "S"), /sellingStationGenericMedium/);
});

test("the grain settings are on every building", () => {
  const h = sanitize({kind: "house"});
  assert.equal(h.buyWheat, false);
  assert.equal(h.grainPrice, 100);
  assert.equal(h.siloHopper, true);
  assert.equal(sanitize({kind: "cow"}).grainPrice, 100);
});

test("an intake with a sleep point: one type with both sets of specializations, one <hotspots> and one <triggerMarkers>", () => {
  const p = sanitize({kind: "house", objects: [intake, sleep]});
  const types = modTypesFor(p, "FS25_M");
  assert.equal(types.length, 1);
  assert.equal(types[0].parent, "simplePlaceable");
  assert.ok(types[0].specializations.includes("sellingStation") && types[0].specializations.includes("farmhouse"));
  const xml = placeableXml(p, "M", {mod: "FS25_M"});
  assert.equal((xml.match(/<hotspots>/g) || []).length, 1);
  assert.equal((xml.match(/<triggerMarkers>/g) || []).length, 1);
});

test("the grain silo is a building with an intake: the same export, its silos still stand, and it is never in the shop", () => {
  const p = sanitize(PRESETS.find(x => x.id === "kornsilo").settings), xml = placeableXml(p, "Silo");
  assert.deepEqual(kindOf(p).objects.required, ["intake"]);
  assert.match(xml, /<placeable type="sellingStation">/);
  assert.match(xml, /<canBeSold>false<\/canBeSold>/);
  assert.match(xml, /<showInStore>false<\/showInStore>/);
  assert.equal(fills(xml), "WHEAT BARLEY OAT CANOLA MAIZE");
  assert.ok(buildI3d(p).includes('name="unloadNodeTrailer"'));
  assert.deepEqual(modTypesFor(p, "FS25_Silo"), []);
  assert.ok(p.siloCount > 0);
});
