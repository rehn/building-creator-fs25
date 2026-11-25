// Feed and water in the hen yard of a mod (Lars): a feed trough and a water trough are game objects of the hen yard, like the cow barn's troughs (kinds/cow.mjs troughFrom, drawTrough): drawn in the mod,
// the feed trough with the game's food plane (rises and falls with the feed) and the places where the hens stand to eat, as the game's own hen barns have (foodPlane, foodPlaces); the water trough
// for looks (the water of hens is automatic). Both are obstacles in the hens' area.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeModPackage } from "../src/editor/modExport.mjs";
import { addGroup, removeGroup, settingsFor } from "../src/lib/modObjects.mjs";
import { insidePoly } from "../src/editor/objects.mjs";

const text = bytes => (typeof bytes === "string" ? bytes : Buffer.from(bytes).toString("latin1"));
const house = {id: "a", kind: "building", name: "Huset", x: 20, z: 10, y: 0, rot: 0, data: {kind: "house", width: 10, depth: 8}};
const yard = () => addGroup([], "hens", settingsFor({width: 10, depth: 8}), [20, 10], {wall: "back"});

test("a hen yard starts with a feed trough and a water trough, inside its fence, clear of the building and of each other", () => {
  const objects = yard(), fence = objects.find(o => o.type === "pasture").points.map(([x, z]) => [x, 0, z]);
  const feed = objects.find(o => o.type === "feedTrough"), water = objects.find(o => o.type === "waterTrough");
  assert.ok(feed && water, "both: " + objects.map(o => o.type));
  for (const t of [feed, water]) {
    assert.ok(insidePoly(fence, t.x, t.z), `${t.type} inside the fence`);
    assert.ok(t.w > 0.5 && t.d > 0.3 && t.h > 0.2);
    assert.ok(!(t.x + t.w / 2 > 15 && t.x - t.w / 2 < 25 && t.z + t.d / 2 > 6 && t.z - t.d / 2 < 14), `${t.type} is not in the house`);
  }
  const overlap = Math.abs(feed.x - water.x) < (feed.w + water.w) / 2 && Math.abs(feed.z - water.z) < (feed.d + water.d) / 2;
  assert.ok(!overlap, "not on top of each other");
  assert.equal(removeGroup(objects, feed.id).length, 0, "they go with the yard");
});

test("the export has the trough: its planks as shapes you can see, the food plane and the places in the husbandry, the water trough as a looks only", async () => {
  const {files} = await makeModPackage({name: "Hönsgården", posts: [house], objects: yard()});
  const xml = text(files.get("house.xml")), i3d = text(files.get("house.i3d"));
  assert.match(xml, /<foodPlane node="foodPlane" minY="[0-9.]+" maxY="[0-9.]+" changeVisibility="true" defaultFillType="WHEAT"\/>/);
  assert.match(xml, /<foodPlaces>\s*<foodPlace node="foodPlace1"\/>/);
  assert.ok(xml.indexOf("<foodPlane") < xml.indexOf("<unloadTrigger") || xml.indexOf("<foodPlaces>") < xml.indexOf("<unloadTrigger"), "inside <food>");
  for (const n of ["foodPlane", "foodPlace1", "feedTrough1Base", "waterTrough1Base"]) assert.ok(i3d.includes(`name="${n}"`), n);
  assert.ok(!/<Shape name="feedTrough1Base"[^>]*nonRenderable/.test(i3d), "the trough is drawn");
  assert.ok(!/waterPlane|waterPlaces/.test(xml), "the water of hens is automatic: no water places");
  for (const m of xml.matchAll(/(?:node|rootNode)="([A-Za-z0-9_]+)"/g)) assert.ok(i3d.includes(`name="${m[1]}"`), `${m[1]} is a node of the i3d`);
});

test("the hens stand on the sides of the feed trough that are inside the fence, and the troughs are obstacles in their area", async () => {
  const {files} = await makeModPackage({name: "Hönsgården", posts: [house], objects: yard()});
  const i3d = text(files.get("house.i3d"));
  const places = [...i3d.matchAll(/name="foodPlace(\d+)" translation="([^"]+)"/g)];
  assert.ok(places.length >= 1);
  // blockers: the house and each trough
  assert.ok((i3d.match(/name="navmeshBlocker\d*"/g) || []).length >= 3, "the house and two troughs");
});

test("a mod saved before the troughs (no trough objects) has no food plane, as it was", async () => {
  const before = yard().filter(o => o.type !== "feedTrough" && o.type !== "waterTrough");
  const {files} = await makeModPackage({name: "Hönsgården", posts: [house], objects: before});
  assert.ok(!/foodPlane|foodPlaces/.test(text(files.get("house.xml"))));
  assert.match(text(files.get("house.xml")), /<unloadTrigger exactFillRootNode="exactFillRootNodeFood"\/>/);
});

