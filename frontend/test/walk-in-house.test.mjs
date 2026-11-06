// Every building can be walked into (plan step 3): the farmhouse's ground floor too, with a floor, inside
// walls, a ceiling (the floors above are closed from inside) and furniture; any door can open or not.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, buildI3d, SCHEMA, KIND, PRESETS } from "../src/editor/model.mjs";
import { roomOf } from "../src/editor/layout.mjs";

const verts = g => { const out = []; for (let i = 0; i < g.p.length; i += 3) out.push([g.p[i], g.p[i + 1], g.p[i + 2]]); return out; };
const tris = g => { const out = []; for (let t = 0; t < g.i.length; t += 3) { const v = [0, 1, 2].map(k => g.i[t + k]); out.push({pts: v.map(k => [g.p[k * 3], g.p[k * 3 + 1], g.p[k * 3 + 2]]), n: [g.n[v[0] * 3], g.n[v[0] * 3 + 1], g.n[v[0] * 3 + 2]]}); } return out; };

test("walk-in house: the farmhouse is walked into, with furniture to start with", () => {
  assert.ok(KIND.house.walkIn && KIND.house.catalog);
  const inside = SCHEMA.find(g => g.title === "Inside");
  assert.ok(!inside.kinds || inside.kinds.includes("house"), "the Inside section shows for houses");
  const p = sanitize({});
  const types = new Set(p.items.map(i => i.type));
  for (const t of ["kitchen", "stove", "table", "chair"]) assert.ok(types.has(t), t);
  assert.ok(p.items.every(i => KIND.house.catalog[i.type]));
});

test("walk-in house: a floor, inside walls and a ceiling over the ground floor, no roof frame above it", () => {
  const p = sanitize({floors: 2, floorHeight: 2.7, foundation: 0.4}), geo = buildGeometry(p), room = roomOf(p);
  const ceil = p.foundation + p.floorHeight, fit = tris(geo.G.fittings);
  const inRoom = ([x, , z]) => x > room.x0 - 0.01 && x < room.x1 + 0.01 && z > room.z0 - 0.01 && z < room.z1 + 0.01;
  assert.ok(fit.some(t => t.n[1] < -0.9 && t.pts.every(q => Math.abs(q[1] - ceil) < 1e-6)), "a ceiling facing down at the top of the ground floor");
  assert.ok(fit.some(t => t.n[1] > 0.9 && t.pts.every(q => Math.abs(q[1] - p.foundation - 0.004) < 1e-3)), "a floor");
  const above = verts(geo.G.fittings).filter(q => inRoom(q) && q[1] > ceil + 0.01);
  assert.equal(above.length, 0, "nothing inside above the ceiling (no rafters, no inside walls up there)");
  // the rooms behind the windows are only on the floors above
  assert.ok(geo.rooms.length > 0 && geo.rooms.every(r => r.op.t0 >= p.floorHeight - 1e-6), "no pretend rooms on the ground floor");
});

/** How far out of its wall (m, negative: inside it) the middle of the first door's leaf stands when it is open. */
function openOut(p) {
  const geo = buildGeometry(p), d = geo.doors[0], leaf = d.leaves[0], {w} = geo.opsByWall[d.wall];
  const turn = leaf.motion.rotation * Math.PI / 180, c = leaf.box.center, h = leaf.hinge;
  const rx = h[0] + (c[0] - h[0]) * Math.cos(turn) + (c[2] - h[2]) * Math.sin(turn), rz = h[2] - (c[0] - h[0]) * Math.sin(turn) + (c[2] - h[2]) * Math.cos(turn);
  return (rx - w.o[0]) * w.n[0] + (rz - w.o[2]) * w.n[2];
}
test("walk-in house: doors swing outwards unless a door is set to swing inwards; animated in the export", () => {
  const p = sanitize({});
  assert.equal(buildGeometry(p).doors.length, 1);
  assert.equal(p.windows.find(w => w.type === "door").swing, "out", "outwards to start with");
  assert.ok(openOut(p) > 0.2, `a door swings out (${openOut(p).toFixed(2)})`);
  const inward = sanitize({...p, windows: p.windows.map(w => w.type === "door" ? {...w, swing: "in"} : w)});
  assert.equal(inward.windows.find(w => w.type === "door").swing, "in");
  assert.ok(openOut(inward) < -0.2, `and inwards when chosen (${openOut(inward).toFixed(2)})`);
  assert.equal(sanitize({...p, windows: p.windows.map(w => w.type === "door" ? {...w, swing: "sideways"} : w)}).windows.find(w => w.type === "door").swing, "out");
  assert.match(buildI3d(p, {}), /door1Trigger/);
  const barn = sanitize(PRESETS.find(x => x.id === "ladugard").settings);
  assert.ok(openOut(barn) > 0.2, "a barn door swings out");
});

