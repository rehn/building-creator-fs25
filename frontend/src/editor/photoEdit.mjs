// Editing a photo before it is made a texture (Lars, 2026-11-25): flip and turn it, correct its perspective, retouch it, adjust its colour. Pure functions on pixels
// ({width, height, rgba}, rgba a Uint8ClampedArray), no DOM, so they are tested in node (test/photo-edit.test.mjs).
//
// prepareSource does what changes the picture itself, in this order: the retouching (strokes, in fractions of the picture as it was read), the correction of perspective (a
// quadrilateral in the same fractions, made upright), then the flips and the quarter turns. The crop, the straightening and the rest of photoTexture.mjs work on that
// picture. adjustColor is on the finished diffuse only (so that the relief and the shine, which are worked out from the brightness, are of the picture as it is).

const num = (v, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* ---------- flip and turn ---------- */

const flipH = img => {
  const {width: W, height: H, rgba} = img, out = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out.set(rgba.subarray((y * W + x) * 4, (y * W + x) * 4 + 4), (y * W + (W - 1 - x)) * 4);
  return {width: W, height: H, rgba: out};
};
const flipV = img => {
  const {width: W, height: H, rgba} = img, out = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < H; y++) out.set(rgba.subarray(y * W * 4, (y + 1) * W * 4), (H - 1 - y) * W * 4);
  return {width: W, height: H, rgba: out};
};
/** A quarter turn clockwise: what was at the top left is at the top right. */
const turnCw = img => {
  const {width: W, height: H, rgba} = img, out = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < W; y++) for (let x = 0; x < H; x++) out.set(rgba.subarray(((H - 1 - x) * W + y) * 4, ((H - 1 - x) * W + y) * 4 + 4), (y * H + x) * 4);
  return {width: H, height: W, rgba: out};
};

/** The picture flipped left to right (flipX) and up to down (flipY), then turned `turn` quarter turns clockwise (a negative number turns the other way). The picture itself when there is nothing to do. */
export function flipTurn(img, {flipX = false, flipY = false, turn = 0} = {}) {
  const q = ((Math.trunc(num(turn)) % 4) + 4) % 4;
  if (!flipX && !flipY && !q) return img;
  let out = img;
  if (flipX) out = flipH(out);
  if (flipY) out = flipV(out);
  for (let i = 0; i < q; i++) out = turnCw(out);
  return out;
}

/* ---------- perspective ---------- */

const MAX_SIDE = 4096, MAX_AREA = 16e6;
const validQuad = q => Array.isArray(q) && q.length === 4 && q.every(p => Array.isArray(p) && p.length === 2 && p.every(v => typeof v === "number" && Number.isFinite(v)));
const isFullQuad = q => q[0][0] === 0 && q[0][1] === 0 && q[1][0] === 1 && q[1][1] === 0 && q[2][0] === 1 && q[2][1] === 1 && q[3][0] === 0 && q[3][1] === 1;

/** The size of the picture a quadrilateral (top left, top right, bottom right, bottom left, as fractions of img) is made into: the mean of the lengths of its two opposite sides, at most 4096 a side and 16 million pixels. */
export function quadSize(img, quad) {
  const {width: W, height: H} = img, p = quad.map(([x, y]) => [x * W, y * H]), d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  let w = (d(p[0], p[1]) + d(p[3], p[2])) / 2, h = (d(p[0], p[3]) + d(p[1], p[2])) / 2;
  w = Math.min(MAX_SIDE, w); h = Math.min(MAX_SIDE, h);
  if (w * h > MAX_AREA) { const k = Math.sqrt(MAX_AREA / (w * h)); w *= k; h *= k; }
  return [Math.max(1, Math.round(w)), Math.max(1, Math.round(h))];
}

/** The projective map from the unit square (0,0) (1,0) (1,1) (0,1) to the quadrilateral p (4 points): [a b c d e f g h], X = (a u + b v + c) / (g u + h v + 1), Y = (d u + e v + f) / (g u + h v + 1) (Heckbert). */
function squareToQuad(p) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = p;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) return [x1 - x0, x3 - x0, x0, y1 - y0, y3 - y0, y0, 0, 0];
  const den = dx1 * dy2 - dx2 * dy1, g = (dx3 * dy2 - dx2 * dy3) / den, h = (dx1 * dy3 - dx3 * dy1) / den;
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h];
}

