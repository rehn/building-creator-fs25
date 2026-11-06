import { test } from "node:test";
import assert from "node:assert/strict";
import { agedColor, weather, MASK_RGB, AGED_KINDS } from "../src/editor/age.mjs";
import { paintSurface } from "../src/editor/surfaces.mjs";
import { sanitize, colorFor, surfaceSpec, buildI3d } from "../src/editor/model.mjs";

const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const sat = hex => { const c = rgb(hex); return (Math.max(...c) - Math.min(...c)) / 255; };
const lum = hex => { const [r, g, b] = rgb(hex); return 0.299 * r + 0.587 * g + 0.114 * b; };
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;

test("aged colours: new paint is as chosen; old paint is duller, an old roof darker", () => {
  for (const m of ["walls", "roof", "trim", "door", "foundation"]) assert.equal(agedColor("#8E2A1E", 0, m), "#8E2A1E");
  assert.ok(sat(agedColor("#8E2A1E", 30, "walls")) < sat("#8E2A1E") - 0.05, "faded red");
  assert.ok(sat(agedColor("#8E2A1E", 50, "walls")) < sat(agedColor("#8E2A1E", 20, "walls")), "more years, more faded");
  assert.ok(lum(agedColor("#2B2D2F", 30, "roof")) <= lum("#2B2D2F") + 1, "roof no lighter");
  assert.ok(lum(agedColor("#B0B0B0", 30, "foundation")) < lum("#B0B0B0"), "plinth dirtier");
  assert.equal(agedColor("#2E3B44", 40, "glass"), "#2E3B44", "glass doesn't age");
});

test("settings: an age in years, 0 by default, up to 60", () => {
  assert.equal(sanitize({}).age, 0);
  assert.equal(sanitize({age: 30}).age, 30);
  assert.equal(sanitize({age: 500}).age, 60);
  for (const kind of ["chicken", "cow"]) assert.equal(sanitize({kind, age: 25}).age, 25);
});

test("an old building: its colours are aged in the preview and the export, the textures know the age", () => {
  const p = sanitize({age: 30}), q = sanitize({});
  assert.notEqual(colorFor(p, "walls"), colorFor(q, "walls"));
  assert.equal(colorFor(q, "walls"), q.wallColor);
  assert.equal(surfaceSpec(p, "walls").age, 30);
  assert.notEqual(buildI3d(sanitize({wallCladding: "plaster", roofMaterial: "plain", age: 30})), buildI3d(sanitize({wallCladding: "plaster", roofMaterial: "plain"})));
});

/** A test map: N x N, values from the inside surfaces or flat. */
const base = (kind, N = 128) => kind && paintSurface(kind).N === N ? paintSurface(kind) : {N, S: new Float32Array(N * N).fill(1), H: new Float32Array(N * N).fill(0.5)};

test("weathering: nothing at 0 years", () => {
  const b = base(null);
  const w = weather({S: b.S, H: b.H, Mk: null, N: b.N}, "lockpanel", 0);
  assert.deepEqual(Array.from(w.S), Array.from(b.S));
  assert.ok(!w.Mk || w.Mk.every(v => v === 0));
});

for (const kind of AGED_KINDS) test(`weathering ${kind}: dirtier with the years, tiles, the same every time`, () => {
  const b = base(null), N = b.N;
  const at = years => weather({S: b.S, H: b.H, Mk: null, N}, kind, years);
  const w30 = at(30), w60 = at(60);
  assert.equal(w30.S.length, N * N);
  assert.ok(mean(Array.from(w30.S)) < 1, `${kind}: no dirt after 30 years`);
  const marks = w => w.Mk ? w.Mk.filter(v => v > 0).length : 0;
  assert.ok(marks(w60) >= marks(w30), `${kind}: fewer marks after 60 years than 30`);
  for (const v of w30.Mk || []) assert.ok(v === 0 || MASK_RGB[v], `unknown mark ${v}`);
  assert.deepEqual(Array.from(at(30).S.slice(0, 50)), Array.from(w30.S.slice(0, 50)));
  // across the seam it changes about as much as inside
  const S = w30.S;
  let seam = 0, inside = 0;
  for (let y = 0; y < N; y++) { seam += Math.abs(S[y * N + N - 1] - S[y * N]); inside += Math.abs(S[y * N + N / 2 - 1] - S[y * N + N / 2]); }
  assert.ok(seam <= inside * 2.5 + N * 0.02, `${kind}: seam ${seam.toFixed(2)} vs ${inside.toFixed(2)}`);
});

test("weathering: old paint peels to grey wood, an old tile roof grows moss, an old metal roof rusts", () => {
  const b = base(null), N = b.N, has = (kind, code) => (weather({S: b.S, H: b.H, Mk: null, N}, kind, 40).Mk || []).some(v => v === code);
  assert.ok(has("lockpanel", 2), "bare wood");
  assert.ok(has("tiles", 3), "moss");
  assert.ok(has("metal", 4), "rust");
  // brick keeps its mortar
  const Mk = new Uint8Array(N * N).fill(1);
  assert.ok(weather({S: b.S, H: b.H, Mk, N}, "brick", 30).Mk.filter(v => v === 1).length > N * N / 2);
});

test("vertical boards: a wall cladding of its own, with a texture spec, that weathers like the other painted wood", () => {
  const p = sanitize({wallCladding: "vertical", panelSpacing: 0.15});
  assert.equal(p.wallCladding, "vertical");
  const s = surfaceSpec(p, "walls");
  assert.equal(s.kind, "vertical");
  assert.ok(s.n >= 2 && Math.abs(s.w - s.n * 0.15) < 1e-9);
  assert.ok(AGED_KINDS.includes("vertical"));
  const b = base(null), w = weather({S: b.S, H: b.H, Mk: null, N: b.N}, "vertical", 40);
  assert.ok((w.Mk || []).some(v => v > 0), "bare wood shows through the paint when old");
  assert.equal(sanitize({lowerCladding: "vertical", wallSplit: "floor"}).lowerCladding, "vertical");
});
