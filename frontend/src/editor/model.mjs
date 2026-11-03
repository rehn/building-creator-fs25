// House model: settings, validation, geometry and i3d export.
// Pure functions with no DOM or three.js, so they run (and are tested) in Node.

/* ---------- Settings ---------- */
export const DEFAULTS = {
  width:10, depth:7, floors:2, floorHeight:2.7, foundation:0.4, halfStorey:false, kneeWall:0.9,
  roofType:"gable", ridge:"width", roofPitch:38, overhang:0.5, chimney:true,
  winFront:2, winBack:3, winLeft:1, winRight:1, winW:1.0, winH:1.25, sill:0.85,
  doorWall:"front", doorPos:0, doorW:1.0, doorH:2.1,
  wallCladding:"lockpanel", panelSpacing:0.2, battenWidth:0.06, roofMaterial:"tiles", chimneyStyle:"brick", chimneyColor:"#8A3B2C",
  entrance:"porch", entranceWidth:2.2, entranceDepth:1.6, gutters:true, downpipes:2, gutterColor:"#3B3F42",
  wallColor:"#8E2A1E", trimColor:"#F2EFE8", roofColor:"#2B2D2F", doorColor:"#3E5A4A", foundationColor:"#6E6E6A",
  sleepPoint:true, interior:true, curtainStyle:"sides", curtainColor:"#EFE9DC",
  modPrice:75000, modUpkeep:75, modAuthor:"", modDescription:""
};
/** Curtain layouts: [id, name]. Windows can pick one or follow the house's choice ("default"). */
export const CURTAIN_OPTIONS = [["sides","Side panels and valance"],["panels","Side panels"],["valance","Valance only"],["cafe","Caf\u00E9 curtain and valance"],["none","No curtains"]];
export const CURTAIN_STYLES = CURTAIN_OPTIONS.map(o => o[0]);
/** Room types behind the windows, in atlas order: [id, name]. Windows can pick one or "auto". */
export const ROOM_OPTIONS = [["living","Living room"],["bedroom","Bedroom"],["kitchen","Kitchen"],["study","Office"]];
export const ROOM_TYPES = ROOM_OPTIONS.map(o => o[0]);
const pickRoom = v => ROOM_TYPES.includes(v) ? v : "auto";
const pickCurtain = v => CURTAIN_STYLES.includes(v) ? v : "default";
const pickColor = v => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : "default";
export const SCHEMA = [
  {title:"Size", fields:[
    {k:"width", label:"Front wall length", min:4, max:30, step:0.1, unit:" m"},
    {k:"depth", label:"Side wall length", min:4, max:25, step:0.1, unit:" m"},
    {k:"floors", label:"Full floors", min:1, max:3, step:1},
    {k:"halfStorey", label:"Half floor in the roof (1\u00BD-plan)", type:"check"},
    {k:"kneeWall", label:"Knee wall height", min:0.2, max:1.6, step:0.05, unit:" m"},
    {k:"floorHeight", label:"Floor height", min:2.3, max:4, step:0.05, unit:" m"},
    {k:"foundation", label:"Foundation height", min:0, max:1.2, step:0.05, unit:" m"}]},
  {title:"Roof", fields:[
    {k:"roofType", label:"Roof type", type:"select", options:[["gable","Gable"],["hip","Hip"],["flat","Flat"]]},
    {k:"ridge", label:"Ridge direction", type:"select", options:[["width","Parallel to the front"],["depth","Front to back"]]},
    {k:"roofPitch", label:"Pitch", min:5, max:60, step:1, unit:"\u00B0"},
    {k:"overhang", label:"Overhang", min:0, max:1.2, step:0.05, unit:" m"},
    {k:"chimney", label:"Chimney", type:"check"},
    {k:"gutters", label:"Rain gutters", type:"check"},
    {k:"downpipes", label:"Downpipes per long side", min:0, max:2, step:1}]},
  {title:"Kupor (dormers)", custom:"dormers", fields:[]},
  {title:"Windows", custom:"windows", hint:"Set how many windows each floor has. To change one window, choose it below or tap it in the preview.", fields:[
    {k:"winW", label:"Width", min:0.4, max:2.5, step:0.05, unit:" m"},
    {k:"winH", label:"Height", min:0.4, max:2.2, step:0.05, unit:" m"},
    {k:"sill", label:"Sill height", min:0.2, max:1.5, step:0.05, unit:" m"}]},
  {title:"Door", fields:[
    {k:"doorWall", label:"Wall", type:"select", options:[["front","Front"],["back","Back"],["left","Left side"],["right","Right side"]]},
    {k:"doorPos", label:"Position, left to right", min:-1, max:1, step:0.05},
    {k:"doorW", label:"Width", min:0.7, max:2.5, step:0.05, unit:" m"},
    {k:"doorH", label:"Height", min:1.8, max:2.6, step:0.05, unit:" m"}]},
  {title:"Entrance", fields:[
    {k:"entrance", label:"Canopy", type:"select", options:[["none","None"],["shed","Shed canopy on brackets"],["gable","Gable canopy on brackets"],["porch","Porch with posts (förstukvist)"]]},
    {k:"entranceWidth", label:"Width", min:1.2, max:5, step:0.05, unit:" m"},
    {k:"entranceDepth", label:"Depth", min:0.6, max:3, step:0.05, unit:" m"}]},
  {title:"Interior", hint:"A small furnished room behind each window, seen through the glass. To pick the room or curtains for one window, choose it under Windows (or a kupa under Kupor).", fields:[
    {k:"interior", label:"Rooms behind the windows", type:"check"},
    {k:"curtainStyle", label:"Curtains", type:"select", options:CURTAIN_OPTIONS}]},
  {title:"Farmhouse", hint:"Players sleep outside the door, where the bed icon floats. With this on, the export is a farmhouse placeable with a sleep trigger, spawn point and farm map icon.", fields:[
    {k:"sleepPoint", label:"Sleep point with bed icon", type:"check"}]},
  {title:"Surfaces", fields:[
    {k:"wallCladding", label:"Wall cladding", type:"select", options:[["lockpanel","Board and batten (lockpanel)"],["horizontal","Horizontal boards"],["plaster","Plaster"]]},
    {k:"panelSpacing", label:"Board width", min:0.12, max:0.4, step:0.005, cm:true},
    {k:"battenWidth", label:"Batten width", min:0.03, max:0.1, step:0.005, cm:true},
    {k:"roofMaterial", label:"Roof covering", type:"select", options:[["tiles","Concrete tiles"],["metal","Standing seam metal"],["plain","Plain color"]]},
    {k:"chimneyStyle", label:"Chimney", type:"select", options:[["brick","Brick"],["plain","Plain color"]]}]},
  {title:"Game mod", hint:"Used by \u201CExport game mod\u201D: what the house costs in the shop and who made it. The project name is the name in the shop.", fields:[
    {k:"modPrice", label:"Price", min:0, max:2000000, step:500, money:true},
    {k:"modUpkeep", label:"Daily upkeep", min:0, max:5000, step:5, money:true},
    {k:"modAuthor", label:"Author (empty: your name)", type:"text", max:60},
    {k:"modDescription", label:"Description in the mod list (empty: made for you)", type:"text", max:1000, multiline:true}]},
  {title:"Colors", colors:true, fields:[
    {k:"wallColor", label:"Walls", type:"color"},
    {k:"trimColor", label:"Trim", type:"color"},
    {k:"roofColor", label:"Roof", type:"color"},
    {k:"doorColor", label:"Door", type:"color"},
    {k:"foundationColor", label:"Base", type:"color"},
    {k:"chimneyColor", label:"Chimney", type:"color"},
    {k:"gutterColor", label:"Gutters", type:"color"},
    {k:"curtainColor", label:"Curtains", type:"color"}]}
];
export const FIELD = {};
SCHEMA.forEach(g => g.fields.forEach(f => FIELD[f.k] = f));
export const WALLS = ["front", "back", "left", "right"];
export const WALL_NAMES = {front:"Front", back:"Back", left:"Left side", right:"Right side"};
export const clampN = (v, lo, hi, d) => { v = +v; return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
export function genRow(P, list, wall, floor, n) {
  const L = (wall === "front" || wall === "back") ? P.width : P.depth;
  let id = list.reduce((m, w) => Math.max(m, w.id), 0);
  const keep = list.filter(w => !(w.wall === wall && w.floor === floor));
  const pos = [];
  if (n > 0) {
    if (P.doorWall === wall && floor === 0) {
      const half = Math.max(0, L/2 - P.doorW/2 - 0.3), dc = L/2 + P.doorPos * half;
      const slots = Array.from({length: n + 1}, (_, i) => (i + 0.5) / (n + 1) * L);
      let bi = 0; slots.forEach((s, i) => { if (Math.abs(s - dc) < Math.abs(slots[bi] - dc)) bi = i; });
      slots.splice(bi, 1); pos.push(...slots);
    } else for (let i = 0; i < n; i++) pos.push((i + 0.5) / n * L);
  }
  for (const s of pos) keep.push({id: ++id, wall, floor, pos: s / L, w: P.winW, h: P.winH, sill: P.sill, room: "auto", curtain: "default", curtainColor: "default"});
  return keep;
}
export function genAll(P, src) {
  let list = [];
  for (const wall of WALLS) {
    const key = "win" + wall[0].toUpperCase() + wall.slice(1);
    const n = Math.round(clampN(src[key], 0, 8, DEFAULTS[key]));
    for (let f = 0; f < 3; f++) list = genRow(P, list, wall, f, n);
  }
  return list;
}
function cleanWindows(arr) {
  return arr.filter(w => w && WALLS.includes(w.wall)).slice(0, 80).map((w, i) => ({
    id: i + 1, wall: w.wall, floor: Math.round(clampN(w.floor, 0, 2, 0)), pos: clampN(w.pos, 0, 1, 0.5),
    w: clampN(w.w, 0.3, 3, 1), h: clampN(w.h, 0.3, 2.4, 1.25), sill: clampN(w.sill, 0, 2, 0.85),
    room: pickRoom(w.room), curtain: pickCurtain(w.curtain), curtainColor: pickColor(w.curtainColor)
  }));
}
export const DTYPES = ["frontespis", "gable", "shed"];
export const DORM_DEF = {
  frontespis: {w:3.2, wallH:2.1, setback:0.8, n:2, ww:0.9, wh:1.1},
  gable: {w:1.8, wallH:1.9, setback:0.9, n:1, ww:0.9, wh:1.0},
  shed: {w:2.6, wallH:1.9, setback:0.9, n:2, ww:0.8, wh:1.0}};
function cleanDormers(arr) {
  return arr.filter(d => d && DTYPES.includes(d.type)).slice(0, 12).map((d, i) => {
    const df = DORM_DEF[d.type];
    return {id: i + 1, type: d.type, side: +d.side < 0 ? -1 : 1, pos: clampN(d.pos, 0, 1, 0.5), w: clampN(d.w, 1, 6, df.w),
      wallH: clampN(d.wallH, 1.2, 3, df.wallH), setback: clampN(d.setback, 0.2, 2.5, df.setback), n: Math.round(clampN(d.n, 1, 4, df.n)),
      ww: clampN(d.ww, 0.4, 1.6, df.ww), wh: clampN(d.wh, 0.5, 1.6, df.wh),
      room: pickRoom(d.room), curtain: pickCurtain(d.curtain), curtainColor: pickColor(d.curtainColor)};
  });
}
export function clampField(f, v) {
  if (!f) return undefined;
  if (f.type === "select") return f.options.some(o => o[0] === v) ? v : undefined;
  if (f.type === "check") return typeof v === "boolean" ? v : undefined;
  if (f.type === "text") return typeof v === "string" ? v.trim().slice(0, f.max) : undefined;
  if (f.type === "color") return (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)) ? v : undefined;
  const n = Number(v);
  if (!isFinite(n)) return undefined;
  const c = Math.min(f.max, Math.max(f.min, n));
  return Math.round(c / f.step) * f.step;
}
export function sanitize(obj) {
  if (!obj || typeof obj !== "object") obj = {};
  const out = {...DEFAULTS};
  for (const k in DEFAULTS) { const v = clampField(FIELD[k], obj[k]); if (v !== undefined) out[k] = typeof DEFAULTS[k] === "number" ? +(+v).toFixed(3) : v; }
  // Saves from before curtain styles had a curtains on/off switch.
  if (obj.curtainStyle === undefined && obj.curtains === false) out.curtainStyle = "none";
  out.windows = Array.isArray(obj.windows) ? cleanWindows(obj.windows) : genAll(out, obj);
  out.dormers = Array.isArray(obj.dormers) ? cleanDormers(obj.dormers) : [];
  return out;
}

