import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assetType, assetIdOf, readI3d, missingFiles, readObj, normalizeMeta, assetSize, assetDef, withAssets,
  placement, assetFolder, flattenI3d, nameFromFile, splitItems, troughAssets, importSettings, withImportSettings, turnedSize,
} from "../src/editor/assets.mjs";

// What Giants Editor writes for a prop: the collision is the root (nonRenderable), the mesh a child,
// the geometry in an external .shapes file, textures from the game and one of its own.
const I3D = `<?xml version="1.0" encoding="iso-8859-1"?>
<i3D name="cow-feeder.i3d" version="1.6">
  <Files>
    <File fileId="2" filename="$data/placeables/rudolfHormann/barnProps/animalFeedersCow01_diffuse.png"/>
    <File fileId="3" filename="textures/feeder_normal.png"/>
  </Files>
  <Shapes externalShapesFile="cow-feeder.i3d.shapes">
  </Shapes>
  <Scene>
    <Shape name="animalFeedersCow" translation="2 0.2 0" shapeId="1" static="true" nonRenderable="true" materialIds="5">
      <Shape name="visual" translation="0 0.018 0" shapeId="2" materialIds="9"/>
    </Shape>
  </Scene>
</i3D>`;

// A 2 x 1 x 0.5 m box from x 1..3, y 0..0.5, z -1..0 (the visual), and a bigger collision box
// that the preview leaves out.
const OBJ = `# Wavefront OBJ file
g default
v 1 0 -1
v 3 0 -1
v 3 0.5 -1
v 1 0.5 0
v 3 0.5 0
v 1 0 0
v -5 -5 -5
v 5 5 5
v 5 -5 -5
vt 0 0
vn 0 1 0
g animalFeedersCow
f 7/1/1 8/1/1 9/1/1
g default
g visual
f 1/1/1 2/1/1 3/1/1
f 4/1/1 5/1/1 6/1/1 1/1/1
`;

test("asset types: an imported item's type is asset:<id>", () => {
  assert.equal(assetType("abc"), "asset:abc");
  assert.equal(assetIdOf("asset:abc"), "abc");
  assert.equal(assetIdOf("nests"), null);
});

test("readI3d: the files it needs, from the game or its own, and the shapes that don't show", () => {
  const r = readI3d(I3D);
  assert.equal(r.shapesFile, "cow-feeder.i3d.shapes");
  assert.deepEqual(r.own, ["cow-feeder.i3d.shapes", "textures/feeder_normal.png"]);
  assert.deepEqual(r.game, ["$data/placeables/rudolfHormann/barnProps/animalFeedersCow01_diffuse.png"]);
  assert.deepEqual(r.hidden, ["animalFeedersCow"]);
  assert.equal(r.root, "animalFeedersCow");
});

test("missingFiles: own files by name, folders ignored, a .dds does for a .png (the game loads the .dds)", () => {
  assert.deepEqual(missingFiles(I3D, ["cow-feeder.i3d"]), ["cow-feeder.i3d.shapes", "feeder_normal.png"]);
  assert.deepEqual(missingFiles(I3D, ["cow-feeder.i3d", "cow-feeder.i3d.shapes", "Feeder_Normal.dds"]), []);
});

test("readObj: triangles of the shown groups, and their bounding box", () => {
  const o = readObj(OBJ, ["animalFeedersCow"]);
  assert.equal(o.positions.length, 3 * 3 * 3, "a triangle and a quad (two triangles)");
  assert.deepEqual(o.box, {min: [1, 0, -1], max: [3, 0.5, 0]});
  assert.equal(readObj(OBJ).positions.length, 4 * 9, "with nothing left out the collision is there too");
  assert.throws(() => readObj("hello"), /no faces/i);
});

test("normalizeMeta: known mounts and turns only, kinds as a list", () => {
  const m = normalizeMeta({mount: "ceiling", turn: 45, kinds: "cow", box: {min: [1, 0, -1], max: [3, 0.5, 0]}});
  assert.equal(m.mount, "floor"); assert.equal(m.turn, 0); assert.deepEqual(m.kinds, []);
  assert.equal(normalizeMeta({turn: 270, mount: "wall", kinds: ["cow", 3]}).turn, 270);
  assert.deepEqual(normalizeMeta({kinds: ["cow", 3]}).kinds, ["cow"]);
  assert.deepEqual(normalizeMeta({}).box, {min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5]}, "a box when there's no model");
});

