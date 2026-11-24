// The mod's 3D plan (docs/PLAN_MOD.md step 3): what the view (modView.mjs) needs from a building or a prop, and how a post is placed beside the others.
// Pure functions, no DOM and no three.js, so they are tested in node (test/mod-plan.test.mjs).
//
// A group is {name, color: [r, g, b] (0 to 1), alpha, rough, metal, positions, uvs | null, colors | null, map | null}: the triangles of one material as a flat list of numbers (three corners
// of three numbers each, metres, y up) with the uvs of the corners (in repeats), and the picture it is drawn with, if it has one: map {spec, hex} (a surface texture the building's settings
// give it, made by proceduralPicture) or {textureId} (one of the user's textures, read from the server by the page). A post's place is its origin (x, z) and its turn (rot, degrees about
// y, as three.js turns: x' = x cos + z sin, z' = -x sin + z cos); the building's own origin is the middle of its footprint, a prop's the origin of its model.
import { buildLook, sanitize } from "./model.mjs";
import { footprints } from "./objects.mjs";
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

/** How far out from a building's wall a fence post is put (0: on the wall, as in the cow pasture), and how far into a building a post or a stretch may go before it is told about (1 cm: touching a wall is fine). */
export const FENCE_GAP = 0, FENCE_CLEAR = -0.01;
const FENCE_CORNER = 0.8, FENCE_WALL = 0.4;
const cm = v => Math.round(v * 100) / 100 + 0;
const grown = (r, m) => ({x0: r.x0 - m, x1: r.x1 + m, z0: r.z0 - m, z1: r.z1 + m});
const inside = (x, z, r) => x > r.x0 + 1e-6 && x < r.x1 - 1e-6 && z > r.z0 + 1e-6 && z < r.z1 - 1e-6;

/**
 * Where a fence post dragged to q = [x, z] goes (as editor/objects.mjs snapFencePoint does in a building, and the cow pasture works in the game): a corner of a building within 80 cm (a fence starts and
 * stops at a corner), else onto the line of a wall within 40 cm, else the 25 cm grid; never inside a building (out through the nearest side).
 * rects: what the buildings and props stand on [{x0, x1, z0, z1}]. off: no snapping (Alt held), only to a centimetre.
 */
export function snapFencePost(q, rects, {off = false, grid = 0.25} = {}) {
  if (off) return [cm(q[0]), cm(q[1])];
  let best = null;
  for (const r of rects) for (const [cx, cz, sx, sz] of [[r.x0, r.z0, -1, -1], [r.x1, r.z0, 1, -1], [r.x0, r.z1, -1, 1], [r.x1, r.z1, 1, 1]]) {
    const d = Math.hypot(cx - q[0], cz - q[1]);
    if (d < FENCE_CORNER && (!best || d < best.d)) best = {d, at: [cx + sx * FENCE_GAP, cz + sz * FENCE_GAP]};
  }
  if (best) return [cm(best.at[0]), cm(best.at[1])];
  let x = Math.round(q[0] / grid) * grid, z = Math.round(q[1] / grid) * grid;
  for (const r of rects) {
    if (q[0] > r.x0 - FENCE_WALL && q[0] < r.x1 + FENCE_WALL) { if (Math.abs(q[1] - r.z0) < FENCE_WALL) z = r.z0 - FENCE_GAP; else if (Math.abs(q[1] - r.z1) < FENCE_WALL) z = r.z1 + FENCE_GAP; }
    if (q[1] > r.z0 - FENCE_WALL && q[1] < r.z1 + FENCE_WALL) { if (Math.abs(q[0] - r.x0) < FENCE_WALL) x = r.x0 - FENCE_GAP; else if (Math.abs(q[0] - r.x1) < FENCE_WALL) x = r.x1 + FENCE_GAP; }
  }
  // not inside a building: out through the nearest side
  for (const r of rects.map(r => grown(r, FENCE_GAP))) if (inside(x, z, r)) {
    const moves = [[r.x0 - x, 0], [r.x1 - x, 0], [0, r.z0 - z], [0, r.z1 - z]], [mx, mz] = moves.reduce((m, v) => (Math.hypot(...v) < Math.hypot(...m) ? v : m));
    x += mx; z += mz;
  }
  return [cm(x), cm(z)];
}

/** The indexes of the posts [[x, z] ...] that stand inside one of the rects (on a wall, or a corner, is not inside: the cow pasture has its posts there and it works in the game). */
export const postsInside = (points, rects) => points.flatMap(([x, z], i) => (rects.some(r => inside(x, z, grown(r, FENCE_CLEAR))) ? [i] : []));

/** A building's real footprint: its walls, the main building and its wings, [{x0, x1, z0, z1}] around the building's own middle (the mesh's bounds are bigger: the roof's overhang, steps). data: the project's data. */
export const buildingFeet = data => footprints(sanitize(data));

