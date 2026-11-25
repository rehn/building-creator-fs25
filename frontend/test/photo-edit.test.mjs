// Editing a photo before it is made a texture (Lars, 2026-11-25): flip and turn, correct the perspective, retouch, and adjust the colour. Pure functions on pixels
// ({width, height, rgba}), as photoTexture.mjs is: prepareSource does what changes the picture itself, makePhotoTexture the colour on the finished diffuse.
import { test } from "node:test";
import assert from "node:assert/strict";
import { flipTurn, perspective, quadSize, retouch, prepareSource, adjustColor, COLOR_LIMITS } from "../src/editor/photoEdit.mjs";
import { makePhotoTexture } from "../src/editor/photoTexture.mjs";

/** A picture whose pixel (x, y) has red = x * 10 and green = y * 10, so every pixel can be told from the others. */
const grid = (w, h, k = 10) => { const rgba = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rgba.set([x * k, y * k, 0, 255], (y * w + x) * 4); return {width: w, height: h, rgba}; };
const px = (img, x, y) => [...img.rgba.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 3)];
const solid = (w, h, c) => { const rgba = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) rgba.set([...c, 255], i * 4); return {width: w, height: h, rgba}; };

test("flipX mirrors left to right and flipY up to down", () => {
  const g = grid(3, 2);
  const a = flipTurn(g, {flipX: true});
  assert.deepEqual([a.width, a.height], [3, 2]);
  assert.deepEqual(px(a, 0, 0), [20, 0, 0]); assert.deepEqual(px(a, 2, 1), [0, 10, 0]);
  const b = flipTurn(g, {flipY: true});
  assert.deepEqual(px(b, 0, 0), [0, 10, 0]); assert.deepEqual(px(b, 2, 1), [20, 0, 0]);
});

test("a quarter turn is clockwise, and four of them are no turn", () => {
  const g = grid(3, 2), t = flipTurn(g, {turn: 1});
  assert.deepEqual([t.width, t.height], [2, 3], "the sides change places");
  // clockwise: what was at the top left is at the top right; what was at the bottom left is at the top left
  assert.deepEqual(px(t, 1, 0), px(g, 0, 0));
  assert.deepEqual(px(t, 0, 0), px(g, 0, 1));
  assert.deepEqual(px(t, 1, 2), px(g, 2, 0));
  assert.deepEqual(flipTurn(g, {turn: 4}).rgba, g.rgba);
  assert.deepEqual(flipTurn(g, {turn: 2}).rgba, flipTurn(g, {flipX: true, flipY: true}).rgba, "two turns are both flips");
  assert.deepEqual(flipTurn(flipTurn(g, {turn: 1}), {turn: 3}).rgba, g.rgba, "three turns undo one");
  assert.deepEqual(flipTurn(g, {turn: -1}).rgba, flipTurn(g, {turn: 3}).rgba, "a turn the other way");
});

test("nothing to do gives the same picture", () => {
  const g = grid(3, 2);
  assert.equal(flipTurn(g, {}), g);
  assert.equal(prepareSource(g, {}), g);
});

