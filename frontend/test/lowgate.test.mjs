import test from "node:test";
import assert from "node:assert/strict";
import { PRESETS, buildGeometry, sanitize } from "../src/editor/model.mjs";

test("a low steel gate is only as high as a fence in a tall opening", () => {
  const base = PRESETS.find(x => x.id === "ladugard").settings;
  const p = sanitize({ ...base, doorStyle: "lowgate" });
  const door = p.windows.find(w => w.type === "door");
  const geo = buildGeometry(p);
  const leaves = geo.doors.flatMap(d => d.leaves);
  assert.ok(leaves.length, "a door leaf");
  for (const l of leaves) assert.ok(Math.max(...l.box.size) < 99 && Math.min(l.box.size[1], 1.25) === l.box.size[1], `leaf height ${l.box.size[1]} (door ${door.h})`);
});
