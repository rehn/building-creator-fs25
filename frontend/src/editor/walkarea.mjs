// Where the animals can walk: inside the fence, minus the building and the troughs (the game cuts those out of the area it makes from the fence).
// A grid of cells over the fence's bounding box, 1 where an animal can stand. Pure; the editor paints it on the ground.
import { insidePoly } from "./objects.mjs";

/**
 * fence: [[x, y, z] ...] (the polygon, its first and last point may be the same); blockers: [{center: [x, y, z], size: [w, h, d]}];
 * cell: the size of a cell in m; margin: how far from a blocker an animal keeps (m). Null where there is no fence.
 */
export function walkArea(fence, blockers = [], cell = 0.15, margin = 0) {
  if (!fence || fence.length < 3) return null;
  const xs = fence.map(q => q[0]), zs = fence.map(q => q[2]);
  const x0 = Math.min(...xs), z0 = Math.min(...zs), nx = Math.max(1, Math.ceil((Math.max(...xs) - x0) / cell)), nz = Math.max(1, Math.ceil((Math.max(...zs) - z0) / cell));
  const boxes = blockers.map(b => ({x0: b.center[0] - b.size[0] / 2 - margin, x1: b.center[0] + b.size[0] / 2 + margin, z0: b.center[2] - b.size[2] / 2 - margin, z1: b.center[2] + b.size[2] / 2 + margin}));
  const cells = new Uint8Array(nx * nz);
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    const x = x0 + (i + 0.5) * cell, z = z0 + (k + 0.5) * cell;
    if (insidePoly(fence, x, z) && !boxes.some(b => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1)) cells[i * nz + k] = 1;
  }
  return {x0, z0, nx, nz, cell, cells};
}
/** The area in m2. */
export const areaOf = w => w ? w.cells.reduce((s, v) => s + v, 0) * w.cell * w.cell : 0;

/** The rectangles (cell-aligned, merged: runs along z, then runs of equal runs along x) of the cells of a walkArea grid that are set. */
export function cellRects(w, y = 0, inside = false) {
  if (!w) return [];
  const {x0, z0, nx, nz, cell, cells} = w, out = [];
  const open = new Map();   // "k0:k1" -> {i0, k0, k1}: a run of cells along z that has been growing along x
  const flush = (key, i) => { const r = open.get(key); open.delete(key); out.push({x0: x0 + r.i0 * cell, x1: x0 + i * cell, z0: z0 + r.k0 * cell, z1: z0 + (r.k1 + 1) * cell, y, ...(inside ? {inside: true} : {})}); };
  for (let i = 0; i <= nx; i++) {
    const runs = [];
    if (i < nx) for (let k = 0; k < nz; k++) if (cells[i * nz + k]) { let e = k; while (e + 1 < nz && cells[i * nz + e + 1]) e++; runs.push([k, e]); k = e; }
    const now = new Set(runs.map(([a, b]) => `${a}:${b}`));
    for (const key of [...open.keys()]) if (!now.has(key)) flush(key, i);
    for (const [a, b] of runs) if (!open.has(`${a}:${b}`)) open.set(`${a}:${b}`, {i0: i, k0: a, k1: b});
  }
  return out;
}

