// The modeller: cone and ball next to box and cylinder. Pure, no DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, partMesh, placedMesh, partFaces, faceOfTriangle, partUv, exportI3d, groundPart, SHAPES, setFaceMaterial, addMaterial } from "../src/builder/model.mjs";

const one = extra => sanitize({parts: [extra]}).parts[0];
const bbox = g => { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (let k = 0; k < g.p.length; k++) { lo[k % 3] = Math.min(lo[k % 3], g.p[k]); hi[k % 3] = Math.max(hi[k % 3], g.p[k]); } return {lo, hi}; };
/** Every triangle's winding agrees with its stored normals (outward), and none has no area. */
function outward(g) {
  let flat = 0;
  for (let t = 0; t < g.i.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map(k => g.i[t + k]), P = v => [g.p[v * 3], g.p[v * 3 + 1], g.p[v * 3 + 2]];
    const u = P(b).map((x, i) => x - P(a)[i]), w = P(c).map((x, i) => x - P(a)[i]);
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], len = Math.hypot(...n);
    if (len < 1e-9) { flat++; continue; }
    const s = [a, b, c].reduce((acc, v) => acc + n[0] * g.n[v * 3] + n[1] * g.n[v * 3 + 1] + n[2] * g.n[v * 3 + 2], 0);
    assert.ok(s > 0, `triangle ${t / 3} faces inwards`);
  }
  return flat;
}

test("SHAPES: cone and sphere are known shapes, anything else is a box", () => {
  for (const k of ["box", "cylinder", "cone", "sphere"]) assert.ok(SHAPES.includes(k), k);
  assert.equal(one({shape: "cone"}).shape, "cone");
  assert.equal(one({shape: "sphere"}).shape, "sphere");
  assert.equal(one({shape: "pyramid"}).shape, "box");
});

test("cone: radius r at the base on y = 0, a point at height h, faces side and bottom", () => {
  const p = one({shape: "cone", r: 0.5, h: 2, seg: 12}), g = partMesh(p), {lo, hi} = bbox(g);
  assert.deepEqual(partFaces(p).map(f => f.id), ["side", "bottom"]);
  assert.deepEqual([lo[1], hi[1]], [0, 2]);
  assert.ok(Math.abs(hi[0] - 0.5) < 1e-9 && Math.abs(lo[0] + 0.5) < 1e-9);
  const face = faceOfTriangle(p);
  assert.equal(face.length, g.i.length / 3);
  assert.equal(face.filter(f => f === "side").length, 12);
  assert.equal(face.filter(f => f === "bottom").length, 12);
  assert.equal(outward(g), 0);
  face.forEach((f, t) => { if (f === "bottom") for (let k = 0; k < 3; k++) assert.equal(g.p[g.i[t * 3 + k] * 3 + 1], 0); });
});

test("sphere: a ball of radius r standing on y = 0, one face, height follows the radius", () => {
  const p = one({shape: "sphere", r: 0.4, h: 9, seg: 16}), g = partMesh(p), {lo, hi} = bbox(g);
  assert.equal(p.h, 0.8);
  assert.deepEqual(partFaces(p).map(f => f.id), ["surface"]);
  assert.ok(Math.abs(lo[1]) < 1e-9 && Math.abs(hi[1] - 0.8) < 1e-9);
  assert.ok(hi[0] <= 0.4 + 1e-9 && hi[0] > 0.39 && hi[2] <= 0.4 + 1e-9);
  const face = faceOfTriangle(p);
  assert.equal(face.length, g.i.length / 3);
  assert.ok(face.every(f => f === "surface"));
  assert.equal(outward(g), 0, "no flat triangles at the poles");
  for (let k = 0; k < g.n.length; k += 3) assert.ok(Math.abs(Math.hypot(g.n[k], g.n[k + 1], g.n[k + 2]) - 1) < 1e-6);
});

test("sphere: sides 6 still gives a closed ball; a face of another shape is dropped", () => {
  const p = sanitize({materials: [{id: 1}], parts: [{shape: "sphere", seg: 6, faces: {surface: 1, side: 1, top: 1}}]}).parts[0];
  assert.deepEqual(p.faces, {surface: 1});
  assert.ok(partMesh(p).i.length > 0);
});

test("cone and sphere: uvs fit the mesh, a textured face gets uvs in repeats", () => {
  for (const shape of ["cone", "sphere"]) {
    const m = setFaceMaterial(addMaterial({parts: [{shape, r: 0.5, h: 1, seg: 12}]}, {texture: {id: "abc", meters: 0.5}}), 1, shape === "cone" ? "side" : "surface", 1);
    const p = m.parts[0], g = partMesh(p), uv = partUv(m, p);
    assert.equal(uv.length, g.uv.length, shape);
    assert.ok(uv.every(Number.isFinite), shape);
  }
});

test("cone and sphere: placed (turned) and grounded like any part, and exported as shapes", () => {
  const m = sanitize({parts: [{shape: "cone", r: 0.5, h: 1, rotX: 90}, {shape: "sphere", r: 0.5, rotZ: 45, y: 3}]});
  const lowest = id => Math.min(...placedMesh(groundPart(m, id).parts[id - 1]).p.filter((_, k) => k % 3 === 1).map(y => y + groundPart(m, id).parts[id - 1].y));
  assert.ok(Math.abs(lowest(1)) < 1e-6 && Math.abs(lowest(2)) < 1e-6);
  const {i3d} = exportI3d(m);
  assert.equal((i3d.match(/<Shape /g) || []).length, 2);
});