test("the corners of the whole picture are no change of perspective", () => {
  const g = grid(8, 6), q = perspective(g, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  assert.deepEqual([q.width, q.height], [8, 6]);
  for (const [x, y] of [[0, 0], [7, 0], [0, 5], [7, 5], [3, 2]]) assert.deepEqual(px(q, x, y), px(g, x, y), `${x},${y}`);
});

test("a quadrilateral inside the picture is cut out and made upright, its corners where the corners of the result are", () => {
  const g = grid(40, 30, 6);
  // a tilted board: top left, top right, bottom right, bottom left (as fractions of the picture)
  const quad = [[0.1, 0.2], [0.8, 0.1], [0.9, 0.9], [0.2, 0.8]], q = perspective(g, quad);
  assert.ok(q.width > 20 && q.height > 15, `${q.width} x ${q.height}`);
  const at = (u, v) => px(q, Math.min(q.width - 1, Math.floor(u * q.width)), Math.min(q.height - 1, Math.floor(v * q.height)));
  const near = (a, x, y) => Math.abs(a[0] - x * 40 * 6) <= 15 && Math.abs(a[1] - y * 30 * 6) <= 15;   // (red is 6 per source pixel across, green 6 per pixel down: at most 234, so nothing is cut off)
  assert.ok(near(at(0.001, 0.001), 0.1, 0.2), "top left: " + at(0.001, 0.001));
  assert.ok(near(at(0.999, 0.001), 0.8, 0.1), "top right: " + at(0.999, 0.001));
  assert.ok(near(at(0.999, 0.999), 0.9, 0.9), "bottom right: " + at(0.999, 0.999));
  assert.ok(near(at(0.001, 0.999), 0.2, 0.8), "bottom left: " + at(0.001, 0.999));
});

test("the size of the result follows the lengths of the sides of the quadrilateral, and stays within bounds", () => {
  const g = grid(100, 50);
  assert.deepEqual(quadSize(g, [[0, 0], [1, 0], [1, 1], [0, 1]]), [100, 50]);
  assert.deepEqual(quadSize(g, [[0, 0], [0.5, 0], [0.5, 1], [0, 1]]), [50, 50]);
  const [w, h] = quadSize({width: 20000, height: 20000}, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  assert.ok(w * h <= 16e6 && w <= 4096 && h <= 4096, `${w} x ${h}`);
  assert.deepEqual(quadSize(g, [[0.3, 0.3], [0.3, 0.3], [0.3, 0.3], [0.3, 0.3]]), [1, 1], "a point is one pixel");
});

test("a picture of a straight-on board is the same with the quadrilateral of the board", () => {
  // a 60 x 40 picture: the board is the middle (20..40 across, 10..30 down) in red, the rest blue
  const g = solid(60, 40, [0, 0, 255]);
  for (let y = 10; y < 30; y++) for (let x = 20; x < 40; x++) g.rgba.set([255, 0, 0, 255], (y * 60 + x) * 4);
  const q = perspective(g, [[20 / 60, 10 / 40], [40 / 60, 10 / 40], [40 / 60, 30 / 40], [20 / 60, 30 / 40]]);
  assert.deepEqual([q.width, q.height], [20, 20]);
  for (let i = 0; i < q.width * q.height; i++) assert.deepEqual([...q.rgba.slice(i * 4, i * 4 + 3)], [255, 0, 0], "pixel " + i);
});

test("retouch: a clone takes what is at an offset and lays it over the stroke, softly at its edge", () => {
  const g = solid(40, 40, [255, 0, 0]);
  for (let y = 0; y < 40; y++) for (let x = 20; x < 40; x++) g.rgba.set([0, 0, 255, 255], (y * 40 + x) * 4);
  // brush at the middle of the red half (x 0.25), taking from half a picture to the right (blue)
  const out = retouch(g, [{type: "clone", r: 0.1, soft: 0.5, dx: 0.5, dy: 0, points: [[0.25, 0.5]]}]);
  assert.deepEqual(px(out, 10, 20), [0, 0, 255], "the middle of the brush is the other place");
  assert.deepEqual(px(out, 2, 2), [255, 0, 0], "far from the brush nothing changed");
  const edge = px(out, 13, 20);   // (3 pixels from the middle of a brush 4 pixels across)
  assert.ok(edge[0] > 0 && edge[0] < 255, "the edge is a mix: " + edge);
  assert.deepEqual(px(g, 10, 20), [255, 0, 0], "the picture it was given is not changed");
});

test("retouch: paint lays a colour, and a stroke of several points covers the way between them", () => {
  const g = solid(60, 20, [255, 255, 255]);
  const out = retouch(g, [{type: "paint", r: 0.08, soft: 0, color: "#ff0000", points: [[0.1, 0.5], [0.9, 0.5]]}]);
  assert.deepEqual(px(out, 6, 10), [255, 0, 0]);
  assert.deepEqual(px(out, 54, 10), [255, 0, 0]);
  assert.deepEqual(px(out, 30, 10), [255, 0, 0], "between the points too");
  assert.deepEqual(px(out, 30, 0), [255, 255, 255], "outside the stroke not");
});

test("retouch: what is not a usable stroke is left out", () => {
  const g = solid(10, 10, [1, 2, 3]);
  const out = retouch(g, [null, {type: "oops"}, {type: "paint", color: "red", r: 0.1, points: [[0.5, 0.5]]}, {type: "paint", r: -1, color: "#ff0000", points: [[0.5, 0.5]]}, {type: "paint", r: 0.1, color: "#ff0000", points: "x"}]);
  assert.deepEqual(out.rgba, g.rgba);
  assert.equal(retouch(g, []), g);
});

test("prepareSource retouches the picture as it is, then corrects the perspective, then flips and turns", () => {
  const g = grid(8, 6);
  const out = prepareSource(g, {flipX: true, turn: 1});
  assert.deepEqual([out.width, out.height], [6, 8]);
  assert.deepEqual(out.rgba, flipTurn(flipTurn(g, {flipX: true}), {turn: 1}).rgba, "the flip first, then the turn");
  const quad = [[0, 0], [0.5, 0], [0.5, 1], [0, 1]];
  assert.deepEqual([prepareSource(g, {quad}).width, prepareSource(g, {quad}).height], [4, 6]);
  assert.deepEqual([prepareSource(g, {quad, turn: 1}).width, prepareSource(g, {quad, turn: 1}).height], [6, 4], "the quadrilateral first, then the turn");
});

// ---- colour
const flat = (r, g, b) => Float32Array.from([r, g, b]);

test("no adjustment leaves the colours exactly as they were", () => {
  const f = Float32Array.from([10, 100, 250, 255, 0, 33]);
  const before = [...f];
  adjustColor(f, {});
  adjustColor(f, {brightness: 0, contrast: 0, saturation: 0, hue: 0});
  assert.deepEqual([...f], before);
});

test("brightness lifts or lowers, contrast spreads around the middle, saturation 0 and below is towards grey", () => {
  let f = flat(100, 100, 100); adjustColor(f, {brightness: 0.5}); assert.ok(f[0] > 100);
  f = flat(100, 100, 100); adjustColor(f, {brightness: -0.5}); assert.ok(f[0] < 100);
  f = flat(128, 128, 128); adjustColor(f, {contrast: 0.5}); assert.ok(Math.abs(f[0] - 128) < 0.5, "the middle stays");
  f = flat(200, 200, 200); adjustColor(f, {contrast: 0.5}); assert.ok(f[0] > 200, "the light gets lighter");
  f = flat(60, 60, 60); adjustColor(f, {contrast: 0.5}); assert.ok(f[0] < 60, "the dark darker");
  f = flat(200, 100, 50); adjustColor(f, {saturation: -1}); assert.ok(Math.abs(f[0] - f[1]) < 0.01 && Math.abs(f[1] - f[2]) < 0.01, "grey: " + [...f]);
  f = flat(200, 100, 50); const spread = f[0] - f[2]; adjustColor(f, {saturation: 0.5}); assert.ok(f[0] - f[2] > spread, "more colour");
});

test("hue turns round the colour wheel: half a turn takes red to the other side", () => {
  const f = flat(255, 0, 0); adjustColor(f, {hue: 180});
  assert.ok(f[0] < 80 && f[2] > f[0] && f[1] > f[0], "red is not red any more: " + [...f]);
  const g = flat(120, 120, 120); adjustColor(g, {hue: 90});
  assert.ok(Math.abs(g[0] - 120) < 0.5 && Math.abs(g[1] - 120) < 0.5 && Math.abs(g[2] - 120) < 0.5, "grey is the same");
});

test("the limits of the adjustments are what the page's sliders have, and nonsense is kept in them", () => {
  assert.deepEqual(Object.keys(COLOR_LIMITS).sort(), ["brightness", "contrast", "hue", "saturation"]);
  const f = flat(100, 100, 100); adjustColor(f, {brightness: 1e9, contrast: NaN, saturation: "x", hue: Infinity});
  assert.ok(f.every(v => Number.isFinite(v)), [...f].join(" "));
});

test("the colour is on the diffuse only: the relief and the shine are worked out from the picture as it is", () => {
  const img = grid(32, 32);
  const base = makePhotoTexture(img, {size: 64, bump: 2});
  const adj = makePhotoTexture(img, {size: 64, bump: 2, brightness: 0.4, contrast: 0.5, saturation: -0.5, hue: 60});
  assert.deepEqual(adj.normal, base.normal, "same relief");
  assert.deepEqual(adj.specular, base.specular, "same shine");
  assert.notDeepEqual(adj.diffuse, base.diffuse, "another colour");
  assert.deepEqual(makePhotoTexture(img, {size: 64, bump: 2, brightness: 0, contrast: 0, saturation: 0, hue: 0}).diffuse, base.diffuse, "0 is no change");
});
