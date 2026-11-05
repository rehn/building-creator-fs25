import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, buildI3d, placeableXml, PRESETS } from "../src/editor/model.mjs";
import { roomOf } from "../src/editor/layout.mjs";
import { WINDOW_STYLES, DOOR_STYLES } from "../src/editor/openings.mjs";

const hen = (o = {}) => sanitize({kind: "chicken", width: 8, depth: 5, hens: 60, ...o});
const cow = (o = {}) => sanitize({kind: "cow", ...o});
const mappings = xml => Object.fromEntries([...xml.matchAll(/<i3dMapping id="([^"]+)" node="([^"]+)"\/>/g)].map(m => [m[1], m[2]]));
/** p with its first window on wall's ground floor turned into a door (adding a window there first if none). */
function withDoor(p, wall, extra = {}) {
  const ws = p.windows.filter(w => !(w.wall === wall && w.floor === 0));
  return sanitize({...p, windows: [...ws, {id: 99, wall, floor: 0, pos: 0.25, w: 0.9, h: 2, sill: 0, type: "door", style: "default", ...extra}]});
}

/* ---------- Settings ---------- */
test("sanitize: windows have a type and a style; doors only on the ground floor", () => {
  const p = sanitize({});
  for (const w of p.windows.filter(w => w.type !== "door")) { assert.equal(w.type, "window"); assert.equal(w.style, "default"); }
  const q = sanitize({windows: [
    {wall: "front", floor: 0, pos: 0.2, w: 1, h: 2, sill: 0, type: "door", style: "zbrace"},
    {wall: "front", floor: 1, pos: 0.5, w: 1, h: 2, sill: 0, type: "door"},
    {wall: "back", floor: 0, pos: 0.5, w: 1, h: 1, sill: 1, type: "nonsense", style: "nonsense"},
    {wall: "back", floor: 0, pos: 0.8, w: 1, h: 1, sill: 1, type: "window", style: "zbrace"}]});
  assert.deepEqual(q.windows.map(w => [w.type, w.style]), [["door", "zbrace"], ["window", "default"], ["window", "default"], ["window", "default"]]);
});
test("sanitize: the building's window and door styles, by kind, and only known ones", () => {
  assert.equal(sanitize({}).doorStyle, "panel");
  assert.equal(hen().doorStyle, "zbrace");
  assert.equal(cow().doorStyle, "xbrace");
  assert.equal(cow().winStyle, "stall");
  assert.equal(sanitize({winStyle: "nope", doorStyle: "nope"}).winStyle, "casement");
  for (const s of WINDOW_STYLES) assert.equal(sanitize({winStyle: s.id}).winStyle, s.id);
  for (const s of DOOR_STYLES) assert.equal(sanitize({doorStyle: s.id}).doorStyle, s.id);
});

/* ---------- A door where a window was ---------- */
test("a window turned into a door: an opening down to the floor, a door leaf, no room behind it", () => {
  const p0 = sanitize({}), p = withDoor(p0, "back");
  const geo = buildGeometry(p), op = geo.opsByWall.back.ops.find(o => o.kind === "door");
  assert.equal(op.kind, "door");
  assert.equal(op.t0, 0);
  assert.ok(Math.abs(op.t1 - 2) < 1e-9);
  assert.equal(geo.rooms.length, buildGeometry(p0).rooms.filter(r => true).length - p0.windows.filter(w => w.wall === "back" && w.floor === 0).length, "no room behind a door");
  const {w} = geo.opsByWall.back, s = q => (q[0] - w.o[0]) * w.u[0] + (q[2] - w.o[2]) * w.u[2];
  let n = 0;
  for (let k = 0; k < geo.G.door.p.length; k += 3) { const q = geo.G.door.p.slice(k, k + 3); if (Math.abs(q[2] - w.o[2]) < 0.3 && s(q) > op.s0 - 0.01 && s(q) < op.s1 + 0.01) n++; }
  assert.ok(n > 0, "door leaf at the new door");
  // the front door is still there, with its porch
  assert.ok(geo.opsByWall.front.ops.some(o => o.kind === "door" && o.porch.type === "porch"));
});
test("walk-in building: every door opens with its own prompt; a side door is kept clear inside", () => {
  const q = withDoor(hen({doorW: 1.2, doorWall: "front"}), "left");
  const xml = placeableXml(q, "x"), i3d = buildI3d(q), map = mappings(xml);
  for (const id of ["door1", "door2"]) assert.match(xml, new RegExp(`<animatedObject saveId="${id}">`));
  for (const id of ["door1Leaf1", "door2Leaf1", "door1Trigger", "door2Trigger"]) assert.ok(map[id], id);
  assert.ok(i3d.includes('name="door2Leaf1Collision"'), "the side door has its own collision");
  assert.match(xml, /<controls triggerNode="door2Trigger"/);
  const geo = buildGeometry(q);
  assert.equal(geo.doors.length, 2);
  assert.equal(geo.doors[1].wall, "left");
  const room = roomOf(q, []);
  assert.ok(room.keepOut.filter(k => /door/.test(k.what)).length >= 2, "both doorways kept clear");
  assert.ok(i3d.includes('name="door2Leaf1"'));
});

