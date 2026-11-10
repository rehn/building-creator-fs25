// The look of windows and doors: a library of styles, drawn in a wall's coordinates (s along the
// wall, t up from the floor, d out of the wall, d = 0 its outside face). Pure, no DOM; the core
// (model.mjs) hands in a kit:
//   kit.box(mat, s0, s1, t0, t1, d0, d1)   a box
//   kit.slab(mat, [[s, t] ...], d0, d1)    a convex shape in the wall's plane, d0..d1 thick
// mat: "door" (door colour), "trim" (trim colour), "glass", "iron" (dark ironwork: hinges, handles, rails), "gutter" (the gutters' zinc: the low steel gate).
// Faces that would lie in one plane and overlap are kept a few mm apart: they flicker in the game.

export const WINDOW_STYLES = [
  {id: "casement", name: "Two panes (casement)"},
  {id: "sprojs", name: "Small panes (spröjs)"},
  {id: "stall", name: "Stable window (stallfönster)"},
  {id: "single", name: "One pane"},
  {id: "hatch", name: "Boarded hatch (lucka)"},
];
export const DOOR_STYLES = [
  {id: "plain", name: "Plain"},
  {id: "plank", name: "Boards"},
  {id: "zbrace", name: "Boards with a Z brace"},
  {id: "xbrace", name: "Barn door with an X brace"},
  {id: "panel", name: "Panelled, glass at the top"},
  {id: "sliding", name: "Sliding barn door"},
  {id: "sheetslide", name: "Sliding sheet-metal door (two halves)"},
  {id: "sheetpass", name: "Sliding sheet-metal door, two tracks (the halves pass each other)"},
  {id: "gate", name: "Fence gate (stängselgrind)"},
  {id: "lowgate", name: "Low steel gate (grind, as high as a fence)"},
  {id: "hole", name: "Open doorway, framed (no door)"},
];
/** Doors for the rooms of a house (inner walls): lighter and finer than the outer doors; not offered as the building's door style. */
// (the glazed door of the rooms is drawn with a hole for its glass, like the panelled outer door)
export const INNER_DOOR_STYLES = [
  {id: "flush", name: "Smooth (slät dörr)"},
  {id: "mirror", name: "Mirror door (spegeldörr)"},
  {id: "fourpanel", name: "Four panels (fyllningsdörr)"},
  {id: "glazed", name: "Glazed above, panel below (glasad dörr)"},
];
export const WINDOW_STYLE_IDS = WINDOW_STYLES.map(s => s.id);
export const DOOR_STYLE_IDS = DOOR_STYLES.map(s => s.id);

/** Doors wider than this are a pair of doors (two leaves). */
export const DOUBLE_DOOR_FROM = 1.4;
export const isPair = width => width > DOUBLE_DOOR_FROM;

/** The style an opening ({type, style}) is drawn in: its own, or the building's for its type. */
export const styleOf = (p, o) => o.style && o.style !== "default" ? o.style : o.type === "door" ? p.doorStyle : p.winStyle;

/* ---------- Windows ---------- */
/**
 * The sash of a window in opening o {s0, s1, t0, t1}: its bars, at the back of the reveal (r deep);
 * k scales the bars for small windows. Returns {glass}: whether the opening is glazed.
 * Vertical bars, cross bars and the sash's border each have their own depth, so where they cross
 * no two faces share a plane.
 */
