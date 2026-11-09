// A part has roof ventilators of its own (lanterns on its ridge), apart from the main building's.
import test from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry } from "../src/editor/model.mjs";

const wing = (o = {}) => ({id: 1, wall: "back", pos: 0.5, width: 6, depth: 10, floors: 0, ...o});
const barn = o => sanitize({kind: "cow", width: 20, depth: 10, wings: [wing(o)]});
const tris = p => { const g = buildGeometry(p).G; return ["walls", "trim", "roof", "fittings"].reduce((n, m) => n + g[m].i.length / 3, 0); };

test("a part's ventilators are cleaned (0 to 4) and kept", () => {
  assert.equal(barn({ventilators: 2}).wings[0].ventilators, 2);
  assert.equal(barn({ventilators: 9}).wings[0].ventilators, 4);
  assert.equal(barn({}).wings[0].ventilators, 0);
});

test("ventilators on a part add to its roof, and only there", () => {
  const none = tris(barn({})), two = tris(barn({ventilators: 2}));
  assert.ok(two > none + 40, `lanterns built on the part (${none} -> ${two})`);
  const mainOnly = sanitize({kind: "cow", width: 20, depth: 10, ventilators: 0, wings: [wing({})]});
  assert.equal(tris(mainOnly), none, "the main building's own setting is a different one");
});
