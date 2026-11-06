// Wallpaper on the inside of the outer walls: one for every wall, or sections along a wall (one per room).
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, buildI3d, SCHEMA, PRESETS } from "../src/editor/model.mjs";
import { cleanPapers, wallBreaks, wallsOf } from "../src/editor/layout.mjs";
import { WALLPAPERS } from "../src/editor/kinds/innerwall.mjs";

const hexRGB = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
/** The vertices of fittings with colour c (hex): their positions. */
function withColor(geo, hex) {
  const g = geo.G.fittings, [r, gr, b] = hexRGB(hex), out = [];
  for (let k = 0; k < g.c.length; k += 3) if (Math.abs(g.c[k] - r) < 0.004 && Math.abs(g.c[k + 1] - gr) < 0.004 && Math.abs(g.c[k + 2] - b) < 0.004) out.push([g.p[k], g.p[k + 1], g.p[k + 2]]);
  return out;
}

test("wallpaper: a setting for every inside wall and a list of sections, cleaned", () => {
  const p = sanitize({});
  assert.equal(p.insidePaper, "none");
  assert.deepEqual(p.papers, []);
  assert.ok(SCHEMA.some(g => g.title === "Inside walls" && g.custom === "papers" && g.fields.some(f => f.k === "insidePaper")));
  assert.equal(sanitize({insidePaper: "3"}).insidePaper, "3");
  assert.equal(sanitize({insidePaper: "99"}).insidePaper, "none");
  const q = sanitize({papers: [{wall: "front", s0: 5, s1: 1, paper: 2}, {wall: "front", s0: 2, s1: 2.1, paper: 1}, {wall: "nowhere", s0: 0, s1: 3, paper: 1}, {wall: "back", s0: -4, s1: 99, paper: 99}, null]});
  assert.deepEqual(q.papers, [{id: 1, wall: "front", s0: 1, s1: 5, paper: 2}, {id: 2, wall: "back", s0: 0, s1: p.width, paper: WALLPAPERS.length - 1}]);
  // sections on a wing's wall only while there is one
  assert.equal(sanitize({papers: [{wall: "w1Left", s0: 0, s1: 2, paper: 0}]}).papers.length, 0);
  assert.equal(sanitize({wings: [{wall: "back", pos: 0.5, width: 5, depth: 5, floors: 0}], papers: [{wall: "w1Left", s0: 0, s1: 2, paper: 0}]}).papers.length, 1);
});

test("wallpaper: none by default; one for every wall covers the inside faces; a section covers its stretch only", () => {
  const plain = buildGeometry(sanitize({})), [name, col] = [WALLPAPERS[4][0], WALLPAPERS[4][1]];
  assert.equal(withColor(plain, col).length, 0, "no wallpaper: no " + name);
  const all = buildGeometry(sanitize({insidePaper: "4"})), allV = withColor(all, col);
  assert.ok(allV.length > 100, "every inside face papered: " + allV.length);
  // a section on the front wall, 0-3 m from its left end: only there
  const p = sanitize({papers: [{wall: "front", s0: 0, s1: 3, paper: 4}]}), geo = buildGeometry(p), v = withColor(geo, col), w = wallsOf(p).front;
  assert.ok(v.length > 0 && v.length < allV.length / 3, "a part of one wall: " + v.length);
  for (const [x, , z] of v) {
    const s = (x - w.o[0]) * w.u[0] + (z - w.o[2]) * w.u[2];
    assert.ok(s > -0.01 && s < 3.01, "within 0-3 m: " + s.toFixed(2));
  }
  // a section wins over the paper for every wall
  const both = buildGeometry(sanitize({insidePaper: "4", papers: [{wall: "front", s0: 0, s1: 3, paper: 2}]}));
  assert.ok(withColor(both, WALLPAPERS[2][1]).length > 0 && withColor(both, col).length > 0 && withColor(both, col).length < allV.length);
  assert.ok(buildI3d(sanitize({insidePaper: "5", papers: [{wall: "left", s0: 1, s1: 4, paper: 3}]})).includes("</i3D>"));
});

test("wallpaper: barns can have it too (it replaces the whitewash and its grubby band)", () => {
  const barn = sanitize({...PRESETS.find(x => x.id === "ladugard").settings, insidePaper: "2"});
  assert.ok(withColor(buildGeometry(barn), WALLPAPERS[2][1]).length > 100);
});

test("wallpaper: the wall's sections can be divided at the inner walls that meet it", () => {
  const p = sanitize({items: [
    {type: "innerwall", x: -1.5, z: 0, rot: 90, length: 6.7, door: 0},          // a wall across the house, meeting the front and back walls
    {type: "innerwall", x: 1.2, z: 0, rot: 90, length: 6.7, door: 0}]});
  const front = wallBreaks(p, "front"), back = wallBreaks(p, "back");
  assert.equal(front.length, 2, JSON.stringify(front)); assert.equal(back.length, 2);
  // 5 m from the left end of the front wall seen from outside = x = -1.5 (the left end is x = -5), and x = 1.2 is 6.2 m
  assert.deepEqual(front.map(s => +s.toFixed(1)), [3.5, 6.2]);
  assert.deepEqual(wallBreaks(p, "left"), [], "the side walls have none");
  assert.deepEqual(wallBreaks(sanitize({}), "front"), []);
});
