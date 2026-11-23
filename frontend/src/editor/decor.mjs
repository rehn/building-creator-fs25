// Decorations round a building: the user's saved items (assets.mjs: a sign, a bench, planters ...) placed on the ground beside it, or up on a post at y.
// p.decor = [{id, asset (an item's id), x, z (where the model's middle stands, in building coordinates like game objects), rot (degrees, 0 to 360), y (up from the ground, m)}].
// They are references in the building's own i3d, so they go with it when it is placed, sold or put on a map; the cleared ground takes them in. Pure; no DOM.
import { normalizeMeta, turnedSize } from "./assets.mjs";

export const MAX_DECOR = 40;
export const DECOR_LIMITS = {x: [-80, 80], z: [-80, 80], y: [0, 10]};

const num = (v, d) => { v = typeof v === "number" || typeof v === "string" && v.trim() !== "" ? +v : NaN; return Number.isFinite(v) ? v : d; };
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));
const round = v => Math.round(v * 1000) / 1000;
const turn = v => { const d = num(v, 0); return Math.round((((d % 360) + 360) % 360) * 10) / 10 % 360; };

/** The decorations as a building can keep them: an item id that is a plain id, numbers in range, numbered from 1 (at most MAX_DECOR). */
export function cleanDecor(list) {
  const out = [];
  for (const d of Array.isArray(list) ? list : []) {
    if (out.length >= MAX_DECOR) break;
    if (!d || typeof d !== "object" || typeof d.asset !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(d.asset)) continue;
    out.push({id: out.length + 1, asset: d.asset, x: round(clamp(num(d.x, 0), DECOR_LIMITS.x)), z: round(clamp(num(d.z, 0), DECOR_LIMITS.z)), rot: turn(d.rot), y: round(clamp(num(d.y, 0), DECOR_LIMITS.y))});
  }
  return out;
}

/** The ground each decoration covers as {x0, x1, z0, z1}, the box round the model as turned; none for an item that is gone (find(assetId) -> the asset or null). */
export function decorRects(p, find) {
  const out = [];
  for (const d of p.decor || []) {
    const a = find(d.asset);
    if (!a) continue;
    const [w, dd] = turnedSize(normalizeMeta(a.meta), d.rot);
    out.push({x0: d.x - w / 2, x1: d.x + w / 2, z0: d.z - dd / 2, z1: d.z + dd / 2});
  }
  return out;
}

/** The box round one decoration as it stands: {x0, x1, z0, z1, y0, y1} (y: from the ground, with its height up), or null if its item is gone. */
export function decorRect(d, find) {
  const a = find(d.asset);
  if (!a) return null;
  const meta = normalizeMeta(a.meta), [w, dd, h] = turnedSize(meta, d.rot);
  return {x0: d.x - w / 2, x1: d.x + w / 2, z0: d.z - dd / 2, z1: d.z + dd / 2, y0: d.y, y1: d.y + h};
}

/* ---------- Dragging in the plan view ---------- */
export const DECOR_GRID = 0.25, WALL_SNAP = 0.6;
/** The turn that makes an item face away from each wall of the building (the model's front is +z; a turn of r takes it to (sin r, cos r)). */
const OUT = {front: 0, back: 180, right: 90, left: 270};
const gridOf = v => Math.round(v / DECOR_GRID) * DECOR_GRID, cm = v => Math.round(v * 100) / 100;

/**
 * Where a decoration dragged to (x, z) ends up: -> {x, z, rot, wall}. Near the outside of one of the building's four walls (within WALL_SNAP, and along the wall itself) it stands
 * against it, its back to the wall and facing outwards (rot is set to match); anywhere else it goes to the grid and keeps its turn. wall is the wall's name or null.
 * p: the building (width, depth: its main part's walls); find(assetId) -> the item or null (an item that is gone just snaps to the grid).
 * opts: walls (default true: stand against a wall), grid (default true: to the grid, else to the centimetre); both off: exactly where it is put.
 */
export function snapDecor(p, find, d, x, z, {walls = true, grid = true} = {}) {
  const W = +p.width || 0, D = +p.depth || 0, lim = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v)), at1 = v => grid ? gridOf(v) : cm(v);
  const plain = {x: lim(at1(x), DECOR_LIMITS.x), z: lim(at1(z), DECOR_LIMITS.z), rot: d.rot, wall: null};
  const a = find(d.asset);
  if (!a || !walls) return plain;
  const meta = normalizeMeta(a.meta);
  let best = null;
  for (const [wall, rot] of Object.entries(OUT)) {
    const [w, dd] = turnedSize(meta, rot), along = wall === "front" || wall === "back" ? x : z, half = wall === "front" || wall === "back" ? W / 2 : D / 2;
    if (Math.abs(along) > half) continue;   // (beside the wall, not along it)
    const at = wall === "front" ? D / 2 + dd / 2 : wall === "back" ? -(D / 2 + dd / 2) : wall === "right" ? W / 2 + w / 2 : -(W / 2 + w / 2);
    const dist = Math.abs((wall === "front" || wall === "back" ? z : x) - at);
    if (dist < WALL_SNAP && (!best || dist < best.dist)) best = {wall, rot, at, dist, half};
  }
  if (!best) return plain;
  const slide = lim(at1(best.wall === "front" || best.wall === "back" ? x : z), [-best.half, best.half]);
  return best.wall === "front" || best.wall === "back" ? {x: slide, z: best.at, rot: best.rot, wall: best.wall} : {x: best.at, z: slide, rot: best.rot, wall: best.wall};
}
