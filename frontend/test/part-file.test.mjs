// Parts to share: a part (with the parts on it, its windows and doors, the pieces inside and the materials it sets itself) saved as a file and put on a wall of another building.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry, matList, MATS, partStyle } from "../src/editor/model.mjs";
import { liveWings, wingsOf, roomOf, inRoom } from "../src/editor/layout.mjs";
import { exportPart, importPart, PART_FORMAT } from "../src/editor/partfile.mjs";

// a house with a pump house on the back wall and a shed on it, each with windows; the pump house has its own roof colour and a piece of furniture
const source = () => sanitize({width: 16, depth: 9, floors: 1, floorHeight: 3, foundation: 0.3, ceiling: false, roofColor: "#2F2F2F",
  wings: [{id: 3, name: "Pumphus", wall: "back", pos: 0.3, width: 6, depth: 6, floors: 0, roofColor: "#7A2E1F"}, {id: 5, name: "Bod", wall: "w3Left", pos: 0.5, width: 3, depth: 3, floors: 0, wallCladding: "plaster", wallColor: "#EAE6DC"}],
  windows: [{wall: "front", floor: 0, pos: 0.5, type: "door", w: 1.4, h: 2.3}, {wall: "w3End", floor: 0, pos: 0.5, type: "window", w: 1, h: 1.2, sill: 0.9}, {wall: "w5End", floor: 0, pos: 0.5, type: "door", w: 1, h: 2.1}, {wall: "back", floor: 0, pos: 0.9, type: "window", w: 1, h: 1.2, sill: 0.9}]});
const target = (extra = {}) => sanitize({width: 20, depth: 10, floors: 1, floorHeight: 3, foundation: 0.3, roofColor: "#4A4F52", wallColor: "#CCCCCC",
  wings: [{id: 1, wall: "front", pos: 0.1, width: 4, depth: 4, floors: 0}], windows: [{wall: "right", floor: 0, pos: 0.5, type: "door", w: 1.2, h: 2.1}], ...extra});

test("export a part: the part, what stands on it, its windows and doors, renumbered so that it stands alone", () => {
  const f = exportPart(source(), 3);
  assert.equal(f.format, PART_FORMAT);
  assert.equal(f.name, "Pumphus");
  assert.deepEqual(f.parts.map(x => x.id), [1, 2], "the part is 1, what is on it follows");
  assert.equal(f.parts[0].wall, undefined, "no parent: it is put on a wall when imported");
  assert.equal(f.parts[1].wall, "w1Left", "the shed stands on part 1's left wall");
  assert.equal(f.parts[1].name, "Bod");
  assert.deepEqual(f.windows.map(w => w.wall).sort(), ["w1End", "w2End"], "only the windows and doors on the part's walls, with local names");
  assert.equal(f.parts[0].roofColor, "#7A2E1F");
  assert.equal(f.parts[0].wallColor, undefined, "what it doesn't set itself stays unset");
  assert.equal(f.parts[1].wallCladding, "plaster");
  assert.equal(exportPart(source(), 99), null);
  // JSON all the way
  assert.deepEqual(JSON.parse(JSON.stringify(f)), f);
});

test("import a part: onto a wall of another building, with its parts, windows and materials, where there is room", () => {
  const f = exportPart(source(), 3), p = target(), r = importPart(p, "back", f);
  assert.ok(!r.error, r.error);
  const q = sanitize({...p, ...r.settings});
  assert.equal(q.wings.length, 3);
  const [a, b] = q.wings.slice(1);
  assert.equal(a.wall, "back");
  assert.equal(b.wall, `w${a.id}Left`, "the shed stands on the pump house, whatever its number now");
  assert.deepEqual([a.name, b.name], ["Pumphus", "Bod"]);
  assert.equal(liveWings(q).length, 3, "all built");
  assert.ok(q.windows.some(w => w.wall === `w${a.id}End`) && q.windows.some(w => w.wall === `w${b.id}End` && w.type === "door"));
  assert.equal(q.windows.length, p.windows.length + 2);
  // the materials it sets itself stay, the rest are the new parent's
  assert.equal(partStyle(q, a.id).roofColor, "#7A2E1F");
  assert.equal(partStyle(q, a.id).wallColor, "#CCCCCC", "the new building's walls");
  assert.equal(partStyle(q, b.id).wallColor, "#EAE6DC", "the shed's own");
  assert.equal(partStyle(q, b.id).roofColor, "#7A2E1F", "the pump house's, which it follows");
  assert.ok(matList(q).some(m => !MATS.includes(m)));
  buildGeometry(q);
});

