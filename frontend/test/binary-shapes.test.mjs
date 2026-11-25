// The export can keep the meshes in a binary house.i3d.shapes (as Giants Editor does) instead of as XML in the i3d: setting binaryShapes.
import test from "node:test";
import assert from "node:assert/strict";
import { PRESETS, sanitize, buildI3d, i3dFiles } from "../src/editor/model.mjs";
import { readShapes, OPT } from "../src/editor/shapes.mjs";

const make = (id, extra = {}) => sanitize({...PRESETS.find(x => x.id === id).settings, ...extra});
const text = data => typeof data === "string" ? data : new TextDecoder().decode(data);

test("on to start with; off: one file, the meshes in the XML", () => {
  assert.equal(make("ladugard").binaryShapes, true);
  const files = i3dFiles(make("ladugard", {binaryShapes: false}));
  assert.deepEqual(Object.keys(files), ["house.i3d"]);
  assert.match(files["house.i3d"], /<IndexedTriangleSet /);
  assert.equal(files["house.i3d"], buildI3d(make("ladugard", {binaryShapes: false})));
});

test("on: house.i3d points at house.i3d.shapes and has no meshes of its own", () => {
  const files = i3dFiles(make("ladugard", {binaryShapes: true}));
  assert.deepEqual(Object.keys(files).sort(), ["house.i3d", "house.i3d.shapes"]);
  const xml = files["house.i3d"];
  assert.match(xml, /<Shapes externalShapesFile="house\.i3d\.shapes">/);
  assert.doesNotMatch(xml, /IndexedTriangleSet|<Vertices/);
  assert.ok(files["house.i3d.shapes"] instanceof Uint8Array);
});

test("every shape the scene uses is in the file, with the same id; the rest of the i3d is unchanged", () => {
  for (const id of ["ladugard", "farmhouse", "maskinaffar", "garage", "farhus"]) {
    const on = i3dFiles(make(id, {binaryShapes: true})), off = i3dFiles(make(id, {binaryShapes: false}));
    const used = [...on["house.i3d"].matchAll(/<Shape [^>]*shapeId="(\d+)"/g)].map(m => +m[1]);
    const shapes = readShapes(on["house.i3d.shapes"]);
    assert.deepEqual([...new Set(used)].sort((a, b) => a - b), shapes.map(s => s.id).sort((a, b) => a - b), id);
    // the XML of the off variant, less its meshes, is the XML of the on variant (the Shapes element apart)
    const strip = x => x.replace(/<Shapes[\s\S]*?<\/Shapes>/, "<Shapes/>");
    assert.equal(strip(on["house.i3d"]), strip(off["house.i3d"]), id);
  }
});

test("the meshes are the same ones: positions, uvs and triangles as the XML has them", () => {
  const p = make("ladugard", {binaryShapes: false}), on = i3dFiles({...p, binaryShapes: true}), off = i3dFiles(p);
  const shapes = readShapes(on["house.i3d.shapes"]);
  for (const m of [...off["house.i3d"].matchAll(/<IndexedTriangleSet name="([^"]+)" shapeId="(\d+)"[^>]*>([\s\S]*?)<\/IndexedTriangleSet>/g)]) {
    const s = shapes.find(x => x.id === +m[2]); assert.ok(s, m[1]);
    assert.equal(s.name, m[1]);
    const tris = [...m[3].matchAll(/<t vi="(\d+) (\d+) (\d+)"\/>/g)].flatMap(t => [+t[1], +t[2], +t[3]]);
    assert.deepEqual([...s.indices], tris, m[1]);
    const v = [...m[3].matchAll(/<v p="([^ "]+) ([^ "]+) ([^ "]+)" n="([^ "]+) ([^ "]+) ([^ "]+)" t0="([^ "]+) ([^ "]+)"/g)];
    assert.equal(v.length * 3, s.positions.length, m[1]);
    v.forEach((x, i) => { for (let c = 0; c < 3; c++) assert.ok(Math.abs(s.positions[i * 3 + c] - +x[1 + c]) < 1e-3 && Math.abs(s.normals[i * 3 + c] - +x[4 + c]) < 1e-3, m[1]); });
    v.forEach((x, i) => { for (let c = 0; c < 2; c++) assert.ok(Math.abs(s.uv[i * 2 + c] - +x[7 + c]) < 1e-3, m[1]); });
  }
});

test("collision and triggers are kept in memory (mesh usage 256), what is drawn has tangents", () => {
  const files = i3dFiles(make("ladugard", {binaryShapes: true})), xml = files["house.i3d"], shapes = readShapes(files["house.i3d.shapes"]);
  const nodes = [...xml.matchAll(/<Shape name="([^"]+)"[^>]*shapeId="(\d+)"[^>]*?(nonRenderable="true")?[^>]*\/?>/g)];
  let kept = 0, drawn = 0;
  for (const s of shapes) {
    const usage = s.opts >>> 16;
    if (usage === 256) { kept++; assert.ok(!(s.opts & OPT.tangents), s.name); } else { drawn++; assert.ok(s.opts & OPT.tangents, s.name); assert.equal(usage, 0, s.name); }
  }
  assert.ok(kept >= 1, "the collision mesh");
  assert.ok(drawn >= 3, "walls, roof ...");
  const collision = shapes.find(s => s.name === "collision");
  assert.ok(collision && collision.opts >>> 16 === 256);
  assert.ok(nodes.length > 0);
});


test("the shapes file and the i3d together are well under the XML they replace (about 60 percent)", () => {
  const files = i3dFiles(make("ladugard", {binaryShapes: true})), xml = i3dFiles(make("ladugard", {binaryShapes: false}))["house.i3d"];
  assert.ok(files["house.i3d"].length + files["house.i3d.shapes"].length < xml.length * 0.75, `${files["house.i3d"].length + files["house.i3d.shapes"].length} vs ${xml.length}`);
});

test("with textures the same, and the LOD group is there", () => {
  const files = i3dFiles(make("ladugard", {binaryShapes: true}), {withTex: true});
  assert.match(text(files["house.i3d"]), /name="visuals_lod"/);
  assert.match(text(files["house.i3d"]), /walls_diffuse\.dds/);
});

test("every preset exports with binary shapes and reads back", () => {
  for (const x of PRESETS) {
    const files = i3dFiles(sanitize({...x.settings, binaryShapes: true}));
    assert.ok(readShapes(files["house.i3d.shapes"]).length > 0, x.id);
  }
});
