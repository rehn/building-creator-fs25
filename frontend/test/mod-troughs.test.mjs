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