export function drawSash(kit, style, o, {k = 1, r = 0.15} = {}) {
  const w = o.s1 - o.s0, h = o.t1 - o.t0, D = -r;
  const vbar = (s, bw) => kit.box("trim", s - bw, s + bw, o.t0, o.t1, D, D + 0.04);
  const hbar = (t, bw) => kit.box("trim", o.s0, o.s1, t - bw, t + bw, D + 0.004, D + 0.035);
  const border = bw => {
    kit.box("trim", o.s0, o.s0 + bw, o.t0, o.t1, D + 0.002, D + 0.045); kit.box("trim", o.s1 - bw, o.s1, o.t0, o.t1, D + 0.002, D + 0.045);
    kit.box("trim", o.s0 + bw, o.s1 - bw, o.t0, o.t0 + bw, D + 0.002, D + 0.045); kit.box("trim", o.s0 + bw, o.s1 - bw, o.t1 - bw, o.t1, D + 0.002, D + 0.045);
  };
  const grid = (cols, rows, bw) => {
    for (let i = 1; i < cols; i++) vbar(o.s0 + w * i / cols, bw);
    for (let j = 1; j < rows; j++) hbar(o.t0 + h * j / rows, bw);
  };
  if (style === "sprojs") {
    // Small panes of about 30 cm, slim bars, the middle one a little heavier.
    const cols = Math.max(2, Math.round(w / 0.3)), rows = Math.max(2, Math.round(h / 0.32));
    grid(cols, rows, 0.016 * k);
    if (cols % 2 === 0) vbar(o.s0 + w / 2, 0.026 * k);
    return {glass: true};
  }
  if (style === "stall") {
    // A stable window: a heavy sash round small panes in two or three rows.
    const bw = 0.045 * k, cols = Math.max(2, Math.round(w / 0.22)), rows = h > 0.75 ? 3 : 2;
    border(bw);
    for (let i = 1; i < cols; i++) kit.box("trim", o.s0 + w * i / cols - 0.014 * k, o.s0 + w * i / cols + 0.014 * k, o.t0 + bw, o.t1 - bw, D, D + 0.04);
    for (let j = 1; j < rows; j++) kit.box("trim", o.s0 + bw, o.s1 - bw, o.t0 + h * j / rows - 0.014 * k, o.t0 + h * j / rows + 0.014 * k, D + 0.004, D + 0.035);
    return {glass: true};
  }
  if (style === "single") return {glass: true};
  if (style === "hatch") {
    // Boards filling the opening, with a Z brace and two strap hinges on the outside.
    const g = 0.01, f = D + 0.04;
    kit.box("door", o.s0 + g, o.s1 - g, o.t0 + g, o.t1 - g, D, f);
    for (let s = o.s0 + 0.12; s < o.s1 - 0.08; s += 0.12) kit.box("door", s - 0.008, s + 0.008, o.t0 + 0.03, o.t1 - 0.03, f, f + 0.006, "d0");
    const rh = Math.min(0.1, h * 0.18);
    kit.box("trim", o.s0 + g, o.s1 - g, o.t0 + g, o.t0 + g + rh, f, f + 0.022, "d0");
    kit.box("trim", o.s0 + g, o.s1 - g, o.t1 - g - rh, o.t1 - g, f, f + 0.022, "d0");
    braceSlab(kit, o.s0 + 0.06, o.t0 + g + rh, o.s1 - 0.06, o.t1 - g - rh, Math.min(0.08, w * 0.12), f, f + 0.018);
    for (const t of [o.t0 + g + rh / 2, o.t1 - g - rh / 2]) kit.box("iron", o.s0 + g, o.s0 + g + w * 0.35, t - 0.02, t + 0.02, f + 0.022, f + 0.027, "d0");
    return {glass: false};
  }
  // casement: two casements side by side from 75 cm wide, a cross bar over 1 m high
  const bw = 0.03 * k;
  if (w >= 0.75) vbar(o.s0 + w / 2, bw);
  if (h > 1.0) hbar(o.t0 + h * 0.62, bw);
  return {glass: true};
}

/** A diagonal board from (sA, tA) to (sB, tB) (its centre line's ends), bw wide, as a slab d0..d1 lying on what is behind it. */
function braceSlab(kit, sA, tA, sB, tB, bw, d0, d1, skip = "d0") {
  const L = Math.hypot(sB - sA, tB - tA), ns = -(tB - tA) / L * bw / 2, nt = (sB - sA) / L * bw / 2;
  kit.slab("trim", [[sA + ns, tA + nt], [sA - ns, tA - nt], [sB - ns, tB - nt], [sB + ns, tB + nt]], d0, d1, skip);
}

/* ---------- Doors ---------- */
/**
 * One door leaf {s0, s1, t0, t1, dIn, dOut, right}: the leaf (dIn..dOut thick) and its style's details
 * on the outside, its handles (outside and in) near the free edge. right: hinged at s1, else at s0.
 * Details stand at their own depths off the face: boards 8 mm, braces 20-23 mm, frames 25 mm,
 * ironwork on what is under it. Faces lying on the leaf (or on a detail) are left out.
 */
