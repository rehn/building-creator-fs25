// Walking through a built building in the first person (the editor's "Walk around"): where a person
// standing at a point can go, from the building's collision mesh (what the game collides with too).
// Pure; no DOM. The person is a upright cylinder: radius, eye height, and a step it can climb (stairs, doorsteps,
// ramps: faces that lead up are ground, steeper ones are walls).
//
// const walker = makeWalker(geo.collision);
// pos = walker.move(pos, dx, dz);   // {x, y (the feet), z} -> where the feet end up
export function makeWalker(col, {radius = 0.28, step = 0.45, head = 1.8, cell = 2} = {}) {
  const P = col.p, I = col.i, ground = new Map(), walls = new Map();
  const key = (a, b) => a + "," + b;
  const put = (map, x0, x1, z0, z1, item) => {
    for (let a = Math.floor(x0 / cell); a <= Math.floor(x1 / cell); a++) for (let b = Math.floor(z0 / cell); b <= Math.floor(z1 / cell); b++) {
      const k = key(a, b); if (!map.has(k)) map.set(k, []); map.get(k).push(item);
    }
  };
  for (let t = 0; t < I.length; t += 3) {
    const V = [0, 1, 2].map(k => [P[I[t + k] * 3], P[I[t + k] * 3 + 1], P[I[t + k] * 3 + 2]]);
    const [A, B, C] = V, u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], len = Math.hypot(...n);
    if (len < 1e-9) continue;
    const xs = V.map(q => q[0]), zs = V.map(q => q[2]), ys = V.map(q => q[1]);
    const box = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    if (Math.abs(n[1]) / len > 0.5) put(ground, ...box, {A, B, C});
    else {
      // a wall: the two corners furthest apart as seen from above
      let best = null;
      for (const [a, b] of [[A, B], [B, C], [C, A]]) { const d = Math.hypot(a[0] - b[0], a[2] - b[2]); if (!best || d > best.d) best = {d, a, b}; }
      if (best.d > 1e-4) put(walls, ...box, {a: best.a, b: best.b, y0: Math.min(...ys), y1: Math.max(...ys)});
    }
  }
  const near = (map, x, z, r) => {
    const seen = new Set(), out = [];
    for (let a = Math.floor((x - r) / cell); a <= Math.floor((x + r) / cell); a++) for (let b = Math.floor((z - r) / cell); b <= Math.floor((z + r) / cell); b++)
      for (const it of map.get(key(a, b)) || []) if (!seen.has(it)) { seen.add(it); out.push(it); }
    return out;
  };
  /** The height of the highest ground at or below maxY at (x, z): the terrain (0) if nothing is. */
  function groundAt(x, z, maxY) {
    let best = 0;
    for (const {A, B, C} of near(ground, x, z, 0)) {
      const d = (B[2] - C[2]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[2] - C[2]);
      if (Math.abs(d) < 1e-12) continue;
      const l1 = ((B[2] - C[2]) * (x - C[0]) + (C[0] - B[0]) * (z - C[2])) / d, l2 = ((C[2] - A[2]) * (x - C[0]) + (A[0] - C[0]) * (z - C[2])) / d, l3 = 1 - l1 - l2;
      if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
      const y = l1 * A[1] + l2 * B[1] + l3 * C[1];
      if (y <= maxY + 1e-9 && y > best) best = y;
    }
    return best;
  }
  /** From pos {x, y, z} by (dx, dz): out of walls (sliding along them), and onto the ground there. */
  function move(pos, dx, dz) {
    let x = pos.x + dx, z = pos.z + dz;
    for (let k = 0; k < 4; k++) {
      let pushed = false;
      for (const w of near(walls, x, z, radius)) {
        if (w.y1 <= pos.y + step || w.y0 >= pos.y + head) continue;
        const ex = w.b[0] - w.a[0], ez = w.b[2] - w.a[2], l2 = ex * ex + ez * ez;
        const t = Math.max(0, Math.min(1, ((x - w.a[0]) * ex + (z - w.a[2]) * ez) / l2));
        const cx = w.a[0] + ex * t, cz = w.a[2] + ez * t, d = Math.hypot(x - cx, z - cz);
        if (d >= radius) continue;
        // out along the line from the wall (or its normal where we are on it)
        const nx = d > 1e-6 ? (x - cx) / d : -ez / Math.sqrt(l2), nz = d > 1e-6 ? (z - cz) / d : ex / Math.sqrt(l2);
        x += nx * (radius - d + 1e-4); z += nz * (radius - d + 1e-4); pushed = true;
      }
      if (!pushed) break;
    }
    // (the ground under the feet: the highest within 10 cm, so a narrow gap between two slabs, like the strip between a wall and its doorstep, isn't a hole)
    const top = pos.y + step;
    let y = groundAt(x, z, top);
    for (const [ox, oz] of [[0.1, 0], [-0.1, 0], [0, 0.1], [0, -0.1]]) y = Math.max(y, groundAt(x + ox, z + oz, top));
    return {x, y, z};
  }
  return {move, groundAt};
}