/** How far from a wall, a fence, a trough or a piece the middle of an animal keeps (m): its body reaches this far round the point the game moves it by. */
export const KEEP = {wall: 0.9, fence: 0.4, trough: 0.6, piece: 0.4, innerWall: 0.35};
const distToPoly = (poly, x, z) => {
  let best = Infinity;
  for (let i = 0; i + 1 < poly.length; i++) {
    const [ax, , az] = poly[i], [bx, , bz] = poly[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return best;
};
/**
 * Where animals can walk, as rectangles with a height {x0, x1, z0, z1, y, inside}, and the ramps (sloped quads) where they come in through a doorway.
 * The middle of an animal keeps away from what it must not go through (KEEP): the area is the fence's, less its edge, the building (wall) and the troughs.
 *   fence, blockers [{center, size, keep?}]: the yard; rooms: the floors inside the building [{x0, x1, z0, z1}] at height floorY (kept off the walls);
 *   items: boxes on the floor inside [{x0, x1, z0, z1, keep?}]; doors: [{a, b, c, d}] each doorway's strip, from outside (a-b, ground level, where the
 *   ramp starts) to inside (c-d, at floorY): the ground there is a ramp, so it is taken out of the yard's cells, and a landing inside keeps the way open
 *   through the strip kept off the walls.
 */
export function animalNav({fence, blockers = [], rooms = [], items = [], door = null, doors = door ? [door] : [], floorY = 0, cell = 0.2, keep = KEEP}) {
  if (!fence || fence.length < 3) return null;
  const xs = fence.map(q => q[0]), zs = fence.map(q => q[2]);
  const x0 = Math.min(...xs), z0 = Math.min(...zs), nx = Math.max(1, Math.ceil((Math.max(...xs) - x0) / cell)), nz = Math.max(1, Math.ceil((Math.max(...zs) - z0) / cell));
  const boxes = blockers.map(b => { const m = b.keep ?? keep.wall; return {x0: b.center[0] - b.size[0] / 2 - m, x1: b.center[0] + b.size[0] / 2 + m, z0: b.center[2] - b.size[2] / 2 - m, z1: b.center[2] + b.size[2] / 2 + m}; });
  const bbox = d => { const q = [d.a, d.b, d.c, d.d]; return {x0: Math.min(...q.map(v => v[0])), x1: Math.max(...q.map(v => v[0])), z0: Math.min(...q.map(v => v[1])), z1: Math.max(...q.map(v => v[1]))}; };
  const strips = doors.map(bbox);
  const inBox = (b, x, z) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1;
  const cells = new Uint8Array(nx * nz);
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    const x = x0 + (i + 0.5) * cell, z = z0 + (k + 0.5) * cell;
    if (!insidePoly(fence, x, z) || distToPoly(fence, x, z) < keep.fence || strips.some(st => inBox(st, x, z))) continue;
    if (!boxes.some(b => inBox(b, x, z))) cells[i * nz + k] = 1;
  }
  const rects = cellRects({x0, z0, nx, nz, cell, cells}, 0);
  if (rooms.length) {
    const rxs = rooms.flatMap(r => [r.x0, r.x1]), rzs = rooms.flatMap(r => [r.z0, r.z1]);
    const ix0 = Math.min(...rxs), iz0 = Math.min(...rzs), inx = Math.ceil((Math.max(...rxs) - ix0) / cell), inz = Math.ceil((Math.max(...rzs) - iz0) / cell), icells = new Uint8Array(inx * inz);
    const shrunk = rooms.map(r => ({x0: r.x0 + keep.wall, x1: r.x1 - keep.wall, z0: r.z0 + keep.wall, z1: r.z1 - keep.wall}));
    const blocks = items.map(b => { const m = b.keep ?? keep.piece; return {x0: b.x0 - m, x1: b.x1 + m, z0: b.z0 - m, z1: b.z1 + m}; });
    // a landing just inside each doorway (the doorway's width, deep enough to get off the wall's margin): it joins the ramp to the floor
    const landings = doors.map(d => {
      const m = [(d.c[0] + d.d[0]) / 2, (d.c[1] + d.d[1]) / 2], o = [(d.a[0] + d.b[0]) / 2, (d.a[1] + d.b[1]) / 2], len = Math.hypot(o[0] - m[0], o[1] - m[1]) || 1, depth = keep.wall + 0.3;
      const e = [d.c[0] - (o[0] - m[0]) / len * depth, d.c[1] - (o[1] - m[1]) / len * depth, d.d[0] - (o[0] - m[0]) / len * depth, d.d[1] - (o[1] - m[1]) / len * depth];
      const xsL = [d.c[0], d.d[0], e[0], e[2]], zsL = [d.c[1], d.d[1], e[1], e[3]];
      return {x0: Math.min(...xsL), x1: Math.max(...xsL), z0: Math.min(...zsL), z1: Math.max(...zsL), m, dir: [(o[0] - m[0]) / len, (o[1] - m[1]) / len]};
    });
    for (let i = 0; i < inx; i++) for (let k = 0; k < inz; k++) {
      const x = ix0 + (i + 0.5) * cell, z = iz0 + (k + 0.5) * cell;
      if ((shrunk.some(r => inBox(r, x, z)) && !blocks.some(b => inBox(b, x, z))) || landings.some(l => inBox(l, x, z) && rooms.some(r => inBox(r, x, z)))) icells[i * inz + k] = 1;
    }
    // only what can be reached from a doorway: a stretch cut off by an inner wall (or a piece) is not somewhere the animals can be
    if (doors.length) {
      const reach = new Uint8Array(inx * inz), queue = [];
      const nearest = (px, pz) => {   // the walkable cell nearest a point, within 1 m
        const ci = Math.floor((px - ix0) / cell), ck = Math.floor((pz - iz0) / cell), R = Math.ceil(1 / cell);
        let best = null, bd = 1e9;
        for (let i = Math.max(0, ci - R); i <= Math.min(inx - 1, ci + R); i++) for (let k = Math.max(0, ck - R); k <= Math.min(inz - 1, ck + R); k++) if (icells[i * inz + k]) { const dd = Math.hypot(i - ci, k - ck); if (dd < bd) { bd = dd; best = [i, k]; } }
        return best;
      };
      for (const l of landings) {
        const seed = nearest(l.m[0] - l.dir[0] * cell * 1.5, l.m[1] - l.dir[1] * cell * 1.5);
        if (seed && !reach[seed[0] * inz + seed[1]]) { reach[seed[0] * inz + seed[1]] = 1; queue.push(seed); }
      }
      while (queue.length) {
        const [i, k] = queue.pop();
        for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = i + di, nk = k + dk;
          if (ni >= 0 && nk >= 0 && ni < inx && nk < inz && icells[ni * inz + nk] && !reach[ni * inz + nk]) { reach[ni * inz + nk] = 1; queue.push([ni, nk]); }
        }
      }
      for (let n = 0; n < icells.length; n++) if (!reach[n]) icells[n] = 0;
    }
    rects.push(...cellRects({x0: ix0, z0: iz0, nx: inx, nz: inz, cell, cells: icells}, floorY, true));
  }
  const ramps = doors.map(d => ({points: [d.a, d.b, d.c, d.d], y0: 0, y1: floorY}));
  return {rects, ramps, ramp: ramps[0] || null};
}

