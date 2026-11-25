// The page of a building has Undo and Redo in its sub-bar (Lars, 2026-11-25), told by the editor when there is something to undo or redo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = p => readFileSync(new URL("../src/" + p, import.meta.url), "utf8");

test("the editor tells the page, and the page has the buttons", () => {
  assert.match(src("editor/Editor.tsx"), /onHistory/);
  assert.match(src("editor/editor.d.mts"), /undo\(\): boolean/);
  const page = src("app/projects/[id]/page.tsx");
  assert.match(page, /editor\.current\?\.undo\(\)/);
  assert.match(page, /editor\.current\?\.redo\(\)/);
  assert.match(page, /!history\.canUndo/);
  assert.match(page, /!history\.canRedo/);
  assert.match(page, /onHistory=\{setHistory\}/);
});
