// A photo as a game texture: crop, resize to a power of two, optionally seamless, with a normal map and a specular map worked out from the
// brightness (an estimate: good on corrugated metal, planks, plaster), and the three DDS files. Pure functions on pixels (no DOM, no canvas): the
// browser decodes the upload into RGBA and calls makePhotoTexture; what is stored is the finished square, so the server export never decodes a photo.
// A see-through photo is made opaque: the game's shader reads the diffuse's alpha as something else.
import { normalFromHeight } from "./surfaces.mjs";
import { encodeDds } from "./dds.mjs";

export const MIN_SIZE = 64, MAX_SIZE = 2048, DEFAULT_SIZE = 1024;

/** The power of two nearest n (in the log sense), kept between MIN_SIZE and MAX_SIZE; 1024 for a number that is not one. */
export function nearestPow2(n) {
  if (!Number.isFinite(n)) return DEFAULT_SIZE;
  const p = Math.round(Math.log2(Math.max(1, n)));
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, 2 ** p));
}

const clamp01 = (v, d) => Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d;

/** The crop (fractions of the picture) as a pixel rectangle inside it, at least 1 x 1. */
function cropRect(W, H, crop = {}) {
  const x = clamp01(crop.x, 0), y = clamp01(crop.y, 0);
  const w = clamp01(crop.w, 1), h = clamp01(crop.h, 1);
  const x0 = Math.min(W - 1, Math.floor(x * W)), y0 = Math.min(H - 1, Math.floor(y * H));
  return {x0, y0, w: Math.max(1, Math.min(W - x0, Math.round(w * W))), h: Math.max(1, Math.min(H - y0, Math.round(h * H)))};
}

/** For each of d output pixels the source pixels and weights: the average of what it covers going down, linear going up. */
function weights(s, d) {
  const out = [];
  for (let i = 0; i < d; i++) {
    if (s >= d) {
      const a = i * s / d, b = (i + 1) * s / d, idx = [], w = [];
      for (let k = Math.floor(a); k < Math.min(s, Math.ceil(b)); k++) { idx.push(k); w.push(Math.min(b, k + 1) - Math.max(a, k)); }
      out.push({idx, w: w.map(v => v / (b - a))});
    } else {
      const c = (i + 0.5) * s / d - 0.5, k = Math.floor(c), f = c - k, k0 = Math.max(0, k), k1 = Math.min(s - 1, k + 1);
      out.push({idx: [k0, k1], w: [1 - f, f]});
    }
  }
  return out;
}

/** The crop of rgba resized to n x n as 3 floats per pixel (0-255). */
function resample(img, r, n) {
  const {width: W, rgba} = img, wx = weights(r.w, n), wy = weights(r.h, n);
  const tmp = new Float32Array(r.h * n * 3);   // r.h rows, n columns
  for (let y = 0; y < r.h; y++) for (let x = 0; x < n; x++) {
    let a = 0, b = 0, c = 0; const {idx, w} = wx[x];
    for (let k = 0; k < idx.length; k++) { const i = ((r.y0 + y) * W + r.x0 + idx[k]) * 4; a += rgba[i] * w[k]; b += rgba[i + 1] * w[k]; c += rgba[i + 2] * w[k]; }
    tmp.set([a, b, c], (y * n + x) * 3);
  }
  const out = new Float32Array(n * n * 3);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let a = 0, b = 0, c = 0; const {idx, w} = wy[y];
    for (let k = 0; k < idx.length; k++) { const i = (idx[k] * n + x) * 3; a += tmp[i] * w[k]; b += tmp[i + 1] * w[k]; c += tmp[i + 2] * w[k]; }
    out.set([a, b, c], (y * n + x) * 3);
  }
  return out;
}

export const MAX_ROTATE = 45;

/** The crop turned by `deg` (positive: the window tilts down to the right, which levels lines that slope down to the right) about its middle,
 *  as an image of its own (bilinear; outside the picture the edge is repeated), at most 2 * n pixels a side so the later shrinking is cheap. */