/**
 * What the posts [{x, z, rot, bounds, feet}] stand on seen from above, as rectangles [{x0, x1, z0, z1}], each turned by its rot as footprint gives it: a building's real footprint (feet: its walls and wings,
 * buildingFeet, so a fence snaps to its walls as the cow pasture's does and not to the roof's edge), else the bounds of what is drawn (a prop). A rect of a turned building is the box round it.
 */
export function feetOf(posts) {
  const out = [];
  for (const p of posts) {
    if (!p.feet || !p.feet.length) { const f = footprint(p.bounds, p.rot || 0); out.push({x0: p.x + f.minX, x1: p.x + f.maxX, z0: p.z + f.minZ, z1: p.z + f.maxZ}); continue; }
    for (const r of p.feet) {
      const f = footprint({min: [r.x0, 0, r.z0], max: [r.x1, 0, r.z1]}, p.rot || 0);
      out.push({x0: p.x + f.minX, x1: p.x + f.maxX, z0: p.z + f.minZ, z1: p.z + f.maxZ});
    }
  }
  return out;
}

/**
 * The stretches of a fence (posts [[x, z] ...], closed: stretch i runs from post i to post i + 1, the last back to the first) that run through a building: into one of the rects
 * [{x0, x1, z0, z1}] by more than 1 cm. A stretch along a wall, or touching a corner, is not through it. The game cuts the buildings out of the animals' area, and a stretch that goes into one leaves a sliver
 * too thin to make a meadow of (an earlier try in the game: a stretch 3 cm into a house gave "Could not shrink polygon for creation task").
 * closure: the way the game closes the fence from its last post back to the first, [[x, z] ...] between them (the husbandry's additionalNavMeshNodes: along the building, round its corners); the
 * closing stretch is then that way, not the straight line (which would cut through a house the fence goes round two walls of). None given: the straight line.
 */
export function edgesThrough(points, rects, clear = FENCE_CLEAR, closure = []) {
  const out = [];
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    const way = i === points.length - 1 && closure.length ? [a, ...closure, b] : [a, b];
    if (rects.some(r => way.some((q, k) => k && clipsRect(way[k - 1], q, grown(r, clear))))) out.push(i);
  });
  return out;
}
/** Whether the segment a to b has a piece of more than a millimetre inside the rect (Liang-Barsky). */
function clipsRect(a, b, r) {
  if (r.x0 >= r.x1 || r.z0 >= r.z1) return false;
  const dx = b[0] - a[0], dz = b[1] - a[1];
  let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, a[0] - r.x0], [dx, r.x1 - a[0]], [-dz, a[1] - r.z0], [dz, r.z1 - a[1]]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; t0 = Math.max(t0, t); } else { if (t < t0) return false; t1 = Math.min(t1, t); }
  }
  return (t1 - t0) * Math.hypot(dx, dz) > 0.001;
}

/** How far off a building's wall a fence post is stood when the mod is made (the hen house has its posts 15 cm out from the wall). */
export const FENCE_STAND_OFF = 0.15;

/**
 * The fence's posts [[x, z] ...] with those that stand ON the line of a wall of a building (rects [{x0, x1, z0, z1}], within 1 cm, at the building or out along the line of the wall) moved FENCE_STAND_OFF out from it, a corner from both of its walls;
 * the others as they were (a post inside a building is the warning's business). Made for the game: the hen type has no walking shape of its own, and a fence that touched a building gave "Could not
 * shrink polygon for creation task", where the hen house's own, 15 cm out from the wall, does not. The player still puts a post against the wall in the editor, as in the cow pasture.
 */
export function keepClear(points, rects, gap = FENCE_STAND_OFF, eps = 0.01) {
  const n = points.length, dx = Array(n).fill(0), dz = Array(n).fill(0);
  // the posts at a building: on a wall or at a corner (within its length), moved out from it
  points.forEach(([x, z], i) => {
    for (const r of rects) {
      if (x < r.x0 - eps || x > r.x1 + eps || z < r.z0 - eps || z > r.z1 + eps) continue;   // not at this building
      if (x > r.x0 + eps && x < r.x1 - eps && z > r.z0 + eps && z < r.z1 - eps) continue;   // inside: the warning's business
      if (Math.abs(z - r.z0) <= eps) dz[i] = -gap; else if (Math.abs(z - r.z1) <= eps) dz[i] = gap;
      if (Math.abs(x - r.x0) <= eps) dx[i] = -gap; else if (Math.abs(x - r.x1) <= eps) dx[i] = gap;
    }
  });
  // the posts that follow along the same line (the hen house's six posts: the ends at the corners, the next two out along the wall line): stood off the same way, so the side stays one straight line
  // (a fence with the ends 15 cm off and its neighbours on the wall line has a jog at each end, which the game could not make a meadow of)
  for (const [d, k] of [[dz, 1], [dx, 0]]) {
    for (const step of [1, -1]) {
      for (let i = 0; i < n; i++) {
        if (!d[i]) continue;
        const line = points[i][k];
        for (let j = i + step; j >= 0 && j < n && !d[j] && Math.abs(points[j][k] - line) <= eps; j += step) d[j] = d[i];
      }
    }
  }
  return points.map(([x, z], i) => [Math.round((x + dx[i]) * 1000) / 1000, Math.round((z + dz[i]) * 1000) / 1000]);
}

