// Duplicating things in the tree (a window or a door, a divider with what is in it): the model's side of the context menu and Ctrl+D.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, duplicateOpening, duplicateSplit, freeStretches, addOpening, openingProblem } from "../src/editor/model.mjs";
import { openingSpan } from "../src/editor/layout.mjs";

const house = (s = {}) => sanitize({width: 20, depth: 8, ridge: "width", floors: 2, items: [], windows: [{wall: "front", floor: 0, pos: 0.1, type: "door", w: 1, h: 2.1}, {wall: "front", floor: 1, pos: 0.5, type: "window", w: 1.2, h: 1.1, sill: 0.8, style: "sprojs"}], ...s});

test("duplicate an opening: a copy with its own id, on the same wall and floor, beside the original", () => {
  const p = house(), win = p.windows.find(w => w.type === "window"), list = duplicateOpening(p, win.id);
  assert.equal(list.length, p.windows.length + 1);
  const copy = list[list.length - 1];
  assert.notEqual(copy.id, win.id);
  assert.ok(list.every((w, i) => list.findIndex(x => x.id === w.id) === i), "ids are unique");
  for (const k of ["wall", "floor", "type", "w", "h", "sill", "style"]) assert.equal(copy[k], win[k], k);
  const [a0, a1] = openingSpan(win, 20), [b0, b1] = openingSpan(copy, 20);
  assert.ok(b1 <= a0 - 0.2 + 1e-9 || b0 >= a1 + 0.2 - 1e-9, "no overlap: 20 cm clear");
  assert.ok(Math.abs(copy.pos - win.pos) < 0.3, "near the original");
  assert.equal(p.windows.length, 2, "the save is not changed");
});

test("duplicate a door: on the ground floor, as a door", () => {
  const p = house(), door = p.windows.find(w => w.type === "door"), list = duplicateOpening(p, door.id), copy = list[list.length - 1];
  assert.equal(copy.type, "door");
  assert.equal(copy.floor, 0);
  assert.ok(copy.opens === door.opens && copy.swing === door.swing && copy.hinge === door.hinge);
});

test("duplicate an opening: nothing when the wall has no room, or there is no such opening", () => {
  const narrow = sanitize({width: 3, depth: 8, floors: 1, winW: 2.5, items: [], windows: [{wall: "front", floor: 0, pos: 0.5, type: "window", w: 1, h: 1.2, sill: 0.9}, {wall: "back", floor: 0, pos: 0.5, type: "door", w: 1, h: 2.1}]});
  assert.equal(duplicateOpening(narrow, narrow.windows.find(w => w.wall === "front").id), null);
  assert.equal(duplicateOpening(house(), 999), null);
  void freeStretches;
});

test("duplicate a divider: a new one in the longest stretch, with the same floors and what is in it", () => {
  const p = house({splits: [{at: 8, floors: 1, floorHeight: 0}], windows: [{wall: "front", floor: 0, pos: 0.1, type: "door", w: 1, h: 2.1}, {wall: "s1", floor: 0, pos: 0.5, type: "door", w: 1, h: 2.1}, {wall: "s1", floor: 1, pos: 0.3, type: "window", w: 1, h: 1.1, sill: 0.8}]});
  const r = duplicateSplit(p, 0, 1);
  assert.equal(r.splits.length, 2);
  const added = r.splits.find(s => s.id === r.id);
  assert.notEqual(added.at, 8);
  assert.equal(added.floors, 1);
  assert.equal(r.key, `s${r.id}`);
  assert.deepEqual(r.windows.filter(w => w.wall === r.key).map(w => w.type).sort(), ["door", "window"], "its openings are copied");
  assert.equal(r.windows.filter(w => w.wall === "s1").length, 2, "and the original keeps its own");
  assert.ok(new Set(r.windows.map(w => w.id)).size === r.windows.length, "unique ids");
});

test("duplicate a divider of a part; none when there is no room or no such divider", () => {
  const q = sanitize({width: 12, depth: 8, wings: [{wall: "back", pos: 0.5, width: 6, depth: 14, floors: 0, splits: [{at: 4, floors: 1}]}], windows: [{wall: "front", floor: 0, pos: 0.2, type: "door", w: 1, h: 2.1}]});
  const r = duplicateSplit(q, 1, 1);
  assert.equal(r.splits.length, 2);
  assert.equal(r.key, `w1D${r.id}`);
  assert.equal(duplicateSplit(q, 1, 9), null);
  assert.equal(duplicateSplit(q, 7, 1), null, "no such part");
  assert.equal(duplicateSplit(sanitize({width: 20, depth: 8, roofType: "hip", splits: [{at: 8}]}), 0, 1), null, "none under a hip roof");
  const tight = sanitize({width: 8, depth: 8, ridge: "width", splits: [{at: 2.5}, {at: 4}, {at: 5.5}]});
  assert.equal(duplicateSplit(tight, 0, 1), null, "no stretch of 4 m left");
});

test("why an opening can't be added: the reason is said, and there is none when it can", () => {
  const p = house();
  assert.equal(addOpening(p, "front", "window", 1) !== null, true);
  assert.equal(openingProblem(p, "front", "window", 1), null, "it fits: no problem");
  assert.match(openingProblem(p, "front", "door", 1), /ground floor/i);
  assert.match(openingProblem(p, "front", "window", 2), /floor 3|no floor/i, "the building has two floors");
  assert.match(openingProblem(p, "nowhere", "window", 0), /no such wall/i);
  const narrow = sanitize({width: 3, depth: 8, floors: 1, winW: 2.5, items: [], windows: [{wall: "back", floor: 0, pos: 0.5, type: "door", w: 1, h: 2.1}]});
  assert.match(openingProblem(narrow, "front", "window", 0), /widest|wide|room/i);
  const withPart = sanitize({width: 12, depth: 8, floors: 2, winW: 2, items: [], windows: [{wall: "front", floor: 0, pos: 0.5, type: "door", w: 1, h: 2.1}], wings: [{wall: "back", pos: 0.5, width: 8, depth: 5, floors: 2}]});
  assert.equal(addOpening(withPart, "back", "window", 1), null, "a part that covers both floors leaves only two 1.5 m stretches: too narrow for a 2 m window");
  assert.match(openingProblem(withPart, "back", "window", 1), /part/i);
});
