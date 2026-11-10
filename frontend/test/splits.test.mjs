// Split: a building divided across its length by walls up to the roof (the building's width, height and roof stay). A divider is a wall like the others:
// windows and doors go in it as on any wall.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, wallLabel } from "../src/editor/model.mjs";
import { wallsOf, splitsOf, WALL_T } from "../src/editor/layout.mjs";

function hits(g, a, b) {
  const d = b.map((v, i) => v - a[i]);
  const sub = (x, y) => x.map((v, i) => v - y[i]), cross = (x, y) => [x[1]*y[2] - x[2]*y[1], x[2]*y[0] - x[0]*y[2], x[0]*y[1] - x[1]*y[0]];
  const dot = (x, y) => x[0]*y[0] + x[1]*y[1] + x[2]*y[2], P = k => [g.p[k*3], g.p[k*3+1], g.p[k*3+2]];
  for (let t = 0; t < g.i.length; t += 3) {
    const v0 = P(g.i[t]), e1 = sub(P(g.i[t+1]), v0), e2 = sub(P(g.i[t+2]), v0), h = cross(d, e2), det = dot(e1, h);
    if (Math.abs(det) < 1e-12) continue;
    const s = sub(a, v0), u = dot(s, h) / det; if (u < 0 || u > 1) continue;
    const q = cross(s, e1), v = dot(d, q) / det; if (v < 0 || u + v > 1) continue;
    const k = dot(e2, q) / det; if (k > 0 && k < 1) return true;
  }
  return false;
}
const front = {wall: "front", floor: 0, pos: 0.2, type: "door", w: 1, h: 2.1};
const house = (s = {}, windows = []) => sanitize({width: 20, depth: 8, ridge: "width", roofType: "gable", items: [], windows: [front, ...windows], ...s});
const dDoor = {wall: "s1", floor: 0, pos: 0.5, type: "door", w: 1, h: 2.1, opens: true};

test("splits: none by default; kept in order, clamped, at most four, none under a hip roof", () => {
  assert.deepEqual(sanitize({}).splits, []);
  const p = house({splits: [{at: 15}, {at: 5}, {at: 0}, {at: 99}, {at: 10}, {at: 12}]});
  assert.deepEqual(p.splits.map(s => s.id).sort(), [1, 2, 3, 4], "ids from 1, up to four (the first four given)");
  assert.deepEqual(p.splits.map(s => s.at), [2, 5, 15, 18], "in order along the building, not at the ends");
  assert.deepEqual(house({roofType: "hip", splits: [{at: 10}]}).splits, []);
});

test("splits: a divider is a wall across the building, with its own key and name", () => {
  const p = house({splits: [{at: 10}]}), w = wallsOf(p).s1;
  assert.ok(w, "a wall s1");
  assert.equal(w.L, 8, "as long as the building is deep");
  assert.deepEqual(w.n, [1, 0, 0]);
  assert.ok(Math.abs(w.o[0] - (0 + WALL_T / 2)) < 1e-9, "its middle at 10 m from the left end");
  assert.ok(/section 2/.test(wallLabel(p, "s1")));
  assert.equal(splitsOf(p).length, 1);
  // a building with its ridge from front to back is divided across that
  const q = house({ridge: "depth", width: 8, depth: 20, splits: [{at: 10}]}), v = wallsOf(q).s1;
  assert.deepEqual(v.n, [0, 0, 1]);
  assert.equal(v.L, 8);
});

test("splits: the divider stands from the floor up to the roof, and a door in it lets you through", () => {
  const p = house({splits: [{at: 10}]}), F = p.foundation;
  const across = pp => hits(buildGeometry(pp).collision, [-3, F + 1, 0], [3, F + 1, 0]);
  assert.equal(across(p), true, "a whole wall");
  assert.equal(across(house({splits: [{at: 10}]}, [dDoor])), false, "through the door");
  const g = buildGeometry(p).G.walls; let top = -Infinity;
  for (let k = 0; k < g.p.length; k += 3) if (Math.abs(g.p[k] - WALL_T / 2) < 0.2) top = Math.max(top, g.p[k + 1]);
  assert.ok(top > F + p.floors * p.floorHeight + 1, `its gable reaches up under the roof (${top})`);
});

test("splits: windows and doors in a divider are kept; those in one that isn't there are dropped", () => {
  const p = house({splits: [{at: 10}]}, [dDoor, {...dDoor, wall: "s2", pos: 0.3}]);
  assert.deepEqual(p.windows.filter(w => w.wall.startsWith("s")).map(w => w.wall), ["s1"]);
});

