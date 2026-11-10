// A shed can have open sides (carport, lean-to shed, "lider"): the wall is left out and replaced by posts and a beam under the roof.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, buildI3d, PRESETS } from "../src/editor/model.mjs";

const shed = (extra = {}) => sanitize({kind: "shed", width: 6, depth: 4, floors: 1, floorHeight: 2.6, foundation: 0.1, roofType: "gable", ridge: "width", items: [], ...extra});
const verts = (p, mat) => { const geo = buildGeometry(p), g = mat === "collision" ? geo.collision : geo.G[mat], out = []; for (let k = 0; k < g.p.length; k += 3) out.push([g.p[k], g.p[k + 1], g.p[k + 2]]); return out; };
const nearFront = (v, depth = 4) => Math.abs(v[2] - depth / 2) < 0.2 && Math.abs(v[0]) < 2.5;

test("open sides are settings of a shed, off to start with", () => {
  const p = shed();
  assert.deepEqual([p.openFront, p.openBack, p.openLeft, p.openRight], [false, false, false, false]);
  assert.equal(shed({openFront: true}).openFront, true);
  assert.equal("openFront" in sanitize({}), false, "a farmhouse has none");
});

test("an open front has no wall: no wall faces, no wall collision, but posts and a beam", () => {
  const closed = shed(), open = shed({openFront: true});
  assert.ok(verts(closed, "walls").some(v => nearFront(v)), "the closed shed has a front wall");
  assert.ok(!verts(open, "walls").some(v => nearFront(v)), "the open one has none");
  assert.ok(!verts(open, "collision").some(v => nearFront(v) && v[1] > 0.5 && v[1] < 2 && Math.abs(v[0]) > 0.3 && Math.abs(v[0]) < 2.2), "nothing to bump into between the posts");
  assert.ok(verts(open, "trim").some(v => nearFront(v) && v[1] > 2.3), "a beam along the top");
  assert.ok(verts(open, "trim").filter(v => nearFront(v) && v[1] < 0.5).length >= 8, "posts standing on the floor");
});

test("windows and doors on an open wall are left out, and an open building needs no door", () => {
  const p = shed({openFront: true, windows: [{wall: "front", floor: 0, pos: 0.5, type: "door", w: 1, h: 2}, {wall: "back", floor: 0, pos: 0.5, type: "window", w: 1, h: 1}]});
  assert.ok(p.windows.every(w => w.wall !== "front"));
  assert.equal(p.windows.filter(w => w.type === "door").length, 0, "no door added");
  assert.equal(p.windows.length, 1);
});

test("a shed without open sides still gets its door", () => {
  assert.ok(shed().windows.some(w => w.type === "door"));
});

test("carport and lean-to presets build and export", () => {
  for (const id of ["carport", "lider"]) {
    const x = PRESETS.find(q => q.id === id);
    assert.ok(x, id);
    const p = sanitize(x.settings);
    assert.equal(p.kind, "shed");
    assert.ok(p.openFront || p.openLeft || p.openRight || p.openBack, `${id}: has an open side`);
    assert.match(buildI3d(p), /<\/i3D>/);
  }
});
