// A building from an OpenStreetMap footprint (PLAN_OSM.md, step 1). Pure: no DOM, no model.mjs, so the web server can use it too.
//
// osmToHouse({footprint, tags, id}, opts) -> {ok: true, kind, name, settings, placement, notes} | {ok: false, code, error}
//   footprint  the outline [[x, y], ...] in metres in the map's own plane (x east, y north)
//   tags       the OSM tags of the way (building, building:levels, roof:shape ...)
//   settings   what sanitize() takes: size, floors, roof, colours and (houses) the wings, as the building's own settings
//   placement  where it stands: {x, y} = the middle of the main part, angle = degrees counter-clockwise from east of the house's
//              width axis (its x axis; its front wall faces -angle - 90, i.e. south at angle 0), width, depth of the main part
//   notes      what was guessed, fitted or left out, for the person who looks at the result
//
// The shape: the edges' main direction decides which way the house faces; the footprint is laid on a grid; the main part is the largest
// rectangle in it and each wing the largest rectangle in the strip outside one of its sides (the arms of an L, T or U). What is left over is
// said in the notes.

const CELL = 0.25;         // grid cell, m
const SNAP = 0.3;          // an edge this close to a corner of the footprint is moved to it
const MAX_WIDTH = 60, MAX_DEPTH = 50;   // the largest main part (the settings' own maximum)
const MIN_SIDE = 2.5;      // the smallest main part (the settings' own minimum)
const MIN_WING_W = 2, MIN_WING_D = 1.5, MIN_WING_AREA = 8;
const SAY_UNCOVERED = 0.05; // the notes mention what is left of the footprint above this share

const round = (v, step) => Math.round(v / step) * step;
const clean = v => +v.toFixed(3);
const num = v => { const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : NaN; };

// ---- the kind ----
const SHED_BUILDINGS = new Set(["garage", "garages", "carport", "shed", "barn", "farm_auxiliary", "warehouse", "service", "hut", "storage", "outbuilding", "cowshed", "stable", "sty", "greenhouse", "industrial", "roof", "hangar", "agricultural", "silo"]);
const kindOf = building => SHED_BUILDINGS.has(String(building || "").toLowerCase()) ? "shed" : "house";

// ---- looks ----
const NAMED = { white: "#F2EFE8", red: "#8E2A1E", yellow: "#D9B44A", brown: "#6B4A32", grey: "#8A8D8F", gray: "#8A8D8F", black: "#2B2D2F", green: "#4F6B45", blue: "#3F5F82", beige: "#D8C7A3", orange: "#C46A2D", cream: "#EADFC0" };
function color(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (/^#?[0-9a-f]{6}$/.test(s)) return "#" + s.replace("#", "").toUpperCase();
  if (/^#[0-9a-f]{3}$/.test(s)) return "#" + [...s.slice(1)].map(c => c + c).join("").toUpperCase();
  return NAMED[s] || null;
}
const ROOF_SHAPES = { gabled: "gable", gable: "gable", hipped: "hip", hip: "hip", "half-hipped": "hip", pyramidal: "hip", flat: "flat" };
const ROOF_MATERIALS = { tiles: "tiles", roof_tiles: "tiles", concrete: "tiles", clay: "tiles", metal: "seamed", metal_sheet: "seamed", copper: "seamed", zinc: "seamed", steel: "seamed", tin: "seamed", corrugated_iron: "corrugated", corrugated: "corrugated" };
const WALL_MATERIALS = { wood: "lockpanel", timber: "lockpanel", wood_frame: "lockpanel", brick: "plaster", stone: "plaster", concrete: "plaster", plaster: "plaster", stucco: "plaster", cement_block: "plaster", metal: "corrugated", steel: "corrugated" };

// ---- geometry ----
/** The outline as a list of distinct points (the closing point and repeats dropped), or null if it isn't one. */
function ring(footprint) {
  if (!Array.isArray(footprint)) return null;
  const pts = [];
  for (const p of footprint) {
    if (!Array.isArray(p) || !Number.isFinite(+p[0]) || !Number.isFinite(+p[1])) return null;
    const q = [+p[0], +p[1]], last = pts[pts.length - 1];
    if (!last || last[0] !== q[0] || last[1] !== q[1]) pts.push(q);
  }
  if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  return pts.length >= 3 ? pts : null;
}
const area = pts => Math.abs(pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const turn = (x, y, deg) => { const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [x * c - y * s, x * s + y * c]; };

/** The main direction of the edges, in degrees (-45, 45]: edges weighted by length, 90 degrees apart counting as the same. */
function mainDirection(pts) {
  let sx = 0, sy = 0;
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length], len = Math.hypot(q[0] - p[0], q[1] - p[1]), a = Math.atan2(q[1] - p[1], q[0] - p[0]);
    sx += len * Math.cos(4 * a); sy += len * Math.sin(4 * a);
  });
  return Math.hypot(sx, sy) < 1e-9 ? 0 : round(Math.atan2(sy, sx) / 4 * 180 / Math.PI, 0.01);
}

