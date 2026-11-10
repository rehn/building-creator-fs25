// Sections: a divider can change the number of floors after it (the total height stays), so a long building can be a one-floor hall and a two-floor house under one roof.
// split.floors (0 = as the building) and split.heights (the heights of its floors from the ground up, all but the top one, which is what is left; 0 or missing = a share of what is left)
// describe the section from the divider to the next one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, buildingTree, setSectionFloorHeight, setTotalHeight } from "../src/editor/model.mjs";
import { sectionHs, sectionsOf, sectionRuns, liveWings, wallFloorAt, cascadeHeight, dividerAt, splitAtFrom } from "../src/editor/layout.mjs";

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);
const arr = (a, b, msg) => { assert.equal(a.length, b.length, msg); a.forEach((v, i) => near(v, b[i], msg)); };
const door = (pos, extra = {}) => ({wall: "front", floor: 0, pos, type: "door", w: 1, h: 2.1, ...extra});
// 20 m long, 8 m deep, two floors of 2.7 m; from 10 m on one floor of 5.4 m
const hall = (windows = [], extra = {}) => sanitize({width: 20, depth: 8, ridge: "width", roofType: "gable", floors: 2, floorHeight: 2.7, items: [], windows: [door(0.1), ...windows], splits: [{at: 10, floors: 1}], ...extra});
const win = (wall, pos, floor, extra = {}) => ({wall, floor, pos, type: "window", w: 1, h: 1.2, sill: 0.9, ...extra});

test("section heights: the same total, shared between the floors; the ground floor can be set", () => {
  arr(sectionHs([2.7, 2.7], 0, 0), [2.7, 2.7], "as the building");
  arr(sectionHs([2.7, 2.7], 1, 0), [5.4], "one floor takes it all");
  arr(sectionHs([2.7, 2.7], 2, 0), [2.7, 2.7], "as many as the building");
  arr(sectionHs([3, 3, 3], 2, 0), [4.5, 4.5], "two of three");
  arr(sectionHs([3, 3, 3], 2, 5), [5, 4], "a ground floor of its own, the rest below it (the old way: a number)");
  arr(sectionHs([3, 3, 3], 2, [5]), [5, 4], "the same as a list");
  arr(sectionHs([2.7, 2.7, 2.7], 3, [3]), [3, 2.55, 2.55], "the floors above share what is left");
  arr(sectionHs([2.7, 2.7, 2.7], 3, [3, 2.5]), [3, 2.5, 2.6], "the top floor is what is left");
  arr(sectionHs([2.7, 2.7, 2.7], 3, [3, 3]), [3, 2.8, 2.3], "no floor under 2.3 m, the lower ones first");
  arr(sectionHs([2.7, 2.7, 2.7], 3, [0, 3]), [2.7, 3, 2.4], "an unset floor is a share of what is left");
  arr(sectionHs([2.7, 2.7], 2, 3.4), [3.1, 2.3], "no floor under 2.3 m");
  arr(sectionHs([2.7, 2.7], 3, 0), [2.7, 2.7], "no more floors than fit (2.3 m each)");
});

test("section settings are kept and clamped", () => {
  const p = hall([], {splits: [{at: 10, floors: 1, floorHeight: 4}, {at: 15, floors: 9, heights: [1, 5, 6]}, {at: 5, floors: -2}]});
  assert.deepEqual(p.splits.map(s => [s.at, s.floors, s.heights]), [[5, 0, []], [10, 1, []], [15, 3, [0, 5]]], "one floor has no free floor; too low is none; at most two");
  const q = sanitize({width: 12, depth: 8, wings: [{wall: "back", pos: 0.5, width: 6, depth: 10, splits: [{at: 5, floors: 2, floorHeight: 3}]}]});
  assert.deepEqual(q.wings[0].splits.map(s => [s.at, s.floors, s.heights]), [[5, 2, [3]]], "a save from before: the ground floor's height is the first");
  assert.deepEqual(hall([], {splits: [{at: 10, floors: 3, heights: [3, 2.5]}]}).splits[0].heights, [3, 2.5]);
});