/** Settings as saved to the server: drops internal fields like _hidden. */
export function serialize(p) {
  return JSON.parse(JSON.stringify(p, (k, v) => (k.startsWith("_") ? undefined : v)));
}

/**
 * Mod folder/zip name from a project name: FS25_ and the words in CamelCase, ASCII letters and
 * digits only (the game rejects other characters). Starts with a letter, at most 40 after FS25_.
 */
export function modName(name) {
  const words = String(name || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").split(/[^A-Za-z0-9]+/).filter(Boolean);
  let s = words.map(w => w[0].toUpperCase() + w.slice(1)).join("");
  if (!s) s = "House"; else if (/^\d/.test(s)) s = "House" + s;
  return "FS25_" + s.slice(0, 40);
}

/** Safe file name for exports, from a project name. */
export function slugify(name) {
  return (String(name || "house").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "house").slice(0, 60);
}

/* ---------- Geometry ---------- */
/* ---------- Geometry ---------- */
/** Point on wall w: s along it, t up from its base, d out from its face. */
export const WP = (w,s,t,d) => [w.o[0] + w.u[0]*s + w.n[0]*d, w.o[1] + t, w.o[2] + w.u[2]*s + w.n[2]*d];
export const MATS = ["walls","trim","roof","glass","door","foundation","chimney","gutter","interior","curtain"];
/**
 * Texture atlas for the rooms behind the windows (u, v from the bottom left, as [u0, v0, u1, v1]).
 * Four room types (living room, bedroom, kitchen, study), each with its own back wall,
 * side wall and floor, and one shared ceiling. The editor paints the atlas to this layout.
 */
const ROOM_FLOOR = [0, 2, 3, 0], PAD = 2 / 1024;
const cell = (u0, v0, u1, v1) => [u0 + PAD, v0 + PAD, u1 - PAD, v1 - PAD];
export const ATLAS = {
  back: k => cell(k / 4, 0.5, (k + 1) / 4, 1),
  side: k => cell(k / 4, 0.25, (k + 1) / 4, 0.5),
  floor: k => cell(ROOM_FLOOR[k] / 4, 0, (ROOM_FLOOR[k] + 1) / 4, 0.25),
  ceiling: cell(0.25, 0, 0.5, 0.25),
};
/** Tiles in the atlas's bottom row, left to right. */
export const ATLAS_FLOORS = ["wood", "ceiling", "carpet", "tiles"];
const sub = (a,b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const norm = a => { const l = Math.hypot(a[0],a[1],a[2]) || 1; return [a[0]/l, a[1]/l, a[2]/l]; };
const neg = a => [-a[0], -a[1], -a[2]];
const lerp = (a,b,t) => a + (b-a)*t;
const UP = [0,1,0];
const add = (a,b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const scl = (a,k) => [a[0]*k, a[1]*k, a[2]*k];
const dist = (a,b) => Math.hypot(...sub(a,b));

/* ---------- Pipes and gutters (smooth meshes) ---------- */
/** Adds a triangle a, b, c to mesh m, turned so it faces along hint. */
function tri(m, a, b, c, hint) {
  const n = cross(sub(m.v(b), m.v(a)), sub(m.v(c), m.v(a)));
  if (dot(n, hint) < 0) m.i.push(a, c, b); else m.i.push(a, b, c);
}
function newMesh() {
  const m = {p: [], n: [], uv: [], i: []};
  m.v = k => [m.p[k*3], m.p[k*3+1], m.p[k*3+2]];
  m.add = (pos, nrm, uv) => { m.p.push(...pos); m.n.push(...nrm); m.uv.push(...uv); return m.p.length / 3 - 1; };
  return m;
}
/** Flat disc (or fan) closing a ring of vertex positions, facing along nrm. */
function cap(m, center, ring, nrm) {
  const c = m.add(center, nrm, [0.5, 0.5]);
  const vs = ring.map(q => m.add(q, nrm, [0, 0]));
  for (let k = 0; k < vs.length; k++) tri(m, c, vs[k], vs[(k + 1) % vs.length], nrm);
}

/**
 * A round pipe along path (points), radius r, as one closed mesh with smooth normals.
 * Corners become rounded elbows (bend: their radius, in metres). Also returns the rings
 * (centre c, direction t, vertex indices) for tests.
 */
export function pipeMesh(path, r, {seg = 16, bend = 0.12} = {}) {
  const pts = [path[0]];
  const push = q => { if (dist(q, pts[pts.length - 1]) > 1e-6) pts.push(q); };
  for (let i = 1; i < path.length - 1; i++) {
    const P = path[i], d0 = norm(sub(P, path[i - 1])), d1 = norm(sub(path[i + 1], P));
    const th = Math.acos(Math.max(-1, Math.min(1, dot(d0, d1))));
    if (th < 1e-3) { push(P); continue; }
    // Round the corner with a curve from A (on the way in) to B (on the way out).
    const t = Math.min(bend * Math.tan(th / 2), 0.45 * dist(P, path[i - 1]), 0.45 * dist(path[i + 1], P));
    const A = sub(P, scl(d0, t)), B = add(P, scl(d1, t));
    const n = Math.max(2, Math.ceil(th / (8 * Math.PI / 180)));
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      push(add(add(scl(A, (1 - u) * (1 - u)), scl(P, 2 * u * (1 - u))), scl(B, u * u)));
    }
  }
  push(path[path.length - 1]);

  const m = newMesh();
  const T = pts.map((q, i) => norm(add(i > 0 ? norm(sub(q, pts[i - 1])) : [0, 0, 0], i < pts.length - 1 ? norm(sub(pts[i + 1], q)) : [0, 0, 0])));
  let e1 = norm(cross(T[0], Math.abs(T[0][1]) < 0.9 ? UP : [1, 0, 0]));
  m.rings = pts.map((c, i) => {
    e1 = norm(sub(e1, scl(T[i], dot(e1, T[i]))));    // carried along the pipe, so the sides don't twist
    const e2 = cross(T[i], e1);
    const verts = Array.from({length: seg}, (_, k) => {
      const a = k / seg * Math.PI * 2, d = add(scl(e1, Math.cos(a)), scl(e2, Math.sin(a)));
      return m.add(add(c, scl(d, r)), d, [k / seg, i]);
    });
    return {c, t: T[i], verts};
  });
  for (let i = 0; i + 1 < m.rings.length; i++) {
    const A = m.rings[i].verts, B = m.rings[i + 1].verts;
    for (let k = 0; k < seg; k++) {
      const a = A[k], b = B[k], c = B[(k + 1) % seg], d = A[(k + 1) % seg], out = m.n.slice(a * 3, a * 3 + 3);
      tri(m, a, b, c, out); tri(m, a, c, d, out);
    }
  }
  const ring = R => R.verts.map(k => m.v(k));
  cap(m, pts[0], ring(m.rings[0]), neg(T[0]));
  cap(m, pts[pts.length - 1], ring(m.rings[m.rings.length - 1]), T[T.length - 1]);
  delete m.v; delete m.add;
  return m;
}

/**
 * A half-round gutter from c0 to c1 (centres of the rim), opening upwards, the outer rim towards out.
 * Thin sheet with smooth shading on both sides, closed ends and a rolled lip on the outer rim.
 * trough[i] marks the vertices of the curved sheet (for tests).
 */
export function gutterMesh(c0, c1, out, r, {seg = 12} = {}) {
  const m = newMesh();
  m.trough = [];
  const dir = norm(sub(c1, c0));
  const radial = th => [out[0] * Math.cos(th), -Math.sin(th), out[2] * Math.cos(th)];
  const pt = (c, th) => add(c, scl(radial(th), r));
  for (const side of [1, -1]) {
    const row = c => Array.from({length: seg + 1}, (_, k) => {
      const th = k / seg * Math.PI, d = radial(th);
      const v = m.add(pt(c, th), scl(d, side), [k / seg, c === c0 ? 0 : 1]);
      m.trough[v] = true;
      return v;
    });
    const A = row(c0), B = row(c1);
    for (let k = 0; k < seg; k++) {
      const hint = scl(radial((k + 0.5) / seg * Math.PI), side);
      tri(m, A[k], B[k], B[k + 1], hint); tri(m, A[k], B[k + 1], A[k + 1], hint);
    }
  }
  // End plates, seen from both sides.
  for (const [c, sg] of [[c0, -1], [c1, 1]]) {
    const edge = Array.from({length: seg + 1}, (_, k) => pt(c, k / seg * Math.PI));
    for (const face of [1, -1]) {
      const nrm = scl(dir, sg * face), vs = edge.map(q => m.add(q, nrm, [0, 0]));
      for (let k = 1; k < seg; k++) tri(m, vs[0], vs[k], vs[k + 1], nrm);
    }
  }
  // Rolled lip on the outer rim.
  const lip = pipeMesh([pt(c0, 0), pt(c1, 0)], 0.012, {seg: 10});
  const base = m.p.length / 3;
  m.p.push(...lip.p); m.n.push(...lip.n); m.uv.push(...lip.uv); m.i.push(...lip.i.map(k => k + base));
  delete m.v; delete m.add;
  return m;
}

/**
 * Builds the house mesh for settings p. Returns one mesh per material in G,
 * the house dimensions, the wall openings and a simple collision box.
 * Marks windows and dormers that don't fit with _hidden = true.
 */
export function buildGeometry(p) {
let G, opsByWall = {}, dims = {}, rooms = [], downpipes = [];

function poly(mat, pts, hint, uvf) {
  pts = pts.filter((q,i) => { const r = pts[(i+1) % pts.length]; return Math.hypot(...sub(q,r)) > 1e-6; });
  if (pts.length < 3) return;
  let n = norm(cross(sub(pts[1],pts[0]), sub(pts[2],pts[0])));
  if (hint && dot(n, hint) < 0) { pts = pts.slice().reverse(); n = neg(n); }
  // Undersides of the roof, dormer roofs and canopies (eave soffits) are painted boards, not tiles.
  if (mat === "roof" && n[1] < -0.3) mat = "trim";
  if (mat === "trim") uvf = null;
  const g = G[mat], base = g.p.length / 3;
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  let uvs = pts.map(q => uvf ? uvf(q) : (ay >= ax && ay >= az) ? [q[0], q[2]] : (ax >= az) ? [q[2], q[1]] : [q[0], q[1]]);
  if (mat === "trim") {
    // Painted wood: the grain runs along v. Lay v along the face's longest edge, the board's
    // length, whatever its angle (sloped fascia, soffits, frames), and u across it.
    let along = null, best = -1;
    pts.forEach((q, k) => { const e = sub(pts[(k + 1) % pts.length], q), l = Math.hypot(...e); if (l > best) { best = l; along = e; } });
    const v = norm(along), u = norm(cross(n, v));
    uvs = pts.map(q => [dot(q, u), dot(q, v)]);
  }
  pts.forEach((q, k) => { g.p.push(q[0], q[1], q[2]); g.n.push(n[0], n[1], n[2]); g.uv.push(uvs[k][0], uvs[k][1]); });
  for (let k = 1; k < pts.length - 1; k++) g.i.push(base, base + k, base + k + 1);
}
function box(mat, P, ax, ay, az) {
  for (const a of [0,1]) poly(mat, [P(a,0,0),P(a,1,0),P(a,1,1),P(a,0,1)], a ? ax : neg(ax));
  for (const b of [0,1]) poly(mat, [P(0,b,0),P(1,b,0),P(1,b,1),P(0,b,1)], b ? ay : neg(ay));
  for (const c of [0,1]) poly(mat, [P(0,0,c),P(1,0,c),P(1,1,c),P(0,1,c)], c ? az : neg(az));
}
function wbox(mat, w, s0, s1, t0, t1, d0, d1) {
  box(mat, (a,b,c) => WP(w, lerp(s0,s1,a), lerp(t0,t1,b), lerp(d0,d1,c)), w.u, UP, w.n);
}
function abox(mat, p1, p2) {
  const mn = [0,1,2].map(i => Math.min(p1[i], p2[i])), mx = [0,1,2].map(i => Math.max(p1[i], p2[i]));
  box(mat, (a,b,c) => [lerp(mn[0],mx[0],a), lerp(mn[1],mx[1],b), lerp(mn[2],mx[2],c)], [1,0,0], UP, [0,0,1]);
}
const mid = pts => [0,1,2].map(i => pts.reduce((s, q) => s + q[i], 0) / pts.length);
/** Closed convex solid from its (convex) faces, each turned away from the middle. */
function solid(mat, faces) {
  const c = mid(faces.flat());
  for (const f of faces) poly(mat, f, sub(mid(f), c));
}
/** Convex 2D section sec, placed at both ends by at(q, 0) and at(q, 1), closed into a prism. */
function prism(mat, sec, at) {
  const f0 = sec.map(q => at(q, 0)), f1 = sec.map(q => at(q, 1));
  solid(mat, [f0, f1, ...sec.map((_, i) => { const j = (i + 1) % sec.length; return [f0[i], f0[j], f1[j], f1[i]]; })]);
}

function layoutWall(key, L, fh, topAt) {
  const nf = p.floors + (p.halfStorey ? 1 : 0);
  const ops = [];
  if (p.doorWall === key) {
    const dw = Math.min(p.doorW, L - 0.6), dh = Math.min(p.doorH, fh - 0.25);
    const c = L/2 + p.doorPos * Math.max(0, L/2 - p.doorW/2 - 0.3);
    ops.push({s0: c - dw/2, s1: c + dw/2, t0: 0, t1: dh, kind: "door"});
  }
  for (const win of p.windows) {
    if (win.wall !== key) continue;
    win._hidden = false;
    if (win.floor >= nf) continue;
    const ww = Math.min(win.w, L - 0.4), c = Math.min(L - ww/2 - 0.2, Math.max(ww/2 + 0.2, win.pos * L));
    const t0 = win.floor * fh + win.sill, t1 = win.floor < p.floors ? Math.min(t0 + win.h, (win.floor + 1) * fh - 0.25) : t0 + win.h;
    const op = {s0: c - ww/2, s1: c + ww/2, t0, t1, kind: "window", id: win.id};
    const g = 0.18;
    if (t1 - t0 < 0.3 || ww < 0.3 || ops.some(q => q.s0 < op.s1 + g && op.s0 < q.s1 + g && q.t0 < op.t1 + g && op.t0 < q.t1 + g)
        || (topAt && t1 + 0.12 > Math.min(topAt(op.s0 - 0.1), topAt(op.s1 + 0.1)))) { win._hidden = true; continue; }
    ops.push(op);
  }
  return ops;
}

function clipPoly(pts, a, b, c) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const P = pts[i], Q = pts[(i + 1) % pts.length], fp = a*P[0] + b*P[1] - c, fq = a*Q[0] + b*Q[1] - c;
    if (fp <= 1e-9) out.push(P);
    if ((fp < -1e-9 && fq > 1e-9) || (fp > 1e-9 && fq < -1e-9)) { const t = fp / (fp - fq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
  }
  return out;
}
function slopePieces(S, list) {
  const pieces = [], band = (q, a0, a1) => clipPoly(clipPoly(q, -1, 0, -a0), 1, 0, a1);
  let lo = -1e9;
  for (const D of list.slice().sort((x, y) => x.ac - y.ac)) {
    pieces.push(band(S, lo, D.ac - D.hwr));
    for (const sg of [-1, 1]) {
      const a1 = D.ac + sg * D.hwr, as = D.ac + sg * D.hw;
      let na = D.br - D.be, nb = -(D.ac - a1), c = na * a1 + nb * D.be;
      if (na * a1 > c) { na = -na; nb = -nb; c = -c; }
      pieces.push(clipPoly(sg < 0 ? band(S, a1, D.ac) : band(S, D.ac, a1), na, nb, c));
      pieces.push(clipPoly(sg < 0 ? band(S, a1, as) : band(S, as, a1), 0, -1, -D.be));
    }
    if (!D.fr) pieces.push(clipPoly(band(S, D.ac - D.hw, D.ac + D.hw), 0, -1, -D.bf));
    lo = D.ac + D.hwr;
  }
  pieces.push(band(S, lo, 1e9));
  return pieces.filter(q => q.length >= 3);
}
/** Quad with its own uvs, turned to face along hint. */
function quad(mat, pts, uvs, hint) {
  let n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
  if (dot(n, hint) < 0) { pts = pts.slice().reverse(); uvs = uvs.slice().reverse(); n = neg(n); }
  const g = G[mat], base = g.p.length / 3;
  pts.forEach((q, k) => { g.p.push(...q); g.n.push(...n); g.uv.push(...uvs[k]); if (g.c) g.c.push(...curtainRGB); });
  g.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
/** Color (0..1 rgb) given to the curtain vertices being built. */
let curtainRGB = [1, 1, 1];
const hexRGB = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const ROOM_D = 0.75, ROOM_SIDE = 0.45, ROOM_UP = 0.35, ROOM_DOWN = 0.95;
/**
 * Room box behind window o: as wide as the space to its neighbours allows (half the gap each),
 * down to the floor, up towards the ceiling, but never through the roof or past the wall's ends.
 */
function roomFor(w, o, ops, r, topAt, dormer, choice) {
  const fh = p.floorHeight, L = w.L;
  const exp = q => q.kind === "door" ? q : {s0: q.s0 - ROOM_SIDE, s1: q.s1 + ROOM_SIDE, t0: q.t0 - ROOM_DOWN, t1: q.t1 + ROOM_UP};
  const me = exp(o);
  let lo = me.s0, hi = me.s1, bot = me.t0, top = me.t1;
  for (const q of ops) {
    if (q === o) continue;
    const e = exp(q);
    if (e.t0 < me.t1 && me.t0 < e.t1) {
      if (q.s0 >= o.s1) hi = Math.min(hi, (o.s1 + q.s0) / 2);
      else if (q.s1 <= o.s0) lo = Math.max(lo, (q.s1 + o.s0) / 2);
    }
    if (e.s0 < me.s1 && me.s0 < e.s1) {
      if (q.t0 >= o.t1) top = Math.min(top, (o.t1 + q.t0) / 2);
      else if (q.t1 <= o.t0) bot = Math.max(bot, (q.t1 + o.t0) / 2);
    }
  }
  // Keep clear of the rooms behind the walls round the corner.
  const end = r + ROOM_D + 0.05;
  lo = Math.max(lo, Math.min(o.s0, end)); hi = Math.min(hi, Math.max(o.s1, L - end));
  const fi = dormer ? 0 : Math.floor((o.t0 + 1e-6) / fh);
  bot = Math.min(o.t0, Math.max(bot, dormer ? 0.02 : fi * fh + 0.02));
  if (!dormer && fi < p.floors) top = Math.max(o.t1, Math.min(top, (fi + 1) * fh - 0.05));
  // Stay 10 cm under the roof; topAt is highest in the middle, so checking the ends is enough.
  const under = () => Math.min(topAt(lo), topAt(hi)) - 0.1;
  if (top > under()) top = Math.max(o.t1, under());
  if (top > under()) { lo = o.s0; hi = o.s1; top = Math.max(o.t1, Math.min(top, under())); }
  const room = choice && ROOM_TYPES.includes(choice.room) ? ROOM_TYPES.indexOf(choice.room) : rooms.length % 4;
  const curtain = choice && CURTAIN_STYLES.includes(choice.curtain) ? choice.curtain : p.curtainStyle;
  const curtainColor = choice && pickColor(choice.curtainColor) !== "default" ? choice.curtainColor.toUpperCase() : p.curtainColor.toUpperCase();
  return {w, op: o, lo, hi, bot, top, d0: -r, d1: -r - ROOM_D, dormer, variant: room, curtain, curtainColor};
}
function buildRoom(R) {
  const {w, lo, hi, bot, top, d0, d1, variant: k} = R;
  const P = (s, t, d) => WP(w, s, t, d);
  const rect = ([u0, v0, u1, v1]) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
  quad("interior", [P(lo, bot, d1), P(hi, bot, d1), P(hi, top, d1), P(lo, top, d1)], rect(ATLAS.back(k)), w.n);
  quad("interior", [P(lo, bot, d0), P(hi, bot, d0), P(hi, bot, d1), P(lo, bot, d1)], rect(ATLAS.floor(k)), UP);
  quad("interior", [P(lo, top, d0), P(hi, top, d0), P(hi, top, d1), P(lo, top, d1)], rect(ATLAS.ceiling), neg(UP));
  // Side walls: the texture's left edge at the glass, its right edge at the back wall.
  quad("interior", [P(lo, bot, d0), P(lo, bot, d1), P(lo, top, d1), P(lo, top, d0)], rect(ATLAS.side(k)), w.u);
  quad("interior", [P(hi, bot, d0), P(hi, bot, d1), P(hi, top, d1), P(hi, top, d0)], rect(ATLAS.side(k)), neg(w.u));
  buildCurtains(R);
}
/** Pleated cloth from s0 to s1 and t0 to t1, hanging at depth d; the folds go amp back and forth. */
function pleat(w, s0, s1, t0, t1, d, amp) {
  const n = Math.max(2, Math.round((s1 - s0) / 0.07));
  for (let i = 0; i < n; i++) {
    const a = lerp(s0, s1, i / n), b = lerp(s0, s1, (i + 1) / n);
    const da = d + (i % 2 ? -amp : amp), db = d + (i % 2 ? amp : -amp);
    quad("curtain", [WP(w, a, t0, da), WP(w, b, t0, db), WP(w, b, t1, db), WP(w, a, t1, da)], [[a, t0], [b, t0], [b, t1], [a, t1]], w.n);
  }
}
/**
 * Curtains for room R in its layout (R.curtain):
 *   sides: side panels and a valance; panels: side panels only; valance: valance (kappa) only;
 *   cafe: a cafe curtain over the lower half and a valance; none: bare window.
 */
function buildCurtains(R) {
  const {w, op: o, lo, hi, bot, top, d0, curtain: style} = R;
  if (style === "none") return;
  curtainRGB = hexRGB(R.curtainColor);
  const cd = d0 - 0.07, h = o.t1 - o.t0, pw = Math.max(0.16, (o.s1 - o.s0) * 0.26);
  const ct = Math.min(top - 0.02, o.t1 + 0.08), cb = Math.max(bot + 0.02, o.t0 - 0.1);
  const sL = Math.max(lo + 0.01, o.s0 - 0.08), sR = Math.min(hi - 0.01, o.s1 + 0.08);
  if (style === "sides" || style === "panels") {
    pleat(w, sL, o.s0 + pw, cb, ct, cd, 0.015);
    pleat(w, o.s1 - pw, sR, cb, ct, cd, 0.015);
  }
  if (style === "cafe") pleat(w, sL, sR, cb, o.t0 + h * 0.45, cd, 0.012);
  if (style !== "panels") {
    // Valance (kappa) across the top, a little nearer the glass.
    const vh = Math.min(0.22, h * 0.18);
    pleat(w, Math.max(lo + 0.01, o.s0 - 0.1), Math.min(hi - 0.01, o.s1 + 0.1), ct - vh, ct, d0 - 0.035, 0.01);
  }
}
function buildWall(w, ops, H, gableRise, F, {topAt = () => H, dormer = null} = {}) {
  const L = w.L, xs = [0, L, L/2], ts = [0, H, H + gableRise];
  ops.forEach(o => { xs.push(o.s0, o.s1); ts.push(o.t0, o.t1); });
  const uniq = a => [...new Set(a.map(v => +v.toFixed(5)))].sort((a,b) => a - b);
  const X = uniq(xs), T = uniq(ts);
  for (let i = 0; i < X.length - 1; i++) for (let j = 0; j < T.length - 1; j++) {
    const cs = (X[i] + X[i+1]) / 2, ct = (T[j] + T[j+1]) / 2;
    if (ops.some(o => cs > o.s0 && cs < o.s1 && ct > o.t0 && ct < o.t1)) continue;
    let c = [[X[i], T[j]], [X[i+1], T[j]], [X[i+1], T[j+1]], [X[i], T[j+1]]];
    if (T[j+1] > H + 1e-6) {
      if (gableRise <= 0) continue;
      const k = gableRise / (L / 2);
      c = clipPoly(clipPoly(c, -k, 1, H), k, 1, H + 2 * gableRise);
    }
    if (c.length >= 3) poly("walls", c.map(q => WP(w, q[0], q[1], 0)), w.n);
  }

  const r = 0.15, fr = 0.08, out = 0.04;
  ops.forEach(o => {
    const isDoor = o.kind === "door";
    if (!isDoor) poly("walls", [WP(w,o.s0,o.t0,0), WP(w,o.s1,o.t0,0), WP(w,o.s1,o.t0,-r), WP(w,o.s0,o.t0,-r)], UP);
    poly("walls", [WP(w,o.s0,o.t1,0), WP(w,o.s1,o.t1,0), WP(w,o.s1,o.t1,-r), WP(w,o.s0,o.t1,-r)], neg(UP));
    poly("walls", [WP(w,o.s0,o.t0,0), WP(w,o.s0,o.t1,0), WP(w,o.s0,o.t1,-r), WP(w,o.s0,o.t0,-r)], w.u);
    poly("walls", [WP(w,o.s1,o.t0,0), WP(w,o.s1,o.t1,0), WP(w,o.s1,o.t1,-r), WP(w,o.s1,o.t0,-r)], neg(w.u));
    // The glass sits 12 mm in front of the back of the window bars: in the same plane they flicker.
    const dg = isDoor ? -r : -r + 0.012;
    poly(isDoor ? "door" : "glass", [WP(w,o.s0,o.t0,dg), WP(w,o.s1,o.t0,dg), WP(w,o.s1,o.t1,dg), WP(w,o.s0,o.t1,dg)], w.n);
    const b0 = isDoor ? o.t0 : o.t0 - fr;
    wbox("trim", w, o.s0 - fr, o.s0, b0, o.t1 + fr, -0.02, out);
    wbox("trim", w, o.s1, o.s1 + fr, b0, o.t1 + fr, -0.02, out);
    wbox("trim", w, o.s0, o.s1, o.t1, o.t1 + fr, -0.02, out);
    if (isDoor) {
      if (F > 0.05 && p.entrance !== "porch") {
        wbox("foundation", w, o.s0 - 0.3, o.s1 + 0.3, -F, 0, 0, 0.7);
        wbox("collision", w, o.s0 - 0.3, o.s1 + 0.3, -F, 0, 0, 0.7);
      }
      const hx = o.s1 - 0.12;
      wbox("trim", w, hx - 0.03, hx, o.t0 + 0.95, o.t0 + 1.08, -r, -r + 0.06);
    } else {
      wbox("trim", w, o.s0 - fr - 0.04, o.s1 + fr + 0.04, o.t0 - 0.07, o.t0, -0.02, 0.09);
      const mid = (o.s0 + o.s1) / 2;
      wbox("trim", w, mid - 0.03, mid + 0.03, o.t0, o.t1, -r, -r + 0.04);
      if (o.t1 - o.t0 > 1.0) {
        const tm = o.t0 + (o.t1 - o.t0) * 0.62;
        wbox("trim", w, o.s0, o.s1, tm - 0.03, tm + 0.03, -r, -r + 0.04);
      }
    }
  });
  if (p.interior) for (const o of ops) if (o.kind === "window") { const R = roomFor(w, o, ops, r, topAt, !!dormer, dormer || p.windows.find(x => x.id === o.id)); rooms.push(R); buildRoom(R); }
}

/** Appends a ready-made mesh (with its own normals) to material mat. */
function addMesh(mat, m) {
  const g = G[mat], base = g.p.length / 3;
  g.p.push(...m.p); g.n.push(...m.n); g.uv.push(...m.uv);
  for (const k of m.i) g.i.push(k + base);
  if (g.c) for (let k = 0; k < m.p.length / 3; k++) g.c.push(...curtainRGB);
}
function gutterRun(c0, c1, out, r) { addMesh("gutter", gutterMesh(c0, c1, out, r)); }
function sbox(mat, w, sc, thk, p0, p1) {
  const ad = p1[0] - p0[0], at = p1[1] - p0[1], l = Math.hypot(ad, at), ud = ad / l, ut = at / l, pd = -ut, pt = ud;
  box(mat, (a, b, c) => {
    const d = lerp(p0[0], p1[0], b) + pd * (c - 0.5) * thk, t = lerp(p0[1], p1[1], b) + pt * (c - 0.5) * thk;
    return WP(w, sc + (a - 0.5) * thk, t, d);
  }, w.u, [w.n[0]*ud, ut, w.n[2]*ud], [w.n[0]*pd, pt, w.n[2]*pd]);
}
function buildEntrance(w, o, limit, F, mainEave) {
  const type = p.entrance, cd = p.entranceDepth;
  const cw = Math.min(w.L + 0.4, Math.max(p.entranceWidth, o.s1 - o.s0 + 0.5)), hw = cw / 2;
  const cs = (o.s0 + o.s1) / 2, sL = cs - hw, sR = cs + hw;
  const hv = (a, t, d) => [w.u[0]*a + w.n[0]*d, t, w.u[2]*a + w.n[2]*d];
  const sd = q => { const dx = q[0] - w.o[0], dz = q[2] - w.o[2]; return [dx*w.u[0] + dz*w.u[2], dx*w.n[0] + dz*w.n[2]]; };
  const thc = 0.1, dn = q => [q[0], q[1] - thc, q[2]];
  let ta = o.t1 + 0.3;
  const tanc = Math.tan(Math.min(p.roofPitch, 45) * Math.PI / 180);
  let rise = type === "shed" ? cd * Math.tan(18 * Math.PI / 180) : hw * tanc;
  if (ta + rise > limit) { ta = Math.max(o.t1 + 0.12, limit - rise); rise = Math.max(0.15, Math.min(rise, limit - ta)); }

  if (type === "shed") {
    const cosc = Math.cos(Math.atan2(rise, cd)), d1 = cd + 0.12, tL = ta - 0.12 * rise / cd;
    const T = [WP(w, sL - 0.1, ta + rise, 0), WP(w, sR + 0.1, ta + rise, 0), WP(w, sR + 0.1, tL, d1), WP(w, sL - 0.1, tL, d1)], B = T.map(dn);
    const uvf = q => { const v = sd(q); return [v[0], -v[1] / cosc]; };
    const up = hv(0, 1, rise / cd);
    poly("roof", T, up, uvf); poly("roof", B, neg(up), uvf);
    poly("trim", [T[2], T[3], B[3], B[2]], hv(0, 0, 1));
    poly("trim", [T[1], T[2], B[2], B[1]], hv(1, 0, 0));
    poly("trim", [T[0], T[3], B[3], B[0]], hv(-1, 0, 0));
    prism("collision", [[0, ta - 0.16], [d1, ta - 0.16], [d1, tL], [0, ta + rise]], ([d, t], k) => WP(w, k ? sR + 0.1 : sL - 0.1, t, d));
  } else {
    const cosc = Math.cos(Math.atan2(rise, hw)), d1 = cd + 0.15, ov = 0.12;
    const tE = ta - ov * rise / hw, tP = ta + rise;
    const d0 = mainEave ? -Math.max(0, tP - (mainEave.H - 0.02)) / mainEave.tanP : 0;
    const uvf = q => { const v = sd(q); return [v[1], -Math.abs(v[0] - cs) / cosc]; };
    for (const sg of [-1, 1]) {
      const se = cs + sg * (hw + ov);
      const T = [WP(w, se, tE, d0), WP(w, se, tE, d1), WP(w, cs, tP, d1), WP(w, cs, tP, d0)], B = T.map(dn);
      const up = hv(sg * rise / hw, 1, 0);
      poly("roof", T, up, uvf); poly("roof", B, neg(up), uvf);
      poly("trim", [T[0], T[1], B[1], B[0]], hv(sg, 0, 0));
      poly("trim", [T[1], T[2], B[2], B[1]], hv(0, 0, 1));
    }
    const gt = [WP(w, sL, ta, cd), WP(w, sR, ta, cd), WP(w, cs, tP - thc - 0.02, cd)];
    poly("walls", gt, w.n); poly("walls", gt, neg(w.n));
    const sl = cs - hw - ov, sr = cs + hw + ov;
    prism("collision", [[sl, ta - 0.16], [sr, ta - 0.16], [sr, tE], [cs, tP], [sl, tE]], ([sv, t], k) => WP(w, sv, t, k ? d1 : d0));
  }
  wbox("trim", w, sL, sR, ta - 0.16, ta, cd - 0.1, cd);
  for (const sg of [-1, 1]) {
    const sb = cs + sg * (hw - 0.08);
    wbox("trim", w, sb - 0.05, sb + 0.05, ta - 0.16, ta, 0, cd);
    if (type === "porch") {
      wbox("trim", w, sb - 0.06, sb + 0.06, 0, ta - 0.16, cd - 0.14, cd - 0.02);
      wbox("collision", w, sb - 0.06, sb + 0.06, 0, ta - 0.16, cd - 0.14, cd - 0.02);
    }
    else sbox("trim", w, sb, 0.08, [0.02, ta - 0.9], [cd * 0.7, ta - 0.16]);
  }
  if (type === "porch") {
    wbox("foundation", w, sL, sR, -Math.max(F, 0.06), 0, 0, cd);
    wbox("collision", w, sL, sR, -Math.max(F, 0.06), 0, 0, cd);
    const n = F > 0.1 ? Math.max(1, Math.round(F / 0.18)) : 0, rh = n ? F / n : 0, stw = Math.min(cw - 0.3, 1.4);
    for (let k = 1; k < n; k++) {
      wbox("foundation", w, cs - stw/2, cs + stw/2, -F, -k * rh, cd, cd + k * 0.28);
      wbox("collision", w, cs - stw/2, cs + stw/2, -F, -k * rh, cd, cd + k * 0.28);
    }
    for (const sg of [-1, 1]) {
      const sr = cs + sg * (hw - 0.08);
      wbox("trim", w, sr - 0.04, sr + 0.04, 0.85, 0.92, 0, cd - 0.14);
      wbox("trim", w, sr - 0.03, sr + 0.03, 0.08, 0.14, 0, cd - 0.14);
      for (let d = 0.12; d < cd - 0.2; d += 0.14) wbox("trim", w, sr - 0.02, sr + 0.02, 0.14, 0.85, d - 0.02, d + 0.02);
      // The railing as one solid panel, so nothing slips between the balusters.
      wbox("collision", w, sr - 0.04, sr + 0.04, 0, 0.92, 0, cd - 0.14);
    }
  }
}

function build() {
  // "collision" collects simple closed solids next to the visual meshes; it is split off at the end.
  rooms = []; downpipes = [];
  G = {}; [...MATS, "collision"].forEach(m => G[m] = {p:[], n:[], uv:[], i:[]});
  G.curtain.c = [];
  const W = p.width, D = p.depth, F = p.foundation, fh = p.floorHeight, H = p.floors * fh + (p.halfStorey ? p.kneeWall : 0), top = F + H;
  const tanP = Math.tan(p.roofPitch * Math.PI / 180), o = p.overhang, th = 0.16;
  const ridgeX = p.roofType === "hip" ? W >= D : p.ridge === "width";
  const Lr = ridgeX ? W : D, span = ridgeX ? D : W;
  const M = (a,y,b) => ridgeX ? [a,y,b] : [b,y,a];
  const rise = span / 2 * tanP;
  const ridgeY = p.roofType === "flat" ? top + 0.3 : top + rise;
  const eaveY = top - o * tanP;
  const dn = q => [q[0], q[1] - th, q[2]];
  const cosP = Math.cos(p.roofPitch * Math.PI / 180);
  const A = q => ridgeX ? q[0] : q[2], B = q => ridgeX ? q[2] : q[0];
  const uvSide = q => [A(q), -Math.abs(B(q)) / cosP];
  const uvEnd = q => [B(q), -Math.abs(A(q)) / cosP];
  const yRoof = b => ridgeY - tanP * b, tanS = tanP * 0.35, attic = F + p.floors * fh;
  const hAx = Lr/2 + (p.roofType === "hip" ? o : Math.min(o, 0.5)), hBx = span/2 + o, rhx = Math.max(0, Lr/2 - span/2);
  const ext = b => p.roofType === "hip" ? rhx + b * (hAx - rhx) / hBx : Lr / 2;
  const DORMS = {"1": [], "-1": []};
  for (const d of p.dormers) {
    d._hidden = true;
    if (p.roofType === "flat") continue;
    const s = d.side, hw = Math.min(d.w, Lr - 1) / 2, hwr = hw + 0.15, ac = (d.pos - 0.5) * Lr;
    const fr = d.type === "frontespis", shed = d.type === "shed", tanD = shed ? tanS : tanP;
    const bf = fr ? span/2 : Math.max(0.6, span/2 - d.setback), yb = yRoof(bf);
    let ye = Math.max(attic + d.wallH, yb + 0.9), be, br, yrd;
    if (shed) { ye = Math.min(ye, ridgeY - bf * tanS - 0.3 * (tanP - tanS)); br = (ridgeY - ye - bf * tanS) / (tanP - tanS); be = br; yrd = yRoof(br); }
    else { ye = Math.min(ye, ridgeY - (0.3 + hwr) * tanP); yrd = ye + hwr * tanP; be = (ridgeY - ye) / tanP; br = (ridgeY - yrd) / tanP; }
    if (ye - yb < 0.7 || br < 0.25 || Math.abs(ac) + hwr > ext(br) - 0.2) continue;
    if (DORMS[s].some(X => Math.abs(X.ac - ac) < X.hwr + hwr + 0.2)) continue;
    d._hidden = false;
    DORMS[s].push({d, s, hw, hwr, ac, fr, bf, yb, ye, be, br, yrd, tanD, bfront: bf + (fr ? Math.max(0.2, Math.min(o, 0.6)) : 0.25)});
  }
  const slopeRoof = (s, S, up) => {
    for (const q of slopePieces(S, DORMS[s])) {
      const T = q.map(([a, b]) => M(a, yRoof(b), s * b));
      poly("roof", T, up, uvSide); poly("roof", T.map(dn), neg(up), uvSide);
    }
  };
  const cutsFor = s => DORMS[s].filter(X => X.fr).map(X => [X.ac - X.hw, X.ac + X.hw]);
  const segs = (a0, a1, cuts) => {
    const out = []; let x = a0;
    for (const [c0, c1] of cuts.slice().sort((u, v) => u[0] - v[0])) { if (c0 > x) out.push([x, Math.min(c0, a1)]); x = Math.max(x, c1); }
    if (x < a1) out.push([x, a1]);
    return out.filter(([u, v]) => v - u > 0.01);
  };
  const eaveFascia = (s, a0, a1, hB) => {
    for (const [x0, x1] of segs(a0, a1, cutsFor(s))) {
      const T = [M(x0, eaveY, s * hB), M(x1, eaveY, s * hB)];
      poly("trim", [T[0], T[1], dn(T[1]), dn(T[0])], M(0, 0, s));
    }
  };
  const buildDormer = X => {
    const {d, s, hw, hwr, ac, bf, yb, ye, be, br, yrd, bfront, tanD} = X;
    const thD = 0.12, dnD = q => [q[0], q[1] - thD, q[2]];
    const n = M(0, 0, s), u = cross(UP, n);
    const P1 = M(ac - hw, yb, s * bf), P2 = M(ac + hw, yb, s * bf);
    const w = {o: dot(P1, u) < dot(P2, u) ? P1 : P2, u, n, L: 2 * hw};
    const Hd = ye - yb, R = d.type === "shed" ? 0 : Math.max(0, yrd - ye - thD);
    const topAt = sv => Hd + R * Math.max(0, 1 - Math.abs(sv - w.L / 2) / (w.L / 2));
    const ops = [], slot = w.L / d.n, t0 = Math.max(0.15, attic + 0.8 - yb);
    for (let i = 0; i < d.n; i++) {
      const ww = Math.min(d.ww, slot - 0.3), c = slot * (i + 0.5);
      const t1 = Math.min(t0 + d.wh, Math.min(topAt(c - ww/2 - 0.1), topAt(c + ww/2 + 0.1)) - 0.15);
      if (ww >= 0.3 && t1 - t0 >= 0.4) ops.push({s0: c - ww/2, s1: c + ww/2, t0, t1, kind: "window"});
    }
    buildWall(w, ops, Hd, R, F, {topAt, dormer: d});
    for (const sv of [0, w.L]) wbox("trim", w, sv - 0.07, sv + 0.07, 0, Hd, -0.07, 0.03);
    for (const sg of [-1, 1]) {
      const a = ac + sg * hw, back = d.type === "shed" ? [br, yRoof(br)] : [be, ye];
      poly("walls", [M(a, yb, s * bf), M(a, ye, s * bf), M(a, back[1], s * back[0])], M(sg, 0, 0));
    }
    if (d.type === "shed") {
      const ys = b => ye + (bf - b) * tanD, cosS = Math.cos(Math.atan(tanD));
      const T = [M(ac - hwr, ys(br), s*br), M(ac + hwr, ys(br), s*br), M(ac + hwr, ys(bfront), s*bfront), M(ac - hwr, ys(bfront), s*bfront)], Bt = T.map(dnD);
      const uvf = q => [A(q), -Math.abs(B(q)) / cosS], up = M(0, 1, s * tanD);
      poly("roof", T, up, uvf); poly("roof", Bt, neg(up), uvf);
      poly("trim", [T[2], T[3], Bt[3], Bt[2]], M(0, 0, s));
      poly("trim", [T[1], T[2], Bt[2], Bt[1]], M(1, 0, 0));
      poly("trim", [T[3], T[0], Bt[0], Bt[3]], M(-1, 0, 0));
    } else {
      const cosD = Math.cos(Math.atan(tanD)), uvf = q => [Math.abs(B(q)), -Math.abs(A(q) - ac) / cosD];
      for (const sg of [-1, 1]) {
        const ae = ac + sg * hwr;
        const T = [M(ae, ye, s*be), M(ae, ye, s*bfront), M(ac, yrd, s*bfront), M(ac, yrd, s*br)], Bt = T.map(dnD);
        const up = M(sg * tanD, 1, 0);
        poly("roof", T, up, uvf); poly("roof", Bt, neg(up), uvf);
        poly("trim", [T[0], T[1], Bt[1], Bt[0]], M(sg, 0, 0));
        poly("trim", [T[1], T[2], Bt[2], Bt[1]], M(0, 0, s));
      }
    }
    // Collision: from the front wall back to where the dormer meets the main roof. The part
    // below the main roof is hidden inside the roof's own collision.
    const at = k => (k ? bf : br) * s;
    if (d.type === "shed") {
      const ys = b => ye + (bf - b) * tanD;
      prism("collision", [[br, yb], [bf, yb], [bf, ys(bf)], [br, ys(br)]], ([b, y], k) => M(k ? ac + hw : ac - hw, y, s * b));
    } else {
      const yc = yrd - hw * tanD;
      prism("collision", [[ac - hw, yb], [ac + hw, yb], [ac + hw, yc], [ac, yrd], [ac - hw, yc]], ([a, y], k) => M(a, y, at(k)));
    }
  };

  const WS = {
    front: {o:[-W/2,F, D/2], u:[1,0,0],  n:[0,0,1],  L:W},
    back:  {o:[ W/2,F,-D/2], u:[-1,0,0], n:[0,0,-1], L:W},
    right: {o:[ W/2,F, D/2], u:[0,0,-1], n:[1,0,0],  L:D},
    left:  {o:[-W/2,F,-D/2], u:[0,0,1],  n:[-1,0,0], L:D}
  };
  let entr = null;
  opsByWall = {};
  for (const key in WS) {
    const gable = p.roofType === "gable" && (ridgeX ? (key === "left" || key === "right") : (key === "front" || key === "back"));
    const R = gable ? Math.max(0, rise - th) : 0, Lw = WS[key].L;
    const ops = layoutWall(key, Lw, fh, sv => H + R * Math.max(0, 1 - Math.abs(sv - Lw/2) / (Lw/2)));
    buildWall(WS[key], ops, H, R, F, {topAt: sv => H + R * Math.max(0, 1 - Math.abs(sv - Lw/2) / (Lw/2))});
    opsByWall[key] = {w: WS[key], ops};
    const dOp = ops.find(op => op.kind === "door");
    if (dOp) entr = {w: WS[key], o: dOp, key, gable};
  }
  if (entr && p.entrance !== "none") {
    let limit = 1e9;
    if (p.roofType === "flat") limit = H - 0.05;
    else if (!entr.gable && p.entrance === "shed") limit = H - th - Math.min(o, p.entranceDepth + 0.15) * tanP - 0.05;
    const k = entr.key;
    if (p.floors > 1 && p.windows.some(x => x.wall === k && x.floor === 1)) limit = Math.min(limit, fh + Math.min(...p.windows.filter(x => x.wall === k && x.floor === 1).map(x => x.sill)) - 0.1);
    const mainEave = !entr.gable && p.roofType !== "flat" ? {H, tanP} : null;
    buildEntrance(entr.w, entr.o, limit, F, mainEave);
  }
  const roofUnder = (x, z) => {
    if (p.roofType === "flat") return top;
    const a = Math.abs(ridgeX ? x : z), b = Math.abs(ridgeX ? z : x);
    const d = p.roofType === "hip" ? Math.max(b, a - Math.max(0, Lr/2 - span/2)) : b;
    return ridgeY - th - d * tanP - 0.01;
  };
  for (const sx of [-1,1]) for (const sz of [-1,1]) {
    const x0 = sx*W/2 - 0.09, x1 = sx*W/2 + 0.09, z0 = sz*D/2 - 0.09, z1 = sz*D/2 + 0.09;
    box("trim", (a, b, c) => { const x = lerp(x0, x1, a), z = lerp(z0, z1, c); return [x, b ? roofUnder(x, z) : F, z]; }, [1,0,0], UP, [0,0,1]);
  }
  if (F > 0.01) abox("foundation", [-W/2 - 0.06, 0, -D/2 - 0.06], [W/2 + 0.06, F, D/2 + 0.06]);
  abox("collision", [-W/2, 0, -D/2], [W/2, top, D/2]);

  if (p.roofType === "gable") {
    const hA = Lr/2 + Math.min(o, 0.5), hB = span/2 + o;
    for (const s of [1,-1]) {
      const t = [M(-hA,eaveY,s*hB), M(hA,eaveY,s*hB), M(hA,ridgeY,0), M(-hA,ridgeY,0)], b = t.map(dn);
      const up = M(0,1,s*tanP);
      slopeRoof(s, [[-hA,0],[hA,0],[hA,hB],[-hA,hB]], up);
      eaveFascia(s, -hA, hA, hB);
      poly("trim", [t[1],t[2],b[2],b[1]], M(1,0,0));
      poly("trim", [t[3],t[0],b[0],b[3]], M(-1,0,0));
    }
    abox("roof", M(-hA, ridgeY - 0.04, -0.1), M(hA, ridgeY + 0.07, 0.1));
    // Collision: the roof as one solid, from the eaves up to the ridge, gable end to gable end.
    prism("collision", [[-hB, eaveY], [hB, eaveY], [0, ridgeY]], ([b, y], k) => M(k ? hA : -hA, y, b));
  } else if (p.roofType === "hip") {
    const hA = Lr/2 + o, hB = span/2 + o, rh = Math.max(0, Lr/2 - span/2);
    for (const s of [1,-1]) {
      const up = M(0,1,s*tanP);
      slopeRoof(s, [[-rh,0],[rh,0],[hA,hB],[-hA,hB]], up);
      eaveFascia(s, -hA, hA, hB);
      const e = [M(s*hA,eaveY,-hB), M(s*hA,eaveY,hB), M(s*rh,ridgeY,0)], eb = e.map(dn);
      const eu = M(s*tanP,1,0);
      poly("roof", e, eu, uvEnd); poly("roof", eb, neg(eu), uvEnd);
      poly("trim", [e[0],e[1],eb[1],eb[0]], M(s,0,0));
    }
    if (rh > 0.05) abox("roof", M(-rh, ridgeY - 0.04, -0.1), M(rh, ridgeY + 0.07, 0.1));
    // Collision: eave rectangle up to the ridge (a pyramid when the ridge has no length).
    const E = (a, b) => M(a * hA, eaveY, b * hB), Rr = a => M(a * rh, ridgeY, 0);
    solid("collision", [
      [E(-1,-1), E(1,-1), E(1,1), E(-1,1)],
      ...[1, -1].map(s => [E(-1,s), E(1,s), Rr(1), Rr(-1)]),
      ...[1, -1].map(s => [E(s,-1), E(s,1), Rr(s)])]);
  } else {
    const oo = Math.min(o, 0.4);
    abox("roof", [-W/2 - oo, top, -D/2 - oo], [W/2 + oo, top + 0.3, D/2 + oo]);
    abox("collision", [-W/2 - oo, top, -D/2 - oo], [W/2 + oo, top + 0.3, D/2 + oo]);
  }

  for (const s of [1, -1]) for (const X of DORMS[s]) buildDormer(X);

  if (p.gutters && p.roofType !== "flat") {
    const r = 0.065, hip = p.roofType === "hip";
    const hA = Lr/2 + (hip ? o : Math.min(o, 0.5)), hB = span/2 + o, yT = eaveY - 0.06;
    for (const s of [1, -1]) {
      const bg = s * (hB + r - 0.02);
      for (const [x0, x1] of segs(-hA - (hip ? r : 0), hA + (hip ? r : 0), cutsFor(s))) gutterRun(M(x0, yT, bg), M(x1, yT, bg), M(0, 0, s), r);
      if (hip) { const ag = s * (hA + r - 0.02); gutterRun(M(ag, yT, -hB), M(ag, yT, hB), M(s, 0, 0), r); }
      const bw = s * (span/2 + 0.09), yb = yT - r;
      const ends = p.downpipes === 2 ? [-1, 1] : p.downpipes === 1 ? [s] : [];
      for (const e of ends) {
        const ap = e * (Lr/2 - 0.3);
        if (cutsFor(s).some(([c0, c1]) => ap > c0 - 0.2 && ap < c1 + 0.2)) continue;
        const q0 = M(ap, yb + 0.03, bg), q1 = M(ap, yb - 0.12, bg);
        const q2 = M(ap, yb - 0.12 - Math.abs(bg - bw) * 0.9, bw);
        const q3 = M(ap, 0.3, bw), q4 = M(ap, 0.1, s * (span/2 + 0.28));
        // One pipe with rounded elbows: out of the gutter, in to the wall, down, and out at the foot.
        const route = [q0, q1, q2, q3, q4];
        downpipes.push({path: route, r: 0.045});
        addMesh("gutter", pipeMesh(route, 0.045));
        for (let y = 1.0; y < q2[1] - 0.4; y += 1.6) abox("gutter", M(ap - 0.015, y, s * span/2), M(ap + 0.015, y + 0.04, bw));
      }
    }
  }

  if (p.chimney) {
    const c = M(Lr * 0.22, 0, 0);
    const ytop = p.roofType === "flat" ? top + 1.3 : ridgeY + 0.7;
    abox("chimney", [c[0]-0.3, top - 0.2, c[2]-0.3], [c[0]+0.3, ytop, c[2]+0.3]);
    abox("chimney", [c[0]-0.36, ytop, c[2]-0.36], [c[0]+0.36, ytop + 0.1, c[2]+0.36]);
    abox("collision", [c[0]-0.3, top - 0.2, c[2]-0.3], [c[0]+0.3, ytop + 0.1, c[2]+0.3]);
  }
  dims = {W, D, top, ridgeY, F};
}
build();
const {collision, ...visual} = G;
return {G: visual, dims, opsByWall, collision, rooms, downpipes};
}

/* ---------- Materials ---------- */
export function colorFor(p, m) {
  return {walls:p.wallColor, trim:p.trimColor, roof:p.roofColor, glass:"#2E3B44", door:p.doorColor, foundation:p.foundationColor, chimney:p.chimneyColor, gutter:p.gutterColor, interior:"#B8AE9C", curtain:p.curtainColor}[m];
}
export function surfaceSpec(p, m) {
  const kind = m === "walls" ? p.wallCladding
    : m === "roof" ? (p.roofType === "flat" ? "felt" : p.roofMaterial === "plain" ? null : p.roofMaterial)
    : m === "chimney" ? (p.chimneyStyle === "brick" ? "brick" : null)
    : m === "trim" ? "paintedwood" : null;
  if (!kind) return null;
  const sp = p.panelSpacing;
  if (kind === "lockpanel") { const n = Math.max(2, Math.round(1.2 / sp)); return {kind, n, bw: Math.min(0.8, p.battenWidth / sp), w: n*sp, h: n*sp}; }
  if (kind === "horizontal") { const n = Math.max(2, Math.round(1.2 / sp)); return {kind, n, w: n*sp, h: n*sp}; }
  if (kind === "tiles") return {kind, w: 1.2, h: 1.36};
  if (kind === "brick") return {kind, w: 1.0, h: 0.6};
  if (kind === "paintedwood") return {kind, w: 1.5, h: 1.5};
  return {kind, w: 2, h: 2};
}
export function scaledUV(p, m, g) {
  const s = surfaceSpec(p, m);
  return s ? g.uv.map((v, i) => i % 2 ? v / s.h : v / s.w) : g.uv;
}

/* ---------- Placement areas ---------- */
/**
 * Areas an FS25 placeable needs, from built geometry (buildGeometry's result):
 *   level: rectangle on the ground that is leveled (footprint + LEVEL_MARGIN)
 *   clear: rectangle where grass and fields are removed (the footprint)
 *   test:  box around the whole house, checked for overlap when placing
 * The footprint is everything that touches the ground: walls, foundation, porch, steps.
 */
const LEVEL_MARGIN = 0.5;
export function placementAreas(geo) {
  const all = [], ground = [];
  for (const m of MATS) {
    const g = geo.G[m];
    for (let i = 0; i < g.p.length; i += 3) {
      const v = [g.p[i], g.p[i+1], g.p[i+2]];
      all.push(v);
      if (v[1] < 0.01) ground.push(v);
    }
  }
  const lo = (pts, k) => Math.min(...pts.map(v => v[k])), hi = (pts, k) => Math.max(...pts.map(v => v[k]));
  const clear = {x0: lo(ground, 0), x1: hi(ground, 0), z0: lo(ground, 2), z1: hi(ground, 2)};
  const m = LEVEL_MARGIN;
  return {
    clear,
    level: {x0: clear.x0 - m, x1: clear.x1 + m, z0: clear.z0 - m, z1: clear.z1 + m},
    test: {min: [lo(all, 0), Math.min(0, lo(all, 1)), lo(all, 2)], max: [hi(all, 0), hi(all, 1), hi(all, 2)]},
  };
}

/* ---------- Sleep point ---------- */
/**
 * Where the player sleeps, from built geometry, like the base game's farmhouses:
 *   trigger: box (world-axis center + size) in front of the door, ground to above head height
 *   marker:  where the floating bed icon sits (on the floor at the door)
 *   spawn:   on the ground outside the cleared area, facing the house
 *   camera:  view while sleeping, above and in front of the house; rot = [pitch, yaw, 0] degrees
 */
export function sleepPoint(geo) {
  const {dims} = geo;
  const {w, ops} = Object.values(geo.opsByWall).find(e => e.ops.some(o => o.kind === "door"));
  const door = ops.find(o => o.kind === "door"), sc = (door.s0 + door.s1) / 2;
  const at = (d, y) => [w.o[0] + w.u[0]*sc + w.n[0]*d, y, w.o[2] + w.u[2]*sc + w.n[2]*d];
  const toward = (from, to) => {
    const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2], deg = 180 / Math.PI;
    return [Math.atan2(dy, Math.hypot(dx, dz)) * deg, Math.atan2(-dx, -dz) * deg, 0];
  };
  const along = 1.8, out = 1.8, h = dims.F + 2.2;
  const ax = Math.abs(w.u[0]) > 0.5;
  const trigger = {center: at(out / 2, h / 2), size: ax ? [along, h, out] : [out, h, along]};
  const marker = at(out / 2, dims.F);
  // Distance from the wall to the far side of the cleared area, then one metre more.
  const {clear} = placementAreas(geo);
  const reach = Math.max(...[[clear.x0, clear.z0], [clear.x1, clear.z0], [clear.x0, clear.z1], [clear.x1, clear.z1]]
    .map(([x, z]) => (x - w.o[0]) * w.n[0] + (z - w.o[2]) * w.n[2]));
  const target = [0, dims.ridgeY * 0.45, 0];
  const sp = at(reach + 1, 0);
  const dist = Math.max(dims.W, dims.D) * 1.2 + 6;
  const cam = [w.o[0] + w.u[0]*sc + (w.n[0] + w.u[0]*0.6) * dist, dims.ridgeY + dist * 0.4, w.o[2] + w.u[2]*sc + (w.n[2] + w.u[2]*0.6) * dist];
  return {trigger, marker, spawn: {pos: sp, rot: [0, toward(sp, target)[1], 0]}, camera: {pos: cam, rot: toward(cam, target)}};
}

/**
 * Blocks to paste into the placeable XML. Node paths match the scene that buildI3d writes:
 * house > clearAreas(0), levelAreas(1), testAreas(2), tipOcclusionUpdateAreas(3), visuals(4), collisions(5),
 * the same layout as the base game's garden sheds, plus farmhouseFeatures(6) with the sleep point.
 */
export function placeableSnippet(p = DEFAULTS) {
  return `<!-- Paste these into your placeable XML (inside <placeable>). Generated by House to i3d. -->
${p.sleepPoint ? `
    <!-- Sleep point: use <placeable type="farmhouse" ...> so the player can sleep here, as in the base game's farmhouses. -->` : ""}${placeableBlocks(p)}`;
}
function placeableBlocks(p) {
  const sleep = p.sleepPoint ? `
    <hotspots>
        <hotspot type="FARM" linkNode="0>" teleportNode="spawnPoint"/>
    </hotspots>

    <triggerMarkers>
        <triggerMarker node="sleepTriggerMarker" filename="$data/shared/assets/marker/markerIconSleep.i3d"/>
    </triggerMarkers>

    <farmhouse spawnNode="spawnPoint">
        <sleeping triggerNode="sleepingTrigger" cameraNode="sleepCamera"/>
    </farmhouse>

    <!-- Inside the walls: no rain, and the farmhouse knows where indoors is. -->
    <indoorAreas>
        <indoorArea startNode="indoorAreaStart01" widthNode="indoorAreaWidth01" heightNode="indoorAreaHeight01"/>
    </indoorAreas>
` : "";
  const sleepMaps = p.sleepPoint ? `
        <i3dMapping id="sleepingTrigger" node="0>6|0"/>
        <i3dMapping id="sleepTriggerMarker" node="0>6|1"/>
        <i3dMapping id="spawnPoint" node="0>6|2"/>
        <i3dMapping id="sleepCamera" node="0>6|3"/>
        <i3dMapping id="indoorAreaStart01" node="0>7|0"/>
        <i3dMapping id="indoorAreaWidth01" node="0>7|0|0"/>
        <i3dMapping id="indoorAreaHeight01" node="0>7|0|1"/>` : "";
  return `${sleep}
    <placement useRandomYRotation="false" useManualYRotation="true">
        <testAreas>
            <testArea startNode="testAreaStart01" endNode="testAreaEnd01"/>
        </testAreas>
    </placement>

    <clearAreas>
        <clearArea startNode="clearAreaStart01" widthNode="clearAreaWidth01" heightNode="clearAreaHeight01"/>
    </clearAreas>

    <!-- Add groundType="gravel" (or asphalt, concrete, dirt, grass ...) to levelArea to also paint the ground. -->
    <leveling requireLeveling="true" maxSmoothDistance="3" maxSlope="75" maxEdgeAngle="30">
        <levelAreas>
            <levelArea startNode="levelAreaStart01" widthNode="levelAreaWidth01" heightNode="levelAreaHeight01"/>
        </levelAreas>
    </leveling>

    <tipOcclusionUpdateAreas>
        <tipOcclusionUpdateArea startNode="tipOcclusionUpdateAreaStart01" endNode="tipOcclusionUpdateAreaEnd01"/>
    </tipOcclusionUpdateAreas>

    <ai>
        <updateAreas>
            <updateArea startNode="tipOcclusionUpdateAreaStart01" endNode="tipOcclusionUpdateAreaEnd01"/>
        </updateAreas>
    </ai>

    <i3dMappings>
        <i3dMapping id="clearAreaStart01" node="0>0|0"/>
        <i3dMapping id="clearAreaWidth01" node="0>0|0|0"/>
        <i3dMapping id="clearAreaHeight01" node="0>0|0|1"/>
        <i3dMapping id="levelAreaStart01" node="0>1|0"/>
        <i3dMapping id="levelAreaWidth01" node="0>1|0|0"/>
        <i3dMapping id="levelAreaHeight01" node="0>1|0|1"/>
        <i3dMapping id="testAreaStart01" node="0>2|0"/>
        <i3dMapping id="testAreaEnd01" node="0>2|0|0"/>
        <i3dMapping id="tipOcclusionUpdateAreaStart01" node="0>3|0"/>
        <i3dMapping id="tipOcclusionUpdateAreaEnd01" node="0>3|0|0"/>${sleepMaps}
    </i3dMappings>
`;
}

/* ---------- Game mod ---------- */
/** File names inside the mod zip. */
export const MOD_FILES = {i3d: "house.i3d", xml: "house.xml", icon: "icon.png", store: "store.png"};
/** modDesc version the mod declares (FS25; most house mods use this one). */
export const MOD_DESC_VERSION = 108;
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cdata = s => "<![CDATA[" + String(s).replace(/]]>/g, "]]]]><![CDATA[>") + "]]>";
const shopName = name => String(name || "").trim() || "House";

