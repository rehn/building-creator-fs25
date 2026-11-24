// The hens of a mod walking INSIDE one of its buildings (docs/PLAN_MOD.md; asked for by Lars after he saw hens walk inside the game's own big hen barn). The game's hen barns (data/placeables/rudolfHormann/
// chickenBarnBig, brandless/animalHusbandries/chickenBarnSmall) have a navigation shape: the walking mesh of the floor inside, and the area outside is the fence minus that shape. The cow barn here builds the
// same (kinds/cow.mjs animalsInside, walkarea.mjs animalNav); this module builds it for one building of a mod: the floor of the building as the mod stands it (put, lifted and turned), a ramp through each open
// framed doorway (door style "hole", ground floor) that faces the fence, and the walls as blockers with a gap at each doorway. Pure; imports only the layout and walk helpers. Not tried in the game.
import { wallsOf, roomOf, openingSpan, WALL_T } from "../layout.mjs";
import { animalNav, KEEP } from "../walkarea.mjs";
import { insidePoly } from "../objects.mjs";
import { wallSlabs } from "./cow.mjs";

/** The doorways the animals can use in a building (its sanitized settings): ground floor doors that are an open framed doorway (door style "hole"), as {wall, s0, s1} along the wall. */
export function entrancesOf(q) {
  const frames = wallsOf(q), out = [];
  for (const d of q.windows || []) {
    if (d.type !== "door" || d.floor !== 0 || !frames[d.wall]) continue;
    if ((d.style && d.style !== "default" ? d.style : q.doorStyle) !== "hole") continue;
    const [s0, s1] = openingSpan(d, frames[d.wall].L);
    out.push({wall: d.wall, s0, s1});
  }
  return out;
}

/**
 * The walking area of the animals when they can go inside the building q (sanitized settings) as it stands in the mod: place {x, z, y, rot (degrees, as three.js turns)}, the fence's contour
 * (the posts and the way back along the buildings, [[x, y, z] ...], in the mod's coordinates), the blockers of the buildings ([{center, size, keep}], as animalNav takes them).
 * -> {nav, entrances} (nav as animalNav gives it, with nav.blockers: the walls as boxes), or {nav: null, reason}: "turned" (only quarter turns are made), "no-door", "no-entrance-faces-fence", "no-fence".
 */
export function insideNav({settings: q, place, contour, blockers}) {
  const {x = 0, z = 0, y = 0, rot = 0} = place;
  const quarter = Math.abs(((rot % 90) + 90) % 90) < 1e-6 || Math.abs(((rot % 90) + 90) % 90 - 90) < 1e-6;
  if (!quarter) return {nav: null, reason: "turned"};
  const all = entrancesOf(q);
  if (!all.length) return {nav: null, reason: "no-door"};
  // the turn, as the view and the export do it (three.js: x' = x cos + z sin, z' = -x sin + z cos), then the place
  const a = rot * Math.PI / 180, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
  const pt = ([px, pz]) => [px * c + pz * s + x, -px * s + pz * c + z];
  const rectW = r => { const u = pt([r.x0, r.z0]), v = pt([r.x1, r.z1]); return {x0: Math.min(u[0], v[0]), x1: Math.max(u[0], v[0]), z0: Math.min(u[1], v[1]), z1: Math.max(u[1], v[1])}; };
  const boxW = b => { const m = pt([b.center[0], b.center[2]]), swap = Math.abs(s) === 1; return {...b, center: [m[0], b.center[1], m[1]], size: swap ? [b.size[2], b.size[1], b.size[0]] : b.size}; };
  const frames = wallsOf(q), F = q.foundation || 0, run = Math.max(F > 0.02 ? Math.max(0.8, F * 5) : 0.6, KEEP.wall + 0.4);
  const kept = [];
  for (const e of all) {
    const w = frames[e.wall], at = (sv, d) => [w.o[0] + w.u[0] * sv + w.n[0] * d, w.o[2] + w.u[2] * sv + w.n[2] * d];
    const out = pt(at((e.s0 + e.s1) / 2, run + 0.5));
    if (!insidePoly(contour, out[0], out[1])) continue;   // (a doorway the fence does not reach: the animals cannot get to it)
    kept.push({e, door: {a: pt(at(e.s0, run)), b: pt(at(e.s1, run)), c: pt(at(e.s1, -WALL_T)), d: pt(at(e.s0, -WALL_T))}});
  }
  if (!kept.length) return {nav: null, reason: "no-entrance-faces-fence"};
  const rooms = roomOf(q, []).floorRects.map(rectW);
  const floorY = (F < 0.03 ? F + 0.03 : F + 0.004) + y;   // (the top of the floor: see FLOOR_LIFT in model.mjs)
  const nav = animalNav({fence: contour, blockers, rooms, items: [], doors: kept.map(k => k.door), floorY});
  if (!nav) return {nav: null, reason: "no-fence"};
  nav.blockers = wallSlabs(q, kept.map(k => k.e), []).map(boxW);
  return {nav, entrances: kept.length};
}
