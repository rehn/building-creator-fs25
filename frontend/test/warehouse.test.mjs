// The warehouse: a shop where the player buys pallets of goods and sells goods, the game's `warehouse` placeable type (a sellingStation with a palletBuyingStation;
// read in data/placeables/mapAS/warehouseAS/warehouseAS.xml). What can be bought and sold is chosen from lists made from the game's fill types.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildI3d, placeableXml, PRESETS, changeKind } from "../src/editor/model.mjs";
import { KIND } from "../src/editor/kinds/index.mjs";
import FILL_TYPES from "../src/editor/filltypes.mjs";

const make = extra => sanitize({kind: "warehouse", ...extra});
const count = (s, re) => (s.match(re) || []).length;

test("the fill types: the game's, with the ones that come on pallets marked", () => {
  const by = Object.fromEntries(FILL_TYPES.map(f => [f[0], f]));
  assert.ok(FILL_TYPES.length > 150);
  assert.equal(by.BREAD[3], true, "bread comes on pallets");
  assert.equal(by.WHEAT[3], false, "wheat does not");
  assert.equal(by.MILK_BOTTLED[1], "Milk bottled");
  assert.ok(FILL_TYPES.filter(f => f[3]).length > 60);
});

test("the kind is there: a shop with a list of what it sells and a list of what it buys", () => {
  assert.equal(KIND.warehouse.id, "warehouse");
  const p = make({});
  assert.ok(Array.isArray(p.buyList) && p.buyList.length > 0);
  assert.ok(Array.isArray(p.sellList) && p.sellList.length > 0);
  assert.ok(PRESETS.some(x => x.kind === "warehouse"), "a preset to start from");
  assert.deepEqual(p.objects.map(o => o.type).sort(), ["counter", "palletspawn", "unload"], "the three game objects it needs");
});

test("the lists keep what the game has, once, in the game's order: anything else goes", () => {
  const p = make({buyList: ["BREAD", "NOPE", "BREAD", "FLOUR", 5, null], sellList: ["WHEAT", "BARLEY"]});
  assert.deepEqual(p.buyList, ["BREAD", "FLOUR"]);
  assert.deepEqual(p.sellList, ["BARLEY", "WHEAT"], "any fill type can be sold to it (in the game's order)");
  assert.deepEqual(make({buyList: []}).buyList, [], "an empty list is allowed: nothing to buy");
  assert.ok(make({buyList: "BREAD"}).buyList.length > 1, "not a list: the starting one");
  assert.ok(!make({buyList: ["WHEAT"]}).buyList.includes("WHEAT"), "wheat does not come on pallets: it cannot be sold as a pallet");
});

test("the placeable: type warehouse, the pallets to buy with a price each, spawn places, and what it buys", () => {
  const p = make({buyList: ["BREAD", "FLOUR"], sellList: ["EGG", "HONEY", "WHEAT"], buyPrice: 150, sellPrice: 90, palletLines: 2});
  const xml = placeableXml(p, "Affär");
  assert.match(xml, /<placeable type="warehouse">/);
  assert.equal(count(xml, /<fillType name="[A-Z_]+" priceScale="1.5"\/>/g), 2);
  assert.match(xml, /<fillType name="BREAD" priceScale="1.5"\/>/);
  assert.match(xml, /<palletBuyingStation triggerNode="palletBuyingActivationTrigger">/);
  assert.equal(count(xml, /<spawnPlace startNode="palletAreaStart0\d" endNode="palletAreaEnd0\d"/g), 2);
  assert.match(xml, /<sellingStation [^>]*>/);
  assert.match(xml, /<unloadTrigger exactFillRootNode="unloadTrigger" aiNode="unloadTriggerAINode" fillTypes="EGG HONEY WHEAT" priceScale="0.9"\/>/);
  assert.match(xml, /<palletTrigger triggerNode="palletTrigger" aiNode="unloadTriggerAINode" fillTypes="EGG HONEY WHEAT" priceScale="0.9"\/>/);
  assert.match(xml, /<hotspot type="SHOP" linkNode="palletBuyingActivationTriggerMarker"/);
  assert.match(xml, /<hotspot type="UNLOADING_PALLET" linkNode="unloadTriggerMarker"/);
  assert.match(xml, /markerIconShopping.i3d/);
  assert.match(xml, /markerIconPallet.i3d/);
});

test("the i3d has the nodes the XML names, with the game's collision groups, and every one is mapped", () => {
  const i3d = buildI3d(make({}));
  for (const n of ["palletBuyingActivationTrigger", "palletBuyingActivationTriggerMarker", "palletSpawner", "palletAreaStart01", "palletAreaEnd01", "sellingStation", "unloadTrigger", "unloadTriggerMarker", "unloadTriggerAINode", "palletTrigger"])
    assert.ok(i3d.includes(`name="${n}"`), n);
  assert.match(i3d, /<Shape name="palletBuyingActivationTrigger"[^>]*static="true"[^>]*trigger="true"[^>]*collisionFilterGroup="0x20000000"[^>]*collisionFilterMask="0x100000"/);
  assert.match(i3d, /<Shape name="unloadTrigger"[^>]*kinematic="true"[^>]*compound="true"[^>]*collisionFilterGroup="0x40000000"[^>]*collisionFilterMask="0x20000000"/);
  assert.match(i3d, /<Shape name="palletTrigger"[^>]*trigger="true"[^>]*collisionFilterGroup="0x20000000"[^>]*collisionFilterMask="0x10000"/);
  const xml = placeableXml(make({}), "x");
  for (const id of ["palletBuyingActivationTrigger", "palletAreaStart01", "palletAreaEnd01", "unloadTrigger", "unloadTriggerAINode", "palletTrigger"]) assert.ok(xml.includes(`<i3dMapping id="${id}"`), `mapped: ${id}`);
});

test("one to three lines of pallets, along the long side of the delivery area", () => {
  assert.equal(count(buildI3d(make({palletLines: 1})), /name="palletAreaStart0\d"/g), 1);
  assert.equal(count(buildI3d(make({palletLines: 3})), /name="palletAreaStart0\d"/g), 3);
  assert.equal(make({palletLines: 9}).palletLines, 3);
});

test("it is not for sale unless it is asked to be (a map places it, as in the game); then it is in the shop", () => {
  assert.match(placeableXml(make({}), "x"), /<canBeSold>false<\/canBeSold>/);
  assert.match(placeableXml(make({shopBuyable: true}), "x"), /<canBeSold>true<\/canBeSold>/);
});

test("a house can be changed into a warehouse: the form stays, the three game objects are added", () => {
  const r = changeKind(sanitize({kind: "house", width: 12, depth: 8}), "warehouse");
  assert.ok(r.ok);
  assert.deepEqual(r.settings.objects.map(o => o.type).sort(), ["counter", "palletspawn", "unload"]);
  assert.equal(r.settings.width, 12);
  assert.ok(r.settings.buyList.length > 0);
});

test("bale types and goods without a pallet cannot be chosen (the game warns or crashes on them)", () => {
  const p = make({sellList: ["STRAW", "COTTON", "WHEAT"], buyList: ["MILK", "BREAD"]});
  assert.deepEqual(p.sellList, ["WHEAT"], "bales need a BaleUnloadTrigger");
  assert.deepEqual(p.buyList, ["BREAD"], "milk has no pallet in the store: the game's Lua fails on it");
});
