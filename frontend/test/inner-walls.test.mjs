// Inner walls (innerväggar) with wallpaper (tapet): a piece in every walk-in building's catalog, with a doorway
// (open in the collision), wallpaper on each side as a textured surface, and a height that follows the ceiling.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, buildI3d, catalogFor, fittingTextures, PRESETS, KIND, placeableXml, colorFor, surfaceSpec, SCHEMA } from "../src/editor/model.mjs";
import { roomOf, problems, cleanItems, footprint } from "../src/editor/layout.mjs";
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
    assert.ok(def.params.filter(f => f.options).map(f => f.k).join() === "door,hinge,look,swing,paperA,paperB");
  }
  // saved choices stay as saved and are clamped
  const [it] = cleanItems([wall({length: 99, paperA: 40, paperB: -3, door: 5})], catalogFor({kind: "house"}));
  assert.deepEqual([it.length, it.paperA, it.paperB, it.door], [20, WALLPAPERS.length - 1, 0, 3]);
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

import { snapItem, placeNew, rotateItem } from "../src/editor/layout.mjs";
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
  const d = snapItem(wall({x: 0.1, z: 1, length: 9.5, door: 0}), def, room);
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
  // along x at z = 1, 2 m long, its right end 0.125 m short of the wall's face (x = -0.075): it moves up against it
  const a = snapItem(wall({id: 2, x: -1.2, z: 1, length: 2, door: 0}), def, room, [across], cat);
  assert.ok(Math.abs(a.x - (-0.075 - 1)) < 1e-9 && a.length === 2, `${a.x}`);
  // the same wall without others stays where it is
  assert.equal(snapItem(wall({id: 2, x: -1.2, z: 1, length: 2, door: 0}), def, room).x, -1.25); // (only the grid)
  // the other side: left end drawn to the face at x = +0.075
  const b = snapItem(wall({id: 2, x: 1.2, z: 1, length: 2, door: 0}), def, room, [across], cat);
  assert.ok(Math.abs(b.x - (0.075 + 1)) < 1e-9, `${b.x}`);
  // a wall at z = 3 doesn't meet it (the other ends at z = 2)
  assert.equal(snapItem(wall({id: 2, x: -1.2, z: 3, length: 2, door: 0}), def, room, [across], cat).x, -1.25);
  // between the room's left wall and the inner wall: as long as the gap, touching both
  const d = snapItem(wall({id: 2, x: -2.4, z: 1, length: 4.8, door: 0}), def, room, [across], cat);
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

test("a piece can be put across the join of the house and a wing, and a wall longer than the wing goes in it", () => {
  const p = sanitize({wings: [{wall: "back", pos: 0.5, width: 5, depth: 5, floors: 0}], items: []}), room = roomOf(p), cat = catalogFor(p), w = room.rects[1];
  // along z, from inside the wing through the passage into the house
  const a = snapItem(wall({id: 1, rot: 90, x: 0, z: w.z1, length: 4, door: 0}), cat.innerwall, room, [], cat);
  assert.ok(a.z - 2 < w.z1 && a.z + 2 > w.z1 && problems([a], cat, room).size === 0, JSON.stringify(a));
  assert.ok(Math.abs(a.z - w.z1) < 0.2, `stays where put: ${a.z}`);
  // longer than the wing is wide, put in the wing across it: it is the wing's width there
  const b = snapItem(wall({id: 1, x: 0, z: (w.z0 + w.z1) / 2, length: 8, door: 0}), cat.innerwall, room, [], cat);
  assert.ok(b.z < w.z1 && b.length <= Math.floor((w.x1 - w.x0) * 100) / 100 && problems([b], cat, room).size === 0, JSON.stringify(b));
});

test("every piece is free: a wall piece put away from the walls stays where it is, near a wall or an inner wall it stands against it", () => {
  const p = house([]), room = roomOf(p), cat = catalogFor(p), w = wall({id: 1, x: 0, z: 0, length: 4, door: 0}), d = cat.sofa.size({})[1];
  // in the middle of the room, well away from every wall: free (on the grid), keeps its turn
  const far = snapItem({id: 2, type: "sofa", x: 0, z: 1.5, rot: 90}, cat.sofa, room, [], cat);
  assert.deepEqual([far.x, far.z, far.rot], [0, 1.5, 90]);
  // within reach of the back wall: against it, facing the room
  const back = snapItem({id: 2, type: "sofa", x: 0, z: room.z0 + 0.8, rot: 90}, cat.sofa, room, [], cat);
  assert.ok(back.rot === 0 && Math.abs(back.z - (room.z0 + d / 2)) < 1e-9, JSON.stringify(back));
  // near an inner wall: against its face
  const near = snapItem({id: 2, type: "sofa", x: 0, z: 0.6, rot: 90}, cat.sofa, room, [w], cat);
  assert.ok(near.rot === 0 && Math.abs(near.z - (0.075 + d / 2)) < 1e-9, JSON.stringify(near));
  // a new piece always goes to a wall
  assert.ok(placeNew("sofa", [], cat, room).z !== 0);
  // an end 0.4 m short of a wall stays short (a quarter metre is the reach)
  assert.ok(snapItem(wall({id: 2, rot: 90, x: 1, z: -1.75 + 0.15, length: 3, door: 0}), cat.innerwall, room, [], cat).length === 3);
});

