// The pallet shop (a counter where the player buys pallets, a delivery area where they appear and a selling area where goods are sold) as game objects any
// building can have (docs/PLAN_MOD.md step 1): the warehouse is a building with them. The counter is its own object, palletcounter (counter is the vehicle shop's).
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildI3d, placeableXml, modTypesFor, PRESETS } from "../src/editor/model.mjs";
import { kindOf } from "../src/editor/kinds/index.mjs";
import { allowedTypes, SHARED_GROUPS } from "../src/editor/objects.mjs";
import { SHARED, sharedDefaults } from "../src/editor/kinds/gameobjects.mjs";

const count = (s, re) => (s.match(re) || []).length;
const pc = {type: "palletcounter", x: -2, z: 3, w: 2.4, d: 1.4, h: 2.6, ix: 0, iz: 0};
const ps = {type: "palletspawn", x: 8, z: 0, w: 2.8, d: 6, h: 0.4, ix: 0, iz: 0};
const un = {type: "unload", x: 0, z: 6, w: 6, d: 4, h: 3, ix: 0, iz: 0};
const intake = {type: "intake", x: 0, z: 0, w: 5, d: 4, h: 2, ix: 0, iz: 0};

test("every kind can have the pallet shop's objects, and they come together", () => {
  for (const id of ["house", "shed", "chicken", "cow", "sheep", "dealership", "grainsilo", "fuelstation", "warehouse"]) for (const t of ["palletcounter", "palletspawn", "unload"]) assert.ok(allowedTypes(kindOf({kind: id})).includes(t), `${id} takes ${t}`);
  assert.deepEqual(SHARED_GROUPS.warehouse, ["palletcounter", "palletspawn", "unload"]);
  assert.deepEqual(SHARED.warehouse.types, ["palletcounter", "palletspawn", "unload"]);
  for (const t of SHARED_GROUPS.warehouse) assert.equal(sharedDefaults(sanitize({kind: "house"}), t).length, 1, t);
  assert.deepEqual(sanitize({kind: "house", objects: [pc]}).objects.map(o => o.type).sort(), ["palletcounter", "palletspawn", "unload"]);
  assert.deepEqual(sanitize({kind: "house", objects: [un]}).objects.map(o => o.type).sort(), ["palletcounter", "palletspawn", "unload"]);
});

test("a house with the pallet shop is the game's warehouse: its own type, the buying station with the goods of the list and the selling station", () => {
  const p = sanitize({kind: "house", objects: [pc, ps, un], buyList: ["BREAD", "FLOUR"], sellList: ["EGG"], buyPrice: 144, goodsPrice: 120, palletLines: 2});
  const xml = placeableXml(p, "Shop", {mod: "FS25_Shop"});
  assert.match(xml, /<placeable type="warehouse">/);
  assert.deepEqual(modTypesFor(p, "FS25_Shop"), []);
  assert.match(xml, /<palletBuyingStation triggerNode="palletBuyingActivationTrigger">/);
  assert.match(xml, /<fillType name="BREAD" priceScale="1\.44"\/>/);
  assert.doesNotMatch(xml, /name="CAKE"/);
  assert.match(xml, /<sellingStation appearsOnStats="true"/);
  assert.match(xml, /<unloadTrigger exactFillRootNode="unloadTrigger"[^>]*fillTypes="EGG" priceScale="1\.2"/);
  assert.equal(count(xml, /<spawnPlace /g), 2, "two lines of pallets");
  const i3d = buildI3d(p);
  for (const n of ["palletBuyingActivationTrigger", "palletSpawner", "unloadTrigger", "palletTrigger"]) assert.ok(i3d.includes(`name="${n}"`), n);
});

test("the goods lists and prices are on every building", () => {
  const h = sanitize({kind: "house"});
  assert.ok(Array.isArray(h.buyList) && h.buyList.includes("BREAD"));
  assert.ok(Array.isArray(h.sellList) && h.sellList.includes("EGG"));
  assert.equal(h.buyPrice, 144);
  assert.equal(h.goodsPrice, 100);
  assert.equal(h.palletLines, 2);
  assert.deepEqual(sanitize({kind: "cow", buyList: ["BREAD", "NOT_A_GOOD", "BREAD"]}).buyList, ["BREAD"]);
});

test("a pallet shop and a grain intake in one building: one type with every specialization once, and one <sellingStation> holding both triggers", () => {
  const p = sanitize({kind: "house", objects: [pc, ps, un, intake]});
  const types = modTypesFor(p, "FS25_M"), specs = types[0].specializations;
  assert.equal(types.length, 1);
  assert.equal(types[0].parent, "simplePlaceable");
  assert.ok(specs.includes("sellingStation") && specs.includes("palletBuyingStation"));
  assert.equal(new Set(specs).size, specs.length);
  const xml = placeableXml(p, "M", {mod: "FS25_M"});
  assert.equal(count(xml, /<sellingStation[ >]/g), 1, "the game reads one");
  assert.equal(count(xml, /<unloadTrigger /g), 2, "the grain's and the warehouse's");
  assert.equal(count(xml, /<palletTrigger /g), 1);
  assert.equal(count(xml, /<hotspots>/g), 1);
  assert.equal(count(xml, /<triggerMarkers>/g), 1);
});

test("a vehicle shop and a pallet shop together: the two counters are different objects", () => {
  const veh = [{type: "counter", x: 0, z: 2, w: 2, d: 1.4, h: 2.6, ix: 0, iz: 0}, {type: "spawn", x: 0, z: 9, w: 12, d: 5, h: 3.5, ix: 0, iz: 0}];
  const p = sanitize({kind: "house", objects: [...veh, pc, ps, un]});
  assert.equal(p.objects.length, 5);
  const xml = placeableXml(p, "M", {mod: "FS25_M"});
  assert.match(xml, /<vehicleBuyingStation>/);
  assert.match(xml, /<palletBuyingStation /);
  assert.equal(modTypesFor(p, "FS25_M").length, 1);
});

test("the warehouse is a building with the three objects required; its counter is the pallet counter and it is not in the shop unless asked", () => {
  const p = sanitize(PRESETS.find(x => x.id === "affar").settings), kind = kindOf(p);
  assert.deepEqual(kind.objects.required.slice().sort(), ["palletcounter", "palletspawn", "unload"]);
  assert.deepEqual(p.objects.map(o => o.type).sort(), ["palletcounter", "palletspawn", "unload"]);
  const xml = placeableXml(p, "Affar", {mod: "FS25_Affar"});
  assert.match(xml, /<placeable type="warehouse">/);
  assert.match(xml, /<canBeSold>false<\/canBeSold>/);
  assert.match(placeableXml(sanitize({...PRESETS.find(x => x.id === "affar").settings, shopBuyable: true}), "A"), /<canBeSold>true<\/canBeSold>/);
  assert.doesNotMatch(xml, /vehicleBuyingStation/);
  assert.deepEqual(modTypesFor(p, "FS25_Affar"), []);
});