test("sections of a building: each from one divider to the next, with its own floors", () => {
  const p = hall(), s = sectionsOf(p);
  assert.equal(s.length, 2);
  assert.deepEqual([s[0].from, s[0].to, s[0].floors], [0, 10, 2]);
  assert.deepEqual([s[1].from, s[1].to, s[1].floors], [10, 20, 1]);
  arr(s[0].hs, [2.7, 2.7], "first");
  arr(s[1].hs, [5.4], "second");
  assert.equal(sectionsOf(sanitize({})).length, 1, "no divider: one section");
});

test("sections along a wall: front and back run opposite ways, an end wall is one, a divider takes the side with more floors", () => {
  const p = hall(), run = (key, L) => sectionRuns(p, key, L).map(r => [r.a, r.b, r.sec.floors]);
  assert.deepEqual(run("front", 20), [[0, 10, 2], [10, 20, 1]]);
  assert.deepEqual(run("back", 20), [[0, 10, 1], [10, 20, 2]], "seen from outside the back wall's left end is the far end of the building");
  assert.deepEqual(run("left", 8), [[0, 8, 2]]);
  assert.deepEqual(run("right", 8), [[0, 8, 1]]);
  assert.deepEqual(run("s1", 8), [[0, 8, 2]]);
  const q = sanitize({width: 8, depth: 20, ridge: "depth", roofType: "gable", floors: 2, splits: [{at: 10, floors: 1}]});
  assert.deepEqual(sectionRuns(q, "left", 20).map(r => [r.a, r.b, r.sec.floors]), [[0, 10, 2], [10, 20, 1]], "ridge front to back: the left wall runs along it");
  assert.deepEqual(sectionRuns(q, "back", 8).map(r => r.sec.floors), [2]);
  assert.deepEqual(sectionRuns(q, "front", 8).map(r => r.sec.floors), [1]);
});

test("windows follow their section: a floor the section lacks hides the window, a tall ground floor takes a taller door", () => {
  const p = hall([win("front", 0.25, 1), win("front", 0.75, 1), win("front", 0.75, 0), door(0.9, {h: 4}), door(0.4, {h: 4})]);
  const ops = buildGeometry(p).opsByWall.front.ops, byId = id => ops.find(o => o.id === id), w = id => p.windows[id - 1];
  const up = p.windows.find(x => x.pos === 0.25 && x.floor === 1), upFar = p.windows.find(x => x.pos === 0.75 && x.floor === 1), low = p.windows.find(x => x.pos === 0.75 && x.floor === 0 && x.type === "window");
  assert.ok(byId(up.id), "the upper floor of the two-floor section");
  near(byId(up.id).t0, 2.7 + 0.9, "stands on its floor");
  assert.equal(byId(upFar.id), undefined, "no second floor in the one-floor section");
  assert.equal(upFar._hidden, true);
  near(byId(low.id).t0, 0.9, "the ground floor window");
  void w;
  const far = p.windows.find(x => x.type === "door" && x.pos === 0.9), near0 = p.windows.find(x => x.type === "door" && x.pos === 0.4);
  near(byId(far.id).t1, 4, "a 4 m door fits the 5.4 m floor");
  near(byId(near0.id).t1, 2.45, "but not the 2.7 m one: 25 cm under the ceiling");
});

test("sections: a house's ceiling is at each section's own ground floor height", () => {
  const p = hall(), g = buildGeometry(p).G.fittings, F = p.foundation;
  const at = (y, f) => { for (let k = 0; k < g.p.length; k += 3) if (Math.abs(g.p[k + 1] - (F + y)) < 1e-6 && f(g.p[k], g.p[k + 2])) return true; return false; };
  assert.ok(at(2.7, x => x < -1), "the ceiling of the two-floor section at 2.7 m");
  assert.ok(at(5.4, x => x > 1), "of the one-floor section at 5.4 m");
  assert.ok(!at(2.7, x => x > 1), "none at 2.7 m over the tall section");
  assert.ok(!at(5.4, x => x < -1), "or at 5.4 m over the low one");
});

