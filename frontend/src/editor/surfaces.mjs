// Surfaces for the inside of walk-in buildings (and the plinth): tileable detail made from noise,
// with no DOM. paintSurface(kind) gives a shade map S (multiplies the part's colour, about 1 on
// average) and a height map H (for the normal map). The editor composes them with each part's colour
// into the textures the export packs, and shows S as a grey map over the vertex colours in the preview.
//
// A surface's w and h are the metres one copy of the texture covers; texture u runs across, v along.
// grain: the part's uvs lay v along its longest edge (boards, beams), so wood grain follows them.

export const SURFACES = {
  concrete:  {w: 2.4, h: 2.4, px: 512, bump: 2},              // floors, kerbs, troughs: worn, stained
  whitewash: {w: 2.0, h: 2.0, px: 512, bump: 1.5},            // limed inside walls
  grime:     {w: 1.6, h: 1.6, px: 512, bump: 1.5},            // the same, splashed and rubbed low down
  timber:    {w: 0.6, h: 2.4, px: 512, bump: 1.5, grain: true}, // rough-sawn beams and tarred boards
  oldboards: {w: 1.2, h: 2.4, px: 512, bump: 3, grain: true},  // the unpainted inside of a board wall: 15 cm boards, each its own shade, sun-bleached and stained
  oldtimber: {w: 0.6, h: 2.4, px: 512, bump: 2.6, grain: true}, // the studs: old, grey, cracked and stained
  wood:      {w: 0.5, h: 1.6, px: 512, bump: 1.5, grain: true}, // planed planks and plywood
  boards:    {w: 1.2, h: 2.4, px: 512, bump: 4, grain: true}, // roof boards seen from inside (8 a copy)
  galv:      {w: 0.6, h: 0.6, px: 256, bump: 0.6},            // galvanised steel: spangle
  steel:     {w: 0.8, h: 0.8, px: 256, bump: 0.8},            // painted or black iron, a little rust
  plastic:   {w: 0.8, h: 0.8, px: 256, bump: 0.4},            // feeders, drinkers, buckets
  rubber:    {w: 0.4, h: 0.4, px: 256, bump: 3},              // cow mats (studded), hoses
  straw:     {w: 0.6, h: 0.6, px: 256, bump: 3},              // straw, hay, silage
  litter:    {w: 0.8, h: 0.8, px: 256, bump: 2},              // wood shavings, sawdust, feed, droppings
  paperPlain:  {w: 0.6, h: 0.6, px: 256, bump: 0.5},          // wallpaper (tapet): plain, with a woven grain
  paperStripe: {w: 0.6, h: 0.6, px: 256, bump: 0.5},          // wallpaper: stripes 15 cm apart
  paperFlower: {w: 0.5, h: 0.5, px: 256, bump: 0.6},          // wallpaper: small flowers in rows, every other one half a step down
};