/* ---------- pipe and bent pipe ---------- */
const hollow = (g, r, ri) => { for (let k = 0; k < g.p.length; k += 3) { const d = Math.hypot(g.p[k], g.p[k + 2]); assert.ok(d >= ri - 1e-9 && d <= r + 1e-9, "inside the wall"); } };

test("SHAPES: pipe and bend", () => {
  assert.deepEqual(SHAPES, ["box", "cylinder", "cone", "sphere", "pipe", "bend"]);
  assert.equal(one({shape: "pipe"}).shape, "pipe");
  assert.equal(one({shape: "bend"}).shape, "bend");
});

test("pipe: outer radius r, wall t, standing on y = 0, faces outer, inner, top, bottom", () => {
  const p = one({shape: "pipe", r: 0.5, t: 0.1, h: 2, seg: 12}), g = partMesh(p), {lo, hi} = bbox(g);
  assert.equal(p.t, 0.1);
  assert.deepEqual(partFaces(p).map(f => f.id), ["outer", "inner", "top", "bottom"]);
  assert.deepEqual([lo[1], hi[1]], [0, 2]);
  hollow(g, 0.5, 0.4);
  const face = faceOfTriangle(p);
  assert.equal(face.length, g.i.length / 3);
  for (const f of ["outer", "inner", "top", "bottom"]) assert.equal(face.filter(x => x === f).length, 24, f);
  assert.equal(outward(g), 0);
  // the inner wall's normals point at the axis
  face.forEach((f, t) => { if (f === "inner") { const v = g.i[t * 3]; assert.ok(g.n[v * 3] * g.p[v * 3] + g.n[v * 3 + 2] * g.p[v * 3 + 2] < 0); } });
});

test("pipe: the wall can never be thicker than the pipe", () => {
  const p = one({shape: "pipe", r: 0.2, t: 5});
  assert.ok(p.t < p.r && p.t > 0);
  assert.ok(one({shape: "pipe", t: -1}).t > 0);
  assert.equal(one({shape: "box"}).t, undefined);
});

test("bend: starts on y = 0 at the origin going up, curves towards +x, never goes under the ground", () => {
  const p = one({shape: "bend", r: 0.2, t: 0.04, bendR: 1, bendA: 90, seg: 12}), g = partMesh(p), {lo, hi} = bbox(g);
  assert.deepEqual(partFaces(p).map(f => f.id), ["outer", "inner", "start", "end"]);
  assert.ok(Math.abs(lo[1]) < 1e-9);
  assert.ok(Math.abs(hi[1] - 1.2) < 1e-6, `top ${hi[1]}`);          // br + r up when the bend is 90 degrees
  assert.ok(Math.abs(p.h - 1.2) < 1e-6, "h is the real height (the turn is about h/2)");
  assert.ok(Math.abs(hi[0] - 1) < 1e-6 && Math.abs(lo[0] + 0.2) < 1e-6, `x ${lo[0]} .. ${hi[0]}`);
  assert.ok(Math.abs(hi[2] - 0.2) < 1e-6 && Math.abs(lo[2] + 0.2) < 1e-6);
  const face = faceOfTriangle(p);
  assert.equal(face.length, g.i.length / 3);
  assert.equal(outward(g), 0);
  const bigger = one({shape: "bend", r: 0.2, bendR: 1, bendA: 180});
  assert.ok(bbox(partMesh(bigger)).lo[1] > -1e-9, "180 degrees stays above ground");
});

test("bend: the bend radius stays larger than the pipe, the angle between 5 and 180", () => {
  const p = one({shape: "bend", r: 1, bendR: 0.1, bendA: 999});
  assert.ok(p.bendR > p.r);
  assert.equal(p.bendA, 180);
  assert.equal(one({shape: "bend", bendA: 0}).bendA, 5);
});

test("pipe and bend: uvs fit the mesh, textured faces get finite uvs, the i3d has a shape each", () => {
  for (const [shape, faces] of [["pipe", ["outer", "inner", "top", "bottom"]], ["bend", ["outer", "inner", "start", "end"]]]) {
    let m = addMaterial({parts: [{shape, r: 0.3, t: 0.05, h: 1, seg: 10}]}, {texture: {id: "abc", meters: 0.5}});
    for (const f of faces) m = setFaceMaterial(m, 1, f, 1);
    const p = m.parts[0], g = partMesh(p), uv = partUv(m, p);
    assert.equal(uv.length, g.uv.length, shape);
    assert.ok(uv.every(Number.isFinite), shape);
  }
  const m = sanitize({parts: [{shape: "pipe", rotX: 90, y: 2}, {shape: "bend", rotZ: 45}]});
  assert.equal((exportI3d(m).i3d.match(/<Shape /g) || []).length, 2);
  const lo = id => { const q = groundPart(m, id).parts[id - 1]; return Math.min(...placedMesh(q).p.filter((_, k) => k % 3 === 1)) + q.y; };
  assert.ok(Math.abs(lo(1)) < 1e-3 && Math.abs(lo(2)) < 1e-3);   // (y is kept to the millimetre)
});
