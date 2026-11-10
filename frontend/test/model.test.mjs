import { test } from "node:test";
import assert from "node:assert/strict";
import { genRow, DEFAULTS, SCHEMA, sanitize, buildGeometry, buildI3d, serialize, MATS, placementAreas, placeableSnippet, sleepPoint, boxMesh, WP, ROOM_TYPES, CURTAIN_STYLES, rgb, pipeMesh, gutterMesh, surfaceSpec, scaledUV, ridgeCapMesh , TABS } from "../src/editor/model.mjs";

const cross3 = (a, b) => [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]];
const countOn = (p, wall, floor) => p.windows.filter(w => w.wall === wall && w.floor === floor && w.type !== "door").length;

test("sanitize: empty input gives the defaults plus generated windows", () => {
  const p = sanitize({});
  for (const k of Object.keys(DEFAULTS)) assert.equal(p[k], DEFAULTS[k], k);
  assert.ok(Array.isArray(p.windows) && p.windows.length > 0);
  assert.deepEqual(p.dormers, []);
});

test("sanitize: numbers are clamped to their range and snapped to the step", () => {
  const p = sanitize({ width: 999, depth: -5, roofPitch: 37.4 });
  assert.equal(p.width, 60, "a long barn can be 60 m");
  assert.equal(p.depth, 2.5);
  assert.equal(sanitize({ depth: 999 }).depth, 50);
  assert.equal(p.roofPitch, 37);
});

test("sanitize: invalid selects, colors and booleans fall back to defaults", () => {
  const p = sanitize({ roofType: "dome", wallColor: "red", chimney: "yes" });
  assert.equal(p.roofType, DEFAULTS.roofType);
  assert.equal(p.wallColor, DEFAULTS.wallColor);
  assert.equal(p.chimney, DEFAULTS.chimney);
});

