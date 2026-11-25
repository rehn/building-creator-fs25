import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULTS, SCHEMA, FIELD, PRESETS, sanitize, buildGeometry, buildI3d, placeableXml, placeableSnippet,
  placementAreas, henCap, defaultModDescription, HENS_PER_M2, MAX_HENS
  , KIND } from "../src/editor/model.mjs";
import { roomOf, problems, snapItem } from "../src/editor/layout.mjs";

// Scene tree of an i3d, enough to resolve "0>6|2|0" mapping paths (same as model.test.mjs).
function sceneTree(xml) {
  const scene = xml.slice(xml.indexOf("<Scene>"), xml.indexOf("</Scene>"));
  const root = { children: [] }, stack = [root];
  for (const m of scene.matchAll(/<(\/?)(TransformGroup|Shape|Camera)\b([^>]*?)(\/?)>/g)) {
    if (m[1]) { stack.pop(); continue; }
    const attr = k => (m[3].match(new RegExp(`\\b${k}="([^"]*)"`)) || [])[1];
    const node = { name: attr("name"), translation: (attr("translation") || "0 0 0").split(" ").map(Number), attrs: m[3], children: [] };
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
    assert.ok(node, `no node at ${path}`);
    pos = pos.map((v, k) => v + node.translation[k]);
  }
  return { node, pos };
}
const mappings = xml => Object.fromEntries([...xml.matchAll(/<i3dMapping id="([^"]+)" node="([^"]+)"\/>/g)].map(m => [m[1], m[2]]));
const near = (a, b, what, eps = 1e-3) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < eps, `${what}: ${a} vs ${b}`));
const hen = (o = {}) => sanitize({ kind: "chicken", width: 8, depth: 5, hens: 60, ...o });

/* ---------- Settings ---------- */
test("sanitize: old saves without a kind are houses", () => {
  assert.equal(sanitize({}).kind, "house");
  assert.equal(sanitize({ kind: "spaceship" }).kind, "house");
  assert.equal(sanitize({ kind: "chicken" }).kind, "chicken");
});


test("henCap: room for 2.5 hens per square metre, at most 360", () => {
  assert.equal(HENS_PER_M2, 2.5);
  assert.equal(MAX_HENS, 360);
  assert.equal(henCap({ width: 4, depth: 3 }), 30);
  assert.equal(henCap({ width: 30, depth: 25 }), 360);
});



/* ---------- Presets ---------- */


/* ---------- Yard layout ---------- */
const OPP = { front: "back", back: "front", left: "right", right: "left" };








/* ---------- Placeable XML ---------- */




/* ---------- i3d nodes ---------- */



/* ---------- Warning stripes ---------- */


/* ---------- Walk-in shell and door ---------- */
// Does the segment a-b cross any triangle of mesh g? (Möller–Trumbore.)
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
const chickenPresets = () => PRESETS.filter(x => x.settings.kind === "chicken").map(x => [x.id, sanitize(x.settings)]);
const doorMid = (geo, p) => { const { w, ops } = geo.opsByWall[firstDoorWall(p)], o = ops.find(q => q.kind === "door"); return { w, o, s: (o.s0 + o.s1) / 2 }; };
const wp = (w, s, y, d) => [w.o[0] + w.u[0]*s + w.n[0]*d, y, w.o[2] + w.u[2]*s + w.n[2]*d];

test("shell: a chicken barn's walls have an inside face; a house's don't", () => {
  const inside = p => {
    // inside faces are whitewashed fittings in a chicken barn; a house could only have them as walls
    const geo = buildGeometry(p), g = p.kind === "chicken" ? geo.G.fittings : geo.G.walls, z = geo.dims.D / 2 - 0.15;
    let n = 0;
    for (let k = 0; k < g.p.length; k += 3) if (Math.abs(g.p[k+2] - z) < 1e-6 && g.n[k+2] < -0.99) n++;
    return n;
  };
  assert.ok(inside(hen({ doorWall: "front" })) > 0, "chicken barn");
  assert.equal(inside(sanitize({ doorWall: "front" })), 0, "house");
});


