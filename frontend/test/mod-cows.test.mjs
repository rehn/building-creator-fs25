// Cows and sheep in a mod (docs/PLAN_MOD.md, Lars: all the game logic belongs to the mod): a mod has ONE kind of animals (hens, cows or sheep), the yard's game objects are the mod's, and the
// whole mod is then ONE husbandry placeable of that animal, exported as the cow barn and the sheep barn write theirs (kinds/cow.mjs cowScene), with the mod's buildings cut out of the walking area.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeModPackage } from "../src/editor/modExport.mjs";
import { addGroup, removeGroup, groupsFree, settingsFor, groupOf, GROUPS, animalOfData, countOfData, ANIMALS } from "../src/lib/modObjects.mjs";

const text = bytes => (typeof bytes === "string" ? bytes : Buffer.from(bytes).toString("latin1"));
const posts = [
  {id: "a", kind: "building", name: "Ladugården", x: 20, z: 10, y: 0, rot: 0, data: {kind: "shed", width: 14, depth: 8, foundation: 0.3, doorStyle: "hole"}},
];
const yard = group => addGroup([], group, settingsFor({width: 14, depth: 8, foundation: 0.3}), [20, 10]);
const nodesOf = xml => [...xml.matchAll(/(?:node|triggerNode|startNode|endNode|exactFillRootNode|rootNode|linkNode|teleportNode|spawnNode)="([A-Za-z0-9_]+)"/g)].map(m => m[1]).filter(n => n !== "0");

test("the groups of the animals: cows and sheep are offered, and a mod has one kind of animals", () => {
  assert.ok(["hens", "cows", "sheep"].every(id => GROUPS.some(g => g.id === id)));
  assert.deepEqual(Object.keys(ANIMALS), ["hens", "cows", "sheep"]);
  const cows = yard("cows");
  assert.deepEqual(cows.map(o => o.type).sort(), ["bales", "feedTrough", "food", "info", "loading", "pasture", "waterTrough"], "no pallets for cows");
  assert.deepEqual(yard("sheep").map(o => o.type).sort(), ["bales", "feedTrough", "food", "info", "loading", "pallets", "pasture", "waterTrough"], "wool on pallets");
  assert.ok(cows.every(o => groupOf(o.type, "cows") === "cows"), "the group of an animal object is the mod's animal");
  assert.equal(groupOf("food", "hens"), "hens");
  assert.equal(groupOf("sleep", "cows"), "sleep", "the shared ones do not depend on it");
  const free = groupsFree(cows).map(g => g.id);
  assert.ok(!free.includes("hens") && !free.includes("cows") && !free.includes("sheep"), "one kind of animals: no other yard is offered");
  assert.ok(free.includes("sleep"));
  assert.equal(addGroup(cows, "sheep", settingsFor({width: 14, depth: 8})), cows, "and none is added");
  assert.deepEqual(removeGroup([...cows, ...addGroup([], "sleep", settingsFor({width: 14, depth: 8}))], cows[0].id, "cows").map(o => o.type), ["sleep"], "the whole yard goes");
  assert.ok(groupsFree([]).some(g => g.id === "cows"), "and all are offered to a mod without animals");
});

test("the animal and the number of them are read from the mod's plan data", () => {
  assert.equal(animalOfData(null), "hens");
  assert.equal(animalOfData({animal: "cows"}), "cows");
  assert.equal(animalOfData({animal: "dogs"}), "hens", "an animal the game has here, else the hens of the first mods");
  assert.equal(countOfData({animal: "cows"}), 12);
  assert.equal(countOfData({animal: "sheep"}), 20);
  assert.equal(countOfData({}), 30);
  assert.equal(countOfData({animal: "cows", cows: 500}), 100, "no more than the game's biggest barn");
  assert.equal(countOfData({animal: "sheep", sheep: 0}), 1);
  assert.equal(countOfData({hens: 40}), 40, "the hens of a mod made before the others");
});

