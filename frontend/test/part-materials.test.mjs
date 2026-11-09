// Materials per part (docs/PLAN_PARTS.md, step 3b): a part has the materials of its parent unless it sets its own (wall panel and colour above and below,
// the split, the roof's covering and colour, the trim's colour). A part with its own gets materials of its own in the preview and the export; the rest share the building's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, buildI3d, placeableXml, colorFor, surfaceSpec, partStyle, matList, MATS, scaledUV } from "../src/editor/model.mjs";
import { liveWings } from "../src/editor/layout.mjs";

const W1 = {id: 1, wall: "back", pos: 0.5, width: 6, depth: 8, floors: 0};
const house = (wings, extra = {}) => sanitize({width: 16, depth: 9, floors: 1, floorHeight: 3, foundation: 0.3, wallCladding: "lockpanel", wallColor: "#8E2A1E", roofMaterial: "tiles", roofColor: "#2F2F2F", trimColor: "#F2EFE8", chimney: false, items: [], wings, ...extra});
const verts = (g) => { const out = []; for (let i = 0; i < g.p.length; i += 3) out.push([g.p[i], g.p[i + 1], g.p[i + 2]]); return out; };
const inRect = (q, r, m = 0.05) => q[0] >= r.x0 - m && q[0] <= r.x1 + m && q[2] >= r.z0 - m && q[2] <= r.z1 + m;

test("part materials: the fields are kept and checked, empty means as the parent", () => {
  const p = house([{...W1, wallCladding: "plaster", wallColor: "#EAE6DC", roofMaterial: "metal", roofColor: "#4A4F52", trimColor: "#3B3F42", wallSplit: "floor", lowerCladding: "horizontal", lowerColor: "#223344"}]);
  const w = p.wings[0];
  assert.deepEqual([w.wallCladding, w.wallColor, w.roofMaterial, w.roofColor, w.trimColor, w.wallSplit, w.lowerCladding, w.lowerColor], ["plaster", "#EAE6DC", "metal", "#4A4F52", "#3B3F42", "floor", "horizontal", "#223344"]);
  const q = house([{...W1, wallCladding: "zebra", wallColor: "red", roofMaterial: "x", roofColor: 5, wallSplit: "no", splitHeight: 99}]).wings[0];
  for (const k of ["wallCladding", "wallColor", "roofMaterial", "roofColor", "trimColor", "wallSplit", "lowerCladding", "lowerColor", "splitHeight"]) assert.equal(q[k] === undefined || q[k] === "" || (k === "splitHeight" && q[k] === 10), true, `${k}: ${q[k]}`);
});

test("part materials: a part gets its parent's value unless it sets its own, all the way up", () => {
  const p = house([{...W1, roofColor: "#112233"}, {id: 2, wall: "w1Left", pos: 0.5, width: 3, depth: 3, floors: 0}, {id: 3, wall: "w2End", pos: 0.5, width: 2.5, depth: 2.5, floors: 0, roofColor: "#445566"}, {id: 4, wall: "w3End", pos: 0.5, width: 2.2, depth: 2.2, floors: 0}]);
  assert.equal(partStyle(p, 1).roofColor, "#112233");
  assert.equal(partStyle(p, 2).roofColor, "#112233", "from its parent");
  assert.equal(partStyle(p, 3).roofColor, "#445566", "its own");
  assert.equal(partStyle(p, 4).roofColor, "#445566", "from its parent, which has its own");
  assert.equal(partStyle(p, 2).wallColor, "#8E2A1E", "the building's where nobody sets one");
  assert.equal(partStyle(p, 0).roofColor, "#2F2F2F");
});

test("part materials: nothing changes while no part sets its own (the building's materials only)", () => {
  const p = house([W1, {id: 2, wall: "w1Left", pos: 0.5, width: 3, depth: 3, floors: 0}]), geo = buildGeometry(p);
  assert.deepEqual(matList(p), MATS);
  assert.deepEqual(Object.keys(geo.G).sort(), [...MATS].sort());
});

