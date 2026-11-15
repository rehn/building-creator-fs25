// The default dealer: the map's one vehicle shop. In the base game it is nodes in the map's i3d (a shop trigger with the shopping icon and the
// player's spot, and store spawn places where bought vehicles appear), not a placeable. Here it is a walk-in hall as a plain placeable that has the
// same nodes, named as the base game's, with the same script callbacks as user attributes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, buildI3d, placeableXml, placeableSnippet, modDescXml, PRESETS, catalogFor, defaultModDescription } from "../src/editor/model.mjs";
import { kindOf, CATEGORIES, KINDS } from "../src/editor/kinds/index.mjs";
import { objectOf, objectProblems, boxOf } from "../src/editor/objects.mjs";

const preset = id => PRESETS.find(x => x.id === id);
const dealer = (o = {}) => sanitize({...preset("kartensbutik").settings, ...o});
/** The xml of a node and everything below it (the i3d is written one node a line, indented by depth). */
function subtree(xml, name) {
  const lines = xml.split("\n"), i = lines.findIndex(l => new RegExp(`<(Shape|TransformGroup|ReferenceNode) name="${name}"`).test(l));   // (a mesh in Shapes can have the same name)
  if (i < 0) return "";
  const depth = lines[i].search(/\S/), out = [lines[i]];
  for (let j = i + 1; j < lines.length && lines[j].search(/\S/) > depth; j++) out.push(lines[j]);
  return out.join("\n");
}
const nodeId = (xml, name) => +new RegExp(`<(?:Shape|TransformGroup) name="${name}"[^>]*nodeId="(\\d+)"`).exec(xml)[1];
const attrsOf = (xml, id) => [...(new RegExp(`<UserAttribute nodeId="${id}">([\\s\\S]*?)</UserAttribute>`).exec(xml) || [, ""])[1].matchAll(/<Attribute name="([^"]+)" type="([^"]+)" value="([^"]*)"/g)].map(m => [m[1], m[2], m[3]]);

test("the default dealer is a kind in the shops category, with presets that build", () => {
  const kind = KINDS.find(k => k.id === "defaultdealer");
  assert.ok(kind && kind.category === "shops" && kind.walkIn);
  assert.ok(CATEGORIES.some(c => c.id === "shops"));
  for (const id of ["kartensbutik", "lillabutiken"]) {
    const x = preset(id);
    assert.ok(x, id);
    assert.equal(x.kind, "defaultdealer"); assert.equal(x.category, "shops");
    const p = sanitize(x.settings);
    assert.ok(buildGeometry(p).G.walls.i.length > 0, `${id}: walls`);
    assert.match(buildI3d(p), /<\/i3D>/);
    assert.ok(defaultModDescription(p).length > 10);
  }
});

test("the counter and the delivery place are needed, as for a dealership", () => {
  const p = dealer({objects: []});
  assert.ok(objectOf(p, "counter") && objectOf(p, "spawn"), "added when missing");
  assert.equal(objectProblems(p).size, 0);
  assert.ok(objectOf(p, "spawn").z - objectOf(p, "spawn").d / 2 >= p.depth / 2 - 0.01, "on open ground outside the front wall");
});

test("a plain placeable: no vehicle buying station and no type of its own", () => {
  const p = dealer(), xml = placeableXml(p, "Butiken"), desc = modDescXml(p, "Butiken");
  assert.match(xml, /<placeable type="simplePlaceable">/);
  assert.doesNotMatch(xml, /vehicleBuyingStation|<storeItem /);
  assert.doesNotMatch(desc, /placeableTypes/);
  assert.match(placeableSnippet(p), /<i3dMappings>/);
});

test("the shop trigger is built as the base game's: a trigger shape with the shopping icon first and the player's spot second", () => {
  const p = dealer(), i3d = buildI3d(p), trig = subtree(i3d, "vehicleShopTrigger");
  assert.match(trig, /<Shape name="vehicleShopTrigger"[^>]*trigger="true"[^>]*collisionFilterGroup="0x20000000"[^>]*collisionFilterMask="0x100000"/);
  const kids = [...trig.split("\n").slice(1)].filter(l => l.search(/\S/) === trig.split("\n")[0].search(/\S/) + 2).map(l => /name="([^"]+)"/.exec(l)[1]);
  assert.deepEqual(kids, ["markerIconShopping", "vehicleShopPlayerSpawn"], "ShopTrigger reads its children by position");
  assert.match(trig, /<ReferenceNode name="markerIconShopping"[^>]*referenceId="(\d+)"/);
  const ref = +/<ReferenceNode name="markerIconShopping"[^>]*referenceId="(\d+)"/.exec(trig)[1];
  assert.match(i3d, new RegExp(`<File fileId="${ref}" filename="\\$data/shared/assets/marker/markerIconShopping\\.i3d"/>`));
});

