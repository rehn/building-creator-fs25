// The mod's 3D plan (docs/PLAN_MOD.md step 3): what the view (modView.mjs) needs from a building or a prop, and how a post is placed beside the others.
// Pure functions, no DOM and no three.js, so they are tested in node (test/mod-plan.test.mjs).
//
// A group is {name, color: [r, g, b] (0 to 1), alpha, rough, metal, positions, uvs | null, colors | null, map | null}: the triangles of one material as a flat list of numbers (three corners
// of three numbers each, metres, y up) with the uvs of the corners (in repeats), and the picture it is drawn with, if it has one: map {spec, hex} (a surface texture the building's settings
// give it, made by proceduralPicture) or {textureId} (one of the user's textures, read from the server by the page). A post's place is its origin (x, z) and its turn (rot, degrees about
// y, as three.js turns: x' = x cos + z sin, z' = -x sin + z cos); the building's own origin is the middle of its footprint, a prop's the origin of its model.
import { buildLook, sanitize } from "./model.mjs";
import { sanitize as sanitizeProp, placedMesh, partUv, faceOfTriangle, faceMaterial, faceColor } from "../builder/model.mjs";
import { baseFor, compose } from "./textures.mjs";

const hexColor = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);

/** The box round the groups: {min: [x, y, z], max: [x, y, z]} (a box of nothing at the origin when there are none). */
export function boundsOf(groups) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const g of groups) for (let k = 0; k < g.positions.length; k += 3) for (let a = 0; a < 3; a++) {
    min[a] = Math.min(min[a], g.positions[k + a]); max[a] = Math.max(max[a], g.positions[k + a]);
  }
  return min[0] === Infinity ? {min: [0, 0, 0], max: [0, 0, 0]} : {min, max};
}

/** The groups of a saved project's data: a building as the editor draws it (buildLook), or a prop's parts with the material each face has. */
export function projectGroups(data) {
  if (data && data.kind === "prop") return propGroups(sanitizeProp(data));
  return buildLook(sanitize(data || {}));
}

/** A prop's parts as groups: each face in its colour or with its texture (one group for each colour and for each texture). */
function propGroups(model) {
  const byKey = new Map();
  for (const part of model.parts) {
    const g = placedMesh(part), uv = partUv(model, part), face = faceOfTriangle(part);
    for (let t = 0; t < face.length; t++) {
      const row = faceMaterial(model, part, face[t]), tex = row && row.texture ? String(row.texture.id) : null;
      const color = faceColor(model, part, face[t]), hex = /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : "#9aa3a8";
      const rough = 1 - (row ? row.smoothness : 0.3), metal = row ? row.metalness : 0, key = (tex ? "t:" + tex : hex) + "|" + rough + "|" + metal;
      if (!byKey.has(key)) byKey.set(key, {name: tex || hex, color: tex ? [1, 1, 1] : hexColor(hex), alpha: 1, rough, metal, positions: [], uvs: [], colors: null, map: tex ? {textureId: tex} : null});
      const out = byKey.get(key);
      for (let c = 0; c < 3; c++) {
        const i = g.i[t * 3 + c];
        out.positions.push(g.p[i * 3] + part.x, g.p[i * 3 + 1] + part.y, g.p[i * 3 + 2] + part.z);
        out.uvs.push(uv[i * 2], uv[i * 2 + 1]);
      }
    }
  }
  return [...byKey.values()].filter(g => g.positions.length);
}

/** What a map is called (equal maps, equal keys). */
export const mapKey = map => (map.textureId ? "t:" + map.textureId : "p:" + JSON.stringify(map.spec) + map.hex);

/** The picture of a surface texture of a building (map.spec and map.hex) as {width, height, rgba} (the top row first). Heavy: what does not depend on the colour is kept (textures.mjs baseFor). */
export function proceduralPicture(map) {
  const b = baseFor(map.spec);
  return {width: b.N, height: b.N, rgba: compose(b.S, map.hex, b.Mk, b.N)};
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

const FENCE_CORNER = 0.8, FENCE_WALL = 0.4;
const cm = v => Math.round(v * 100) / 100 + 0;
const inside = (x, z, r) => x > r.x0 + 1e-6 && x < r.x1 - 1e-6 && z > r.z0 + 1e-6 && z < r.z1 - 1e-6;

/**
 * Where a fence post dragged to q = [x, z] goes (as editor/objects.mjs snapFencePoint does in a building): a corner of a building within 80 cm (a fence starts and stops at a corner),
 * else onto the line of a wall within 40 cm, else the 25 cm grid; never inside a building (put out through the nearest side). rects: what the buildings and props stand on
 * [{x0, x1, z0, z1}]. off: no snapping (Alt held), only to a centimetre.
 */
export function snapFencePost(q, rects, {off = false, grid = 0.25} = {}) {
  if (off) return [cm(q[0]), cm(q[1])];
  let best = null;
  for (const r of rects) for (const c of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]]) {
    const d = Math.hypot(c[0] - q[0], c[1] - q[1]);
    if (d < FENCE_CORNER && (!best || d < best.d)) best = {d, at: c};
  }
  if (best) return [cm(best.at[0]), cm(best.at[1])];
  let x = Math.round(q[0] / grid) * grid, z = Math.round(q[1] / grid) * grid;
  for (const r of rects) {
    if (q[0] > r.x0 - FENCE_WALL && q[0] < r.x1 + FENCE_WALL) { if (Math.abs(q[1] - r.z0) < FENCE_WALL) z = r.z0; else if (Math.abs(q[1] - r.z1) < FENCE_WALL) z = r.z1; }
    if (q[1] > r.z0 - FENCE_WALL && q[1] < r.z1 + FENCE_WALL) { if (Math.abs(q[0] - r.x0) < FENCE_WALL) x = r.x0; else if (Math.abs(q[0] - r.x1) < FENCE_WALL) x = r.x1; }
  }
  for (const r of rects) if (inside(x, z, r)) {
    const moves = [[r.x0 - x, 0], [r.x1 - x, 0], [0, r.z0 - z], [0, r.z1 - z]], [mx, mz] = moves.reduce((m, v) => (Math.hypot(...v) < Math.hypot(...m) ? v : m));
    x += mx; z += mz;
  }
  return [cm(x), cm(z)];
}

/** The indexes of the posts [[x, z] ...] that stand inside one of the rects (on a wall is not inside). */
export const postsInside = (points, rects) => points.flatMap(([x, z], i) => (rects.some(r => inside(x, z, r)) ? [i] : []));

/** What the posts [{x, z, rot, bounds}] stand on seen from above, as rectangles [{x0, x1, z0, z1}] (each turned by its rot, as footprint gives it). */
export const feetOf = posts => posts.map(p => { const f = footprint(p.bounds, p.rot || 0); return {x0: p.x + f.minX, x1: p.x + f.maxX, z0: p.z + f.minZ, z1: p.z + f.maxZ}; });
