// A ramp down to the ground at a door, an empty doorway or the pasture's opening, when the building stands on a foundation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, PRESETS, WP } from "../src/editor/model.mjs";
import { objectOf } from "../src/editor/objects.mjs";

/** The height of the highest triangle of mesh g at or under (x, y0, z), straight down, or null. */
function topBelow(g, x, y0, z) {
  let best = null;
  for (let t = 0; t < g.i.length; t += 3) {
    const P = g.p, [A, B, C] = [0, 1, 2].map(k => { const a = g.i[t + k] * 3; return [P[a], P[a + 1], P[a + 2]]; });
    const d = (B[2] - C[2]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[2] - C[2]);
    if (Math.abs(d) < 1e-12) continue;
    const l1 = ((B[2] - C[2]) * (x - C[0]) + (C[0] - B[0]) * (z - C[2])) / d, l2 = ((C[2] - A[2]) * (x - C[0]) + (A[0] - C[0]) * (z - C[2])) / d, l3 = 1 - l1 - l2;
    if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
    const y = l1 * A[1] + l2 * B[1] + l3 * C[1];
    if (y <= y0 + 1e-9 && (best === null || y > best)) best = y;
  }
  return best;
}
const barn = s => sanitize({...PRESETS.find(x => x.id === "ladugard").settings, winBack: 0, winFront: 0, winLeft: 0, winRight: 0, ...s});
const opWith = (geo, f) => { for (const e of Object.values(geo.opsByWall)) { const o = e.ops.find(f); if (o) return {o, w: e.w}; } };
const heights = (geo, e, ds) => { const s = (e.o.s0 + e.o.s1) / 2; return ds.map(d => { const q = WP(e.w, s, 0, d); return topBelow(geo.collision, q[0], 0.7, q[2]); }); };

test("ramp: a door with a ramp slopes down to the ground (in the collision too) instead of steps", () => {
  const p0 = barn({foundation: 0.6}), d0 = p0.windows.find(w => w.type === "door");
  const p = sanitize({...p0, windows: p0.windows.map(w => w.id === d0.id ? {...w, ramp: true} : w)});
  assert.equal(p.windows.find(w => w.id === d0.id).ramp, true);
  const g = buildGeometry(p), e = opWith(g, o => o.kind === "door");
  const h = heights(g, e, [0.3, 1, 2, 3, 6]);
  assert.ok(Math.abs(h[0] - 0.6) < 0.05, "at the sill: " + h[0]);
  assert.ok(h[1] < h[0] && h[2] < h[1] && h[3] < h[2], "sloping down: " + h);
  assert.ok(h[3] === null || h[3] < 0.1, "to the ground: " + h[3]);
  assert.equal(h[4], null);
  const g0 = buildGeometry(p0), steps = heights(g0, opWith(g0, o => o.kind === "door"), [1]);
  assert.notEqual(Math.round(steps[0] * 100), Math.round(h[1] * 100), "not the steps");
});

test("ramp: an empty doorway and the pasture's opening can have one too", () => {
  const p0 = barn({foundation: 0.5}), wall = objectOf(p0, "pasture").wall;
  const hole = sanitize({...p0, windows: [...p0.windows, {id: 9, type: "door", floor: 0, wall, pos: 0.1, w: 3, h: 3, style: "hole", ramp: true}]});
  const gh = buildGeometry(hole), eh = opWith(gh, o => o.hole);
  const a = heights(gh, eh, [0.5, 1.5]);
  assert.ok(a[0] > a[1] && a[1] > 0, JSON.stringify(a));
  const gap = sanitize({...p0, objects: p0.objects.map(o => o.type === "pasture" ? {...o, gapRamp: true} : o)});
  assert.equal(objectOf(gap, "pasture").gapRamp, true);
  const gg = buildGeometry(gap), eg = opWith(gg, o => o.kind === "hatch");
  const b = heights(gg, eg, [0.5, 1.5]);
  assert.ok(b[0] > b[1] && b[1] > 0, JSON.stringify(b));
  const none = buildGeometry(p0), en = opWith(none, o => o.kind === "hatch");
  assert.equal(heights(none, en, [1.5])[0], null, "no ramp unless asked for");
});
