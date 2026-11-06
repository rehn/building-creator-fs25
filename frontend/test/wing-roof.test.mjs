// A wing's roof covers the wing: seen from straight above (back faces culled, as in the game) nothing of the inside shows over it. Once the roof of a
// wing one floor lower than the house, with its ridge just over the house's eaves, was cut away along its whole slope next to the house.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, PRESETS, MATS } from "../src/editor/model.mjs";

/** The first front-facing triangle of the building going straight down at (x, z) from high above: its material, or null. */
function fromAbove(G, x, z) {
  let best = null;
  const o = [x, 60, z], d = [0, -1, 0];
  for (const m of MATS) {
    const g = G[m];
    if (!g || m === "interior" || m === "curtain") continue;
    for (let t = 0; t < g.i.length; t += 3) {
      const v = k => [g.p[g.i[t + k] * 3], g.p[g.i[t + k] * 3 + 1], g.p[g.i[t + k] * 3 + 2]], a = v(0), b = v(1), c = v(2);
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      if (e1[2] * e2[0] - e1[0] * e2[2] <= 0 && m !== "glass") continue;   // n.y <= 0: not facing up
      const den = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
      if (Math.abs(den) < 1e-12) continue;
      const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / den, l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / den, l3 = 1 - l1 - l2;
      if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
      const y = l1 * a[1] + l2 * b[1] + l3 * c[1];
      if (!best || y > best.y) best = {m, y};
    }
  }
  return best;
}
const ROOFY = new Set(["roof", "gutter", "trim", "chimney"]);
/** Points over the wing's footprint (inside its eaves, 20 cm in from the edges) whose top is not a roof part: [[x, z, what]]. */
function bare(p, step = 1) {
  const geo = buildGeometry(p), W = geo.wings[0], r = W.rect, out = [];
  for (let x = r.x0 + 0.3; x < r.x1 - 0.2; x += step) for (let z = r.z0 + 0.3; z < r.z1 - 0.2; z += step) {
    const h = fromAbove(geo.G, x, z);
    if (!h || !ROOFY.has(h.m)) out.push([+x.toFixed(1), +z.toFixed(1), h ? h.m + " at " + h.y.toFixed(1) : "nothing"]);
  }
  return {out, type: W.type};
}
const barn = {...PRESETS.find(x => x.id === "ladugard").settings, width: 18, depth: 30, floors: 2, floorHeight: 4, ridge: "depth", roofPitch: 35, overhang: 0.4};
const wing = (extra = {}) => ({wall: "right", pos: 0.85, width: 12, depth: 23.9, floors: 1, half: false, pitch: 0, ...extra});

for (const [name, s] of Object.entries({
  "a wing one floor lower, its ridge just over the eaves (as photographed)": {...barn, wings: [wing()]},
  "the same, a little narrower and wider": {...barn, wings: [wing({width: 11})]},
  "wider": {...barn, wings: [wing({width: 14})]},
  "on the left side": {...barn, wings: [wing({wall: "left", pos: 0.2})]},
  "a wing as high as the house (a true valley)": {...barn, wings: [wing({floors: 0, width: 9})]},
  "a house, a wing a floor lower": {width: 10, depth: 7, floors: 2, wings: [{wall: "back", pos: 0.5, width: 6, depth: 5, floors: 1}]},
  "a house, a wing as high": {width: 10, depth: 7, floors: 2, wings: [{wall: "back", pos: 0.5, width: 5, depth: 5, floors: 0}]},
})) test(`wing roof: ${name}: nothing but roof over the wing seen from above`, () => {
  const {out, type} = bare(sanitize(s));
  assert.equal(out.length, 0, `${type}: ${JSON.stringify(out.slice(0, 8))}`);
});
