// The modeller's atlas (docs/PLAN_BUILDER.md, "UV och atlas"): one texture made of full-width rows, a colour or a photo texture each. Pure, no DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize } from "../src/builder/model.mjs";
import { MAX_TILES, atlasLayout, partAtlasUv, atlasPixels, atlasFiles, exportI3dAtlas, atlasDdsFiles, PAD, COLOR_H } from "../src/builder/atlas.mjs";
import { decodeDds } from "../src/editor/dds.mjs";

const part = extra => ({shape: "box", w: 1, h: 2, d: 0.5, color: "#336699", ...extra});
const count = (s, re) => (s.match(re) || []).length;
const T1 = "aaa111", T2 = "bbb222";
const mat = (id, extra) => ({id, color: "#cc0000", ...extra});
const tex = (id, meters = 1) => ({id, meters});
/** The uv of a face's vertices (the box's faces are four vertices each, in the order nx px ny py nz pz). */
const faceUv = (uv, k) => [0, 1, 2, 3].map(i => [uv[(k * 4 + i) * 2], uv[(k * 4 + i) * 2 + 1]]);
const FACE = {nx: 0, px: 1, ny: 2, py: 3, nz: 4, pz: 5};

test("layout: a model with colours only is a small atlas with a row for each colour, once", () => {
  const m = sanitize({materials: [mat(1), mat(2, {color: "#336699"})], parts: [part({faces: {py: 1, ny: 2}}), part({faces: {pz: 1}})]});
  const L = atlasLayout(m);
  assert.equal(L.rows.length, 2, "the part's colour and the red, each once (material 2 has the part's colour)");
  assert.ok(L.rows.every(r => r.kind === "color" && r.h === COLOR_H));
  assert.ok(L.width <= 16 && L.fits);
  assert.ok(L.height >= L.rows.length * (COLOR_H + 2 * PAD));
  assert.equal(L.height & (L.height - 1), 0, "a power of two");
});

test("layout: a texture is one row however many material rows or faces use it; its height is the repeats a face needs", () => {
  const m = sanitize({materials: [mat(1, {texture: tex(T1, 1)}), mat(2, {texture: tex(T1, 4)})], parts: [part({h: 2.5, faces: {pz: 1, nz: 2}})]});
  const L = atlasLayout(m, {width: 512}), rows = L.rows.filter(r => r.kind === "texture");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].textureId, T1);
  assert.equal(rows[0].tiles, 3, "2.5 m of a 1 m texture needs three repeats of height");
  assert.equal(rows[0].h, 512 * 3);
  assert.equal(L.width, 512);
});

test("layout: rows are at most MAX_TILES repeats high, a taller face is squeezed to fit; and the rows must fit the atlas", () => {
  const tall = sanitize({materials: [mat(1, {texture: tex(T1, 1)})], parts: [part({h: 50, faces: {pz: 1}})]});
  const L = atlasLayout(tall, {width: 256});
  assert.equal(L.rows.find(r => r.kind === "texture").tiles, MAX_TILES - 1, "16 would not fit 4096 at 256 px: 15");
  const uv = faceUv(partAtlasUv(tall, tall.parts[0], L), FACE.pz), row = L.rows.find(r => r.kind === "texture");
  const top = 1 - row.y / L.height, bottom = 1 - (row.y + row.h) / L.height;
  assert.ok(uv.every(([, v]) => v >= bottom - 1e-9 && v <= top + 1e-9), "inside its row");

  const many = sanitize({materials: [T1, T2, "ccc333", "ddd444", "eee555"].map((id, k) => mat(k + 1, {texture: tex(id)})), parts: [part({faces: {px: 1, nx: 2, py: 3, ny: 4, pz: 5}})]});
  assert.equal(atlasLayout(many, {width: 1024}).fits, false, "five 1024 rows do not fit 4096");
  assert.equal(atlasLayout(many, {width: 512}).fits, true);
});

