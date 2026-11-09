import { test } from "node:test";
import assert from "node:assert/strict";
import { evalNumber } from "../src/editor/calc.mjs";

test("calc: plain numbers, with a comma or a dot, with a unit after", () => {
  assert.equal(evalNumber("6.54"), 6.54);
  assert.equal(evalNumber("6,54"), 6.54);
  assert.equal(evalNumber("  12 "), 12);
  assert.equal(evalNumber("2.5 m"), 2.5);
  assert.equal(evalNumber("45°"), 45);
  assert.equal(evalNumber("-3"), -3);
  assert.equal(evalNumber("+3"), 3);
  assert.equal(evalNumber(".5"), 0.5);
});

test("calc: sums, products and brackets: 10+100 is 110", () => {
  assert.equal(evalNumber("10+100"), 110);
  assert.equal(evalNumber("10 + 100 - 5"), 105);
  assert.equal(evalNumber("2*3+4"), 10);
  assert.equal(evalNumber("2+3*4"), 14);
  assert.equal(evalNumber("2*(3+4)"), 14);
  assert.equal(evalNumber("(1+2)*(3+4)"), 21);
  assert.equal(evalNumber("10/4"), 2.5);
  assert.equal(evalNumber("1,5+2,25"), 3.75);
  assert.equal(evalNumber("5-(-2)"), 7);
  assert.equal(evalNumber("1.1+2.2"), 3.3, "no 3.3000000000000003");
  assert.equal(evalNumber("6 x 3"), 18, "x as times");
  assert.equal(evalNumber("6×3"), 18);
});

test("calc: nonsense and anything but numbers and + - * / ( ) is not a number", () => {
  for (const bad of ["", "   ", "abc", "1+", "*2", "(1+2", "1+2)", "1/0", "2**3", "alert(1)", "1;2", "1e999", "1+a", "--"]) assert.equal(evalNumber(bad), null, JSON.stringify(bad));
  assert.equal(evalNumber(null), null);
  assert.equal(evalNumber(undefined), null);
  assert.equal(evalNumber(5), 5);
  assert.equal(evalNumber("9".repeat(400)), null);
});
