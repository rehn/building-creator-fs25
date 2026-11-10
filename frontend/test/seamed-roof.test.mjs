// "Swedish sheet metal" (falsad plåt): a roof covering of its own, broad pans with raised double seams and cross seams.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, SCHEMA, surfaceSpec } from "../src/editor/model.mjs";
import { AGED_KINDS } from "../src/editor/age.mjs";

test("falsad plåt is a roof covering a building and a part can have", () => {
  const field = SCHEMA.flatMap(g => g.fields).find(f => f.k === "roofMaterial");
  assert.ok(field.options.some(([v]) => v === "seamed"), "in the list");
  assert.equal(sanitize({roofMaterial: "seamed"}).roofMaterial, "seamed");
  assert.equal(sanitize({wings: [{wall: "back", pos: 0.5, width: 4, depth: 4, roofMaterial: "seamed"}]}).wings[0].roofMaterial, "seamed", "per part");
});
test("its texture is aged and is two metres wide, four pans", () => {
  assert.ok(AGED_KINDS.includes("seamed"));
  const s = surfaceSpec(sanitize({roofMaterial: "seamed"}), "roof");
  assert.deepEqual([s.kind, s.w, s.h], ["seamed", 2, 2]);
});

test("a flat roof can be sheet metal too (felt unless a metal covering is chosen)", () => {
  const flat = (m) => surfaceSpec(sanitize({roofType: "flat", roofMaterial: m}), "roof").kind;
  assert.equal(flat("tiles"), "felt");
  assert.equal(flat("seamed"), "seamed");
  assert.equal(flat("metal"), "metal");
});

test("corrugated sheet metal: ribs every 10 cm, works on gable and flat roofs", () => {
  const p = sanitize({roofMaterial: "corrugated"});
  assert.equal(p.roofMaterial, "corrugated");
  assert.ok(AGED_KINDS.includes("corrugated"));
  assert.deepEqual(((s) => [s.kind, s.w, s.h])(surfaceSpec(p, "roof")), ["corrugated", 1.6, 2]);
  assert.equal(surfaceSpec(sanitize({roofType: "flat", roofMaterial: "corrugated"}), "roof").kind, "corrugated");
});

test("corrugated sheet metal as a wall cladding: coarser than on the roof, studs behind it inside", () => {
  const p = sanitize({kind: "shed", wallCladding: "corrugated", roofMaterial: "corrugated", insideSame: true, items: []});
  assert.equal(p.wallCladding, "corrugated");
  const wall = surfaceSpec(p, "walls"), roof = surfaceSpec(p, "roof");
  assert.equal(wall.kind, "corrugated");
  assert.ok(wall.w > roof.w * 1.5, `wider ribs on the wall (${wall.w} against ${roof.w})`);
  assert.equal(sanitize({kind: "shed", wallCladding: "corrugated", wallSplit: "floor", lowerCladding: "corrugated"}).lowerCladding, "corrugated");
});
