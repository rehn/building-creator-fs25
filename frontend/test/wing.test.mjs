// Wings: L-, T- and U-shaped houses. A wing stands against one wall of the house with the house's roof pitch and
// overhang, and its own number of floors. On a long side its roof meets the house's in a valley (or, lower, runs up to
// the wall under the eaves); on a gable end it is a lower annex. A house can have up to four.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, buildI3d, placementAreas, genRow, KIND, WALL_NAMES } from "../src/editor/model.mjs";
import { wingsOf, liveWings, wallsOf, WING_WALLS, wingWallKey, wingIdOf, MAX_WINGS } from "../src/editor/layout.mjs";

const W1 = {id: 1, wall: "back", pos: 0.15, width: 6, depth: 5, floors: 0};
const house = (s = {}) => sanitize({wings: [W1], ...s});
const verts = (G, m) => { const out = []; for (let i = 0; i < G[m].p.length; i += 3) out.push([G[m].p[i], G[m].p[i + 1], G[m].p[i + 2]]); return out; };

test("wings: none by default, a list kept and clamped", () => {
  assert.deepEqual(sanitize({}).wings, []);
  const p = sanitize({wings: [{wall: "left", pos: 7, width: 99, depth: -1, floors: 9}, {wall: "roof"}, null, {}, {}, {}]});
  assert.equal(p.wings.length, MAX_WINGS, "at most four");
  assert.deepEqual(p.wings.map(w => w.id), [1, 2, 3, 4]);
  assert.deepEqual([p.wings[0].wall, p.wings[0].pos, p.wings[0].width, p.wings[0].depth, p.wings[0].floors], ["left", 1, 30, 2, 3]);
  assert.equal(p.wings[1].wall, "back", "an unknown wall becomes the back");
  assert.equal(sanitize({wings: [{id: 3, wall: "front"}, {id: 3, wall: "back"}]}).wings.map(w => w.id).join(), "3,1", "ids are kept, repeats renumbered");
  for (const k of WING_WALLS) assert.ok(WALL_NAMES[k], k);
  assert.equal(wingWallKey(2, "End"), "w2End");
  assert.equal(wingIdOf("w3Left"), 3);
  assert.equal(wingIdOf("front"), 0);
});

test("wings: a save from when a house had one wing becomes wing 1, its windows moved onto it", () => {
  const p = sanitize({wing: true, wingWall: "left", wingPos: 0.4, wingWidth: 5, wingDepth: 4,
    windows: [{wall: "wingEnd", floor: 0, pos: 0.5, w: 1, h: 1.2, sill: 0.9}, {wall: "wingLeft", floor: 0, pos: 0.5, w: 1, h: 1.2, sill: 0.9}, {wall: "front", floor: 0, pos: 0.5, w: 1, h: 2.1, type: "door"}]});
  assert.deepEqual(p.wings.map(w => [w.id, w.wall, w.pos, w.width, w.depth]), [[1, "left", 0.4, 5, 4]]);
  assert.deepEqual(p.windows.map(w => w.wall).sort(), ["front", "w1End", "w1Left"]);
});

test("wings: on a long side a valley, no wider than the house is deep; on a gable end an annex", () => {
  const p = house({width: 12, depth: 8, wings: [{...W1, width: 20}]}), w = wingsOf(p)[0];
  assert.equal(w.type, "valley");
  assert.ok(w.ww <= 8 + 1e-9, "a wider wing would have a higher ridge than the house");
  assert.ok(w.s0 >= -1e-9 && w.s1 <= 12 + 1e-9);
  assert.equal(wingsOf(house({wings: [{...W1, wall: "left"}]}))[0].type, "gable");
  assert.equal(wingsOf(house({roofType: "flat", wings: [{...W1, wall: "left"}]}))[0].type, "flat");
  assert.ok(wingsOf(house({roofType: "hip", width: 12, depth: 8, wings: [{...W1, wall: "left"}]}))[0].off, "on a hip roof only the long sides take a wing");
});

test("wings: a lower wing (fewer floors) has a lower roof; a low narrow one runs up to the wall under the eaves", () => {
  const p = house({floors: 2, floorHeight: 2.7, wings: [{...W1, floors: 1, width: 5}]}), w = wingsOf(p)[0];
  assert.equal(w.floors, 1);
  assert.ok(Math.abs(w.H - 2.7) < 1e-9);
  assert.equal(w.type, "eave", "its ridge is below the house's eaves");
  const geo = buildGeometry(p);
  // its walls are one floor tall, and its roof is below the house's eave line
  const top = Math.max(...verts(geo.G, "roof").map(v => v[2] < -p.depth / 2 - 0.5 ? v[1] : -Infinity));
  assert.ok(top < p.foundation + 2 * 2.7 - 0.1, `wing roof top ${top}`);
  // windows of a second floor on that wing aren't there
  const q = sanitize({...p, windows: [...p.windows, {wall: "w1End", floor: 1, pos: 0.5, w: 1, h: 1.2, sill: 0.9}]});
  assert.ok(buildGeometry(q).opsByWall.w1End.ops.every(o => o.t0 < 2.7), "no second floor on a one-floor wing");
  // a lower wing as wide as the house's roof reaches meets the slope in a valley anyway
  assert.equal(wingsOf(house({floors: 2, wings: [{...W1, floors: 1, width: 7}]}))[0].type, "valley");
});

