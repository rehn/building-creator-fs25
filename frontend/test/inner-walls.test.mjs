// Inner walls (innerväggar) with wallpaper (tapet): a piece in every walk-in building's catalog, with a doorway
// (open in the collision), wallpaper on each side as a textured surface, and a height that follows the ceiling.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, buildI3d, catalogFor, fittingTextures, PRESETS, KIND } from "../src/editor/model.mjs";
import { roomOf, problems, cleanItems } from "../src/editor/layout.mjs";
import { WALLPAPERS, doorwayOf } from "../src/editor/kinds/innerwall.mjs";
import { SURFACES } from "../src/editor/surfaces.mjs";

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
const wall = (s = {}) => ({id: 1, type: "innerwall", x: 0, z: 0, rot: 0, length: 4, door: 1, doorAt: 0.5, paperA: 2, paperB: 4, ...s});
const house = items => sanitize({items});
const barn = items => sanitize({...PRESETS.find(x => x.id === "ladugard").settings, items});

test("inner wall: every walk-in kind can have one, with choices in lists and a size", () => {
  for (const kind of ["house", "cow", "chicken"]) {
    const def = catalogFor({kind}).innerwall;
    assert.ok(def, kind);
    assert.deepEqual(def.size({length: 5}), [5, 0.15]);
    assert.ok(def.params.filter(f => f.options).map(f => f.k).join() === "door,paperA,paperB");
  }
  // saved choices stay as saved and are clamped
  const [it] = cleanItems([wall({length: 99, paperA: 40, paperB: -3, door: 5})], catalogFor({kind: "house"}));
  assert.deepEqual([it.length, it.paperA, it.paperB, it.door], [20, WALLPAPERS.length - 1, 0, 1]);
  assert.deepEqual(house([wall()]).items.map(x => x.type), ["innerwall"], "kept by a save");
});

test("inner wall: the doorway is open, the rest solid, up to the ceiling", () => {
  const p = house([wall()]), geo = buildGeometry(p), F = p.foundation, [d0, d1] = doorwayOf(p.items[0]), ceil = F + p.floorHeight;
  const mid = (d0 + d1) / 2;
  assert.ok(!hits(geo.collision, [mid, F + 1, -1], [mid, F + 1, 1]), "walk through the doorway");
  assert.ok(hits(geo.collision, [-1.9, F + 1, -1], [-1.9, F + 1, 1]), "not through the wall beside it");
  assert.ok(hits(geo.collision, [mid, F + 2.3, -1], [mid, F + 2.3, 1]), "not above the doorway");
  assert.ok(hits(geo.collision, [1.9, F + ceil - F - 0.1, -1], [1.9, F + ceil - F - 0.1, 1]), "up to the ceiling");
  assert.ok(!hits(geo.collision, [1.9, ceil + 0.4, -1], [1.9, ceil + 0.4, 1]), "not through the floor above");
  // without a doorway: all solid; too short for one: all solid too
  const shut = buildGeometry(house([wall({door: 0})]));
  assert.ok(hits(shut.collision, [mid, F + 1, -1], [mid, F + 1, 1]));
  assert.equal(doorwayOf(wall({length: 1.25})), null);
  // turned a quarter, the wall runs the other way
  const turned = buildGeometry(house([wall({rot: 90, door: 0, x: -2})]));
  assert.ok(hits(turned.collision, [-3, F + 1, 1.5], [-1, F + 1, 1.5]), "along z now");
});

test("inner wall: wallpaper on each side as its own surface, in the export too", () => {
  const p = house([wall({paperA: 2, paperB: 4})]), tex = fittingTextures(p);
  const by = Object.fromEntries(tex.map(t => [t.surf + t.color, t]));
  assert.ok(by["paperStripe#8fa6b8"], tex.map(t => t.surf + t.color).join());
  assert.ok(by["paperFlower#e6cf82"]);
  for (const [, , surf] of WALLPAPERS) assert.ok(SURFACES[surf], surf);
  const xml = buildI3d(p, {withTex: true});
  assert.match(xml, /textures\/fit_paperStripe_8fa6b8\.png/);
  assert.match(xml, /textures\/fit_paperFlower_e6cf82\.png/);
  // one colour or another: the surface follows the choice
  const plain = fittingTextures(house([wall({paperA: 1, paperB: 1})])).map(t => t.surf);
  assert.ok(plain.includes("paperPlain") && !plain.includes("paperStripe"));
});

