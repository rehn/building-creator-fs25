// The ground under the building is a setting: the level area and (barns) the meadow's clear task paint it; "auto" keeps the old behaviour.
import test from "node:test";
import assert from "node:assert/strict";
import { sanitize, placeableXml } from "../src/editor/model.mjs";

const level = xml => /<levelArea [^>]*?(?: groundType="(\w+)")?\/>/.exec(xml)[1];
const clear = xml => /<clearTask>[\s\S]*?<terrainGroundType name="(\w+)"/.exec(xml)?.[1];

test("auto: a house keeps its grass, a barn gets dirt", () => {
  assert.equal(level(placeableXml(sanitize({kind: "house"}), "x")), undefined);
  assert.equal(level(placeableXml(sanitize({kind: "cow"}), "x")), "dirt");
  assert.equal(clear(placeableXml(sanitize({kind: "cow"}), "x")), "dirt");
});

for (const kind of ["house", "cow", "sheep"]) test(`${kind}: a chosen ground is painted under the building`, () => {
  for (const g of ["animalMud", "gravel", "concrete"]) {
    const p = sanitize({kind, groundUnder: g}), xml = placeableXml(p, "x");
    assert.equal(p.groundUnder, g);
    assert.equal(level(xml), g);
    if (kind !== "house") assert.equal(clear(xml), g);
  }
});

test("an unknown ground is dropped", () => {
  assert.equal(sanitize({kind: "house", groundUnder: "lava"}).groundUnder, "auto");
});
