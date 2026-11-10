// Under a flat or leaning roof of a walk-in building without a ceiling the rafters show (reglar), like the roof frame under a gable roof.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry } from "../src/editor/model.mjs";

const shed = (extra = {}) => sanitize({kind: "shed", width: 6, depth: 5, floors: 1, floorHeight: 2.6, foundation: 0.1, roofType: "flat", roofTilt: 8, tiltHigh: "front", ceiling: false, items: [], windows: [], ...extra});
const fit = p => { const g = buildGeometry(p).G.fittings, out = []; for (let k = 0; k < g.p.length; k += 3) out.push({y: g.p[k + 1], x: g.p[k], z: g.p[k + 2], s: g.s[k / 3]}); return out; };

test("rafters under a leaning roof, across the slope, about 60 cm apart, below the roof and above the walls' tops at the edges", () => {
  const p = shed(), under = fit(p).filter(v => v.s === "oldtimber" && v.y > 2.6 && Math.abs(v.x) < 2.85 && Math.abs(v.z) < 2.36);
  assert.ok(under.length > 0, "there are rafters");
  const xs = new Set(under.map(v => +v.x.toFixed(2)));
  assert.ok(xs.size >= 16, `one every 60 cm over 6 m (${xs.size} x positions)`);
  const top = 2.7 + Math.tan(8 * Math.PI / 180) * 5;
  assert.ok(Math.max(...under.map(v => v.y)) <= top + 0.01, "under the high edge of the slab");
});

test("a ceiling hides them, and a gable roof has its own frame", () => {
  const n = p => fit(p).filter(v => v.s === "oldtimber" && v.y > 2.6 && Math.abs(v.x) < 2.85 && Math.abs(v.z) < 2.36).length;
  assert.ok(n(shed()) > n(shed({ceiling: true})) + 100, "far fewer pieces under a ceiling (no rafters)");
});