// The editor has a tab for each thing you do; every section is in one of them.
test("schema: every section is in a tab, in the order of what you do", () => {
  const ids = TABS.map(t => t[0]), inTab = t => SCHEMA.filter(g => g.tab === t).map(g => g.title);
  assert.deepEqual(ids, ["building", "inside", "settings", "game"]);
  assert.ok(SCHEMA.every(g => ids.includes(g.tab)), "every section has a tab");
  assert.deepEqual(inTab("building"), ["Open sides", "Building", "Size", "Roof", "Kupor (dormers)"], "the tree, and the sections of the main building's card (detail: true)");
  assert.deepEqual(SCHEMA.filter(g => g.detail).map(g => g.title), ["Open sides", "Size", "Roof", "Kupor (dormers)"]);
  assert.deepEqual(inTab("inside"), ["Inside"]);
  assert.deepEqual(inTab("settings"), ["Windows", "Doors", "Surfaces", "Colors", "Interior", "Inside walls"], "what the whole building has unless something says otherwise");
  assert.deepEqual(inTab("game"), ["Chickens", "Cows", "Sheep", "Game mod"], "the game objects are in the tree");
  // the names shown say what the section is for
  const label = t => { const g = SCHEMA.find(x => x.title === t); return g.label || g.title; };
  assert.deepEqual(["Inside", "Interior", "Inside walls", "Game mod"].map(label), ["Furniture and pieces", "Rooms and curtains", "Inside walls", "Shop and mod"]);
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
  assert.equal(p.windows.filter(w => w.type !== "door").length, 2, "and a door");
  assert.deepEqual(p.windows.map(w => w.id), [1, 2, 3]);
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
  assert.ok(p.windows.filter(w => w.wall === "front" && w.floor === 0 && w.type !== "door").every(w => Math.abs(w.pos * p.width - doorCenter) > 0.5));
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

// The underside of eaves, dormer roofs and canopies is painted like the trim, not tiled like the roof.
for (const roofType of ["gable", "hip", "flat"]) {
  test(`geometry: roof undersides use the trim, not the roof covering (${roofType})`, () => {
    const p = sanitize({ roofType, overhang: 0.6, entrance: "gable", halfStorey: roofType !== "flat",
      dormers: roofType === "flat" ? [] : [{ type: "gable", side: 1, pos: 0.3 }, { type: "shed", side: -1, pos: 0.6 }] });
    const { G, dims } = buildGeometry(p);
    const down = g => Array.from({ length: g.n.length / 3 }, (_, i) => g.n[i*3+1]).filter(y => y < -0.3).length;
    assert.equal(down(G.roof), 0, "roof faces pointing down");
    // the eave soffit is there, in the trim, under the overhang
    const soffit = Array.from({ length: G.trim.p.length / 3 }, (_, i) => i)
      .filter(i => G.trim.n[i*3+1] < -0.3 && G.trim.p[i*3+1] >= dims.top - 1.5 && Math.abs(G.trim.p[i*3]) > dims.W / 2);
    assert.ok(soffit.length > 0, "no trim soffit outside the walls");
  });
}

/* ---------- Trim and glass ---------- */
// Triangles' planes as "nx,ny,nz,offset" keys, rounded to 1 mm.
const planesOf = g => {
  const out = new Set();
  for (let t = 0; t < g.i.length; t += 3) {
    const [a, b, c] = [g.i[t], g.i[t+1], g.i[t+2]].map(k => [g.p[k*3], g.p[k*3+1], g.p[k*3+2]]);
    const u = [b[0]-a[0], b[1]-a[1], b[2]-a[2]], v = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
    let n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
    const l = Math.hypot(...n); if (l < 1e-12) continue;
    n = n.map(x => x / l);
    if (n[0] + n[1] + n[2] < 0 || (Math.abs(n[0] + n[1] + n[2]) < 1e-9 && (n[0] < 0 || (n[0] === 0 && n[1] < 0)))) n = n.map(x => -x); // same plane either way round
    out.add([...n.map(x => x.toFixed(3)), (n[0]*a[0] + n[1]*a[1] + n[2]*a[2]).toFixed(3)].join(","));
  }
  return out;
};

test("geometry: no trim or wall face lies in the plane of the glass (no flicker)", () => {
  const { G } = buildGeometry(sanitize({ halfStorey: true, dormers: [{ type: "gable", side: 1, pos: 0.5 }] }));
  const glass = planesOf(G.glass);
  for (const m of ["trim", "walls", "door"]) for (const pl of planesOf(G[m])) assert.ok(!glass.has(pl), `${m} face in the glass plane ${pl}`);
});

test("surfaces: trim is painted wood, textured in the export", () => {
  const p = sanitize({});
  assert.equal(surfaceSpec(p, "trim").kind, "paintedwood");
  assert.match(buildI3d(p, { withTex: true }), /filename="textures\/trim_diffuse.png"/);
});

// The texture's grain runs along v. On every long, thin trim triangle (a board's face), going
// along its longest edge must only move along the grain (v), not across it (u); this holds for
// sloped boards too, like the fascia up a gable.
for (const roofType of ["gable", "hip"]) {
  test(`geometry: trim grain runs along each board, sloped ones too (${roofType})`, () => {
    const p = sanitize({ roofType, overhang: 0.6, entrance: "gable" }), g = buildGeometry(p).G.trim, uv = scaledUV(p, "trim", g);
    const P = k => [g.p[k*3], g.p[k*3+1], g.p[k*3+2]];
    let long = 0, sloped = 0;
    for (let t = 0; t < g.i.length; t += 3) {
      const ks = [g.i[t], g.i[t+1], g.i[t+2]];
      const edges = [[0, 1], [1, 2], [2, 0]].map(([a, b]) => ({ a: ks[a], b: ks[b], d: P(ks[b]).map((x, i) => x - P(ks[a])[i]) }));
      const e = edges.reduce((m, x) => Math.hypot(...x.d) > Math.hypot(...m.d) ? x : m);
      const L = Math.hypot(...e.d), c = cross3(edges[0].d, edges[1].d), height = Math.hypot(...c) / L;
      if (L < 0.3 || L < 4 * height) continue;   // only long, thin faces
      // ...that are half of a board's rectangle (a right angle), not slivers of a big soffit
      const rightAngle = edges.some((x, i) => { const y = edges[(i + 1) % 3]; return Math.abs(x.d[0]*y.d[0] + x.d[1]*y.d[1] + x.d[2]*y.d[2]) < 1e-6 * Math.hypot(...x.d) * Math.hypot(...y.d) + 1e-9; });
      if (!rightAngle) continue;
      long++;
      if (Math.abs(e.d[1]) / L > 0.2 && Math.abs(e.d[1]) / L < 0.95) sloped++;
      // A board face is split in two triangles whose longest edge is the diagonal,
      // so the board's side is one of the two longest edges.
      const two = edges.slice().sort((x, y) => Math.hypot(...y.d) - Math.hypot(...x.d)).slice(0, 2);
      const ok = two.some(x => Math.abs(uv[x.b*2] - uv[x.a*2]) <= 0.02 * Math.abs(uv[x.b*2+1] - uv[x.a*2+1]));
      assert.ok(ok, `grain crosses a board along ${e.d.map(x => x.toFixed(2))}`);
    }
    assert.ok(long > 10, "no long trim boards found");
    if (roofType === "gable") assert.ok(sloped > 0, "no sloped boards checked");
  });
}

/* ---------- Window trim ---------- */
// One window on the front wall; returns its opening and helpers in the wall's (s, t, d) frame.
function oneWindow(w, h) {
  const p = sanitize({ windows: [{ wall: "front", floor: 0, pos: 0.3, w, h, sill: 1 }], doorWall: "back", entrance: "none", interior: false });
  const geo = buildGeometry(p), { w: wall, ops } = geo.opsByWall.front, o = ops.find(x => x.kind === "window");
  const local = (g, k) => { const x = g.p[k*3] - wall.o[0], z = g.p[k*3+2] - wall.o[2];
    return { s: x * wall.u[0] + z * wall.u[2], t: g.p[k*3+1] - wall.o[1], d: x * wall.n[0] + z * wall.n[2] }; };
  const pts = m => Array.from({ length: geo.G[m].p.length / 3 }, (_, k) => local(geo.G[m], k));
  return { geo, o, pts };
}
const near = (q, o, m = 0.2) => q.s > o.s0 - m && q.s < o.s1 + m && q.t > o.t0 - m && q.t < o.t1 + m;

test("window: the opening is lined with painted trim, not the wall's boards", () => {
  const { o, pts } = oneWindow(1, 1.2), r = 0.15;
  // the lining's inner corners (at the back of the wall) are trim; there is no wall cladding there
  const back = (q, m) => Math.abs(q.d + r) < 1e-6 && q.s > o.s0 - 1e-6 && q.s < o.s1 + 1e-6 && (Math.abs(q.t - o.t0) < 1e-6 || Math.abs(q.t - o.t1) < 1e-6);
  assert.ok(pts("trim").some(q => back(q)), "no trim lining");
  assert.ok(!pts("walls").some(q => back(q)), "wall cladding in the opening");
});

test("window: sill and frame sit on the wall, not overlapping the lining (no flicker)", () => {
  for (const [w, h] of [[0.6, 0.5], [1.2, 1.25]]) {
    const { o, pts } = oneWindow(w, h), r = 0.15;
    // every trim vertex near the window is on the wall face or in front of it, or at the back of the
    // lining; none inside the wall where it would share a plane with the lining
    for (const q of pts("trim").filter(q => near(q, o))) {
      const inWall = q.d < -1e-6 && q.d > -r + 1e-6;
      // glazing bars across the opening (their ends meet the lining back to back, which can't flicker)
      const bar = q.s > o.s0 - 1e-6 && q.s < o.s1 + 1e-6 && q.t > o.t0 - 1e-6 && q.t < o.t1 + 1e-6;
      assert.ok(!inWall || bar, `${w} x ${h}: trim inside the wall at s ${q.s.toFixed(3)}, t ${q.t.toFixed(3)}, d ${q.d.toFixed(3)}`);
    }
  }
});

test("window: a small window has a slimmer frame and no centre bar", () => {
  const frame = (w, h) => { const { o, pts } = oneWindow(w, h);
    // the left side piece's top corners (above the opening, left of it, in front of the wall)
    const side = pts("trim").filter(q => q.d > 1e-6 && q.t > o.t1 - 1e-6 && q.t < o.t1 + 0.2 && q.s < o.s0 - 1e-6 && q.s > o.s0 - 0.2);
    // glazing bars: trim inside the wall's thickness across the middle of the opening
    const bar = pts("trim").filter(q => q.s > o.s0 + 0.1 && q.s < o.s1 - 0.1 && q.d < -1e-6 && q.d > -0.15 + 1e-6);
    return { width: o.s0 - Math.min(...side.map(q => q.s)), bars: bar.length }; };
  const small = frame(0.6, 0.5), big = frame(1.2, 1.25);
  assert.ok(small.width <= 0.05 + 1e-6, `small frame ${small.width.toFixed(3)} m wide`);
  assert.ok(big.width >= 0.07, `big frame ${big.width.toFixed(3)} m wide`);
  assert.equal(small.bars, 0, "a small window gets one pane");
  assert.ok(big.bars > 0, "a big window keeps its centre bar");
});

/* ---------- Ridge cap ---------- */
// Local coordinates: x along the ridge, y up, z across; the roof's top surface is y = ridgeY - tanP * |z|.
// Like ridge tiles: a cap that hugs the two slopes, thin at its edges, with a soft rounded crown a
// few cm above the ridge. Not a roll standing on top of the ridge.
for (const pitch of [10, 38, 60]) {
  test(`ridgeCapMesh: a low cap hugging the slopes, rounded on top (${pitch} degrees)`, () => {
    const ridgeY = 7, tanP = Math.tan(pitch * Math.PI / 180), w = 0.13;
    const m = ridgeCapMesh(-4, 4, ridgeY, tanP, w);
    assertMeshValid(m, "ridge cap");
    const arc = m.arc, roofAt = z => ridgeY - tanP * Math.abs(z);
    assert.ok(arc.length >= 2 * 12, "profile too coarse");
    const zs = arc.map(i => m.p[i*3+2]);
    assert.ok(Math.max(...zs) - Math.min(...zs) >= 2 * w - 1e-6, "narrower than asked");
    let prev = null;
    for (const i of arc) {
      const z = m.p[i*3+2], y = m.p[i*3+1], n = [m.n[i*3], m.n[i*3+1], m.n[i*3+2]];
      assert.ok(y > roofAt(z), "below the roof");
      assert.ok(y - roofAt(z) <= 0.07 + 1e-9, `${(y - roofAt(z)).toFixed(3)} m above the roof: stands up like a roll`);
      assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-6 && Math.abs(n[0]) < 1e-9, "normal not unit, across the ridge");
      assert.ok(n[1] > 0.3, "faces down or sideways (an undercut)");
      // smooth: the normal turns only a little from one point to the next
      if (prev) assert.ok(n[1] * prev[1] + n[2] * prev[2] > Math.cos(12 * Math.PI / 180), "kink in the profile");
      prev = n;
    }
    // thin at the edges, rounded crown on top
    const top = Math.max(...arc.map(i => m.p[i*3+1]));
    assert.ok(top - ridgeY >= 0.04 && top - ridgeY <= 0.08, `crown ${(top - ridgeY).toFixed(3)} m above the ridge`);
    for (const i of [arc[0], arc[arc.length - 1]]) assert.ok(m.p[i*3+1] - roofAt(m.p[i*3+2]) <= 0.04, "thick at the edge");
    // edges tucked into the roof (no gap you can see through)
    assert.ok(m.rim.length >= 4, "no rim");
    for (const i of m.rim) assert.ok(m.p[i*3+1] <= roofAt(m.p[i*3+2]) - 0.005, "cap edge floats above the roof");
    for (const side of [-1, 1]) assert.ok(m.rim.some(i => Math.sign(m.p[i*3+2]) === side), "rim missing on one side");
  });
}

for (const roofType of ["gable", "hip"]) for (const pitch of [15, 35, 50]) {
  test(`geometry: the ridge cap is low (${roofType}, ${pitch} degrees)`, () => {
    const p = sanitize({ roofType, roofPitch: pitch, width: 8, depth: 6, chimney: false });
    const { G, dims } = buildGeometry(p), g = G.roof, ridge = dims.ridgeY;
    let top = -Infinity;
    for (let i = 0; i < g.p.length / 3; i++) top = Math.max(top, g.p[i*3+1]);
    assert.ok(top - ridge <= 0.08 + 1e-9, `cap stands ${(top - ridge).toFixed(3)} m above the ridge`);
    assert.ok(top - ridge >= 0.04, "cap too flat to see");
    const m = ridgeCapMesh(-2, 2, 5, Math.tan(pitch * Math.PI / 180), 0.13);
    // its ends are one plain color: every end vertex has the same uv (no tile stripes in rings)
    const ends = []; for (let i = 0; i < m.n.length / 3; i++) if (Math.abs(m.n[i*3]) > 0.99) ends.push(m.uv[i*2] + "," + m.uv[i*2+1]);
    assert.ok(ends.length > 0 && new Set(ends).size === 1, "end caps are textured");
  });
}

for (const roofType of ["gable", "hip"]) {
  test(`geometry: the ridge is round, not a box (${roofType})`, () => {
    const { G, dims } = buildGeometry(sanitize({ roofType, width: 12, depth: 7 }));
    const g = G.roof, normals = new Set();
    for (let i = 0; i < g.p.length / 3; i++) if (g.p[i*3+1] > dims.ridgeY + 0.03) normals.add([g.n[i*3], g.n[i*3+1], g.n[i*3+2]].map(v => v.toFixed(2)).join(","));
    assert.ok(normals.size >= 8, `only ${normals.size} directions on top of the ridge: still a box`);
  });
}

/* ---------- Gutters and downpipes ---------- */
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, (a[0]*b[0] + a[1]*b[1] + a[2]*b[2]) / (Math.hypot(...a) * Math.hypot(...b))))) * 180 / Math.PI;

