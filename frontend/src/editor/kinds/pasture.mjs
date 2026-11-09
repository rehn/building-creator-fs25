// What animal buildings with a pasture share: the fence from the pasture wall, and where the places
// outside go (feed on one wall, something else on another, walls without a door first).
// Pure; used by the hen house and the cow barn.
import { wallsOf } from "../layout.mjs";
import { pastureOf, footprints } from "../objects.mjs";

export const OPPOSITE = {front: "back", back: "front", left: "right", right: "left"};
export const wallLength = (p, wall) => (wall === "front" || wall === "back") ? p.width : p.depth;
/** The walls with a door (the window list's ground-floor doors). */
export const doorWalls = p => new Set((p.windows || []).filter(w => w.type === "door" && w.floor === 0).map(w => w.wall));
/**
 * The pasture's wall: the one asked for, unless it has a door; then the opposite wall, or else any
 * wall without a door. If every wall has a door it stays.
 */
export function pastureWallFor(p) {
  const doors = doorWalls(p), want = p.pastureWall;
  if (!doors.has(want)) return want;
  return [OPPOSITE[want], "back", "front", "left", "right"].find(k => !doors.has(k)) || want;
}

/**
 * The yard around an animal building, from built geometry.
 *   fence:    posts on the ground from one corner of the pasture wall, out p.fenceDepth, across and
 *             back to the other corner (the base game's winding). If the pasture is wider than the
 *             wall (at least minWidth along it: the game can't make a walking area for a tiny one),
 *             the fence runs back along the wall line to the barn's corners, as in the base game's cow barn.
 *   past:     the pasture wall's frame {o, u, n, L}
 *   feed, other: the frames of the two walls (not the pasture's; walls without a door first) the outside places go
 *             on: the wall opposite the pasture for feed if it's free, else a side wall; feedKey, otherKey: their keys
 *   frames:   every wall's frame by key; mid(w): the middle of the stretch of wall w clear of the fence, and its length
 *   at(w, s, d, y), boxAt(w, s, d, along, out, h), rectOf(box): points and world-axis boxes by a wall
 *   clear(w): along wall w, the stretch [a, b] at least 1 m behind the pasture wall (the fence line)
 */
export function yardFrame(geo, p, minWidth) {
  const walls = geo.opsByWall, past = walls[p.pastureWall].w, opp = OPPOSITE[p.pastureWall];
  const sides = Object.keys(walls).filter(k => k !== p.pastureWall && k !== opp);
  // walls without a door first
  const doors = doorWalls(p), order = [opp, ...sides];
  const [feedSide, otherSide] = [...order.filter(k => !doors.has(k)), ...order.filter(k => doors.has(k))];
  const at = (w, s, d, y = 0) => [w.o[0] + w.u[0]*s + w.n[0]*d, y, w.o[2] + w.u[2]*s + w.n[2]*d];
  // World-axis box in front of wall w: centred at s along it and d out, `along` wide, `out` deep, h high.
  const boxAt = (w, s, d, along, out, h) => {
    const c = at(w, s, d, h / 2), ax = Math.abs(w.u[0]) > 0.5;
    return {center: c, size: ax ? [along, h, out] : [out, h, along]};
  };
  const rectOf = b => ({x0: b.center[0] - b.size[0]/2, x1: b.center[0] + b.size[0]/2, z0: b.center[2] - b.size[2]/2, z1: b.center[2] + b.size[2]/2});
  const fd = p.fenceDepth, L = past.L, post = 0.15, half = Math.max(L, minWidth) / 2;
  const fence = L < minWidth - 1e-9
    ? [at(past, L, post), at(past, L/2 + half, post), at(past, L/2 + half, fd), at(past, L/2 - half, fd), at(past, L/2 - half, post), at(past, 0, post)]
    : [at(past, L, post), at(past, L, fd), at(past, 0, fd), at(past, 0, post)];
  const clear = w => {
    const ahead = s => { const q = at(w, s, 0); return (q[0] - past.o[0]) * past.n[0] + (q[2] - past.o[2]) * past.n[2]; };
    const a0 = ahead(0), a1 = ahead(w.L);
    return Math.abs(a0 - a1) < 1e-6 ? [0, w.L] : Math.abs(a0) < Math.abs(a1) ? [1, w.L] : [0, w.L - 1];
  };
  const frames = Object.fromEntries(Object.entries(walls).map(([k, e]) => [k, e.w]));
  return {fence, past, feed: walls[feedSide].w, other: walls[otherSide].w, feedKey: feedSide, otherKey: otherSide, frames, at, boxAt, rectOf, clear,
    // the middle of the stretch clear of the fence on wall w, and its length
    mid: w => { const [a, b] = clear(w); return [(a + b) / 2, b - a]; }};
}

