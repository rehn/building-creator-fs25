// DDS textures for the game: DXT1 (opaque) or DXT5 (with alpha), the whole mip chain, so the game does not build mips on the CPU.
import test from "node:test";
import assert from "node:assert/strict";
import { encodeDds, decodeDds, mipCount } from "../src/editor/dds.mjs";

const image = (w, h, f) => { const d = new Uint8Array(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(f(x, y), (y * w + x) * 4); return d; };
const u32 = (b, o) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24) >>> 0;
const fourcc = b => String.fromCharCode(...b.slice(84, 88));

test("mipCount: down to 1 x 1", () => {
  assert.equal(mipCount(1, 1), 1);
  assert.equal(mipCount(256, 256), 9);
  assert.equal(mipCount(1024, 1024), 11);
  assert.equal(mipCount(64, 16), 7);
});

test("header: DDS, size, mip count, DXT1 when opaque", () => {
  const dds = encodeDds(64, 32, image(64, 32, () => [200, 100, 50, 255]));
  assert.equal(String.fromCharCode(...dds.slice(0, 4)), "DDS ");
  assert.equal(u32(dds, 4), 124);
  assert.equal(u32(dds, 12), 32, "height");
  assert.equal(u32(dds, 16), 64, "width");
  assert.equal(u32(dds, 28), 7, "mip count");
  assert.equal(fourcc(dds), "DXT1");
  assert.ok((u32(dds, 108) & 0x400000) !== 0, "caps: mipmap");
  // 8 bytes per 4x4 block, every mip down to 1x1 (one block each below 4 px)
  let size = 0; for (let w = 64, h = 32; ; w = Math.max(1, w >> 1), h = Math.max(1, h >> 1)) { size += Math.ceil(w / 4) * Math.ceil(h / 4) * 8; if (w === 1 && h === 1) break; }
  assert.equal(dds.length, 128 + size);
});

test("DXT5 when something is see-through (16 bytes per block)", () => {
  const dds = encodeDds(16, 16, image(16, 16, (x) => [10, 20, 30, x < 8 ? 255 : 80]));
  assert.equal(fourcc(dds), "DXT5");
  let size = 0; for (let w = 16; ; w = Math.max(1, w >> 1)) { size += Math.ceil(w / 4) ** 2 * 16; if (w === 1) break; }
  assert.equal(dds.length, 128 + size);
});

test("a solid colour comes back (within what 5-6-5 bits allow)", () => {
  const img = image(8, 8, () => [180, 120, 60, 255]), back = decodeDds(encodeDds(8, 8, img));
  assert.equal(back.width, 8);
  for (let i = 0; i < 64; i++) for (let c = 0; c < 3; c++) assert.ok(Math.abs(back.data[i * 4 + c] - img[i * 4 + c]) <= 8, `pixel ${i} channel ${c}`);
});

test("a gradient and noise stay close (mean error)", () => {
  let s = 1; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (const [name, f, limit] of [
    ["gradient", (x, y) => [x * 4, y * 4, 128, 255], 6],
    ["grain", (x, y) => { const v = 120 + 40 * Math.sin(x * 0.9) + rnd() * 20; return [v, v * 0.8, v * 0.6, 255]; }, 14],
  ]) {
    const img = image(64, 64, f), back = decodeDds(encodeDds(64, 64, img));
    let e = 0; for (let i = 0; i < img.length; i += 4) for (let c = 0; c < 3; c++) e += Math.abs(back.data[i + c] - img[i + c]);
    assert.ok(e / (64 * 64 * 3) < limit, `${name}: ${(e / (64 * 64 * 3)).toFixed(1)}`);
  }
});

test("alpha is kept in DXT5", () => {
  const img = image(8, 8, (x) => [90, 90, 90, x < 4 ? 255 : 100]), back = decodeDds(encodeDds(8, 8, img));
  for (let i = 0; i < 64; i++) assert.ok(Math.abs(back.data[i * 4 + 3] - img[i * 4 + 3]) <= 4, `alpha ${i}`);
});

test("sizes that are not a multiple of 4, and 1 x 1, do not break", () => {
  for (const [w, h] of [[1, 1], [2, 2], [6, 10], [3, 7]]) {
    const dds = encodeDds(w, h, image(w, h, (x, y) => [x * 30, y * 20, 7, 255]));
    assert.equal(u32(dds, 16), w); assert.equal(u32(dds, 28), mipCount(w, h));
  }
});

test("the mip chain is averaged (the smallest mip is the mean colour)", () => {
  const dds = encodeDds(4, 4, image(4, 4, (x) => (x < 2 ? [0, 0, 0, 255] : [200, 200, 200, 255])));
  const last = dds.slice(dds.length - 8), c0 = last[0] | (last[1] << 8);
  assert.ok(Math.abs(((c0 >> 11) & 31) * 255 / 31 - 100) < 12, "about half way");
});