test("pipeMesh: one closed, round pipe with rounded elbows", () => {
  // the downpipe route: down from the gutter, slanting in to the wall, down, kick out at the bottom
  const path = [[0, 6, 0.6], [0, 5.85, 0.6], [0, 5.5, 0.15], [0, 0.3, 0.15], [0, 0.1, 0.35]];
  const r = 0.045, m = pipeMesh(path, r);
  assertMeshValid(m, "pipe");
  assertClosed(m, "pipe");
  // smooth and round: side normals are unit length and point straight out from the pipe's axis
  const rings = m.rings;
  assert.ok(rings.length > path.length, "no extra rings in the bends");
  for (const ring of rings) {
    assert.ok(ring.verts.length >= 16, "pipe has fewer than 16 sides");
    for (const i of ring.verts) {
      const n = [m.n[i*3], m.n[i*3+1], m.n[i*3+2]], d = [m.p[i*3] - ring.c[0], m.p[i*3+1] - ring.c[1], m.p[i*3+2] - ring.c[2]];
      assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-6, "normal not unit length");
      assert.ok(Math.abs(Math.hypot(...d) - r) < 1e-6, "vertex not on the pipe's surface");
      assert.ok(angle(n, d) < 1e-3, "normal not radial (flat shading)");
    }
  }
  // elbows are round: the pipe never turns more than 20 degrees from one ring to the next
  for (let k = 1; k < rings.length; k++) assert.ok(angle(rings[k - 1].t, rings[k].t) <= 20 + 1e-6, `kink of ${angle(rings[k - 1].t, rings[k].t).toFixed(1)} degrees`);
  // it still follows the route: starts and ends at the path's ends
  assert.deepEqual(rings[0].c, path[0]);
  assert.deepEqual(rings.at(-1).c, path.at(-1));
});

test("gutterMesh: a smooth half-round gutter with a rolled lip", () => {
  const c0 = [-5, 4, 4], c1 = [5, 4, 4], out = [0, 0, 1], r = 0.065;
  const m = gutterMesh(c0, c1, out, r);
  assertMeshValid(m, "gutter");
  // the trough: profile points on the half circle below the rim, normals radial (smooth, both sides)
  let trough = 0;
  for (let i = 0; i < m.p.length / 3; i++) {
    if (!m.trough[i]) continue;
    trough++;
    const d = [0, m.p[i*3+1] - c0[1], m.p[i*3+2] - c0[2]], n = [m.n[i*3], m.n[i*3+1], m.n[i*3+2]];
    assert.ok(Math.abs(Math.hypot(...d) - r) < 1e-6, "trough vertex off the half circle");
    assert.ok(d[1] <= 1e-9, "trough above the rim");
    assert.ok(Math.min(angle(n, d), angle(n, d.map(v => -v))) < 1e-3, "trough normal not radial");
  }
  assert.ok(trough >= 2 * 2 * 13, "profile has fewer than 12 segments");
});

test("geometry: each downpipe is one pipe from the gutter to the ground", () => {
  const geo = buildGeometry(sanitize({ gutters: true, downpipes: 2, roofType: "gable", ridge: "width" })), g = geo.G.gutter;
  assertMeshValid(g, "gutter");
  assert.equal(geo.downpipes.length, 4, "two downpipes on each long side");
  const key = (a, i) => [a[i*3], a[i*3+1], a[i*3+2]].map(v => v.toFixed(5)).join(",");
  const have = new Set(Array.from({ length: g.p.length / 3 }, (_, i) => key(g.p, i)));
  for (const { path, r } of geo.downpipes) {
    assert.ok(path[0][1] > geo.dims.top - 0.5, "starts at the gutter");
    assert.ok(path.at(-1)[1] < 0.2, "ends near the ground");
    const m = pipeMesh(path, r);
    for (let i = 0; i < m.p.length / 3; i++) assert.ok(have.has(key(m.p, i)), "downpipe is not one pipeMesh along its route");
  }
});

test("geometry: building the same settings twice gives the same result", () => {
  const a = buildGeometry(sanitize({})).G, b = buildGeometry(sanitize({})).G;
  assert.deepEqual(a, b);
});

/* ---------- Collision ---------- */
const verts = g => Array.from({ length: g.p.length / 3 }, (_, i) => [g.p[i*3], g.p[i*3+1], g.p[i*3+2]]);
const maxY = g => Math.max(...verts(g).map(v => v[1]));

// Closed and turned outwards: every edge is matched by the same edge the other
// way round, and the enclosed volume is positive.
function assertClosed(g, name) {
  const key = i => [0, 1, 2].map(k => g.p[i*3+k].toFixed(4)).join(",");
  const edges = new Map();
  let vol = 0;
  for (let t = 0; t < g.i.length; t += 3) {
    const [a, b, c] = [g.i[t], g.i[t+1], g.i[t+2]];
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const e = key(u) + ">" + key(v);
      edges.set(e, (edges.get(e) || 0) + 1);
    }
    const P = [a, b, c].map(i => [g.p[i*3], g.p[i*3+1], g.p[i*3+2]]);
    vol += (P[0][0] * (P[1][1]*P[2][2] - P[1][2]*P[2][1]) - P[0][1] * (P[1][0]*P[2][2] - P[1][2]*P[2][0]) + P[0][2] * (P[1][0]*P[2][1] - P[1][1]*P[2][0])) / 6;
  }
  for (const [e, n] of edges) {
    const [u, v] = e.split(">");
    assert.equal(edges.get(v + ">" + u) || 0, n, `${name}: edge ${e} is open`);
  }
  assert.ok(vol > 0, `${name}: collision is inside out`);
}

