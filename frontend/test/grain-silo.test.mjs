// Grain silo: an intake hall with round silos, a selling station that buys the grain the player chooses (PLAN_SILO.md).
// The export follows the base game's grainRiverSilo01Triggers (mapUS/sellingPoints): a sellingStation placeable that cannot be bought or sold.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, buildI3d, placeableXml, PRESETS } from "../src/editor/model.mjs";
import { kindOf, CATEGORIES } from "../src/editor/kinds/index.mjs";
import { cleanObjects, objectOf } from "../src/editor/objects.mjs";

const preset = id => PRESETS.find(x => x.id === id);
const silo = (extra = {}) => sanitize({...preset("kornsilo").settings, ...extra});

test("the grain silo is a kind with presets, in its own category", () => {
  const x = preset("kornsilo");
  assert.ok(x, "preset kornsilo");
  assert.equal(x.kind, "grainsilo");
  assert.ok(CATEGORIES.some(c => c.id === x.category), "its category is listed");
  const p = silo(), kind = kindOf(p);
  assert.equal(kind.id, "grainsilo");
  assert.ok(buildGeometry(p).G.walls.i.length > 0, "the hall has walls");
  assert.match(buildI3d(p), /<\/i3D>/);
});

test("it has the intake as a game object, always there", () => {
  const p = silo(), kind = kindOf(p);
  assert.ok(kind.objects.types.includes("intake"));
  assert.ok(kind.objects.required.includes("intake"));
  assert.ok(objectOf(p, "intake"), "a new silo has an intake");
  const objs = cleanObjects([], kind, p);
  assert.equal(objs.filter(o => o.type === "intake").length, 1, "added when missing");
});

test("the silos are round tanks beside the hall: more silos, more geometry, and the ground under them is cleared", () => {
  const none = buildGeometry(silo({siloCount: 0})), two = buildGeometry(silo({siloCount: 2})), four = buildGeometry(silo({siloCount: 4}));
  const n = g => g.G.fittings.i.length;
  assert.ok(n(two) > n(none), "two silos draw something");
  assert.ok(n(four) > n(two), "four draw more");
  const z = g => { const f = g.G.fittings.p; let lo = Infinity; for (let i = 2; i < f.length; i += 3) lo = Math.min(lo, f[i]); return lo; };
  assert.ok(z(two) < -silo().depth / 2, "at the back they stand outside the hall's back wall");
  const x = buildI3d(silo({siloCount: 2}));
  const clear = x.match(/name="clearAreaStart01" translation="([^"]+)"/);
  assert.ok(clear, "a clear area");
  assert.ok(+clear[1].split(" ")[2] < -silo().depth / 2 - 3, "the clear area reaches past the silos");
});

test("it is a sellingStation that cannot be bought or sold, like the game's own", () => {
  const xml = placeableXml(silo(), "Kornsilo");
  assert.match(xml, /<placeable type="sellingStation">/);
  assert.match(xml, /<canBeSold>false<\/canBeSold>/);
  assert.match(xml, /<showInStore>false<\/showInStore>/);
  assert.match(xml, /<sellingStation[^>]*litersForFullPriceDrop="200000"[^>]*fullPriceRecoverHours="48"/);
  assert.match(xml, /<unloadTrigger exactFillRootNode="unloadNodeTrailer"[^>]*aiNode="unloadNodeAI"/);
  assert.match(xml, /<hotspot type="UNLOADING" linkNode="unloadMarkerTrailer" teleportNode="unloadMarkerTrailer"\/>/);
  assert.match(xml, /<triggerMarker node="unloadMarkerTrailer" filename="\$data\/shared\/assets\/marker\/markerIconUnload\.i3d"\/>/);
  assert.match(xml, /sellingStationGenericMedium\.i3d" node="0" linkNode="unloadNodeTrailer"/);
});

test("the nodes are the game's: unloadStationTrailer with the unload node, marker, AI node, in that order, and every one is mapped", () => {
  const p = silo(), i3d = buildI3d(p), xml = placeableXml(p, "Kornsilo");
  const order = ["unloadStationTrailer", "unloadNodeTrailer", "unloadMarkerTrailer", "unloadNodeAI"].map(n => i3d.search(new RegExp(`<(?:Shape|TransformGroup) name="${n}"`)));
  assert.ok(order.every(k => k > 0), "all there");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "in the game's order");
  for (const n of ["unloadNodeTrailer", "unloadMarkerTrailer", "unloadNodeAI"]) assert.match(xml, new RegExp(`<i3dMapping id="${n}"`), `${n} mapped`);
  // the unload node is a kinematic collision shape the vehicles' unloading finds: group 0x40000000, mask 0x20000000, not drawn
  assert.match(i3d, /name="unloadNodeTrailer"[^>]*kinematic="true"[^>]*collisionFilterGroup="0x40000000"[^>]*collisionFilterMask="0x20000000"[^>]*nonRenderable="true"/);
});