test("a mod with cows is a cow barn placeable with the yard's husbandry, as the cow barn writes it", async () => {
  const {files} = await makeModPackage({name: "Kogården", posts, objects: yard("cows"), animal: "cows", cows: 18});
  const xml = text(files.get("house.xml")), i3d = text(files.get("house.i3d"));
  assert.match(xml, /<placeable type="cowHusbandryPasture">/);
  assert.match(xml, /<husbandry saveId="Animals_COW"/);
  assert.match(xml, /<animals type="COW" baseMaxNumAnimals="18" maxNumAnimals="18">/);
  assert.match(xml, /<hotspot type="COW" teleportNode="teleportNode"\/>/);
  assert.match(xml, /cowFence\/cowFence\.xml/);
  assert.match(xml, /defaultFillType="FORAGE"/);
  assert.match(xml, /<baleTrigger triggerNode="baleTrigger"/, "the bale drop");
  assert.doesNotMatch(xml, /palletSpawner|CHICKEN/);
  for (const n of ["exactFillRootNodeFood", "baleTrigger", "markerBales", "loadingTrigger", "infoTrigger", "teleportNode", "foodPlane", "waterPlane", "foodPlace1", "waterPlace1", "navigationRootNode", "fence1Node1", "navContour"])
    assert.ok(i3d.includes(`name="${n}"`), n + " is a node");
  assert.ok(!i3d.includes('name="palletTrigger"'));
  assert.ok(i3d.includes('name="feedTrough1Collision"') && i3d.includes('name="waterTrough1Collision"'), "the troughs are drawn, with collision");
  assert.equal((xml.match(/<hotspots>/g) || []).length, 1);
  assert.equal((xml.match(/<triggerMarkers>/g) || []).length, 1);
  for (const n of nodesOf(xml)) assert.ok(i3d.includes(`name="${n}"`), `${n} is named in the XML and is a node`);
});

test("a mod with sheep is a sheep barn placeable with wool pallets", async () => {
  const {files} = await makeModPackage({name: "Fårgården", posts, objects: yard("sheep"), animal: "sheep", sheep: 25});
  const xml = text(files.get("house.xml")), i3d = text(files.get("house.i3d"));
  assert.match(xml, /<placeable type="sheepHusbandry">/);
  assert.match(xml, /<animals type="SHEEP" baseMaxNumAnimals="25" maxNumAnimals="25">/);
  assert.match(xml, /sheepNetFence\/sheepNetFence\.xml/);
  assert.match(xml, /defaultFillType="DRYGRASS_WINDROW"/);
  assert.match(xml, /<palletSpawner fillTypes="WOOL GOATMILK"/);
  for (const n of ["palletTrigger", "palletAreaStart01", "palletAreaEnd02", "warningStripes01"]) assert.ok(i3d.includes(`name="${n}"`), n);
  for (const n of nodesOf(xml)) assert.ok(i3d.includes(`name="${n}"`), `${n} is named in the XML and is a node`);
});

test("without an animal named the yard is the hens', as before", async () => {
  const {files} = await makeModPackage({name: "Hönsgården", posts, objects: yard("hens"), hens: 40});
  assert.match(text(files.get("house.xml")), /<placeable type="chickenHusbandryPasture">/);
});

test("the cows can walk inside a building of the mod with an open doorway facing the fence", async () => {
  const {files, warnings} = await makeModPackage({name: "Kogården", posts, objects: yard("cows"), animal: "cows", inside: "a"});
  const i3d = text(files.get("house.i3d")), xml = text(files.get("house.xml"));
  assert.ok(i3d.includes('name="navigationMeshShape"') || warnings.some(w => /cows/.test(w)), "the walking floor, or the reason why not (about the cows)");
  assert.ok(!warnings.some(w => /hens/.test(w)), "nothing about hens in a cow yard: " + warnings.join(" | "));
  assert.match(xml, /<navigation rootNode="navigationRootNode"/);
});

test("the objects of a cow yard turn: the bale drop, with its icon, turns with its box", async () => {
  const base = yard("cows");
  const world = async objs => text((await makeModPackage({name: "G", posts, objects: objs, animal: "cows"})).files.get("house.i3d"));
  const plain = await world(base), turned = await world(base.map(o => (o.type === "bales" ? {...o, turn: 90} : o)));
  assert.notEqual(plain, turned);
  assert.ok(/name="[A-Za-z0-9]*Turn/.test(turned) || turned.includes('rotation="0 90 0"'), "something is turned");
});
