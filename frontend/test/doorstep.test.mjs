// A door on a high foundation gets steps (risers of about 18 cm) down to the ground: a single block would be a big step up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, WP } from "../src/editor/model.mjs";

/** The height of the first triangle of mesh g under (x, y0, z), straight down, or null. */
function topBelow(g, x, y0, z) {
  let best = null;
  for (let t = 0; t < g.i.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map(k => g.i[t + k] * 3), P = g.p, v = k => [P[k], P[k + 1], P[k + 2]];
    const A = v(a), B = v(b), C = v(c);
    // (barycentric in x, z)
    const d = (B[2] - C[2]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[2] - C[2]);
    if (Math.abs(d) < 1e-12) continue;
    const l1 = ((B[2] - C[2]) * (x - C[0]) + (C[0] - B[0]) * (z - C[2])) / d, l2 = ((C[2] - A[2]) * (x - C[0]) + (A[0] - C[0]) * (z - C[2])) / d, l3 = 1 - l1 - l2;
    if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
    const y = l1 * A[1] + l2 * B[1] + l3 * C[1];
    if (y <= y0 + 1e-9 && (best === null || y > best)) best = y;
  }
  return best;
}
/** A house on a foundation of F m whose door has the porch kind given (none, shed, gable, porch). */
const house = (F, porch = "none") => { const b = sanitize({foundation: F}); return sanitize({...b, windows: b.windows.map(w => w.type === "door" ? {...w, porch, porchW: 2, porchD: 1.4} : w)}); };
const door = geo => { const e = Object.values(geo.opsByWall).flatMap(x => x.ops.map(o => ({o, w: x.w}))).find(x => x.o.kind === "door"); return e; };
const stepTops = (geo, ds) => { const {o, w} = door(geo), s = (o.s0 + o.s1) / 2; return ds.map(d => { const q = WP(w, s, 0, d); return topBelow(geo.collision, q[0], 0.95, q[2]); }); };

test("doorstep: a high foundation gives steps of about 18 cm down to the ground, in the collision too", () => {
  const geo = buildGeometry(house(0.6));
  // 0.6 m: three steps of 0.2: the landing at the door's sill (0.6), then 0.4 and 0.2, each 30 cm deep after a 70 cm landing
  const tops = stepTops(geo, [0.35, 0.85, 1.15, 1.45]);
  assert.ok(Math.abs(tops[0] - 0.6) < 1e-6, "the landing at the sill: " + tops[0]);
  assert.ok(Math.abs(tops[1] - 0.4) < 1e-6, "first step down: " + tops[1]);
  assert.ok(Math.abs(tops[2] - 0.2) < 1e-6, "second step down: " + tops[2]);
  assert.equal(tops[3], null, "then the ground");
});

test("doorstep: a low foundation keeps one step, none at all without a foundation, a porch has its own stairs", () => {
  const low = stepTops(buildGeometry(house(0.2)), [0.35, 0.85]);
  assert.ok(Math.abs(low[0] - 0.2) < 1e-6 && low[1] === null, JSON.stringify(low));
  const one = stepTops(buildGeometry(house(0.4)), [0.35, 0.85, 1.15]);
  assert.ok(Math.abs(one[0] - 0.4) < 1e-6 && Math.abs(one[1] - 0.2) < 1e-6 && one[2] === null, "0.4: a landing and one step: " + JSON.stringify(one));
  const flat = buildGeometry(house(0));
  assert.deepEqual(stepTops(flat, [0.35, 0.85]), [null, null]);
  // a door with a porch: the porch's deck and stairs as before (not the doorstep's)
  const porch = buildGeometry(house(0.6, "porch"));
  assert.ok(stepTops(porch, [0.35])[0] > 0.55);
  // a canopy over the door (shed, gable) has the same steps as no porch
  for (const kind of ["shed", "gable"]) assert.deepEqual(stepTops(buildGeometry(house(0.6, kind)), [0.35, 0.85, 1.15, 1.45]).map(v => v && +v.toFixed(3)), [0.6, 0.4, 0.2, null], kind);
});
