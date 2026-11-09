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

/**
 * Where animals can walk, as rectangles with a height {x0, x1, z0, z1, y}, and the ramp (a sloped quad) where they come in through a doorway.
 *   fence, blockers: the yard (as walkArea); rooms: the floors inside the building [{x0, x1, z0, z1}] at height floorY; items: boxes on the floor
 *   inside that animals walk round; door: {a: [x, z], b: [x, z], c: [x, z], d: [x, z]} the doorway's strip from outside (a-b, at the foot of the ramp,
 *   ground level) to inside (c-d, at floorY): the ground there is a ramp, so it is taken out of the yard's cells.
 */
export function animalNav({fence, blockers = [], rooms = [], items = [], door = null, doors = door ? [door] : [], floorY = 0, cell = 0.25}) {
  const out = walkArea(fence, blockers, cell);
  if (!out) return null;
  const rects = [];
  const strips = doors.map(d => ({x0: Math.min(...[d.a, d.b, d.c, d.d].map(q => q[0])), x1: Math.max(...[d.a, d.b, d.c, d.d].map(q => q[0])), z0: Math.min(...[d.a, d.b, d.c, d.d].map(q => q[1])), z1: Math.max(...[d.a, d.b, d.c, d.d].map(q => q[1]))}));
  if (strips.length) for (let i = 0; i < out.nx; i++) for (let k = 0; k < out.nz; k++) {
    const x = out.x0 + (i + 0.5) * cell, z = out.z0 + (k + 0.5) * cell;
    if (strips.some(st => x > st.x0 && x < st.x1 && z > st.z0 && z < st.z1)) out.cells[i * out.nz + k] = 0;
  }
  rects.push(...cellRects(out, 0));
  if (rooms.length) {
    const xs = rooms.flatMap(r => [r.x0, r.x1]), zs = rooms.flatMap(r => [r.z0, r.z1]);
    const x0 = Math.min(...xs), z0 = Math.min(...zs), nx = Math.ceil((Math.max(...xs) - x0) / cell), nz = Math.ceil((Math.max(...zs) - z0) / cell), cells = new Uint8Array(nx * nz);
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      const x = x0 + (i + 0.5) * cell, z = z0 + (k + 0.5) * cell;
      if (rooms.some(r => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) && !items.some(b => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1)) cells[i * nz + k] = 1;
    }
    // only what can be reached from a doorway: a stretch cut off by an inner wall (or a piece) is not somewhere the animals can be
    if (doors.length) {
      const reach = new Uint8Array(nx * nz), queue = [];
      const nearest = (px, pz) => {   // the walkable cell nearest a point, within 1 m
        const ci = Math.floor((px - x0) / cell), ck = Math.floor((pz - z0) / cell), R = Math.ceil(1 / cell);
        let best = null, bd = 1e9;
        for (let i = Math.max(0, ci - R); i <= Math.min(nx - 1, ci + R); i++) for (let k = Math.max(0, ck - R); k <= Math.min(nz - 1, ck + R); k++) if (cells[i * nz + k]) { const d = Math.hypot(i - ci, k - ck); if (d < bd) { bd = d; best = [i, k]; } }
        return best;
      };
      for (const d of doors) {
        const m = [(d.c[0] + d.d[0]) / 2, (d.c[1] + d.d[1]) / 2], o = [(d.a[0] + d.b[0]) / 2, (d.a[1] + d.b[1]) / 2], len = Math.hypot(o[0] - m[0], o[1] - m[1]) || 1;
        const seed = nearest(m[0] - (o[0] - m[0]) / len * cell * 1.5, m[1] - (o[1] - m[1]) / len * cell * 1.5);
        if (seed && !reach[seed[0] * nz + seed[1]]) { reach[seed[0] * nz + seed[1]] = 1; queue.push(seed); }
      }
      while (queue.length) {
        const [i, k] = queue.pop();
        for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = i + di, nk = k + dk;
          if (ni >= 0 && nk >= 0 && ni < nx && nk < nz && cells[ni * nz + nk] && !reach[ni * nz + nk]) { reach[ni * nz + nk] = 1; queue.push([ni, nk]); }
        }
      }
      for (let n = 0; n < cells.length; n++) if (!reach[n]) cells[n] = 0;
    }
    rects.push(...cellRects({x0, z0, nx, nz, cell, cells}, floorY, true));
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
