// Parts as a tree (docs/PLAN_PARTS.md, step 1): a wing can stand on a wing's wall, any depth (up to MAX_WINGS parts); it inherits floors, floor height
// and roof pitch from its parent; it only meets its parent with the roof, so one that would touch another part is left out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, WALL_NAMES } from "../src/editor/model.mjs";
import { wingsOf, liveWings, wallsOf, MAX_WINGS, wingIdOf } from "../src/editor/layout.mjs";

// the house: 16 x 9 m, ridge along the width, one wing on the back wall (6 wide, 8 long) and one on that wing's left wall
const base = (wings, extra = {}) => sanitize({width: 16, depth: 9, floors: 1, floorHeight: 3, roofPitch: 35, ridge: "width", wings, ...extra});
const W1 = {id: 1, wall: "back", pos: 0.5, width: 6, depth: 8, floors: 0};
const touch = (a, b) => {   // two rectangles that share part of an edge, no more
  const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
  return (Math.abs(ox) < 1e-6 && oz > 1e-6) || (Math.abs(oz) < 1e-6 && ox > 1e-6);
};

test("parts tree: at most 12 parts, and a part's wall can be a wall of another part", () => {
  assert.equal(MAX_WINGS, 12);
  assert.equal(sanitize({wings: Array.from({length: 20}, () => ({wall: "back"}))}).wings.length, 12);
  for (let i = 1; i <= 12; i++) for (const s of ["End", "Left", "Right"]) assert.ok(WALL_NAMES[`w${i}${s}`], `w${i}${s}`);
  const p = base([W1, {id: 2, wall: "w1Left", pos: 0.5, width: 3, depth: 3, floors: 0}, {id: 3, wall: "w2End", pos: 0.5, width: 2, depth: 2, floors: 0}]);
  assert.deepEqual(p.wings.map(w => [w.id, w.wall]), [[1, "back"], [2, "w1Left"], [3, "w2End"]]);
  assert.equal(wingIdOf("w2End"), 2);
});

test("parts tree: a part whose parent is missing, later in the list or itself is dropped, with what hangs on it", () => {
  assert.deepEqual(base([{id: 2, wall: "w1Left", pos: 0.5, width: 3, depth: 3}]).wings, [], "no parent");
  assert.deepEqual(base([{id: 1, wall: "w2End", pos: 0.5, width: 3, depth: 3}, {id: 2, wall: "back", pos: 0.5, width: 5, depth: 5}]).wings.map(w => w.id), [2], "a parent later in the list");
  assert.deepEqual(base([{id: 1, wall: "w1End", pos: 0.5, width: 3, depth: 3}]).wings, [], "its own wall");
  const p = base([W1, {id: 2, wall: "w1Left", pos: 0.5, width: 3, depth: 3}, {id: 3, wall: "w2End", pos: 0.5, width: 2, depth: 2}]);
  assert.equal(p.wings.length, 3);
  const q = sanitize({...p, wings: p.wings.filter(w => w.id !== 1)});
  assert.deepEqual(q.wings, [], "without wing 1 the ones on it go too");
});

