// The cows' troughs are game objects the player places, and the doorway to the pasture is a hole whose
// position and size are set on the pasture.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, placeableXml, PRESETS } from "../src/editor/model.mjs";
import { objectOf, objectProblems, objectWarnings, pastureOf } from "../src/editor/objects.mjs";
import { cowYard } from "../src/editor/kinds/cow.mjs";

const barn = (s = {}) => sanitize({...PRESETS.find(x => x.id === "ladugard").settings, ...s});
const sheep = (s = {}) => sanitize({...PRESETS.find(x => x.id === "farstall").settings, ...s});
const withObjects = (p, f) => sanitize({...p, objects: p.objects.map(o => f(o) || o)});
const inside = (poly, x, z) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, , zi] = poly[i], [xj, , zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
};

test("troughs: a new cow or sheep barn has a feed trough and a water trough as objects, in the pasture", () => {
  for (const p of [barn(), sheep()]) {
    const f = objectOf(p, "feedTrough"), w = objectOf(p, "waterTrough"), pa = pastureOf(p);
    assert.ok(f && w);
    for (const o of [f, w]) assert.ok(inside(pa.fence, o.x, o.z), "starts inside the fence");
  }
});

test("troughs: moving the object moves the trough, the fill plane and where the cows stand", () => {
  const p0 = barn(), pa = pastureOf(p0), f0 = objectOf(p0, "feedTrough");
  const n = pa.w.n, u = pa.w.u, dx = u[0] * 2 + n[0] * 3, dz = u[2] * 2 + n[2] * 3;   // along the wall and out into the pasture
  const p = withObjects(p0, o => o.type === "feedTrough" && {...o, x: f0.x + dx, z: f0.z + dz});
  const y0 = cowYard(buildGeometry(p0), p0), y = cowYard(buildGeometry(p), p);
  assert.ok(Math.abs(y.feedTrough.plane[0] - y0.feedTrough.plane[0] - dx) < 1e-6);
  assert.ok(Math.abs(y.feedTrough.plane[1] - y0.feedTrough.plane[1] - dz) < 1e-6);
  assert.ok(y.foodPlaces.length >= 1);
  const c = y.feedTrough.outer;
  for (const q of y.foodPlaces) {
    assert.ok(inside(pa.fence, q.pos[0], q.pos[2]), "a cow stands inside the fence");
    const dx = Math.max(c.x0 - q.pos[0], 0, q.pos[0] - c.x1), dz = Math.max(c.z0 - q.pos[2], 0, q.pos[2] - c.z1);
    assert.ok(Math.hypot(dx, dz) < 2.5, "and next to the trough");
  }
});

test("troughs: standing free in the pasture, cows can stand on both sides", () => {
  const p0 = barn(), pa = pastureOf(p0);
  const mid = [(pa.rect.x0 + pa.rect.x1) / 2, pa.rect.z1 - 4];
  const p = withObjects(p0, o => o.type === "feedTrough" && {...o, x: mid[0], z: mid[1], w: 6, d: 0.7});
  const y = cowYard(buildGeometry(p), p);
  const sides = new Set(y.foodPlaces.map(q => Math.sign(q.pos[2] - mid[1])));
  assert.equal(sides.size, 2);
});

test("troughs: without one there is a warning, no fill plane and no places, and nothing breaks", () => {
  const p0 = barn(), p = sanitize({...p0, objects: p0.objects.filter(o => o.type !== "waterTrough")});
  assert.ok(!objectOf(p, "waterTrough"), "not put back");
  const w = objectWarnings(p);
  assert.equal(w.length, 1);
  assert.match(w[0], /water trough/i);
  assert.deepEqual(objectWarnings(p0), []);
  const xml = placeableXml(p, "x");
  assert.ok(!/waterPlane/.test(xml) && !/waterPlace/.test(xml));
  assert.ok(/foodPlane/.test(xml));
  const y = cowYard(buildGeometry(p), p);
  assert.equal(y.waterTrough, null);
  assert.equal(y.waterPlaces.length, 0);
});

