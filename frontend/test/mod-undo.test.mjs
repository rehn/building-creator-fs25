// Undo and redo on the mod's page (Lars, 2026-11-25): a step is what the server holds of the mod (its posts and its plan data: the game objects, the animals, the inside),
// made at each save; undo saves the earlier state as a new version. The name, the folder and the preview are not part of it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { modState, sameModState } from "../src/lib/mods.mjs";
import { History } from "../src/editor/layout.mjs";

const mod = (extra = {}) => ({id: "m1", name: "Gården", folder: "", thumbnail: "", version: 3, itemCount: 1,
  items: [{id: "a", kind: "building", ref: "h1", type: "", x: 1, z: 2, y: 0, rot: 90, name: "Huset", missing: false}], data: {objects: [], animal: "hens"}, ...extra});

test("the state of a mod is its posts and its plan data, and nothing that is not undone", () => {
  const s = modState(mod());
  assert.deepEqual(s, {items: [{id: "a", kind: "building", ref: "h1", type: "", x: 1, z: 2, y: 0, rot: 90}], data: {objects: [], animal: "hens"}});
  assert.ok(sameModState(s, modState(mod({name: "Annat", folder: "Karta", thumbnail: "data:image/jpeg;base64,AA", version: 9}))), "name, folder, preview and version are not part of it");
  assert.ok(!sameModState(s, modState(mod({data: {objects: [], animal: "cows"}}))));
  assert.ok(!sameModState(s, modState(mod({items: [{...mod().items[0], x: 5}]}))));
  assert.deepEqual(modState({id: "x", name: "Tom"}), {items: [], data: {}}, "a mod with nothing");
});

test("a save is a step; undo and redo walk through the saves; a new save drops what could be redone", () => {
  const states = [0, 1, 2, 3].map(x => modState(mod({items: [{...mod().items[0], x}]})));
  const h = new History(states[0]);
  assert.equal(h.canUndo, false);
  h.push(states[1]); h.push(states[2]);
  assert.equal(h.canUndo, true);
  assert.deepEqual(h.undo(), states[1]);
  assert.deepEqual(h.undo(), states[0]);
  assert.equal(h.canUndo, false); assert.equal(h.canRedo, true);
  assert.deepEqual(h.redo(), states[1]);
  h.push(states[3]);
  assert.equal(h.canRedo, false, "a new change drops the redo");
  assert.deepEqual(h.undo(), states[1]);
});

test("the page has Undo and Redo, a history that every save adds to, and the keys", () => {
  const page = readFileSync(new URL("../src/app/mods/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /new History\(modState\(/);
  assert.match(page, /hist\.current\.push\(/);
  assert.match(page, /async function step\(/);
  assert.match(page, /!hasHistory\.undo/);
  assert.match(page, /!hasHistory\.redo/);
  assert.match(page, /addEventListener\("keydown"/);
});
