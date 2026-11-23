// GIANTS .i3d.shapes files: the binary geometry the game and Giants Editor prefer to the XML meshes in an i3d (the game warns "i3d contains
// non-binary indexed triangle sets" for the XML ones). The file is scrambled with a stream cipher (the same XOR to write and to read);
// this module has the cipher for one seed, a reader (to test what we write against the layout of the game's own files) and a writer.
// Pure functions, no DOM.
//
// The cipher and the layout of the shape data are a port of I3DShapesTool by Daniel Hultgren (https://github.com/Donkie/I3DShapesTool),
// MIT License, Copyright (c) 2017 Daniel Hultgren: permission is granted, free of charge, to use, copy, modify, merge, publish, distribute,
// sublicense and/or sell copies of the software, provided this notice is kept in all copies or substantial portions. THE SOFTWARE IS PROVIDED
// "AS IS", WITHOUT WARRANTY OF ANY KIND. The layout of versions 9 and 10 (FS25) was found by testing against the game's own files.

import { keyRow } from "./shapesKeys.mjs";

/** The seed byte of the files we write (byte 2 of the header), and its 16 words of the cipher's key table. */
export const SEED = 0xa1;
export const KEY_ROW = [0x6A747471, 0x635F6261, 0x57666866, 0x545E6258, 0x7B6D5C53, 0x88888682, 0x86898987, 0x80808787,
  0x78777C7F, 0x88838E86, 0xCFD4AD76, 0xCFCECED0, 0xD1D3D1D0, 0xD5D5D6D3, 0xD6D6D5D2, 0xD7D6D5D7];

const rol = (v, b) => ((v << b) | (v >>> (32 - b))) >>> 0;
const ror = (v, b) => ((v >>> b) | (v << (32 - b))) >>> 0;
const add = (a, b) => (a + b) >>> 0;
function shuffle1(k, a, b, c, d) {
  k[c] = (k[c] ^ rol(add(k[b], k[a]), 7)) >>> 0;
  k[d] = (k[d] ^ rol(add(k[c], k[a]), 9)) >>> 0;
  k[b] = (k[b] ^ rol(add(k[c], k[d]), 13)) >>> 0;
  k[a] = (k[a] ^ ror(add(k[b], k[d]), 14)) >>> 0;
}
function shuffle2(k, a, b, c, d) {
  k[c] = (k[c] ^ rol(add(k[b], k[a]), 7)) >>> 0;
  k[d] = (k[d] ^ rol(add(k[b], k[c]), 9)) >>> 0;
  k[a] = (k[a] ^ rol(add(k[c], k[d]), 13)) >>> 0;
  k[b] = (k[b] ^ ror(add(k[d], k[a]), 14)) >>> 0;
}

/** The 64 bytes of key stream of block number `counter`, for a row of the key table. */
export function keystream(row, counter) {
  const key = Uint32Array.from(row);
  key[8] = counter >>> 0; key[9] = Math.floor(counter / 4294967296) >>> 0;
  const t = Uint32Array.from(key);
  for (let j = 0; j < 10; j++) {
    shuffle1(t, 0x0, 0xC, 0x4, 0x8); shuffle1(t, 0x5, 0x1, 0x9, 0xD); shuffle1(t, 0xA, 0x6, 0xE, 0x2); shuffle1(t, 0xF, 0xB, 0x3, 0x7);
    shuffle2(t, 0x3, 0x0, 0x1, 0x2); shuffle2(t, 0x4, 0x5, 0x6, 0x7); shuffle1(t, 0xA, 0x9, 0xB, 0x8); shuffle2(t, 0xE, 0xF, 0xC, 0xD);
  }
  const out = new Uint8Array(64), v = new DataView(out.buffer);
  for (let i = 0; i < 16; i++) v.setUint32(4 * i, add(key[i], t[i]), true);
  return out;
}

