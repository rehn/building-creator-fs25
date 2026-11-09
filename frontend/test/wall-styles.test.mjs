import test from "node:test";
import assert from "node:assert/strict";
import { PRESETS, buildGeometry, sanitize, matList, matTable } from "../src/editor/model.mjs";

const base = () => PRESETS.find(x => x.id === "farmhouse").settings;

test("a wall's own panel and colour make material variants for that wall only", () => {
  const plain = sanitize(base());
  const p = sanitize({ ...base(), wallStyles: { front: { wallColor: "#112233", wallCladding: "vertical" }, nowhere: { wallColor: "#ffffff" } } });
  assert.deepEqual(Object.keys(p.wallStyles), ["front"], "walls that don't exist are dropped");
  assert.ok(matList(p).some(m => /^wallsP\d+$/.test(m)), "a variant of the walls");
  assert.ok(!matList(plain).some(m => /^wallsP\d+$/.test(m)), "none without");
  const G = buildGeometry(p).G, variant = matList(p).find(m => /^wallsP\d+$/.test(m));
  assert.ok(G[variant].i.length > 0, "the front wall is in it");
  assert.ok(G.walls.i.length > 0, "the other walls stay as the building's");
  const before = buildGeometry(plain).G.walls.i.length;
  assert.ok(G.walls.i.length < before, "the front wall left the building's walls");
});

test("walls with the same look share one variant, and a look like the building's needs none", () => {
  const p = sanitize({ ...base(), wallStyles: { front: { wallColor: "#112233" }, back: { wallColor: "#112233" }, left: { wallColor: sanitize(base()).wallColor } } });
  assert.equal(matTable(p).variants.filter(v => v.slot === "walls").length, 1);
});
