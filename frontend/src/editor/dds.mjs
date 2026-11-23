// DDS textures for the game. The game warns about PNG textures ("raw format", "CPU mip generation ... please build mips") and builds the
// mips on the CPU as it loads them, so the export writes DDS: DXT1 when the picture is opaque, DXT5 when something in it is see-through,
// the whole mip chain made here (a 2 x 2 average each step). Pure functions, no DOM: rgba is width * height * 4 bytes, not premultiplied.

/** Mip levels from width x height down to 1 x 1. */
export function mipCount(w, h) { let n = 1; while (w > 1 || h > 1) { w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); n++; } return n; }

/** The next mip: each pixel the average of the 2 x 2 above it (the edge repeated for an odd size). */
function halve(w, h, d) {
  const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1), out = new Uint8Array(nw * nh * 4);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) for (let c = 0; c < 4; c++) {
    const x0 = Math.min(w - 1, x * 2), x1 = Math.min(w - 1, x * 2 + 1), y0 = Math.min(h - 1, y * 2), y1 = Math.min(h - 1, y * 2 + 1);
    out[(y * nw + x) * 4 + c] = Math.round((d[(y0 * w + x0) * 4 + c] + d[(y0 * w + x1) * 4 + c] + d[(y1 * w + x0) * 4 + c] + d[(y1 * w + x1) * 4 + c]) / 4);
  }
  return out;
}

const to565 = (r, g, b) => ((r * 31 + 127) / 255 | 0) << 11 | ((g * 63 + 127) / 255 | 0) << 5 | ((b * 31 + 127) / 255 | 0);
const from565 = c => [((c >> 11) & 31) * 255 / 31, ((c >> 5) & 63) * 255 / 63, (c & 31) * 255 / 31];

/** The 4 x 4 block at (bx, by) as 16 pixels [r, g, b, a] (the edge repeated past the picture). */
function blockAt(w, h, d, bx, by) {
  const px = [];
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const i = (Math.min(h - 1, by * 4 + y) * w + Math.min(w - 1, bx * 4 + x)) * 4;
    px.push([d[i], d[i + 1], d[i + 2], d[i + 3]]);
  }
  return px;
}

/** 8 bytes: two 5-6-5 colours (the bounding box of the block, drawn in a little) and 2 bits for each pixel's place between them. */
function colorBlock(px, out, o) {
  const lo = [255, 255, 255], hi = [0, 0, 0];
  for (const p of px) for (let c = 0; c < 3; c++) { if (p[c] < lo[c]) lo[c] = p[c]; if (p[c] > hi[c]) hi[c] = p[c]; }
  const inset = lo.map((l, c) => (hi[c] - l) / 16);
  let c0 = to565(...hi.map((v, c) => v - inset[c])), c1 = to565(...lo.map((v, c) => v + inset[c]));
  if (c0 < c1) [c0, c1] = [c1, c0];
  out[o] = c0 & 255; out[o + 1] = c0 >> 8; out[o + 2] = c1 & 255; out[o + 3] = c1 >> 8;
  if (c0 === c1) { out.fill(0, o + 4, o + 8); return; }   // (one colour: every index 0; equal endpoints would mean the 3-colour mode, which has no index 0 problem)
  const a = from565(c0), b = from565(c1);
  const pal = [a, b, a.map((v, c) => (2 * v + b[c]) / 3), a.map((v, c) => (v + 2 * b[c]) / 3)];
  let bits = 0;
  px.forEach((p, k) => {
    let best = 0, bd = Infinity;
    pal.forEach((q, j) => { const e = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (e < bd) { bd = e; best = j; } });
    bits |= best << (2 * k);
  });
  out[o + 4] = bits & 255; out[o + 5] = (bits >> 8) & 255; out[o + 6] = (bits >> 16) & 255; out[o + 7] = (bits >>> 24) & 255;
}

/** 8 bytes: two alpha values and 3 bits for each pixel (the 8-value mode: a0 > a1, six steps between). */
function alphaBlock(px, out, o) {
  let a0 = 0, a1 = 255;
  for (const p of px) { if (p[3] > a0) a0 = p[3]; if (p[3] < a1) a1 = p[3]; }
  out[o] = a0; out[o + 1] = a1;
  if (a0 === a1) { out.fill(0, o + 2, o + 8); return; }
  const pal = [a0, a1]; for (let k = 2; k < 8; k++) pal.push(((8 - k) * a0 + (k - 1) * a1) / 7);
  let lo = 0, hi = 0;   // (48 bits in two halves of 24: JavaScript's bit operators have 32)
  px.forEach((p, k) => {
    let best = 0, bd = Infinity;
    pal.forEach((q, j) => { const e = Math.abs(p[3] - q); if (e < bd) { bd = e; best = j; } });
    if (k < 8) lo |= best << (3 * k); else hi |= best << (3 * (k - 8));
  });
  out[o + 2] = lo & 255; out[o + 3] = (lo >> 8) & 255; out[o + 4] = (lo >> 16) & 255;
  out[o + 5] = hi & 255; out[o + 6] = (hi >> 8) & 255; out[o + 7] = (hi >> 16) & 255;
}

