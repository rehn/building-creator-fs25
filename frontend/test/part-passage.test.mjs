// The wall between a part and what it stands on. By default there is a wide opening (the rooms are one); with the wide opening off the wall stays,
// and what is put on it (a door, a window) is an ordinary opening between the rooms.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, addOpening, addPartOn, addPartDoor } from "../src/editor/model.mjs";
import { roomOf, liveWings } from "../src/editor/layout.mjs";

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
// the part is on the back wall, 6 m wide in the middle of 12: from s = 3 to 9
const house = (w = {}, windows = []) => sanitize({width: 12, depth: 8, wings: [{wall: "back", pos: 0.5, width: 6, depth: 5, floors: 0, ...w}], items: [], windows: [{wall: "front", floor: 0, pos: 0.5, type: "door", w: 1, h: 2.1}, ...windows]});
const doorUnder = (pos = 0.5, extra = {}) => ({wall: "back", floor: 0, pos, type: "door", w: 1, h: 2.1, opens: true, ...extra});
// from the house through the wall at s metres along the back wall into the part
const through = (p, s) => {
  const wg = liveWings(p)[0], F = p.foundation, a = wg.at(s, -1.5), b = wg.at(s, 1.5);
  return !hits(buildGeometry(p).collision, [a[0], F + 1, a[2]], [b[0], F + 1, b[2]]);
};

test("part wall: closed is kept; the first version's passage settings mean closed", () => {
  assert.equal(house().wings[0].closed, false);
  assert.equal(house({closed: true}).wings[0].closed, true);
  assert.equal(house({passage: 2}).wings[0].closed, true);
  assert.equal(house({passage: 0}).wings[0].closed, false);
});

test("part wall: an open part has its wide opening, and what is put on the wall under it is hidden", () => {
  const p = house({}, [doorUnder(), {wall: "back", floor: 0, pos: 0.4, type: "window", w: 1, h: 1.2, sill: 0.9}]);
  buildGeometry(p);
  assert.ok(p.windows.filter(w => w.wall === "back").every(w => w._hidden), "hidden under the part");
  assert.ok(through(p, 6), "the wide opening");
});

test("part wall: a closed part has a whole wall, and a door or a window on it is an ordinary opening", () => {
  const none = house({closed: true});
  assert.equal(through(none, 6), false, "no opening");
  const p = house({closed: true}, [doorUnder(0.5), {wall: "back", floor: 0, pos: 0.3, type: "window", w: 1, h: 1.2, sill: 0.9}]);
  const geo = buildGeometry(p);
  assert.ok(p.windows.filter(w => w.wall === "back").every(w => !w._hidden), "both shown");
  assert.equal(through(p, 6), true, "through the door");
  assert.equal(through(p, 4), false, "not beside it (the window is above the floor)");
  assert.ok(geo.doors.some(d => d.wall === "back"), "the door has a leaf that opens");
  // a door taller than the part is hidden
  const low = house({closed: true, floorHeight: 2.3}, [doorUnder(0.5, {h: 2.3})]);
  buildGeometry(low);
  assert.ok(low.windows.filter(w => w.wall === "back").every(w => w._hidden), "too tall for the part");
});

test("part wall: a new door can be put under a closed part, not under an open one", () => {
  const closed = house({closed: true}), p = liveWings(closed)[0];
  const list = addOpening(closed, "back", "door", 0, (p.s0 + p.s1) / 2), d = list.find(w => w.wall === "back");
  assert.ok(d, "added");
  assert.ok(d.pos * 12 > p.s0 && d.pos * 12 < p.s1, "in the middle of the part's wall");
  const open = house(), q = liveWings(open)[0], list2 = addOpening(open, "back", "door", 0, (q.s0 + q.s1) / 2), d2 = list2.find(w => w.wall === "back");
  assert.ok(d2 && (d2.pos * 12 < q.s0 || d2.pos * 12 > q.s1), "the part's stretch is taken: it goes beside it");
});

test("part wall: with a closed wall the rooms are two", () => {
  assert.equal(roomOf(house({closed: true})).rects.length, 2);
  const [a, b] = roomOf(house({closed: true})).rects;
  assert.ok(Math.abs(a.z0 - b.z1) > 0.1 || Math.abs(b.z0 - a.z1) > 0.1, "the wall stands between");
});

test("a new part has a whole wall to what it stands on, with a door in it", () => {
  const p = sanitize({width: 20, depth: 10, items: [], windows: [{wall: "front", floor: 0, pos: 0.1, type: "door", w: 1, h: 2.1}]});
  const wings = addPartOn(p, "back");
  assert.ok(wings && wings[wings.length - 1].closed === true, "closed: the wall stays");
  const id = wings[wings.length - 1].id, q = {...p, wings}, windows = addPartDoor(q, id);
  assert.ok(windows, "a door in it");
  const door = windows[windows.length - 1], wg = liveWings(sanitize({...q, windows}))[0];
  assert.equal(door.type, "door");
  assert.equal(door.wall, "back");
  assert.ok(door.pos * 20 > wg.s0 && door.pos * 20 < wg.s1, "in the part's stretch of the wall");
  // (and you can walk through it)
  const r = sanitize({...q, windows}), g = buildGeometry(r), a = liveWings(r)[0].at(door.pos * 20, -1.5), b = liveWings(r)[0].at(door.pos * 20, 1.5);
  assert.equal(hits(g.collision, [a[0], r.foundation + 1, a[2]], [b[0], r.foundation + 1, b[2]]), false, "through the door");
});
