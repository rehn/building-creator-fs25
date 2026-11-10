// Saved buildings must keep building the same: a set of representative saves (every preset, houses with wings of each roof type, old formats)
// is built and summarised (parts, openings, triangles per material, size), and the summary is compared with test/golden-saves.json.
// A change that is meant to alter how an existing save looks updates the file on purpose:  UPDATE_GOLDEN=1 npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { sanitize, buildGeometry, buildI3d, placeableXml, PRESETS, MATS } from "../src/editor/model.mjs";
import { wingsOf } from "../src/editor/layout.mjs";

const FILE = new URL("./golden-saves.json", import.meta.url);
const r2 = v => Math.round(v * 100) / 100;

const wing = (o = {}) => ({id: 1, wall: "back", pos: 0.5, width: 6, depth: 6, floors: 0, ...o});
const SAVES = {
  ...Object.fromEntries(PRESETS.map(x => [`preset ${x.id}`, x.settings])),
  "house, default": {},
  "house, L wing at an end": {width: 12, depth: 8, wings: [wing({pos: 0.1})]},
  "house, T wing in the middle, valley": {width: 14, depth: 8, floors: 2, wings: [wing({pos: 0.5, width: 8, depth: 7})]},
  "house, low wing under the eaves": {width: 12, depth: 8, floors: 2, wings: [wing({floors: 1, width: 3, depth: 4})]},
  "house, gable annex": {width: 12, depth: 8, ridge: "width", wings: [wing({wall: "left", width: 3, depth: 3, floors: 1})]},
  "house, U": {width: 16, depth: 9, wings: [wing({pos: 0}), wing({id: 2, pos: 1})]},
  "house, wings, flat roof": {width: 12, depth: 8, roofType: "flat", wings: [wing({pos: 0.3})]},
  "house, wing with its own floor height and pitch": {width: 14, depth: 8, floors: 2, wings: [wing({floors: 1, floorHeight: 3.4, pitch: 25})]},
  "house, hip roof": {width: 12, depth: 9, roofType: "hip"},
  "old save: one wing in the old settings": {wing: true, wingWall: "left", wingPos: 0.4, wingWidth: 5, wingDepth: 4},
  "old save: the main door in the old settings": {doorWall: "left", doorPos: -0.5, doorW: 1.6, doorH: 2.2, entrance: "gable"},
  "barn, with a ceiling and the inside like the outside": {kind: "cow", ceiling: true, insideSame: true},
  "hen house with wings": {kind: "chicken", wings: [wing({pos: 0.2, width: 3, depth: 3})]},
  "house, a wall across it with one floor after it": {width: 20, depth: 8, floors: 2, splits: [{at: 10, floors: 1}]},
  "house, sections with and without an attic": {width: 20, depth: 8, floors: 2, halfStorey: true, splits: [{at: 8, floors: 1, half: false}, {at: 14, floors: 1, half: true}]},
  "house, floor heights of a section": {width: 20, depth: 8, floors: 3, floorHeight: 2.7, splits: [{at: 10, floors: 3, heights: [3, 2.5]}, {at: 15, floors: 2}]},
  "barn, walls across it and across a part": {kind: "cow", width: 30, depth: 14, splits: [{at: 10}, {at: 20, floors: 2}], wings: [wing({wall: "front", pos: 0.3, depth: 10, splits: [{at: 5}]})]},
  "house, a part with a wall across it and a door": {width: 14, depth: 8, wings: [wing({depth: 10, splits: [{at: 5, floors: 1}]})], windows: [{wall: "front", floor: 0, pos: 0.5, type: "door", w: 1.4, h: 2.3}, {wall: "w1D1", floor: 0, pos: 0.5, type: "door", w: 1, h: 2.1}]},
  "house with windows and doors on a wing": {width: 14, depth: 8, wings: [wing()], windows: [
    {wall: "front", floor: 0, pos: 0.5, type: "door", w: 1.4, h: 2.3}, {wall: "w1End", floor: 0, pos: 0.5, type: "window", w: 1, h: 1.2, sill: 0.9}, {wall: "w1Left", floor: 0, pos: 0.5, type: "door", w: 1, h: 2.1}]},
};

function summary(save) {
  const p = sanitize(save), geo = buildGeometry(p);
  const tris = Object.fromEntries(MATS.map(m => [m, geo.G[m].i.length / 3]).filter(([, n]) => n));
  const all = MATS.filter(m => m !== "interior").flatMap(m => { const g = geo.G[m], out = []; for (let i = 0; i < g.p.length; i += 3) out.push([g.p[i], g.p[i + 1], g.p[i + 2]]); return out; });
  const box = [0, 1, 2].map(k => [r2(Math.min(...all.map(q => q[k]))), r2(Math.max(...all.map(q => q[k])))]);
  return {
    parts: wingsOf(p).map(w => w.frames ? {id: w.id, type: w.type, wall: w.wall, floors: w.floors, H: r2(w.H), rect: [r2(w.rect.x0), r2(w.rect.x1), r2(w.rect.z0), r2(w.rect.z1)]} : {id: w.id, off: w.off}),
    windows: p.windows.length, doors: p.windows.filter(w => w.type === "door").length, hidden: p.windows.filter(w => w._hidden).length,
    ops: Object.fromEntries(Object.entries(geo.opsByWall).map(([k, e]) => [k, e.ops.length])),
    triangles: tris, box, i3dBytes: buildI3d(p).length > 1000, xml: placeableXml(p, "x").length > 100,
  };
}

test("golden saves: representative saves build the same as they did", () => {
  const now = Object.fromEntries(Object.entries(SAVES).map(([k, v]) => [k, summary(v)]));
  if (process.env.UPDATE_GOLDEN || !existsSync(FILE)) { writeFileSync(FILE, JSON.stringify(now, null, 1) + "\n"); return; }
  const before = JSON.parse(readFileSync(FILE, "utf8"));
  assert.deepEqual(Object.keys(now).sort(), Object.keys(before).sort(), "the same saves (add one to the file on purpose: UPDATE_GOLDEN=1)");
  for (const k of Object.keys(now)) assert.deepEqual(now[k], before[k], `${k}: it no longer builds as before (UPDATE_GOLDEN=1 if that is meant)`);
});