/** The placeable (store item) XML for the mod: shop data and the same blocks as placeableSnippet. */
export function placeableXml(p, name) {
  const farm = !!p.sleepPoint;
  return `<?xml version="1.0" encoding="utf-8" standalone="no" ?>
<placeable type="${farm ? "farmhouse" : "simplePlaceable"}">
    <!-- Generated by House to i3d. -->
    <storeData>
        <name>${esc(shopName(name))}</name>
        <functions>
            <function>${farm ? "$l10n_function_farmHouse" : "$l10n_function_decoration"}</function>
        </functions>
        <image>${MOD_FILES.store}</image>
        <canBeSold>true</canBeSold>
        <showInStore>true</showInStore>
        <price>${Math.round(p.modPrice)}</price>
        <lifetime>1000</lifetime>
        <dailyUpkeep>${Math.round(p.modUpkeep)}</dailyUpkeep>
        <rotation>0</rotation>
        <brand>NONE</brand>
        <species>PLACEABLE</species>
        <category>farmhouses</category>
        <brush>
            <type>placeable</type>
            <category>buildings</category>
            <tab>farmhouses</tab>
        </brush>
    </storeData>

    <base>
        <filename>${MOD_FILES.i3d}</filename>
        <canBeRenamed>true</canBeRenamed>
    </base>
${placeableBlocks(p)}</placeable>
`;
}

