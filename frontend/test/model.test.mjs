import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, sanitize, buildGeometry, buildI3d, serialize, MATS } from "../src/editor/model.mjs";

const countOn = (p, wall, floor) => p.windows.filter(w => w.wall === wall && w.floor === floor).length;

test("sanitize: empty input gives the defaults plus generated windows", () => {
  const p = sanitize({});
  for (const k of Object.keys(DEFAULTS)) assert.equal(p[k], DEFAULTS[k], k);
  assert.ok(Array.isArray(p.windows) && p.windows.length > 0);
  assert.deepEqual(p.dormers, []);
});

test("sanitize: numbers are clamped to their range and snapped to the step", () => {
  const p = sanitize({ width: 999, depth: -5, roofPitch: 37.4 });
  assert.equal(p.width, 30);
  assert.equal(p.depth, 4);
  assert.equal(p.roofPitch, 37);
});

test("sanitize: invalid selects, colors and booleans fall back to defaults", () => {
  const p = sanitize({ roofType: "dome", wallColor: "red", chimney: "yes" });
  assert.equal(p.roofType, DEFAULTS.roofType);
  assert.equal(p.wallColor, DEFAULTS.wallColor);
  assert.equal(p.chimney, DEFAULTS.chimney);
});

test("sanitize: unknown keys are dropped", () => {
  const p = sanitize({ evil: "<script>", __proto__: { x: 1 } });
  assert.equal("evil" in p, false);
});

test("sanitize: window list is cleaned and ids renumbered", () => {
  const p = sanitize({ windows: [
    { wall: "front", floor: 0, pos: 0.3, w: 1, h: 1.2, sill: 0.8 },
    { wall: "roof", floor: 0, pos: 0.5 },
    { wall: "back", floor: 9, pos: 2, w: 99, h: 0, sill: -1 },
  ] });
  assert.equal(p.windows.length, 2);
  assert.deepEqual(p.windows.map(w => w.id), [1, 2]);
  const b = p.windows[1];
  assert.equal(b.floor, 2); assert.equal(b.pos, 1); assert.equal(b.w, 3); assert.equal(b.h, 0.3); assert.equal(b.sill, 0);
});

test("sanitize: dormers are cleaned", () => {
  const p = sanitize({ dormers: [{ type: "gable", side: -3, pos: 0.4 }, { type: "tower" }] });
  assert.equal(p.dormers.length, 1);
  assert.equal(p.dormers[0].side, -1);
  assert.equal(p.dormers[0].type, "gable");
});

test("window generation: the door's slot on the ground floor is skipped", () => {
  const p = sanitize({ winFront: 3, winBack: 2, doorWall: "front" });
  assert.equal(countOn(p, "front", 0), 3);
  assert.equal(countOn(p, "back", 0), 2);
  const doorCenter = p.width / 2;
  assert.ok(p.windows.filter(w => w.wall === "front" && w.floor === 0).every(w => Math.abs(w.pos * p.width - doorCenter) > 0.5));
});

function assertMeshValid(g, name) {
  const nv = g.p.length / 3;
  assert.equal(g.p.length % 3, 0, name);
  assert.equal(g.n.length, g.p.length, name);
  assert.equal(g.uv.length / 2, nv, name);
  assert.equal(g.i.length % 3, 0, name);
  for (const v of g.p) assert.ok(Number.isFinite(v), name + " has a non-finite position");
  for (const i of g.i) assert.ok(i >= 0 && i < nv, name + " index out of range");
}

for (const roofType of ["gable", "hip", "flat"]) {
  test(`geometry: valid meshes for a ${roofType} roof`, () => {
    const p = sanitize({ roofType, halfStorey: true, dormers: [{ type: "gable", side: 1, pos: 0.3 }, { type: "shed", side: -1, pos: 0.6 }] });
    const { G, dims } = buildGeometry(p);
    for (const m of MATS) assertMeshValid(G[m], m);
    assert.ok(G.walls.i.length > 0 && G.roof.i.length > 0);
    assert.equal(dims.W, p.width);
    assert.equal(dims.D, p.depth);
    assert.ok(dims.ridgeY > dims.top);
  });
}

test("geometry: flat roof sits 0.3 m above the walls", () => {
  const { dims } = buildGeometry(sanitize({ roofType: "flat" }));
  assert.ok(Math.abs(dims.ridgeY - (dims.top + 0.3)) < 1e-9);
});

test("geometry: options turn their parts on and off", () => {
  const off = buildGeometry(sanitize({ chimney: false, gutters: false, foundation: 0 })).G;
  assert.equal(off.chimney.i.length, 0);
  assert.equal(off.gutter.i.length, 0);
  const on = buildGeometry(sanitize({ chimney: true, gutters: true })).G;
  assert.ok(on.chimney.i.length > 0 && on.gutter.i.length > 0);
});

test("geometry: overlapping windows are hidden instead of cut twice", () => {
  const p = sanitize({ doorWall: "back", windows: [
    { wall: "front", floor: 0, pos: 0.5, w: 1, h: 1.2, sill: 0.8 },
    { wall: "front", floor: 0, pos: 0.52, w: 1, h: 1.2, sill: 0.8 },
  ] });
  const { opsByWall } = buildGeometry(p);
  assert.equal(opsByWall.front.ops.filter(o => o.kind === "window").length, 1);
  assert.equal(p.windows.filter(w => w._hidden).length, 1);
});

test("geometry: building the same settings twice gives the same result", () => {
  const a = buildGeometry(sanitize({})).G, b = buildGeometry(sanitize({})).G;
  assert.deepEqual(a, b);
});

test("i3d: one shape per used material plus a collision shape", () => {
  const p = sanitize({});
  const xml = buildI3d(p, { withTex: false });
  const { G } = buildGeometry(p);
  const used = MATS.filter(m => G[m].i.length).length;
  assert.equal((xml.match(/<IndexedTriangleSet /g) || []).length, used + 1);
  assert.equal((xml.match(/<Material /g) || []).length, used + 1);
  assert.match(xml, /^<\?xml version="1.0"/);
  assert.doesNotMatch(xml, /NaN|undefined/);
  assert.match(xml, /<Files\/>/);
});

test("i3d: textures are referenced when exporting with textures", () => {
  const xml = buildI3d(sanitize({ wallCladding: "lockpanel" }), { withTex: true });
  assert.match(xml, /filename="textures\/walls_diffuse.png"/);
  assert.match(xml, /filename="textures\/walls_normal.png"/);
});

test("serialize: internal fields are not saved and the result loads back the same", () => {
  const p = sanitize({ windows: [
    { wall: "front", floor: 0, pos: 0.5, w: 1, h: 1.2, sill: 0.8 },
    { wall: "front", floor: 0, pos: 0.52, w: 1, h: 1.2, sill: 0.8 },
  ] });
  buildGeometry(p);
  const json = serialize(p);
  assert.doesNotMatch(JSON.stringify(json), /_hidden/);
  assert.deepEqual(sanitize(json), sanitize(JSON.parse(JSON.stringify(json))));
  assert.deepEqual(serialize(sanitize(json)), json);
});
