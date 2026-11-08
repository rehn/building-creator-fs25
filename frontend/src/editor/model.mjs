// Building model: settings, validation, geometry and i3d export. The core every building shares;
// what differs per kind of building (farmhouse, hen house ...) lives in kinds/.
// Pure functions with no DOM or three.js, so they run (and are tested) in Node.
import { I3dDoc, tg, shape, refNode, boxMesh, splitByColor, mappingsFor, num, v3 } from "./i3d.mjs";
import { KINDS, kindOf } from "./kinds/index.mjs";
import { WALL_T, wallFrames, wallsOf, liveWings, wingsOf, wingIdOf, eaveWalls, autoPipes, cleanPipes, cleanPapers, WING_PARTS, MAX_WINGS, HARD_MAX_PARTS, setMaxParts, WING_WALLS, wingWallKey, openingSpan, roomOf, footprint, toWorld, cleanItems, problems } from "./layout.mjs";
import { withAssets, placement, assetFolder } from "./assets.mjs";
import { SURFACES } from "./surfaces.mjs";
import { agedColor } from "./age.mjs";
import { cleanObjects, objectOf, boxOf, objectInfo } from "./objects.mjs";
import { WALLPAPERS } from "./kinds/innerwall.mjs";
import { WINDOW_STYLES, DOOR_STYLES, WINDOW_STYLE_IDS, DOOR_STYLE_IDS, DOUBLE_DOOR_FROM, isPair, styleOf, drawSash, drawLeaf } from "./openings.mjs";
export { WINDOW_STYLES, DOOR_STYLES, DOUBLE_DOOR_FROM } from "./openings.mjs";
export { boxMesh } from "./i3d.mjs";
export { KINDS, KIND, kindOf, groupByKind, CATEGORIES } from "./kinds/index.mjs";
export { henYard, henCap, HENS_PER_M2, MAX_HENS } from "./kinds/chicken.mjs";

