// The surface textures of a building as plain pixels (RGBA, Uint8ClampedArray): no DOM, so the web server can make the files too
// (PLAN_OSM.md, step 2). The editor turns them into canvases for three.js (editor.mjs); both use textureFiles() for the files of a mod.
//
//   genBase(spec)            the shade map S, marks Mk and the normal map of a wall/roof/trim surface (surfaceSpec in model.mjs)
//   fitBase(kind, age, out)  the same for an inside surface (surfaces.mjs), with a grey map for the preview
//   compose(S, hex, Mk, N)   the diffuse texture: the shade map in a colour
//   textureFiles(p, G)       every texture the building's i3d refers to, except the room atlas and the glass (they are painted on a canvas)
import { SURFACES, paintSurface, normalFromHeight } from "./surfaces.mjs";
import { weather, MASK_RGB } from "./age.mjs";
import { matTable, surfaceSpec, colorFor, matTexture, fittingTextures } from "./model.mjs";

export const TEX = 1024;
const lerp = (a, b, t) => a + (b - a) * t;
/** The materials with a surface texture (surfaceSpec), when their settings give them one. */
export const TEXTURED = ["walls", "wallsLow", "wallsIn", "roof", "chimney", "trim", "foundation", "door", "doorSheet", "doorIn"];
/** Those, and the materials parts with a look of their own have (walls, roof and trim of their own: "roofP1" ...). */
export const texturedNow = p => [...TEXTURED, ...matTable(p).variants.map(v => v.name)];

function hash(i, j, s) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, px, py, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const ux = fx*fx*(3 - 2*fx), uy = fy*fy*(3 - 2*fy);
  const w = (a, n) => ((a % n) + n) % n;
  const x0 = w(xi, px), x1 = w(xi + 1, px), y0 = w(yi, py), y1 = w(yi + 1, py);
  return lerp(lerp(hash(x0,y0,s), hash(x1,y0,s), ux), lerp(hash(x0,y1,s), hash(x1,y1,s), ux), uy);
}

/**
 * A surface of surfaces.mjs, ready to draw: its shade map and marks, weathered by age (age.mjs), a grey map
 * of it (for the preview, x1.5; marks darker) and its normal map. outdoor: out in the weather (the plinth).
 */
