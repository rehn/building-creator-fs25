// A mod has a preview picture in the list of mods (Lars, 2026-11-25), made from the view of the mod and saved with the mod (PATCH /api/mods/{id} {thumbnail}).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = p => readFileSync(new URL("../src/" + p, import.meta.url), "utf8");

test("the api has the picture of a mod", () => {
  const api = src("lib/api.ts");
  assert.match(api, /interface Mod \{[^}]*thumbnail\?: string/s);
  assert.match(api, /updateMod: \(id: string, patch: \{[^}]*thumbnail\?: string/);
});

test("the view can make a picture of itself as a data URL", () => {
  const view = src("editor/modView.mjs");
  assert.match(view, /function thumbnail\(/);
  assert.match(view, /toDataURL\("image\/jpeg"/);
  assert.match(view, /show, showObjects, select, selectPoint, setMap, hasMap, picture, thumbnail/);
});

test("the mod's page saves a picture of the view when the mod has changed and its buildings are drawn", () => {
  const page = src("app/mods/[id]/page.tsx");
  assert.match(page, /view\.current\?\.thumbnail\(/);
  assert.match(page, /api\.updateMod\(m\.id, \{ thumbnail: /);
});

test("the list of mods shows it, and says there is none yet otherwise", () => {
  const list = src("app/mods/page.tsx");
  assert.match(list, /m\.thumbnail \? <img src=\{m\.thumbnail\}/);
  assert.match(list, /No preview yet/);
});