const dormers = [
  { type: "frontespis", side: 1, pos: 0.5 },
  { type: "gable", side: -1, pos: 0.25 },
  { type: "shed", side: -1, pos: 0.7 },
];

for (const roofType of ["gable", "hip", "flat"]) for (const entrance of ["porch", "shed", "gable", "none"]) {
  test(`collision: closed mesh for a ${roofType} roof with a ${entrance} entrance`, () => {
    const { collision } = buildGeometry(sanitize({ roofType, entrance, halfStorey: true, chimney: true, dormers }));
    assertMeshValid(collision, "collision");
    assertClosed(collision, "collision");
  });
}

for (const roofType of ["gable", "hip"]) {
  test(`collision: covers the ${roofType} roof up to the ridge`, () => {
    const { collision, dims } = buildGeometry(sanitize({ roofType, chimney: false }));
    assert.ok(maxY(collision) >= dims.ridgeY - 1e-6, `collision top ${maxY(collision)} < ridge ${dims.ridgeY}`);
  });
}

test("collision: covers the flat roof", () => {
  const { collision, dims } = buildGeometry(sanitize({ roofType: "flat", chimney: false }));
  assert.ok(maxY(collision) >= dims.ridgeY - 1e-6);
});

test("collision: covers the chimney", () => {
  const { collision, dims } = buildGeometry(sanitize({ chimney: true }));
  assert.ok(maxY(collision) >= dims.ridgeY + 0.7);
});

for (const type of ["frontespis", "gable", "shed"]) {
  test(`collision: a ${type} dormer gets its own collision`, () => {
    // Ridge parallel to the front, so a side 1 dormer faces +z from the roof.
    const base = { roofType: "gable", ridge: "width", halfStorey: true, chimney: false };
    const without = buildGeometry(sanitize(base));
    const p = sanitize({ ...base, dormers: [{ type, side: 1, pos: 0.5 }] });
    const withD = buildGeometry(p);
    assert.equal(p.dormers[0]._hidden, false, "dormer should fit");
    assert.ok(withD.collision.i.length > without.collision.i.length);
    // The dormer's front wall stands on the roof slope, above the eaves.
    const roofAt = z => withD.dims.ridgeY - Math.tan(p.roofPitch * Math.PI / 180) * Math.abs(z);
    const hw = p.dormers[0].w / 2 + 1e-6;
    const sticksOut = verts(withD.collision).some(([x, y, z]) => z > 0.3 && Math.abs(x) <= hw && y > roofAt(z) + 0.5);
    assert.ok(sticksOut, "no collision above the roof slope where the dormer is");
  });
}

test("collision: dormers that don't fit add no collision", () => {
  const base = { roofType: "flat" };
  const a = buildGeometry(sanitize(base)).collision;
  const b = buildGeometry(sanitize({ ...base, dormers: [{ type: "gable", side: 1, pos: 0.5 }] })).collision;
  assert.deepEqual(b, a);
});

test("collision: the porch deck, posts and steps are solid", () => {
  const p = sanitize({ entrance: "porch", doorWall: "front", foundation: 0.6, entranceDepth: 1.6 });
  const { collision, dims } = buildGeometry(p);
  const front = verts(collision).filter(([, , z]) => z > dims.D / 2 + 0.5);
  assert.ok(front.some(([, y]) => Math.abs(y - dims.F) < 1e-6), "no porch deck");
  assert.ok(front.some(([, y]) => y > dims.F + 2), "no posts or roof on the porch");
  assert.ok(front.some(([, , z]) => z > dims.D / 2 + 1.6), "no steps in front of the porch");
});

test("collision: the entrance canopy is solid", () => {
  for (const entrance of ["shed", "gable"]) {
    const { collision, dims } = buildGeometry(sanitize({ entrance, doorWall: "front" }));
    const canopy = verts(collision).filter(([, y, z]) => z > dims.D / 2 + 0.3 && y > dims.F + 2);
    assert.ok(canopy.length > 0, `no collision for the ${entrance} canopy`);
  }
});

/* ---------- Placement areas (leveling, clear, test, tip occlusion) ---------- */
// Scene tree of an i3d: [{name, translation, children}], enough to resolve "0>2|1|0" paths.
function sceneTree(xml) {
  const scene = xml.slice(xml.indexOf("<Scene>"), xml.indexOf("</Scene>"));
  const root = { children: [] }, stack = [root];
  for (const m of scene.matchAll(/<(\/?)(TransformGroup|Shape|Camera)\b([^>]*?)(\/?)>/g)) {
    if (m[1]) { stack.pop(); continue; }
    const attr = k => (m[3].match(new RegExp(`\\b${k}="([^"]*)"`)) || [])[1];
    const node = { name: attr("name"), translation: (attr("translation") || "0 0 0").split(" ").map(Number), rotation: (attr("rotation") || "0 0 0").split(" ").map(Number), attrs: m[3], children: [] };
    stack[stack.length - 1].children.push(node);
    if (!m[4]) stack.push(node);
  }
  return root.children;
}
function resolve(tree, path) {
  const [comp, rest] = path.split(">");
  let node = tree[+comp], pos = node.translation.slice();
  for (const i of rest.split("|").map(Number)) {
    node = node.children[i];
    pos = pos.map((v, k) => v + node.translation[k]);
  }
  return { node, pos };
}
const allVisual = G => MATS.flatMap(m => verts(G[m]));

test("areas: the level area covers the house, porch and steps on the ground", () => {
  const p = sanitize({ entrance: "porch", doorWall: "front", foundation: 0.6 });
  const geo = buildGeometry(p);
  const { level } = placementAreas(geo);
  const ground = MATS.flatMap(m => verts(geo.G[m])).filter(([, y]) => y < 0.01);
  assert.ok(ground.length > 0);
  for (const [x, , z] of ground) assert.ok(x >= level.x0 && x <= level.x1 && z >= level.z0 && z <= level.z1, `ground point ${x},${z} outside the level area`);
  assert.ok(level.z1 > geo.dims.D / 2 + 1.6, "porch not inside the level area");
});

test("areas: the test area is a box around the whole house", () => {
  const geo = buildGeometry(sanitize({ chimney: true, dormers: [{ type: "gable", side: 1, pos: 0.5 }], halfStorey: true }));
  const { test: box } = placementAreas(geo);
  for (const [x, y, z] of allVisual(geo.G)) {
    assert.ok(x >= box.min[0] - 1e-9 && x <= box.max[0] + 1e-9 && z >= box.min[2] - 1e-9 && z <= box.max[2] + 1e-9, "outside in x/z");
    assert.ok(y >= box.min[1] - 1e-9 && y <= box.max[1] + 1e-9, "outside in height");
  }
});

