// A wing's inside must be closed: seen from inside the house or the wing, with back faces culled as the game does, nothing
// shows the outdoors through a slit (once a gap of 15 cm between a wing's side wall and the house's wall did).
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, MATS } from "../src/editor/model.mjs";

/** Distance along the ray o + t d to the nearest triangle of the building facing the ray (back faces are culled), or Infinity. */
function firstFront(G, o, d) {
  let best = Infinity;
  for (const m of MATS) {
    const g = G[m];
    if (!g || m === "interior") continue;
    for (let t = 0; t < g.i.length; t += 3) {
      const a = g.i[t] * 3, b = g.i[t + 1] * 3, c = g.i[t + 2] * 3, P = g.p;
      const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      if (n[0] * d[0] + n[1] * d[1] + n[2] * d[2] >= 0 && m !== "glass") continue;
      const pv = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
      if (Math.abs(det) < 1e-12) continue;
      const tv = [o[0] - P[a], o[1] - P[a + 1], o[2] - P[a + 2]], u = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) / det;
      if (u < -1e-9 || u > 1 + 1e-9) continue;
      const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]], v = (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]) / det;
      if (v < -1e-9 || u + v > 1 + 1e-9) continue;
      const tt = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) / det;
      if (tt > 1e-6 && tt < best) best = tt;
    }
  }
  return best;
}

for (const wall of ["back", "right", "left", "front"]) {
  test(`a wing on the ${wall} wall: the passage between the house and the wing shows no slit to the outside`, () => {
    const p = sanitize({floors: 2, wings: [{wall, pos: 0.5, width: 4, depth: 5, floors: 0}]}), geo = buildGeometry(p), W = geo.wings[0], F = p.foundation;
    assert.ok(W, "the wing is built");
    // points inside the house and the wing close to where they meet, either side of the passage; rays all round at 1.2 m
    const side = {back: [0, -1], front: [0, 1], left: [-1, 0], right: [1, 0]}[wall], along = side[0] === 0, outer = along ? side[1] * p.depth / 2 : side[0] * p.width / 2, bad = [];
    for (const lateral of [-1.4, -0.7, 0.7, 1.4]) for (const d of [-1.2, -0.5, 0.4, 1.2, 2.2]) {   // d: out from the house's outer face (negative: inside the house)
      const pt = along ? [lateral, outer + side[1] * d] : [outer + side[0] * d, lateral];
      for (let k = 0; k < 72; k++) {
        const ang = k * 5 * Math.PI / 180;
        if (!isFinite(firstFront(geo.G, [pt[0], F + 1.2, pt[1]], [Math.cos(ang), 0, Math.sin(ang)]))) bad.push([+pt[0].toFixed(1), +pt[1].toFixed(1), k * 5]);
      }
    }
    // (a pair door's 1 cm gap between its leaves is not a slit: the front door is the only way out)
    assert.ok(bad.length <= 1, `see-through: ${JSON.stringify(bad.slice(0, 6))}`);
  });
}