test("sections of a part: its own dividers, from the wall out", () => {
  const p = sanitize({width: 12, depth: 8, floors: 2, floorHeight: 2.7, wings: [{wall: "back", pos: 0.5, width: 6, depth: 10, floors: 0, splits: [{at: 5, floors: 1}]}]});
  const s = sectionsOf(p, 1);
  assert.equal(s.length, 2);
  assert.deepEqual([s[0].from, s[0].to, s[0].floors, s[1].from, s[1].to, s[1].floors], [0, 5, 2, 5, 10, 1]);
  const wg = liveWings(p)[0];
  assert.deepEqual(sectionRuns(p, "w1Left", wg.wd).map(r => [r.a, r.b, r.sec.floors]), [[0, 5, 2], [5, 10, 1]]);
  assert.deepEqual(sectionRuns(p, "w1Right", wg.wd).map(r => [r.a, r.b, r.sec.floors]), [[0, 5, 1], [5, 10, 2]]);
  assert.deepEqual(sectionRuns(p, "w1End", wg.ww).map(r => r.sec.floors), [1]);
});

test("which floor a point on a wall is on follows the section it is in", () => {
  const p = hall();
  assert.equal(wallFloorAt(p, "front", 5, 3.5), 1, "the two-floor section, above 2.7 m");
  assert.equal(wallFloorAt(p, "front", 5, 1), 0);
  assert.equal(wallFloorAt(p, "front", 15, 3.5), 0, "the one-floor section: it is all the ground floor");
  assert.equal(wallFloorAt(p, "back", 5, 3.5), 0, "seen from outside the back wall's first half is the far section");
  assert.equal(wallFloorAt(p, "front", 5, 99), 1, "never past the last floor");
  assert.equal(wallFloorAt(p, "right", 3, 5), 0, "an end wall is in one section");
  assert.equal(wallFloorAt(sanitize({floors: 2}), "front", 2, 4), 1, "no dividers: the building's floors");
});

test("changing a floor's height: the floor above gives or takes, then the next; the top floor is never changed", () => {
  const hs = [2.7, 2.7, 2.7], near = (v, w) => v.forEach((x, i) => assert.ok(Math.abs(x - w[i]) < 1e-9, `${v} vs ${w}`));
  near(cascadeHeight(hs, 0, 3.2), [3.2, 2.2 < 2.3 ? 2.3 : 2.2, 2.6 + 0]);
  near(cascadeHeight(hs, 0, 3.0), [3.0, 2.4, 2.7], "the second floor takes it");
  near(cascadeHeight(hs, 0, 2.5), [2.5, 2.9, 2.7], "and gives it back");
  near(cascadeHeight(hs, 1, 3.0), [2.7, 3.0, 2.4], "the second floor changes the third");
  near(cascadeHeight(hs, 0, 3.6), [3.5, 2.3, 2.3], "when the second can't, the third does; no more than that");
  near(cascadeHeight(hs, 2, 3.5), hs, "the top floor can't be changed");
  near(cascadeHeight([2.7, 2.7], 0, 3.0), [3.0, 2.4]);
  near(cascadeHeight([2.7, 2.7], 0, 1), [2.3, 3.1], "not below 2.3 m");
});

