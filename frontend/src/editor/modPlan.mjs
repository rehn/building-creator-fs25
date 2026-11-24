// The mod's 3D plan (docs/PLAN_MOD.md step 3): what the view (modView.mjs) needs from a building or a prop, and how a post is placed beside the others.
// Pure functions, no DOM and no three.js, so they are tested in node (test/mod-plan.test.mjs).
//
// A group is {name, color: [r, g, b] (0 to 1), alpha, positions}: the triangles of one material as a flat list of numbers (three corners of three
// numbers each, metres, y up). A post's place is its origin (x, z) and its turn (rot, degrees about y, as three.js turns: x' = x cos + z sin,
// z' = -x sin + z cos); the building's own origin is the middle of its footprint, a prop's the origin of its model.
import { sanitize, buildObj } from "./model.mjs";
import { sanitize as sanitizeProp, placedMesh } from "../builder/model.mjs";

const hexColor = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);

/** The groups of an .obj text (buildObj's: one group and material per part, faces v/vt/vn) with the colours and see-through of its .mtl. */
export function parseObj(obj, mtl) {
  const mats = {};
  let cur = null;
  for (const line of mtl.split("\n")) {
    const w = line.trim().split(/\s+/);
    if (w[0] === "newmtl") cur = mats[w[1]] = {color: [0.7, 0.7, 0.7], alpha: 1};
    else if (cur && w[0] === "Kd") cur.color = w.slice(1, 4).map(Number);
    else if (cur && w[0] === "d") cur.alpha = Number(w[1]);
  }
  const verts = [], groups = new Map();
  let group = null;
  for (const line of obj.split("\n")) {
    const w = line.trim().split(/\s+/);
    if (w[0] === "v") verts.push([Number(w[1]), Number(w[2]), Number(w[3])]);
    else if (w[0] === "usemtl") {
      if (!groups.has(w[1])) groups.set(w[1], {name: w[1], color: (mats[w[1]] || {color: [0.7, 0.7, 0.7]}).color, alpha: (mats[w[1]] || {alpha: 1}).alpha, positions: []});
      group = groups.get(w[1]);
    } else if (w[0] === "f" && group) {
      const c = w.slice(1).map(t => verts[parseInt(t, 10) - 1]);
      for (let k = 1; k + 1 < c.length; k++) for (const v of [c[0], c[k], c[k + 1]]) group.positions.push(...v);
    }
  }
  return [...groups.values()].filter(g => g.positions.length);
}

/** The box round the groups: {min: [x, y, z], max: [x, y, z]} (a box of nothing at the origin when there are none). */
export function boundsOf(groups) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const g of groups) for (let k = 0; k < g.positions.length; k += 3) for (let a = 0; a < 3; a++) {
    min[a] = Math.min(min[a], g.positions[k + a]); max[a] = Math.max(max[a], g.positions[k + a]);
  }
  return min[0] === Infinity ? {min: [0, 0, 0], max: [0, 0, 0]} : {min, max};
}

/** The groups of a saved project's data: a prop's parts (one group for each colour; a part's collision shape is a node of its own in the i3d, not drawn here) or a building as buildObj draws it. */
export function projectGroups(data) {
  if (data && data.kind === "prop") {
    const m = sanitizeProp(data), byColor = new Map();
    for (const part of m.parts) {
      const g = placedMesh(part), hex = /^#[0-9a-f]{6}$/i.test(part.color) ? part.color.toLowerCase() : "#9aa3a8";
      if (!byColor.has(hex)) byColor.set(hex, {name: hex, color: hexColor(hex), alpha: 1, positions: []});
      const out = byColor.get(hex).positions;
      for (const i of g.i) out.push(g.p[i * 3] + part.x, g.p[i * 3 + 1] + part.y, g.p[i * 3 + 2] + part.z);
    }
    return [...byColor.values()].filter(g => g.positions.length);
  }
  const {obj, mtl} = buildObj(sanitize(data || {}));
  return parseObj(obj, mtl);
}

/** The box as it stands from above after a turn of rot degrees about its origin: {minX, maxX, minZ, maxZ}, relative to the post's place. */
export function footprint(bounds, rot) {
  const a = rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const x of [bounds.min[0], bounds.max[0]]) for (const z of [bounds.min[2], bounds.max[2]]) {
    const X = x * c + z * s, Z = -x * s + z * c;
    minX = Math.min(minX, X); maxX = Math.max(maxX, X); minZ = Math.min(minZ, Z); maxZ = Math.max(maxZ, Z);
  }
  const clean = v => Math.round(v * 1e9) / 1e9 + 0;
  return {minX: clean(minX), maxX: clean(maxX), minZ: clean(minZ), maxZ: clean(maxZ)};
}

/** A turn (degrees) plus d, kept in 0 to 360. */
export const turnedBy = (rot, d) => ((rot + d) % 360 + 360) % 360;

/**
 * Where a post dragged to (post.x, post.z) ends up: its edge against another post's edge (touching, or in line) when it is within `reach` metres, else on the
 * grid. post and others: {x, z, rot, bounds} (the others without the post itself). off: no snapping at all (Alt held).
 */
export function snapPost(post, others, {grid = 0.5, reach = 0.6, off = false} = {}) {
  if (off) return {x: post.x, z: post.z};
  const onGrid = v => (grid > 0 ? Math.round(v / grid) * grid : v) + 0;
  const me = footprint(post.bounds, post.rot);
  let dx = null, dz = null;
  const better = (best, d) => (Math.abs(d) <= reach && (best === null || Math.abs(d) < Math.abs(best)) ? d : best);
  for (const o of others) {
    const f = footprint(o.bounds, o.rot);
    const theirX = [o.x + f.minX, o.x + f.maxX], theirZ = [o.z + f.minZ, o.z + f.maxZ];
    for (const mine of [post.x + me.minX, post.x + me.maxX]) for (const t of theirX) dx = better(dx, t - mine);
    for (const mine of [post.z + me.minZ, post.z + me.maxZ]) for (const t of theirZ) dz = better(dz, t - mine);
  }
  const round = v => Math.round(v * 1e6) / 1e6 + 0;
  return {x: dx !== null ? round(post.x + dx) : onGrid(post.x), z: dz !== null ? round(post.z + dz) : onGrid(post.z)};
}
