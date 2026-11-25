// Lars saw a cow yard in the game (2026-11-25): the troughs were turned 90 degrees, but the food plane (the hay) lay across its trough and the water plane stuck out
// of the water trough, as if the planes had not been turned. The planes keep their turn in their own corners now (the node has none), so they are turned however
// the game treats the rotation of a plane that it moves up and down.
import { test } from "node:test";
import assert from "node:assert/strict";
import { planeQuad } from "../src/editor/mod/yard.mjs";

const extent = q => { const xs = q.p.filter((_, i) => i % 3 === 0), zs = q.p.filter((_, i) => i % 3 === 2); return [Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)].map(v => +v.toFixed(6)); };

test("a plane that is not turned is as it was", () => {
  const q = planeQuad(3, 0.6);
  assert.deepEqual(q.p, [-1.5, 0, -0.3, -1.5, 0, 0.3, 1.5, 0, 0.3, 1.5, 0, -0.3]);
  assert.deepEqual(planeQuad(3, 0.6, 0), q);
});

test("a plane turned a quarter is as long along z as it was along x", () => {
  assert.deepEqual(extent(planeQuad(3, 0.6, 90)), [0.6, 3]);
  assert.deepEqual(extent(planeQuad(3, 0.6, 270)), [0.6, 3]);
  assert.deepEqual(extent(planeQuad(3, 0.6, 180)), [3, 0.6]);
});

test("it is turned the way the trough is: a corner goes where the turn puts it", () => {
  // (three.js turns x' = x cos + z sin, z' = -x sin + z cos: the corner [-1.5, -0.3] turned 90 degrees is [-0.3, 1.5])
  const q = planeQuad(3, 0.6, 90);
  assert.ok(Math.abs(q.p[0] - -0.3) < 1e-9 && Math.abs(q.p[2] - 1.5) < 1e-9, q.p.slice(0, 3).join(" "));
});

test("the face still looks up and the corners keep their order (so it is not seen from below)", () => {
  const q = planeQuad(3, 0.6, 90);
  assert.deepEqual(q.n, [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
  assert.deepEqual(q.i, [0, 1, 2, 0, 2, 3]);
  // the triangle 0 1 2 is counter-clockwise seen from above (y up) as for the plane that is not turned: its normal points up
  const [a, b, c] = [0, 1, 2].map(k => [q.p[k * 3], q.p[k * 3 + 1], q.p[k * 3 + 2]]);
  const u = b.map((v, i) => v - a[i]), v = c.map((w, i) => w - a[i]);
  const ny = u[2] * v[0] - u[0] * v[2];
  const flat = planeQuad(3, 0.6), [fa, fb, fc] = [0, 1, 2].map(k => [flat.p[k * 3], flat.p[k * 3 + 1], flat.p[k * 3 + 2]]);
  const fu = fb.map((v, i) => v - fa[i]), fv = fc.map((w, i) => w - fa[i]);
  assert.equal(Math.sign(ny), Math.sign(fu[2] * fv[0] - fu[0] * fv[2]));
});
