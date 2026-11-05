import { test } from "node:test";
import assert from "node:assert/strict";
import { WINDOW_STYLES, DOOR_STYLES, drawSash, drawLeaf, isPair, styleOf } from "../src/editor/openings.mjs";

/** A kit like the core's that records boxes and slabs in wall coordinates (s along, t up, d out). */
function recorder() {
  const parts = [];
  const kit = {
    box: (mat, s0, s1, t0, t1, d0, d1) => { assert.ok(s0 < s1 && t0 < t1 && d0 < d1, `box ${mat} ${[s0, s1, t0, t1, d0, d1]}`); parts.push({mat, s: [s0, s1], t: [t0, t1], d: [d0, d1]}); },
    slab: (mat, pts, d0, d1) => { assert.ok(pts.length >= 3 && d0 < d1); parts.push({mat, s: [Math.min(...pts.map(q => q[0])), Math.max(...pts.map(q => q[0]))], t: [Math.min(...pts.map(q => q[1])), Math.max(...pts.map(q => q[1]))], d: [d0, d1]}); },
  };
  return {kit, parts};
}
const MATS = ["door", "trim", "glass", "iron"];

test("styles: every style has an id and a name, ids are unique", () => {
  for (const list of [WINDOW_STYLES, DOOR_STYLES]) {
    assert.equal(new Set(list.map(s => s.id)).size, list.length);
    for (const s of list) assert.ok(s.id && s.name);
  }
  for (const id of ["casement", "sprojs", "stall", "single", "hatch"]) assert.ok(WINDOW_STYLES.some(s => s.id === id), id);
  for (const id of ["plain", "plank", "zbrace", "xbrace", "panel", "sliding"]) assert.ok(DOOR_STYLES.some(s => s.id === id), id);
});

test("styleOf: an opening's own style, else the building's", () => {
  const p = {winStyle: "stall", doorStyle: "xbrace"};
  assert.equal(styleOf(p, {type: "window", style: "default"}), "stall");
  assert.equal(styleOf(p, {type: "window", style: "sprojs"}), "sprojs");
  assert.equal(styleOf(p, {type: "door", style: "default"}), "xbrace");
  assert.equal(styleOf(p, {type: "door", style: "panel"}), "panel");
});

const win = {s0: 1, s1: 2.2, t0: 1, t1: 2.3};
for (const st of WINDOW_STYLES) test(`window style ${st.id}: drawn inside the opening, in the reveal`, () => {
  const {kit, parts} = recorder(), r = 0.15;
  const res = drawSash(kit, st.id, win, {k: 1, r});
  assert.equal(typeof res.glass, "boolean");
  assert.equal(res.glass, st.id !== "hatch");
  if (st.id !== "single") assert.ok(parts.length > 0);
  for (const q of parts) {
    assert.ok(MATS.includes(q.mat), q.mat);
    assert.ok(q.s[0] >= win.s0 - 1e-9 && q.s[1] <= win.s1 + 1e-9 && q.t[0] >= win.t0 - 1e-9 && q.t[1] <= win.t1 + 1e-9, `${st.id}: ${JSON.stringify(q)} outside the opening`);
    assert.ok(q.d[0] >= -r - 0.005 && q.d[1] <= 0, `${st.id}: ${q.d} not in the wall`);
  }
});
test("window styles: small panes have more bars than a casement", () => {
  const n = id => { const {kit, parts} = recorder(); drawSash(kit, id, win, {k: 1, r: 0.15}); return parts.length; };
  assert.ok(n("sprojs") > n("casement") + 2);
  assert.ok(n("stall") > n("casement"));
});

const leaf = {s0: 0, s1: 1.2, t0: 0, t1: 2.2, dIn: -0.15, dOut: -0.1};
for (const st of DOOR_STYLES) for (const right of [false, true]) test(`door style ${st.id} (${right ? "right" : "left"} leaf): within the leaf, details on its faces`, () => {
  const {kit, parts} = recorder();
  drawLeaf(kit, st.id, {...leaf, right});
  // the leaf itself: door material filling it
  assert.ok(parts.some(q => q.mat === "door" && q.s[0] <= leaf.s0 + 1e-9 && q.s[1] >= leaf.s1 - 1e-9 && q.d[0] <= leaf.dIn + 1e-9 && q.d[1] >= leaf.dOut - 1e-9));
  for (const q of parts) {
    assert.ok(MATS.includes(q.mat), q.mat);
    assert.ok(q.s[0] >= leaf.s0 - 1e-9 && q.s[1] <= leaf.s1 + 1e-9 && q.t[0] >= leaf.t0 - 1e-9 && q.t[1] <= leaf.t1 + 1e-9, `${st.id}: ${JSON.stringify(q)} off the leaf`);
    assert.ok(q.d[0] >= leaf.dIn - 0.08 && q.d[1] <= leaf.dOut + 0.08, `${st.id}: ${q.d} too far off the leaf`);
  }
  // a handle near the free edge, on the outside
  const free = right ? leaf.s0 : leaf.s1;
  assert.ok(parts.some(q => q.mat === "iron" && q.d[0] >= leaf.dOut - 1e-9 && Math.min(Math.abs(q.s[0] - free), Math.abs(q.s[1] - free)) < 0.25 && q.t[0] > 0.8 && q.t[1] < 1.3), `${st.id}: no handle`);
});
test("door styles: braced doors have trim on them, a panelled door glass, a plain door neither", () => {
  const mats = id => { const {kit, parts} = recorder(); drawLeaf(kit, id, leaf); return new Set(parts.map(q => q.mat)); };
  assert.ok(mats("zbrace").has("trim") && mats("xbrace").has("trim"));
  assert.ok(mats("panel").has("glass"));
  assert.ok(!mats("plain").has("trim") && !mats("plain").has("glass"));
});
test("a wide opening is a pair of doors", () => {
  assert.equal(isPair(1.2), false);
  assert.equal(isPair(1.6), true);
});
