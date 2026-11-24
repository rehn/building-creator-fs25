// A mod's hens walking INSIDE one of its buildings (kinds/modinside.mjs), as the game's own hen barns do (a navigation shape of the floor and a ramp through an open doorway) and the cow barn
// does here (kinds/cow.mjs, walkarea.mjs): the floor of the building, as the mod stands it, and the doorways that face the fence.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize } from "../src/editor/model.mjs";
import { insideNav, entrancesOf } from "../src/editor/kinds/modinside.mjs";

// a house 10 x 8 m with an open framed doorway in its back wall (z -4 in its own coordinates)
const house = sanitize({kind: "house", width: 10, depth: 8, foundation: 0.2, doorWall: "back", doorStyle: "hole"});
const rectBlock = r => ({center: [(r.x0 + r.x1) / 2, 1, (r.z0 + r.z1) / 2], size: [r.x1 - r.x0, 2, r.z1 - r.z0], keep: 0.9});

test("the doorways the hens can use: open framed doorways (style hole) on the ground floor", () => {
  const e = entrancesOf(house);
  assert.equal(e.length, 1);
  assert.equal(e[0].wall, "back");
  assert.ok(e[0].s1 - e[0].s0 > 0.8, "as wide as a door");
  assert.deepEqual(entrancesOf(sanitize({kind: "house", width: 10, depth: 8, doorWall: "back", doorStyle: "plank"})), [], "a shut door is no entrance");
});

test("a fence on the side the doorway faces gives the floor and a ramp, put where the building stands", () => {
  // the house stands at (20, 10): its walls x 15 to 25, z 6 to 14; the fence is north of it, from corner to corner and 8 m out
  const contour = [[14.85, 5.85], [14.85, -2], [25.15, -2], [25.15, 5.85]].map(([x, z]) => [x, 0, z]);
  const feet = {x0: 15, x1: 25, z0: 6, z1: 14};
  const r = insideNav({settings: house, place: {x: 20, z: 10, y: 0, rot: 0}, contour, blockers: [rectBlock(feet)]});
  assert.ok(r.nav, "a walking area: " + JSON.stringify(r.reason));
  const inside = r.nav.rects.filter(q => q.inside), outside = r.nav.rects.filter(q => !q.inside);
  assert.ok(inside.length && outside.length, "the floor and the yard");
  for (const q of inside) assert.ok(q.x0 >= 15 && q.x1 <= 25 && q.z0 >= 6 && q.z1 <= 14, `inside the walls: ${JSON.stringify(q)}`);
  for (const q of inside) assert.ok(q.y > 0.2, "the floor is at its own height (the foundation)");
  assert.equal(r.nav.ramps.length, 1);
  const [a, b, c, d] = r.nav.ramps[0].points;
  assert.ok(a[1] < 6 && b[1] < 6, "the ramp starts outside the back wall (z 6)");
  assert.ok(c[1] > 6 && d[1] > 6, "and ends inside it");
  assert.ok(r.nav.blockers.length >= 3, "the walls are blockers, with a gap at the doorway");
  for (const bl of r.nav.blockers) assert.ok(bl.center[0] > 14 && bl.center[0] < 26 && bl.center[2] > 5 && bl.center[2] < 15, "the wall slabs are round the house where it stands: " + JSON.stringify(bl));
});

test("a building turned a quarter keeps its floor and doorway where the turn puts them", () => {
  // turned 90 degrees (three.js: x' = x cos + z sin, z' = -x sin + z cos): the back wall faces -x, so the fence is on the west side; the walls are x 16 to 24, z 5 to 15
  const contour = [[5.85, 4.85], [-2, 4.85], [-2, 15.15], [5.85, 15.15]].map(([x, z]) => [x + 10, 0, z]);   // west of x 16
  const feet = {x0: 16, x1: 24, z0: 5, z1: 15};
  const r = insideNav({settings: house, place: {x: 20, z: 10, y: 0, rot: 90}, contour, blockers: [rectBlock(feet)]});
  assert.ok(r.nav, JSON.stringify(r.reason));
  for (const q of r.nav.rects.filter(q => q.inside)) assert.ok(q.x0 >= 16 && q.x1 <= 24 && q.z0 >= 5 && q.z1 <= 15, `inside the turned walls: ${JSON.stringify(q)}`);
  const [a, , c] = r.nav.ramps[0].points;
  assert.ok(a[0] < 16 && c[0] > 16, "the ramp goes in through the west wall (x 16)");
});

