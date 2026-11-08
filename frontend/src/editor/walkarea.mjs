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
