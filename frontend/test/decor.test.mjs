// Decorations round a building: the user's saved items (a sign, a bench) placed on the ground (or up on a post) beside it, kept in the building's i3d as references. Pure.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, buildI3d, setAssets, usedAssets } from "../src/editor/model.mjs";
import { cleanDecor, decorRects, MAX_DECOR } from "../src/editor/decor.mjs";

// a sign 3 m wide, 0.2 m deep and 2 m high, its model's middle at the origin
const sign = {id: "s1gn01", name: "Sign", files: [{name: "sign.i3d", size: 10}, {name: "sign.i3d.shapes", size: 5}, {name: "sign.obj", size: 8}],
  meta: {i3d: "sign.i3d", obj: "sign.obj", box: {min: [-1.5, 0, -0.1], max: [1.5, 2, 0.1]}, mount: "floor", kinds: []}};
const house = decor => ({kind: "house", width: 8, depth: 6, decor});

afterEach(() => setAssets([]));

test("decor: a list of items with a place, kept in range, numbered from 1; what is not an item is dropped", () => {
  const out = cleanDecor([{asset: "s1gn01", x: 3, z: -4, rot: 450, y: 1.5}, null, 5, {x: 1}, {asset: "a/b"}, {asset: "s1gn01", x: 999, z: -999, rot: -90, y: 99}, {asset: "x".repeat(65)}]);
  assert.deepEqual(out, [{id: 1, asset: "s1gn01", x: 3, z: -4, rot: 90, y: 1.5}, {id: 2, asset: "s1gn01", x: 80, z: -80, rot: 270, y: 10}]);
  assert.deepEqual(cleanDecor(undefined), []);
  assert.deepEqual(cleanDecor("x"), []);
  assert.equal(cleanDecor(Array.from({length: MAX_DECOR + 5}, () => ({asset: "s1gn01"}))).length, MAX_DECOR);
});

test("decor: a building keeps its decorations, also while the list of items has not loaded", () => {
  assert.deepEqual(sanitize({kind: "house"}).decor, []);
  const p = sanitize(house([{asset: "s1gn01", x: 6, z: 0}]));
  assert.deepEqual(p.decor.map(d => [d.asset, d.x, d.z]), [["s1gn01", 6, 0]]);
  assert.deepEqual(buildGeometry(p).refs, [], "nothing to draw or export for it yet");
});

test("decor: a decoration is a reference to the item's i3d, standing on the ground (or up at y) with its middle at x, z", () => {
  setAssets([sign]);
  const p = sanitize(house([{asset: "s1gn01", x: 6, z: 2, rot: 0}, {asset: "s1gn01", x: -6, z: 1, rot: 90, y: 0.5}]));
  const refs = buildGeometry(p).refs;
  assert.equal(refs.length, 2);
  assert.deepEqual(refs[0].translation.map(v => +v.toFixed(4)), [6, 0, 2]);
  assert.equal(refs[0].rotY, 0);
  assert.deepEqual(refs[1].translation.map(v => +v.toFixed(4)), [-6, 0.5, 1]);
  assert.equal(refs[1].rotY, 90);
  assert.deepEqual(usedAssets(p).map(a => a.id), ["s1gn01"], "packed once however many stand there");
  const xml = buildI3d(p);
  assert.equal((xml.match(/<ReferenceNode /g) || []).length, 2);
  assert.match(xml, /filename="items\/sign_s1gn01\/sign.i3d"/);
});

