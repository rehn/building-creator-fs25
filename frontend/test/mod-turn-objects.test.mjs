// Every game object of a mod can be turned round the Y axis, about its middle (Lars): its nodes are put in a group at the middle that is turned, with a group inside it that moves them back
// (gameobjects.mjs turnNodes), so everything the object has (triggers, icons, pallet lines, spawn lines, the unload node ...) turns with it and the coordinates inside are the ones of the unturned
// object. What belongs to the building and not to the box does not turn: the sleep point spawn point and camera.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeModPackage } from "../src/editor/modExport.mjs";
import { addGroup, settingsFor } from "../src/lib/modObjects.mjs";
import { tg } from "../src/editor/i3d.mjs";
import { turnNodes } from "../src/editor/kinds/gameobjects.mjs";

const text = bytes => (typeof bytes === "string" ? bytes : Buffer.from(bytes).toString("latin1"));
const house = {id: "a", kind: "building", name: "Huset", x: 20, z: 10, y: 0, rot: 0, data: {kind: "house", width: 10, depth: 8}};
const near = (a, b, e = 0.01) => assert.ok(a.every((v, i) => Math.abs(v - b[i]) < e), `${a} is not ${b}`);

/** The world position and yaw of every node of an i3d (as text), by name: translation and yaw (rotation "0 y 0") composed down the tree. */
function worldOf(i3d) {
  const out = new Map(), stack = [{pos: [0, 0, 0], yaw: 0}];
  for (const m of i3d.matchAll(/<(\/?)([A-Za-z]+)([^>]*?)(\/?)>/g)) {
    const [, close, tag, rest, self] = m;
    if (close) { stack.pop(); continue; }
    if (!/^(TransformGroup|Shape|Camera|ReferenceNode)$/.test(tag)) { if (!self && /^[A-Z]/.test(tag) && tag !== "i3D") stack.push(stack[stack.length - 1]); continue; }
    const name = (rest.match(/ name="([^"]+)"/) || [])[1], tr = (rest.match(/ translation="([^"]+)"/) || [])[1], ro = (rest.match(/ rotation="([^"]+)"/) || [])[1];
    const par = stack[stack.length - 1], t = tr ? tr.split(" ").map(Number) : [0, 0, 0], yawLocal = ro ? Number(ro.split(" ")[1]) : 0, a = par.yaw * Math.PI / 180;
    const pos = [par.pos[0] + t[0] * Math.cos(a) + t[2] * Math.sin(a), par.pos[1] + t[1], par.pos[2] - t[0] * Math.sin(a) + t[2] * Math.cos(a)], node = {pos, yaw: par.yaw + yawLocal};
    if (name) out.set(name, node);
    if (!self) stack.push(node);
  }
  return out;
}
function flat(nodes) {
  const w = n => `<${n.tag} name="${n.name}"${Object.entries(n.attrs).map(([k, v]) => ` ${k}="${Array.isArray(v) ? v.join(" ") : v}"`).join("")}${n.children.length ? `>${n.children.map(w).join("")}</${n.tag}>` : "/>"}`;
  return nodes.map(w).join("");
}

test("turning nodes about a point puts each one where the turn puts it, and the rest stays", () => {
  const tree = [tg("group", [0, 0, 0], [tg("a", [12, 1, 5]), tg("b", [30, 0, 30]), tg("c", [12, 0, 7], [tg("cc", [1, 0, 0])])])];
  const out = turnNodes(tree, ["a", "c"], [10, 5], 90), w = worldOf(`<TransformGroup name="root">${flat(out)}</TransformGroup>`);
  // a is 2 along x from the middle; turned 90 degrees (x' = x cos + z sin, z' = -x sin + z cos) it is 2 along -z: (10, 3)
  near(w.get("a").pos, [10, 1, 3]);
  // c is at (2, 2) from the middle: turned it is at (2, -2): (12, 3)
  near(w.get("c").pos, [12, 0, 3]);
  near(w.get("b").pos, [30, 0, 30]);
  assert.equal(w.get("c").yaw, 90, "turned about Y");
  assert.equal(w.get("cc").yaw, 90, "its children turn with it");
  assert.equal(w.get("b").yaw, 0, "the others are as they were");
  assert.equal(turnNodes(tree, ["a"], [10, 5], 0), tree, "no turn: the same nodes");
});

