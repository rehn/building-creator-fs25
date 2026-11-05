// Walls in two zones: a lower and an upper part, each with its own cladding and colour (a barn with a
// plastered ground floor and boards above). Split at the top of the ground floor or at a chosen height,
// with a drip board along the join; the gables and dormers are the upper part's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, buildI3d, colorFor, surfaceSpec, MATS, PRESETS } from "../src/editor/model.mjs";

const verts = g => { const out = []; for (let i = 0; i < g.p.length; i += 3) out.push([g.p[i], g.p[i + 1], g.p[i + 2]]); return out; };
const two = (s = {}) => sanitize({wallSplit: "floor", lowerCladding: "plaster", lowerColor: "#EEEEE8", floors: 2, floorHeight: 2.7, foundation: 0.4, ...s});

test("wall zones: one material unless split; the settings are kept and checked", () => {
  const d = sanitize({});
  assert.equal(d.wallSplit, "one");
  assert.ok(MATS.includes("wallsLow"));
  assert.equal(buildGeometry(d).G.wallsLow.i.length, 0, "no lower part");
  const p = sanitize({wallSplit: "height", splitHeight: 99, lowerCladding: "brick?", lowerColor: "red"});
  assert.equal(p.wallSplit, "height");
  assert.equal(p.splitHeight, 10);
  assert.equal(p.lowerCladding, "plaster");
  assert.equal(sanitize({wallSplit: "zebra"}).wallSplit, "one");
  assert.match(p.lowerColor, /^#[0-9a-f]{6}$/i);
});

test("wall zones: the lower part goes up to the top of the ground floor, the rest is the upper", () => {
  const p = two(), G = buildGeometry(p).G, split = p.foundation + p.floorHeight;
  // (on the walls' own planes: a porch's gable is joinery, the upper material wherever it is)
  const onWall = ([x, , z]) => Math.abs(Math.abs(x) - p.width / 2) < 1e-6 || Math.abs(Math.abs(z) - p.depth / 2) < 1e-6;
  const low = verts(G.wallsLow), up = verts(G.walls).filter(onWall);
  assert.ok(low.length > 0 && up.length > 0);
  assert.ok(low.every(([, y]) => y <= split + 1e-6), "lower part below the split");
  assert.ok(up.every(([, y]) => y >= split - 1e-6), "upper part above it (gables too)");
  assert.ok(low.some(([, y]) => Math.abs(y - p.foundation) < 1e-6), "from the plinth");
  // its colour and texture
  assert.equal(colorFor(p, "wallsLow"), "#EEEEE8");
  assert.equal(surfaceSpec(p, "wallsLow").kind, "plaster");
  assert.equal(surfaceSpec(p, "walls").kind, p.wallCladding);
  assert.notEqual(colorFor({...p, age: 40}, "wallsLow"), "#EEEEE8", "it ages like the walls");
});

test("wall zones: split at a chosen height, and none above the walls", () => {
  const p = two({wallSplit: "height", splitHeight: 1.1}), G = buildGeometry(p).G;
  assert.ok(verts(G.wallsLow).every(([, y]) => y <= p.foundation + 1.1 + 1e-6));
  assert.ok(verts(G.walls).every(([, y]) => y >= p.foundation + 1.1 - 1e-6));
  // a split above the walls' top: all upper (the gables are always the upper part)
  const hi = two({floors: 1, wallSplit: "height", splitHeight: 9});
  assert.equal(buildGeometry(hi).G.wallsLow.i.length, 0);
});

test("wall zones: a drip board along the join, broken where a window crosses it", () => {
  const p = two({wallSplit: "height", splitHeight: 1.5, winFront: 1, winBack: 0, winLeft: 0, winRight: 0, sill: 0.9, winH: 1.25});
  const geo = buildGeometry(p), y = p.foundation + 1.5, zFront = p.depth / 2;
  const board = verts(geo.G.trim).filter(([, vy, z]) => vy > y - 0.01 && vy < y + 0.13 && z > zFront + 0.01 && z < zFront + 0.05);
  assert.ok(board.length > 0, "a board on the front wall");
  const win = geo.opsByWall.front.ops.find(o => o.kind === "window" && o.floor !== 1 && o.t0 < 1.5 && o.t1 > 1.5) || geo.opsByWall.front.ops.find(o => o.kind === "window" && o.t0 < 1.5 && o.t1 > 1.5);
  assert.ok(win, "a ground floor window crosses the join");
  const x0 = -p.width / 2 + win.s0, x1 = -p.width / 2 + win.s1;
  assert.ok(!board.some(([x]) => x > x0 + 0.01 && x < x1 - 0.01), "no board across the window");
});

test("wall zones: a wing, a walk-in barn and the export have them too", () => {
  const w = two({wings: [{wall: "back", pos: 0.2, width: 6, depth: 5}]});
  const G = buildGeometry(w).G;
  assert.ok(verts(G.wallsLow).some(([, , z]) => z < -w.depth / 2 - 1), "the wing's lower walls");
  const barn = sanitize({...PRESETS.find(x => x.id === "ladugard").settings, floors: 2, wallSplit: "floor", lowerCladding: "plaster"});
  assert.ok(buildGeometry(barn).G.wallsLow.i.length > 0, "a barn's");
  assert.match(buildI3d(w, {withTex: true}), /textures\/wallsLow_diffuse\.png/);
  assert.doesNotMatch(buildI3d(sanitize({}), {withTex: true}), /wallsLow/);
});
