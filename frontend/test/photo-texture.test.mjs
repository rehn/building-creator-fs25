// Photo -> texture: crop, resize to a power of two, optional seamless, normal and specular maps, DDS files. Synthetic images only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makePhotoTexture, photoTextureDds, nearestPow2, squareCrop, MIN_SIZE, MAX_SIZE } from "../src/editor/photoTexture.mjs";
import { decodeDds } from "../src/editor/dds.mjs";

/** A w x h image whose pixel is f(x, y) -> [r, g, b]. */
function image(w, h, f) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = f(x, y); rgba.set([...c, 255], (y * w + x) * 4); }
  return {width: w, height: h, rgba};
}
const px = (t, x, y) => [...t.slice((y * Math.sqrt(t.length / 4) + x) * 4, (y * Math.sqrt(t.length / 4) + x) * 4 + 4)];

test("nearestPow2 rounds to a power of two inside the limits", () => {
  assert.equal(nearestPow2(1000), 1024);
  assert.equal(nearestPow2(700), 512);
  assert.equal(nearestPow2(1), MIN_SIZE);
  assert.equal(nearestPow2(100000), MAX_SIZE);
  assert.equal(nearestPow2(NaN), 1024);
});

test("the result is a square power of two, with all three maps the same size", () => {
  const t = makePhotoTexture(image(300, 200, (x, y) => [x % 256, y % 256, 128]), {size: 128});
  assert.equal(t.size, 128);
  for (const k of ["diffuse", "normal", "specular"]) {
    assert.ok(t[k] instanceof Uint8ClampedArray, k);
    assert.equal(t[k].length, 128 * 128 * 4, k);
    assert.ok(t[k].every((v, i) => i % 4 !== 3 || v === 255), k + ": opaque");
  }
});

test("a plain colour stays that colour, and its normal map is flat", () => {
  const t = makePhotoTexture(image(64, 64, () => [200, 100, 50]), {size: 64});
  assert.deepEqual(px(t.diffuse, 10, 10), [200, 100, 50, 255]);
  assert.deepEqual(px(t.normal, 10, 10), [128, 128, 255, 255]);
});

test("the crop picks the part of the picture that is used (fractions of the picture)", () => {
  // left half red, right half blue
  const img = image(100, 100, x => x < 50 ? [255, 0, 0] : [0, 0, 255]);
  const right = makePhotoTexture(img, {size: 64, crop: {x: 0.5, y: 0, w: 0.5, h: 1}});
  assert.deepEqual(px(right.diffuse, 3, 3), [0, 0, 255, 255]);
  assert.deepEqual(px(right.diffuse, 60, 60), [0, 0, 255, 255]);
  const left = makePhotoTexture(img, {size: 64, crop: {x: 0, y: 0, w: 0.5, h: 1}});
  assert.deepEqual(px(left.diffuse, 32, 32), [255, 0, 0, 255]);
});

test("a bad crop is clamped into the picture, never throws", () => {
  const img = image(40, 40, () => [10, 20, 30]);
  for (const crop of [{x: -1, y: -1, w: 5, h: 5}, {x: 0.9, y: 0.9, w: 0.5, h: 0.5}, {x: 0, y: 0, w: 0, h: 0}, {x: NaN, y: 0, w: 1, h: 1}]) {
    const t = makePhotoTexture(img, {size: 64, crop});
    assert.deepEqual(px(t.diffuse, 30, 30), [10, 20, 30, 255]);
  }
});

test("downsizing averages the pixels it covers", () => {
  const img = image(256, 256, (x, y) => (x + y) % 2 ? [255, 255, 255] : [0, 0, 0]);   // a checker: the average is mid grey
  const t = makePhotoTexture(img, {size: 64});
  const [r] = px(t.diffuse, 30, 30);
  assert.ok(Math.abs(r - 128) <= 2, "got " + r);
});

test("seamless: the left and right edges meet, much closer than before", () => {
  const img = image(128, 128, x => [x * 2, x * 2, x * 2]);   // a ramp: a hard step where it repeats
  const edge = t => { const n = t.size; let s = 0; for (let y = 0; y < n; y++) s += Math.abs(px(t.diffuse, 0, y)[0] - px(t.diffuse, n - 1, y)[0]); return s / n; };
  const plain = makePhotoTexture(img, {size: 128}), seam = makePhotoTexture(img, {size: 128, seamless: true});
  assert.ok(edge(plain) > 200, "the ramp has a hard step: " + edge(plain));
  assert.ok(edge(seam) < 10, "seamless: " + edge(seam));
  const topBottom = t => { const n = t.size; let s = 0; for (let x = 0; x < n; x++) s += Math.abs(px(t.diffuse, x, 0)[0] - px(t.diffuse, x, n - 1)[0]); return s / n; };
  assert.ok(topBottom(seam) < 10);
});

