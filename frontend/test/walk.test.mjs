// First-person walking: where a person can go in a built building (walk.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, PRESETS, WP } from "../src/editor/model.mjs";
import { makeWalker } from "../src/editor/walk.mjs";

/** Walk from pos along (dx, dz) in steps of 0.1 m, `steps` times. */
function walk(wk, pos, dx, dz, steps) {
  const l = Math.hypot(dx, dz);
  for (let i = 0; i < steps; i++) pos = wk.move(pos, dx / l * 0.1, dz / l * 0.1);
  return pos;
}
const doorOf = geo => { for (const [k, e] of Object.entries(geo.opsByWall)) { const o = e.ops.find(x => x.kind === "door" && x.opens); if (o) return {o, w: e.w, k}; } };
const inside = (p, q) => Math.abs(q.x) < p.width / 2 - 0.2 && Math.abs(q.z) < p.depth / 2 - 0.2;

test("walk: through the door and up the steps into the house, but not through a wall", () => {
  const p = sanitize({foundation: 0.4}), geo = buildGeometry(p), wk = makeWalker(geo.collision), {o, w} = doorOf(geo);
  const mid = (o.s0 + o.s1) / 2, from = WP(w, mid, 0, 3), toward = [-w.n[0], -w.n[2]];
  let pos = {x: from[0], y: 0, z: from[2]};
  assert.ok(!inside(p, pos));
  const end = walk(wk, pos, toward[0], toward[1], 55);
  assert.ok(inside(p, end), `inside: ${end.x.toFixed(2)}, ${end.z.toFixed(2)}`);
  assert.ok(Math.abs(end.y - p.foundation) < 0.02, `on the floor: ${end.y}`);
  // the same walk at a bit of wall beside the door stops outside
  const side = (o.s0 > 2 ? o.s0 / 2 : (o.s1 + w.L) / 2), at = WP(w, side, 0, 3);
  const stuck = walk(wk, {x: at[0], y: 0, z: at[2]}, toward[0], toward[1], 55);
  assert.ok(!inside(p, stuck), `stopped by the wall: ${stuck.x.toFixed(2)}, ${stuck.z.toFixed(2)}`);
});

test("walk: a door that doesn't open is a wall", () => {
  const p0 = sanitize({foundation: 0.2}), p = sanitize({...p0, windows: p0.windows.map(x => x.type === "door" ? {...x, opens: false} : x)});
  const geo = buildGeometry(p), wk = makeWalker(geo.collision), {o, w} = (() => { for (const [k, e] of Object.entries(geo.opsByWall)) { const o = e.ops.find(x => x.kind === "door"); if (o) return {o, w: e.w}; } })();
  const from = WP(w, (o.s0 + o.s1) / 2, 0, 3), end = walk(wk, {x: from[0], y: 0, z: from[2]}, -w.n[0], -w.n[2], 55);
  assert.ok(!inside(p, end));
});

test("walk: a ramp is climbed, a high step is not", () => {
  const p0 = sanitize({foundation: 0.6}), d = p0.windows.find(x => x.type === "door");
  const ramp = sanitize({...p0, windows: p0.windows.map(x => x.id === d.id ? {...x, ramp: true} : x)});
  for (const [p, up] of [[ramp, true]]) {
    const geo = buildGeometry(p), wk = makeWalker(geo.collision), {o, w} = doorOf(geo);
    const from = WP(w, (o.s0 + o.s1) / 2, 0, 6), end = walk(wk, {x: from[0], y: 0, z: from[2]}, -w.n[0], -w.n[2], 80);
    assert.equal(inside(p, end), up, `${end.x.toFixed(2)}, ${end.z.toFixed(2)}`);
    assert.ok(Math.abs(end.y - 0.6) < 0.02);
  }
  // a wall of the high foundation, away from the door: you can't climb 60 cm
  const geo = buildGeometry(p0), wk = makeWalker(geo.collision), {o, w} = doorOf(geo);
  const side = o.s0 > 2 ? o.s0 / 2 : (o.s1 + w.L) / 2, at = WP(w, side, 0, 3);
  const end = walk(wk, {x: at[0], y: 0, z: at[2]}, -w.n[0], -w.n[2], 40);
  assert.equal(end.y, 0);
});

test("walk: furniture and the ground are handled: standing on the terrain is height 0", () => {
  const p = sanitize({}), wk = makeWalker(buildGeometry(p).collision);
  assert.equal(wk.groundAt(50, 50, 1), 0);
  const q = wk.move({x: 30, y: 0, z: 30}, 1, 0);
  assert.deepEqual([q.x, q.y, q.z], [31, 0, 30]);
});