// ---- a trough turned round the Y axis (Lars: the water trough turned 90 degrees to go along another wall) ----
import { troughFrom } from "../src/editor/kinds/cow.mjs";
import { setObjectOf } from "../src/lib/modObjects.mjs";

test("a trough turned a quarter has its places on the other pair of sides, looking at the trough, and its box says how it is turned", () => {
  const t = troughFrom({x: 10, z: 5, w: 3, d: 0.7, h: 0.75, turn: 90}, null, []);
  assert.equal(t.box.turn, 90);
  assert.deepEqual(t.box.size, [3, 0.75, 0.7], "the size stays the trough's own");
  assert.deepEqual(t.box.center, [10, 0.375, 5]);
  assert.ok(t.places.length >= 2);
  for (const {pos, rot} of t.places) {
    assert.ok(Math.abs(Math.abs(pos[0] - 10) - 1.05) < 0.01, `on a long side, which now faces +x and -x: ${pos}`);
    assert.ok(Math.abs(pos[2] - 5) <= 1.5, "along it");
    const f = [Math.sin(rot * Math.PI / 180), Math.cos(rot * Math.PI / 180)];
    assert.ok(f[0] * (10 - pos[0]) > 1, `looking at the trough: ${rot}`);
  }
  const plain = troughFrom({x: 10, z: 5, w: 3, d: 0.7, h: 0.75}, null, []);
  assert.ok(plain.places.every(p => Math.abs(Math.abs(p.pos[2] - 5) - 1.05) < 0.01), "not turned: on the sides along z as before");
  assert.equal(plain.box.turn, undefined);
});

test("a turned trough is turned in the export: its planks and collision in a group turned 90 degrees, the places and the food plane where the turn puts them, the blocker turned", async () => {
  const objects = yard().map(o => (o.type === "waterTrough" || o.type === "feedTrough" ? {...o, turn: 90} : o));
  const {files} = await makeModPackage({name: "Hönsgården", posts: [house], objects});
  const i3d = text(files.get("house.i3d")), xml = text(files.get("house.xml"));
  assert.match(i3d, /<TransformGroup name="waterTrough1"[^>]*rotation="0 90 0"/);
  assert.match(i3d, /<TransformGroup name="feedTrough1"[^>]*rotation="0 90 0"/);
  assert.ok(!/<Shape name="foodPlane"[^>]*rotation=/.test(i3d), "the food plane is turned in its corners (planeQuad), not by a rotation the game may not follow");
  assert.ok((i3d.match(/<Shape name="navmeshBlocker\d*"[^>]*rotation="0 90 0"/g) || []).length >= 2, "the blockers of the troughs are turned");
  // the places of the feed trough stand on its sides after the turn: along x of the trough's middle
  const feed = objects.find(o => o.type === "feedTrough"), places = [...i3d.matchAll(/name="foodPlace\d+" translation="([^"]+)" rotation="([^"]+)"/g)].map(m => ({pos: m[1].split(" ").map(Number), rot: +m[2].split(" ")[1]}));
  assert.ok(places.length >= 2);
  const xs = places.map(p => p.pos[0]);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 1.5, "on both of the sides, which now face x: " + xs);
  assert.ok(places.every(p => Math.abs(Math.abs(Math.sin(p.rot * Math.PI / 180)) - 1) < 0.01), "looking along x");
  assert.ok(feed);
  assert.ok(!/waterPlace/.test(xml));
});

test("the turn of an object is kept between 0 and 360, to a tenth, and left out when it is 0", () => {
  const objects = yard(), water = objects.find(o => o.type === "waterTrough");
  assert.equal(setObjectOf(objects, water.id, {turn: 450}).find(o => o.id === water.id).turn, 90);
  assert.equal(setObjectOf(objects, water.id, {turn: -90}).find(o => o.id === water.id).turn, 270);
  assert.equal(setObjectOf(objects, water.id, {turn: 12.34}).find(o => o.id === water.id).turn, 12.3);
  const back = setObjectOf(setObjectOf(objects, water.id, {turn: 90}), water.id, {turn: 0}).find(o => o.id === water.id);
  assert.ok(!("turn" in back), "0 is left out");
});

test("a mod that is saved with a turned trough keeps the turn through the editor's cleaning", async () => {
  const {sanitize} = await import("../src/editor/model.mjs");
  const objects = yard().map(o => (o.type === "waterTrough" ? {...o, turn: 90} : o));
  const p = sanitize({kind: "modframe", objects});
  assert.equal(p.objects.find(o => o.type === "waterTrough").turn, 90);
  assert.ok(!("turn" in p.objects.find(o => o.type === "feedTrough")));
});