test("doors: a door can be set not to open: no animation, the wall's collision closed, nothing kept clear inside", () => {
  const p = sanitize({});
  assert.equal(p.windows.find(w => w.type === "door").opens, true, "doors open to start with");
  const q = sanitize({...p, windows: p.windows.map(w => w.type === "door" ? {...w, opens: false} : w)});
  assert.equal(q.windows.find(w => w.type === "door").opens, false);
  const geo = buildGeometry(q);
  assert.equal(geo.doors.length, 0, "not animated");
  assert.doesNotMatch(buildI3d(q, {}), /animatedObject|door1Trigger/);
  const door = Object.values(geo.opsByWall).flatMap(e => e.ops.map(o => ({o, w: e.w}))).find(x => x.o.kind === "door");
  assert.ok(door, "still drawn");
  // a point in the doorway, in the wall's thickness: inside a collision box
  const s = (door.o.s0 + door.o.s1) / 2, w = door.w, pt = [w.o[0] + w.u[0] * s - w.n[0] * 0.05, w.o[1] + 1, w.o[2] + w.u[2] * s - w.n[2] * 0.05];
  const c = geo.collision, hit = [];
  for (let t = 0; t < c.i.length; t += 3) hit.push(...[0, 1, 2].map(k => c.i[t + k]));
  const pts = verts(c), near = pts.filter(v => Math.abs(v[0] - pt[0]) < 3 && Math.abs(v[2] - pt[2]) < 3);
  const xs = near.map(v => v[0]), zs = near.map(v => v[2]);
  assert.ok(Math.min(...xs) <= pt[0] && Math.max(...xs) >= pt[0] && Math.min(...zs) <= pt[2] && Math.max(...zs) >= pt[2], "the wall's collision goes across the doorway");
  assert.equal(roomOf(q).keepOut.length, 0, "nothing kept clear behind a door that doesn't open");
  assert.ok(roomOf(p).keepOut.length > 0);
});

test("doors: the hinges are on the left (seen from outside) unless set to the right; a pair keeps its outer hinges", () => {
  const set = (extra, w) => { const b = sanitize({}); return sanitize({...b, windows: b.windows.map(x => x.type === "door" ? {...x, ...extra, ...(w ? {w} : {})} : x)}); };
  const leaf = p => { const g = buildGeometry(p), d = g.doors[0]; return {leaf: d.leaves[0], span: d.op, w: g.opsByWall[d.wall].w, n: d.leaves.length}; };
  const dflt = set({}), left = leaf(dflt), right = leaf(set({hinge: "right"}));
  assert.equal(dflt.windows.find(w => w.type === "door").hinge, "left");
  assert.equal(set({hinge: "sideways"}).windows.find(w => w.type === "door").hinge, "left");
  const along = (l, h) => (h[0] - l.w.o[0]) * l.w.u[0] + (h[2] - l.w.o[2]) * l.w.u[2];
  assert.ok(Math.abs(along(left, left.leaf.hinge) - left.span.s0) < 0.05 && Math.abs(along(right, right.leaf.hinge) - right.span.s1) < 0.05, `${along(left, left.leaf.hinge)} / ${along(right, right.leaf.hinge)}`);
  assert.equal(left.leaf.motion.rotation, -right.leaf.motion.rotation, "swings the same way, hinged at the other end");
  // wide doors are a pair: two leaves, hinged at the outer edges whatever hinge says
  const pair = leaf(set({hinge: "right"}, 2));
  assert.equal(pair.n, 2);
  assert.ok(Math.abs(along(pair, geoHinge(set({hinge: "right"}, 2), 0)) - pair.span.s0) < 0.05 && Math.abs(along(pair, geoHinge(set({hinge: "right"}, 2), 1)) - pair.span.s1) < 0.05);
  // a sliding door on the right slides to the right
  const slide = (h) => { const p = set({hinge: h, style: "sliding"}), g = buildGeometry(p), d = g.doors[0]; return d.leaves[0].motion.translation; };
  assert.notDeepEqual(slide("left"), slide("right"));
});
function geoHinge(p, k) { return buildGeometry(p).doors[0].leaves[k].hinge; }