function turnedWindow(img, r, deg, n) {
  const m = Math.max(1, Math.min(Math.round(Math.max(r.w, r.h)), 2 * n)), a = deg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const {width: W, height: H, rgba} = img, out = new Uint8ClampedArray(m * m * 4), cx = r.x0 + r.w / 2, cy = r.y0 + r.h / 2;
  const at = (x, y, c) => rgba[(Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))) * 4 + c];
  for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) {
    const dx = ((x + 0.5) / m - 0.5) * r.w, dy = ((y + 0.5) / m - 0.5) * r.h;
    const sx = cx + dx * ca - dy * sa - 0.5, sy = cy + dx * sa + dy * ca - 0.5, fx = Math.floor(sx), fy = Math.floor(sy), u = sx - fx, v = sy - fy, o = (y * m + x) * 4;
    for (let c = 0; c < 3; c++) out[o + c] = (at(fx, fy, c) * (1 - u) + at(fx + 1, fy, c) * u) * (1 - v) + (at(fx, fy + 1, c) * (1 - u) + at(fx + 1, fy + 1, c) * u) * v;
    out[o + 3] = 255;
  }
  return {width: m, height: m, rgba: out};
}

/** Make the picture repeat without a seam: blend it with itself moved half a picture both ways, weighted so the edges are all the moved copy
 *  (which is continuous across the wrap) and the middle all the original. */
function makeSeamless(f, n) {
  const out = new Float32Array(f.length);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const wx = 1 - Math.abs(2 * (x + 0.5) / n - 1), wy = 1 - Math.abs(2 * (y + 0.5) / n - 1), w = wx * wy;
    const j = (y * n + x) * 3, k = (((y + n / 2) % n) * n + (x + n / 2) % n) * 3;
    for (let c = 0; c < 3; c++) out[j + c] = f[j + c] * w + f[k + c] * (1 - w);
  }
  return out;
}

/** Take the left-to-right shading out of each row (the straight-line trend of its brightness, per colour), `amount` 0-1, keeping the row's average:
 *  a photo of something round is lighter on one side, which shows as a step where the texture repeats. Horizontal bands are not touched. */
function flattenLight(f, n, amount) {
  const mid = (n - 1) / 2, sxx = (n * (n * n - 1)) / 12;
  for (let y = 0; y < n; y++) for (let c = 0; c < 3; c++) {
    let sxy = 0;
    for (let x = 0; x < n; x++) sxy += (x - mid) * f[(y * n + x) * 3 + c];
    const slope = sxy / sxx;
    for (let x = 0; x < n; x++) f[(y * n + x) * 3 + c] -= amount * slope * (x - mid);
  }
}

const luma = (f, i) => (0.299 * f[i * 3] + 0.587 * f[i * 3 + 1] + 0.114 * f[i * 3 + 2]) / 255;
const byte = v => Math.min(255, Math.max(0, Math.round(v)));

/**
 * A picture with see-through parts laid over a colour (a logo with no background: the empty pixels are black in the data, so left alone they would be a black box). The
 * picture itself when it is opaque. background: "#rrggbb", white if it is not one.
 */
const backgroundRgb = c => /^#[0-9a-f]{6}$/i.test(c) ? [1, 3, 5].map(k => parseInt(c.slice(k, k + 2), 16)) : [255, 255, 255];
function overBackground(img, background) {
  let see = false;
  for (let i = 3; i < img.rgba.length; i += 4) if (img.rgba[i] < 255) { see = true; break; }
  if (!see) return img;
  const bg = backgroundRgb(background);
  const out = new Uint8ClampedArray(img.rgba.length);
  for (let i = 0; i < img.rgba.length; i += 4) {
    const a = img.rgba[i + 3] / 255;
    for (let c = 0; c < 3; c++) out[i + c] = img.rgba[i + c] * a + bg[c] * (1 - a);
    out[i + 3] = 255;
  }
  return {...img, rgba: out};
}

/**
 * img: {width, height, rgba}. opts: size (output side, rounded to a power of two, default 1024), crop {x, y, w, h} as fractions of the picture,
 * rotate (degrees, -45 to 45: straighten a photo taken at an angle; positive levels lines that slope down to the right),
 * flatten (0-1: take out the left-to-right shading, so a photo lit from one side repeats without a step),
 * seamless (blend the edges so it repeats), background (a colour for see-through parts, default white), margin (0 to 0.45: the picture is shrunk to leave this share of the square free on every side, in the background colour), bump (normal map strength, 0 = flat, default 2), meters (the real side of the texture in metres, default 1).
 * -> {size, meters, diffuse, normal, specular}: Uint8ClampedArray size * size * 4 each, opaque.
 * Specular channels are an assumption (R shine from brightness, G a fixed level, B 255); check them against the game's own maps.
 */