/* ---------- Settings ---------- */
/** Settings every building has. A kind adds its own (kind.defaults). */
export const DEFAULTS = {
  kind:"house",
  width:10, depth:7, floors:2, floorHeight:2.7, foundation:0.4, halfStorey:false, ceiling:true, insideSame:false, studSpacing:0.6, studWidth:0.045, studIrregular:0, kneeWall:0.9,
  wing:false, wingWall:"back", wingPos:0.15, wingWidth:6, wingDepth:5,
  roofType:"gable", ridge:"width", roofPitch:38, overhang:0.5, chimney:true,
  winFront:2, winBack:3, winLeft:1, winRight:1, winW:1.0, winH:1.25, sill:0.85, winStyle:"casement",
  doorStyle:"panel",
  wallSplit:"one", splitHeight:2.7, lowerCladding:"plaster", lowerColor:"#EAE6DC", innerCladding:"vertical", innerColor:"#B08E62",
  wallCladding:"lockpanel", panelSpacing:0.2, battenWidth:0.06, roofMaterial:"tiles", chimneyStyle:"brick", chimneyColor:"#8A3B2C",
  gutters:true, downpipes:2, gutterColor:"#3B3F42",
  wallColor:"#8E2A1E", trimColor:"#F2EFE8", roofColor:"#2B2D2F", doorColor:"#3E5A4A", innerDoorColor:"#E9E3D3", foundationColor:"#6E6E6A",
  interior:true, insidePaper:"none", curtainStyle:"sides", curtainColor:"#EFE9DC", ventilators:0, age:0,
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
/**
 * Settings as the building's kind uses them (a hen house has no sleep point, rooms or dormers ...),
 * with any of the kind's own settings that are missing taken from its defaults.
 */
const normalize = p => { const k = kindOf(p); return k.normalize({...k.defaults, ...p}); };
const pickRoom = v => ROOM_TYPES.includes(v) ? v : "auto";
const pickCurtain = v => CURTAIN_STYLES.includes(v) ? v : "default";
const pickColor = v => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : "default";
/** What the walls can be clad in: [id, name]. */
const CLADDING = [["lockpanel","Board and batten (lockpanel)"],["horizontal","Horizontal boards"],["vertical","Vertical boards (stående plank)"],["plaster","Plaster"]];
/** The editor's tabs, one for each thing you do: [id, name]. Every section is in one of them (its tab). */
export const TABS = [["building", "Building"], ["shape", "Shape"], ["openings", "Openings"], ["inside", "Inside"], ["look", "Look"], ["game", "Game"]];
/** Editor sections every building shares (kinds hide the ones they don't use, see kind.hides). */
const SHARED_SECTIONS = [
  {title:"Building", label:"Parts, walls and openings", tab:"building", custom:"tree", hint:"The building as a tree: the main building, its walls, and on each wall its windows, doors and parts (a part has walls of its own, with their things). Choose one to change it, and add a window, a door or a part on a wall. Tap a wall, a window or a door in the preview to find it here.", fields:[]},
  // tab: where the editor shows the section (TABS); label: its name there, when not the title (the title is also its id).
  {title:"Size", tab:"shape", fields:[
    {k:"width", label:"Front wall length", min:2.5, max:60, step:0.1, unit:" m"},
    {k:"depth", label:"Side wall length", min:2.5, max:30, step:0.1, unit:" m"},
    {k:"floors", label:"Full floors", min:1, max:3, step:1},
    {k:"halfStorey", label:"Half floor in the roof (1\u00BD-plan)", type:"check"},
    {k:"kneeWall", label:"Knee wall height", min:0.2, max:1.6, step:0.05, unit:" m"},
    {k:"ceiling", label:"Ceiling over the ground floor (closes the roof space, so you don’t see up to the ridge)", type:"check"},
    {k:"floorHeight", label:"Floor height", min:2.3, max:9, step:0.05, unit:" m"},
    {k:"foundation", label:"Foundation height", min:0, max:1.2, step:0.05, unit:" m"}]},
  {title:"Roof", tab:"shape", fields:[
    {k:"roofType", label:"Roof type", type:"select", options:[["gable","Gable"],["hip","Hip"],["flat","Flat"]]},
    {k:"ridge", label:"Ridge direction", type:"select", options:[["width","Parallel to the front"],["depth","Front to back"]]},
    {k:"roofPitch", label:"Pitch", min:5, max:60, step:1, unit:"\u00B0"},
    {k:"overhang", label:"Overhang", min:0, max:1.2, step:0.05, unit:" m"},
    {k:"chimney", label:"Chimney", type:"check"},
    {k:"gutters", label:"Rain gutters", type:"check"},
    {k:"downpipes", label:"Downpipes per long side (a new house starts with this; place them one by one under Downpipes)", min:0, max:2, step:1},
    {k:"ventilators", label:"Roof ventilators (lanterns on the ridge)", min:0, max:4, step:1}]},
  {title:"Downpipes", tab:"shape", custom:"pipes", hint:"Where the downpipes go: how many on each wall with a gutter, and where along it. Change \"Downpipes per long side\" under Roof to place them again.", fields:[]},
  {title:"Kupor (dormers)", tab:"shape", custom:"dormers", fields:[]},
  {title:"Windows", tab:"openings", custom:"windows", hint:"The style and size new windows get. The windows and doors themselves are in the Building tab: choose one there (or tap it in the preview) to move it, resize it or give a door a porch.", fields:[
    {k:"winStyle", label:"Style", type:"select", options:WINDOW_STYLES.map(s => [s.id, s.name])},
    {k:"winW", label:"Width", min:0.4, max:2.5, step:0.05, unit:" m"},
    {k:"winH", label:"Height", min:0.4, max:2.2, step:0.05, unit:" m"},
    {k:"sill", label:"Sill height", min:0.2, max:1.5, step:0.05, unit:" m"}]},
  {title:"Doors", tab:"openings", hint:"The style of every door. The doors themselves are in the list under Windows: choose one there (or tap it in the preview) to move it, change its size or give it a porch or canopy.", fields:[
    {k:"doorStyle", label:"Style", type:"select", options:DOOR_STYLES.map(s => [s.id, s.name])}]},
  {title:"Inside", label:"Furniture and pieces", tab:"inside", custom:"inside", hint:"The pieces inside the building. Fill it automatically to match its size, then change it as you like.", fields:[]},
  {title:"Surfaces", tab:"look", custom:"zones", fields:[
    {k:"wallCladding", label:"Wall cladding (the upper part when split)", type:"select", options:CLADDING},
    {k:"wallSplit", label:"Two materials on the walls", type:"select", options:[["one","No, one material"],["floor","Yes, split at the top of the ground floor"],["height","Yes, split at a height"]]},
    {k:"splitHeight", label:"Split height, above the ground floor's floor", min:0.5, max:10, step:0.05, unit:" m"},
    {k:"lowerCladding", label:"Lower part's cladding", type:"select", options:CLADDING},
    {k:"innerCladding", label:"Panel on inner walls (a side of an inner wall can be this, with the studs showing)", type:"select", options:[...CLADDING, ["same", "Same as the facade"], ["sameLow", "Same as the facade’s lower part"]]},
    {k:"panelSpacing", label:"Board width", min:0.12, max:0.4, step:0.005, cm:true},
    {k:"battenWidth", label:"Batten width", min:0.03, max:0.1, step:0.005, cm:true},
    {k:"roofMaterial", label:"Roof covering", type:"select", options:[["tiles","Concrete tiles"],["metal","Standing seam metal"],["plain","Plain color"]]},
    {k:"chimneyStyle", label:"Chimney", type:"select", options:[["brick","Brick"],["plain","Plain color"]]},
    {k:"age", label:"Age (paint fades, moss, rust, dirt)", min:0, max:60, step:1, unit:" years"}]},
  {title:"Colors", tab:"look", colors:true, fields:[
    {k:"wallColor", label:"Walls", type:"color"},
    {k:"lowerColor", label:"Lower walls", type:"color"},
    {k:"innerColor", label:"Inner wall panels", type:"color"},
    {k:"trimColor", label:"Trim", type:"color"},
    {k:"roofColor", label:"Roof", type:"color"},
    {k:"doorColor", label:"Door", type:"color"},
    {k:"innerDoorColor", label:"Inner doors", type:"color"},
    {k:"foundationColor", label:"Base", type:"color"},
    {k:"chimneyColor", label:"Chimney", type:"color"},
    {k:"gutterColor", label:"Gutters", type:"color"},
    {k:"curtainColor", label:"Curtains", type:"color"}]},
  {title:"Interior", label:"Rooms and curtains", tab:"inside", hint:"The floors above the ground floor are closed: a small furnished room is seen through each of their windows. To pick the room or curtains for one window, choose it under Windows (or a kupa under Kupor). The ground floor's inside is under Inside.", fields:[
    {k:"curtainStyle", label:"Curtains", type:"select", options:CURTAIN_OPTIONS}]},
  {title:"Inside walls", label:"Inside walls", tab:"inside", custom:"papers", hint:"What the outer walls look like from inside: like the outside (studs behind boards, plaster as plaster, the same split in two materials), or the kind's own finish. Wallpaper goes over either: one for every wall, or sections along a wall, one for each room behind it.", fields:[
    {k:"insideSame", label:"Like the outside (boards show their studs inside)", type:"check"},
    {k:"studSpacing", label:"Studs: distance between them", min:0.4, max:1.5, step:0.05, unit:" m"},
    {k:"studWidth", label:"Studs: width of each (older barns: heavier)", min:0.045, max:0.12, step:0.005, cm:true},
    {k:"studIrregular", label:"Studs: how uneven (older barns: more)", min:0, max:1, step:0.05},
    {k:"insidePaper", label:"Wallpaper on every inside wall", type:"select", options:[["none", "None (plaster as it is)"], ...WALLPAPERS.map((w, i) => [String(i), w[0]])]}]},
  {title:"Game objects", tab:"game", custom:"objects", hint:"What the game needs around the building: where you sleep, tip feed, drop bales, load animals, collect eggs, and the pasture's fence. Add and remove them here, and drag them into place in the plan view.", fields:[]},
  {title:"Game mod", label:"Shop and mod", tab:"game", hint:"Used by \u201CExport game mod\u201D: what the house costs in the shop and who made it. The project name is the name in the shop.", fields:[
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
export const WALL_NAMES = {front:"Front", back:"Back", left:"Left side", right:"Right side",
  ...Object.fromEntries(Array.from({length: HARD_MAX_PARTS}, (_, i) => [[wingWallKey(i + 1, "End"), `Wing ${i + 1} end`], [wingWallKey(i + 1, "Left"), `Wing ${i + 1} left side`], [wingWallKey(i + 1, "Right"), `Wing ${i + 1} right side`]]).flat())};
export { WING_WALLS, MAX_WINGS, HARD_MAX_PARTS, setMaxParts };
/** A wing's sliders (the wall and floors are selects): the settings of a wing in p.wings. */
export const WING_FIELDS = [
  {k:"pos", label:"Middle of the wing along the wall (m from the left end, seen from outside)", min:0, max:1, step:0.005},
  {k:"width", label:"Width", min:2.5, max:30, step:0.1, unit:" m"},
  {k:"depth", label:"Length, out from the wall", min:2, max:30, step:0.1, unit:" m"}];
/**
 * The wings, cleaned: up to MAX_WINGS, each with a number 1..MAX_WINGS (its walls' names, kept as saved) and its
 * settings in range. A save from when a house had one wing (wing, wingWall ...) makes wing 1.
 */
function cleanWings(obj) {
  const list = Array.isArray(obj.wings) ? obj.wings : obj.wing === true ? [{id: 1, wall: obj.wingWall, pos: obj.wingPos, width: obj.wingWidth, depth: obj.wingDepth}] : [];
  const used = new Set(), out = [];
  for (const w of list.filter(x => x && typeof x === "object").slice(0, MAX_WINGS)) {
    // a part stands on a wall of the house or of a part before it in the list (its parent); one whose parent is missing goes too
    const nested = WING_WALLS.includes(w.wall);
    if (nested && !used.has(wingIdOf(w.wall))) continue;
    let id = Number.isInteger(w.id) && w.id >= 1 && w.id <= MAX_WINGS && !used.has(w.id) ? w.id : 0;
    if (!id) for (let i = 1; i <= MAX_WINGS; i++) if (!used.has(i)) { id = i; break; }
    used.add(id);
    out.push({id, wall: WALLS.includes(w.wall) || nested ? w.wall : "back", pos: clampN(w.pos, 0, 1, 0.15), width: clampN(w.width, 2.5, 30, 6), depth: clampN(w.depth, 2, 30, 5), floors: Math.round(clampN(w.floors, 0, 3, 0)), half: w.half === true, ...cleanPartStyle(w), name: typeof w.name === "string" ? w.name.trim().slice(0, 40) : "", floorHeight: +w.floorHeight > 0 ? Math.round(clampN(w.floorHeight, 2.3, 9, 2.7) * 100) / 100 : 0, pitch: +w.pitch > 0 ? Math.round(clampN(w.pitch, 5, 60, 5)) : 0});
  }
  return out;
}
export const clampN = (v, lo, hi, d) => { v = +v; return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
export function genRow(P, list, wall, floor, n) {
  const frame = wallsOf(P)[wall];
  if (!frame) return list;
  const L = frame.L;
  let id = list.reduce((m, w) => Math.max(m, w.id), 0);
  // (doors stay: the count is of windows)
  const keep = list.filter(w => !(w.wall === wall && w.floor === floor && w.type !== "door"));
  const pos = [];
  if (n > 0) {
    // what a window keeps clear of: a ground-floor wall's doors, and the stretch of the wall a wing stands against (where it covers this floor: it hides windows)
    const doors = [...(floor === 0 ? list.filter(w => w.type === "door" && w.wall === wall).map(d => openingSpan(d, L)) : []),
      ...liveWings(P).filter(g => g.wall === wall && floor < g.floors).map(g => [g.s0, g.s1])];
    // Evenly spaced, one slot more per door and the slot nearest each door left out (a door in the
    // middle gets a window either side) ...
    const slots = Array.from({length: n + doors.length}, (_, i) => (i + 0.5) / (n + doors.length) * L);
    for (const [a, b] of doors) { const c = (a + b) / 2; let bi = 0; slots.forEach((s, i) => { if (Math.abs(s - c) < Math.abs(slots[bi] - c)) bi = i; }); slots.splice(bi, 1); }
    const half = P.winW / 2 + 0.25, clear = s => doors.every(([a, b]) => s + half <= a || s - half >= b);
    if (slots.every(clear)) pos.push(...slots);
    else {
      // ... unless one would be over a door: then spread them over the stretches between the doors.
      const lo = Math.min(L / 2, P.winW / 2 + 0.2), hi = Math.max(L / 2, L - P.winW / 2 - 0.2), free = [];
      let at = lo;
      for (const [a, b] of [...doors].sort((x, y) => x[0] - y[0])) { if (a - half > at) free.push([at, a - half]); at = Math.max(at, b + half); }
      if (hi > at) free.push([at, hi]);
      if (!free.length) free.push([lo, hi]);
      // windows per stretch by its room (a stretch's length plus one window), largest remainders first
      const room = free.map(([a, b]) => b - a + 2 * half), total = room.reduce((s, v) => s + v, 0);
      const k = room.map(r => Math.floor(n * r / total));
      room.map((r, i) => [n * r / total - k[i], i]).sort((x, y) => y[0] - x[0]).slice(0, n - k.reduce((s, v) => s + v, 0)).forEach(([, i]) => k[i]++);
      free.forEach(([a, b], i) => { for (let j = 0; j < k[i]; j++) pos.push(a + (b - a) * (k[i] === 1 ? 0.5 : j / (k[i] - 1))); });
    }
  }
  for (const s of pos) keep.push({id: ++id, wall, floor, pos: s / L, w: P.winW, h: P.winH, sill: P.sill, type: "window", style: "default", room: "auto", curtain: "default", curtainColor: "default"});
  return keep;
}
export function genAll(P, src, start = []) {
  let list = start;
  for (const wall of WALLS) {
    const key = "win" + wall[0].toUpperCase() + wall.slice(1);
    const n = Math.round(clampN(src[key], 0, 8, DEFAULTS[key]));
    for (let f = 0; f < 3; f++) list = genRow(P, list, wall, f, n);
  }
  return list;
}
/** Walls with a split of their own: {wall: {split, height}}, for the walls that exist and splits that are known (the rest follow wallSplit). */
function cleanWallZones(z, p) {
  const out = {}, walls = wallsOf(p);
  if (z && typeof z === "object") for (const [k, v] of Object.entries(z)) {
    if (!walls[k] || !v || !["one", "floor", "height"].includes(v.split)) continue;
    out[k] = v.split === "height" ? {split: "height", height: clampN(v.height, 0.5, 10, p.splitHeight)} : {split: v.split};
  }
  return out;
}
/** Walls with a panel/colour of their own (wallCladding, wallColor, lowerCladding, lowerColor; the rest as the part the wall belongs to): {wall: {...}}. */
const WALL_STYLE_KEYS = ["wallCladding", "wallColor", "lowerCladding", "lowerColor"];
function cleanWallStyles(z, p) {
  const out = {}, walls = wallsOf(p);
  if (z && typeof z === "object") for (const [k, v] of Object.entries(z)) {
    if (!walls[k] || !v || typeof v !== "object") continue;
    const own = cleanPartStyle(v), keep = {};
    for (const key of WALL_STYLE_KEYS) if (own[key] !== undefined) keep[key] = own[key];
    if (Object.keys(keep).length) out[k] = keep;
  }
  return out;
}
/** Where the lower material ends on wall key (m above the wall's foot; 0: one material): the wall's own split, else the building's. */
export function splitAtOf(p, key) {
  const z = p.wallZones && p.wallZones[key], st = partStyle(p, wingIdOf(key)), mode = z ? z.split : st.wallSplit;
  const fh = wingIdOf(key) ? ((liveWings(p).find(x => x.id === wingIdOf(key)) || {}).fh || p.floorHeight) : p.floorHeight;
  return mode === "floor" ? fh : mode === "height" ? (z && z.height !== undefined ? z.height : st.splitHeight) : 0;
}
/** How many windows and doors each wall has on each floor: {wall: {floor: {windows, doors}}} for the house's walls and its wings' (floors 0 to 2). */
export function openingCounts(p) {
  const out = {};
  for (const wall of Object.keys(wallsOf(p))) out[wall] = [0, 1, 2].map(f => ({windows: p.windows.filter(w => w.wall === wall && w.floor === f && w.type !== "door").length, doors: p.windows.filter(w => w.wall === wall && w.floor === f && w.type === "door").length}));
  return out;
}
/** The list without the wall's last door, or null if it has none or it is the building's only door (a building keeps one). */
export function removeDoor(list, wall) {
  const doors = list.filter(w => w.type === "door");
  const mine = doors.filter(w => w.wall === wall);
  if (!mine.length || doors.length < 2) return null;
  const last = mine[mine.length - 1];
  return list.filter(w => w !== last);
}
/* ---------- Materials per part ---------- */
// A part's own settings for how it looks: empty (left out) means as its parent, all the way up to the building.
const STYLE_KEYS = ["wallCladding", "wallColor", "wallSplit", "splitHeight", "lowerCladding", "lowerColor", "roofMaterial", "roofColor", "trimColor"];
const HEX = /^#[0-9a-f]{6}$/i;
function cleanPartStyle(w) {
  const out = {};
  if (CLADDING.some(c => c[0] === w.wallCladding)) out.wallCladding = w.wallCladding;
  if (CLADDING.some(c => c[0] === w.lowerCladding)) out.lowerCladding = w.lowerCladding;
  for (const k of ["wallColor", "lowerColor", "roofColor", "trimColor"]) if (typeof w[k] === "string" && HEX.test(w[k])) out[k] = w[k];
  if (["one", "floor", "height"].includes(w.wallSplit)) out.wallSplit = w.wallSplit;
  if (w.splitHeight !== undefined && w.splitHeight !== "" && Number.isFinite(+w.splitHeight)) out.splitHeight = clampN(w.splitHeight, 0.5, 10, 2.7);
  if (["tiles", "metal", "plain"].includes(w.roofMaterial)) out.roofMaterial = w.roofMaterial;
  return out;
}
/** What a part looks like: its own settings, else its parent's, else the building's (wallCladding, wallColor, wallSplit, splitHeight, lowerCladding, lowerColor, roofMaterial, roofColor, trimColor). id 0: the building. */
export function partStyle(p, id) {
  const wings = p.wings || [], chain = [];
  let g = id ? wings.find(w => w.id === id) : null;
  for (let n = 0; g && n < 50; n++) { chain.push(g); const pid = wingIdOf(g.wall); g = pid ? wings.find(w => w.id === pid) : null; }
  const out = {};
  for (const k of STYLE_KEYS) { const own = chain.find(w => w[k] !== undefined && w[k] !== ""); out[k] = own ? own[k] : p[k]; }
  return out;
}
/** A material's slot: "wallsP2" is a variant of "walls". */
export const slotOf = m => m.replace(/P\d+$/, "");
/**
 * The materials the parts with a look of their own need: {variants: [{name, slot, kind, color}], of: {part id: {walls, wallsLow, roof, trim}}}. A part's walls, lower walls,
 * roof and trim are in the building's own material (walls, wallsLow, roof, trim) when its panel/covering and colour are the building's, else in a variant ("wallsP1" ...)
 * that every part with the same panel and colour shares.
 */
export function matTable(p) {
  const flat = p.roofType === "flat", roofKind = m => flat ? "felt" : m;
  const base = {walls: [p.wallCladding, p.wallColor], wallsLow: [p.lowerCladding, p.lowerColor], roof: [roofKind(p.roofMaterial), p.roofColor], trim: ["", p.trimColor]};
  const key = (slot, kind, color) => `${slot}|${kind}|${String(color).toLowerCase()}`, variants = [], names = {}, count = {}, of = {}, ow = {};
  const pick = (slot, kind, color) => {
    const k = key(slot, kind, color);
    if (k === key(slot, ...base[slot])) return slot;
    if (!names[k]) { count[slot] = (count[slot] || 0) + 1; names[k] = `${slot}P${count[slot]}`; variants.push({name: names[k], slot, kind, color}); }
    return names[k];
  };
  for (const w of liveWings(p)) {
    const st = partStyle(p, w.id), want = {walls: [st.wallCladding, st.wallColor], wallsLow: [st.lowerCladding, st.lowerColor], roof: [roofKind(st.roofMaterial), st.roofColor], trim: ["", st.trimColor]};
    of[w.id] = {};
    for (const slot of ["walls", "wallsLow", "roof", "trim"]) {
      of[w.id][slot] = pick(slot, ...want[slot]);
    }
  }
  // a wall with a panel or colour of its own: its walls and lower walls (what it doesn't set stays the part's)
  for (const [wall, own] of Object.entries(p.wallStyles || {})) {
    const st = {...partStyle(p, wingIdOf(wall)), ...own}, o = {};
    if (own.wallCladding !== undefined || own.wallColor !== undefined) o.walls = pick("walls", st.wallCladding, st.wallColor);
    if (own.lowerCladding !== undefined || own.lowerColor !== undefined) o.wallsLow = pick("wallsLow", st.lowerCladding, st.lowerColor);
    if (Object.keys(o).length) ow[wall] = o;
  }
  return {variants, of, ow};   // (not kept: the editor changes p in place)
}
const variantOf = (p, m) => /P\d+$/.test(m) ? matTable(p).variants.find(v => v.name === m) : undefined;
/** Every material the building uses: the shared ones, then the parts' own. */
export const matList = p => [...MATS, ...matTable(p).variants.map(v => v.name)];
/** A part's name: its own, else "Wing n". */
export const partName = (p, id) => { const w = (p.wings || []).find(x => x.id === id); return w && w.name ? w.name : `Wing ${id}`; };
/** A wall's name for the editor: the house's own, or "<part's name> end | left side | right side". */
export function wallLabel(p, key) {
  const id = wingIdOf(key), side = /(End|Left|Right)$/.exec(key || "");
  if (!id || !side) return WALL_NAMES[key] || key;
  return `${partName(p, id)} ${{End: "end", Left: "left side", Right: "right side"}[side[1]]}`;
}
/**
 * What is on a wall, in order from its left end seen from outside: [{kind: "window" | "door" | "part", id, s0, s1, floor (windows and doors), floors (a part's), hidden, off}].
 * A part is a part standing on the wall (also one that is left out: off is why).
 */
export function wallItems(p, key) {
  const frame = wallsOf(p)[key];
  if (!frame) return [];
  const L = frame.L, live = wingsOf(p), out = [], wid = wingIdOf(key), wg = wid && live.find(x => x.id === wid);
  // (a window on a floor the wall doesn't have, from when the building had more, stays in the save but is not shown: nothing is built there)
  const floors = (wg ? wg.floors : p.floors) + ((wg ? wg.half : p.halfStorey) ? 1 : 0);
  for (const w of p.windows || []) if (w.wall === key && w.floor < floors) { const [s0, s1] = openingSpan(w, L); out.push({kind: w.type === "door" ? "door" : "window", id: w.id, floor: w.floor, s0, s1, hidden: !!w._hidden}); }
  for (const g of p.wings || []) if (g.wall === key) {
    const l = live.find(x => x.id === g.id);
    if (l && l.frames) out.push({kind: "part", id: g.id, s0: l.s0, s1: l.s1, floors: l.floors});
    else { const c = g.pos * L, hw = g.width / 2; out.push({kind: "part", id: g.id, s0: Math.max(0, c - hw), s1: Math.min(L, c + hw), off: (l && l.off) || "It is left out."}); }
  }
  return out.sort((a, b) => a.s0 - b.s0 || a.s1 - b.s1);
}
/**
 * The building as a tree for the editor: {type: "main", children: [walls], lost: [parts]}; a wall {type: "wall", key, children}, whose children are the
 * windows and doors on it ({type: "window" | "door", id, floor, s0, s1, hidden}) and the parts that stand on it ({type: "part", id, off?, children: that part's walls}), in order from its
 * left end; a wall with several floors has the parts and then a level for each floor ({type: "floor", key, floor, children: its windows and doors}). A part that is left out has no walls; the parts on one that isn't reachable (its parent was left out) are in lost.
 */
export function buildingTree(p) {
  const walls = wallsOf(p), seen = new Set();
  const live = wingsOf(p);
  const wallNode = key => {
    const items = wallItems(p, key), wid = wingIdOf(key), wg = wid && live.find(x => x.id === wid);
    const floors = (wg ? wg.floors : p.floors) + ((wg ? wg.half : p.halfStorey) ? 1 : 0);
    const thing = it => it.kind === "part" ? partNode(it) : {type: it.kind, id: it.id, floor: it.floor, s0: it.s0, s1: it.s1, hidden: !!it.hidden};
    if (floors <= 1) return {type: "wall", key, children: items.map(thing)};
    // a wall with several floors has a level for each: what is on it, floor by floor (a part stands on the wall itself)
    return {type: "wall", key, children: [...items.filter(i => i.kind === "part").map(thing),
      ...Array.from({length: floors}, (_, f) => ({type: "floor", key, floor: f, children: items.filter(i => i.kind !== "part" && i.floor === f).map(thing)}))]};
  };
  const partNode = it => {
    seen.add(it.id);
    return {type: "part", id: it.id, s0: it.s0, s1: it.s1, ...(it.off ? {off: it.off} : {}), children: it.off ? [] : ["End", "Left", "Right"].map(s => wingWallKey(it.id, s)).filter(k => walls[k]).map(wallNode)};
  };
  const children = ["front", "back", "left", "right"].map(wallNode);
  const lost = (p.wings || []).filter(w => !seen.has(w.id)).map(w => ({type: "part", id: w.id, off: "It is left out: the part it stands on is.", children: []}));
  return {type: "main", children, lost};
}
/** The free stretches of a wall [s0, s1] on a floor: 30 cm from its ends and 20 cm from what stands there (a part blocks the floors it covers). forPart: for a part, which may stand over windows. */
export function freeStretches(p, key, floor, forPart = false) {
  const L = wallsOf(p)[key].L, blocked = [], eaves = 2 * p.overhang + 0.05;   // (two parts must be this far apart: their eaves would touch)
  for (const it of wallItems(p, key)) {
    const m = forPart && it.kind === "part" ? eaves : 0.2;
    if (it.kind === "part") { if (it.off || floor < it.floors || forPart) blocked.push([it.s0 - m, it.s1 + m]); }
    else if (it.floor === floor && !(forPart && it.kind === "window")) blocked.push([it.s0 - m, it.s1 + m]);   // (a part may stand over windows: they are hidden; not over a door)
  }
  const gaps = []; let at = 0.3;
  for (const [a, b] of blocked.sort((x, y) => x[0] - y[0])) { if (a > at) gaps.push([at, a]); at = Math.max(at, b); }
  if (L - 0.3 > at) gaps.push([at, L - 0.3]);
  return {L, gaps};
}
/**
 * A window or a door more on a wall: in the middle of the widest free stretch of that floor (a door on the ground floor), as big as the building's windows, or as
 * the building's other doors (1 x 2.1 m if none). The new window list, or null where there is no room, no such wall or no such floor.
 */
export function addOpening(P, key, kind, floor = 0) {
  if (!wallsOf(P)[key]) return null;
  const door = kind === "door", wid = wingIdOf(key), wg = wid && liveWings(P).find(x => x.id === wid), fl = door ? 0 : floor;
  if (fl >= (wg ? wg.floors : P.floors)) return null;
  const list = P.windows || [], ref = door ? list.find(w => w.type === "door" && w.wall === key) || list.find(w => w.type === "door") : null;
  const w = door ? (ref ? ref.w : 1) : P.winW, h = door ? (ref ? ref.h : 2.1) : P.winH;
  const {L, gaps} = freeStretches(P, key, fl), fit = gaps.filter(([a, b]) => b - a >= w + 0.01).sort((x, y) => (y[1] - y[0]) - (x[1] - x[0]))[0];
  if (!fit) return null;
  const item = {id: list.reduce((m, x) => Math.max(m, x.id), 0) + 1, wall: key, floor: fl, pos: (fit[0] + fit[1]) / 2 / L, w, h, sill: door ? 0 : P.sill, type: door ? "door" : "window", style: "default", room: "auto", curtain: "default", curtainColor: "default"};
  if (door) Object.assign(item, {porch: "none", opens: true, swing: "out", hinge: "left"});
  return [...list, item];
}
/** A part more on a wall (the house's or a part's): in the middle of the widest free stretch of its ground floor, up to 6 m wide, 4 m out. The new list of parts, or null (no room, no such wall, too many). */
export function addPartOn(P, key) {
  if (!wallsOf(P)[key]) return null;
  const id = Array.from({length: MAX_WINGS}, (_, i) => i + 1).find(i => !(P.wings || []).some(x => x.id === i));
  if (!id) return null;
  const {L, gaps} = freeStretches(P, key, 0, true), fit = gaps.filter(([a, b]) => b - a >= 2.5).sort((x, y) => (y[1] - y[0]) - (x[1] - x[0]))[0];
  if (!fit) return null;
  return [...(P.wings || []), {id, wall: key, pos: (fit[0] + fit[1]) / 2 / L, width: Math.min(6, fit[1] - fit[0]), depth: 4, floors: 0}];
}
/** An entry of the window list's type ("window" or, on the ground floor, "door") and style ("default" or one of its type's). */
function openingKind(w) {
  const type = w.type === "door" && Math.round(clampN(w.floor, 0, 2, 0)) === 0 ? "door" : "window";
  const ids = type === "door" ? DOOR_STYLE_IDS : WINDOW_STYLE_IDS;
  return {type, style: ids.includes(w.style) ? w.style : "default"};
}
/** What a door can have in front of it: [id, name]. */
export const PORCH_OPTIONS = [["none", "Nothing"], ["shed", "Shed canopy on brackets"], ["gable", "Gable canopy on brackets"], ["porch", "Porch with posts (förstukvist)"]];
const PORCH_TYPES = PORCH_OPTIONS.map(o => o[0]);
/** A porch's or canopy's width and depth, [min, max, default]. */
export const PORCH_W = [1.2, 5, 2.2], PORCH_D = [0.6, 3, 1.6];
/** A door's porch or canopy: type, width and depth. */
const cleanPorch = (type, w, d) => ({porch: PORCH_TYPES.includes(type) ? type : "none", porchW: clampN(w, PORCH_W[0], PORCH_W[1], PORCH_W[2]), porchD: clampN(d, PORCH_D[0], PORCH_D[1], PORCH_D[2])});
/**
 * The window list, cleaned. Doors stand on the ground floor, can be taller than windows and have a
 * porch or canopy. legacy: the building's entrance settings of when one door was the main one.
 */
function cleanWindows(arr, legacy = {}) {
  return arr.filter(w => w && (WALLS.includes(w.wall) || WING_WALLS.includes(w.wall))).slice(0, 80).map((w, i) => {
    const k = openingKind(w), door = k.type === "door";
    const porch = !door ? {} : w.porch !== undefined ? cleanPorch(w.porch, w.porchW, w.porchD)
      : cleanPorch(w.main ? legacy.entrance : "none", legacy.entranceWidth, legacy.entranceDepth);
    return {
      id: i + 1, wall: w.wall, floor: Math.round(clampN(w.floor, 0, 2, 0)), pos: clampN(w.pos, 0, 1, 0.5),
      w: clampN(w.w, 0.3, door ? 10 : 3, 1), h: clampN(w.h, 0.3, door ? 8 : 2.4, 1.25), sill: clampN(w.sill, 0, 2, 0.85),
      ...k, ...porch, ...(door ? {ramp: !!w.ramp, opens: w.opens !== false, swing: w.swing === "in" ? "in" : "out", hinge: w.hinge === "right" ? "right" : "left"} : {}),
      room: pickRoom(w.room), curtain: pickCurtain(w.curtain), curtainColor: pickColor(w.curtainColor)
    };
  });
}
/**
 * A door from the settings of before doors were in the window list (doorWall, doorPos -1..1, doorW,
 * doorH, and the entrance in front of it): presets use them, and old saves. A walk-in building's
 * door has no porch unless asked.
 */
function legacyDoor(obj, P, kind) {
  const wall = WALLS.includes(obj.doorWall) ? obj.doorWall : "front", L = (wall === "front" || wall === "back") ? P.width : P.depth;
  const w = clampN(obj.doorW, 0.7, 2.5, 1), h = clampN(obj.doorH, 1.8, 2.6, 2.1);
  const c = L/2 + clampN(obj.doorPos, -1, 1, 0) * Math.max(0, L/2 - w/2 - 0.3);
  return {wall, floor: 0, pos: c / L, w, h, sill: 0, type: "door", style: "default",
    ...cleanPorch(obj.entrance === undefined ? (kind.entrance || "none") : obj.entrance, obj.entranceWidth, obj.entranceDepth)};
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
  // the windows and doors: a building always has a door (a save or preset without one gets it from
  // its old door settings)
  // the wings (houses only: a barn's inside is one room); a save from when a house had one wing names its walls wingEnd ...
  out.wings = kind.hides.includes("Wings") ? [] : cleanWings(obj);
  const walls = wallsOf(out), oldWing = {wingEnd: "End", wingLeft: "Left", wingRight: "Right"};
  const src = Array.isArray(obj.windows) ? obj.windows.map(w => w && oldWing[w.wall] ? {...w, wall: wingWallKey(1, oldWing[w.wall])} : w) : obj.windows;
  // (a door on a wing only counts while there is one)
  let ws = Array.isArray(src) ? cleanWindows(src, obj) : [];
  // (the windows and doors of a part that is gone go with it; a part that is only left out for now keeps them)
  { const ids = new Set(out.wings.map(w => w.id)); ws = ws.filter(w => !wingIdOf(w.wall) || ids.has(wingIdOf(w.wall))); }
  if (!ws.some(w => w.type === "door" && walls[w.wall])) ws = cleanWindows([...ws, legacyDoor(obj, out, kind)]);
  out.windows = Array.isArray(src) ? ws : genAll(out, obj, ws);
  out.dormers = Array.isArray(obj.dormers) ? cleanDormers(obj.dormers) : [];
  // the downpipes: the save's, or placed from the house's count per side (saves from before they were a list)
  out.pipes = Array.isArray(obj.pipes) ? cleanPipes(obj.pipes, out) : autoPipes(out);
  // sections of wallpaper on the inside of the outer walls
  out.papers = cleanPapers(obj.papers, out, WALLPAPERS.length);
  // walls with a split of their own (instead of the building's): {wall: {split: "one" | "floor" | "height", height}}
  out.wallZones = cleanWallZones(obj.wallZones, out);
  // walls with a panel and colour of their own: {wall: {wallCladding, wallColor, lowerCladding, lowerColor}}
  out.wallStyles = cleanWallStyles(obj.wallStyles, out);
  // where the player moved the game places (sleep point, feed pad ...), one entry per place of the kind
  // the game objects (sleep point, feed pad, pasture ...): the save's, or where the kind puts them to start with
  // (from the settings of before they were objects: the pasture's wall and depth, the sleep point on or off)
  const legacy = {...out, pastureWall: WALLS.includes(obj.pastureWall) ? obj.pastureWall : out.pastureWall,
    fenceDepth: Number.isFinite(+obj.fenceDepth) && obj.fenceDepth !== null ? +obj.fenceDepth : out.fenceDepth, sleepPoint: obj.sleepPoint !== false};
  out.objects = cleanObjects(Array.isArray(obj.objects) ? obj.objects : kind.objects ? kind.objects.defaults(legacy) : [], kind, legacy);
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
export const MATS = ["walls","wallsLow","wallsIn","trim","roof","glass","door","doorIn","foundation","chimney","gutter","iron","interior","curtain","fittings"];
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

/** Mesh g without its vertices in ranges [[from, to] ...] (what door leaves carry), with colours and surfaces if it has them. */
function exceptRanges(g, ranges) {
  const drop = v => ranges.some(([a, b]) => v >= a && v < b), map = new Map(), out = {p: [], n: [], uv: [], i: []};
  if (g.c) out.c = []; if (g.s) out.s = [];
  for (let v = 0; v < g.p.length / 3; v++) {
    if (drop(v)) continue;
    map.set(v, out.p.length / 3);
    out.p.push(g.p[v * 3], g.p[v * 3 + 1], g.p[v * 3 + 2]); out.n.push(g.n[v * 3], g.n[v * 3 + 1], g.n[v * 3 + 2]); out.uv.push(g.uv[v * 2], g.uv[v * 2 + 1]);
    if (g.c) out.c.push(g.c[v * 3], g.c[v * 3 + 1], g.c[v * 3 + 2]);
    if (g.s) out.s.push(g.s[v]);
  }
  for (let t = 0; t < g.i.length; t += 3) if (map.has(g.i[t])) out.i.push(map.get(g.i[t]), map.get(g.i[t + 1]), map.get(g.i[t + 2]));
  return out;
}
/** The part of mesh g made of its vertices from .. to (not included), as a mesh of its own (a door leaf). */
function sliceMesh(g, from, to) {
  const out = {p: g.p.slice(from * 3, to * 3), n: g.n.slice(from * 3, to * 3), uv: g.uv.slice(from * 2, to * 2), i: []};
  for (let t = 0; t < g.i.length; t += 3) if (g.i[t] >= from && g.i[t] < to) out.i.push(g.i[t] - from, g.i[t + 1] - from, g.i[t + 2] - from);
  return out;
}
/** Like sliceMesh, with the per-vertex colours when the material has them. */
function sliceColored(g, from, to) { const o = sliceMesh(g, from, to); if (g.c) o.c = g.c.slice(from * 3, to * 3); return o; }
/**
 * One of each piece of the building's catalog, set out in rows in a big empty room, built: {geo, spots [{id, type, x, z}]}.
 * geo.itemParts[id] says which vertices of each material a piece drew (pieceMeshes gives them as meshes): for the thumbnails.
 */
export function pieceSheet(p) {
  const q = sanitize(p), cat = catalogFor(q), types = Object.keys(cat).filter(t => !cat[t].asset && !cat[t].missing), cols = 5, gap = 4.6;
  const items = types.map((type, i) => ({id: i + 1, type, x: ((i % cols) - (cols - 1) / 2) * gap, z: (Math.floor(i / cols) - (Math.ceil(types.length / cols) - 1) / 2) * gap, rot: 0, ...cat[type].defaults}));
  const s = sanitize({...q, width: 32, depth: 26, floors: 1, floorHeight: 3.4, wings: [], items, age: 0});
  const geo = buildGeometry(s, {ghosts: true});
  return {geo, p: s, spots: s.items.map(it => ({id: it.id, type: it.type, x: it.x, z: it.z}))};
}
/** The meshes piece id drew in a sheet: [{m (material), g {p, n, uv, c?, i}}], positions relative to the piece's own spot. */
export function pieceMeshes(sheet, id) {
  const spot = sheet.spots.find(s => s.id === id), parts = sheet.geo.itemParts[id] || {}, out = [];
  for (const [m, [a, b]] of Object.entries(parts)) {
    const g = sliceColored(sheet.geo.G[m], a, b);
    for (let k = 0; k < g.p.length; k += 3) { g.p[k] -= spot.x; g.p[k + 2] -= spot.z; }
    out.push({m, g});
  }
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
export function buildGeometry(p, {ghosts = false} = {}) {
p = normalize(p);
const kind = kindOf(p);
let G, opsByWall = {}, dims = {}, rooms = [], downpipes = [], doors = [], itemParts = {};
// Imported items placed inside: [{asset, item, translation, rotY}] (see assets.mjs placement).
const refs = [];
// Walk-in kinds (a hen house ...): walls with an inside face, hollow collision, a door that opens.
const hollow = kind.walkIn;
// Openings the kind adds to its walls, [{wall, s0, s1, t1, clear, what}] (a hen hatch ...).
const openings = kind.openings ? kind.openings(p) : [];
// the ceiling over the ground floor: the colour (the kind's, or a plain white), or null where there is none
const ceilingC = p.ceiling ? (kind.ceiling || "#EDE9DF") : null;
// a wall's floor height: the wing's own on a wing's wall, else the house's
// the height of the walls of the part a wall belongs to (the house's own, or a part's)
const parentHeightOf = key => { const wid = wingIdOf(key), wg = wid && liveWings(p).find(x => x.id === wid); return wg ? wg.H : p.floors * p.floorHeight + (p.halfStorey ? p.kneeWall : 0); };
const fhOf = key => { const wid = wingIdOf(key), wg = wid && liveWings(p).find(x => x.id === wid); return wg ? wg.fh : p.floorHeight; };

// the materials of the part being built (walls, wallsLow, roof, trim -> its own variants), or null for the building's own
let partMats = null, MATLIST = MATS;
function poly(mat, pts, hint, uvf) {
  pts = pts.filter((q,i) => { const r = pts[(i+1) % pts.length]; return Math.hypot(...sub(q,r)) > 1e-6; });
  if (pts.length < 3) return;
  let n = norm(cross(sub(pts[1],pts[0]), sub(pts[2],pts[0])));
  if (hint && dot(n, hint) < 0) { pts = pts.slice().reverse(); n = neg(n); }
  // Undersides of the roof, dormer roofs and canopies (eave soffits) are painted boards, not tiles;
  // in a walk-in building, raw roof boards (seen from inside).
  let rgbHere = fitRGB, surf = fitSurf;
  const slot = mat;
  if (partMats && partMats[mat]) mat = partMats[mat];   // (what a part with a look of its own is made of)
  if (slot === "roof" && n[1] < -0.3) {
    const boards = rawUnder || Math.max(...pts.map(q => q[1])) >= boardsFrom;
    mat = boards ? "fittings" : partMats ? partMats.trim : "trim";
    if (boards) { rgbHere = hexRGB(ROOF_BOARDS); surf = "boards"; uvf = null; }
  }
  const isTrim = slotOf(mat) === "trim";
  if (isTrim) uvf = null;
  if (mat !== "fittings") surf = undefined;
  const g = G[mat], base = g.p.length / 3, S = surf && SURFACES[surf];
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  let uvs = pts.map(q => uvf ? uvf(q) : (ay >= ax && ay >= az) ? [q[0], q[2]] : (ax >= az) ? [q[2], q[1]] : [q[0], q[1]]);
  if (isTrim || (S && S.grain)) {
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
const meshBox = box;   // (the loop in buildInside has its own box)
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

/**
 * The openings of wall key. cover(s0, s1): how high (from the floor) something stands against the wall
 * there (the wing): a window or door below that is hidden.
 */
function layoutWall(key, L, fh, topAt, cover = null) {
  // (a wing may have fewer floors than the house)
  const wid = wingIdOf(key), wing = wid ? liveWings(p).find(w => w.id === wid) : null, wf = wing ? wing.floors : p.floors;
  const nf = wf + ((wing ? wing.half : p.halfStorey) ? 1 : 0);
  const ops = [];
  // The kind's own openings (a hen hatch ...) first, then the doors, then the windows: a window over a
  // door is hidden, not the door.
  for (const h of openings) if (h.wall === key) ops.push({s0: h.s0, s1: h.s1, t0: 0, t1: h.t1, kind: "hatch", plain: !!h.plain, ...(h.ramp ? {ramp: true} : {})});
  // a wing opens into this wall: a passage through it, from the floor to under the wing's ceiling (a window in it is hidden)
  if (hollow) for (const w of liveWings(p)) if (w.wall === key) { const tc = Math.min(fhOf(key), w.fh), t1 = ceilingC ? Math.min(tc, w.H) : Math.min(w.H, parentHeightOf(key)) - 0.25;
    ops.push({s0: w.s0 + WALL_T, s1: w.s1 - WALL_T, t0: 0, t1, kind: "open", ...(ceilingC && t1 >= tc - 1e-6 ? {toCeiling: true} : {})}); }   // (under a ceiling: right up to it, no lintel)
  const list = p.windows.filter(w => w.wall === key);
  for (const win of [...list.filter(w => w.type === "door"), ...list.filter(w => w.type !== "door")]) {
    win._hidden = false;
    if (win.floor >= nf) continue;
    const [s0, s1] = openingSpan(win, L), door = win.type === "door";
    // a door made from a window stands on the floor, no taller than the floor allows
    const t0 = door ? 0 : win.floor * fh + win.sill;
    const t1 = door ? Math.min(win.h, fh - 0.25) : win.floor < wf ? Math.min(t0 + win.h, (win.floor + 1) * fh - 0.25) : t0 + win.h;
    const op = {s0, s1, t0, t1, kind: door ? "door" : "window", id: win.id, style: styleOf(p, win), ...(door ? {opens: win.opens !== false, swingIn: win.swing === "in", hingeRight: win.hinge === "right"} : {})};
    if (door && win.ramp) op.ramp = true;
    if (door && op.style === "hole") { op.kind = "hatch"; op.plain = true; op.hole = true; delete op.opens; delete op.swingIn; delete op.hingeRight; }   // an empty doorway: the framed hole
    else if (door) op.porch = {type: win.porch || "none", w: win.porchW || PORCH_W[2], d: win.porchD || PORCH_D[2]};
    const g = 0.18;
    if (t1 - t0 < 0.3 || s1 - s0 < 0.3 || ops.some(q => q.s0 < op.s1 + g && op.s0 < q.s1 + g && q.t0 < op.t1 + g && op.t0 < q.t1 + g)
        || (cover && t0 < cover(op.s0, op.s1))
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
/** While a wing's roof is built in a walk-in building without a ceiling: its underside is raw roof boards too. */
let rawUnder = false;
const hexRGB = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const ROOM_D = 0.75, ROOM_SIDE = 0.45, ROOM_UP = 0.35, ROOM_DOWN = 0.95;
/**
 * Room box behind window o: as wide as the space to its neighbours allows (half the gap each),
 * down to the floor, up towards the ceiling, but never through the roof or past the wall's ends.
 */
function roomFor(w, o, ops, r, topAt, dormer, choice, fhw) {
  const fh = fhw ?? p.floorHeight, L = w.L;
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
    const pts = [WP(w, a, t0, da), WP(w, b, t0, db), WP(w, b, t1, db), WP(w, a, t1, da)], uvs = [[a, t0], [b, t0], [b, t1], [a, t1]];
    quad("curtain", pts, uvs, w.n);
    if (curtainBoth) quad("curtain", pts, uvs, neg(w.n));   // (in a room you can walk into, the cloth is seen from inside too)
  }
}
/** Whether the curtains being built are seen from both sides (a walk-in building's ground floor), not only from outside. */
let curtainBoth = false;
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
/** A ramp from the opening's sill (the floor) down to the ground, 1:5, as wide as the opening and 20 cm more each side; solid, and in the collision. */
function buildRamp(w, o, F) {
  const s0 = o.s0 - 0.2, s1 = o.s1 + 0.2, d0 = PLINTH_OUT, d1 = PLINTH_OUT + Math.max(0.6, F * 5);
  const P = (s, t, d) => WP(w, s, t, d);
  const A = P(s0, -F, d0), B = P(s1, -F, d0), C = P(s1, 0, d0), D = P(s0, 0, d0), E = P(s0, -F, d1), G = P(s1, -F, d1);
  for (const mat of ["foundation", "collision"]) solid(mat, [[A, B, C, D], [A, B, G, E], [D, C, G, E], [A, D, E], [B, C, G]]);
}
function buildHatch(w, o, F, fr, out) {
  if (o.ramp && F > 0.05) buildRamp(w, o, F);
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
/** How many vertices each material has so far, to find what was drawn after (see rangesSince). */
const vcount = () => Object.fromEntries(MATLIST.map(m => [m, G[m].p.length / 3]));
/** The vertices of each material drawn since vcount() gave before: {mat: [from, to]}. */
const rangesSince = before => {
  const out = {};
  for (const m of MATLIST) { const n = G[m].p.length / 3; if (n > before[m]) out[m] = [before[m], n]; }
  return out;
};
/**
 * What the window and door styles (openings.mjs) draw with, in the coordinates of a wall frame w {o, u, n}: s along it,
 * t up, d across (towards n); skip: "d0" or "d1", the face to leave out (it lies on another surface, where it would only flicker).
 */
function openingKit(w) {
  return {box: (mat, s0, s1, t0, t1, d0, d1, skip) => {
      const P = (a, b, c) => WP(w, lerp(s0, s1, a), lerp(t0, t1, b), lerp(d0, d1, c));
      for (const a of [0, 1]) poly(mat, [P(a,0,0), P(a,1,0), P(a,1,1), P(a,0,1)], a ? w.u : neg(w.u));
      for (const b of [0, 1]) poly(mat, [P(0,b,0), P(1,b,0), P(1,b,1), P(0,b,1)], b ? UP : neg(UP));
      for (const c of [0, 1]) if (skip !== (c ? "d1" : "d0")) poly(mat, [P(0,0,c), P(1,0,c), P(1,1,c), P(0,1,c)], c ? w.n : neg(w.n));
    },
    slab: (mat, pts, d0, d1, skip) => {
      const f0 = pts.map(([s, t]) => WP(w, s, t, d0)), f1 = pts.map(([s, t]) => WP(w, s, t, d1));
      if (skip !== "d0") poly(mat, f0, neg(w.n));
      if (skip !== "d1") poly(mat, f1, w.n);
      pts.forEach((_, i) => { const j = (i + 1) % pts.length, m = mid([f0[i], f0[j]]), c = mid(f0); poly(mat, [f0[i], f0[j], f1[j], f1[i]], sub(m, c)); });
    }};
}
/**
 * A door in opening o of wall w (key: the wall's name), in its style: one leaf, or a pair when it is
 * wide. Swinging leaves sit in the reveal, hinged on their outside face, and open outwards; a sliding
 * door hangs outside the wall on a rail and slides along it. In a walk-in building (inner) the
 * leaves are recorded in doors: each with what it moves (its vertices, per material), its hinge
 * (the node the game moves it about) and its collision box.
 */
function buildDoor(w, o, kit, inner, r, out, key) {
  const slide = o.style === "sliding", pair = isPair(o.s1 - o.s0), g = 0.01, mid = (o.s0 + o.s1) / 2;
  let spans, dIn, dOut, t0 = o.t0 + g, t1 = o.t1 - g, travel = 0;
  if (o.style === "lowgate") t1 = Math.min(t1, t0 + 1.2);   // (a steel gate as high as a fence: the opening stays open above it)
  if (slide) {
    // over the opening and its frame, 10 cm past each side; the rail above, long enough to slide clear
    const lap = 0.1, a = o.s0 - lap, b = o.s1 + lap;
    dIn = out + 0.006; dOut = dIn + LEAF_T; t0 = o.t0 + 0.005; t1 = o.t1 + 0.1;
    spans = pair ? [[a, mid - 0.003], [mid + 0.003, b]] : [[a, b]];
    travel = pair ? (o.s1 - o.s0) / 2 + lap : o.s1 - o.s0 + lap;
    const r0 = Math.max(0.03, a - travel), r1 = Math.min(w.L - 0.03, pair ? b + travel : b), ry = t1 + 0.03;
    kit.box("iron", r0, r1, ry, ry + 0.06, dIn, dOut + 0.02);
    for (let s = r0; s <= r1 + 1e-6; s += Math.max(0.3, (r1 - r0) / Math.max(1, Math.round((r1 - r0) / 1.0)))) {
      const s0 = Math.min(Math.max(s - 0.025, r0 + 0.02), r1 - 0.07);   // (in from the rail's ends: flush faces flicker)
      kit.box("iron", s0, s0 + 0.05, ry + 0.005, ry + 0.055, 0, dIn + 0.01);   // brackets back to the wall
    }
  } else {
    dIn = -r; dOut = -r + LEAF_T;
    spans = pair ? [[o.s0 + g, mid - g / 2], [mid + g / 2, o.s1 - g]] : [[o.s0 + g, o.s1 - g]];
  }
  const leaves = [];
  spans.forEach(([s0, s1], k) => {
    // (a pair: each leaf is hinged at its outer edge; a single door at the left (seen from outside) or, if set, the right)
    const before = vcount(), right = pair ? k === 1 : !!o.hingeRight;
    drawLeaf(kit, o.style, {s0, s1, t0, t1, dIn, dOut, right});
    if (slide) for (const u of [0.15, s1 - s0 - 0.2]) kit.box("iron", s0 + u, s0 + u + 0.05, t1, t1 + 0.06, dIn + 0.015, dOut - 0.015);   // hangers up to the rail
    // (a door that doesn't open is drawn the same, but stays put: no leaves for the game to move)
    if (!inner || !o.opens) return;
    const ax = Math.abs(w.u[0]) > 0.5, along = s1 - s0, tall = t1 - t0, thick = dOut - dIn;
    const box = {center: WP(w, (s0 + s1) / 2, (t0 + t1) / 2, (dIn + dOut) / 2), size: ax ? [along, tall, thick] : [thick, tall, along]};
    if (slide) {
      const v = (right ? 1 : -1) * travel;
      leaves.push({hinge: WP(w, s0, o.t0, dIn), motion: {translation: [w.u[0] * v, 0, w.u[2] * v]}, parts: rangesSince(before), box});
    // a door swings out (hinged on the outside of the leaf) or, if chosen (o.swingIn), in (hinged on the inside)
    } else if (o.swingIn) leaves.push({hinge: WP(w, right ? s1 : s0, o.t0, dIn), motion: {rotation: right ? DOOR_OPEN : -DOOR_OPEN}, parts: rangesSince(before), box});
    else leaves.push({hinge: WP(w, right ? s1 : s0, o.t0, dOut), motion: {rotation: right ? -DOOR_OPEN : DOOR_OPEN}, parts: rangesSince(before), box});
  });
  if (inner && o.opens) doors.push({wall: key, op: o, slide, leaves});
}
/**
 * inner: build the wall's inside face too, WALL_T behind the outside one (where the opening
 * reveals end), facing in. inner.lift raises an eave wall's inside face into the roof slab so no
 * gap shows under the roof. key: the wall's name, for its doors (see buildDoor).
 */
/**
 * split: the height (from the wall's foot) where the walls' lower material ends (two zones, see
 * wallSplitAt); below it the face is "wallsLow", above it "walls", with a drip board along the join.
 */
/**
 * Studs (reglar, 45 mm wide) every 60 cm on the inside of a timber-clad wall, from the backs of the boards to the wall's inside face,
 * with a bottom plate, a top plate under a flat top, jamb studs and a header over each opening (and a sill under a window), and short studs above and
 * below an opening. Only where the zone (below / above the split) is timber and there is no wallpaper.
 * c: L, tw, BACK (the boards' backs), s0i..s1i (the stretch the inside covers), split, Hi (top of the inside), ceil, topAt(s), wood(t), bare(s).
 */
function buildStuds(w, ops, c) {
  const {tw, BACK, s0i, s1i, split, Hi, ceil, topAt, spacing, studW: st, irr} = c, g = 0.002, hdr = Math.max(0.095, st * 2);
  // (an old barn's studs are uneven: where they stand and how thick they are vary a little, the same way every time)
  const rnd = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233 + w.L * 3.1) * 43758.5453; return v - Math.floor(v); };
  paint("#B99B6B", "timber");
  const zones = split ? [[0, split, "low"], [split, Infinity, "up"]] : [[0, Infinity, "up"]];
  const top = s => ceil < Infinity ? Hi : topAt(s) - 0.02;
  const box = (s0, s1, t0, t1) => { if (s1 - s0 > 1e-4 && t1 - t0 > 1e-4) wbox("fittings", w, s0, s1, t0, t1, -tw, -BACK); };
  for (const [z0, z1, name] of zones) {
    const mid = (z0 + Math.min(z1, Hi)) / 2;
    if (!c.wood(mid + 0.001) || z0 >= Hi) continue;
    const flatTop = name === "low" || ceil < Infinity, zTop = name === "low" ? z1 : Hi;
    // plates: along the bottom (broken where an opening comes down to it) and, under a flat top, along the top
    const breaks = ops.filter(o => o.t0 < z0 + st + 1e-6 && o.t1 > z0).map(o => [o.s0, o.s1]).sort((a, b) => a[0] - b[0]);
    let s = s0i;
    for (const [a, b] of [...breaks, [s1i, s1i]]) { box(s, Math.min(a, s1i), z0, z0 + st); s = Math.max(s, b); }
    if (flatTop) {
      const tb = ops.filter(o => o.t1 > zTop - st - 1e-6 && o.t0 < zTop).map(o => [o.s0, o.s1]).sort((a, b) => a[0] - b[0]);
      s = s0i;
      for (const [a, b] of [...tb, [s1i, s1i]]) { box(s, Math.min(a, s1i), zTop - st, zTop); s = Math.max(s, b); }
    }
    // studs: at the ends, every 60 cm, and each side of an opening (a gap of 2 mm to its lining)
    const xs = [s0i + st / 2, s1i - st / 2];
    for (let s = s0i + spacing, i = 1; s < s1i - spacing / 2; s += spacing, i++) xs.push(s + (rnd(i, 1) - 0.5) * 2 * irr * 0.25 * spacing);
    for (const o of ops) xs.push(o.s0 - g - st / 2, o.s1 + g + st / 2);
    for (const x of [...new Set(xs.map(v => +v.toFixed(4)))].sort((a, b) => a - b)) {
      if (x - st / 2 < s0i - 1e-6 || x + st / 2 > s1i + 1e-6 || !c.bare(x)) continue;
      // each stud's own width (the ends and the studs at openings keep the plain one)
      const free = x > s0i + st && x < s1i - st && !ops.some(o => Math.abs(x - o.s0) < st * 2 + 0.01 || Math.abs(x - o.s1) < st * 2 + 0.01);
      const sw = free ? st * (1 + (rnd(Math.round(x * 100), 2) - 0.5) * irr * 0.6) : st;
      let ranges = [[z0 + st, flatTop ? zTop - st : Math.min(z1, top(x))]];
      for (const o of ops) {
        if (!(x + st / 2 > o.s0 && x - st / 2 < o.s1)) continue;
        const cut = [];
        for (const [a, b] of ranges) {
          const below = Math.min(b, o.t0 - st), above = Math.max(a, o.t1 + hdr);
          if (below - a > 0.02) cut.push([a, below]);
          if (b - above > 0.02) cut.push([above, b]);
        }
        ranges = cut;
      }
      for (const [a, b] of ranges) box(x - sw / 2, x + sw / 2, a, b);
    }
    // headers over the openings and sills under the windows
    for (const o of ops) {
      if (o.t1 + hdr > Math.min(z1, Hi) || o.t1 < z0 || o.t0 > Math.min(z1, Hi)) continue;
      if (o.s0 < s0i || o.s1 > s1i) continue;
      box(o.s0 + g, o.s1 - g, o.t1 + g, o.t1 + hdr);
      if (o.t0 > z0 + st + 0.1) box(o.s0 + g, o.s1 - g, o.t0 - st, o.t0 - g);
    }
  }
}
function buildWall(w, ops, H, gableRise, F, {topAt = () => H, dormer = null, inner = null, key = null, split = null} = {}) {
  const L = w.L, xs = [0, L, L/2], ts = [0, H, H + gableRise];
  if (split) ts.push(split);
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
    if (c.length >= 3) poly(split && ct < split ? "wallsLow" : "walls", c.map(q => WP(w, q[0], q[1], 0)), w.n);
  }
  if (split) {
    // the drip board along the join (vattbräda), broken where an opening (with its frame) crosses it
    const bh = 0.1, cuts = ops.filter(o => o.t0 - 0.2 < split + bh && o.t1 + 0.15 > split).map(o => o.kind === "open" ? [o.s0 - 0.24, o.s1 + 0.24] : [o.s0 - 0.15, o.s1 + 0.15]).sort((a, b) => a[0] - b[0]);   // (a wing's passage: a bit more, so the board's end doesn't lie in the plane of the wing's corner)
    // (from 9 cm in from the wall's ends, under the corner boards: where two walls meet their ends would
    // cross in one plane and flicker)
    let s = 0.09;
    for (const [a, b] of [...cuts, [L - 0.09, L]]) { if (Math.min(a, L - 0.09) - s > 0.05) wbox("trim", w, s, Math.min(a, L - 0.09), split, split + bh, 0, 0.03); s = Math.max(s, b); }
  }
  if (inner) {
    // the kind's finish (a barn's by default); under a ceiling (kind.ceiling) only up to it, the floors above closed
    const fin = kind.insideWalls || BARN_WALLS, ceil = ceilingC ? fhOf(key) : Infinity;
    const Hi = Math.min(H + inner.lift, ceil), tw = WALL_T, lowT = fin.low ? fin.low[2] : 0;
    // (a wing's side wall meets the house's outer face at its start (Left) or its end (Right): its inside face runs right up to it,
    // or a slit shows between it and the house's wall)
    // (wallpaper on the inside: a section of this wall's, else the one for every inside wall; none: the kind's plaster or whitewash)
    const paperAt = s => {
      const sec = (p.papers || []).filter(x => x.wall === key && s > x.s0 && s < x.s1).pop();
      const i = sec ? sec.paper : p.insidePaper !== "none" ? +p.insidePaper : -1;
      return i >= 0 && WALLPAPERS[i] ? [WALLPAPERS[i][1], WALLPAPERS[i][2]] : null;
    };
    const sideOf = /^w[0-9]+(Left|Right)$/.exec(key), s0i = sideOf && sideOf[1] === "Left" ? 0 : tw, s1i = sideOf && sideOf[1] === "Right" ? L : L - tw;
    const Xi = uniq([s0i, s1i, L/2, ...ops.flatMap(o => [o.s0, o.s1]), ...(p.papers || []).filter(x => x.wall === key).flatMap(x => [x.s0, x.s1])]).filter(s => s > s0i - 1e-6 && s < s1i + 1e-6);
    // (a barn's: whitewash, greyer and grubbier along the bottom where the animals rub and muck splashes)
    // (like the outside: each zone as it is outside: boards show studs, plaster is plaster, the split is where it is outside)
    const same = !!p.insideSame, WOOD = ["lockpanel", "horizontal", "vertical"], BACK = 0.03;
    const ps = partStyle(p, wingIdOf(key));
    const cladOf = t => split && t < split ? ps.lowerCladding : ps.wallCladding, colOf = t => split && t < split ? ps.lowerColor : ps.wallColor;
    const Ti = uniq([0, ...(lowT && !same ? [lowT] : []), ...(same && split ? [split] : []), Hi, ...(ceil < Infinity ? [] : [H + gableRise]), ...ops.flatMap(o => [o.t0, o.t1])]);
    for (let i = 0; i < Xi.length - 1; i++) for (let j = 0; j < Ti.length - 1; j++) {
      const cs = (Xi[i] + Xi[i+1]) / 2, ct = (Ti[j] + Ti[j+1]) / 2;
      if (ops.some(o => cs > o.s0 && cs < o.s1 && ct > o.t0 && ct < o.t1)) continue;
      let c = [[Xi[i], Ti[j]], [Xi[i+1], Ti[j]], [Xi[i+1], Ti[j+1]], [Xi[i], Ti[j+1]]];
      if (Ti[j+1] > Hi + 1e-6) {
        if (gableRise <= 0 || ceil < Infinity) continue;
        const k = gableRise / (L / 2);
        c = clipPoly(clipPoly(c, -k, 1, H), k, 1, H + 2 * gableRise);
      }
      const paper = paperAt(cs), timber = same && !paper && WOOD.includes(cladOf(ct));
      const f = paper || (same ? [colOf(ct), "whitewash"] : fin.low && ct < lowT ? fin.low : fin.wall);
      // (timber: the backs of the boards, a little in from the outside, in the outside's own material: the same texture and colour; the studs come after)
      if (timber) { if (c.length >= 3) poly(split && ct < split ? "wallsLow" : "walls", c.map(q => WP(w, q[0], q[1], -BACK)), neg(w.n)); continue; }
      paint(f[0], f[1]);
      if (c.length >= 3) poly("fittings", c.map(q => WP(w, q[0], q[1], -tw)), neg(w.n));
    }
    if (same) buildStuds(w, ops, {L, tw, BACK, s0i, s1i, split, Hi, ceil, topAt, spacing: p.studSpacing, studW: p.studWidth, irr: p.studIrregular, wood: t => WOOD.includes(cladOf(t)), bare: s => !paperAt(s)});
    // A kickboard (a barn's tarred, a house's skirting) along the bottom, except across openings that come down to it.
    const [kickC, kickS, KT] = fin.kick;
    paint(kickC, kickS);
    for (let i = 0; i < Xi.length - 1 && !same; i++) {
      const cs = (Xi[i] + Xi[i+1]) / 2;
      if (Xi[i+1] - Xi[i] < 0.02 || ops.some(o => cs > o.s0 && cs < o.s1 && o.t0 < KT)) continue;
      wbox("fittings", w, Xi[i], Xi[i+1], 0, KT, -tw - 0.025, -tw);
    }
  }

  const r = 0.15, out = 0.04;
  // what the window and door styles (openings.mjs) draw with, in this wall's coordinates; skip: "d0" or
  // "d1", the face to leave out (it lies on another surface, where it would only flicker)
  const kit = openingKit(w);
  ops.forEach(o => {
    const isDoor = o.kind === "door", isWin = o.kind === "window";
    // Frame width: 8 cm, slimmer on a small window (down to 4.5 cm), so the frame doesn't swamp it.
    const fr = isWin ? Math.min(0.08, Math.max(0.045, 0.075 * Math.min(o.s1 - o.s0, o.t1 - o.t0))) : 0.08, k = fr / 0.08;
    // The opening's linings, through the wall's thickness: painted boards like the frame.
    // (no bottom lining on an opening down at the floor: it would lie on the plinth top and flicker)
    if (!isDoor && o.t0 > 0.01) poly("trim", [WP(w,o.s0,o.t0,0), WP(w,o.s1,o.t0,0), WP(w,o.s1,o.t0,-r), WP(w,o.s0,o.t0,-r)], UP);
    // (a passage up to the ceiling has none: the ceiling runs on through the wall's thickness)
    if (!(o.kind === "open" && o.toCeiling)) poly("trim", [WP(w,o.s0,o.t1,0), WP(w,o.s1,o.t1,0), WP(w,o.s1,o.t1,-r), WP(w,o.s0,o.t1,-r)], neg(UP));
    poly("trim", [WP(w,o.s0,o.t0,0), WP(w,o.s0,o.t1,0), WP(w,o.s0,o.t1,-r), WP(w,o.s0,o.t0,-r)], w.u);
    poly("trim", [WP(w,o.s1,o.t0,0), WP(w,o.s1,o.t1,0), WP(w,o.s1,o.t1,-r), WP(w,o.s1,o.t0,-r)], neg(w.u));
    if (o.kind === "open") return;   // a passage: just the hole and its linings
    if (o.kind === "hatch") { buildHatch(w, o, F, fr, out); return; }
    if (isDoor) buildDoor(w, o, kit, inner, r, out, key);
    else {
      // The sash in the window's style; the glass sits 12 mm in front of the back of its bars (in the
      // same plane they flicker), seen from both sides in a walk-in building.
      o.glass = drawSash(kit, o.style, o, {k, r}).glass;
      const dg = -r + 0.012, pane = [WP(w,o.s0,o.t0,dg), WP(w,o.s1,o.t0,dg), WP(w,o.s1,o.t1,dg), WP(w,o.s0,o.t1,dg)];
      if (o.glass) { poly("glass", pane, w.n); if (inner) poly("glass", pane, neg(w.n)); }
    }
    // The frame and sill start at the wall's face: inside the wall they would share planes with the
    // linings and flicker.
    const b0 = isDoor ? o.t0 : o.t0 - fr;
    wbox("trim", w, o.s0 - fr, o.s0, b0, o.t1 + fr, 0, out);
    wbox("trim", w, o.s1, o.s1 + fr, b0, o.t1 + fr, 0, out);
    wbox("trim", w, o.s0, o.s1, o.t1, o.t1 + fr, 0, out);
    if (isDoor) {
      if (F > 0.05 && o.ramp && o.porch.type !== "porch") buildRamp(w, o, F);
      else if (F > 0.05 && o.porch.type !== "porch") {
        // the doorstep, from where the plinth ends (its top in the same plane would flicker)
        wbox("foundation", w, o.s0 - 0.3, o.s1 + 0.3, -F, 0, PLINTH_OUT, 0.7);
        wbox("collision", w, o.s0 - 0.3, o.s1 + 0.3, -F, 0, PLINTH_OUT, 0.7);
        // on a high foundation more steps down to the ground, risers of about 18 cm, each its own slab 30 cm deep
        const n = Math.max(1, Math.round(F / 0.18)), rh = F / n;
        for (let k = 1; k < n; k++) {
          wbox("foundation", w, o.s0 - 0.3, o.s1 + 0.3, -F, -k * rh, 0.7 + (k - 1) * 0.3, 0.7 + k * 0.3);
          wbox("collision", w, o.s0 - 0.3, o.s1 + 0.3, -F, -k * rh, 0.7 + (k - 1) * 0.3, 0.7 + k * 0.3);
        }
      }
    } else wbox("trim", w, o.s0 - fr - 0.04 * k, o.s1 + fr + 0.04 * k, o.t0 - 0.07 * k, o.t0, 0, out + 0.05 * k);
  });
  if (p.interior) for (const o of ops) if (o.kind === "window" && o.glass) {
    const R = roomFor(w, o, ops, r, topAt, !!dormer, dormer || p.windows.find(x => x.id === o.id), fhOf(key));
    // a ground-floor window of a walk-in building looks into the real room: curtains only, seen from both sides; the rest get a pretend room
    if (hollow && !dormer && o.t0 < fhOf(key)) { curtainBoth = true; buildCurtains(R); curtainBoth = false; }
    else { rooms.push(R); buildRoom(R); }
  }
}

/** Appends a ready-made mesh (with its own normals) to material mat. */
function addMesh(mat, m) {
  if (partMats && partMats[mat]) mat = partMats[mat];   // (a part's own materials)
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
/** A barn's inside walls: whitewash, a grimy band at the bottom and a tarred kickboard ([colour, surface, height]). */
const BARN_WALLS = {wall: [WHITEWASH, "whitewash"], low: [GRIME, "grime", GRIME_T], kick: [KICKBOARD, "timber", KICK_T]};
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
const GALV = "#AEB4B7", GALV_IN = "#666B6D", DUCT_DARK = "#211C17", TIMBER = "#6F5C47";
/**
 * Inside a walk-in barn, under a ventilator at a: the boarded duct (ventilationstrumma) hanging
 * from the roof, open at the bottom, with a lip, a half-open damper and its pull cord.
 */
function ventDuct(a, ridgeY, tanP, M, th, F) {
  // A round galvanised sheet-steel duct (frånluftstrumma) up into the ventilator: its top is hidden in
  // the roof slab and the box above. Open at the bottom, with a flared bell mouth, rolled seams and a
  // round damper you set with a cord.
  const R = 0.24, seg = 20, c = M(a, 0, 0), yTop = ridgeY - th, yBot = ridgeY - th - tanP * R - 0.7, yBell = yBot + 0.12;
  const at = (r, y, k) => { const t = k / seg * 2 * Math.PI; return [c[0] + r * Math.cos(t), y, c[2] + r * Math.sin(t)]; };
  // a band of sheet between (r0, y0) and (r1, y1), its outside (out) or inside facing
  const band = (r0, y0, r1, y1, out) => {
    for (let k = 0; k < seg; k++) {
      const q = [at(r0, y0, k), at(r0, y0, k + 1), at(r1, y1, k + 1), at(r1, y1, k)], m = mid(q), n = [m[0] - c[0], 0, m[2] - c[2]];
      poly("fittings", q, out ? n : neg(n));
    }
  };
  paint(GALV, "galv");
  band(R, yBell, R, yTop, true);                          // the pipe
  band(R + 0.07, yBot, R, yBell, true);                   // the bell mouth, flaring out
  for (const y of [yBell + 0.35, yBell + 0.75]) if (y + 0.03 < yTop - tanP * R) {   // rolled seams
    band(R + 0.008, y, R + 0.008, y + 0.03, true);
    poly("fittings", Array.from({length: seg}, (_, k) => at(R + 0.008, y, k)), neg(UP));
  }
  paint(GALV_IN, "galv");                                 // the inside, darker
  band(R - 0.002, yBell, R - 0.002, yTop, false);
  band(R + 0.068, yBot, R - 0.002, yBell, false);
  poly("fittings", Array.from({length: seg}, (_, k) => at(R + 0.07, yBot, k)), neg(UP));   // (the bell's rim, a thin ring seen as a face)
  // looking up into it: dark, below the lowest point of the roof over it
  paint(DUCT_DARK);
  poly("fittings", Array.from({length: seg}, (_, k) => at(R - 0.003, ridgeY - th - tanP * R - 0.06, k)), neg(UP));
  // the damper: a round plate on an axle across the pipe, half open
  const yD = yBell + 0.2, tilt = 0.6, rd = R - 0.012;
  paint(GALV, "galv");
  const disc = (dy) => Array.from({length: seg}, (_, k) => { const t = k / seg * 2 * Math.PI, u = rd * Math.cos(t), v = rd * Math.sin(t);
    return M(a + u, yD + dy + v * Math.sin(tilt), v * Math.cos(tilt)); });
  const top = disc(0.005), bot = disc(-0.005);
  poly("fittings", top, UP); poly("fittings", bot, neg(UP));
  for (let k = 0; k < seg; k++) { const j = (k + 1) % seg; poly("fittings", [bot[k], bot[j], top[j], top[k]], sub(mid([top[k], top[j]]), M(a, yD, 0))); }
  paint(DUCT_DARK);
  rod(M(a - R - 0.03, yD, 0), M(a + R + 0.03, yD, 0), 0.008, 6);
  // the lever on the axle and its cord down to where it can be reached
  const lever = M(a + R + 0.03, yD - 0.12, 0);
  beam(M(a + R + 0.03, yD, 0), lever, 0.012, 0.012);
  const reach = Math.min(yBot - 0.05, Math.max(F + 1.9, yBot - 1.6));
  beam(lever, [lever[0], reach, lever[2]], 0.006, 0.006);
  abox("fittings", [lever[0] - 0.03, reach - 0.12, lever[2] - 0.03], [lever[0] + 0.03, reach, lever[2] + 0.03]);
}
/**
 * A walk-in barn's roof seen from inside: rafters under both slopes, a ridge beam, and tie beams
 * with collar ties on every other pair (gable roofs, and the straight middle of hip roofs).
 * In ridge coordinates through M; ext: half the length the rafters run along the ridge.
 */
function buildRoofFrame(ext, span, top, ridgeY, tanP, M, th, vents, skip = () => false) {
  const inB = span / 2 - WALL_T, under = b => ridgeY - th - tanP * Math.abs(b), cosP = 1 / Math.hypot(1, tanP);
  const rw = 0.07, rh = 0.16, dv = rh / 2 / cosP;           // a rafter's section; its centre under the roof
  const n = Math.max(1, Math.round(2 * ext / 1.2)), step = 2 * ext / n;
  paint(TIMBER, "timber");
  for (let k = 0; k <= n; k++) {
    const a = -ext + k * step;
    if (skip(a)) continue;   // (where a wing opens into the roof there is no truss)
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
  if (kind.furnish) kind.furnish({floor: (color, surf) => { paint(color, surf); for (const r of room.rects) abox("fittings", [r.x0, F, r.z0], [r.x1, F + FLOOR_T, r.z1]); }});
  const outside = new Set([...problems(items, catalog, room)].filter(([, m]) => /outside/i.test(m)).map(([id]) => id));
  for (const it of items) {
    const def = catalog[it.type];
    if (!def || outside.has(it.id) || def.missing || (def.ghost && !ghosts)) continue;   // (a marker, like the sleep point, is not part of the building)
    // An imported item: the game loads its own i3d (with its collision); the editor draws its .obj.
    if (def.asset) { refs.push({asset: def.asset, item: it, ...placement(def.asset.meta, it, F)}); continue; }
    // (a box turned to any other angle than a quarter is drawn as a turned box)
    const o0 = toWorld(it, 0, 0), ex = toWorld(it, 1, 0), ez = toWorld(it, 0, 1);
    const axX = [ex[0] - o0[0], 0, ex[1] - o0[1]], axZ = [ez[0] - o0[0], 0, ez[1] - o0[1]];
    const box = (x0, x1, z0, z1, y0, y1, mat = "fittings") => {
      if (it.rot % 90 === 0) { const a = toWorld(it, x0, z0), b = toWorld(it, x1, z1); abox(mat, [a[0], F + y0, a[1]], [b[0], F + y1, b[1]]); return; }
      const [xa, xb] = [Math.min(x0, x1), Math.max(x0, x1)], [za, zb] = [Math.min(z0, z1), Math.max(z0, z1)];
      meshBox(mat, (a, b, c) => { const q = toWorld(it, lerp(xa, xb, a), lerp(za, zb, c)); return [q[0], F + lerp(y0, y1, b), q[1]]; }, axX, UP, axZ);
    };
    const round = (x, z, y, r, h, seg) => { const q = toWorld(it, x, z); cyl([q[0], F + y, q[1]], r, h, seg); };
    // points of the piece's frame ([x, y, z], y up from the floor) in the world
    const at = ([x, y, z]) => { const q = toWorld(it, x, z); return [q[0], F + y, q[1]]; };
    // (ceil: how high an inner wall goes: the ceiling of a house, the walls' top in a barn)
    const wgIn = liveWings(p).find(wg => it.x > wg.rect.x0 && it.x < wg.rect.x1 && it.z > wg.rect.z0 && it.z < wg.rect.z1);
    const ceil = ceilingC ? (wgIn ? wgIn.fh : p.floorHeight) : H;
    // (panel: a box in the inner-wall panel material; studs: the building's stud settings, for a panel side's studs)
    const pieceKit = {H, ceil, paint, box, cyl: round, panel: (...a) => box(...a, "wallsIn"), studs: {spacing: p.studSpacing, width: p.studWidth, irr: p.studIrregular},
      cone: (x, z, y, r0, r1, h, seg) => { const q = toWorld(it, x, z); cone([q[0], F + y, q[1]], r0, r1, h, seg); },
      rod: (a, b, r, seg) => rod(at(a), at(b), r, seg),
      pipe: (pts, r, seg) => tube(pts.map(at), r, seg),
      board: (a, b, w, h) => beam(at(a), at(b), w, h)};
    const drawn = vcount();
    def.build(pieceKit, it);
    if (def.leafOf && def.leafOf(it)) buildInnerDoor(it, def.leafOf(it), F);
    itemParts[it.id] = rangesSince(drawn);   // (which vertices of each material this piece drew: the thumbnails)
    if (def.solids) {
      // a piece with its own solids (an inner wall: open at its doorway), in its frame
      for (const [x0, x1, z0, z1, y0, y1] of def.solids(it, {ceil})) { const a = toWorld(it, x0, z0), b = toWorld(it, x1, z1); abox("collision", [Math.min(a[0], b[0]), F + y0, Math.min(a[1], b[1])], [Math.max(a[0], b[0]), F + y1, Math.max(a[1], b[1])]); }
    } else if (def.collision) { const f = footprint(it, def); abox("collision", [f.x0, F, f.z0], [f.x1, F + def.height(it), f.z1]); }
  }
}
/**
 * A door in the doorway of an inner wall (def.leafOf), in the piece's frame: the building's door style drawn on both faces of a
 * thin leaf, hinged at one end; when it opens, the leaf is recorded in doors like the outer doors', with its own trigger
 * and a collision box that moves with it. A door that stays shut is drawn and left alone (the wall's collision is closed).
 */
function buildInnerDoor(it, L, F) {
  const o = toWorld(it, 0, 0), ex = toWorld(it, 1, 0), ez = toWorld(it, 0, 1);
  const u = [ex[0] - o[0], 0, ex[1] - o[1]], n = [ez[0] - o[0], 0, ez[1] - o[1]];
  const fw = {o: [o[0], F, o[1]], u, n}, bw = {o: [o[0], F, o[1]], u: neg(u), n: neg(n)};
  const style = L.style || (p.doorStyle === "sliding" ? "zbrace" : p.doorStyle), hs = 0.008, half = 0.016, g = 0.012;
  const s0 = L.s0 + g, s1 = L.s1 - g, t0 = 0.02, t1 = L.h - 0.01, hingeLeft = L.hingeAt === "s1";
  const before = vcount();
  // (the inner doors have their own colour: the leaf's wood is the material "doorIn")
  const own = k => ({box: (m, ...a) => k.box(m === "door" ? "doorIn" : m, ...a), slab: (m, ...a) => k.slab(m === "door" ? "doorIn" : m, ...a)});
  // the side towards +z (kit forward) and the side towards -z (the kit turned half a turn: s runs the other way)
  drawLeaf(own(openingKit(fw)), style, {s0, s1, t0, t1, dIn: 0, dOut: half, right: hingeLeft, back: false});
  drawLeaf(own(openingKit(bw)), style, {s0: -s1, s1: -s0, t0, t1, dIn: 0, dOut: half, right: !hingeLeft, back: false});
  if (!L.opens) return;
  const hx = hingeLeft ? s1 : s0, hinge = WP(fw, hx, 0, 0), ends = [toWorld(it, s0, -half), toWorld(it, s1, half)];
  const box = {center: [(ends[0][0] + ends[1][0]) / 2, F + t1 / 2 + t0 / 2, (ends[0][1] + ends[1][1]) / 2],
    size: [Math.abs(ends[1][0] - ends[0][0]), t1 - t0, Math.abs(ends[1][1] - ends[0][1])]};
  // the leaf extends from the hinge along +u (hinged at s0) or -u (at s1); DOOR_OPEN turns +u towards +n
  const angle = (hingeLeft ? -DOOR_OPEN : DOOR_OPEN) * (L.swing > 0 ? 1 : -1);
  const c = toWorld(it, (L.s0 + L.s1) / 2, 0), al = Math.abs(ex[0] - o[0]) > 0.5;
  doors.push({wall: null, op: {id: 1000 + it.id}, slide: false, leaves: [{hinge, motion: {rotation: angle}, parts: rangesSince(before), box}],
    trigger: {center: [c[0], F + 1.1, c[1]], size: al ? [L.s1 - L.s0 + 0.6, 2.2, 2.4] : [2.4, 2.2, L.s1 - L.s0 + 0.6]}});
}
/** The ridge cap along the ridge from a0 to a1 (ridge coordinates), placed with M. */
/** The ridge cap from a0 to a1 along the ridge in roof axes M (Mn: their directions); keep: M keeps handedness. */
function ridgeCap(a0, a1, ridgeY, tanP, M, keep, Mn = M) {
  const m = ridgeCapMesh(a0 - 0.015, a1 + 0.015, ridgeY, tanP, 0.13), q = [];
  for (let k = 0; k < m.p.length; k += 3) q.push(...M(m.p[k], m.p[k + 1], m.p[k + 2]));
  const nn = [];
  for (let k = 0; k < m.n.length; k += 3) nn.push(...Mn(m.n[k], m.n[k + 1], m.n[k + 2]));
  const idx = [];
  // Swapping x and z mirrors the mesh, which turns its triangles inside out: turn them back.
  for (let k = 0; k < m.i.length; k += 3) idx.push(...(keep ? [m.i[k], m.i[k + 1], m.i[k + 2]] : [m.i[k], m.i[k + 2], m.i[k + 1]]));
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
  const type = o.porch.type, cd = o.porch.d;
  const cw = Math.min(w.L + 0.4, Math.max(o.porch.w, o.s1 - o.s0 + 0.5)), hw = cw / 2;
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
  rooms = []; downpipes = []; doors = []; itemParts = {};
  MATLIST = matList(p); partMats = null;
  const MT = matTable(p), usePart = id => { partMats = id && MT.of[id] ? MT.of[id] : null; };
  // (a wall with a look of its own: its part's materials with that wall's walls / lower walls)
  const useWall = key => {
    const id = wingIdOf(key), o = MT.ow[key];
    if (!o) { usePart(id); return; }
    partMats = {...(id && MT.of[id] ? MT.of[id] : {walls: "walls", wallsLow: "wallsLow", roof: "roof", trim: "trim"}), ...o};
  };
  G = {}; [...MATLIST, "collision"].forEach(m => G[m] = {p:[], n:[], uv:[], i:[]});
  G.curtain.c = []; G.fittings.c = []; G.fittings.s = []; fitSurf = undefined;
  const W = p.width, D = p.depth, F = p.foundation, fh = p.floorHeight, H = p.floors * fh + (p.halfStorey ? p.kneeWall : 0), top = F + H;
  // two materials on the walls: where the lower one ends (none at the walls' top or above: the gables are the upper's)
  // (under a ceiling the roof's underside is never seen from inside: a soffit, not raw boards)
  boardsFrom = hollow && !ceilingC ? top + 0.05 : Infinity;
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
  // The wings (an L, T or U; houses only) in the roof's terms. A wing's roof is built in its own axes: x out along its
  // ridge from the house's middle, z across it from its ridge; Mw maps those to the world, Ml directions.
  // The roof a part meets, in the terms its own roof is built in: the house's, or its parent's (a gable roof along the parent's length): M, Ml map
  // (along, y, across) to the world (a point, a direction), Ap and Bp give the along and across of a world point, ridgeY and tan, half the span, endX
  // where a part on the far end starts.
  const houseRoof = {M, Ml: M, Ap: A, Bp: B, ridgeY, tan: tanP, half: span / 2, endX: Lr / 2};
  const WINGS = [];
  for (const wing of liveWings(p)) {
    const topW = F + wing.H, tanW = wing.tanW, yR = topW + wing.ww / 2 * tanW, eW = wing.ww / 2 + o;
    const par = wing.parent ? WINGS.find(x => x.wing.id === wing.parent) : null;
    if (wing.type === "flat" || (par && !par.WG)) { WINGS.push({wing, WG: null, topW}); continue; }
    const pr = par ? {M: par.WG.Mw, Ml: par.WG.Ml, Ap: q => par.WG.local(q)[0], Bp: q => par.WG.local(q)[1], ridgeY: par.WG.yR, tan: par.WG.tanW, half: par.wing.ww / 2, endX: par.WG.x0 + par.wing.wd} : houseRoof;
    const dirA = v => pr.Ap(v) - pr.Ap([0, 0, 0]), dirB = v => pr.Bp(v) - pr.Bp([0, 0, 0]);
    const m = wallsOf(p)[wing.wall], cpt = wing.at(wing.sc, 0);
    let WG;
    if (wing.type !== "gable") {
      // on a side of the roof: its ridge runs into the parent's slope (a valley, k from the ridge line) or, lower, up to the wall
      const s = Math.sign(dirB(m.n)), aC = pr.Ap(cpt), valley = wing.type === "valley";
      WG = {valley, s, aC, yR, k: valley ? (pr.ridgeY - yR) / pr.tan : pr.half, r: tanW / pr.tan, x0: pr.half, Mw: (x, y, z) => pr.M(aC + z, y, s * x), Ml: (x, y, z) => pr.Ml(z, y, s * x), local: q => [s * pr.Bp(q), pr.Ap(q) - aC]};
    } else {
      // against a gable: its ridge runs along the parent's, lower, from the gable wall out
      const sA = Math.sign(dirA(m.n)), bC = pr.Bp(cpt);
      WG = {valley: false, yR, k: pr.endX, x0: pr.endX, Mw: (x, y, z) => pr.M(sA * x, y, bC + z), Ml: (x, y, z) => pr.Ml(sA * x, y, z), local: q => [sA * pr.Ap(q), pr.Bp(q) - bC]};
    }
    WG.eW = eW; WG.tanW = tanW; WG.cosW = Math.cos(wing.pitch * Math.PI / 180); WG.r = tanW / pr.tan; WG.eaveW = yR - eW * tanW;
    // where the parent's roof is cut for the wing's, along its eaves (eaves, gutter and dormers stop there)
    // (the valley line runs out from the parent's slope at the same pitch (45°), but the slope only reaches the end of its overhang: a wing whose
    // ridge is just over the eaves meets it only there, and the rest of its roof runs on to the wall)
    if (WG.valley) {
      WG.xCap = WG.x0 + o;
      WG.cutHalf = Math.min(eW, Math.max(0, (WG.xCap - WG.k) / WG.r));
      WG.xE = Math.min(WG.k + eW * WG.r, WG.xCap);
    }
    WG.cut = WG.valley && WG.cutHalf > 0.01 ? [WG.aC - WG.cutHalf, WG.aC + WG.cutHalf] : null;
    WINGS.push({wing, WG, topW});
  }
  const sideWGs = s => WINGS.filter(x => !x.wing.parent).map(x => x.WG).filter(g => g && g.cut && g.s === s);   // (the house's roof is cut for its own parts only)
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
    if (sideWGs(s).some(g => ac + hwr > g.cut[0] - 0.2 && ac - hwr < g.cut[1] + 0.2)) continue;
    d._hidden = false;
    DORMS[s].push({d, s, hw, hwr, ac, fr, bf, yb, ye, be, br, yrd, tanD, bfront: bf + (fr ? Math.max(0.2, Math.min(o, 0.6)) : 0.25)});
  }
  // The wing's roof takes a triangle out of the slope it meets: b > k + |a - aC| (same pitch, so 45° valleys).
  const notch = (s, pieces) => sideWGs(s).reduce((ps, g) => ps.flatMap(q => [
    clipPoly(clipPoly(q, 1, 0, g.aC), g.r, 1, g.k + g.r * g.aC), clipPoly(clipPoly(q, -1, 0, -g.aC), -g.r, 1, g.k - g.r * g.aC)]).filter(q => q.length >= 3), pieces);
  const slopeRoof = (s, S, up) => {
    for (const q of notch(s, slopePieces(S, DORMS[s]))) {
      const T = q.map(([a, b]) => M(a, yRoof(b), s * b));
      poly("roof", T, up, uvSide); poly("roof", T.map(dn), neg(up), uvSide);
    }
  };
  const cutsFor = s => [...DORMS[s].filter(X => X.fr).map(X => [X.ac - X.hw, X.ac + X.hw]), ...sideWGs(s).map(g => g.cut)];
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

  // How high a wing on wall key stands against it at a..b (from the floor): all of the wall under a valley (it is
  // under the roof), up to the wing's roof against a gable or the eaves, up to its flat roof. null: no wing there.
  const wingCover = key => {
    const mine = WINGS.filter(x => x.wing.wall === key);
    if (!mine.length) return null;
    return (a, b) => Math.max(...mine.map(({wing, WG}) => {
      if (b < wing.s0 - 0.1 || a > wing.s1 + 0.1) return -Infinity;
      if (wing.type === "valley") return Infinity;
      if (!WG) return wing.H + 0.1;
      return WG.yR + 0.15 - F - Math.max(0, a - wing.sc, wing.sc - b) * WG.tanW;
    }));
  };
  // (the walls' lower material ends at splitAt, if that is under the wall's top)
  const splitFor = (Hh, key) => { const at = splitAtOf(p, key); return at > 0.05 && at < Hh - 0.05 ? at : null; };
  const WS = wallFrames(W, D, F);
  const entrances = [];
  opsByWall = {};
  for (const key in WS) {
    const gable = p.roofType === "gable" && (ridgeX ? (key === "left" || key === "right") : (key === "front" || key === "back"));
    const R = gable ? Math.max(0, rise - th) : 0, Lw = WS[key].L;
    const ops = layoutWall(key, Lw, fh, sv => H + R * Math.max(0, 1 - Math.abs(sv - Lw/2) / (Lw/2)), wingCover(key));
    // Eave walls' inside faces reach into the roof slab (which sits lower further in), staying below its top.
    const inner = hollow ? {lift: R > 0 || p.roofType === "flat" ? 0 : Math.min(WALL_T * tanP, th - 0.02)} : null;
    useWall(key);
    buildWall(WS[key], ops, H, R, F, {topAt: sv => H + R * Math.max(0, 1 - Math.abs(sv - Lw/2) / (Lw/2)), inner, key, split: splitFor(H, key)});
    usePart(0);
    opsByWall[key] = {w: WS[key], ops};
    for (const dOp of ops) if (dOp.kind === "door" && dOp.porch.type !== "none") entrances.push({w: WS[key], o: dOp, key, gable});
  }
  // Each wing's walls: its far end (a gable, unless the roof is flat) and its sides (eave walls), as tall as the wing.
  for (const {wing} of WINGS) for (const part of WING_PARTS) {
    usePart(wing.id);
    const key = wingWallKey(wing.id, part), w = wing.frames[key], Lw = w.L, Hw = wing.H;
    useWall(key);
    const R = part === "End" && wing.type !== "flat" ? Math.max(0, wing.ww / 2 * wing.tanW - th) : 0;
    const topAt = sv => Hw + R * Math.max(0, 1 - Math.abs(sv - Lw/2) / (Lw/2));
    const ops = layoutWall(key, Lw, wing.fh, topAt, wingCover(key));
    // (inside faces in a walk-in building, with the same lift under the wing's roof slab as the house's eave walls)
    const inner = hollow ? {lift: R > 0 || p.roofType === "flat" ? 0 : Math.min(WALL_T * wing.tanW, th - 0.02)} : null;
    buildWall(w, ops, Hw, R, F, {topAt, key, split: splitFor(Hw, key), inner});
    opsByWall[key] = {w, ops};
    for (const dOp of ops) if (dOp.kind === "door" && dOp.porch.type !== "none") entrances.push({w, o: dOp, key, gable: R > 0, H: Hw, nf: wing.floors});
  }
  usePart(0);
  // A porch or canopy at every door that has one.
  for (const entr of entrances) {
    usePart(wingIdOf(entr.key));
    const {type, w: pw, d: pd} = entr.o.porch, Hh = entr.H ?? H, nf = entr.nf ?? p.floors;
    let limit = 1e9;
    if (p.roofType === "flat") limit = Hh - 0.05;
    else if (!entr.gable && type === "shed") limit = Hh - th - Math.min(o, pd + 0.15) * tanP - 0.05;
    // A walk-in building's wall is thin, so a canopy can't tuck in under the eaves (it would show
    // inside): it stays below them instead, a little flatter if need be.
    else if (!entr.gable && hollow) limit = Hh - 0.05;
    // and under the windows of the floor above it
    const k = entr.key, cs = (entr.o.s0 + entr.o.s1) / 2, hw = Math.max(pw, entr.o.s1 - entr.o.s0 + 0.5) / 2 + 0.2;
    const above = p.windows.filter(x => x.wall === k && x.floor === 1 && x.type !== "door" && (([a, b]) => a < cs + hw && b > cs - hw)(openingSpan(x, entr.w.L)));
    if (nf > 1 && above.length) limit = Math.min(limit, fhOf(entr.key) + Math.min(...above.map(x => x.sill)) - 0.1);
    const mainEave = !entr.gable && p.roofType !== "flat" ? {H: Hh, tanP} : null;
    buildEntrance(entr.w, entr.o, limit, F, mainEave);
  }
  usePart(0);
  // Under a wing's roof at (x, z), where it is the roof on top (the house's and the wing's meet in valleys).
  const wingUnder = item => {
    const {WG, topW} = item, par = item.wing.parent ? WINGS.find(x => x.wing.id === item.wing.parent) : null;
    return (x, z) => {
      if (!WG) return topW;
      const y = WG.yR - th - Math.abs(WG.local([x, 0, z])[1]) * WG.tanW - 0.01;
      return WG.valley ? Math.max(y, par ? wingUnder(par)(x, z) : roofUnder(x, z)) : y;
    };
  };
  function buildWingBody(item) {
    const {wing} = item, under = wingUnder(item), {at, s0, s1, wd} = wing, Lm = (WS[wing.wall] || wallsOf(p)[wing.wall]).L, c = 0.09;
    const post = (P, du, dn) => {
      // a corner board from P, du along the house's wall and dn out from it (both ±0.09 or 0..0.09)
      const Q = (a, b) => { const q = at(a, b); return [q[0], q[2]]; };
      const pts = [Q(P[0] + du[0], P[1] + dn[0]), Q(P[0] + du[1], P[1] + dn[1])];
      const x0 = Math.min(pts[0][0], pts[1][0]), x1 = Math.max(pts[0][0], pts[1][0]), z0 = Math.min(pts[0][1], pts[1][1]), z1 = Math.max(pts[0][1], pts[1][1]);
      box("trim", (a, b, cc) => { const x = lerp(x0, x1, a), z = lerp(z0, z1, cc); return [x, b ? under(x, z) : F, z]; }, [1,0,0], UP, [0,0,1]);
    };
    // the far corners, and the inside corners against the house (outside both walls), unless the wing is flush
    // with the house's end, where its corner board serves
    post([s0, wd], [-c, c], [-c, c]); post([s1, wd], [-c, c], [-c, c]);
    if (s0 > 0.2) post([s0, 0], [-c, 0], [0, c]);
    if (s1 < Lm - 0.2) post([s1, 0], [0, c], [0, c]);
    const a = at(s0 - PLINTH_OUT, PLINTH_OUT), b = at(s1 + PLINTH_OUT, wd + PLINTH_OUT);
    // (the plinth starts where the house's ends: tops in one plane would flicker where they overlap)
    if (F > 0.01) abox("foundation", [a[0], 0, a[2]], [b[0], F, b[2]]);
    const a2 = at(s0, 0), b2 = at(s1, wd);
    // (a walk-in building's wing is hollow: its floor and walls have collision below)
    if (!hollow) abox("collision", [a2[0], 0, a2[2]], [b2[0], item.topW, b2[2]]);
  }
  function buildWingRoof(item) {
    const {wing, WG, topW} = item;
    if (!WG) {   // (a flat roof)
      const oo = Math.min(o, 0.4), a = wing.at(wing.s0 - oo, oo), b = wing.at(wing.s1 + oo, wing.wd + oo);
      abox("roof", [a[0], topW, a[2]], [b[0], topW + 0.3, b[2]]);
      abox("collision", [a[0], topW, a[2]], [b[0], topW + 0.3, b[2]]);
      return;
    }
    const {valley, yR, k, r: slopeR, x0, eW, eaveW, Mw, Ml, local, tanW, cosW, xCap, cutHalf} = WG;
    const xWall = x0 + wing.wd, xF = xWall + Math.min(o, 0.5), xE = valley ? WG.xE : x0;
    const uvW = q => { const [x, z] = local(q); return [x, -Math.abs(z) / cosW]; };
    // the parts that stand on this one and meet its slope in valleys: its slope, eaves and gutter are cut for them
    const kids = WINGS.filter(x => x.wing.parent === wing.id && x.WG && x.WG.valley && x.WG.cut);
    const kidCuts = sg => kids.filter(x => x.WG.s === sg).map(x => x.WG.cut);
    const notchLocal = (sg, pieces) => kids.filter(x => x.WG.s === sg).reduce((ps, {WG: g}) => ps.flatMap(q => [
      clipPoly(clipPoly(q, 1, 0, g.aC), g.r, 1, g.k + g.r * g.aC), clipPoly(clipPoly(q, -1, 0, -g.aC), -g.r, 1, g.k - g.r * g.aC)]).filter(q => q.length >= 3), pieces);
    for (const sg of [1, -1]) {
      // a slope from the valley (or the wall) out to the far end
      // (2 cm in from the eave line: flush with the house's end its boards would lie in the barge board's plane and flicker)
      const eR = eW - 0.02;
      // (a valley reaching the end of the house's overhang before the wing's eave: along it, then the wing's roof as far in as the overhang)
      const zc = valley ? Math.min(eR, cutHalf) : 0;
      const S = valley ? (zc < eR - 1e-6 ? [[k, 0], [xF, 0], [xF, sg * eR], [xCap, sg * eR], [xCap, sg * zc]] : [[k, 0], [xF, 0], [xF, sg * eR], [k + eR * slopeR, sg * eR]]) : [[x0, 0], [xF, 0], [xF, sg * eR], [x0, sg * eR]];
      const T = S.map(([x, z]) => Mw(x, yR - Math.abs(z) * tanW, z)), up = Ml(0, 1, sg * tanW);
      const pieces = kids.length ? notchLocal(sg, [S.map(([x, z]) => [x, sg * z])]).map(q => q.map(([x, b]) => [x, sg * b])) : [S];
      for (const Sq of pieces) {
        const Tq = Sq.map(([x, z]) => Mw(x, yR - Math.abs(z) * tanW, z));
        poly("roof", Tq, up, uvW); poly("roof", Tq.map(dn), neg(up), uvW);
      }
      poly("trim", [T[1], T[2], dn(T[2]), dn(T[1])], Ml(1, 0, 0));
      for (const [a0, a1] of segs(xE, xF, kidCuts(sg))) {
        const E = [Mw(a0, eaveW + 0.02 * tanW, sg * eR), Mw(a1, eaveW + 0.02 * tanW, sg * eR)];
        poly("trim", [E[0], E[1], dn(E[1]), dn(E[0])], Ml(0, 0, sg));
      }
    }
    const det = dot(Ml(1, 0, 0), cross(Ml(0, 1, 0), Ml(0, 0, 1)));
    ridgeCap(valley ? k : x0, xF, yR, tanW, Mw, det > 0, Ml);
    prism("collision", [[-eW, eaveW], [eW, eaveW], [0, yR]], ([z, y], e) => Mw(e ? xF : (valley ? k : x0), y, z));
    if (p.gutters) {
      const r = 0.065, yT = eaveW - 0.06;
      for (const sg of [1, -1]) {
        const bg = sg * (eW + r - 0.02);
        // from just outside the house's gutter, which runs through the corner (crossing, their bottoms would
        // flicker), or from the wall
        for (const [a0, a1] of segs(valley ? xE + 2 * r - 0.015 : x0 + 0.01, xF - 0.01, kidCuts(sg))) gutterRun(Mw(a0, yT, bg), Mw(a1, yT, bg), Ml(0, 0, sg), r);
      }
    }
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
  WINGS.forEach(item => { usePart(item.wing.id); buildWingBody(item); usePart(0); });
  if (!hollow) abox("collision", [-W/2, 0, -D/2], [W/2, top, D/2]);
  else {
    // Floor, then each wall as slabs with a gap for the door (the door leaf has its own collision)
    // and for any other opening tall enough to walk through (a cow barn's doorway to the pasture).
    if (F > 0.01) abox("collision", [-W/2, 0, -D/2], [W/2, F, D/2]);
    // each wing's floor, then every wall (the house's and the wings') the same way
    if (F > 0.01) for (const {wing: wg} of WINGS) { const a = wg.at(wg.s0, 0), b = wg.at(wg.s1, wg.wd); abox("collision", [Math.min(a[0], b[0]), 0, Math.min(a[2], b[2])], [Math.max(a[0], b[0]), F, Math.max(a[2], b[2])]); }
    for (const key of Object.keys(opsByWall)) {
      const wid = wingIdOf(key), Hh = wid ? WINGS.find(x => x.wing.id === wid).wing.H : H;
      const w = opsByWall[key].w, gaps = opsByWall[key].ops.filter(o => (o.kind === "door" && o.opens) || o.kind === "open" || (o.kind === "hatch" && (o.t1 >= 1.8 || o.hole))).sort((a, b) => a.s0 - b.s0);
      const slab = (s0, s1, t0, t1) => { if (s1 - s0 > 1e-6 && t1 - t0 > 1e-6) wbox("collision", w, s0, s1, t0, t1, -WALL_T, 0); };
      let s = 0;
      for (const g of gaps) { slab(s, g.s0, 0, Hh); slab(g.s0, g.s1, g.t1, Hh); s = g.s1; }
      slab(s, w.L, 0, Hh);
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

  WINGS.forEach(item => { usePart(item.wing.id); rawUnder = hollow && !ceilingC; buildWingRoof(item); rawUnder = false; usePart(0); });
  for (const s of [1, -1]) for (const X of DORMS[s]) buildDormer(X);

  if (p.gutters && p.roofType !== "flat") {
    const r = 0.065, hip = p.roofType === "hip";
    const hA = Lr/2 + (hip ? o : Math.min(o, 0.5)), hB = span/2 + o, yT = eaveY - 0.06;
    for (const s of [1, -1]) {
      const bg = s * (hB + r - 0.02);
      // (on a gable roof the gutter stops 1 cm short of the barge boards: its end in their plane would flicker)
      const gEnd = hip ? hA + r : hA - 0.01;
      // (the gutter stops at the wing's cut: the wing's eave board is 2 cm inside it, so their ends aren't in one plane)
      const gCuts = cutsFor(s);
      for (const [x0, x1] of segs(-gEnd, gEnd, gCuts)) gutterRun(M(x0, yT, bg), M(x1, yT, bg), M(0, 0, s), r);
      // (the end gutters stop 2 cm short of the eaves' boards: their ends in the boards' plane would flicker)
      if (hip) { const ag = s * (hA + r - 0.02); gutterRun(M(ag, yT, -hB + 0.02), M(ag, yT, hB - 0.02), M(s, 0, 0), r); }
    }
  }

  // The downpipes (p.pipes): each on a wall with a gutter, at its place along the wall. One pipe with rounded elbows: out of the
  // gutter, in to the wall, down, and out at the foot. Not where a wing stands against the wall, or under its valley.
  if (p.gutters && p.roofType !== "flat") {
    const r = 0.065, eave = new Set(eaveWalls(p));
    for (const pp of p.pipes || []) {
      const f = eave.has(pp.wall) && opsByWall[pp.wall] && opsByWall[pp.wall].w;
      if (!f) continue;
      const wid = wingIdOf(pp.wall), item = wid ? WINGS.find(x => x.wing.id === wid) : null;
      let s = Math.min(f.L - 0.15, Math.max(0.15, pp.pos * f.L));
      if (item) {
        // on a wing's side: beyond its valley, wherever along the side it stands
        const {WG} = item, minS = (WG && WG.valley ? WG.xE - WG.x0 : 0) + 0.3;
        s = pp.wall.endsWith("Left") ? Math.max(s, minS) : Math.min(s, f.L - minS);
      } else if (liveWings(p).some(w => w.wall === pp.wall && s > w.s0 - 0.2 && s < w.s1 + 0.2)) continue;
      const yT = (item && item.WG ? item.WG.eaveW : eaveY) - 0.06, yb = yT - r, dg = o + r - 0.02, dw = 0.09, df = 0.28;
      const P = (y, d) => [f.o[0] + f.u[0] * s + f.n[0] * d, y, f.o[2] + f.u[2] * s + f.n[2] * d];
      const route = [P(yb + 0.03, dg), P(yb - 0.12, dg), P(yb - 0.12 - Math.abs(dg - dw) * 0.9, dw), P(0.3, dw), P(0.1, df)];
      downpipes.push({path: route, r: 0.045});
      addMesh("gutter", pipeMesh(route, 0.045));
      for (let y = 1.0; y < route[2][1] - 0.4; y += 1.6) wbox("gutter", f, s - 0.015, s + 0.015, y - F, y - F + 0.04, 0, dw);
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
  if (hollow && ceilingC) {
    // the ceiling over the ground floor (the floors above are closed from inside)
    const room = roomOf(p, openings), wlist = liveWings(p), y = F + p.floorHeight;
    // a house's ceiling is painted; a barn's (the kind has none of its own) is boards on beams, as wood is in a barn
    const wooden = !kind.ceiling;
    paint(wooden ? "#9C7A52" : ceilingC, wooden ? "boards" : "whitewash");
    // (the rects are the house's, then each wing's: a wing's ceiling is at its own floor height)
    room.rects.forEach((r, i) => { const yy = i ? F + wlist[i - 1].fh : y; poly("fittings", [[r.x0, yy, r.z0], [r.x1, yy, r.z0], [r.x1, yy, r.z1], [r.x0, yy, r.z1]], neg(UP)); });
    if (wooden) {
      // beams (bjalkar) 10 x 20 cm about every 90 cm across the shorter way, under the boards
      room.rects.forEach((r, i) => {
        const yy = i ? F + wlist[i - 1].fh : y, alongX = (r.x1 - r.x0) >= (r.z1 - r.z0), L = alongX ? r.x1 - r.x0 : r.z1 - r.z0, n = Math.max(1, Math.round(L / 0.9)), sp = L / n;
        paint("#7A5A38", "timber");
        for (let k = 0; k < n; k++) {
          const c = (k + 0.5) * sp, a0 = (alongX ? r.x0 : r.z0) + c - 0.05, a1 = a0 + 0.1;
          if (alongX) abox("fittings", [a0, yy - 0.2, r.z0], [a1, yy - 0.0001, r.z1]); else abox("fittings", [r.x0, yy - 0.2, a0], [r.x1, yy - 0.0001, a1]);
        }
      });
    }
    // and across the thickness of the house's wall where a wing opens into it, so the ceiling has no seam there
    const mains = wallsOf(p);   // (the walls the parts open through: the house's, or a part's)
    for (const wg of liveWings(p)) {
      const m = mains[wg.wall];
      const yp = Math.min(fhOf(wg.wall), wg.fh);
      if (m) poly("fittings", [WP(m, wg.s0 + WALL_T, yp, -WALL_T), WP(m, wg.s1 - WALL_T, yp, -WALL_T), WP(m, wg.s1 - WALL_T, yp, 0), WP(m, wg.s0 + WALL_T, yp, 0)], neg(UP));
    }
  } else if (hollow && p.roofType !== "flat") {
    // (the tie beams at the ends are 12 cm thick: kept clear of the gable walls)
    const ext = p.roofType === "hip" ? Math.max(0, ridgeHalf - 0.3) : Lr/2 - WALL_T - 0.08;
    buildRoofFrame(ext, span, top, ridgeY, tanP, M, th, p.ventilators > 0 ? ventSpots(p.ventilators, ridgeHalf) : [], a => WINGS.some(({WG}) => WG && WG.cut && a > WG.cut[0] - 0.1 && a < WG.cut[1] + 0.1));
  }
  // Things the kind puts outside its walls (a cow barn's troughs), drawn in "fittings" and "collision".
  if (kind.outside) kind.outside({p, geo: {opsByWall, dims: {W, D}}, abox, cyl, paint});
  // The placed pieces last (tests find a piece's vertices after the empty barn's).
  if (hollow) buildInside(kind, F, H);
  dims = {W, D, top, ridgeY, F};
}
build();
const {collision, ...visual} = G;
// the doors in the window list's order (door1, door2 ...)
doors.sort((a, b) => (a.op.id || 0) - (b.op.id || 0));
return {G: visual, dims, opsByWall, collision, rooms, downpipes, doors, itemParts, refs, wings: liveWings(p)};
}

/* ---------- Materials ---------- */
/** The colour of material m: the chosen one, aged by the building's years (age.mjs). */
export function colorFor(p, m) {
  return agedColor(chosenColor(p, m), p.age || 0, slotOf(m));
}
function chosenColor(p, m) {
  const v = variantOf(p, m);
  if (v) return v.color;
  return {walls:p.wallColor, wallsLow:p.lowerColor, wallsIn:p.innerCladding === "same" ? p.wallColor : p.innerCladding === "sameLow" ? p.lowerColor : p.innerColor, trim:p.trimColor, roof:p.roofColor, glass:"#7396AB", door:p.doorColor, doorIn:p.innerDoorColor, foundation:p.foundationColor, chimney:p.chimneyColor, gutter:p.gutterColor, iron:"#2C2D2F", interior:"#B8AE9C", curtain:p.curtainColor, fittings:"#E9E4D8"}[m];
}
/** The texture of material m (null: plain colour): its kind, the metres one copy covers (w, h) and the building's age. */
export function surfaceSpec(p, m) {
  const s = baseSpec(p, m);
  return s && {...s, age: p.age || 0};
}
function baseSpec(p, m) {
  const v = variantOf(p, m);
  const kind = v ? (v.slot === "trim" ? "paintedwood" : v.slot === "roof" ? (v.kind === "plain" ? null : v.kind) : v.kind)
    : m === "walls" ? p.wallCladding
    : m === "wallsLow" ? p.lowerCladding
    : m === "wallsIn" ? (p.innerCladding === "same" ? p.wallCladding : p.innerCladding === "sameLow" ? p.lowerCladding : p.innerCladding)
    : m === "roof" ? (p.roofType === "flat" ? "felt" : p.roofMaterial === "plain" ? null : p.roofMaterial)
    : m === "chimney" ? (p.chimneyStyle === "brick" ? "brick" : null)
    : m === "trim" || m === "door" || m === "doorIn" ? "paintedwood"
    : m === "foundation" ? "concrete" : null;
  if (!kind) return null;
  const sp = p.panelSpacing;
  if (kind === "lockpanel") { const n = Math.max(2, Math.round(1.2 / sp)); return {kind, n, bw: Math.min(0.8, p.battenWidth / sp), w: n*sp, h: n*sp}; }
  if (kind === "vertical" || kind === "horizontal") { const n = Math.max(2, Math.round(1.2 / sp)); return {kind, n, w: n*sp, h: n*sp}; }
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
  for (const m of Object.keys(geo.G)) {
    const g = geo.G[m];
    for (let i = 0; i < g.p.length; i += 3) {
      const v = [g.p[i], g.p[i+1], g.p[i+2]];
      all.push(v);
      if (v[1] < 0.01) ground.push(v);
    }
  }
  for (const r of extra) for (const x of [r.x0, r.x1]) for (const z of [r.z0, r.z1]) { ground.push([x, 0, z]); all.push([x, 0, z]); }
  // a loop, not Math.min(...pts): a big building has more vertices than a call takes arguments
  const lo = (pts, k) => pts.reduce((a, v) => Math.min(a, v[k]), Infinity), hi = (pts, k) => pts.reduce((a, v) => Math.max(a, v[k]), -Infinity);
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
 * It starts at the first door (the window list's first); the player can move it, size it or put it
 * on another wall, at that wall's first door or else its middle (places.mjs).
 */
export function sleepPoint(geo, p = {}) {
  // the sleep point piece placed inside (a bedroom), else the game object outside the door
  const piece = (p.items || []).find(it => it.type === "sleeppoint"), {dims} = geo;
  const o = piece ? {x: piece.x, z: piece.z, w: piece.width, d: piece.depth, h: 2.2, ix: 0, iz: 0} : objectOf(p, "sleep");
  if (!o) return null;
  const c = [o.x, 0, o.z];
  // out from the building: along the axis the box is further out on (past the walls); a piece inside: towards the nearest wall
  const alongX = piece ? dims.W / 2 - Math.abs(o.x) < dims.D / 2 - Math.abs(o.z) : Math.abs(o.x) - dims.W / 2 > Math.abs(o.z) - dims.D / 2;
  const n = alongX ? [Math.sign(o.x) || 1, 0, 0] : [0, 0, Math.sign(o.z) || 1], u = [n[2], 0, -n[0]];
  const toward = (from, to) => {
    const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2], deg = 180 / Math.PI;
    return [Math.atan2(dy, Math.hypot(dx, dz)) * deg, Math.atan2(-dx, -dz) * deg, 0];
  };
  const trigger = piece ? {center: [o.x, dims.F + o.h / 2, o.z], size: [o.w, o.h, o.d]} : boxOf(o), marker = [o.x + o.ix, dims.F, o.z + o.iz];
  // The spawn point: out past the far side of the cleared area, then one metre more.
  const {clear} = placementAreas(geo);
  const reach = Math.max(...[[clear.x0, clear.z0], [clear.x1, clear.z0], [clear.x0, clear.z1], [clear.x1, clear.z1]]
    .map(([x, z]) => (x - c[0]) * n[0] + (z - c[2]) * n[2]));
  const target = [0, dims.ridgeY * 0.45, 0];
  const out = Math.max(0, reach) + 1, sp = [c[0] + n[0] * out, 0, c[2] + n[2] * out];
  const dist = Math.max(dims.W, dims.D) * 1.2 + 6;
  const cam = [c[0] + (n[0] + u[0] * 0.6) * dist, dims.ridgeY + dist * 0.4, c[2] + (n[2] + u[2] * 0.6) * dist];
  return {trigger, marker, spawn: {pos: sp, rot: [0, toward(sp, target)[1], 0]}, camera: {pos: cam, rot: toward(cam, target)}};
}

/**
 * The building's game objects as the preview shows them: [{id, type, name, glyph, box {center, size},
 * icon | null}], the same boxes and icons the export writes (the pasture is drawn as its fence).
 */
export function gamePlaces(p) {
  const q = sanitize(p), kind = kindOf(q);
  const piece = (q.items || []).find(it => it.type === "sleeppoint");
  const list = (q.objects || []).filter(o => o.type !== "pasture" && !(piece && o.type === "sleep")).map(o => {
    const t = objectInfo(kind, o.type), glyph = t.glyph === "animals" ? (kind.glyph || "hen") : t.glyph;
    return {id: o.id, type: o.type, name: t.name, glyph, box: boxOf(o), icon: t.icon ? [o.x + o.ix, o.type === "sleep" ? q.foundation : 0, o.z + o.iz] : null};
  });
  // the sleep point placed inside (a piece) is the one the game gets: its trigger and icon in the preview
  if (piece) list.push({id: 1000 + piece.id, type: "sleep", name: "Sleep point", glyph: "sleep", box: {center: [piece.x, q.foundation + 1.1, piece.z], size: [piece.width, 2.2, piece.depth]}, icon: [piece.x, q.foundation, piece.z]});
  return list;
}

/* ---------- Export ---------- */
/** Whether the windows are see-through: with rooms behind them, or into a walk-in building. */
export const seeThroughGlass = p => !!p.interior || kindOf(p).walkIn;
/** Opacity of the window glass when it is see-through. */
export const GLASS_ALPHA = 0.35;
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

/** Where a walk-in building's door prompt shows: a box across the doorway (opening o of wall), both sides. */
function doorTrigger(geo, wall, o) {
  const {w} = geo.opsByWall[wall], s = (o.s0 + o.s1) / 2;
  const ax = Math.abs(w.u[0]) > 0.5, along = o.s1 - o.s0 + 0.6;
  return {center: [w.o[0] + w.u[0] * s, w.o[1] + 1.1, w.o[2] + w.u[2] * s], size: ax ? [along, 2.2, 2.4] : [2.4, 2.2, along]};
}

/**
 * Everything the export writes, built once: the i3d document and scene tree, and the placeable XML
 * blocks that name its nodes. The i3dMappings are looked up in the scene by name, so they always match.
 * Scene: house > clear/level/test/tipOcclusion areas, visuals, collisions (like the base game's
 * garden sheds), then a walk-in building's doors, the kind's own nodes and the indoor area.
 */
function exportParts(p, {withTex = false} = {}) {
  p = normalize(p);
  const kind = kindOf(p), geo = buildGeometry(p), {G} = geo, doc = new I3dDoc();
  // A walk-in building's door leaves move, so what they carry (door, trim, glass, ironwork) comes
  // out of the building's own parts and goes on the leaves.
  const doors = kind.walkIn ? geo.doors : [];
  const moving = {};
  for (const d of doors) for (const leaf of d.leaves) for (const [m, r] of Object.entries(leaf.parts)) (moving[m] = moving[m] || []).push(r);
  // One part per material, except curtains and fittings: one per color (i3d materials have one color).
  const parts = [];
  for (const m of matList(p)) {
    const g = moving[m] ? exceptRanges(G[m], moving[m]) : G[m];
    if (!g.i.length) continue;
    if (m === "curtain" || m === "fittings") splitByColor(g).forEach((q, j) => parts.push({name: j ? `${m}${j + 1}` : m, m, g: q}));
    else parts.push({name: m, m, g});
  }
  const mats = {};
  const matOf = (m, name, g) => g.color ? materialFor(doc, p, m, name, g, withTex) : (mats[m] = mats[m] || materialFor(doc, p, m, name, g, withTex));
  const visuals = [];
  for (const {name, m, g} of parts) {
    const uv = scaledUV(p, m, g);
    visuals.push(shape(name, {shapeId: doc.shape(name, g, {uv}), castsShadows: !(NO_SHADOW.includes(m) && (m !== "glass" || seeThroughGlass(p))), receiveShadows: true, materialIds: matOf(m, name, g)}));
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
    const cap = s => s[0].toUpperCase() + s.slice(1);
    // Each leaf: a node at its hinge holding the node the game moves (turns or slides), which holds
    // the leaf's meshes, relative to the hinge, and its collision, which moves with it.
    const leafNode = (leaf, nm) => tg(`${nm}Hinge`, leaf.hinge, [tg(nm, [0, 0, 0], [
      ...Object.entries(leaf.parts).map(([m, [a, b]]) => {
        const s = sliceMesh(G[m], a, b), local = {...s, p: s.p.map((v, i) => v - leaf.hinge[i % 3])};
        return shape(`${nm}${cap(m)}`, {shapeId: doc.shape(`${nm}${cap(m)}`, local, {uv: scaledUV(p, m, s)}), castsShadows: m !== "glass", receiveShadows: true, materialIds: matOf(m, m, s)});
      }),
      shape(`${nm}Collision`, {translation: leaf.box.center.map((v, i) => v - leaf.hinge[i]), shapeId: doc.shape(`${nm}CollisionBox`, boxMesh(leaf.box.size), {cpu: true}),
        kinematic: true, collisionFilterGroup: "0x1034", collisionFilterMask: "0xfffffbff", nonRenderable: true, castsShadows: false, receiveShadows: false, materialIds: cm})])]);
    doorNodes = [tg("doors", [0, 0, 0], doors.flatMap((d, i) => [
      ...d.leaves.map((leaf, k) => leafNode(leaf, `door${i + 1}Leaf${k + 1}`)),
      box(`door${i + 1}Trigger`, d.trigger || doorTrigger(geo, d.wall, d.op), trigger("0x20000000", "0x110000")),
    ]))];
    const key = (leaf, t) => leaf.motion.translation ? `translation="${t ? v3(leaf.motion.translation) : "0 0 0"}"` : `rotation="0 ${t ? num(leaf.motion.rotation) : 0} 0"`;
    doorXml = `
    <!-- The doors: walk up to one and use the open/close prompt, as on the base game's barns. A pair of doors opens together. -->
    <animatedObjects>
${doors.map((d, i) => `        <animatedObject saveId="door${i + 1}">
            <animation duration="${d.slide ? 3 : 1.5}">
${d.leaves.map((leaf, k) => `                <part node="door${i + 1}Leaf${k + 1}">
                    <keyFrame time="0" ${key(leaf, 0)}/>
                    <keyFrame time="1" ${key(leaf, 1)}/>
                </part>`).join("\n")}
            </animation>
            <controls triggerNode="door${i + 1}Trigger" posAction="ACTIVATE_HANDTOOL" posText="action_openDoor" negText="action_closeDoor"/>
            <sounds>
                <moving linkNode="door${i + 1}Leaf1" template="${d.slide ? "slidingGateWoodLoop" : "woodDoorSqueaksSmall"}"/>
                <posEnd linkNode="door${i + 1}Leaf1" template="woodDoorOpen"/>
                <negEnd linkNode="door${i + 1}Leaf1" template="${d.slide ? "woodDoorClose" : "woodDoorCloseRandom"}"/>
            </sounds>
        </animatedObject>`).join("\n")}
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
  const indoor = kind.walkIn || !!objectOf(p, "sleep");
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

/**
 * The placeable (store item) XML for the mod: shop data and the same blocks as placeableSnippet. The game reads the shop picture and the i3d
 * relative to the mod's root, not to the XML: in a mod of several buildings each is in a folder, so dir ("farmhouse/") goes in front of them.
 */
export function placeableXml(p, name, {dir = ""} = {}) {
  const {kind, blocks, p: q} = exportParts(p), {type, fn, shop} = kind.placeable(q);
  return `<?xml version="1.0" encoding="utf-8" standalone="no" ?>
<placeable type="${type}">
    <!-- Generated by House to i3d. -->
    <storeData>
        <name>${esc(shopName(name))}</name>
        <functions>
${[].concat(fn).map(f => `            <function>${f}</function>`).join("\n")}
        </functions>
        <image>${dir}${MOD_FILES.store}</image>
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
        <filename>${dir}${MOD_FILES.i3d}</filename>
        <canBeRenamed>true</canBeRenamed>
    </base>
${blocks}</placeable>
`;
}

/**
 * modDesc.xml for a mod with several buildings: entries [{xml: "folder/house.xml"}] (each building in its own folder, with its
 * own i3d, textures and shop picture), the mod's title, description and author, and the icon's file name.
 */
export function modDescXmlMulti(entries, {title = "", description = "", author = "", icon = MOD_FILES.icon} = {}) {
  return `<?xml version="1.0" encoding="utf-8" standalone="no" ?>
<modDesc descVersion="${MOD_DESC_VERSION}">
    <author>${esc(String(author).trim() || "House to i3d")}</author>
    <version>1.0.0.0</version>
    <title>
        <en>${esc(shopName(title))}</en>
    </title>
    <description>
        <en>${cdata(description)}</en>
    </description>
    <iconFilename>${icon}</iconFilename>
    <multiplayer supported="true"/>
    <storeItems>
${entries.map(e => `        <storeItem xmlFilename="${esc(e.xml)}"/>`).join("\n")}
    </storeItems>
</modDesc>
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

/**
 * One step of the Windows and doors table: a cell counts the windows and doors of a wall's floor together. + adds a window (they are spread evenly, as before; turn
 * one into a door in its own card), - takes a window away, or, with only doors left, the wall's last door. The new list, or null where it is not allowed
 * (no more than 8 in a cell, and a building keeps one door).
 */
export function stepOpenings(P, list, wall, floor, d) {
  const here = list.filter(w => w.wall === wall && w.floor === floor), windows = here.filter(w => w.type !== "door").length, doors = here.length - windows;
  if (d > 0) return windows + doors >= 8 ? null : genRow(P, list, wall, floor, windows + 1);
  if (windows > 0) return genRow(P, list, wall, floor, windows - 1);
  return doors && floor === 0 ? removeDoor(list, wall) : null;
}
