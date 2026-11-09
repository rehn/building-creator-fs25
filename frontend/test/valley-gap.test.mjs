// Where a wing's roof meets the house's in a valley the two must join with no gap (it showed as a thin light line from the eaves up the valley).
import test from "node:test";
import assert from "node:assert/strict";
import { sanitize, buildGeometry } from "../src/editor/model.mjs";

const wing = (o = {}) => ({id: 1, wall: "back", pos: 0.5, width: 6, depth: 6, floors: 0, ...o});
const SAVES = {
  "L at an end": {width: 12, depth: 8, wings: [wing({pos: 0.1})]},
  "T in the middle": {width: 14, depth: 8, floors: 2, wings: [wing({pos: 0.5, width: 8, depth: 7, floors: 2})]},
  "a part on a part": {width: 14, depth: 8, wings: [wing({width: 8, depth: 6}), wing({id: 2, wall: "w1Left", pos: 0.5, width: 3, depth: 3})]},
};

/** The cells (R m wide) seen from above where the roof has a hole between roof on both sides (within 4 cells). */
function gaps(G, R = 0.01) {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < G.p.length; i += 3) { x0 = Math.min(x0, G.p[i]); x1 = Math.max(x1, G.p[i]); z0 = Math.min(z0, G.p[i + 2]); z1 = Math.max(z1, G.p[i + 2]); }
  const nx = Math.ceil((x1 - x0) / R) + 1, nz = Math.ceil((z1 - z0) / R) + 1, cov = new Uint8Array(nx * nz);
  for (let t = 0; t < G.i.length; t += 3) {
    const P = [0, 1, 2].map(e => [G.p[G.i[t + e] * 3], G.p[G.i[t + e] * 3 + 2]]), [a, b, c] = P;
    const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(d) < 1e-9) continue;
    const ix0 = Math.floor((Math.min(a[0], b[0], c[0]) - x0) / R), ix1 = Math.ceil((Math.max(a[0], b[0], c[0]) - x0) / R);
    const iz0 = Math.floor((Math.min(a[1], b[1], c[1]) - z0) / R), iz1 = Math.ceil((Math.max(a[1], b[1], c[1]) - z0) / R);
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      const x = x0 + ix * R, z = z0 + iz * R, l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (z - c[1])) / d, l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (z - c[1])) / d;
      if (l1 >= -1e-6 && l2 >= -1e-6 && 1 - l1 - l2 >= -1e-6) cov[ix * nz + iz] = 1;
    }
  }
  const at = (ix, iz) => ix >= 0 && iz >= 0 && ix < nx && iz < nz && cov[ix * nz + iz];
  let n = 0;
  for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) if (!at(ix, iz)) {
    let lx = false, rx = false, lz = false, rz = false;
    for (let k = 1; k <= 4; k++) { if (at(ix - k, iz)) lx = true; if (at(ix + k, iz)) rx = true; if (at(ix, iz - k)) lz = true; if (at(ix, iz + k)) rz = true; }
    if ((lx && rx) || (lz && rz)) n++;
  }
  return n;
}

for (const [name, save] of Object.entries(SAVES)) test(`valley roofs join without a gap: ${name}`, () => {
  const n = gaps(buildGeometry(sanitize(save)).G.roof);
  assert.ok(n <= 6, `${n} cells of 1 cm with a hole in the roof between roof on both sides`);
});
