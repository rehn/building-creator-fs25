// Changing a building's FS25 type (docs/PLAN_TYPER.md step 2): the form is kept (walls, roof, openings, parts, decorations), what belongs to the old type is dropped and listed,
// what the new type needs is added. Only between the buildings built the same way (house, shed, dealership, map shop, station), not to or from the animal buildings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, changeKind, CONVERTIBLE_KINDS, buildGeometry } from "../src/editor/model.mjs";

const farm = () => sanitize({kind: "house", width: 11, depth: 7, floors: 1, roofType: "flat", wallColor: "#aa2222",
  decor: [{asset: "s1gn01", x: 6, z: 2, rot: 90, y: 1}], wings: [{id: 1, wall: "right", pos: 0.5, width: 3, depth: 3, floors: 1}]});

test("the convertible types are the simple walk-in buildings", () => {
  assert.deepEqual(CONVERTIBLE_KINDS.slice().sort(), ["dealership", "fuelstation", "house", "shed"]);
});

test("a house becomes a shed: the form stays, the furniture is listed as lost", () => {
  const p = farm(), r = changeKind(p, "shed");
  assert.equal(r.ok, true);
  const q = r.settings;
  assert.equal(q.kind, "shed");
  for (const k of ["width", "depth", "roofType", "wallColor", "floors"]) assert.equal(q[k], p[k], k);
  assert.deepEqual(q.decor, p.decor, "the decorations stay");
  assert.equal(q.wings.length, 1, "so does the part");
  assert.equal(q.windows.length, p.windows.length, "and the windows and doors");
  assert.ok(!r.lost.objects.includes("Sleep point"));
  assert.deepEqual(q.objects, [], "a building has no game objects");
  assert.ok(r.lost.items.length > 0 && r.lost.items.some(n => /bed/i.test(n)), `lost: ${r.lost.items}`);
  assert.ok(!q.items.some(it => it.type === "bed"));
});


test("a shed with open sides becomes a house: the open sides are the old type's own setting, dropped and listed", () => {
  const shed = sanitize({kind: "shed", openFront: true, width: 9, depth: 6});
  const r = changeKind(shed, "house");
  assert.ok(r.ok);
  assert.equal(r.settings.kind, "house");
  assert.equal("openFront" in r.settings, false);
  assert.ok(r.lost.settings.some(l => /open/i.test(l)), `lost settings: ${r.lost.settings}`);
  const plain = changeKind(sanitize({kind: "shed"}), "house");
  assert.deepEqual(plain.lost.settings, [], "nothing is listed for what was never changed");
});

test("not to or from the animal buildings, not to the same type, not to one that does not exist", () => {
  for (const id of ["chicken", "cow", "sheep"]) {
    assert.equal(changeKind(farm(), id).ok, false, `to ${id}`);
    assert.equal(changeKind(sanitize({kind: id}), "house").ok, false, `from ${id}`);
  }
  assert.equal(changeKind(farm(), "house").ok, false);
  assert.equal(changeKind(farm(), "teapot").ok, false);
  for (const r of [changeKind(farm(), "cow"), changeKind(farm(), "house")]) assert.ok(typeof r.error === "string" && r.error.length > 5);
});

test("a type that hides dormers drops them, and says so", () => {
  const p = sanitize({kind: "house", dormers: [{type: "gable", side: 1, pos: 0.5, w: 2, wallH: 1.5, setback: 0.5, n: 1, ww: 0.8, wh: 1}]});
  const n = p.dormers.length, r = changeKind(p, "shed");
  assert.ok(n > 0, "the house had one");
  assert.deepEqual(r.settings.dormers, []);
  assert.equal(r.lost.dormers, n);
});

test("the input is not changed, and converting there and back keeps the form", () => {
  const p = farm(), before = JSON.stringify(p);
  const there = changeKind(p, "shed"), back = changeKind(there.settings, "house");
  assert.equal(JSON.stringify(p), before);
  assert.equal(back.settings.kind, "house");
  for (const k of ["width", "depth", "roofType", "wallColor"]) assert.equal(back.settings[k], p[k], k);
  assert.deepEqual(back.settings.decor, p.decor);
});
