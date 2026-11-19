// The surface textures as plain pixels (no canvas), and the list of texture files a building's i3d refers to.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compose, genBase, fitBase, baseFor, textureFiles, TEX } from "../src/editor/textures.mjs";
import { sanitize, buildGeometry, i3dFiles, matTexture, seeThroughGlass, PRESETS } from "../src/editor/model.mjs";
import { MASK_RGB } from "../src/editor/age.mjs";

test("compose paints the shade map in the colour, and marks in their own", () => {
  const S = new Float32Array([1, 0.5, 1, 2]), Mk = new Uint8Array([0, 0, 1, 0]);
  const px = compose(S, "#336699", Mk, 2);
  assert.ok(px instanceof Uint8ClampedArray && px.length === 2 * 2 * 4);
  assert.deepEqual([...px.slice(0, 4)], [51, 102, 153, 255]);
  assert.deepEqual([...px.slice(4, 8)], [26, 51, 76, 255]);
  assert.deepEqual([...px.slice(8, 12)], [...MASK_RGB[1], 255]);   // a mark: its own colour
  assert.deepEqual([...px.slice(12, 16)], [102, 204, 255, 255]);  // clamped
});

test("every wall and roof surface gives a shade map and a normal map as pixels, the same every time", () => {
  for (const kind of ["lockpanel", "plaster", "tiles", "seamed"]) {
    const spec = {kind, n: 16, bw: 0.5, age: 0}, a = genBase(spec), b = genBase(spec);
    assert.equal(a.N, TEX, kind);
    assert.equal(a.S.length, TEX * TEX, kind);
    assert.ok(a.normal instanceof Uint8ClampedArray && a.normal.length === TEX * TEX * 4, kind);
    assert.ok(a.normal.every((v, i) => i % 4 !== 3 || v === 255), kind + ": opaque");
    assert.deepEqual(a.normal.slice(0, 4000), b.normal.slice(0, 4000), kind + ": the same every time");
    assert.ok(new Set(a.normal.slice(0, 40000)).size > 3, kind + ": not flat");
  }
});

test("an inside surface has a normal map and a grey map for the preview", () => {
  const b = fitBase("concrete", 0, false);
  assert.ok(b.normal instanceof Uint8ClampedArray && b.grey instanceof Uint8ClampedArray);
  assert.equal(b.normal.length, b.N * b.N * 4);
  assert.equal(fitBase("concrete", 0, false), b, "kept");
});

/** The texture files the i3d refers to. */
const referenced = p => [...i3dFiles(p, { withTex: true })["house.i3d"].matchAll(/filename="([^"]*\.dds)"/g)].map(m => m[1]);

test("every texture the i3d refers to is made, apart from the room atlas and the glass", () => {
  for (const [name, settings] of [["a house", { kind: "house" }], ...Object.entries(PRESETS).filter(([k]) => /^(house|shed|chicken|cow)/.test(k)).slice(0, 4).map(([k, v]) => [k, v])]) {
    const p = sanitize(settings), files = textureFiles(p, buildGeometry(p).G), have = new Set(files.map(f => f.path));
    const extra = new Set([matTexture("interior").diffuse, matTexture("glass").diffuse]);
    for (const path of referenced(p)) assert.ok(have.has(path) || extra.has(path), `${name}: ${path} is referred to but not made`);
    for (const f of files) {
      assert.match(f.path, /^textures\/.+\.dds$/, name);
      assert.ok(f.width > 0 && f.pixels().length === f.width * f.height * 4, `${f.path}: ${f.pixels().length} bytes for ${f.width} x ${f.height}`);
    }
    assert.equal(have.size, files.length, name + ": no file twice");
  }
});

test("the same surface is made once: two houses with the same boards share their normal map, and differ in colour", () => {
  const a = sanitize({ kind: "house", wallColor: "#8E2A1E" }), b = sanitize({ kind: "house", wallColor: "#E8D9B0" });
  const fa = textureFiles(a, buildGeometry(a).G), fb = textureFiles(b, buildGeometry(b).G);
  const wall = fs => ({ d: fs.find(f => f.path === matTexture("walls").diffuse), n: fs.find(f => f.path === matTexture("walls").normal) });
  assert.ok(wall(fa).d && wall(fa).n);
  assert.equal(wall(fa).n.pixels(), wall(fb).n.pixels(), "the normal map is the same array");
  assert.equal(wall(fa).n.key, wall(fb).n.key);
  assert.notEqual(wall(fa).d.key, wall(fb).d.key);
  assert.notDeepEqual([...wall(fa).d.pixels().slice(0, 4)], [...wall(fb).d.pixels().slice(0, 4)]);
  assert.equal(baseFor({ kind: "plaster", n: 1, bw: 1, age: 0 }), baseFor({ kind: "plaster", n: 1, bw: 1, age: 0 }));
});

test("a material nothing is drawn in has no texture", () => {
  const p = sanitize({ kind: "house" }), G = buildGeometry(p).G, files = textureFiles(p, { ...G, chimney: { i: [] } });
  assert.ok(!files.some(f => f.path === matTexture("chimney").diffuse));
  assert.ok(seeThroughGlass(p) !== undefined);
});
