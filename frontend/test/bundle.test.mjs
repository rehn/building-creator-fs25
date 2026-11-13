// The model files the editor sends to the server when it saves: OBJ, MTL and a game mod zip.
import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { sanitize, placeableXml, modDescXml, KINDS } from "../src/editor/model.mjs";
import { modelBundle } from "../src/editor/bundle.mjs";

test("modelBundle: obj, mtl and a mod zip for every kind", async () => {
  for (const kind of Object.keys(KINDS)) {
    const b = await modelBundle({kind}, "Hönshuset", {author: "Lars"});
    assert.match(b.obj, /^mtllib model\.mtl$/m, kind);
    assert.match(b.mtl, /^newmtl /m, kind);
    const zip = await JSZip.loadAsync(b.mod);
    assert.deepEqual(Object.keys(zip.files).sort(), ["house.i3d", "house.xml", "modDesc.xml"], `${kind}: only what is there`);
    const xml = await zip.file("house.xml").async("string");
    assert.match(xml, /<placeable type=/);
    assert.match(xml, /<filename>house\.i3d<\/filename>/, "paths are relative to the root of the zip");
    assert.doesNotMatch(xml, /<image>/, "no shop picture to name");
    const desc = await zip.file("modDesc.xml").async("string");
    assert.match(desc, /<storeItem xmlFilename="house\.xml"\/>/);
    assert.match(desc, /<author>Lars<\/author>/);
    assert.doesNotMatch(desc, /iconFilename/, "no icon in the zip");
    const i3d = await zip.file("house.i3d").async("string");
    assert.match(i3d, /<i3D /);
    assert.doesNotMatch(i3d, /textures\//, "plain colours: no texture files to be missing");
  }
});

test("modelBundle: the i3d is written as the ISO-8859-1 it says it is", async () => {
  const b = await modelBundle({kind: "house"}, "x");
  const raw = await (await JSZip.loadAsync(b.mod)).file("house.i3d").async("uint8array");
  assert.match(new TextDecoder("iso-8859-1").decode(raw.slice(0, 60)), /encoding="iso-8859-1"/);
});

test("the shop picture and the icon are still in the ordinary export", () => {
  const p = sanitize({kind: "house"});
  assert.match(placeableXml(p, "x"), /<image>store\.png<\/image>/);
  assert.match(modDescXml(p, "x"), /<iconFilename>icon\.png<\/iconFilename>/);
});
