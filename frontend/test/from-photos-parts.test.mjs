// Photos to parts (docs/PLAN_PARTS.md, step 6): the guide and the answer's schema know parts on parts, names and a part's own look.
import { test } from "node:test";
import assert from "node:assert/strict";
import { photoRequest, applyAnswer } from "../src/editor/fromPhotos.mjs";

// Structured outputs take a subset of JSON schema: every object closed and fully required, no ranges.
function checkSchema(s, path = "$") {
  for (const k of ["minimum", "maximum", "pattern", "minLength", "maxLength", "format"]) assert.ok(!(k in s), `${path}: no ${k}`);
  if (s.type === "object") {
    assert.equal(s.additionalProperties, false, `${path} is closed`);
    assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort(), `${path}: every property is required`);
    for (const [k, v] of Object.entries(s.properties)) checkSchema(v, `${path}.${k}`);
  }
  if (s.type === "array") checkSchema(s.items, `${path}[]`);
}

test("from photos: a part can stand on another part, have a name and a look of its own (as its parent unless set)", () => {
  const { guide, schema } = photoRequest("house");
  checkSchema(schema);
  const item = schema.properties.wings.items;
  for (const k of ["name", "wallCladding", "wallColor", "roofMaterial", "roofColor", "trimColor"]) assert.ok(item.properties[k], k);
  assert.ok(item.properties.wall.enum.includes("back") && item.properties.wall.enum.includes("w1Left") && item.properties.wall.enum.includes("w3End"), "a wall of the building or of a part before it");
  assert.ok(item.properties.wallCladding.enum.includes("") && item.properties.wallCladding.enum.includes("plaster") && item.properties.roofMaterial.enum.includes(""), "empty: as its parent");
  assert.match(guide, /stands? (on|against) (another|a) (part|wing)|on another part/i);
  assert.match(guide, /as its parent|as the part it stands on|looks like its parent/i);
  assert.ok(schema.properties.openings.items.properties.wall.enum.includes("w2Right"));
  assert.ok(item.properties.wall.enum.length < 60, "not every wall there could ever be: only those up to the most parts");
});

test("from photos: an answer with a part on a part, names and own materials becomes a building with them", () => {
  const p = applyAnswer("house", {settings: {}, wings: [
    {wall: "back", along: 0.5, width: 6, depth: 6, floors: 0, half: false, pitch: 0, name: "Pumphus", wallCladding: "", wallColor: "", roofMaterial: "metal", roofColor: "#4A4F52", trimColor: ""},
    {wall: "w1Left", along: 0.5, width: 3, depth: 3, floors: 0, half: false, pitch: 0, name: "Bod", wallCladding: "plaster", wallColor: "#EAE6DC", roofMaterial: "", roofColor: "", trimColor: ""}],
  openings: [{wall: "front", type: "door", floor: 0, along: 0.5, width: 1.4, height: 2.3, sill: 0, porch: "none", opens: true}, {wall: "w2End", type: "window", floor: 0, along: 0.5, width: 1, height: 1.2, sill: 0.9, porch: "none", opens: true}]});
  assert.deepEqual(p.wings.map(w => [w.id, w.wall, w.name]), [[1, "back", "Pumphus"], [2, "w1Left", "Bod"]]);
  assert.equal(p.wings[0].roofMaterial, "metal");
  assert.equal(p.wings[0].roofColor, "#4A4F52");
  assert.equal(p.wings[0].wallCladding, undefined, "empty: as its parent");
  assert.equal(p.wings[1].wallCladding, "plaster");
  assert.equal(p.wings[1].roofMaterial, undefined);
  assert.ok(p.windows.some(w => w.wall === "w2End" && w.type === "window"), "a window on the part on the part");
});
