// A flat roof can lean (a mono-pitch roof): roofTilt degrees, rising towards the wall named by tiltHigh. The high wall is taller, the side walls
// slope up to it, and the roof slab follows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry } from "../src/editor/model.mjs";

const base = (extra = {}) => sanitize({width: 8, depth: 6, floors: 1, floorHeight: 3, foundation: 0.2, roofType: "flat", gutters: false, items: [], windows: [], ...extra});
const verts = (p, mat) => { const g = buildGeometry(p).G[mat], out = []; for (let k = 0; k < g.p.length; k += 3) out.push([g.p[k], g.p[k + 1], g.p[k + 2]]); return out; };
const maxY = (p, mat, f = () => true) => Math.max(...verts(p, mat).filter(f).map(v => v[1]));

test("no tilt: the roof is as flat as before", () => {
  const p = base();
  assert.equal(p.roofTilt, 0);
  assert.ok(Math.abs(maxY(p, "roof") - (0.2 + 3 + 0.3)) < 1e-6);
});

test("tilted towards the back: the back edge is higher by the span times tan(tilt), the front stays", () => {
  const p = base({roofTilt: 10, tiltHigh: "back"}), rise = 6 * Math.tan(10 * Math.PI / 180), top = 3.2;
  const roof = verts(p, "roof");
  assert.ok(Math.abs(Math.max(...roof.map(v => v[1])) - (top + rise + 0.14 + 0.4 * Math.tan(10 * Math.PI / 180))) < 0.01, "high edge (with the overhang's share)");
  const front = roof.filter(v => v[2] > 2.9), back = roof.filter(v => v[2] < -2.9);
  assert.ok(Math.min(...back.map(v => v[1])) > Math.max(...front.map(v => v[1])) - 0.31, "back is higher than the front");
});

test("the back wall reaches the slab, the front wall stays, the side walls slope between", () => {
  const p = base({roofTilt: 10, tiltHigh: "back"}), rise = 6 * Math.tan(10 * Math.PI / 180), top = 3.2;
  const w = verts(p, "walls");
  assert.ok(Math.abs(maxY(p, "walls", v => v[2] < -2.99) - (top + rise)) < 0.01, "back wall top");
  assert.ok(Math.abs(maxY(p, "walls", v => v[2] > 2.99) - top) < 0.01, "front wall top");
  const sideBack = Math.max(...w.filter(v => v[0] > 3.99 && v[2] < -2.9).map(v => v[1])), sideFront = Math.max(...w.filter(v => v[0] > 3.99 && v[2] > 2.9).map(v => v[1])), sideMid = Math.max(...w.filter(v => v[0] > 3.99 && Math.abs(v[2]) < 0.1).map(v => v[1]));
  assert.ok(sideBack > sideMid && sideMid > sideFront, "slopes up towards the back");
  assert.ok(Math.abs(sideMid - (top + rise / 2)) < 0.02, "linear");
});

test("tilted towards the right: the right wall is the tall one", () => {
  const p = base({roofTilt: 8, tiltHigh: "right"}), rise = 8 * Math.tan(8 * Math.PI / 180);
  assert.ok(Math.abs(maxY(p, "walls", v => v[0] > 3.99 && Math.abs(v[2]) < 0.1) - (3.2 + rise)) < 0.02);
  assert.ok(Math.abs(maxY(p, "walls", v => v[0] < -3.99 && Math.abs(v[2]) < 0.1) - 3.2) < 0.02);
});

test("tilt is limited and only used by a flat roof", () => {
  assert.ok(base({roofTilt: 90}).roofTilt <= 30);
  const g = sanitize({width: 8, depth: 6, floors: 1, floorHeight: 3, foundation: 0.2, roofType: "gable", roofTilt: 15, items: [], windows: []});
  const h = sanitize({...g, roofTilt: 0});
  assert.equal(buildGeometry(g).G.walls.p.length, buildGeometry(h).G.walls.p.length, "a gable roof ignores it");
});

test("the corner boards follow the leaning roof, and a new flat roof leans towards the front", () => {
  const p = base({roofTilt: 10, tiltHigh: "back"}), rise = 6 * Math.tan(10 * Math.PI / 180);
  const corner = (z) => Math.max(...verts(p, "trim").filter(v => Math.abs(Math.abs(v[0]) - 4) < 0.1 && Math.abs(v[2] - z) < 0.1).map(v => v[1]));
  assert.ok(corner(-3) > corner(3) + rise - 0.2, `back corners (${corner(-3).toFixed(2)}) are higher than the front ones (${corner(3).toFixed(2)})`);
  assert.equal(base({roofTilt: 5}).tiltHigh, "front");
});

test("a leaning roof has boards round its edge (ändskivor) and a gutter with a downpipe on its low side", () => {
  const flat = base({roofTilt: 10, tiltHigh: "front", gutters: false}), g = base({roofTilt: 10, tiltHigh: "front", gutters: true, downpipes: 1});
  const plain = base({roofTilt: 0, gutters: false});
  const trimAround = p => verts(p, "trim").filter(v => v[1] > 3.3).length;
  assert.ok(trimAround(flat) > trimAround(plain), "boards on the edges");
  // the end boards are outside the slab: a vertex beyond the slab's side edge
  assert.ok(verts(flat, "trim").some(v => Math.abs(v[0]) > 4.4 + 0.02), "beyond the slab's side edge");
  assert.ok(verts(g, "gutter").length > verts(flat, "gutter").length, "gutter");
  const gz = verts(g, "gutter").map(v => v[2]);
  assert.ok(Math.max(...gz) > 3.3 + 0.1 || Math.min(...gz) < -3.3 - 0.1, "on a long side");
  assert.ok(Math.min(...gz) < -3.38, "on the low (back) side, the front being high");
  assert.ok(g.pipes.length >= 1 && g.pipes.every(x => x.wall === "back"), "downpipe on the low wall");
});
