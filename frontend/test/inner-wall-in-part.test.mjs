// An inner wall (or any piece) in a part is as tall as the part's walls, not the main building's: a part lower than the building must not have it sticking out through its roof.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, PRESETS } from "../src/editor/model.mjs";
import { liveWings } from "../src/editor/layout.mjs";

const key = (x, y, z) => [x, y, z].map(v => v.toFixed(3)).join(",");
const verts = (p, mat = "fittings") => { const g = buildGeometry(p).G[mat], out = []; for (let k = 0; k < g.p.length; k += 3) out.push([g.p[k], g.p[k + 1], g.p[k + 2]]); return out; };

test("an inner wall in a part reaches the part's wall tops, not the main building's", () => {
  const base = sanitize({...PRESETS.find(x => x.id === "ladugard").settings, items: [], width: 24, depth: 12, floors: 1, floorHeight: 4,
    wings: [{wall: "front", pos: 0.5, width: 8, depth: 8, floors: 0, floorHeight: 2.4}]});
  const wg = liveWings(base)[0];
  assert.ok(wg.H < base.floors * base.floorHeight - 1, "the part is lower than the building");
  const c = [(wg.rect.x0 + wg.rect.x1) / 2, (wg.rect.z0 + wg.rect.z1) / 2];
  const withWall = sanitize({...base, items: [{id: 1, type: "innerwall", x: c[0], z: c[1], rot: 90, length: 3, door: 0, doorAt: 0.5, hinge: 0, swing: 1, look: 0, paperA: 0, paperB: 0}]});
  const before = new Set(verts(base).map(v => key(...v))), added = verts(withWall).filter(v => !before.has(key(...v)));
  assert.ok(added.length > 8, "the wall is built");
  const top = Math.max(...added.map(v => v[1]));
  assert.ok(top <= base.foundation + wg.H + 0.01, `its top (${top.toFixed(2)}) is under the part's wall tops (${(base.foundation + wg.H).toFixed(2)})`);
});
