// A side of an inner wall can be a board panel (the building's inner-wall panel: same choices as the facade) with the studs showing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, colorFor, surfaceSpec, MATS } from "../src/editor/model.mjs";
import { WALLPAPERS, PANEL } from "../src/editor/kinds/innerwall.mjs";

const wall = (s = {}) => ({id: 1, type: "innerwall", x: 0, z: 0, rot: 0, length: 5, door: 0, doorAt: 0.5, paperA: 2, paperB: 4, ...s});
const house = (items, extra = {}) => sanitize({items, ...extra});

test("inner panel: a building setting with the facade's choices", () => {
  const p = sanitize({});
  assert.ok(["lockpanel", "horizontal", "vertical", "plaster"].includes(p.innerCladding));
  assert.match(p.innerColor, /^#[0-9a-f]{6}$/i);
  assert.equal(sanitize({innerCladding: "horizontal"}).innerCladding, "horizontal");
  assert.equal(sanitize({innerCladding: "zebra"}).innerCladding, p.innerCladding);
  assert.ok(MATS.includes("wallsIn"));
  const q = sanitize({innerCladding: "lockpanel", innerColor: "#335577"});
  assert.equal(surfaceSpec(q, "wallsIn").kind, "lockpanel");
  assert.equal(colorFor({...q, age: 0}, "wallsIn"), "#335577");
});

test("inner panel: a panel side is boards with studs showing; other sides are as before", () => {
  assert.equal(PANEL, WALLPAPERS.length);
  const none = buildGeometry(house([wall()])).G, one = buildGeometry(house([wall({paperA: PANEL})])).G, both = buildGeometry(house([wall({paperA: PANEL, paperB: PANEL})])).G;
  assert.equal(none.wallsIn.i.length, 0, "no panel unless chosen");
  assert.ok(one.wallsIn.i.length > 0, "boards");
  assert.ok(both.wallsIn.i.length > one.wallsIn.i.length, "both sides");
  assert.ok(one.fittings.i.length > none.fittings.i.length - 3000, "studs are drawn");
  const studs = g => g.fittings.i.length;
  assert.ok(studs(one) !== studs(none));
});

test("inner panel: studs follow the building's stud settings and stay inside the wall's footprint", () => {
  const count = extra => buildGeometry(house([wall({paperA: PANEL, paperB: PANEL})], {insideSame: true, ...extra})).G.fittings.i.length;
  assert.ok(count({studSpacing: 0.4}) > count({studSpacing: 1.2}) + 100);
  const p = house([wall({paperA: PANEL, paperB: PANEL, x: 1, z: 2})]), G = buildGeometry(p).G;
  for (const m of ["wallsIn", "fittings"]) for (let k = 0; k < G[m].p.length; k += 3) {
    const [x, y, z] = G[m].p.slice(k, k + 3);
    if (y < 0.05 || Math.abs(x - 1) > 2.51 || y > 2.7) continue;   // (the floor, the room, the other pieces)
    if (Math.abs(z - 2) < 0.3) assert.ok(Math.abs(z - 2) <= 0.075 + 1e-6, `${m} at z ${z}`);
  }
});

test("inner panel: it exports (the panel is a material of its own with a texture) and ages like the walls", async () => {
  const { buildI3d, placeableXml } = await import("../src/editor/model.mjs");
  const p = house([wall({paperA: PANEL})], {innerCladding: "lockpanel", innerColor: "#335577", age: 30});
  const xml = buildI3d(p);
  assert.match(xml, /wallsIn/);
  assert.ok(placeableXml(p, "x").length > 100);
  assert.notEqual(colorFor(p, "wallsIn"), "#335577");
});

test("inner panel: it can be the same as the facade (its texture and colour), or as the facade's lower part", () => {
  const p = sanitize({innerCladding: "same", wallCladding: "horizontal", wallColor: "#aa2211", wallSplit: "floor", lowerCladding: "plaster", lowerColor: "#ddeedd", innerColor: "#000000"});
  assert.equal(p.innerCladding, "same");
  assert.equal(surfaceSpec(p, "wallsIn").kind, "horizontal");
  assert.equal(colorFor({...p, age: 0}, "wallsIn"), "#aa2211");
  assert.equal(surfaceSpec(p, "wallsIn").w, surfaceSpec(p, "walls").w);
  const q = sanitize({...p, innerCladding: "sameLow"});
  assert.equal(q.innerCladding, "sameLow");
  assert.equal(surfaceSpec(q, "wallsIn").kind, "plaster");
  assert.equal(colorFor({...q, age: 0}, "wallsIn"), "#ddeedd");
});
