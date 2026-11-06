import { test } from "node:test";
import assert from "node:assert/strict";
import { PRESETS, KIND, sanitize, buildGeometry, buildI3d, placeableXml, placementAreas, catalogFor, gamePlaces } from "../src/editor/model.mjs";
import { roomOf, problems } from "../src/editor/layout.mjs";
import { sheepCap, MAX_SHEEP } from "../src/editor/kinds/sheep.mjs";
import { objectProblems, objectInfo } from "../src/editor/objects.mjs";

const sheep = (o = {}) => sanitize({ kind: "sheep", width: 12, depth: 8, sheep: 20, floors: 1, floorHeight: 3, ...o });
const presets = () => PRESETS.filter(x => x.kind === "sheep");

test("sheep barn: a sheep kind among the animal buildings, with Swedish presets", () => {
  assert.equal(KIND.sheep.category, "animals");
  const ids = presets().map(x => x.id);
  for (const id of ["farhus", "farstall", "storfarstall"]) assert.ok(ids.includes(id), id);
  for (const x of presets()) {
    const p = sanitize(x.settings);
    assert.equal(p.kind, "sheep");
    assert.match(placeableXml(p, x.name), /<placeable type="sheepHusbandry">/, x.id);
    assert.match(buildI3d(p), /<\/i3D>/, x.id);
    assert.equal(objectProblems(p).size, 0, x.id + ": " + JSON.stringify([...objectProblems(p)]));
  }
});

test("sheep barn: about one sheep per 1.5 m² of floor, at most MAX_SHEEP", () => {
  assert.equal(sheepCap({ width: 12, depth: 8 }), 64);
  assert.equal(sheepCap({ width: 40, depth: 30 }), MAX_SHEEP);
  assert.equal(sanitize({ kind: "sheep", width: 6, depth: 6, sheep: 99 }).sheep, 24);
});

test("sheep barn: the export has sheep, hay, wool pallets, a net fence and a hotspot", () => {
  const p = sheep(), xml = placeableXml(p, "Sheep"), i3d = buildI3d(p);
  assert.match(xml, /<animals type="SHEEP" baseMaxNumAnimals="20" maxNumAnimals="20">/);
  assert.match(xml, /<hotspot type="SHEEP"/);
  assert.match(xml, /saveId="Animals_SHEEP"/);
  assert.match(xml, /defaultFillType="DRYGRASS_WINDROW"/);
  assert.match(xml, /fillTypes="WOOL GOATMILK"/);
  assert.match(xml, /sheepNetFence\/sheepNetFence\.xml/);
  assert.match(xml, /<food capacity="3200">/);
  for (const n of ["palletTrigger", "palletAreaStart01", "palletAreaEnd02", "warningStripes01", "foodPlane", "waterPlane", "loadingTrigger", "teleportNode"])
    assert.ok(i3d.includes(`name="${n}"`), n);
  assert.doesNotMatch(xml, /COW/);
});

test("sheep barn: wool pallets are named for wool, in the objects and the preview", () => {
  const p = sheep();
  assert.equal(objectInfo(KIND.sheep, "pallets").name, "Wool pallets");
  assert.equal(objectInfo(KIND.chicken, "pallets").name, "Egg pallets");
  assert.ok(gamePlaces(p).some(g => g.name === "Wool pallets"));
  const geo = buildGeometry(p), y = KIND.sheep.yard(geo, p);
  assert.ok(y.pallet && y.pallet.lines.length === 2 && placementAreas(geo, y.areas).clear);
});

test("sheep barn: it is furnished inside with troughs, racks and a lambing pen, nothing blocking the doorway", () => {
  const p = sheep(), cat = catalogFor(p), room = roomOf(p, KIND.sheep.openings(p));
  assert.ok(p.items.length > 4, `${p.items.length}`);
  const types = new Set(p.items.map(i => i.type));
  for (const t of ["feedtrough", "waterbowl", "lambpen"]) assert.ok(types.has(t), t);
  assert.equal(problems(p.items, cat, room).size, 0, JSON.stringify([...problems(p.items, cat, room)]));
  const g = buildGeometry(p);
  assert.ok(g.doors && g.doors.length >= 1);
});
