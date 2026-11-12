// Several feed troughs and several water troughs: the animals eat and drink at every one of them; the game
// has only one fill plane for each, so that is the first trough's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, placeableXml, buildingTree, PRESETS } from "../src/editor/model.mjs";
import { objectOf, objectsOf, objectProblems, nextTroughSpot, MAX_TROUGHS } from "../src/editor/objects.mjs";
import { cowYard } from "../src/editor/kinds/cow.mjs";

const barn = () => sanitize({...PRESETS.find(x => x.id === "ladugard").settings});
const more = (p, type, n = 1) => {
  let q = p;
  for (let i = 0; i < n; i++) q = sanitize({...q, objects: [...q.objects, {...nextTroughSpot(q, type), type}]});
  return q;
};

test("many troughs: any number of feed and water troughs, up to a limit; other objects stay one each", () => {
  const p = more(more(barn(), "feedTrough", 2), "waterTrough");
  assert.equal(objectsOf(p, "feedTrough").length, 3);
  assert.equal(objectsOf(p, "waterTrough").length, 2);
  assert.equal(new Set(p.objects.map(o => o.id)).size, p.objects.length, "each has its own id");
  const dup = sanitize({...p, objects: [...p.objects, {...objectOf(p, "food")}, {...objectOf(p, "info")}]});
  assert.equal(objectsOf(dup, "food").length, 1);
  assert.equal(objectsOf(dup, "info").length, 1);
  const lots = more(barn(), "feedTrough", MAX_TROUGHS + 3);
  assert.equal(objectsOf(lots, "feedTrough").length, MAX_TROUGHS);
});

test("many troughs: a new one goes where it's free: inside the fence, not on the building or another trough", () => {
  const p = more(barn(), "feedTrough", 3), list = objectsOf(p, "feedTrough"), pr = objectProblems(p);
  for (const a of list) assert.equal(pr.has(a.id), false, "no problem: " + pr.get(a.id));
  const spots = new Set(list.map(o => `${o.x},${o.z}`));
  assert.equal(spots.size, 4, "all in different places");
});

test("many troughs: the animals stand at every trough, and every trough is blocked out of the walking area", () => {
  const p0 = barn(), one = cowYard(buildGeometry(p0), p0), p = more(p0, "feedTrough");
  const y = cowYard(buildGeometry(p), p);
  assert.equal(y.feedTroughs.length, 2);
  assert.equal(y.feedTrough, y.feedTroughs[0], "the first is the one with the fill plane");
  assert.equal(y.foodPlaces.length, y.feedTroughs.reduce((n, t) => n + t.places.length, 0));
  assert.ok(y.foodPlaces.length > one.foodPlaces.length);
  assert.equal(y.waterTroughs.length, 1);
  assert.ok(y.blockers.length >= one.blockers.length + 1);
});

test("many troughs: the placeable has one fill plane and a place node for each standing place", () => {
  const p = more(more(barn(), "feedTrough"), "waterTrough"), y = cowYard(buildGeometry(p), p);
  const xml = placeableXml(p);
  assert.equal((xml.match(/<foodPlane /g) || []).length, 1);
  assert.equal((xml.match(/<waterPlane /g) || []).length, 1);
  assert.equal((xml.match(/<foodPlace /g) || []).length, y.foodPlaces.length);
  assert.equal((xml.match(/<waterPlace /g) || []).length, y.waterPlaces.length);
});

test("many troughs: the tree numbers troughs of the same kind", () => {
  const p = more(barn(), "feedTrough"), names = buildingTree(p).game.children.flatMap(c => c.children || [c]).map(c => c.name);
  assert.ok(names.includes("Feed trough 1") && names.includes("Feed trough 2"), names.join());
  assert.ok(names.includes("Water trough"), "a lone one keeps its plain name");
});

test("many troughs: the feed troughs are a folder in the tree with the troughs under it, and the water troughs another", () => {
  const p = more(more(barn(), "feedTrough"), "waterTrough"), kids = buildingTree(p).game.children;
  const feed = kids.find(c => c.type === "group" && c.otype === "feedTrough"), water = kids.find(c => c.type === "group" && c.otype === "waterTrough");
  assert.deepEqual(feed.children.map(c => c.id), objectsOf(p, "feedTrough").map(o => o.id));
  assert.deepEqual(water.children.map(c => c.id), objectsOf(p, "waterTrough").map(o => o.id));
  assert.ok(feed.children.every(c => c.type === "object"));
  assert.ok(!kids.some(c => c.type === "object" && (c.otype === "feedTrough" || c.otype === "waterTrough")), "none left loose");
  assert.ok(kids.some(c => c.type === "object" && c.otype === "pasture"), "other objects stay as they were");
});

test("many troughs: the spot for a new trough says what it is, so the editor's new object survives sanitize", () => {
  for (const type of ["feedTrough", "waterTrough"]) {
    const p = barn(), spot = nextTroughSpot(p, type);
    assert.equal(spot.type, type);
    const q = sanitize({...p, objects: [...p.objects, {...spot, id: Math.max(...p.objects.map(o => o.id)) + 1}]});
    assert.equal(objectsOf(q, type).length, objectsOf(p, type).length + 1);
  }
});