test("i3d: area nodes match the placeable snippet's i3dMappings", () => {
  const p = sanitize({ entrance: "porch" });
  const geo = buildGeometry(p);
  const areas = placementAreas(geo);
  const tree = sceneTree(buildI3d(p));
  const snippet = placeableSnippet(p);
  const map = Object.fromEntries([...snippet.matchAll(/<i3dMapping id="([^"]+)" node="([^"]+)"\/>/g)].map(m => [m[1], m[2]]));
  // every mapping points at the node with that name
  for (const [id, path] of Object.entries(map)) assert.equal(resolve(tree, path).node.name, id, path);
  // every node referenced by the blocks has a mapping
  for (const m of snippet.matchAll(/(?:startNode|widthNode|heightNode|endNode)="([^"]+)"/g)) assert.ok(map[m[1]], `${m[1]} has no i3dMapping`);
  assert.match(snippet, /<leveling requireLeveling="true"/);
  // the level area's three nodes span exactly the computed rectangle
  const at = id => resolve(tree, map[id]).pos;
  const s = at("levelAreaStart01"), w = at("levelAreaWidth01"), h = at("levelAreaHeight01");
  const xs = [s[0], w[0], h[0]], zs = [s[2], w[2], h[2]];
  const near = (a, b, what) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-3, `${what}: ${a} vs ${b}`));
  near([Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)], [areas.level.x0, areas.level.x1, areas.level.z0, areas.level.z1], "level area");
  // Giants' convention (base-game garden shed): width runs along z, height along x
  assert.ok(Math.abs(w[0] - s[0]) < 1e-9 && w[2] > s[2], "width node should be along +z");
  assert.ok(Math.abs(h[2] - s[2]) < 1e-9 && h[0] > s[0], "height node should be along +x");
  // the test area runs from one bottom corner to the opposite top corner; end is a child of start
  near(at("testAreaStart01"), areas.test.min, "test area start");
  near(at("testAreaEnd01"), areas.test.max, "test area end");
  assert.match(map.testAreaEnd01, new RegExp("^" + map.testAreaStart01.replace(/[|>]/g, "\\$&") + "\\|"));
  // AI update areas reuse the tip occlusion nodes, as in the base game
  assert.match(snippet, /<updateArea startNode="tipOcclusionUpdateAreaStart01" endNode="tipOcclusionUpdateAreaEnd01"\/>/);
});

test("i3d: collision uses the base game's building collision filter", () => {
  const xml = buildI3d(sanitize({}));
  assert.match(xml, /<Shape name="collision"[^>]*collisionFilterGroup="0x3e"[^>]*collisionFilterMask="0xfffffbff"/);
});

test("i3d: one shape per used material plus a collision shape", () => {
  const p = sanitize({});
  const xml = buildI3d(p, { withTex: false });
  const { G } = buildGeometry(p);
  const used = MATS.filter(m => G[m].i.length).length;
  // (and the door's leaf, its collision and trigger, the furniture's colours ...; the door and its ironwork are all on the leaf)
  assert.ok((xml.match(/<IndexedTriangleSet /g) || []).length >= used + 2, "materials + collision + sleep trigger");
  for (const m of MATS.filter(m => G[m].i.length && !["curtain", "fittings", "door", "iron"].includes(m))) assert.match(xml, new RegExp(`<Shape name="${m}"`), m);
  assert.match(xml, /^<\?xml version="1.0"/);
  assert.doesNotMatch(xml, /NaN|undefined/);
  assert.match(xml, /<Files\/>/);
});

/* ---------- Sleep point ---------- */
const inBox = (q, c, s) => [0, 1, 2].every(k => Math.abs(q[k] - c[k]) <= s[k] / 2 + 1e-9);
// Camera looks down its -z; i3d rotation is pitch (x) then yaw (y), in degrees.
const camForward = ([rx, ry]) => {
  const a = rx * Math.PI / 180, b = ry * Math.PI / 180;
  return [-Math.cos(a) * Math.sin(b), Math.sin(a), -Math.cos(a) * Math.cos(b)];
};

test("sanitize: a house has a sleep point to start with; a save that had it off has none", () => {
  assert.deepEqual(sanitize({}).objects.map(o => o.type), ["sleep"]);
  assert.deepEqual(sanitize({ sleepPoint: false }).objects, []);
});

for (const doorWall of ["front", "back", "left", "right"]) {
  test(`sleep point: trigger, icon, spawn and camera for a door on the ${doorWall} wall`, () => {
    const p = sanitize({ doorWall, doorPos: 0.4, foundation: 0.6, entrance: "porch" });
    const geo = buildGeometry(p), sp = sleepPoint(geo, p);
    const { w, ops } = geo.opsByWall[doorWall], door = ops.find(o => o.kind === "door");
    const sc = (door.s0 + door.s1) / 2;
    const out = q => (q[0] - w.o[0]) * w.n[0] + (q[2] - w.o[2]) * w.n[2];
    const along = q => (q[0] - w.o[0]) * w.u[0] + (q[2] - w.o[2]) * w.u[2];
    const { center: c, size: s } = sp.trigger;
    // in front of the door, outside the wall, from the ground to above head height on the floor
    assert.ok(Math.abs(along(c) - sc) < 1e-6, "trigger not centred on the door");
    const halfOut = (Math.abs(w.n[0]) * s[0] + Math.abs(w.n[2]) * s[2]) / 2;
    assert.ok(out(c) - halfOut >= -1e-9, "trigger reaches into the house");
    assert.ok(out(c) > 0.5, "trigger not outside the door");
    assert.ok(c[1] - s[1] / 2 <= 1e-9 && c[1] + s[1] / 2 >= p.foundation + 1.8, "trigger misses a standing player");
    // the icon floats inside the trigger, at the door
    assert.ok(inBox(sp.marker, c, s), "sleep icon outside the trigger");
    // spawn on the ground, outside everything that is cleared for the house
    const { clear } = placementAreas(geo);
    assert.equal(sp.spawn.pos[1], 0);
    const [x, , z] = sp.spawn.pos;
    assert.ok(x < clear.x0 || x > clear.x1 || z < clear.z0 || z > clear.z1, "spawn inside the house area");
    // camera outside, above the roof, looking at the house
    const cam = sp.camera;
    assert.ok(cam.pos[1] > geo.dims.ridgeY, "camera below the roof");
    const f = camForward(cam.rot), to = [0, geo.dims.ridgeY * 0.45, 0].map((v, k) => v - cam.pos[k]);
    const cos = (f[0]*to[0] + f[1]*to[1] + f[2]*to[2]) / Math.hypot(...to);
    assert.ok(cos > 0.999, `camera not looking at the house (cos ${cos})`);
  });
}

test("i3d: sleep point nodes match the snippet and use the base game's trigger filter", () => {
  const p = sanitize({ doorWall: "right" });
  const sp = sleepPoint(buildGeometry(p), p);
  const tree = sceneTree(buildI3d(p)), snippet = placeableSnippet(p);
  const map = Object.fromEntries([...snippet.matchAll(/<i3dMapping id="([^"]+)" node="([^"]+)"\/>/g)].map(m => [m[1], m[2]]));
  for (const id of ["sleepingTrigger", "sleepTriggerMarker", "spawnPoint", "sleepCamera"]) assert.ok(map[id], `${id} has no i3dMapping`);
  for (const [id, path] of Object.entries(map)) assert.equal(resolve(tree, path).node.name, id, path);
  for (const m of snippet.matchAll(/(?:triggerNode|cameraNode|spawnNode|node|teleportNode)="([^"0][^"]*)"/g)) assert.ok(map[m[1]], `${m[1]} has no i3dMapping`);
  const near = (a, b, what) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-3, `${what}: ${a} vs ${b}`));
  near(resolve(tree, map.sleepingTrigger).pos, sp.trigger.center, "trigger");
  near(resolve(tree, map.sleepTriggerMarker).pos, sp.marker, "marker");
  near(resolve(tree, map.spawnPoint).pos, sp.spawn.pos, "spawn");
  near(resolve(tree, map.sleepCamera).pos, sp.camera.pos, "camera");
  near(resolve(tree, map.sleepCamera).node.rotation.slice(0, 2), sp.camera.rot, "camera rotation");
  const trig = resolve(tree, map.sleepingTrigger).node.attrs;
  assert.match(trig, /trigger="true"/);
  assert.match(trig, /collisionFilterGroup="0x20000000"/);
  assert.match(trig, /collisionFilterMask="0x100000"/);
  assert.match(trig, /nonRenderable="true"/);
  assert.match(snippet, /<farmhouse spawnNode="spawnPoint">\s*<sleeping triggerNode="sleepingTrigger" cameraNode="sleepCamera"\/>\s*<\/farmhouse>/);
  assert.match(snippet, /<triggerMarker node="sleepTriggerMarker" filename="\$data\/shared\/assets\/marker\/markerIconSleep.i3d"\/>/);
  assert.match(snippet, /<hotspot type="FARM" linkNode="0>" teleportNode="spawnPoint"\/>/);
  assert.match(snippet, /type="farmhouse"/);
});

