import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, buildI3d, setAssets, catalogFor, usedAssets, troughLooks } from "../src/editor/model.mjs";
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

// A feed trough from the user's items: the trough object's "look".
const trough = {id: "t1abcd", name: "Feed trough", files: [{name: "trough.i3d", size: 10}, {name: "trough.obj", size: 8}],
  meta: {i3d: "trough.i3d", obj: "trough.obj", box: {min: [0, 0, -0.4], max: [2.4, 0.6, 0.4]}, use: "feedTrough", kinds: ["cow"]}};
const withLook = (id, kind = "cow") => {
  const p = sanitize({kind, width: 10, depth: 8});
  return sanitize({...p, objects: p.objects.map(o => o.type === "feedTrough" ? {...o, asset: id, w: 2.4, d: 0.8, h: 0.6} : o)});
};
const troughOf = p => p.objects.find(o => o.type === "feedTrough");

test("trough items: not pieces to put inside, but the look of a trough object", () => {
  setAssets([trough]);
  assert.equal(catalogFor(sanitize(barn([])))["asset:t1abcd"], undefined, "not offered as inside furniture");
});

test("trough items: the object keeps its look, and the item is placed where the trough stands", () => {
  setAssets([trough]);
  const p = withLook("t1abcd"), o = troughOf(p);
  assert.equal(o.asset, "t1abcd");
  const geo = buildGeometry(p);
  assert.equal(geo.refs.length, 1);
  const r = geo.refs[0];
  assert.equal(r.asset.id, "t1abcd");
  assert.deepEqual(r.translation.map(v => +v.toFixed(4)), [+(o.x - 1.2).toFixed(4), 0, +o.z.toFixed(4)], "the model's box centred on the trough, on the ground");
  assert.deepEqual(usedAssets(p).map(a => a.id), ["t1abcd"], "an export packs it");
  assert.match(buildI3d(p), /ReferenceNode name="feedTrough01"/);
});

test("trough items: with no look, or its item not loaded yet, the plank trough is built and the look is kept", () => {
  setAssets([trough]);
  assert.deepEqual(buildGeometry(sanitize({kind: "cow", width: 10, depth: 8})).refs, []);
  setAssets([]);
  const p = withLook("t1abcd");
  assert.equal(troughOf(p).asset, "t1abcd");
  assert.deepEqual(buildGeometry(p).refs, []);
});

test("trough items: only a trough object takes a look", () => {
  const p = sanitize({kind: "cow", width: 10, depth: 8}), pad = p.objects.find(o => o.type === "food");
  const q = sanitize({...p, objects: p.objects.map(o => o === pad ? {...o, asset: "t1abcd"} : o)});
  assert.equal(q.objects.find(o => o.type === "food").asset, undefined);
});

test("hen house: feed and drinking troughs are optional objects in the pasture, and can look like the user's items", () => {
  const hen = {...trough, meta: {...trough.meta, kinds: ["chicken"]}};
  setAssets([hen]);
  const p = sanitize({kind: "chicken"});
  assert.ok(!p.objects.some(o => o.type === "feedTrough"), "none to start with");
  const place = type => sanitize({...p, objects: [...p.objects, {type, x: 0, z: 0, w: 2.4, d: 0.8, h: 0.6, ...(type === "feedTrough" ? {asset: "t1abcd"} : {})}]});
  const q = place("feedTrough");
  assert.equal(q.objects.find(o => o.type === "feedTrough").asset, "t1abcd");
  assert.equal(buildGeometry(q).refs.length, 1, "the item is placed");
  // with no item, a plain plank trough is built (collision) instead
  setAssets([]);
  const plain = buildGeometry(place("waterTrough"));
  assert.deepEqual(plain.refs, []);
  assert.ok(plain.collision && JSON.stringify(plain.collision) !== JSON.stringify(buildGeometry(p).collision), "the trough has collision");
  assert.equal(troughLooks(sanitize({kind: "chicken"}), "feedTrough").length, 0);
});

test("trough items: a trough can be turned any angle, the model about its middle", () => {
  setAssets([trough]);
  const base = withLook("t1abcd"), o = troughOf(base);
  const turned = sanitize({...base, objects: base.objects.map(x => x === o ? {...o, rot: 90, w: 0.8, d: 2.4} : x)});
  assert.equal(troughOf(turned).rot, 90);
  const r = buildGeometry(turned).refs[0];
  assert.equal(r.rotY, 90);
  // the model's box middle (1.2, 0) turned 90 degrees lands at (0, -1.2) from its origin
  assert.deepEqual(r.translation.map(v => +v.toFixed(4)), [+o.x.toFixed(4), 0, +(o.z + 1.2).toFixed(4)]);
  const odd = sanitize({...base, objects: base.objects.map(x => x === o ? {...o, rot: 405.04} : x)});
  assert.equal(troughOf(odd).rot, 45, "any angle, kept between 0 and 360");
  const junk = sanitize({...base, objects: base.objects.map(x => x === o ? {...o, rot: "left"} : x)});
  assert.equal(troughOf(junk).rot, undefined);
  const plain = sanitize({...base, objects: base.objects.map(x => x === o ? {...o, asset: undefined, rot: 90} : x)});
  assert.equal(troughOf(plain).rot, undefined, "a plank trough is turned by its width and depth");
});