/**
 * A photo of something flat taken at an angle, made upright: the part inside the quadrilateral (top left, top right, bottom right, bottom left, as fractions of the picture) is
 * the new picture (bilinear). The picture itself when the quadrilateral is not usable or is the whole picture.
 */
export function perspective(img, quad) {
  if (!validQuad(quad) || isFullQuad(quad)) return img;
  const {width: W, height: H, rgba} = img, [w, h] = quadSize(img, quad), m = squareToQuad(quad.map(([x, y]) => [x * W, y * H]));
  const out = new Uint8ClampedArray(w * h * 4);
  const at = (x, y, c) => rgba[(clamp(y, 0, H - 1) * W + clamp(x, 0, W - 1)) * 4 + c];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x + 0.5) / w, v = (y + 0.5) / h, den = m[6] * u + m[7] * v + 1;
    const sx = (m[0] * u + m[1] * v + m[2]) / den - 0.5, sy = (m[3] * u + m[4] * v + m[5]) / den - 0.5, fx = Math.floor(sx), fy = Math.floor(sy), s = sx - fx, t = sy - fy, o = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) out[o + c] = (at(fx, fy, c) * (1 - s) + at(fx + 1, fy, c) * s) * (1 - t) + (at(fx, fy + 1, c) * (1 - s) + at(fx + 1, fy + 1, c) * s) * t;
    out[o + 3] = 255;
  }
  return {width: w, height: h, rgba: out};
}

/* ---------- retouch ---------- */

