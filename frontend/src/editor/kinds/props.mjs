// Shared drawing for the pieces inside walk-in buildings (the kinds' catalogs): colour tones so
// boards and straw aren't all one flat colour, bends for pipes, and a straw bale.
// Pieces draw with the kit the core hands to build(c, it) (see model.mjs buildInside):
//   c.box(x0, x1, z0, z1, y0, y1)   c.cyl(x, z, y, r, h, seg)   c.cone(x, z, y, r0, r1, h, seg)
//   c.rod([x, y, z], [x, y, z], r, seg)   c.pipe(points, r, seg)   c.board(a, b, w, h)
//   c.paint(color), c.H (wall height)
// Every exported colour is its own plain part in the i3d, so tones are a few, not one per board.

/** hex lighter (k > 0) or darker (k < 0), k in -1..1. */
export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), f = 1 + k * 0.2;
  return "#" + [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, "0")).join("");
}
/** One of three tones of a colour, by index: neighbouring boards differ, the look is always the same. */
export const tone = (hex, i) => shade(hex, [0, -0.35, 0.25][((i % 3) + 3) % 3]);

/**
 * Points along an arc: map(u, v) places a point of the arc's plane in the piece's frame; the arc is
 * centred at (cu, cv), radius r, from angle a0 to a1 (radians) in n steps.
 */
export const arc = (map, cu, cv, r, a0, a1, n = 4) =>
  Array.from({length: n + 1}, (_, k) => { const a = a0 + (a1 - a0) * k / n; return map(cu + r * Math.cos(a), cv + r * Math.sin(a)); });

const STRAW = "#D9BC6A", TWINE = "#7A5A2E";
/**
 * A small square straw bale, 0.9 x 0.46 x 0.36 m along x, standing at (cx, y0, cz): flakes of
 * slightly different straw, two twines round it and a few loose stalks on top.
 */
export function strawBale(c, cx = 0, cz = 0, y0 = 0, straw = STRAW) {
  const L = 0.9, W = 0.46, h = 0.36, n = 6, f = L / n;
  for (let k = 0; k < n; k++) {
    c.paint(shade(straw, [0, -0.18, 0.12][k % 3]));
    const x0 = cx - L / 2 + k * f, wob = (k % 2 ? 0.006 : 0), sag = [0, 0.012, 0.004][k % 3];
    c.box(x0, x0 + f, cz - W / 2 + wob, cz + W / 2 - wob, y0, y0 + h - sag);
  }
  c.paint(TWINE);
  for (const x of [cx - 0.24, cx + 0.24]) {
    c.box(x - 0.006, x + 0.006, cz - W / 2 - 0.004, cz + W / 2 + 0.004, y0 + h - 0.012, y0 + h + 0.002);
    for (const s of [-1, 1]) c.box(x - 0.006, x + 0.006, s > 0 ? cz + W / 2 : cz - W / 2 - 0.004, s > 0 ? cz + W / 2 + 0.004 : cz - W / 2, y0, y0 + h - 0.012);
  }
  c.paint(shade(straw, 0.35));
  for (const [x, z, dx, dz] of [[-0.3, -0.1, 0.12, 0.05], [0.05, 0.12, -0.1, -0.06], [0.28, -0.05, 0.09, 0.1], [-0.12, 0.08, 0.11, -0.04]])
    c.board([cx + x, y0 + h - 0.002, cz + z], [cx + x + dx, y0 + h + 0.012, cz + z + dz], 0.008, 0.004);
}

/** Loose straw over a rectangle: a thin layer and a scatter of tufts, in a few tones. */
export function strawLitter(c, x0, x1, z0, z1, y0 = 0, straw = STRAW) {
  c.paint(shade(straw, -0.25)); c.box(x0, x1, z0, z1, y0, y0 + 0.02);
  const nx = Math.max(1, Math.round((x1 - x0) / 0.35)), nz = Math.max(1, Math.round((z1 - z0) / 0.35));
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const k = i * 7 + j * 3, x = x0 + (i + 0.5) * (x1 - x0) / nx + ((k % 5) - 2) * 0.02, z = z0 + (j + 0.5) * (z1 - z0) / nz + ((k % 3) - 1) * 0.03;
    const r = Math.min(0.12, (x1 - x0) / nx / 2, (z1 - z0) / nz / 2) * 0.9;
    c.paint(shade(straw, [0, -0.18, 0.12][k % 3]));
    c.box(x - r, x + r, z - r * 0.7, z + r * 0.7, y0 + 0.02, y0 + 0.035 + (k % 3) * 0.01);
  }
}
