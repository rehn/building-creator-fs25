import { test } from "node:test";
import assert from "node:assert/strict";
import { KINDS } from "../src/editor/kinds/index.mjs";

const H = 2.6; // wall height handed to build(): hanging things (wires, hoses) may go up to it
const UP = [0, 1, 0];
const sub = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };

/** A kit like the core's (model.mjs buildInside) that records every point a piece draws, and how many parts. */
function recorder() {
  const pts = [];
  let parts = 0, colors = new Set();
  const put = (...ps) => { parts++; pts.push(...ps); };
  const frame = (a, b) => {
    const d = norm(sub(b, a));
    let side = cross(d, UP);
    side = Math.hypot(...side) < 1e-6 ? [1, 0, 0] : norm(side);
    return [side, norm(cross(side, d))];
  };
  const kit = {
    H, paint: c => colors.add(c),
    box: (x0, x1, z0, z1, y0, y1) => put([x0, y0, z0], [x1, y1, z1]),
    cyl: (x, z, y, r, h) => put([x - r, y, z - r], [x + r, y + h, z + r]),
    cone: (x, z, y, r0, r1, h) => { const r = Math.max(r0, r1); put([x - r, y, z - r], [x + r, y + h, z + r]); },
    rod: (a, b, r) => { const [s, u] = frame(a, b); put(...[a, b].flatMap(q => [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([i, j]) => q.map((v, k) => v + r * (i * s[k] + j * u[k]))))); },
    pipe: (ps, r) => { for (let k = 0; k + 1 < ps.length; k++) kit.rod(ps[k], ps[k + 1], r); },
    board: (a, b, w, h) => { const [s, u] = frame(a, b); put(...[a, b].flatMap(q => [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([i, j]) => q.map((v, k) => v + i * w / 2 * s[k] + j * h / 2 * u[k])))); },
  };
  return {kit, pts, count: () => parts, colors: () => colors.size};
}

/** Each piece at its defaults, and with every setting at its smallest and its largest. */
function variants(def) {
  const out = [{...def.defaults}];
  for (const f of def.params) for (const v of [f.min, f.max]) out.push({...def.defaults, [f.k]: v});
  out.push(Object.fromEntries(def.params.map(f => [f.k, f.max])));
  return out.map(v => ({id: 1, type: "x", x: 0, z: 0, rot: 0, ...v}));
}

for (const kind of KINDS.filter(k => k.catalog)) for (const [type, def] of Object.entries(kind.catalog)) {
  test(`${kind.id}.${type}: everything it draws stays in its footprint and height`, () => {
    for (const it of variants(def)) {
      const r = recorder();
      def.build(r.kit, it);
      const [w, d] = def.size(it), h = def.height(it), e = 0.005;
      for (const [x, y, z] of r.pts) {
        assert.ok(Math.abs(x) <= w / 2 + e && Math.abs(z) <= d / 2 + e, `${JSON.stringify(it)}: (${x.toFixed(3)}, ${z.toFixed(3)}) outside ${w} x ${d}`);
        assert.ok(y >= -e && y <= Math.max(h, H) + e, `${JSON.stringify(it)}: height ${y.toFixed(3)}`);
      }
    }
  });
  test(`${kind.id}.${type}: is drawn in some detail`, () => {
    const r = recorder();
    def.build(r.kit, variants(def)[0]);
    assert.ok(r.count() >= 12, `only ${r.count()} parts`);
    assert.ok(r.colors() >= 2, `only ${r.colors()} colour`);
  });
}

/* ---------- Groups and thumbnails ---------- */
import { pieceGroups } from "../src/editor/layout.mjs";
import { sanitize, pieceSheet, pieceMeshes, catalogFor as catalogOf } from "../src/editor/model.mjs";
const KINDS_TO_CHECK = [["house", {}], ["cow", {kind: "cow"}], ["chicken", {kind: "chicken"}], ["sheep", {kind: "sheep"}]];
for (const [name, s] of KINDS_TO_CHECK) {
  test(`${name}: every piece is in a group, groups hold every piece once, in a sensible order`, () => {
    const cat = catalogOf(sanitize(s)), groups = pieceGroups(cat), all = groups.flatMap(g => g.types);
    assert.deepEqual([...all].sort(), Object.keys(cat).sort());
    assert.equal(new Set(all).size, all.length);
    assert.ok(groups.every(g => g.name !== "Other"), "no piece without a group: " + groups.map(g => g.name + ":" + g.types).join(" | "));
    assert.equal(groups[0].name, "Walls and doors", "the inner wall first");
    assert.ok(groups.length >= 3 && groups.every(g => g.types.length >= 1));
  });
  test(`${name}: a sheet of one of each piece gives a mesh for every piece, centred on its own spot`, () => {
    const sheet = pieceSheet(s), cat = catalogOf(sheet.p);
    assert.equal(sheet.spots.length, Object.keys(cat).length);
    for (const spot of sheet.spots) {
      const meshes = pieceMeshes(sheet, spot.id);
      assert.ok(meshes.length > 0, spot.type + " drew something");
      const xs = meshes.flatMap(({g}) => g.p.filter((_, i) => i % 3 === 0)), zs = meshes.flatMap(({g}) => g.p.filter((_, i) => i % 3 === 2));
      assert.ok(Math.min(...xs) > -4 && Math.max(...xs) < 4 && Math.min(...zs) > -4 && Math.max(...zs) < 4, `${spot.type} stays near its own spot`);
      assert.ok(meshes.every(({g}) => g.i.length > 0 && g.p.length === g.n.length), spot.type);
    }
    assert.equal(sheet.geo.itemParts[sheet.spots[0].id] !== undefined, true);
  });
}

test("no piece setting is called type, id, x, z or rot (it would overwrite the piece's own fields)", () => {
  for (const kind of KINDS.filter(k => k.catalog)) for (const [name, def] of Object.entries(kind.catalog)) for (const f of def.params || [])
    assert.ok(!["type", "id", "x", "z", "rot"].includes(f.k), `${kind.id}.${name}.${f.k}`);
});