/** Calls cb(start, count, height) for each maximal rectangle under the bars of a histogram. */
function eachMaximal(h, cb) {
  const st = [];
  for (let i = 0; i <= h.length; i++) {
    const cur = i === h.length ? 0 : h[i];
    let start = i;
    while (st.length && st[st.length - 1].h >= cur) { const t = st.pop(); if (t.h > 0) cb(t.start, i - t.start, t.h); start = t.start; }
    st.push({ h: cur, start });
  }
}

/** The footprint laid on a grid in the plane turned by -theta around its middle: cells whose middle is inside it. */
function rasterize(pts, theta) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const c = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  const q = pts.map(p => turn(p[0] - c[0], p[1] - c[1], -theta));
  const qa = q.map(p => p[0]), qb = q.map(p => p[1]);
  const minA = Math.min(...qa), minB = Math.min(...qb), w = Math.max(...qa) - minA, d = Math.max(...qb) - minB;
  const cell = Math.max(CELL, Math.max(w, d) / 400), nx = Math.max(1, Math.ceil(w / cell)), ny = Math.max(1, Math.ceil(d / cell));
  const inside = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    const y = minB + (j + 0.5) * cell, cross = [];
    for (let k = 0; k < q.length; k++) {
      const [x0, y0] = q[k], [x1, y1] = q[(k + 1) % q.length];
      if ((y0 > y) !== (y1 > y)) cross.push(x0 + (y - y0) / (y1 - y0) * (x1 - x0));
    }
    cross.sort((a, b) => a - b);
    for (let k = 0; k + 1 < cross.length; k += 2) {
      for (let i = Math.max(0, Math.ceil((cross[k] - minA) / cell - 0.5)); i < nx && minA + (i + 0.5) * cell < cross[k + 1]; i++) inside[j * nx + i] = 1;
    }
  }
  return { c, q, minA, minB, cell, nx, ny, inside, va: [...new Set(qa.map(v => clean(v)))], vb: [...new Set(qb.map(v => clean(v)))] };
}

/** The largest rectangle of cells (i0..i1, j0..j1, half open) in the grid. */
function largestRect(g) {
  const h = new Array(g.nx).fill(0);
  let best = null;
  for (let j = 0; j < g.ny; j++) {
    for (let i = 0; i < g.nx; i++) h[i] = g.inside[j * g.nx + i] ? h[i] + 1 : 0;
    eachMaximal(h, (start, count, height) => {
      const a = count * height;
      if (!best || a > best.area) best = { i0: start, i1: start + count, j0: j + 1 - height, j1: j + 1, area: a };
    });
  }
  return best;
}
const snapTo = (v, list) => { let b = v, d = SNAP; for (const x of list) if (Math.abs(x - v) < d) { d = Math.abs(x - v); b = x; } return b; };

/**
 * The main part and the wings of the footprint in the plane turned by theta. Wings only on the main part's four sides; one is the
 * largest rectangle in the strip outside a side that is wide, deep and big enough.
 */