export function drawLeaf(kit, style, L) {
  const W = L.s1 - L.s0, H = L.t1 - L.t0, f = L.dOut;
  // u: from the hinge edge across the leaf
  const S = u => L.right ? L.s1 - u : L.s0 + u;
  const box = (mat, u0, u1, t0, t1, d0, d1, skip) => { const a = S(u0), b = S(u1); kit.box(mat, Math.min(a, b), Math.max(a, b), t0, t1, d0, d1, skip); };
  // details lie on the outside face and, unless L.back is false (an inner door is two leaves back to back), on the inside face too, mirrored
  const sheet = style === "sheetslide" || style === "sheetpass", slides = style === "sliding" || sheet;
  const back = L.back !== false && !slides, mir = (d0, d1) => [L.dIn - (d1 - f), L.dIn - (d0 - f)];
  const on = (mat, u0, u1, t0, t1, d0, d1) => {   // lying on the face behind it
    box(mat, u0, u1, t0, t1, d0, d1, "d0");
    if (back) { const [m0, m1] = mir(d0, d1); box(mat, u0, u1, t0, t1, m0, m1, "d1"); }
  };
  const brace = (uA, tA, uB, tB, bw, d0, d1) => {
    braceSlab(kit, S(uA), tA, S(uB), tB, bw, d0, d1);
    if (back) { const [m0, m1] = mir(d0, d1); braceSlab(kit, S(uA), tA, S(uB), tB, bw, m0, m1, "d1"); }
  };
  // the leaf: solid, or with a hole where the glass is (the glass is a thin pane in the middle of it, seen through from both sides)
  const hole = style === "panel" ? (() => { const st = Math.min(0.11, W * 0.12), tg = L.t1 - 0.11; return [st, W - st, tg - Math.min(0.55, H * 0.28), tg]; })()
    : style === "glazed" ? [0.09, W - 0.09, L.t0 + 1.0, L.t1 - 0.1] : null;
  const mid = (L.dIn + L.dOut) / 2;
  if (hole) {
    const [hu0, hu1, ha, hb] = hole;
    box("door", 0, hu0, L.t0, L.t1, L.dIn, L.dOut); box("door", hu1, W, L.t0, L.t1, L.dIn, L.dOut);
    box("door", hu0, hu1, L.t0, ha, L.dIn, L.dOut); box("door", hu0, hu1, hb, L.t1, L.dIn, L.dOut);
    box("glass", hu0 + 0.001, hu1 - 0.001, ha + 0.001, hb - 0.001, mid - 0.002, mid + 0.002);   // (1 mm clear of the leaf all round: flush faces flicker)
  } else if (style !== "gate" && style !== "lowgate") kit.box(sheet ? "doorSheet" : "door", L.s0, L.s1, L.t0, L.t1, L.dIn, L.dOut);
  const boards = () => { for (let u = 0.13; u < W - 0.08; u += 0.13) on("door", u - 0.012, u + 0.012, L.t0 + 0.02, L.t1 - 0.02, f, f + 0.008); };
  // rail: the braced doors' top and bottom boards; iron: strap hinges' heights, resting at f + ironAt
  const rail = 0.13, iron = [];
  let ironAt = 0, handleU = W - 0.12, handleAt = 0;
  if (style === "plank") { boards(); iron.push(L.t0 + H * 0.15, L.t1 - H * 0.15); ironAt = 0.008; }
  else if (style === "zbrace") {
    boards();
    on("trim", 0, W, L.t0, L.t0 + rail, f, f + 0.025); on("trim", 0, W, L.t1 - rail, L.t1, f, f + 0.025);
    // the brace runs up from the bottom at the hinge side to the top at the latch side
    brace(0.1, L.t0 + rail, W - 0.1, L.t1 - rail, 0.12, f, f + 0.02);
    iron.push(L.t0 + rail / 2, L.t1 - rail / 2); ironAt = 0.025;
  } else if (style === "xbrace" || style === "sliding") {
    boards();
    const st = 0.11;
    on("trim", 0, W, L.t0, L.t0 + rail, f, f + 0.025); on("trim", 0, W, L.t1 - rail, L.t1, f, f + 0.025);
    on("trim", 0, st, L.t0 + rail, L.t1 - rail, f, f + 0.025); on("trim", W - st, W, L.t0 + rail, L.t1 - rail, f, f + 0.025);
    brace(st, L.t0 + rail, W - st, L.t1 - rail, 0.1, f, f + 0.02);
    brace(W - st, L.t0 + rail, st, L.t1 - rail, 0.1, f, f + 0.023);
    if (style === "xbrace") iron.push(L.t0 + rail / 2, L.t1 - rail / 2);
    ironAt = 0.025; handleU = W - st / 2; handleAt = 0.025;
  } else if (sheet) {
    // a steel frame round the sheet, a little proud of it: stiles, a top and a bottom rail, and a middle rail (the sheet itself is the corrugated leaf)
    const st = 0.06;
    on("doorSheet", 0, st, L.t0, L.t1, f, f + 0.02); on("doorSheet", W - st, W, L.t0, L.t1, f, f + 0.02);
    on("doorSheet", st, W - st, L.t0, L.t0 + 0.1, f, f + 0.02); on("doorSheet", st, W - st, L.t1 - 0.1, L.t1, f, f + 0.02);
    on("doorSheet", st, W - st, (L.t0 + L.t1) / 2 - 0.04, (L.t0 + L.t1) / 2 + 0.04, f, f + 0.02);
    handleU = W - st - 0.1; handleAt = 0.02;
  } else if (style === "panel") {
    // stiles and rails round two raised panels, glass at the top
    const st = Math.min(0.11, W * 0.12), top = 0.11, bot = 0.2, mid = 0.1, tg = L.t1 - top, gH = Math.min(0.55, H * 0.28), tm = tg - gH;
    on("door", 0, st, L.t0, L.t1, f, f + 0.02); on("door", W - st, W, L.t0, L.t1, f, f + 0.02);
    on("door", st, W - st, L.t0, L.t0 + bot, f, f + 0.02); on("door", st, W - st, tg, L.t1, f, f + 0.02);
    on("door", st, W - st, tm - mid, tm, f, f + 0.02);
    const lock = (L.t0 + bot + tm - mid) / 2;
    on("door", st, W - st, lock - 0.05, lock + 0.05, f, f + 0.02);
    for (const [a, b] of [[L.t0 + bot, lock - 0.05], [lock + 0.05, tm - mid]]) if (b - a > 0.1) on("door", st + 0.03, W - st - 0.03, a + 0.03, b - 0.03, f, f + 0.012);
    if (W - 2 * st > 0.6) { const c = W / 2; box("door", c - 0.015, c + 0.015, tm - 0.01, tg + 0.01, L.dIn - 0.008, L.dOut + 0.018); }   // a bar through the glass
    handleU = W - st / 2; handleAt = 0.02;
  }
  else if (style === "lowgate") {
    // a galvanised steel field gate, only as high as a fence (the opening stays open above it): a tube at each end, four rails between them and a diagonal brace
    const st = 0.05, rh = 0.04, k = 4, at = j => L.t0 + 0.1 + j * (H - 0.2) / (k - 1);
    box("gutter", 0, st, L.t0, L.t1, L.dIn, L.dOut); box("gutter", W - st, W, L.t0, L.t1, L.dIn, L.dOut);
    for (let j = 0; j < k; j++) box("gutter", st, W - st, at(j) - rh / 2, at(j) + rh / 2, L.dIn + 0.01, L.dOut - 0.01);
    brace(st, at(0), W - st, at(k - 1), 0.04, f, f + 0.012);
    handleU = W - st / 2; handleAt = 0;
  }
  else if (style === "gate") {
    // a fence gate: a stile each side, horizontal rails between them (every 40 cm or so) and a diagonal brace, open between the rails
    const st = 0.08, rh = 0.09, k = Math.max(3, Math.round(H / 0.4)), at = j => L.t0 + 0.1 + j * (H - 0.2) / (k - 1);
    box("door", 0, st, L.t0, L.t1, L.dIn, L.dOut); box("door", W - st, W, L.t0, L.t1, L.dIn, L.dOut);
    for (let j = 0; j < k; j++) box("door", st, W - st, at(j) - rh / 2, at(j) + rh / 2, L.dIn, L.dOut);
    brace(st, at(0), W - st, at(k - 1), 0.1, f, f + 0.02);
    iron.push(at(0), at(k - 1)); ironAt = 0.0;
    handleU = W - st / 2; handleAt = 0;
  } else if (style === "flush") {
    // a smooth leaf: just the lever and its rosette
    handleU = W - 0.06; handleAt = 0;
  } else if (style === "mirror") {
    // one tall "mirror" (spegel): a moulded frame round a recessed panel, in the middle of the leaf
    const m = 0.14, mo = 0.04, a = L.t0 + 0.3, b = L.t1 - 0.3;
    on("door", m, W - m, a, a + mo, f, f + 0.016); on("door", m, W - m, b - mo, b, f, f + 0.016);
    on("door", m, m + mo, a + mo, b - mo, f, f + 0.016); on("door", W - m - mo, W - m, a + mo, b - mo, f, f + 0.016);
    on("door", m + mo + 0.01, W - m - mo - 0.01, a + mo + 0.01, b - mo - 0.01, f, f + 0.008);
    handleU = W - 0.06; handleAt = 0;
  } else if (style === "fourpanel") {
    // stiles and rails (top, lock rail, bottom) round four recessed panels
    const st = 0.09, rt = 0.1, rb = 0.2, lk = L.t0 + 1.0, rm = 0.05, cs = W / 2;
    for (const [u0, u1] of [[0, st], [cs - st / 2, cs + st / 2], [W - st, W]]) on("door", u0, u1, L.t0, L.t1, f, f + 0.02);
    on("door", st, W - st, L.t0, L.t0 + rb, f, f + 0.02); on("door", st, W - st, L.t1 - rt, L.t1, f, f + 0.02); on("door", st, W - st, lk - rm, lk + rm, f, f + 0.02);
    for (const [u0, u1] of [[st, cs - st / 2], [cs + st / 2, W - st]]) for (const [a, b] of [[L.t0 + rb, lk - rm], [lk + rm, L.t1 - rt]])
      on("door", u0 + 0.025, u1 - 0.025, a + 0.025, b - 0.025, f, f + 0.012);
    handleU = W - st / 2; handleAt = 0.02;
  } else if (style === "glazed") {
    // glass in small panes above (three rows of two), a recessed panel below, stiles and rails of the leaf's wood
    const st = 0.09, rt = 0.1, rb = 0.2, rm = 0.1, tm = L.t0 + 1.0, tg = L.t1 - rt, gH = tg - tm, cs = W / 2;
    on("door", 0, st, L.t0, L.t1, f, f + 0.02); on("door", W - st, W, L.t0, L.t1, f, f + 0.02);
    on("door", st, W - st, L.t0, L.t0 + rb, f, f + 0.02); on("door", st, W - st, tg, L.t1, f, f + 0.02); on("door", st, W - st, tm - rm, tm, f, f + 0.02);
    on("door", st + 0.025, W - st - 0.025, L.t0 + rb + 0.025, tm - rm - 0.025, f, f + 0.012);
    box("door", cs - 0.012, cs + 0.012, tm - 0.01, tg + 0.01, L.dIn - 0.006, L.dOut + 0.016);                       // the bars through the glass
    for (const k of [1, 2]) box("door", st - 0.01, W - st + 0.01, tm + gH * k / 3 - 0.012, tm + gH * k / 3 + 0.012, L.dIn - 0.006, L.dOut + 0.016);
    handleU = W - st / 2; handleAt = 0.02;
  }
  // strap hinges from the hinge edge
  for (const t of iron) on("iron", 0, Math.min(W * 0.55, 0.6), t - 0.025, t + 0.025, f + ironAt, f + ironAt + 0.005);
  // handles near the free edge: a plate on the face and a lever (a pull bar on a sliding door), outside and in
  const ht = Math.min(L.t0 + 1.05, L.t1 - 0.2), hu = handleU, o0 = f + handleAt;
  on("iron", hu - 0.02, hu + 0.02, ht - 0.09, ht + 0.09, o0, o0 + 0.004);
  if (slides) {
    on("iron", hu - 0.012, hu + 0.012, ht - 0.07, ht + 0.07, o0 + 0.004, o0 + 0.05);
  } else {
    // the lever points back towards the hinge (u is measured from it on either leaf)
    on("iron", hu - 0.1, hu + 0.005, ht + 0.03, ht + 0.06, o0 + 0.004, o0 + 0.05);
  }
}