test("uv: a colour face sits in the middle of its row, whatever its size; a texture face runs u in repeats and v inside its row", () => {
  const m = sanitize({materials: [mat(1), mat(2, {texture: tex(T1, 2)})], parts: [part({w: 4, h: 1, d: 1, faces: {py: 1, pz: 2}})]});
  const L = atlasLayout(m, {width: 256}), uv = partAtlasUv(m, m.parts[0], L);
  assert.equal(uv.length, 48);
  const red = L.rows.find(r => r.color === "#cc0000"), mid = 1 - (red.y + red.h / 2) / L.height;
  for (const [u, v] of faceUv(uv, FACE.py)) { assert.ok(Math.abs(v - mid) < 1e-9); assert.ok(u > 0 && u < 1); }
  const row = L.rows.find(r => r.kind === "texture"), f = faceUv(uv, FACE.pz);
  assert.ok(Math.abs(Math.max(...f.map(p => p[0])) - 2) < 1e-6, "4 m wide, 2 m per repeat: u runs 0..2");
  const span = Math.max(...f.map(p => p[1])) - Math.min(...f.map(p => p[1]));
  assert.ok(Math.abs(span - 0.5 * 256 / L.height) < 1e-6, "1 m high, half a repeat of the row (256 px)");
  const bottom = 1 - (row.y + row.h) / L.height;
  assert.ok(Math.abs(Math.min(...f.map(p => p[1])) - bottom) < 1e-6, "starts at the bottom of the row");
});

test("uv: every vertex of every part stays inside the game's limit", () => {
  const m = sanitize({materials: [mat(1, {texture: tex(T1, 0.05)})], parts: [part({w: 50, h: 50, d: 50, faces: {py: 1, pz: 1}}), part({shape: "cylinder", r: 3, h: 4, faces: {side: 1}})]});
  const L = atlasLayout(m, {width: 256});
  for (const p of m.parts) assert.ok(partAtlasUv(m, p, L).every(v => Math.abs(v) <= 32 + 1e-6));
});

/* pixels */
const solid = (n, [r, g, b]) => { const a = new Uint8ClampedArray(n * n * 4); for (let i = 0; i < n * n; i++) a.set([r, g, b, 255], i * 4); return a; };
const stripes = n => { const a = new Uint8ClampedArray(n * n * 4); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) a.set([y * 4, x * 4, 0, 255], (y * n + x) * 4); return a; };
const load = id => id === T1 ? {size: 64, diffuse: stripes(64), normal: solid(64, [10, 20, 30]), specular: solid(64, [1, 2, 3])} : null;

test("pixels: a colour row is that colour with a flat normal, a texture row is the texture with its edges wrapped into the padding", () => {
  const m = sanitize({materials: [mat(1, {texture: tex(T1)})], parts: [part({faces: {pz: 1}})]});
  const L = atlasLayout(m, {width: 64}), px = atlasPixels(L, load);
  assert.equal(px.diffuse.length, L.width * L.height * 4);
  const at = (a, x, y) => [...a.slice((y * L.width + x) * 4, (y * L.width + x) * 4 + 4)];
  const c = L.rows.find(r => r.kind === "color"), t = L.rows.find(r => r.kind === "texture");
  assert.deepEqual(at(px.diffuse, 5, c.y + 2), [0x33, 0x66, 0x99, 255]);
  assert.deepEqual(at(px.normal, 5, c.y + 2), [128, 128, 255, 255]);
  assert.deepEqual(at(px.diffuse, 3, t.y + 10), [40, 12, 0, 255], "the texture itself");
  assert.deepEqual(at(px.normal, 3, t.y + 10), [10, 20, 30, 255]);
  assert.deepEqual(at(px.specular, 3, t.y + 10), [77, 255, 0, 255], "the shine of the row, no occlusion, no metal (the stored specular map is not used)");
  assert.deepEqual(at(px.specular, 5, c.y + 2), [77, 255, 0, 255]);
  assert.deepEqual(at(px.diffuse, 3, t.y - 1), at(px.diffuse, 3, t.y + 63), "above the row: the texture's last line (it repeats)");
  assert.deepEqual(at(px.diffuse, 3, t.y + t.h), at(px.diffuse, 3, t.y), "below the row: its first line");
});