test("what it buys is a choice: the checked grains go in the station, wheat when none is", () => {
  const fills = xml => (xml.match(/<unloadTrigger[^>]*fillTypes="([^"]+)"/) || [])[1].split(" ").sort();
  assert.deepEqual(fills(placeableXml(silo({buyWheat: true, buyBarley: true, buyOat: false, buyCanola: false, buyMaize: false, buySoybean: false, buySunflower: false, buySorghum: false}), "S")), ["BARLEY", "WHEAT"]);
  assert.deepEqual(fills(placeableXml(silo({buyWheat: false, buyBarley: false, buyOat: false, buyCanola: true, buyMaize: false, buySoybean: false, buySunflower: false, buySorghum: false}), "S")), ["CANOLA"]);
  const none = {buyWheat: false, buyBarley: false, buyOat: false, buyCanola: false, buyMaize: false, buySoybean: false, buySunflower: false, buySorghum: false};
  assert.deepEqual(fills(placeableXml(silo(none), "S")), ["WHEAT"], "nothing chosen means wheat");
});

test("the price is a share of the game's: priceScale follows the setting", () => {
  assert.match(placeableXml(silo({grainPrice: 100}), "S"), /<unloadTrigger[^>]*priceScale="1"/);
  assert.match(placeableXml(silo({grainPrice: 120}), "S"), /<unloadTrigger[^>]*priceScale="1\.2"/);
});

test("the game's hopper can be left out", () => {
  assert.doesNotMatch(placeableXml(silo({siloHopper: false}), "S"), /sellingStationGenericMedium/);
});

test("the settings survive sanitize, and every silo side builds", () => {
  for (const side of ["back", "front", "left", "right"]) {
    const p = silo({siloSide: side, siloCount: 3});
    assert.equal(p.siloSide, side);
    assert.equal(p.siloCount, 3);
    assert.ok(buildGeometry(p).G.fittings.i.length > 0, side);
  }
  assert.equal(silo({siloCount: 9}).siloCount, 4, "at most four");
});

test("a silo looks like a real one: ribbed tank, a conical roof, a ladder up the outer side and a filling pipe", async () => {
  const { siloSpots } = await import("../src/editor/kinds/grainsilo.mjs");
  const p = silo({siloCount: 1, siloSide: "back"}), [s] = siloSpots(p), top = 0.35 + s.h;
  const none = buildGeometry(silo({siloCount: 0})).G.fittings, one = buildGeometry(p).G.fittings;
  assert.ok((one.i.length - none.i.length) / 3 > 800, "ribs, posts, ladder and pipe are many faces");
  let peak = -Infinity, ladder = false, platform = false;
  for (let k = 0; k < one.p.length; k += 3) {
    const [x, y, z] = [one.p[k], one.p[k + 1], one.p[k + 2]];
    peak = Math.max(peak, y);
    if (z < s.z - s.r - 0.3 && y > top) ladder = true;   // the ladder and the pipe reach past the tank's top, on the side away from the hall
    if (z < s.z - s.r - 0.9 && y > 3 && y < top - 1) platform = true;   // a landing sticks out a metre
  }
  assert.ok(peak > top + s.r * 0.25, "the roof is a cone that rises");
  assert.ok(ladder, "a ladder up the outer side");
  assert.ok(platform, "with a landing on the way");
});