test("inner wall: it follows the ceiling in a house and the walls' top in a barn; problems are shown", () => {
  const h = house([wall()]), hg = buildGeometry(h), top = ys => Math.max(...ys);
  const ys = (g, test) => { const out = []; for (let i = 0; i < g.p.length; i += 3) if (test(g.p[i], g.p[i + 2])) out.push(g.p[i + 1]); return out; };
  assert.ok(Math.abs(top(ys(hg.G.fittings, (x, z) => Math.abs(x) < 1.9 && Math.abs(z) < 0.08)) - (h.foundation + h.floorHeight)) < 0.02, "to the ceiling");
  const b = barn([wall({x: 0, z: 0, door: 0})]), bg = buildGeometry(b);
  const wallTop = b.foundation + b.floors * b.floorHeight;   // (the roof beams above it are in the same column)
  assert.ok(Math.abs(top(ys(bg.G.fittings, (x, z) => Math.abs(x) < 2.05 && Math.abs(z) < 0.08).filter(y => y <= wallTop + 0.05)) - wallTop) < 0.02, "a barn: to the walls top");
  // a wall outside the room, or across a door, is a problem
  const room = roomOf(h), cat = catalogFor(h);
  assert.equal(problems(h.items, cat, room).size, 0);
  assert.equal(problems([wall({x: 30})], cat, room).size, 1, "outside");
});

import { snapItem, placeNew } from "../src/editor/layout.mjs";
test("inner wall: its ends are drawn to the walls of the room, and both ends fill it", () => {
  const p = house([]), room = roomOf(p), cat = catalogFor(p), def = cat.innerwall;
  // along z (turned a quarter), near the left wall? no: its ends are at the back and front walls
  const wallZ = z => wall({rot: 90, x: 1, z, length: 3, door: 0});
  // one end near the back wall (z0 = -3.35): the wall moves up against it
  const a = snapItem(wallZ(-1.75), def, room);
  assert.ok(Math.abs(a.z - (room.z0 + 1.5)) < 1e-9 && a.length === 3, `${a.z}`);
  // both ends near walls: as long as the room is deep there
  const b = snapItem(wall({rot: 90, x: 1, z: 0, length: 6.5, door: 0}), def, room);
  assert.ok(Math.abs(b.length - Math.floor((room.z1 - room.z0) * 100) / 100) < 1e-9 && Math.abs(b.z) < 1e-9, `${b.length}`);
  // far from the walls: left as put (on the grid)
  const c = snapItem(wall({rot: 90, x: 1, z: 0, length: 3, door: 0}), def, room);
  assert.deepEqual([c.z, c.length], [0, 3]);
  // along x the same, against the left and right walls
  const d = snapItem(wall({x: 0.2, z: 1, length: 9.4, door: 0}), def, room);
  assert.ok(Math.abs(d.length - Math.floor((room.x1 - room.x0) * 100) / 100) < 1e-9, `${d.length}`);
  // the snapped wall fits the room
  assert.equal(problems([d], cat, room).size, 0);
  assert.equal(problems([b], cat, room).size, 0);
  // not drawn to a wall further than half a metre away
  const e = snapItem(wall({x: 0, z: 1, length: 3, door: 0}), def, room);
  assert.equal(e.x, 0);
});