const fitBases = {};
export function fitBase(kind, age = 0, outdoor = false) {
  const key = `${kind}|${age}|${outdoor}`;
  if (fitBases[key]) return fitBases[key];
  const fresh = paintSurface(kind), {N, S, H, Mk} = age ? weather({...fresh, Mk: null}, kind, age, {outdoor}) : {...fresh, Mk: null};
  const nrm = normalFromHeight(H, N, SURFACES[kind].bump);
  const pixelsOf = fill => { const D = new Uint8ClampedArray(N * N * 4); fill(D); return D; };
  const normal = pixelsOf(D => { for (let i = 0, j = 0; i < N * N; i++, j += 4) { D[j] = (nrm[i*3]*0.5 + 0.5) * 255; D[j+1] = (nrm[i*3+1]*0.5 + 0.5) * 255; D[j+2] = (nrm[i*3+2]*0.5 + 0.5) * 255; D[j+3] = 255; } });
  // (the grey map is for the editor's preview only, so the server never makes it)
  const base = {N, S, Mk, normal};
  let grey = null;
  Object.defineProperty(base, "grey", {enumerable: true, get: () => grey || (grey = pixelsOf(D => { for (let i = 0, j = 0; i < N * N; i++, j += 4) { D[j] = D[j+1] = D[j+2] = Math.min(255, S[i] * (Mk && Mk[i] ? 0.7 : 1) / 1.5 * 255); D[j+3] = 255; } }))});
  return fitBases[key] = base;
}
export function genBase(s) {
  if (SURFACES[s.kind]) return fitBase(s.kind, s.age, true);
  let N = TEX, H = new Float32Array(N*N), S = new Float32Array(N*N), Mk = s.kind === "brick" ? new Uint8Array(N*N) : null;
  const strength = {lockpanel:10, vertical:14, horizontal:40, plaster:1.5, felt:1.2, tiles:60, metal:4.5, seamed:5, corrugated:9, brick:3, paintedwood:0.6}[s.kind];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let h = 0, sh = 1;
    if (s.kind === "lockpanel") {
      const P = N / s.n, bwp = s.bw * P, lx = x % P, d = Math.min(lx, P - lx);
      const grain = (vnoise(x/8, y/64, N/8, N/64, 3) - 0.5) * 0.12 + (vnoise(x/2, y/16, N/2, N/16, 5) - 0.5) * 0.06;
      if (d < bwp / 2) {
        h = 0.5 + 0.5 * Math.min(1, (bwp/2 - d) / 4);
        sh = 1.03 + (hash(Math.round(x / P) % s.n, 1, 11) - 0.5) * 0.06 + grain;
      } else {
        sh = (0.97 + (hash(Math.floor(x / P), 2, 13) - 0.5) * 0.08 + grain) * (1 - 0.4 * Math.exp(-(d - bwp/2) / 5));
      }
    } else if (s.kind === "vertical") {
      // plain boards standing side by side: a flat face with a small chamfer and a dark joint between the boards, grain running down
      const P = N / s.n, lx = x % P, d = Math.min(lx, P - lx), board = Math.floor(x / P);
      const grain = (vnoise(x/8, y/64, N/8, N/64, 3) - 0.5) * 0.12 + (vnoise(x/2, y/16, N/2, N/16, 5) - 0.5) * 0.06;
      h = d < 4 ? d / 4 : 1;
      sh = (0.98 + (hash(board % s.n, 4, 23) - 0.5) * 0.1 + grain) * (1 - 0.55 * Math.exp(-d / 2.5));
    } else if (s.kind === "horizontal") {
      const P = N / s.n, ly = y % P;
      h = ly / P;
      const grain = (vnoise(x/64, y/8, N/64, N/8, 3) - 0.5) * 0.12 + (vnoise(x/16, y/2, N/16, N/2, 5) - 0.5) * 0.06;
      sh = (0.97 + (hash(Math.floor(y / P), 3, 17) - 0.5) * 0.08 + grain) * (1 - 0.35 * Math.exp(-ly / 3));
    } else if (s.kind === "plaster" || s.kind === "felt") {
      const n1 = vnoise(x/4, y/4, N/4, N/4, 7), n2 = vnoise(x/32, y/32, N/32, N/32, 9);
      h = n1 * 0.6 + n2 * 0.4;
      sh = s.kind === "felt" ? 0.9 + 0.15*n2 + 0.08*n1 : 0.95 + 0.03*n2 + 0.08*n1;
    } else if (s.kind === "tiles") {
      const Px = N / 4, Py = N / 4, lx = x % Px, ly = y % Py;
      const wv = 0.5 + 0.5 * Math.cos(2 * Math.PI * lx / Px);
      h = 0.55 * wv + 0.45 * (ly / Py);
      sh = (0.95 + (hash(Math.floor(x/Px), Math.floor(y/Py), 19) - 0.5) * 0.1 + (vnoise(x/4, y/4, N/4, N/4, 21) - 0.5) * 0.08)
        * (1 - 0.5 * Math.exp(-ly / 5)) * (0.85 + 0.15 * wv);
    } else if (s.kind === "brick") {
      const Px = N / 4, Py = N / 8, row = Math.floor(y / Py), off = row % 2 ? Px / 2 : 0;
      const lx = (x + off) % Px, ly = y % Py, col = Math.floor(((x + off) % N) / Px);
      const e = Math.min(lx - 10, ly - 14, Px - lx, Py - ly);
      if (e < 0) {
        Mk[y*N + x] = 1;
        sh = 0.9 + (vnoise(x/2, y/2, N/2, N/2, 33) - 0.5) * 0.15;
      } else {
        h = 0.6 + 0.4 * Math.min(1, e / 3);
        sh = 0.85 + hash(col, row, 29) * 0.25 + (vnoise(x/4, y/4, N/4, N/4, 31) - 0.5) * 0.12;
      }
    } else if (s.kind === "paintedwood") {
      // Planed boards under paint: the paint fills the grain, so only long, faint streaks along y
      // show, mostly in the light; no growth rings, no board seams, almost even color.
      // (noise scales divide the texture size, so it tiles without a seam)
      const grain = vnoise(x/8, y/256, N/8, N/256, 41), wide = vnoise(x/32, y/512, N/32, N/512, 43);
      h = grain * 0.6 + wide * 0.4;
      sh = 0.99 + (grain - 0.5) * 0.012 + (wide - 0.5) * 0.02;
    } else if (s.kind === "corrugated") {
      // Corrugated sheet: 16 trapezoid ribs across (rounded tops, flat valleys), lit on one flank and dark on the other, with an overlap
      // (a thin step) across the sheet halfway down, shifted a little from rib to rib by the noise.
      const Px = N / 16, u = (x % Px) / Px, w = 0.5 - 0.5 * Math.cos(2 * Math.PI * u), rib = Math.min(1, Math.max(0, w * 1.7 - 0.25)), flank = Math.sin(2 * Math.PI * u);
      const Sy = N / 2, lap = (y + Math.round(vnoise(x/32, 3, N/32, 8, 27) * 6)) % Sy, step = lap < 3 ? 1 : 0;
      h = Math.max(rib, step * 0.4);
      sh = (1 + 0.16 * flank * (rib > 0.05 && rib < 0.95 ? 1 : 0.3) - 0.08 * (1 - rib) + (vnoise(x/64, y/6, N/64, N/6, 33) - 0.5) * 0.05) * (step ? 0.8 : 1);
    } else if (s.kind === "seamed") {
      // Falsad plåt: four 50 cm pans across; at each pan's edge a raised double seam (a rounded fold with a bright top and a dark foot) and,
      // every metre down the pan, a flat cross seam (tvärfals), staggered half a sheet from pan to pan; each sheet a touch lighter or darker.
      const Px = N / 4, lx = x % Px, d = Math.min(lx, Px - lx), pan = Math.floor(x / Px), Sy = N / 2, yy = (y + (pan % 2) * Sy / 2) % Sy, sheet = Math.floor((y + (pan % 2) * Sy / 2) / Sy);
      const fold = d < 3 ? 1 : d < 6 ? (6 - d) / 3 : 0, cross = Math.min(yy, Sy - yy) < 2 ? 0.7 : 0;
      h = Math.max(fold, cross);
      sh = (1 + (hash(pan, sheet, 31) - 0.5) * 0.06 + (vnoise(x/48, y/48, N/48, N/48, 25) - 0.5) * 0.05)
        * (d >= 3 && d < 6 ? 0.82 : d < 3 ? 1.1 : 1) * (cross ? 0.85 : 1);
    } else if (s.kind === "metal") {
      const Px = N / 4, lx = x % Px, d = Math.min(lx, Px - lx);
      h = d < 4 ? 1 : d < 7 ? (7 - d) / 3 : 0;
      sh = 1 + (vnoise(x/64, y/4, N/64, N/4, 23) - 0.5) * 0.06 - (d < 7 && d >= 4 ? 0.08 : 0);
    }
    H[y*N + x] = h; S[y*N + x] = sh;
  }
  // the building's age: dirt, peeling paint, moss, rust (age.mjs)
  if (s.age) ({S, H, Mk} = weather({S, H, Mk, N}, s.kind, s.age, {outdoor: true}));
  const D = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const xl = (x + N - 1) % N, xr = (x + 1) % N, yu = (y + N - 1) % N, yd = (y + 1) % N;
    const nx = -(H[y*N + xr] - H[y*N + xl]) * 0.5 * strength, ny = (H[yd*N + x] - H[yu*N + x]) * 0.5 * strength;
    const l = Math.hypot(nx, ny, 1), j = (y*N + x) * 4;
    D[j] = (nx/l*0.5 + 0.5) * 255; D[j+1] = (ny/l*0.5 + 0.5) * 255; D[j+2] = (1/l*0.5 + 0.5) * 255; D[j+3] = 255;
  }
  return {S, Mk, N, normal: D};
}
export function compose(S, hex, Mk, N = TEX) {
  const D = new Uint8ClampedArray(N * N * 4);
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  for (let i = 0, j = 0; i < S.length; i++, j += 4) { const k = S[i], mo = Mk && MASK_RGB[Mk[i]], [cr, cg, cb] = mo || [r, g, b]; D[j] = Math.min(255, cr*k); D[j+1] = Math.min(255, cg*k); D[j+2] = Math.min(255, cb*k); D[j+3] = 255; }
  return D;
}