test("pixels: a texture that cannot be loaded is plain grey, never an error", () => {
  const m = sanitize({materials: [mat(1, {texture: tex(T2)})], parts: [part({faces: {pz: 1}})]});
  const L = atlasLayout(m, {width: 64}), px = atlasPixels(L, load), t = L.rows.find(r => r.kind === "texture");
  assert.deepEqual([...px.diffuse.slice((( t.y + 5) * 64 + 5) * 4, (( t.y + 5) * 64 + 5) * 4 + 4)], [128, 128, 128, 255]);
});

test("export: one shape for every part and one material with the atlas's three maps, however many materials", () => {
  const m = sanitize({materials: [mat(1), mat(2, {texture: tex(T1)})], parts: [part({name: "Tank", faces: {py: 1, pz: 2}}), part({name: "Pipe", faces: {ny: 1}})]});
  const out = exportI3dAtlas(m, {name: "pump", width: 256, collision: false});
  assert.equal(count(out.i3d, /<Shape /g), 2);
  assert.equal(count(out.i3d, /<Material /g), 1);
  const f = atlasFiles("pump");
  assert.equal(f.diffuse, "textures/pump_diffuse.dds");
  assert.match(out.i3d, /filename="textures\/pump_diffuse.dds"/);
  assert.match(out.i3d, /filename="textures\/pump_normal.dds"/);
  assert.deepEqual(out.textures, [T1]);
  assert.equal(out.layout.width, 256);
});

test("export: an atlas of colours only is tiny, and the DDS files decode to the pixels", () => {
  const m = sanitize({parts: [part()]});
  const out = exportI3dAtlas(m, {name: "x"}), dds = atlasDdsFiles(out.layout, () => null);
  assert.deepEqual(out.textures, []);
  const d = decodeDds(dds.diffuse);
  assert.equal(d.width, out.layout.width); assert.equal(d.height, out.layout.height);
  assert.ok(Math.abs(d.data[(PAD + 1) * d.width * 4] - 0x33) < 12, "the part's blue");
});

test("layout: autoWidth makes the atlas coarser instead of dropping repeats when the rows would not fit", () => {
  const tall = sanitize({materials: [mat(1, {texture: tex(T1, 1)})], parts: [part({h: 30, faces: {pz: 1}})]});
  const L = atlasLayout(tall, {width: 1024, autoWidth: true}), row = L.rows.find(r => r.kind === "texture");
  assert.equal(row.tiles, MAX_TILES);
  assert.ok(L.fits && L.width <= 256, `width ${L.width}`);
  const plain = atlasLayout(tall, {width: 1024});
  assert.ok(plain.rows.find(r => r.kind === "texture").tiles < MAX_TILES, "without it the row loses repeats");
});

/* turning a face's texture a quarter at a time */
import { setFaceRotation, partUv } from "../src/builder/model.mjs";

test("rotation: a face's texture can be turned 0, 90, 180 or 270 degrees; anything else, or a face the shape lacks, is dropped", () => {
  const p = sanitize({parts: [part({faceRot: {pz: 90, py: 45, side: 90, nz: 270, nx: 0, px: "x"}})]}).parts[0];
  assert.deepEqual(p.faceRot, {pz: 90, nz: 270});
  const m = sanitize({parts: [part()]});
  assert.deepEqual(setFaceRotation(m, 1, "pz", 180).parts[0].faceRot, {pz: 180});
  assert.deepEqual(setFaceRotation(setFaceRotation(m, 1, "pz", 180), 1, "pz", 0).parts[0].faceRot, {}, "0 is the same as none");
  assert.deepEqual(setFaceRotation(m, 1, "pz", 90).parts[0].faceRot, {pz: 90});
  assert.deepEqual(setFaceRotation(m, 99, "pz", 90).parts[0].faceRot, {}, "an unknown part changes nothing");
});

test("rotation: turned 90 degrees the repeats run the other way, so a long face's length is in u again, and uvs still start at 0", () => {
  const base = sanitize({materials: [mat(1, {texture: tex(T1, 1)})], parts: [part({w: 4, h: 1, d: 1, faces: {pz: 1}})]});
  const turned = setFaceRotation(base, 1, "pz", 90);
  const ext = (m, k) => { const f = faceUv(partUv(m, m.parts[0]), FACE.pz); return [Math.min(...f.map(q => q[k])), Math.max(...f.map(q => q[k]))]; };
  assert.deepEqual([ext(base, 0), ext(base, 1)], [[0, 4], [0, 1]]);
  assert.deepEqual([ext(turned, 0), ext(turned, 1)], [[0, 1], [0, 4]]);
  const L = atlasLayout(turned, {width: 256}), row = L.rows.find(r => r.kind === "texture");
  assert.equal(row.tiles, 4, "now the 4 m are in v, so the row is four repeats high");
  assert.ok(partAtlasUv(turned, turned.parts[0], L).every(v => Number.isFinite(v)));
});

