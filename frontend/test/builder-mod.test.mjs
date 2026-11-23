// The modeller's game mod (docs/PLAN_BUILDER.md): the prop as a placeable the player can buy: placeable XML, modDesc, areas. Pure, no DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize } from "../src/builder/model.mjs";
import { propAreas, exportMod, MOD_STEM } from "../src/builder/mod.mjs";

const part = extra => ({shape: "box", w: 1, h: 2, d: 0.5, color: "#336699", ...extra});
const count = (s, re) => (s.match(re) || []).length;

test("mod settings: a price (1000 to start with), upkeep and whether it can be sold, all kept in range", () => {
  assert.deepEqual(sanitize({}).mod, {price: 1000, upkeep: 0, sellable: true});
  assert.deepEqual(sanitize({mod: {price: -5, upkeep: 1e9, sellable: false}}).mod, {price: 0, upkeep: 100000, sellable: false});
  assert.equal(sanitize({mod: {price: "x"}}).mod.price, 1000);
});

test("areas: the footprint of every part as it stands (turned and moved), a margin round it for clearing, and the height", () => {
  const m = sanitize({parts: [part({x: 2, z: 1, w: 2, d: 4}), part({x: -3, z: 0, w: 1, d: 1, h: 5, rotY: 90})]});
  const A = propAreas(m);
  assert.deepEqual([A.level.x0, A.level.x1, A.level.z0, A.level.z1].map(v => Math.round(v * 100) / 100), [-3.5, 3, -1, 3]);
  assert.ok(A.clear.x0 < A.level.x0 && A.clear.x1 > A.level.x1 && A.clear.z0 < A.level.z0 && A.clear.z1 > A.level.z1);
  assert.deepEqual(A.test.min.map(v => Math.round(v * 100) / 100), [-3.5, 0, -1]);
  assert.deepEqual(A.test.max.map(v => Math.round(v * 100) / 100), [3, 5, 3]);
  const empty = propAreas(sanitize({}));
  assert.ok(empty.level.x1 > empty.level.x0, "an empty project still has an area");
});

test("exportMod: the files of a mod: i3d, shapes, placeable xml and modDesc, with the placement areas and mappings in place", () => {
  const m = sanitize({parts: [part({name: "Tank"})], mod: {price: 2500, upkeep: 7, sellable: true}});
  const out = exportMod(m, {name: "My Silo", author: "Lars"});
  assert.deepEqual(Object.keys(out.files).sort(), [`${MOD_STEM}.i3d`, `${MOD_STEM}.i3d.shapes`, `${MOD_STEM}.xml`, "modDesc.xml"].sort());
  const xml = out.files[`${MOD_STEM}.xml`], i3d = out.files[`${MOD_STEM}.i3d`];
  assert.match(xml, /<placeable type="simplePlaceable">/);
  assert.match(xml, /<name>My Silo<\/name>/);
  assert.match(xml, /<price>2500<\/price>/);
  assert.match(xml, /<dailyUpkeep>7<\/dailyUpkeep>/);
  assert.match(xml, /<canBeSold>true<\/canBeSold>/);
  assert.match(xml, new RegExp(`<filename>${MOD_STEM}.i3d</filename>`));
  assert.match(xml, /<image>store.dds<\/image>/);
  for (const n of ["clearAreaStart01", "levelAreaStart01", "testAreaStart01", "tipOcclusionUpdateAreaStart01"]) assert.ok(i3d.includes(`name="${n}"`), n);
  assert.equal(count(xml, /<i3dMapping /g), 13, "every node the xml names is mapped");
  assert.match(xml, /<testArea startNode="testAreaStart01" endNode="testAreaEnd01"\/>/);
  assert.match(xml, /<indoorArea startNode="indoorAreaStart01" widthNode="indoorAreaWidth01" heightNode="indoorAreaHeight01"\/>/, "the game warns about a placeable without indoor areas");
  assert.ok(i3d.includes('name="indoorAreaStart01"'));
  const md = out.files["modDesc.xml"];
  assert.match(md, /<author>Lars<\/author>/);
  assert.match(md, /<en>My Silo<\/en>/);
  assert.match(md, new RegExp(`<storeItem xmlFilename="${MOD_STEM}.xml"/>`));
  assert.match(md, /<iconFilename>icon.dds<\/iconFilename>/);
  assert.ok(out.textures && out.layout);
});

test("exportMod: not for sale means it cannot be bought or sold, and a name with odd characters is made safe in the xml", () => {
  const out = exportMod(sanitize({parts: [part()], mod: {sellable: false}}), {name: 'A "tank" & <co>'});
  const xml = out.files[`${MOD_STEM}.xml`];
  assert.match(xml, /<canBeSold>false<\/canBeSold>/);
  assert.match(xml, /<showInStore>false<\/showInStore>/);
  assert.ok(!xml.includes("<co>"));
  assert.match(xml, /A &quot;tank&quot; &amp; &lt;co&gt;/);
});

test("exportMod: the i3d has the visuals and the collision as before, and the atlas files are named after the stem", () => {
  const out = exportMod(sanitize({parts: [part({name: "Tank"})]}), {name: "x"});
  const i3d = out.files[`${MOD_STEM}.i3d`];
  assert.match(i3d, /<TransformGroup name="visuals"/);
  assert.match(i3d, /<Shape name="collision_Tank"/);
  assert.match(i3d, new RegExp(`filename="textures/${MOD_STEM}_diffuse.dds"`));
  assert.match(i3d, new RegExp(`externalShapesFile="${MOD_STEM}.i3d.shapes"`));
});