/* ---------- Leaves carry their details ---------- */
test("walk-in export: a braced leaf's trim moves with it, and isn't also left in the wall", () => {
  const p = cow({doorStyle: "xbrace", doorW: 1.2}), geo = buildGeometry(p), i3d = buildI3d(p);
  const leaf = geo.doors[0].leaves[0];
  assert.ok(leaf.parts.trim, "the leaf has trim");
  const [a, b] = leaf.parts.trim;
  // the leaf node holds a trim shape
  const block = i3d.slice(i3d.indexOf('name="door1Leaf1"'));
  assert.match(block.slice(0, block.indexOf("</TransformGroup>")), /<Shape name="door1Leaf1Trim"/);
  // the static trim part has the leaf's trim vertices taken out
  const count = name => { const m = i3d.match(new RegExp(`<IndexedTriangleSet name="${name}" [^>]*>\\s*<Vertices count="(\\d+)"`)); return m ? +m[1] : 0; };
  assert.equal(count("trim"), geo.G.trim.p.length / 3 - (b - a));
});
test("sliding door: hangs outside the wall on a rail and slides along it", () => {
  const p = cow({doorStyle: "sliding", doorW: 1.2}), geo = buildGeometry(p), d = geo.doors[0], {w} = geo.opsByWall[firstDoorWall(p)];
  assert.equal(d.leaves.length, 1);
  const leaf = d.leaves[0], out = q => (q[0] - w.o[0]) * w.n[0] + (q[2] - w.o[2]) * w.n[2];
  const [a, b] = leaf.parts.door;
  for (let k = a; k < b; k++) assert.ok(out(geo.G.door.p.slice(k * 3, k * 3 + 3)) > 0.03, "leaf outside the wall");
  assert.ok(leaf.motion.translation, "slides");
  const t = leaf.motion.translation, along = t[0] * w.u[0] + t[2] * w.u[2];
  assert.ok(Math.abs(Math.abs(along) - (d.op.s1 - d.op.s0)) < 0.2, `slides ${along.toFixed(2)} m`);
  assert.ok(Math.abs(t[0] * w.n[0] + t[2] * w.n[2]) < 1e-9, "along the wall, not off it");
  const xml = placeableXml(p, "x");
  assert.match(xml, /<part node="door1Leaf1">\s*<keyFrame time="0" translation="0 0 0"\/>\s*<keyFrame time="1" translation="[-\d. ]+"\/>/);
  assert.match(xml, /template="slidingGateWoodLoop"/);
  const wide = buildGeometry(cow({doorStyle: "sliding", doorW: 2.4})).doors[0].leaves;
  assert.equal(wide.length, 2, "a wide sliding door is a pair sliding apart");
  assert.ok(wide[0].motion.translation.some((v, i) => Math.sign(v) === -Math.sign(wide[1].motion.translation[i]) && v !== 0));
});
test("every preset builds and exports with every window and door style", () => {
  for (const pr of PRESETS) for (const winStyle of WINDOW_STYLES.map(s => s.id)) for (const doorStyle of DOOR_STYLES.map(s => s.id)) {
    const p = sanitize({...pr.settings, winStyle, doorStyle});
    assert.doesNotThrow(() => buildI3d(p), `${pr.id} ${winStyle} ${doorStyle}`);
  }
});
test("a hatch has no glass and no room behind it", () => {
  const geo = buildGeometry(sanitize({winStyle: "hatch"}));
  assert.equal(geo.rooms.length, 0);
  assert.ok(buildGeometry(sanitize({winStyle: "hatch", doorStyle: "plain"})).G.glass.p.length === 0);
});

