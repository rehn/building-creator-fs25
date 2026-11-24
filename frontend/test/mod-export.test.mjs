// A mod as a game mod (editor/modExport.mjs): one placeable, a frame i3d with a ReferenceNode for each building and prop, and the mod's game objects as the building export makes them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeModPackage } from "../src/editor/modExport.mjs";
import { addGroup, settingsFor } from "../src/lib/modObjects.mjs";
import { sanitize as sanitizeProp } from "../src/builder/model.mjs";

const text = bytes => (typeof bytes === "string" ? bytes : Buffer.from(bytes).toString("latin1"));
const house = {kind: "house", width: 10, depth: 8};
const prop = sanitizeProp({kind: "prop", parts: [{name: "sign", shape: "box", w: 1.2, h: 0.6, d: 0.1, color: "#ccaa33"}]});
const posts = [
  {id: "a", kind: "building", name: "Huset", x: 20, z: 10, y: 0, rot: 0, data: house},
  {id: "b", kind: "building", name: "Ladan", x: 40, z: 10, y: 0, rot: 90, data: {kind: "shed", width: 8, depth: 6}},
  {id: "c", kind: "prop", name: "Skylt", x: 20, z: 10, y: 6.5, rot: 0, data: prop},
];

test("a mod is one placeable: a modDesc, one placeable XML, one frame i3d, and the files of each post in a folder of its own", async () => {
  const sleep = addGroup([], "sleep", settingsFor({width: 30, depth: 12}), [30, 14]);
  const {files, warnings} = await makeModPackage({name: "Gården", author: "Anna", posts, objects: sleep});
  assert.deepEqual(warnings, []);
  for (const f of ["modDesc.xml", "house.xml", "house.i3d", "icon.dds", "store.dds", "posts/p3/prop.i3d"]) assert.ok(files.has(f), f);
  assert.equal([...files.keys()].filter(f => f.endsWith(".xml")).length, 2, "the modDesc and the one placeable");
  assert.equal([...files.keys()].filter(f => f.endsWith(".i3d")).length, 2, "the mod's own i3d (with the buildings in it) and the prop's");
  assert.ok([...files.keys()].some(f => /^posts\/p3\/textures\/prop_diffuse\.dds$/.test(f)), "a prop's atlas");
  assert.ok(files.has("posts/p1/textures/interior_diffuse.dds") && files.has("posts/p1/textures/glass_diffuse.dds"), "the rooms behind the windows and the see-through glass of a house");
  assert.ok(!files.has("posts/p1/house.xml") && !files.has("posts/p1/modDesc.xml"), "a post has no XML of its own, the mod has one placeable");
  assert.ok(files.has("posts/p2/textures/walls_diffuse.dds") || [...files.keys()].some(f => f.startsWith("posts/p2/textures/")), "each building has its textures in a folder of its own");
  assert.match(text(files.get("modDesc.xml")), /<storeItem xmlFilename="house\.xml"\/>/);
  assert.match(text(files.get("modDesc.xml")), /<author>Anna<\/author>/);
  assert.match(text(files.get("modDesc.xml")), /<iconFilename>icon\.dds<\/iconFilename>/, "the game does not load a mod without an icon");
  assert.match(text(files.get("house.xml")), /<image>store\.dds<\/image>/);
});

test("each building is in the mod's i3d (its nodes b1_, b2_), each prop a reference, all moved by minus the middle, turned and lifted as the plan has them", async () => {
  const {files, middle} = await makeModPackage({name: "Gården", posts});
  const i3d = text(files.get("house.i3d"));
  assert.ok(i3d.includes('filename="posts/p3/prop.i3d"'));
  assert.equal((i3d.match(/<ReferenceNode /g) || []).length, 1, "only the prop is a reference");
  const at = (tag, n) => i3d.match(new RegExp(`<${tag} name="${n}"[^>]*`))[0];
  const near = (el, key, want) => { const got = el.match(new RegExp(`${key}="([^"]+)"`))[1].split(" ").map(Number); got.forEach((v, i) => assert.ok(Math.abs(v - want[i]) < 0.01, `${key} ${got} is not ${want}`)); };
  near(at("TransformGroup", "b1_post"), "translation", [20 - middle[0], 0, 10 - middle[1]]);
  near(at("TransformGroup", "b2_post"), "rotation", [0, 90, 0]);
  near(at("TransformGroup", "b2_post"), "translation", [40 - middle[0], 0, 10 - middle[1]]);
  near(at("ReferenceNode", "post03"), "translation", [20 - middle[0], 6.5, 10 - middle[1]]);
  assert.ok(i3d.includes('name="b1_house"') && i3d.includes('name="b2_house"') && i3d.includes('name="b1_visuals"'), "the nodes of each building have its prefix");
  assert.ok(Math.abs(middle[0] - 30) < 6 && Math.abs(middle[1] - 10) < 3, "the middle of the three");
});

