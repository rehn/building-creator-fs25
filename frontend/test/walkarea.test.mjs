import test from "node:test";
import assert from "node:assert/strict";
import { walkArea, areaOf } from "../src/editor/walkarea.mjs";
import { sanitize, PRESETS } from "../src/editor/model.mjs";
import { kindOf } from "../src/editor/kinds/index.mjs";
import { buildGeometry } from "../src/editor/model.mjs";

const square = [[0, 0, 0], [10, 0, 0], [10, 0, 10], [0, 0, 10], [0, 0, 0]];

test("the area inside the fence, less what is cut out of it", () => {
  const full = walkArea(square, [], 0.1);
  assert.ok(Math.abs(areaOf(full) - 100) < 1.5, `100 m2, got ${areaOf(full)}`);
  const cut = walkArea(square, [{center: [2, 1, 2], size: [4, 2, 4]}], 0.1);
  assert.ok(Math.abs(areaOf(cut) - 84) < 1.5, `100 - 16 m2, got ${areaOf(cut)}`);
  const keep = walkArea(square, [{center: [2, 1, 2], size: [4, 2, 4]}], 0.1, 0.5);
  assert.ok(areaOf(keep) < areaOf(cut), "a margin takes more away");
});

test("no fence, no area", () => assert.equal(walkArea(null), null));

test("a cow barn's walking area leaves out the building and every part of it", () => {
  const p = sanitize({...PRESETS.find(x => x.id === "ladugard").settings, wings: [{id: 1, wall: "back", pos: 0.5, width: 5, depth: 4, floors: 0}]});
  const geo = buildGeometry(p), y = kindOf(p).yard(geo, p);
  assert.ok(y.fence.length >= 4 && y.blockers.length >= 2, "a fence and the building's blockers (the main one and the part)");
  const area = walkArea(y.fence, y.blockers, 0.25);
  const free = areaOf(walkArea(y.fence, [], 0.25));
  assert.ok(areaOf(area) < free - 10, "the building is cut out");
});