// What the surfaces look like does not depend on the building (only on the spec, the age and the colour), so the heavy part is kept:
// a village of houses with the same boards makes the boards once.
const bases = new Map(), KEEP_BASES = 12;   // (a few MB each; an editor with a slider being dragged makes a new spec at every step)
/** genBase(spec), kept by spec (the last few used). */
export function baseFor(spec) {
  const key = JSON.stringify(spec);
  let b = bases.get(key);
  if (b) bases.delete(key);
  else b = genBase(spec);
  bases.set(key, b);
  if (bases.size > KEEP_BASES) bases.delete(bases.keys().next().value);
  return b;
}

/**
 * The texture files a building's i3d refers to (buildI3d with textures): [{path, width, height, pixels(), key}] where pixels() makes the RGBA
 * pixels when asked (a caller that has the file already, by its key, never asks) and key says what they are made of (equal keys, equal pixels). G is the building's geometry (buildGeometry(p).G):
 * a material nothing is drawn in has no file. Not here: the room atlas and the glass (canvas), see the editor and headless.mjs.
 */
export function textureFiles(p, G, {fittings = true} = {}) {
  const out = [], seen = new Set();
  const add = f => { if (!seen.has(f.path)) { seen.add(f.path); out.push(f); } };   // (a surface's normal map comes up once for each colour of it)
  for (const m of texturedNow(p)) {
    if (!G[m] || !G[m].i.length) continue;
    const spec = surfaceSpec(p, m);
    if (!spec) continue;
    const base = baseFor(spec), color = colorFor(p, m), N = base.N;
    add({path: matTexture(m).diffuse, width: N, height: N, pixels: () => compose(base.S, color, base.Mk, N), key: "d|" + JSON.stringify(spec) + "|" + color});
    add({path: matTexture(m).normal, width: N, height: N, pixels: () => base.normal, key: "n|" + JSON.stringify(spec)});
  }
  // the inside: each colour of a surface its own diffuse, one normal map per surface
  if (fittings) for (const t of fittingTextures(p, G)) {
    const base = fitBase(t.surf, p.age), N = base.N;
    add({path: t.diffuse, width: N, height: N, pixels: () => compose(base.S, t.color, base.Mk, N), key: `fd|${t.surf}|${p.age}|${t.color}`});
    add({path: t.normal, width: N, height: N, pixels: () => base.normal, key: `fn|${t.surf}|${p.age}`});
  }
  return out;
}