test("parts tree: a part on a wing's side stands against that wall, outside the wing", () => {
  const p = base([W1, {id: 2, wall: "w1Left", pos: 0.5, width: 3, depth: 3, floors: 0}]), [w1, w2] = wingsOf(p);
  assert.ok(w1.frames && w2.frames, JSON.stringify([w1.off, w2.off]));
  assert.equal(w2.parent, 1);
  assert.equal(w1.parent, 0);
  assert.ok(touch(w1.rect, w2.rect), `${JSON.stringify(w1.rect)} / ${JSON.stringify(w2.rect)}`);
  assert.ok(Math.abs((w2.rect.x1 - w2.rect.x0) * (w2.rect.z1 - w2.rect.z0) - 3 * 3) < 1e-6 || Math.abs((w2.rect.x1 - w2.rect.x0) - 3) < 1e-6 || Math.abs((w2.rect.z1 - w2.rect.z0) - 3) < 1e-6);
  assert.deepEqual(Object.keys(wallsOf(p)).sort(), ["back", "front", "left", "right", "w1End", "w1Left", "w1Right", "w2End", "w2Left", "w2Right"].sort());
  // its walls face outwards: from the middle of each wall, a step along its normal leaves every rectangle
  const inside = (r, x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
  for (const k of ["w2End", "w2Left", "w2Right"]) {
    const f = wallsOf(p)[k], mx = f.o[0] + f.u[0] * f.L / 2, mz = f.o[2] + f.u[2] * f.L / 2;
    assert.ok(!inside(w2.rect, mx + f.n[0] * 0.05, mz + f.n[2] * 0.05), `${k} faces out`);
    assert.ok(inside(w2.rect, mx - f.n[0] * 0.05, mz - f.n[2] * 0.05), `${k} has the part behind it`);
  }
  // a part on the far end of a wing goes straight on
  const q = base([W1, {id: 2, wall: "w1End", pos: 0.5, width: 3, depth: 3, floors: 0}]), [, e] = wingsOf(q);
  assert.ok(e.frames && touch(wingsOf(q)[0].rect, e.rect));
  assert.ok(Math.abs(e.rect.z0 - (-4.5 - 8 - 3)) < 1e-6, "3 m past the wing's end");
});

test("parts tree: a part inherits floors, floor height, half floor and roof pitch from its parent unless it sets its own", () => {
  const p = base([{...W1, floors: 1, floorHeight: 3.6, pitch: 25}, {id: 2, wall: "w1Left", pos: 0.5, width: 3, depth: 3, floors: 0, floorHeight: 0, pitch: 0}], {floors: 2});
  const [w1, w2] = liveWings(p);
  assert.deepEqual([w1.floors, w1.fh, w1.pitch], [1, 3.6, 25]);
  assert.deepEqual([w2.floors, w2.fh, w2.pitch, w2.H], [1, 3.6, 25, 3.6], "the same as its parent");
  const q = base([{...W1, floors: 1, floorHeight: 3.6}, {id: 2, wall: "w1Left", pos: 0.5, width: 3, depth: 3, floors: 3, floorHeight: 2.5, pitch: 40}], {floors: 2});
  const [, v] = liveWings(q);
  assert.equal(v.floors, 1, "no more floors than its parent");
  assert.deepEqual([v.fh, v.pitch, v.H], [2.5, 40, 2.5]);
});

test("parts tree: how a part's roof meets its parent's (valley, under the eaves, a gable end) follows the parent's roof", () => {
  // wing 1: 6 m wide, one floor of 3 m, pitch 35. A child of the same height and as wide meets its slope in a valley;
  const kid = (extra, w1 = {}) => liveWings(base([{...W1, ...w1}, {id: 2, wall: "w1Left", pos: 0.5, width: 3, depth: 3, floors: 0, ...extra}])).find(x => x.id === 2);
  assert.equal(kid({width: 6}).type, "valley");
  assert.equal(kid({width: 3}).type, "valley", "also a narrower one of the same height: its ridge is lower");
  // a child well under the parent's eaves runs up to the wall
  assert.equal(kid({width: 2.5, floorHeight: 2.3}, {floorHeight: 5}).type, "eave", "lower than the parent's eaves");
  assert.equal(liveWings(base([W1, {id: 2, wall: "w1End", pos: 0.5, width: 3, depth: 3}])).find(x => x.id === 2).type, "gable", "on a gable end");
  assert.equal(liveWings(base([W1, {id: 2, wall: "w1Left", pos: 0.5, width: 3, depth: 3}], {roofType: "flat"})).find(x => x.id === 2).type, "flat", "under a flat roof");
  // a child can't be wider than its parent's roof lets it in a valley
  assert.ok(kid({width: 20}).ww <= 8 + 1e-6, "kept narrow enough: " + kid({width: 20}).ww);
});

test("parts tree: a part that would touch another part than its parent is left out, with a reason", () => {
  // on wing 1's left wall close to the house: it would stand against the house's back wall too
  const near = base([W1, {id: 2, wall: "w1Left", pos: 0.04, width: 2.5, depth: 3, floors: 0}]), w = wingsOf(near).find(x => x.id === 2);
  assert.ok(w.off && /close|touch/i.test(w.off), JSON.stringify(w));
  assert.equal(liveWings(near).length, 1);
  // a sibling too close
  const two = base([W1, {id: 2, wall: "w1Left", pos: 0.5, width: 3, depth: 3, floors: 0}, {id: 3, wall: "w1Left", pos: 0.55, width: 3, depth: 3, floors: 0}]);
  assert.ok(wingsOf(two).find(x => x.id === 3).off);
  // and one that's left out takes its children with it (they are left out too)
  const kids = base([W1, {id: 2, wall: "w1Left", pos: 0.04, width: 2.5, depth: 3, floors: 0}, {id: 3, wall: "w2End", pos: 0.5, width: 2, depth: 2, floors: 0}]);
  assert.ok(wingsOf(kids).find(x => x.id === 3).off, "no parent, no part");
  assert.deepEqual(liveWings(kids).map(x => x.id), [1]);
});

test("parts tree: a nested part has walls to put windows and doors on, and the building builds", () => {
  const p = base([W1, {id: 2, wall: "w1Left", pos: 0.5, width: 3, depth: 3, floors: 0}, {id: 3, wall: "w2End", pos: 0.5, width: 2, depth: 2, floors: 0}], {
    windows: [{wall: "front", floor: 0, pos: 0.5, type: "door", w: 1.4, h: 2.3}, {wall: "w2End", floor: 0, pos: 0.5, type: "door", w: 1, h: 2.1}, {wall: "w3Left", floor: 0, pos: 0.5, type: "window", w: 0.8, h: 1, sill: 0.9}]});
  assert.ok(p.windows.some(w => w.wall === "w3Left"));
  const geo = buildGeometry(p);
  assert.ok(geo.opsByWall.w3Left.ops.some(o => o.kind === "window"));
  assert.ok(geo.opsByWall.w2End.ops.some(o => o.kind === "open"), "the passage from wing 2 into the part on its end");
  assert.ok(geo.opsByWall.w1Left.ops.some(o => o.kind === "open"), "and from wing 1 into wing 2");
  // windows on a nested part are dropped with it
  const q = sanitize({...p, wings: p.wings.filter(w => w.id !== 3)});
  assert.ok(!q.windows.some(w => w.wall === "w3Left"));
});

test("parts tree: the most parts is a setting (setMaxParts, from the MAX_PARTS variable): 12 to start with, never beyond the hard limit", async () => {
  const layout = await import("../src/editor/layout.mjs"), model = await import("../src/editor/model.mjs");
  const many = n => Array.from({length: n}, (_, i) => ({id: i + 1, wall: "back", pos: 0.5}));
  try {
    assert.equal(layout.MAX_WINGS, 12);
    assert.equal(sanitize({wings: many(30)}).wings.length, 12);
    layout.setMaxParts(3);
    assert.equal(layout.MAX_WINGS, 3, "read live");
    assert.equal(model.MAX_WINGS, 3, "also through the model's re-export");
    assert.equal(sanitize({wings: many(30)}).wings.length, 3);
    layout.setMaxParts(25);
    assert.equal(sanitize({wings: many(30)}).wings.length, 25);
    layout.setMaxParts(500);
    assert.equal(layout.MAX_WINGS, layout.HARD_MAX_PARTS, "kept to the hard limit");
    layout.setMaxParts("junk");
    assert.equal(layout.MAX_WINGS, 12, "nonsense gives the default");
    layout.setMaxParts(0);
    assert.equal(layout.MAX_WINGS, 1, "at least one");
    // every wall a part can have has a name, up to the hard limit
    for (let i = 1; i <= layout.HARD_MAX_PARTS; i++) for (const s of ["End", "Left", "Right"]) assert.ok(model.WALL_NAMES[`w${i}${s}`], `w${i}${s}`);
  } finally { layout.setMaxParts(12); }
});

/* ---------- Step 2: the inside of a part on a part ---------- */
import { makeWalker } from "../src/editor/walk.mjs";
import { roomOf, inRoom, problems } from "../src/editor/layout.mjs";
import { KIND, catalogFor, WP } from "../src/editor/model.mjs";

const inner = (extra = {}, w1 = {}, w2 = {}) => sanitize({
  width: 16, depth: 9, floors: 1, floorHeight: 3, foundation: 0.3, items: [], ceiling: true,
  wings: [{...W1, ...w1}, {id: 2, wall: "w1Left", pos: 0.5, width: 3, depth: 4, floors: 0, ...w2}],
  windows: [{wall: "front", floor: 0, pos: 0.5, type: "door", w: 1.4, h: 2.3}], ...extra});

test("part on a part, inside: the rooms join into one, with a passage in each wall they open through", () => {
  const p = inner(), room = roomOf(p), geo = buildGeometry(p);
  assert.equal(room.rects.length, 3, "the house, wing 1 and wing 2");
  // the middle of wing 2 is inside the room
  const w2 = liveWings(p)[1], c = [(w2.rect.x0 + w2.rect.x1) / 2, (w2.rect.z0 + w2.rect.z1) / 2];
  assert.ok(inRoom(room, {x0: c[0] - 0.3, x1: c[0] + 0.3, z0: c[1] - 0.3, z1: c[1] + 0.3}));
  const open = k => geo.opsByWall[k].ops.filter(o => o.kind === "open");
  assert.equal(open("back").length, 1, "from the house into wing 1");
  assert.equal(open("w1Left").length, 1, "from wing 1 into wing 2");
});

test("part on a part, inside: you can walk from the house through wing 1 into wing 2", () => {
  const p = inner(), geo = buildGeometry(p), wk = makeWalker(geo.collision), [w1, w2] = liveWings(p);
  const go = (pos, tx, tz) => { for (let i = 0; i < 400; i++) { const dx = tx - pos.x, dz = tz - pos.z, d = Math.hypot(dx, dz); if (d < 0.05) break; pos = wk.move(pos, dx / d * Math.min(0.1, d), dz / d * Math.min(0.1, d)); } return pos; };
  let pos = {x: 0, y: p.foundation, z: 1};                                    // inside the house
  pos = go(pos, (w1.rect.x0 + w1.rect.x1) / 2, (w1.rect.z0 + w1.rect.z1) / 2);   // into wing 1
  assert.ok(Math.hypot(pos.x - (w1.rect.x0 + w1.rect.x1) / 2, pos.z - (w1.rect.z0 + w1.rect.z1) / 2) < 0.2, `in wing 1: ${pos.x.toFixed(2)}, ${pos.z.toFixed(2)}`);
  const c2 = [(w2.rect.x0 + w2.rect.x1) / 2, (w2.rect.z0 + w2.rect.z1) / 2];
  pos = go(pos, c2[0], c2[1]);                                                   // on into wing 2
  assert.ok(Math.hypot(pos.x - c2[0], pos.z - c2[1]) < 0.2, `in wing 2: ${pos.x.toFixed(2)}, ${pos.z.toFixed(2)}`);
  assert.ok(Math.abs(pos.y - p.foundation) < 0.02, "on its floor");
});

/** The y of the first face above (x, y0, z), or null. */
function above(G, x, y0, z) {
  let best = null;
  for (const m of Object.keys(G)) {
    const g = G[m];
    for (let t = 0; t < g.i.length; t += 3) {
      const v = k => [g.p[g.i[t + k] * 3], g.p[g.i[t + k] * 3 + 1], g.p[g.i[t + k] * 3 + 2]], a = v(0), b = v(1), c = v(2);
      const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
      if (Math.abs(d) < 1e-12) continue;
      const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d, l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d, l3 = 1 - l1 - l2;
      if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
      const y = l1 * a[1] + l2 * b[1] + l3 * c[1];
      if (y > y0 + 1e-6 && (!best || y < best.y)) best = {y, m};
    }
  }
  return best;
}

test("part on a part, inside: each part has its own ceiling, and the passage between two goes up to the lower of them", () => {
  const p = inner({}, {floorHeight: 3.6}, {floorHeight: 2.4}), geo = buildGeometry(p), F = p.foundation, [w1, w2] = liveWings(p);
  assert.deepEqual([w1.fh, w2.fh], [3.6, 2.4]);
  const mid = r => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
  const [a, b] = [mid(w1.rect), mid(w2.rect)];
  assert.ok(Math.abs(above(geo.G, a[0], F + 0.5, a[1]).y - (F + 3.6)) < 1e-6, "wing 1's ceiling at its own height");
  assert.ok(Math.abs(above(geo.G, b[0], F + 0.5, b[1]).y - (F + 2.4)) < 1e-6, "wing 2's at its own");
  const open = geo.opsByWall.w1Left.ops.find(o => o.kind === "open");
  assert.ok(Math.abs(open.t1 - 2.4) < 1e-9, "the passage from wing 1 into wing 2 goes up to the lower ceiling: " + open.t1);
  // and the other way round: a low parent, a taller part on it
  const q = inner({}, {floorHeight: 2.4}, {floorHeight: 3.6}), open2 = buildGeometry(q).opsByWall.w1Left.ops.find(o => o.kind === "open");
  assert.ok(Math.abs(open2.t1 - Math.min(2.4, liveWings(q)[1].fh)) < 1e-9, "up to the parent's ceiling: " + open2.t1);
});

test("part on a part, inside: windows and doors on its walls are built, and the furnishing fills the rooms without leaving them", () => {
  const p = inner({windows: [{wall: "front", floor: 0, pos: 0.5, type: "door", w: 1.4, h: 2.3}, {wall: "w2End", floor: 0, pos: 0.5, type: "window", w: 1, h: 1.2, sill: 0.9}, {wall: "w2Right", floor: 0, pos: 0.5, type: "door", w: 1, h: 2.1}]});
  const geo = buildGeometry(p);
  assert.ok(geo.opsByWall.w2End.ops.some(o => o.kind === "window") && geo.opsByWall.w2Right.ops.some(o => o.kind === "door"));
  const items = KIND.house.autoFurnish(p).items, room = roomOf(p), cat = catalogFor(p);
  assert.ok(items.length > 0);
  assert.equal(problems(items.map((it, i) => ({id: i + 1, ...it})), cat, room).size, 0, "no piece outside the room or on another");
});

test("part on a part: a window on the parent's wall where the part stands is hidden, as on the house's wall", () => {
  const p0 = inner(), w2 = liveWings(p0)[1], L = wallsOf(p0).w1Left.L, mid = (w2.s0 + w2.s1) / 2 / L;
  const p = inner({windows: [{wall: "front", floor: 0, pos: 0.5, type: "door", w: 1.4, h: 2.3}, {wall: "w1Left", floor: 0, pos: mid, type: "window", w: 1, h: 1.2, sill: 0.9}, {wall: "w1Left", floor: 0, pos: 0.9, type: "window", w: 1, h: 1.2, sill: 0.9}]});
  const geo = buildGeometry(p), ws = p.windows.filter(w => w.wall === "w1Left");
  assert.equal(ws.length, 2);
  const hidden = ws.map(w => !!w._hidden);
  assert.deepEqual(hidden, [true, false], "the one under the part is hidden, the one beside it is shown");
  assert.equal(geo.opsByWall.w1Left.ops.filter(o => o.kind === "window").length, 1);
});
