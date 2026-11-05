import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, PRESETS } from "../src/editor/model.mjs";
import { WALL_T } from "../src/editor/layout.mjs";

const TH = 0.16; // the roof slab's thickness
const preset = id => sanitize(PRESETS.find(x => x.id === id).settings);
const verts = g => { const out = []; for (let i = 0; i < g.p.length; i += 3) out.push([g.p[i], g.p[i + 1], g.p[i + 2]]); return out; };
/** Corners and the middle of every triangle (a face can sag between corners that are fine). */
const points = g => {
  const v = verts(g), out = [...v];
  for (let k = 0; k < g.i.length; k += 3) out.push([0, 1, 2].map(a => (v[g.i[k]][a] + v[g.i[k + 1]][a] + v[g.i[k + 2]][a]) / 3));
  return out;
};
/** The barn's frame: b across the ridge, the roof underside at b, and whether (x, z) is inside the walls. */
function frame(p) {
  const geo = buildGeometry(p), {W, D, ridgeY} = geo.dims, tanP = Math.tan(p.roofPitch * Math.PI / 180);
  const ridgeX = p.ridge === "width";
  const b = ([x, , z]) => ridgeX ? z : x;
  return {geo, ridgeY, tanP, b, under: q => ridgeY - TH - tanP * Math.abs(b(q)),
    inside: ([x, , z]) => Math.abs(x) < W / 2 - WALL_T - 0.01 && Math.abs(z) < D / 2 - WALL_T - 0.01};
}

test("ventilators: nothing of their outside shows under the roof of a walk-in barn", () => {
  const p = preset("ladugard");
  assert.ok(p.ventilators > 0);
  const f = frame(p);
  for (const m of ["walls", "roof", "trim"]) for (const q of points(f.geo.G[m])) {
    if (f.inside(q)) assert.ok(q[1] >= f.under(q) - 1e-6, `${m} vertex ${q.map(v => v.toFixed(2))} hangs below the roof underside ${f.under(q).toFixed(2)}`);
  }
});

test("ventilators: a walk-in barn has a duct under each, down from the ridge", () => {
  const p = preset("ladugard"), f = frame(p);
  // the duct's bottom: about 70 cm under where the roof meets its sides, near the ridge
  const low = verts(f.geo.G.fittings).filter(q => Math.abs(f.b(q)) < 0.4 && q[1] < f.ridgeY - TH - 0.6 && q[1] > f.ridgeY - 2.2);
  assert.ok(low.length > 0, "duct boards hang down inside");
  const none = frame({...p, ventilators: 0});
  assert.ok(verts(none.geo.G.fittings).filter(q => Math.abs(none.b(q)) < 0.4 && q[1] < none.ridgeY - TH - 0.6 && q[1] > none.ridgeY - 2.2).length < low.length);
});

test("ventilators: the duct inside is galvanised steel, not boards", () => {
  const p = preset("ladugard"), f = frame(p), g = f.geo.G.fittings;
  const duct = [];
  for (let k = 0; k < g.p.length; k += 3) {
    const q = g.p.slice(k, k + 3);
    if (Math.abs(f.b(q)) < 0.4 && q[1] < f.under(q) - 0.05 && q[1] > f.ridgeY - 2.2) duct.push(g.s[k / 3]);
  }
  assert.ok(duct.filter(s => s === "galv").length > 50, "a steel duct");
  assert.ok(!duct.includes("boards") && !duct.includes("wood"), "no boards under the roof");
});

test("roof frame: a walk-in barn shows rafters and beams under its roof, a farmhouse doesn't", () => {
  const p = preset("ladugard"), f = frame({...p, ventilators: 0});
  const top = p.foundation + p.floors * p.floorHeight;
  const high = verts(f.geo.G.fittings).filter(q => q[1] > top - 0.3 && f.inside(q));
  assert.ok(high.length > 100, "rafters, a ridge beam and ties");
  for (const q of high) assert.ok(q[1] <= f.under(q) + 1e-6, "all of it under the roof");
  assert.equal(buildGeometry(sanitize({})).G.fittings.i.length, 0);
});