/* ---------- Tileable noise ---------- */
export function hash(i, j, s) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = t => t * t * (3 - 2 * t);
const wrap = (a, n) => ((a % n) + n) % n;
/** Value noise over an N px tile with cx x cy cells (integers, so it tiles), 0..1. */
export function noise(x, y, N, cx, cy, s) {
  const X = x * cx / N, Y = y * cy / N, xi = Math.floor(X), yi = Math.floor(Y), u = smooth(X - xi), v = smooth(Y - yi);
  const x0 = wrap(xi, cx), x1 = wrap(xi + 1, cx), y0 = wrap(yi, cy), y1 = wrap(yi + 1, cy);
  const a = hash(x0, y0, s), b = hash(x1, y0, s), c = hash(x0, y1, s), d = hash(x1, y1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** A few octaves of noise starting at c cells, 0..1. */
export function fbm(x, y, N, c, s, oct = 3) {
  let t = 0, a = 1, n = 0;
  for (let o = 0; o < oct; o++) { t += a * noise(x, y, N, c << o, c << o, s + o * 101); n += a; a /= 2; }
  return t / n;
}
/** A seeded random number generator (mulberry32). */
function rnd(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Shortest wrapped distance on a tile N wide. */
const wd = (a, N) => { const d = Math.abs(a) % N; return Math.min(d, N - d); };

/**
 * Stamps strands (straw, shavings) into S and H, wrapping round the tile: n of them, each a line from
 * a random point at an angle round dir, len px long and wide px thick, with its own brightness.
 */
function strands(S, H, N, r, {n, dir, spread, len, wide, light}) {
  for (let k = 0; k < n; k++) {
    const x0 = r() * N, y0 = r() * N, a = dir + (r() - 0.5) * 2 * spread, l = len[0] + r() * (len[1] - len[0]);
    const w = wide[0] + r() * (wide[1] - wide[0]), b = light[0] + r() * (light[1] - light[0]), top = k + 1;
    const dx = Math.cos(a), dy = Math.sin(a), rr = w / 2;
    for (let t = 0; t <= l; t += 0.7) {
      const cx = x0 + dx * t, cy = y0 + dy * t, edge = 1 - 0.25 * Math.abs(2 * t / l - 1);
      for (let oy = -Math.ceil(rr); oy <= Math.ceil(rr); oy++) for (let ox = -Math.ceil(rr); ox <= Math.ceil(rr); ox++) {
        if (ox * ox + oy * oy > rr * rr + 0.25) continue;
        const i = wrap(Math.round(cy + oy), N) * N + wrap(Math.round(cx + ox), N);
        S[i] = b * edge * (1 - 0.12 * Math.hypot(ox, oy) / (rr + 0.5)); H[i] = top / n + 0.3 * (1 - Math.hypot(ox, oy) / (rr + 0.5));
      }
    }
  }
}

/** Knots in wood: a few dark ovals, stretched along the grain (y), on a cx x cy grid of chances. */
function knot(x, y, N, cx, cy, s, chance) {
  let k = 0;
  const gx = Math.floor(x * cx / N), gy = Math.floor(y * cy / N);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const a = wrap(gx + i, cx), b = wrap(gy + j, cy);
    if (hash(a, b, s) > chance) continue;
    const kx = (a + 0.2 + 0.6 * hash(a, b, s + 1)) * N / cx, ky = (b + 0.2 + 0.6 * hash(a, b, s + 2)) * N / cy, r = N * (0.012 + 0.014 * hash(a, b, s + 3));
    const d = Math.hypot(wd(x - kx, N) / r, wd(y - ky, N) / (r * 1.8));
    if (d < 1) k = Math.max(k, 1 - d * d);
    else if (d < 2.2) k = Math.max(k, 0.25 * (1 - (d - 1) / 1.2) * (0.5 + 0.5 * Math.sin(d * 9)));
  }
  return k;
}

/** Galvanising spangle: the value of the nearest of jittered points on a c x c grid, 0..1. */
function spangle(x, y, N, c, s) {
  const gx = Math.floor(x * c / N), gy = Math.floor(y * c / N);
  let best = Infinity, v = 0;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const a = gx + i, b = gy + j, wa = wrap(a, c), wb = wrap(b, c);
    const px = (a + hash(wa, wb, s)) * N / c, py = (b + hash(wa, wb, s + 1)) * N / c, d = (px - x) ** 2 + (py - y) ** 2;
    if (d < best) { best = d; v = hash(wa, wb, s + 2); }
  }
  return v;
}

/** Wood grain: growth lines along y, wavering, with fine streaks; rings: lines across the tile (integer). */
const grain = (x, y, N, rings, s) =>
  0.5 + 0.5 * Math.sin(2 * Math.PI * (x / N * rings + 1.2 * noise(x, y, N, 4, 2, s) + 0.15 * noise(x, y, N, 16, 4, s + 1)));

const PAINT = {
  paperPlain(x, y, N) {
    // a woven grain: fine threads both ways, and a little cloudiness
    const thread = (Math.sin(x * Math.PI * 2 / 4) * 0.5 + Math.sin(y * Math.PI * 2 / 4) * 0.5) * 0.02, cloud = fbm(x, y, N, 4, 61), fuzz = hash(x, y, 62);
    return [1 + thread + 0.04 * (cloud - 0.5) + 0.03 * (fuzz - 0.5), 0.5 + thread * 6 + 0.2 * fuzz];
  },
  paperStripe(x, y, N) {
    // a wide stripe, a narrow gap and a pinstripe every 64 px (15 cm)
    const u = x % 64, fuzz = hash(x, y, 63), cloud = fbm(x, y, N, 4, 64);
    let s = 1.02, h = 0.55;
    if (u >= 40 && u < 47) { s = 0.86; h = 0.3; } else if (u >= 47) s = 0.96;
    if (u === 53 || u === 54) { s = 0.78; h = 0.4; }
    return [s + 0.03 * (cloud - 0.5) + 0.02 * (fuzz - 0.5), h + 0.1 * fuzz];
  },
  paperFlower(x, y, N) {
    // a bud with five petals, and two leaves, in cells of 64 px (12 cm); odd columns half a cell down
    const col = Math.floor(x / 64), u = (x % 64) - 32, v = ((((y - (col % 2) * 32) % 64) + 64) % 64) - 32;
    const r = Math.hypot(u, v), ang = Math.atan2(v, u), fuzz = hash(x, y, 65), cloud = fbm(x, y, N, 4, 66);
    let s = 1.04, h = 0.5;
    if (r < 5) { s = 0.7; h = 0.8; }
    else if (r < 10 && Math.cos(ang * 5) > 0.1) { s = 0.86; h = 0.7; }
    else if (Math.hypot(Math.abs(u) - 1, Math.abs(v) - 19) < 3.5) { s = 0.9; h = 0.65; }
    return [s + 0.03 * (cloud - 0.5) + 0.02 * (fuzz - 0.5), h + 0.1 * fuzz];
  },
  concrete(x, y, N) {
    const big = fbm(x, y, N, 4, 1), fine = fbm(x, y, N, 32, 2, 2), stain = fbm(x, y, N, 6, 3, 3), dot = hash(x, y, 4);
    let s = 0.97 + 0.12 * (big - 0.5) + 0.07 * (fine - 0.5) + (dot - 0.5) * 0.07;
    if (dot > 0.986) s -= 0.12;                                 // pores and grit
    if (stain > 0.6) s *= 1 - Math.min(0.2, (stain - 0.6) * 1.2);   // dark wet and dung stains (small and soft: a worn floor, not camouflage)
    const scuff = noise(x, y, N, 2, 48, 5);                     // wear across the floor
    if (scuff > 0.82) s *= 1 + (scuff - 0.82) * 0.5;
    return [s, 0.6 * fine + 0.4 * dot - (dot > 0.986 ? 0.5 : 0)];
  },
  whitewash(x, y, N) {
    // limewash: uneven, cloudy coats with brush marks, and here and there a small flake gone
    const brush = noise(x, y, N, 8, 128, 11), cloud = fbm(x, y, N, 4, 12), grit = fbm(x, y, N, 64, 14, 2), flake = fbm(x, y, N, 48, 13, 2);
    let s = 1.02 + 0.035 * (brush - 0.5) + 0.06 * (cloud - 0.5) + 0.04 * (grit - 0.5), h = 0.3 * brush + 0.3 * cloud + 0.4 * grit;
    if (flake > 0.73) { s *= 1 - Math.min(0.06, (flake - 0.73) * 1.2); h -= 0.3; }
    return [s, h];
  },
  grime(x, y, N) {
    const [w, h] = PAINT.whitewash(x, y, N);
    const dirt = fbm(x, y, N, 4, 21), drip = noise(x, y, N, 48, 3, 22), splash = fbm(x, y, N, 32, 23, 2);
    let s = w * (0.94 - 0.16 * Math.max(0, dirt - 0.45)) * (1 - 0.1 * drip);
    // muck splashed on: ragged smudges where the dirt is heaviest
    if (splash > 0.68) s *= 1 - Math.min(0.12, (splash - 0.68) * 1.6) * (0.5 + dirt);
    return [s, h + 0.3 * dirt];
  },
  timber(x, y, N) {
    // Rough-sawn, weathered beams: long streaks along the grain (y), a few drying cracks along it, darker
    // patches and knots. Nothing repeats across the grain: regular bands there read as corrugation.
    const g1 = noise(x, y, N, 96, 3, 31), g2 = noise(x, y, N, 24, 2, 32), patch = fbm(x, y, N, 4, 36), fuzz = hash(x, y, 33);
    const lane = Math.floor(x * 20 / N), crackAt = (hash(lane, 0, 37) * 0.6 + 0.2) * N / 20, open = noise(x, y, N, 1, 3, 38 + lane);
    const crack = hash(lane, 1, 39) < 0.3 && Math.abs(x - lane * N / 20 - crackAt) < 0.9 && open > 0.55;
    const k = knot(x, y, N, 3, 2, 35, 0.45);
    let s = (0.96 + 0.12 * (g1 - 0.5) + 0.1 * (g2 - 0.5) + 0.12 * (patch - 0.5) + 0.04 * (fuzz - 0.5)) * (1 - 0.45 * k);
    if (crack) s *= 0.55;
    return [s, 0.5 * g1 + 0.3 * g2 + 0.1 * fuzz - 0.6 * k - (crack ? 0.8 : 0)];
  },
  oldboards(x, y, N) {
    // Boards of old, unpainted timber: each board lighter or darker (some bleached, some stained), long grain with a few knots and cracks at the seams, and the odd stain.
    const P = N / 8, b = Math.floor(x / P), lx = x - b * P, tone = (hash(b, 0, 91) - 0.5) * 0.3;
    const g1 = noise(x, y, N, 96, 3, 92 + b), g2 = noise(x, y, N, 24, 2, 120 + b), fine = noise(x, y, N, 128, 6, 94), k = knot(x, y, N, 3, 3, 95, 0.35);
    const damp = fbm(x, y, N, 3, 96 + b);
    let s = (0.97 + tone + 0.13 * (g1 - 0.5) + 0.07 * (g2 - 0.5) + 0.04 * (fine - 0.5)) * (1 - 0.35 * k), h = 0.5 + 0.3 * g1 + 0.2 * g2 - 0.5 * k;
    if (damp > 0.62) s *= 1 - Math.min(0.15, (damp - 0.62) * 1.2);       // a damp stain running down a board
    const seam = Math.min(lx, P - lx);
    if (seam < 2.5) { s *= 0.5 + 0.2 * seam; h = 0; }                     // the gap between boards
    const joint = hash(b, 1, 97) * N;
    if (hash(b, 2, 98) < 0.3 && wd(y - joint, N) < 1) { s *= 0.7; h = 0.2; }
    return [s, h];
  },
  oldtimber(x, y, N) {
    // Old studs: darker and greyer than new timber, strong streaks along the grain, many drying cracks, damp stains and knots, and the odd nail hole.
    const g1 = noise(x, y, N, 96, 3, 71), g2 = noise(x, y, N, 24, 2, 72), patch = fbm(x, y, N, 4, 76), stain = fbm(x, y, N, 8, 77), fuzz = hash(x, y, 73);
    const lane = Math.floor(x * 16 / N), crackAt = (hash(lane, 0, 74) * 0.6 + 0.2) * N / 16, open = noise(x, y, N, 1, 3, 75 + lane);
    const crack = hash(lane, 1, 78) < 0.5 && Math.abs(x - lane * N / 16 - crackAt) < 1.1 && open > 0.45;
    const k = knot(x, y, N, 3, 2, 79, 0.5), nail = hash(Math.floor(x / 6), Math.floor(y / 6), 80) > 0.9985;
    let s = (0.94 + 0.22 * (g1 - 0.5) + 0.18 * (g2 - 0.5) + 0.3 * (patch - 0.5) + 0.08 * (fuzz - 0.5)) * (1 - 0.5 * k);
    if (stain > 0.6) s *= 0.85;
    if (crack) s *= 0.45;
    if (nail) s *= 0.4;
    return [s, 0.6 * g1 + 0.4 * g2 + 0.1 * fuzz - 0.7 * k - (crack ? 1 : 0) - (nail ? 0.8 : 0)];
  },
  wood(x, y, N) {
    const g = grain(x, y, N, 14, 41), fine = noise(x, y, N, 128, 8, 42), k = knot(x, y, N, 2, 2, 43, 0.3);
    const s = (0.97 + 0.11 * (g - 0.5) + 0.05 * (fine - 0.5) + 0.04 * (noise(x, y, N, 4, 2, 44) - 0.5)) * (1 - 0.4 * k);
    return [s, 0.4 * g + 0.4 * fine - 0.5 * k];
  },
  boards(x, y, N) {
    const P = N / 8, b = Math.floor(x / P), lx = x - b * P, tone = (hash(b, 0, 51) - 0.5) * 0.14;
    const g = grain(x + b * 37, y, N, 24, 52), fine = noise(x, y, N, 128, 8, 53), k = knot(x, y, N, 4, 3, 54, 0.3);
    let s = (0.97 + tone + 0.1 * (g - 0.5) + 0.05 * (fine - 0.5)) * (1 - 0.4 * k), h = 0.6 + 0.2 * g + 0.2 * fine - 0.4 * k;
    const seam = Math.min(lx, P - lx);
    if (seam < 2.5) { s *= 0.55 + 0.15 * seam; h = 0; }                     // the gap between boards
    const joint = hash(b, 1, 55) * N;                                       // where a board ends and the next starts
    if (hash(b, 2, 56) < 0.35 && wd(y - joint, N) < 1) { s *= 0.72; h = 0.2; }   // (long boards: few joints)
    return [s, h];
  },
  galv(x, y, N) {
    const v = spangle(x, y, N, 14, 61), fine = noise(x, y, N, 64, 64, 62), w = fbm(x, y, N, 4, 63);
    let s = 0.96 + 0.14 * (v - 0.5) + 0.05 * (fine - 0.5) + 0.06 * (w - 0.5);
    if (w > 0.7) s *= 1.08;                                                 // white rust bloom
    return [s, 0.3 * v + 0.2 * fine];
  },
  steel(x, y, N) {
    const f = fbm(x, y, N, 8, 71), rust = fbm(x, y, N, 16, 72), scr = noise(x, y, N, 64, 2, 73);
    let s = 0.99 + 0.07 * (f - 0.5) + (hash(x, y, 74) - 0.5) * 0.03, h = 0.3 * f;
    if (scr > 0.8) s *= 1 + (scr - 0.8) * 0.6;                              // rubbed bright
    if (rust > 0.66) { s *= 0.8 - (rust - 0.66); h -= 0.3; }                // dark rust pits
    return [s, h];
  },
  plastic(x, y, N) {
    const f = fbm(x, y, N, 4, 81), scuff = noise(x, y, N, 32, 2, 82);
    let s = 1.0 + 0.05 * (f - 0.5) + (hash(x, y, 83) - 0.5) * 0.02;
    if (scuff > 0.78) s *= 0.93;
    const dirt = fbm(x, y, N, 8, 84);
    if (dirt > 0.62) s *= 1 - (dirt - 0.62) * 0.7;
    return [s, 0.2 * f];
  },
  rubber(x, y, N) {
    const C = 16, P = N / C, cx = (Math.floor(x / P) + 0.5) * P, cy = (Math.floor(y / P) + 0.5) * P, d = Math.hypot(x - cx, y - cy) / P;
    const stud = d < 0.28 ? 1 : d < 0.36 ? (0.36 - d) / 0.08 : 0, dirt = fbm(x, y, N, 4, 91);
    const s = (0.96 + 0.1 * stud - (d >= 0.28 && d < 0.4 ? 0.06 : 0) + (hash(x, y, 92) - 0.5) * 0.04) * (1.08 - 0.16 * dirt);
    return [s, stud];
  },
};
/** Surfaces made of many small pieces, stamped over a base (filled in per tile, not per pixel). */
const STAMPED = {
  straw(N, S, H) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { S[y * N + x] = 0.62 + 0.12 * fbm(x, y, N, 8, 101); H[y * N + x] = 0; }
    strands(S, H, N, rnd(102), {n: Math.round(N * N / 110), dir: 0.5, spread: 0.9, len: [N * 0.08, N * 0.3], wide: [1.6, 3.2], light: [0.82, 1.28]});
  },
  litter(N, S, H) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { S[y * N + x] = 0.8 + 0.12 * fbm(x, y, N, 8, 111); H[y * N + x] = 0; }
    strands(S, H, N, rnd(112), {n: Math.round(N * N / 28), dir: 0, spread: Math.PI, len: [2, 9], wide: [2, 5], light: [0.8, 1.22]});
    const r = rnd(113);
    for (let k = 0; k < N * N / 220; k++) { const i = Math.floor(r() * N * N); S[i] *= 0.6; H[i] = 0; }   // dark bits
  },
};