function shape(pts, theta, maxWings) {
  const g = rasterize(pts, theta), m = largestRect(g);
  if (!m) return null;
  const at = (i, j) => i >= 0 && j >= 0 && i < g.nx && j < g.ny && g.inside[j * g.nx + i] && !used[j * g.nx + i];
  const used = new Uint8Array(g.nx * g.ny);
  for (let j = m.j0; j < m.j1; j++) for (let i = m.i0; i < m.i1; i++) used[j * g.nx + i] = 1;
  const A = i => g.minA + i * g.cell, B = j => g.minB + j * g.cell;
  const main = { a0: snapTo(A(m.i0), g.va), a1: snapTo(A(m.i1), g.va), b0: snapTo(B(m.j0), g.vb), b1: snapTo(B(m.j1), g.vb) };
  const wings = [];
  // for each side: how far the footprint reaches out of each cell row/column along it, and how to turn a found rectangle into cells
  const sides = {
    right: { n: m.j1 - m.j0, ext: k => { let e = 0; while (at(m.i1 + e, m.j0 + k)) e++; return e; }, cells: (s, c, h) => [m.i1, m.i1 + h, m.j0 + s, m.j0 + s + c] },
    left: { n: m.j1 - m.j0, ext: k => { let e = 0; while (at(m.i0 - 1 - e, m.j0 + k)) e++; return e; }, cells: (s, c, h) => [m.i0 - h, m.i0, m.j0 + s, m.j0 + s + c] },
    top: { n: m.i1 - m.i0, ext: k => { let e = 0; while (at(m.i0 + k, m.j1 + e)) e++; return e; }, cells: (s, c, h) => [m.i0 + s, m.i0 + s + c, m.j1, m.j1 + h] },
    bottom: { n: m.i1 - m.i0, ext: k => { let e = 0; while (at(m.i0 + k, m.j0 - 1 - e)) e++; return e; }, cells: (s, c, h) => [m.i0 + s, m.i0 + s + c, m.j0 - h, m.j0] },
  };
  while (wings.length < maxWings) {
    let best = null;
    for (const side of ["right", "left", "top", "bottom"]) {
      const S = sides[side], e = Array.from({ length: S.n }, (_, k) => S.ext(k));
      eachMaximal(e, (start, count, height) => {
        const along = count * g.cell, out = height * g.cell, a = along * out;
        if (along < MIN_WING_W || out < MIN_WING_D || a < MIN_WING_AREA) return;
        if (!best || a > best.a) best = { side, start, count, height, a };
      });
    }
    if (!best) break;
    const [i0, i1, j0, j1] = sides[best.side].cells(best.start, best.count, best.height);
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) used[j * g.nx + i] = 1;
    // continuous: along the side between corners of the footprint, out to the far edge
    const horiz = best.side === "top" || best.side === "bottom";
    const lo = horiz ? snapTo(A(i0), g.va) : snapTo(B(j0), g.vb), hi = horiz ? snapTo(A(i1), g.va) : snapTo(B(j1), g.vb);
    const sideLo = horiz ? main.a0 : main.b0, sideHi = horiz ? main.a1 : main.b1;
    const l = Math.max(sideLo, lo), r = Math.min(sideHi, hi);
    const far = best.side === "right" ? snapTo(A(i1), g.va) : best.side === "left" ? snapTo(A(i0), g.va) : best.side === "top" ? snapTo(B(j1), g.vb) : snapTo(B(j0), g.vb);
    const edge = { right: main.a1, left: main.a0, top: main.b1, bottom: main.b0 }[best.side];
    wings.push({ side: best.side, l, r, depth: Math.abs(far - edge) });
  }
  const total = g.inside.reduce((a, b) => a + b, 0), left = g.inside.reduce((a, v, k) => a + (v && !used[k] ? 1 : 0), 0);
  return { g, main, wings, uncovered: total ? left / total : 0 };
}

// ---- the answer ----
function fail(code, error) { return { ok: false, code, error }; }