/** Author name for a user ({name, email}): their name, else the part of the email before the @. */
export function authorName(user) {
  if (!user) return "";
  return String(user.name || "").trim() || String(user.email || "").split("@")[0].trim();
}

/** Description used when the house has none of its own. */
export function defaultModDescription(p) {
  return `A ${(+p.width).toFixed(1)} x ${(+p.depth).toFixed(1)} m house made with House to i3d.${p.sleepPoint ? " Sleep here to skip the night." : ""}`;
}

/** modDesc.xml for the mod. author: used when the house has no author of its own (the logged-in user). */
export function modDescXml(p, name, {author = ""} = {}) {
  const desc = p.modDescription || defaultModDescription(p);
  return `<?xml version="1.0" encoding="utf-8" standalone="no" ?>
<modDesc descVersion="${MOD_DESC_VERSION}">
    <author>${esc(p.modAuthor || String(author).trim() || "House to i3d")}</author>
    <version>1.0.0.0</version>
    <title>
        <en>${esc(shopName(name))}</en>
    </title>
    <description>
        <en>${cdata(desc)}</en>
    </description>
    <iconFilename>${MOD_FILES.icon}</iconFilename>
    <multiplayer supported="true"/>
    <storeItems>
        <storeItem xmlFilename="${MOD_FILES.xml}"/>
    </storeItems>
</modDesc>
`;
}

