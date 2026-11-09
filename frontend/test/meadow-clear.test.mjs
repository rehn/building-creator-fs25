// The meadow a player plans over the pasture must leave the ground under the barn alone (the barn's floor got grass): the husbandry has a clear task round the building, like the base game's cow barn.
import test from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildI3d, placeableXml } from "../src/editor/model.mjs";
import { footprintHull } from "../src/editor/kinds/pasture.mjs";

const wing = (o = {}) => ({id: 1, wall: "left", pos: 0.5, width: 5, depth: 4, floors: 0, ...o});

for (const kind of ["cow", "sheep"]) test(`${kind} barn: a clear task round the building in the meadow`, () => {
  const p = sanitize({kind, wings: [wing()]}), xml = placeableXml(p, "x"), i3d = buildI3d(p);
  const task = /<clearTask>([\s\S]*?)<\/clearTask>/.exec(xml);
  assert.ok(task, "a clearTask");
  const nodes = [...task[1].matchAll(/<node node="(clearAreaPoint\d+)"/g)].map(m => m[1]);
  assert.ok(nodes.length >= 4, `polygon points (${nodes.length})`);
  for (const n of nodes) assert.ok(i3d.includes(`name="${n}"`), `${n} is in the scene`);
  assert.ok(/<terrainGroundType name="dirt"/.test(task[1]), "dirt under it");
});

test("the hull of a building's footprints covers them all, grown by the margin", () => {
  const p = sanitize({kind: "cow", wings: [wing()]});
  const hull = footprintHull(p, 0.5), xs = hull.map(q => q[0]), zs = hull.map(q => q[1]);
  assert.ok(Math.min(...xs) <= -p.width / 2 - 4 - 0.4, "reaches the wing");
  assert.ok(Math.max(...xs) >= p.width / 2 + 0.4 && Math.max(...zs) >= p.depth / 2 + 0.4 && Math.min(...zs) <= -p.depth / 2 - 0.4, "and the main building");
});