test("seamless leaves the middle of a picture mostly as it was", () => {
  const img = image(128, 128, (x, y) => [x, y, 0]);
  const a = makePhotoTexture(img, {size: 128}), b = makePhotoTexture(img, {size: 128, seamless: true});
  const d = Math.abs(px(a.diffuse, 64, 64)[0] - px(b.diffuse, 64, 64)[0]);
  assert.ok(d <= 2, "centre moved by " + d);
});

test("the normal map leans away from where the picture is brighter (a ridge)", () => {
  // a bright vertical stripe in the middle: height rises toward it
  const img = image(64, 64, x => Math.abs(x - 32) < 4 ? [255, 255, 255] : [40, 40, 40]);
  const t = makePhotoTexture(img, {size: 64, bump: 3});
  const left = px(t.normal, 24, 32), right = px(t.normal, 40, 32), flat = px(t.normal, 5, 32);
  assert.equal(flat[0], 128);
  const onRamp = px(t.normal, 28, 32), offRamp = px(t.normal, 36, 32);
  assert.ok(onRamp[0] < 128 && offRamp[0] > 128, `x leans opposite ways on the two sides of a ridge (${onRamp[0]}, ${offRamp[0]})`);
  assert.ok(onRamp[2] > 128 && offRamp[2] > 128, "z stays up");
  assert.ok(left && right);
});

test("bump 0 gives a flat normal map; a stronger bump leans further", () => {
  const img = image(64, 64, x => [x * 4, x * 4, x * 4]);
  const flat = makePhotoTexture(img, {size: 64, bump: 0}), weak = makePhotoTexture(img, {size: 64, bump: 1}), strong = makePhotoTexture(img, {size: 64, bump: 4});
  assert.deepEqual(px(flat.normal, 20, 20), [128, 128, 255, 255]);
  assert.ok(Math.abs(px(strong.normal, 20, 20)[0] - 128) > Math.abs(px(weak.normal, 20, 20)[0] - 128));
});

test("the specular map is made from the brightness: not flat for a varied picture, and the same every time", () => {
  const img = image(64, 64, (x, y) => [(x * 7) % 256, (y * 5) % 256, 90]);
  const a = makePhotoTexture(img, {size: 64}), b = makePhotoTexture(img, {size: 64});
  assert.deepEqual(a.specular, b.specular);
  assert.ok(new Set(a.specular.filter((_, i) => i % 4 === 0)).size > 5);
});

test("a see-through picture is made opaque (the game's shader reads alpha as something else)", () => {
  const img = {width: 4, height: 4, rgba: new Uint8ClampedArray(4 * 4 * 4).fill(100)};
  const t = makePhotoTexture(img, {size: 64});
  assert.ok(t.diffuse.every((v, i) => i % 4 !== 3 || v === 255));
});

test("the real size in metres is kept, and a bad one falls back", () => {
  const img = image(16, 16, () => [1, 2, 3]);
  assert.equal(makePhotoTexture(img, {size: 64, meters: 0.5}).meters, 0.5);
  assert.equal(makePhotoTexture(img, {size: 64, meters: -3}).meters, 1);
  assert.equal(makePhotoTexture(img, {size: 64}).meters, 1);
});

test("an empty or broken picture is refused with a message, not a crash", () => {
  assert.throws(() => makePhotoTexture({width: 0, height: 0, rgba: new Uint8ClampedArray(0)}), /picture/i);
  assert.throws(() => makePhotoTexture({width: 4, height: 4, rgba: new Uint8ClampedArray(5)}), /picture/i);
  assert.throws(() => makePhotoTexture(null), /picture/i);
});

test("photoTextureDds writes three DDS files with mips at the texture's size", () => {
  const t = makePhotoTexture(image(64, 64, (x, y) => [x * 4, y * 4, 128]), {size: 64});
  const f = photoTextureDds(t);
  for (const k of ["diffuse", "normal", "specular"]) {
    assert.ok(f[k] instanceof Uint8Array, k);
    const d = decodeDds(f[k]);
    assert.equal(d.width, 64, k); assert.equal(d.height, 64, k);
  }
  const hdr = new DataView(f.diffuse.buffer, f.diffuse.byteOffset);
  assert.equal(hdr.getUint32(28, true), 7, "64 x 64 has 7 mip levels");
});

test("squareCrop: a square window in the picture, from zoom and a centre, kept inside it", () => {
  // zoom 1 = the biggest square (the shorter side), centred
  const full = squareCrop(400, 200, {zoom: 1, cx: 0.5, cy: 0.5});
  assert.deepEqual(full, {x: 0.25, y: 0, w: 0.5, h: 1});
  // zoomed in, in the left top corner, pushed back inside
  const corner = squareCrop(400, 200, {zoom: 0.5, cx: 0, cy: 0});
  assert.deepEqual(corner, {x: 0, y: 0, w: 0.25, h: 0.5});
  const edge = squareCrop(200, 400, {zoom: 0.5, cx: 1, cy: 1});
  assert.deepEqual(edge, {x: 0.5, y: 0.75, w: 0.5, h: 0.25});
  // it is square in pixels
  const c = squareCrop(300, 500, {zoom: 0.7, cx: 0.3, cy: 0.6});
  assert.ok(Math.abs(c.w * 300 - c.h * 500) < 1e-9);
  // nonsense values are clamped
  const odd = squareCrop(100, 100, {zoom: 9, cx: NaN, cy: -3});
  assert.deepEqual(odd, {x: 0, y: 0, w: 1, h: 1});
});

