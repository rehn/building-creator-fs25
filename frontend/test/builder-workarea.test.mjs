// The modeller has the same work area as the building and the mod (docs/DESIGN.md "Editor pages"): a tree in the left panel (TreeRow), the chosen thing's cards in the details panel,
// the view, with the panel widths and drag handles of usePanelSizes, and the number fields are RangeField (label and value on top, slider under).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/builder/Builder.tsx", import.meta.url), "utf8");
test("the modeller is laid out as the mod page", () => {
  assert.match(src, /<TreeRow[\s>]/, "the parts are a tree");
  assert.match(src, /usePanelSizes/, "the same panel widths");
  assert.match(src, /className="modedit"/, "the same work area");
  assert.match(src, /className="hx-panel/, "the left panel");
  assert.match(src, /className="hx-details/, "the details panel");
  assert.match(src, /className="hx-card"/, "settings in cards");
});
test("the modeller's number fields are RangeField", () => {
  assert.match(src, /<RangeField[\s>]/);
  assert.ok(!/type="range"/.test(src), "no slider of its own");
});
test("the mod page's tree rows are TreeRow too", () => {
  const mod = readFileSync(new URL("../src/app/mods/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(mod, /<TreeRow[\s>]/);
  assert.ok(!/className="caret"/.test(mod), "no tree row markup of its own");
});