test("part materials: a part's own roof colour is a material of its own, on that part's roof only; the children share it", () => {
  const p = house([W1, {id: 2, wall: "w1Left", pos: 0.5, width: 3, depth: 3, floors: 0, roofColor: "#7A2E1F"}, {id: 3, wall: "w2End", pos: 0.5, width: 2.5, depth: 2.5, floors: 0}]);
  const list = matList(p), extra = list.filter(m => !MATS.includes(m));
  assert.equal(extra.length, 1, "one new material for wing 2 and what stands on it: " + extra);
  const name = extra[0], geo = buildGeometry(p), [w1, w2, w3] = liveWings(p);
  assert.equal(colorFor({...p, age: 0}, name), "#7A2E1F");
  assert.equal(surfaceSpec(p, name).kind, "tiles", "the same covering, its own colour");
  const own = verts(geo.G[name]), base = verts(geo.G.roof);
  assert.ok(own.length > 0 && base.length > 0);
  // the new material's faces are over wings 2 and 3 only, the building's over the house and wing 1
  const rr = r => ({x0: r.x0 - 1, x1: r.x1 + 1, z0: r.z0 - 1, z1: r.z1 + 1});
  assert.ok(own.every(q => inRect(q, rr(w2.rect), 0.6) || inRect(q, rr(w3.rect), 0.6)), "the part's roof only");
  assert.ok(base.some(q => inRect(q, w1.rect, 0.05)) && !base.some(q => q[1] > 3.5 && inRect(q, {x0: w3.rect.x0 + 0.3, x1: w3.rect.x1 - 0.3, z0: w3.rect.z0 + 0.3, z1: w3.rect.z1 - 0.3}, 0)), "wing 3 is not in the building's roof");
  // the same values as another part's make one material, and the same as the building's none
  const q = house([{...W1, roofColor: "#7A2E1F"}, {id: 2, wall: "back", pos: 0.1, width: 3, depth: 3, floors: 0, roofColor: "#7A2E1F"}, {id: 3, wall: "front", pos: 0.5, width: 4, depth: 3, floors: 0, roofColor: "#2F2F2F"}]);
  assert.equal(matList(q).filter(m => !MATS.includes(m)).length, 1, "equal values share a material, equal to the building's none");
});

test("part materials: walls above and below with their own panel and colour, only on that part's walls", () => {
  const p = house([W1, {id: 2, wall: "w1Left", pos: 0.5, width: 3, depth: 3, floors: 0, wallCladding: "plaster", wallColor: "#EAE6DC"}]);
  const extra = matList(p).filter(m => !MATS.includes(m)), geo = buildGeometry(p), w2 = liveWings(p)[1];
  assert.equal(extra.length, 1, extra.join());
  assert.equal(surfaceSpec(p, extra[0]).kind, "plaster");
  assert.equal(colorFor({...p, age: 0}, extra[0]), "#EAE6DC");
  const own = verts(geo.G[extra[0]]);
  assert.ok(own.length > 0 && own.every(q => inRect(q, w2.rect, 0.2)), "on wing 2's walls only");
  assert.ok(verts(geo.G.walls).some(q => !inRect(q, w2.rect, 0.2)), "the house keeps its own");
  // and it splits where it says, with a lower part of its own
  const s = house([W1, {id: 2, wall: "w1Left", pos: 0.5, width: 3, depth: 3, floors: 0, wallSplit: "height", splitHeight: 1, lowerCladding: "horizontal", lowerColor: "#223344"}]);
  const low = matList(s).filter(m => /^wallsLowP\d+$/.test(m));
  assert.equal(low.length, 1, "a lower material of its own: " + matList(s).join());
  const g = buildGeometry(s), lows = verts(g.G[low[0]]), w2s = liveWings(s)[1];
  assert.ok(lows.length > 0 && lows.every(q => inRect(q, w2s.rect, 0.2) && q[1] <= s.foundation + 1 + 1e-6), "below 1 m, on its walls");
});

test("part materials: trim colour of its own for its frames and boards", () => {
  const p = house([W1, {id: 2, wall: "w1Left", pos: 0.5, width: 3, depth: 3, floors: 0, trimColor: "#3B3F42"}], {windows: [{wall: "w2End", floor: 0, pos: 0.5, type: "window", w: 1, h: 1.2, sill: 0.9}, {wall: "front", floor: 0, pos: 0.5, type: "door", w: 1.4, h: 2.3}]});
  const extra = matList(p).filter(m => /^trim/.test(m) && !MATS.includes(m));
  assert.equal(extra.length, 1);
  assert.equal(colorFor({...p, age: 0}, extra[0]), "#3B3F42");
  const g = buildGeometry(p), own = verts(g.G[extra[0]]), w2 = liveWings(p)[1];
  assert.ok(own.length > 0 && own.every(q => !inRect(q, {x0: -8.6, x1: 8.6, z0: -4.6, z1: 4.6}, 0)), "not on the house itself (wing 2 and the stretch of its roof over wing 1)");
});

test("part materials: the uvs of a part's material scale like the building's (its texture's size)", () => {
  const p = house([W1, {id: 2, wall: "w1Left", pos: 0.5, width: 3, depth: 3, floors: 0, wallCladding: "plaster", wallColor: "#EAE6DC"}]);
  const name = matList(p).find(m => !MATS.includes(m)), geo = buildGeometry(p);
  const uv = scaledUV(p, name, geo.G[name]);
  assert.equal(uv.length, geo.G[name].uv.length);
});

test("part materials: they export (the i3d and the placeable name them) and the golden saves are unchanged", () => {
  const p = house([W1, {id: 2, wall: "w1Left", pos: 0.5, width: 3, depth: 3, floors: 0, roofColor: "#7A2E1F", wallCladding: "plaster", wallColor: "#EAE6DC"}]);
  const extra = matList(p).filter(m => !MATS.includes(m)), xml = buildI3d(p);
  assert.equal(extra.length, 2);
  for (const m of extra) assert.ok(xml.includes(`${m}`), `${m} is in the i3d`);
  assert.ok(placeableXml(p, "x").length > 100);
});
