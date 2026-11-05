// A farmhouse's furniture: the pieces its ground floor can have (see layout.mjs for what a catalog entry is),
// drawn with the kit in props.mjs in each piece's own frame (y up from the floor, -z the wall side of a wall
// piece), and a first arrangement for a new house. Pure; imports only the pure helpers.
import { roomOf, furnisher } from "../layout.mjs";
import { tone, shade } from "./props.mjs";

const C = {
  pine: "#B88B5A", oak: "#8A6440", paint: "#E8E2D2", green: "#5E7A62", blue: "#4E6A86", iron: "#2B2B2D", brass: "#B08A3E",
  steel: "#B9BDC0", worktop: "#6E5A44", linen: "#EFEBE2", wool: "#8E3B32", cushion: "#6B7F5A", spine: ["#7A2E2A", "#2F4A6B", "#3E5A3C", "#9A7A3A", "#5A4A6A"],
};
const wood = (c, hex, i = 0) => c.paint(tone(hex, i), "wood");

export const CATALOG = {
  kitchen: {name: "Kitchen counter (köksbänk)", mount: "wall", collision: true,
    params: [{k: "count", label: "Cupboards (60 cm each)", min: 2, max: 6, step: 1}], defaults: {count: 4},
    size: it => [it.count * 0.6, 0.62], height: () => 0.92,
    build(c, it) {
      const w = it.count * 0.6;
      c.paint(C.iron); c.box(-w / 2 + 0.02, w / 2 - 0.02, -0.31, 0.24, 0, 0.1);                 // the plinth, set back
      c.paint(C.paint, "wood"); c.box(-w / 2, w / 2, -0.31, 0.27, 0.1, 0.88);                    // the cupboards
      for (let i = 0; i < it.count; i++) {
        const x0 = -w / 2 + i * 0.6;
        c.paint(shade(C.paint, i % 2 ? -0.05 : 0.05), "wood"); c.box(x0 + 0.02, x0 + 0.58, 0.27, 0.29, 0.14, 0.84);
        c.paint(C.brass); c.box(x0 + 0.27, x0 + 0.33, 0.29, 0.3, 0.72, 0.74);
      }
      c.paint(C.worktop, "wood"); c.box(-w / 2, w / 2, -0.31, 0.31, 0.88, 0.92);                // the worktop
      if (it.count >= 3) {
        c.paint(C.steel, "steel"); c.box(-0.25, 0.25, -0.2, 0.15, 0.905, 0.921);                 // the sink and its tap
        c.rod([0, 0.92, -0.24], [0, 1.15, -0.24], 0.012); c.rod([0, 1.15, -0.24], [0, 1.12, -0.1], 0.01);
      }
    }},
  stove: {name: "Wood stove (vedspis)", mount: "wall", collision: true, params: [], defaults: {},
    size: () => [0.9, 0.62], height: () => 1.2,
    build(c) {
      c.paint(C.iron, "steel");
      for (const x of [-0.42, 0.38]) for (const z of [-0.28, 0.2]) c.box(x, x + 0.04, z, z + 0.04, 0, 0.12);   // legs
      c.box(-0.45, 0.45, -0.31, 0.25, 0.12, 0.8);                                                // the body
      c.paint(shade(C.iron, 0.4), "steel"); c.box(-0.45, 0.45, -0.31, 0.31, 0.8, 0.84);         // the hob
      c.cyl(-0.2, 0, 0.84, 0.11, 0.01); c.cyl(0.15, 0, 0.84, 0.09, 0.01);                       // its rings
      c.paint(C.iron, "steel"); c.box(-0.38, 0.02, 0.25, 0.27, 0.22, 0.66); c.box(0.08, 0.38, 0.25, 0.27, 0.42, 0.7);   // oven and firebox doors
      c.paint(C.brass); c.rod([-0.42, 0.76, 0.29], [0.42, 0.76, 0.29], 0.01);                   // the towel rail
      c.box(-0.22, -0.14, 0.27, 0.29, 0.44, 0.48); c.box(0.2, 0.26, 0.27, 0.29, 0.55, 0.58);    // handles
      c.paint(C.iron, "steel"); c.cyl(0.3, -0.2, 0.84, 0.07, 0.36);                             // the flue, up into the chimney
    }},
  table: {name: "Kitchen table", mount: "floor", collision: true, params: [], defaults: {},
    size: () => [1.6, 0.9], height: () => 0.78,
    build(c) {
      for (const [x, z] of [[-0.74, -0.39], [0.68, -0.39], [-0.74, 0.33], [0.68, 0.33]]) { wood(c, C.pine, 1); c.box(x, x + 0.06, z, z + 0.06, 0, 0.72); }
      wood(c, C.pine, 2); c.box(-0.72, 0.72, -0.38, -0.36, 0.6, 0.72); c.box(-0.72, 0.72, 0.36, 0.38, 0.6, 0.72);
      c.box(-0.74, -0.72, -0.36, 0.36, 0.6, 0.72); c.box(0.72, 0.74, -0.36, 0.36, 0.6, 0.72);
      wood(c, C.pine, 0); c.box(-0.8, 0.8, -0.45, 0.45, 0.72, 0.76);                             // the top
      c.paint(C.linen); c.box(-0.55, 0.55, -0.15, 0.15, 0.76, 0.762);                            // a runner
      c.paint(C.blue); c.cyl(0.1, 0, 0.762, 0.06, 0.018);                                        // a jug
      c.paint(C.brass); c.cyl(-0.3, 0, 0.762, 0.03, 0.12);                                       // a candlestick
    }},
  chair: {name: "Chair", mount: "floor", collision: true, params: [], defaults: {},
    size: () => [0.46, 0.48], height: () => 0.96,
    build(c) {
      wood(c, C.pine, 1);
      for (const x of [-0.21, 0.17]) for (const z of [-0.22, 0.18]) c.box(x, x + 0.04, z, z + 0.04, 0, 0.44);   // legs
      for (const z of [-0.2, 0.2]) c.box(-0.19, 0.19, z - 0.01, z + 0.01, 0.16, 0.19);           // rungs
      wood(c, C.pine, 0); c.box(-0.23, 0.23, -0.24, 0.24, 0.44, 0.48);                           // the seat
      wood(c, C.pine, 2); for (const x of [-0.21, 0.17]) c.box(x, x + 0.04, -0.24, -0.2, 0.48, 0.96);   // back posts
      for (const y of [0.62, 0.76, 0.9]) c.box(-0.17, 0.17, -0.235, -0.21, y, y + 0.05);          // slats
      c.paint(C.cushion); c.box(-0.2, 0.2, -0.18, 0.21, 0.48, 0.51);                              // a cushion
    }},
  bed: {name: "Bed", mount: "wall", collision: true, params: [], defaults: {},
    size: () => [1.45, 2.05], height: () => 1.05,
    build(c) {
      wood(c, C.paint, 0); c.box(-0.725, 0.725, -1.025, -0.98, 0, 1.05);                         // headboard
      c.box(-0.725, 0.725, 0.98, 1.025, 0, 0.6);                                                  // foot board
      wood(c, C.paint, 1); for (const x of [-0.725, 0.685]) c.box(x, x + 0.04, -0.98, 0.98, 0.18, 0.36);   // sides
      for (const x of [-0.72, 0.68]) for (const z of [-0.97, 0.93]) c.box(x, x + 0.04, z, z + 0.04, 0, 0.18);   // legs
      c.paint(C.linen); c.box(-0.68, 0.68, -0.97, 0.97, 0.36, 0.52);                              // mattress
      for (const x of [-0.6, 0.06]) c.box(x, x + 0.54, -0.95, -0.6, 0.52, 0.62);                  // pillows
      c.paint(C.wool); c.box(-0.7, 0.7, -0.45, 0.97, 0.52, 0.58);                                 // the blanket
      c.paint(shade(C.wool, 0.3)); c.box(-0.7, 0.7, -0.55, -0.45, 0.52, 0.6);                    // turned down
    }},
  sofa: {name: "Sofa (soffa)", mount: "wall", collision: true, params: [], defaults: {},
    size: () => [2.0, 0.9], height: () => 0.86,
    build(c) {
      wood(c, C.oak, 0); for (const x of [-0.95, 0.91]) for (const z of [-0.4, 0.36]) c.box(x, x + 0.04, z, z + 0.04, 0, 0.12);   // legs
      c.paint(C.green); c.box(-1, 1, -0.45, 0.45, 0.12, 0.38);                                    // the base
      c.box(-1, 1, -0.45, -0.25, 0.38, 0.86);                                                     // the back
      for (const x of [-1, 0.85]) c.box(x, x + 0.15, -0.45, 0.45, 0.38, 0.62);                    // arms
      for (let i = 0; i < 3; i++) {
        const x0 = -0.85 + i * 0.57;
        c.paint(tone(C.green, i)); c.box(x0 + 0.01, x0 + 0.56, -0.25, 0.43, 0.38, 0.5);          // seat cushions
        c.paint(shade(C.green, 0.2)); c.box(x0 + 0.02, x0 + 0.55, -0.25, -0.12, 0.5, 0.8);        // back cushions
      }
    }},
  wardrobe: {name: "Wardrobe (klädskåp)", mount: "wall", collision: true, params: [], defaults: {},
    size: () => [1.2, 0.6], height: () => 2.05,
    build(c) {
      c.paint(C.blue, "wood"); c.box(-0.6, 0.6, -0.3, 0.26, 0.08, 1.95);                          // the body
      c.paint(shade(C.blue, -0.3), "wood"); c.box(-0.58, 0.58, -0.28, 0.24, 0, 0.08);             // plinth
      c.paint(shade(C.blue, 0.2), "wood"); c.box(-0.6, 0.6, -0.3, 0.3, 1.95, 2.0); c.box(-0.56, 0.56, -0.28, 0.28, 2.0, 2.05);   // cornice
      for (const s of [-1, 1]) {
        const x0 = s < 0 ? -0.58 : 0.005, x1 = s < 0 ? -0.005 : 0.58;
        c.paint(tone(C.blue, s < 0 ? 0 : 2), "wood"); c.box(x0, x1, 0.26, 0.28, 0.12, 1.9);      // doors
        c.paint(shade(C.blue, 0.35), "wood"); c.box(x0 + 0.07, x1 - 0.07, 0.28, 0.29, 1.05, 1.8); c.box(x0 + 0.07, x1 - 0.07, 0.28, 0.29, 0.22, 0.95);   // panels
        c.paint(C.brass); c.box(s < 0 ? -0.06 : 0.03, s < 0 ? -0.03 : 0.06, 0.28, 0.3, 0.95, 1.05);   // handles
      }
    }},
  bookshelf: {name: "Bookshelf", mount: "wall", collision: true, params: [], defaults: {},
    size: () => [1.0, 0.35], height: () => 1.9,
    build(c) {
      wood(c, C.oak, 0); c.box(-0.5, -0.47, -0.175, 0.175, 0, 1.9); c.box(0.47, 0.5, -0.175, 0.175, 0, 1.9);   // sides
      wood(c, C.oak, 1); c.box(-0.47, 0.47, -0.175, -0.165, 0, 1.9);                              // back
      const shelves = [0.05, 0.45, 0.85, 1.25, 1.65, 1.87];
      wood(c, C.oak, 2); for (const y of shelves) c.box(-0.47, 0.47, -0.165, 0.175, y, y + 0.025);
      for (let s = 0; s < 4; s++) {
        let x = -0.45;
        for (let k = 0; k < 4; k++) {
          const t = 0.06 + ((s + k) % 3) * 0.02, h = 0.24 + ((s * 3 + k) % 4) * 0.025;
          c.paint(C.spine[(s + k) % C.spine.length]); c.box(x, x + t, -0.15, 0.12, shelves[s] + 0.025, shelves[s] + 0.025 + h);
          x += t + 0.12;
        }
      }
    }},
  rug: {name: "Rag rug (trasmatta)", mount: "floor", collision: false, params: [], defaults: {},
    size: () => [2.0, 0.8], height: () => 0.012,
    build(c) {
      const stripes = ["#8E3B32", "#D9CFB8", "#4E6A86", "#D9CFB8", "#5E7A62", "#D9CFB8"];
      for (let i = 0; i < 12; i++) { const x0 = -0.95 + i * 1.9 / 12; c.paint(stripes[i % stripes.length]); c.box(x0, x0 + 1.9 / 12, -0.4, 0.4, 0, 0.01); }
      c.paint("#E8E0CC"); c.box(-1, -0.95, -0.38, 0.38, 0, 0.008); c.box(0.95, 1, -0.38, 0.38, 0, 0.008);   // fringes
    }},
};