test("import a part: onto another part's wall, beside what is there, and on a barn", () => {
  const f = exportPart(source(), 3), p = target({wings: [{id: 1, wall: "back", pos: 0.5, width: 6, depth: 12, floors: 0}]});
  const onPart = importPart(p, "w1Right", f);
  assert.ok(!onPart.error, onPart.error);
  const q = sanitize({...p, ...onPart.settings});
  assert.equal(q.wings.find(w => w.name === "Pumphus").wall, "w1Right");
  assert.equal(liveWings(q).length, 3);
  // on the back wall beside the part already there: far enough away
  const beside = sanitize({...p, ...importPart(p, "back", f).settings});
  assert.equal(liveWings(beside).length, 3, "both built");
  // a barn can have it too
  const barn = sanitize({kind: "cow", width: 16, depth: 9}), rb = importPart(barn, "left", f);
  assert.ok(!rb.error, rb.error);
  assert.equal(liveWings(sanitize({...barn, ...rb.settings})).length, 2);
});

test("import a part: not a part file, too many parts, no room, no such wall: an error, nothing changed", () => {
  const f = exportPart(source(), 3), p = target();
  assert.match(importPart(p, "back", {format: "something"}).error, /part/i);
  assert.match(importPart(p, "back", null).error, /part/i);
  assert.match(importPart(p, "nope", f).error, /wall/i);
  const full = sanitize({...target(), wings: Array.from({length: 11}, (_, i) => ({id: i + 1, wall: "back", pos: 0.5, width: 3, depth: 3}))});
  assert.equal(full.wings.length, 11);
  assert.match(importPart(full, "left", f).error, /many/i, "11 + 2 is more than 12");
  const tiny = sanitize({width: 3, depth: 3, wings: []});
  assert.match(importPart(tiny, "back", f).error, /room/i);
  assert.equal(p.wings.length, 1, "the building is not touched");
});

test("a part's pieces go with it: moved to the same place in the new part, those the new building has no kind of left out", () => {
  const s = source(), w = liveWings(s).find(x => x.id === 3), c = [(w.rect.x0 + w.rect.x1) / 2, (w.rect.z0 + w.rect.z1) / 2];
  const withItems = sanitize({...s, items: [{type: "table", x: c[0], z: c[1], rot: 0}, {type: "sofa", x: 0, z: 0, rot: 0}]});
  assert.equal(withItems.items.length, 2);
  const f = exportPart(withItems, 3);
  assert.equal(f.items.length, 1, "only the piece inside the part (the sofa is in the house)");
  assert.equal(f.items[0].type, "table");
  const p = target({items: []}), r = importPart(p, "back", f), q = sanitize({...p, ...r.settings}), a = liveWings(q).find(x => x.id === q.wings.find(w => w.name === "Pumphus").id);
  assert.equal(q.items.length, 1);
  const it = q.items[0], room = roomOf(q);
  assert.ok(it.x > a.rect.x0 && it.x < a.rect.x1 && it.z > a.rect.z0 && it.z < a.rect.z1, "inside the new part");
  // the same place seen from the part: its middle (the table was in the middle)
  assert.ok(Math.hypot(it.x - (a.rect.x0 + a.rect.x1) / 2, it.z - (a.rect.z0 + a.rect.z1) / 2) < 0.6, "in the middle of the part");
  // a hen house has no tables: the piece is left out, with a note
  const hen = sanitize({kind: "chicken", width: 12, depth: 8, items: []}), rh = importPart(hen, "left", f);
  assert.ok(!rh.error, rh.error);
  assert.equal(sanitize({...hen, ...rh.settings}).items.filter(x => x.type === "table").length, 0);
  assert.ok(rh.notes.some(n => /table|piece/i.test(n)), "says so: " + rh.notes);
});

test("a part file survives a round trip: out of one building and into an empty one gives the same part", () => {
  const f = exportPart(source(), 3), p = sanitize({width: 16, depth: 9, floors: 1, floorHeight: 3, foundation: 0.3}), r = importPart(p, "back", f), q = sanitize({...p, ...r.settings});
  const [a, b] = liveWings(q), [sa, sb] = liveWings(source());
  assert.deepEqual([a.ww, a.wd, a.floors, b.ww, b.wd].map(v => +v.toFixed(3)), [sa.ww, sa.wd, sa.floors, sb.ww, sb.wd].map(v => +v.toFixed(3)));
  assert.deepEqual(exportPart(q, a.id), {...f, items: f.items});
});