test("a wall piece put near an inner wall stands against it even when a room wall is nearer", () => {
  const p = house([]), room = roomOf(p), cat = catalogFor(p), w = wall({id: 1, x: 0, z: 2.2, length: 4, door: 0}), d = cat.sofa.size({})[1];
  const s = snapItem({id: 2, type: "sofa", x: 0, z: 2.9, rot: 0}, cat.sofa, room, [w], cat);
  assert.ok(Math.abs(s.z - (2.2 + 0.075 + d / 2)) < 1e-9 && s.rot === 0, JSON.stringify(s));
});

test("fine positions: the sliders move a piece to the centimetre, without the grid, the walls or the wall ends pulling", () => {
  const p = house([]), room = roomOf(p), cat = catalogFor(p);
  const t = snapItem({id: 1, type: "table", x: 0.43, z: -0.27, rot: 0}, cat.table, room, [], cat, true);
  assert.deepEqual([t.x, t.z], [0.43, -0.27]);
  // a wall piece stays where the slider puts it (and keeps its turn), inside the room
  const s = snapItem({id: 2, type: "sofa", x: 0.43, z: 0.1, rot: 90}, cat.sofa, room, [], cat, true);
  assert.deepEqual([s.x, s.z, s.rot], [0.43, 0.1, 90]);
  // an inner wall near a wall keeps where the slider put it
  const w = snapItem(wall({id: 3, rot: 90, x: 1, z: -1.75, length: 3, door: 0}), cat.innerwall, room, [], cat, true);
  assert.equal(w.z, -1.75);
});

test("any angle: a piece turned to 30 degrees has a bigger box and is kept inside the room; inner walls only turn in quarters", () => {
  const p = house([]), room = roomOf(p), cat = catalogFor(p);
  const q = {id: 1, type: "sofa", x: 0, z: 0, rot: 30}, [w, d] = cat.sofa.size(q), f = footprint(q, cat.sofa);
  assert.ok(Math.abs((f.x1 - f.x0) - (w * Math.cos(Math.PI / 6) + d * Math.sin(Math.PI / 6))) < 1e-9);
  assert.equal(cleanItems([{type: "sofa", x: 0, z: 0, rot: 37.4}], cat)[0].rot, 37);
  assert.equal(cleanItems([wall({rot: 37})], cat)[0].rot, 0);
  // at the wall it is put right against it
  const t = snapItem({...q, z: room.z0 + 0.3}, cat.sofa, room, [], cat, true);
  assert.ok(footprint(t, cat.sofa).z0 >= room.z0 - 1e-9, JSON.stringify(t));
  // the build and export handle it
  const built = sanitize({items: [{type: "sofa", x: 1, z: 1, rot: 30}, {type: "bed", x: -1, z: 1, rot: 200}, {type: "kitchen", x: 0, z: -2, rot: 15, length: 2}]});
  assert.ok(buildGeometry(built).G.fittings.p.length > 0);
  assert.ok(buildI3d(built).includes("</i3D>"));
});

/* ---------- Doors in the doorway ---------- */
test("inner door: a door that opens is a leaf in the doors list with its own trigger and animation; the doorway stays open for walking until it is shut", () => {
  const p = house([wall({door: 2, hinge: 0, swing: 1})]), geo = buildGeometry(p), F = p.foundation;
  // the house's own door first, then the inner one (ids from 1000)
  const inner = geo.doors.filter(d => d.wall === null);
  assert.equal(inner.length, 1);
  const [leaf] = inner[0].leaves, [d0, d1] = doorwayOf(p.items[0]);
  assert.ok(leaf.motion.rotation === 100 || leaf.motion.rotation === -100, JSON.stringify(leaf.motion));
  assert.ok(leaf.hinge[0] > d0 && Math.abs(leaf.hinge[0] - (d1 - 0.012)) < 1e-6, `hinge at the +x end (left, seen from one side): ${leaf.hinge}`);
  assert.ok(Math.abs(leaf.box.size[0] - (d1 - d0 - 0.024)) < 1e-6 && leaf.box.size[2] > 0.03 && leaf.box.size[2] < 0.04, JSON.stringify(leaf.box.size));
  assert.ok(Object.keys(leaf.parts).includes("doorIn") && !Object.keys(leaf.parts).includes("door"), "its meshes are the inner doors' own material");
  const xml = placeableXml(p, "House"), i3d = buildI3d(p);
  assert.ok(i3d.includes("Leaf1Hinge") && /door2Trigger/.test(i3d), "scene nodes");
  assert.match(xml, /saveId="door2"/);
  // the leaf's own collision moves with it; the wall's has the doorway open
  const mid = (d0 + d1) / 2;
  assert.ok(!hits(geo.collision, [mid, F + 1, -1], [mid, F + 1, 1]));
});