test("wings: several, each with its walls; two that overlap leave the later one out", () => {
  const p = house({width: 14, depth: 8, wings: [{...W1, pos: 0}, {id: 2, wall: "back", pos: 1, width: 5, depth: 6, floors: 1}, {id: 3, wall: "front", pos: 0.5, width: 5, depth: 3, floors: 0}]});
  const ws = liveWings(p);
  assert.equal(ws.length, 3, "a U and a front wing");
  assert.deepEqual(Object.keys(wallsOf(p)).sort(), ["back", "front", "left", "right", ...WING_WALLS.filter(k => /^w[123]/.test(k))].sort());
  const geo = buildGeometry(p);
  for (const k of ["w1End", "w2Left", "w3Right"]) assert.ok(geo.opsByWall[k], k);
  assert.equal(geo.wings.length, 3);
  const clash = house({wings: [W1, {...W1, id: 2, pos: 0.2}]});
  assert.equal(liveWings(clash).length, 1);
  assert.match(wingsOf(clash)[1].off, /too close/);
  assert.equal(Object.keys(buildGeometry(clash).opsByWall).filter(k => k.startsWith("w2")).length, 0);
});

test("wings: their walls are where they are, facing out", () => {
  const p = house({width: 10, depth: 7, wings: [{...W1, pos: 0.5, width: 6, depth: 5}]}), w = wingsOf(p)[0], f = w.frames;
  assert.deepEqual(f.w1End.n, [0, 0, -1]);
  assert.ok(Math.abs(f.w1End.o[2] - (-3.5 - 5)) < 1e-9);
  assert.equal(f.w1End.L, 6);
  assert.equal(f.w1Left.L, 5);
  for (const k of ["w1End", "w1Left", "w1Right"]) { const {u, n} = f[k]; assert.deepEqual([n[2], 0, -n[0]].map(v => v + 0), u.map(v => v + 0), k); }
  assert.ok(w.rect.z0 < -8.4 && w.rect.z1 > -3.6 && w.rect.x1 - w.rect.x0 > 5.9);
  assert.deepEqual(Object.keys(wallsOf(sanitize({}))).sort(), ["back", "front", "left", "right"]);
});

test("wings: built with windows; windows behind a wing are hidden; the footprint reaches the wing", () => {
  let p = house({width: 10, depth: 7, winBack: 3});
  for (const k of ["w1End", "w1Left", "w1Right"]) p.windows = genRow(p, p.windows, k, 0, k === "w1End" ? 2 : 1);
  const geo = buildGeometry(p);
  assert.equal(geo.opsByWall.w1End.ops.filter(o => o.kind === "window").length, 2);
  const w = wingsOf(p)[0], under = p.windows.filter(x => x.wall === "back" && x.floor === 0 && (() => { const s = x.pos * 10; return s > w.s0 && s < w.s1; })());
  assert.ok(under.length > 0 && under.every(x => x._hidden), "windows under the wing are hidden");
  assert.ok(placementAreas(geo).clear.z0 < -3.5 - 5 + 0.1);
  assert.ok(buildI3d(p, {}).length > 1000);
});

test("wings: the house's roof has a valley cut out where the wing's roof goes, and another wing cuts its own", () => {
  const p = house({width: 12, depth: 8, wings: [{...W1, pos: 0.15, width: 5, depth: 5}, {id: 2, wall: "back", pos: 0.85, width: 5, depth: 5, floors: 0}], roofPitch: 40, chimney: false, dormers: []});
  const geo = buildGeometry(p), tan = Math.tan(40 * Math.PI / 180), top = p.foundation + p.floors * p.floorHeight, ridgeY = top + 4 * tan, k = (4 - 2.5);
  const G = geo.G.roof;
  let inNotch = 0;
  for (let t = 0; t < G.i.length; t += 3) {
    const v = [0, 1, 2].map(j => G.i[t + j]), c = [0, 1, 2].map(i => v.reduce((s, q) => s + G.p[q * 3 + i], 0) / 3);
    if (G.n[v[0] * 3 + 1] < 0.3) continue;
    const b = -c[2], onMain = Math.abs(c[1] - (ridgeY - b * tan)) < 0.02;
    for (const w of liveWings(p)) { const ac = c[0] - (-6 + w.sc); if (onMain && b > k + Math.abs(ac) + 0.15 && b < 4 + p.overhang - 0.05 && Math.abs(ac) < 2) inNotch++; }
  }
  assert.equal(inNotch, 0, "no main roof under a wing's roof");
});

