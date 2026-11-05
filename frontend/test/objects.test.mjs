// Game objects (objects.mjs): the sleep point, feed pad, bale drop, trailer spot, egg pallets, info area
// and the pasture's fence as objects the player adds, drags and sizes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, buildI3d, placeableXml, PRESETS, KIND, gamePlaces, sleepPoint } from "../src/editor/model.mjs";
import { objectOf, pastureOf, snapPasture, snapBox, objectProblems, cleanObjects } from "../src/editor/objects.mjs";

const barn = (s = {}) => sanitize({...PRESETS.find(x => x.id === "ladugard").settings, ...s});
const types = p => p.objects.map(o => o.type).sort();

test("objects: a new building gets its kind's, and old saves keep their pasture and sleep point", () => {
  assert.deepEqual(types(barn()), ["bales", "food", "info", "loading", "pasture"]);
  assert.deepEqual(types(sanitize({kind: "chicken"})), ["food", "info", "loading", "pallets", "pasture"]);
  assert.deepEqual(types(sanitize({})), ["sleep"]);
  assert.deepEqual(types(sanitize({sleepPoint: false})), [], "a house that had no sleep point");
  const old = barn({pastureWall: "front", fenceDepth: 22});
  assert.deepEqual(({...objectOf(old, "pasture"), id: 0}), {id: 0, type: "pasture", wall: "front", a: 0, b: 0, depth: 22});
  assert.equal(old.pastureWall, "front", "the rest of the barn reads the pasture's wall from it");
  // ids, one of each, unknown types and other kinds' types dropped
  const p = barn({objects: [{type: "food", x: 0, z: 9}, {type: "food", x: 1}, {type: "sleep"}, {type: "rocket"}]});
  assert.equal(p.objects.filter(o => o.type === "food").length, 1);
  assert.ok(!objectOf(p, "sleep"));
  assert.deepEqual(p.objects.map(o => o.id), p.objects.map((_, i) => i + 1));
});

test("objects: the ones a building must have come back; the bale drop and the sleep point can go", () => {
  const p = barn(), without = sanitize({...p, objects: p.objects.filter(o => o.type !== "food" && o.type !== "bales")});
  assert.ok(objectOf(without, "food"), "a cow barn needs its feed pad");
  assert.ok(!objectOf(without, "bales"), "the bale drop is optional");
  const xml = buildI3d(without, {}), placeable = placeableXml(without, "x");
  assert.doesNotMatch(xml, /baleTrigger/);
  assert.doesNotMatch(placeable, /baleTrigger|markerBales/);
  assert.match(placeableXml(p, "x"), /baleTrigger/);
  const house = sanitize({objects: []});
  assert.ok(!objectOf(house, "sleep"));
  assert.match(placeableXml(house, "x"), /type="simplePlaceable"/, "without a sleep point it isn't a farmhouse");
  assert.match(placeableXml(sanitize({}), "x"), /type="farmhouse"/);
});

test("objects: the export puts a box where the player moved it", () => {
  const p = barn(), food = objectOf(p, "food");
  const moved = sanitize({...p, objects: p.objects.map(o => o.type === "food" ? {...o, x: -20, z: 3, w: 5, d: 2} : o)});
  const xml = buildI3d(moved, {});
  const node = xml.match(/<Shape [^>]*name="exactFillRootNodeFood"[^>]*>/)[0];
  assert.match(node, /translation="-20 0\.15 3"/, node);
  assert.notEqual(food.x, -20);
  // the house's sleep point too, with its spawn point out from the building on that side
  const h = sanitize({}), s = objectOf(h, "sleep");
  const q = sanitize({...h, objects: [{...s, x: -8, z: 0, w: 2, d: 2}]}), sp = sleepPoint(buildGeometry(q), q);
  assert.deepEqual(sp.trigger.center.map(v => +v.toFixed(2)), [-8, +(s.h / 2).toFixed(2), 0]);
  assert.ok(sp.spawn.pos[0] < -8, "spawns further out on the left");
  assert.equal(gamePlaces(q).find(x => x.type === "sleep").box.center[0], -8);
});

