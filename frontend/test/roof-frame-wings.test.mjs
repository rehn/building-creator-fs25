// A walk-in building's roof is framed inside (trusses, tie beams, a ridge beam): the parts have their own frame, and the main frame keeps the far side where a part opens into its roof.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, PRESETS } from "../src/editor/model.mjs";

const barn = (wings, s = {}) => sanitize({...PRESETS.find(x => x.id === "ladugard").settings, items: [], ...s, wings});
// the timber beams (fittings) outside the main building's footprint and above the wall tops: only a part's roof frame is there
const beamsOutside = p => {
  const g = buildGeometry(p).G.fittings, F = p.foundation, H = p.floors * p.floorHeight, out = new Set();
  for (let k = 0; k < g.p.length; k += 3) {
    const x = g.p[k], y = g.p[k + 1], z = g.p[k + 2];
    if (y > F + H - 0.3 && (Math.abs(z) > p.depth / 2 + 0.3 || Math.abs(x) > p.width / 2 + 0.3)) out.add(`${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`);
  }
  return out.size;
};

test("a part of a barn has its own roof frame under its roof", () => {
  const none = beamsOutside(barn([])), withPart = beamsOutside(barn([{wall: "front", pos: 0.35, width: 7, depth: 9, floors: 0}]));
  assert.ok(withPart - none > 40, `the part's trusses: ${withPart} corners outside against ${none} without it`);
});

test("a part with a ceiling (a house) has no frame: the ceiling closes the roof space", () => {
  const house = sanitize({width: 12, depth: 8, items: [], wings: [{wall: "back", pos: 0.5, width: 5, depth: 5, floors: 0}]});
  assert.equal(beamsOutside(house), beamsOutside(sanitize({width: 12, depth: 8, items: [], wings: []})), "no beams of its own");
});

test("where a part opens into the main roof the far slope keeps its rafters", () => {
  const p = barn([{wall: "front", pos: 0.5, width: 8, depth: 8, floors: 0}]);
  const g = buildGeometry(p).G.fittings, F = p.foundation, z0 = -p.depth / 2;
  // rafters on the back slope (z < 0), in the middle of the building where the part is, at the height of the roof
  let back = 0;
  for (let k = 0; k < g.p.length; k += 3) if (Math.abs(g.p[k]) < 2 && g.p[k + 2] < -0.3 && g.p[k + 2] > z0 && g.p[k + 1] > F + p.floors * p.floorHeight - 0.6) back++;
  assert.ok(back > 0, "the back slope's rafters are there in the part's stretch");
});