const hexRgb = c => [1, 3, 5].map(k => parseInt(c.slice(k, k + 2), 16));
/** A stroke as it is used, or null: {type: "clone" (dx, dy: where it takes from, as fractions of the picture's width and height from the brush) or "paint" (color "#rrggbb"), r (the brush's radius, a share of the shorter side), soft (0 hard edge to 1 all soft), points [[x, y] ...] as fractions of the picture}. */
function cleanStroke(s) {
  if (!s || typeof s !== "object" || (s.type !== "clone" && s.type !== "paint")) return null;
  if (!(typeof s.r === "number" && s.r > 0 && s.r <= 0.5)) return null;
  if (!Array.isArray(s.points) || s.points.length === 0 || !s.points.every(p => Array.isArray(p) && p.length === 2 && p.every(v => typeof v === "number" && Number.isFinite(v)))) return null;
  if (s.type === "paint" && !(typeof s.color === "string" && /^#[0-9a-f]{6}$/i.test(s.color))) return null;
  if (s.type === "clone" && !(Number.isFinite(s.dx) && Number.isFinite(s.dy))) return null;
  return {type: s.type, r: s.r, soft: clamp(num(s.soft, 0.5), 0, 1), points: s.points, dx: s.dx, dy: s.dy, color: s.color};
}

/**
 * The picture retouched: each stroke is a brush that is dragged along its points (the way between two points is filled in) and either copies from a place a fixed distance
 * away (a clone: a stain or a nail is covered with the wall next to it) or lays a colour. A clone takes from the picture as it was when its stroke began. The picture it is given
 * is not changed; the picture itself when there is nothing to do.
 */
export function retouch(img, strokes) {
  const list = (Array.isArray(strokes) ? strokes : []).map(cleanStroke).filter(Boolean);
  if (!list.length) return img;
  const {width: W, height: H} = img, out = new Uint8ClampedArray(img.rgba);
  const side = Math.min(W, H);
  for (const s of list) {
    const from = s.type === "clone" ? new Uint8ClampedArray(out) : null, rad = Math.max(0.5, s.r * side), color = s.type === "paint" ? hexRgb(s.color) : null, step = Math.max(0.5, rad * 0.35);
    const alpha = d => (d >= 1 ? 0 : s.soft <= 1e-6 || d <= 1 - s.soft ? 1 : ((t) => t * t * (3 - 2 * t))((1 - d) / s.soft));
    const stamp = (cx, cy) => {
      const x0 = Math.max(0, Math.floor(cx - rad)), x1 = Math.min(W - 1, Math.ceil(cx + rad)), y0 = Math.max(0, Math.floor(cy - rad)), y1 = Math.min(H - 1, Math.ceil(cy + rad));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const a = alpha(Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / rad);
        if (a <= 0) continue;
        const o = (y * W + x) * 4;
        if (color) { for (let c = 0; c < 3; c++) out[o + c] = out[o + c] * (1 - a) + color[c] * a; }
        else {
          const sx = clamp(Math.round(x + s.dx * W), 0, W - 1), sy = clamp(Math.round(y + s.dy * H), 0, H - 1), so = (sy * W + sx) * 4;
          for (let c = 0; c < 3; c++) out[o + c] = out[o + c] * (1 - a) + from[so + c] * a;
        }
      }
    };
    let prev = null;
    for (const [fx, fy] of s.points) {
      const cx = fx * W, cy = fy * H;
      if (prev) { const n = Math.floor(Math.hypot(cx - prev[0], cy - prev[1]) / step); for (let k = 1; k <= n; k++) stamp(prev[0] + (cx - prev[0]) * k / (n + 1), prev[1] + (cy - prev[1]) * k / (n + 1)); }
      stamp(cx, cy);
      prev = [cx, cy];
    }
  }
  return {width: W, height: H, rgba: out};
}

/** What changes the picture itself, in order: retouch, perspective, flip, turn. {strokes, quad, flipX, flipY, turn}; the picture itself when there is nothing to do. */
export function prepareSource(img, {strokes, quad, flipX, flipY, turn} = {}) {
  let out = retouch(img, strokes);
  out = perspective(out, quad);
  return flipTurn(out, {flipX, flipY, turn});
}

/* ---------- colour ---------- */

/** The ends of the adjustments (the page's sliders have the same): brightness and saturation -1 to 1, contrast -1 to 0.95, hue in degrees. */
export const COLOR_LIMITS = {brightness: [-1, 1], contrast: [-1, 0.95], saturation: [-1, 1], hue: [-180, 180]};
const limited = (k, v) => clamp(num(v), COLOR_LIMITS[k][0], COLOR_LIMITS[k][1]);
/** Whether there is any colour adjustment to make. */
export const hasColorAdjust = ({brightness, contrast, saturation, hue} = {}) => [["brightness", brightness], ["contrast", contrast], ["saturation", saturation], ["hue", hue]].some(([k, v]) => limited(k, v) !== 0);

/**
 * f: colours as 3 floats per pixel (0-255), changed in place: the hue turned round the grey axis, then the saturation (0 is as it was, -1 grey, 1 twice the colour), the brightness (up to half
 * the range) and the contrast (round the middle grey), kept between 0 and 255. Nothing is touched when there is nothing to adjust.
 */
export function adjustColor(f, opts = {}) {
  if (!hasColorAdjust(opts)) return f;
  const b = limited("brightness", opts.brightness), c = limited("contrast", opts.contrast), s = limited("saturation", opts.saturation), h = limited("hue", opts.hue) * Math.PI / 180;
  const cos = Math.cos(h), sin = Math.sin(h), k = Math.tan((c + 1) * Math.PI / 4);
  const m = [0.213 + cos * 0.787 - sin * 0.213, 0.715 - cos * 0.715 - sin * 0.715, 0.072 - cos * 0.072 + sin * 0.928,
    0.213 - cos * 0.213 + sin * 0.143, 0.715 + cos * 0.285 + sin * 0.140, 0.072 - cos * 0.072 - sin * 0.283,
    0.213 - cos * 0.213 - sin * 0.787, 0.715 - cos * 0.715 + sin * 0.715, 0.072 + cos * 0.928 + sin * 0.072];
  for (let i = 0; i < f.length; i += 3) {
    const r = f[i], g = f[i + 1], bl = f[i + 2];
    let R = m[0] * r + m[1] * g + m[2] * bl, G = m[3] * r + m[4] * g + m[5] * bl, B = m[6] * r + m[7] * g + m[8] * bl;
    const gray = 0.299 * R + 0.587 * G + 0.114 * B;
    R = gray + (R - gray) * (1 + s); G = gray + (G - gray) * (1 + s); B = gray + (B - gray) * (1 + s);
    R = (R + b * 128 - 128) * k + 128; G = (G + b * 128 - 128) * k + 128; B = (B + b * 128 - 128) * k + 128;
    f[i] = clamp(R, 0, 255); f[i + 1] = clamp(G, 0, 255); f[i + 2] = clamp(B, 0, 255);
  }
  return f;
}
