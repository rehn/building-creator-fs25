// With no foundation the building's floor lies on the ground: its skin must stand a little above the terrain (a few mm of it would be hidden by the ground, which showed as grass inside the barn).
import test from "node:test";
import assert from "node:assert/strict";
import { PRESETS, sanitize, buildGeometry } from "../src/editor/model.mjs";

const ys = p => { const g = buildGeometry(p).G.fittings, out = new Set(); for (let i = 1; i < g.p.length; i += 3) out.add(Math.round(g.p[i] * 1000) / 1000); return out; };
const barn = foundation => sanitize({...PRESETS.find(x => x.id === "ladugard").settings, foundation});

test("a barn with no foundation has its floor 3 cm above the ground (and nothing 4 mm over it)", () => {
  const y = ys(barn(0));
  assert.ok(y.has(0.03), "the floor's top");
  assert.ok(!y.has(0.004), "not the thin skin");
});

test("with a foundation the floor is as before (a skin on top of it)", () => {
  const y = ys(barn(0.4));
  assert.ok(y.has(0.404), "the floor's top");
});