export function makePhotoTexture(img, {size = DEFAULT_SIZE, crop, rotate = 0, flatten = 0, seamless = false, bump = 2, meters = 1, background = "#ffffff", margin = 0} = {}) {
  if (!img || !(img.width > 0) || !(img.height > 0) || !img.rgba || img.rgba.length !== img.width * img.height * 4) throw new Error("That is not a usable picture.");
  img = overBackground(img, background);
  const n = nearestPow2(size), r = cropRect(img.width, img.height, crop);
  const deg = Number.isFinite(rotate) ? Math.max(-MAX_ROTATE, Math.min(MAX_ROTATE, rotate)) : 0;
  const edge = Number.isFinite(margin) ? Math.max(0, Math.min(0.45, margin)) : 0;
  // a margin: the picture shrunk into the middle of the square, the rest the background colour (a sign: the logo with the board round it)
  const inner = edge > 0 ? Math.max(1, Math.round(n * (1 - 2 * edge))) : n;
  let f = deg && !edge ? resample(turnedWindow(img, r, deg, n), {x0: 0, y0: 0, w: Math.max(1, Math.min(Math.round(Math.max(r.w, r.h)), 2 * n)), h: Math.max(1, Math.min(Math.round(Math.max(r.w, r.h)), 2 * n))}, n) : resample(img, r, inner);
  if (edge > 0) {
    const bg = backgroundRgb(background), g = new Float32Array(n * n * 3), o = Math.floor((n - inner) / 2);
    for (let i = 0; i < n * n; i++) g.set(bg, i * 3);
    for (let y = 0; y < inner; y++) g.set(f.subarray(y * inner * 3, (y + 1) * inner * 3), ((y + o) * n + o) * 3);
    f = g;
  }
  if (flatten > 0) flattenLight(f, n, Math.min(1, flatten));
  if (seamless) f = makeSeamless(f, n);
  const H = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) H[i] = luma(f, i);
  const strength = (Number.isFinite(bump) ? Math.max(0, Math.min(10, bump)) : 2) * 8;
  const nrm = strength > 0 ? normalFromHeight(H, n, strength) : null;
  const diffuse = new Uint8ClampedArray(n * n * 4), normal = new Uint8ClampedArray(n * n * 4), specular = new Uint8ClampedArray(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    const o = i * 4;
    diffuse[o] = byte(f[i * 3]); diffuse[o + 1] = byte(f[i * 3 + 1]); diffuse[o + 2] = byte(f[i * 3 + 2]); diffuse[o + 3] = 255;
    if (nrm) { normal[o] = byte((nrm[i * 3] * 0.5 + 0.5) * 255); normal[o + 1] = byte((nrm[i * 3 + 1] * 0.5 + 0.5) * 255); normal[o + 2] = byte((nrm[i * 3 + 2] * 0.5 + 0.5) * 255); }
    else { normal[o] = 128; normal[o + 1] = 128; normal[o + 2] = 255; }
    normal[o + 3] = 255;
    specular[o] = byte(40 + 180 * H[i]); specular[o + 1] = 90; specular[o + 2] = 255; specular[o + 3] = 255;
  }
  return {size: n, meters: Number.isFinite(meters) && meters > 0 ? meters : 1, diffuse, normal, specular};
}

/** The three maps as DDS files with mips ({diffuse, normal, specular}: Uint8Array). */
export function photoTextureDds(t) {
  const out = {};
  for (const k of ["diffuse", "normal", "specular"]) out[k] = encodeDds(t.size, t.size, t[k]);
  return out;
}

/**
 * The crop for a square window in a W x H picture, for makePhotoTexture's `crop`: zoom 1 is the biggest square (the shorter side), smaller
 * zooms in; (cx, cy) is its centre as fractions of the picture, pushed back so the window stays inside.
 */
export function squareCrop(W, H, {zoom = 1, cx = 0.5, cy = 0.5} = {}) {
  const z = Number.isFinite(zoom) ? Math.min(1, Math.max(0.05, zoom)) : 1, side = z * Math.min(W, H);
  const w = side / W, h = side / H;
  const at = (c, len) => Math.min(1 - len, Math.max(0, (Number.isFinite(c) ? c : 0.5) - len / 2));
  return {x: at(cx, w), y: at(cy, h), w, h};
}
