// The game wants every uv within [-32, 32] ("Error: UVs out of range [-32, 32] 'fittings'"): faces are moved by whole texture copies and split when wider.
import test from "node:test";
import assert from "node:assert/strict";
import { PRESETS, sanitize, buildGeometry } from "../src/editor/model.mjs";

for (const id of ["ladugard", "losdriftsstall", "farmhouse"]) test(`${id}: every uv within [-32, 32]`, () => {
  const p = sanitize({...PRESETS.find(x => x.id === id).settings, width: 40, depth: 16, foundation: 0});
  const G = buildGeometry(p).G;
  for (const [m, g] of Object.entries(G)) {
    let worst = 0;
    for (const v of g.uv) worst = Math.max(worst, Math.abs(v));
    assert.ok(worst <= 32, `${m}: a uv of ${worst}`);
  }
});