test("inside walls: a darker band and a kickboard at the bottom, none across the door", () => {
  const p = preset("fahus"), geo = buildGeometry(p);
  const g = geo.G.fittings, colors = new Set();
  for (let k = 0; k < g.c.length; k += 3) colors.add(g.c.slice(k, k + 3).map(v => v.toFixed(3)).join(","));
  assert.ok(colors.size >= 4, "whitewash, grime, kickboard, floor ...");
  // nothing of the kickboard in the doorway
  const {ops, w} = geo.opsByWall[p.doorWall], door = ops.find(o => o.kind === "door");
  const inDoor = verts(g).filter(q => {
    const s = (q[0] - w.o[0]) * w.u[0] + (q[2] - w.o[2]) * w.u[2], d = (q[0] - w.o[0]) * w.n[0] + (q[2] - w.o[2]) * w.n[2];
    return s > door.s0 + 0.01 && s < door.s1 - 0.01 && d < -WALL_T + 0.001 && d > -WALL_T - 0.04 && q[1] < p.foundation + 0.3 && q[1] > p.foundation + 0.05;
  });
  assert.deepEqual(inDoor, []);
  // and there is one along the walls: boards 2.5 cm proud of the inside face, up to 28 cm
  const board = verts(g).filter(q => { const d = (q[0] - w.o[0]) * w.n[0] + (q[2] - w.o[2]) * w.n[2]; return Math.abs(d + WALL_T + 0.025) < 0.001 && Math.abs(q[1] - p.foundation - 0.28) < 0.001; });
  assert.ok(board.length >= 4, "a kickboard along the door wall");
});

/* ---------- Bent pipes and the floor ---------- */
import { tubeRings } from "../src/editor/model.mjs";
const dist = (q, a, d) => { const v = q.map((x, i) => x - a[i]), t = v[0] * d[0] + v[1] * d[1] + v[2] * d[2]; return Math.hypot(...v.map((x, i) => x - t * d[i])); };
const unit = v => { const l = Math.hypot(...v); return v.map(x => x / l); };

test("a bent pipe is one tube: each ring at a bend is on the pipe's surface of both segments, so no gaps or steps", () => {
  const pts = [[0, 0, 0], [0, 1, 0], [0, 1.3, 0.25], [0, 1.3, 0.8], [0.2, 1.1, 1.0]], r = 0.03;
  const rings = tubeRings(pts, r, 8);
  assert.equal(rings.length, pts.length);
  for (const ring of rings) assert.equal(ring.length, 8);
  for (let k = 0; k < pts.length; k++) for (const q of rings[k]) {
    if (k > 0) assert.ok(Math.abs(dist(q, pts[k - 1], unit(pts[k].map((v, i) => v - pts[k - 1][i]))) - r) < 1e-9, `ring ${k} off the segment before`);
    if (k + 1 < pts.length) assert.ok(Math.abs(dist(q, pts[k], unit(pts[k + 1].map((v, i) => v - pts[k][i]))) - r) < 1e-9, `ring ${k} off the segment after`);
  }
});

test("the floor finish is thin, so bedding, droppings and plates on the floor show above it", () => {
  const p = preset("poultryBarn"), {G, dims} = buildGeometry(p), g = G.fittings, litter = [0xB8 / 255, 0x93 / 255, 0x5A / 255];
  let top = -Infinity;
  for (let k = 0; k < g.p.length; k += 3) if (litter.every((c, i) => Math.abs(g.c[k + i] - c) < 1e-6)) top = Math.max(top, g.p[k + 1]);
  assert.ok(top > dims.F - 1e-9 && top <= dims.F + 0.005 + 1e-9, `floor finish top ${(top - dims.F).toFixed(3)} m over the slab`);
});

test("a hairpin bend in a pipe stays close to the pipe", () => {
  const pts = [[0, 0, 0], [0, 0.1, 0], [0, 0.1001, 0.005], [0, 0, 0.01]];
  for (const ring of tubeRings(pts, 0.004, 4)) for (const q of ring) assert.ok(Math.hypot(q[0], q[1] - 0.05, q[2]) < 0.1, `ring point ${q} far off`);
});
