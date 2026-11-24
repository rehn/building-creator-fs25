// The fuel area (where the player fills diesel from an endless tank: the game's buyingStation) as a game object any building can have (docs/PLAN_MOD.md step 1):
// the fuel station is a building with one, and with the pumps drawn on their island.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildI3d, placeableXml, modTypesFor, PRESETS } from "../src/editor/model.mjs";
import { kindOf } from "../src/editor/kinds/index.mjs";
import { allowedTypes, SHARED_GROUPS } from "../src/editor/objects.mjs";
import { SHARED, sharedDefaults } from "../src/editor/kinds/gameobjects.mjs";

const pump = {type: "pump", x: 0, z: 0, w: 8, d: 5, h: 4, ix: 0, iz: 0};
const sleep = {type: "sleep", x: 0, z: 6, w: 1.8, d: 1.8, h: 2.2, ix: 0, iz: 0};

test("every kind can have a fuel area", () => {
  for (const id of ["house", "shed", "chicken", "cow", "sheep", "dealership", "grainsilo", "fuelstation"]) assert.ok(allowedTypes(kindOf({kind: id})).includes("pump"), id);
  assert.deepEqual(SHARED_GROUPS.pump, ["pump"]);
  assert.deepEqual(SHARED.pump.types, ["pump"]);
  assert.equal(sharedDefaults(sanitize({kind: "house"}), "pump").length, 1);
});

test("a house with a fuel area is a buying station: the game's own type, its trigger, the hotspot and the price and speed of the settings", () => {
  const p = sanitize({kind: "house", objects: [pump], fuelPrice: 150, fuelRate: 40});
  const xml = placeableXml(p, "Pump");
  assert.match(xml, /<placeable type="buyingStation">/);
  assert.deepEqual(modTypesFor(p, "FS25_Pump"), []);
  assert.match(xml, /<buyingStation node="gasStation" supportsExtension="false">/);
  assert.match(xml, /fillLitersPerSecond="40"/);
  assert.match(xml, /<fillType name="diesel" priceScale="1\.5"\/>/);
  assert.match(xml, /<hotspot type="FUEL"/);
  const i3d = buildI3d(p);
  assert.ok(i3d.includes('name="gasStation"') && i3d.includes('name="gasStationTrigger"') && i3d.includes('name="mapPosition"'));
});

test("the fuel settings are on every building", () => {
  const h = sanitize({kind: "house"});
  assert.equal(h.fuelPrice, 100);
  assert.equal(h.fuelRate, 20);
  assert.equal(sanitize({kind: "cow"}).fuelRate, 20);
});

test("a fuel area with a sleep point: one type with both sets of specializations, one <hotspots> and one <triggerMarkers>", () => {
  const p = sanitize({kind: "house", objects: [pump, sleep]});
  const types = modTypesFor(p, "FS25_M");
  assert.equal(types.length, 1);
  assert.equal(types[0].parent, "simplePlaceable");
  assert.ok(types[0].specializations.includes("buyingStation") && types[0].specializations.includes("farmhouse"));
  const xml = placeableXml(p, "M", {mod: "FS25_M"});
  assert.equal((xml.match(/<hotspots>/g) || []).length, 1);
  assert.equal((xml.match(/<hotspot /g) || []).length, 2);
});

test("the fuel station is a building with a fuel area: the same export, its pumps are drawn, and it is never in the shop", () => {
  const p = sanitize(PRESETS.find(x => x.id === "bensinmack").settings), xml = placeableXml(p, "Mack");
  assert.deepEqual(kindOf(p).objects.required, ["pump"]);
  assert.match(xml, /<placeable type="buyingStation">/);
  assert.match(xml, /<canBeSold>false<\/canBeSold>/);
  assert.match(xml, /<showInStore>false<\/showInStore>/);
  assert.ok(buildI3d(p).includes('name="gasStationTrigger"'));
  assert.deepEqual(modTypesFor(p, "FS25_Mack"), []);
  assert.equal(p.pumpCount, 4);
});