const cache = new Map();
/** The shade (S) and height (H) maps of a surface, SURFACES[kind].px square, row by row from the top. */
export function paintSurface(kind) {
  if (cache.has(kind)) return cache.get(kind);
  const N = SURFACES[kind].px, S = new Float32Array(N * N), H = new Float32Array(N * N);
  if (STAMPED[kind]) STAMPED[kind](N, S, H);
  else for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const [s, h] = PAINT[kind](x, y, N); S[y * N + x] = s; H[y * N + x] = h; }
  for (let i = 0; i < S.length; i++) S[i] = Math.max(0.35, Math.min(1.45, S[i]));
  const out = {N, S, H};
  cache.set(kind, out);
  return out;
}

/** Unit normals (x, y, z per pixel, z out of the surface) from a tileable height map, steeper with strength. */
export function normalFromHeight(H, N, strength) {
  const out = new Float32Array(N * N * 3);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const xl = (x + N - 1) % N, xr = (x + 1) % N, yu = (y + N - 1) % N, yd = (y + 1) % N;
    const nx = (H[y * N + xl] - H[y * N + xr]) * 0.5 * strength, ny = (H[yd * N + x] - H[yu * N + x]) * 0.5 * strength;
    const l = Math.hypot(nx, ny, 1), j = (y * N + x) * 3;
    out[j] = nx / l; out[j + 1] = ny / l; out[j + 2] = 1 / l;
  }
  return out;
}
