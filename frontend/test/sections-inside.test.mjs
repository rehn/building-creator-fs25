// Inside a building with dividers: the room is cut into one rectangle for each section, the wall between two sections is a wall of both (pieces can stand against it), nothing can
// stand across it, and a door in it is kept clear on both sides. The floor itself (floorRects) is one, so a doorway has floor under it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, catalogFor, KIND } from "../src/editor/model.mjs";
import { roomOf, inRoom, problems, snapItem, footprint, WALL_T, liveWings } from "../src/editor/layout.mjs";

const roomFor = p => roomOf(p, KIND[p.kind].openings ? KIND[p.kind].openings(p) : []);
const house = (s = {}, windows = []) => sanitize({width: 20, depth: 8, ridge: "width", floors: 2, items: [], windows: [{wall: "front", floor: 0, pos: 0.1, type: "door", w: 1, h: 2.1}, ...windows], splits: [{at: 10}], ...s});

test("the room has a rectangle for each section, with the wall between them; the floor is one", () => {
  const p = house(), room = roomFor(p);
  assert.equal(room.rects.length, 2);
  assert.equal(room.floorRects.length, 1, "the floor under both and the wall");
  const [a, b] = room.rects;
  assert.ok(Math.abs(b.x0 - a.x1 - WALL_T) < 1e-9, "the thickness of the wall between");
  assert.ok(Math.abs(a.x1 - (-10 + 10 - WALL_T / 2)) < 1e-9, "the wall stands at 10 m from the left end");
  assert.deepEqual([a.sec, b.sec, a.wid, b.wid], [0, 1, 0, 0]);
  const faces = room.walls.filter(w => w.name === "s1");
  assert.equal(faces.length, 2, "both faces are wall stretches");
  assert.deepEqual(faces.map(w => w.into[0]).sort(), [-1, 1], "turned to either side");
  assert.equal(roomFor(sanitize({width: 20, depth: 8, items: []})).rects.length, 1, "no divider: one room");
});

test("with the ridge from front to back the room is cut across that", () => {
  const p = house({width: 8, depth: 20, ridge: "depth"}), room = roomFor(p);
  assert.equal(room.rects.length, 2);
  assert.ok(room.rects[1].z0 > room.rects[0].z1, "one after the other along the depth");
  assert.equal(room.walls.filter(w => w.name === "s1").length, 2);
});

test("nothing can stand across a divider; a piece put on it goes to one side", () => {
  const p = house(), room = roomFor(p), cat = catalogFor(p);
  const across = {id: 1, type: "table", x: 0, z: 0, rot: 0};
  assert.equal(inRoom(room, footprint(across, cat.table)), false, "a table over the wall is outside the room");
  assert.match(problems([across], cat, room).get(1) || "", /through a wall/i);
  const snapped = snapItem(across, cat.table, room, [], cat), f = footprint(snapped, cat.table);
  assert.ok(inRoom(room, f), "put on one side");
  assert.ok(f.x1 <= room.rects[0].x1 + 1e-6 || f.x0 >= room.rects[1].x0 - 1e-6);
});

test("a wall piece can stand against a divider's face", () => {
  const p = house(), room = roomFor(p), cat = catalogFor(p), type = Object.keys(cat).find(k => cat[k].mount === "wall");
  assert.ok(type, "the catalog has a wall piece");
  const near = snapItem({id: 1, type, x: room.rects[0].x1 - 0.3, z: 0, rot: 0}, cat[type], room, [], cat);
  assert.ok(inRoom(room, footprint(near, cat[type])));
  assert.ok(Math.abs(near.x - (room.rects[0].x1 - cat[type].size(near)[1] / 2)) < 0.1, "against the wall's face");
});

test("a door in a divider is kept clear on both sides", () => {
  const door = {wall: "s1", floor: 0, pos: 0.5, type: "door", w: 1, h: 2.1, opens: true};
  const p = house({}, [door]), room = roomFor(p), cat = catalogFor(p);
  const rects = room.keepOut.filter(k => k.what === "a door");
  assert.equal(rects.length, 3, "the building's own door and the divider's door on each side");
  const before = {id: 1, type: "chair", x: room.rects[0].x1 - 0.3, z: 0, rot: 0}, after = {id: 2, type: "chair", x: room.rects[1].x0 + 0.3, z: 0, rot: 0};
  assert.match(problems([before], cat, room).get(1) || "", /door/i);
  assert.match(problems([after], cat, room).get(2) || "", /door/i);
});

test("a part's dividers cut its room too, and what is built keeps one floor", () => {
  const p = sanitize({width: 12, depth: 8, floors: 2, items: [], windows: [{wall: "front", floor: 0, pos: 0.1, type: "door", w: 1, h: 2.1}],
    wings: [{wall: "back", pos: 0.5, width: 6, depth: 12, floors: 0, closed: true, splits: [{at: 6}]}]});
  const room = roomFor(p);
  assert.equal(room.rects.length, 3, "the house and the two sections of the part");
  assert.deepEqual(room.rects.map(r => [r.wid, r.sec]).sort((a, b) => a[0] - b[0] || a[1] - b[1]), [[0, 0], [1, 0], [1, 1]]);
  assert.equal(room.floorRects.length, 2);
  assert.ok(room.walls.filter(w => w.name === "w1D1").length === 2);
});

test("automatic furnishing of a divided building puts nothing across the wall", () => {
  for (const s of [{}, {kind: "cow", width: 30, depth: 14, splits: [{at: 10}, {at: 20}]}]) {
    const p = sanitize({width: 20, depth: 8, ridge: "width", floors: 2, splits: [{at: 10}], windows: undefined, ...s}), cat = catalogFor(p), room = roomFor(p);
    assert.ok((p.items || []).length > 0, `${p.kind}: furnished`);
    // (chairs round a table are put by their distance from it and may touch something: only what crosses a wall or blocks a door counts here)
    assert.deepEqual([...problems(p.items, cat, room)].filter(([, m]) => /wall|door/i.test(m)), [], `${p.kind}: no piece across a wall or on a door`);
  }
});

test("the floor is one under the whole building: no seam where a divider stands (a doorway has floor under it)", () => {
  const door = {wall: "s1", floor: 0, pos: 0.5, type: "door", w: 1.2, h: 2.1, opens: true};
  const p = sanitize({kind: "cow", width: 24, depth: 12, foundation: 0, items: [], splits: [{at: 12}], windows: [door]}), g = buildGeometry(p).G.fittings;
  // the floor's top (the walls' faces start at the floor too: only vertices at the floor's top height are looked at)
  const top = p.foundation + 0.03, xs = new Set(); for (let k = 0; k < g.p.length; k += 3) if (Math.abs(g.p[k + 1] - top) < 0.005) xs.add(+g.p[k].toFixed(4));
  assert.ok(xs.size > 0, "there is a floor");
  assert.ok(![-WALL_T / 2, WALL_T / 2].map(v => +v.toFixed(4)).some(v => xs.has(v)), "no floor edge at the divider's faces");
  void liveWings;
});
