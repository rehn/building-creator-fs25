// The animals' walking area is the fence's, with the building cut out: every part of the building, not only the main rectangle (else they walk through a wing's walls).
import test from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildI3d } from "../src/editor/model.mjs";

const wing = (o = {}) => ({id: 1, wall: "left", pos: 0.5, width: 5, depth: 4, floors: 0, ...o});
for (const kind of ["cow", "sheep", "chicken"]) test(`${kind} barn: each part of the building is cut out of the animals' walking area`, () => {
  const off = kind === "chicken" ? {} : {animalsInside: false};   // (the area made from the fence minus these blockers; with animals inside there is one walking mesh instead)
  const plain = buildI3d(sanitize({kind, ...off})), withWing = buildI3d(sanitize({kind, ...off, wings: [wing()]}));
  const n = xml => (xml.match(/name="navmeshBlocker\d*"/g) || []).length;
  assert.ok(n(withWing) >= n(plain) + 1, `a blocker for the wing (${n(plain)} -> ${n(withWing)})`);
});