test("the doors of every building are animated by one animatedObjects block that names the prefixed nodes, with saveIds that are all different", async () => {
  const {files} = await makeModPackage({name: "Gården", posts});
  const xml = text(files.get("house.xml")), i3d = text(files.get("house.i3d"));
  assert.equal((xml.match(/<animatedObjects>/g) || []).length, 1, "one block, as the game takes one");
  const ids = [...xml.matchAll(/saveId="([^"]+)"/g)].map(m => m[1]);
  assert.ok(ids.length >= 2, "a door in each house: " + ids);
  assert.equal(new Set(ids).size, ids.length, "each saveId once");
  assert.ok(ids.every(id => /^b[12]_/.test(id)));
  for (const m of xml.matchAll(/<part node="([^"]+)"/g)) assert.ok(i3d.includes(`name="${m[1]}"`), `${m[1]} is a node of the i3d`);
  for (const m of xml.matchAll(/triggerNode="([^"]+)"/g)) assert.ok(i3d.includes(`name="${m[1]}"`), `${m[1]} is a node of the i3d`);
  const maps = [...xml.matchAll(/<i3dMapping id="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(maps).size, maps.length, "each mapping once");
  assert.ok(maps.some(id => /^b1_door/.test(id)) && maps.some(id => /^b2_door/.test(id)), "both buildings' doors are mapped");
});

test("nothing is drawn or collides in the frame itself, and the areas cover the whole mod", async () => {
  const {files} = await makeModPackage({name: "Gården", posts});
  const i3d = text(files.get("house.i3d"));
  assert.ok(!/name="walls"|name="roof"|name="collision"/.test(i3d), "no walls, roof or collision of a frame building");
  const xml = text(files.get("house.xml"));
  assert.match(xml, /<clearAreas>/);
  assert.match(xml, /<testAreas>/);
  const w = i3d.match(/name="clearAreaWidth01"[^>]*translation="([^"]+)"/)[1].split(" ").map(Number), h = i3d.match(/name="clearAreaHeight01"[^>]*translation="([^"]+)"/)[1].split(" ").map(Number);
  assert.ok(w[2] > 8 && h[0] > 28, `the clear area is ${h[0]} x ${w[2]} m: as big as the three posts (30 x 10 and more)`);
});

test("the mod's game objects are in the one placeable: a sleep point and a workshop make a farmhouse-with-workshop type the modDesc defines", async () => {
  let objs = addGroup([], "sleep", settingsFor({width: 30, depth: 12}), [30, 14]);
  objs = addGroup(objs, "workshop", settingsFor({width: 30, depth: 12}), [30, 14]);
  const {files, mod} = await makeModPackage({name: "Gården", posts, objects: objs});
  const xml = text(files.get("house.xml")), desc = text(files.get("modDesc.xml"));
  assert.equal((xml.match(/<farmhouse /g) || []).length, 1);
  assert.equal((xml.match(/<workshop>/g) || []).length, 1);
  const type = xml.match(/<placeable type="([^"]+)">/)[1];
  assert.equal(type.startsWith(mod + "."), true, "the mod's own type");
  assert.ok(desc.includes(`<type name="${type.slice(mod.length + 1)}"`), "defined in the modDesc");
  const i3d = text(files.get("house.i3d"));
  assert.ok(i3d.includes('name="spawnPoint"') && i3d.includes('name="markerWrench"'), "the nodes the XML names");
});

test("a post that could not be read is left out with a warning, and an empty mod still has a placeable", async () => {
  const bad = await makeModPackage({name: "X", posts: [{...posts[0]}, {id: "z", kind: "building", name: "Borta", x: 0, z: 0, y: 0, rot: 0, data: null}]});
  assert.equal(bad.warnings.length, 1);
  assert.match(bad.warnings[0], /Borta/);
  const badI3d = text(bad.files.get("house.i3d"));
  assert.ok(badI3d.includes('name="b1_post"') && !badI3d.includes('name="b2_post"'), "one building in the i3d");
  const empty = await makeModPackage({name: "Tom", posts: []});
  assert.ok(empty.files.has("house.xml") && empty.files.has("house.i3d"));
  assert.ok(empty.warnings.some(w => /no buildings or props/.test(w)));
});
