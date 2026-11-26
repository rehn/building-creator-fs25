// What the game sees a mod as (Lars, 2026-11-25): a list of the game's placeable types to choose from. The type is the one the mod's game objects make (the exporter works it out), so choosing a
// type is choosing which game objects the mod has: the ones it needs are added, the ones that belong to another type are taken away (the page asks first; it can be undone).
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeModPackage } from "../src/editor/modExport.mjs";
import { addGroup, settingsFor, GROUPS, PLACEABLE_TYPES, placeableOf, typeChange } from "../src/lib/modObjects.mjs";

const text = bytes => (typeof bytes === "string" ? bytes : Buffer.from(bytes).toString("latin1"));
const posts = [{id: "a", kind: "building", name: "Ladan", x: 20, z: 10, y: 0, rot: 0, data: {kind: "shed", width: 14, depth: 8, foundation: 0.3, doorStyle: "hole"}}];
const of = group => (group ? addGroup([], group, settingsFor({width: 14, depth: 8, foundation: 0.3}), [20, 10]) : []);

test("the list has the decoration type and one for each group of game objects, each once", () => {
  assert.deepEqual(PLACEABLE_TYPES.map(t => t.id).filter(id => id !== "decoration").sort(), GROUPS.map(g => g.id).sort());
  assert.equal(PLACEABLE_TYPES.find(t => t.id === "decoration").group, null);
  assert.equal(new Set(PLACEABLE_TYPES.map(t => t.id)).size, PLACEABLE_TYPES.length);
  assert.ok(PLACEABLE_TYPES.every(t => typeof t.name === "string" && t.name));
});

test("what type a mod is follows its game objects: none is a decoration, one group is its type, several are the mod's own", () => {
  assert.equal(placeableOf([], "hens"), "decoration");
  assert.equal(placeableOf(of("sleep"), "hens"), "sleep");
  assert.equal(placeableOf(of("hens"), "hens"), "hens");
  assert.equal(placeableOf(of("cows"), "cows"), "cows");
  assert.equal(placeableOf(of("sheep"), "sheep"), "sheep");
  assert.equal(placeableOf([...of("sleep"), ...of("workshop").map(o => ({...o, id: o.id + 100}))], "hens"), "several");
});

test("every type in the list is what the exporter makes of a mod with just its game objects", async () => {
  for (const t of PLACEABLE_TYPES) {
    const animal = ["hens", "cows", "sheep"].includes(t.id) ? t.id : "hens";
    const {files} = await makeModPackage({name: "Typ", posts, objects: of(t.group), animal});
    const xml = text(files.get("house.xml"));
    if (t.gameType) assert.ok(xml.includes(`<placeable type="${t.gameType}">`), `${t.id}: ${xml.match(/<placeable type="[^"]*"/)}`);
    else assert.match(xml, /<placeable type="[^"]*VehicleShop"/, t.id + " (the mod defines its type)");
  }
});

test("choosing a type: what the type needs is added and what belongs to another type is taken away", () => {
  const sleep = of("sleep"), both = [...sleep, ...of("workshop").map(o => ({...o, id: o.id + 100}))];
  assert.deepEqual(typeChange([], "sleep", "hens"), {remove: [], add: "sleep"});
  assert.deepEqual(typeChange(sleep, "workshop", "hens"), {remove: ["sleep"], add: "workshop"});
  assert.deepEqual(typeChange(sleep, "decoration", "hens"), {remove: ["sleep"], add: null});
  assert.deepEqual(typeChange(sleep, "sleep", "hens"), {remove: [], add: null}, "it is that type already");
  assert.deepEqual(typeChange(both, "sleep", "hens"), {remove: ["workshop"], add: null}, "from several to one of them");
  assert.deepEqual(typeChange(of("cows"), "hens", "cows"), {remove: ["cows"], add: "hens"}, "another animal");
  assert.deepEqual(typeChange([], "decoration", "hens"), {remove: [], add: null});
  assert.throws(() => typeChange([], "nonsense", "hens"));
});

test("the mod's page has the list, with the type the mod is as the choice, and chooses through one save (so that undo takes it back)", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../src/app/mods/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /async function chooseType\(/);
  assert.match(page, /value=\{placeableOf\(objects, animal\)\} onChange=\{e => chooseType\(e\.target\.value\)\}/);
  assert.match(page, /PLACEABLE_TYPES\.map\(/);
  assert.match(page, /typeChange\(objects, typeId, animal\)/);
  assert.match(page, /save\(add && add in ANIMALS \? \{ objects: next, animal: add \} : \{ objects: next \}\)/);
});