test("splits: addSplit puts a divider in the middle of the longest stretch, and says no when there is no room", async () => {
  const { addSplit } = await import("../src/editor/model.mjs");
  const p = house();
  const one = addSplit(p);
  assert.deepEqual(one.map(s => s.at), [10]);
  const two = addSplit({...p, splits: one});
  assert.deepEqual(two.map(s => s.at), [5, 10], "equally long stretches: the first");
  let list = [];
  for (let i = 0; i < 6; i++) { const next = addSplit({...p, splits: list}); if (!next) break; list = next; }
  assert.equal(list.length <= 4, true);
  assert.equal(addSplit(house({roofType: "hip"})), null);
});

// ---- dividers in a part ----
const withPart = (w = {}, windows = []) => sanitize({width: 12, depth: 8, items: [], windows: [front, ...windows], wings: [{wall: "back", pos: 0.5, width: 6, depth: 10, floors: 0, ...w}]});

test("part dividers: kept in order, clamped to 2 m from the ends of the part, at most four", async () => {
  const { liveWings } = await import("../src/editor/layout.mjs");
  assert.deepEqual(withPart().wings[0].splits, []);
  const p = withPart({splits: [{at: 5}, {at: 0}, {at: 99}]});
  assert.deepEqual(p.wings[0].splits.map(s => s.at), [2, 5, 8], "in order, 2 m from both ends of the 10 m part");
  assert.equal(withPart({splits: [1, 2, 3, 4, 5, 6].map(at => ({at}))}).wings[0].splits.length, 4);
  assert.ok(liveWings(p)[0].frames.w1D1, "a wall for each");
  assert.ok(wallsOf(p).w1D1 && wallsOf(p).w1D3 && !wallsOf(p).w1D4);
});

test("part dividers: a wall across the part, as wide as it, from the floor up to its roof", async () => {
  const { liveWings } = await import("../src/editor/layout.mjs");
  const p = withPart({splits: [{at: 5}]}), wg = liveWings(p)[0], w = wallsOf(p).w1D1, F = p.foundation;
  assert.equal(w.L, wg.ww);
  const mid = wg.at(wg.sc, 5), a = wg.at(wg.sc, 3), b = wg.at(wg.sc, 7);
  assert.equal(hits(buildGeometry(p).collision, [a[0], F + 1, a[2]], [b[0], F + 1, b[2]]), true, "a whole wall");
  const p2 = withPart({splits: [{at: 5}]}, [{wall: "w1D1", floor: 0, pos: 0.5, type: "door", w: 1, h: 2.1, opens: true}]);
  assert.equal(hits(buildGeometry(p2).collision, [a[0], F + 1, a[2]], [b[0], F + 1, b[2]]), false, "through its door");
  const g = buildGeometry(p).G.walls; let top = -Infinity;
  for (let k = 0; k < g.p.length; k += 3) if (Math.abs(g.p[k] - mid[0]) < 0.3 && Math.abs(g.p[k + 2] - mid[2]) < 0.2) top = Math.max(top, g.p[k + 1]);
  assert.ok(top > F + wg.H + 0.5, `its gable reaches under the part's roof (${top})`);
  void mid;
});

test("part dividers: windows and doors in one are kept, and go with it when the part or the divider is gone", () => {
  const ws = [{wall: "w1D1", floor: 0, pos: 0.5, type: "door", w: 1, h: 2.1}, {wall: "w1D2", floor: 0, pos: 0.5, type: "door", w: 1, h: 2.1}];
  assert.deepEqual(withPart({splits: [{at: 5}]}, ws).windows.filter(w => /D/.test(w.wall)).map(w => w.wall), ["w1D1"]);
  assert.deepEqual(sanitize({width: 12, depth: 8, windows: [front, ws[0]]}).windows.filter(w => /D/.test(w.wall)), [], "no part");
  assert.ok(/section 2/i.test(wallLabel(withPart({splits: [{at: 5}]}), "w1D1")));
});

test("part dividers: addPartSplit puts one in the middle of the longest stretch of the part", async () => {
  const { addPartSplit } = await import("../src/editor/model.mjs");
  const p = withPart();
  assert.deepEqual(addPartSplit(p, 1).map(s => s.at), [5]);
  assert.equal(addPartSplit(p, 9), null, "no such part");
});
