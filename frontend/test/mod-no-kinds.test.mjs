// The mod owns the yard of its animals (docs/PLAN_MALLAR.md step 1): the code of the mod (the frame, its objects, its export and the yard itself) does not import the building types that have animals
// (kinds/chicken.mjs, cow.mjs, sheep.mjs), so those can lose their game logic without the mod noticing. The animal barns import the yard, not the other way round.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = f => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
const imports = f => [...src(f).matchAll(/^(?:import|export)\s[^;]*?from\s+"([^"]+)"/gm)].map(m => m[1]);

test("the mod's code does not import the animal building types", () => {
  for (const f of ["editor/mod/yard.mjs", "editor/kinds/modframe.mjs", "editor/kinds/modinside.mjs", "editor/modExport.mjs", "editor/modView.mjs", "editor/modPlan.mjs", "lib/modObjects.mjs"])
    for (const i of imports(f)) assert.ok(!/(^|\/)(chicken|cow|sheep)\.mjs$/.test(i), `${f} imports ${i}`);
});

test("the yard imports only helpers, never a building type", () => {
  for (const i of imports("editor/mod/yard.mjs")) assert.ok(!/kinds\/[a-z]+\.mjs$/.test(i) || /kinds\/pasture\.mjs$/.test(i), `yard.mjs imports ${i}`);
});

test("the animal barns take the yard from the mod's module", () => {
  for (const f of ["editor/kinds/chicken.mjs", "editor/kinds/cow.mjs", "editor/kinds/sheep.mjs"]) assert.ok(imports(f).some(i => /mod\/yard\.mjs$/.test(i)), `${f} uses the yard`);
});
