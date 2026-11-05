import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assetType, assetIdOf, readI3d, missingFiles, readObj, normalizeMeta, assetSize, assetDef, withAssets,
  placement, assetFolder, flattenI3d, nameFromFile,
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
