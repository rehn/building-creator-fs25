// Lars (2026-11-25): "I can no longer find where to set how many animals I can have". The number was only on the card of one object of the yard, found by choosing
// Game objects > the yard > an object. It is on the mod's own card and on the Game objects card now (when the mod has a yard).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/app/mods/[id]/page.tsx", import.meta.url), "utf8");

test("the number of animals is one card that the mod's card and the Game objects card both show", () => {
  assert.match(src, /const animalsCard = /);
  assert.match(src, /label=\{t\(animal === "hens" \? "Hens"/, "the slider is named after the animal");
  assert.match(src, /sel\.kind === "group" && animalsCard/, "on the Game objects card");
  assert.match(src, /\{animalsCard\}/, "on the mod's own card");
});

test("it is only shown when the mod has a yard for the animals", () => {
  assert.match(src, /const hasYard = .*groupOf\(o\.type, animal\) === animal/);
  assert.match(src, /animalsCard = hasYard &&/);
});
