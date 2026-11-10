// Laying out a walk-in building's inside: the room, placed pieces (items), snapping and checks.
// Pure functions with no DOM, shared by the export, the editor and every kind's catalog.
//
// An item is {id, type, x, z, rot, ...its settings}: the centre of its footprint on the floor, in
// the building's own coordinates (metres, origin in the middle, +z out of the front wall), and a
// quarter turn rot (0, 90, 180, 270) about +y. In the item's own frame +x runs along it and +z is
// its front; a wall item's back (-z) goes against the wall.
//
// A catalog maps a type to its definition:
//   {name, mount: "wall" | "floor", params: [{k, label, min, max, step}], defaults,
//    size(item) -> [width along x, depth along z], height(item), build(c, item), collision}

/** Wall thickness of a walk-in building (the window and door reveals' depth). */
export const WALL_T = 0.15;
/** Snapping grid, metres. */
export const GRID = 0.25;
/** How far into the room the doorway is kept clear. */
const DOOR_CLEAR = 1.2;
const MAX_ITEMS = 200;

/** Each wall: o = its start corner at floor height F, u = along it, n = out of the building, L = length. */
/** Whether one of the building's four walls is left open (a carport's or lean-to's side: posts and a beam instead): the settings openFront, openBack, openLeft, openRight. */
export const openSide = (P, key) => ["front", "back", "left", "right"].includes(key) && !!P["open" + key[0].toUpperCase() + key.slice(1)];
export function wallFrames(W, D, F) {
  return {
    front: {o: [-W/2, F, D/2], u: [1, 0, 0], n: [0, 0, 1], L: W},
    back: {o: [W/2, F, -D/2], u: [-1, 0, 0], n: [0, 0, -1], L: W},
    right: {o: [W/2, F, D/2], u: [0, 0, -1], n: [1, 0, 0], L: D},
    left: {o: [-W/2, F, -D/2], u: [0, 0, 1], n: [-1, 0, 0], L: D},
  };
}

/**
 * Most parts (wings, at any depth) a building can have besides its main part: 12 to start with, set by the server's MAX_PARTS variable
 * (setMaxParts, called when the app starts), never above HARD_MAX_PARTS. A live binding: importers see the new value.
 */
export let MAX_WINGS = 12;
export const HARD_MAX_PARTS = 40;
export const DEFAULT_MAX_PARTS = 12;
export function setMaxParts(n) {
  const v = Math.round(+n);
  MAX_WINGS = Number.isFinite(v) ? Math.min(HARD_MAX_PARTS, Math.max(1, v)) : DEFAULT_MAX_PARTS;
}
/** A wing's walls in the window list: "w1End" (its far end), "w1Left", "w1Right" (its sides, as you face its end). */
export const wingWallKey = (id, part) => `w${id}${part}`;
export const WING_PARTS = ["End", "Left", "Right"];
export const WING_WALLS = Array.from({length: HARD_MAX_PARTS}, (_, i) => WING_PARTS.map(s => wingWallKey(i + 1, s))).flat();
/** The wing a wall key belongs to (its id), or 0 for the house's own four walls. */
export const wingIdOf = key => { const m = /^w(\d+)(End|Left|Right|D\d)$/.exec(key || ""); return m ? +m[1] : 0; };
/** The key of divider n of a part ("w1D2"): a wall across the part. */
export const wingSplitKey = (id, n) => `w${id}D${n}`;
/** Whether a wall key is a divider's (the building's "s1" or a part's "w1D1"). */
export const isSplitWall = key => /^(s\d+|w\d+D\d)$/.test(key || "");
/** The roof's thickness (the model's too): a gable-end wing's roof stays under the house's gable overhang. */
const ROOF_T = 0.16;
/** Most dividers (walls across the building, see splitsOf) a building can have. */
export const MAX_SPLITS = 4;
export const splitKey = id => "s" + id;
export const SPLIT_WALLS = Array.from({length: MAX_SPLITS}, (_, i) => splitKey(i + 1));
export const WING_SPLIT_WALLS = Array.from({length: HARD_MAX_PARTS}, (_, i) => Array.from({length: MAX_SPLITS}, (_, n) => wingSplitKey(i + 1, n + 1))).flat();
/**
 * The dividers: P.splits = [{id, at (m from the front's left end, or from the back, along the ridge)}], each a wall across the building up to the roof, with the
 * key "s" + id. {id, key, at, frame}: frame as the other walls', its outer face towards the far end (+x, or +z with the ridge from front to back), L as
 * long as the building is wide there. None under a hip roof (its wall would have to follow two slopes).
 */
export function splitsOf(P) {
  if (!P || !Array.isArray(P.splits) || P.roofType === "hip") return [];
  const W = P.width, D = P.depth, F = P.foundation, t = WALL_T, ridgeX = P.ridge === "width";
  return P.splits.map(s => ({id: s.id, key: splitKey(s.id), at: s.at, floors: s.floors || 0, heights: s.heights || [], half: s.half === true ? true : s.half === false ? false : null,
    frame: ridgeX ? {o: [-W / 2 + s.at + t / 2, F, D / 2], u: [0, 0, -1], n: [1, 0, 0], L: D} : {o: [-W / 2, F, -D / 2 + s.at + t / 2], u: [1, 0, 0], n: [0, 0, 1], L: W}}));
}
/**
 * The house's parts besides the main building (P.wings: {id, wall, pos, width, depth, floors ...}), each as {id, ...} or {id, off: why}. They form a tree:
 * a wing's wall is a wall of the house ("front" ...) or of an earlier wing ("w1Left" ...), so wingIdOf(wall) is its parent's id (0: the house).
 * A part that fits has: parent, type, wall, s0, s1 (along that wall), sc, ww (width), wd (length out), floors,
 * half (1½-plan), pitch, tanW (its own roof pitch), H (wall height), fh (floor height), frames {w1End, w1Left, w1Right}, rect {x0, x1, z0, z1}, at(s, d).
 * Floors, floor height, half floor and roof pitch are its own when set and its parent's otherwise (0 = as the parent); it has no more floors than its parent.
 * type: "valley" on a wall along the ridge when its roof reaches the parent's slope (it meets it in a valley),
 * "eave" when it is lower than that (its roof runs up to the wall under the eaves), "gable" on a gable end
 * (a lower annex under the gable), "flat" under a flat roof. A part has the house's overhang, so the eaves line up; it is made
 * narrower and moved along its wall when it has to be to fit. A part meets only its parent with its roof: one that would touch (eaves and all)
 * another part, or whose parent is left out, or that can't be built, is {id, off: why}.
 */
