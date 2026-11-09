import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, buildI3d, setAssets, catalogFor, usedAssets } from "../src/editor/model.mjs";
import { roomOf } from "../src/editor/layout.mjs";

const feeder = {id: "f1xyz9", name: "Cow feeder", files: [{name: "cow-feeder.i3d", size: 10}, {name: "cow-feeder.i3d.shapes", size: 5}, {name: "cow-feeder.obj", size: 8}],
  meta: {i3d: "cow-feeder.i3d", obj: "cow-feeder.obj", box: {min: [1, 0, -1], max: [3, 0.5, 0]}, mount: "floor", kinds: ["cow"]}};
const barn = items => ({kind: "cow", width: 10, depth: 8, items});

afterEach(() => setAssets([]));

test("items: a building keeps its imported items while the list of items hasn't loaded", () => {
  const p = sanitize(barn([{type: "asset:f1xyz9", x: 1, z: 0.5, rot: 90}]));
  assert.deepEqual(p.items.map(it => [it.type, it.x, it.z, it.rot]), [["asset:f1xyz9", 1, 0.5, 90]]);
  assert.ok(catalogFor(p)["asset:f1xyz9"].missing);
  assert.deepEqual(buildGeometry(p).refs, [], "nothing to draw or export for it yet");
});

test("items: the user's items are pieces of the kinds they're for", () => {
  setAssets([feeder]);
  assert.ok(catalogFor(sanitize(barn([])))["asset:f1xyz9"], "offered in a cow barn");
  assert.equal(catalogFor(sanitize({kind: "chicken"}))["asset:f1xyz9"], undefined, "not in a hen house");
  assert.ok(catalogFor(sanitize(barn([])))["stalls"], "next to the kind's own pieces");
});

test("items: a placed item is a reference to its i3d, placed on the floor", () => {
  setAssets([feeder]);
  const p = sanitize(barn([{type: "asset:f1xyz9", x: 1, z: 0.5, rot: 0}]));
  const geo = buildGeometry(p), F = roomOf(p, []).F;
  assert.equal(geo.refs.length, 1);
  const r = geo.refs[0];
  assert.equal(r.asset.id, "f1xyz9");
  assert.deepEqual(r.translation.map(v => +v.toFixed(4)), [-1, +F.toFixed(4), 1]);
  assert.equal(r.rotY, 0);

  const xml = buildI3d(p);
  const file = xml.match(/<File fileId="(\d+)" filename="items\/cowFeeder_f1xyz9\/cow-feeder\.i3d"\/>/);
  assert.ok(file, "the item's i3d is a file of the scene");
  assert.match(xml, new RegExp(`<ReferenceNode name="cowFeeder01" translation="-1 [0-9.]+ 1" rotation="0 0 0" referenceId="${file[1]}" nodeId="\\d+"/>`));
  assert.deepEqual(usedAssets(p).map(a => a.id), ["f1xyz9"], "what an export has to pack");
});

test("items: one outside the room (the building got smaller) is left out", () => {
  setAssets([feeder]);
  const p = sanitize(barn([{type: "asset:f1xyz9", x: 30, z: 0, rot: 0}]));
  assert.deepEqual(buildGeometry(p).refs, []);
  assert.doesNotMatch(buildI3d(p), /ReferenceNode/);
  assert.deepEqual(usedAssets(p), []);
});
