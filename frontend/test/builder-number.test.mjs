// The modeller's number fields keep what is typed until the field is left; this is the part that says when a draft is a number to use.
import { test } from "node:test";
import assert from "node:assert/strict";
import { draftValue, shownValue } from "../src/builder/number.mjs";

test("draftValue: a finished number is used; empty or half-typed is not (the field keeps the text)", () => {
  assert.equal(draftValue("32"), 32);
  assert.equal(draftValue("3"), 3);
  assert.equal(draftValue("-1.5"), -1.5);
  assert.equal(draftValue("0."), 0);
  assert.equal(draftValue(".5"), 0.5);
  for (const t of ["", " ", "-", ".", "1e", "abc", "1,5x", "Infinity", "NaN"]) assert.equal(draftValue(t), null, JSON.stringify(t));
});

test("shownValue: a number as text, without float noise", () => {
  assert.equal(shownValue(6), "6");
  assert.equal(shownValue(0.1 + 0.2), "0.3");
  assert.equal(shownValue(-0), "0");
  assert.equal(shownValue(12.345678), "12.346");
});