/** The heights of the building's floors: floorHeight for the ground floor, floor2Height / floor3Height above (0 = as the ground floor). */
export function floorsOf(P) {
  return Array.from({length: P.floors}, (_, i) => i === 0 ? P.floorHeight : (+P["floor" + (i + 1) + "Height"] > 0 ? +P["floor" + (i + 1) + "Height"] : P.floorHeight));
}
/** The walls' height: all the floors (and a knee wall under a half floor). */
export const totalHeight = P => floorsOf(P).reduce((a, b) => a + b, 0) + (P.halfStorey ? P.kneeWall : 0);
/** Where floor i starts, above the foundation: the heights before it (a floor past the last, such as a half floor, goes on from the last height). */
export const floorBase = (hs, i) => { let y = 0; for (let k = 0; k < i; k++) y += hs[Math.min(k, hs.length - 1)]; return y; };
/** Which floor a height t (above the foundation) is on. */
export const floorAt = (hs, t) => { let i = 0; while (i < 3 && t >= floorBase(hs, i + 1) - 1e-6) i++; return i; };
export function wingsOf(P) {
  if (!P || !Array.isArray(P.wings)) return [];
  const W = P.width, D = P.depth, F = P.foundation, main = wallFrames(W, D, F), out = [];
  const ridgeX = P.roofType === "hip" ? W >= D : P.ridge === "width";
  const tanP = Math.tan(P.roofPitch * Math.PI / 180), o = P.overhang, Lr = ridgeX ? W : D, span = ridgeX ? D : W;
  const top = F + totalHeight(P), eaveY = top - o * tanP;
  const houseRect = {x0: -W / 2, x1: W / 2, z0: -D / 2, z1: D / 2};
  for (const w of P.wings.slice(0, MAX_WINGS)) {
    const pid = wingIdOf(w.wall), par = pid ? out.find(q => q.id === pid) : null;
    if (pid && !(par && par.frames)) { out.push({id: w.id, off: par ? "The part it stands on is left out." : "The part it stands on is missing."}); continue; }
    const key = par ? w.wall : main[w.wall] ? w.wall : "back", m = par ? par.frames[key] : main[key];
    // what it takes from its parent unless it sets it itself
    const pFloors = par ? par.floors : P.floors, pHs = par ? par.hs : floorsOf(P), pPitch = par ? par.pitch : P.roofPitch, pHalf = par ? par.half : P.halfStorey;
    const own = +w.floors > 0;
    const floors = Math.max(1, Math.min(pFloors, Math.round(own ? w.floors : pFloors))), half = own ? !!w.half : !!pHalf;
    // the heights: its own (floorHeight for the ground floor, floor2Height, floor3Height), else its parent's
    const mine = i => { const v = +w[i ? "floor" + (i + 1) + "Height" : "floorHeight"]; return v > 0 ? Math.min(9, Math.max(2.3, v)) : 0; };
    const hs = Array.from({length: floors}, (_, i) => mine(i) || (mine(0) && i ? mine(0) : pHs[Math.min(i, pHs.length - 1)])), fh = hs[0];
    const pitch = +w.pitch > 0 ? Math.min(60, Math.max(5, +w.pitch)) : pPitch;
    const Hw = hs.reduce((a, b) => a + b, 0) + (half ? P.kneeWall : 0), topW = F + Hw, tanW = Math.tan(pitch * Math.PI / 180);
    const part = par ? /(End|Left|Right)$/.exec(key)[1] : null;
    // the roof it meets: the house's, or its parent's (a gable roof along the parent's length)
    const rp = par ? {top: F + par.H, tan: par.tanW, span: par.ww} : {top, tan: tanP, span};
    const alongRidge = par ? part !== "End" : (Math.abs(m.u[0]) > 0.5) === ridgeX;
    let type, hl, maxW = Infinity;
    if (P.roofType === "flat") { type = "flat"; hl = m.L / 2; }
    else if (alongRidge) {
      hl = par ? m.L / 2 : (P.roofType === "hip" ? Lr / 2 + o : Lr / 2 + Math.min(o, 0.5)) - o;
      // as wide as it is, its ridge is at topW + ww/2 tan: at the parent's eaves or above it meets the slope (valley);
      // a lower one runs up to the wall under the eaves, and stays under their overhang
      const eaveP = rp.top - o * rp.tan, wMin = 2 * (eaveP - topW) / tanW, wEave = 2 * (eaveP - ROOF_T - 0.1 - topW) / tanW;
      if (w.width < wMin) { type = "eave"; maxW = wEave; } else { type = "valley"; maxW = par ? 2 * (rp.top + rp.span / 2 * rp.tan - topW) / tanW : span; }
    } else if (par || P.roofType === "gable") {
      type = "gable";
      hl = rp.span / 2 - ROOF_T / rp.tan - 0.05;
    } else { out.push({id: w.id, off: "On a hip roof a wing goes on a long side, under the eaves."}); continue; }
    hl = Math.min(hl, m.L / 2);
    const ww = Math.min(w.width, 2 * hl, maxW);
    if (ww < 2) { out.push({id: w.id, off: "There isn't room for a wing like that on that wall: make the house bigger, the wing lower or the overhang smaller."}); continue; }
    const cmax = hl - ww / 2, c = Math.min(cmax, Math.max(-cmax, (w.pos - 0.5) * m.L));
    const sc = m.L / 2 + c, s0 = sc - ww / 2, s1 = sc + ww / 2, wd = w.depth;
    const at = (s, d) => [m.o[0] + m.u[0] * s + m.n[0] * d, F, m.o[2] + m.u[2] * s + m.n[2] * d];
    const neg = v => v.map(x => -x + 0), id = w.id;
    const frames = {
      [wingWallKey(id, "End")]: {o: at(s0, wd), u: m.u, n: m.n, L: ww},
      [wingWallKey(id, "Left")]: {o: at(s0, 0), u: m.n, n: neg(m.u), L: wd},
      [wingWallKey(id, "Right")]: {o: at(s1, wd), u: neg(m.n), n: m.u, L: wd},
    };
    // its dividers: walls across it, as wide as it is, at their places out from the wall it stands on
    const splits = (w.splits || []).filter(s => s.at >= 1 && s.at <= wd - 1);
    for (const s of splits) frames[wingSplitKey(id, s.id)] = {o: at(s0, s.at + WALL_T / 2), u: m.u, n: m.n, L: ww};
    const a = at(s0, 0), b = at(s1, wd);
    const rect = {x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[2], b[2]), z1: Math.max(a[2], b[2])};
    // one that touches another part than its parent, eaves and all (two on one wall too close, two meeting at a corner, a part against the house), isn't built
    const g = o - 0.05, others = [...out.filter(q => q.rect && q.id !== pid).map(q => q.rect), ...(par ? [houseRect] : [])];
    const clash = others.find(q => q.x0 - o < rect.x1 + g && rect.x0 - o < q.x1 + g && q.z0 - o < rect.z1 + g && rect.z0 - o < q.z1 + g);
    if (clash) { out.push({id, off: "It is too close to another part (their eaves would touch): move it along the wall or onto another wall."}); continue; }
    out.push({id, parent: pid, closed: w.closed === true, splits, type, wall: key, s0, s1, sc, ww, wd, floors, fh, hs, half, pitch, tanW, H: Hw, frames, rect, at});
  }
  return out;
}
/**
 * The heights of the floors of a section of the building (or of a part) with the given number of floors (0 = as the building: base = the building's own heights), the total height
 * the same: heights are the heights of its floors from the ground up (a number: just the ground floor's), one for each floor but the top, which is what is left (0 or missing: a share of what is
 * left); none lower than 2.3 m, and no more floors than fit.
 */
export function sectionHs(base, floors, heights = [], total = null) {
  const hl = typeof heights === "number" ? (heights > 0 ? [heights] : []) : (heights || []);
  const sum = base.reduce((a, b) => a + b, 0), T = total === null ? sum : total;
  total = T;
  const n = Math.max(1, Math.min(floors > 0 ? floors : base.length, Math.floor(total / 2.3 + 1e-9)));
  if (n === base.length && !hl.some(v => v > 0) && Math.abs(T - sum) < 1e-9) return base;
  if (n === 1) return [total];
  const out = [];
  let rest = total;
  for (let i = 0; i < n - 1; i++) {
    const want = hl[i] > 0 ? hl[i] : rest / (n - i), h = Math.max(2.3, Math.min(want, rest - (n - 1 - i) * 2.3));
    out.push(h); rest -= h;
  }
  out.push(rest);
  return out;
}
/**
 * The heights of the floors (hs) when floor i is set to x, the total the same: the floor above it takes or gives back the difference, and if it can't (none under 2.3 m) the next one does, and so on up.
 * The lower floors have the say: the top floor is never changed (it is what is left). A new array.
 */
