// Generate game mod on the mod page also sends the zip to the server (PUT /api/mods/{id}/package, with the mod's version), so that other programs
// (the map app) can fetch it (docs/PLAN_MALLAR.md step 3b).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the api has putModPackage, which sends the zip with the mod's version", () => {
  const src = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf8");
  assert.match(src, /putModPackage:/);
  assert.match(src, /\/package\?version=/);
  assert.match(src, /application\/zip/);
});
test("Generate game mod sends what it made", () => {
  const src = readFileSync(new URL("../src/app/mods/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(src, /api\.putModPackage\(mod\.id, mod\.version, blob\)/);
});
