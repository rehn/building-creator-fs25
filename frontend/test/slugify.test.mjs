import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify } from "../src/editor/model.mjs";

test("slugify: Swedish letters become plain ASCII", () => {
  assert.equal(slugify("Stugan vid sjön"), "stugan_vid_sjon");
  assert.equal(slugify("Gården i Älvsjö"), "garden_i_alvsjo");
});
test("slugify: symbols and spaces collapse to single underscores", () => {
  assert.equal(slugify("  Röd stuga!! (v2) "), "rod_stuga_v2");
});
test("slugify: empty or unusable names fall back to house", () => {
  assert.equal(slugify(""), "house");
  assert.equal(slugify(null), "house");
  assert.equal(slugify("???"), "house");
});
test("slugify: long names are cut to 60 characters", () => {
  assert.equal(slugify("a".repeat(100)).length, 60);
});
