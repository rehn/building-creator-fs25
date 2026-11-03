// The game mod export: modDesc.xml and the placeable (store) XML.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, modName, modDescXml, placeableXml, placeableSnippet, MOD_FILES, authorName, defaultModDescription } from "../src/editor/model.mjs";

// Minimal well-formedness check: every tag closes in order, attributes are quoted, no stray & or <.
function assertWellFormed(xml, what) {
  assert.match(xml, /^<\?xml version="1.0" encoding="utf-8"/, `${what}: prolog`);
  let body = xml.replace(/^<\?xml[^>]*\?>/, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  const stack = [];
  for (const m of body.matchAll(/<(\/?)([A-Za-z][\w.:-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>/g)) {
    if (m[1]) assert.equal(stack.pop(), m[2], `${what}: </${m[2]}> closes the wrong tag`);
    else if (!m[4]) stack.push(m[2]);
  }
  assert.deepEqual(stack, [], `${what}: unclosed tags`);
  const text = body.replace(/<(\/?)([A-Za-z][\w.:-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>/g, "");
  assert.doesNotMatch(text, /</, `${what}: stray <`);
  assert.doesNotMatch(body, /&(?!(amp|lt|gt|quot|apos);)/, `${what}: unescaped &`);
}
const tag = (xml, name) => (xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`)) || [])[1];

test("modName: a mod folder name the game accepts", () => {
  assert.equal(modName("Röda stugan"), "FS25_RodaStugan");
  assert.equal(modName("  my  house v2 "), "FS25_MyHouseV2");
  assert.equal(modName("3 rum & kök"), "FS25_House3RumKok");
  assert.equal(modName(""), "FS25_House");
  assert.equal(modName("???"), "FS25_House");
  assert.match(modName("a".repeat(100)), /^FS25_A{1}a{0,39}$/);
  assert.ok(modName("a".repeat(100)).length <= 45);
});

test("sanitize: mod price, upkeep and texts", () => {
  const d = sanitize({});
  assert.ok(d.modPrice > 0 && d.modUpkeep > 0);
  assert.equal(d.modAuthor, "");
  const p = sanitize({ modPrice: -5, modUpkeep: 1e9, modAuthor: "  Lars  ", modDescription: "x".repeat(5000) });
  assert.equal(p.modPrice, 0);
  assert.ok(p.modUpkeep <= 5000);
  assert.equal(p.modAuthor, "Lars");
  assert.ok(p.modDescription.length <= 1000);
  assert.equal(sanitize({ modAuthor: 42 }).modAuthor, "");
});

test("mod: placeable XML is a farmhouse with the house's price and upkeep", () => {
  const p = sanitize({ modPrice: 123000, modUpkeep: 95 });
  const xml = placeableXml(p, "Röda stugan");
  assertWellFormed(xml, "placeable");
  assert.match(xml, /<placeable type="farmhouse"/);
  assert.equal(tag(xml, "name"), "Röda stugan");
  assert.equal(tag(xml, "price"), "123000");
  assert.equal(tag(xml, "dailyUpkeep"), "95");
  assert.equal(tag(xml, "image"), MOD_FILES.store);
  assert.equal(tag(xml, "filename"), MOD_FILES.i3d);
  assert.equal(tag(xml, "category"), "farmhouses");
  assert.match(xml, /<function>\$l10n_function_farmHouse<\/function>/);
  assert.match(xml, /<brush>\s*<type>placeable<\/type>\s*<category>buildings<\/category>\s*<tab>farmhouses<\/tab>\s*<\/brush>/);
  for (const t of ["canBeSold", "showInStore"]) assert.equal(tag(xml, t), "true");
  // it carries every block and mapping of the paste-in snippet
  for (const m of placeableSnippet(p).matchAll(/<i3dMapping [^>]+\/>/g)) assert.ok(xml.includes(m[0]), m[0]);
  assert.match(xml, /<farmhouse spawnNode="spawnPoint">/);
});

test("mod: without a sleep point the house is a plain placeable", () => {
  const xml = placeableXml(sanitize({ sleepPoint: false }), "Shed");
  assertWellFormed(xml, "placeable");
  assert.match(xml, /<placeable type="simplePlaceable"/);
  assert.doesNotMatch(xml, /farmhouse spawnNode|sleeping/);
  assert.match(xml, /<function>\$l10n_function_decoration<\/function>/);
});

test("mod: names and texts are escaped", () => {
  const p = sanitize({ modAuthor: `Lars & "Co" <dev>`, modDescription: "Nice ]]> house & barn" });
  const name = `A & B <"x">`;
  for (const [what, xml] of [["placeable", placeableXml(p, name)], ["modDesc", modDescXml(p, name)]]) {
    assertWellFormed(xml, what);
    assert.ok(!xml.includes("<\"x\">"), what);
  }
  const md = modDescXml(p, name);
  assert.equal(tag(md, "author"), "Lars &amp; &quot;Co&quot; &lt;dev&gt;");
  assert.match(md, /<en>A &amp; B &lt;&quot;x&quot;&gt;<\/en>/);
});

test("mod: modDesc points at the store XML and icon", () => {
  const md = modDescXml(sanitize({ modAuthor: "Lars", modDescription: "Red cottage.\nSleep here." }), "Röda stugan");
  assertWellFormed(md, "modDesc");
  assert.match(md, /<modDesc descVersion="\d+">/);
  assert.equal(tag(md, "author"), "Lars");
  assert.match(tag(md, "version"), /^\d+\.\d+\.\d+\.\d+$/);
  assert.match(tag(md, "title"), /<en>Röda stugan<\/en>/);
  assert.match(tag(md, "description"), /Red cottage\.\nSleep here\./);
  assert.equal(tag(md, "iconFilename"), MOD_FILES.icon);
  assert.match(md, /<multiplayer supported="true"\s*\/>/);
  assert.match(md, new RegExp(`<storeItem xmlFilename="${MOD_FILES.xml}"\\s*/>`));
  // the author is required by the schema, so there is always one
  assert.ok(tag(modDescXml(sanitize({}), "x"), "author").length > 0);
});

test("mod: without an author of its own, the mod is by the logged-in user", () => {
  assert.equal(tag(modDescXml(sanitize({}), "x", { author: "Lars Rehn" }), "author"), "Lars Rehn");
  assert.equal(tag(modDescXml(sanitize({}), "x", { author: "A & B" }), "author"), "A &amp; B");
  assert.equal(tag(modDescXml(sanitize({ modAuthor: "Someone" }), "x", { author: "Lars Rehn" }), "author"), "Someone", "the house's own author wins");
  assert.equal(tag(modDescXml(sanitize({}), "x", { author: "   " }), "author"), "House to i3d");
});

test("defaultModDescription: describes the house, and is used when the description is empty", () => {
  const p = sanitize({ width: 12, depth: 8, sleepPoint: true });
  assert.match(defaultModDescription(p), /12\.0 x 8\.0 m/);
  assert.match(defaultModDescription(p), /sleep/i);
  assert.doesNotMatch(defaultModDescription(sanitize({ sleepPoint: false })), /sleep/i);
  assert.ok(modDescXml(p, "x").includes(defaultModDescription(p)));
  assert.ok(!modDescXml(sanitize({ ...p, modDescription: "Mine." }), "x").includes(defaultModDescription(p)));
});

test("authorName: the user's name, else the start of their email", () => {
  assert.equal(authorName({ name: "Lars Rehn", email: "lars@example.com" }), "Lars Rehn");
  assert.equal(authorName({ name: "  ", email: "lars.rehn@example.com" }), "lars.rehn");
  assert.equal(authorName(null), "");
});
