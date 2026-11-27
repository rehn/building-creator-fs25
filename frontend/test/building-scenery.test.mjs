// GET /api/v1/buildings/{id}/scenery: the scenery files and the shape of a building as it is saved now.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSceneryQuery, sceneryOfBuilding } from "../src/lib/building-scenery.mjs";

const q = s => parseSceneryQuery(new URLSearchParams(s));

test("parseSceneryQuery: texture size 512 by default, and x, y, angle all or none", () => {
  assert.deepEqual(q(""), { textureSize: 512, origin: null });
  assert.equal(q("textureSize=256").textureSize, 256);
  assert.deepEqual(q("x=10.5&y=-3&angle=30").origin, { x: 10.5, y: -3, angle: 30 });
  assert.equal(q("textureSize=300").error.code, "invalid_request");
  assert.equal(q("x=1&y=2").error.code, "invalid_request");
  assert.equal(q("x=a&y=2&angle=0").error.code, "invalid_request");
});

test("sceneryOfBuilding: files and blobs, the parts in the building's own coordinates, and the map's when the middle is given", async () => {
  const building = { id: "b1", name: "Storgatan 4", version: 6, edited: true, sourceId: "way/1", settings: { kind: "house", width: 12, depth: 8, wings: [] } };
  const seen = [];
  const make = async (settings, name, opts) => { seen.push(opts); return { files: new Map([["house.i3d", new Uint8Array([1])], ["house.i3d.shapes", new Uint8Array([1])]]) }; };
  const a = await sceneryOfBuilding(building, { make, textureSize: 256, origin: { x: 100, y: 200, angle: 0 } });
  assert.equal(a.buildingId, "b1");
  assert.equal(a.version, 6);
  assert.equal(a.edited, true);
  assert.equal(a.sourceId, "way/1");
  assert.equal(seen[0].textureSize, 256);
  assert.equal(a.files.length, 2);
  assert.equal(Object.keys(a.blobs).length, 1, "the same bytes once");
  assert.equal(a.local.parts[0].part, "main");
  assert.deepEqual(a.placement, { x: 100, y: 200, angle: 0, width: 12, depth: 8 });
  assert.equal(a.footprint.parts[0].x, 100);
  const b = await sceneryOfBuilding(building, { make, textureSize: 512, origin: null });
  assert.equal(b.placement, undefined);
  assert.equal(b.footprint, undefined);
});