test("sleep point: the trigger box is a closed mesh turned outwards", () => {
  const g = boxMesh([1.8, 2.6, 1.2]);
  assertMeshValid(g, "trigger");
  assertClosed(g, "trigger");
});

// Placing a placeable turns its physics off and on again. Without the "CPU Mesh" flag
// (meshUsage="256") the game can't rebuild it from our inline geometry, so walls and the
// sleep trigger end up with no physics at all.
test("i3d: physics shapes are CPU meshes, visual shapes are not", () => {
  const xml = buildI3d(sanitize({}));
  const sets = Object.fromEntries([...xml.matchAll(/<IndexedTriangleSet name="([^"]+)"[^>]*?(?: meshUsage="(\d+)")?>/g)].map(m => [m[1], m[2]]));
  assert.equal(sets.collision, "256");
  assert.equal(sets.sleepingTrigger, "256");
  for (const m of ["walls", "roof", "glass"]) assert.equal(sets[m], undefined, m);
});

test("i3d: a farmhouse has an indoor area over the house, matching the snippet", () => {
  const p = sanitize({});
  const geo = buildGeometry(p), tree = sceneTree(buildI3d(p)), snippet = placeableSnippet(p);
  const map = Object.fromEntries([...snippet.matchAll(/<i3dMapping id="([^"]+)" node="([^"]+)"\/>/g)].map(m => [m[1], m[2]]));
  assert.match(snippet, /<indoorAreas>\s*<indoorArea startNode="indoorAreaStart01" widthNode="indoorAreaWidth01" heightNode="indoorAreaHeight01"\/>\s*<\/indoorAreas>/);
  for (const id of ["indoorAreaStart01", "indoorAreaWidth01", "indoorAreaHeight01"]) assert.equal(resolve(tree, map[id]).node.name, id);
  const at = id => resolve(tree, map[id]).pos;
  const s = at("indoorAreaStart01"), w = at("indoorAreaWidth01"), h = at("indoorAreaHeight01");
  const xs = [s[0], w[0], h[0]], zs = [s[2], w[2], h[2]], { W, D } = geo.dims;
  const near = (a, b) => Math.abs(a - b) < 1e-3;
  assert.ok(near(Math.min(...xs), -W / 2) && near(Math.max(...xs), W / 2) && near(Math.min(...zs), -D / 2) && near(Math.max(...zs), D / 2), "indoor area is the walls' footprint");
  // same convention as the other areas: width along z, height along x
  assert.ok(near(w[0], s[0]) && w[2] > s[2] && near(h[2], s[2]) && h[0] > s[0]);
  assert.match(placeableSnippet(sanitize({ sleepPoint: false })), /indoorArea/, "a house is walked into, sleep point or not");
});

test("i3d: no sleep point when it is turned off", () => {
  const p = sanitize({ sleepPoint: false });
  const xml = buildI3d(p), snippet = placeableSnippet(p);
  assert.doesNotMatch(xml, /sleep|spawnPoint|<Camera/);
  assert.doesNotMatch(snippet, /sleep|farmhouse|spawnPoint/);
  const { G } = buildGeometry(p);
});

/* ---------- Interior: rooms behind the windows, curtains ---------- */
const roomCorners = r => [r.lo, r.hi].flatMap(s => [r.bot, r.top].flatMap(t => [r.d0, r.d1].map(d => WP(r.w, s, t, d))));
const aabb = pts => ({ min: [0, 1, 2].map(k => Math.min(...pts.map(q => q[k]))), max: [0, 1, 2].map(k => Math.max(...pts.map(q => q[k]))) });
const overlap = (a, b) => [0, 1, 2].reduce((v, k) => v * Math.max(0, Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k])), 1);
const inAabb = (q, b, e = 1e-6) => [0, 1, 2].every(k => q[k] >= b.min[k] - e && q[k] <= b.max[k] + e);

test("sanitize: rooms and curtains are on by default", () => {
  const p = sanitize({});
  assert.equal(p.interior, true);
  assert.equal(p.curtainStyle, "sides");
  assert.match(p.curtainColor, /^#[0-9a-f]{6}$/i);
});

const interiorCases = {
  "gable roof, ridge along the front, half floor": { roofType: "gable", ridge: "width", halfStorey: true, winLeft: 2, winRight: 2 },
  "gable roof, ridge front to back, half floor": { roofType: "gable", ridge: "depth", halfStorey: true, winFront: 3 },
  "hip roof": { roofType: "hip", winFront: 4 },
  "flat roof, three floors": { roofType: "flat", floors: 3, winFront: 5 },
  "dormers": { roofType: "gable", halfStorey: true, dormers },
};
for (const [name, settings] of Object.entries(interiorCases)) {
  test(`interior: a room behind every window, inside the house (${name})`, () => {
    const p = sanitize(settings), geo = buildGeometry(p), { rooms, dims } = geo;
    // (the ground floor is walked into: the rooms are behind the windows of the floors above)
    const winOps = Object.values(geo.opsByWall).flatMap(e => e.ops.filter(o => o.kind === "window" && o.t0 >= p.floorHeight));
    assert.equal(rooms.filter(r => !r.dormer).length, winOps.length, "one room per upper-floor window");
    if (p.dormers.length) assert.ok(rooms.some(r => r.dormer), "dormer windows have rooms");
    for (const r of rooms) {
      const o = r.op;
      assert.ok(r.lo <= o.s0 + 1e-9 && r.hi >= o.s1 - 1e-9 && r.bot <= o.t0 + 1e-9 && r.top >= o.t1 - 1e-9, "room smaller than its window");
      assert.ok(r.d0 <= 0 && r.d1 < r.d0 - 0.3, "room not behind the wall");
      assert.ok(r.variant >= 0 && r.variant < 4);
      if (r.dormer) { assert.ok(r.lo >= -1e-9 && r.hi <= r.w.L + 1e-9, "dormer room wider than the dormer"); continue; }
      for (const [x, y, z] of roomCorners(r)) {
        assert.ok(Math.abs(x) <= dims.W / 2 + 1e-6 && Math.abs(z) <= dims.D / 2 + 1e-6, `room corner ${x},${z} outside the walls`);
        const ridgeAlongX = p.roofType === "gable" && p.ridge === "width", ridgeAlongZ = p.roofType === "gable" && p.ridge === "depth";
        const roofAt = ridgeAlongX ? dims.top + (dims.ridgeY - dims.top) * (1 - Math.abs(z) / (dims.D / 2))
          : ridgeAlongZ ? dims.top + (dims.ridgeY - dims.top) * (1 - Math.abs(x) / (dims.W / 2)) : dims.top;
        assert.ok(y <= roofAt + 1e-6, `room corner at ${y} m pokes through the roof (${roofAt} m)`);
        assert.ok(y >= dims.F, "room below the floor");
      }
    }
    const boxes = rooms.map(r => aabb(roomCorners(r)));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++)
      assert.ok(overlap(boxes[i], boxes[j]) < 1e-6, `rooms ${i} and ${j} overlap`);
    // curtains hang inside the rooms, behind the glass
    // (the ground floor's curtains hang in the real room: only the floors above have a pretend one)
    const cur = verts(geo.G.curtain).filter(q => q[1] > dims.F + p.floorHeight - 0.02);
    assert.ok(cur.length > 0, "no curtains");
    for (const q of cur) assert.ok(boxes.some(b => inAabb(q, b)), `curtain point ${q} outside every room`);
    assertMeshValid(geo.G.interior, "interior");
    assertMeshValid(geo.G.curtain, "curtain");
    for (const v of geo.G.interior.uv) assert.ok(v >= 0 && v <= 1, "interior uv outside the atlas");
  });
}

