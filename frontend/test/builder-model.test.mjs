// The modeller (docs/PLAN_BUILDER.md), step 1: a project is a list of parts built from primitives, exported as an i3d. Pure, no DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, partMesh, exportI3d, FORMAT, MAX_PARTS } from "../src/builder/model.mjs";

const part = extra => ({shape: "box", x: 0, y: 0, z: 0, w: 1, h: 2, d: 0.5, color: "#336699", ...extra});

test("sanitize: a new project is empty and says what it is; bad input becomes an empty project", () => {
  for (const raw of [undefined, null, 5, "x", []]) {
    const m = sanitize(raw);
    assert.equal(m.format, FORMAT);
    assert.deepEqual(m.parts, []);
  }
  assert.equal(sanitize({}).kind, "prop", "the project list reads kind: the same word for every project");
});

test("sanitize: parts get ids 1.. in order, known shapes, sizes in range, a colour that is a colour", () => {
  const m = sanitize({parts: [part({id: 9}), part({shape: "teapot", w: -3, h: 9999, color: "red"}), "junk", part({shape: "cylinder", r: 0.4, h: 1})]});
  assert.deepEqual(m.parts.map(p => p.id), [1, 2, 3]);
  assert.equal(m.parts[1].shape, "box", "an unknown shape is a box");
  assert.ok(m.parts[1].w > 0 && m.parts[1].h <= 50, "sizes are clamped");
  assert.match(m.parts[1].color, /^#[0-9a-f]{6}$/);
  assert.equal(m.parts[2].shape, "cylinder");
  assert.equal(m.parts[2].r, 0.4);
});

test("sanitize: at most MAX_PARTS parts, and a name that is plain text", () => {
  const m = sanitize({parts: Array.from({length: MAX_PARTS + 20}, () => part())});
  assert.equal(m.parts.length, MAX_PARTS);
  assert.equal(sanitize({parts: [part({name: "<b>x</b>\n"})]}).parts[0].name, "bx/b");
});

test("meshes: a box stands on its base (y from 0 to h), a cylinder is round and closed", () => {
  const range = (g, k) => { let lo = Infinity, hi = -Infinity; for (let i = k; i < g.p.length; i += 3) { lo = Math.min(lo, g.p[i]); hi = Math.max(hi, g.p[i]); } return [lo, hi]; };
  const b = partMesh(sanitize({parts: [part({w: 2, h: 3, d: 1})]}).parts[0]);
  assert.deepEqual(range(b, 1), [0, 3]);
  assert.deepEqual(range(b, 0), [-1, 1]);
  const c = partMesh(sanitize({parts: [part({shape: "cylinder", r: 0.5, h: 2, seg: 12})]}).parts[0]);
  assert.deepEqual(range(c, 1), [0, 2]);
  for (const k of [0, 2]) { const [lo, hi] = range(c, k); assert.ok(Math.abs(lo + 0.5) < 1e-6 && Math.abs(hi - 0.5) < 1e-6, "radius 0.5"); }
  assert.equal(c.n.length, c.p.length, "a normal per vertex");
  assert.equal(c.uv.length / 2, c.p.length / 3, "a uv per vertex");
  assert.ok(Math.max(...c.i) < c.p.length / 3, "indices point at vertices");
  // closed: every edge is used by two triangles
  const edges = new Map();
  const key = (a, b) => [a, b].sort().join(",");
  const pos = v => [0, 1, 2].map(k => c.p[v * 3 + k].toFixed(5)).join("/");
  for (let t = 0; t < c.i.length; t += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) { const k = key(pos(c.i[t + a]), pos(c.i[t + b])); edges.set(k, (edges.get(k) || 0) + 1); }
  assert.ok([...edges.values()].every(n => n === 2), "no hole");
});

test("export: an i3d with a node per part at its place, one material per colour, and the shapes", () => {
  const m = sanitize({parts: [part({name: "Body", x: 1, y: 0.2, z: -2, rotY: 90}), part({x: 3, color: "#336699"}), part({shape: "cylinder", r: 0.3, color: "#CC3300"})]});
  const {i3d} = exportI3d(m, {name: "pump"});
  assert.match(i3d, /<i3D name="pump"/);
  assert.match(i3d, /<Shape name="Body" translation="1 0.2 -2" rotation="0 90 0"/);
  assert.equal((i3d.match(/<Material /g) || []).length, 2, "two colours, two materials");
  assert.equal((i3d.match(/<IndexedTriangleSet /g) || []).length, 3);
  assert.match(i3d, /<Shape name="part2"[^>]*materialIds="1"/, "the same colour shares its material");
  assert.match(i3d, /<\/i3D>/);
});

test("export: a project with no parts still writes a valid, empty scene", () => {
  const {i3d} = exportI3d(sanitize({}));
  assert.match(i3d, /<Scene>/);
  assert.doesNotMatch(i3d, /<Shape /);
});

test("operations: add puts a part last with its own id and a name, and the ids stay 1.. after a removal", async () => {
  const { addPart, removePart, updatePart, duplicatePart } = await import("../src/builder/model.mjs");
  let m = sanitize({});
  m = addPart(m, {shape: "cylinder", r: 0.3});
  m = addPart(m);
  assert.deepEqual(m.parts.map(p => [p.id, p.shape]), [[1, "cylinder"], [2, "box"]]);
  assert.equal(m.parts[1].name, "part2");
  m = removePart(m, 1);
  assert.deepEqual(m.parts.map(p => p.id), [1], "renumbered");
  assert.equal(m.parts[0].shape, "box");
  assert.equal(removePart(m, 99).parts.length, 1, "an unknown id changes nothing");
});

test("operations: update changes one part, cleaned; the id cannot be changed; a copy is placed beside the original", async () => {
  const { addPart, updatePart, duplicatePart } = await import("../src/builder/model.mjs");
  let m = addPart(addPart(sanitize({})), {x: 2});
  m = updatePart(m, 2, {h: 9999, color: "nope", id: 7, name: "Pump"});
  assert.equal(m.parts[1].h, 50);
  assert.equal(m.parts[1].color, "#9aa3a8");
  assert.equal(m.parts[1].id, 2);
  assert.equal(m.parts[1].name, "Pump");
  assert.equal(m.parts[0].h, 1, "the other part is untouched");
  const c = duplicatePart(m, 2);
  assert.equal(c.parts.length, 3);
  assert.equal(c.parts[2].id, 3);
  assert.equal(c.parts[2].shape, m.parts[1].shape);
  assert.ok(c.parts[2].x !== m.parts[1].x, "not on top of the original");
  assert.equal(duplicatePart(m, 99).parts.length, 2);
});

test("operations: no more than MAX_PARTS, and the input is never changed", async () => {
  const { addPart } = await import("../src/builder/model.mjs");
  const full = sanitize({parts: Array.from({length: MAX_PARTS}, () => part())});
  assert.equal(addPart(full).parts.length, MAX_PARTS);
  const before = JSON.stringify(full);
  addPart(full); assert.equal(JSON.stringify(full), before);
});
