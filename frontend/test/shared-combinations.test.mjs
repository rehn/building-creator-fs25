// Every combination of the shared game objects (kinds/gameobjects.mjs: a sleep point, a workshop, a vehicle shop, a grain intake, a fuel area, a pallet shop) on one building:
// 6 groups, 64 combinations. The game reads one of each element of a placeable's XML (a second <hotspots> is ignored, which is how the workshop once went missing), every node the
// XML names has to be in the i3d, and the placeable type has to be defined by the game or by the mod's own modDesc with every specialization once.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildI3d, placeableXml, modDescXml, modTypesFor } from "../src/editor/model.mjs";
import { SHARED, sharedDefaults } from "../src/editor/kinds/gameobjects.mjs";

const GROUPS = Object.keys(SHARED);
const MOD = "FS25_Combo";
const count = (s, re) => (s.match(re) || []).length;
const ATTRS = ["node", "triggerNode", "startNode", "endNode", "linkNode", "teleportNode", "exactFillRootNode", "aiNode", "spawnNode", "cameraNode", "playerTriggerNode", "iconNode", "sellTriggerNode"];
/** What the group needs to show in the XML: [a pattern, how many times]. */
const NEEDS = {
  sleep: [[/<farmhouse spawnNode="spawnPoint">/, 1]],
  workshop: [[/<workshop>/, 1]],
  vehicleshop: [[/<vehicleBuyingStation>/, 1]],
  intake: [[/<unloadTrigger exactFillRootNode="unloadNodeTrailer"/, 1]],
  pump: [[/<buyingStation node="gasStation"/, 1]],
  warehouse: [[/<palletBuyingStation /, 1], [/<palletTrigger /, 1]],
};
const GAME_TYPE = {sleep: "farmhouse", workshop: "garageWorkshopSolarPanels", intake: "sellingStation", pump: "buyingStation", warehouse: "warehouse"};

const house = (groups) => {
  const base = sanitize({kind: "house", objects: []});
  const objects = groups.flatMap(g => SHARED[g].types.flatMap(t => sharedDefaults(base, t)));
  return sanitize({kind: "house", objects});
};

for (let mask = 0; mask < 1 << GROUPS.length; mask++) {
  const groups = GROUPS.filter((_, i) => mask & (1 << i)), label = groups.join(" + ") || "none";
  test(`shared objects together: ${label}`, () => {
    const p = house(groups);
    assert.deepEqual(GROUPS.filter(g => SHARED[g].has(p)).sort(), groups.slice().sort(), "the objects are all there, and no others come with them");
    const xml = placeableXml(p, "Combo", {mod: MOD}), i3d = buildI3d(p), desc = modDescXml(p, "Combo");

    // the game reads one of each
    for (const tag of ["hotspots", "triggerMarkers", "sellingStation", "farmhouse", "workshop", "vehicleBuyingStation", "palletBuyingStation", "buyingStation", "indoorAreas", "animatedObjects"]) {
      assert.ok(count(xml, new RegExp(`<${tag}[ >]`, "g")) <= 1, `${tag} at most once`);
    }
    for (const g of groups) for (const [re, n] of NEEDS[g]) assert.equal(count(xml, new RegExp(re.source, "g")), n, `${g}: ${re}`);
    if (groups.includes("intake") && groups.includes("warehouse")) assert.equal(count(xml, /<unloadTrigger /g), 2, "both triggers in the one selling station");

    // every node the XML names is in the i3d
    const names = new Set([...i3d.matchAll(/<(?:TransformGroup|Shape|Camera|Light|ReferenceNode)[^>]*\sname="([^"]+)"/g)].map(m => m[1]));
    const before = xml.slice(0, xml.indexOf("<i3dMappings>") < 0 ? xml.length : xml.indexOf("<i3dMappings>"));   // (the mappings name nodes by path: 0>6|0|0)
    for (const a of ATTRS) for (const m of before.matchAll(new RegExp(`\\s${a}="([^"]+)"`, "g"))) {
      if (m[1] === "0>" || m[1] === "0" || /^\$/.test(m[1]) || m[1].startsWith("$")) continue;
      assert.ok(names.has(m[1]), `${a}="${m[1]}" is a node in the i3d`);
    }
    // the mappings are unique
    const ids = [...xml.matchAll(/<i3dMapping id="([^"]+)"/g)].map(m => m[1]);
    assert.equal(new Set(ids).size, ids.length, "each i3dMapping id once");

    // the placeable type: the game's own for one object, else the mod's own, defined once in the modDesc with each specialization once
    const type = xml.match(/<placeable type="([^"]+)">/)[1], types = modTypesFor(p, MOD);
    if (groups.length === 0) { assert.equal(type, "simplePlaceable"); assert.deepEqual(types, []); }
    else if (groups.length === 1 && GAME_TYPE[groups[0]]) { assert.equal(type, GAME_TYPE[groups[0]]); assert.deepEqual(types, []); }
    else {
      assert.equal(types.length, 1);
      assert.equal(type, `${MOD}.${types[0].name}`);
      assert.equal(types[0].parent, "simplePlaceable");
      assert.equal(new Set(types[0].specializations).size, types[0].specializations.length, "no specialization twice");
      for (const g of groups) for (const s of SHARED[g].specializations) assert.ok(types[0].specializations.includes(s), `${g} needs ${s}`);
      assert.equal(count(desc, new RegExp(`<type name="${types[0].name}" `, "g")), 1, "defined once in the modDesc");
    }
    if (groups.length === 0 || (groups.length === 1 && GAME_TYPE[groups[0]])) assert.doesNotMatch(desc, /<placeableTypes>/);   // (the game's own type: nothing to define)
  });
}