test("interior: rooms behind the windows look different", () => {
  const { rooms } = buildGeometry(sanitize({}));
  assert.ok(new Set(rooms.map(r => r.variant)).size >= 3);
});

test("interior: turning rooms or curtains off removes them", () => {
  // (a farmhouse always has them behind its upper windows; a barn has none)
  const off = buildGeometry(sanitize({ kind: "chicken" }));
  assert.equal(off.rooms.length, 0);
  assert.equal(off.G.interior.i.length, 0);
  assert.equal(off.G.curtain.i.length, 0, "curtains need the rooms behind the glass");
  const bare = buildGeometry(sanitize({ curtainStyle: "none" }));
  assert.ok(bare.G.interior.i.length > 0);
  assert.equal(bare.G.curtain.i.length, 0);
});

/* ---------- Interior: choices per window ---------- */
test("sanitize: curtain style defaults, falls back, and reads old saves", () => {
  assert.equal(sanitize({}).curtainStyle, "sides");
  assert.equal(sanitize({ curtainStyle: "lace" }).curtainStyle, "sides");
  assert.equal(sanitize({ curtainStyle: "cafe" }).curtainStyle, "cafe");
  assert.equal(sanitize({ curtains: false }).curtainStyle, "none", "old saves with curtains off");
  assert.equal("curtains" in sanitize({ curtains: false }), false);
  for (const s of CURTAIN_STYLES) assert.equal(sanitize({ curtainStyle: s }).curtainStyle, s);
});

test("sanitize: each window and kupa keeps its own room and curtains, or falls back", () => {
  const p = sanitize({
    windows: [
      { wall: "front", floor: 0, pos: 0.3, room: "kitchen", curtain: "cafe" },
      { wall: "front", floor: 0, pos: 0.7, room: "garage", curtain: "lace" },
      { wall: "back", floor: 0, pos: 0.5 },
    ],
    dormers: [{ type: "gable", side: 1, pos: 0.5, room: "bedroom", curtain: "valance" }, { type: "shed", side: -1, pos: 0.5 }],
  });
  assert.deepEqual(p.windows.filter(w => w.type !== "door").map(w => [w.room, w.curtain]), [["kitchen", "cafe"], ["auto", "default"], ["auto", "default"]]);
  assert.deepEqual(p.dormers.map(d => [d.room, d.curtain]), [["bedroom", "valance"], ["auto", "default"]]);
  assert.ok(sanitize({}).windows.every(w => w.room === "auto" && w.curtain === "default"), "generated windows");
});

// Splits the curtain mesh by room, as local [s, t] points on the room's wall.
function curtainsByRoom(geo) {
  const boxes = geo.rooms.map(r => aabb(roomCorners(r)));
  const out = geo.rooms.map(() => []);
  for (const q of verts(geo.G.curtain)) {
    const i = boxes.findIndex(b => inAabb(q, b));
    const { w } = geo.rooms[i];
    out[i].push([(q[0] - w.o[0]) * w.u[0] + (q[2] - w.o[2]) * w.u[2], q[1] - w.o[1]]);
  }
  return out;
}
const fourWindows = curtain => ({
  winFront: 0, winBack: 0, winLeft: 0, winRight: 0,
  windows: ["sides", "panels", "valance", "cafe", "none"].map((c, i) => ({ wall: "back", floor: 1, pos: 0.1 + i * 0.2, w: 1, h: 1.3, curtain: c })),
  curtainStyle: curtain,
});

test("interior: each curtain layout hangs where it should", () => {
  const geo = buildGeometry(sanitize(fourWindows("sides")));
  const by = curtainsByRoom(geo);
  const layout = {};
  geo.rooms.forEach((r, i) => {
    const o = r.op, mid = (o.s0 + o.s1) / 2, h = o.t1 - o.t0, pts = by[i];
    layout[r.curtain] = {
      count: pts.length,
      // something hangs in the middle of the window, low down (a cafe curtain)
      lowMiddle: pts.some(([s, t]) => Math.abs(s - mid) < 0.05 && t < o.t0 + h * 0.5),
      // something hangs at the sides, half way up (side panels)
      sides: pts.some(([s, t]) => s < o.s0 + 0.15 && t <= o.t0 + h * 0.5) && pts.some(([s, t]) => s > o.s1 - 0.15 && t <= o.t0 + h * 0.5),
      // something spans the top (a valance)
      top: pts.some(([s, t]) => Math.abs(s - mid) < 0.05 && t > o.t1 - 0.05),
      // the view in the middle of the window is free
      clearMiddle: !pts.some(([s, t]) => Math.abs(s - mid) < 0.05 && t > o.t0 + h * 0.5 && t < o.t1 - h * 0.25),
    };
  });
  assert.deepEqual(Object.keys(layout).sort(), ["cafe", "none", "panels", "sides", "valance"]);
  assert.equal(layout.none.count, 0);
  assert.deepEqual(layout.sides, { ...layout.sides, sides: true, top: true, lowMiddle: false, clearMiddle: true });
  assert.deepEqual(layout.panels, { ...layout.panels, sides: true, top: false, lowMiddle: false, clearMiddle: true });
  assert.deepEqual(layout.valance, { ...layout.valance, sides: false, top: true, lowMiddle: false, clearMiddle: true });
  assert.deepEqual(layout.cafe, { ...layout.cafe, top: true, lowMiddle: true, clearMiddle: true });
});

test("interior: windows on the house default follow the house's curtain style", () => {
  const p = sanitize({ curtainStyle: "valance" });
  const { rooms } = buildGeometry(p);
  assert.ok(rooms.length > 0 && rooms.every(r => r.curtain === "valance"));
  const first = p.windows.findIndex(w => w.type !== "door" && w.floor === 1), q = sanitize({ ...p, windows: p.windows.map((w, i) => i !== first ? w : { ...w, curtain: "cafe" }) });
  const r2 = buildGeometry(q).rooms;
  assert.equal(r2.find(r => r.op.id === q.windows[first].id).curtain, "cafe");
  assert.ok(r2.filter(r => r.op.id !== q.windows[first].id).every(r => r.curtain === "valance"));
});

test("sanitize: windows and kupor keep their own curtain color, or follow the house", () => {
  const p = sanitize({
    windows: [{ wall: "front", pos: 0.3, curtainColor: "#AA2233" }, { wall: "front", pos: 0.7, curtainColor: "red" }, { wall: "back" }],
    dormers: [{ type: "gable", side: 1, curtainColor: "#112233" }, { type: "shed", side: -1, curtainColor: 5 }],
  });
  assert.deepEqual(p.windows.filter(w => w.type !== "door").map(w => w.curtainColor), ["#AA2233", "default", "default"]);
  assert.deepEqual(p.dormers.map(d => d.curtainColor), ["#112233", "default"]);
  assert.ok(sanitize({}).windows.every(w => w.curtainColor === "default"), "generated windows");
});

