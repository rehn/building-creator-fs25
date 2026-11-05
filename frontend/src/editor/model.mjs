// Building model: settings, validation, geometry and i3d export. The core every building shares;
// what differs per kind of building (farmhouse, hen house ...) lives in kinds/.
// Pure functions with no DOM or three.js, so they run (and are tested) in Node.
import { I3dDoc, tg, shape, refNode, boxMesh, splitByColor, mappingsFor, num, v3 } from "./i3d.mjs";
import { KINDS, kindOf } from "./kinds/index.mjs";
import { WALL_T, wallFrames, doorSpan, roomOf, footprint, toWorld, cleanItems, problems } from "./layout.mjs";
import { withAssets, placement, assetFolder } from "./assets.mjs";
import { SURFACES } from "./surfaces.mjs";
export { boxMesh } from "./i3d.mjs";
export { KINDS, KIND, kindOf, groupByKind, CATEGORIES } from "./kinds/index.mjs";
export { henYard, henCap, HENS_PER_M2, MAX_HENS } from "./kinds/chicken.mjs";

/* ---------- Settings ---------- */
/** Settings every building has. A kind adds its own (kind.defaults). */
export const DEFAULTS = {
  kind:"house",
  width:10, depth:7, floors:2, floorHeight:2.7, foundation:0.4, halfStorey:false, kneeWall:0.9,
  roofType:"gable", ridge:"width", roofPitch:38, overhang:0.5, chimney:true,
  winFront:2, winBack:3, winLeft:1, winRight:1, winW:1.0, winH:1.25, sill:0.85,
  doorWall:"front", doorPos:0, doorW:1.0, doorH:2.1,
  wallCladding:"lockpanel", panelSpacing:0.2, battenWidth:0.06, roofMaterial:"tiles", chimneyStyle:"brick", chimneyColor:"#8A3B2C",
  entrance:"porch", entranceWidth:2.2, entranceDepth:1.6, gutters:true, downpipes:2, gutterColor:"#3B3F42",
  wallColor:"#8E2A1E", trimColor:"#F2EFE8", roofColor:"#2B2D2F", doorColor:"#3E5A4A", foundationColor:"#6E6E6A",
  sleepPoint:true, interior:true, curtainStyle:"sides", curtainColor:"#EFE9DC", ventilators:0,
  modPrice:75000, modUpkeep:75, modAuthor:"", modDescription:""
};
/** Curtain layouts: [id, name]. Windows can pick one or follow the house's choice ("default"). */
export const CURTAIN_OPTIONS = [["sides","Side panels and valance"],["panels","Side panels"],["valance","Valance only"],["cafe","Caf\u00E9 curtain and valance"],["none","No curtains"]];
export const CURTAIN_STYLES = CURTAIN_OPTIONS.map(o => o[0]);
/** Room types behind the windows, in atlas order: [id, name]. Windows can pick one or "auto". */
export const ROOM_OPTIONS = [["living","Living room"],["bedroom","Bedroom"],["kitchen","Kitchen"],["study","Office"]];
export const ROOM_TYPES = ROOM_OPTIONS.map(o => o[0]);
/** Wall thickness of a walk-in barn (the window and door reveals' depth), and its door leaf's. */
const LEAF_T = 0.05;
/**
 * How far a walk-in barn's door opens, degrees about +y. Every wall's frame is the front wall's
 * turned about y, so the same angle swings the leaf outwards on every wall.
 */
const DOOR_OPEN = -100;
/** How far the plinth stands out from the walls. */
const PLINTH_OUT = 0.06;
/** Doors wider than this are a pair of doors (a walk-in building's are two leaves that open together). */
export const DOUBLE_DOOR_FROM = 1.4;
/**
 * Settings as the building's kind uses them (a hen house has no sleep point, rooms or dormers ...),
 * with any of the kind's own settings that are missing taken from its defaults.
 */
const normalize = p => { const k = kindOf(p); return k.normalize({...k.defaults, ...p}); };
const pickRoom = v => ROOM_TYPES.includes(v) ? v : "auto";
const pickCurtain = v => CURTAIN_STYLES.includes(v) ? v : "default";
const pickColor = v => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : "default";
/** Editor sections every building shares (kinds hide the ones they don't use, see kind.hides). */
const SHARED_SECTIONS = [
  // side: where the editor shows the section, "build" (left / first tab) or "finish" (right / second tab).
  {title:"Size", side:"build", fields:[
    {k:"width", label:"Front wall length", min:2.5, max:30, step:0.1, unit:" m"},
    {k:"depth", label:"Side wall length", min:2.5, max:25, step:0.1, unit:" m"},
    {k:"floors", label:"Full floors", min:1, max:3, step:1},
    {k:"halfStorey", label:"Half floor in the roof (1\u00BD-plan)", type:"check"},
    {k:"kneeWall", label:"Knee wall height", min:0.2, max:1.6, step:0.05, unit:" m"},
    {k:"floorHeight", label:"Floor height", min:2.3, max:4, step:0.05, unit:" m"},
    {k:"foundation", label:"Foundation height", min:0, max:1.2, step:0.05, unit:" m"}]},
  {title:"Roof", side:"build", fields:[
    {k:"roofType", label:"Roof type", type:"select", options:[["gable","Gable"],["hip","Hip"],["flat","Flat"]]},
    {k:"ridge", label:"Ridge direction", type:"select", options:[["width","Parallel to the front"],["depth","Front to back"]]},
    {k:"roofPitch", label:"Pitch", min:5, max:60, step:1, unit:"\u00B0"},
    {k:"overhang", label:"Overhang", min:0, max:1.2, step:0.05, unit:" m"},
    {k:"chimney", label:"Chimney", type:"check"},
    {k:"gutters", label:"Rain gutters", type:"check"},
    {k:"downpipes", label:"Downpipes per long side", min:0, max:2, step:1},
    {k:"ventilators", label:"Roof ventilators (lanterns on the ridge)", min:0, max:4, step:1}]},
  {title:"Kupor (dormers)", side:"build", custom:"dormers", fields:[]},
  {title:"Windows", side:"build", custom:"windows", hint:"Set how many windows each floor has. To change one window, choose it below or tap it in the preview.", fields:[
    {k:"winW", label:"Width", min:0.4, max:2.5, step:0.05, unit:" m"},
    {k:"winH", label:"Height", min:0.4, max:2.2, step:0.05, unit:" m"},
    {k:"sill", label:"Sill height", min:0.2, max:1.5, step:0.05, unit:" m"}]},
  {title:"Door", side:"build", fields:[
    {k:"doorWall", label:"Wall", type:"select", options:[["front","Front"],["back","Back"],["left","Left side"],["right","Right side"]]},
    {k:"doorPos", label:"Position, left to right", min:-1, max:1, step:0.05},
    {k:"doorW", label:"Width", min:0.7, max:2.5, step:0.05, unit:" m"},
    {k:"doorH", label:"Height", min:1.8, max:2.6, step:0.05, unit:" m"}]},
  {title:"Entrance", side:"build", fields:[
    {k:"entrance", label:"Canopy", type:"select", options:[["none","None"],["shed","Shed canopy on brackets"],["gable","Gable canopy on brackets"],["porch","Porch with posts (förstukvist)"]]},
    {k:"entranceWidth", label:"Width", min:1.2, max:5, step:0.05, unit:" m"},
    {k:"entranceDepth", label:"Depth", min:0.6, max:3, step:0.05, unit:" m"}]},
  {title:"Inside", side:"build", custom:"inside", hint:"The pieces inside the building. Fill it automatically to match its size, then change it as you like.", fields:[]},
  {title:"Surfaces", side:"finish", fields:[
    {k:"wallCladding", label:"Wall cladding", type:"select", options:[["lockpanel","Board and batten (lockpanel)"],["horizontal","Horizontal boards"],["plaster","Plaster"]]},
    {k:"panelSpacing", label:"Board width", min:0.12, max:0.4, step:0.005, cm:true},
    {k:"battenWidth", label:"Batten width", min:0.03, max:0.1, step:0.005, cm:true},
    {k:"roofMaterial", label:"Roof covering", type:"select", options:[["tiles","Concrete tiles"],["metal","Standing seam metal"],["plain","Plain color"]]},
    {k:"chimneyStyle", label:"Chimney", type:"select", options:[["brick","Brick"],["plain","Plain color"]]}]},
  {title:"Colors", side:"finish", colors:true, fields:[
    {k:"wallColor", label:"Walls", type:"color"},
    {k:"trimColor", label:"Trim", type:"color"},
    {k:"roofColor", label:"Roof", type:"color"},
    {k:"doorColor", label:"Door", type:"color"},
    {k:"foundationColor", label:"Base", type:"color"},
    {k:"chimneyColor", label:"Chimney", type:"color"},
    {k:"gutterColor", label:"Gutters", type:"color"},
    {k:"curtainColor", label:"Curtains", type:"color"}]},
  {title:"Interior", side:"finish", hint:"A small furnished room behind each window, seen through the glass. To pick the room or curtains for one window, choose it under Windows (or a kupa under Kupor).", fields:[
    {k:"interior", label:"Rooms behind the windows", type:"check"},
    {k:"curtainStyle", label:"Curtains", type:"select", options:CURTAIN_OPTIONS}]},
  {title:"Farmhouse", side:"finish", hint:"Players sleep outside the door, where the bed icon floats. With this on, the export is a farmhouse placeable with a sleep trigger, spawn point and farm map icon.", fields:[
    {k:"sleepPoint", label:"Sleep point with bed icon", type:"check"}]},
  {title:"Game mod", side:"finish", hint:"Used by \u201CExport game mod\u201D: what the house costs in the shop and who made it. The project name is the name in the shop.", fields:[
    {k:"modPrice", label:"Price", min:0, max:2000000, step:500, money:true},
    {k:"modUpkeep", label:"Daily upkeep", min:0, max:5000, step:5, money:true},
    {k:"modAuthor", label:"Author (empty: your name)", type:"text", max:60},
    {k:"modDescription", label:"Description in the mod list (empty: made for you)", type:"text", max:1000, multiline:true}]}
];
/**
 * All editor sections: each kind's own first, then the shared ones. kinds: the building kinds
 * that show the section (left out when every kind does).
 */
