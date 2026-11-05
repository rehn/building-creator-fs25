// A wing: an L- or T-shaped house. The wing stands against one wall of the house, with the house's
// floors, roof pitch and overhang; on a long side its roof meets the house's in a valley, on a gable
// end it is a lower annex against the gable.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, buildI3d, placementAreas, genRow, KIND, WALL_NAMES } from "../src/editor/model.mjs";
import { wingOf, WING_WALLS, wallsOf } from "../src/editor/layout.mjs";

const house = (s = {}) => sanitize({wing: true, wingWall: "back", wingPos: 0.15, wingWidth: 6, wingDepth: 5, ...s});
const verts = (G, m) => { const out = []; for (let i = 0; i < G[m].p.length; i += 3) out.push([G[m].p[i], G[m].p[i + 1], G[m].p[i + 2]]); return out; };

test("wing: off by default, its settings kept and clamped", () => {
  const d = sanitize({});
  assert.equal(d.wing, false);
  assert.equal(wingOf(d), null);
  const p = sanitize({wing: true, wingWall: "left", wingPos: 7, wingWidth: 99, wingDepth: -1});
  assert.equal(p.wing, true);
  assert.equal(p.wingWall, "left");
  assert.equal(p.wingPos, 1);
  assert.equal(sanitize({wingWall: "roof"}).wingWall, "back");
  for (const k of WING_WALLS) assert.ok(WALL_NAMES[k], k);
});

test("wing: on a long side it meets the roof in a valley, no wider than the house is deep", () => {
  const p = house({width: 12, depth: 8, wingWidth: 20});
  const w = wingOf(p);
  assert.equal(w.type, "valley");
  assert.ok(w.ww <= 8 + 1e-9, "a wider wing would have a higher ridge than the house");
  // its roof (overhang and all) stays within the house's roof along the wall
  assert.ok(w.s0 >= -1e-9 && w.s1 <= 12 + 1e-9);
  assert.equal(wingOf(house({wingWall: "left", roofType: "gable"})).type, "gable", "on a gable end: an annex");
  assert.equal(wingOf(house({wingWall: "left", roofType: "flat"})).type, "flat");
  const hip = wingOf(house({wingWall: "left", roofType: "hip", width: 12, depth: 8}));
  assert.ok(hip.off && !hip.frames, "on a hip roof only the long sides take a wing");
  // a gable-end annex stays under the house's gable
  const g = wingOf(house({wingWall: "left", wingWidth: 7, wingPos: 0.5}));
  assert.ok(g.ww < p.depth - 0.5);
});

test("wing: its walls are where the wing is, facing out", () => {
  const p = house({width: 10, depth: 7, wingWall: "back", wingPos: 0.5, wingWidth: 6, wingDepth: 5});
  const w = wingOf(p), f = w.frames;
  // the back wall faces -z; the wing stands out behind it
  assert.deepEqual(f.wingEnd.n, [0, 0, -1]);
  assert.ok(Math.abs(f.wingEnd.o[2] - (-3.5 - 5)) < 1e-9);
  assert.equal(f.wingEnd.L, 6);
  assert.equal(f.wingLeft.L, 5);
  // a wall's "along" runs to the right as you face it from outside: cross(up, n)
  for (const k of WING_WALLS) { const {u, n} = f[k]; assert.deepEqual([n[2], 0, -n[0]].map(v => v + 0), u.map(v => v + 0), k); }
  assert.ok(w.rect.z0 < -8.4 && w.rect.z1 > -3.6 && w.rect.x1 - w.rect.x0 > 5.9);
  assert.deepEqual(Object.keys(wallsOf(p)).sort(), ["back", "front", "left", "right", ...WING_WALLS].sort());
  assert.deepEqual(Object.keys(wallsOf(sanitize({}))).sort(), ["back", "front", "left", "right"]);
});

