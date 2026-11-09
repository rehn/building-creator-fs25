import { test } from "node:test";
import assert from "node:assert/strict";
import { modDescXmlMulti, modName, slugify, placeableXml, sanitize } from "../src/editor/model.mjs";

test("mod of several buildings: modDesc lists every building's placeable in its own folder", () => {
  const xml = modDescXmlMulti([{xml: "red_barn/house.xml"}, {xml: "farmhouse/house.xml"}, {xml: "sheep_barn/house.xml"}], {title: "My farm", description: "Three buildings.", author: "Lars"});
  assert.match(xml, /<modDesc descVersion="\d+">/);
  assert.match(xml, /<author>Lars<\/author>/);
  assert.match(xml, /<en>My farm<\/en>/);
  assert.match(xml, /<iconFilename>icon.png<\/iconFilename>/);
  assert.deepEqual([...xml.matchAll(/<storeItem xmlFilename="([^"]+)"\/>/g)].map(m => m[1]), ["red_barn/house.xml", "farmhouse/house.xml", "sheep_barn/house.xml"]);
  assert.match(xml, /<!\[CDATA\[Three buildings.\]\]>/);
});

test("mod of several buildings: names are escaped, an empty title and author have defaults, the file name follows the title", () => {
  const xml = modDescXmlMulti([{xml: "a&b/house.xml"}], {title: "<Farm> & co", author: "  "});
  assert.match(xml, /<en>&lt;Farm&gt; &amp; co<\/en>/);
  assert.match(xml, /<author>House to i3d<\/author>/);
  assert.match(xml, /xmlFilename="a&amp;b\/house.xml"/);
  assert.match(modDescXmlMulti([], {title: ""}), /<en>House<\/en>/);
  assert.equal(modName("My farm"), "FS25_MyFarm");
  assert.equal(slugify("Röd ladugård 2"), "rod_ladugard_2");
});

test("mod of several buildings: the placeable's shop picture and i3d are named from the mod's root (the game does not read them from the XML's folder)", () => {
  const xml = placeableXml(sanitize({}), "House", {dir: "farmhouse/"});
  assert.match(xml, /<image>farmhouse\/store.png<\/image>/);
  assert.match(xml, /<filename>farmhouse\/house.i3d<\/filename>/);
  // a single building's mod is in the root as before
  const one = placeableXml(sanitize({}), "House");
  assert.match(one, /<image>store.png<\/image>/);
  assert.match(one, /<filename>house.i3d<\/filename>/);
  // nothing else in the XML is a path of the mod
  assert.deepEqual([...xml.matchAll(/<(?:image|filename|xmlFilename)>([^<]+)</g)].map(m => m[1]), ["farmhouse/store.png", "farmhouse/house.i3d"]);
});
