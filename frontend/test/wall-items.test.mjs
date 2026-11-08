// The things on a wall, in order along it (windows, doors and the parts that stand on it), names of parts and walls, and adding one where there is room.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, wallLabel, partName, wallItems, addOpening, addPartOn, WALL_NAMES } from "../src/editor/model.mjs";
import { liveWings, wallsOf } from "../src/editor/layout.mjs";

const house = (extra = {}) => sanitize({width: 16, depth: 9, floors: 2, floorHeight: 3, foundation: 0.3,
  wings: [{id: 1, name: "Pumphus", wall: "back", pos: 0.5, width: 6, depth: 8, floors: 1}, {id: 2, wall: "w1Left", pos: 0.5, width: 3, depth: 3, floors: 0}],
  windows: [{wall: "front", floor: 0, pos: 0.5, type: "door", w: 1.4, h: 2.3}, {wall: "back", floor: 0, pos: 0.1, type: "window", w: 1, h: 1.2, sill: 0.9}, {wall: "back", floor: 0, pos: 0.9, type: "window", w: 1, h: 1.2, sill: 0.9}, {wall: "back", floor: 1, pos: 0.5, type: "window", w: 1, h: 1.2, sill: 0.9}], ...extra});

test("part names: a name of its own, else Wing n; walls are named after their part", () => {
  const p = house();
  assert.equal(p.wings[0].name, "Pumphus");
  assert.equal(p.wings[1].name, "", "no name: empty");
  assert.equal(sanitize({wings: [{wall: "back", name: "  x".repeat(40)}]}).wings[0].name.length <= 40, true, "kept short");
  assert.equal(partName(p, 1), "Pumphus");
  assert.equal(partName(p, 2), "Wing 2");
  assert.equal(wallLabel(p, "front"), "Front");
  assert.equal(wallLabel(p, "w1Left"), "Pumphus left side");
  assert.equal(wallLabel(p, "w2End"), "Wing 2 end");
  assert.equal(wallLabel(p, "w1Right"), "Pumphus right side");
  assert.equal(WALL_NAMES.w1Left, "Wing 1 left side", "the plain names stay for the rest of the code");
});

test("things on a wall: windows, doors and parts in order along it, with where they are", () => {
  const p = house(), items = wallItems(p, "back"), L = p.width;
  // sorted by where they start
  assert.deepEqual(items.map(i => i.s0), [...items.map(i => i.s0)].sort((a, b) => a - b));
  const part = items.find(i => i.kind === "part"), wg = liveWings(p)[0];
  assert.equal(part.id, 1);
  assert.ok(Math.abs(part.s0 - wg.s0) < 1e-9 && Math.abs(part.s1 - wg.s1) < 1e-9);
  assert.equal(items.filter(i => i.kind === "window").length, 3);
  assert.deepEqual(items.filter(i => i.kind === "window").map(i => i.floor).sort(), [0, 0, 1]);
  assert.equal(wallItems(p, "front").map(i => i.kind).join(), "door");
  assert.equal(wallItems(p, "w1Left").map(i => i.kind).join(), "part", "a part on a part's wall");
  assert.deepEqual(wallItems(p, "nope"), []);
  // a part that is left out is still listed, marked
  const off = house({wings: [{id: 1, wall: "back", pos: 0.5, width: 6, depth: 8}, {id: 2, wall: "back", pos: 0.52, width: 6, depth: 8}]});
  assert.equal(wallItems(off, "back").filter(i => i.kind === "part").length, 2);
  assert.ok(wallItems(off, "back").find(i => i.kind === "part" && i.id === 2).off);
});

test("add a window or a door on a wall: where there is room, not over what stands there", () => {
  const p = house();
  const wl = addOpening(p, "front", "window");
  assert.ok(wl);
  const q = sanitize({...p, windows: wl});
  assert.equal(q.windows.length, p.windows.length + 1);
  buildGeometry(q);
  assert.ok(!q.windows[q.windows.length - 1]._hidden, "not hidden: it landed on a free stretch");
  // on the back wall the part stands in the middle: a new ground-floor window goes beside it
  const wb = sanitize({...p, windows: addOpening(p, "back", "window", 0)}), added = wb.windows.filter(w => w.wall === "back" && w.floor === 0).length;
  assert.equal(added, 3);
  const g = liveWings(wb)[0], L = wb.width;
  for (const w of wb.windows.filter(x => x.wall === "back" && x.floor === 0)) { const c = w.pos * L; assert.ok(!(c > g.s0 - 0.3 && c < g.s1 + 0.3), `window at ${c.toFixed(2)} is in the part (${g.s0.toFixed(1)}-${g.s1.toFixed(1)})`); }
  // above the part's roof (floor 1 on a lower part) the middle is free
  const up = addOpening(p, "back", "window", 1);
  assert.ok(up && up.filter(w => w.wall === "back" && w.floor === 1).length === 2);
  // a door goes on the ground floor, as big as the building's other doors
  const d = addOpening(p, "left", "door");
  const nd = d[d.length - 1];
  assert.deepEqual([nd.type, nd.floor, nd.w, nd.h], ["door", 0, 1.4, 2.3]);
  // no room: null (a short wall full of things)
  let full = sanitize({width: 4, depth: 4, windows: [{wall: "front", floor: 0, pos: 0.5, type: "door", w: 3, h: 2.1}]});
  assert.equal(addOpening(full, "front", "window", 0), null);
  assert.equal(addOpening(p, "nope", "window"), null);
});

test("add a part on a wall: in the widest free stretch, on the house's or a part's wall; none where there is no room", () => {
  const p = house({wings: [{id: 1, wall: "back", pos: 0.5, width: 6, depth: 8, floors: 1}], windows: [{wall: "front", floor: 0, pos: 0.5, type: "door", w: 1.4, h: 2.3}]});
  const w = addPartOn(p, "w1Left");
  assert.ok(w && w.length === 2);
  const q = sanitize({...p, wings: w}), n = q.wings[1];
  assert.equal(n.wall, "w1Left");
  assert.ok(liveWings(q).some(x => x.id === n.id), "it fits: " + JSON.stringify(wingsOfOff(q)));
  // on the front wall, where the door is: beside it, not over it
  const f = sanitize({...p, wings: addPartOn(p, "front")}), part = liveWings(f).find(x => x.wall === "front");
  assert.ok(part, "built");
  const door = f.windows.find(x => x.type === "door" && x.wall === "front"), L = f.width;
  assert.ok(part.s1 < door.pos * L - door.w / 2 + 1e-6 || part.s0 > door.pos * L + door.w / 2 - 1e-6, "beside the door");
  assert.equal(addPartOn(p, "nope"), null);
});
const wingsOfOff = p => liveWings(p).length;

test("add a part beside a part: far enough away that their eaves don't touch", () => {
  const p = house({wings: [{id: 1, wall: "back", pos: 0.5, width: 6, depth: 8, floors: 1}], windows: [{wall: "front", floor: 0, pos: 0.5, type: "door", w: 1.4, h: 2.3}]});
  const q = sanitize({...p, wings: addPartOn(p, "back")});
  assert.equal(q.wings.length, 2);
  assert.equal(liveWings(q).length, 2, "both built, the new one not left out for being too close");
  // and again: three on one wall when the wall has room
  const r = addPartOn(q, "back");
  if (r) assert.equal(liveWings(sanitize({...q, wings: r})).length, 3);
});
