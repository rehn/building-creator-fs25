import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, buildI3d, placeableXml, sleepPoint, henYard, gamePlaces, KINDS } from "../src/editor/model.mjs";
import { cowYard } from "../src/editor/kinds/cow.mjs";
import { PLACE_DEFAULT } from "../src/editor/places.mjs";

const hen = (o = {}) => sanitize({kind: "chicken", width: 10, depth: 6, hens: 60, pastureWall: "back", doorWall: "front", ...o});
const cow = (o = {}) => sanitize({kind: "cow", width: 12, depth: 8, cows: 12, pastureWall: "back", doorWall: "front", ...o});
const near = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${msg}: ${a} vs ${b}`);
/** p with place id adjusted. */
const moved = (p, id, adj) => sanitize({...p, places: {...p.places, [id]: {...p.places[id], ...adj}}});
/** Along and out of a point from wall key's frame. */
const frame = (geo, key) => {
  const {w} = geo.opsByWall[key];
  return q => [(q[0] - w.o[0]) * w.u[0] + (q[2] - w.o[2]) * w.u[2], (q[0] - w.o[0]) * w.n[0] + (q[2] - w.o[2]) * w.n[2]];
};
/** A box's size along wall key and out from it. */
const sizeBy = (geo, key, b) => Math.abs(geo.opsByWall[key].w.u[0]) > 0.5 ? [b.size[0], b.size[2]] : [b.size[2], b.size[0]];

test("places: every kind lists its game places; each building keeps an adjustment per place", () => {
  const ids = Object.fromEntries(KINDS.map(k => [k.id, (k.places || []).map(x => x.id)]));
  assert.deepEqual(ids, {house: ["sleep"], chicken: ["food", "loading", "pallets", "info"], cow: ["food", "bales", "loading", "info"]});
  for (const k of KINDS) for (const pl of k.places) assert.ok(pl.name && pl.hint, `${k.id} ${pl.id}`);
  const p = hen();
  assert.deepEqual(Object.keys(p.places), ids.chicken);
  assert.deepEqual(p.places.food, PLACE_DEFAULT);
  // cleaned: unknown places and values dropped, numbers in range
  const q = hen({places: {food: {wall: "roof", along: 99, out: "x", width: -3, depth: 0.1, height: 50, iconAlong: 3}, evil: {}}});
  assert.deepEqual(Object.keys(q.places), ids.chicken);
  assert.deepEqual(q.places.food, {...PLACE_DEFAULT, along: 20, width: 0, depth: 0.5, height: 8, iconAlong: 3});
});

test("places: the hen house's feed pad moves along and out from its wall, takes a size, and its icon follows", () => {
  const p = hen(), geo = buildGeometry(p), y0 = henYard(geo, p);
  const key = y0.places.food.wall, f = frame(geo, key);
  const q = moved(p, "food", {along: 1.5, out: 2, width: 5, depth: 2}), y1 = henYard(buildGeometry(q), q);
  const [a0, d0] = f(y0.food.center), [a1, d1] = f(y1.food.center);
  near(a1 - a0, 1.5, "along"); near(d1 - d0, 2, "out");
  assert.deepEqual(sizeBy(geo, key, y1.food).map(v => +v.toFixed(6)), [5, 2]);
  near(f(y1.food.marker)[0], a1, "icon in the middle, along"); near(f(y1.food.marker)[1], d1, "icon in the middle, out");
  // the icon can move on its own
  const r = moved(q, "food", {iconAlong: -1, iconOut: 0.5}), y2 = henYard(buildGeometry(r), r);
  near(f(y2.food.marker)[0], a1 - 1, "icon along"); near(f(y2.food.marker)[1], d1 + 0.5, "icon out");
  // and the export has it there
  assert.notEqual(buildI3d(q), buildI3d(p));
});

test("places: a place can go on another wall", () => {
  const p = hen(), q = moved(p, "food", {wall: "left"}), geo = buildGeometry(q), y = henYard(geo, q), f = frame(geo, "left");
  assert.equal(y.places.food.wall, "left");
  const [a, d] = f(y.food.center);
  assert.ok(d > 1 && d < 3, `out from the left wall: ${d}`);
  assert.ok(a > 0 && a < q.depth, "along it");
});

test("places: egg pallet spawn lines stay inside their trigger when it's made smaller or bigger", () => {
  for (const [width, depth] of [[2, 2], [8, 5], [0, 0]]) {
    const p = moved(hen(), "pallets", {width, depth}), geo = buildGeometry(p), y = henYard(geo, p), key = y.places.pallets.wall, f = frame(geo, key);
    const [ta, td] = f(y.pallet.trigger.center), [sa, sd] = sizeBy(geo, key, y.pallet.trigger);
    for (const line of y.pallet.lines) for (const q of line) {
      const [a, d] = f(q);
      assert.ok(Math.abs(a - ta) <= sa / 2 + 1e-6 && Math.abs(d - td) <= sd / 2 + 1e-6, `${width}x${depth}: ${a.toFixed(2)},${d.toFixed(2)} outside the trigger`);
    }
  }
});

test("places: the cow barn's bale drop and feed pad are separate places", () => {
  const p = cow(), y0 = cowYard(buildGeometry(p), p);
  const q = moved(p, "bales", {along: -3, height: 4}), y1 = cowYard(buildGeometry(q), q);
  assert.deepEqual(y1.food, y0.food, "the feed pad stays");
  assert.notDeepEqual(y1.bales.center, y0.bales.center);
  near(y1.bales.size[1], 4, "bale trigger height");
  assert.notDeepEqual(y1.markers.bales, y0.markers.bales, "its icon follows");
  assert.deepEqual(y1.markers.food, y0.markers.food);
});

test("places: the animal trailer spot takes its teleport point along; the info area can grow", () => {
  const p = cow(), y0 = cowYard(buildGeometry(p), p);
  const q = moved(p, "loading", {out: 3}), y1 = cowYard(buildGeometry(q), q);
  const d = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
  near(d(y1.loading.center, y0.loading.center), 3, "trailer spot moved");
  near(d(y1.markers.teleport, y0.markers.teleport), 3, "teleport with it");
  const r = moved(p, "info", {width: 30, depth: 20, along: 2}), y2 = cowYard(buildGeometry(r), r);
  assert.deepEqual([y2.info.size[0], y2.info.size[2]], [30, 20]);
  near(y2.info.center[0], y0.info.center[0] + 2, "info moved sideways");
});

test("places: the farmhouse's sleep trigger and bed icon", () => {
  const p = sanitize({}), geo = buildGeometry(p), s0 = sleepPoint(geo, p), f = frame(geo, "front");
  const q = moved(p, "sleep", {out: 1, along: -0.5, width: 3, depth: 2.5, height: 3, iconOut: 0.4});
  const s1 = sleepPoint(buildGeometry(q), q);
  near(f(s1.trigger.center)[0] - f(s0.trigger.center)[0], -0.5, "along"); near(f(s1.trigger.center)[1] - f(s0.trigger.center)[1], 1, "out");
  assert.deepEqual(sizeBy(geo, "front", s1.trigger).map(v => +v.toFixed(6)), [3, 2.5]);
  near(s1.trigger.size[1], 3, "height"); near(s1.trigger.center[1], 1.5, "from the ground");
  near(f(s1.marker)[1] - f(s1.trigger.center)[1], 0.4, "icon out from the middle");
  // another wall: at the first door on it, or its middle
  const r = moved(p, "sleep", {wall: "back"}), s2 = sleepPoint(buildGeometry(r), r), b = frame(geo, "back");
  near(b(s2.trigger.center)[0], p.width / 2, "middle of the back wall");
  assert.ok(b(s2.trigger.center)[1] > 0, "outside it");
  assert.match(buildI3d(q), /name="sleepingTrigger"/);
});

test("places: gamePlaces lists what the preview shows, the same boxes and icons as the export", () => {
  const p = cow(), geo = buildGeometry(p), y = cowYard(geo, p), list = gamePlaces(p, geo);
  assert.deepEqual(list.map(x => x.id), ["food", "bales", "loading", "info"]);
  const by = Object.fromEntries(list.map(x => [x.id, x]));
  assert.deepEqual(by.food.box, {center: y.food.center, size: y.food.size});
  assert.deepEqual(by.bales.icon, y.markers.bales);
  assert.equal(by.info.icon, null);
  for (const x of list) assert.ok(x.name && x.glyph !== undefined, x.id);
  const h = sanitize({}), hl = gamePlaces(h, buildGeometry(h));
  assert.deepEqual(hl.map(x => x.id), ["sleep"]);
  assert.deepEqual(gamePlaces({...h, sleepPoint: false}, buildGeometry(h)), [], "no sleep point, no place");
  // a placeable XML still names every node it uses
  assert.match(placeableXml(moved(p, "bales", {along: 2}), "x"), /baleTrigger/);
});
