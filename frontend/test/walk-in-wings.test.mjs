// The inside across parts (plan step 4b): a wing opens into the house through a passage, and the floor, walls,
// ceiling, collision, doors and furniture go through the wing too. Barns can have wings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, buildI3d, catalogFor, PRESETS, KIND } from "../src/editor/model.mjs";
import { roomOf, inRoom, roomBox, problems, snapItem, placeNew, footprint } from "../src/editor/layout.mjs";
import { objectProblems } from "../src/editor/objects.mjs";

// Does the segment a-b cross any triangle of mesh g? (Möller–Trumbore.)
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
const barn = (s = {}) => sanitize({...PRESETS.find(x => x.id === "ladugard").settings, wings: [{wall: "front", pos: 0.35, width: 7, depth: 9, floors: 0}], ...s});
const house = (s = {}) => sanitize({wings: [{wall: "back", pos: 0.5, width: 5, depth: 5, floors: 0}], ...s});
const mid = r => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
const roomFor = p => roomOf(p, KIND[p.kind].openings ? KIND[p.kind].openings(p) : []);

test("room across parts: the floors abut, the walls are the outline, a wall a wing opens into is in two pieces", () => {
  for (const [name, p] of [["barn", barn()], ["house", house()]]) {
    const room = roomFor(p);
    assert.equal(room.rects.length, 2, name);
    const names = room.walls.map(w => w.name);
    assert.ok(["w1End", "w1Left", "w1Right"].every(n => names.includes(n)), `${name}: the wing's walls ${names}`);
    const wall = p.wings[0].wall;
    assert.equal(names.filter(n => n === wall).length, 2, `${name}: the ${wall} wall is in two pieces`);
    // every stretch of wall faces into the room
    for (const w of room.walls) {
      const c = [(w.x0 + w.x1) / 2 + w.into[0] * 0.02, (w.z0 + w.z1) / 2 + w.into[1] * 0.02];
      assert.ok(inRoom(room, {x0: c[0], x1: c[0], z0: c[1], z1: c[1]}), `${name}: ${w.name} faces the room`);
    }
    const box = roomBox(room);
    assert.ok(box.z1 - box.z0 > room.z1 - room.z0, `${name}: the box reaches the wing`);
  }
  assert.equal(roomOf(sanitize({})).rects.length, 1, "no wing: one rectangle as before");
});

test("room across parts: a piece may straddle the passage, not stick out", () => {
  const p = barn(), room = roomFor(p), [a, b] = room.rects, line = a.z1;
  assert.ok(inRoom(room, {x0: b.x0 + 0.5, x1: b.x1 - 0.5, z0: line - 1, z1: line + 1}), "across the passage line");
  assert.ok(!inRoom(room, {x0: b.x1 - 0.5, x1: b.x1 + 1, z0: line + 0.5, z1: line + 1.5}), "out through the wing's side");
  assert.ok(!inRoom(room, {x0: b.x1 + 0.2, x1: b.x1 + 1.2, z0: line + 0.2, z1: line + 1.2}), "in the corner beside the wing");
  // snapping keeps pieces in the room, wall pieces on a stretch of wall
  const cat = catalogFor(p), stall = snapItem({id: 1, type: "stalls", x: mid(b)[0], z: b.z1, rot: 0, count: 4}, cat.stalls, room);
  assert.equal(stall.rot, 180, "against the wing's far wall, facing in");
  const bale = snapItem({id: 2, type: "bale", x: b.x1 + 5, z: b.z1 + 5, rot: 0}, cat.bale, room);
  assert.ok(inRoom(room, footprint(bale, cat.bale)), "a floor piece dropped far away comes back into the room");
  const it = placeNew("calfpen", [], cat, room);
  assert.deepEqual([...problems([it], cat, room)], []);
});

test("room across parts: furnished automatically across both parts, with nothing wrong", () => {
  const hen = sanitize({kind: "chicken", wings: [{wall: "front", pos: 0.1, width: 6, depth: 6, floors: 0}], hens: 80, width: 12, depth: 7});
  for (const p of [barn(), barn({cows: 60, width: 30, depth: 12}), house(), hen]) {
    const room = roomFor(p), cat = catalogFor(p), r = room.rects[1];
    assert.deepEqual([...problems(p.items, cat, room)], [], p.kind);
    const inWing = p.items.filter(i => i.x > r.x0 && i.x < r.x1 && i.z > r.z0 && i.z < r.z1);
    assert.ok(p.items.length > 0 && inWing.length > 0, `${p.kind}: something stands in the wing (${p.items.length} pieces)`);
  }
});