/** A flat mesh {p, n, uv, i} (the i3d shape) of the rectangles, each at its height, and the ramp. */
export function navMesh(nav) {
  const p = [], n = [], uv = [], i = [];
  const quad = (pts) => { const b = p.length / 3; for (const q of pts) { p.push(q[0], q[1], q[2]); n.push(0, 1, 0); uv.push(0, 0); } i.push(b, b + 1, b + 2, b, b + 2, b + 3); };
  // counter-clockwise seen from above (the normal up): x then z runs the wrong way round, so z first
  for (const r of nav.rects) quad([[r.x0, r.y, r.z0], [r.x0, r.y, r.z1], [r.x1, r.y, r.z1], [r.x1, r.y, r.z0]]);
  for (const ramp of nav.ramps || []) {
    const [a, b, c, d] = ramp.points, y0 = ramp.y0, y1 = ramp.y1;
    const q = [[a[0], y0, a[1]], [b[0], y0, b[1]], [c[0], y1, c[1]], [d[0], y1, d[1]]];
    // face up: flip when the first triangle faces down
    const e1 = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]], e2 = [q[2][0] - q[0][0], q[2][1] - q[0][1], q[2][2] - q[0][2]];
    const ny = e1[2] * e2[0] - e1[0] * e2[2];
    quad(ny >= 0 ? q : [q[3], q[2], q[1], q[0]]);
  }
  return {p, n, uv, i};
}
