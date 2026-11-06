import { sanitize, buildGeometry, MATS } from "./src/editor/model.mjs";
for (const cfg of [{wall: "back", pos: 0.5, width: 5, depth: 5, floors: 0}, {wall: "back", pos: 0.5, width: 5, depth: 5, floors: 1}]) {
  const p = sanitize({floors: 2, wings: [cfg]}), geo = buildGeometry(p), F = p.foundation, fh = p.floorHeight;
  console.log("wing floors", cfg.floors, "ceiling y", (F + fh).toFixed(2));
  for (const x of [0, 2.2, 2.45]) {
    const row = [];
    for (let z = -3.9; z <= -3.0; z += 0.1) {
      // ray up from y = F + 2.2
      let best = null;
      for (const m of MATS) { const g = geo.G[m]; for (let t = 0; t < g.i.length; t += 3) {
        const A = [0, 1, 2].map(k => g.p[g.i[t + k] * 3 + 0]), idx = k => g.i[t + k] * 3;
        const v = k => [g.p[idx(k)], g.p[idx(k) + 1], g.p[idx(k) + 2]], a = v(0), b = v(1), c = v(2);
        const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]); if (Math.abs(d) < 1e-12) continue;
        const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d, l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d, l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        const y = l1 * a[1] + l2 * b[1] + l3 * c[1];
        if (y > F + 2.2 && (!best || y < best.y)) best = {y: +y.toFixed(2), m};
      } }
      row.push(best ? best.m[0] + best.y : "--");
    }
    console.log("x", x, row.join(" "));
  }
}