test("walls across parts: a passage in the house's wall, collision across the wing, closed round it", () => {
  const p = barn({items: []}), geo = buildGeometry(p), wing = geo.wings[0], F = p.foundation;   // (no furniture in the way)
  const op = geo.opsByWall[wing.wall].ops.find(o => o.kind === "open");
  assert.ok(op && op.t0 === 0 && op.t1 > 2.2, "a passage");
  const room = roomFor(p), [a, b] = room.rects, c = mid(b);
  // from the middle of the house into the middle of the wing, and on towards its far wall: nothing in the way
  assert.ok(!hits(geo.collision, [0, F + 1, 0], [c[0], F + 1, c[1]]), "through the passage");
  assert.ok(!hits(geo.collision, [c[0], F + 1, a.z1 + 0.5], [c[0], F + 1, b.z1 - 0.3]), "inside the wing");
  assert.ok(!hits(geo.collision, [c[0], F + 0.2, c[1]], [c[0], F + 1.9, c[1]]), "headroom");
  // but not through the wing's walls or the house's wall beside the passage
  assert.ok(hits(geo.collision, [c[0], F + 1, c[1]], [c[0], F + 1, b.z1 + 1]), "the far wall");
  assert.ok(hits(geo.collision, [c[0], F + 1, c[1]], [b.x1 + 1, F + 1, c[1]]), "the side wall");
  assert.ok(hits(geo.collision, [b.x1 + 0.5, F + 1, a.z1 - 1], [b.x1 + 0.5, F + 1, a.z1 + 1]), "the house's wall beside the passage");
  assert.match(buildI3d(p, {}), /<Shape name="collision"/);
});

test("walls across parts: a house's wing has its ceiling and doors that open", () => {
  const p = house({windows: [{wall: "front", floor: 0, pos: 0.5, w: 1, h: 2.1, sill: 0, type: "door"}, {wall: "w1End", floor: 0, pos: 0.5, w: 1, h: 2.1, sill: 0, type: "door"}]});
  const geo = buildGeometry(p), ceil = p.foundation + p.floorHeight, fit = geo.G.fittings, b = roomFor(p).rects[1];
  let ceiling = false;
  for (let t = 0; t < fit.i.length; t += 3) {
    const v = [0, 1, 2].map(k => fit.i[t + k]), ny = fit.n[v[0] * 3 + 1], ys = v.map(k => fit.p[k * 3 + 1]), xz = v.map(k => [fit.p[k * 3], fit.p[k * 3 + 2]]);
    if (ny < -0.9 && ys.every(y => Math.abs(y - ceil) < 1e-6) && xz.every(([x, z]) => x >= b.x0 - 1e-6 && x <= b.x1 + 1e-6 && z >= b.z0 - 1e-6 && z <= b.z1 + 1e-6)) ceiling = true;
  }
  assert.ok(ceiling, "a ceiling over the wing");
  assert.equal(geo.doors.length, 2, "both doors open");
  assert.ok(geo.doors.some(d => d.wall === "w1End"));
  assert.match(buildI3d(p, {}), /door2Trigger/);
  const shut = sanitize({...p, windows: p.windows.map(w => w.wall === "w1End" ? {...w, opens: false} : w)});
  assert.equal(buildGeometry(shut).doors.length, 1, "a door that doesn't open stays shut");
});

test("walls across parts: a wing in the pasture is warned about; barns keep their wings through a save", () => {
  const p = barn({wings: [{wall: "back", pos: 0.5, width: 6, depth: 5, floors: 0}]});
  assert.ok([...objectProblems(p).values()].some(m => /wing/i.test(m)), "the pasture is on the back wall");
  assert.equal(sanitize(JSON.parse(JSON.stringify(p))).wings.length, 1);
  assert.equal(KIND.cow.hides.includes("Wings"), false);
});