test("objects: the pasture is at least as wide as the game needs, its ends snap to the corners", () => {
  const small = sanitize({...PRESETS.find(x => x.id === "fahus").settings});
  const pa = pastureOf(small), o = objectOf(small, "pasture");
  assert.equal(+(pa.s1 - pa.s0).toFixed(3), 16, "a cow pasture is at least 16 m wide");
  assert.ok(o.a < 0 && o.b < 0, "past both corners of an 8 m wall");
  assert.equal(pa.fence.length, 6, "and back along the wall's line to the barn");
  const p = barn(), po = objectOf(p, "pasture");
  assert.equal(snapPasture({...po, a: 0.4, b: -0.3}, KIND.cow, p).a, 0, "near a corner: at the corner");
  assert.equal(snapPasture({...po, a: 0.4, b: -0.3}, KIND.cow, p).b, 0);
  const narrow = snapPasture({...po, a: 2.13, b: 0}, KIND.cow, p);
  assert.ok(Math.abs(narrow.a - 2.25) < 1e-9 || narrow.a < 2.13, "else on the grid (or wider to keep 16 m)");
});

test("objects: the cows' doorway and troughs are on the stretch the pasture encloses", () => {
  const p = barn({width: 30, depth: 10}), po = objectOf(p, "pasture");
  const q = sanitize({...p, objects: p.objects.map(o => o.type === "pasture" ? {...o, a: 10, b: 0} : o)});
  const pa = pastureOf(q);
  assert.equal(pa.ea, 10);
  assert.equal(pa.mid, 20);
  const door = buildGeometry(q).opsByWall[po.wall].ops.find(o => o.kind === "hatch");
  assert.ok(Math.abs((door.s0 + door.s1) / 2 - 20) < 1e-6, `the doorway at the stretch's middle: ${door.s0}..${door.s1}`);
  assert.ok(q.pastureMid === 20);
});

test("objects: boxes snap to the grid and out of the building; problems are named", () => {
  const p = barn({width: 16, depth: 9}), food = objectOf(p, "food");
  const s = snapBox({...food, x: 0.1, z: 0.2}, p);
  assert.ok(Math.abs(s.x) >= 8 + food.w / 2 - 1e-9 || Math.abs(s.z) >= 4.5 + food.d / 2 - 1e-9, `pushed out: ${s.x}, ${s.z}`);
  assert.equal(snapBox({...food, x: 12.13, z: 7.9}, p).x, 12.25);
  const inBuilding = {...p, objects: p.objects.map(o => o.type === "food" ? {...o, x: 0, z: 0} : o)};
  assert.match(objectProblems(inBuilding).get(food.id), /in the building/);
  const pa = pastureOf(p), mid = [(pa.rect.x0 + pa.rect.x1) / 2, (pa.rect.z0 + pa.rect.z1) / 2];
  const inPasture = {...p, objects: p.objects.map(o => o.type === "food" ? {...o, x: mid[0], z: mid[1]} : o)};
  assert.match(objectProblems(inPasture).get(food.id), /pasture/);
  assert.equal(objectProblems(p).size, 0, "a new barn has none");
  const doorIn = {...p, windows: [...p.windows, {id: 99, wall: pa.wall, floor: 0, pos: 0.2, w: 1, h: 2, type: "door"}]};
  assert.match(objectProblems(doorIn).get(objectOf(p, "pasture").id), /door/);
  // cleanObjects on its own
  assert.deepEqual(cleanObjects(null, KIND.house, sanitize({})), []);
});

test("objects: egg pallet rows stay inside their box, the teleport point goes with the trailer spot", async () => {
  const { henYard } = await import("../src/editor/model.mjs"), { cowYard } = await import("../src/editor/kinds/cow.mjs");
  const h = sanitize({kind: "chicken"}), pal = objectOf(h, "pallets");
  for (const [w, d] of [[2, 1.5], [3.4, 3.2], [9, 4], [2.5, 7]]) {
    const q = sanitize({...h, objects: h.objects.map(o => o.type === "pallets" ? {...o, w, d} : o)}), y = henYard(buildGeometry(q), q);
    const t = y.pallet.trigger, inside = ([x, , z]) => Math.abs(x - t.center[0]) <= t.size[0] / 2 + 1e-9 && Math.abs(z - t.center[2]) <= t.size[2] / 2 + 1e-9;
    assert.ok(y.pallet.lines.flat().every(inside), `${w} x ${d}`);
  }
  assert.ok(pal);
  const c = barn(), lo = objectOf(c, "loading");
  const moved = sanitize({...c, objects: c.objects.map(o => o.type === "loading" ? {...o, x: -15, z: 0} : o)});
  const tp = cowYard(buildGeometry(moved), moved).markers.teleport;
  assert.deepEqual(tp.map(v => +v.toFixed(3)), [-18, 0, 0], "3 m further out from the barn");
  assert.ok(lo);
});
