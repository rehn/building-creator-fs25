// A building from an OSM footprint: the shape (main part + wings), where it stands, and what the tags say.
import { test } from "node:test";
import assert from "node:assert/strict";
import { osmToHouse } from "../src/editor/osm.mjs";
import { sanitize, KIND } from "../src/editor/model.mjs";
import { wingsOf } from "../src/editor/layout.mjs";

const move = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);
const turn = (pts, deg) => { const c = Math.cos(deg * Math.PI / 180), s = Math.sin(deg * Math.PI / 180); return pts.map(([x, y]) => [x * c - y * s, x * s + y * c]); };
const inside = (pt, poly) => {
  let r = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) r = !r;
  }
  return r;
};

const RECT = [[0, 0], [10, 0], [10, 7], [0, 7]];
const L = [[0, 0], [12, 0], [12, 6], [6, 6], [6, 14], [0, 14]];
const T = [[0, 8], [4.5, 8], [4.5, 0], [9.5, 0], [9.5, 8], [14, 8], [14, 13], [0, 13]];
const U = [[0, 0], [16, 0], [16, 14], [11, 14], [11, 6], [5, 6], [5, 14], [0, 14]];

/** The built house (main part and the wings that fit) as rectangles in the map's plane, from the answer's settings and placement. */
function built(res) {
  const p = sanitize(res.settings), { x, y, angle } = res.placement, a = angle * Math.PI / 180;
  const rects = [{ x0: -p.width / 2, x1: p.width / 2, z0: -p.depth / 2, z1: p.depth / 2 }];
  const wings = wingsOf(p);
  for (const w of wings) assert.ok(!w.off, "a wing was left out: " + w.off);
  for (const w of wings) rects.push(w.rect);
  // house (x, z) -> plane: north is -z
  const toMap = (hx, hz) => { const lx = hx, ly = -hz; return [x + lx * Math.cos(a) - ly * Math.sin(a), y + lx * Math.sin(a) + ly * Math.cos(a)]; };
  return rects.map(r => [toMap(r.x0, r.z0), toMap(r.x1, r.z0), toMap(r.x1, r.z1), toMap(r.x0, r.z1)]);
}
/** How much of the footprint is built over and how much of what is built stands outside it (both 0..1). */
function overlap(res, footprint) {
  const polys = built(res), xs = footprint.map(p => p[0]), ys = footprint.map(p => p[1]);
  const pad = 8, x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
  let fp = 0, hit = 0, bl = 0, outside = 0;
  for (let x = x0; x < x1; x += 0.25) for (let y = y0; y < y1; y += 0.25) {
    const f = inside([x, y], footprint), b = polys.some(q => inside([x, y], q));
    if (f) fp++; if (b) bl++; if (f && b) hit++; if (b && !f) outside++;
  }
  return { covered: hit / fp, outside: outside / bl };
}

test("a plain rectangle is one part of its own size, the long side being the width", () => {
  for (const [name, pts] of [["flat on", RECT], ["turned 90", turn(RECT, 90)], ["turned 30 and far away", move(turn(RECT, 30), 5000, -3000)]]) {
    const r = osmToHouse({ footprint: pts, tags: {} });
    assert.ok(r.ok, name);
    assert.ok(Math.abs(r.settings.width - 10) < 0.15 && Math.abs(r.settings.depth - 7) < 0.15, `${name}: ${r.settings.width} x ${r.settings.depth}`);
    assert.ok(!(r.settings.wings || []).length, `${name}: no wings`);
    const o = overlap(r, pts);
    assert.ok(o.covered > 0.97 && o.outside < 0.03, `${name}: ${JSON.stringify(o)}`);
  }
});

test("L, T and U shapes become a main part with wings that cover the footprint", () => {
  for (const [name, pts, wings] of [["L", L, 1], ["T", T, 1], ["U", U, 2]]) {
    for (const [how, f] of [["", pts], [" turned 30", move(turn(pts, 30), 120, -80)], [" turned 200 and mirrored", turn(pts.map(([x, y]) => [-x, y]), 200)]]) {
      const r = osmToHouse({ footprint: f, tags: {} });
      assert.ok(r.ok, name + how);
      assert.ok(r.settings.wings.length >= wings, `${name}${how}: ${r.settings.wings.length} wings`);
      const o = overlap(r, f);
      assert.ok(o.covered > 0.9 && o.outside < 0.1, `${name}${how}: ${JSON.stringify(o)}`);
    }
  }
});

test("the same footprint gives the same answer, clockwise or with the first point repeated", () => {
  const a = osmToHouse({ footprint: L, tags: {} }), b = osmToHouse({ footprint: [...L].reverse().concat([L[5]]), tags: {} });
  assert.deepEqual(a.settings, b.settings);
  assert.deepEqual(osmToHouse({ footprint: L, tags: {} }), a);
});

test("what cannot be a building is refused with a reason", () => {
  assert.equal(osmToHouse({ footprint: [[0, 0], [1, 0]], tags: {} }).ok, false);
  assert.equal(osmToHouse({ footprint: [[0, 0], [1.5, 0], [1.5, 1.5], [0, 1.5]], tags: {} }).ok, false);
  assert.equal(osmToHouse({ footprint: [[0, 0], [10, 0], [20, 0]], tags: {} }).ok, false);
  assert.ok(osmToHouse({ footprint: [[0, 0], [1, 0]], tags: {} }).error);
  assert.equal(osmToHouse({ footprint: null, tags: {} }).ok, false);
});

