// How an imported item is drawn in a list picture: the one picture its i3d uses, and a DDS read at a size that is quick to decode.
import test from "node:test";
import assert from "node:assert/strict";
import { diffuseFiles, normalizeMeta } from "../src/editor/assets.mjs";
import { encodeDds, decodeDds, ddsReadable } from "../src/editor/dds.mjs";
import { ddsPicture } from "../src/editor/itemView.mjs";

const i3d = (materials, shapes, files = `<File fileId="1" filename="textures/cow_diffuse.png"/><File fileId="2" filename="textures/cow_normal.png"/><File fileId="3" filename="$data/shared/x_diffuse.png"/><File fileId="4" filename="textures/b_diffuse.png"/>`) => `<?xml version="1.0"?>
<i3D name="x"><Files>${files}</Files><Materials>${materials}</Materials><Shapes externalShapesFile="x.i3d.shapes"/><Scene>${shapes}</Scene></i3D>`;
const mat = (id, tex, extra = "") => `<Material name="m${id}" materialId="${id}"><Texture fileId="${tex}"/>${extra}</Material>`;

test("diffuseFiles: the item's own picture that the drawn shapes use, once", () => {
  const t = i3d(mat(5, 1, `<Normalmap fileId="2"/>`) + mat(6, 3), `<Shape name="a" shapeId="1" materialIds="5"/><Shape name="b" shapeId="2" materialIds="5"/>`);
  assert.deepEqual(diffuseFiles(t), ["textures/cow_diffuse.png"]);
});

test("diffuseFiles: shapes that are not drawn do not count; the game's own pictures do (the item is then not drawn with one picture)", () => {
  const hidden = i3d(mat(5, 1) + mat(7, 4), `<Shape name="hidden" shapeId="1" materialIds="7" nonRenderable="true"/><Shape name="a" shapeId="2" materialIds="5"/>`);
  assert.deepEqual(diffuseFiles(hidden), ["textures/cow_diffuse.png"], "the collision shape's material is left out");
  const mixed = i3d(mat(5, 1) + mat(6, 3), `<Shape name="a" shapeId="2" materialIds="5 6"/>`);
  assert.deepEqual(diffuseFiles(mixed).sort(), ["$data/shared/x_diffuse.png", "textures/cow_diffuse.png"], "one of its own and one of the game's: two");
});

test("diffuseFiles: two pictures in use are two entries (the item is then drawn grey), none is none", () => {
  const two = i3d(mat(5, 1) + mat(7, 4), `<Shape name="a" shapeId="1" materialIds="5"/><Shape name="b" shapeId="2" materialIds="7"/>`);
  assert.deepEqual(diffuseFiles(two).sort(), ["textures/b_diffuse.png", "textures/cow_diffuse.png"]);
  assert.deepEqual(diffuseFiles(i3d(mat(6, 3), `<Shape name="a" shapeId="1" materialIds="6"/>`)), ["$data/shared/x_diffuse.png"], "only the game's: not a picture we can draw");
  assert.deepEqual(diffuseFiles("<i3D/>"), []);
});

test("normalizeMeta keeps the version of the list picture as a whole number", () => {
  assert.equal(normalizeMeta({iconV: 2}).iconV, 2);
  assert.equal(normalizeMeta({iconV: "2"}).iconV, 0);
  assert.equal(normalizeMeta({}).iconV, 0);
});

const rgba = (w, h, f) => { const d = new Uint8Array(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(f(x, y), (y * w + x) * 4); return d; };

test("decodeDds reads a smaller level of a file with mips; ddsReadable knows the kinds it can read", () => {
  const file = encodeDds(16, 8, rgba(16, 8, () => [200, 100, 50, 255]));
  assert.ok(ddsReadable(file));
  const full = decodeDds(file), half = decodeDds(file, 1), tiny = decodeDds(file, 9);
  assert.deepEqual([full.width, full.height], [16, 8]);
  assert.deepEqual([half.width, half.height], [8, 4]);
  assert.ok(tiny.width >= 1 && tiny.height >= 1, "past the last level it stays on the smallest");
  assert.ok(Math.abs(half.data[0] - full.data[0]) < 12, "the same picture, smaller");
  assert.equal(ddsReadable(new Uint8Array(200)), false);
  assert.equal(ddsReadable(Uint8Array.from("DDS ".split("").map(c => c.charCodeAt(0)))), false);
});

test("ddsPicture: the level that is at most the size asked for, the rows turned so that v goes up", () => {
  // top half red, bottom half blue (a picture's first row is its top)
  const file = encodeDds(64, 64, rgba(64, 64, (x, y) => y < 32 ? [255, 0, 0, 255] : [0, 0, 255, 255]));
  const small = ddsPicture(file, 16);
  assert.equal(small.width, 16);
  assert.ok(small.data[0] < 60 && small.data[2] > 200, "the first row is now the bottom of the picture: blue");
  const last = (small.height - 1) * small.width * 4;
  assert.ok(small.data[last] > 200 && small.data[last + 2] < 60, "and the last is the top: red");
  assert.equal(ddsPicture(file, 256).width, 64, "a picture smaller than the size is kept whole");
  assert.equal(ddsPicture(new Uint8Array(50)), null, "not a DDS the browser can read");
});
