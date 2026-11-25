// My textures edits the photo before it is made a texture (Lars, 2026-11-25): flip and turn, and the colour. The page keeps the photo as it was read and makes the picture the rest works on from it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/app/textures/page.tsx", import.meta.url), "utf8");

test("the draft keeps the photo as it was read, and the picture is made from it", () => {
  assert.match(page, /import \{[^}]*prepareSource[^}]*\} from "@\/editor\/photoEdit\.mjs"/);
  assert.match(page, /original: Picture/);
  assert.match(page, /prepareSource\(n\.original, /);
});

test("there are buttons to flip and turn, and sliders for the colour with the limits of the pure functions", () => {
  for (const text of ["Flip left to right", "Flip up and down", "Turn left", "Turn right", "Brightness", "Contrast", "Saturation", "Colour shift"]) assert.ok(page.includes(text), text);
  assert.match(page, /COLOR_LIMITS/);
  assert.match(page, /Reset the edits/);
});

test("the colour reaches makePhotoTexture, and the preview is made again when it changes", () => {
  assert.match(page, /brightness: d\.brightness, contrast: d\.contrast, saturation: d\.saturation, hue: d\.hue/);
  assert.match(page, /\[d\.picture, [^\]]*d\.brightness, d\.contrast, d\.saturation, d\.hue\]/);
});
