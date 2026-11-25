// The sleep point as a piece placed in a room (a bedroom): the game's sleeping trigger and icon where the bed is.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, buildI3d, placeableXml, gamePlaces, catalogFor, sleepPoint, defaultModDescription } from "../src/editor/model.mjs";
import { roomOf, problems } from "../src/editor/layout.mjs";

const bed = {id: 1, type: "bed", x: -3, z: -2.2, rot: 0};
const sleepAt = (x, z, extra = {}) => ({id: 2, type: "sleeppoint", x, z, rot: 0, width: 1.8, depth: 1.4, ...extra});
const noObject = items => sanitize({objects: [], items});

test("sleep point piece: in the Bedroom group of a house's palette, a marker with a trigger size", () => {
  const def = catalogFor(sanitize({})).sleeppoint;
  assert.ok(def && def.ghost === "sleep" && def.group === "Bedroom" && def.collision === false);
  assert.deepEqual(def.size({width: 2, depth: 1.5}), [2, 1.5]);
});


test("sleep point piece: the marker is not part of the building (nothing is drawn for it), and the game object outside is not used while it is there", () => {
  const a = buildGeometry(noObject([bed])), b = buildGeometry(noObject([bed, sleepAt(-3, -2.2)]));
  for (const m of ["fittings", "walls", "trim", "door", "doorIn"]) assert.equal(b.G[m].p.length, a.G[m].p.length, m);
  assert.equal(b.collision.p.length, a.collision.p.length, "no collision");
  // with the default sleep object outside too, the piece's trigger is the one exported
  const both = sanitize({items: [bed, sleepAt(-3, -2.2)]}), sp = sleepPoint(buildGeometry(both), both);
  assert.equal(sp.trigger.center[0], -3);
  // the preview shows the piece's trigger and icon, and not the outside box
  const places = gamePlaces(both).filter(g => g.type === "sleep");
  assert.equal(places.length, 1);
  assert.deepEqual(places[0].icon.map(v => +v.toFixed(2)), [-3, both.foundation, -2.2]);
  assert.deepEqual(gamePlaces(noObject([bed, sleepAt(-3, -2.2)])).map(g => g.type), ["sleep"]);
  assert.equal(gamePlaces(sanitize({})).filter(g => g.type === "sleep").length, 0, "a building has no game objects of its own: the sleep point outside is the mod's");
});

test("sleep point piece: it may stand on the bed, but must be inside the room", () => {
  const p = noObject([bed, sleepAt(-3, -2.2)]), cat = catalogFor(p), room = roomOf(p);
  assert.equal(problems(p.items, cat, room).size, 0, "on a bed, nothing blocked");
  const out = noObject([sleepAt(9, 0)]);
  assert.match([...problems(out.items, catalogFor(out), roomOf(out)).values()].join(), /outside/i);
});

test("sleep point piece: barns don't have it", () => {
  assert.equal(catalogFor(sanitize({kind: "cow"})).sleeppoint, undefined);
});