const hexOf = (c, i) => "#" + [0, 1, 2].map(k => Math.round(c[i*3+k] * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
test("interior: each window's curtains get its own color, the rest the house color", () => {
  const p = sanitize({ curtainColor: "#EEEEEE", halfStorey: true, dormers: [{ type: "gable", side: 1, pos: 0.5, curtainColor: "#2244AA" }] });
  p.windows[0].curtainColor = "#AA2233";
  const geo = buildGeometry(p), g = geo.G.curtain;
  assert.equal(g.c.length, g.p.length, "one color per curtain vertex");
  const boxes = geo.rooms.map(r => aabb(roomCorners(r)));
  for (let i = 0; i < g.p.length / 3; i++) {
    const at = boxes.findIndex(b => inAabb([g.p[i*3], g.p[i*3+1], g.p[i*3+2]], b));
    if (at < 0) { assert.ok(g.p[i*3+1] < p.foundation + p.floorHeight, "outside every room only on the ground floor"); continue; }
    const r = geo.rooms[at];
    const want = r.dormer ? "#2244AA" : r.op.id === p.windows[0].id ? "#AA2233" : "#EEEEEE";
    assert.equal(hexOf(g.c, i), want);
    assert.equal(r.curtainColor, want);
  }
});

test("i3d: one curtain shape and material per curtain color", () => {
  const p = sanitize({ curtainColor: "#EEEEEE" });
  const up = p.windows.filter(w => w.floor === 1);
  up[0].curtainColor = "#AA2233"; up[1].curtainColor = "#2244AA"; up[2].curtainColor = "#AA2233";
  const xml = buildI3d(p);
  const shapes = [...xml.matchAll(/<Shape name="(curtain\d*)"[^>]*materialIds="(\d+)"/g)].map(m => [m[1], m[2]]);
  assert.equal(shapes.length, 3);
  assert.equal(new Set(shapes.map(s => s[0])).size, 3, "shape names are unique");
  const colorOf = id => xml.match(new RegExp(`<Material name="[^"]+" materialId="${id}" diffuseColor="([^"]+)"`))[1];
  assert.deepEqual(shapes.map(s => colorOf(s[1])).sort(), ["#2244AA", "#AA2233", "#EEEEEE"].map(rgb).sort());
  // every shape in the scene points at a shape that exists
  const ids = new Set([...xml.matchAll(/<IndexedTriangleSet name="[^"]+" shapeId="(\d+)"/g)].map(m => m[1]));
  for (const m of xml.matchAll(/<Shape [^>]*shapeId="(\d+)"/g)) assert.ok(ids.has(m[1]), `shape ${m[1]} missing`);
  const mats = new Set([...xml.matchAll(/<Material name="[^"]+" materialId="(\d+)"/g)].map(m => m[1]));
  for (const m of xml.matchAll(/<Shape [^>]*materialIds="(\d+)"/g)) assert.ok(mats.has(m[1]), `material ${m[1]} missing`);
});

test("interior: a window or kupa can choose its room", () => {
  const p = sanitize({ halfStorey: true, dormers: [{ type: "gable", side: 1, pos: 0.5, room: "kitchen" }] });
  p.windows.forEach((w, i) => w.room = ROOM_TYPES[i % 4]);
  const { rooms } = buildGeometry(p);
  for (const r of rooms) {
    if (r.dormer) { assert.equal(ROOM_TYPES[r.variant], "kitchen"); continue; }
    assert.equal(ROOM_TYPES[r.variant], p.windows.find(w => w.id === r.op.id).room);
  }
  assert.deepEqual(ROOM_TYPES, ["living", "bedroom", "kitchen", "study"]);
});

test("i3d: see-through glass and textured rooms when the interior is on", () => {
  const xml = buildI3d(sanitize({}), { withTex: true });
  assert.match(xml, /<Material name="glass_mat"[^>]*alphaBlending="true"/);
  assert.match(xml, /filename="textures\/glass_diffuse.png"/);
  assert.match(xml, /filename="textures\/interior_diffuse.png"/);
  assert.match(xml, /<Shape name="glass"[^>]*castsShadows="false"/);
  const plain = buildI3d(sanitize({}), { withTex: false });
  assert.match(plain, /<Material name="glass_mat"[^>]*diffuseColor="[\d.]+ [\d.]+ [\d.]+ 0\.\d+"[^>]*alphaBlending="true"/);
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

test("opening counts: windows and doors are counted apart, per wall and floor", async () => {
  const { openingCounts } = await import("../src/editor/model.mjs");
  const p = sanitize({ floors: 2, windows: [
    { wall: "right", floor: 0, pos: 0.2, type: "door", w: 1, h: 2.1 }, { wall: "right", floor: 0, pos: 0.5, type: "door", w: 1, h: 2.1 },
    { wall: "right", floor: 0, pos: 0.8, type: "window", w: 1, h: 1.2, sill: 0.9 }, { wall: "right", floor: 1, pos: 0.5, type: "window", w: 1, h: 1.2, sill: 0.9 },
    { wall: "front", floor: 1, pos: 0.5, type: "window", w: 1, h: 1.2, sill: 0.9 }] });
  const c = openingCounts(p);
  assert.deepEqual(c.right[0], { windows: 1, doors: 2 });
  assert.deepEqual(c.right[1], { windows: 1, doors: 0 });
  assert.deepEqual(c.front[1], { windows: 1, doors: 0 });
  assert.deepEqual(c.back[0], { windows: 0, doors: 0 });
});

test("the table steps windows and doors together: + adds an opening, - takes one away, a building keeps a door", async () => {
  const { stepOpenings, openingCounts } = await import("../src/editor/model.mjs");
  const p = sanitize({ width: 12, depth: 8, windows: [{ wall: "front", floor: 0, pos: 0.5, type: "door", w: 1.4, h: 2.3 }, { wall: "front", floor: 0, pos: 0.2, type: "window", w: 1, h: 1.2, sill: 0.9 }] });
  const total = (q, wall, f) => { const c = openingCounts(q)[wall][f]; return c.windows + c.doors; };
  assert.equal(total(p, "front", 0), 2);
  const more = sanitize({ ...p, windows: stepOpenings(p, p.windows, "front", 0, 1) });
  assert.equal(total(more, "front", 0), 3);
  assert.equal(openingCounts(more).front[0].doors, 1, "the door stays");
  const less = sanitize({ ...p, windows: stepOpenings(more, more.windows, "front", 0, -1) });
  assert.equal(total(less, "front", 0), 2);
  const onlyDoor = sanitize({ ...p, windows: p.windows.filter(w => w.type === "door") });
  assert.equal(stepOpenings(onlyDoor, onlyDoor.windows, "front", 0, -1), null, "the only door stays");
  const two = sanitize({ ...p, windows: [...p.windows.filter(w => w.type === "door"), { wall: "back", floor: 0, pos: 0.5, type: "door", w: 1, h: 2.1 }] });
  assert.equal(openingCounts(sanitize({ ...two, windows: stepOpenings(two, two.windows, "back", 0, -1) })).back[0].doors, 0, "with doors left on another wall a door can go");
  let q = p; for (let i = 0; i < 12; i++) { const n = stepOpenings(q, q.windows, "back", 0, 1); if (n) q = sanitize({ ...q, windows: n }); }
  assert.ok(total(q, "back", 0) <= 8, "at most 8 in a cell");
});

test("new windows keep out of a wing: not on the stretch of the wall it stands against (only where it covers that floor)", () => {
  const p = sanitize({ width: 14, depth: 8, floors: 2, wings: [{ wall: "back", pos: 0.5, width: 5, depth: 5, floors: 1 }], windows: [{ wall: "front", floor: 0, pos: 0.5, type: "door", w: 1, h: 2.1 }] });
  const wg = buildGeometry(p).wings[0];
  const spots = (floor, n) => genRow(p, p.windows, "back", floor, n).filter(w => w.wall === "back" && w.floor === floor).map(w => w.pos * 14);
  for (const n of [1, 2, 3, 4, 5]) for (const s of spots(0, n)) assert.ok(s < wg.s0 - 0.2 || s > wg.s1 + 0.2, `floor 0, ${n}: window at ${s.toFixed(2)} in the wing's ${wg.s0.toFixed(1)}-${wg.s1.toFixed(1)}`);
  assert.equal(spots(0, 4).length, 4);
  // the floor above the wing's roof is free along the whole wall
  assert.ok(spots(1, 3).some(s => s > wg.s0 && s < wg.s1), "upper floor: the middle is free");
});
