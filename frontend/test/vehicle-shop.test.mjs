// The vehicle shop (a shop counter and a delivery place) as a game object that any building can have (docs/PLAN_MOD.md step 1): the dealership is
// just a building with one. The warehouse's and the map shop's counters are their own and are left alone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildI3d, placeableXml, modDescXml, modTypesFor, PRESETS } from "../src/editor/model.mjs";
import { kindOf } from "../src/editor/kinds/index.mjs";
import { allowedTypes, SHARED_GROUPS } from "../src/editor/objects.mjs";
import { SHARED } from "../src/editor/kinds/gameobjects.mjs";

const preset = id => PRESETS.find(x => x.id === id).settings;
const counter = {type: "counter", x: 0, z: 2, w: 2, d: 1.4, h: 2.6, ix: 0, iz: 0};
const spawn = {type: "spawn", x: 0, z: 9, w: 12, d: 5, h: 3.5, ix: 0, iz: 0};
const count = (s, re) => (s.match(re) || []).length;

test("the shared groups in objects.mjs are the shared exporters' types", () => {
  assert.deepEqual(Object.keys(SHARED_GROUPS).sort(), Object.keys(SHARED).sort());
  for (const [id, types] of Object.entries(SHARED_GROUPS)) assert.deepEqual(SHARED[id].types, types, id);
});

test("every kind can have a shop counter and a delivery place, except the map shop, which uses those names for its own", () => {
  for (const id of ["house", "shed", "chicken", "cow", "sheep", "grainsilo", "fuelstation", "dealership", "warehouse"]) for (const t of ["counter", "spawn"]) assert.ok(allowedTypes(kindOf({kind: id})).includes(t), `${id} takes ${t}`);
  // the map shop's counter and delivery place are the map's shop nodes, not a vehicle shop
  for (const t of ["counter", "spawn"]) assert.ok(allowedTypes(kindOf({kind: "defaultdealer"})).includes(t), "its own " + t);
});

test("a counter comes with a delivery place and the other way round (the shop needs both)", () => {
  const a = sanitize({kind: "house", objects: [counter]});
  assert.deepEqual(a.objects.map(o => o.type).sort(), ["counter", "spawn"]);
  const b = sanitize({kind: "house", objects: [spawn]});
  assert.deepEqual(b.objects.map(o => o.type).sort(), ["counter", "spawn"]);
  assert.deepEqual(sanitize({kind: "house", objects: []}).objects, []);
  // the warehouse's own counter does not get a vehicle delivery place
  assert.ok(!sanitize(preset("affar")).objects.some(o => o.type === "spawn"));
});

test("a house with a shop counter and a delivery place is a vehicle shop: a type of the mod's own with the buying station, the vehicles and the nodes", () => {
  const p = sanitize({kind: "house", objects: [counter, spawn], sellTractors: true, sellPrice: 150, sellDelivery: 1000});
  const xml = placeableXml(p, "Shop", {mod: "FS25_Shop"});
  const types = modTypesFor(p, "FS25_Shop");
  assert.equal(types.length, 1);
  assert.deepEqual([types[0].parent, types[0].specializations], ["simplePlaceable", ["vehicleBuyingStation"]]);
  assert.ok(xml.includes(`<placeable type="FS25_Shop.${types[0].name}">`));
  assert.match(xml, /<vehicleBuyingStation>[\s\S]*<trigger node="shopTrigger"\/>/);
  assert.match(xml, /transportCosts="1000"/);
  const items = xml.match(/<storeItem xmlFilename=/g) || [];
  assert.ok(items.length > 10, "tractors from the base game: " + items.length);
  const i3d = buildI3d(p);
  assert.ok(i3d.includes('name="shopTrigger"') && i3d.includes('name="vehicleSpawnStart01"') && i3d.includes('name="markerShop"'));
  assert.ok(modDescXml(p, "Shop").includes("vehicleBuyingStation"));
});

test("the vehicle settings are on every building (switched on by group; none ticked is tractors), and a price of 150 % raises the price", () => {
  const house = sanitize({kind: "house"});
  assert.equal(house.sellTractors, false);
  assert.equal(house.sellPrice, 100);
  const itemsOf = x => new Set(x.match(/<storeItem xmlFilename="[^"]+"/g) || []);
  const hay = itemsOf(placeableXml(sanitize({kind: "cow", objects: [counter, spawn], sellHay: true}), "x")), tractors = itemsOf(placeableXml(sanitize({kind: "cow", objects: [counter, spawn]}), "x"));
  assert.ok(hay.size > 0 && tractors.size > 0 && [...hay].every(i => !tractors.has(i)), "the groups are different vehicles");
  const price = xml => Number(xml.match(/<storeItem xmlFilename="[^"]+" price="(\d+)"/)[1]);
  const one = price(placeableXml(sanitize({kind: "house", objects: [counter, spawn]}), "x")), more = price(placeableXml(sanitize({kind: "house", objects: [counter, spawn], sellPrice: 200}), "x"));
  assert.equal(more, one * 2);
});

test("a house with a sleep point, a workshop and a shop gets one type with every specialization once, and one <hotspots> and <triggerMarkers>", () => {
  const p = sanitize({kind: "house", objects: [{type: "sleep", x: 0, z: 6, w: 1.8, d: 1.8, h: 2.2}, {type: "workshop", x: 0, z: -2, w: 5, d: 3, h: 3}, counter, spawn]});
  const types = modTypesFor(p, "FS25_M"), specs = types[0].specializations;
  assert.equal(types.length, 1);
  for (const s of ["farmhouse", "workshop", "vehicleBuyingStation"]) assert.ok(specs.includes(s), s);
  assert.equal(new Set(specs).size, specs.length);
  const xml = placeableXml(p, "M", {mod: "FS25_M"});
  assert.equal(count(xml, /<hotspots>/g), 1);
  assert.equal(count(xml, /<triggerMarkers>/g), 1);
  assert.equal(count(xml, /<hotspot /g), 3);
});

test("the dealership is a building with a vehicle shop: the same export, its objects are required", () => {
  const p = sanitize(preset("maskinaffar")), kind = kindOf(p);
  assert.deepEqual(kind.objects.required.sort(), ["counter", "spawn"]);
  const xml = placeableXml(p, "Affar", {mod: "FS25_Affar"});
  assert.match(xml, /<vehicleBuyingStation>/);
  assert.equal(modTypesFor(p, "FS25_Affar").length, 1);
  const i3d = buildI3d(p);
  assert.ok(i3d.includes('name="shopTrigger"') && i3d.includes('name="vehicleSpawnStart01"'));
  assert.equal(count(i3d, /<Shape[^>]*name="shopTrigger"/g), 1, "one node");
});

test("the map shop and the warehouse keep their own counters: no buying station of this kind", () => {
  const dealer = sanitize(preset("lillabutiken")), dx = placeableXml(dealer, "x");
  assert.doesNotMatch(dx, /<vehicleBuyingStation>/);
  assert.deepEqual(modTypesFor(dealer, "FS25_X"), []);
  assert.ok(buildI3d(dealer).includes("vehicleShopTrigger"));
  const wh = sanitize(preset("affar")), wx = placeableXml(wh, "x");
  assert.doesNotMatch(wx, /<vehicleBuyingStation>/);
  assert.match(wx, /palletBuyingStation/);
});
