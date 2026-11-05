import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, PRESETS, kindOf } from "../src/editor/model.mjs";
import { WALL_T } from "../src/editor/layout.mjs";
import { WINDOW_STYLES, DOOR_STYLES } from "../src/editor/openings.mjs";

// Two visible faces in the same plane, facing the same way and overlapping, flicker in the game
// (z-fighting): it can't tell which is in front. This looks for them in every preset.

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Triangles of the visible meshes: {m, pts, n, d} (unit normal n, plane n·x = d). */
function triangles(G, mats) {
  const out = [];
  for (const m of mats) {
    const g = G[m];
    for (let t = 0; t < g.i.length; t += 3) {
      const pts = [0, 1, 2].map(k => { const v = g.i[t + k]; return [g.p[v * 3], g.p[v * 3 + 1], g.p[v * 3 + 2]]; });
      const c = cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])), l = Math.hypot(...c);
      if (l < 1e-8) continue;
      const n = c.map(v => v / l);
      out.push({m, pts, n, d: dot(n, pts[0]), area: l / 2});
    }
  }
  return out;
}
/** Whether two triangles in one plane (normal n) overlap by more than a sliver (shared edges don't count). */
function overlap(a, b, n) {
  // 2D in the plane
  const u = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], e1 = cross(n, u), l1 = Math.hypot(...e1), x = e1.map(v => v / l1), y = cross(n, x);
  const P = t => t.pts.map(q => [dot(q, x), dot(q, y)]);
  const A = P(a), B = P(b), eps = 0.002;
  for (const T of [A, B]) for (let k = 0; k < 3; k++) {
    const p = T[k], q = T[(k + 1) % 3], ax = [q[1] - p[1], p[0] - q[0]], al = Math.hypot(...ax) || 1;
    const pr = S => S.map(s => (s[0] * ax[0] + s[1] * ax[1]) / al);
    const [pa, pb] = [pr(A), pr(B)];
    if (Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) < eps) return false;
  }
  return true;
}
/**
 * Whether a face can't be seen: it faces into the ground, the plinth or a solid wall (just in front of
 * it is solid). A house is solid inside its walls; a walk-in building only in its walls' thickness.
 */
function hidden(t, geo, walkIn, F) {
  const c = [0, 1, 2].map(i => (t.pts[0][i] + t.pts[1][i] + t.pts[2][i]) / 3 + 0.005 * t.n[i]);
  const {W, D, top} = geo.dims, ax = Math.abs(c[0]), az = Math.abs(c[2]);
  if (c[1] < 0) return true;
  if (c[1] < F && ax < W / 2 + 0.06 && az < D / 2 + 0.06) return true;
  if (c[1] >= top || ax >= W / 2 || az >= D / 2) return false;
  // in an opening (a window's sash, a door in its reveal) is seen
  for (const {w, ops} of Object.values(geo.opsByWall)) {
    const v = [c[0] - w.o[0], c[1] - w.o[1], c[2] - w.o[2]], s = v[0] * w.u[0] + v[2] * w.u[2], d = v[0] * w.n[0] + v[2] * w.n[2];
    if (d < -WALL_T - 0.02 || d > 0.01) continue;
    if (ops.some(o => s > o.s0 - 0.01 && s < o.s1 + 0.01 && v[1] > o.t0 - 0.01 && v[1] < o.t1 + 0.01)) return false;
  }
  return !walkIn || ax > W / 2 - WALL_T || az > D / 2 - WALL_T;
}
/** Overlapping coplanar same-facing pairs that can be seen: [{a, b}] (at most max). */
function flickers(geo, mats, {walkIn = false, F = 0, max = 5} = {}) {
  const buckets = new Map();
  for (const t of triangles(geo.G, mats)) {
    if (hidden(t, geo, walkIn, F)) continue;
    const key = t.n.map(v => Math.round(v * 200)).join(",") + "|" + Math.round(t.d * 500);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(t);
  }
  const found = [];
  for (const list of buckets.values()) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (Math.abs(a.d - b.d) > 0.0005 || dot(a.n, b.n) < 0.9999) continue;
    if (overlap(a, b, a.n)) { found.push({a, b}); if (found.length >= max) return found; }
  }
  return found;
}
const show = ({a, b}) => `${a.m} and ${b.m} at ${a.pts[0].map(v => v.toFixed(2))} facing ${a.n.map(v => v.toFixed(2))}`;

// The building's shell (the inside pieces are drawn by the kinds and have their own tests).
const SHELL = ["walls", "trim", "roof", "door", "foundation", "chimney", "gutter", "iron", "glass"];

for (const pr of PRESETS) test(`no flickering faces on the outside of ${pr.id}`, () => {
  const p = sanitize(pr.settings), f = flickers(buildGeometry(p), SHELL, {walkIn: !!kindOf(p).walkIn, F: p.foundation});
  assert.equal(f.length, 0, f.map(show).join("\n"));
});

test("no flickering faces with a porch or steps at the door", () => {
  for (const entrance of ["porch", "shed", "gable", "none"]) for (const foundation of [0.3, 0.8]) {
    const f = flickers(buildGeometry(sanitize({entrance, foundation})), SHELL, {F: foundation});
    assert.equal(f.length, 0, `${entrance}, foundation ${foundation}:\n` + f.map(show).join("\n"));
  }
});

test("no flickering faces with any window or door style, on a house and in a barn", () => {
  for (const base of [{}, PRESETS.find(x => x.id === "ladugard").settings]) for (const s of WINDOW_STYLES) for (const d of DOOR_STYLES) for (const doorW of [1, 2.2]) {
    const p = sanitize({...base, winStyle: s.id, doorStyle: d.id, doorW}), f = flickers(buildGeometry(p), SHELL, {walkIn: !!kindOf(p).walkIn, F: p.foundation});
    assert.equal(f.length, 0, `${p.kind} ${s.id} ${d.id} ${doorW} m:\n` + f.map(show).join("\n"));
  }
});