/** The building's walls as buildGeometry gives them ({opsByWall, dims}), without building it: for where things go to start with. */
export const shellOf = p => ({opsByWall: Object.fromEntries(Object.entries(wallsOf(p)).map(([k, w]) => [k, {w, ops: []}])), dims: {W: p.width, D: p.depth}});
/** The map's teleport point for an animal trailer spot {box}: 3 m further out from the building than its middle. */
export function teleportFor(l, {W, D}) {
  const [x, , z] = l.box.center, alongX = Math.abs(x) - W / 2 > Math.abs(z) - D / 2;
  return alongX ? [x + Math.sign(x || 1) * 3, 0, z] : [x, 0, z + Math.sign(z || 1) * 3];
}
/**
 * The settings the rest of the kind reads, from its pasture object: pastureWall, fenceDepth and
 * pastureMid (where on that wall the animals go out: the opening set on the pasture, else the middle of the stretch it encloses), pastureGapW and pastureGapH (its size).
 */
export function withPasture(q) {
  const pa = pastureOf(q);
  return pa ? {...q, pastureWall: pa.wall, fenceDepth: pa.depth, pastureMid: pa.mid, pastureGapW: pa.gapW, pastureGapH: pa.gapH, pastureNoGap: pa.noGap, pastureRamp: pa.gapRamp} : q;
}

/** Two pallet spawn lines inside a pallet trigger box, along its longer side: 50 cm in from its ends and 80 cm either side of its middle. */
export function palletLines(box) {
  const [cx, , cz] = box.center, [sw, , sd] = box.size, long = sw >= sd;
  const ll = Math.max(0.2, (long ? sw : sd) - 1) / 2, dd = Math.min(0.8, Math.max(0, (long ? sd : sw) / 2 - 0.2));
  return [-dd, dd].map(o => long ? [[cx - ll, 0, cz + o], [cx + ll, 0, cz + o]] : [[cx + o, 0, cz - ll], [cx + o, 0, cz + ll]]);
}

/**
 * Warning stripes: an L-shaped mark (two flat arms, up to 1 m long and 0.25 m wide) in each corner
 * of the ground rectangle r, facing up. UVs in metres: the stripe texture tiles once per metre.
 */
export function cornerStripes(r, arm = 1, w = 0.25) {
  const g = {p: [], n: [], uv: [], i: []};
  const quad = (xa, xb, za, zb) => {
    const [x0, x1] = [Math.min(xa, xb), Math.max(xa, xb)], [z0, z1] = [Math.min(za, zb), Math.max(za, zb)], base = g.p.length / 3;
    for (const [x, z] of [[x0, z0], [x0, z1], [x1, z1], [x1, z0]]) { g.p.push(x, 0, z); g.n.push(0, 1, 0); g.uv.push(x, z); }
    g.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const ax = Math.min(arm, (r.x1 - r.x0) / 2), az = Math.min(arm, (r.z1 - r.z0) / 2);
  for (const [cx, sx] of [[r.x0, 1], [r.x1, -1]]) for (const [cz, sz] of [[r.z0, 1], [r.z1, -1]]) {
    quad(cx, cx + sx * ax, cz, cz + sz * w);          // arm along x, including the corner square
    quad(cx, cx + sx * w, cz + sz * w, cz + sz * az); // arm along z
  }
  return g;
}

/**
 * The ground under the building, for the meadow's clear task (the game paints the meadow over the area it takes from the fence and the walking area, and the barn's floor
 * must not get grass): the convex hull of the building's footprints (the main building and every part), grown by margin m, as [[x, z] ...] in order round it.
 */
export function footprintHull(p, margin = 0.5) {
  const pts = footprints(p).flatMap(r => [[r.x0 - margin, r.z0 - margin], [r.x1 + margin, r.z0 - margin], [r.x1 + margin, r.z1 + margin], [r.x0 - margin, r.z1 + margin]]);
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = list => { const h = []; for (const q of list) { while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop(); h.push(q); } h.pop(); return h; };
  return [...half(pts), ...half(pts.slice().reverse())];
}

/**
 * The outline of the building seen from above: the union of its footprints [{x0, x1, z0, z1}] grown by e, as one counter-clockwise loop [[x, z] ...]
 * (x right, z down the page, the area positive by the shoelace sum x·z' − x'·z): the outer one, if the rectangles leave a hole.
 */
export function buildingOutline(rects, e = 0) {
  const R = rects.map(r => ({x0: r.x0 - e, x1: r.x1 + e, z0: r.z0 - e, z1: r.z1 + e}));
  if (!R.length) return [];
  const xs = [...new Set(R.flatMap(r => [r.x0, r.x1]))].sort((a, b) => a - b), zs = [...new Set(R.flatMap(r => [r.z0, r.z1]))].sort((a, b) => a - b);
  const nx = xs.length - 1, nz = zs.length - 1;
  const cov = (i, j) => i >= 0 && j >= 0 && i < nx && j < nz && R.some(r => (xs[i] + xs[i + 1]) / 2 > r.x0 && (xs[i] + xs[i + 1]) / 2 < r.x1 && (zs[j] + zs[j + 1]) / 2 > r.z0 && (zs[j] + zs[j + 1]) / 2 < r.z1);
  // the edges between a covered cell and an empty one, each going round its cell the same way (so they join into loops)
  const next = new Map(), key = (i, j) => `${i},${j}`;
  const edge = (a, b) => next.set(key(...a), b);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) if (cov(i, j)) {
    if (!cov(i, j - 1)) edge([i, j], [i + 1, j]);
    if (!cov(i + 1, j)) edge([i + 1, j], [i + 1, j + 1]);
    if (!cov(i, j + 1)) edge([i + 1, j + 1], [i, j + 1]);
    if (!cov(i - 1, j)) edge([i, j + 1], [i, j]);
  }
  const loops = [], seen = new Set();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    for (let k = start, n = 0; !seen.has(k) && n < 10000; n++) { seen.add(k); const [i, j] = k.split(",").map(Number); loop.push([xs[i], zs[j]]); const b = next.get(k); if (!b) break; k = key(...b); }
    loops.push(loop);
  }
  const area = poly => poly.reduce((s, [x, z], i) => { const [x2, z2] = poly[(i + 1) % poly.length]; return s + x * z2 - x2 * z; }, 0) / 2;
  let out = loops.sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)))[0];
  if (area(out) < 0) out = out.reverse();
  // (corners only: points on a straight run are left out)
  return out.filter((q, i) => { const a = out[(i + out.length - 1) % out.length], b = out[(i + 1) % out.length]; return Math.abs((q[0] - a[0]) * (b[1] - q[1]) - (q[1] - a[1]) * (b[0] - q[0])) > 1e-9; });
}