test("inner wall: it is drawn to a wing's walls too, and other pieces don't snap", () => {
  const p = sanitize({wings: [{wall: "back", pos: 0.5, width: 5, depth: 5, floors: 0}], items: []}), room = roomOf(p), cat = catalogFor(p), w = room.rects[1];
  // across the wing, between its side walls
  const q = snapItem(wall({x: (w.x0 + w.x1) / 2, z: w.z0 - 2, length: 4.6, door: 1}), cat.innerwall, room);
  assert.ok(Math.abs(q.length - Math.floor((w.x1 - w.x0) * 100) / 100) < 1e-9, `${q.length} vs ${w.x1 - w.x0}`);
  // a table keeps where it is put
  const t = snapItem({id: 1, type: "table", x: 0.1, z: 0.1, rot: 0}, cat.table, room);
  assert.deepEqual([t.x, t.z], [0, 0]);
  // a new wall lands somewhere free
  assert.equal(problems([placeNew("innerwall", [], cat, room)], cat, room).size, 0);
});

test("inner wall: its end is drawn to the side of another inner wall (a T-junction), and fills between walls", () => {
  const p = house([]), room = roomOf(p), cat = catalogFor(p), def = cat.innerwall;
  const across = wall({id: 1, rot: 90, x: 0, z: 0, length: 4, door: 0});          // along z at x = 0, thickness 0.15
  // along x at z = 1, 2 m long, its right end 0.3 m short of the wall's face (x = -0.075): it moves up against it
  const a = snapItem(wall({id: 2, x: -1.4, z: 1, length: 2, door: 0}), def, room, [across], cat);
  assert.ok(Math.abs(a.x - (-0.075 - 1)) < 1e-9 && a.length === 2, `${a.x}`);
  // the same wall without others stays where it is
  assert.equal(snapItem(wall({id: 2, x: -1.4, z: 1, length: 2, door: 0}), def, room).x, -1.5); // (only the grid)
  // the other side: left end drawn to the face at x = +0.075
  const b = snapItem(wall({id: 2, x: 1.3, z: 1, length: 2, door: 0}), def, room, [across], cat);
  assert.ok(Math.abs(b.x - (0.075 + 1)) < 1e-9, `${b.x}`);
  // a wall at z = 3 doesn't meet it (the other ends at z = 2)
  assert.equal(snapItem(wall({id: 2, x: -1.4, z: 3, length: 2, door: 0}), def, room, [across], cat).x, -1.5);
  // between the room's left wall and the inner wall: as long as the gap, touching both
  const d = snapItem(wall({id: 2, x: -2.3, z: 1, length: 4.6, door: 0}), def, room, [across], cat);
  assert.ok(Math.abs(d.length - Math.floor((-0.075 - room.x0) * 100) / 100) < 1e-9, `${d.length}`);
  assert.equal(problems([across, d], cat, room).size, 0);
});

test("a wall piece is drawn to an inner wall's face too, not through its doorway", () => {
  const p = house([]), room = roomOf(p), cat = catalogFor(p);
  const w = wall({id: 1, x: 0, z: 0, length: 4, door: 0}); // along x at z = 0, faces at z = +-0.075
  const sofa = at => snapItem({id: 2, type: "sofa", x: at[0], z: at[1], rot: 0}, cat.sofa, room, [w], cat);
  const [sw, sd] = cat.sofa.size({}); void sw;
  const a = sofa([0, 0.6]);   // near the +z face: back to it, facing +z
  assert.ok(Math.abs(a.z - (0.075 + sd / 2)) < 1e-9 && a.rot === 0, JSON.stringify(a));
  const b = sofa([0, -0.6]);  // the other face, turned round
  assert.ok(Math.abs(b.z - (-0.075 - sd / 2)) < 1e-9 && b.rot === 180, JSON.stringify(b));
  // a doorway: nothing to snap to in it, so a spot in the middle goes to a side of it
  const dw = wall({id: 1, x: 0, z: 0, length: 8, door: 1, doorAt: 0.5}), r = doorwayOf(dw);
  const c = snapItem({id: 2, type: "sofa", x: (r[0] + r[1]) / 2, z: 0.4, rot: 0}, cat.sofa, room, [dw], cat);
  assert.ok(c.x + cat.sofa.size({})[0] / 2 <= r[0] + 1e-9 || c.x - cat.sofa.size({})[0] / 2 >= r[1] - 1e-9 || Math.abs(c.z) > 1, JSON.stringify(c));
  assert.equal(problems([dw, a], cat, room).has(2), false);
});