export function osmToHouse({ footprint, tags = {}, id } = {}, opts = {}) {
  const pts = ring(footprint), t = tags && typeof tags === "object" ? tags : {}, notes = [];
  if (!pts) return fail("invalid_footprint", "The footprint needs at least three points with numbers for x and y.");
  if (area(pts) < 6) return fail("too_small", "The footprint is too small to be a building (under 6 m2).");
  const kind = kindOf(t.building), maxWings = kind === "house" ? Math.max(0, opts.maxWings ?? 4) : 0;

  let theta = mainDirection(pts), s = shape(pts, theta, maxWings);
  if (s && s.main.a1 - s.main.a0 < s.main.b1 - s.main.b0) {
    // the long side is the front: look at it from the other quarter turn
    theta = round(theta + 90 > 180 ? theta - 90 : theta + 90, 0.01);
    s = shape(pts, theta, maxWings);
  }
  if (!s) return fail("degenerate", "No building shape could be found in the footprint.");
  const { g, main } = s, W = round(main.a1 - main.a0, 0.1), D = round(main.b1 - main.b0, 0.1);
  if (W < MIN_SIDE || D < MIN_SIDE) return fail("too_small", `The building is too small (${W.toFixed(1)} x ${D.toFixed(1)} m).`);
  if (W > MAX_WIDTH || D > MAX_DEPTH) return fail("too_large", `The building is too large (${W.toFixed(1)} x ${D.toFixed(1)} m): the app's main part is at most ${MAX_WIDTH} x ${MAX_DEPTH} m.`);
  const ca = (main.a0 + main.a1) / 2, cb = (main.b0 + main.b1) / 2;

  // ---- settings from the tags ----
  const settings = { kind, width: clean(W), depth: clean(D), ridge: "width" };
  let roofType = ROOF_SHAPES[String(t["roof:shape"] || "").toLowerCase()];
  const shape0 = String(t["roof:shape"] || "").toLowerCase();
  if (shape0 && !roofType) { roofType = "gable"; notes.push(`The roof shape "${shape0}" isn't available: a gable roof is used.`); }
  if (roofType === "hip" && s.wings.length) { roofType = "gable"; notes.push("A hipped roof can't take wings on its short sides: a gable roof is used."); }
  if (roofType) settings.roofType = roofType;

  let levels = num(t["building:levels"]);
  if (!(levels >= 1)) {
    const h = num(t.height);
    if (h > 0) levels = Math.max(1, Math.round(h / 3));
    else if (kind === "house") { levels = area(pts) < 60 ? 1 : 2; notes.push(`No building:levels or height: ${levels} floor${levels > 1 ? "s" : ""} guessed from the size.`); }
    else levels = 1;
  }
  levels = Math.round(levels);
  if (levels > 3) { notes.push(`${levels} floors in the tags, the app has at most 3.`); levels = 3; }
  settings.floors = levels;
  if (kind === "house" && num(t["roof:levels"]) >= 1 && roofType !== "flat") settings.halfStorey = true;

  const angle = num(t["roof:angle"]), rh = num(t["roof:height"]);
  if (angle > 0) { settings.roofPitch = Math.min(60, Math.max(5, Math.round(angle))); if (settings.roofPitch !== Math.round(angle)) notes.push(`Roof angle ${angle}° fitted to ${settings.roofPitch}°.`); }
  else if (rh > 0 && roofType !== "flat") settings.roofPitch = Math.min(55, Math.max(10, Math.round(Math.atan(2 * rh / D) * 180 / Math.PI)));

  const wall = color(t["building:colour"] || t.colour), roof = color(t["roof:colour"]);
  if (wall) settings.wallColor = wall;
  if (roof) settings.roofColor = roof;
  const rm = ROOF_MATERIALS[String(t["roof:material"] || "").toLowerCase()], wm = WALL_MATERIALS[String(t["building:material"] || "").toLowerCase()];
  if (rm) settings.roofMaterial = rm;
  if (wm) settings.wallCladding = wm;

  // ---- wings, as the house's walls name them ----
  if (s.wings.length) {
    settings.wings = s.wings.map(w => {
      const c = (w.l + w.r) / 2, width = round(w.r - w.l, 0.1);
      // the position is the middle's share of the wall's length, counted from the wall's left end seen from outside
      const pos = { right: (c - main.b0) / (main.b1 - main.b0), left: (main.b1 - c) / (main.b1 - main.b0), top: (main.a1 - c) / (main.a1 - main.a0), bottom: (c - main.a0) / (main.a1 - main.a0) }[w.side];
      const wing = { wall: { right: "right", left: "left", top: "back", bottom: "front" }[w.side], pos: clean(Math.min(1, Math.max(0, pos))), width: clean(width), depth: clean(round(w.depth, 0.1)) };
      if (width * w.depth < 15 && levels > 1) wing.floors = 1;
      return wing;
    });
  }
  if (s.uncovered > SAY_UNCOVERED) notes.push(`${Math.round(s.uncovered * 100)}% of the footprint is not covered: ${maxWings ? "parts too narrow or too small to be wings are left out" : "this kind of building is made as one rectangle"}.`);

  const [dx, dy] = turn(ca, cb, theta);
  // the whole building as rectangles in the map's plane, all turned by `angle` (width along the building's x): the main part, then each wing
  const rectOf = (a0, a1, b0, b1, part) => { const [ex, ey] = turn((a0 + a1) / 2, (b0 + b1) / 2, theta); return { part, x: clean(g.c[0] + ex), y: clean(g.c[1] + ey), width: clean(round(a1 - a0, 0.01)), depth: clean(round(b1 - b0, 0.01)) }; };
  const parts = [rectOf(main.a0, main.a1, main.b0, main.b1, "main"), ...s.wings.map(w => ({
    right: () => rectOf(main.a1, main.a1 + w.depth, w.l, w.r, "wing"), left: () => rectOf(main.a0 - w.depth, main.a0, w.l, w.r, "wing"),
    top: () => rectOf(w.l, w.r, main.b1, main.b1 + w.depth, "wing"), bottom: () => rectOf(w.l, w.r, main.b0 - w.depth, main.b0, "wing"),
  }[w.side]()))];
  const name = String(t.name || "").trim() || (t["addr:street"] && t["addr:housenumber"] ? `${t["addr:street"]} ${t["addr:housenumber"]}` : id ? `OSM ${id}` : "OSM building");
  return { ok: true, kind, name, settings, placement: { x: clean(g.c[0] + dx), y: clean(g.c[1] + dy), angle: clean(theta), width: clean(W), depth: clean(D) }, footprint: { angle: clean(theta), parts }, notes };
}
