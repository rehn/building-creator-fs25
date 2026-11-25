// The hen hatch as a door style in the building editor (Lars): a small opening, 40 x 50 cm at the floor, drawn as the hen house's own hatch (a trim frame, the sliding hatch held open above it, a ramp if
// the floor is raised), and a way in for the hens of a mod (kinds/modinside.mjs), as the open framed doorway is.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, DOOR_STYLES } from "../src/editor/model.mjs";
import { entrancesOf, insideNav } from "../src/editor/kinds/modinside.mjs";

const withHatch = (extra = {}) => {
  const base = sanitize({kind: "house", width: 10, depth: 8, foundation: 0.2, doorWall: "front", doorStyle: "plank"});
  const hatch = {wall: "back", floor: 0, pos: 0.3, type: "door", style: "henhatch", w: 2, h: 2.1, sill: 0.85, porch: "gable", opens: true, ...extra};
  return sanitize({...base, windows: [...base.windows, hatch]});
};

test("the hen hatch is a door style, but not one for the whole building", () => {
  assert.ok(DOOR_STYLES.some(s => s.id === "henhatch" && /hatch/i.test(s.name)));
  const q = sanitize({kind: "house", width: 10, depth: 8, doorStyle: "henhatch"});
  assert.notEqual(q.doorStyle, "henhatch", "the style of the building is a door, not a hatch");
});

test("a door with the hatch style is 40 x 50 cm at the floor, with no porch and nothing to open, whatever it was given", () => {
  const q = withHatch(), d = q.windows.find(w => w.style === "henhatch");
  assert.ok(d);
  assert.equal(d.type, "door");
  assert.equal(d.w, 0.4);
  assert.equal(d.h, 0.5);
  assert.equal(d.sill, 0);
  assert.equal(d.porch, "none");
  assert.equal(d.opens, false);
  assert.ok(q.windows.filter(w => w.style !== "henhatch" && w.type === "door").length >= 1, "the building keeps its own door");
});

test("the building draws it as the hatch: a small opening at the floor with a frame, and the wall stays whole for the collision", () => {
  const q = withHatch(), geo = buildGeometry(q), ops = geo.opsByWall.back.ops.filter(o => o.kind === "hatch");
  assert.equal(ops.length, 1);
  assert.ok(Math.abs(ops[0].s1 - ops[0].s0 - 0.4) < 1e-6 && ops[0].t0 === 0 && Math.abs(ops[0].t1 - 0.5) < 1e-6, JSON.stringify(ops[0]));
  assert.ok(!ops[0].plain, "with the sliding hatch above it, as the hen house has it");
  const ramped = buildGeometry(withHatch({ramp: true})), plain = buildGeometry(withHatch({ramp: false}));
  assert.ok(ramped.G.foundation.p.length > plain.G.foundation.p.length, "a ramp when it is asked for and the floor is raised");
});

test("the hens of a mod can use it: it is a way in, 40 cm wide, on the wall it is on", () => {
  const e = entrancesOf(withHatch());
  assert.equal(e.filter(x => x.wall === "back").length, 1);
  const h = e.find(x => x.wall === "back");
  assert.ok(Math.abs(h.s1 - h.s0 - 0.4) < 1e-6, JSON.stringify(h));
  // a closed building with only the hatch on the fence side: the wall slab leaves a gap of the hatch's width
  const q = sanitize({kind: "house", width: 10, depth: 8, foundation: 0.2, doorWall: "front", doorStyle: "plank", windows: [
    {wall: "front", floor: 0, pos: 0.5, type: "door", style: "plank", w: 1.2, h: 2.1, sill: 0},
    {wall: "back", floor: 0, pos: 0.3, type: "door", style: "henhatch", w: 2, h: 2, sill: 0}]});
  const feet = {x0: 15, x1: 25, z0: 6, z1: 14}, contour = [[14.85, 5.85], [14.85, -4], [25.15, -4], [25.15, 5.85]].map(([x, z]) => [x, 0, z]);
  const r = insideNav({settings: q, place: {x: 20, z: 10, y: 0, rot: 0}, contour, blockers: [{center: [20, 1, 10], size: [10, 2, 8], keep: 0.9}]});
  assert.ok(r.nav, JSON.stringify(r.reason));
  assert.equal(r.entrances, 1, "only the hatch faces the fence");
  const back = r.nav.blockers.filter(b => Math.abs(b.center[2] - 6) < 0.4);   // the slabs of the back wall (z 6)
  const covered = back.reduce((s, b) => s + b.size[0], 0);
  assert.ok(Math.abs(covered - (10 - 0.4)) < 0.2, `the wall is shut but for the hatch: ${covered} of 10`);
});
