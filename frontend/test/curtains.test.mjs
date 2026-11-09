// Curtains in the ground-floor windows of a walk-in house: the room behind is real, so only the cloth is drawn, and it is seen from inside too.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, PRESETS } from "../src/editor/model.mjs";

/** Curtain vertices' normals as [facing out of the wall, facing in] for walls along x (front/back: n = +-z). */
function sides(geo) {
  const g = geo.G.curtain, out = {front: [0, 0], back: [0, 0]};
  for (let k = 0; k < g.n.length; k += 3) {
    const nz = g.n[k + 2], z = g.p[k + 2];
    if (Math.abs(nz) < 0.5) continue;
    const wall = z > 0 ? "front" : "back";
    out[wall][(wall === "front" ? nz > 0 : nz < 0) ? 0 : 1]++;
  }
  return out;
}
test("curtains: a one-floor house has curtains in its ground-floor windows, facing out and in", () => {
  const p = sanitize({floors: 1, winFront: 2, winBack: 2, winLeft: 0, winRight: 0}), geo = buildGeometry(p), s = sides(geo);
  assert.ok(geo.G.curtain.p.length > 0, "curtains");
  assert.equal(geo.rooms.length, 0, "no pretend rooms on the ground floor");
  for (const wall of ["front", "back"]) assert.ok(s[wall][0] > 0 && s[wall][1] > 0 && s[wall][0] === s[wall][1], `${wall}: ${s[wall]} (as many faces in as out)`);
  // inside the wall's inner face (7 cm into the room), not in the glass
  for (let k = 0; k < geo.G.curtain.p.length; k += 3) assert.ok(Math.abs(geo.G.curtain.p[k + 2]) < p.depth / 2 - 0.1 + 1e-9, "inside the house");
});

test("curtains: the style and the colour apply, none gives none, a window can choose its own", () => {
  const base = {floors: 1, winFront: 2, winBack: 0, winLeft: 0, winRight: 0};
  assert.equal(buildGeometry(sanitize({...base, curtainStyle: "none"})).G.curtain.p.length, 0);
  const sidesN = buildGeometry(sanitize({...base, curtainStyle: "sides"})).G.curtain.p.length, valance = buildGeometry(sanitize({...base, curtainStyle: "valance"})).G.curtain.p.length;
  assert.ok(sidesN > valance && valance > 0, `${sidesN} > ${valance}`);
  const p = sanitize({...base, curtainStyle: "none"}), one = sanitize({...p, windows: p.windows.map(w => w.type === "window" && w.id === p.windows.find(x => x.type === "window").id ? {...w, curtain: "panels"} : w)});
  assert.ok(buildGeometry(one).G.curtain.p.length > 0 && buildGeometry(one).G.curtain.p.length < sidesN, "only the chosen window");
});

test("curtains: upper floors keep their pretend rooms (curtains seen from outside), barns have none", () => {
  const two = buildGeometry(sanitize({floors: 2}));
  assert.ok(two.rooms.length > 0 && two.G.curtain.p.length > 0);
  const barn = buildGeometry(sanitize(PRESETS.find(x => x.id === "ladugard").settings));
  assert.equal(barn.G.curtain.p.length, 0);
});
