// A window on an upper floor of a walk-in building (a barn with no rooms behind its windows) gets boards just behind it, so what is seen through it is
// a wall (and not the window on the other side of the building and the trees behind it).
import test from "node:test";
import assert from "node:assert/strict";
import { PRESETS, sanitize, buildGeometry } from "../src/editor/model.mjs";

const barn = extra => sanitize({...PRESETS.find(x => x.id === "ladugard").settings, floors: 2, ...extra});
const fittings = p => buildGeometry(p).G.fittings.i.length / 3;

test("boards behind the upper windows of a barn, on by default", () => {
  assert.equal(barn({}).loftBacking, true);
  assert.ok(fittings(barn({})) > fittings(barn({loftBacking: false})), "extra faces");
});

test("none on a one-storey barn (no upper windows) and none when switched off", () => {
  const one = sanitize({...PRESETS.find(x => x.id === "ladugard").settings, floors: 1});
  assert.equal(fittings(one), fittings(sanitize({...one, loftBacking: false})));
});
