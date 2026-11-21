// Variety for buildings made from OSM footprints (osm.mjs): without it every generated house has the app's standard door, windows and
// colours. Pure: no DOM, no model.mjs. The choices come from a seed (the OSM id, else the footprint), so the same building looks the
// same every time it is generated; what the tags already said is never touched.
//
// variety({seed, kind, width, depth, floors, roofType, wingWalls, have}) -> {settings, notes}: settings only for keys not in `have`.

// ---- a seeded random number generator ----
function hash(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}
function rng(seed) {
  let a = hash(String(seed));
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** A seed from the footprint, for a building without an id: the same whatever the direction or first point of the outline. */
export const seedOf = footprint => "fp:" + (Array.isArray(footprint) ? [...new Set(footprint.map(p => Array.isArray(p) ? `${(+p[0]).toFixed(2)},${(+p[1]).toFixed(2)}` : ""))].sort().join(";") : "");

// ---- the palettes: Swedish houses ----
// [wall, trim options]: the trim is mostly white, sometimes the cream or a darker shade of the wall
const WALLS = [
  ["#8E2A1E", 30], ["#7A2A20", 8], ["#A33B2A", 6],          // falu red
  ["#D9B44A", 10], ["#C9A24A", 5],                           // ochre
  ["#F2EFE8", 12], ["#EADFC0", 7], ["#D8C7A3", 6],          // white, cream, beige
  ["#8A8D8F", 5], ["#B8BBBC", 4],                            // greys
  ["#4F6B45", 3], ["#7C8F6B", 3], ["#3F5F82", 3], ["#6F8CA6", 3], // green, blue
  ["#6B4A32", 4], ["#2B2D2F", 2],                            // brown, tarred black
];
const SHED_WALLS = [["#8E2A1E", 30], ["#7A2A20", 8], ["#6B4A32", 10], ["#2B2D2F", 8], ["#8A8D8F", 12], ["#F2EFE8", 8], ["#D9B44A", 4], ["#4F6B45", 6], ["#3F5F82", 4]];
const TRIMS = [["#F2EFE8", 62], ["#EADFC0", 16], ["#D8D4C8", 10], ["#2B2D2F", 6], ["#6B4A32", 6]];
const DOORS = [["#3E5A4A", 14], ["#8E2A1E", 12], ["#4A3322", 12], ["#2F4A6B", 11], ["#2B2D2F", 9], ["#F2EFE8", 9], ["#C9A24A", 6], ["#8B5E3C", 10], ["#5A1E18", 6], ["#6F7B82", 6], ["#4F6B45", 5]];
const ROOFS_TILES = [["#2B2D2F", 40], ["#44484B", 14], ["#8A3B2C", 30], ["#5B4636", 10], ["#6E2F25", 6]];
const ROOFS_METAL = [["#2B2D2F", 35], ["#44484B", 18], ["#8E2A1E", 20], ["#3F5A48", 8], ["#8A8D8F", 14], ["#5B4636", 5]];
const FOUNDATIONS = [["#6E6E6A", 50], ["#8A8D8F", 20], ["#5A5A57", 15], ["#9A8E7E", 15]];

export function variety({ seed, kind = "house", width = 10, depth = 7, floors = 1, roofType = "gable", wingWalls = [], have = {} } = {}) {
  const r = rng(seed), out = {};
  const house = kind === "house";
  const weighted = list => { let t = list.reduce((s, [, w]) => s + w, 0) * r(); for (const [v, w] of list) if ((t -= w) < 0) return v; return list[list.length - 1][0]; };
  const pick = list => list[Math.floor(r() * list.length) % list.length];
  const between = (lo, hi, step = 1) => +(lo + Math.round(r() * (hi - lo) / step) * step).toFixed(3);
  const chance = p => r() < p;
  const want = k => !(k in have);
  const set = (k, v) => { if (want(k)) out[k] = v; };
  const get = k => k in have ? have[k] : out[k];

  // ---- walls, roof and their colours ----
  set("wallCladding", house ? weighted([["lockpanel", 34], ["horizontal", 30], ["plaster", 22], ["vertical", 14]]) : weighted([["lockpanel", 30], ["vertical", 30], ["horizontal", 20], ["corrugated", 20]]));
  set("wallColor", weighted(house ? WALLS : SHED_WALLS));
  const wallColor = String(get("wallColor")).toUpperCase();
  set("trimColor", wallColor === "#F2EFE8" || wallColor === "#EADFC0" ? weighted([["#F2EFE8", 60], ["#6B4A32", 20], ["#2B2D2F", 20]]) : weighted(TRIMS));
  set("roofMaterial", house ? weighted([["tiles", 62], ["seamed", 28], ["corrugated", 10]]) : weighted([["corrugated", 40], ["seamed", 30], ["tiles", 30]]));
  set("roofColor", weighted(get("roofMaterial") === "tiles" ? ROOFS_TILES : ROOFS_METAL));
  set("foundationColor", weighted(FOUNDATIONS));
  if (roofType !== "flat") {
    set("roofPitch", between(house ? 28 : 18, house ? 45 : 32));
    set("overhang", between(0.3, 0.7, 0.05));
  }
  if (house && roofType !== "flat") set("chimney", chance(0.6));
  if (!house) set("chimney", false);

  // ---- windows ----
  set("winStyle", house ? weighted([["casement", 45], ["sprojs", 35], ["single", 20]]) : weighted([["single", 45], ["stall", 30], ["casement", 25]]));
  set("winW", house ? pick([0.8, 0.9, 1.0, 1.0, 1.1, 1.2, 1.4]) : pick([0.7, 0.9, 1.0, 1.2]));
  set("winH", house ? pick([1.1, 1.25, 1.25, 1.4, 1.5]) : pick([0.6, 0.8, 1.0, 1.25]));
  set("sill", house ? pick([0.8, 0.85, 0.9, 1.0]) : pick([1.0, 1.2, 1.5]));
  // the number on a wall follows its length (one window every 2.4-4 m), the gable ends and the back often have fewer
  const per = (len, lo, hi, quiet) => Math.max(0, Math.min(8, Math.round(len / between(lo, hi, 0.1)) - (chance(quiet) ? 1 : 0)));
  if (house) {
    set("winFront", Math.max(1, per(width, 2.4, 4, 0.25)));
    set("winBack", chance(0.12) ? 0 : per(width, 2.6, 4.5, 0.35));
    set("winLeft", chance(0.25) ? 0 : per(depth, 2.8, 5, 0.3));
    set("winRight", chance(0.25) ? 0 : per(depth, 2.8, 5, 0.3));
  } else {
    const few = len => Math.min(3, per(len, 3.5, 7, 0.4));
    set("winFront", chance(0.3) ? 0 : few(width));
    set("winBack", chance(0.5) ? 0 : few(width));
    set("winLeft", chance(0.6) ? 0 : few(depth));
    set("winRight", chance(0.6) ? 0 : few(depth));
  }

  // ---- the door: its colour, style, size, wall and place, and what stands over it ----
  if (house) {
    set("doorStyle", weighted([["panel", 32], ["plank", 22], ["plain", 14], ["zbrace", 8], ["xbrace", 4]]));
    set("doorW", pick([0.9, 1.0, 1.0, 1.1, 1.2]));
    set("doorH", pick([2.0, 2.1, 2.1, 2.2]));
  } else {
    const big = width * depth >= 60;
    set("doorStyle", big ? weighted([["sheetslide", 35], ["sliding", 30], ["xbrace", 15], ["zbrace", 10], ["plank", 10]]) : weighted([["plank", 35], ["zbrace", 22], ["plain", 15], ["sliding", 15], ["sheetslide", 13]]));
    set("doorW", big ? between(2.0, 2.5, 0.1) : between(1.0, 2.4, 0.2));
    set("doorH", big ? between(2.3, 2.6, 0.1) : between(1.9, 2.3, 0.1));
  }
  let door = weighted(house ? DOORS : [["#3B3F42", 20], ["#8E2A1E", 15], ["#4A3322", 15], ["#F2EFE8", 12], ["#3E5A4A", 12], ["#2F4A6B", 10], ["#8B5E3C", 16]]);
  for (let i = 0; i < 6 && door.toUpperCase() === wallColor; i++) door = weighted(DOORS);
  set("doorColor", door);

  // the front by preference; never a wall a part stands against (it would cover the door), and with parts on the sides the door
  // goes on the front or back, away from them
  const free = ["front", "back", "left", "right"].filter(w => !wingWalls.includes(w));
  let wall = "front";
  if (!wingWalls.length) wall = house ? weighted([["front", 74], ["back", 6], ["left", 10], ["right", 10]]) : weighted([["front", 70], ["left", 15], ["right", 15]]);
  else if (free.includes("front")) wall = "front";
  else if (free.includes("back")) wall = "back";
  else if (free.length) wall = free[0];
  if (want("doorWall") && want("doorPos")) {
    out.doorWall = wall;
    // the middle of the wall, or to one side; seen from outside the front's right end is east and the back's right end west
    let pos = chance(0.35) ? 0 : (chance(0.5) ? -1 : 1) * between(0.3, 0.75, 0.05);
    if (wall === "front" || wall === "back") {
      const west = wingWalls.includes("left"), east = wingWalls.includes("right"), sign = wall === "front" ? 1 : -1;
      if (west && !east) pos = sign * Math.abs(pos || 0.4);
      else if (east && !west) pos = -sign * Math.abs(pos || 0.4);
      else if (west && east) pos = 0;
    }
    out.doorPos = pos;
    if (house) out.entrance = weighted([["porch", 28], ["gable", 26], ["shed", 16], ["none", 30]]);
    else out.entrance = "none";
  }
  return { settings: out, notes: ["Door, windows and colours are picked from the building's id where the tags are silent: change them in the editor."] };
}