test("wing: it is built, with windows, and covers what's behind it", () => {
  let p = house({width: 10, depth: 7, winBack: 3});
  for (const k of WING_WALLS) p.windows = genRow(p, p.windows, k, 0, k === "wingEnd" ? 2 : 1);
  const geo = buildGeometry(p);
  for (const k of WING_WALLS) assert.ok(geo.opsByWall[k], k);
  assert.equal(geo.opsByWall.wingEnd.ops.filter(o => o.kind === "window").length, 2);
  assert.equal(geo.opsByWall.wingLeft.ops.filter(o => o.kind === "window").length, 1);
  // a back window where the wing stands is hidden
  const w = wingOf(p), under = p.windows.filter(x => x.wall === "back" && x.floor === 0 && (() => { const s = x.pos * 10; return s > w.s0 && s < w.s1; })());
  assert.ok(under.length > 0 && under.every(x => x._hidden), "windows under the wing are hidden");
  // the footprint reaches out to the wing's end
  const {clear} = placementAreas(geo);
  assert.ok(clear.z0 < -3.5 - 5 + 0.1, `clear area ${clear.z0}`);
  // the export has it
  assert.ok(buildI3d(p, {}).length > 1000);
});

test("wing: the house's roof has a valley cut out where the wing's roof goes", () => {
  const p = house({width: 10, depth: 7, wingWall: "back", wingPos: 0.5, wingWidth: 5, wingDepth: 5, roofPitch: 40, chimney: false, dormers: []});
  const geo = buildGeometry(p), tan = Math.tan(40 * Math.PI / 180), top = p.foundation + p.floors * p.floorHeight;
  const ridgeY = top + 3.5 * tan, k = (7 - 5) / 2;
  // tiles (upward roof faces) on the back slope: none inside the notch b > k + |x| + margin (the wing's roof is there)
  const G = geo.G.roof;
  let inNotch = 0, wingTiles = 0;
  for (let t = 0; t < G.i.length; t += 3) {
    const v = [0, 1, 2].map(j => G.i[t + j]), c = [0, 1, 2].map(i => v.reduce((s, q) => s + G.p[q * 3 + i], 0) / 3);
    const ny = G.n[v[0] * 3 + 1];
    if (ny < 0.3) continue;
    const b = -c[2], onMain = Math.abs(c[1] - (ridgeY - b * tan)) < 0.02;
    if (onMain && b > k + Math.abs(c[0]) + 0.15 && b < 3.5 + p.overhang - 0.05) inNotch++;
    if (b > 3.5 + p.overhang + 0.3) wingTiles++;
  }
  assert.equal(inNotch, 0, "no main roof under the wing's roof");
  assert.ok(wingTiles > 0, "the wing has its own roof");
  // the gutter along the back stops at the wing (none across it)
  const gutterAcross = verts(geo.G, "gutter").filter(([x, y, z]) => Math.abs(x) < 2 && z < -3.5 - 0.3 && z > -3.5 - p.overhang - 0.3 && y > top - 1);
  assert.equal(gutterAcross.length, 0);
});

test("wing: a door on the wing works, and the sleep point goes there", async () => {
  const p = house({width: 10, depth: 7});
  p.windows = [{wall: "wingEnd", floor: 0, pos: 0.5, w: 1, h: 2.1, sill: 0, type: "door", porch: "shed"}];
  const q = sanitize(p);
  assert.equal(q.windows.filter(w => w.type === "door").length, 1, "a door on the wing counts as the house's door");
  const geo = buildGeometry(q);
  assert.equal(geo.opsByWall.wingEnd.ops.filter(o => o.kind === "door").length, 1);
  const { sleepPoint } = await import("../src/editor/model.mjs");
  // (the sleep point starts at the first door: a new house's, so its objects start over)
  const sp = sleepPoint(geo, sanitize({...q, objects: undefined}));
  assert.ok(sp.trigger.center[2] < -3.5 - 5, "in front of the wing's end");
  // without the wing a door on it doesn't count: the house gets one of its own
  const off = sanitize({...q, wing: false});
  assert.ok(off.windows.some(w => w.type === "door" && !WING_WALLS.includes(w.wall)));
});

test("wing: only houses have one (the barns' insides are one room)", () => {
  for (const kind of ["cow", "chicken"]) {
    const p = sanitize({kind, wing: true});
    assert.equal(wingOf(p), null, kind);
    assert.ok(!buildGeometry(p).opsByWall.wingEnd, kind);
    assert.ok(KIND[kind].hides.includes("Wing"), kind);
  }
});
