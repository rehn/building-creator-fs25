import test from "node:test";
import assert from "node:assert/strict";
import { setLang, translateText } from "../src/i18n/index.mjs";

test("English translates nothing", () => {
  setLang("en");
  assert.equal(translateText("Walk around"), null);
});

test("whole texts and texts with values are translated", () => {
  setLang("sv");
  assert.equal(translateText("Walk around"), "Gå runt");
  assert.equal(translateText("  Walk\n   around "), "Gå runt");
  assert.equal(translateText("Saved Barn"), "Sparade Barn");   // (a value with no translation stays as it is)
  assert.equal(translateText("Something nobody translated"), null);
  setLang("en");
});

test("an unknown language is English", () => {
  setLang("xx");
  assert.equal(translateText("Walk around"), null);
});

import { readFileSync } from "node:fs";
test("every Swedish text is one the app has, with the same {values}", async () => {
  const en = JSON.parse(readFileSync(new URL("../src/i18n/locales/en.json", import.meta.url), "utf8"));
  const sv = JSON.parse(readFileSync(new URL("../src/i18n/locales/sv.json", import.meta.url), "utf8"));
  const { placeholders } = await import("../src/i18n/index.mjs");
  const stale = Object.keys(sv).filter(k => !(k in en));
  assert.deepEqual(stale, [], "run npm run i18n after changing a text; remove or fix these in sv.json");
  for (const [k, v] of Object.entries(sv)) assert.deepEqual(placeholders(v), placeholders(k), k);
});
