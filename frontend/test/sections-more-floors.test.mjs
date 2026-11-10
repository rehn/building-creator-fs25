// A section can have more floors than the building's own setting (a one-floor building of 5.4 m with a section of two floors): its windows are real, and listed in the tree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, buildingTree, addOpening, moveToWall, wallItems, openingProblem } from "../src/editor/model.mjs";
import { maxFloors } from "../src/editor/layout.mjs";

const tall = (windows = [], extra = {}) => sanitize({width: 20, depth: 8, ridge: "width", roofType: "gable", floors: 1, floorHeight: 5.4, items: [], splits: [{at: 10, floors: 2}],
  windows: [{wall: "front", floor: 0, pos: 0.1, type: "door", w: 1, h: 2.1}, ...windows], ...extra});
const win = (wall, pos, floor) => ({wall, floor, pos, type: "window", w: 1, h: 1.2, sill: 0.9});
const find = (n, f) => { if (f(n)) return n; for (const c of n.children || []) { const r = find(c, f); if (r) return r; } return null; };

test("the most floors a wall can have is the most of its sections", () => {
  assert.equal(maxFloors(tall(), 0), 2);
  assert.equal(maxFloors(sanitize({floors: 2, splits: []}), 0), 2);
  assert.equal(maxFloors(sanitize({floors: 2, width: 20, depth: 8, splits: [{at: 10, floors: 1}]}), 0), 2, "the first section has the building's own");
});

test("a window on the second floor of a two-floor section of a one-floor building is built and in the tree", () => {
  const p = tall([win("front", 0.75, 1)]), geo = buildGeometry(p), up = p.windows.find(w => w.floor === 1);
  const op = geo.opsByWall.front.ops.find(o => o.id === up.id);
  assert.ok(op, "built");
  assert.ok(Math.abs(op.t0 - (2.7 + 0.9)) < 1e-6, `on the second floor: ${op && op.t0}`);
  assert.ok(wallItems(p, "front").some(i => i.id === up.id), "listed on the wall");
  const t = buildingTree(p), n = find(t, x => x.type === "window" && x.id === up.id);
  assert.ok(n, "in the tree");
  const sec = t.children[1], floor2 = sec.children.find(f => f.floor === 1);
  assert.ok(floor2 && !floor2.missing, "under the second floor of the second section");
  assert.ok(find(floor2, x => x.type === "window" && x.id === up.id));
});

test("a window on the second floor in the first section (one floor) is hidden and listed under a floor that isn't there", () => {
  const p = tall([win("front", 0.25, 1)]), up = p.windows.find(w => w.floor === 1);
  buildGeometry(p);
  assert.equal(up._hidden, true);
  const first = buildingTree(p).children[0], lost = first.children.find(f => f.floor === 1);
  assert.ok(lost && lost.missing && find(lost, x => x.type === "window" && x.id === up.id));
});

test("adding on a floor in a section: allowed where the section has the floor, not where it lacks it", () => {
  const p = tall();
  const list = addOpening(p, "front", "window", 1, 15);
  assert.ok(list, "the two-floor section");
  assert.ok(list[list.length - 1].pos * 20 > 10);
  assert.ok(addOpening(p, "front", "window", 1, 5).at(-1).pos * 20 > 10, "the one-floor section has no second floor: it goes to the section that has");
  const q = sanitize({width: 20, depth: 8, floors: 2, floorHeight: 2.7, items: [], splits: [{at: 10, floors: 1}], windows: [{wall: "front", floor: 0, pos: 0.1, type: "door", w: 1, h: 2.1}]});
  assert.ok(addOpening(q, "front", "window", 1, 15).at(-1).pos * 20 < 10, "no second floor in the one-floor section: it goes to the first");
  const none = sanitize({width: 20, depth: 8, floors: 1, floorHeight: 2.7, items: [], splits: [{at: 10}], windows: [{wall: "front", floor: 0, pos: 0.1, type: "door", w: 1, h: 2.1}]});
  assert.equal(addOpening(none, "front", "window", 1, 15), null, "and nowhere when no section has it");
});

test("moving a window to a floor of a section that has it", () => {
  const p = tall([win("back", 0.5, 0)]), w = p.windows.find(x => x.wall === "back");
  assert.ok(moveToWall(p, {kind: "win", id: w.id}, "front", 1, null, true, 15).windows, "to the second floor of the front");
});

test("windows on the attic (the half floor): in the gable walls of a section that has one, with the right floor for that section", () => {
  const p = sanitize({width: 20, depth: 8, ridge: "width", roofType: "gable", floors: 2, floorHeight: 2.7, halfStorey: true, items: [], splits: [{at: 10, floors: 1, half: true}],
    windows: [{wall: "front", floor: 0, pos: 0.1, type: "door", w: 1, h: 2.1}]});
  // the left end wall is in the first section (two floors, the attic is floor 3), the right one in the second (one floor, the attic is floor 2)
  assert.ok(addOpening(p, "left", "window", 2), "the attic of the first section");
  assert.ok(addOpening(p, "right", "window", 1), "the attic of the second");
  assert.equal(addOpening(p, "right", "window", 2), null, "the second has no floor 3");
  assert.equal(addOpening(p, "left", "window", 3), null);
  assert.equal(addOpening(p, "front", "window", 2, 5), null, "not on a long wall: the knee wall is too low for one");
  assert.match(openingProblem(p, "front", "window", 2, 5), /gable/i);
  assert.match(openingProblem(p, "left", "window", 3), /no floor 4/);
  assert.equal(openingProblem(p, "left", "window", 2), null);
  // and it is in the tree under the attic
  const q = sanitize({...p, windows: [...p.windows, {wall: "right", floor: 1, pos: 0.5, type: "window", w: 1, h: 0.8, sill: 0.2}]}), w = q.windows.find(x => x.wall === "right");
  const sec = buildingTree(q).children[1], attic = sec.children.find(f => f.floor === 1);
  assert.ok(attic && !attic.missing, "an attic floor node");
  assert.ok(find(attic, x => x.type === "window" && x.id === w.id), "with the window in it");
  // moving a window to the attic of a gable wall
  assert.ok(moveToWall(p, {kind: "win", id: 1}, "left", 2) && true);
});

test("a sill can be higher than 2 m: a window high up on a tall floor or in a gable", () => {
  const p = sanitize({width: 20, depth: 8, ridge: "width", floors: 1, floorHeight: 5.4, items: [], windows: [{wall: "front", floor: 0, pos: 0.1, type: "door", w: 1, h: 2.1}, {wall: "front", floor: 0, pos: 0.6, type: "window", w: 1, h: 0.8, sill: 4.2}]});
  const win = p.windows.find(w => w.type === "window");
  assert.equal(win.sill, 4.2, "kept");
  const op = buildGeometry(p).opsByWall.front.ops.find(o => o.id === win.id);
  assert.ok(op && Math.abs(op.t0 - 4.2) < 1e-9 && Math.abs(op.t1 - 5) < 1e-9, "built at 4.2 to 5.0 m");
  assert.equal(sanitize({...p, windows: [{...win, sill: 99}]}).windows[0].sill, 6, "but not past 6 m");
});
