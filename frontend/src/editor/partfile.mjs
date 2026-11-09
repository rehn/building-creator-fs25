// A part to share (docs/PLAN_PARTS.md, step 5): a part with the parts that stand on it, the windows and doors on their walls, the pieces inside and the
// materials it sets itself, saved as a file and put on a wall of another building (a barn, a shed, a house). Pure; no DOM.
//
// The file {format, version, name, parts, windows, items}:
//   parts:   the part is 1 (no wall: it is put on one when imported), what stands on it follows, each with a wall of the parts before it ("w1Left" ...)
//   windows: the windows and doors on those parts' walls (wall: "w1End" ...)
//   items:   the pieces inside, in the part's own frame: a along the wall it stands on (from where it starts), b out from the wall, rot against the wall
// What a part doesn't set itself (its panel, colours ...) is not in the file: it follows its new parent.
import { wallsOf, liveWings, wingsOf, wingIdOf, wingWallKey, MAX_WINGS } from "./layout.mjs";
import { sanitize, catalogFor, freeStretches } from "./model.mjs";

export const PART_FORMAT = "house-to-i3d-part";
const num = (v, d = 0) => Number.isFinite(+v) ? +v : d;
const round = v => Math.round(v * 1000) / 1000;
const SIDE = /(End|Left|Right)$/;
/** The turn (degrees, a quarter) that takes a piece's own axes to a wall's: along it and out from it. */
const wallTurn = u => ((Math.round(Math.atan2(-u[2], u[0]) * 180 / Math.PI / 90) * 90) % 360 + 360) % 360;
/** A wall's frame as the file's pieces need it: origin of the stretch a part stands on, u along the wall, n out of it. */
function frameOf(live, parentWall) {
  const o = live.at(live.s0, 0), m = parentWall;
  return {o: [o[0], o[2]], u: [m.u[0], m.u[2]], n: [m.n[0], m.n[2]], turn: wallTurn(m.u)};
}

/** The part with the given id, and what stands on it, as a file; null if there is no such part. */
export function exportPart(p, id) {
  const wings = p.wings || [], root = wings.find(w => w.id === id);
  if (!root) return null;
  const sub = [];
  for (const w of wings) if (w.id === id || sub.some(s => s.id === wingIdOf(w.wall))) sub.push(w);
  const local = new Map(sub.map((w, i) => [w.id, i + 1]));
  const parts = sub.map((w, i) => {
    const {id: _id, wall, pos, ...rest} = w, out = {id: i + 1};
    for (const [k, v] of Object.entries(rest)) if (v !== undefined && v !== "" && !(k === "name" && v === "")) out[k] = v;
    if (i > 0) { out.wall = wingWallKey(local.get(wingIdOf(wall)), SIDE.exec(wall)[1]); out.pos = pos; }
    return out;
  });
  const windows = (p.windows || []).filter(w => local.has(wingIdOf(w.wall))).map((w, i) => {
    const {id: _id, _hidden, ...rest} = w;
    return {...rest, id: i + 1, wall: wingWallKey(local.get(wingIdOf(w.wall)), SIDE.exec(w.wall)[1])};
  });
  // the pieces inside any of its parts, in the frame of the part it stands on
  const live = wingsOf(p), lr = live.find(x => x.id === id), items = [];
  if (lr && lr.frames && Array.isArray(p.items)) {
    const fr = frameOf(lr, wallsOf(p)[lr.wall]), rects = live.filter(x => x.frames && local.has(x.id)).map(x => x.rect);
    for (const it of p.items) {
      if (!rects.some(r => it.x > r.x0 && it.x < r.x1 && it.z > r.z0 && it.z < r.z1)) continue;
      const dx = it.x - fr.o[0], dz = it.z - fr.o[1], {id: _i, x: _x, z: _z, rot, ...rest} = it;
      items.push({...rest, a: round(dx * fr.u[0] + dz * fr.u[1]), b: round(dx * fr.n[0] + dz * fr.n[1]), rot: (((rot - fr.turn) % 360) + 360) % 360});
    }
  }
  return {format: PART_FORMAT, version: 1, name: root.name || `Wing ${id}`, parts, windows, items};
}

/**
 * Put a part file on a wall of building p: {settings: {wings, windows, items}, notes} to merge into p's settings, or {error} (p is not touched).
 * It goes where the wall has room (its stretch of the ground floor clear of other parts and their eaves, and of openings), as wide as it can be up to its own width.
 */