/**
 * The way back from a fence's last post to its first along the building (outline grown by e), as [[x, z] ...] to add to the animals' contour after the posts
 * (the husbandry's additionalNavMeshNodes): the game would close the contour with a straight line, which cuts through the building when the pasture goes
 * round a corner of it. The side of the building taken is the one that leaves the building out of the area. [] when the fence doesn't start and end at the building.
 */
export function contourClosure(fence, rects, e = 0.15) {
  const O = buildingOutline(rects, e);
  if (O.length < 3 || fence.length < 2) return [];
  const pt = q => [q[0], q.length > 2 ? q[2] : q[1]];
  const first = pt(fence[0]), last = pt(fence[fence.length - 1]);
  // the nearest point of the outline to q: [edge index k (from O[k] to O[k+1]), the point, its distance]
  const near = q => {
    let best = null;
    O.forEach((a, k) => {
      const b = O[(k + 1) % O.length], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
      const t = l2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / l2)) : 0, c = [a[0] + t * dx, a[1] + t * dz], d = Math.hypot(q[0] - c[0], q[1] - c[1]);
      if (!best || d < best[2]) best = [k, c, d];
    });
    return best;
  };
  const A = near(last), B = near(first);
  if (A[2] > 1.5 || B[2] > 1.5) return [];
  const n = O.length, a0 = O[A[0]], b0 = O[(A[0] + 1) % n];
  const ahead = A[0] === B[0] && (B[1][0] - A[1][0]) * (b0[0] - a0[0]) + (B[1][1] - A[1][1]) * (b0[1] - a0[1]) >= 0;
  const path = dir => {
    const out = [A[1]];
    if (A[0] === B[0] && (dir > 0) === ahead) return [...out, B[1]];   // (both on one edge, going towards B)
    if (dir > 0) for (let k = (A[0] + 1) % n, m = 0; m < n; k = (k + 1) % n, m++) { out.push(O[k]); if (k === B[0]) break; }
    else for (let k = A[0], m = 0; m < n; k = (k + n - 1) % n, m++) { out.push(O[k]); if (k === (B[0] + 1) % n) break; }
    return [...out, B[1]];
  };
  const inside = (poly, x, z) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
  const probes = rects.map(r => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2]);
  const len = p => p.reduce((s, q, i) => i ? s + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0, 0);
  const options = [path(1), path(-1)].map(p => ({p, ok: !probes.some(([x, z]) => inside([...fence.map(pt), ...p], x, z)), l: len(p)}));
  const pick = options.filter(o => o.ok).sort((a, b) => a.l - b.l)[0] || options.sort((a, b) => a.l - b.l)[0];
  // (points on top of the posts themselves add nothing)
  return pick.p.filter(q => Math.hypot(q[0] - last[0], q[1] - last[1]) > 0.05 && Math.hypot(q[0] - first[0], q[1] - first[1]) > 0.05);
}

/**
 * The husbandry's additionalNavMeshNodes for a fence: the way along the building between its posts (contourClosure), in the order the game wants them.
 * Given from the last post back to the first, the game's area came out crossed (two thin triangles, seen with showNavMesh): it joins them the other way
 * round, so they go from the first post to the last.
 */
export const navContourNodes = (fence, rects, e = 0.15) => contourClosure(fence, rects, e).reverse();