test("setting a floor's height in a section: the building's own floors (first section) or the section's heights", () => {
  const p3 = (splits) => sanitize({width: 20, depth: 8, ridge: "width", floors: 3, floorHeight: 2.7, items: [], splits});
  const first = setSectionFloorHeight(p3([{at: 10}]), 0, 0, 0, 3.0);
  assert.deepEqual(first, {building: {floorHeight: 3, floor2Height: 2.4, floor3Height: 2.7}});
  const later = setSectionFloorHeight(p3([{at: 10, floors: 3}]), 0, 1, 0, 3.0);
  assert.deepEqual(later.splits.map(s => s.heights), [[3, 2.4]]);
  assert.equal(setSectionFloorHeight(p3([{at: 10}]), 0, 1, 2, 3.0).splits[0].heights.length, 2, "the top floor: nothing changes");
  const q = sanitize({width: 12, depth: 8, floors: 2, wings: [{wall: "back", pos: 0.5, width: 6, depth: 10, floors: 0, splits: [{at: 5}]}]});
  assert.deepEqual(setSectionFloorHeight(q, 1, 0, 0, 3.0), {wing: {floorHeight: 3, floor2Height: 2.4}});
  assert.equal(setSectionFloorHeight(q, 1, 5, 0, 3.0), null, "no such section");
});

test("the height of all the floors together: the top floor of the first section takes it, the sections follow", () => {
  const p = sanitize({width: 20, depth: 8, ridge: "width", floors: 2, floorHeight: 2.7, items: [], splits: [{at: 10, floors: 1}]});
  assert.deepEqual(setTotalHeight(p, 0, 6.2), {building: {floorHeight: 2.7, floor2Height: 3.5}});
  assert.deepEqual(setTotalHeight(p, 0, 3), {building: {floorHeight: 2.7, floor2Height: 2.3}}, "the top floor is at least 2.3 m");
  const one = sanitize({width: 12, depth: 8, floors: 1, floorHeight: 3, items: []});
  assert.deepEqual(setTotalHeight(one, 0, 4.4), {building: {floorHeight: 4.4}});
  const q = sanitize({width: 12, depth: 8, floors: 2, wings: [{wall: "back", pos: 0.5, width: 6, depth: 10, floors: 0}]});
  assert.deepEqual(setTotalHeight(q, 1, 6), {wing: {floorHeight: 2.7, floor2Height: 3.3}});
  assert.equal(setTotalHeight(q, 7, 6), null);
  // the other sections follow the total: a section of one floor is as tall as the whole
  const taller = sanitize({...p, floor2Height: 3.5});
  assert.ok(Math.abs(sectionsOf(taller)[1].hs[0] - 6.2) < 1e-9);
});

test("a section can have a half floor (1\u00BD: an attic over its floors) or go without it: the knee wall is taken from, or given to, the section's height", () => {
  const base = {width: 20, depth: 8, ridge: "width", roofType: "gable", floors: 2, floorHeight: 2.7, items: [], halfStorey: true, kneeWall: 0.9, windows: [door(0.1)]};
  const p = sanitize({...base, splits: [{at: 10, floors: 1, half: false}, {at: 15, floors: 1, half: true}]});
  assert.deepEqual(p.splits.map(s => s.half), [false, true], "kept");
  const s = sectionsOf(p);
  assert.deepEqual(s.map(x => [x.floors, x.half]), [[2, true], [1, false], [1, true]], "the first is the building's: with the attic; the second goes without it");
  arr(s[1].hs, [6.3], "without the attic the floor has the knee wall's height too (the walls are as high)");
  arr(s[2].hs, [5.4], "with the attic: the whole of the floors' height");
  assert.equal(sectionsOf(sanitize({...base, splits: [{at: 10, floors: 1}]}))[1].half, true, "not set: as the building");
  // a building without a half floor: a section can still have one, taken from its height
  const q = sanitize({...base, halfStorey: false, splits: [{at: 10, floors: 1, half: true}]}), sq = sectionsOf(q);
  assert.deepEqual(sq.map(x => [x.floors, x.half]), [[2, false], [1, true]]);
  arr(sq[0].hs, [2.7, 2.7], "the first section as before");
  arr(sq[1].hs, [4.5], "one floor and the knee wall's 0.9 m are the 5.4 m");
  assert.equal(sanitize({...base, splits: [{at: 10, half: "yes"}]}).splits[0].half, null, "only true or false are kept");
  const t = buildingTree(p);
  assert.deepEqual(t.children.map(sec => sec.children.length), [3, 1, 2], "floors, and an attic where there is one");
  assert.equal(wallFloorAt(p, "front", 12, 99), 0, "no attic over the second section");
  assert.equal(wallFloorAt(p, "front", 17, 99), 1, "the attic of the third");
  assert.equal(wallFloorAt(q, "front", 15, 5), 1, "the attic of a section in a building that has none");
  assert.equal(wallFloorAt(q, "front", 5, 99), 1, "the first section: two floors, no attic");
  // the walls are as high as before everywhere
  const h = pp => { const g = buildGeometry(pp).G.walls; let y = -Infinity; for (let k = 1; k < g.p.length; k += 3) y = Math.max(y, g.p[k]); return y; };
  assert.ok(Math.abs(h(sanitize({...base, halfStorey: false, splits: []})) - h(q)) < 1e-9, "a half floor in a section does not raise the building");
});