test("a part too narrow to be a wing is left out, and the notes say how much of the footprint that is", () => {
  const thin = [[0, 0], [12, 0], [12, 6], [1.5, 6], [1.5, 14], [0, 14]]; // an arm only 1.5 m wide
  const r = osmToHouse({ footprint: thin, tags: {} });
  assert.ok(r.ok);
  assert.ok(r.notes.some(n => /not covered|left out/i.test(n)), r.notes.join(" | "));
  // a bump of a few percent is not worth a note
  const bump = osmToHouse({ footprint: [[0, 0], [12, 0], [12, 6], [6.5, 6], [6.5, 6.4], [6, 6.4], [6, 6], [0, 6]], tags: {} });
  assert.ok(!bump.notes.some(n => /not covered|left out/i.test(n)), bump.notes.join(" | "));
});

test("the kind comes from the building tag", () => {
  const k = b => osmToHouse({ footprint: RECT, tags: { building: b } }).kind;
  for (const b of ["house", "detached", "residential", "yes", "apartments"]) assert.equal(k(b), "house", b);
  for (const b of ["garage", "garages", "carport", "shed", "barn", "farm_auxiliary", "warehouse"]) assert.equal(k(b), "shed", b);
  assert.equal(osmToHouse({ footprint: RECT, tags: {} }).kind, "house");
  for (const b of ["garage", "barn"]) { const r = osmToHouse({ footprint: L, tags: { building: b } }); assert.ok(KIND[r.kind]); sanitize(r.settings); assert.ok(!(r.settings.wings || []).length, "no wings on a " + b); }
});

test("floors, roof and looks come from the tags", () => {
  const r = osmToHouse({ footprint: RECT, tags: { "building:levels": "3", "roof:shape": "hipped", "building:colour": "#aabbcc", "roof:colour": "red", "roof:material": "roof_tiles", "building:material": "wood", "roof:angle": "25" } });
  assert.equal(r.settings.floors, 3);
  assert.equal(r.settings.roofType, "hip");
  assert.equal(r.settings.wallColor, "#AABBCC");
  assert.match(r.settings.roofColor, /^#[0-9A-F]{6}$/);
  assert.equal(r.settings.roofMaterial, "tiles");
  assert.equal(r.settings.wallCladding, "lockpanel");
  assert.equal(r.settings.roofPitch, 25);
  assert.equal(osmToHouse({ footprint: RECT, tags: { "roof:shape": "flat" } }).settings.roofType, "flat");
  assert.equal(osmToHouse({ footprint: RECT, tags: { "roof:shape": "gabled" } }).settings.roofType, "gable");
  assert.equal(osmToHouse({ footprint: RECT, tags: { "roof:material": "metal_sheet" } }).settings.roofMaterial, "seamed");
  assert.equal(osmToHouse({ footprint: RECT, tags: { "building:material": "brick" } }).settings.wallCladding, "plaster");
});

test("too many floors, a pitch out of range and roofs the app lacks are fitted and said", () => {
  const r = osmToHouse({ footprint: RECT, tags: { "building:levels": "6", "roof:shape": "gambrel", "roof:angle": "80" } });
  assert.equal(r.settings.floors, 3);
  assert.equal(r.settings.roofType, "gable");
  assert.ok(r.settings.roofPitch <= 60);
  assert.ok(r.notes.some(n => /6 floors/.test(n)) && r.notes.some(n => /gambrel/.test(n)), r.notes.join(" | "));
});

test("without tags the floors are a guess that is said, and height is used when there are no levels", () => {
  const guess = osmToHouse({ footprint: RECT, tags: {} });
  assert.ok(guess.settings.floors >= 1 && guess.settings.floors <= 3);
  assert.ok(guess.notes.some(n => /floors/i.test(n)));
  assert.equal(osmToHouse({ footprint: RECT, tags: { height: "9" } }).settings.floors, 3);
  assert.equal(osmToHouse({ footprint: RECT, tags: { height: "4" } }).settings.floors, 1);
});

test("a hip roof on a shape with wings becomes a gable roof, and it is said", () => {
  const r = osmToHouse({ footprint: L, tags: { "roof:shape": "hipped" } });
  assert.equal(r.settings.roofType, "gable");
  assert.ok(r.notes.some(n => /hip/i.test(n)));
});

test("the name comes from the tags, else from the OSM id or the address", () => {
  assert.equal(osmToHouse({ footprint: RECT, tags: { name: "Kvarnen" } }).name, "Kvarnen");
  assert.equal(osmToHouse({ footprint: RECT, tags: { "addr:street": "Storgatan", "addr:housenumber": "4" } }).name, "Storgatan 4");
  assert.equal(osmToHouse({ footprint: RECT, tags: {}, id: "way/123" }).name, "OSM way/123");
  assert.equal(osmToHouse({ footprint: RECT, tags: {} }).name, "OSM building");
});

test("what the app makes of the answer builds: sizes, wings and the kind pass sanitize unchanged", () => {
  for (const f of [RECT, L, T, U]) {
    const r = osmToHouse({ footprint: f, tags: { building: "house" } }), p = sanitize(r.settings);
    assert.equal(p.kind, "house");
    assert.ok(Math.abs(p.width - r.settings.width) < 1e-9 && Math.abs(p.depth - r.settings.depth) < 1e-9);
    assert.equal(p.wings.length, (r.settings.wings || []).length);
  }
});