test("each shared object turns with its box: its nodes keep their distances to each other and turn 90 degrees", async () => {
  const cases = [["sleep", "sleep", ["sleepingTrigger", "sleepTriggerMarker"]], ["workshop", "workshop", ["vehicleTrigger", "playerTrigger", "markerWrench"]],
    ["intake", "intake", ["unloadNodeTrailer", "unloadMarkerTrailer", "unloadNodeAI"]], ["pump", "pump", ["gasStationTrigger", "mapPosition"]],
    ["vehicleshop", "counter", ["shopTrigger", "markerShop"]], ["vehicleshop", "spawn", ["vehicleSpawnStart01", "vehicleSpawnEnd01"]],
    ["warehouse", "palletcounter", ["palletBuyingActivationTrigger", "palletBuyingActivationTriggerMarker"]], ["warehouse", "palletspawn", ["palletAreaStart01", "palletAreaEnd01"]],
    ["warehouse", "unload", ["unloadTrigger", "unloadTriggerMarker", "unloadTriggerAINode", "palletTrigger"]]];
  for (const [group, type, names] of cases) {
    const base = addGroup([], group, settingsFor({width: 10, depth: 8}), [20, 10]), o = base.find(x => x.type === type);
    assert.ok(o, `${group} has ${type}`);
    const plain = worldOf(text((await makeModPackage({name: "Gården", posts: [house], objects: base})).files.get("house.i3d")));
    const turned = worldOf(text((await makeModPackage({name: "Gården", posts: [house], objects: base.map(x => (x === o ? {...x, turn: 90} : x))})).files.get("house.i3d")));
    for (const n of names) assert.ok(plain.has(n) && turned.has(n), `${group}/${type}: ${n} is a node, turned or not`);
    const d = (w, n) => Math.hypot(w.get(n).pos[0] - w.get(names[0]).pos[0], w.get(n).pos[2] - w.get(names[0]).pos[2]);
    for (const n of names) assert.ok(Math.abs(d(plain, n) - d(turned, n)) < 0.011, `${group}/${type}: ${n} keeps its distance to ${names[0]}`);
    assert.ok(names.every(n => Math.abs(turned.get(n).yaw - plain.get(n).yaw - 90) < 0.01), `${group}/${type}: all of it is turned 90 degrees`);
  }
});

test("the sleep point spawn point and camera do not turn with its box (they come from the building)", async () => {
  const base = addGroup([], "sleep", settingsFor({width: 10, depth: 8}), [20, 10]);
  const a = worldOf(text((await makeModPackage({name: "G", posts: [house], objects: base})).files.get("house.i3d")));
  const b = worldOf(text((await makeModPackage({name: "G", posts: [house], objects: base.map(x => ({...x, turn: 90}))})).files.get("house.i3d")));
  for (const n of ["spawnPoint", "sleepCamera"]) { near(a.get(n).pos, b.get(n).pos); assert.equal(a.get(n).yaw, b.get(n).yaw, n); }
  assert.notEqual(a.get("sleepingTrigger").yaw, b.get("sleepingTrigger").yaw, "the trigger does");
});

test("the hen yard objects turn too: the feed pad, the trailer spot, the egg pallets (their lines and stripes) and the info area; the fence does not", async () => {
  const base = addGroup([], "hens", settingsFor({width: 10, depth: 8}), [20, 10], {wall: "back"});
  const plain = worldOf(text((await makeModPackage({name: "G", posts: [house], objects: base})).files.get("house.i3d")));
  const turned = worldOf(text((await makeModPackage({name: "G", posts: [house], objects: base.map(x => (x.type === "pasture" ? x : {...x, turn: 90}))})).files.get("house.i3d")));
  for (const n of ["exactFillRootNodeFood", "markerFood", "loadingTrigger", "markerAnimals", "teleportNode", "infoTrigger", "palletTrigger", "palletAreaStart01", "palletAreaEnd01", "palletAreaStart02", "warningStripes01"])
    assert.ok(turned.has(n) && Math.abs(turned.get(n).yaw - plain.get(n).yaw - 90) < 0.01, `${n} is turned`);
  for (const n of ["fence1Node1", "fence1Node3"]) near(plain.get(n).pos, turned.get(n).pos);
  // the egg pallet lines run along the long side of the box: after the turn across what they were
  const line = w => [w.get("palletAreaEnd01").pos[0] - w.get("palletAreaStart01").pos[0], w.get("palletAreaEnd01").pos[2] - w.get("palletAreaStart01").pos[2]];
  const l0 = line(plain), l1 = line(turned);
  assert.ok(Math.abs(l0[0] * l1[0] + l0[1] * l1[1]) < 0.01, "at right angles to what it was: " + l0 + " and " + l1);
});

test("an object that is not turned has no extra groups, as before", async () => {
  const base = [...addGroup([], "sleep", settingsFor({width: 10, depth: 8}), [20, 10]), ...addGroup([], "hens", settingsFor({width: 10, depth: 8}), [20, 10], {wall: "back"}).map(o => ({...o, id: o.id + 10}))];
  const i3d = text((await makeModPackage({name: "G", posts: [house], objects: base})).files.get("house.i3d"));
  assert.ok(!/name="[A-Za-z0-9]+Turn"/.test(i3d));
});