test("the trigger stands where the counter is, and the player's spot is in front of it, inside the hall", () => {
  const p = dealer(), counter = objectOf(p, "counter"), i3d = buildI3d(p), trig = subtree(i3d, "vehicleShopTrigger");
  const [cx, cy, cz] = boxOf(counter).center, t = /<Shape name="vehicleShopTrigger" translation="([^"]+)"/.exec(trig)[1].split(" ").map(Number);
  assert.deepEqual(t.map(x => +x.toFixed(2)), [cx, cy, cz].map(x => +x.toFixed(2)));
  const spot = /<TransformGroup name="vehicleShopPlayerSpawn" translation="([^"]+)"( rotation="([^"]+)")?/.exec(trig), s = spot[1].split(" ").map(Number);
  const world = [t[0] + s[0], t[1] + s[1], t[2] + s[2]];
  assert.ok(Math.abs(world[0] - cx) <= counter.w / 2 + 0.01, "in line with the counter");
  assert.ok(Math.abs(world[2]) < p.depth / 2, "inside the hall, not out through the wall");
  assert.ok(Math.abs(world[1] - p.foundation) < 0.01, "on the floor");
});

test("the delivery place is a line: a start node with the end node as its child, along the long side of the box", () => {
  const p = dealer(), spawn = objectOf(p, "spawn"), i3d = buildI3d(p), place = subtree(i3d, "storeSpawnPlace1Start");
  assert.match(place, /<TransformGroup name="storeSpawnPlace1Start"/);
  assert.match(place, /<TransformGroup name="storeSpawnPlace1End"/);
  const a = /name="storeSpawnPlace1Start" translation="([^"]+)"/.exec(place)[1].split(" ").map(Number), d = /name="storeSpawnPlace1End" translation="([^"]+)"/.exec(place)[1].split(" ").map(Number);
  const len = Math.hypot(...d);
  assert.ok(Math.abs(len - Math.max(spawn.w, spawn.d)) < 0.01, "as long as the box");
  assert.ok(Math.abs(a[0] + d[0] / 2 - spawn.x) < 0.01 && Math.abs(a[2] + d[2] / 2 - spawn.z) < 0.01, "centred on the box");
});

test("the delivery place is a bit above the ground (0.5 m to start with), so a vehicle does not end up in the ground; the height is a setting", () => {
  const start = p => /name="storeSpawnPlace1Start" translation="([^"]+)"/.exec(buildI3d(p))[1].split(" ").map(Number);
  assert.equal(dealer().deliveryHeight, 0.5);
  assert.equal(start(dealer())[1], 0.5);
  assert.equal(start(dealer({deliveryHeight: 1.2}))[1], 1.2);
  assert.equal(start(dealer({deliveryHeight: 0}))[1], 0);
  assert.equal(dealer({deliveryHeight: 99}).deliveryHeight, 2, "at most 2 m");
  const end = /name="storeSpawnPlace1End" translation="([^"]+)"/.exec(buildI3d(dealer({deliveryHeight: 1.2})))[1].split(" ").map(Number);
  assert.equal(end[1], 0, "the end node is level with the start node");
});

test("the script callbacks are user attributes, as in the map's i3d", () => {
  const i3d = buildI3d(dealer());
  assert.deepEqual(attrsOf(i3d, nodeId(i3d, "vehicleShopTrigger")), [["onCreate", "scriptCallback", "ShopTrigger.onCreate"]]);
  assert.deepEqual(attrsOf(i3d, nodeId(i3d, "storeSpawnPlace1Start")), [["onCreate", "scriptCallback", "BaseMission.onCreateStoreSpawnPlace"], ["yOffset", "float", "0.1"]]);
  assert.match(i3d, /<\/Scene>\s*<UserAttributes>/);
});

test("it is a showroom: the dealership's pieces and floor", () => {
  const cat = catalogFor(dealer());
  for (const t of ["salesdesk", "podium", "brochures", "innerwall"]) assert.ok(cat[t], t);
  assert.ok(buildGeometry(dealer()).G.fittings.i.length >= 0);
});

test("a dealership keeps its own way: the buying station, its own type and no map nodes", () => {
  const p = sanitize({...preset("maskinaffar").settings, kind: "dealership"}), xml = placeableXml(p, "x"), i3d = buildI3d(p);
  assert.match(xml, /vehicleBuyingStation/);
  assert.doesNotMatch(i3d, /vehicleShopTrigger|storeSpawnPlace|UserAttributes/);
  assert.equal(kindOf(p).id, "dealership");
});