// i3d "0 a 0" rotation about the hinge (right-handed about +y).
const turn = (q, h, deg) => {
  const r = deg * Math.PI / 180, x = q[0] - h[0], z = q[2] - h[2];
  return [h[0] + x * Math.cos(r) + z * Math.sin(r), q[1], h[2] - x * Math.sin(r) + z * Math.cos(r)];
};
/** A door leaf's vertices in G.door, closed. */
const leafPts = (geo, leaf) => { const [a, b] = leaf.parts.door, out = []; for (let k = a; k < b; k++) out.push(geo.G.door.p.slice(k * 3, k * 3 + 3)); return out; };
test("door: a chicken barn's door leaf swings outward about its hinge", () => {
  for (const doorWall of ["front", "back", "left", "right"]) {
    const p = hen({ doorWall, doorW: 1.2 }), geo = buildGeometry(p), { w } = doorMid(geo, p);
    assert.equal(geo.doors.length, 1);
    assert.equal(geo.doors[0].leaves.length, 1, "a 1.2 m door is one leaf");
    const leaf = geo.doors[0].leaves[0];
    const out = q => (q[0] - w.o[0]) * w.n[0] + (q[2] - w.o[2]) * w.n[2];
    const pts = leafPts(geo, leaf), open = pts.map(q => turn(q, leaf.hinge, leaf.motion.rotation));
    const mid = a => a.reduce((s, q) => s + out(q), 0) / a.length;
    assert.ok(mid(open) > 0.4, `${doorWall}: leaf only ${mid(open).toFixed(2)} m out when open`);
    assert.ok(Math.min(...open.map(out)) >= Math.min(...pts.map(out)) - 1e-6, `${doorWall}: swings into the barn`);
  }
});

test("mod: the door opens and closes with the game's door prompt", () => {
  const p = hen({ doorW: 1.2 }), xml = placeableXml(p, "x"), i3d = buildI3d(p), geo = buildGeometry(p);
  assert.match(xml, /<animatedObject saveId="door1">/);
  assert.match(xml, /<part node="door1Leaf1">\s*<keyFrame time="0" rotation="0 0 0"\/>\s*<keyFrame time="1" rotation="0 -100 0"\/>/);
  assert.match(xml, /<controls triggerNode="door1Trigger" posAction="ACTIVATE_HANDTOOL" posText="action_openDoor" negText="action_closeDoor"\/>/);
  assert.match(xml, /template="woodDoorOpen"/);
  const map = mappings(xml), tree = sceneTree(i3d);
  const door = resolve(tree, map.door1Leaf1), leaf = geo.doors[0].leaves[0];
  near(door.pos, leaf.hinge, "door at its hinge");
  const coll = door.node.children.find(c => /name="door1Leaf1Collision"/.test(c.attrs));
  assert.ok(coll, "the leaf's collision moves with it");
  assert.match(coll.attrs, /kinematic="true"/);
  assert.match(coll.attrs, /collisionFilterGroup="0x1034"/);
  const trig = resolve(tree, map.door1Trigger).node.attrs;
  assert.match(trig, /trigger="true"/);
  assert.match(trig, /collisionFilterMask="0x110000"/);
  // the leaf's mesh is relative to the hinge: first vertex + hinge = the closed door's first vertex
  const mesh = door.node.children.find(c => /name="door1Leaf1Door"/.test(c.attrs));
  const sid = mesh.attrs.match(/shapeId="(\d+)"/)[1];
  const set = i3d.match(new RegExp(`<IndexedTriangleSet name="[^"]*" shapeId="${sid}"[^>]*>[\\s\\S]*?<v p="([^"]+)"`));
  near(set[1].split(" ").map(Number).map((v, k) => v + leaf.hinge[k]), geo.G.door.p.slice(leaf.parts.door[0] * 3, leaf.parts.door[0] * 3 + 3), "door mesh");
  assert.match(buildI3d(sanitize({})) + placeableXml(sanitize({}), "x"), /door1Leaf1[\s\S]*animatedObject/, "a house's door opens too");
});

