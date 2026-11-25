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

test("the photo can be shown for the crop or for the perspective, with four corners to drag", () => {
  assert.match(page, /function QuadEditor\(/);
  assert.match(page, /<QuadEditor /);
  for (const text of ["Perspective", "Remove the correction"]) assert.ok(page.includes(text), text);
  assert.match(page, /quad: Quad \| null/);
  assert.match(page, /quad: n\.quad,/, "the quadrilateral goes into prepareSource");
  assert.match(page, /onPointerUp/, "the picture is made again when a corner is let go, not at every move");
});

test("the photo can be retouched: a brush that clones from a place or paints, strokes kept in the draft and laid on the photo as it was read", () => {
  assert.match(page, /function RetouchEditor\(/);
  assert.match(page, /<RetouchEditor /);
  for (const text of ["Retouch", "Clone", "Paint", "Brush size", "Softness", "Choose another source", "Undo the last stroke", "Remove the retouching"]) assert.ok(page.includes(text), text);
  assert.match(page, /strokes: Stroke\[\]/);
  assert.match(page, /prepareSource\(n\.original, \{ strokes: n\.strokes, quad: n\.quad,/);
  assert.match(page, /retouch\(draft\.original, draft\.strokes\)/, "the photo as it is shown while retouching, and under the corners");
});