export function cascadeHeight(hs, i, x, min = 2.3) {
  const n = hs.length, v = hs.slice();
  if (i < 0 || i >= n - 1) return v;
  const total = hs.reduce((a, b) => a + b, 0), hi = total - hs.slice(0, i).reduce((a, b) => a + b, 0) - (n - 1 - i) * min;
  v[i] = Math.max(min, Math.min(x, hi));
  let need = hs[i] - v[i];
  for (let j = i + 1; j < n; j++) {
    const nj = v[j] + need;
    if (nj >= min - 1e-9) { v[j] = nj; break; }
    v[j] = min; need = nj - min;
  }
  return v;
}
/**
 * The sections of the building (wid 0) or of a part: [{index, from, to, floors, hs}] along its length (the ridge; the part's depth out from its wall), one for each stretch between
 * the dividers. The first has the building's own floors; each divider's floors and heights are for the section after it.
 */
export function sectionsOf(P, wid = 0) {
  const wg = wid ? liveWings(P).find(x => x.id === wid) : null;
  if (wid && !wg) return [];
  const list = wid ? wg.splits : splitsOf(P), L = wid ? wg.wd : (P.ridge === "width" ? P.width : P.depth), base = wid ? wg.hs : floorsOf(P), out = [];
  const baseHalf = !!(wid ? wg.half : P.halfStorey), knee = P.kneeWall, totalH = base.reduce((a, b) => a + b, 0) + (baseHalf ? knee : 0);
  let from = 0, cur = {floors: 0, heights: [], half: null};
  for (let i = 0; i <= list.length; i++) {
    // (the walls are as high in every section: with an attic a section's floors have that height less the knee wall, without one (when the building has it) they have the knee wall's height too)
    const half = cur.half === true ? true : cur.half === false ? false : baseHalf, to = i < list.length ? list[i].at : L, hs = sectionHs(base, cur.floors, cur.heights, totalH - (half ? knee : 0));
    out.push({index: i, from, to, floors: hs.length, hs, half});
    from = to; if (i < list.length) cur = list[i];
  }
  return out;
}
/** The most floors any section of the building (wid 0) or of a part has: what a wall can have windows on (a section can have more floors than the building's own setting). 0 for a part that isn't built. */
/** Whether wall key is a gable wall (shaped like a gable: an attic window can go in it): a gable end of a gable roof, the end of a part (not under a flat roof), or a divider (shaped like one). */
export function isGableWall(P, key) {
  const wid = wingIdOf(key);
  if (isSplitWall(key)) return wid ? (liveWings(P).find(x => x.id === wid) || {type: "flat"}).type !== "flat" : P.roofType === "gable";
  if (wid) return key.endsWith("End") && P.roofType !== "flat";
  return P.roofType === "gable" && (P.ridge === "width" ? key === "left" || key === "right" : key === "front" || key === "back");
}
/** Whether wall key has floor f (from 0) somewhere along it: a full floor of one of its sections, or the attic of a section that has one, on a wall an attic window can go in. */
export function wallHasFloor(P, key, f) {
  const w = wallsOf(P)[key];
  if (!w) return false;
  const gable = isGableWall(P, key);
  return sectionRuns(P, key, w.L).some(r => f < r.sec.floors || (gable && r.sec.half && f === r.sec.floors));
}
/** How the dividers of the building (wid 0) or of a part run: {axis (0 = x, 2 = z), origin (where at = 0 is), sg (the direction at grows in), L (the length), list (the dividers), keyOf, rect (the floor)}, or null. */
function splitAxisOf(P, wid = 0) {
  if (!wid) {
    if (P.roofType === "hip") return null;
    const axis = P.ridge === "width" ? 0 : 2;
    return {axis, origin: axis === 0 ? -P.width / 2 : -P.depth / 2, sg: 1, L: axis === 0 ? P.width : P.depth, list: splitsOf(P), keyOf: s => s.key, rect: {x0: -P.width / 2, x1: P.width / 2, z0: -P.depth / 2, z1: P.depth / 2}};
  }
  const wg = liveWings(P).find(g => g.id === wid);
  if (!wg) return null;
  const fr = wg.frames[wingWallKey(wid, "Left")], axis = Math.abs(fr.u[0]) > 0.5 ? 0 : 2;
  return {axis, origin: fr.o[axis], sg: Math.sign(fr.u[axis]) || 1, L: wg.wd, list: wg.splits, keyOf: s => wingSplitKey(wid, s.id), rect: wg.rect};
}
/** The divider (of the building or of a part) at the point (x, z) in the plan, within tol metres of its middle: {pid, id}, or null. */
export function dividerAt(P, x, z, tol = 0.35) {
  for (const wid of [0, ...liveWings(P).map(g => g.id)]) {
    const a = splitAxisOf(P, wid);
    if (!a) continue;
    const [c, o] = a.axis === 0 ? [x, z] : [z, x], lo = a.axis === 0 ? a.rect.z0 : a.rect.x0, hi = a.axis === 0 ? a.rect.z1 : a.rect.x1;
    if (o < lo - 0.05 || o > hi + 0.05) continue;
    const s = a.list.find(s => Math.abs(c - (a.origin + a.sg * s.at)) <= tol + WALL_T / 2);
    if (s) return {pid: wid, id: s.id};
  }
  return null;
}
/** Where divider id of the building (pid 0) or of a part goes when it is dragged to a point with the coordinate along the length (x or z): its new "at", to 5 cm, at least 2 m from the ends and from the other dividers. */
export function splitAtFrom(P, pid, id, coord) {
  const a = splitAxisOf(P, pid);
  if (!a) return null;
  const sorted = a.list.slice().sort((u, v) => u.at - v.at), i = sorted.findIndex(s => s.id === id);
  if (i < 0) return null;
  const c = Array.isArray(coord) ? coord[a.axis === 0 ? 0 : 2] : coord, lo = i ? sorted[i - 1].at + 2 : 2, hi = i < sorted.length - 1 ? sorted[i + 1].at - 2 : a.L - 2;
  return Math.round(Math.max(lo, Math.min(hi, (c - a.origin) * a.sg)) * 20) / 20;
}
/** The most floors, an attic counted, any section of the building (wid 0) or of a part has. */
export const maxFloorsWithAttic = (P, wid = 0) => Math.max(0, ...sectionsOf(P, wid).map(s => s.floors + (s.half ? 1 : 0)));
export const maxFloors = (P, wid = 0) => Math.max(0, ...sectionsOf(P, wid).map(s => s.floors));
/**
 * The stretches of wall key (length L) by section: [{a, b, sec}] in the wall's own s, from its left end seen from outside. A wall along the building runs the way the building's length does
 * (or the other way, on the far side); an end wall is in one section (the first or the last); a divider is in the section with more floors.
 * secs: the sections (sectionsOf) if the caller has them.
 */