export const SCHEMA = [
  ...KINDS.flatMap(k => k.sections.map(g => ({...g, kinds: [k.id]}))),
  ...SHARED_SECTIONS.map(g => {
    const kinds = KINDS.filter(k => !k.hides.includes(g.title)).map(k => k.id);
    return kinds.length === KINDS.length ? g : {...g, kinds};
  }),
];
/**
 * A kind's settings fields by key: the shared ones and its own. Kinds can each have a field with the
 * same key and their own range (a hen house's and a cow barn's fenceDepth), so look fields up by kind.
 */
const SHARED_FIELD = {};
SHARED_SECTIONS.forEach(g => g.fields.forEach(f => SHARED_FIELD[f.k] = f));
export function fieldsFor(kind) {
  const m = {...SHARED_FIELD};
  kind.sections.forEach(g => g.fields.forEach(f => m[f.k] = f));
  return m;
}
/** Every field key there is (any kind's); for checking whether a key is a setting at all. */
export const FIELD = {};
SCHEMA.forEach(g => g.fields.forEach(f => FIELD[f.k] = FIELD[f.k] || f));
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
/**
 * Clean settings from anywhere (a save, an import, a preset): the building's kind (a farmhouse if
 * none or unknown), every setting it has clamped to its range, and the kind's own rules applied.
 */
export function sanitize(obj) {
  if (!obj || typeof obj !== "object") obj = {};
  const kind = kindOf(obj), defs = {...DEFAULTS, ...kind.defaults}, fields = fieldsFor(kind);
  const out = {...defs, kind: kind.id};
  for (const k in defs) {
    if (k === "kind") continue;
    const v = clampField(fields[k], obj[k]);
    if (v !== undefined) out[k] = typeof defs[k] === "number" ? +(+v).toFixed(3) : v;
  }
  // Saves from before curtain styles had a curtains on/off switch.
  if (obj.curtainStyle === undefined && obj.curtains === false) out.curtainStyle = "none";
  out.windows = Array.isArray(obj.windows) ? cleanWindows(obj.windows) : genAll(out, obj);
  out.dormers = Array.isArray(obj.dormers) ? cleanDormers(obj.dormers) : [];
  const q = kind.normalize(out);
  // The inside of a walk-in building: the saved pieces, or filled automatically for a new one.
  if (kind.catalog) q.items = Array.isArray(obj.items) ? cleanItems(obj.items, catalogFor({kind: kind.id, items: obj.items})) : kind.autoFurnish(q).items;
  return q;
}

/* ---------- Imported items ---------- */
// The user's imported items (assets.mjs), as the API lists them. The editor sets them once loaded;
// until then a building's items are kept as stand-ins (see withAssets), never dropped.
let ASSETS = [];
/** Sets the user's imported items (the API's list). */
export function setAssets(list) { ASSETS = Array.isArray(list) ? list : []; }
/** The pieces a building can have inside: its kind's own, the user's items for it, stand-ins for deleted ones. */
export function catalogFor(p) {
  const kind = kindOf(p);
  return kind.catalog ? withAssets(kind.catalog, ASSETS, kind.id, p.items) : {};
}
/** The imported items placed in the building (and inside its walls): what an export has to pack. */
export function usedAssets(p) {
  const seen = new Map();
  for (const r of buildGeometry(p).refs) seen.set(r.asset.id, r.asset);
  return [...seen.values()];
}

/**
 * Starting points for "New", from every kind: {id, name, blurb, kind, category, settings}. A preset
 * is the settings a new project starts with. Window counts (winFront ...) seed the window list.
 */
export const PRESETS = KINDS.flatMap(k => k.presets.map(x => ({...x, kind: k.id, category: k.category, settings: {kind: k.id, ...x.settings}})));

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
// fittings: a walk-in barn's inside (whitewashed walls, litter, nests, perches, feeders), vertex
// colored like the curtains and exported as one plain part per color.
export const MATS = ["walls","trim","roof","glass","door","foundation","chimney","gutter","interior","curtain","fittings"];
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

/** The part of mesh g made of its vertices from .. to (not included), as a mesh of its own (a door leaf). */
function sliceMesh(g, from, to) {
  const out = {p: g.p.slice(from * 3, to * 3), n: g.n.slice(from * 3, to * 3), uv: g.uv.slice(from * 2, to * 2), i: []};
  for (let t = 0; t < g.i.length; t += 3) if (g.i[t] >= from && g.i[t] < to) out.i.push(g.i[t] - from, g.i[t + 1] - from, g.i[t + 2] - from);
  return out;
}
/**
 * The rings of a bent pipe through pts (radius r, seg sides): one ring per point, at the ends square
 * to the pipe, at each bend in the mitre plane halfway between the two segments, so the segments
 * meet without a gap or a step. Each ring is the one before carried along its segment (no twist).
 */
export function tubeRings(pts, r, seg = 8) {
  const dirs = pts.slice(1).map((q, k) => norm(sub(q, pts[k])));
  let side = cross(dirs[0], UP);
  side = Math.hypot(...side) < 1e-6 ? [1, 0, 0] : norm(side);
  const up = norm(cross(side, dirs[0]));
  let ring = Array.from({length: seg}, (_, j) => { const a = (j + 0.5) / seg * 2 * Math.PI; return add(pts[0], add(scl(side, r * Math.cos(a)), scl(up, r * Math.sin(a)))); });
  const rings = [ring];
  for (let k = 1; k < pts.length; k++) {
    // (a bend sharper than 120 degrees gets a square joint: its mitre would reach far out)
    const d = dirs[k - 1], m = k < dirs.length && dot(d, dirs[k]) > -0.5 ? norm(add(d, dirs[k])) : d;
    // each point of the ring slides along d until it meets the plane through pts[k] square to m
    ring = ring.map(q => add(q, scl(d, dot(sub(pts[k], q), m) / dot(d, m))));
    rings.push(ring);
  }
  return rings;
}

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
 * Half-round ridge cap from x = a0 to a1, in local coordinates: x along the ridge, y up, z across,
 * with the roof's top surface at y = ridgeY - tanP * |z|. The round runs down each side until it is
 * tucked into the roof, so it rests on the slopes at any pitch. Smooth shading; open underneath.
 * arc: the indices of the round surface's vertices; axisY: height of its axis (for tests).
 */