/**
 * Applies the cipher to the chunks of a file in order. Each chunk (a 4-byte number, a shape's data ...) starts at the beginning of a
 * 64-byte block of the key stream and uses whole blocks (a 4-byte chunk costs a block), as the game's files are made.
 */
export class Cipher {
  constructor(row = KEY_ROW) { this.row = row; this.counter = 0; }
  /** The chunk XORed with the key stream (a new array). */
  apply(bytes) {
    const out = Uint8Array.from(bytes), blocks = Math.ceil(out.length / 64);
    for (let b = 0; b < blocks; b++) {
      const ks = keystream(this.row, this.counter + b);
      for (let i = b * 64; i < out.length && i < b * 64 + 64; i++) out[i] ^= ks[i - b * 64];
    }
    this.counter += blocks;
    return out;
  }
}

/* ---------- Layout of the shape data (versions 9 and 10) ---------- */
// File: [version, 0, seed, 0], then (each number and each shape's data a chunk of the cipher) count, and per entry its type (1 = mesh,
// 2 = spline), the size of its data and the data:
//   name length, name, padding to 4 | id | bounding sphere centre (3 floats), radius | index count, subset count, vertex count, options | 0
//   | per subset: first vertex, vertex count, first index, index count, uv density (a float, one per uv set) | 0
//   | indices (16 bit, or 32 bit past 65536 vertices), padding to 4 | positions | normals | tangents (x, y, z, w) | uvs | colours ... | attribute count
// options: 1 normals, 2 first uv set, 0x80 tangents, and the mesh usage of the XML (meshUsage 256 = CPU Mesh: a mesh the game keeps in memory, for the physics
// and the navigation; the game checks it on a navigation shape) shifted up 16 bits (256 -> 0x1000000; the game own navigation and blocker shapes have 0x1000003). A mesh the physics uses can come with an attribute holding its cooked data: we leave it out, the game cooks it itself.
export const OPT = {normals: 1, uv1: 2, tangents: 0x80};
export const VERSION = 10;
const align4 = n => (4 - n % 4) % 4;

/** A shape's tangents (x, y, z, w per vertex; w = the side the bitangent lies) from its uvs, orthogonal to the normals (Lengyel's method). */
export function tangentsOf(positions, normals, uv, indices) {
  const n = positions.length / 3, tan = new Float64Array(n * 3), bit = new Float64Array(n * 3), out = new Float32Array(n * 4);
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
    const e1 = [0, 1, 2].map(i => positions[b * 3 + i] - positions[a * 3 + i]), e2 = [0, 1, 2].map(i => positions[c * 3 + i] - positions[a * 3 + i]);
    const du1 = uv[b * 2] - uv[a * 2], dv1 = uv[b * 2 + 1] - uv[a * 2 + 1], du2 = uv[c * 2] - uv[a * 2], dv2 = uv[c * 2 + 1] - uv[a * 2 + 1];
    const det = du1 * dv2 - du2 * dv1;
    if (Math.abs(det) < 1e-12) continue;
    const r = 1 / det;
    for (const v of [a, b, c]) for (let i = 0; i < 3; i++) {
      tan[v * 3 + i] += (e1[i] * dv2 - e2[i] * dv1) * r;
      bit[v * 3 + i] += (e2[i] * du1 - e1[i] * du2) * r;
    }
  }
  for (let v = 0; v < n; v++) {
    const N = [normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]], T = [tan[v * 3], tan[v * 3 + 1], tan[v * 3 + 2]], B = [bit[v * 3], bit[v * 3 + 1], bit[v * 3 + 2]];
    const d = N[0] * T[0] + N[1] * T[1] + N[2] * T[2];
    let o = [T[0] - N[0] * d, T[1] - N[1] * d, T[2] - N[2] * d], len = Math.hypot(...o);
    if (len < 1e-9) {   // no uv direction (a stray vertex): any direction across the normal
      o = Math.abs(N[1]) < 0.9 ? [N[2], 0, -N[0]] : [1, 0, 0]; len = Math.hypot(...o) || 1;
    }
    o = o.map(x => x / len);
    const cross = [N[1] * o[2] - N[2] * o[1], N[2] * o[0] - N[0] * o[2], N[0] * o[1] - N[1] * o[0]];
    out.set([...o, cross[0] * B[0] + cross[1] * B[1] + cross[2] * B[2] < 0 ? -1 : 1], v * 4);
  }
  return out;
}

