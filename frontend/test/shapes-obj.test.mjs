// Any .i3d.shapes file can be read (the seed in its header picks the row of the key table), and an i3d with its shapes gives the same .obj Giants Editor writes,
// so an item can be imported without an .obj (docs: the "Items" page).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { KEY_ROW, SEED, writeShapes, readShapes } from "../src/editor/shapes.mjs";
import { keyRow } from "../src/editor/shapesKeys.mjs";
import { i3dToObj, localMatrix } from "../src/editor/shapesObj.mjs";
import { readObj, splitItems } from "../src/editor/assets.mjs";

const quad = (id, name) => ({id, name, positions: [0, 0, 0, 2, 0, 0, 2, 0, 3, 0, 0, 3], normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
  uv: [0, 0, 1, 0, 1, 1, 0, 1], indices: [0, 2, 1, 0, 3, 2]});

test("the key table: 256 rows of 16 words, the row of our own seed is the one we always wrote with", () => {
  assert.deepEqual(keyRow(SEED), KEY_ROW);
  assert.equal(keyRow(0).length, 16);
  assert.notDeepEqual(keyRow(0x92), keyRow(SEED));
  assert.throws(() => keyRow(256));
});

test("a file with another seed is read with that seed's row", () => {
  for (const seed of [0x00, 0x1c, 0x92, 0xd9, 0xff]) {
    const file = writeShapes([quad(3, "boxShape")], seed);
    assert.equal(file[2], seed);
    const [s] = readShapes(file);
    assert.equal(s.name, "boxShape");
    assert.deepEqual([...s.indices], [0, 2, 1, 0, 3, 2]);
  }
  // the wrong row does not read
  assert.throws(() => readShapes(writeShapes([quad(1, "a")], 0x92), keyRow(0x10)));
});

test("rotation is X first, then Y, then Z (degrees), scale before it, translation last", () => {
  const apply = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
  const near = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 1e-9);
  assert.ok(near(apply(localMatrix([0, 0, 0], [0, 90, 0], [1, 1, 1]), [0, 0, 1]), [1, 0, 0]), "90 degrees about Y turns +z to +x");
  assert.ok(near(apply(localMatrix([0, 0, 0], [90, 0, 0], [1, 1, 1]), [0, 1, 0]), [0, 0, 1]), "90 degrees about X turns +y to +z");
  assert.ok(near(apply(localMatrix([0, 0, 0], [90, 90, 0], [1, 1, 1]), [0, 1, 0]), [1, 0, 0]), "X first: +y -> +z, then Y: +z -> +x");
  assert.ok(near(apply(localMatrix([1, 2, 3], [0, 0, 0], [2, 2, 2]), [1, 1, 1]), [3, 4, 5]), "scaled, then moved");
});

const i3d = `<?xml version="1.0" encoding="iso-8859-1"?>
<i3D name="box" version="1.6">
  <Files/><Materials/><Shapes externalShapesFile="box.i3d.shapes"/>
  <Scene>
    <TransformGroup name="root" translation="10 0 0">
      <Shape name="top" shapeId="3" translation="0 1 0" materialIds="1"/>
      <TransformGroup name="turned" rotation="0 90 0">
        <UserAttributes><Attribute name="x" type="boolean" value="true"/></UserAttributes>
        <Shape name="side" shapeId="3" nonRenderable="true"/>
      </TransformGroup>
    </TransformGroup>
  </Scene>
</i3D>`;

test("the .obj has a group for each shape node, its vertices moved by the node and its parents", () => {
  const r = i3dToObj(i3d, writeShapes([quad(3, "boxShape")], 0x92));
  assert.equal(r.shapes, 2);
  assert.equal(r.triangles, 4);
  assert.deepEqual(r.obj.split("\n").filter(l => l.startsWith("g ")), ["g top", "g side"]);
  const all = readObj(r.obj);
  assert.equal(all.positions.length / 9, 4);
  // "top": the quad (x 0..2, z 0..3) moved to x 10..12, y 1
  const top = readObj(r.obj, ["side"]);
  assert.deepEqual(top.box, {min: [10, 1, 0], max: [12, 1, 3]});
  // "side": turned 90 degrees about Y (x -> -z, z -> x): x 10, z -2..0, and x from 10 to 13
  const side = readObj(r.obj, ["top"]);
  assert.deepEqual(side.box.min.map(x => Math.round(x * 1e6) / 1e6), [10, 0, -2]);
  assert.deepEqual(side.box.max.map(x => Math.round(x * 1e6) / 1e6), [13, 0, 0]);
  assert.ok(all.uvs && all.uvs.length === all.positions.length / 3 * 2, "with texture coordinates");
});

test("an export of several nodes is cut into items from the made .obj as from Giants Editor's", () => {
  const two = i3d.replace(/<TransformGroup name="root"[\s\S]*<\/Scene>/, `<Shape name="a" shapeId="3" translation="5 0 0"/>\n<Shape name="b" shapeId="3" translation="-5 0 0"/>\n</Scene>`);
  const {obj} = i3dToObj(two, writeShapes([quad(3, "boxShape")]));
  const parts = splitItems(two, obj);
  assert.deepEqual(parts.map(p => p.name), ["A", "B"]);
  assert.deepEqual(readObj(parts[0].obj).box, {min: [0, 0, 0], max: [2, 0, 3]}, "moved back to the middle");
});

test("a shapes file the reader does not know says so; a scene without shapes has nothing to show", () => {
  assert.throws(() => i3dToObj(i3d, Uint8Array.of(7, 0, 0x92, 0, 1, 2, 3, 4)), /could not be read/);
  assert.throws(() => i3dToObj(i3d, writeShapes([quad(9, "other")])), /nothing the scene uses/);
  assert.throws(() => i3dToObj("<i3D/>", writeShapes([quad(3, "x")])), /no scene/);
});

// The game's own files, when the game is installed: every kind of seed
const GAME = process.env.FS25_GAME_DIR || "/mnt/c/Program Files (x86)/Farming Simulator 2025";
test("the game's own .shapes files of several seeds are read", { skip: !existsSync(join(GAME, "data/placeables/brandless/gardenSheds")) }, () => {
  const seeds = new Set();
  const dir = join(GAME, "data/placeables/brandless");
  let n = 0;
  const walk = d => { for (const e of readdirSync(d, {withFileTypes: true})) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".i3d.shapes") && n < 40) { const b = new Uint8Array(readFileSync(p)); try { readShapes(b); seeds.add(b[2]); n++; } catch { /* a kind of file the reader does not know */ } }
  } };
  walk(dir);
  assert.ok(n >= 10, `${n} files read`);
  assert.ok(seeds.size >= 5, `${seeds.size} different seeds`);
});