test("door: a wide door is a pair of leaves, hinged at either side, both swinging out", () => {
  for (const doorWall of ["front", "back", "left", "right"]) {
    const p = hen({ doorWall, doorW: 2.4 }), geo = buildGeometry(p), { w, o } = doorMid(geo, p), leaves = geo.doors[0].leaves;
    assert.equal(leaves.length, 2, doorWall);
    const along = q => (q[0] - w.o[0]) * w.u[0] + (q[2] - w.o[2]) * w.u[2], out = q => (q[0] - w.o[0]) * w.n[0] + (q[2] - w.o[2]) * w.n[2];
    assert.ok(Math.abs(along(leaves[0].hinge) - o.s0) < 0.03 && Math.abs(along(leaves[1].hinge) - o.s1) < 0.03, `${doorWall}: hinges`);
    assert.equal(leaves[0].motion.rotation, -leaves[1].motion.rotation);
    for (const leaf of leaves) {
      const mine = leafPts(geo, leaf), s = mine.map(along);
      assert.ok(Math.max(...s) - Math.min(...s) < (o.s1 - o.s0) / 2 + 0.05, `${doorWall}: leaf ${(Math.max(...s) - Math.min(...s)).toFixed(2)} m wide`);
      const open = mine.map(q => turn(q, leaf.hinge, leaf.motion.rotation));
      assert.ok(open.reduce((a, q) => a + out(q), 0) / open.length > 0.4, `${doorWall}: leaf not out when open`);
      assert.ok(Math.min(...open.map(out)) >= Math.min(...mine.map(out)) - 1e-6, `${doorWall}: swings into the barn`);
    }
  }
});

test("mod: a pair of doors opens together, each leaf about its own hinge", () => {
  const p = hen({ doorW: 2.4 }), xml = placeableXml(p, "x"), i3d = buildI3d(p), geo = buildGeometry(p);
  assert.equal((xml.match(/<animatedObject /g) || []).length, 1);
  assert.match(xml, /<part node="door1Leaf1">\s*<keyFrame time="0" rotation="0 0 0"\/>\s*<keyFrame time="1" rotation="0 -100 0"\/>/);
  assert.match(xml, /<part node="door1Leaf2">\s*<keyFrame time="0" rotation="0 0 0"\/>\s*<keyFrame time="1" rotation="0 100 0"\/>/);
  const map = mappings(xml), tree = sceneTree(i3d);
  geo.doors[0].leaves.forEach((leaf, k) => near(resolve(tree, map[`door1Leaf${k + 1}`]).pos, leaf.hinge, `leaf ${k + 1} at its hinge`));
  assert.doesNotMatch(placeableXml(hen({ doorW: 1.2 }), "x"), /door1Leaf2/, "a narrow door is one leaf");
});

test("a wide house door is a pair of leaves too (closed)", () => {
  const leaves = p => {
    const geo = buildGeometry(p), { w, ops } = geo.opsByWall[firstDoorWall(p)], o = ops.find(q => q.kind === "door"), mid = (o.s0 + o.s1) / 2;
    let n = 0;
    for (let k = 0; k < geo.G.door.p.length; k += 3) { const q = geo.G.door.p.slice(k, k + 3), s = (q[0] - w.o[0]) * w.u[0] + (q[2] - w.o[2]) * w.u[2]; if (Math.abs(Math.abs(s - mid) - 0.005) < 1e-6) n++; }
    return n;
  };
  assert.ok(leaves(sanitize({ doorW: 2 })) > 0, "two leaves meet in the middle");
  assert.equal(leaves(sanitize({ doorW: 1 })), 0);
});

/* ---------- Windows and coop interior ---------- */
test("i3d: a walk-in barn's windows are see-through", () => {
  const i3d = buildI3d(hen()), glass = i3d.match(/<Material name="glass_mat"[^>]*>/)[0];
  assert.match(glass, /alphaBlending="true"/);
  assert.match(buildI3d(hen(), { withTex: true }), /<Material name="glass_mat"[^>]*alphaBlending="true"/);
});

