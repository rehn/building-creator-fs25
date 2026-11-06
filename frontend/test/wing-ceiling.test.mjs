// Where a wing opens into the house the ceiling runs on without a seam: no lintel dropping below it, nothing but the ceiling above the passage.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, MATS } from "../src/editor/model.mjs";

/** The first triangle above (x, y0, z) going straight up: {y, m} or null. */
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

for (const [name, wing] of [["as the house", {floors: 0}], ["one floor", {floors: 1}]]) {
  test(`wing ceiling (${name}): one ceiling over the house, the passage and the wing`, () => {
    const p = sanitize({floors: 2, wings: [{wall: "back", pos: 0.5, width: 5, depth: 5, ...wing}]}), geo = buildGeometry(p), y = p.foundation + p.floorHeight;
    // across the passage (x = 0), through the thickness of the house's wall (z -3.5 to -3.35) and on both sides
    for (let z = -4.5; z <= -2.5; z += 0.05) {
      const hit = above(geo.G, 0, y - 0.4, z);
      assert.ok(hit && hit.m === "fittings" && Math.abs(hit.y - y) < 1e-6, `z ${z.toFixed(2)}: ${JSON.stringify(hit)}`);
    }
    // the passage reaches the ceiling: its opening goes up to it, with no lintel
    const open = geo.opsByWall.back.ops.find(o => o.kind === "open");
    assert.ok(Math.abs(open.t1 - p.floorHeight) < 1e-9, `passage up to the ceiling: ${open.t1}`);
  });
}

test("wing ceiling: a barn's wing keeps its lintel (no ceiling there)", () => {
  const barn = sanitize({kind: "cow", wings: [{wall: "front", pos: 0.35, width: 6, depth: 6, floors: 0}]}), open = buildGeometry(barn).opsByWall.front.ops.find(o => o.kind === "open");
  assert.ok(open && open.t1 < barn.floors * barn.floorHeight - 0.2, `${open && open.t1}`);
});
