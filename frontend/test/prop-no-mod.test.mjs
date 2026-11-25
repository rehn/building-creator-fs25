// A prop has no game logic (docs/PLAN_MALLAR.md: the mod holds it) and so no shop price, upkeep or "can be sold", and no game mod of its own to download (Lars, 2026-11-25).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { sanitize } from "../src/builder/model.mjs";

const src = p => readFileSync(new URL("../src/" + p, import.meta.url), "utf8");

test("a prop is parts, materials and the item it was saved as, and nothing of a shop", () => {
  assert.equal("mod" in sanitize({}), false);
  assert.equal("mod" in sanitize({mod: {price: 5, upkeep: 1, sellable: false}}), false, "what an older prop kept is dropped at the next save");
});

test("the modeller has no shop settings and no game mod to download", () => {
  const b = src("builder/Builder.tsx"), page = src("app/builder/[id]/page.tsx");
  for (const text of ["Price in the shop", "Upkeep per day", "Can be bought and sold"]) assert.ok(!b.includes(text), text);
  assert.ok(!page.includes("Download game mod") && !page.includes("exportMod"), "no game mod of a single prop");
  assert.ok(page.includes("Download i3d + atlas") && page.includes("Save as item"), "the i3d and the item stay");
});

test("the exporter of a prop as a game mod of its own is gone (a mod exports its props as references)", () => {
  assert.equal(existsSync(new URL("../src/builder/mod.mjs", import.meta.url)), false);
});