test("coop: filling automatically picks a style that follows the barn's size", () => {
  const style = id => KIND.chicken.autoFurnish(sanitize(PRESETS.find(x => x.id === id).settings)).style;
  assert.equal(style("gardenCoop"), "backyard");
  assert.equal(style("longHenHouse"), "floor");
  assert.equal(style("poultryBarn"), "commercial");
  assert.ok(sanitize({}).items.length > 0, "houses are furnished too");
});

test("coop: every preset starts furnished, with every piece where it may be", () => {
  for (const [id, p] of chickenPresets()) {
    assert.ok(p.items.length >= 4, `${id}: ${p.items.length} pieces`);
    const pr = problems(p.items, KIND.chicken.catalog, roomOf(p));
    assert.deepEqual([...pr].map(([i, m]) => `${p.items.find(x => x.id === i).type}: ${m}`), [], id);
  }
});

test("coop: every kind of piece can be dropped into an empty barn and snaps to a good place", () => {
  const p = hen({ width: 10, depth: 8, items: [] }), room = roomOf(p);
  for (const [type, def] of Object.entries(KIND.chicken.catalog)) {
    assert.ok(def.name && ["wall", "floor"].includes(def.mount), type);
    const it = snapItem({ id: 1, type, x: -2.2, z: -1.4, rot: 0, ...def.defaults }, def, room);
    assert.equal(problems([it], KIND.chicken.catalog, room).size, 0, `${type} after snapping`);
    const g = buildGeometry({ ...p, items: [it] }).G.fittings;
    assert.ok(g.i.length > buildGeometry(p).G.fittings.i.length, `${type} draws something`);
  }
});

test("coop: the inside is built from the pieces, where they are", () => {
  const p = hen({ width: 8, depth: 6, items: [] });
  // pieces are drawn after the walls and floor, so their vertices come after the empty barn's
  const base = buildGeometry(p).G.fittings.p.length;
  const at = x => { const g = buildGeometry({ ...p, items: [{ id: 1, type: "bale", x, z: 0, rot: 0 }] }).G.fittings, xs = [];
    for (let k = base; k < g.p.length; k += 3) xs.push(g.p[k]); return xs; };
  const a = at(-1), b = at(1.5);
  assert.ok(Math.abs(Math.min(...b) - Math.min(...a) - 2.5) < 1e-6, "moved 2.5 m");
  // a piece left outside the walls (the barn was made smaller) isn't built
  assert.deepEqual(at(30), [], "outside: nothing built");
  // pieces with collision stop you; hanging feeders don't
  const col = items => buildGeometry({ ...p, items }).collision.i.length;
  assert.ok(col([{ id: 1, type: "bale", x: 0, z: 0, rot: 0 }]) > col([]), "bale");
  assert.equal(col([{ id: 1, type: "feeder", x: 0, z: 0, rot: 0 }]), col([]), "feeder");
});

