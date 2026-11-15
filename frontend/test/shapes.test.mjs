// .i3d.shapes: the binary geometry file next to an i3d. Written here, read back by our own reader (which is checked against the game's files).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Cipher, KEY_ROW, SEED, OPT, keystream, tangentsOf, writeShapes, readShapes } from "../src/editor/shapes.mjs";

const quad = (id, name, extra = {}) => ({id, name, positions: [0, 0, 0, 2, 0, 0, 2, 0, 3, 0, 0, 3], normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
  uv: [0, 0, 1, 0, 1, 1, 0, 1], indices: [0, 2, 1, 0, 3, 2], ...extra});

test("the cipher is the same XOR both ways, 64 bytes of key stream a block", () => {
  assert.equal(keystream(KEY_ROW, 0).length, 64);
  assert.notDeepEqual(keystream(KEY_ROW, 0), keystream(KEY_ROW, 1));
  const data = Uint8Array.from({length: 150}, (_, i) => i * 7 & 255);
  const once = new Cipher().apply(data);
  assert.notDeepEqual(once, data);
  assert.deepEqual(new Cipher().apply(once), data);
  // a chunk starts on a block: a 4-byte chunk costs one
  const c = new Cipher(); c.apply(new Uint8Array(4)); c.apply(new Uint8Array(70));
  assert.equal(c.counter, 3);
});

test("header, then a file of shapes read back as written", () => {
  const file = writeShapes([quad(1, "floorShape", {tangents: true}), quad(7, "collisionShape", {usage: 256})]);
  assert.deepEqual([...file.slice(0, 4)], [10, 0, SEED, 0]);
  const [a, b] = readShapes(file);
  assert.equal(a.id, 1); assert.equal(a.name, "floorShape");
  assert.equal(b.id, 7); assert.equal(b.name, "collisionShape");
  assert.deepEqual([...a.indices], [0, 2, 1, 0, 3, 2]);
  assert.deepEqual([...a.positions], [0, 0, 0, 2, 0, 0, 2, 0, 3, 0, 0, 3]);
  assert.deepEqual([...a.normals], [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
  assert.deepEqual([...a.uv], [0, 0, 1, 0, 1, 1, 0, 1]);
  assert.deepEqual(a.subsets.map(s => [s.first, s.count, s.firstIndex, s.indexCount]), [[0, 4, 0, 6]]);
  assert.equal(a.attributes.length, 0);
});

test("options: tangents for what is drawn, the mesh usage (256 -> 0x10000) for what the game keeps in memory", () => {
  const [drawn, kept] = readShapes(writeShapes([quad(1, "a", {tangents: true}), quad(2, "b", {usage: 256})]));
  assert.ok(drawn.opts & OPT.tangents); assert.equal(drawn.opts >>> 8, 0); assert.equal(drawn.tangents.length, 16);
  assert.ok(!(kept.opts & OPT.tangents)); assert.equal(kept.opts >>> 8, 256); assert.equal(kept.tangents, null);
});

test("the bounding sphere holds every vertex", () => {
  const [s] = readShapes(writeShapes([quad(1, "a")]));
  for (let i = 0; i < s.positions.length; i += 3) assert.ok(Math.hypot(s.positions[i] - s.centre[0], s.positions[i + 1] - s.centre[1], s.positions[i + 2] - s.centre[2]) <= s.radius + 1e-5);
  assert.deepEqual(s.centre.map(x => +x.toFixed(3)), [1, 0, 1.5]);
});

test("tangents: unit, across the normal, along u; w says the side of the bitangent", () => {
  const q = quad(1, "a"), t = tangentsOf(q.positions, q.normals, q.uv, q.indices);
  for (let v = 0; v < 4; v++) {
    assert.ok(Math.abs(Math.hypot(t[v * 4], t[v * 4 + 1], t[v * 4 + 2]) - 1) < 1e-6, "unit");
    assert.ok(Math.abs(t[v * 4 + 1]) < 1e-6, "across the normal (up)");
    assert.ok(t[v * 4] > 0.99, "along +x, where u grows");
    assert.ok(t[v * 4 + 3] === 1 || t[v * 4 + 3] === -1);
  }
  const flipped = {...q, uv: q.uv.map((x, i) => i % 2 ? 1 - x : x)}, f = tangentsOf(flipped.positions, flipped.normals, flipped.uv, flipped.indices);
  assert.notEqual(f[3], t[3], "mirrored uvs: the other side");
});

test("more than 65536 vertices: 32-bit indices", () => {
  const n = 70000, positions = new Float32Array(n * 3), normals = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { positions[i * 3] = i; normals[i * 3 + 1] = 1; }
  const [s] = readShapes(writeShapes([{id: 1, name: "big", positions, normals, uv, indices: [0, 1, n - 1]}]));
  assert.deepEqual([...s.indices], [0, 1, n - 1]);
});

// The cipher and the layout are checked against a file of the game's own (the garden shed's: same seed as ours), when the game is installed.
const game = process.env.FS25_GAME_DIR || "C:/Program Files (x86)/Farming Simulator 2025";
const shed = join(game, "data/placeables/brandless/gardenSheds/level01/gardenShed01.i3d.shapes");
test("the game's own file reads with our reader: every shape to its last byte, and our tangents agree with its tangents", { skip: !existsSync(shed) && "the game is not installed" }, () => {
  const data = readFileSync(shed), shapes = readShapes(data);
  assert.equal(data[2], SEED, "the shed has our seed");
  assert.deepEqual(shapes.map(s => s.name).sort(), ["collisionShape", "gardenShed01VisShape", "glassShape", "iciclesShape", "snowShape"]);
  const col = shapes.find(s => s.name === "collisionShape");
  assert.equal(col.attributes.length, 1, "the collision mesh comes with its cooked data");
  const vis = shapes.find(s => s.name === "gardenShed01VisShape");
  assert.ok(vis.opts & OPT.tangents);
  const mine = tangentsOf(vis.positions, vis.normals, vis.uv, vis.indices);
  let same = 0, n = 0;
  for (let v = 0; v < vis.positions.length / 3; v++) {
    const a = [0, 1, 2].map(i => vis.tangents[v * 4 + i]), b = [0, 1, 2].map(i => mine[v * 4 + i]);
    if (Math.hypot(...a) < 0.5) continue;
    n++; if (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] > 0.9) same++;
  }
  assert.ok(same / n > 0.98, `${same}/${n}`);
});
