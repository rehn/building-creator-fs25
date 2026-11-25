// Where a building shows in the game's shop and in the construction menu. A farmhouse made into a shop was exported as a farmhouse (category farmhouses): the category is a choice.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, placeableXml, PRESETS } from "../src/editor/model.mjs";
import { SHOP_CATEGORIES, SHOP_KINDS, shopFor } from "../src/editor/kinds/shop.mjs";

const where = xml => ({category: xml.match(/<category>([^<]*)<\/category>\s*<brush>/)[1], brush: xml.match(/<brush>\s*<type>([^<]*)<\/type>\s*<category>([^<]*)<\/category>\s*<tab>([^<]*)<\/tab>/).slice(1)});

test("the choices are combinations the game's own placeables use (store category, construction category, tab)", () => {
  assert.deepEqual(SHOP_CATEGORIES.map(c => c[0]), ["auto", "farmhouses", "sheds", "gardenSheds", "decoration"]);
  const fh = shopFor({shopCategory: "farmhouses"}, null), gs = shopFor({shopCategory: "gardenSheds"}, null), deco = shopFor({shopCategory: "decoration"}, null);
  assert.deepEqual(fh, {category: "farmhouses", type: "placeable", brush: "buildings", tab: "farmhouses"});
  assert.deepEqual(gs, {category: "gardenSheds", type: "placeable", brush: "decoration", tab: "uncategorized"});
  assert.deepEqual(deco, {category: "decoration", type: "placeable", brush: "decoration", tab: "decoration"});
  assert.deepEqual(shopFor({shopCategory: "sheds"}, null), {category: "sheds", type: "placeable", brush: "buildings", tab: "sheds"});
});

test("auto (and anything unknown) is what the kind has", () => {
  const own = {category: "farmhouses", type: "placeable", brush: "buildings", tab: "farmhouses"};
  assert.equal(shopFor({shopCategory: "auto"}, own), own);
  assert.equal(shopFor({}, own), own);
  assert.equal(shopFor({shopCategory: "nonsense"}, own), own);
});

test("the setting is kept as a known choice, auto to start with", () => {
  assert.equal(sanitize({kind: "house"}).shopCategory, "auto");
  assert.equal(sanitize({kind: "house", shopCategory: "decoration"}).shopCategory, "decoration");
  assert.equal(sanitize({kind: "house", shopCategory: "nonsense"}).shopCategory, "auto");
});

test("a house made into a shop is not in the farmhouses unless it is told to be", () => {
  const xml = p => placeableXml(sanitize({kind: "house", objects: [], ...p}), "Affär");
  assert.deepEqual(where(xml({})), {category: "farmhouses", brush: ["placeable", "buildings", "farmhouses"]}, "as before");
  assert.deepEqual(where(xml({shopCategory: "decoration"})), {category: "decoration", brush: ["placeable", "decoration", "decoration"]});
  assert.deepEqual(where(xml({shopCategory: "sheds"})), {category: "sheds", brush: ["placeable", "buildings", "sheds"]});
  assert.match(xml({shopCategory: "decoration"}), /<placeable type="simplePlaceable">/);
});