export function sectionRuns(P, key, L, secs = null) {
  const wid = wingIdOf(key);
  secs = secs || sectionsOf(P, wid);
  if (!secs.length) return [];
  if (secs.length === 1) return [{a: 0, b: L, sec: secs[0]}];
  const one = sec => [{a: 0, b: L, sec}];
  if (isSplitWall(key)) {
    const list = wid ? (liveWings(P).find(x => x.id === wid) || {splits: []}).splits : splitsOf(P), i = list.findIndex(s => (wid ? wingSplitKey(wid, s.id) : splitKey(s.id)) === key);
    const A = secs[Math.max(0, i)], B = secs[Math.min(secs.length - 1, i + 1)];
    return one(i < 0 ? secs[0] : B.floors >= A.floors ? B : A);
  }
  let way;
  if (wid) way = key.endsWith("Left") ? "fwd" : key.endsWith("Right") ? "rev" : "last";
  else if (P.ridge === "width") way = {front: "fwd", back: "rev", left: "first", right: "last"}[key];
  else way = {left: "fwd", right: "rev", back: "first", front: "last"}[key];
  if (way === "first") return one(secs[0]);
  if (way === "last" || !way) return one(secs[secs.length - 1]);
  const runs = secs.map(sc => way === "fwd" ? {a: sc.from, b: Math.min(L, sc.to), sec: sc} : {a: Math.max(0, L - sc.to), b: L - sc.from, sec: sc});
  return way === "fwd" ? runs : runs.reverse();
}
/** The floor of a point s metres along wall key and t metres above the foundation: by the floors of the section the wall has there (never past its last floor, an attic included). */
export function wallFloorAt(P, key, s, t) {
  const w = wallsOf(P)[key];
  const runs = w ? sectionRuns(P, key, w.L) : [], run = runs.find(r => s >= r.a && s < r.b) || runs[runs.length - 1];
  if (!run) return 0;
  return Math.max(0, Math.min(floorAt(run.sec.hs, t), run.sec.floors - 1 + (run.sec.half ? 1 : 0)));
}
/** The section that contains the point (x, z) in the plan, of the building (wid 0) or a part, or null. */
export function sectionAtPoint(P, wid, x, z, secs = null) {
  secs = secs || sectionsOf(P, wid);
  if (!secs.length) return null;
  let along;
  if (wid) { const f = (wallsOf(P)[wingWallKey(wid, "Left")]); if (!f) return secs[0]; along = (x - f.o[0]) * f.u[0] + (z - f.o[2]) * f.u[2]; }
  else along = P.ridge === "width" ? x + P.width / 2 : z + P.depth / 2;
  return secs.find(s => along >= s.from && along < s.to) || (along < 0 ? secs[0] : secs[secs.length - 1]);
}
/** The wings that fit (not {off}). */
export const liveWings = P => wingsOf(P).filter(w => w.frames);
/** Every wall of the building by key: the four, and each wing's three. */
export function wallsOf(P) {
  return Object.assign(wallFrames(P.width, P.depth, P.foundation), ...liveWings(P).map(w => w.frames), ...splitsOf(P).map(s => ({[s.key]: s.frame})));
}

/** Where an entry of the window list (a window, or a door made from one) is along its wall (length L): [s0, s1]. */
export function openingSpan(win, L) {
  const ww = Math.min(win.w, L - 0.4), c = Math.min(L - ww/2 - 0.2, Math.max(ww/2 + 0.2, win.pos * L));
  return [c - ww/2, c + ww/2];
}
/** The building's doors: the window list's ground-floor doors, in order. */
export const doorsOf = p => (p.windows || []).filter(w => w.type === "door" && w.floor === 0);

/**
 * The room inside a walk-in building: the main part's floor inside its walls {x0, x1, z0, z1}, floor height F,
 * wall height H, the first door's keep-out rectangle (door), every keep-out as keepOut [{rect, what}], and:
 *   rects: the floor of every part (the main part first, then each wing: abutting rectangles, so the room is
 *          their union; the wing's walls open into the house through a passage)
 *   walls: the inside face of every stretch of wall round the room (a wall where a wing opens is in two
 *          pieces), {name, x0, x1, z0, z1 (the line), into: [x, z] (towards the room), rot (of an item facing
 *          into the room)}. name: the house's side ("front" ...), or the wing's wall ("w1Left" ...).
 * openings: other openings to keep clear inside, [{wall, s0, s1, clear, what}] (a hen hatch ...).
 */
export function roomOf(p, openings = []) {
  const W = p.width, D = p.depth, F = p.foundation, t = WALL_T;
  const H = totalHeight(p);
  const x0 = -W/2 + t, x1 = W/2 - t, z0 = -D/2 + t, z1 = D/2 - t;
  const frames = wallsOf(p), main = wallFrames(W, D, F);
  // A keep-out: the opening's width plus 30 cm each side, from the wall `clear` into the room.
  const keep = (wall, s0, s1, clear) => {
    const w = frames[wall], at = (s, d) => [w.o[0] + w.u[0] * s + w.n[0] * d, w.o[2] + w.u[2] * s + w.n[2] * d];
    const a = at(s0 - 0.3, -t), b = at(s1 + 0.3, -t - clear);
    return {x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1])};
  };
  // every door that opens is kept clear inside (one that stays shut needn't be)
  // (a door in a divider is kept clear on the other side too: the wall between two rooms)
  const keepFar = (wall, s0, s1, clear) => {
    const w = frames[wall], at = (s, d) => [w.o[0] + w.u[0] * s + w.n[0] * d, w.o[2] + w.u[2] * s + w.n[2] * d], a = at(s0 - 0.3, 0), b = at(s1 + 0.3, clear);
    return {x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1])};
  };
  const doors = doorsOf(p).filter(w => w.opens !== false && frames[w.wall]).flatMap(w => {
    const span = openingSpan(w, frames[w.wall].L), near = {rect: keep(w.wall, ...span, DOOR_CLEAR), what: "a door"};
    return isSplitWall(w.wall) ? [near, {rect: keepFar(w.wall, ...span, DOOR_CLEAR), what: "a door"}] : [near];
  });
  const door = doors.length ? doors[0].rect : null;
  const keepOut = [...doors, ...openings.map(o => ({rect: keep(o.wall, o.s0, o.s1, o.clear), what: o.what}))];
  // the floors: the main part's, and each wing's from the main wall's inside face to its far wall's inside face
  const parts = [{rect: {x0, x1, z0, z1}, nm: {back: "back", front: "front", left: "left", right: "right"}, wid: 0}];
  for (const w of liveWings(p)) {
    const m = frames[w.wall], at = (s, d) => [m.o[0] + m.u[0] * s + m.n[0] * d, m.o[2] + m.u[2] * s + m.n[2] * d];
    // (a closed part starts at the parent wall's outer face: the wall stays between the rooms)
    const a = at(w.s0 + t, w.closed ? 0 : -t), b = at(w.s1 - t, w.wd - t);
    const rect = {x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1])};
    // an edge's outward direction says which of the wing's walls it is
    const key = part => wingWallKey(w.id, part), n = part => w.frames[key(part)].n;
    const dir = {back: [0, -1], front: [0, 1], left: [-1, 0], right: [1, 0]}, nm = {};
    for (const side in dir) for (const part of WING_PARTS) if (Math.abs(n(part)[0] - dir[side][0]) < 1e-6 && Math.abs(n(part)[2] - dir[side][1]) < 1e-6) nm[side] = key(part);
    // the edge facing the parent is the parent's wall seen from this side
    if (w.closed) for (const side in dir) if (!nm[side] && Math.abs(m.n[0] + dir[side][0]) < 1e-6 && Math.abs(m.n[2] + dir[side][1]) < 1e-6) nm[side] = w.wall;
    parts.push({rect, nm, wid: w.id});
  }
  // The room for placing things: each floor cut at its dividers, one rectangle for each section with the wall between them left out (pieces can't cross it, and it is a wall of both: its two
  // faces are wall stretches named after it). The floor itself (floorRects) is whole: it runs under the walls and the doorways in them.
  const rects = [], names = [];
  for (const q of parts) {
    const secs = sectionsOf(p, q.wid);
    if (secs.length <= 1) { rects.push({...q.rect, wid: q.wid, sec: 0}); names.push(q.nm); continue; }
    const wg = q.wid ? liveWings(p).find(g => g.id === q.wid) : null, list = q.wid ? wg.splits : splitsOf(p), keyOf = s => q.wid ? wingSplitKey(q.wid, s.id) : splitKey(s.id);
    let axis, origin, sg;
    if (!q.wid) { axis = p.ridge === "width" ? 0 : 2; origin = axis === 0 ? -W / 2 : -D / 2; sg = 1; }
    else { const fr = frames[wingWallKey(q.wid, "Left")]; axis = Math.abs(fr.u[0]) > 0.5 ? 0 : 2; origin = fr.o[axis]; sg = Math.sign(fr.u[axis]) || 1; }
    const lo = axis === 0 ? q.rect.x0 : q.rect.z0, hi = axis === 0 ? q.rect.x1 : q.rect.z1;
    const cuts = list.map(s => ({c: origin + sg * s.at, key: keyOf(s)})).sort((u, v) => u.c - v.c), lowSide = axis === 0 ? "left" : "back", highSide = axis === 0 ? "right" : "front";
    let start = lo;
    [...cuts, {c: hi + t / 2, key: null}].forEach((cut, i) => {
      const end = Math.min(hi, cut.c - t / 2);
      if (end - start > 0.05) {
        const nm = {...q.nm};
        if (i > 0) nm[lowSide] = cuts[i - 1].key;
        if (cut.key) nm[highSide] = cut.key;
        rects.push({...q.rect, ...(axis === 0 ? {x0: start, x1: end} : {z0: start, z1: end}), wid: q.wid, sec: sg > 0 ? i : secs.length - 1 - i});
        names.push(nm);
      }
      start = Math.max(start, cut.c + t / 2);
    });
  }
  return {x0, x1, z0, z1, F, H, door, keepOut, rects, floorRects: parts.map(q => q.rect), walls: wallSegments(rects, names)};
}