const feeder = (meta = {}) => ({id: "f1xyz9", name: "Cow feeder", meta: normalizeMeta({i3d: "cow-feeder.i3d", obj: "cow-feeder.obj",
  box: {min: [1, 0, -1], max: [3, 0.5, 0]}, mount: "wall", ...meta}), files: [{name: "cow-feeder.i3d", size: 1}]});

test("assetSize: width, depth, height of the model, turned", () => {
  assert.deepEqual(assetSize(feeder().meta), [2, 1, 0.5]);
  assert.deepEqual(assetSize(feeder({turn: 90}).meta), [1, 2, 0.5]);
});

test("assetDef: an imported item is a piece like the others", () => {
  const d = assetDef(feeder());
  assert.equal(d.name, "Cow feeder"); assert.equal(d.mount, "wall");
  assert.deepEqual(d.size({}), [2, 1]); assert.equal(d.height({}), 0.5);
  assert.deepEqual(d.params, []); assert.equal(typeof d.build, "function");
  assert.equal(d.asset.id, "f1xyz9");
});

test("withAssets: the kind's pieces, the user's items for this kind, and a stand-in for deleted ones", () => {
  const base = {nests: {name: "Nest boxes"}};
  const forCows = feeder({kinds: ["cow"]}), forAll = {...feeder(), id: "all"};
  const c = withAssets(base, [forCows, forAll], "chicken", [{type: "asset:gone"}, {type: "nests"}]);
  assert.deepEqual(Object.keys(c), ["nests", "asset:all", "asset:gone"]);
  assert.ok(c["asset:gone"].missing, "kept, so a building's items aren't lost before the list has loaded");
  assert.ok(withAssets(base, [forCows], "cow", [])["asset:f1xyz9"]);
});

test("placement: the referenced i3d turned and moved so the model's box sits on the item", () => {
  // The model's box centre is (2, 0, -0.5): an unturned item at (5, 7) on a floor at 0.3 puts the
  // i3d's origin at (3, 0.3, 7.5).
  let r = placement(feeder().meta, {x: 5, z: 7, rot: 0}, 0.3);
  assert.deepEqual(r.translation.map(v => +v.toFixed(6)), [3, 0.3, 7.5]); assert.equal(r.rotY, 0);
  // Turned 90°: (x, z) -> (z, -x), so the centre (2, -0.5) lands at (-0.5, -2) from the origin.
  r = placement(feeder().meta, {x: 5, z: 7, rot: 90}, 0);
  assert.deepEqual(r.translation.map(v => +v.toFixed(6)), [5.5, 0, 9]); assert.equal(r.rotY, 90);
  // The item's own turn adds to the model's.
  assert.equal(placement(feeder({turn: 180}).meta, {x: 0, z: 0, rot: 270}, 0).rotY, 90);
});

