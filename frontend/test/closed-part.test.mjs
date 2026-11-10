// A part can be closed off from its parent: no passage in the parent's wall, so the wall stays whole (with the
// facade's look seen from the part's inside) and the part's room is its own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, KIND } from "../src/editor/model.mjs";
import { roomOf, inRoom } from "../src/editor/layout.mjs";

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
const house = closed => sanitize({wings: [{wall: "back", pos: 0.5, width: 5, depth: 5, floors: 0, ...(closed === undefined ? {} : {closed})}]});
const roomFor = p => roomOf(p, KIND[p.kind].openings ? KIND[p.kind].openings(p) : []);

test("closed part: the setting is kept, and is off by default", () => {
  assert.equal(house().wings[0].closed, false);
  assert.equal(house(false).wings[0].closed, false);
  assert.equal(house(true).wings[0].closed, true);
  assert.equal(house("yes").wings[0].closed, false);
});

test("closed part: the parent's wall has no passage, an open one has", () => {
  for (const [closed, blocked] of [[false, false], [true, true]]) {
    const p = house(closed), room = roomFor(p), g = buildGeometry(p);
    const a = room.rects[0], b = room.rects[1], x = (b.x0 + b.x1) / 2;
    // from the house's back to the middle of the part, 1 m up
    const from = [x, p.foundation + 1, a.z0 + 1], to = [x, p.foundation + 1, b.z0 + (b.z1 - b.z0) / 2];
    assert.equal(hits(g.collision, from, to), blocked, closed ? "closed: the wall is whole" : "open: you can walk through");
  }
});

test("closed part: the room is not joined, the wall stays", () => {
  const room = roomFor(house(true)), [a, b] = room.rects;
  assert.ok(b.z1 < a.z0 || b.z0 > a.z1 || b.z1 <= a.z0 + 1e-6 || b.z0 >= a.z1 - 1e-6, "the rectangles do not overlap");
  assert.ok(!inRoom(room, {x0: b.x0 + 0.5, x1: b.x1 - 0.5, z0: a.z0 - 0.3, z1: a.z0 + 0.3}), "a piece cannot straddle the wall");
  const open = roomFor(house(false));
  assert.ok(inRoom(open, {x0: open.rects[1].x0 + 0.5, x1: open.rects[1].x1 - 0.5, z0: open.rects[0].z0 - 0.3, z1: open.rects[0].z0 + 0.3}), "(open: can)");
  // every stretch of wall still faces into the room
  for (const w of room.walls) {
    const c = [(w.x0 + w.x1) / 2 + w.into[0] * 0.02, (w.z0 + w.z1) / 2 + w.into[1] * 0.02];
    assert.ok(inRoom(room, {x0: c[0], x1: c[0], z0: c[1], z1: c[1]}), `${w.name} faces the room`);
  }
});