const EPS = 1e-6;
/** The stretches of the rectangles' edges that are walls (not shared with another rectangle): see roomOf. */
function wallSegments(rects, names) {
  const edges = [
    {side: "back", line: r => r.z0, span: r => [r.x0, r.x1], across: r => r.z1, horiz: true, into: [0, 1], rot: 0},
    {side: "front", line: r => r.z1, span: r => [r.x0, r.x1], across: r => r.z0, horiz: true, into: [0, -1], rot: 180},
    {side: "left", line: r => r.x0, span: r => [r.z0, r.z1], across: r => r.x1, horiz: false, into: [1, 0], rot: 90},
    {side: "right", line: r => r.x1, span: r => [r.z0, r.z1], across: r => r.x0, horiz: false, into: [-1, 0], rot: 270},
  ];
  const opposite = {back: "front", front: "back", left: "right", right: "left"}, out = [];
  rects.forEach((r, i) => {
    for (const e of edges) {
      let pieces = [e.span(r)];
      // a rectangle abutting on the other side of this edge covers that stretch
      const other = edges.find(x => x.side === opposite[e.side]);
      rects.forEach((q, j) => {
        if (j === i || Math.abs(other.line(q) - e.line(r)) > EPS) return;
        const [a, b] = other.span(q);
        pieces = pieces.flatMap(([u, v]) => [[u, Math.min(v, a)], [Math.max(u, b), v]]).filter(([u, v]) => v - u > EPS);
      });
      for (const [u, v] of pieces) {
        if (v - u < 0.05) continue;
        const c = e.line(r);
        out.push({name: names[i][e.side], ...(e.horiz ? {x0: u, x1: v, z0: c, z1: c} : {x0: c, x1: c, z0: u, z1: v}), into: e.into, rot: e.rot});
      }
    }
  });
  return out;
}

/** Whether the rectangle f is inside the room (all of it, within the union of its floors). */
export function inRoom(room, f, eps = 1e-6) {
  const rs = room.rects || [room];
  if (rs.length === 1) return f.x0 >= rs[0].x0 - eps && f.x1 <= rs[0].x1 + eps && f.z0 >= rs[0].z0 - eps && f.z1 <= rs[0].z1 + eps;
  const cuts = (lo, hi, key) => [lo, hi, ...rs.flatMap(r => key(r))].filter(v => v >= lo && v <= hi).sort((a, b) => a - b);
  const xs = cuts(f.x0, f.x1, r => [r.x0, r.x1]), zs = cuts(f.z0, f.z1, r => [r.z0, r.z1]);
  for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < zs.length; j++) {
    if (xs[i + 1] - xs[i] < eps || zs[j + 1] - zs[j] < eps) continue;
    const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
    if (!rs.some(r => cx >= r.x0 && cx <= r.x1 && cz >= r.z0 && cz <= r.z1)) return false;
  }
  return true;
}
/** The rectangle round all of the room's floors. */
export const roomBox = room => { const rs = room.rects || [room]; return {x0: Math.min(...rs.map(r => r.x0)), x1: Math.max(...rs.map(r => r.x1)), z0: Math.min(...rs.map(r => r.z0)), z1: Math.max(...rs.map(r => r.z1))}; };

const R = rot => rot * Math.PI / 180;
/** The world (x, z) of the point (lx, lz) in the item's own frame. */
export function toWorld(item, lx, lz) {
  const r = R(item.rot), c = Math.cos(r), s = Math.sin(r);
  return [item.x + lx * c + lz * s, item.z - lx * s + lz * c];
}

/** The rectangle an item covers on the floor. */
export function footprint(item, def) {
  const [w, d] = def.size(item);
  // (a quarter turn exactly; any other angle: the box round the turned rectangle)
  const quarter = item.rot % 90 === 0, turned = item.rot % 180 !== 0, c = Math.abs(Math.cos(R(item.rot))), s = Math.abs(Math.sin(R(item.rot)));
  const hx = (quarter ? (turned ? d : w) : w * c + d * s) / 2, hz = (quarter ? (turned ? w : d) : w * s + d * c) / 2;
  return {x0: item.x - hx, x1: item.x + hx, z0: item.z - hz, z1: item.z + hz};
}

const snap = v => Math.round(v / GRID) * GRID + 0; // (+ 0 turns -0 into 0)
const clamp = (v, lo, hi) => lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));
/**
 * Where an item ends up when dropped. Every piece is free to stand anywhere in the room (kept inside it, on the grid);
 * a wall piece (a counter, a bed, a wardrobe) that is put within WALL_REACH of a wall, or an inner wall's face, is drawn
 * up against it, facing away from it. `fine` (the position sliders, turning) = to the centimetre, no drawing to walls;
 * `toWall` (a new piece) = a wall piece always goes to the nearest wall.
 */