test("more or fewer windows in a row keeps the doors made from windows there", async () => {
  const { genRow } = await import("../src/editor/model.mjs");
  const p = withDoor(sanitize({}), "back");
  for (const n of [0, 2, 5]) {
    const list = genRow(p, p.windows, "back", 0, n);
    assert.equal(list.filter(w => w.wall === "back" && w.floor === 0 && w.type === "door").length, 1, `${n} windows`);
    assert.equal(list.filter(w => w.wall === "back" && w.floor === 0 && w.type === "window").length, n);
  }
});


/* ---------- Every door is the same; each can have a porch or canopy ---------- */
import { genRow } from "../src/editor/model.mjs";
const doors = p => p.windows.filter(w => w.type === "door");
const door = (wall, pos, extra = {}) => ({wall, floor: 0, pos, w: 1, h: 2.1, sill: 0, type: "door", ...extra});

test("doors: old settings make the first door, with the old entrance as its porch", () => {
  const p = sanitize({});
  assert.equal(doors(p).length, 1);
  const d = doors(p)[0];
  assert.deepEqual([d.wall, d.floor, d.w, d.h, d.porch], ["front", 0, 1, 2.1, "porch"]);
  assert.ok(Math.abs(d.pos - 0.5) < 1e-9);
  assert.equal(p.doorWall, undefined, "no main door settings left");
  assert.equal(p.entrance, undefined);
  const q = sanitize({doorWall: "left", doorPos: -1, doorW: 1.2, doorH: 2.3, entrance: "shed", entranceWidth: 3, entranceDepth: 1.2}), e = doors(q)[0];
  assert.deepEqual([e.wall, e.w, e.h, e.porch, e.porchW, e.porchD], ["left", 1.2, 2.3, "shed", 3, 1.2]);
  assert.ok(Math.abs(e.pos * q.depth - 0.9) < 1e-6, "at the left end, 30 cm in");
  // a walk-in building's door has no porch unless asked
  assert.equal(doors(hen())[0].porch, "none");
  // a save from when one door was the main door: it keeps the building's entrance
  const m = sanitize({entrance: "gable", windows: [door("back", 0.3, {main: true}), door("left", 0.5)]});
  assert.deepEqual(doors(m).map(d => d.porch), ["gable", "none"]);
  assert.ok(m.windows.every(w => !("main" in w)));
});

test("doors: a building always has one; doors may be taller than windows; porches are cleaned", () => {
  const p = sanitize({windows: [{wall: "front", floor: 0, pos: 0.5, w: 1, h: 1.2, sill: 0.9}]});
  assert.equal(doors(p).length, 1, "a door added to a save with none");
  const q = sanitize({windows: [door("back", 0.3, {h: 2.6, w: 2.4, porch: "nonsense", porchW: 99, porchD: -1}), door("left", 0.5, {porch: "shed"})]});
  assert.equal(doors(q).length, 2, "no door added when there is one");
  assert.deepEqual([doors(q)[0].h, doors(q)[0].w, doors(q)[0].porch, doors(q)[0].porchW, doors(q)[0].porchD], [2.6, 2.4, "none", 5, 0.6]);
  assert.equal(doors(q)[1].porch, "shed");
  // windows have no porch
  assert.ok(q.windows.filter(w => w.type === "window").every(w => !("porch" in w)));
});