/** One mip level as blocks. */
function level(w, h, d, alpha) {
  const bw = Math.ceil(w / 4), bh = Math.ceil(h / 4), step = alpha ? 16 : 8, out = new Uint8Array(bw * bh * step);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const px = blockAt(w, h, d, bx, by), o = (by * bw + bx) * step;
    if (alpha) { alphaBlock(px, out, o); colorBlock(px, out, o + 8); } else colorBlock(px, out, o);
  }
  return out;
}

/** A DDS file (Uint8Array) of the picture, with every mip level. DXT5 if any pixel is not opaque, else DXT1. */
export function encodeDds(width, height, rgba) {
  let alpha = false;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 255) { alpha = true; break; }
  const levels = []; let w = width, h = height, d = rgba;
  for (let n = mipCount(width, height), i = 0; i < n; i++) {
    levels.push(level(w, h, d, alpha));
    if (i < n - 1) { d = halve(w, h, d); w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); }
  }
  const head = new Uint8Array(128), v = new DataView(head.buffer);
  head.set([0x44, 0x44, 0x53, 0x20]);                       // "DDS "
  v.setUint32(4, 124, true);
  v.setUint32(8, 0x1 | 0x2 | 0x4 | 0x1000 | 0x20000 | 0x80000, true);   // caps, height, width, pixel format, mip count, linear size
  v.setUint32(12, height, true); v.setUint32(16, width, true);
  v.setUint32(20, levels[0].length, true);
  v.setUint32(28, levels.length, true);
  v.setUint32(76, 32, true); v.setUint32(80, 0x4, true);    // pixel format: a four-character code
  head.set([...(alpha ? "DXT5" : "DXT1")].map(c => c.charCodeAt(0)), 84);
  v.setUint32(108, 0x1000 | 0x8 | 0x400000, true);          // texture, with mips
  const out = new Uint8Array(128 + levels.reduce((s, l) => s + l.length, 0));
  out.set(head); let at = 128; for (const l of levels) { out.set(l, at); at += l.length; }
  return out;
}

/** Is this a DDS file decodeDds can read: the DXT1 or DXT5 the game's textures and ours are made in (not DX10, BC5, 8-bit ...). */
export function ddsReadable(file) {
  return file.length > 128 && String.fromCharCode(...file.slice(0, 4)) === "DDS " && ["DXT1", "DXT5"].includes(String.fromCharCode(...file.slice(84, 88)));
}

/**
 * A level of a DDS file (0 = the full size, 1 = half ... down to the smallest it has) as {width, height, data (RGBA)}: for tests and previews.
 * A smaller level is much quicker to decode, which is all a small picture needs.
 */
export function decodeDds(file, level = 0) {
  const v = new DataView(file.buffer, file.byteOffset, file.byteLength);
  let height = v.getUint32(12, true), width = v.getUint32(16, true);
  const alpha = String.fromCharCode(...file.slice(84, 88)) === "DXT5", step = alpha ? 16 : 8;
  let base = 128;
  const levels = Math.max(1, v.getUint32(28, true));
  for (let l = 0; l < level && l < levels - 1; l++) { base += Math.ceil(width / 4) * Math.ceil(height / 4) * step; width = Math.max(1, width >> 1); height = Math.max(1, height >> 1); }
  const bw = Math.ceil(width / 4);
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const o = base + ((y >> 2) * bw + (x >> 2)) * step, k = (y & 3) * 4 + (x & 3), c = alpha ? o + 8 : o;
    const c0 = file[c] | file[c + 1] << 8, c1 = file[c + 2] | file[c + 3] << 8, a = from565(c0), b = from565(c1);
    const idx = (file[c + 4] | file[c + 5] << 8 | file[c + 6] << 16 | file[c + 7] << 24) >>> (2 * k) & 3;
    const rgb = idx === 0 ? a : idx === 1 ? b : idx === 2 ? a.map((q, i) => (2 * q + b[i]) / 3) : a.map((q, i) => (q + 2 * b[i]) / 3);
    data.set(rgb.map(Math.round), (y * width + x) * 4);
    let al = 255;
    if (alpha) {
      const a0 = file[o], a1 = file[o + 1], bits = [0, 1, 2, 3, 4, 5].reduce((s, i) => s + file[o + 2 + i] * 2 ** (8 * i), 0);
      const i3 = Math.floor(bits / 2 ** (3 * k)) % 8;
      al = i3 === 0 ? a0 : i3 === 1 ? a1 : a0 > a1 ? ((8 - i3) * a0 + (i3 - 1) * a1) / 7 : i3 < 6 ? ((6 - i3) * a0 + (i3 - 1) * a1) / 5 : i3 === 6 ? 0 : 255;
    }
    data[(y * width + x) * 4 + 3] = Math.round(al);
  }
  return {width, height, data};
}