const WALL_REACH = 0.4;
export function snapItem(item, def, room, others = [], catalog = {}, fine = false, toWall = false) {
  const sn = fine ? v => +v.toFixed(2) + 0 : snap;   // (fine: to the centimetre, for the position sliders)
  const [w, d] = def.size(item);
  if (def.mount === "wall" && !fine) {
    // the nearest stretch of wall (its distance from the point to the stretch, not to its line)
    const dist = wl => Math.hypot(Math.max(wl.x0 - item.x, 0, item.x - wl.x1), Math.max(wl.z0 - item.z, 0, item.z - wl.z1));
    // an inner wall's face wins when the piece is put near it (its middle within the piece's half depth and INNER_NEAR of the
    // face), even if a room wall is nearer; else the nearest room wall, as ever
    const nearest = list => list.reduce((best, x) => dist(x) < dist(best) ? x : best);
    const inner = innerFaces(room, others, catalog).filter(f => dist(f) < INNER_NEAR + d / 2);
    const wl = nearest(inner.length ? inner : room.walls);
    if (toWall || dist(wl) <= d / 2 + WALL_REACH) {
      if (wl.x0 === wl.x1) {
        const z = clamp(sn(item.z), wl.z0 + w/2, wl.z1 - w/2);
        return {...item, rot: wl.rot, x: wl.x0 + wl.into[0] * d/2, z};
      }
      const x = clamp(sn(item.x), wl.x0 + w/2, wl.x1 - w/2);
      return {...item, rot: wl.rot, x, z: wl.z0 + wl.into[1] * d/2};
    }
  }
  // a floor piece, kept in the part of the room nearest to it
  const f = footprint({...item, x: 0, z: 0}, def), at = r => ({...item, x: clamp(sn(item.x), r.x0 - f.x0, r.x1 - f.x1), z: clamp(sn(item.z), r.z0 - f.z0, r.z1 - f.z1)});
  // where it is put if that is inside the room (it may straddle two parts), else the nearest spot in each part
  const bx = roomBox(room), here = {...item, x: clamp(sn(item.x), bx.x0 - f.x0, bx.x1 - f.x1), z: clamp(sn(item.z), bx.z0 - f.z0, bx.z1 - f.z1)};
  const tries = [here, ...(room.rects || [room]).map(at)], fits = tries.filter(q => inRoom(room, footprint(q, def)));
  if (def.snapWalls && !inRoom(room, footprint(here, def))) {
    // too long for the part it is put in: as long as that part is there (a wall into a wing narrower than it)
    const r = (room.rects || [room]).find(r => item.x >= r.x0 && item.x <= r.x1 && item.z >= r.z0 && item.z <= r.z1), len = def.params.find(g => g.k === "length");
    const room1 = r && (item.rot % 180 === 0 ? r.x1 - r.x0 : r.z1 - r.z0), fit = r && Math.floor(room1 * 100) / 100;
    if (r && fit >= len.min && fit < item.length) return snapItem({...item, length: fit}, def, room, others, catalog);
  }
  const far = q => Math.hypot(q.x - item.x, q.z - item.z);
  const placed = (fits.length ? fits : tries).reduce((best, q) => far(q) < far(best) ? q : best);
  return def.snapWalls && !fine ? endsToWalls(placed, def, room, others, catalog) : placed;
}

/** The two faces of every inner wall (def.snapWalls, with def.runs: the solid stretches along it) as wall stretches like room.walls'. */
function innerFaces(room, others, catalog) {
  const out = [], rotOf = ([i, j]) => (room.walls.find(w => w.into[0] === i && w.into[1] === j) || {}).rot;
  for (const o of others) {
    const def = catalog[o.type];
    if (!def || !def.snapWalls || !def.runs) continue;
    const t = def.size(o)[1] / 2;
    for (const s of [-1, 1]) {
      const c = toWorld(o, 0, 0), n = toWorld(o, 0, s), into = [Math.round(n[0] - c[0]), Math.round(n[1] - c[1])], rot = rotOf(into);
      if (rot === undefined) continue;
      for (const [a, b] of def.runs(o)) {
        const p = toWorld(o, a, s * t), q = toWorld(o, b, s * t);
        out.push({name: "inner" + o.id, x0: Math.min(p[0], q[0]), x1: Math.max(p[0], q[0]), z0: Math.min(p[1], q[1]), z1: Math.max(p[1], q[1]), into, rot});
      }
    }
  }
  return out;
}

/** How near (m) beyond its half depth) a wall piece must be put to an inner wall's face to stand against it, and then it does, even if a room wall is nearer. */
const INNER_NEAR = 0.8;
/** How near (m) an end of an inner wall must come to a wall of the room to be drawn to it. */
const SNAP_END = 0.25;
/**
 * An inner wall (def.snapWalls) with its ends drawn to the walls of the room: an end within SNAP_END (a quarter metre) of a wall
 * that crosses its direction is moved up against it; with both ends near walls it is made exactly as long as
 * the room is there. Walls are those the wall's own line meets (a wing's too).
 */
function endsToWalls(it, def, room, others = [], catalog = {}) {
  const alongX = it.rot % 180 === 0, half = it.length / 2, c = alongX ? it.x : it.z, cross = alongX ? it.z : it.x;
  const lines = room.walls.filter(w => alongX ? w.x0 === w.x1 && cross >= w.z0 - 0.01 && cross <= w.z1 + 0.01 : w.z0 === w.z1 && cross >= w.x0 - 0.01 && cross <= w.x1 + 0.01)
    .map(w => alongX ? w.x0 : w.z0);
  // other inner walls across this one that its line meets: the end stops at the face turned towards it (a T-junction)
  for (const o of others) {
    if (o.id === it.id || !catalog[o.type] || !catalog[o.type].snapWalls || (o.rot % 180 === 0) === alongX) continue;
    const oc = alongX ? o.x : o.z, ocross = alongX ? o.z : o.x, oh = o.length / 2, t = catalog[o.type].size(o)[1] / 2;
    if (cross < ocross - oh - 0.01 || cross > ocross + oh + 0.01) continue;
    lines.push(oc <= c ? oc + t : oc - t);
  }
  const near = (v, side) => lines.filter(l => (side < 0 ? l <= c : l >= c) && Math.abs(l - v) < SNAP_END).sort((a, b) => Math.abs(a - v) - Math.abs(b - v))[0];
  const lo = near(c - half, -1), hi = near(c + half, 1), len = def.params.find(f => f.k === "length");
  let length = it.length, mid = c;
  if (lo !== undefined && hi !== undefined && Math.floor((hi - lo) * 100) / 100 <= len.max && hi - lo >= len.min) { length = Math.floor((hi - lo) * 100) / 100; mid = (lo + hi) / 2; }
  else if (lo !== undefined) mid = lo + half;
  else if (hi !== undefined) mid = hi - half;
  else return it;
  return {...it, length: +length.toFixed(2), [alongX ? "x" : "z"]: +mid.toFixed(3)};
}

