// The studs on the inside of a wall follow how the wall looks outside: a wall that is plastered (its own panel, set for that wall) shows no studs, a wall of boards does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry } from "../src/editor/model.mjs";

const tris = p => buildGeometry(p).G.fittings.i.length / 3;
const barn = (extra = {}) => sanitize({kind: "cow", width: 24, depth: 12, insideSame: true, wallCladding: "vertical", wallSplit: "one", items: [], ...extra});

test("a wall of its own plaster has no studs inside, though the building's walls are boards", () => {
  const boards = tris(barn()), plasteredFront = tris(barn({wallStyles: {front: {wallCladding: "plaster"}}}));
  assert.ok(boards - plasteredFront > 200, `fewer pieces without the front's studs (${boards} against ${plasteredFront})`);
});

test("plaster on the lower part of one wall: studs only above it", () => {
  const split = tris(barn({wallSplit: "floor", lowerCladding: "plaster"})), lowerOwnTimber = tris(barn({wallSplit: "floor", lowerCladding: "plaster", wallStyles: {front: {lowerCladding: "vertical"}}}));
  assert.ok(lowerOwnTimber > split, "a wall whose lower part is boards has studs there too");
});

test("a wall that says nothing follows the building", () => {
  assert.equal(tris(barn({wallStyles: {front: {}}})), tris(barn()));
});
