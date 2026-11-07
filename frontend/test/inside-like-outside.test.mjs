// The inside of the outer walls can be like the outside: boards outside show their studs (reglar) inside, plaster is plaster,
// and a wall split in two materials is split the same inside.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, MATS } from "../src/editor/model.mjs";
import { WALL_T } from "../src/editor/layout.mjs";

/** The z of the first face met going from (x, y, 0) towards -z (the back wall's inside), or null. */
function firstZ(G, x, y) {
  let best = null;
  for (const m of MATS) {
    const g = G[m];
    for (let t = 0; t < g.i.length; t += 3) {
      const v = k => [g.p[g.i[t + k] * 3], g.p[g.i[t + k] * 3 + 1], g.p[g.i[t + k] * 3 + 2]], a = v(0), b = v(1), c = v(2);
      const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(d) < 1e-12) continue;
      const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d, l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d, l3 = 1 - l1 - l2;
      if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
      const z = l1 * a[2] + l2 * b[2] + l3 * c[2];
      if (z < -1e-6 && (best === null || z > best)) best = z;
    }
  }
  return best;
}
const barn = (s = {}) => sanitize({kind: "cow", items: [], width: 14, depth: 8, floors: 1, floorHeight: 3, winBack: 0, winFront: 0, winLeft: 0, winRight: 0, ...s});
/** The different depths of the back wall's inside seen along its length at height y (in the wall's thickness: 0 = the inside face). */
function depths(p, y) {
  const G = buildGeometry(p).G, wall = -p.depth / 2, out = new Set();
  for (let x = -6; x <= -2; x += 0.02) { const z = firstZ(G, x, p.foundation + y); if (z !== null) out.add(Math.round((z - wall) * 1000) / 1000); }
  return [...out].sort((a, b) => a - b);
}

test("inside like the outside: on for a barn, off for a house, to start with", () => {
  assert.equal(sanitize({kind: "cow"}).insideSame, true);
  assert.equal(sanitize({kind: "chicken"}).insideSame, true);
  assert.equal(sanitize({}).insideSame, false);
  assert.equal(sanitize({insideSame: true}).insideSame, true);
});

test("inside like the outside: boards outside show studs inside, with the backs of the boards between them", () => {
  const p = barn({wallCladding: "lockpanel", insideSame: true}), d = depths(p, 1.5);
  assert.ok(d.length >= 2, JSON.stringify(d));
  assert.ok(Math.abs(d[d.length - 1] - WALL_T) < 1e-3, "the studs' faces at the wall's inside face: " + d);
  assert.ok(d.some(v => v > 0.02 && v < 0.05), "the backs of the boards near the outside: " + d);
  // the same wall as before (plaster or whitewash inside) is flat
  const flat = depths(barn({wallCladding: "lockpanel", insideSame: false}), 1.5);
  assert.equal(flat.length, 1, JSON.stringify(flat));
});

test("inside like the outside: a plastered wall is plaster inside, the same thickness as a stud wall", () => {
  const p = barn({wallCladding: "plaster", insideSame: true}), d = depths(p, 1.5);
  assert.deepEqual(d.length, 1, JSON.stringify(d));
  assert.ok(Math.abs(d[0] - WALL_T) < 1e-3, "at the same inside face as the studs: " + d);
  const G = buildGeometry(p).G;
  assert.ok(G.fittings.i.length > 0);
});

test("inside like the outside: a split wall is split the same inside (plaster below, studs above)", () => {
  const p = barn({wallCladding: "lockpanel", wallSplit: "height", splitHeight: 1.2, lowerCladding: "plaster", insideSame: true});
  assert.equal(depths(p, 0.6).length, 1, "plaster below the split: " + depths(p, 0.6));
  assert.ok(depths(p, 2.2).length >= 2, "studs above it");
  const q = barn({wallCladding: "plaster", wallSplit: "height", splitHeight: 1.2, lowerCladding: "lockpanel", insideSame: true});
  assert.ok(depths(q, 0.6).length >= 2, "studs below");
  assert.equal(depths(q, 2.2).length, 1, "plaster above");
});

test("inside like the outside: wallpaper still goes over it, and no studs show where an opening is", () => {
  const p = barn({wallCladding: "lockpanel", insideSame: true, insidePaper: "1"});
  assert.equal(depths(p, 1.5).length, 1, "wallpaper is flat: " + depths(p, 1.5));
  const hatchless = barn({wallCladding: "lockpanel", insideSame: true});
  assert.ok(buildGeometry(hatchless).G.fittings.i.length > buildGeometry(barn({wallCladding: "lockpanel", insideSame: false})).G.fittings.i.length);
});
