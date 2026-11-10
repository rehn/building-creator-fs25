// The studs on the inside of a wall follow how the wall looks outside: a wall that is plastered (its own panel, set for that wall) shows no studs, a wall of boards does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry } from "../src/editor/model.mjs";

const tris = p => buildGeometry(p).G.fittings.i.length / 3;
const barn = (extra = {}) => sanitize({kind: "cow", width: 24, depth: 12, insideSame: true, wallCladding: "vertical", wallSplit: "one", items: [], ...extra});

test("a wall of its own plaster has no studs inside, though the building's walls are boards", () => {
  const boards = tris(barn()), plasteredFront = tris(barn({wallStyles: {front: {wallCladding: "plaster"}}}));
  assert.ok(boards - plasteredFront > 200, `fewer pieces without the front's studs (${boards} against ${plasteredFront})`);
});

test("plaster on the lower part of one wall: studs only above it", () => {
  const split = tris(barn({wallSplit: "floor", lowerCladding: "plaster"})), lowerOwnTimber = tris(barn({wallSplit: "floor", lowerCladding: "plaster", wallStyles: {front: {lowerCladding: "vertical"}}}));
  assert.ok(lowerOwnTimber > split, "a wall whose lower part is boards has studs there too");
});

test("a wall that says nothing follows the building", () => {
  assert.equal(tris(barn({wallStyles: {front: {}}})), tris(barn()));
});

test("the studs look old and used: a surface of their own, in several worn tones (not one clean colour)", () => {
  const G = buildGeometry(barn()).G.fittings, cols = new Set(), surfs = new Set();
  for (let k = 0; k < G.c.length; k += 3) { cols.add(G.c.slice(k, k + 3).map(v => v.toFixed(3)).join()); }
  for (const s of G.s) surfs.add(s);
  assert.ok(surfs.has("oldtimber"), `a worn timber surface (${[...surfs]})`);
  const tones = new Set(); for (let k = 0; k < G.c.length; k += 3) if (G.s[k / 3] === "oldtimber") tones.add(G.c.slice(k, k + 3).map(v => v.toFixed(3)).join());
  assert.ok(tones.size >= 3, `at least three tones (${tones.size})`);
});

test("the inside of the boards can be left unpainted: raw, worn timber like the studs", () => {
  const painted = buildGeometry(barn()), raw = buildGeometry(barn({insidePanel: "raw"}));
  assert.equal(barn().insidePanel, "painted", "painted to start with");
  const old = g => g.G.fittings.s.filter(s => s === "oldboards").length;
  assert.ok(old(raw) > old(painted) + 100, `more worn boards (${old(raw)} against ${old(painted)})`);
  assert.ok(raw.G.walls.i.length < painted.G.walls.i.length, "the painted backs of the boards are gone");
  assert.equal(barn({insidePanel: "nonsense"}).insidePanel, "painted");
});

test("a wall of corrugated sheet has studs inside, and the unpainted-panel setting leaves its sheet alone", () => {
  const sheet = barn({wallCladding: "corrugated"}), plain = barn({wallCladding: "plaster"});
  const studs = p => buildGeometry(p).G.fittings.s.filter(s => s === "oldtimber").length;
  assert.ok(studs(sheet) > studs(plain) + 200, "studs behind the sheet");
  const raw = buildGeometry(barn({wallCladding: "corrugated", insidePanel: "raw"})).G.fittings.s.filter(s => s === "oldboards").length;
  assert.equal(raw, 0, "no boards behind sheet metal");
});
