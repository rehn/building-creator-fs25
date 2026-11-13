// The ground of the pasture is chosen in a list: the meadow's create task paints it (grass by default); the ground under the barn stays dirt.
import test from "node:test";
import assert from "node:assert/strict";
import { sanitize, placeableXml } from "../src/editor/model.mjs";

const createGround = xml => /<createTask[\s\S]*?<terrainGroundType name="(\w+)"/.exec(xml)[1];

for (const kind of ["cow", "sheep"]) {
  test(`${kind} barn: pasture ground defaults to grass and can be changed`, () => {
    assert.equal(createGround(placeableXml(sanitize({kind}), "x")), "grass");
    for (const g of ["dirt", "animalMud", "gravel", "sand", "forestGround"]) {
      const p = sanitize({kind, pastureGround: g});
      assert.equal(p.pastureGround, g);
      assert.equal(createGround(placeableXml(p, "x")), g);
    }
  });
  test(`${kind} barn: an unknown pasture ground is dropped`, () => {
    assert.equal(sanitize({kind, pastureGround: "lava"}).pastureGround, "grass");
  });
}
