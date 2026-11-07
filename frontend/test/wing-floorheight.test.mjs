// A wing can have a floor height of its own (0: the house's): its walls, windows, ceiling and the passage into it follow.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, MATS } from "../src/editor/model.mjs";

function above(G, x, y0, z) {
  let best = null;
  for (const m of MATS) {
    const g = G[m];
    for (let t = 0; t < g.i.length; t += 3) {
      const v = k => [g.p[g.i[t + k] * 3], g.p[g.i[t + k] * 3 + 1], g.p[g.i[t + k] * 3 + 2]], a = v(0), b = v(1), c = v(2);
      const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
      if (Math.abs(d) < 1e-12) continue;
      const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d, l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d, l3 = 1 - l1 - l2;
      if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
      const y = l1 * a[1] + l2 * b[1] + l3 * c[1];
      if (y > y0 + 1e-6 && (!best || y < best.y)) best = {y, m};
    }
  }
  return best;
}
const house = (fh, extra = {}) => sanitize({floors: 2, floorHeight: 2.7, wings: [{wall: "back", pos: 0.5, width: 5, depth: 5, floors: 1, floorHeight: fh, ...extra}]});

test("wing floor height: 0 follows the house, else 2.3 to 9 m", () => {
  assert.equal(house(undefined).wings[0].floorHeight, 0);
  assert.equal(house(0).wings[0].floorHeight, 0);
  assert.equal(house(3.6).wings[0].floorHeight, 3.6);
  assert.equal(house(99).wings[0].floorHeight, 9);
  assert.equal(house(1).wings[0].floorHeight, 2.3);
});

test("wing floor height: the wing's walls are as tall as its floors", () => {
  assert.equal(buildGeometry(house(0)).wings[0].H, 2.7);
  assert.equal(buildGeometry(house(3.6)).wings[0].H, 3.6);
  assert.equal(buildGeometry(house(3.6, {floors: 0})).wings[0].H, 2 * 3.6, "all the house's floors");
});

test("wing floor height: the ceiling over the wing is at its own height, the passage up to the lower of the two", () => {
  for (const fh of [3.6, 2.4]) {
    const p = house(fh), geo = buildGeometry(p), F = p.foundation;
    const hit = above(geo.G, 0, F + 0.5, -6);
    assert.ok(hit && hit.m === "fittings" && Math.abs(hit.y - (F + fh)) < 1e-6, `wing ${fh}: ${JSON.stringify(hit)}`);
    const open = geo.opsByWall.back.ops.find(o => o.kind === "open");
    assert.ok(Math.abs(open.t1 - Math.min(2.7, fh)) < 1e-9, `passage ${open.t1}`);
    // no seam over the passage's thickness
    const seam = above(geo.G, 0, F + Math.min(2.7, fh) - 0.4, -3.43);
    assert.ok(seam && seam.m === "fittings" && Math.abs(seam.y - (F + Math.min(2.7, fh))) < 1e-6, JSON.stringify(seam));
  }
});

test("wing floor height: windows on a wing's wall are placed by the wing's floor height", () => {
  const p = house(4, {floors: 2}), ops = buildGeometry(p).opsByWall;
  const key = Object.keys(ops).find(k => /^w1/.test(k) && ops[k].ops.some(o => o.kind === "window"));
  if (!key) return;
  const up = ops[key].ops.filter(o => o.kind === "window" && o.t0 >= 4);
  assert.ok(up.every(o => o.t0 >= 4 + 0.2), "second-floor windows start above the wing's first floor (4 m)");
});