/**
 * The data of one shape. s: {id, name, positions, normals, uv (one set), indices, usage (the XML's meshUsage, 0 for a mesh that is only drawn),
 * tangents (true: write them)}. The bounding sphere is the middle of the box round the vertices and the distance to the farthest one.
 */
function shapeData(s) {
  const nv = s.positions.length / 3, nc = s.indices.length, wide = nv > 65536, tangents = s.tangents ? tangentsOf(s.positions, s.normals, s.uv, s.indices) : null;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < nv; i++) for (let c = 0; c < 3; c++) { const x = s.positions[i * 3 + c]; if (x < lo[c]) lo[c] = x; if (x > hi[c]) hi[c] = x; }
  const centre = nv ? lo.map((l, c) => (l + hi[c]) / 2) : [0, 0, 0];
  let radius = 0;
  for (let i = 0; i < nv; i++) radius = Math.max(radius, Math.hypot(s.positions[i * 3] - centre[0], s.positions[i * 3 + 1] - centre[1], s.positions[i * 3 + 2] - centre[2]));
  // uv density: how many uv units a metre of the surface covers, 1 at most
  let wa = 0, ua = 0;
  for (let t = 0; t < nc; t += 3) {
    const [a, b, c] = [s.indices[t], s.indices[t + 1], s.indices[t + 2]];
    const e1 = [0, 1, 2].map(i => s.positions[b * 3 + i] - s.positions[a * 3 + i]), e2 = [0, 1, 2].map(i => s.positions[c * 3 + i] - s.positions[a * 3 + i]);
    wa += Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]) / 2;
    ua += Math.abs((s.uv[b * 2] - s.uv[a * 2]) * (s.uv[c * 2 + 1] - s.uv[a * 2 + 1]) - (s.uv[c * 2] - s.uv[a * 2]) * (s.uv[b * 2 + 1] - s.uv[a * 2 + 1])) / 2;
  }
  const density = wa > 1e-12 ? Math.min(1, Math.sqrt(ua / wa)) : 1;
  const name = new TextEncoder().encode(s.name || "shape"), opts = (OPT.normals | OPT.uv1 | (tangents ? OPT.tangents : 0) | ((s.usage || 0) << 16)) >>> 0;
  let size = 4 + name.length; size += align4(size);
  size += 4 + 12 + 4 + 16 + 4 + 20 + 4 + nc * (wide ? 4 : 2); size += align4(size);
  size += nv * (12 + 12 + (tangents ? 16 : 0) + 8) + 4;
  const out = new Uint8Array(size), v = new DataView(out.buffer);
  let p = 0;
  const U = x => { v.setUint32(p, x >>> 0, true); p += 4; }, F = x => { v.setFloat32(p, x, true); p += 4; };
  U(name.length); out.set(name, p); p += name.length; p += align4(p);
  U(s.id); centre.forEach(F); F(radius);
  U(nc); U(1); U(nv); U(opts); U(0);
  U(0); U(nv); U(0); U(nc); F(density); U(0);
  for (let i = 0; i < nc; i++) { if (wide) U(s.indices[i]); else { v.setUint16(p, s.indices[i], true); p += 2; } }
  p += align4(p);
  for (let i = 0; i < nv * 3; i++) F(s.positions[i]);
  for (let i = 0; i < nv * 3; i++) F(s.normals[i]);
  if (tangents) for (let i = 0; i < nv * 4; i++) F(tangents[i]);
  for (let i = 0; i < nv * 2; i++) F(s.uv[i]);
  U(0);   // no attributes
  return out;
}

