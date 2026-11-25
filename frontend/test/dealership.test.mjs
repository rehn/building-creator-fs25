// A dealership: a walk-in hall with a shop counter and a spawn area (game objects), selling base-game vehicles by group. The mod defines its own
// placeable type with the game's vehicleBuyingStation specialization.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, buildI3d, placeableXml, modDescXml, modDescXmlMulti, modTypesFor, PRESETS, catalogFor, modName } from "../src/editor/model.mjs";
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





test("a dealership has pieces for the showroom", () => {
  const cat = catalogFor(shop());
  for (const t of ["salesdesk", "podium", "brochures", "innerwall"]) assert.ok(cat[t], t);
});
