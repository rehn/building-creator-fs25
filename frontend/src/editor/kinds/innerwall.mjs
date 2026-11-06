// An inner wall (innervägg): a partition the player puts in the room, with wallpaper (tapet) or paint on each side,
// skirting boards and a cornice, and, if wanted, a doorway with casings. A catalog entry for every walk-in kind
// (see layout.mjs); drawn with the kit in props.mjs in its own frame: x along the wall, z across it, y up.
import { tone } from "./props.mjs";
import { DOOR_STYLES, INNER_DOOR_STYLES } from "../openings.mjs";

/** What a side can be: [name, colour, surface]. The surfaces are in surfaces.mjs. */
export const WALLPAPERS = [
  ["Limewash (kalkfärg)", "#EDE8DC", "whitewash"],
  ["Plain cream wallpaper", "#EAD9B0", "paperPlain"],
  ["Blue striped wallpaper", "#8FA6B8", "paperStripe"],
  ["Green striped wallpaper", "#9DB28A", "paperStripe"],
  ["Yellow flower wallpaper", "#E6CF82", "paperFlower"],
  ["Rose flower wallpaper", "#D9A5A0", "paperFlower"],
  ["Red striped wallpaper (rödrandig)", "#C0766B", "paperStripe"],
  ["Green painted boards", "#7F9C8A", "wood"],
];
const CORE = "#D8D2C4", TRIM = "#F2EFE8", CORE_T = 0.045, SHEET = 0.005, DOOR_W = 0.9, DOOR_H = 2.05, CASING = 0.07;
const options = WALLPAPERS.map(w => w[0]);
/** The doors an inner wall can have: the building's own style, the models for rooms, or one of the outer swinging styles (not the sliding barn door). */
const DOOR_LOOKS = [...INNER_DOOR_STYLES, ...DOOR_STYLES.filter(s => s.id !== "sliding" && s.id !== "hole")];

/** The doorway [x0, x1] of a wall, or null: where it is along the wall (doorAt 0..1), when the wall has room for one. */
export function doorwayOf(it) {
  if (!it.door || it.length < DOOR_W + 0.5) return null;
  const room = it.length - DOOR_W - 0.24, x0 = -it.length / 2 + 0.12 + Math.max(0, Math.min(1, it.doorAt)) * room;
  return [x0, x0 + DOOR_W];
}
/** The solid stretches along the wall [x0, x1, y0, y1]: the whole wall, or both sides of a doorway and the part over it. */
function stretches(it, hh) {
  const L = it.length, d = doorwayOf(it);
  return d ? [[-L / 2, d[0], 0, hh], [d[1], L / 2, 0, hh], [d[0], d[1], Math.min(DOOR_H, hh - 0.1), hh]] : [[-L / 2, L / 2, 0, hh]];
}