/* binary shapes, as Giants Editor saves them (no "non-binary indexed triangle sets" warning in the game) */
import { readShapes } from "../src/editor/shapes.mjs";

test("export: the meshes are a binary .i3d.shapes file next to the i3d, one shape for each part, with the atlas uvs", () => {
  const m = sanitize({materials: [mat(1, {texture: tex(T1)})], parts: [part({name: "Tank", faces: {pz: 1}}), part({name: "Pipe", shape: "cylinder", r: 0.2})]});
  const out = exportI3dAtlas(m, {name: "pump", width: 256, collision: false});
  assert.match(out.i3d, /<Shapes externalShapesFile="pump.i3d.shapes">/);
  assert.equal(count(out.i3d, /<IndexedTriangleSet /g), 0, "no XML meshes");
  assert.ok(out.shapes instanceof Uint8Array && out.shapes.length > 100);
  const back = readShapes(out.shapes);
  assert.equal(back.length, 2);
  assert.equal(back[0].name, "Tank");
  assert.equal(back[0].positions.length, 24 * 3);
  assert.ok(Math.abs(back[0].uv[1] - partAtlasUv(m, m.parts[0], out.layout)[1]) < 1e-3);
  const xml = exportI3dAtlas(m, {name: "pump", width: 256, binary: false, collision: false});
  assert.equal(xml.shapes, null);
  assert.equal(count(xml.i3d, /<IndexedTriangleSet /g), 2);
});

/* shine: the game's specular map is R = smoothness (roughness is 1 - R), G = baked occlusion (1 = none), B = metalness (data/shaders/baseShader.ogsfx getSpecular) */
test("material rows have a smoothness and a metalness, 0 to 1 (0.3 and 0 to start with)", () => {
  const m = sanitize({materials: [mat(1), mat(2, {smoothness: 0.8, metalness: 1}), mat(3, {smoothness: 9, metalness: -2}), mat(4, {smoothness: "x"})]});
  assert.deepEqual(m.materials.map(x => [x.smoothness, x.metalness]), [[0.3, 0], [0.8, 1], [1, 0], [0.3, 0]]);
});

test("layout: the same colour or texture with a different shine is its own row", () => {
  const m = sanitize({materials: [mat(1, {smoothness: 0.2}), mat(2, {smoothness: 0.9}), mat(3, {texture: tex(T1)}), mat(4, {texture: tex(T1), metalness: 1})],
    parts: [part({faces: {px: 1, nx: 2, py: 3, ny: 4}})]});
  const L = atlasLayout(m, {width: 64});
  assert.equal(L.rows.filter(r => r.kind === "color" && r.color === "#cc0000").length, 2);
  assert.equal(L.rows.filter(r => r.kind === "texture").length, 2);
});

test("pixels: the specular of a row is its material's: smoothness in red, no occlusion in green, metalness in blue", () => {
  const m = sanitize({materials: [mat(1, {smoothness: 0.8, metalness: 1}), mat(2, {texture: tex(T1), smoothness: 0.4, metalness: 0.2})], parts: [part({faces: {pz: 1, py: 2}})]});
  const L = atlasLayout(m, {width: 64}), px = atlasPixels(L, load);
  const at = (x, y) => [...px.specular.slice((y * L.width + x) * 4, (y * L.width + x) * 4 + 4)];
  assert.deepEqual(at(2, L.rows.find(r => r.kind === "color" && r.color === "#cc0000").y + 1), [204, 255, 255, 255]);
  assert.deepEqual(at(2, L.rows.find(r => r.kind === "texture").y + 5), [102, 255, 51, 255]);
});