test("troughs: one the cows can't reach (outside the fence, or in the building) is named", () => {
  const p0 = barn(), pa = pastureOf(p0);
  assert.equal(objectProblems(p0).size, 0);
  const out = withObjects(p0, o => o.type === "feedTrough" && {...o, x: pa.rect.x1 + 6, z: pa.rect.z1 + 6});
  assert.match(objectProblems(out).get(objectOf(out, "feedTrough").id), /reach|fence/i);
  const inb = withObjects(p0, o => o.type === "waterTrough" && {...o, x: 0, z: 0});
  assert.ok(objectProblems(inb).get(objectOf(inb, "waterTrough").id));
});

test("opening: the doorway to the pasture can be put anywhere along the wall and sized", () => {
  const p0 = barn(), po = objectOf(p0, "pasture"), L = pastureOf(p0).L;
  const def = buildGeometry(p0).opsByWall[po.wall].ops.find(o => o.kind === "hatch");
  assert.ok(Math.abs((def.s0 + def.s1) / 2 - L / 2) < 1e-6 && Math.abs(def.s1 - def.s0 - 1.6) < 1e-6 && Math.abs(def.t1 - 2.2) < 1e-6, "as before to start with");
  const p = withObjects(p0, o => o.type === "pasture" && {...o, gapAt: 4, gapW: 3, gapH: 2.6});
  const g = buildGeometry(p).opsByWall[po.wall].ops.find(o => o.kind === "hatch");
  assert.ok(Math.abs(g.s0 - 2.5) < 1e-6 && Math.abs(g.s1 - 5.5) < 1e-6, `${g.s0}..${g.s1}`);
  assert.ok(Math.abs(g.t1 - 2.6) < 1e-6);
  assert.ok(!objectProblems(p).has(po.id));
  const edge = withObjects(p0, o => o.type === "pasture" && {...o, gapAt: -5, gapW: 40, gapH: 99});
  const e = objectOf(edge, "pasture");
  assert.ok(e.gapW <= 6 && e.gapH <= 4 && e.gapAt - e.gapW / 2 >= 0, "kept on the wall and in range");
});

test("opening: a door on the stretch where the doorway is warns", () => {
  const p0 = barn(), po = objectOf(p0, "pasture");
  const p = withObjects(p0, o => o.type === "pasture" && {...o, gapAt: 3, gapW: 2});
  const q = sanitize({...p, windows: [...p.windows, {id: 99, type: "door", floor: 0, wall: po.wall, pos: 3 / pastureOf(p).L, w: 1, h: 2}]});
  assert.match(objectProblems(q).get(objectOf(q, "pasture").id) || "", /door/i);
});

test("opening: the pasture's opening can be taken away", () => {
  const p0 = barn(), po = objectOf(p0, "pasture");
  const p = withObjects(p0, o => o.type === "pasture" && {...o, noGap: true});
  assert.ok(objectOf(p, "pasture").noGap);
  assert.ok(!buildGeometry(p).opsByWall[po.wall].ops.some(o => o.kind === "hatch"));
  for (const kind of ["chicken", "sheep"]) {
    const q = sanitize({kind}), pw = objectOf(q, "pasture"), r = sanitize({...q, objects: q.objects.map(o => o.type === "pasture" ? {...o, noGap: true} : o)});
    assert.ok(buildGeometry(q).opsByWall[pw.wall].ops.some(o => o.kind === "hatch"), kind);
    assert.ok(!buildGeometry(r).opsByWall[pw.wall].ops.some(o => o.kind === "hatch"), kind);
  }
});

test("doors: an empty doorway with a frame (style hole) is a hole you can walk through, with no leaf", () => {
  const p0 = barn({winBack: 0, winFront: 0, winLeft: 0, winRight: 0}), wall = objectOf(p0, "pasture").wall;
  const p = sanitize({...p0, windows: [...p0.windows, {id: 77, type: "door", floor: 0, wall, pos: 0.1, w: 1.6, h: 2.2, style: "hole"}]});
  const g = buildGeometry(p), op = g.opsByWall[wall].ops.find(o => o.hole), id = op && op.id;
  assert.ok(op, "not hidden");
  assert.ok(op.kind === "hatch" && op.plain && op.hole, "drawn as a framed hole");
  assert.ok(!g.doors.some(d => d.op && d.op.id === id), "no leaves");
  assert.ok(!new RegExp("door" + id + "Leaf").test(placeableXml(p, "x")), "no door animation");
});
