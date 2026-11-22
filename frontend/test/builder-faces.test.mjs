// The modeller, step 3: faces of a part and material rows (docs/PLAN_BUILDER.md). Pure, no DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitize, partMesh, exportI3d, partFaces, faceOfTriangle, faceColor, addPart, addMaterial, updateMaterial, removeMaterial, setFaceMaterial, MAX_MATERIALS,
} from "../src/builder/model.mjs";

const part = extra => ({shape: "box", w: 1, h: 2, d: 0.5, color: "#336699", ...extra});
const count = (s, re) => (s.match(re) || []).length;

test("faces: a box has six, a cylinder three, each with a name", () => {
  const b = sanitize({parts: [part()]}).parts[0], c = sanitize({parts: [part({shape: "cylinder"})]}).parts[0];
  assert.deepEqual(partFaces(b).map(f => f.id), ["nx", "px", "ny", "py", "nz", "pz"]);
  assert.deepEqual(partFaces(c).map(f => f.id), ["side", "bottom", "top"]);
  assert.ok(partFaces(b).every(f => typeof f.label === "string" && f.label.length > 1));
});

test("faces: every triangle belongs to a face, and a box face's triangles face the way its name says", () => {
  const p = sanitize({parts: [part()]}).parts[0], g = partMesh(p), face = faceOfTriangle(p);
  assert.equal(face.length, g.i.length / 3);
  const dir = {nx: [-1, 0, 0], px: [1, 0, 0], ny: [0, -1, 0], py: [0, 1, 0], nz: [0, 0, -1], pz: [0, 0, 1]};
  face.forEach((f, t) => { const v = g.i[t * 3]; assert.deepEqual([g.n[v * 3], g.n[v * 3 + 1], g.n[v * 3 + 2]], dir[f], `triangle ${t} is ${f}`); });
  for (const f of Object.keys(dir)) assert.equal(face.filter(x => x === f).length, 2, f + " has two triangles");
});

test("faces: a cylinder's side, bottom and top are told apart by their normals", () => {
  const p = sanitize({parts: [part({shape: "cylinder", seg: 12})]}).parts[0], g = partMesh(p), face = faceOfTriangle(p);
  assert.equal(face.length, g.i.length / 3);
  assert.equal(face.filter(f => f === "side").length, 24);
  assert.equal(face.filter(f => f === "bottom").length, 12);
  assert.equal(face.filter(f => f === "top").length, 12);
  face.forEach((f, t) => { const v = g.i[t * 3], ny = g.n[v * 3 + 1]; if (f === "top") assert.equal(ny, 1); else if (f === "bottom") assert.equal(ny, -1); else assert.equal(ny, 0); });
});

