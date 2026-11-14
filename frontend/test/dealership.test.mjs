// A dealership: a walk-in hall with a shop counter and a spawn area (game objects), selling base-game vehicles by group. The mod defines its own
// placeable type with the game's vehicleBuyingStation specialization.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, buildI3d, placeableXml, modDescXml, modDescXmlMulti, PRESETS, catalogFor, modName } from "../src/editor/model.mjs";
import { kindOf, CATEGORIES } from "../src/editor/kinds/index.mjs";
import { DEALER_GROUPS, vehiclesFor } from "../src/editor/kinds/dealership.mjs";
import VEHICLES from "../src/editor/vehicles.mjs";
import { objectOf, objectProblems } from "../src/editor/objects.mjs";

const preset = id => PRESETS.find(x => x.id === id);
const shop = (o = {}) => sanitize({...preset("maskinaffar").settings, kind: "dealership", ...o});

test("dealership presets exist, are in the shops category and build", () => {
  assert.ok(CATEGORIES.some(c => c.id === "shops"));
  for (const id of ["maskinaffar", "traktorhandlare"]) {
    const x = preset(id);
    assert.ok(x, id);
    assert.equal(x.kind, "dealership");
    assert.equal(x.category, "shops");
    const p = sanitize(x.settings);
    assert.ok(buildGeometry(p).G.walls.i.length > 0, `${id}: walls`);
    assert.match(buildI3d(p), /<\/i3D>/);
  }
});

test("the vehicle list comes from the game: paths, prices, and every vehicle belongs to a group", () => {
  assert.ok(VEHICLES.length > 300);
  for (const [path, name, , cat, price] of VEHICLES) {
    assert.match(path, /^\$data\/vehicles\/.+\.xml$/);
    assert.ok(name && cat && price > 0, path);
  }
  const sold = DEALER_GROUPS.reduce((n, g) => n + vehiclesFor({[g.key]: true}).length, 0);
  assert.equal(sold, VEHICLES.length, "each vehicle is in exactly one group");
});

test("the counter and the spawn area are needed, and the counter may stand inside the building", () => {
  const p = shop({objects: []});
  assert.ok(objectOf(p, "counter") && objectOf(p, "spawn"), "added when missing");
  assert.equal(objectProblems(p).size, 0, "no problems to start with");
  const spawn = objectOf(p, "spawn");
  assert.ok(spawn.z - spawn.d / 2 >= p.depth / 2 - 0.01, "the spawn area is outside the front wall");
});

test("the placeable is the mod's own type with a vehicle buying station", () => {
  const p = shop({sellTractors: true, sellLoaders: false, sellTransport: false}), xml = placeableXml(p, "Stora Affären"), i3d = buildI3d(p);
  assert.match(xml, /<placeable type="FS25_StoraAffaren\.dealership">/);
  assert.match(xml, /<vehicleBuyingStation>\s*<trigger node="shopTrigger"\/>/);
  assert.match(xml, /<spawnPlace startNode="vehicleSpawnStart01" endNode="vehicleSpawnEnd01"/);
  assert.match(xml, /markerIconShopping\.i3d/);
  const items = [...xml.matchAll(/<storeItem xmlFilename="([^"]+)" price="(\d+)" transportCosts="0"\/>/g)];
  assert.equal(items.length, vehiclesFor(p).length);
  assert.ok(items.every(m => /^\$data\/vehicles\/.+\.xml$/.test(m[1]) && +m[2] > 0));
  for (const n of ["shopTrigger", "markerShop", "vehicleSpawnStart01", "vehicleSpawnEnd01"]) {
    assert.match(i3d, new RegExp(`name="${n}"`), n);
    assert.match(xml, new RegExp(`<i3dMapping id="${n}"`), `${n} mapped`);
  }
  assert.match(i3d, /name="shopTrigger"[^>]*collisionFilterMask="0x100000"/);
});

test("the groups ticked decide what is sold; with none ticked it sells tractors; prices follow the setting", () => {
  const off = Object.fromEntries(DEALER_GROUPS.map(g => [g.key, false]));
  const names = p => vehiclesFor(p).map(v => v[3]);
  assert.ok(names({...off, sellTractors: true}).every(c => /^tractors/.test(c)));
  assert.deepEqual(vehiclesFor(off), vehiclesFor({...off, sellTractors: true}));
  const all = vehiclesFor(Object.fromEntries(DEALER_GROUPS.map(g => [g.key, true])));
  assert.equal(all.length, VEHICLES.length);
  const base = placeableXml(shop({...off, sellTractors: true}), "x"), half = placeableXml(shop({...off, sellTractors: true, sellPrice: 50}), "x");
  const price = xml => +/storeItem xmlFilename="[^"]+" price="(\d+)"/.exec(xml)[1];
  assert.equal(price(half), Math.round(price(base) / 2));
});

test("modDesc defines the placeable type; other buildings have none; a mod of several buildings gets it once", () => {
  const p = shop(), desc = modDescXml(p, "Affär");
  assert.match(desc, /<placeableTypes>\s*<type name="dealership" parent="simplePlaceable" className="Placeable" filename="\$dataS\/scripts\/placeables\/Placeable\.lua">\s*<specialization name="vehicleBuyingStation"\/>/);
  assert.doesNotMatch(modDescXml(sanitize({kind: "shed"}), "Skjul"), /placeableTypes/);
  const kind = kindOf(p), multi = modDescXmlMulti([{xml: "a/house.xml"}], {title: "Mod", types: kind.modTypes});
  assert.equal(multi.match(/<type name="dealership"/g).length, 1);
  assert.equal(modName("Affär"), "FS25_Affar");
});

test("a dealership has pieces for the showroom", () => {
  const cat = catalogFor(shop());
  for (const t of ["salesdesk", "podium", "brochures", "innerwall"]) assert.ok(cat[t], t);
});
