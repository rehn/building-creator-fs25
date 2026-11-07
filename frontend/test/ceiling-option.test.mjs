// A ceiling over the ground floor can be chosen for any walk-in building: with it you don't see up to the ridge.
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

test("ceiling option: on for a house, off for a barn, to start with; the save's choice is kept", () => {
  assert.equal(sanitize({}).ceiling, true);
  assert.equal(sanitize({kind: "cow"}).ceiling, false);
  assert.equal(sanitize({kind: "chicken"}).ceiling, false);
  assert.equal(sanitize({ceiling: false}).ceiling, false);
  assert.equal(sanitize({kind: "cow", ceiling: true}).ceiling, true);
});

test("ceiling option: a barn with a ceiling has one at the walls' top, a house without sees up into the roof", () => {
  const barn = sanitize({kind: "cow", ceiling: true, items: [], width: 12, depth: 8, floors: 1, floorHeight: 3}), F = barn.foundation;
  const hit = above(buildGeometry(barn).G, 0, F + 0.5, 0);
  assert.ok(hit && hit.m === "fittings" && Math.abs(hit.y - (F + 3)) < 1e-6, JSON.stringify(hit));
  const open = sanitize({kind: "cow", items: [], width: 12, depth: 8, floors: 1, floorHeight: 3}), h2 = above(buildGeometry(open).G, 0, F + 0.5, 0);
  assert.ok(!h2 || h2.y > F + 3 + 0.01, "no ceiling: " + JSON.stringify(h2));
  const house = sanitize({floors: 2, floorHeight: 2.7, items: []}), hh = above(buildGeometry(house).G, 0, house.foundation + 0.5, 0);
  assert.ok(Math.abs(hh.y - (house.foundation + 2.7)) < 1e-6, "a house has its ceiling");
  const bare = sanitize({floors: 2, floorHeight: 2.7, items: [], ceiling: false}), hb = above(buildGeometry(bare).G, 0, bare.foundation + 0.5, 0);
  assert.ok(!hb || hb.y > bare.foundation + 2.7 + 0.01, "without: " + JSON.stringify(hb));
});