test("windows made automatically (windows per wall per floor) go where the section has the floor", () => {
  const p = sanitize({width: 20, depth: 8, ridge: "width", floors: 2, floorHeight: 2.7, splits: [{at: 10, floors: 1}]});   // (no window list: they are made from the counts)
  const front1 = p.windows.filter(w => w.wall === "front" && w.floor === 1), back1 = p.windows.filter(w => w.wall === "back" && w.floor === 1);
  assert.ok(front1.length > 0 && back1.length > 0, "upper windows are made");
  assert.ok(front1.every(w => w.pos * 20 < 10), "on the front: in the first half only (the second has one floor)");
  assert.ok(back1.every(w => w.pos * 20 > 10), "on the back the first section is the right half seen from outside");
  const ground = p.windows.filter(w => w.wall === "front" && w.floor === 0 && w.type === "window");
  assert.ok(ground.some(w => w.pos * 20 < 10) && ground.some(w => w.pos * 20 > 10), "the ground floor has windows in both");
  const plain = sanitize({width: 20, depth: 8, floors: 2, floorHeight: 2.7});
  assert.ok(plain.windows.filter(w => w.wall === "front" && w.floor === 1).some(w => w.pos * 20 > 10), "no divider: all along the wall as before");
});

test("a divider can be found at a point in the plan and moved: a new place along the building, two metres from the ends and from the others", () => {
  const p = hall([], {splits: [{at: 8}, {at: 14}]});
  const dv = dividerAt(p, -10 + 8, 1);
  assert.deepEqual([dv.pid, dv.id], [0, p.splits[0].id], "the first one");
  assert.equal(dividerAt(p, -10 + 11, 1), null, "nothing in between");
  assert.equal(dividerAt(p, -10 + 8, 6), null, "nor outside the building");
  assert.equal(splitAtFrom(p, 0, dv.id, -10 + 9.37), 9.35, "to 5 cm");
  assert.equal(splitAtFrom(p, 0, dv.id, -10 + 0.3), 2, "not nearer than 2 m to the end");
  assert.equal(splitAtFrom(p, 0, dv.id, -10 + 19), 12, "nor to the next divider (at 14)");
  // in a part: from the wall it stands on
  const q = sanitize({width: 12, depth: 8, wings: [{wall: "back", pos: 0.5, width: 6, depth: 12, floors: 0, splits: [{at: 5}]}]}), wg = liveWings(q)[0];
  const c = wg.at(wg.sc, 5), d = dividerAt(q, c[0], c[2]);
  assert.deepEqual([d.pid, d.id], [1, q.wings[0].splits[0].id]);
  const away = wg.at(wg.sc, 7.4);
  assert.equal(splitAtFrom(q, 1, d.id, wg.at(wg.sc, 7.4)[2]), 7.4);
  void away;
});
