// LOD: the i3d has a simpler model for far away (visuals_lod, lodDistance "0 N"): LOD0 = everything, LOD1 = the outside shell
// (no inside, no gutters or downpipes, no ironwork), sharing LOD0's meshes so the file doesn't grow.
import test from "node:test";
import assert from "node:assert/strict";
import { PRESETS, sanitize, buildI3d } from "../src/editor/model.mjs";

const preset = id => PRESETS.find(x => x.id === id).settings;
const make = (id, extra = {}) => sanitize({...preset(id), ...extra});
/** The xml of the node called name and everything under it (nodes are written one per line, indented by depth). */
function subtree(xml, name) {
  const lines = xml.split("\n"), i = lines.findIndex(l => l.includes(`name="${name}"`));
  if (i < 0) return "";
  const depth = lines[i].search(/\S/), out = [lines[i]];
  for (let j = i + 1; j < lines.length && lines[j].search(/\S/) > depth; j++) out.push(lines[j]);
  return out.join("\n");
}
const names = xml => [...xml.matchAll(/<Shape name="([^"]+)"/g)].map(m => m[1]);

test("lodDistance is a setting, 80 m to start with, 0 = off", () => {
  assert.equal(make("ladugard").lodDistance, 80);
  assert.equal(make("ladugard", {lodDistance: 0}).lodDistance, 0);
});

test("visuals_lod holds LOD0 (all) and LOD1 (the shell)", () => {
  const xml = buildI3d(make("ladugard", {gutters: true, downpipes: 2}));
  const lod = subtree(xml, "visuals_lod");
  assert.match(lod, /name="visuals_lod" translation="0 0 0" lodDistance="0 80"/);
  const l0 = names(subtree(xml, "LOD0")), l1 = names(subtree(xml, "LOD1"));
  assert.ok(l0.length > l1.length && l1.length > 0, "LOD1 has fewer parts");
  for (const gone of ["fittings", "gutter", "iron", "interior", "wallsIn"]) assert.ok(!l1.some(n => n.startsWith(gone)), `${gone} left out of LOD1`);
  for (const kept of ["walls", "roof"]) assert.ok(l1.some(n => n.startsWith(kept)), `${kept} kept in LOD1`);
});

test("LOD1 uses the same meshes as LOD0 (no extra geometry)", () => {
  const xml = buildI3d(make("ladugard"));
  const ids = n => [...subtree(xml, n).matchAll(/shapeId="(\d+)"/g)].map(m => m[1]);
  const l0 = new Set(ids("LOD0"));
  assert.ok(ids("LOD1").length > 0 && ids("LOD1").every(id => l0.has(id)));
});

test("off: no LOD groups, visuals as before", () => {
  const xml = buildI3d(make("ladugard", {lodDistance: 0}));
  assert.ok(!xml.includes("lodDistance") && !xml.includes('name="LOD1"'));
  assert.ok(xml.includes('name="visuals"'));
});

test("every kind exports with LOD", () => {
  for (const x of PRESETS) {
    const xml = buildI3d(sanitize(x.settings));
    assert.match(xml, /lodDistance="0 80"/, x.id);
  }
});
