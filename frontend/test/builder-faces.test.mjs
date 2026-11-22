// The modeller, step 3: faces of a part and material rows (docs/PLAN_BUILDER.md). Pure, no DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitize, partMesh, exportI3d, partFaces, faceOfTriangle, faceColor, addPart, addMaterial, updateMaterial, removeMaterial, setFaceMaterial, MAX_MATERIALS,
} from "../src/builder/model.mjs";

const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6, `${m}: ${a} is not ${b}`);
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

/* ---------- Textures as material rows (PLAN_BUILDER step 3, second part) ---------- */
import { partUv } from "../src/builder/model.mjs";

const TEX = "abc123def4";
const withTexture = (extra, faces, meters = 1, parts) => sanitize({materials: [{id: 1, color: "#cc0000", texture: {id: TEX, meters}, ...extra}], parts: parts || [part({faces})]});

test("a material row may point at one of the user's textures, with the real size of one repeat in metres", () => {
  const m = withTexture({}, {py: 1}, 2);
  assert.deepEqual(m.materials[0].texture, {id: TEX, meters: 2});
  assert.equal(sanitize({materials: [{texture: null}]}).materials[0].texture, null);
  assert.equal(sanitize({materials: [{texture: {id: "../etc/passwd", meters: 1}}]}).materials[0].texture, null, "an id that is not a plain id is refused");
  assert.equal(sanitize({materials: [{texture: {id: TEX, meters: -5}}]}).materials[0].texture.meters, 1, "a bad size falls back to 1 m");
  assert.equal(sanitize({materials: [{texture: {id: TEX, meters: 9999}}]}).materials[0].texture.meters, 100);
  assert.equal(sanitize({materials: [{color: "#112233"}]}).materials[0].texture, null, "colour only to start with");
});

test("uv by real size: a box's top face is as many repeats across as it is metres wide", () => {
  const m = withTexture({}, {py: 1, pz: 1}, 0.5, [part({w: 2, h: 3, d: 1, faces: {py: 1, pz: 1}})]);
  const p = m.parts[0], g = partMesh(p), uv = partUv(m, p);
  assert.equal(uv.length, g.uv.length);
  const face = faceOfTriangle(p), range = (f, k) => { const xs = []; g.i.forEach((v, i) => { if (face[(i / 3) | 0] === f) xs.push(uv[v * 2 + k]); }); return Math.max(...xs) - Math.min(...xs); };
  near(range("py", 0), 4, "top: 2 m wide / 0.5 m = 4 repeats");
  near(range("py", 1), 2, "top: 1 m deep = 2 repeats");
  near(range("pz", 0), 4, "front: 2 m wide");
  near(range("pz", 1), 6, "front: 3 m high / 0.5 m");
  // a face without a texture keeps the mesh's own uv
  const own = partMesh(p).uv; g.i.forEach((v, i) => { if (face[(i / 3) | 0] === "nx") assert.deepEqual([uv[v * 2], uv[v * 2 + 1]], [own[v * 2], own[v * 2 + 1]]); });
});

test("uv: the texture is not mirrored on the front, and a wall's v goes up with y", () => {
  const m = withTexture({}, {pz: 1, px: 1}, 1, [part({w: 2, h: 3, d: 1, faces: {pz: 1, px: 1}})]);
  const p = m.parts[0], g = partMesh(p), uv = partUv(m, p), face = faceOfTriangle(p);
  const verts = f => [...new Set(g.i.filter((v, i) => face[(i / 3) | 0] === f))];
  for (const f of ["pz", "px"]) {
    const vs = verts(f), top = vs.filter(v => g.p[v * 3 + 1] > 1.5), bottom = vs.filter(v => g.p[v * 3 + 1] < 1.5);
    assert.ok(Math.min(...top.map(v => uv[v * 2 + 1])) > Math.max(...bottom.map(v => uv[v * 2 + 1])) - 1e-9, f + ": v grows upwards");
  }
  // seen from the front (+z) the right-hand side is +x, and u grows to the right
  const f = verts("pz"), right = f.filter(v => g.p[v * 3] > 0), left = f.filter(v => g.p[v * 3] < 0);
  assert.ok(uv[right[0] * 2] > uv[left[0] * 2], "u grows to the right on the front");
  // seen from the right side (+x) the right-hand side is -z
  const s = verts("px"), sr = s.filter(v => g.p[v * 3 + 2] < 0), sl = s.filter(v => g.p[v * 3 + 2] > 0);
  assert.ok(uv[sr[0] * 2] > uv[sl[0] * 2], "u grows to the right on the side too");
});

