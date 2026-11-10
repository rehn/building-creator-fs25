// A wall across the building (a section's wall) keeps the animals out of what is behind it: the floor there is not walkable, unless the wall has a framed, empty doorway.
// A door in it (open or shut) counts as closed, as for the inner walls: animals don't open doors.
import test from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, buildI3d } from "../src/editor/model.mjs";
import { kindOf } from "../src/editor/kinds/index.mjs";

const at = (n, x, z) => n.rects.some(r => r.inside && x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
// 24 m long and 12 m deep, a wall 8 m from the left end: the pasture's doorway is in the middle, so the part left of the wall (x < -4) is the one that can be cut off
const barn = (windows = [], extra = {}) => {
  const base = sanitize({kind: "cow", width: 24, depth: 12, foundation: 0, items: [], ridge: "width", splits: [{at: 8}], ...extra});
  const p = sanitize({...base, windows: [...base.windows.filter(w => w.wall !== "s1"), ...windows]});
  return {p, nav: kindOf(p).yard(buildGeometry(p), p).nav};
};
const wallDoor = (style, opens = true) => ({wall: "s1", floor: 0, pos: 0.5, type: "door", w: 2.4, h: 2.4, sill: 0, style, opens, porch: "none"});

test("a wall across the barn: the animals stay on their side of it", () => {
  const {nav} = barn();
  assert.ok(nav, "a walking area");
  assert.ok(at(nav, 3, 0), "the side with the pasture's doorway");
  assert.ok(!at(nav, -8, 0), "not behind the wall");
});

test("a wall across the barn with a framed empty doorway: the animals can pass", () => {
  const {nav} = barn([wallDoor("hole", false)]);
  assert.ok(at(nav, 3, 0), "the near side");
  assert.ok(at(nav, -8, 0), "and through the doorway to the far side");
  const {nav: closed} = barn([wallDoor("hole", false)].map(d => ({...d, pos: 0.5, w: 2.4})));
  assert.ok(!at(closed, -4, 4.5), "the wall itself, beside the doorway, is still a wall");
});

test("a door in it, open or shut, keeps them out", () => {
  assert.ok(!at(barn([wallDoor("plain", true)]).nav, -8, 0), "a door that opens");
  assert.ok(!at(barn([wallDoor("plain", false)]).nav, -8, 0), "a door that stays shut");
});

test("the walls across the barn are obstacles in the walking mesh the game builds", () => {
  const plain = buildI3d(barn().p), without = buildI3d(barn([], {splits: []}).p), count = xml => [...xml.matchAll(/<Shape name="navmeshBlocker[0-9]*"/g)].length;
  assert.ok(count(plain) > count(without), `blocker boxes for the wall (${count(plain)} against ${count(without)})`);
});