const overlap = (a, b, eps = 1e-6) => a.x0 < b.x1 - eps && b.x0 < a.x1 - eps && a.z0 < b.z1 - eps && b.z0 < a.z1 - eps;
/** What's wrong with each item, if anything: Map id -> message. Outside first, then keep-outs, then overlaps. */
export function problems(items, catalog, room) {
  // (pieces the catalog doesn't have, from another kind of building, are left out like the build leaves them out)
  const out = new Map(), rects = items.filter(it => catalog[it.type]).map(it => [it, footprint(it, catalog[it.type])]);
  // (a marker, def.ghost, like the sleep point, only has to be inside: it may stand on a bed)
  for (const [it, f] of rects) {
    if (!inRoom(room, f)) out.set(it.id, "Sticks out through a wall (outside the room)");
    else if (!catalog[it.type].ghost) {
      const k = room.keepOut.find(k => overlap(f, k.rect));
      if (k) out.set(it.id, `Blocks ${k.what}`);
    }
  }
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    if (catalog[rects[i][0].type].ghost || catalog[rects[j][0].type].ghost || !overlap(rects[i][1], rects[j][1])) continue;
    for (const it of [rects[i][0], rects[j][0]]) if (!out.has(it.id)) out.set(it.id, "Overlaps another piece");
  }
  return out;
}

const num = (v, lo, hi, d) => { v = +v; return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
/** Items from a save: known types only, settings clamped to their range, quarter turns, ids 1, 2, 3 ... */
export function cleanItems(arr, catalog) {
  if (!Array.isArray(arr)) return [];
  return arr.filter(it => it && typeof it === "object" && Object.hasOwn(catalog, it.type)).slice(0, MAX_ITEMS).map((it, i) => {
    const def = catalog[it.type], out = {id: i + 1, type: it.type, x: num(it.x, -50, 50, 0), z: num(it.z, -50, 50, 0),
      // quarter turns, or any angle (to the degree) for pieces that are not inner walls
      rot: (((def.snapWalls ? Math.round(num(it.rot, -720, 720, 0) / 90) * 90 : Math.round(num(it.rot, -720, 720, 0))) % 360) + 360) % 360};
    for (const f of def.params) {
      const v = num(it[f.k], f.min, f.max, def.defaults[f.k]);
      out[f.k] = +(Math.round(v / f.step) * f.step).toFixed(3);
    }
    return out;
  });
}

/* ---------- Editing ---------- */
const inside = (f, x, z) => x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1;
/** The id of the piece under (x, z), the last one if several overlap, or null. */
export function itemAt(items, catalog, x, z) {
  for (let k = items.length - 1; k >= 0; k--) if (inside(footprint(items[k], catalog[items[k].type]), x, z)) return items[k].id;
  return null;
}

/**
 * A new piece of `type`, with its default settings and the next id, at the free spot nearest the
 * middle of the room: snapped, inside, clear of the keep-outs and the other pieces. If nothing is
 * free it goes in the middle (and shows a problem until moved).
 */
export function placeNew(type, items, catalog, room) {
  const def = catalog[type], id = items.reduce((m, it) => Math.max(m, it.id), 0) + 1;
  const base = {id, type, x: 0, z: 0, rot: 0, ...def.defaults};
  const bx = roomBox(room), cx = (room.x0 + room.x1) / 2, cz = (room.z0 + room.z1) / 2, spots = [];
  for (let x = bx.x0; x <= bx.x1 + 1e-9; x += GRID) for (let z = bx.z0; z <= bx.z1 + 1e-9; z += GRID) spots.push([x, z]);
  spots.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cz) - Math.hypot(b[0] - cx, b[1] - cz));
  for (const [x, z] of spots) {
    const it = snapItem({...base, x, z}, def, room, items, catalog, false, true);
    if (!problems([...items, it], catalog, room).has(id)) return it;
  }
  return snapItem({...base, x: cx, z: cz}, def, room, items, catalog, false, true);
}

/** A piece turned a quarter where it stands (kept inside the room; a wall piece next to a wall stays next to it, turned). */
export function rotateItem(item, def, room, others = [], catalog = {}) {
  return snapItem({...item, rot: (item.rot + 90) % 360}, def, room, others, catalog, true);
}

/**
 * The catalog's pieces for the palette, in groups: [{name, types}], groups in the order their first piece comes, pieces
 * without a group last under "Other"; imported items (asset) and the ones that are missing are left out.
 */
export function pieceGroups(catalog) {
  const groups = new Map();
  for (const [type, def] of Object.entries(catalog)) {
    if (def.asset || def.missing) continue;
    const name = def.group || "Other";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(type);
  }
  const other = groups.get("Other"); groups.delete("Other");
  return [...groups, ...(other ? [["Other", other]] : [])].map(([name, types]) => ({name, types}));
}

/** Most sections of wallpaper on the inside of the outer walls. */
export const MAX_PAPERS = 80;
/**
 * Sections of wallpaper on the inside of the outer walls, from anything: [{id, wall (a wall of the building), s0, s1 (m along the
 * wall, from its left end seen from outside), paper (an index into the wallpapers, 0..n-1)}], in range, at least 20 cm long, numbered 1, 2 ...
 */
export function cleanPapers(arr, P, n) {
  const walls = wallsOf(P), num = (v, d) => Number.isFinite(+v) && v !== null && v !== "" ? +v : d;
  return (Array.isArray(arr) ? arr : []).filter(x => x && typeof x === "object" && walls[x.wall]).map(x => {
    const L = walls[x.wall].L, a = Math.min(L, Math.max(0, num(x.s0, 0))), b = Math.min(L, Math.max(0, num(x.s1, L)));
    return {wall: x.wall, s0: +Math.min(a, b).toFixed(2), s1: +Math.max(a, b).toFixed(2), paper: Math.min(n - 1, Math.max(0, Math.round(num(x.paper, 0))))};
  }).filter(x => x.s1 - x.s0 >= 0.2).slice(0, MAX_PAPERS).map((x, i) => ({id: i + 1, ...x}));
}
/**
 * Where inner walls meet the inside of an outer wall: metres along it (from its left end seen from outside), where the rooms behind it
 * change. Used to divide a wall into sections for wallpaper.
 */