test("doors: a porch or canopy at every door that has one, and a doorstep at the others", () => {
  const p = sanitize({foundation: 0.6, windows: [door("front", 0.3, {porch: "porch"}), door("back", 0.5, {porch: "shed"}), door("left", 0.5)]});
  const geo = buildGeometry(p), op = k => geo.opsByWall[k].ops.find(o => o.kind === "door");
  assert.deepEqual(["front", "back", "left"].map(k => op(k).porch.type), ["porch", "shed", "none"]);
  // something stands out in front of each door: porch posts/deck or canopy at the front and back
  const out = (k, lo, hi) => {
    const {w} = geo.opsByWall[k], o = op(k);
    let n = 0;
    for (const m of ["trim", "foundation", "roof", "walls"]) {
      const g = geo.G[m];
      for (let i = 0; i < g.p.length; i += 3) {
        const q = [g.p[i], g.p[i + 1], g.p[i + 2]], s = (q[0] - w.o[0]) * w.u[0] + (q[2] - w.o[2]) * w.u[2], d = (q[0] - w.o[0]) * w.n[0] + (q[2] - w.o[2]) * w.n[2];
        if (s > o.s0 - 1 && s < o.s1 + 1 && d > lo && d < hi) n++;
      }
    }
    return n;
  };
  assert.ok(out("front", 1, 2) > 0, "porch at the front");
  assert.ok(out("back", 0.8, 1.7) > 0, "canopy at the back");
  assert.equal(out("left", 0.8, 3), 0, "nothing far out at the left door");
  assert.ok(out("left", 0.1, 0.7) > 0, "a doorstep at the left door");
  // the old entrance settings are gone from the editor
  assert.ok(!SCHEMA.some(g => g.fields.some(f => /^entrance|^door(Wall|Pos|W|H)$/.test(f.k))));
});

test("doors: windows added to a wall leave room for every door on it", () => {
  const p = sanitize({width: 10, windows: [door("front", 0.2), door("front", 0.75)]});
  p.windows = genRow(p, p.windows, "front", 0, 3);
  buildGeometry(p);
  const ws = p.windows.filter(w => w.wall === "front" && w.floor === 0 && w.type === "window");
  assert.equal(ws.length, 3);
  assert.ok(ws.every(w => !w._hidden), "no window hidden by a door");
  // a door is never hidden by a window over it: the window is
  const q = sanitize({windows: [{wall: "back", floor: 0, pos: 0.5, w: 1, h: 1.2, sill: 0.5}, door("back", 0.52)]});
  buildGeometry(q);
  assert.deepEqual(q.windows.map(w => [w.type, w._hidden]), [["window", true], ["door", false]]);
});

test("doors: export order is the doors' order; the sleep point is at the first door", () => {
  const p = sanitize({windows: [door("left", 0.5), door("front", 0.5)]});
  const sp = sleepPoint(buildGeometry(p), p);
  assert.ok(sp.trigger.center[0] < -p.width / 2, "in front of the left door");
  const q = hen({windows: [door("left", 0.5), door("front", 0.5)], pastureWall: "back"});
  assert.deepEqual(buildGeometry(q).doors.map(d => d.wall), ["left", "front"]);
});

test("animal buildings: the fence and the places outside keep away from every wall with a door", () => {
  const p = hen({pastureWall: "back", windows: [door("front", 0.5), door("left", 0.5)]});
  const y = henYard(buildGeometry(p), p), geo = buildGeometry(p);
  const wallOf = q => { let best, bd = 1e9; for (const [k, {w}] of Object.entries(geo.opsByWall)) { const d = (q[0] - w.o[0]) * w.n[0] + (q[2] - w.o[2]) * w.n[2]; if (d > 0 && d < bd) { bd = d; best = k; } } return best; };
  assert.equal(wallOf(y.food.center), "right", "feed on the wall without a door");
  // a pasture on a wall with a door moves to one without
  const q = hen({pastureWall: "front", windows: [door("front", 0.5)]});
  assert.notEqual(q.pastureWall, "front");
  const c = sanitize({kind: "cow", pastureWall: "left", windows: [door("left", 0.5), door("back", 0.3)]});
  assert.ok(!["left", "back"].includes(c.pastureWall), c.pastureWall);
});
import { SCHEMA, sleepPoint, henYard } from "../src/editor/model.mjs";

/** The wall of the building's first door. */
function firstDoorWall(p) { return p.windows.find(w => w.type === "door" && w.floor === 0).wall; }