export const INNER_WALL = {
  name: "Inner wall (innervägg)", mount: "floor", collision: true,
  // its ends are drawn to the room's walls when it is put near them (layout.mjs snapItem)
  snapWalls: true,
  params: [
    {k: "length", label: "Length", min: 1, max: 20, step: 0.01, unit: " m"},
    {k: "door", label: "Doorway", min: 0, max: 3, step: 1, options: ["No doorway", "Open doorway", "Door that opens", "Door that stays shut"]},
    // (kept as 0..1 in a save; the editor shows it as metres: the doorway's middle from the wall's left end in the plan (the back end of one turned along z))
    {k: "doorAt", label: "Doorway, middle (m from the left or back end)", min: 0, max: 1, step: 0.005, when: it => it.door >= 1,
      metres: it => [0.12 + DOOR_W / 2, Math.max(0, it.length - DOOR_W - 0.24)]},
    {k: "hinge", label: "Hinges", min: 0, max: 1, step: 1, options: ["On the left (seen from one side)", "On the right (seen from one side)"], when: it => it.door >= 2},
    {k: "look", label: "Door", min: 0, max: DOOR_LOOKS.length, step: 1, options: ["Like the building's doors", ...DOOR_LOOKS.map(s => s.name)], when: it => it.door >= 2},
    {k: "swing", label: "Opens towards", min: 0, max: 1, step: 1, options: ["One side", "The other side"], when: it => it.door >= 2},
    {k: "paperA", label: "One side", min: 0, max: WALLPAPERS.length - 1, step: 1, options},
    {k: "paperB", label: "Other side", min: 0, max: WALLPAPERS.length - 1, step: 1, options}],
  defaults: {length: 3, door: 1, doorAt: 0.5, hinge: 0, swing: 1, look: 0, paperA: 2, paperB: 4},
  size: it => [it.length, 0.15], height: () => 2.6,
  /** The stretches along the wall [x0, x1] that things can stand against: all of it, or each side of the doorway. */
  runs: it => { const d = doorwayOf(it); return d ? [[-it.length / 2, d[0]], [d[1], it.length / 2]] : [[-it.length / 2, it.length / 2]]; },
  /** Collision boxes in the piece's frame [x0, x1, z0, z1, y0, y1], up to ceiling height; the doorway is open. */
  solids: (it, {ceil = 2.6} = {}) => (Math.round(it.door) === 3 ? [[-it.length / 2, it.length / 2, 0, ceil]] : stretches(it, ceil)).map(([x0, x1, y0, y1]) => [x0, x1, -CORE_T - SHEET, CORE_T + SHEET, y0, y1]),
  /**
   * The door in the doorway, when it has one (door 2: opens, 3: stays shut): where it is along the wall [s0, s1], how high, the end
   * it is hinged at ("s0" | "s1" of the wall's own x), the side it swings towards (+1: the wall's +z, -1: -z) and whether it opens.
   * "One side" is the -z side (paperA); seen from there the wall's +x end is on the left.
   */
  leafOf(it) {
    const d = doorwayOf(it), kind = Math.round(it.door);
    if (!d || kind < 2) return null;
    return {s0: d[0], s1: d[1], h: DOOR_H, hingeAt: Math.round(it.hinge) === 0 ? "s1" : "s0", swing: Math.round(it.swing) === 0 ? -1 : 1, opens: kind === 2,
      // the door's style: one of DOOR_LOOKS, or null for the building's own
      style: Math.round(it.look) > 0 ? DOOR_LOOKS[Math.min(DOOR_LOOKS.length, Math.round(it.look)) - 1].id : null};
  },
  build(c, it) {
    const hh = c.ceil ?? c.H, d = doorwayOf(it), L = it.length, T = CORE_T;
    // the wall itself: limewashed core, a sheet on each side (the wallpaper), skirting and cornice on both
    c.paint(CORE, "whitewash");
    for (const [x0, x1, y0, y1] of stretches(it, hh)) c.box(x0, x1, -T, T, y0, y1);
    [[it.paperA, -1], [it.paperB, 1]].forEach(([i, side], k) => {
      const [, color, surf] = WALLPAPERS[Math.max(0, Math.min(WALLPAPERS.length - 1, Math.round(i)))];
      c.paint(color, surf);
      const z0 = side < 0 ? -T - SHEET : T, z1 = side < 0 ? -T : T + SHEET;
      for (const [x0, x1, y0, y1] of stretches(it, hh)) c.box(x0, x1, z0, z1, y0 + (y0 === 0 ? 0.1 : 0), y1 - (y1 === hh ? 0.04 : 0));
      // skirting boards (taking in the doorway's sides) and the cornice at the top, painted white, on this side
      const out = side < 0 ? [-T - SHEET - 0.012, -T - SHEET] : [T + SHEET, T + SHEET + 0.012];
      c.paint(tone(TRIM, k), "wood");
      const runs = d ? [[-L / 2, d[0]], [d[1], L / 2]] : [[-L / 2, L / 2]];
      for (const [x0, x1] of runs) { c.box(x0, x1, out[0], out[1], 0, 0.1); c.box(x0, x1, out[0], out[1], hh - 0.04, hh); }
      if (d) {
        // casings: a board down each side of the doorway and one across the top, on this side
        const o2 = side < 0 ? [-T - SHEET - 0.014, -T - SHEET] : [T + SHEET, T + SHEET + 0.014];
        c.box(d[0] - CASING + 0.02, d[0] + 0.02, o2[0], o2[1], 0, DOOR_H + 0.05);
        c.box(d[1] - 0.02, d[1] + CASING - 0.02, o2[0], o2[1], 0, DOOR_H + 0.05);
        c.box(d[0] - CASING + 0.02, d[1] + CASING - 0.02, o2[0], o2[1], DOOR_H + 0.05, DOOR_H + 0.05 + CASING);
      }
    });
  },
};
