// Fuel station: a canopy with pumps where the player fills up. The export follows the game's own mapUS/sellingPoints/gasStation:
// <placeable type="buyingStation"> with a loadTrigger (DIESEL) on a trigger shape (group 0x20000000, mask 0x40000000), hotspot FUEL.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, buildI3d, placeableXml, PRESETS } from "../src/editor/model.mjs";
import { kindOf, CATEGORIES } from "../src/editor/kinds/index.mjs";
import { cleanObjects, objectOf } from "../src/editor/objects.mjs";

const preset = id => PRESETS.find(x => x.id === id);
const fuel = (extra = {}) => sanitize({...preset("bensinmack").settings, ...extra});

test("the fuel station is a kind with a preset, in the stations category", () => {
  const x = preset("bensinmack");
  assert.ok(x, "preset bensinmack");
  assert.equal(x.kind, "fuelstation");
  assert.ok(CATEGORIES.some(c => c.id === x.category), "its category is listed");
  const p = fuel();
  assert.equal(kindOf(p).id, "fuelstation");
  assert.match(buildI3d(p), /<\/i3D>/);
});

test("it has the fuel area as a game object, always there", () => {
  const p = fuel(), kind = kindOf(p);
  assert.ok(kind.objects.required.includes("pump"));
  assert.ok(objectOf(p, "pump"), "a new station has a fuel area");
  assert.equal(cleanObjects([], kind, p).filter(o => o.type === "pump").length, 1, "added when missing");
});

test("it is a buyingStation that cannot be bought or sold, filling diesel like the game's own", () => {
  const xml = placeableXml(fuel(), "Bensinmack");
  assert.match(xml, /<placeable type="buyingStation">/);
  assert.match(xml, /<canBeSold>false<\/canBeSold>/);
  assert.match(xml, /<showInStore>false<\/showInStore>/);
  assert.match(xml, /<buyingStation node="gasStation" supportsExtension="false"/);
  assert.match(xml, /<loadTrigger triggerNode="gasStationTrigger" fillTypes="DIESEL" fillLitersPerSecond="20" autoStart="true" infiniteCapacity="true" startFillText="\$l10n_action_refuel" stopFillText="\$l10n_action_stopRefuel"\/>/);
  assert.match(xml, /<fillType name="diesel" priceScale="1"\/>/);
  assert.match(xml, /<hotspot type="FUEL" linkNode="mapPosition" teleportNode="mapPosition"\/>/);
  for (const n of ["gasStation", "gasStationTrigger", "mapPosition"]) assert.match(xml, new RegExp(`<i3dMapping id="${n}"`), `${n} mapped`);
});

test("the trigger is the game's: a static trigger shape, group 0x20000000, mask 0x40000000, not drawn, inside the gasStation node", () => {
  const i3d = buildI3d(fuel());
  assert.match(i3d, /name="gasStationTrigger"[^>]*static="true"[^>]*trigger="true"[^>]*collisionFilterGroup="0x20000000"[^>]*collisionFilterMask="0x40000000"[^>]*nonRenderable="true"/);
  const at = n => i3d.search(new RegExp(`<(?:Shape|TransformGroup) name="${n}"`));
  assert.ok(at("gasStation") > 0 && at("gasStation") < at("gasStationTrigger") && at("gasStationTrigger") < at("mapPosition"), "gasStation > trigger, mapPosition");
});

test("price and speed are settings", () => {
  assert.match(placeableXml(fuel({fuelPrice: 120}), "S"), /<fillType name="diesel" priceScale="1\.2"\/>/);
  assert.match(placeableXml(fuel({fuelRate: 40}), "S"), /fillLitersPerSecond="40"/);
});

test("the pumps stand in a row under the canopy: more pumps, more geometry, all inside the roof", () => {
  const n = g => g.G.fittings.i.length;
  const one = buildGeometry(fuel({pumpCount: 1})), four = buildGeometry(fuel({pumpCount: 4}));
  assert.ok(n(four) > n(one), "four pumps draw more than one");
  const p = fuel({pumpCount: 6}), f = buildGeometry(p).G.fittings.p;
  for (let k = 0; k < f.length; k += 3) {
    if (f[k + 1] > 2.5 || f[k + 1] < 0.05) continue;   // (the posts and beam are at the edges; the pumps are low, at the middle)
    assert.ok(Math.abs(f[k]) <= p.width / 2 + 0.01 && Math.abs(f[k + 2]) <= p.depth / 2 + 0.01, "nothing sticks out of the canopy's footprint");
  }
});

test("the settings survive sanitize, and the canopy is open on every side", () => {
  const p = fuel({pumpCount: 9});
  assert.equal(p.pumpCount, 6, "at most six pumps");
  assert.ok(p.openFront && p.openBack && p.openLeft && p.openRight);
  assert.ok(buildGeometry(p).G.fittings.i.length > 0);
});
