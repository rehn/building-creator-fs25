// The ceiling of a house and the underside of its roof must not lie in one plane: a flat roof's soffit is at the walls' top, where a one-floor house's ceiling is,
// and the two flickered (red trim and cream plaster) over the whole room (seen in the game).
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry } from "../src/editor/model.mjs";

/** Downward-facing horizontal triangles of the materials, as {m, y, x0, x1, z0, z1}. */
function undersides(G, mats) {
  const out = [];
  for (const m of mats) {
    const g = G[m]; if (!g) continue;
    for (let t = 0; t < g.i.length; t += 3) {
      const P = [0, 1, 2].map(k => { const v = g.i[t + k]; return [g.p[v * 3], g.p[v * 3 + 1], g.p[v * 3 + 2]]; });
      const e1 = P[1].map((v, i) => v - P[0][i]), e2 = P[2].map((v, i) => v - P[0][i]);
      const ny = e1[2] * e2[0] - e1[0] * e2[2];   // (the y of the normal: e1 x e2)
      const len = Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], ny, e1[0] * e2[1] - e1[1] * e2[0]);
      if (len < 1e-9 || ny / len > -0.999 || Math.max(...P.map(q => q[1])) - Math.min(...P.map(q => q[1])) > 1e-4) continue;
      out.push({m, y: P[0][1], x0: Math.min(...P.map(q => q[0])), x1: Math.max(...P.map(q => q[0])), z0: Math.min(...P.map(q => q[2])), z1: Math.max(...P.map(q => q[2]))});
    }
  }
  return out;
}
const clash = (a, b) => Math.abs(a.y - b.y) < 0.001 && Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.1 && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 0.1;

for (const roofType of ["flat", "gable"]) {
  test(`the ceiling of a ${roofType}-roofed one-floor house is not in the plane of anything else seen from below`, () => {
    const p = sanitize({kind: "house", width: 10, depth: 7, roofType, floors: 1, ceiling: true});
    const ceiling = undersides(buildGeometry(p).G, ["fittings"]), others = undersides(buildGeometry(p).G, ["trim", "roof", "walls", "wallsLow", "foundation"]);
    assert.ok(ceiling.length > 0, "there is a ceiling");
    const bad = ceiling.flatMap(c => others.filter(o => clash(c, o)).map(o => `${o.m} at ${o.y}`));
    assert.deepEqual(bad, []);
  });
}