test("materials: rows with a name and a colour, ids kept and made unique, at most MAX_MATERIALS", () => {
  const m = sanitize({materials: [{id: 5, name: "Plåt", color: "#AABBCC"}, {id: 5, name: "Dubblett", color: "red"}, "junk", {name: "<b>x"}]});
  assert.deepEqual(m.materials.map(x => x.id), [5, 6, 7], "a clashing or missing id gets a new one");
  assert.equal(m.materials[0].color, "#aabbcc");
  assert.match(m.materials[1].color, /^#[0-9a-f]{6}$/);
  assert.equal(m.materials[2].name, "bx");
  assert.equal(sanitize({materials: Array.from({length: MAX_MATERIALS + 5}, (_, k) => ({id: k + 1}))}).materials.length, MAX_MATERIALS);
  assert.deepEqual(sanitize({}).materials, [], "none to start with");
});

test("a part's faces point at materials: an unknown face or material is dropped", () => {
  const m = sanitize({materials: [{id: 2, color: "#112233"}], parts: [part({faces: {py: 2, nx: 99, banana: 2, side: 2, pz: "x"}})]});
  assert.deepEqual(m.parts[0].faces, {py: 2}, "only a face of a box that points at a material that exists");
  assert.deepEqual(sanitize({parts: [part()]}).parts[0].faces, {});
});

test("faceColor: the material's colour if the face has one, else the part's", () => {
  const m = sanitize({materials: [{id: 1, color: "#ff0000"}], parts: [part({faces: {py: 1}})]});
  assert.equal(faceColor(m, m.parts[0], "py"), "#ff0000");
  assert.equal(faceColor(m, m.parts[0], "px"), "#336699");
});

test("operations: add, change and remove a material; removing it lets its faces fall back to the part's colour", () => {
  let m = addPart(sanitize({}));
  m = addMaterial(m, {name: "Rost", color: "#aa4422"});
  m = addMaterial(m);
  assert.deepEqual(m.materials.map(x => x.id), [1, 2]);
  assert.equal(m.materials[0].name, "Rost");
  m = updateMaterial(m, 2, {color: "#00ff00", name: "Grön", id: 9});
  assert.deepEqual([m.materials[1].id, m.materials[1].color, m.materials[1].name], [2, "#00ff00", "Grön"]);
  m = setFaceMaterial(m, 1, "py", 1);
  m = setFaceMaterial(m, 1, "nx", 2);
  assert.deepEqual(m.parts[0].faces, {py: 1, nx: 2});
  m = setFaceMaterial(m, 1, "nx", null);
  assert.deepEqual(m.parts[0].faces, {py: 1}, "null takes the override away");
  m = removeMaterial(m, 1);
  assert.deepEqual(m.materials.map(x => x.id), [2]);
  assert.deepEqual(m.parts[0].faces, {}, "its faces are the part's again");
  assert.equal(removeMaterial(m, 99).materials.length, 1);
  const before = JSON.stringify(m); setFaceMaterial(m, 1, "py", 2); assert.equal(JSON.stringify(m), before, "the input is never changed");
  assert.equal(setFaceMaterial(m, 99, "py", 2).parts.length, 1, "an unknown part changes nothing");
  assert.deepEqual(setFaceMaterial(m, 1, "side", 2).parts[0].faces, {}, "a face the shape lacks changes nothing");
});

test("export: a part with one colour is one shape as before; with a face of its own it is split by material", () => {
  const plain = exportI3d(sanitize({parts: [part({name: "Tank"})]})).i3d;
  assert.equal(count(plain, /<Shape /g), 1);
  assert.equal(count(plain, /<Material /g), 1);

  const m = sanitize({materials: [{id: 1, color: "#cc0000"}], parts: [part({name: "Tank", faces: {py: 1}})]});
  const {i3d} = exportI3d(m);
  assert.equal(count(i3d, /<Shape /g), 2, "one shape for the top, one for the rest");
  assert.equal(count(i3d, /<Material /g), 2);
  assert.match(i3d, /<Shape name="Tank"/);
  assert.match(i3d, /<Shape name="Tank_2"/);
  // 12 triangles in all: 2 on top, 10 on the others
  const tris = [...i3d.matchAll(/<IndexedTriangleSet [^>]*>[\s\S]*?<\/IndexedTriangleSet>/g)].map(x => x[0]);
  assert.equal(tris.length, 2);
  assert.deepEqual(tris.map(t => +t.match(/<Triangles count="(\d+)"/)[1]).sort((a, b) => a - b), [2, 10]);
});

test("export: faces that share a material stay in one shape, and a material of the same colour as the part's does not split it", () => {
  const same = sanitize({materials: [{id: 1, color: "#336699"}], parts: [part({faces: {py: 1}})]});
  assert.equal(count(exportI3d(same).i3d, /<Shape /g), 1, "same colour: nothing to split");
  const two = sanitize({materials: [{id: 1, color: "#cc0000"}], parts: [part({faces: {py: 1, ny: 1}})]});
  assert.equal(count(exportI3d(two).i3d, /<Shape /g), 2, "top and bottom share a shape");
});