export function importPart(p, wallKey, file) {
  if (!file || file.format !== PART_FORMAT || !Array.isArray(file.parts) || !file.parts.length || file.parts.some(x => !x || typeof x !== "object")) return {error: "That is not a part file."};
  if (!wallsOf(p)[wallKey]) return {error: "There is no such wall to put it on."};
  const have = p.wings || [];
  if (have.length + file.parts.length > MAX_WINGS) return {error: `Too many parts: the building has ${have.length}, this adds ${file.parts.length}, and the most is ${MAX_WINGS}.`};
  const free = []; for (let i = 1; free.length < file.parts.length && i <= 99; i++) if (!have.some(w => w.id === i)) free.push(i);
  const newId = new Map(file.parts.map((x, i) => [num(x.id, i + 1), free[i]]));
  const {L, gaps} = freeStretches(p, wallKey, 0, true), rootIn = file.parts[0];
  const want = Math.max(2.5, num(rootIn.width, 6)), fit = gaps.filter(([a, b]) => b - a >= 2.5).sort((x, y) => (y[1] - y[0]) - (x[1] - x[0]))[0];
  if (!fit) return {error: "There is no room on that wall for a part: it is full, or its parts are too close."};
  const width = Math.min(want, fit[1] - fit[0]), notes = [];
  if (width < want - 1e-6) notes.push(`It is ${width.toFixed(1)} m wide here, not ${want.toFixed(1)} m: that is all the room there is.`);
  const covered = (p.windows || []).filter(w => w.wall === wallKey && w.type !== "door" && w.floor === 0 && w.pos * L > (fit[0] + fit[1]) / 2 - width / 2 && w.pos * L < (fit[0] + fit[1]) / 2 + width / 2).length;
  if (covered) notes.push(`${covered} window${covered > 1 ? "s" : ""} on that wall ${covered > 1 ? "are" : "is"} behind the part and hidden.`);
  const parts = file.parts.map((x, i) => {
    const {id, wall, pos, ...rest} = x, out = {...rest, id: newId.get(num(id, i + 1))};
    if (i === 0) Object.assign(out, {wall: wallKey, pos: (fit[0] + fit[1]) / 2 / L, width});
    else { const m = /^w(\d+)(End|Left|Right)$/.exec(String(wall)); out.wall = m && newId.has(+m[1]) ? wingWallKey(newId.get(+m[1]), m[2]) : wallKey; out.pos = num(pos, 0.5); }
    return out;
  });
  const wings = [...have, ...parts];
  const next = (list) => list.reduce((m, w) => Math.max(m, w.id || 0), 0);
  let wid = next(p.windows || []);
  const windows = [...(p.windows || []), ...(Array.isArray(file.windows) ? file.windows : []).filter(w => w && typeof w === "object").map(w => {
    const m = /^w(\d+)(End|Left|Right)$/.exec(String(w.wall));
    return m && newId.has(+m[1]) ? {...w, id: ++wid, wall: wingWallKey(newId.get(+m[1]), m[2])} : null;
  }).filter(Boolean)];
  // does it stand? (the parts that don't fit are left out, and the part itself is a reason to stop)
  const q = sanitize({...p, wings, windows}), live = wingsOf(q), root = live.find(x => x.id === parts[0].id);
  if (!root || !root.frames) return {error: root && root.off ? root.off : "It doesn't fit on that wall."};
  for (const x of parts.slice(1)) { const l = live.find(y => y.id === x.id); if (l && l.off) notes.push(`${x.name || `Part ${x.id}`} was left out: ${l.off}`); }
  // the pieces: into the same place of the new part, those the building has no kind of left out
  let items = Array.isArray(p.items) ? p.items : undefined;
  if (Array.isArray(file.items) && file.items.length && items) {
    const cat = catalogFor(q), fr = frameOf(root, wallsOf(q)[wallKey]);
    const mine = live.filter(x => x.frames && [...newId.values()].includes(x.id)).map(x => x.rect), added = [], missing = new Set(); let outside = 0;
    for (const it of file.items) {
      if (!it || typeof it !== "object" || !Object.hasOwn(cat, it.type)) { if (it && it.type) missing.add(it.type); continue; }
      const {a, b, rot, ...rest} = it, x = fr.o[0] + num(a) * fr.u[0] + num(b) * fr.n[0], z = fr.o[1] + num(a) * fr.u[1] + num(b) * fr.n[1];
      if (!mine.some(r => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1)) { outside++; continue; }
      added.push({...rest, x: round(x), z: round(z), rot: (((num(rot) + fr.turn) % 360) + 360) % 360});
    }
    if (missing.size) notes.push(`Pieces this building has no kind of were left out: ${[...missing].join(", ")}.`);
    if (outside) notes.push(`${outside} piece${outside > 1 ? "s" : ""} didn't fit in the part here and ${outside > 1 ? "were" : "was"} left out.`);
    items = [...items, ...added.map((it, i) => ({...it, id: next(items) + i + 1}))];
  } else if (Array.isArray(file.items) && file.items.length && !items) notes.push("This building has no pieces inside, so the part's were left out.");
  return {settings: {wings, windows, ...(items ? {items} : {})}, notes};
}