test("wings: a door on a wing works, and a house keeps one door of its own when the wing goes", async () => {
  const p = house({width: 10, depth: 7});
  p.windows = [{wall: "w1End", floor: 0, pos: 0.5, w: 1, h: 2.1, sill: 0, type: "door", porch: "shed"}];
  const q = sanitize(p);
  assert.equal(q.windows.filter(w => w.type === "door").length, 1);
  assert.equal(buildGeometry(q).opsByWall.w1End.ops.filter(o => o.kind === "door").length, 1);
  const { sleepPoint } = await import("../src/editor/model.mjs");
  const sp = sleepPoint(buildGeometry(sanitize({...q, objects: undefined})), sanitize({...q, objects: undefined}));
  assert.ok(sp.trigger.center[2] < -3.5 - 5, "in front of the wing's end");
  const off = sanitize({...q, wings: []});
  assert.ok(off.windows.some(w => w.type === "door" && !WING_WALLS.includes(w.wall)));
});

test("wings: only houses have them", () => {
  for (const kind of ["cow", "chicken"]) {
    const p = sanitize({kind, wings: [W1]});
    assert.deepEqual(p.wings, [], kind);
    assert.ok(!buildGeometry(p).opsByWall.w1End, kind);
    assert.ok(KIND[kind].hides.includes("Wings"), kind);
  }
});

test("wings: their own roof angle and a half floor", () => {
  const same = wingsOf(house({wings: [W1]}))[0], steep = wingsOf(house({wings: [{...W1, pitch: 55}]}))[0];
  assert.equal(same.pitch, 38, "0 follows the house");
  assert.equal(steep.pitch, 55);
  assert.equal(wingsOf(house({wings: [{...W1, pitch: 2}]}))[0].pitch, 5, "at least 5");
  // a half floor: a knee wall on top of the full floors (its own setting once it has its own floors)
  const half = wingsOf(house({wings: [{...W1, floors: 1, half: true}]}))[0], plain = wingsOf(house({wings: [{...W1, floors: 1}]}))[0];
  assert.ok(Math.abs(half.H - plain.H - 0.9) < 1e-9 && half.half && !plain.half);
  assert.equal(wingsOf(house({halfStorey: true, wings: [W1]}))[0].half, true, "floors 0 follows the house's half floor");
  // an attic window on a half-floor wing's gable end, none without
  const attic = {wall: "w1End", floor: 1, pos: 0.5, w: 0.8, h: 0.8, sill: 0.3};
  const q = sanitize({wings: [{...W1, floors: 1, half: true, width: 7, depth: 6}], windows: [attic]}), op = buildGeometry(q).opsByWall.w1End.ops;
  assert.ok(op.some(o => o.kind === "window" && o.t0 >= 2.7 - 1e-6), "an attic window");
  const r = sanitize({wings: [{...W1, floors: 1, width: 7, depth: 6}], windows: [attic]});
  assert.ok(buildGeometry(r).opsByWall.w1End.ops.every(o => o.kind !== "window"), "none on a wing without a half floor");
  // the valley follows a steeper or flatter wing roof
  for (const pitch of [20, 38, 55]) {
    const p = house({roofPitch: 38, wings: [{...W1, pitch, width: 5}], chimney: false, dormers: []}), geo = buildGeometry(p);
    const tanP = Math.tan(38 * Math.PI / 180), tanW = Math.tan(pitch * Math.PI / 180), top = p.foundation + p.floors * p.floorHeight, ridgeY = top + 3.5 * tanP;
    const w = liveWings(p)[0], yR = top + 2.5 * tanW, k = (ridgeY - yR) / tanP, G = geo.G.roof;
    let bad = 0;
    for (let t = 0; t < G.i.length; t += 3) {
      const v = [0, 1, 2].map(j => G.i[t + j]), c = [0, 1, 2].map(i => v.reduce((s, q2) => s + G.p[q2 * 3 + i], 0) / 3);
      if (G.n[v[0] * 3 + 1] < 0.3) continue;
      const b = -c[2], ac = Math.abs(c[0] - w.at(w.sc, 0)[0]);
      if (Math.abs(c[1] - (ridgeY - b * tanP)) < 0.02 && ac < 2.3 && b > k + ac * tanW / tanP + 0.2 && b < 3.5 + p.overhang - 0.05) bad++;
    }
    assert.equal(bad, 0, `pitch ${pitch}: no house roof under the wing's roof`);
  }
});
