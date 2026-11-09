// Language support: English texts are the keys; a language file (src/i18n/locales/<lang>.json) maps them to its own text. English is the default.
import { test } from "node:test";
import assert from "node:assert/strict";
import { t, setLang, getLang, LANGS, placeholders } from "../src/i18n/index.mjs";
import sv from "../src/i18n/locales/sv.json" with { type: "json" };
import en from "../src/i18n/locales/en.json" with { type: "json" };

test.afterEach(() => setLang("en"));

test("i18n: English is the default and gives the text itself, with {values} filled in", () => {
  assert.equal(getLang(), "en");
  assert.equal(t("Walk around"), "Walk around");
  assert.equal(t("{n} parts on {wall}", { n: 3, wall: "the back" }), "3 parts on the back");
  assert.equal(t("Nothing to {do}", {}), "Nothing to {do}", "a value that isn't given stays as written");
});

test("i18n: another language gives its own text, and the text itself where it has none", () => {
  setLang("sv");
  assert.equal(getLang(), "sv");
  assert.equal(t("Walk around"), sv["Walk around"]);
  assert.notEqual(sv["Walk around"], "Walk around");
  assert.equal(t("A text nobody has translated"), "A text nobody has translated");
  assert.equal(t("{n} parts on {wall}", { n: 3, wall: "x" }), (sv["{n} parts on {wall}"] || "{n} parts on {wall}").replace("{n}", "3").replace("{wall}", "x"));
  setLang("klingon");
  assert.equal(getLang(), "en", "a language we don't have is English");
});

test("i18n: the languages on offer", () => {
  assert.deepEqual(LANGS.map(l => l[0]), ["en", "sv"]);
  assert.ok(LANGS.every(l => l[1]));
});

test("language files: every text has the same {values} as its English, and is not empty", () => {
  for (const [name, file] of [["sv", sv]]) for (const [key, text] of Object.entries(file)) {
    assert.equal(typeof text, "string", `${name}: ${key}`);
    assert.ok(text.trim().length > 0, `${name}: "${key}" is empty`);
    assert.deepEqual(placeholders(text), placeholders(key), `${name}: "${key}" and its text must have the same {values}`);
  }
  for (const [key, text] of Object.entries(en)) assert.equal(text, key, `en: "${key}" is its own text`);
});