test("no walking area, and why: the fence is on the other side, the building is turned another angle, or it has no open doorway", () => {
  const north = [[14.85, 5.85], [14.85, -2], [25.15, -2], [25.15, 5.85]].map(([x, z]) => [x, 0, z]);
  const south = north.map(([x, , z]) => [x, 0, 28 - z]);
  const feet = {x0: 15, x1: 25, z0: 6, z1: 14};
  assert.equal(insideNav({settings: house, place: {x: 20, z: 10, y: 0, rot: 0}, contour: south, blockers: [rectBlock(feet)]}).reason, "no-entrance-faces-fence");
  assert.equal(insideNav({settings: house, place: {x: 20, z: 10, y: 0, rot: 30}, contour: north, blockers: [rectBlock(feet)]}).reason, "turned");
  const shut = sanitize({kind: "house", width: 10, depth: 8, doorWall: "back", doorStyle: "plank"});
  assert.equal(insideNav({settings: shut, place: {x: 20, z: 10, y: 0, rot: 0}, contour: north, blockers: [rectBlock(feet)]}).reason, "no-door");
});

// ---- the mod export ----
import { makeModPackage } from "../src/editor/modExport.mjs";
import { addGroup, settingsFor, entranceWall } from "../src/lib/modObjects.mjs";

const text = bytes => (typeof bytes === "string" ? bytes : Buffer.from(bytes).toString("latin1"));
const posts = [{id: "a", kind: "building", name: "Huset", x: 20, z: 10, y: 0, rot: 0, data: {kind: "house", width: 10, depth: 8, foundation: 0.2, doorWall: "back", doorStyle: "hole"}}];
const yard = () => addGroup([], "hens", settingsFor({width: 10, depth: 8}), [20, 10], {wall: entranceWall(posts)});

test("a mod whose hens walk inside a building has the walking shape of its floor, a walking plane and the wall blockers, and says so in the husbandry", async () => {
  const {files, warnings} = await makeModPackage({name: "Hönsgården", posts, objects: yard(), inside: "a"});
  const xml = text(files.get("house.xml")), i3d = text(files.get("house.i3d"));
  assert.match(xml, /<navigation rootNode="navigationRootNode" shape="navigationMeshShape"\/>/);
  for (const n of ["navigationMeshShape", "walkingPlane", "navmeshBlocker"]) assert.ok(i3d.includes(`name="${n}"`), n);
  assert.deepEqual(warnings, []);
  assert.ok(!i3d.includes('name="navmeshBlocker" translation="0 1 0"'), "the blockers are the walls, not the footprint");
  // every node the XML names is in the i3d
  for (const m of xml.matchAll(/(?:node|rootNode|shape)="([A-Za-z0-9_]+)"/g)) assert.ok(i3d.includes(`name="${m[1]}"`), `${m[1]} is a node of the i3d`);
});

test("without the choice the hens stay outside as before, and a building that cannot be walked in says why", async () => {
  const out = await makeModPackage({name: "Hönsgården", posts, objects: yard()});
  assert.match(text(out.files.get("house.xml")), /<navigation rootNode="navigationRootNode"\/>/);
  assert.ok(!text(out.files.get("house.i3d")).includes('name="navigationMeshShape"'));
  const shut = [{...posts[0], data: {...posts[0].data, doorStyle: "plank"}}];
  const r = await makeModPackage({name: "Hönsgården", posts: shut, objects: yard(), inside: "a"});
  assert.ok(r.warnings.some(w => /Huset/.test(w) && /open/i.test(w)), JSON.stringify(r.warnings));
  assert.match(text(r.files.get("house.xml")), /<navigation rootNode="navigationRootNode"\/>/, "then it is as before");
});