test("uv: round a cylinder the texture runs on without a jump at the seam, one circumference long", () => {
  const m = withTexture({}, {side: 1}, 0.5, [part({shape: "cylinder", r: 0.5, h: 2, seg: 12, faces: {side: 1}})]);
  const p = m.parts[0], g = partMesh(p), uv = partUv(m, p);
  const circ = 2 * Math.PI * 0.5 / 0.5;
  const sideVerts = g.p.length / 3 - (1 + 12) * 2;   // the caps are a centre and a ring each
  assert.equal(sideVerts, 2 * 13, "the seam has its own pair of vertices");
  const us = []; for (let k = 0; k <= 12; k++) us.push(uv[k * 2 * 2]);   // the low vertex of each column
  const steps = us.slice(1).map((u, k) => u - us[k]);
  assert.ok(steps.every(d => Math.abs(d - steps[0]) < 1e-6), "even steps all the way round, the seam included");
  near(Math.abs(us[12] - us[0]), circ, "a full circumference");
  near(uv[1], 0, "v is 0 at the bottom"); near(uv[3], 4, "and height / size = 4 at the top");
});

test("uv: never past the game's limit of 32 repeats, however big the face or small the texture", () => {
  const m = withTexture({}, {py: 1, pz: 1}, 0.05, [part({w: 50, h: 50, d: 50, faces: {py: 1, pz: 1}})]);
  const uv = partUv(m, m.parts[0]);
  assert.ok(uv.every(v => Math.abs(v) <= 32 + 1e-6), "inside [-32, 32]");
});

test("export: a textured face gets its own material with the three maps, and the texture ids are listed for the files", () => {
  const m = withTexture({}, {py: 1}, 2);
  const out = exportI3d(m);
  assert.deepEqual(out.textures, [TEX]);
  assert.match(out.i3d, new RegExp(`<File fileId="1" filename="textures/${TEX}_diffuse.dds"/>`));
  assert.match(out.i3d, new RegExp(`filename="textures/${TEX}_normal.dds"`));
  assert.match(out.i3d, new RegExp(`filename="textures/${TEX}_specular.dds"`));
  assert.match(out.i3d, /<Texture fileId="1"\/>/);
  assert.match(out.i3d, /<Normalmap fileId="2"\/>/);
  assert.match(out.i3d, /<Glossmap fileId="3"\/>/);
  assert.equal(count(out.i3d, /<Shape /g), 2, "the top apart from the plain rest");
  assert.equal(count(out.i3d, /<Material /g), 2);
  // the textured shape carries the uv in repeats: the top is 1 m x 0.5 m, 2 m per repeat
  const raw = out.doc.raw.find(r => r.name === "part1_2") || out.doc.raw[1];
  assert.ok(Math.max(...raw.uv) <= 0.5 + 1e-6);
});

test("export: two rows with the same texture share its files and its material; withTextures false uses the colour", () => {
  const m = sanitize({materials: [{id: 1, color: "#cc0000", texture: {id: TEX, meters: 1}}, {id: 2, color: "#00cc00", texture: {id: TEX, meters: 3}}], parts: [part({faces: {py: 1, pz: 2}})]});
  const out = exportI3d(m);
  assert.deepEqual(out.textures, [TEX]);
  assert.equal(count(out.i3d, /<File /g), 3, "one set of files");
  assert.equal(count(out.i3d, /<Shape /g), 3, "the top, the front (their uv differ: a shape for each row) and the plain rest");
  assert.equal(count(out.i3d, /<Material /g), 2, "one material for the texture, one for the plain colour");
  const plain = exportI3d(m, {withTextures: false});
  assert.deepEqual(plain.textures, []);
  assert.equal(count(plain.i3d, /<File /g), 0);
  assert.match(plain.i3d, /diffuseColor="0.8 0 0 1"/);
});
