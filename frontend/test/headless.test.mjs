// A building's files made without a browser (PLAN_OSM.md, step 2): the game mod and the model export, as the editor packs them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeModFiles, makeFiles } from "../src/editor/headless.mjs";
import { sanitize, i3dFiles, buildObj, placeableSnippet, slugify } from "../src/editor/model.mjs";
import { osmToHouse } from "../src/editor/osm.mjs";

const SETTINGS = { kind: "house", wallColor: "#8E2A1E" };
const latin1 = text => Uint8Array.from(text, c => c.charCodeAt(0) & 255);
const text = v => typeof v === "string" ? v : Buffer.from(v).toString("latin1");
const first = makeModFiles(SETTINGS, "Storgatan 4", { author: "Karta" });   // (the first one makes the surfaces: the slow one)

test("the game mod has what a map takes: modDesc, the placeable XML, the i3d, its shapes and every texture the i3d names", () => {
  const f = first.mod, names = [...f.keys()];
  for (const n of ["modDesc.xml", "house.xml", "house.i3d", "house.i3d.shapes"]) assert.ok(f.has(n), "missing " + n);
  assert.ok(!f.has("store.dds") && !f.has("icon.dds"), "no pictures from the server");
  const i3d = text(f.get("house.i3d")), named = [...i3d.matchAll(/filename="([^"]*\.dds)"/g)].map(m => m[1]);
  assert.ok(named.length > 5, "the i3d names its textures");
  for (const n of named) assert.ok(f.has(n), `${n} is named in the i3d but not in the mod`);
  for (const n of names.filter(n => n.endsWith(".dds"))) assert.equal(Buffer.from(f.get(n).slice(0, 4)).toString(), "DDS ", n + " is a DDS file");
  assert.match(text(f.get("modDesc.xml")), /Storgatan 4/);
  assert.match(text(f.get("modDesc.xml")), /Karta/);
  assert.match(text(f.get("house.xml")), /house\.i3d/);
});

test("the i3d is the editor's, written as ISO-8859-1", () => {
  const p = sanitize(SETTINGS), files = i3dFiles(p, { withTex: true });
  assert.deepEqual(first.mod.get("house.i3d"), latin1(files["house.i3d"]));
  assert.deepEqual(first.mod.get("house.i3d.shapes"), files["house.i3d.shapes"]);
});

test("the rooms behind the windows and the glass have a texture, plain ones", () => {
  const p = sanitize(SETTINGS);
  assert.ok(p.interior, "a house has rooms behind its windows");
  assert.ok(first.mod.has("textures/interior_diffuse.dds") && first.mod.has("textures/glass_diffuse.dds"));
});

test("the OBJ and MTL are the model's", () => {
  const { obj, mtl } = buildObj(sanitize(SETTINGS));
  assert.equal(first.obj, obj);
  assert.equal(first.mtl, mtl);
});

test("the model export is a folder named after the building with the i3d, the snippet and the textures", () => {
  const dir = slugify("Storgatan 4") + "/", e = first.export;
  assert.ok(e.has(dir + "house.i3d") && e.has(dir + "placeable_snippet.xml"));
  assert.equal(text(e.get(dir + "placeable_snippet.xml")), placeableSnippet(sanitize(SETTINGS)));
  assert.deepEqual([...e.keys()].filter(n => n.includes("textures/")).sort(), [...first.mod.keys()].filter(n => n.startsWith("textures/")).map(n => dir + n).sort());
});

test("a surface made once is encoded once: a second house with other colours encodes only what is new", () => {
  let n = 0;
  const encode = (w, h) => { n++; return new Uint8Array([68, 68, 83, 32, w & 255, h & 255]); };
  makeModFiles({ kind: "house", wallColor: "#112233", roofColor: "#445566" }, "A", { encode });
  const first = n;
  makeModFiles({ kind: "house", wallColor: "#778899", roofColor: "#445566" }, "B", { encode });
  const second = n - first;
  assert.ok(second > 0 && second < first, `the first house encoded ${first}, the second ${second}`);
  assert.ok(second <= 3, `the second house has only its walls in a new colour (${second})`);
  makeModFiles({ kind: "house", wallColor: "#778899", roofColor: "#445566" }, "B again", { encode });
  assert.equal(n - first - second, 0, "the same house again encodes nothing");
});

test("a house made from an OSM footprint gets all its files", () => {
  const r = osmToHouse({ footprint: [[0, 0], [12, 0], [12, 6], [6, 6], [6, 14], [0, 14]], tags: { building: "house" }, id: "way/1" });
  assert.ok(r.ok);
  const f = makeModFiles(r.settings, r.name);
  assert.ok(f.mod.has("house.i3d") && f.mod.has("house.xml"));
  const named = [...text(f.mod.get("house.i3d")).matchAll(/filename="([^"]*\.dds)"/g)].map(m => m[1]);
  for (const n of named) assert.ok(f.mod.has(n), n);
});

test("makeFiles packs them as zips for the API (needs jszip)", async t => {
  let JSZip;
  try { JSZip = (await import("jszip")).default; } catch { return t.skip("jszip is not installed here"); }
  const files = await makeFiles(SETTINGS, "Storgatan 4", { author: "Karta" });
  assert.equal(files.obj, first.obj);
  const mod = await JSZip.loadAsync(files.mod), exp = await JSZip.loadAsync(files.export);
  for (const n of ["modDesc.xml", "house.xml", "house.i3d"]) assert.ok(mod.file(n), n);
  assert.ok(exp.file(slugify("Storgatan 4") + "/house.i3d"));
});