/**
 * A first arrangement for a farmhouse's ground floor: a kitchen with a wood stove, a table with four
 * chairs in the middle, a sofa, a wardrobe and a bookshelf along the walls, and a bed if there's room.
 */
export function autoFurnish(p) {
  const room = roomOf(p), f = furnisher(room, CATALOG), area = (room.x1 - room.x0) * (room.z1 - room.z0);
  const wallFor = (type, need) => { const s = f.longest(room.walls, CATALOG[type].size({count: 4})[1]); return s && s.len >= need ? s : null; };
  let s = wallFor("kitchen", 1.4);
  if (s) f.onWall(s, "kitchen", {count: Math.max(2, Math.min(5, Math.floor((s.len - 1.2) / 0.6)))});
  if ((s = wallFor("stove", 1.0))) f.onWall(s, "stove", {});
  if ((s = wallFor("sofa", 2.1))) f.onWall(s, "sofa", {});
  if (area > 30 && (s = wallFor("bed", 1.55))) f.onWall(s, "bed", {});
  // the tall pieces only where there's no window: the ground floor's windows kept clear too
  const windows = (p.windows || []).filter(w => w.type !== "door" && w.floor === 0 && ["front", "back", "left", "right"].includes(w.wall))
    .map(w => { const L = w.wall === "front" || w.wall === "back" ? p.width : p.depth, c = w.pos * L; return {wall: w.wall, s0: c - w.w / 2, s1: c + w.w / 2, clear: 0.7, what: "a window"}; });
  const g = furnisher(roomOf(p, windows), CATALOG);
  for (const it of f.items) g.add(it.type, it.x, it.z, it.rot, Object.fromEntries(CATALOG[it.type].params.map(q => [q.k, it[q.k]])));
  const tall = (type, need) => { const w = g.longest(roomOf(p, windows).walls, CATALOG[type].size({})[1]); if (w && w.len >= need) g.onWall(w, type, {}); };
  tall("wardrobe", 1.3); tall("bookshelf", 1.1);
  const t = g.onFloor("table");
  if (t) for (const [dx, dz, rot] of [[-0.45, 0.72, 180], [0.45, 0.72, 180], [-0.45, -0.72, 0], [0.45, -0.72, 0]]) g.add("chair", t.x + dx, t.z + dz, rot);
  return {items: g.items};
}