export function wallBreaks(P, key) {
  const w = wallsOf(P)[key], out = [];
  if (!w) return out;
  for (const it of P.items || []) {
    if (it.type !== "innerwall") continue;
    const half = it.length / 2, alongX = it.rot % 180 === 0;
    for (const [x, z] of alongX ? [[it.x - half, it.z], [it.x + half, it.z]] : [[it.x, it.z - half], [it.x, it.z + half]]) {
      const rx = x - w.o[0], rz = z - w.o[2], d = rx * w.n[0] + rz * w.n[2], s = rx * w.u[0] + rz * w.u[2];
      if (d < 0.05 && d > -(WALL_T + 0.45) && s > 0.3 && s < w.L - 0.3) out.push(+s.toFixed(2));
    }
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

/** Undo and redo over copies of a state (the pieces list). */
export class History {
  constructor(state, limit = 100) { this.past = []; this.future = []; this.now = clone(state); this.limit = limit; }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  /** A new state after an edit; it drops anything that could be redone. */
  push(state) {
    this.past.push(this.now); if (this.past.length > this.limit) this.past.shift();
    this.now = clone(state); this.future = [];
  }
  undo() { if (this.canUndo) { this.future.push(this.now); this.now = this.past.pop(); } return clone(this.now); }
  redo() { if (this.canRedo) { this.past.push(this.now); this.now = this.future.pop(); } return clone(this.now); }
}
const clone = v => JSON.parse(JSON.stringify(v));

/* ---------- Filling a room automatically ---------- */
/**
 * Helpers a kind's autoFurnish uses to place pieces in free space: the room's keep-outs and every
 * piece already placed are kept clear. Returns {items, add, freeAlong, longest, onWall, onFloor,
 * freeLine}; items is the list being built (ids 1, 2, 3 ...).
 *   freeAlong(wall, deep)  free stretches {wl, a, b, len} along a wall for a piece `deep` into the room
 *   longest(walls, deep)   the longest of those over several walls
 *   onWall(stretch, type, params)   a wall piece centred on a stretch, back to the wall
 *   onFloor(type, rot, params)      a floor piece at the free grid spot nearest the room's middle
 *   freeLine(c, alongX, width)      the longest free stretch [u, v] of a line across the room at c
 */
export function furnisher(room, catalog) {
  const items = [], taken = [];
  const add = (type, x, z, rot, params = {}) => {
    const it = {id: items.length + 1, type, x, z, rot, ...params};
    items.push(it); taken.push(footprint(it, catalog[type]));
    return it;
  };
  const blocked = (pad = 0) => [...room.keepOut.map(k => k.rect), ...taken].map(r => ({x0: r.x0 - pad, x1: r.x1 + pad, z0: r.z0 - pad, z1: r.z1 + pad}));
  const horiz = wl => wl.z0 === wl.z1;
  const cut = (free, a, b) => free.flatMap(([u, v]) => [[u, Math.min(v, a)], [Math.max(u, b), v]]).filter(([u, v]) => v - u > 1e-6);
  const freeAlong = (wl, deep) => {
    const [lo, hi] = horiz(wl) ? [wl.x0, wl.x1] : [wl.z0, wl.z1];
    const c0 = horiz(wl) ? wl.z0 : wl.x0, c1 = c0 + (horiz(wl) ? wl.into[1] : wl.into[0]) * deep;
    const strip = horiz(wl) ? {x0: lo, x1: hi, z0: Math.min(c0, c1), z1: Math.max(c0, c1)} : {x0: Math.min(c0, c1), x1: Math.max(c0, c1), z0: lo, z1: hi};
    let free = [[lo, hi]];
    for (const r of blocked(0.1)) if (overlap(r, strip)) free = cut(free, ...(horiz(wl) ? [r.x0, r.x1] : [r.z0, r.z1]));
    return free.map(([a, b]) => ({wl, a, b, len: b - a}));
  };
  const longest = (walls, deep) => walls.flatMap(wl => freeAlong(wl, deep)).sort((x, y) => y.len - x.len)[0];
  const onWall = (s, type, params) => {
    const [, d] = catalog[type].size(params), mid = (s.a + s.b) / 2;
    return horiz(s.wl) ? add(type, mid, s.wl.z0 + s.wl.into[1] * d / 2, s.wl.rot, params)
      : add(type, s.wl.x0 + s.wl.into[0] * d / 2, mid, s.wl.rot, params);
  };
  const bx = roomBox(room), cx = (bx.x0 + bx.x1) / 2, cz = (bx.z0 + bx.z1) / 2, spots = [];
  for (let x = bx.x0; x <= bx.x1 + 1e-9; x += GRID) for (let z = bx.z0; z <= bx.z1 + 1e-9; z += GRID) spots.push([x, z]);
  spots.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cz) - Math.hypot(b[0] - cx, b[1] - cz));
  const onFloor = (type, rot = 0, params = {}) => {
    for (const pad of [0.3, 0.1, 0]) for (const [x, z] of spots) {
      const f = footprint({x, z, rot, ...params}, catalog[type]);
      if (!inRoom(room, f)) continue;
      if (!blocked(pad).some(r => overlap(r, f))) return add(type, x, z, rot, params);
    }
    return null;
  };
  const freeLine = (c, alongX, width = 0.3) => {
    const line = alongX ? {x0: room.x0, x1: room.x1, z0: c - width / 2, z1: c + width / 2} : {x0: c - width / 2, x1: c + width / 2, z0: room.z0, z1: room.z1};
    let free = [[alongX ? room.x0 : room.z0, alongX ? room.x1 : room.z1]];
    // (only where the line is in the room: across a divider it is not)
    const covered = (room.rects || []).filter(r => overlap(r, line)).map(r => alongX ? [r.x0, r.x1] : [r.z0, r.z1]).sort((u, v) => u[0] - v[0]), gaps = [];
    for (let at = free[0][0], i = 0; i <= covered.length; i++) { const next = i < covered.length ? covered[i] : [free[0][1], free[0][1]]; if (next[0] > at + 1e-6) gaps.push([at, next[0]]); at = Math.max(at, next[1]); }
    for (const [a, b] of gaps) free = cut(free, a, b);
    for (const r of blocked(0.2)) if (overlap(r, line)) free = cut(free, ...(alongX ? [r.x0, r.x1] : [r.z0, r.z1]));
    return free.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0] || null;
  };
  return {items, add, freeAlong, longest, onWall, onFloor, freeLine};
}

/* ---------- Downpipes ---------- */
/** Most downpipes a house can have in all. */
export const MAX_PIPES = 24;
/** The walls with a gutter along them (a downpipe goes on one): a gable roof's two eave walls, all four under a hip roof, and each wing's two sides. */
export function eaveWalls(P) {
  // (a leaning flat roof has a gutter on its low side)
  if (P.roofType === "flat") return P.roofTilt > 0 ? [{front: "back", back: "front", left: "right", right: "left"}[P.tiltHigh] || "back"] : [];
  const ridgeX = P.roofType === "hip" ? P.width >= P.depth : P.ridge === "width";
  const main = P.roofType === "hip" ? ["front", "back", "left", "right"] : ridgeX ? ["front", "back"] : ["left", "right"];
  return [...main, ...liveWings(P).filter(w => w.type !== "flat").flatMap(w => [wingWallKey(w.id, "Left"), wingWallKey(w.id, "Right")])];
}
/** n downpipes spread along a wall of length L as fractions 0..1: at the ends (30 cm in), then evenly between; one goes at the right end. */
export function pipePositions(L, n) {
  const e = Math.min(0.4, 0.3 / Math.max(L, 0.5));
  return n <= 0 ? [] : n === 1 ? [1 - e] : Array.from({length: n}, (_, i) => e + (1 - 2 * e) * i / (n - 1));
}
/**
 * The downpipes a new house starts with, [{id, wall, pos}]: P.downpipes (0 to 2) on each eave wall of the house (one is at
 * the right end of the first wall and the left end of the second), and one at the far end of each wing's sides.
 */
export function autoPipes(P) {
  if (!P.gutters || !P.downpipes) return [];
  const walls = wallsOf(P), out = [];
  const add = (wall, pos) => out.push({id: out.length + 1, wall, pos: +pos.toFixed(3)});
  eaveWalls(P).forEach((key, i) => {
    const L = walls[key].L, wid = wingIdOf(key);
    if (wid) { const [e] = pipePositions(L, 1); add(key, key.endsWith("Left") ? e : 1 - e); return; }
    const ps = pipePositions(L, P.downpipes);
    (P.downpipes === 1 && i % 2 ? [1 - ps[0]] : ps).forEach(pos => add(key, pos));
  });
  return out;
}
/** A list of downpipes cleaned: on a wall with a gutter, a place 0..1 along it, at most MAX_PIPES. */
export function cleanPipes(arr, P) {
  const ok = new Set(eaveWalls(P));
  return (Array.isArray(arr) ? arr : []).filter(x => x && ok.has(x.wall)).slice(0, MAX_PIPES)
    .map((x, i) => ({id: i + 1, wall: x.wall, pos: +Math.min(1, Math.max(0, Number.isFinite(+x.pos) ? +x.pos : 0.5)).toFixed(3)}));
}