test("coop: pieces survive saving and loading", () => {
  const p = sanitize(PRESETS.find(x => x.id === "longHenHouse").settings);
  const back = sanitize(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(back.items, p.items);
  // an empty list stays empty: the user cleared it
  assert.deepEqual(sanitize({ ...p, items: [] }).items, []);
});


test("coop: everything is inside the walls, on or above the floor, and the doorway is clear", () => {
  for (const [id, p0] of chickenPresets()) { const p = { ...p0, insideSame: false };   // (studs and the backs of boards sit in the wall's thickness)
    const geo = buildGeometry(p), g = geo.G.fittings, { W, D, ridgeY } = geo.dims, F = p.foundation, t = 0.15;
    for (let k = 0; k < g.p.length; k += 3) {
      const [x, y, z] = g.p.slice(k, k + 3);
      if (g.s[k / 3] === "boards" && g.n[k + 1] < -0.3) continue;   // the roof boards run out under the eaves
      assert.ok(Math.abs(x) <= W / 2 - t + 1e-6 && Math.abs(z) <= D / 2 - t + 1e-6, `${id}: ${x},${z} outside the room`);
      assert.ok(y >= F - 1e-6 && y <= ridgeY, `${id}: height ${y}`);
    }
    // nothing within 1 m inside the door, across the door's width, up to its top (the roof frame is above)
    const { w, o } = doorMid(geo, p);
    for (let k = 0; k < g.p.length; k += 3) {
      const q = g.p.slice(k, k + 3), s = (q[0] - w.o[0]) * w.u[0] + (q[2] - w.o[2]) * w.u[2], d = (q[0] - w.o[0]) * w.n[0] + (q[2] - w.o[2]) * w.n[2];
      // (boards flat against the wall, like the kickboard beside the door, don't block it)
      if (q[1] > F + 0.03 && q[1] < F + o.t1 && d > -1.15 && d < -t - 0.03) assert.ok(s < o.s0 - 0.3 || s > o.s1 + 0.3, `${id}: ${q} in the doorway`);
    }
  }
});

test("i3d: coop fittings export as plain colored parts", () => {
  const i3d = buildI3d(sanitize(PRESETS.find(x => x.id === "longHenHouse").settings));
  const fit = [...i3d.matchAll(/<Material name="(fittings\d*)_mat" materialId="\d+" diffuseColor="[^"]+"\/>/g)];
  assert.ok(fit.length >= 4, `${fit.length} fitting colors`);
  assert.match(i3d, /<Shape name="fittings"/);
});

/* ---------- Canopy, pasture side and hen hatch ---------- */
/** Whether point q is in a door of the walls (its leaf and the details on its inside face are part of the door, not leaks from the outside). */
function atDoor(geo, q) {
  return Object.values(geo.opsByWall).some(({w, ops}) => ops.some(o => {
    if (o.kind !== "door") return false;
    const v = [q[0] - w.o[0], q[1] - w.o[1], q[2] - w.o[2]], s = v[0] * w.u[0] + v[2] * w.u[2], d = v[0] * w.n[0] + v[2] * w.n[2];
    return d > -0.25 && d < 0.02 && s > o.s0 - 0.05 && s < o.s1 + 0.05 && v[1] > -0.05 && v[1] < o.t1 + 0.05;
  }));
}

test("shell: an entrance canopy stays out of a walk-in barn's room", () => {
  for (const entrance of ["gable", "shed", "porch"]) for (const doorWall of ["front", "left"]) {
    // one floor, so the canopy reaches up to the eaves (as in the screenshot)
    const p = hen({ width: 6, depth: 5, entrance, doorWall, pastureWall: OPP[doorWall], roofPitch: 35, floors: 1, floorHeight: 2.6, foundation: 0.2 });
    const geo = buildGeometry(p), { W, D, top } = geo.dims, F = p.foundation, t = 0.15;
    for (const m of ["roof", "trim", "walls", "gutter"]) {
      const g = geo.G[m];
      for (let k = 0; k < g.p.length; k += 3) {
        const [x, y, z] = g.p.slice(k, k + 3);
        const inside = Math.abs(x) < W / 2 - t - 0.01 && Math.abs(z) < D / 2 - t - 0.01 && y > F + 0.01 && y < top - 0.01;
        assert.ok(!inside || atDoor(geo, [x, y, z]), `${entrance} canopy on ${doorWall}: ${m} at ${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)} inside the room`);
      }
    }
    // nor its collision: you can stand inside the door
    const { w, s } = doorMid(geo, p);
    assert.ok(!hits(geo.collision, wp(w, s, F + 0.2, -0.6), wp(w, s, F + 2.0, -0.6)), `${entrance}: collision over the doorway inside`);
  }
});







test("i3d: a house still has no chicken nodes", () => {
  const xml = buildI3d(sanitize({}));
  assert.doesNotMatch(xml, /exactFillRootNodeFood|navigationRootNode|fence1Node/);
  assert.equal(DEFAULTS.kind, "house");
});

/** The wall of the building's first door. */
function firstDoorWall(p) { return p.windows.find(w => w.type === "door" && w.floor === 0).wall; }
