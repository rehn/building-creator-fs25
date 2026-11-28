// The modeller can draw with the building's own surfaces (concrete, boards, galvanised steel ...), made by the same code as the buildings' textures. Pure, no DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SURFACES } from "../src/editor/surfaces.mjs";
import { SURFACE_TEXTURES, surfaceTextureId, parseSurfaceTextureId, surfaceTextureMeters, surfaceTextureMaps } from "../src/builder/surfaceTextures.mjs";
import { sanitize } from "../src/builder/model.mjs";
import { atlasLayout, atlasPixels } from "../src/builder/atlas.mjs";

test("every surface of the buildings is offered, once, with a name", () => {
  assert.deepEqual(SURFACE_TEXTURES.map(s => s.kind).sort(), Object.keys(SURFACES).sort());
  for (const s of SURFACE_TEXTURES) assert.ok(typeof s.label === "string" && s.label.length > 1, s.kind);
  assert.equal(new Set(SURFACE_TEXTURES.map(s => s.label)).size, SURFACE_TEXTURES.length);
});

test("the id says the surface and the colour, and a material row keeps it as a texture", () => {
  for (const {kind} of SURFACE_TEXTURES) {
    const id = surfaceTextureId(kind, "#9AA3a8");
    assert.match(id, /^[a-z0-9]{1,64}$/);
    assert.deepEqual(parseSurfaceTextureId(id), {kind, color: "#9aa3a8"});
    const m = sanitize({materials: [{id: 1, texture: {id, meters: 1}}]});
    assert.equal(m.materials[0].texture.id, id, kind);
  }
});

test("ids that are not a surface are not read as one", () => {
  for (const id of ["", "abcdefghijklmnop", "sysconcrete", "sysconcretezzzzzz", "sysnothing9aa3a8", "sysconcrete9aa3a8x", "xsysconcrete9aa3a8"]) assert.equal(parseSurfaceTextureId(id), null, id);
  assert.equal(surfaceTextureMaps("abcdefghijklmnop"), null);
});

test("the maps are the surface's own size, opaque, and the colour tints the picture", () => {
  const red = surfaceTextureMaps(surfaceTextureId("galv", "#ff0000")), blue = surfaceTextureMaps(surfaceTextureId("galv", "#0000ff"));
  const N = SURFACES.galv.px;
  assert.equal(red.size, N);
  assert.equal(red.diffuse.length, N * N * 4);
  assert.equal(red.normal.length, N * N * 4);
  const mean = (a, c) => { let s = 0; for (let i = c; i < a.length; i += 4) s += a[i]; return s / (a.length / 4); };
  assert.ok(mean(red.diffuse, 0) > 100 && mean(red.diffuse, 2) === 0, "red has red and no blue");
  assert.ok(mean(blue.diffuse, 2) > 100 && mean(blue.diffuse, 0) === 0);
  for (let i = 3; i < red.diffuse.length; i += 4 * 997) assert.equal(red.diffuse[i], 255);
  assert.ok(mean(red.normal, 2) > 200, "normals point out of the surface");
});

test("one repeat is as big as the surface is in a building (the square of its two sides: the maps are square)", () => {
  assert.equal(surfaceTextureMeters("concrete"), 2.4);
  assert.equal(surfaceTextureMeters("timber"), 1.2);
});

test("the atlas of a prop made of a surface has the surface in it", () => {
  const id = surfaceTextureId("concrete", "#808080");
  const m = sanitize({materials: [{id: 1, texture: {id, meters: 2.4}}], parts: [{shape: "box", faces: {pz: 1}}]});
  const layout = atlasLayout(m, {width: 256}), px = atlasPixels(layout, i => surfaceTextureMaps(i));
  const r = layout.rows.find(x => x.kind === "texture");
  assert.ok(r, "a texture row");
  const seen = new Set(); for (let x = 0; x < 256; x++) seen.add(px.diffuse[((r.y + 3) * 256 + x) * 4]);
  assert.ok(seen.size > 3, "not flat grey");
});
