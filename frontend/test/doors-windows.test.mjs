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
  for (const w of p.windows.filter(w => !w.main)) { assert.equal(w.type, "window"); assert.equal(w.style, "default"); }
  const q = sanitize({windows: [
    {wall: "front", floor: 0, pos: 0.2, w: 1, h: 2, sill: 0, type: "door", style: "zbrace"},
    {wall: "front", floor: 1, pos: 0.5, w: 1, h: 2, sill: 0, type: "door"},
    {wall: "back", floor: 0, pos: 0.5, w: 1, h: 1, sill: 1, type: "nonsense", style: "nonsense"},
    {wall: "back", floor: 0, pos: 0.8, w: 1, h: 1, sill: 1, type: "window", style: "zbrace"}]});
  assert.deepEqual(q.windows.filter(w => !w.main).map(w => [w.type, w.style]), [["door", "zbrace"], ["window", "default"], ["window", "default"], ["window", "default"]]);
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
  const geo = buildGeometry(p), op = geo.opsByWall.back.ops.find(o => o.kind === "door" && !o.main);
  assert.equal(op.kind, "door");
  assert.equal(op.t0, 0);
  assert.ok(Math.abs(op.t1 - 2) < 1e-9);
  assert.equal(geo.rooms.length, buildGeometry(p0).rooms.filter(r => true).length - p0.windows.filter(w => w.wall === "back" && w.floor === 0).length, "no room behind a door");
  const {w} = geo.opsByWall.back, s = q => (q[0] - w.o[0]) * w.u[0] + (q[2] - w.o[2]) * w.u[2];
  let n = 0;
  for (let k = 0; k < geo.G.door.p.length; k += 3) { const q = geo.G.door.p.slice(k, k + 3); if (Math.abs(q[2] - w.o[2]) < 0.3 && s(q) > op.s0 - 0.01 && s(q) < op.s1 + 0.01) n++; }
  assert.ok(n > 0, "door leaf at the new door");
  // the main door is still the building's entrance (the porch is in front of it)
  assert.ok(geo.opsByWall.front.ops.some(o => o.kind === "door" && o.main));
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
  const p = cow({doorStyle: "sliding", doorW: 1.2}), geo = buildGeometry(p), d = geo.doors[0], {w} = geo.opsByWall[p.doorWall];
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

/* ---------- The main door is in the window list ---------- */
import { mainDoor, setMainDoor, syncDoor } from "../src/editor/model.mjs";
const mains = p => p.windows.filter(w => w.main);

test("the main door is an entry of the window list: one, a door, on the ground floor", () => {
  const p = sanitize({});
  assert.equal(mains(p).length, 1);
  const d = mainDoor(p);
  assert.deepEqual([d.type, d.floor, d.wall, d.w, d.h], ["door", 0, "front", 1, 2.1]);
  assert.equal(p.doorWall, "front");
  assert.ok(Math.abs(d.pos - 0.5) < 1e-9, "in the middle");
  // presets and old saves: from the old door settings
  const q = sanitize({doorWall: "left", doorPos: -1, doorW: 1.2, doorH: 2.3}), e = mainDoor(q);
  assert.deepEqual([e.wall, e.w, e.h], ["left", 1.2, 2.3]);
  assert.ok(Math.abs(e.pos * q.depth - 0.9) < 1e-6, "at the left end, 30 cm in");
  const old = sanitize({doorWall: "back", doorW: 2.4, doorH: 2.6, windows: [{wall: "front", floor: 0, pos: 0.5, w: 1, h: 1, sill: 1}]});
  assert.deepEqual([mainDoor(old).wall, mainDoor(old).w, mainDoor(old).h, old.windows.length], ["back", 2.4, 2.6, 2]);
  // never two, never on an upper floor, a door's size
  const two = sanitize({windows: [{wall: "back", floor: 0, pos: 0.3, w: 3, h: 3, type: "door", main: true}, {wall: "left", floor: 0, pos: 0.5, w: 1, h: 2, type: "door", main: true}]});
  assert.equal(mains(two).length, 1);
  assert.deepEqual([mainDoor(two).wall, mainDoor(two).w, mainDoor(two).h], ["back", 2.5, 2.6]);
  const up = sanitize({windows: [{wall: "back", floor: 1, pos: 0.3, w: 1, h: 2, type: "door", main: true}]});
  assert.equal(mainDoor(up).floor, 0);
});