/* ---------- i3d export ---------- */
const num = v => { const r = Math.round(v * 10000) / 10000; return (Object.is(r, -0) ? 0 : r).toString(); };
export function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map(v => num(v)).join(" ") + " 1"; }
/** Opacity of the window glass when there are rooms behind it. */
export const GLASS_ALPHA = 0.22;
const NO_SHADOW = ["glass", "interior", "curtain"];
/**
 * "CPU Mesh" flag, as Giants Editor writes it. The game keeps these meshes in memory so it can
 * rebuild their physics: placing a placeable turns its physics off and on again, and without
 * the flag our (inline, not pre-cooked) collision and trigger meshes would come back empty.
 */
const CPU_MESH = 256;
function shapeXml(name, id, g, uv, {cpu = false} = {}) {
  uv = uv || g.uv;
  const nv = g.p.length / 3, nt = g.i.length / 3;
  const v = [], t = [];
  for (let i = 0; i < nv; i++) v.push(`        <v p="${num(g.p[i*3])} ${num(g.p[i*3+1])} ${num(g.p[i*3+2])}" n="${num(g.n[i*3])} ${num(g.n[i*3+1])} ${num(g.n[i*3+2])}" t0="${num(uv[i*2])} ${num(uv[i*2+1])}"/>`);
  for (let i = 0; i < nt; i++) t.push(`        <t vi="${g.i[i*3]} ${g.i[i*3+1]} ${g.i[i*3+2]}"/>`);
  return `    <IndexedTriangleSet name="${name}" shapeId="${id}"${cpu ? ` meshUsage="${CPU_MESH}"` : ""}>
      <Vertices count="${nv}" normal="true" uv0="true">
${v.join("\n")}
      </Vertices>
      <Triangles count="${nt}">
${t.join("\n")}
      </Triangles>
      <Subsets count="1">
        <Subset firstVertex="0" numVertices="${nv}" firstIndex="0" numIndices="${g.i.length}"/>
      </Subsets>
    </IndexedTriangleSet>`;
}
/** Closed box mesh of the given size, centred on the origin, faces turned outwards. */
export function boxMesh([sx, sy, sz]) {
  const g = {p:[], n:[], uv:[], i:[]};
  for (let ax = 0; ax < 3; ax++) for (const s of [-1, 1]) {
    const n = [0, 0, 0]; n[ax] = s;
    const a = (ax + 1) % 3, b = (ax + 2) % 3, base = g.p.length / 3, h = [sx/2, sy/2, sz/2];
    for (const [ua, ub] of [[-1,-1], [1,-1], [1,1], [-1,1]]) {
      const q = [0, 0, 0]; q[ax] = s * h[ax]; q[a] = ua * h[a]; q[b] = ub * h[b];
      g.p.push(...q); g.n.push(...n); g.uv.push((ua + 1) / 2, (ub + 1) / 2);
    }
    // (a, b) winding is counter-clockwise seen from +ax; flip it for the -ax face.
    g.i.push(...(s > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]).map(k => base + k));
  }
  return g;
}
/** Splits a mesh with vertex colors (g.c) into one mesh per color, each with that color. */
function splitByColor(g) {
  const groups = new Map();
  for (let t = 0; t < g.i.length; t += 3) {
    const v = g.i[t], color = [g.c[v*3], g.c[v*3+1], g.c[v*3+2]], key = color.map(num).join(" ");
    if (!groups.has(key)) groups.set(key, {p:[], n:[], uv:[], i:[], color, map: new Map()});
    const out = groups.get(key);
    for (const u of [g.i[t], g.i[t+1], g.i[t+2]]) {
      if (!out.map.has(u)) {
        out.map.set(u, out.p.length / 3);
        out.p.push(g.p[u*3], g.p[u*3+1], g.p[u*3+2]); out.n.push(g.n[u*3], g.n[u*3+1], g.n[u*3+2]); out.uv.push(g.uv[u*2], g.uv[u*2+1]);
      }
      out.i.push(out.map.get(u));
    }
  }
  return [...groups.values()].map(({map, ...m}) => m);
}
export function buildI3d(p, {withTex = false} = {}) {
  const geo = buildGeometry(p), {G, collision: col} = geo, A = placementAreas(geo);
  // One part per material, except curtains: one part per curtain color (i3d materials have one color).
  const parts = [];
  for (const m of MATS) {
    if (!G[m].i.length) continue;
    if (m === "curtain") splitByColor(G[m]).forEach((g, j) => parts.push({name: j ? `curtain${j + 1}` : "curtain", m, g}));
    else parts.push({name: m, m, g: G[m]});
  }
  const used = parts;
  const files = []; let fid = 1;
  const mats = parts.map(({name, m, g}, k) => {
    if (g.color) return `    <Material name="${name}_mat" materialId="${k+1}" diffuseColor="${g.color.map(num).join(" ")} 1"/>`;
    if (withTex && surfaceSpec(p, m)) {
      const d = fid++, n = fid++;
      files.push(`    <File fileId="${d}" filename="textures/${m}_diffuse.png"/>`, `    <File fileId="${n}" filename="textures/${m}_normal.png"/>`);
      return `    <Material name="${m}_mat" materialId="${k+1}">\n      <Texture fileId="${d}"/>\n      <Normalmap fileId="${n}"/>\n    </Material>`;
    }
    // See-through glass (with rooms behind it) and the room atlas: base-game style alphaBlending on a texture.
    const glassy = m === "glass" && p.interior;
    if (withTex && (glassy || m === "interior")) {
      const d = fid++;
      files.push(`    <File fileId="${d}" filename="textures/${m}_diffuse.png"/>`);
      return `    <Material name="${m}_mat" materialId="${k+1}"${glassy ? ' alphaBlending="true"' : ""}>\n      <Texture fileId="${d}"/>\n    </Material>`;
    }
    if (glassy) return `    <Material name="${m}_mat" materialId="${k+1}" diffuseColor="${rgb(colorFor(p, m)).replace(/ 1$/, " " + GLASS_ALPHA)}" alphaBlending="true"/>`;
    return `    <Material name="${m}_mat" materialId="${k+1}" diffuseColor="${rgb(colorFor(p, m))}"/>`;
  });
  const shapes = parts.map(({name, m, g}, k) => shapeXml(name, k + 1, g, scaledUV(p, m, g)));
  const cid = used.length + 1;
  shapes.push(shapeXml("collision", cid, col, null, {cpu: true}));
  const sleep = p.sleepPoint ? sleepPoint(geo) : null, tid = cid + 1;
  if (sleep) shapes.push(shapeXml("sleepingTrigger", tid, boxMesh(sleep.trigger.size), null, {cpu: true}));
  let nid = 2;
  // Empty transform group; kids() builds its children after this node got its id, so ids run top-down.
  const tg = (name, pos, depth, kids) => {
    const ind = "  ".repeat(depth), head = `${ind}<TransformGroup name="${name}" translation="${pos.map(num).join(" ")}" nodeId="${nid++}"`;
    return kids ? `${head}>\n${kids().join("\n")}\n${ind}</TransformGroup>` : head + "/>";
  };
  // Rectangle on the ground as start + width (along z) + height (along x), like the base game.
  const rect = (kind, r) => tg(`${kind}Areas`, [0, 0, 0], 3, () => [tg(`${kind}AreaStart01`, [r.x0, 0, r.z0], 4, () => [
    tg(`${kind}AreaWidth01`, [0, 0, r.z1 - r.z0], 5),
    tg(`${kind}AreaHeight01`, [r.x1 - r.x0, 0, 0], 5)])]);
  // Box or rectangle from start to end, with end a child of start.
  const corner = (group, kind, min, max) => tg(group, [0, 0, 0], 3, () => [tg(`${kind}Start01`, min, 4, () => [
    tg(`${kind}End01`, max.map((v, i) => v - min[i]), 5)])]);
  const t = A.test;
  const areas = [
    rect("clear", A.clear),
    rect("level", A.level),
    corner("testAreas", "testArea", t.min, t.max),
    corner("tipOcclusionUpdateAreas", "tipOcclusionUpdateArea", [t.min[0], 0, t.min[2]], [t.max[0], 0, t.max[2]]),
  ];
  const visualsId = nid++;
  const nodes = parts.map(({name, m}, k) => `        <Shape name="${name}" shapeId="${k+1}" nodeId="${nid++}" castsShadows="${NO_SHADOW.includes(m) && (m !== "glass" || p.interior) ? "false" : "true"}" receiveShadows="true" materialIds="${k+1}"/>`);
  const collisionsId = nid++, collisionId = nid++;
  const v3 = a => a.map(num).join(" ");
  let features = "";
  if (sleep) {
    const fid = nid++, trId = nid++, mkId = nid++, spId = nid++, caId = nid++;
    features = `
      <TransformGroup name="farmhouseFeatures" nodeId="${fid}">
        <Shape name="sleepingTrigger" translation="${v3(sleep.trigger.center)}" shapeId="${tid}" nodeId="${trId}" static="true" trigger="true" collisionFilterGroup="0x20000000" collisionFilterMask="0x100000" nonRenderable="true" castsShadows="false" receiveShadows="false" materialIds="${used.length + 1}"/>
        <TransformGroup name="sleepTriggerMarker" translation="${v3(sleep.marker)}" nodeId="${mkId}"/>
        <TransformGroup name="spawnPoint" translation="${v3(sleep.spawn.pos)}" rotation="${v3(sleep.spawn.rot)}" nodeId="${spId}"/>
        <Camera name="sleepCamera" translation="${v3(sleep.camera.pos)}" rotation="${v3(sleep.camera.rot)}" fov="54.4322" nearClip="0.1" farClip="560" nodeId="${caId}"/>
      </TransformGroup>
${rect("indoor", {x0: -geo.dims.W / 2, x1: geo.dims.W / 2, z0: -geo.dims.D / 2, z1: geo.dims.D / 2})}`;
  }
  return `<?xml version="1.0" encoding="iso-8859-1"?>
<i3D name="house" version="1.6" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://i3d.giants.ch/schema/i3d-1.6.xsd">
  <Asset>
    <Export program="House to i3d" version="0.1"/>
  </Asset>
  ${files.length ? "<Files>\n" + files.join("\n") + "\n  </Files>" : "<Files/>"}
  <Materials>
${mats.join("\n")}
    <Material name="collision_mat" materialId="${used.length + 1}" diffuseColor="1 0 1 1"/>
  </Materials>
  <Shapes>
${shapes.join("\n")}
  </Shapes>
  <Dynamics/>
  <Scene>
    <TransformGroup name="house" nodeId="1">
${areas.join("\n")}
      <TransformGroup name="visuals" nodeId="${visualsId}">
${nodes.join("\n")}
      </TransformGroup>
      <TransformGroup name="collisions" nodeId="${collisionsId}">
        <Shape name="collision" shapeId="${cid}" nodeId="${collisionId}" static="true" collisionFilterGroup="0x3e" collisionFilterMask="0xfffffbff" nonRenderable="true" castsShadows="false" receiveShadows="false" materialIds="${used.length + 1}"/>
      </TransformGroup>${features}
    </TransformGroup>
  </Scene>
</i3D>
`;
}
