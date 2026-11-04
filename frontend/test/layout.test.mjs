import { test } from "node:test";
import assert from "node:assert/strict";
import { roomOf, footprint, toWorld, snapItem, problems, cleanItems, WALL_T, itemAt, placeNew, rotateItem, History } from "../src/editor/layout.mjs";

// A made-up catalog: a shelf that hangs on a wall and a crate that stands on the floor.
const CATALOG = {
  shelf: { name: "Shelf", mount: "wall", params: [{ k: "length", min: 0.5, max: 4, step: 0.1 }], defaults: { length: 2 },
    size: it => [it.length, 0.4], height: () => 1 },
  crate: { name: "Crate", mount: "floor", params: [], defaults: {}, size: () => [0.8, 0.6], height: () => 0.5 },
};
// 6 x 4 m building, door in the middle of the front wall (z = +2).
const P = { width: 6, depth: 4, foundation: 0.2, floors: 1, floorHeight: 2.4, halfStorey: false, doorWall: "front", doorPos: 0, doorW: 1 };
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} vs ${b}`);

test("roomOf: the floor inside the walls and the strip inside the door", () => {
  const r = roomOf(P), t = WALL_T;
  near(r.x0, -3 + t, "x0"); near(r.x1, 3 - t, "x1"); near(r.z0, -2 + t, "z0"); near(r.z1, 2 - t, "z1");
  near(r.F, 0.2, "floor"); near(r.H, 2.4, "height");
  // a keep-out across the door (1 m wide, plus 30 cm each side), 1.2 m into the room from the front wall
  near(r.door.x0, -0.8, "door x0"); near(r.door.x1, 0.8, "door x1");
  near(r.door.z1, 2 - t, "door z1"); near(r.door.z0, 2 - t - 1.2, "door z0");
  // the walls, each as the line of its inside face and the direction into the room
  assert.equal(r.walls.length, 4);
});

test("toWorld and footprint: an item turns about its centre in quarter turns", () => {
  const it = { x: 1, z: -1, rot: 0, length: 2, type: "shelf" };
  assert.deepEqual(toWorld(it, 1, 0).map(v => +v.toFixed(9)), [2, -1]);
  const r0 = footprint(it, CATALOG.shelf);
  near(r0.x1 - r0.x0, 2, "width at 0°"); near(r0.z1 - r0.z0, 0.4, "depth at 0°");
  const r90 = footprint({ ...it, rot: 90 }, CATALOG.shelf);
  near(r90.x1 - r90.x0, 0.4, "width at 90°"); near(r90.z1 - r90.z0, 2, "depth at 90°");
  // local +z is the item's front: at 0° it faces +z, at 90° +x, at 180° -z
  assert.deepEqual(toWorld({ ...it, rot: 90 }, 0, 1).map(v => +v.toFixed(9)), [2, -1]);
  assert.deepEqual(toWorld({ ...it, rot: 180 }, 0, 1).map(v => +v.toFixed(9)), [1, -2]);
});

test("snapItem: a wall item goes flat against the nearest inside wall, facing the room", () => {
  const room = roomOf(P);
  // dropped near the back wall (z = -2), a bit off it and turned the wrong way
  const s = snapItem({ id: 1, type: "shelf", x: 0.33, z: -1.2, rot: 90, length: 2 }, CATALOG.shelf, room);
  assert.equal(s.rot, 0, "faces +z, into the room");
  near(s.z, room.z0 + 0.2, "back against the wall");
  near(s.x, 0.25, "slid along the wall to the grid");
  // near the left wall (x = -3): turned to face +x
  const l = snapItem({ id: 1, type: "shelf", x: -2.5, z: 0.1, rot: 0, length: 2 }, CATALOG.shelf, room);
  assert.equal(l.rot, 90);
  near(l.x, room.x0 + 0.2, "against the left wall");
  // kept within the wall's length
  const e = snapItem({ id: 1, type: "shelf", x: 2.6, z: -1.9, rot: 0, length: 2 }, CATALOG.shelf, room);
  near(e.x, room.x1 - 1, "end of the shelf at the corner");
});

test("snapItem: a floor item snaps to a 25 cm grid and stays inside", () => {
  const room = roomOf(P);
  const s = snapItem({ id: 2, type: "crate", x: 0.61, z: 0.13, rot: 0 }, CATALOG.crate, room);
  near(s.x, 0.5, "x"); near(s.z, 0.25, "z");
  const o = snapItem({ id: 2, type: "crate", x: 9, z: -9, rot: 0 }, CATALOG.crate, room);
  const f = footprint(o, CATALOG.crate);
  assert.ok(f.x1 <= room.x1 + 1e-9 && f.z0 >= room.z0 - 1e-9, "pulled back inside");
});

test("problems: outside the room, overlapping, or in the doorway", () => {
  const room = roomOf(P);
  const items = [
    { id: 1, type: "crate", x: 0, z: 0, rot: 0 },
    { id: 2, type: "crate", x: 0.4, z: 0.2, rot: 0 },         // overlaps 1
    { id: 3, type: "crate", x: 5, z: 0, rot: 0 },             // outside
    { id: 4, type: "crate", x: 0, z: 1.5, rot: 0 },           // in front of the door
    { id: 5, type: "shelf", x: -1.5, z: room.z0 + 0.2, rot: 0, length: 1 }, // fine
  ];
  const pr = problems(items, CATALOG, room);
  assert.match(pr.get(1), /overlap/i); assert.match(pr.get(2), /overlap/i);
  assert.match(pr.get(3), /outside/i);
  assert.match(pr.get(4), /door/i);
  assert.equal(pr.has(5), false);
});

test("cleanItems: unknown types dropped, settings clamped, quarter turns, ids renumbered", () => {
  const out = cleanItems([
    { id: 9, type: "shelf", x: "1.234", z: -1, rot: 100, length: 99 },
    { id: 3, type: "dragon", x: 0, z: 0 },
    { type: "crate", x: 0, z: 0, rot: -90, junk: "<script>" },
    null,
  ], CATALOG);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { id: 1, type: "shelf", x: 1.234, z: -1, rot: 90, length: 4 });
  assert.deepEqual(out[1], { id: 2, type: "crate", x: 0, z: 0, rot: 270 });
  assert.equal(cleanItems(Array(500).fill({ type: "crate", x: 0, z: 0 }), CATALOG).length, 200, "at most 200");
});

/* ---------- Editing (the interior editor's moves) ---------- */
test("itemAt: the piece under a point, the last drawn on top", () => {
  const items = [
    { id: 1, type: "crate", x: 0, z: 0, rot: 0 },
    { id: 2, type: "crate", x: 0.5, z: 0, rot: 0 },
  ];
  assert.equal(itemAt(items, CATALOG, -0.3, 0), 1);
  assert.equal(itemAt(items, CATALOG, 0.2, 0), 2, "overlap: the later one");
  assert.equal(itemAt(items, CATALOG, 2, 2), null);
});

test("placeNew: a new piece lands snapped, inside, clear of the door and the other pieces", () => {
  const room = roomOf(P);
  let items = [];
  for (let k = 0; k < 6; k++) {
    const it = placeNew("crate", items, CATALOG, room);
    assert.equal(it.id, k + 1);
    items = [...items, it];
    assert.equal(problems(items, CATALOG, room).size, 0, `piece ${k + 1}`);
    assert.equal(it.x, Math.round(it.x / 0.25) * 0.25, "on the grid");
  }
  const shelf = placeNew("shelf", items, CATALOG, room);
  assert.equal(shelf.length, 2, "with its default settings");
  const on = (v, ws) => ws.some(w => Math.abs(v - w) < 1e-9);
  assert.ok(on(shelf.x, [room.x0 + 0.2, room.x1 - 0.2]) || on(shelf.z, [room.z0 + 0.2, room.z1 - 0.2]), "against a wall");
});

test("rotateItem: floor pieces turn a quarter and stay inside; wall pieces keep facing the room", () => {
  const room = roomOf(P);
  const c = rotateItem({ id: 1, type: "crate", x: room.x1 - 0.4, z: 0, rot: 0 }, CATALOG.crate, room);
  assert.equal(c.rot, 90);
  assert.ok(footprint(c, CATALOG.crate).x1 <= room.x1 + 1e-9);
  assert.equal(rotateItem({ ...c, rot: 270 }, CATALOG.crate, room).rot, 0);
  const s = { id: 2, type: "shelf", x: 0, z: room.z0 + 0.2, rot: 0, length: 2 };
  assert.deepEqual(rotateItem(s, CATALOG.shelf, room), s);
});

test("History: undo and redo through edits; a new edit drops the redo", () => {
  const h = new History([]);
  h.push([1]); h.push([1, 2]);
  assert.deepEqual(h.undo(), [1]);
  assert.deepEqual(h.undo(), []);
  assert.equal(h.canUndo, false);
  assert.deepEqual(h.redo(), [1]);
  h.push([9]);
  assert.equal(h.canRedo, false);
  assert.deepEqual(h.undo(), [1]);
  // edits are copies: changing what was pushed doesn't change history
  const a = [{ x: 1 }]; h.push(a); a[0].x = 5; h.push([]);
  assert.deepEqual(h.undo(), [{ x: 1 }]);
});
