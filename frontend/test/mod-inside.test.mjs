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

// ---- a carport: an open side is an entrance ----
const carport = sanitize({kind: "shed", width: 8, depth: 6, foundation: 0.1, openFront: true, doorWall: "back"});

test("an open side (a carport's front) is an entrance, as wide as the side less the posts at its corners", () => {
  const e = entrancesOf(carport).filter(x => x.wall === "front");
  assert.equal(e.length, 1);
  assert.ok(e[0].s0 > 0 && e[0].s0 < 0.6 && e[0].s1 > 7.4 && e[0].s1 < 8, `along the front, which is 8 m: ${e[0].s0} to ${e[0].s1}`);
  assert.deepEqual(entrancesOf(sanitize({kind: "shed", width: 8, depth: 6, doorStyle: "plank"})).filter(x => x.wall !== "back" && x.wall !== "front" && x.wall !== "left" && x.wall !== "right"), []);
});

test("hens can walk into a carport from a fence on its open side: the floor, a ramp, and a wall slab on every closed side but none across the open one", () => {
  // the carport stands at (20, 10): walls x 16 to 24, z 7 to 13; its front is the south side (z 13)
  const contour = [[15.85, 13.15], [15.85, 22], [24.15, 22], [24.15, 13.15]].map(([x, z]) => [x, 0, z]);
  const feet = {x0: 16, x1: 24, z0: 7, z1: 13};
  const r = insideNav({settings: carport, place: {x: 20, z: 10, y: 0, rot: 0}, contour, blockers: [rectBlock(feet)]});
  assert.ok(r.nav, JSON.stringify(r.reason));
  assert.ok(r.nav.rects.some(q => q.inside), "a floor");
  const [a, , c] = r.nav.ramps[0].points;
  assert.ok(a[1] > 13 && c[1] < 13, "the ramp goes in over the front (z 13)");
  const across = r.nav.blockers.filter(b => b.center[2] > 12.5 && b.size[0] > 5);
  assert.equal(across.length, 0, "no wall slab across the open front: " + JSON.stringify(across));
});

// ---- the fence is stood 15 cm off the walls with and without the hens walking inside (a game test: with the walking shape too, a fence on the wall gave the meadow warning) ----
test("the end posts are stood 15 cm off the carport corners both with the hens walking inside and without", async () => {
  const cp = [{id: "c", kind: "building", name: "Carporten", x: 20, z: 10, y: 0, rot: 0, data: {kind: "shed", width: 8, depth: 6, foundation: 0.1, openFront: true, doorWall: "back"}}];
  const mp = await import("../src/editor/modPlan.mjs"), f = mp.feetOf([{x: 20, z: 10, rot: 0, bounds: mp.boundsOf(mp.projectGroups(cp[0].data)), feet: mp.buildingFeet(cp[0].data)}])[0];
  const pts = [[f.x1, f.z1], [f.x1, f.z1 + 8], [f.x0, f.z1 + 8], [f.x0, f.z1]];   // from the right front corner out and back to the left front corner, on the open side (south)
  const objects = addGroup([], "hens", settingsFor({width: 8, depth: 6}), [20, 10], {wall: "front"}).map(o => (o.type === "pasture" ? {...o, points: pts} : o));
  const dist = async inside => {
    const {files, middle, warnings} = await makeModPackage({name: "Hönsgården", posts: cp, objects, inside});
    const r = {x0: f.x0 - middle[0], x1: f.x1 - middle[0], z0: f.z0 - middle[1], z1: f.z1 - middle[1]};
    const nodes = [...text(files.get("house.i3d")).matchAll(/name="fence1Node\d+" translation="([^"]+)"/g)].map(m => m[1].split(" ").map(Number));
    const away = ([x, , z]) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
    return {ends: [away(nodes[0]), away(nodes[nodes.length - 1])], warnings, xml: text(files.get("house.xml"))};
  };
  const inn = await dist("c"), out = await dist(null);
  assert.match(inn.xml, /shape="navigationMeshShape"/, "the hens can walk in: " + JSON.stringify(inn.warnings));
  assert.ok(inn.ends.every(d => d > 0.14), `15 cm off with the hens inside: ${inn.ends}`);
  assert.ok(out.ends.every(d => d > 0.14), `15 cm off: ${out.ends}`);
});

// ---- the ramp and the floor meet (seen in the game: the hens could not go between outside and inside; the floor cells ended 10 cm short of the ramp) ----
test("the ramp and the floor always meet: the floor covers the ramp inner edge, whatever the size and the foundation of the building (the 20 cm cells of the floor do not line up with the wall)", () => {
  const covered = (rects, [x, z]) => rects.some(r => x >= r.x0 - 1e-6 && x <= r.x1 + 1e-6 && z >= r.z0 - 1e-6 && z <= r.z1 + 1e-6);
  let tried = 0;
  for (const variant of ["hole door in the back wall", "carport, open front"]) for (const foundation of [0, 0.2]) {
    for (let w = 6; w <= 16; w += 0.7) for (let d = 5; d <= 10; d += 0.55) for (const x of [20, 20.13]) {
      const front = variant.startsWith("carport");
      const q = sanitize(front ? {kind: "shed", width: +w.toFixed(2), depth: +d.toFixed(2), foundation, openFront: true, doorWall: "back"} : {kind: "house", width: +w.toFixed(2), depth: +d.toFixed(2), foundation, doorWall: "back", doorStyle: "hole"});
      const feet = {x0: x - w / 2, x1: x + w / 2, z0: 10 - d / 2, z1: 10 + d / 2}, g = 0.15, far = front ? feet.z1 + 12 : feet.z0 - 12, near = front ? feet.z1 + g : feet.z0 - g;
      const contour = [[feet.x0 - g, near], [feet.x0 - g, far], [feet.x1 + g, far], [feet.x1 + g, near]].map(([p, o]) => [p, 0, o]);
      const r = insideNav({settings: q, place: {x, z: 10, y: 0, rot: 0}, contour, blockers: [rectBlock(feet)]});
      if (!r.nav) continue;
      tried++;
      const floor = r.nav.rects.filter(f => f.inside), [, , c, dd] = r.nav.ramps[0].points, mid = [(c[0] + dd[0]) / 2, (c[1] + dd[1]) / 2];
      assert.ok(covered(floor, mid), variant + " " + foundation + ": " + w + " x " + d + " at " + x + ": the floor does not reach the inner edge of the ramp " + mid.map(v => v.toFixed(3)));
      for (const k of [0.25, 0.75]) assert.ok(covered(floor, [c[0] + (dd[0] - c[0]) * k, mid[1]]), variant + ": " + w + " x " + d + ": a quarter along the inner edge");
    }
  }
  assert.ok(tried > 150, "many sizes were tried: " + tried);
});