test("decor: the cleared and levelled ground and the test box take in the decorations", () => {
  setAssets([sign]);
  const near = buildI3d(sanitize(house([]))), far = buildI3d(sanitize(house([{asset: "s1gn01", x: 20, z: 0}])));
  const reach = xml => {   // the clear area's far x edge: its start node's x plus its height node's x
    const start = xml.match(/name="clearAreaStart01" translation="(-?[\d.]+) [\d.-]+ (-?[\d.]+)"/), h = xml.match(/name="clearAreaHeight01" translation="(-?[\d.]+) /);
    return +start[1] + +h[1];
  };
  assert.ok(reach(far) >= 20 + 1.5 - 1e-6, `the clear area reaches ${reach(far)}`);
  assert.ok(reach(near) < 10);
});

test("decor: the ground a decoration covers is the box round it as turned", () => {
  setAssets([sign]);
  const [a, b] = decorRects(sanitize(house([{asset: "s1gn01", x: 6, z: 2, rot: 0}, {asset: "s1gn01", x: -6, z: 1, rot: 90}])), id => id === "s1gn01" ? sign : null);
  assert.deepEqual([a.x0, a.x1, a.z0, a.z1].map(v => +v.toFixed(3)), [4.5, 7.5, 1.9, 2.1]);
  assert.deepEqual([b.x0, b.x1, b.z0, b.z1].map(v => +v.toFixed(3)), [-6.1, -5.9, -0.5, 2.5], "turned a quarter, it is 3 m along z");
  assert.deepEqual(decorRects(sanitize(house([{asset: "gone", x: 1, z: 1}])), () => null), [], "an item that is gone covers nothing");
});

/* dragging a decoration in the plan view: the grid, and the walls (against one, facing outwards) */
import { snapDecor, decorRect, DECOR_GRID, WALL_SNAP } from "../src/editor/decor.mjs";

const find = id => id === "s1gn01" ? sign : null;
const near = (v, w, msg) => assert.ok(Math.abs(v - w) < 1e-6, `${msg}: ${v} is not ${w}`);
const farm = sanitize(house([]));   // 8 x 6 m: its walls at x = +-4 and z = +-3
const drag = (x, z, rot = 0) => snapDecor(farm, find, {asset: "s1gn01", x: 0, z: 0, rot, y: 0}, x, z);

test("snap: away from the walls a decoration goes to the grid and keeps its turn", () => {
  const s = drag(20.1, 11.9, 45);
  assert.deepEqual([s.x, s.z, s.rot, s.wall], [20, 12, 45, null]);
  assert.equal(DECOR_GRID, 0.25);
});

test("snap: near a wall it stands against it, facing outwards, whatever it was turned before", () => {
  let s = drag(1.3, 3.4, 90);   // the front (+z): its back against the wall, 0.2 m deep
  assert.equal(s.wall, "front"); near(s.x, 1.25, "x"); near(s.z, 3.1, "z"); assert.equal(s.rot, 0);
  s = drag(-2, -3.5);           // the back wall faces -z: turned half a turn
  assert.equal(s.wall, "back"); near(s.z, -3.1, "z"); assert.equal(s.rot, 180);
  s = drag(4.3, 1);             // the right wall (+x): a quarter turn, so its 0.2 m depth is along x
  assert.equal(s.wall, "right"); near(s.x, 4.1, "x"); near(s.z, 1, "z"); assert.equal(s.rot, 90);
  s = drag(-4.2, 0.5);
  assert.equal(s.wall, "left"); near(s.x, -4.1, "x"); assert.equal(s.rot, 270);
});

test("snap: only along the wall itself, and only within reach of it", () => {
  assert.equal(drag(6, 3.1).wall, null, "past the end of the front wall");
  assert.equal(drag(0, 3.1 + WALL_SNAP + 0.1).wall, null, "too far out");
  assert.equal(drag(0, 3.1 + WALL_SNAP - 0.05).wall, "front");
  assert.equal(drag(0, 0).wall, null, "inside the building it is just on the grid");
});

test("snap: an item that is gone, and the limits", () => {
  const s = snapDecor(farm, () => null, {asset: "gone", x: 0, z: 0, rot: 30, y: 0}, 3.3, 3.2);
  assert.deepEqual([s.x, s.z, s.rot, s.wall], [3.25, 3.25, 30, null]);
  const t = drag(500, -500);
  assert.deepEqual([t.x, t.z], [80, -80]);
});

test("decorRect: the box round a decoration as it stands, with its height from the ground; null if the item is gone", () => {
  const r = decorRect({asset: "s1gn01", x: 1, z: 2, rot: 90, y: 1.5}, find);
  assert.deepEqual([r.x0, r.x1, r.z0, r.z1, r.y0, r.y1].map(v => +v.toFixed(3)), [0.9, 1.1, 0.5, 3.5, 1.5, 3.5]);
  assert.equal(decorRect({asset: "gone", x: 0, z: 0, rot: 0, y: 0}, find), null);
});

test("snap: the walls and the grid can each be switched off (a bike stand near a wall but not against it)", () => {
  const s = snapDecor(farm, find, {asset: "s1gn01", x: 0, z: 0, rot: 45, y: 0}, 1.3, 3.4, {walls: false});
  assert.deepEqual([s.x, s.z, s.rot, s.wall], [1.25, 3.5, 45, null], "no wall: grid only, turn kept");
  const g = snapDecor(farm, find, {asset: "s1gn01", x: 0, z: 0, rot: 45, y: 0}, 1.37, 3.42, {walls: false, grid: false});
  assert.deepEqual([g.x, g.z, g.wall], [1.37, 3.42, null], "nothing: exactly where it is put (to the centimetre)");
  const w = snapDecor(farm, find, {asset: "s1gn01", x: 0, z: 0, rot: 0, y: 0}, 1.37, 3.4, {grid: false});
  assert.equal(w.wall, "front"); assert.equal(w.x, 1.37, "against the wall but free along it"); near(w.z, 3.1, "z");
  assert.equal(snapDecor(farm, find, {asset: "s1gn01", x: 0, z: 0, rot: 0, y: 0}, 1.3, 3.4).wall, "front", "both on to start with");
});
