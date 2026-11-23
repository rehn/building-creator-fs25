// The modeller as a source of items for "My items": a prop saved as an asset (i3d, shapes, the atlas, an .obj for the preview) that buildings can place. Pure, no DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize } from "../src/builder/model.mjs";
import { makeItem } from "../src/builder/item.mjs";
import { readI3d, readObj, normalizeMeta, flattenI3d, missingFiles } from "../src/editor/assets.mjs";

const part = extra => ({shape: "box", w: 1, h: 2, d: 0.5, color: "#336699", ...extra});

test("item: the files are named after the item, in plain names the server accepts", () => {
  const out = makeItem(sanitize({parts: [part({name: "Tank"})]}), {name: "My Silo / No. 2!"});
  assert.deepEqual([...out.files.keys()].sort(), ["My_Silo_No_2.i3d", "My_Silo_No_2.i3d.shapes", "My_Silo_No_2.obj"].sort());
  assert.ok(out.files.get("My_Silo_No_2.i3d.shapes") instanceof Uint8Array);
  assert.equal(makeItem(sanitize({}), {name: "???"}).meta.i3d, "item.i3d", "a name with no letters is just item");
  for (const n of out.files.keys()) assert.match(n, /^[A-Za-z0-9 ._()+-]+$/);
});

test("item: the i3d's own files sit beside it (no folders), and the atlas pictures are named for the page to add", () => {
  const out = makeItem(sanitize({parts: [part()]}), {name: "silo"});
  const i3d = out.files.get("silo.i3d");
  assert.equal(i3d.includes("textures/"), false);
  assert.match(i3d, /filename="silo_diffuse.dds"/);
  assert.match(i3d, /externalShapesFile="silo.i3d.shapes"/);
  assert.deepEqual(out.pictures, {diffuse: "silo_diffuse.dds", normal: "silo_normal.dds", specular: "silo_specular.dds"});
  const info = readI3d(i3d);
  assert.equal(info.root, "silo");
  assert.deepEqual(missingFiles(i3d, [...out.files.keys(), ...Object.values(out.pictures)]), []);
  assert.equal(flattenI3d(i3d, [...Object.values(out.pictures), "silo.i3d.shapes"]), i3d, "nothing left to flatten");
});

test("item: no placement areas, triggers or placeable nodes: just the visuals and the collision", () => {
  const i3d = makeItem(sanitize({parts: [part({name: "Tank"})]}), {name: "x"}).files.get("x.i3d");
  assert.ok(!/AreaStart01|testArea/.test(i3d));
  assert.match(i3d, /<TransformGroup name="visuals"/);
  assert.match(i3d, /<Shape name="collision_Tank"/);
});

test("item: meta is what My items reads: the files, the collision shapes to leave out of the preview, and the box round the model as it stands", () => {
  const m = sanitize({parts: [part({name: "Tank", x: 2, z: 1, w: 2, d: 4}), part({name: "Post", x: -3, w: 1, d: 1, h: 5, collision: false})]});
  const {meta, files} = makeItem(m, {name: "silo"});
  assert.deepEqual(normalizeMeta(meta), meta, "already clean");
  assert.equal(meta.i3d, "silo.i3d"); assert.equal(meta.obj, "silo.obj");
  assert.deepEqual(meta.hidden, ["collision_Tank"]);
  assert.deepEqual(meta.box.min.map(v => Math.round(v * 100) / 100), [-3.5, 0, -1]);
  assert.deepEqual(meta.box.max.map(v => Math.round(v * 100) / 100), [3, 5, 3]);
  const obj = readObj(files.get("silo.obj"), meta.hidden);
  assert.equal(obj.positions.length, 2 * 12 * 3 * 3, "two boxes, 12 triangles each, drawn parts only");
  assert.deepEqual(obj.box.min.map(v => Math.round(v * 100) / 100), meta.box.min);
  assert.deepEqual(obj.box.max.map(v => Math.round(v * 100) / 100), meta.box.max);
});

test("item: the preview .obj has the parts turned and moved as they stand, and nothing of the collision", () => {
  const m = sanitize({parts: [part({name: "Plank", w: 4, h: 1, d: 1, rotY: 90, x: 10})]});
  const {files, meta} = makeItem(m, {name: "p"});
  const obj = readObj(files.get("p.obj"));
  assert.deepEqual([obj.box.min[0], obj.box.max[0]].map(v => Math.round(v * 100) / 100), [9.5, 10.5], "4 m long along x turned to lie along z");
  assert.deepEqual([obj.box.min[2], obj.box.max[2]].map(v => Math.round(v * 100) / 100), [-2, 2]);
  assert.ok(!files.get("p.obj").includes("collision"));
  assert.equal(meta.mount, "floor");
});

test("a project remembers which item it was saved as, so the next save replaces that item", () => {
  assert.equal(sanitize({}).item, null);
  assert.deepEqual(sanitize({item: {id: "abc123_-X"}}).item, {id: "abc123_-X"});
  for (const bad of [{id: ""}, {id: "a/b"}, {id: 5}, {id: "x".repeat(65)}, "abc", [], {}]) assert.equal(sanitize({item: bad}).item, null, JSON.stringify(bad));
});

test("item: the preview .obj carries the atlas uvs, so the editor can draw the item with its picture", () => {
  const m = sanitize({materials: [{id: 1, color: "#cc0000"}], parts: [part({name: "Tank", faces: {py: 1}}), part({name: "Post", shape: "cylinder", r: 0.2})]});
  const {files, meta, pictures} = makeItem(m, {name: "silo"});
  assert.equal(meta.texture, pictures.diffuse);
  const text = files.get("silo.obj");
  assert.match(text, /^vt /m);
  assert.match(text, /^f \d+\/\d+ \d+\/\d+ \d+\/\d+$/m);
  const o = readObj(text);
  assert.ok(o.uvs && o.uvs.length / 2 === o.positions.length / 3);
  assert.ok(o.uvs.every(v => v >= 0 && v <= 1.0001), "inside the atlas");
});