test("move the main door to another wall and put a window where it was", () => {
  const p = sanitize({width: 10, depth: 7, winFront: 2}), d = mainDoor(p);
  const ws = [...p.windows.filter(w => !w.main), {...d, wall: "back", pos: 0.3}, {id: 0, wall: "front", floor: 0, pos: 0.5, w: 1, h: 1.25, sill: 0.85, type: "window"}];
  const q = sanitize({...p, windows: ws}), geo = buildGeometry(q);
  assert.equal(q.doorWall, "back");
  const main = geo.opsByWall.back.ops.find(o => o.main);
  assert.ok(main && Math.abs((main.s0 + main.s1) / 2 - 3) < 1e-6, "the door 3 m along the back");
  assert.equal(main.id, mainDoor(q).id, "the editor can pick it");
  assert.ok(!geo.opsByWall.front.ops.some(o => o.kind === "door"), "no door left on the front");
  const win = q.windows.find(w => w.wall === "front" && w.floor === 0 && Math.abs(w.pos - 0.5) < 1e-9);
  assert.equal(win._hidden, false, "the new window shows");
});

test("setMainDoor: another opening becomes the entrance, the old one a window; syncDoor follows edits", () => {
  const p = sanitize({width: 10, winBack: 2}), old = mainDoor(p), win = p.windows.find(w => w.wall === "back" && w.floor === 0);
  setMainDoor(p, win.id);
  assert.equal(mainDoor(p).id, win.id);
  assert.deepEqual([win.type, win.floor, win.main], ["door", 0, true]);
  assert.ok(win.w >= 0.7 && win.h >= 1.8, "a door's size");
  assert.equal(p.doorWall, "back");
  assert.deepEqual([old.type, !!old.main, old.w, old.h, old.sill], ["window", false, p.winW, p.winH, p.sill]);
  // upper-floor windows can't be the entrance
  const up = p.windows.find(w => w.floor === 1);
  setMainDoor(p, up.id);
  assert.equal(mainDoor(p).id, win.id);
  // edits in the editor change the entry; syncDoor brings the building's door settings along
  win.wall = "left"; win.w = 1.4;
  syncDoor(p);
  assert.deepEqual([p.doorWall, p.doorW], ["left", 1.4]);
});

test("a hen house: moving the main door to the pasture wall moves the pasture", () => {
  const p = hen({doorWall: "front", pastureWall: "back"}), d = mainDoor(p);
  const q = sanitize({...p, windows: [...p.windows.filter(w => !w.main), {...d, wall: "back"}]});
  assert.equal(q.doorWall, "back");
  assert.notEqual(q.pastureWall, "back");
});

test("adding windows to the main door's wall leaves room for the door", () => {
  for (const pos of [0.2, 0.5, 0.8]) {
    const p = sanitize({width: 10}), d = mainDoor(p);
    const q = sanitize({...p, windows: [{...d, pos}]});
    q.windows = genRowFor(q, "front", 3);
    assert.equal(q.windows.filter(w => w.wall === "front" && w.floor === 0 && !w.main).length, 3);
    buildGeometry(q);
    assert.ok(q.windows.filter(w => w.wall === "front" && w.floor === 0 && !w.main).every(w => !w._hidden), `door at ${pos}: a window hidden`);
  }
});
import { genRow } from "../src/editor/model.mjs";
const genRowFor = (p, wall, n) => genRow(p, p.windows, wall, 0, n);
