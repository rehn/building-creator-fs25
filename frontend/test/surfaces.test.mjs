import { test } from "node:test";
import assert from "node:assert/strict";
import { SURFACES, paintSurface, normalFromHeight } from "../src/editor/surfaces.mjs";
import { sanitize, buildGeometry, buildI3d, PRESETS, fittingTextures } from "../src/editor/model.mjs";
import { splitByColor } from "../src/editor/i3d.mjs";

const preset = id => sanitize(PRESETS.find(x => x.id === id).settings);
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;

test("surfaces: each has a size in metres, a texture size and a bump strength", () => {
  for (const [k, s] of Object.entries(SURFACES)) {
    assert.ok(s.w > 0 && s.h > 0, k);
    assert.ok([128, 256, 512].includes(s.px), k);
    assert.ok(s.bump >= 0, k);
  }
  for (const k of ["concrete", "whitewash", "grime", "timber", "oldtimber", "wood", "boards", "galv", "steel", "plastic", "rubber", "straw", "litter"])
    assert.ok(SURFACES[k], `missing surface ${k}`);
});

for (const k of Object.keys(SURFACES)) test(`surfaces: ${k} is detailed, sensible and tiles without a seam`, () => {
  const N = SURFACES[k].px, {S, H} = paintSurface(k);
  assert.equal(S.length, N * N); assert.equal(H.length, N * N);
  for (let i = 0; i < S.length; i++) assert.ok(Number.isFinite(S[i]) && S[i] >= 0.3 && S[i] <= 1.5 && Number.isFinite(H[i]), `${k} pixel ${i}: ${S[i]}`);
  const m = mean(S), sd = Math.sqrt(mean(Array.from(S, v => (v - m) ** 2)));
  assert.ok(sd > 0.012, `${k} is nearly flat (sd ${sd.toFixed(4)})`);
  assert.ok(m > 0.75 && m < 1.15, `${k} changes the colour too much on average (${m.toFixed(3)})`);
  // across the seam (last column to the first, last row to the first) it changes about as much as inside
  const step = (a, b) => Math.abs(S[a] - S[b]);
  let seamX = 0, inX = 0, seamY = 0, inY = 0;
  for (let y = 0; y < N; y++) { seamX += step(y * N + N - 1, y * N); inX += step(y * N + N / 2 - 1, y * N + N / 2); }
  for (let x = 0; x < N; x++) { seamY += step((N - 1) * N + x, x); inY += step((N / 2 - 1) * N + x, N / 2 * N + x); }
  assert.ok(seamX <= inX * 2.5 + N * 0.01, `${k}: seam across x ${seamX.toFixed(2)} vs ${inX.toFixed(2)}`);
  assert.ok(seamY <= inY * 2.5 + N * 0.01, `${k}: seam across y ${seamY.toFixed(2)} vs ${inY.toFixed(2)}`);
  assert.deepEqual(paintSurface(k).S.slice(0, 64), S.slice(0, 64), "the same every time");
});

test("surfaces: a normal map from a height map is unit length and flat where the height is", () => {
  const N = 8, n = normalFromHeight(new Float32Array(N * N).fill(0.5), N, 3);
  assert.equal(n.length, N * N * 3);
  assert.deepEqual(Array.from(n.slice(0, 3)), [0, 0, 1]);
  const h = new Float32Array(N * N).map((_, i) => (i % N) / N), m = normalFromHeight(h, N, 3);
  for (let i = 0; i < m.length; i += 3) assert.ok(Math.abs(Math.hypot(m[i], m[i + 1], m[i + 2]) - 1) < 1e-5);
});

test("inside a cow barn: concrete floor, whitewashed walls, timber frame, roof boards and steel pieces have surfaces", () => {
  const {G} = buildGeometry({...preset("ladugard"), insideSame: false});
  const surfs = new Set(splitByColor(G.fittings).map(g => g.surf));
  for (const s of ["concrete", "whitewash", "grime", "timber", "boards", "galv", "rubber"]) assert.ok(surfs.has(s), `no ${s}: ${[...surfs]}`);
  for (const s of surfs) assert.ok(s === undefined || SURFACES[s], `unknown surface ${s}`);
});

/** Area of the triangles of g facing down (normal y below -0.3); only those of surface surf if given. */
function downArea(g, surf) {
  let a = 0;
  for (let t = 0; t < g.i.length; t += 3) {
    const [i, j, k] = [g.i[t], g.i[t + 1], g.i[t + 2]];
    if (g.n[i * 3 + 1] >= -0.3 || (surf && g.s[i] !== surf)) continue;
    const P = v => [g.p[v * 3], g.p[v * 3 + 1], g.p[v * 3 + 2]], A = P(i), u = P(j).map((x, q) => x - A[q]), w = P(k).map((x, q) => x - A[q]);
    a += Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2;
  }
  return a;
}
for (const id of ["ladugard", "poultryBarn", "gardenCoop"]) test(`inside a walk-in building (${id}) the roof underside is raw boards in fittings, not painted trim`, () => {
  const {G, dims} = buildGeometry(preset(id));
  const boards = downArea(G.fittings, "boards"), trim = downArea(G.trim);
  assert.ok(boards >= dims.W * dims.D * 0.9, `roof boards ${boards.toFixed(1)} m² under a ${dims.W} x ${dims.D} m roof`);
  assert.ok(trim < boards * 0.2, `painted ceiling ${trim.toFixed(1)} m²`);
});

test("surface uvs are in texture repeats, and wood grain runs along a beam", () => {
  const {G} = buildGeometry(preset("ladugard"));
  const timber = splitByColor(G.fittings).find(g => g.surf === "timber");
  // the long rafters: along each long face the uv change is mostly in v (the grain)
  let du = 0, dv = 0;
  for (let t = 0; t < timber.i.length; t += 3) {
    const [a, b, c] = [timber.i[t], timber.i[t + 1], timber.i[t + 2]];
    for (const [x, y] of [[a, b], [b, c]]) { du += Math.abs(timber.uv[2 * x] - timber.uv[2 * y]); dv += Math.abs(timber.uv[2 * x + 1] - timber.uv[2 * y + 1]); }
  }
  assert.ok(dv > du * 2, `grain across the beams? du ${du.toFixed(1)} dv ${dv.toFixed(1)}`);
});

test("export: textured inside parts get their own diffuse and the surface's normal map", () => {
  const p = preset("ladugard"), xml = buildI3d(p, {withTex: true});
  assert.match(xml, /filename="textures\/fit_concrete_[0-9a-f]{6}\.png"/);
  assert.match(xml, /filename="textures\/fit_concrete_normal\.png"/);
  assert.match(xml, /filename="textures\/fit_timber_[0-9a-f]{6}\.png"/);
  const files = fittingTextures(p);
  assert.ok(files.length > 5);
  for (const f of files) {
    assert.ok(SURFACES[f.surf]);
    assert.match(f.color, /^#[0-9a-f]{6}$/);
    assert.ok(xml.includes(`filename="${f.diffuse}"`), f.diffuse);
    assert.ok(xml.includes(`filename="${f.normal}"`), f.normal);
  }
  // without textures it's colours only, as before
  assert.doesNotMatch(buildI3d(p, {withTex: false}), /fit_/);
});

test("export: the plinth is concrete and the door painted planks", () => {
  const xml = buildI3d(sanitize({}), {withTex: true});
  assert.match(xml, /filename="textures\/foundation_diffuse\.png"/);
  assert.match(xml, /filename="textures\/door_diffuse\.png"/);
});
