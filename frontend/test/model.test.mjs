import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, sanitize, buildGeometry, buildI3d, serialize, MATS, placementAreas, placeableSnippet, sleepPoint, boxMesh, WP, ROOM_TYPES, CURTAIN_STYLES, rgb } from "../src/editor/model.mjs";

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
  assert.ok(level.z1 > geo.dims.D / 2 + p.entranceDepth, "porch not inside the level area");
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
  assert.equal((xml.match(/<IndexedTriangleSet /g) || []).length, used + 2, "materials + collision + sleep trigger");
  assert.equal((xml.match(/<Material /g) || []).length, used + 1);
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

test("sanitize: the sleep point is on by default and can be turned off", () => {
  assert.equal(sanitize({}).sleepPoint, true);
  assert.equal(sanitize({ sleepPoint: false }).sleepPoint, false);
});

for (const doorWall of ["front", "back", "left", "right"]) {
  test(`sleep point: trigger, icon, spawn and camera for a door on the ${doorWall} wall`, () => {
    const p = sanitize({ doorWall, doorPos: 0.4, foundation: 0.6, entrance: "porch" });
    const geo = buildGeometry(p), sp = sleepPoint(geo);
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
  const sp = sleepPoint(buildGeometry(p));
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
  assert.doesNotMatch(placeableSnippet(sanitize({ sleepPoint: false })), /indoorArea/);
});

test("i3d: no sleep point when it is turned off", () => {
  const p = sanitize({ sleepPoint: false });
  const xml = buildI3d(p), snippet = placeableSnippet(p);
  assert.doesNotMatch(xml, /sleep|spawnPoint|<Camera/);
  assert.doesNotMatch(snippet, /sleep|farmhouse|spawnPoint/);
  const { G } = buildGeometry(p);
  assert.equal((xml.match(/<IndexedTriangleSet /g) || []).length, MATS.filter(m => G[m].i.length).length + 1);
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
    const winOps = Object.values(geo.opsByWall).flatMap(e => e.ops.filter(o => o.kind === "window"));
    assert.equal(rooms.filter(r => !r.dormer).length, winOps.length, "one room per wall window");
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
    const cur = verts(geo.G.curtain);
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
  const off = buildGeometry(sanitize({ interior: false }));
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
  assert.deepEqual(p.windows.map(w => [w.room, w.curtain]), [["kitchen", "cafe"], ["auto", "default"], ["auto", "default"]]);
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
  windows: ["sides", "panels", "valance", "cafe", "none"].map((c, i) => ({ wall: "back", floor: 0, pos: 0.1 + i * 0.2, w: 1, h: 1.3, curtain: c })),
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
  const q = sanitize({ ...p, windows: p.windows.map((w, i) => i ? w : { ...w, curtain: "cafe" }) });
  const r2 = buildGeometry(q).rooms;
  assert.equal(r2.find(r => r.op.id === q.windows[0].id).curtain, "cafe");
  assert.ok(r2.filter(r => r.op.id !== q.windows[0].id).every(r => r.curtain === "valance"));
});

test("sanitize: windows and kupor keep their own curtain color, or follow the house", () => {
  const p = sanitize({
    windows: [{ wall: "front", pos: 0.3, curtainColor: "#AA2233" }, { wall: "front", pos: 0.7, curtainColor: "red" }, { wall: "back" }],
    dormers: [{ type: "gable", side: 1, curtainColor: "#112233" }, { type: "shed", side: -1, curtainColor: 5 }],
  });
  assert.deepEqual(p.windows.map(w => w.curtainColor), ["#AA2233", "default", "default"]);
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
    const r = geo.rooms[boxes.findIndex(b => inAabb([g.p[i*3], g.p[i*3+1], g.p[i*3+2]], b))];
    const want = r.dormer ? "#2244AA" : r.op.id === p.windows[0].id ? "#AA2233" : "#EEEEEE";
    assert.equal(hexOf(g.c, i), want);
    assert.equal(r.curtainColor, want);
  }
});

test("i3d: one curtain shape and material per curtain color", () => {
  const p = sanitize({ curtainColor: "#EEEEEE" });
  p.windows[0].curtainColor = "#AA2233"; p.windows[1].curtainColor = "#2244AA"; p.windows[2].curtainColor = "#AA2233";
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
  assert.doesNotMatch(buildI3d(sanitize({ interior: false })), /alphaBlending/);
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