test("assetFolder and flattenI3d: the item's files side by side in their own folder of the mod", () => {
  assert.equal(assetFolder(feeder()), "items/cowFeeder_f1xyz9");
  assert.equal(assetFolder({id: "abcdefgh", name: "Ö!"}), "items/o_abcdef");
  const flat = flattenI3d(I3D, ["cow-feeder.i3d", "cow-feeder.i3d.shapes", "feeder_normal.dds"]);
  assert.match(flat, /filename="feeder_normal\.dds"/, "own textures point at the file next to it");
  assert.match(flat, /filename="\$data\/placeables\/rudolfHormann/, "the game's textures are left alone");
  assert.match(flat, /externalShapesFile="cow-feeder\.i3d\.shapes"/);
});

test("nameFromFile: a readable name from the file name", () => {
  assert.equal(nameFromFile("cow-feeder.i3d"), "Cow feeder");
  assert.equal(nameFromFile("animalFeedersCow.i3d"), "Animal feeders cow");
});

// An export of several selected nodes: one i3d with a node each, one .obj in world coordinates
// (what Giants Editor writes: "g <node name>" before each node's faces, numbering of corners global).
const MULTI_I3D = `<?xml version="1.0" encoding="iso-8859-1"?>
<i3D name="feeders.i3d" version="1.6">
  <Files>
    <File fileId="1" filename="hen_diffuse.png"/>
    <File fileId="2" filename="hen_normal.png"/>
    <File fileId="3" filename="cow_diffuse.png"/>
  </Files>
  <Materials>
    <Material name="hen_mat" materialId="6"><Texture fileId="1"/><Normalmap fileId="2"/></Material>
    <Material name="cow_mat" materialId="9"><Texture fileId="3"/></Material>
    <Material name="lambert1" materialId="5" diffuseColor="0.5 0.5 0.5 1"/>
  </Materials>
  <Shapes externalShapesFile="feeders.i3d.shapes"/>
  <Scene>
    <Shape name="hen" translation="1 0 -1" shapeId="1" nodeId="22" materialIds="6"/>
    <Shape name="cow" translation="2 0.2 0" shapeId="2" nodeId="28" nonRenderable="true" materialIds="5">
      <Shape name="visual" translation="0 0.01 0" shapeId="3" nodeId="29" materialIds="9"/>
    </Shape>
  </Scene>
</i3D>`;
// hen: a triangle 1..2 x, z -1.5..-0.5; cow: a collision triangle and a visual triangle, x 2..4
const MULTI_OBJ = `# Wavefront OBJ file
g default
v 1 0 -1.5
v 2 0 -1.5
v 1 0.5 -0.5
v 2 0 0
v 4 0 0
v 2 1 0
v 2 0.2 0
v 4 0.2 0
v 2 0.7 0
vt 0 0
vt 1 0
vt 0 1
vn 0 0 1
s off
g hen
f 1/1/1 2/2/1 3/3/1
g default
g cow
f 4/1/1 5/2/1 6/3/1
g visual
f 7/1/1 8/2/1 9/3/1
`;

test("splitItems: each node of an export is an item of its own, at its own origin", () => {
  const parts = splitItems(MULTI_I3D, MULTI_OBJ);
  assert.deepEqual(parts.map(p => p.name), ["Hen", "Cow"]);
  assert.deepEqual(parts.map(p => p.i3dFile), ["hen.i3d", "cow.i3d"]);
  assert.deepEqual(parts.map(p => p.objFile), ["hen.obj", "cow.obj"]);
  const [hen, cow] = parts;
  // only its own node, put at the origin
  assert.match(hen.i3d, /<Shape name="hen" shapeId="1"/);
  assert.doesNotMatch(hen.i3d, /name="cow"/);
  assert.doesNotMatch(hen.i3d, /translation/);
  assert.match(cow.i3d, /<Shape name="visual" translation="0 0\.01 0"/, "a child keeps its place in its parent");
  assert.match(hen.i3d, /externalShapesFile="feeders\.i3d\.shapes"/);
  // only the materials and files it uses
  assert.match(hen.i3d, /hen_mat/); assert.doesNotMatch(hen.i3d, /cow_mat|cow_diffuse|lambert1/);
  assert.match(hen.i3d, /hen_diffuse\.png/); assert.match(hen.i3d, /hen_normal\.png/);
  assert.match(cow.i3d, /cow_mat/); assert.match(cow.i3d, /lambert1/); assert.doesNotMatch(cow.i3d, /hen_/);
  assert.equal(hen.shapesFile, "feeders.i3d.shapes");
  // the .obj: its faces only, moved by the node's translation, so the box is round the origin
  const h = readObj(hen.obj, readI3d(hen.i3d).hidden);
  assert.deepEqual(h.box, {min: [0, 0, -0.5], max: [1, 0.5, 0.5]});
  assert.equal(h.positions.length, 9);
  const c = readObj(cow.obj, readI3d(cow.i3d).hidden);
  assert.deepEqual(c.box, {min: [0, 0, 0], max: [2, 0.5, 0]}, "the collision (nonRenderable) is left out, as for any item");
  assert.deepEqual(readI3d(cow.i3d).hidden, ["cow"]);
  assert.match(cow.obj, /^g cow$/m, "the hidden group stays, under its name");
});

test("splitItems: texture coordinates and normals come along, renumbered", () => {
  const [, cow] = splitItems(MULTI_I3D, MULTI_OBJ);
  assert.match(cow.obj, /^f 1\/1\/1 2\/2\/1 3\/3\/1$/m);
  assert.equal(cow.obj.match(/^v /gm).length, 6, "only the corners its faces use");
  assert.equal(cow.obj.match(/^vn /gm).length, 1);
});

test("splitItems: an export of one node gives one item (nothing to split)", () => {
  const one = MULTI_I3D.replace(/<Shape name="cow"[\s\S]*?<\/Shape>\n/, "");
  assert.equal(splitItems(one, MULTI_OBJ).length, 1);
});

test("splitItems: a node with no faces in the .obj is an error that names it", () => {
  assert.throws(() => splitItems(MULTI_I3D, MULTI_OBJ.replace("g hen", "g other")), /hen/);
});

test("use: an item is furniture unless it says it is a trough; troughs are for the kinds they name", () => {
  assert.equal(normalizeMeta({}).use, "piece");
  assert.equal(normalizeMeta({use: "waterTrough"}).use, "waterTrough");
  assert.equal(normalizeMeta({use: "roof"}).use, "piece");
  const a = (id, use, kinds) => ({id, name: id, meta: normalizeMeta({use, kinds, box: {min: [0, 0, 0], max: [1, 1, 1]}})});
  const list = [a("f", "feedTrough", ["cow"]), a("w", "waterTrough", []), a("p", "piece", []), a("g", "feedTrough", ["sheep"])];
  assert.deepEqual(Object.keys(withAssets({}, list, "cow", [])), ["asset:p"], "furniture only");
  assert.deepEqual(troughAssets(list, "feedTrough", "cow").map(x => x.id), ["f"]);
  assert.deepEqual(troughAssets(list, "waterTrough", "sheep").map(x => x.id), ["w"], "no kinds: every kind with troughs");
});

test("import settings: what you chose last time is the start of the next import (not the model's own box or files)", () => {
  const chosen = normalizeMeta({i3d: "a.i3d", obj: "a.obj", hidden: ["x"], box: {min: [0, 0, 0], max: [2, 1, 1]}, use: "waterTrough", mount: "wall", turn: 90, kinds: ["cow", "sheep"]});
  const saved = importSettings(chosen, true);
  assert.deepEqual(saved, {use: "waterTrough", mount: "wall", turn: 90, kinds: ["cow", "sheep"], shared: true});
  const next = normalizeMeta({i3d: "b.i3d", obj: "b.obj", box: {min: [0, 0, 0], max: [1, 1, 1]}});
  const m = withImportSettings(next, saved);
  assert.deepEqual([m.use, m.mount, m.turn, m.kinds, m.i3d, m.box.max[0]], ["waterTrough", "wall", 90, ["cow", "sheep"], "b.i3d", 1]);
  assert.deepEqual(withImportSettings(next, null), next, "nothing saved yet");
  assert.equal(withImportSettings(next, {use: "bogus", turn: 45}).turn, 0, "damaged settings are cleaned");
});

test("turnedSize: the footprint of a model turned any angle is the box round it", () => {
  const meta = normalizeMeta({box: {min: [0, 0, -0.4], max: [2.4, 0.6, 0.4]}});   // 2.4 x 0.8 x 0.6
  assert.deepEqual(turnedSize(meta, 0), [2.4, 0.8, 0.6]);
  assert.deepEqual(turnedSize(meta, 90), [0.8, 2.4, 0.6]);
  assert.deepEqual(turnedSize(meta, 180), [2.4, 0.8, 0.6]);
  const [w, d, h] = turnedSize(meta, 45);
  assert.equal(w, d); assert.equal(w, 2.263); assert.equal(h, 0.6);   // (2.4 + 0.8) / sqrt(2)
  assert.deepEqual(turnedSize(normalizeMeta({...meta, turn: 90}), 0), [0.8, 2.4, 0.6], "the model's own turn counts");
});