test("rotate straightens a tilted picture: lines sloping down to the right become level", () => {
  const tilt = 3 * Math.PI / 180, period = 20;
  // dark lines every 20 px that slope 3 degrees down to the right
  const img = image(400, 400, (x, y) => ((y - x * Math.tan(tilt)) % period + period) % period < 4 ? [20, 20, 20] : [220, 220, 220]);
  const crop = {x: 0.25, y: 0.25, w: 0.5, h: 0.5};
  const sideways = t => {   // how much each row changes from the left half to the right half
    const n = t.size; let s = 0;
    for (let y = 0; y < n; y++) s += Math.abs(px(t.diffuse, 8, y)[0] - px(t.diffuse, n - 9, y)[0]);
    return s / n;
  };
  const plain = makePhotoTexture(img, {size: 128, crop}), level = makePhotoTexture(img, {size: 128, crop, rotate: 3}), wrong = makePhotoTexture(img, {size: 128, crop, rotate: -3});
  assert.ok(sideways(plain) > 40, "tilted lines differ across the picture: " + sideways(plain));
  assert.ok(sideways(level) < 15, "level after rotating: " + sideways(level));
  assert.ok(sideways(wrong) > sideways(level) + 20, "the wrong way is not level: " + sideways(wrong));
});

test("rotate 0, NaN and a missing value all mean no turn; a big angle is limited", () => {
  const img = image(128, 128, (x, y) => [x * 2, y * 2, 50]);
  const base = makePhotoTexture(img, {size: 64});
  assert.deepEqual(makePhotoTexture(img, {size: 64, rotate: 0}).diffuse, base.diffuse);
  assert.deepEqual(makePhotoTexture(img, {size: 64, rotate: NaN}).diffuse, base.diffuse);
  const big = makePhotoTexture(img, {size: 64, rotate: 500}), limited = makePhotoTexture(img, {size: 64, rotate: 45});
  assert.deepEqual(big.diffuse, limited.diffuse);
});

test("a turned crop that reaches outside the picture still gives a full opaque texture", () => {
  const img = image(100, 100, () => [90, 90, 90]);
  const t = makePhotoTexture(img, {size: 64, rotate: 20, crop: {x: 0, y: 0, w: 1, h: 1}});
  assert.ok(t.diffuse.every((v, i) => i % 4 === 3 ? v === 255 : v === 90));
});

test("flatten removes a left-to-right shading gradient but keeps the stripes", () => {
  // horizontal stripes (period 32) with the light fading 0 -> 80 from left to right
  const img = image(128, 128, (x, y) => { const v = (y % 32) < 6 ? 60 : 140; const s = Math.min(255, v + x * 0.6); return [s, s, s]; });
  const edge = t => { const n = t.size; let s = 0; for (let y = 0; y < n; y++) s += Math.abs(px(t.diffuse, 0, y)[0] - px(t.diffuse, n - 1, y)[0]); return s / n; };
  const plain = makePhotoTexture(img, {size: 128}), flat = makePhotoTexture(img, {size: 128, flatten: 1}), half = makePhotoTexture(img, {size: 128, flatten: 0.5});
  assert.ok(edge(plain) > 60, "the gradient is a step where it repeats: " + edge(plain));
  assert.ok(edge(flat) < 6, "gone: " + edge(flat));
  assert.ok(edge(half) > edge(flat) && edge(half) < edge(plain), "half way");
  // the stripes are still there: rows differ a lot from each other
  assert.ok(px(flat.diffuse, 64, 20)[0] - px(flat.diffuse, 64, 2)[0] > 60, "a stripe is still darker than the gap");
  // the average brightness of a row is kept
  const avg = (t, y) => { let s = 0; for (let x = 0; x < t.size; x++) s += px(t.diffuse, x, y)[0]; return s / t.size; };
  assert.ok(Math.abs(avg(flat, 50) - avg(plain, 50)) < 2);
});

test("flatten 0, NaN and a missing value change nothing; a plain picture stays plain", () => {
  const img = image(64, 64, (x, y) => [x * 3, y * 3, 40]);
  const base = makePhotoTexture(img, {size: 64});
  assert.deepEqual(makePhotoTexture(img, {size: 64, flatten: 0}).diffuse, base.diffuse);
  assert.deepEqual(makePhotoTexture(img, {size: 64, flatten: NaN}).diffuse, base.diffuse);
  const flat = makePhotoTexture(image(64, 64, () => [120, 130, 140]), {size: 64, flatten: 1});
  assert.deepEqual(px(flat.diffuse, 5, 5), [120, 130, 140, 255]);
});
