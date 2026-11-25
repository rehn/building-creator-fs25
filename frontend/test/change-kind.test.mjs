// Changing a building's inside look (the kind: docs/PLAN_MALLAR.md step 4): the form is kept (walls, roof, openings, parts, decorations), what belongs to the old kind is dropped and listed.
// A building has no game logic, so every kind can become every other.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, changeKind, CONVERTIBLE_KINDS, buildGeometry } from "../src/editor/model.mjs";

const farm = () => sanitize({kind: "house", width: 11, depth: 7, floors: 1, roofType: "flat", wallColor: "#aa2222",
  decor: [{asset: "s1gn01", x: 6, z: 2, rot: 90, y: 1}], wings: [{id: 1, wall: "right", pos: 0.5, width: 3, depth: 3, floors: 1}]});

test("every kind can be changed to every other", () => {
  assert.deepEqual(CONVERTIBLE_KINDS.slice().sort(), ["chicken", "cow", "dealership", "fuelstation", "house", "shed", "sheep"]);
});

test("a house becomes a shed: the form and the furniture stay", () => {
  const p = farm(), r = changeKind(p, "shed");
  assert.equal(r.ok, true);
  const q = r.settings;
  assert.equal(q.kind, "shed");
  for (const k of ["width", "depth", "roofType", "wallColor", "floors"]) assert.equal(q[k], p[k], k);
  assert.deepEqual(q.decor, p.decor, "the decorations stay");
  assert.equal(q.wings.length, 1, "so does the part");
  assert.equal(q.windows.length, p.windows.length, "and the windows and doors");
  assert.deepEqual(q.objects, [], "a building has no game objects");
  assert.deepEqual(r.lost.items, [], "every building has every piece: the furniture stays");
  assert.ok(q.items.some(it => it.type === "bed"));
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

test("an animal building and a house change into each other, the form stays", () => {
  for (const id of ["chicken", "cow", "sheep"]) {
    const there = changeKind(farm(), id);
    assert.equal(there.ok, true, "to " + id);
    assert.equal(there.settings.kind, id);
    const back = changeKind(there.settings, "house");
    assert.equal(back.ok, true, "from " + id);
    assert.equal(back.settings.wallColor, farm().wallColor);
    assert.ok(buildGeometry(there.settings), "it builds as " + id);
  }
});

test("not to the same look, not to one that does not exist", () => {
  assert.equal(changeKind(farm(), "house").ok, false);
  assert.equal(changeKind(farm(), "teapot").ok, false);
  for (const r of [changeKind(farm(), "house"), changeKind(farm(), "teapot")]) assert.ok(typeof r.error === "string" && r.error.length > 5);
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