export function ridgeCapMesh(a0, a1, ridgeY, tanP, w, {rise = 0.05, edge = 0.025} = {}) {
  // Like a row of ridge tiles, seen across the ridge: a small round crown `rise` above the ridge, and
  // from it a straight flank down each side to an edge `edge` above the roof, `w` out from the ridge,
  // the flank meeting the crown tangentially (no kink). Then a short skirt tucks the edge into the roof.
  // The crown is smaller on a steeper roof, so the cap stays thin over it (6 cm round on a flat roof).
  const crown = 0.06 / (1 + tanP * tanP);
  const m = newMesh(), roofAt = z => ridgeY - tanP * Math.abs(z) - 0.008;
  const yc = ridgeY + rise - crown;                     // the crown's centre, below its top
  const yE = ridgeY - tanP * w + edge, L = Math.hypot(w, yE - yc);
  // Angle (from +z, towards +y) of the point where the right flank touches the crown.
  const beta = Math.atan2(yE - yc, w) + Math.acos(Math.min(1, crown / L));
  const steps = Math.max(22, Math.ceil((Math.PI - 2 * beta) / (6 * Math.PI / 180)));
  // The profile, left to right: [z, y, normal z, normal y]
  const prof = [], flankN = sg => [sg * Math.cos(beta), Math.sin(beta)];
  const edgeL = [-w, yE], edgeR = [w, yE];
  prof.push([...edgeL, ...flankN(-1)]);
  for (let k = 0; k <= steps; k++) {
    const th = Math.PI - beta - (Math.PI - 2 * beta) * k / steps;
    prof.push([crown * Math.cos(th), yc + crown * Math.sin(th), Math.cos(th), Math.sin(th)]);
  }
  prof.push([...edgeR, ...flankN(1)]);
  // Skirts: straight down from each edge into the roof.
  const skirt = ([z, y, nz, ny]) => [z, Math.min(y, roofAt(z)) - 0.01, nz, ny];
  const all = [skirt(prof[0]), ...prof, skirt(prof[prof.length - 1])];
  // v along the profile, so the tile texture runs across the cap
  let v = 0;
  const vs = all.map((q, k) => (k ? (v += Math.hypot(q[0] - all[k - 1][0], q[1] - all[k - 1][1])) : 0));
  // m.arc: the profile at the a0 end, left to right (for the tests); m.rim: the skirts' bottom edges.
  m.arc = []; m.rim = [];
  const row = x => all.map(([z, y, nz, ny], k) => {
    const i = m.add([x, y, z], [0, ny, nz], [x, vs[k]]);
    if (k === 0 || k === all.length - 1) m.rim.push(i); else if (x === a0) m.arc.push(i);
    return i;
  });
  const A = row(a0), B = row(a1);
  for (let k = 0; k + 1 < all.length; k++) {
    const hint = [0, (all[k][3] + all[k + 1][3]) / 2, (all[k][2] + all[k + 1][2]) / 2];
    tri(m, A[k], B[k], B[k + 1], hint); tri(m, A[k], B[k + 1], A[k + 1], hint);
  }
  // Ends: a fan from just under the ridge, like the end of a ridge tile, in one plain color (one uv
  // for all: the tile texture would show as rings on it).
  const axisY = ridgeY - 0.02;
  for (const [x, sg] of [[a0, -1], [a1, 1]]) {
    const nrm = [sg, 0, 0], c = m.add([x, axisY, 0], nrm, [0.25, 0.1]);
    const ring = all.map(([z, y]) => m.add([x, y, z], nrm, [0.25, 0.1]));
    for (let k = 0; k + 1 < ring.length; k++) tri(m, c, ring[k], ring[k + 1], nrm);
  }
  m.axisY = axisY;
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
  // (its ends 3 mm past the end plates, so its caps aren't in their plane)
  const lip = pipeMesh([add(pt(c0, 0), scl(dir, -0.003)), add(pt(c1, 0), scl(dir, 0.003))], 0.012, {seg: 10});
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
p = normalize(p);
const kind = kindOf(p);
let G, opsByWall = {}, dims = {}, rooms = [], downpipes = [], doorLeaves = [];
// Imported items placed inside: [{asset, item, translation, rotY}] (see assets.mjs placement).
const refs = [];
// Walk-in kinds (a hen house ...): walls with an inside face, hollow collision, a door that opens.
const hollow = kind.walkIn;
// Openings the kind adds to its walls, [{wall, s0, s1, t1, clear, what}] (a hen hatch ...).
const openings = kind.openings ? kind.openings(p) : [];

function poly(mat, pts, hint, uvf) {
  pts = pts.filter((q,i) => { const r = pts[(i+1) % pts.length]; return Math.hypot(...sub(q,r)) > 1e-6; });
  if (pts.length < 3) return;
  let n = norm(cross(sub(pts[1],pts[0]), sub(pts[2],pts[0])));
  if (hint && dot(n, hint) < 0) { pts = pts.slice().reverse(); n = neg(n); }
  // Undersides of the roof, dormer roofs and canopies (eave soffits) are painted boards, not tiles;
  // in a walk-in building, raw roof boards (seen from inside).
  let rgbHere = fitRGB, surf = fitSurf;
  if (mat === "roof" && n[1] < -0.3) {
    const boards = Math.max(...pts.map(q => q[1])) >= boardsFrom;
    mat = boards ? "fittings" : "trim";
    if (boards) { rgbHere = hexRGB(ROOF_BOARDS); surf = "boards"; uvf = null; }
  }
  if (mat === "trim") uvf = null;
  if (mat !== "fittings") surf = undefined;
  const g = G[mat], base = g.p.length / 3, S = surf && SURFACES[surf];
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  let uvs = pts.map(q => uvf ? uvf(q) : (ay >= ax && ay >= az) ? [q[0], q[2]] : (ax >= az) ? [q[2], q[1]] : [q[0], q[1]]);
  if (mat === "trim" || (S && S.grain)) {
    // Wood: the grain runs along v. Lay v along the face's longest edge, the board's
    // length, whatever its angle (sloped fascia, soffits, frames, beams), and u across it.
    let along = null, best = -1;
    pts.forEach((q, k) => { const e = sub(pts[(k + 1) % pts.length], q), l = Math.hypot(...e); if (l > best) { best = l; along = e; } });
    const v = norm(along), u = norm(cross(n, v));
    uvs = pts.map(q => [dot(q, u), dot(q, v)]);
  }
  // An inside surface's uvs count copies of its texture.
  if (S) uvs = uvs.map(([u, v]) => [u / S.w, v / S.h]);
  pts.forEach((q, k) => { g.p.push(q[0], q[1], q[2]); g.n.push(n[0], n[1], n[2]); g.uv.push(uvs[k][0], uvs[k][1]); if (g.c) g.c.push(...(mat === "fittings" ? rgbHere : curtainRGB)); if (g.s) g.s.push(surf); });
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
    const [s0, s1] = doorSpan(p, L), dh = Math.min(p.doorH, fh - 0.25);
    ops.push({s0, s1, t0: 0, t1: dh, kind: "door"});
  }
  // The kind's own openings (a hen hatch ...), before the windows so a window over one is hidden.
  for (const h of openings) if (h.wall === key) ops.push({s0: h.s0, s1: h.s1, t0: 0, t1: h.t1, kind: "hatch", plain: !!h.plain});
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
  pts.forEach((q, k) => { g.p.push(...q); g.n.push(...n); g.uv.push(...uvs[k]); if (g.c) g.c.push(...(mat === "fittings" ? fitRGB : curtainRGB)); if (g.s) g.s.push(undefined); });
  g.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
/** Color (0..1 rgb) given to the curtain vertices being built; color and surface (SURFACES) of the fittings. */
let curtainRGB = [1, 1, 1], fitRGB = [1, 1, 1], fitSurf;
/** In a walk-in building, roof undersides reaching above this height are the roof boards seen from inside (canopies, lower down, stay painted). */
let boardsFrom = Infinity;
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
/**
 * A hen hatch (or other small opening at floor level): a trim frame, the sliding hatch held open
 * above it between two rails, and, if the floor is raised, a ramp with cleats down to the ground.
 * Hens use the walking area, not physics, so the wall's collision stays whole.
 */
function buildHatch(w, o, F, fr, out) {
  wbox("trim", w, o.s0 - fr, o.s0, o.t0, o.t1 + fr, 0, out);
  wbox("trim", w, o.s1, o.s1 + fr, o.t0, o.t1 + fr, 0, out);
  wbox("trim", w, o.s0, o.s1, o.t1, o.t1 + fr, 0, out);
  // A plain opening (a cow barn's doorway to the pasture) is just the framed hole.
  if (o.plain) return;
  const h = o.t1 - o.t0, sA = o.s0 - 0.03, sB = o.s1 + 0.03;
  wbox("trim", w, sA, sB, o.t1 + fr + 0.02, o.t1 + fr + 0.04 + h, out, out + 0.025);
  for (const [a, b] of [[o.s0 - fr - 0.04, o.s0 - fr], [o.s1 + fr, o.s1 + fr + 0.04]]) wbox("trim", w, a, b, o.t0, o.t1 + fr + 0.08 + h, out, out + 0.04);
  if (F > 0.05) {
    const run = 0.05 + F / Math.tan(30 * Math.PI / 180), rA = o.s0 - 0.05, rB = o.s1 + 0.05;
    // The plank: a = across, b = thickness (top face at b = 1), c = down the slope.
    box("trim", (a, b, c) => WP(w, lerp(rA, rB, a), lerp(0, -F, c) - 0.03 + b * 0.03, lerp(0.02, run, c)), w.u, UP, w.n);
    for (let c = 0.12; c < 0.95; c += 0.15 / run) {
      const d = lerp(0.02, run, c), t = lerp(0, -F, c);
      wbox("trim", w, rA + 0.01, rB - 0.01, t, t + 0.02, d - 0.012, d + 0.012);   // cleats, a little in from the edges
    }
  }
}
/**
 * inner: build the wall's inside face too, WALL_T behind the outside one (where the opening
 * reveals end), facing in. inner.lift raises an eave wall's inside face into the roof slab so no
 * gap shows under the roof. Doors become leaves that can open (see doorLeaves).
 */
function buildWall(w, ops, H, gableRise, F, {topAt = () => H, dormer = null, inner = null} = {}) {
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
  if (inner) {
    const Hi = H + inner.lift, tw = WALL_T;
    const Xi = uniq([tw, L - tw, L/2, ...ops.flatMap(o => [o.s0, o.s1])]).filter(s => s > tw - 1e-6 && s < L - tw + 1e-6);
    // Whitewash, greyer and grubbier along the bottom where the animals rub and muck splashes.
    const Ti = uniq([0, GRIME_T, Hi, H + gableRise, ...ops.flatMap(o => [o.t0, o.t1])]);
    for (let i = 0; i < Xi.length - 1; i++) for (let j = 0; j < Ti.length - 1; j++) {
      const cs = (Xi[i] + Xi[i+1]) / 2, ct = (Ti[j] + Ti[j+1]) / 2;
      if (ops.some(o => cs > o.s0 && cs < o.s1 && ct > o.t0 && ct < o.t1)) continue;
      let c = [[Xi[i], Ti[j]], [Xi[i+1], Ti[j]], [Xi[i+1], Ti[j+1]], [Xi[i], Ti[j+1]]];
      if (Ti[j+1] > Hi + 1e-6) {
        if (gableRise <= 0) continue;
        const k = gableRise / (L / 2);
        c = clipPoly(clipPoly(c, -k, 1, H), k, 1, H + 2 * gableRise);
      }
      paint(ct < GRIME_T ? GRIME : WHITEWASH, ct < GRIME_T ? "grime" : "whitewash");
      if (c.length >= 3) poly("fittings", c.map(q => WP(w, q[0], q[1], -tw)), neg(w.n));
    }
    // A tarred kickboard along the bottom, except across openings that come down to it.
    paint(KICKBOARD, "timber");
    for (let i = 0; i < Xi.length - 1; i++) {
      const cs = (Xi[i] + Xi[i+1]) / 2;
      if (Xi[i+1] - Xi[i] < 0.02 || ops.some(o => cs > o.s0 && cs < o.s1 && o.t0 < KICK_T)) continue;
      wbox("fittings", w, Xi[i], Xi[i+1], 0, KICK_T, -tw - 0.025, -tw);
    }
  }

  const r = 0.15, out = 0.04;
  ops.forEach(o => {
    const isDoor = o.kind === "door", isWin = o.kind === "window";
    // Frame width: 8 cm, slimmer on a small window (down to 4.5 cm), so the frame doesn't swamp it.
    const fr = isWin ? Math.min(0.08, Math.max(0.045, 0.075 * Math.min(o.s1 - o.s0, o.t1 - o.t0))) : 0.08, k = fr / 0.08;
    // The opening's linings, through the wall's thickness: painted boards like the frame.
    if (!isDoor) poly("trim", [WP(w,o.s0,o.t0,0), WP(w,o.s1,o.t0,0), WP(w,o.s1,o.t0,-r), WP(w,o.s0,o.t0,-r)], UP);
    poly("trim", [WP(w,o.s0,o.t1,0), WP(w,o.s1,o.t1,0), WP(w,o.s1,o.t1,-r), WP(w,o.s0,o.t1,-r)], neg(UP));
    poly("trim", [WP(w,o.s0,o.t0,0), WP(w,o.s0,o.t1,0), WP(w,o.s0,o.t1,-r), WP(w,o.s0,o.t0,-r)], w.u);
    poly("trim", [WP(w,o.s1,o.t0,0), WP(w,o.s1,o.t1,0), WP(w,o.s1,o.t1,-r), WP(w,o.s1,o.t0,-r)], neg(w.u));
    if (o.kind === "hatch") { buildHatch(w, o, F, fr, out); return; }
    // The glass sits 12 mm in front of the back of the window bars: in the same plane they flicker.
    const dg = isDoor ? -r : -r + 0.012;
    const pane = [WP(w,o.s0,o.t0,dg), WP(w,o.s1,o.t0,dg), WP(w,o.s1,o.t1,dg), WP(w,o.s0,o.t1,dg)];
    if (isDoor && inner) {
      // A leaf with a handle on each side, hinged on its outside face, opening outwards: one hinged at
      // s0, or for a wide door a pair, the second hinged at s1 and carrying the strip over the gap.
      const g = 0.01, t0 = o.t0 + g, t1 = o.t1 - g, dIn = -r, dOut = -r + LEAF_T, mid = (o.s0 + o.s1) / 2;
      const pair = o.s1 - o.s0 > DOUBLE_DOOR_FROM;
      const spans = pair ? [[o.s0 + g, mid - g / 2], [mid + g / 2, o.s1 - g]] : [[o.s0 + g, o.s1 - g]];
      spans.forEach(([s0, s1], k) => {
        const from = G.door.p.length / 3, right = k === 1;
        wbox("door", w, s0, s1, t0, t1, dIn, dOut);
        if (right) wbox("door", w, s0 - 0.03, s0 + 0.04, t0, t1, dOut, dOut + 0.015);
        const hx = right ? s0 + 0.15 : s1 - 0.12;   // the handles, near the free edge
        wbox("door", w, hx - 0.03, hx, o.t0 + 0.95, o.t0 + 1.08, dOut, dOut + 0.06);
        wbox("door", w, hx - 0.03, hx, o.t0 + 0.95, o.t0 + 1.08, dIn - 0.06, dIn);
        const ax = Math.abs(w.u[0]) > 0.5, along = s1 - s0, tall = t1 - t0;
        doorLeaves.push({hinge: WP(w, right ? s1 : s0, o.t0, dOut), openAngle: right ? -DOOR_OPEN : DOOR_OPEN, from, to: G.door.p.length / 3,
          box: {center: WP(w, (s0 + s1) / 2, (t0 + t1) / 2, (dIn + dOut) / 2), size: ax ? [along, tall, LEAF_T] : [LEAF_T, tall, along]}});
      });
    } else {
      poly(isDoor ? "door" : "glass", pane, w.n);
      // a wide door is a pair of doors: a meeting stile down the middle
      if (isDoor && o.s1 - o.s0 > DOUBLE_DOOR_FROM) { const mid = (o.s0 + o.s1) / 2; wbox("door", w, mid - 0.025, mid + 0.025, o.t0, o.t1, -r, -r + 0.02); }
    }
    // From inside, the glass is seen from behind: give it a face that way too.
    if (!isDoor && inner) poly("glass", pane, neg(w.n));
    // The frame and sill start at the wall's face: inside the wall they would share planes with the
    // linings and flicker.
    const b0 = isDoor ? o.t0 : o.t0 - fr;
    wbox("trim", w, o.s0 - fr, o.s0, b0, o.t1 + fr, 0, out);
    wbox("trim", w, o.s1, o.s1 + fr, b0, o.t1 + fr, 0, out);
    wbox("trim", w, o.s0, o.s1, o.t1, o.t1 + fr, 0, out);
    if (isDoor) {
      if (F > 0.05 && p.entrance !== "porch") {
        // the doorstep, from where the plinth ends (its top in the same plane would flicker)
        wbox("foundation", w, o.s0 - 0.3, o.s1 + 0.3, -F, 0, PLINTH_OUT, 0.7);
        wbox("collision", w, o.s0 - 0.3, o.s1 + 0.3, -F, 0, PLINTH_OUT, 0.7);
      }
      // the handle, near the free edge; on a pair of doors one either side of the stile
      const pair = o.s1 - o.s0 > DOUBLE_DOOR_FROM, mid = (o.s0 + o.s1) / 2;
      const hxs = pair ? [mid - 0.06, mid + 0.09] : [o.s1 - 0.12];
      if (!inner) for (const hx of hxs) wbox("trim", w, hx - 0.03, hx, o.t0 + 0.95, o.t0 + 1.08, -r, -r + 0.06);
    } else {
      wbox("trim", w, o.s0 - fr - 0.04 * k, o.s1 + fr + 0.04 * k, o.t0 - 0.07 * k, o.t0, 0, out + 0.05 * k);
      // Glazing bars: a centre bar from 75 cm wide (a small window is one pane), a cross bar over 1 m high.
      const bw = 0.03 * k;
      if (o.s1 - o.s0 >= 0.75) { const mid = (o.s0 + o.s1) / 2; wbox("trim", w, mid - bw, mid + bw, o.t0, o.t1, -r, -r + 0.04); }
      if (o.t1 - o.t0 > 1.0) {
        const tm = o.t0 + (o.t1 - o.t0) * 0.62;
        wbox("trim", w, o.s0, o.s1, tm - bw, tm + bw, -r, -r + 0.04);
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
  if (g.c) for (let k = 0; k < m.p.length / 3; k++) g.c.push(...(mat === "fittings" ? fitRGB : curtainRGB));
  if (g.s) for (let k = 0; k < m.p.length / 3; k++) g.s.push(undefined);
}

/* ----- Drawing helpers for walk-in insides (kinds' furnish() gets these) ----- */
/** Inside walls of a walk-in building are whitewashed. */
/** The floor finish: a skin, so anything lying on the floor (bedding, droppings, plates) shows above it. */
const FLOOR_T = 0.004;
const WHITEWASH = "#E9E4D8", GRIME = "#C2B8A3", GRIME_T = 0.9, KICKBOARD = "#3F352C", KICK_T = 0.28, ROOF_BOARDS = "#8C7457";
/** The color the next "fittings" faces get, and their surface (a key of SURFACES, or none: plain color). */
const paint = (hex, surf) => {
  if (surf !== undefined && !SURFACES[surf]) throw new Error(`No surface called "${surf}"`);
  fitRGB = hexRGB(hex); fitSurf = surf;
};
/** Vertical cylinder with closed ends, base centre c. */
function cyl(c, r, h, seg = 12) {
  const ring = y => Array.from({length: seg}, (_, k) => { const a = k / seg * 2 * Math.PI; return [c[0] + r * Math.cos(a), y, c[2] + r * Math.sin(a)]; });
  const lo = ring(c[1]), hi = ring(c[1] + h);
  for (let k = 0; k < seg; k++) {
    const j = (k + 1) % seg;
    poly("fittings", [lo[k], lo[j], hi[j], hi[k]], [(lo[k][0] + lo[j][0]) / 2 - c[0], 0, (lo[k][2] + lo[j][2]) / 2 - c[2]]);
  }
  poly("fittings", hi, UP); poly("fittings", lo, neg(UP));
}
/**
 * Roof ventilators (a Swedish barn's lanterns): p.ventilators boarded boxes spaced along the ridge,
 * louvred on their long sides, each with its own little gable roof. In ridge coordinates through M:
 * a along the ridge, b across it. half: half the ridge's length.
 */
/** Where the ventilators go along the ridge (a), for n of them on a ridge reaching +-half. */
const ventSpots = (n, half) => { const reach = Math.max(0, half - 0.8); return Array.from({length: n}, (_, k) => n === 1 ? 0 : -reach + 2 * reach * k / (n - 1)); };
function buildVentilators(Lr, ridgeY, tanP, M, half, th, F) {
  const hw = 0.35;
  // The box's bottom follows the roof (a low V, 5 cm under the tiles), so it stays in the roof slab
  // and never shows under it; a walk-in barn gets a duct inside instead (ventDuct).
  const y0 = ridgeY - tanP * hw - 0.05, yC = ridgeY - 0.05, y1 = ridgeY + 0.75, rise = 0.3, ro = 0.5;
  // (ranges sorted: a box given back to front would come out inside-out)
  const mbox = (mat, a0, a1, yA, yB, b0, b1) => { [a0, a1] = [Math.min(a0, a1), Math.max(a0, a1)]; [b0, b1] = [Math.min(b0, b1), Math.max(b0, b1)];
    box(mat, (i, j, k) => M(lerp(a0, a1, i), lerp(yA, yB, j), lerp(b0, b1, k)), M(1, 0, 0), UP, M(0, 0, 1)); };
  for (const a of ventSpots(p.ventilators, half)) {
    for (const s of [-1, 1]) prism("walls", [[s * hw, y0], [0, yC], [0, y1], [s * hw, y1]], ([b, y], k) => M(k ? a + hw : a - hw, y, b));
    abox("collision", M(a - hw, y0, -hw), M(a + hw, y1 + rise, hw));
    if (hollow) ventDuct(a, ridgeY, tanP, M, th, F);
    // louvres on the long sides, corner boards
    for (const s of [-1, 1]) for (let j = 0; j < 4; j++) {
      const y = y1 - 0.15 - j * 0.12;
      mbox("trim", a - hw + 0.06, a + hw - 0.06, y - 0.03, y, s * hw, s * (hw + 0.05));
    }
    // (standing 1 cm proud of the boxing and stopping just under its top: flush faces would flicker)
    const cb = (c, sg) => [c + sg * (hw - 0.04), c + sg * (hw + 0.01)];
    for (const sa of [-1, 1]) for (const sb of [-1, 1]) mbox("trim", ...cb(a, sa), y0, y1 - 0.005, ...cb(0, sb));
    // the little roof: two slopes from the eaves at b = +-ro up to a ridge over the middle
    for (const s of [-1, 1]) {
      const q = [M(a - hw - 0.1, y1, s * ro), M(a + hw + 0.1, y1, s * ro), M(a + hw + 0.1, y1 + rise, 0), M(a - hw - 0.1, y1 + rise, 0)];
      poly("roof", q, M(0, 1, s * rise / ro));
      poly("trim", q.map(v => [v[0], v[1] - 0.03, v[2]]), M(0, -1, -s * rise / ro));
    }
    for (const sa of [-1, 1]) {
      const yb = y1 + rise * (1 - hw / ro);
      poly("walls", [M(a + sa * hw, y1, -hw), M(a + sa * hw, y1, hw), M(a + sa * hw, yb, hw), M(a + sa * hw, y1 + rise, 0), M(a + sa * hw, yb, -hw)], M(sa, 0, 0));
    }
  }
}
/** A bent pipe through points pts, radius r, seg sides, as one mitred tube in "fittings", closed at both ends. */
function tube(pts, r, seg = 8) {
  pts = pts.filter((q, k) => k === 0 || Math.hypot(...sub(q, pts[k - 1])) > 1e-6);
  if (pts.length < 2) return;
  const rings = tubeRings(pts, r, seg);
  for (let k = 0; k + 1 < rings.length; k++) for (let j = 0; j < seg; j++) {
    const a = rings[k][j], b = rings[k][(j + 1) % seg], c = rings[k + 1][(j + 1) % seg], d = rings[k + 1][j];
    // (each side face is a flat quad: its four corners lie in one plane, the mitre keeps it so)
    poly("fittings", [a, b, c, d], sub(mid([a, b, c, d]), mid([pts[k], pts[k + 1]])));
  }
  poly("fittings", rings[0], sub(pts[0], pts[1]));
  poly("fittings", rings[rings.length - 1], sub(pts[pts.length - 1], pts[pts.length - 2]));
}
/** A round rod (pipe, perch, wire) in "fittings" from p0 to p1, radius r, seg sides. */
function rod(p0, p1, r, seg = 8) {
  const d = norm(sub(p1, p0));
  let side = cross(d, UP);
  side = Math.hypot(...side) < 1e-6 ? [1, 0, 0] : norm(side);
  const up = norm(cross(side, d));
  const sec = Array.from({length: seg}, (_, k) => { const a = (k + 0.5) / seg * 2 * Math.PI; return [r * Math.cos(a), r * Math.sin(a)]; });
  prism("fittings", sec, ([x, y], k) => add(k ? p1 : p0, add(side.map(v => v * x), up.map(v => v * y))));
}
/** Upright frustum in "fittings": radius r0 at its base c, r1 at the top, h high, closed at both ends. */
function cone(c, r0, r1, h, seg = 16) {
  const ring = (y, r) => Array.from({length: seg}, (_, k) => { const a = k / seg * 2 * Math.PI; return [c[0] + r * Math.cos(a), y, c[2] + r * Math.sin(a)]; });
  const lo = ring(c[1], r0), hi = ring(c[1] + h, r1), slope = (r0 - r1) / h;
  for (let k = 0; k < seg; k++) {
    const j = (k + 1) % seg, mx = (lo[k][0] + lo[j][0]) / 2 - c[0], mz = (lo[k][2] + lo[j][2]) / 2 - c[2], l = Math.hypot(mx, mz) || 1;
    poly("fittings", [lo[k], lo[j], hi[j], hi[k]], [mx / l, slope, mz / l]);
  }
  poly("fittings", hi, UP); poly("fittings", lo, neg(UP));
}
/** A beam in "fittings" from p0 to p1 (centre line), w wide and h deep, its h side as upright as it can be. */
function beam(p0, p1, w, h) {
  const d = norm(sub(p1, p0));
  let side = cross(d, UP);
  side = Math.hypot(...side) < 1e-6 ? [1, 0, 0] : norm(side);
  const up = norm(cross(side, d));
  prism("fittings", [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]],
    ([x, y], k) => add(k ? p1 : p0, add(side.map(v => v * x), up.map(v => v * y))));
}
const DUCT = "#7E6E58", DUCT_DARK = "#211C17", TIMBER = "#6F5C47";
/**
 * Inside a walk-in barn, under a ventilator at a: the boarded duct (ventilationstrumma) hanging
 * from the roof, open at the bottom, with a lip, a half-open damper and its pull cord.
 */
function ventDuct(a, ridgeY, tanP, M, th, F) {
  const hd = 0.28, bt = 0.025, yTop = ridgeY - th, yBot = ridgeY - th - tanP * hd - 0.7;
  const mbox = (a0, a1, yA, yB, b0, b1) => box("fittings", (i, j, k) => M(lerp(a0, a1, i), lerp(yA, yB, j), lerp(b0, b1, k)), M(1, 0, 0), UP, M(0, 0, 1));
  paint(DUCT, "boards");
  // boards up into the roof: where they rise past its underside they're hidden in the slab (and in the ventilator above)
  for (const s of [-1, 1]) {
    mbox(a - hd, a + hd, yBot, yTop, s > 0 ? hd - bt : -hd, s > 0 ? hd : -hd + bt);
    mbox(s > 0 ? a + hd - bt : a - hd, s > 0 ? a + hd : a - hd + bt, yBot, yTop, -hd + bt, hd - bt);
  }
  // the lip round the bottom
  for (const s of [-1, 1]) {
    mbox(a - hd - 0.02, a + hd + 0.02, yBot, yBot + 0.08, s > 0 ? hd : -hd - 0.02, s > 0 ? hd + 0.02 : -hd);
    mbox(s > 0 ? a + hd : a - hd - 0.02, s > 0 ? a + hd + 0.02 : a - hd, yBot, yBot + 0.08, -hd, hd);
  }
  // looking up into it: dark, below the lowest point of the roof over it
  paint(DUCT_DARK);
  const yd = ridgeY - th - tanP * hd - 0.08, e = hd - bt;
  poly("fittings", [M(a - e, yd, -e), M(a + e, yd, -e), M(a + e, yd, e), M(a - e, yd, e)], neg(UP));
  // the damper, half open, and its cord down to where it can be reached
  paint(DUCT, "boards");
  const lowEdge = M(a, yBot + 0.14, -hd * 0.7);
  beam(lowEdge, M(a, yBot + 0.36, hd * 0.7), 2 * e - 0.02, 0.02);
  paint(DUCT_DARK);
  const reach = Math.min(yBot - 0.05, Math.max(F + 1.9, yBot - 1.6));
  beam(lowEdge, [lowEdge[0], reach, lowEdge[2]], 0.012, 0.012);
  abox("fittings", [lowEdge[0] - 0.03, reach - 0.12, lowEdge[2] - 0.03], [lowEdge[0] + 0.03, reach, lowEdge[2] + 0.03]);
}
/**
 * A walk-in barn's roof seen from inside: rafters under both slopes, a ridge beam, and tie beams
 * with collar ties on every other pair (gable roofs, and the straight middle of hip roofs).
 * In ridge coordinates through M; ext: half the length the rafters run along the ridge.
 */
function buildRoofFrame(ext, span, top, ridgeY, tanP, M, th, vents) {
  const inB = span / 2 - WALL_T, under = b => ridgeY - th - tanP * Math.abs(b), cosP = 1 / Math.hypot(1, tanP);
  const rw = 0.07, rh = 0.16, dv = rh / 2 / cosP;           // a rafter's section; its centre under the roof
  const n = Math.max(1, Math.round(2 * ext / 1.2)), step = 2 * ext / n;
  paint(TIMBER, "timber");
  for (let k = 0; k <= n; k++) {
    const a = -ext + k * step;
    // (ends cut square to the slope: starting 6 cm in keeps the lower corner out of the wall)
    for (const s of [-1, 1]) beam(M(a, under(inB - 0.06) - dv, s * (inB - 0.06)), M(a, under(0.06) - dv, s * 0.06), rw, rh);
    if (k % 2 === 0) {
      // tie beam across at the wall tops, collar tie two thirds of the way up
      beam(M(a, top - 0.1, -inB), M(a, top - 0.1, inB), 0.12, 0.18);
      const yc = top + (ridgeY - th - top) * 0.62, bc = Math.max(0.1, (ridgeY - th - 0.17 - yc) / tanP);
      beam(M(a, yc, -bc), M(a, yc, bc), 0.06, 0.14);
    }
  }
  // the ridge beam, broken where a ventilator duct comes down
  const cuts = vents.map(v => [v - 0.32, v + 0.32]).sort((x, y) => x[0] - y[0]);
  let a0 = -ext - 0.05;
  for (const [c0, c1] of [...cuts, [ext + 0.05, Infinity]]) {
    const yr = ridgeY - th - 0.1 - tanP * 0.05;  // its top corners just under the slopes
    if (c0 - a0 > 0.1) beam(M(a0, yr, 0), M(Math.min(c0, ext + 0.05), yr, 0), 0.1, 0.2);
    a0 = Math.max(a0, c1);
  }
}
/**
 * A walk-in building's inside: the kind's floor finish, then each placed piece (p.items), drawn in
 * its own frame (layout.mjs), with a collision box for pieces that have one. A piece outside the
 * room (the building was made smaller) is left out until it's moved back in.
 */
function buildInside(kind, F, H) {
  const room = roomOf(p, openings), catalog = catalogFor(p), items = p.items || [];
  if (kind.furnish) kind.furnish({floor: (color, surf) => { paint(color, surf); abox("fittings", [room.x0, F, room.z0], [room.x1, F + FLOOR_T, room.z1]); }});
  const outside = new Set([...problems(items, catalog, room)].filter(([, m]) => /outside/i.test(m)).map(([id]) => id));
  for (const it of items) {
    const def = catalog[it.type];
    if (!def || outside.has(it.id) || def.missing) continue;
    // An imported item: the game loads its own i3d (with its collision); the editor draws its .obj.
    if (def.asset) { refs.push({asset: def.asset, item: it, ...placement(def.asset.meta, it, F)}); continue; }
    const box = (x0, x1, z0, z1, y0, y1) => { const a = toWorld(it, x0, z0), b = toWorld(it, x1, z1); abox("fittings", [a[0], F + y0, a[1]], [b[0], F + y1, b[1]]); };
    const round = (x, z, y, r, h, seg) => { const q = toWorld(it, x, z); cyl([q[0], F + y, q[1]], r, h, seg); };
    // points of the piece's frame ([x, y, z], y up from the floor) in the world
    const at = ([x, y, z]) => { const q = toWorld(it, x, z); return [q[0], F + y, q[1]]; };
    const pieceKit = {H, paint, box, cyl: round,
      cone: (x, z, y, r0, r1, h, seg) => { const q = toWorld(it, x, z); cone([q[0], F + y, q[1]], r0, r1, h, seg); },
      rod: (a, b, r, seg) => rod(at(a), at(b), r, seg),
      pipe: (pts, r, seg) => tube(pts.map(at), r, seg),
      board: (a, b, w, h) => beam(at(a), at(b), w, h)};
    def.build(pieceKit, it);
    if (def.collision) { const f = footprint(it, def); abox("collision", [f.x0, F, f.z0], [f.x1, F + def.height(it), f.z1]); }
  }
}
/** The ridge cap along the ridge from a0 to a1 (ridge coordinates), placed with M. */
function ridgeCap(a0, a1, ridgeY, tanP, M, ridgeX) {
  const m = ridgeCapMesh(a0 - 0.015, a1 + 0.015, ridgeY, tanP, 0.13), q = [];
  for (let k = 0; k < m.p.length; k += 3) q.push(...M(m.p[k], m.p[k + 1], m.p[k + 2]));
  const nn = [];
  for (let k = 0; k < m.n.length; k += 3) nn.push(...M(m.n[k], m.n[k + 1], m.n[k + 2]));
  const idx = [];
  // Swapping x and z mirrors the mesh, which turns its triangles inside out: turn them back.
  for (let k = 0; k < m.i.length; k += 3) idx.push(...(ridgeX ? [m.i[k], m.i[k + 1], m.i[k + 2]] : [m.i[k], m.i[k + 2], m.i[k + 1]]));
  addMesh("roof", {p: q, n: nn, uv: m.uv, i: idx});
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
    const tuck = mainEave ? -Math.max(0, tP - (mainEave.H - 0.02)) / mainEave.tanP : 0;
    const d0 = hollow ? Math.max(tuck, -WALL_T + 0.01) : tuck;
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
    wbox("trim", w, sb - 0.05, sb + 0.05, ta - 0.16, ta, 0, cd - 0.1);   // (up to the front beam, not through it)
    if (type === "porch") {
      wbox("trim", w, sb - 0.06, sb + 0.06, 0, ta - 0.16, cd - 0.14, cd - 0.02);
      wbox("collision", w, sb - 0.06, sb + 0.06, 0, ta - 0.16, cd - 0.14, cd - 0.02);
    }
    else sbox("trim", w, sb, 0.08, [0.02, ta - 0.9], [cd * 0.7, ta - 0.16]);
  }
  if (type === "porch") {
    const d0 = F > 0.01 ? PLINTH_OUT : 0;   // the deck from where the plinth ends
    wbox("foundation", w, sL, sR, -Math.max(F, 0.06), 0, d0, cd);
    wbox("collision", w, sL, sR, -Math.max(F, 0.06), 0, d0, cd);
    const n = F > 0.1 ? Math.max(1, Math.round(F / 0.18)) : 0, rh = n ? F / n : 0, stw = Math.min(cw - 0.3, 1.4);
    for (let k = 1; k < n; k++) {
      // each step its own slab, next to the one above (blocks inside each other share faces and flicker)
      wbox("foundation", w, cs - stw/2, cs + stw/2, -F, -k * rh, cd + (k - 1) * 0.28, cd + k * 0.28);
      wbox("collision", w, cs - stw/2, cs + stw/2, -F, -k * rh, cd + (k - 1) * 0.28, cd + k * 0.28);
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
  rooms = []; downpipes = []; doorLeaves = [];
  G = {}; [...MATS, "collision"].forEach(m => G[m] = {p:[], n:[], uv:[], i:[]});
  G.curtain.c = []; G.fittings.c = []; G.fittings.s = []; fitSurf = undefined;
  const W = p.width, D = p.depth, F = p.foundation, fh = p.floorHeight, H = p.floors * fh + (p.halfStorey ? p.kneeWall : 0), top = F + H;
  boardsFrom = hollow ? top + 0.05 : Infinity;
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

  const WS = wallFrames(W, D, F);
  let entr = null;
  opsByWall = {};
  for (const key in WS) {
    const gable = p.roofType === "gable" && (ridgeX ? (key === "left" || key === "right") : (key === "front" || key === "back"));
    const R = gable ? Math.max(0, rise - th) : 0, Lw = WS[key].L;
    const ops = layoutWall(key, Lw, fh, sv => H + R * Math.max(0, 1 - Math.abs(sv - Lw/2) / (Lw/2)));
    // Eave walls' inside faces reach into the roof slab (which sits lower further in), staying below its top.
    const inner = hollow ? {lift: R > 0 || p.roofType === "flat" ? 0 : Math.min(WALL_T * tanP, th - 0.02)} : null;
    buildWall(WS[key], ops, H, R, F, {topAt: sv => H + R * Math.max(0, 1 - Math.abs(sv - Lw/2) / (Lw/2)), inner});
    opsByWall[key] = {w: WS[key], ops};
    const dOp = ops.find(op => op.kind === "door");
    if (dOp) entr = {w: WS[key], o: dOp, key, gable};
  }
  if (entr && p.entrance !== "none") {
    let limit = 1e9;
    if (p.roofType === "flat") limit = H - 0.05;
    else if (!entr.gable && p.entrance === "shed") limit = H - th - Math.min(o, p.entranceDepth + 0.15) * tanP - 0.05;
    // A walk-in building's wall is thin, so a canopy can't tuck in under the eaves (it would show
    // inside): it stays below them instead, a little flatter if need be.
    else if (!entr.gable && hollow) limit = H - 0.05;
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
  if (F > 0.01) abox("foundation", [-W/2 - PLINTH_OUT, 0, -D/2 - PLINTH_OUT], [W/2 + PLINTH_OUT, F, D/2 + PLINTH_OUT]);
  if (!hollow) abox("collision", [-W/2, 0, -D/2], [W/2, top, D/2]);
  else {
    // Floor, then each wall as slabs with a gap for the door (the door leaf has its own collision)
    // and for any other opening tall enough to walk through (a cow barn's doorway to the pasture).
    if (F > 0.01) abox("collision", [-W/2, 0, -D/2], [W/2, F, D/2]);
    for (const key in WS) {
      const w = WS[key], gaps = opsByWall[key].ops.filter(o => o.kind === "door" || (o.kind === "hatch" && o.t1 >= 1.8)).sort((a, b) => a.s0 - b.s0);
      const slab = (s0, s1, t0, t1) => { if (s1 - s0 > 1e-6 && t1 - t0 > 1e-6) wbox("collision", w, s0, s1, t0, t1, -WALL_T, 0); };
      let s = 0;
      for (const g of gaps) { slab(s, g.s0, 0, H); slab(g.s0, g.s1, g.t1, H); s = g.s1; }
      slab(s, w.L, 0, H);
    }
  }

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
    ridgeCap(-hA, hA, ridgeY, tanP, M, ridgeX);
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
    if (rh > 0.05) ridgeCap(-rh, rh, ridgeY, tanP, M, ridgeX);
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
      // (on a gable roof the gutter stops 1 cm short of the barge boards: its end in their plane would flicker)
      const gEnd = hip ? hA + r : hA - 0.01;
      for (const [x0, x1] of segs(-gEnd, gEnd, cutsFor(s))) gutterRun(M(x0, yT, bg), M(x1, yT, bg), M(0, 0, s), r);
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
  const ridgeHalf = p.roofType === "hip" ? Math.max(0, Lr/2 - span/2) : Lr/2;
  if (p.ventilators > 0 && p.roofType !== "flat") buildVentilators(Lr, ridgeY, tanP, M, ridgeHalf, th, F);
  if (hollow && p.roofType !== "flat") {
    // (the tie beams at the ends are 12 cm thick: kept clear of the gable walls)
    const ext = p.roofType === "hip" ? Math.max(0, ridgeHalf - 0.3) : Lr/2 - WALL_T - 0.08;
    buildRoofFrame(ext, span, top, ridgeY, tanP, M, th, p.ventilators > 0 ? ventSpots(p.ventilators, ridgeHalf) : []);
  }
  // Things the kind puts outside its walls (a cow barn's troughs), drawn in "fittings" and "collision".
  if (kind.outside) kind.outside({p, geo: {opsByWall, dims: {W, D}}, abox, cyl, paint});
  // The placed pieces last (tests find a piece's vertices after the empty barn's).
  if (hollow) buildInside(kind, F, H);
  dims = {W, D, top, ridgeY, F};
}
build();
const {collision, ...visual} = G;
return {G: visual, dims, opsByWall, collision, rooms, downpipes, doorLeaves, refs};
}

/* ---------- Materials ---------- */
export function colorFor(p, m) {
  return {walls:p.wallColor, trim:p.trimColor, roof:p.roofColor, glass:"#2E3B44", door:p.doorColor, foundation:p.foundationColor, chimney:p.chimneyColor, gutter:p.gutterColor, interior:"#B8AE9C", curtain:p.curtainColor, fittings:"#E9E4D8"}[m];
}
export function surfaceSpec(p, m) {
  const kind = m === "walls" ? p.wallCladding
    : m === "roof" ? (p.roofType === "flat" ? "felt" : p.roofMaterial === "plain" ? null : p.roofMaterial)
    : m === "chimney" ? (p.chimneyStyle === "brick" ? "brick" : null)
    : m === "trim" || m === "door" ? "paintedwood"
    : m === "foundation" ? "concrete" : null;
  if (!kind) return null;
  const sp = p.panelSpacing;
  if (kind === "lockpanel") { const n = Math.max(2, Math.round(1.2 / sp)); return {kind, n, bw: Math.min(0.8, p.battenWidth / sp), w: n*sp, h: n*sp}; }
  if (kind === "horizontal") { const n = Math.max(2, Math.round(1.2 / sp)); return {kind, n, w: n*sp, h: n*sp}; }
  if (kind === "tiles") return {kind, w: 1.2, h: 1.36};
  if (kind === "brick") return {kind, w: 1.0, h: 0.6};
  if (SURFACES[kind]) return {kind, w: SURFACES[kind].w, h: SURFACES[kind].h};
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
 * The footprint is everything that touches the ground: walls, foundation, porch, steps, plus the
 * extra ground rectangles {x0, x1, z0, z1} (a chicken barn's feed, pallet and loading places).
 */
const LEVEL_MARGIN = 0.5;
export function placementAreas(geo, extra = []) {
  const all = [], ground = [];
  for (const m of MATS) {
    const g = geo.G[m];
    for (let i = 0; i < g.p.length; i += 3) {
      const v = [g.p[i], g.p[i+1], g.p[i+2]];
      all.push(v);
      if (v[1] < 0.01) ground.push(v);
    }
  }
  for (const r of extra) for (const x of [r.x0, r.x1]) for (const z of [r.z0, r.z1]) { ground.push([x, 0, z]); all.push([x, 0, z]); }
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

/* ---------- Export ---------- */
/** Whether the windows are see-through: with rooms behind them, or into a walk-in building. */
export const seeThroughGlass = p => !!p.interior || kindOf(p).walkIn;
/** Opacity of the window glass when it is see-through. */
export const GLASS_ALPHA = 0.22;
const NO_SHADOW = ["glass", "interior", "curtain"];
export function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map(v => num(v)).join(" ") + " 1"; }

/** The material for one visual part (m: its material kind, g: its mesh). */
const hexOf = rgb01 => "#" + rgb01.map(v => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
/** Texture files of an inside part with a surface: its own diffuse (the surface in its colour) and the surface's normal map. */
export function fitTexture(surf, rgb01) {
  const color = hexOf(rgb01);
  return {surf, color, diffuse: `textures/fit_${surf}_${color.slice(1)}.png`, normal: `textures/fit_${surf}_normal.png`};
}
/** Every texture the textured export of the fittings needs, once each: [{surf, color, diffuse, normal}]. */
export function fittingTextures(p, G = buildGeometry(normalize(p)).G) {
  const out = new Map();
  for (const g of splitByColor(G.fittings)) if (g.surf) { const t = fitTexture(g.surf, g.color); out.set(t.diffuse, t); }
  return [...out.values()];
}
function materialFor(doc, p, m, name, g, withTex) {
  if (g.color && withTex && g.surf) { const t = fitTexture(g.surf, g.color); return doc.material(`${name}_mat`, {}, [["Texture", t.diffuse], ["Normalmap", t.normal]]); }
  if (g.color) return doc.material(`${name}_mat`, {diffuseColor: `${v3(g.color)} 1`});
  if (withTex && surfaceSpec(p, m)) return doc.material(`${m}_mat`, {}, [["Texture", `textures/${m}_diffuse.png`], ["Normalmap", `textures/${m}_normal.png`]]);
  // See-through glass and the room atlas: base-game style alphaBlending on a texture.
  const glassy = m === "glass" && seeThroughGlass(p);
  if (withTex && (glassy || m === "interior")) return doc.material(`${m}_mat`, {alphaBlending: glassy || undefined}, [["Texture", `textures/${m}_diffuse.png`]]);
  if (glassy) return doc.material(`${m}_mat`, {diffuseColor: rgb(colorFor(p, m)).replace(/ 1$/, " " + GLASS_ALPHA), alphaBlending: true});
  return doc.material(`${m}_mat`, {diffuseColor: rgb(colorFor(p, m))});
}

/** Where a walk-in building's door prompt shows: a box across the doorway, both sides. */
function doorTrigger(geo, p) {
  const {w, ops} = geo.opsByWall[p.doorWall], o = ops.find(q => q.kind === "door"), s = (o.s0 + o.s1) / 2;
  const ax = Math.abs(w.u[0]) > 0.5, along = o.s1 - o.s0 + 0.6;
  return {center: [w.o[0] + w.u[0] * s, w.o[1] + 1.1, w.o[2] + w.u[2] * s], size: ax ? [along, 2.2, 2.4] : [2.4, 2.2, along]};
}

/**
 * Everything the export writes, built once: the i3d document and scene tree, and the placeable XML
 * blocks that name its nodes. The i3dMappings are looked up in the scene by name, so they always match.
 * Scene: house > clear/level/test/tipOcclusion areas, visuals, collisions (like the base game's
 * garden sheds), then a walk-in building's door, the kind's own nodes and the indoor area.
 */
function exportParts(p, {withTex = false} = {}) {
  p = normalize(p);
  const kind = kindOf(p), geo = buildGeometry(p), {G} = geo, doc = new I3dDoc();
  // One part per material, except curtains and fittings: one per color (i3d materials have one color).
  const parts = [];
  for (const m of MATS) {
    if (!G[m].i.length) continue;
    if (m === "curtain" || m === "fittings") splitByColor(G[m]).forEach((g, j) => parts.push({name: j ? `${m}${j + 1}` : m, m, g}));
    else parts.push({name: m, m, g: G[m]});
  }
  // A walk-in building's door leaves are each their own node at its hinge, so a leaf's mesh is relative to its hinge.
  const leaves = kind.walkIn ? geo.doorLeaves : [];
  const visuals = [];
  let doors = [];
  for (const {name, m, g} of parts) {
    const mat = materialFor(doc, p, m, name, g, withTex), uv = scaledUV(p, m, g);
    if (leaves.length && m === "door") {
      doors = leaves.map((leaf, k) => {
        const s = sliceMesh(g, leaf.from, leaf.to);
        return {leaf, mat, shape: doc.shape(k ? `${name}${k + 1}` : name, {...s, p: s.p.map((v, i) => v - leaf.hinge[i % 3])}, {uv: scaledUV(p, m, s)})};
      });
      continue;
    }
    visuals.push(shape(name, {shapeId: doc.shape(name, g, {uv}), castsShadows: !(NO_SHADOW.includes(m) && (m !== "glass" || seeThroughGlass(p))), receiveShadows: true, materialIds: mat}));
  }
  const cm = doc.material("collision_mat", {diffuseColor: "1 0 1 1"});
  const collision = shape("collision", {shapeId: doc.shape("collision", geo.collision, {cpu: true}), static: true, collisionFilterGroup: "0x3e",
    collisionFilterMask: "0xfffffbff", nonRenderable: true, castsShadows: false, receiveShadows: false, materialIds: cm});

  // What kinds get to build their nodes with.
  const box = (name, b, attrs) => shape(name, {translation: b.center, shapeId: doc.shape(name, boxMesh(b.size), {cpu: true}), ...attrs,
    nonRenderable: true, castsShadows: false, receiveShadows: false, materialIds: cm});
  const trigger = (group, mask) => ({static: true, trigger: true, collisionFilterGroup: group, collisionFilterMask: mask});
  const own = kind.scene ? kind.scene({p, geo, doc, box, trigger, sleepPoint}) : {nodes: [], xml: "", areas: []};

  let doorNodes = [], doorXml = "";
  if (doors.length) {
    doorNodes = [tg("doors", [0, 0, 0], [
      // Each leaf turned about its hinge by the animatedObject; its collision moves with it.
      ...doors.map(({leaf, shape: sid, mat}, k) => shape(`door${k + 1}`, {translation: leaf.hinge, shapeId: sid, castsShadows: true, receiveShadows: true, materialIds: mat}, [
        shape(`door${k + 1}Collision`, {translation: leaf.box.center.map((v, i) => v - leaf.hinge[i]), shapeId: doc.shape(`door${k + 1}CollisionBox`, boxMesh(leaf.box.size), {cpu: true}),
          kinematic: true, collisionFilterGroup: "0x1034", collisionFilterMask: "0xfffffbff", nonRenderable: true, castsShadows: false, receiveShadows: false, materialIds: cm})])),
      box("door1Trigger", doorTrigger(geo, p), trigger("0x20000000", "0x110000")),
    ])];
    doorXml = `
    <!-- The door${doors.length > 1 ? "s: both leaves open together" : ""}: walk up to it and use the open/close prompt, as on the base game's barns. -->
    <animatedObjects>
        <animatedObject saveId="door1">
            <animation duration="1.5">
${doors.map(({leaf}, k) => `                <part node="door${k + 1}">
                    <keyFrame time="0" rotation="0 0 0"/>
                    <keyFrame time="1" rotation="0 ${leaf.openAngle} 0"/>
                </part>`).join("\n")}
            </animation>
            <controls triggerNode="door1Trigger" posAction="ACTIVATE_HANDTOOL" posText="action_openDoor" negText="action_closeDoor"/>
            <sounds>
                <moving linkNode="door1" template="woodDoorSqueaksSmall"/>
                <posEnd linkNode="door1" template="woodDoorOpen"/>
                <negEnd linkNode="door1" template="woodDoorCloseRandom"/>
            </sounds>
        </animatedObject>
    </animatedObjects>
`;
  }

  // Rectangle on the ground as start + width (along z) + height (along x), like the base game.
  const rect = (k, r) => tg(`${k}Areas`, [0, 0, 0], [tg(`${k}AreaStart01`, [r.x0, 0, r.z0], [
    tg(`${k}AreaWidth01`, [0, 0, r.z1 - r.z0]), tg(`${k}AreaHeight01`, [r.x1 - r.x0, 0, 0])])]);
  // Box or rectangle from start to end, with end a child of start.
  const corner = (group, k, min, max) => tg(group, [0, 0, 0], [tg(`${k}Start01`, min, [tg(`${k}End01`, max.map((v, i) => v - min[i]))])]);
  // Imported items: their own i3d, in items/<name>_<id>/ next to this one, loaded where they're placed.
  const counts = {};
  const refNodes = geo.refs.map(r => {
    const folder = assetFolder(r.asset), stem = folder.slice(6).replace(/_.*$/, "");
    counts[stem] = (counts[stem] || 0) + 1;
    return refNode(stem + String(counts[stem]).padStart(2, "0"), {translation: r.translation, rotation: [0, r.rotY, 0],
      referenceId: doc.file(`${folder}/${r.asset.meta.i3d}`)});
  });
  const A = placementAreas(geo, own.areas), t = A.test, {W, D} = geo.dims;
  const indoor = kind.walkIn || p.sleepPoint;
  const root = tg("house", [0, 0, 0], [
    rect("clear", A.clear),
    rect("level", A.level),
    corner("testAreas", "testArea", t.min, t.max),
    corner("tipOcclusionUpdateAreas", "tipOcclusionUpdateArea", [t.min[0], 0, t.min[2]], [t.max[0], 0, t.max[2]]),
    tg("visuals", [0, 0, 0], visuals),
    tg("collisions", [0, 0, 0], [collision]),
    ...doorNodes,
    ...own.nodes,
    ...(indoor ? [rect("indoor", {x0: -W / 2, x1: W / 2, z0: -D / 2, z1: D / 2})] : []),
    ...(refNodes.length ? [tg("items", [0, 0, 0], refNodes)] : []),
  ]);

  const blocks = `${own.xml}${doorXml}${indoor ? `
    <!-- Inside the walls: no rain, and the game knows where indoors is. -->
    <indoorAreas>
        <indoorArea startNode="indoorAreaStart01" widthNode="indoorAreaWidth01" heightNode="indoorAreaHeight01"/>
    </indoorAreas>
` : ""}
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
`;
  const maps = mappingsFor(root, blocks).map(([id, path]) => `        <i3dMapping id="${id}" node="${path}"/>`);
  return {p, kind, doc, root, blocks: `${blocks}
    <i3dMappings>
${maps.join("\n")}
    </i3dMappings>
`};
}

export function buildI3d(p, opts) {
  const {doc, root} = exportParts(p, opts);
  return doc.write(root);
}

/** Blocks to paste into a placeable XML, with i3dMappings that match the i3d buildI3d writes. */
export function placeableSnippet(p = DEFAULTS) {
  const {kind, blocks, p: q} = exportParts(p), note = kind.placeable(q).note;
  return `<!-- Paste these into your placeable XML (inside <placeable>). Generated by House to i3d. -->
${note ? `
    <!-- ${note} -->` : ""}${blocks}`;
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
  const {kind, blocks, p: q} = exportParts(p), {type, fn, shop} = kind.placeable(q);
  return `<?xml version="1.0" encoding="utf-8" standalone="no" ?>
<placeable type="${type}">
    <!-- Generated by House to i3d. -->
    <storeData>
        <name>${esc(shopName(name))}</name>
        <functions>
${[].concat(fn).map(f => `            <function>${f}</function>`).join("\n")}
        </functions>
        <image>${MOD_FILES.store}</image>
        <canBeSold>true</canBeSold>
        <showInStore>true</showInStore>
        <price>${Math.round(q.modPrice)}</price>
        <lifetime>1000</lifetime>
        <dailyUpkeep>${Math.round(q.modUpkeep)}</dailyUpkeep>
        <rotation>0</rotation>
        <brand>NONE</brand>
        <species>PLACEABLE</species>
        <category>${shop.category}</category>
        <brush>
            <type>${shop.type}</type>
            <category>${shop.brush}</category>
            <tab>${shop.tab}</tab>
        </brush>
    </storeData>

    <base>
        <filename>${MOD_FILES.i3d}</filename>
        <canBeRenamed>true</canBeRenamed>
    </base>
${blocks}</placeable>
`;
}

/** Author name for a user ({name, email}): their name, else the part of the email before the @. */
export function authorName(user) {
  if (!user) return "";
  return String(user.name || "").trim() || String(user.email || "").split("@")[0].trim();
}

/** Description used when the building has none of its own. */
export function defaultModDescription(p) {
  return kindOf(p).description(normalize(p));
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