test("inner door: the hinge end and the swing side set the leaf's turn", () => {
  const rot = s => buildGeometry(house([wall(s)])).doors.find(d => d.wall === null).leaves[0];
  const a = rot({door: 2, hinge: 0, swing: 0}), b = rot({door: 2, hinge: 0, swing: 1}), c = rot({door: 2, hinge: 1, swing: 1}), d = rot({door: 2, hinge: 1, swing: 0});
  assert.equal(a.motion.rotation, -b.motion.rotation, "the other swing turns the other way");
  assert.equal(c.motion.rotation, -b.motion.rotation, "hinged at the other end: turned the other way for the same side");
  assert.equal(d.motion.rotation, b.motion.rotation);
  assert.ok(a.hinge[0] !== c.hinge[0]);
  // turned a quarter: the hinge follows the wall
  const t = buildGeometry(house([wall({door: 2, rot: 90, x: -2})])).doors.find(d => d.wall === null).leaves[0];
  assert.ok(t.box.size[2] > t.box.size[0], JSON.stringify(t.box.size));
});

test("inner door: a door that stays shut closes the doorway and is not animated; no doorway or an open one has no leaf", () => {
  const p = house([wall({door: 3})]), geo = buildGeometry(p), F = p.foundation, [d0, d1] = doorwayOf(p.items[0]), mid = (d0 + d1) / 2;
  assert.equal(geo.doors.filter(d => d.wall === null).length, 0);
  assert.ok(hits(geo.collision, [mid, F + 1, -1], [mid, F + 1, 1]), "closed for walking");
  assert.ok(geo.G.doorIn.p.length > buildGeometry(house([wall({door: 1})])).G.doorIn.p.length, "the leaf is drawn");
  for (const door of [0, 1]) assert.equal(buildGeometry(house([wall({door})])).doors.filter(d => d.wall === null).length, 0, "door " + door);
  assert.ok(buildI3d(p).includes("</i3D>"));
});

test("inner door: the hinge and swing settings only show when there is a door; every barn can have one too", () => {
  const def = catalogFor(house([])).innerwall, shown = it => def.params.filter(f => !f.when || f.when(it)).map(f => f.k).join();
  assert.ok(!shown({door: 0}).includes("doorAt"));
  assert.ok(!shown({door: 1}).includes("hinge") && shown({door: 2}).includes("hinge") && shown({door: 3}).includes("swing"));
  const b = barn([wall({door: 2})]);
  assert.equal(buildGeometry(b).doors.filter(d => d.wall === null).length, 1);
  assert.ok(buildI3d(b).includes("</i3D>"));
});

test("inner door: its colour is its own setting (Colors), apart from the outer doors", () => {
  const p = sanitize({items: [wall({door: 2})], doorColor: "#112233", innerDoorColor: "#AABBCC"});
  assert.equal(colorFor(p, "doorIn"), "#AABBCC");
  assert.equal(colorFor(p, "door"), "#112233");
  assert.ok(sanitize({}).innerDoorColor, "has a default");
  assert.ok(SCHEMA.some(g => g.fields && g.fields.some(f => f.k === "innerDoorColor" && f.type === "color")), "a colour field in the editor");
  // it is its own part with its own material in the export, painted wood, and weathers like the doors
  const i3d = buildI3d(p);
  assert.ok(/name="doorIn"/.test(i3d) || /Leaf1DoorIn/.test(i3d), "its part in the export");
  assert.ok(surfaceSpec(p, "doorIn").kind === "paintedwood");
  // changing the outer door colour leaves the inner doors alone
  const q = sanitize({items: [wall({door: 2})], doorColor: "#FF0000", innerDoorColor: "#AABBCC"});
  assert.equal(colorFor(q, "doorIn"), colorFor(p, "doorIn"));
});

test("inner door: the door can be chosen: the building's own style or any swinging style, each drawn differently", () => {
  const def = catalogFor(house([])).innerwall, look = def.params.find(f => f.k === "look");
  assert.deepEqual(look.options.slice(0, 2), ["Like the building's doors", "Plain"]);
  assert.ok(!look.options.some(o => /sliding/i.test(o)), "no sliding barn door in a house's rooms");
  const sizes = [];
  for (let i = 0; i <= look.options.length - 1; i++) {
    const g = buildGeometry(house([wall({door: 2, look: i})]));
    assert.equal(g.doors.filter(d => d.wall === null).length, 1, "look " + i);
    sizes.push(g.G.doorIn.p.length + g.G.trim.p.length + g.G.glass.p.length + g.G.iron.p.length);
  }
  assert.ok(new Set(sizes).size >= 4, "the styles differ: " + sizes.join(","));
  // 0 = like the building's: a barn with a sliding door still gets a swinging inner door
  assert.deepEqual(buildGeometry(barn([wall({door: 2, look: 0})])).doors.filter(d => d.wall === null).map(d => d.slide), [false]);
  assert.equal(def.leafOf(wall({door: 2, look: 2})).style, "plank");
  assert.equal(def.leafOf(wall({door: 2, look: 0})).style, null);
  assert.ok(buildI3d(house([wall({door: 2, look: 5})])).includes("</i3D>"));
});