/* collision: a solid shape for each part that has it, so players and vehicles do not walk through the prop */
test("a part has collision unless it is turned off", () => {
  const m = sanitize({parts: [part(), part({collision: false}), part({collision: "no"})]});
  assert.deepEqual(m.parts.map(p => p.collision), [true, false, true]);
});

test("export: a collision shape for every part with collision, placed like the part, in a group of its own beside the visuals", () => {
  const m = sanitize({parts: [part({name: "Tank", x: 2, y: 1, rotY: 30}), part({name: "Sign", collision: false}), part({name: "Pipe", shape: "cylinder"})]});
  const out = exportI3dAtlas(m, {name: "pump", width: 256});
  assert.match(out.i3d, /<TransformGroup name="visuals"/);
  assert.match(out.i3d, /<TransformGroup name="collisions"/);
  const col = [...out.i3d.matchAll(/<Shape name="(collision_[^"]+)"([^>]*)>/g)];
  assert.deepEqual(col.map(c => c[1]), ["collision_Tank", "collision_Pipe"]);
  assert.ok(col.every(c => /static="true"/.test(c[2]) && /collisionFilterGroup="0x3e"/.test(c[2]) && /collisionFilterMask="0xfffffbff"/.test(c[2]) && /nonRenderable="true"/.test(c[2])));
  assert.match(col[0][2], /translation="2 1 0"/);
  const back = readShapes(out.shapes), cs = back.find(s => s.name === "collision_Tank"), vs = back.find(s => s.name === "Tank");
  assert.ok(cs && vs);
  assert.equal(cs.positions.length, vs.positions.length, "the same form as the visible part");
  assert.ok(!cs.tangents || cs.tangents.length === 0, "a mesh the game keeps in memory has no tangents"); assert.ok(vs.tangents && vs.tangents.length > 0, "a drawn one has");
  assert.equal(exportI3dAtlas(m, {name: "pump", width: 256, collision: false}).i3d.includes("collision_"), false);
});

/* fit to face: the picture once over the whole face, for a logo or a sign */
test("a texture set to fit the face covers each face once, whatever its size, and the repeat size is not used", () => {
  const m = sanitize({materials: [mat(1, {texture: {id: T1, meters: 0.1, fit: true}})], parts: [part({w: 4, h: 1, d: 0.2, faces: {pz: 1, py: 1}})]});
  assert.equal(m.materials[0].texture.fit, true);
  const uv = partUv(m, m.parts[0]), ext = (k, f) => { const q = faceUv(uv, f); return [Math.min(...q.map(p => p[k])), Math.max(...q.map(p => p[k]))]; };
  assert.deepEqual([ext(0, FACE.pz), ext(1, FACE.pz)], [[0, 1], [0, 1]]);
  assert.deepEqual([ext(0, FACE.py), ext(1, FACE.py)], [[0, 1], [0, 1]]);
  assert.equal(sanitize({materials: [mat(1, {texture: tex(T1)})]}).materials[0].texture.fit, false, "off by default");
  const L = atlasLayout(m, {width: 256}), row = L.rows.find(r => r.kind === "texture");
  assert.equal(row.tiles, 1);
  const a = faceUv(partAtlasUv(m, m.parts[0], L), FACE.pz), top = 1 - row.y / L.height, bottom = 1 - (row.y + row.h) / L.height;
  assert.ok(a.every(([, v]) => v >= bottom - 1e-9 && v <= top + 1e-9));
  assert.ok(Math.abs(Math.max(...a.map(p => p[1])) - top) < 1e-9 && Math.abs(Math.min(...a.map(p => p[1])) - bottom) < 1e-9, "the whole row from bottom to top");
});

test("fit to face and a quarter turn: the picture is turned, still once over the face", () => {
  const m = setFaceRotation(sanitize({materials: [mat(1, {texture: {id: T1, meters: 1, fit: true}})], parts: [part({faces: {pz: 1}})]}), 1, "pz", 90);
  const q = faceUv(partUv(m, m.parts[0]), FACE.pz);
  assert.deepEqual([Math.min(...q.map(p => p[0])), Math.max(...q.map(p => p[0])), Math.min(...q.map(p => p[1])), Math.max(...q.map(p => p[1]))], [0, 1, 0, 1]);
});