/** A whole .i3d.shapes file of the given shapes (see shapeData), encrypted with SEED (or another seed byte: files from Giants Editor have all kinds). */
export function writeShapes(shapes, seed = SEED) {
  const c = new Cipher(seed === SEED ? KEY_ROW : keyRow(seed)), parts = [Uint8Array.of(VERSION, 0, seed, 0)];
  const num = x => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, x >>> 0, true); return c.apply(b); };
  parts.push(num(shapes.length));
  for (const s of shapes) { const body = shapeData(s); parts.push(num(1), num(body.length), c.apply(body)); }
  const out = new Uint8Array(parts.reduce((n, a) => n + a.length, 0)); let at = 0;
  for (const a of parts) { out.set(a, at); at += a.length; }
  return out;
}

/**
 * Reads a .i3d.shapes file of version 9 or 10 (row: the key table's row of its seed, default the one we write with): [{id, name, centre, radius,
 * opts, subsets, indices, positions, normals, tangents, uv, attributes}]. The seed in the header (byte 2) says which row of the key table the file was scrambled with: any file the game or Giants Editor made can be read. A shape that does not use all its data in the layout above is an error.
 */
export function readShapes(data, row = keyRow(data[2])) {
  if (data[0] < 9) throw new Error(`shapes file version ${data[0]} is not supported`);
  const c = new Cipher(row); let pos = 4;
  const chunk = n => { if (pos + n > data.length) throw new Error("the file ends inside its data"); const out = c.apply(data.subarray(pos, pos + n)); pos += n; return out; };
  const num = () => new DataView(chunk(4).buffer).getUint32(0, true);
  const count = num(), shapes = [];
  for (let i = 0; i < count; i++) {
    const type = num(), size = num(), b = chunk(size);
    if (type !== 1) continue;
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength); let p = 0;
    const U = () => { const x = v.getUint32(p, true); p += 4; return x; }, F = () => { const x = v.getFloat32(p, true); p += 4; return x; };
    const nameLength = U(), name = new TextDecoder().decode(b.subarray(p, p + nameLength)); p += nameLength; p += align4(p);
    const s = {name, id: U(), centre: [F(), F(), F()], radius: F()};
    const nc = U(), nsub = U(), nv = U(); s.opts = U(); U();
    const nuv = [2, 4, 8, 16].filter(f => s.opts & f).length;
    s.subsets = [];
    for (let k = 0; k < nsub; k++) s.subsets.push({first: U(), count: U(), firstIndex: U(), indexCount: U(), density: Array.from({length: nuv}, F)});
    U();
    const wide = nv > 65536;
    s.indices = new Uint32Array(nc);
    for (let k = 0; k < nc; k++) { if (wide) s.indices[k] = U(); else { s.indices[k] = v.getUint16(p, true); p += 2; } }
    p += align4(p);
    const floats = n => { const a = new Float32Array(n); for (let k = 0; k < n; k++) a[k] = F(); return a; };
    s.positions = floats(nv * 3);
    s.normals = s.opts & OPT.normals ? floats(nv * 3) : null;
    s.tangents = s.opts & OPT.tangents ? floats(nv * 4) : null;
    s.uv = floats(nv * 2 * nuv);
    for (const [flag, n] of [[0x20, 16], [0x200, 4]]) if (s.opts & flag) p += n * nv;
    s.attributes = [];
    const natt = U();
    for (let k = 0; k < natt; k++) { const flags = U(); if (flags & 4) p += 12; const len = U(); s.attributes.push({flags, length: len}); p += len; }
    if (p !== b.length) throw new Error(`shape "${name}": the layout does not match (${b.length - p} bytes left)`);
    shapes.push(s);
  }
  return shapes;
}