/**
 * The game's fence is made of 2 m panels (chickenNetFence.xml: panel length 2, maxScale 1.3). Read from the segments the game made of Lars fences: a stretch is made whole when its rest after the
 * 2 m panels is at most 0.6 m (the last panel is stretched to 1.3 times) or at least about 1.54 m (one more panel, squeezed to 1 / 1.3); a rest between them is cut down to 0.6 m, which leaves a hole of
 * the difference before the next post (0.15 to 0.75 m seen), and the fences with holes gave "Could not shrink polygon for creation task" in 5 of 6 placements.
 */
export const PANEL = {length: 2, stretch: 0.6, squeeze: 1.54};
/** The rest of a stretch of length L after the whole 2 m panels. */
export const panelRest = L => L - PANEL.length * Math.floor(L / PANEL.length + 1e-9);

/** The length nearest to L that the game makes whole (a rest of at most 0.55 m or at least 1.6 m after the 2 m panels, a little inside the edges so that rounding does not decide). */
const wholeNear = L => {
  const r = panelRest(L), lo = PANEL.stretch - 0.05, hi = PANEL.squeeze + 0.06;
  if (r <= lo + 0.01 || r >= hi - 0.01) return L;
  const n = L - r;
  return r - lo <= hi - r ? n + lo : n + hi;
};

/**
 * The fence's posts [[x, z] ...] fitted to the panels, so that no stretch is cut short by the game (a hole before the next post). Each stretch gets the whole length nearest to its own (one that is whole
 * already keeps its length), and the posts are pulled there together, half of the change each, until every stretch has it. pins: [{x?, z?}] for the posts (a post on a wall line is pinned in the
 * coordinate the line fixes: it can only slide along the line, so a side along a wall stays straight and the free corners take the fitting). Where that cannot be done (everything pinned across the
 * stretch) the posts are moved one by one along their stretch instead, which always works.
 */
export function fitPanels(points, pins = []) {
  const n = points.length, p = points.map(q => [q[0], q[1]]);
  const len = (i, q = p) => Math.hypot(q[i + 1][0] - q[i][0], q[i + 1][1] - q[i][1]);
  const target = Array.from({length: Math.max(0, n - 1)}, (_, i) => (len(i) < 0.01 ? null : wholeNear(len(i))));
  const free = (i, k) => !(pins[i] && (k === 0 ? pins[i].x : pins[i].z));
  for (let it = 0; it < 300; it++) {
    let worst = 0;
    for (let i = 0; i + 1 < n; i++) {
      if (target[i] === null) continue;
      const L = len(i), e = target[i] - L;
      worst = Math.max(worst, Math.abs(e));
      if (Math.abs(e) < 1e-5 || L < 1e-9) continue;
      const ux = (p[i + 1][0] - p[i][0]) / L, uz = (p[i + 1][1] - p[i][1]) / L;
      for (const [j, sgn] of [[i, -1], [i + 1, 1]]) { if (free(j, 0)) p[j][0] += sgn * e / 2 * ux; if (free(j, 1)) p[j][1] += sgn * e / 2 * uz; }
    }
    if (worst < 1e-4) break;
  }
  const out = p.map(q => [Math.round(q[0] * 1000) / 1000, Math.round(q[1] * 1000) / 1000]);
  const whole = q => q.every((_, i) => i + 1 >= q.length || Math.hypot(q[i + 1][0] - q[i][0], q[i + 1][1] - q[i][1]) < 0.01 || (panelRest(Math.hypot(q[i + 1][0] - q[i][0], q[i + 1][1] - q[i][1])) <= PANEL.stretch - 0.04 || panelRest(Math.hypot(q[i + 1][0] - q[i][0], q[i + 1][1] - q[i][1])) >= PANEL.squeeze + 0.05));
  if (whole(out)) return out;
  // (the fallback: each post along its stretch from the post before it; the pins are given up)
  const q = points.map(r => [r[0], r[1]]);
  for (let i = 1; i < q.length; i++) {
    const dx = q[i][0] - q[i - 1][0], dz = q[i][1] - q[i - 1][1], L = Math.hypot(dx, dz);
    if (L < 0.01) continue;
    const to = wholeNear(L);
    q[i] = [Math.round((q[i - 1][0] + dx * to / L) * 1000) / 1000, Math.round((q[i - 1][1] + dz * to / L) * 1000) / 1000];
  }
  return q;
}
