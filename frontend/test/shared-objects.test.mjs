// Game objects that do not belong to one kind of building (docs/PLAN_MOD.md step 1): a sleep point and a vehicle workshop can be put on any
// building, and the export gives the building a placeable type with what they need.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildI3d, placeableXml, modDescXml, modTypesFor, PRESETS } from "../src/editor/model.mjs";
import { kindOf } from "../src/editor/kinds/index.mjs";
import { allowedTypes, cleanObjects } from "../src/editor/objects.mjs";
import { SHARED, sharedDefaults } from "../src/editor/kinds/gameobjects.mjs";

const preset = id => PRESETS.find(x => x.id === id).settings;
const sleepObj = {type: "sleep", x: 0, z: 6, w: 1.8, d: 1.8, h: 2.2, ix: 0, iz: 0};
const workObj = {type: "workshop", x: 0, z: 0, w: 6, d: 4, h: 3, ix: 0, iz: 0};

test("sleep and workshop are allowed on every kind of building", () => {
  for (const id of ["house", "shed", "chicken", "cow", "sheep", "dealership", "grainsilo", "fuelstation"]) {
    const kind = kindOf({kind: id});
    for (const t of ["sleep", "workshop"]) assert.ok(allowedTypes(kind).includes(t), `${id} takes ${t}`);
  }
  // what a kind has of its own is still there
  assert.ok(allowedTypes(kindOf({kind: "cow"})).includes("pasture"));
});

test("a cow barn keeps a sleep point and a workshop (one of each) when cleaned", () => {
  const p = sanitize(preset("ladugard")), kind = kindOf(p);
  const list = cleanObjects([...p.objects, sleepObj, {...sleepObj, x: 3}, workObj], kind, p);
  assert.equal(list.filter(o => o.type === "sleep").length, 1);
  assert.equal(list.filter(o => o.type === "workshop").length, 1);
  assert.ok(list.some(o => o.type === "pasture"), "its own objects stay");
});

test("the shared types have a default place, for the editor's add button", () => {
  const p = sanitize(preset("ladugard"));
  for (const t of ["sleep", "workshop"]) { const d = sharedDefaults(p, t); assert.equal(d.length, 1, t); assert.equal(d[0].type, t); }
  assert.deepEqual(Object.keys(SHARED).sort(), ["intake", "pump", "sleep", "vehicleshop", "workshop"]);
});

test("a house with only a sleep point is a farmhouse; a shed with only a workshop is a garage with a workshop (as before)", () => {
  const house = sanitize({kind: "house", objects: [sleepObj]});
  assert.match(placeableXml(house, "H"), /<placeable type="farmhouse">/);
  assert.deepEqual(modTypesFor(house), []);
  const shed = sanitize({...preset("garage"), objects: [workObj]});
  assert.match(placeableXml(shed, "G"), /<placeable type="garageWorkshopSolarPanels">/);
  assert.deepEqual(modTypesFor(shed), []);
});

test("a house with a sleep point and a workshop gets a type of the mod's own with both sets of specializations", () => {
  const p = sanitize({kind: "house", objects: [sleepObj, workObj]});
  const types = modTypesFor(p);
  assert.equal(types.length, 1);
  assert.equal(types[0].parent, "simplePlaceable");
  for (const s of ["farmhouse", "wardrobe", "cartridgePlayer", "npcSpot", "workshop", "solarPanels", "incomePerHour"]) assert.ok(types[0].specializations.includes(s), s);
  assert.equal(new Set(types[0].specializations).size, types[0].specializations.length, "none twice");
  const xml = placeableXml(p, "Mixed", {mod: "FS25_Mixed"});
  assert.ok(xml.includes(`<placeable type="FS25_Mixed.${types[0].name}">`), xml.slice(0, 120));
  const desc = modDescXml(p, "Mixed");
  assert.ok(desc.includes(`<type name="${types[0].name}" parent="simplePlaceable"`), "the modDesc defines it");
  assert.match(desc, /<specialization name="workshop"\/>/);
  const i3d = buildI3d(p);
  assert.ok(i3d.includes('name="sleepingTrigger"') && i3d.includes('name="workShop"'), "both sets of nodes");
});

test("a hen house with a sleep point: the type is the hen house's own with the farmhouse added; its own nodes stay", () => {
  const base = sanitize(preset("longHenHouse"));
  const p = sanitize({...base, objects: [...base.objects, sleepObj]});
  assert.ok(p.objects.some(o => o.type === "sleep"), "kept");
  const types = modTypesFor(p), own = placeableXml(base, "Hen", {mod: "FS25_Hen"}).match(/<placeable type="([^"]+)"/)[1];
  assert.equal(types.length, 1);
  assert.equal(types[0].parent, own, "built on the hen house's type");
  assert.deepEqual(types[0].specializations.sort(), ["cartridgePlayer", "farmhouse", "npcSpot", "wardrobe"]);
  const i3d = buildI3d(p);
  assert.ok(i3d.includes('name="sleepingTrigger"'));
  assert.match(placeableXml(p, "Hen", {mod: "FS25_Hen"}), /<farmhouse spawnNode="spawnPoint">/);
  // the hen house own XML is still there
  assert.ok(placeableXml(p, "Hen", {mod: "FS25_Hen"}).includes("<husbandry saveId=\"Animals_CHICKEN\""));
});

test("a building without them has no extra type and no sleep nodes", () => {
  const p = sanitize({kind: "house", objects: []});
  assert.deepEqual(modTypesFor(p), []);
  assert.ok(!buildI3d(p).includes('name="sleepingTrigger"'));
  assert.match(placeableXml(p, "H"), /<placeable type="simplePlaceable">/);
});

test("with both a sleep point and a workshop the XML has one <triggerMarkers> and one <hotspots> (the game reads only the first of each), with both entries", () => {
  const xml = placeableXml(sanitize({kind: "house", objects: [sleepObj, workObj]}), "Mixed", {mod: "FS25_Mixed"});
  for (const tag of ["triggerMarkers", "hotspots"]) assert.equal((xml.match(new RegExp(`<${tag}>`, "g")) || []).length, 1, tag);
  assert.match(xml, /markerIconSleep/);
  assert.match(xml, /markerIconWrench/);
  assert.match(xml, /<hotspot type="FARM"/);
  assert.match(xml, /<hotspot type="SHOP"/);
  assert.equal((xml.match(/<farmhouse /g) || []).length, 1);
  assert.equal((xml.match(/<workshop>/g) || []).length, 1);
});
