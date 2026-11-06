// A farmhouse's furniture: the pieces its ground floor can have (see layout.mjs for what a catalog entry is),
// drawn with the kit in props.mjs in each piece's own frame (y up from the floor, -z the wall side of a wall
// piece), and a first arrangement for a new house. Pure; imports only the pure helpers.
import { roomOf, furnisher } from "../layout.mjs";
import { tone, shade } from "./props.mjs";
import { INNER_WALL } from "./innerwall.mjs";

const C = {
  pine: "#B88B5A", oak: "#8A6440", paint: "#E8E2D2", green: "#5E7A62", blue: "#4E6A86", iron: "#2B2B2D", brass: "#B08A3E",
  steel: "#B9BDC0", worktop: "#6E5A44", linen: "#EFEBE2", wool: "#8E3B32", cushion: "#6B7F5A", spine: ["#7A2E2A", "#2F4A6B", "#3E5A3C", "#9A7A3A", "#5A4A6A"],
};
const wood = (c, hex, i = 0) => c.paint(tone(hex, i), "wood");

export const CATALOG = {
  innerwall: INNER_WALL,
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
  singlebed: {name: "Single bed (enkelsäng)", mount: "wall", collision: true, params: [], defaults: {},
    size: () => [0.9, 2.0], height: () => 0.95,
    build(c) {
      wood(c, C.pine, 0); c.box(-0.45, 0.45, -1.0, -0.96, 0.1, 0.95);                              // headboard
      c.box(-0.45, 0.45, 0.96, 1.0, 0.1, 0.5);                                                      // foot board
      wood(c, C.pine, 1); for (const x of [-0.45, 0.41]) c.box(x, x + 0.04, -0.96, 0.96, 0.18, 0.32);  // side rails
      for (const x of [-0.45, 0.41]) for (const z of [-1.0, 0.96]) c.box(x, x + 0.04, z, z + 0.04, 0, 0.18);   // legs
      c.paint(C.linen); c.box(-0.41, 0.41, -0.96, 0.96, 0.32, 0.48);                                // mattress
      c.box(-0.32, 0.32, -0.93, -0.55, 0.48, 0.58);                                                 // pillow
      c.paint(C.blue); c.box(-0.42, 0.42, -0.4, 0.96, 0.48, 0.55);                                  // the quilt
      c.paint(shade(C.blue, 0.3)); c.box(-0.42, 0.42, -0.5, -0.4, 0.48, 0.56);                      // turned down
    }},
  bookcase: {name: "Bookcase (bokhylla, Billy style)", mount: "wall", collision: true,
    params: [{k: "count", label: "Sections (80 cm each)", min: 1, max: 4, step: 1}], defaults: {count: 2},
    size: it => [it.count * 0.8, 0.28], height: () => 2.02,
    build(c, it) {
      const w = it.count * 0.8, shelves = [0.03, 0.42, 0.78, 1.14, 1.5, 1.86], white = "#E9E6DD";
      c.paint(shade(white, -0.5), "wood"); c.box(-w / 2, w / 2, -0.14, -0.125, 0, 2.02);            // the back
      c.paint(white, "wood");
      for (let i = 0; i <= it.count; i++) { const x = -w / 2 + i * 0.8; c.box(Math.max(-w / 2, x - 0.012), Math.min(w / 2, x + 0.012), -0.125, 0.14, 0, 2.02); }   // uprights
      c.box(-w / 2, w / 2, -0.125, 0.14, 2.0, 2.02);                                                // the top
      for (const y of shelves) c.box(-w / 2 + 0.012, w / 2 - 0.012, -0.12, 0.13, y, y + 0.02);        // shelves
      // books and a few things, section by section
      for (let sec = 0; sec < it.count; sec++) for (let sh = 0; sh < 5; sh++) {
        if ((sec + sh) % 4 === 3) continue;
        let x = -w / 2 + sec * 0.8 + 0.04;
        const end = -w / 2 + (sec + 1) * 0.8 - 0.05 - ((sec * 3 + sh) % 4) * 0.12;
        for (let k = 0; x < end; k++) {
          const t = 0.03 + ((sec + sh + k) % 3) * 0.012, h = 0.2 + ((sec * 5 + sh * 3 + k) % 4) * 0.03;
          c.paint(C.spine[(sec + sh + k) % C.spine.length]); c.box(x, Math.min(x + t, end), -0.1, 0.1, shelves[sh] + 0.02, shelves[sh] + 0.02 + h);
          x += t + 0.004;
        }
      }
    }},
  tvbench: {name: "TV on a TV bench (tv-bänk)", mount: "wall", collision: true,
    params: [{k: "width", label: "Bench width", min: 1.2, max: 2.2, step: 0.1, unit: " m"}], defaults: {width: 1.6},
    size: it => [it.width, 0.46], height: () => 1.3,
    build(c, it) {
      const w = it.width, tv = Math.min(1.2, w * 0.78), th = tv * 0.5625;
      wood(c, C.oak, 0); c.box(-w / 2, w / 2, -0.21, 0.21, 0.41, 0.45);                              // the top
      c.box(-w / 2, -w / 2 + 0.02, -0.21, 0.21, 0.12, 0.41); c.box(w / 2 - 0.02, w / 2, -0.21, 0.21, 0.12, 0.41);   // ends
      c.box(-w / 2, w / 2, -0.21, 0.21, 0.12, 0.14);                                                 // the bottom
      c.box(-w / 2 + 0.02, w / 2 - 0.02, -0.21, -0.19, 0.14, 0.41);                                  // the back
      wood(c, C.oak, 1); for (const x of [-w / 2 + 0.02, 0.5 * w - 0.06]) for (const z of [-0.19, 0.15]) c.box(x, x + 0.04, z, z + 0.04, 0, 0.12);   // legs
      // two doors and an open compartment
      const dw = (w - 0.06) / 3;
      for (let i = 0; i < 3; i++) {
        const x0 = -w / 2 + 0.03 + i * dw;
        if (i === 1) { c.paint(C.iron, "steel"); c.box(x0 + 0.05, x0 + dw - 0.05, 0.0, 0.14, 0.15, 0.27); continue; }      // a box (the player / router) in the open one
        wood(c, C.oak, 2); c.box(x0 + 0.005, x0 + dw - 0.005, 0.2, 0.22, 0.15, 0.4);
        c.paint(C.brass); c.box(x0 + dw / 2 - 0.05, x0 + dw / 2 + 0.05, 0.22, 0.235, 0.27, 0.285);
      }
      // the television: a flat screen on a foot
      const y0 = 0.45;
      c.paint(C.iron, "steel"); c.box(-0.16, 0.16, -0.08, 0.1, y0, y0 + 0.012); c.box(-0.025, 0.025, -0.03, 0.01, y0 + 0.012, y0 + 0.1);
      c.paint("#111214", "plastic"); c.box(-tv / 2, tv / 2, -0.04, 0.0, y0 + 0.1, y0 + 0.1 + th);   // the frame and case
      c.paint("#1B2A35", "plastic"); c.box(-tv / 2 + 0.012, tv / 2 - 0.012, 0.0, 0.004, y0 + 0.112, y0 + 0.088 + th);   // the screen
    }},
  desk: {name: "Desk (skrivbord)", mount: "wall", collision: true,
    params: [{k: "width", label: "Width", min: 1.0, max: 1.8, step: 0.1, unit: " m"},
      {k: "computer", label: "Computer", min: 0, max: 1, step: 1, options: ["No computer", "With a computer"]}], defaults: {width: 1.4, computer: 1},
    size: it => [it.width, 0.7], height: it => Math.round(it.computer) ? 1.2 : 0.76,
    build(c, it) {
      const w = it.width, x1 = w / 2, x0 = -w / 2;
      wood(c, C.pine, 0); c.box(x0, x1, -0.35, 0.35, 0.72, 0.76);                                    // the top
      wood(c, C.pine, 1); c.box(x0 + 0.02, x0 + 0.05, -0.32, 0.32, 0, 0.72);                         // the left end panel
      c.box(x0 + 0.05, x1 - 0.5, -0.33, -0.31, 0.12, 0.7);                                           // a modesty panel at the back
      // a drawer unit at the right
      c.box(x1 - 0.48, x1 - 0.45, -0.32, 0.32, 0, 0.72); c.box(x1 - 0.03, x1, -0.32, 0.32, 0, 0.72);
      c.box(x1 - 0.48, x1, -0.32, 0.32, 0.0, 0.04); c.box(x1 - 0.48, x1, -0.32, -0.3, 0.04, 0.72);
      for (let i = 0; i < 3; i++) {
        const y = 0.08 + i * 0.21;
        wood(c, C.pine, 2 + i); c.box(x1 - 0.445, x1 - 0.035, 0.3, 0.32, y, y + 0.19);
        c.paint(C.brass); c.box(x1 - 0.29, x1 - 0.19, 0.32, 0.335, y + 0.09, y + 0.1);
      }
      if (Math.round(it.computer)) {
        const cx = Math.max(x0 + 0.34, (x0 + x1 - 0.5) / 2 + 0.05);
        c.paint(C.iron, "steel"); c.box(cx - 0.12, cx + 0.12, -0.28, -0.08, 0.76, 0.772); c.box(cx - 0.02, cx + 0.02, -0.2, -0.16, 0.772, 0.88);   // the monitor's foot and neck
        c.paint("#111214", "plastic"); c.box(cx - 0.31, cx + 0.31, -0.2, -0.16, 0.86, 1.2);           // the monitor
        c.paint("#243846", "plastic"); c.box(cx - 0.295, cx + 0.295, -0.16, -0.155, 0.875, 1.185);    // its screen
        c.paint("#1E1F21", "plastic"); c.box(cx - 0.22, cx + 0.2, 0.0, 0.17, 0.76, 0.778);            // the keyboard
        c.paint("#7C8084", "plastic"); for (let k = 0; k < 3; k++) c.box(cx - 0.2, cx + 0.18, 0.015 + k * 0.05, 0.04 + k * 0.05, 0.778, 0.782);   // its keys
        c.paint("#111214", "plastic"); c.box(cx + 0.3, cx + 0.36, 0.05, 0.13, 0.76, 0.78);            // the mouse
        c.paint("#2B2D30", "steel"); c.box(x0 + 0.09, x0 + 0.29, -0.26, 0.14, 0, 0.42);              // the computer on the floor
        c.paint("#7C8084", "steel"); c.box(x0 + 0.1, x0 + 0.28, 0.14, 0.15, 0.3, 0.36);              // its front
      }
    }},
  divan: {name: "Divan sofa (divansoffa)", mount: "wall", collision: true, params: [], defaults: {},
    size: () => [1.95, 0.9], height: () => 0.78,
    build(c) {
      const ochre = "#B8883A";
      wood(c, C.oak, 0); for (const x of [-0.95, 0.91]) for (const z of [-0.41, 0.37]) c.box(x, x + 0.04, z, z + 0.04, 0, 0.12);   // legs
      c.box(-0.975, 0.975, -0.44, 0.44, 0.12, 0.2);                                                  // the frame
      c.paint(ochre); c.box(-0.97, 0.97, -0.44, 0.44, 0.2, 0.36);                                    // the base
      c.paint(tone(ochre, 1)); c.box(-0.95, 0.95, -0.4, 0.43, 0.36, 0.46);                          // a long seat cushion
      c.paint(shade(ochre, -0.2)); c.box(-0.97, 0.97, -0.45, -0.28, 0.36, 0.7);                     // the low back
      c.paint(tone(ochre, 2)); c.box(0.74, 0.97, -0.44, 0.44, 0.36, 0.64);                          // the bolster arm at one end
      c.paint(C.wool); c.box(-0.78, -0.4, -0.27, -0.14, 0.46, 0.7);                                  // two scatter cushions
      c.paint(C.cushion); c.box(-0.3, 0.08, -0.27, -0.14, 0.46, 0.66);
      // seams between the seat cushions, a welt along the front, and buttons in the back
      c.paint(shade(ochre, -0.4)); for (const x of [-0.32, 0.32]) c.box(x - 0.004, x + 0.004, -0.4, 0.43, 0.46, 0.462);
      c.box(-0.95, 0.95, 0.43, 0.436, 0.36, 0.46); c.box(0.74, 0.745, -0.44, 0.44, 0.36, 0.64);
      c.paint(shade(ochre, -0.55)); for (let i = 0; i < 6; i++) c.cyl(-0.8 + i * 0.3, -0.275, 0.5 + (i % 2) * 0.1, 0.014, 0.008, 8);
    }},
  cooker: {name: "Cooker with hood (spis med spiskåpa)", mount: "wall", collision: true, params: [], defaults: {},
    size: () => [0.6, 0.68], height: () => 2.0,
    build(c) {
      const enamel = "#E9E8E3";
      c.paint(C.iron, "steel"); c.box(-0.3, 0.3, -0.31, 0.27, 0, 0.06);                               // the plinth
      c.paint(enamel, "plastic"); c.box(-0.3, 0.3, -0.31, 0.31, 0.06, 0.9);                          // the body
      c.paint("#17181A", "plastic"); c.box(-0.26, 0.26, 0.31, 0.318, 0.12, 0.62);                    // the oven door's glass
      c.paint(C.steel, "steel"); c.rod([-0.24, 0.68, 0.326], [0.24, 0.68, 0.326], 0.012, 8);            // its handle
      for (const x of [-0.24, 0.24]) c.box(x - 0.01, x + 0.01, 0.31, 0.328, 0.675, 0.69);               // and the brackets
      for (let i = 0; i < 5; i++) { c.paint(C.iron, "steel"); c.box(-0.22 + i * 0.11 - 0.017, -0.22 + i * 0.11 + 0.017, 0.31, 0.332, 0.77, 0.805); }   // knobs
      c.paint("#101113", "plastic"); c.box(-0.3, 0.3, -0.31, 0.31, 0.9, 0.915);                      // the hob
      c.paint(C.steel, "steel");
      for (const [x, z, r] of [[-0.14, -0.1, 0.07], [0.14, -0.1, 0.055], [-0.14, 0.14, 0.055], [0.14, 0.14, 0.07]]) c.cyl(x, z, 0.915, r, 0.008, 18);   // the rings
      // the hood: a canopy over the hob, a flue up to the ceiling, a filter and a lamp
      c.paint(C.steel, "steel"); c.box(-0.3, 0.3, -0.31, 0.1, 1.55, 1.68);
      c.box(-0.13, 0.13, -0.31, -0.07, 1.68, 2.0);
      c.paint(shade(C.steel, -0.4), "steel"); c.box(-0.27, 0.27, -0.28, 0.07, 1.536, 1.55);
      c.paint("#FFF3C4"); c.box(-0.2, -0.14, -0.1, -0.04, 1.532, 1.536); c.box(0.14, 0.2, -0.1, -0.04, 1.532, 1.536);
    }},
  kitchenunits: {name: "Kitchen units with worktop and wall cupboards (köksskåp)", mount: "wall", collision: true,
    params: [{k: "count", label: "Units (60 cm each)", min: 1, max: 8, step: 1},
      {k: "upper", label: "Wall cupboards", min: 0, max: 1, step: 1, options: ["No wall cupboards", "With wall cupboards"]},
      {k: "sink", label: "Sink", min: 0, max: 1, step: 1, options: ["No sink", "With a sink"]}], defaults: {count: 3, upper: 1, sink: 0},
    size: it => [it.count * 0.6, 0.62], height: it => Math.round(it.upper) ? 2.0 : 0.92,
    build(c, it) {
      const n = it.count, w = n * 0.6, sinkAt = Math.round(it.sink) && n >= 2 ? Math.floor(n / 2) : -1;
      c.paint(C.iron); c.box(-w / 2 + 0.02, w / 2 - 0.02, -0.31, 0.24, 0, 0.1);                       // the plinth
      c.paint(C.paint, "wood"); c.box(-w / 2, w / 2, -0.31, 0.27, 0.1, 0.88);                        // the carcass
      for (let i = 0; i < n; i++) {
        const x0 = -w / 2 + i * 0.6, drawers = i % 3 === 1 && i !== sinkAt;
        c.paint(shade(C.paint, i % 2 ? -0.05 : 0.05), "wood");
        if (drawers) for (let k = 0; k < 3; k++) { const y = 0.14 + k * 0.24; c.box(x0 + 0.02, x0 + 0.58, 0.27, 0.29, y, y + 0.22); c.paint(C.brass); c.box(x0 + 0.24, x0 + 0.36, 0.29, 0.3, y + 0.1, y + 0.12); c.paint(shade(C.paint, i % 2 ? -0.05 : 0.05), "wood"); }
        else { c.box(x0 + 0.02, x0 + 0.58, 0.27, 0.29, 0.14, 0.84); c.paint(C.brass); c.box(x0 + 0.27, x0 + 0.33, 0.29, 0.3, 0.72, 0.74); }
      }
      c.paint(C.worktop, "wood"); c.box(-w / 2, w / 2, -0.31, 0.31, 0.88, 0.92);                    // the worktop
      if (sinkAt >= 0) {
        const cx = -w / 2 + (sinkAt + 0.5) * 0.6;
        c.paint(C.steel, "steel"); c.box(cx - 0.25, cx + 0.25, -0.2, 0.15, 0.905, 0.921);
        c.rod([cx, 0.92, -0.26], [cx, 1.15, -0.26], 0.012); c.rod([cx, 1.15, -0.26], [cx, 1.12, -0.12], 0.01);
      }
      if (Math.round(it.upper)) {
        // wall cupboards, 34 cm deep, from 1.4 m up to 2.0 m, with a tile splashback between
        c.paint("#DAD6C8", "wood"); c.box(-w / 2, w / 2, -0.31, -0.29, 0.92, 1.4);
        c.paint(C.paint, "wood"); c.box(-w / 2, w / 2, -0.31, 0.03, 1.4, 2.0);
        for (let i = 0; i < n; i++) {
          const x0 = -w / 2 + i * 0.6;
          c.paint(shade(C.paint, i % 2 ? -0.05 : 0.05), "wood"); c.box(x0 + 0.02, x0 + 0.58, 0.03, 0.05, 1.43, 1.97);
          c.paint(C.brass); c.box(x0 + 0.27, x0 + 0.33, 0.05, 0.06, 1.46, 1.48);
        }
      }
    }},
  fridge: {name: "Fridge / freezer (kyl och frys)", mount: "wall", collision: true,
    params: [{k: "model", label: "Type", min: 0, max: 2, step: 1, options: ["Fridge-freezer (kyl-frys)", "Fridge (kylskåp)", "Freezer (frys)"]}], defaults: {model: 0},
    size: () => [0.6, 0.68], height: () => 1.85,
    build(c, it) {
      const t = Math.round(it.model), white = "#EDECE7", door = (y0, y1) => { c.paint(shade(white, 0.1), "plastic"); c.box(-0.295, 0.295, 0.31, 0.325, y0, y1); };
      c.paint(C.iron, "steel"); c.box(-0.28, 0.28, -0.3, 0.28, 0, 0.05);                              // the plinth
      c.paint(shade(C.iron, 0.5), "steel"); for (let k = 0; k < 4; k++) c.box(-0.2, 0.2, 0.28, 0.285, 0.008 + k * 0.011, 0.015 + k * 0.011);   // its air grille
      c.paint(shade("#EDECE7", -0.3), "plastic"); c.box(-0.3, 0.3, -0.34, 0.315, 1.84, 1.855);     // the top edge
      c.box(-0.305, -0.295, 0.31, 0.325, 0.06, 1.84); c.box(0.295, 0.305, 0.31, 0.325, 0.06, 1.84);   // the door seals
      c.paint(white, "plastic"); c.box(-0.3, 0.3, -0.34, 0.31, 0.05, 1.85);                           // the cabinet
      const handle = (y0, y1) => { c.paint(C.steel, "steel"); c.box(0.2, 0.225, 0.325, 0.335, y0, y1); };
      if (t === 0) { door(0.06, 0.6); handle(0.5, 0.58); door(0.62, 1.84); handle(0.66, 1.2); c.paint(C.steel, "steel"); c.box(-0.295, 0.295, 0.31, 0.325, 0.6, 0.62); }
      else if (t === 1) { door(0.06, 1.84); handle(0.9, 1.5); c.paint(C.iron, "steel"); c.box(-0.2, 0.0, 0.325, 0.33, 1.7, 1.74); }            // (a small display)
      else { for (let k = 0; k < 4; k++) { const y = 0.07 + k * 0.445; door(y, y + 0.43); handle(y + 0.3, y + 0.38); } }                      // drawers
    }},
  pantry: {name: "Pantry cupboard (skafferi)", mount: "wall", collision: true,
    params: [{k: "count", label: "Sections (60 cm each)", min: 1, max: 3, step: 1},
      {k: "open", label: "Front", min: 0, max: 1, step: 1, options: ["Closed doors", "Open shelves"]}], defaults: {count: 1, open: 0},
    size: it => [it.count * 0.6, 0.55], height: () => 2.0,
    build(c, it) {
      const n = it.count, w = n * 0.6, shelves = [0.1, 0.5, 0.9, 1.3, 1.65];
      c.paint(C.green, "wood"); c.box(-w / 2, w / 2, -0.275, -0.26, 0, 2.0);                          // the back
      c.paint(shade(C.green, -0.3), "wood"); c.box(-w / 2, w / 2, -0.26, 0.25, 0, 0.08);             // plinth
      c.paint(C.green, "wood");
      for (let i = 0; i <= n; i++) { const x = -w / 2 + i * 0.6; c.box(Math.max(-w / 2, x - 0.012), Math.min(w / 2, x + 0.012), -0.26, 0.25, 0.08, 2.0); }
      c.box(-w / 2, w / 2, -0.26, 0.26, 1.96, 2.0);                                                   // the top
      for (const y of shelves) c.box(-w / 2 + 0.012, w / 2 - 0.012, -0.26, 0.24, y, y + 0.022);       // shelves
      for (let i = 0; i < n; i++) {
        const x0 = -w / 2 + i * 0.6;
        if (Math.round(it.open)) {
          // jars, tins and packets on the shelves
          const cols = ["#9A7A3A", "#C9B27A", "#7A2E2A", "#E8E0CC", "#5E7A62", "#B8883A"];
          shelves.slice(0, 4).forEach((y, k) => {
            for (let j = 0; j < 4; j++) {
              const x = x0 + 0.1 + j * 0.13, col = cols[(i + k + j) % cols.length], h = 0.14 + ((k + j) % 3) * 0.05;
              c.paint(col, (j + k) % 2 ? "plastic" : "steel"); if ((j + k) % 2) c.cyl(x, -0.05 + ((j * 3 + k) % 3) * 0.05, y + 0.022, 0.05, h, 12); else c.box(x - 0.045, x + 0.045, -0.12, 0.05, y + 0.022, y + 0.022 + h * 0.9);
            }
          });
        } else {
          c.paint(tone(C.green, i), "wood");
          c.box(x0 + 0.015, x0 + 0.585, 0.25, 0.265, 0.1, 1.94);                                      // the door
          c.paint(shade(C.green, 0.3), "wood"); c.box(x0 + 0.07, x0 + 0.53, 0.265, 0.272, 0.2, 0.9); c.box(x0 + 0.07, x0 + 0.53, 0.265, 0.272, 1.0, 1.85);   // panels
          c.paint(C.brass); c.box(x0 + 0.51, x0 + 0.54, 0.265, 0.275, 0.95, 1.08);                    // the handle
        }
      }
    }},
  toilet: {name: "Toilet (toalett)", mount: "wall", collision: true, params: [], defaults: {},
    size: () => [0.4, 0.72], height: () => 0.86,
    build(c) {
      const white = "#F1F0EB", chrome = C.steel;
      c.paint(white, "plastic");
      c.box(-0.19, 0.19, -0.35, -0.15, 0.4, 0.82);                                                     // the cistern on the wall
      c.box(-0.11, 0.11, -0.3, 0.1, 0, 0.4);                                                           // the pedestal
      c.cyl(0, 0.08, 0.34, 0.19, 0.07, 22);                                                            // the bowl's body
      c.box(-0.185, 0.185, -0.35, 0.08, 0.34, 0.41);
      c.paint(shade(white, -0.3), "plastic"); c.cyl(0, 0.08, 0.41, 0.2, 0.025, 22); c.box(-0.2, 0.2, -0.35, 0.08, 0.41, 0.435);   // the seat
      c.paint(white, "plastic"); c.cyl(0, 0.08, 0.435, 0.185, 0.012, 22); c.box(-0.185, 0.185, -0.35, 0.08, 0.435, 0.447);        // the lid
      c.paint(shade(white, -0.3), "plastic"); c.box(-0.19, 0.19, -0.32, -0.17, 0.82, 0.84);              // the cistern's lid
      c.paint(chrome, "steel"); c.cyl(0, -0.25, 0.84, 0.025, 0.012, 12);                                 // the flush button
      c.box(-0.06, 0.06, -0.36, -0.34, 0.45, 0.47);                                                    // the hinge cover
      for (const x of [-0.14, 0.14]) { c.cyl(x, -0.3, 0.43, 0.016, 0.012, 10); c.cyl(x, 0.02, 0.0, 0.012, 0.014, 8); }   // seat hinges and the floor bolts
      c.paint(shade(white, -0.15), "plastic"); c.box(-0.16, 0.16, -0.31, 0.05, 0, 0.025);              // the base flange
      c.paint(chrome, "steel"); c.box(0.1, 0.15, -0.34, -0.3, 0.3, 0.33);                                // the angle valve
      c.box(-0.04, 0.04, -0.15, -0.14, 0.7, 0.72);                                                      // the flush plate's rim
    }},
  shower: {name: "Shower cabin (duschkabin)", mount: "wall", collision: true,
    params: [{k: "width", label: "Size (square)", min: 0.8, max: 1.2, step: 0.1, unit: " m"}], defaults: {width: 0.9},
    size: it => [it.width, it.width], height: () => 2.05,
    build(c, it) {
      const w = it.width, h = w / 2, tray = "#F1F0EB", glass = "#B9D3DC", chrome = C.steel;
      c.paint(tray, "plastic"); c.box(-h, h, -h, h, 0, 0.07);                                           // the tray
      c.paint(shade(tray, -0.5), "plastic"); c.box(-h + 0.06, h - 0.06, -h + 0.06, h - 0.06, 0.07, 0.072);   // its floor
      c.paint(chrome, "steel"); c.cyl(0, 0, 0.072, 0.045, 0.004, 14);                                   // the drain
      // glass walls on the two open sides (front and right) with a chrome frame, and a door in the front
      c.paint(chrome, "steel");
      for (const [x0, x1, z0, z1] of [[-h, h, h - 0.025, h], [h - 0.025, h, -h, h]]) { c.box(x0, x1, z0, z1, 0.07, 0.09); c.box(x0, x1, z0, z1, 2.0, 2.05); }
      for (const [x, z] of [[-h + 0.015, h - 0.012], [h - 0.012, h - 0.012], [h - 0.012, -h + 0.015], [0.1, h - 0.012]]) c.box(x - 0.012, x + 0.012, z - 0.012, z + 0.012, 0.09, 2.0);   // uprights
      c.paint(glass, "plastic"); c.box(-h + 0.03, h - 0.03, h - 0.018, h - 0.008, 0.09, 2.0); c.box(h - 0.018, h - 0.008, -h + 0.03, h - 0.03, 0.09, 2.0);
      c.paint(chrome, "steel"); c.rod([0.14, 0.9, h - 0.006], [0.14, 1.2, h - 0.006], 0.01, 8);          // the door handle
      // the mixer on the back wall and the shower head on a rail
      c.box(-0.08, 0.08, -h, -h + 0.05, 1.0, 1.08); c.rod([0, 1.04, -h + 0.05], [0, 1.04, -h + 0.09], 0.02, 8);
      c.rod([-h + 0.1, 0.9, -h + 0.02], [-h + 0.1, 1.9, -h + 0.02], 0.012, 8);
      c.cyl(-h + 0.1, -h + 0.14, 1.88, 0.07, 0.015, 16); c.rod([-h + 0.1, 1.9, -h + 0.02], [-h + 0.1, 1.9, -h + 0.14], 0.012, 8);
    }},
  washbasin: {name: "Washbasin (handfat)", mount: "wall", collision: true,
    params: [{k: "mirror", label: "Mirror", min: 0, max: 1, step: 1, options: ["No mirror", "With a mirror"]}], defaults: {mirror: 1},
    size: () => [0.56, 0.46], height: it => Math.round(it.mirror) ? 1.9 : 0.95,
    build(c, it) {
      const white = "#F1F0EB", chrome = C.steel;
      c.paint(white, "plastic"); c.box(-0.06, 0.06, -0.2, -0.06, 0, 0.74);                              // the pedestal
      c.box(-0.28, 0.28, -0.23, 0.23, 0.74, 0.86);                                                      // the basin
      c.paint(shade(white, -0.35), "plastic"); c.box(-0.22, 0.22, -0.16, 0.17, 0.856, 0.862);           // the bowl's floor
      c.paint(shade(white, -0.15), "plastic"); c.box(-0.28, 0.28, -0.23, -0.2, 0.86, 0.92);             // the splashback
      c.paint(chrome, "steel"); c.cyl(0, -0.1, 0.862, 0.025, 0.004, 12);                                 // the plughole
      c.rod([0, 0.86, -0.17], [0, 0.98, -0.17], 0.012, 8); c.rod([0, 0.98, -0.17], [0, 0.97, -0.06], 0.01, 8);   // the tap
      c.box(-0.05, 0.05, -0.19, -0.15, 0.94, 0.98);
      for (const x of [-0.08, 0.08]) c.box(x - 0.015, x + 0.015, -0.2, -0.15, 0.92, 0.94);              // the tap handles
      c.paint(white, "plastic"); c.box(0.18, 0.26, -0.15, -0.05, 0.862, 0.88);                          // a soap dish
      c.paint(chrome, "steel"); c.rod([0, 0.862, -0.1], [0.05, 0.8, -0.18], 0.004, 5); c.cyl(0, -0.19, 0.58, 0.02, 0.1, 10);   // the plug chain and the trap
      if (Math.round(it.mirror)) {
        c.paint(C.paint, "wood"); c.box(-0.26, 0.26, -0.225, -0.2, 1.15, 1.9);                         // a framed mirror and a shelf
        c.paint("#C7D4D8", "steel"); c.box(-0.23, 0.23, -0.2, -0.195, 1.2, 1.85);
        c.paint(C.paint, "wood"); c.box(-0.26, 0.26, -0.225, 0.0, 1.05, 1.07);
      }
    }},
  washer: {name: "Washing machine (tvättmaskin)", mount: "wall", collision: true, params: [], defaults: {},
    size: () => [0.6, 0.66], height: () => 0.86,
    build(c) {
      const white = "#EEEDE8", chrome = C.steel, front = 0.3;
      c.paint(shade(C.iron, 0.3), "steel"); for (const x of [-0.26, 0.26]) for (const z of [-0.26, 0.2]) c.box(x - 0.02, x + 0.02, z, z + 0.04, 0, 0.02);   // feet
      c.paint(white, "plastic"); c.box(-0.3, 0.3, -0.31, 0.3, 0.02, 0.85);                              // the body
      c.paint(shade(white, -0.25), "plastic"); c.box(-0.3, 0.3, -0.31, 0.3, 0.85, 0.86);                // the top plate
      // the control panel: a drawer for the detergent, a display and a knob
      c.paint(shade(white, -0.1), "plastic"); c.box(-0.27, -0.05, front, front + 0.008, 0.7, 0.8);
      c.paint(C.iron, "steel"); c.box(-0.25, -0.07, front + 0.008, front + 0.012, 0.74, 0.76);
      c.paint("#1C2B33", "plastic"); c.box(0.02, 0.12, front, front + 0.006, 0.73, 0.79);
      c.paint(chrome, "steel"); c.box(0.17, 0.23, front, front + 0.02, 0.73, 0.77);
      // the round door: a chrome ring round dark glass (drawn as strips of a circle)
      const cy = 0.4, R = 0.205, cx = 0;
      c.paint(chrome, "steel");
      for (let k = 0; k < 20; k++) {
        const a0 = k / 20 * Math.PI * 2, a1 = (k + 1) / 20 * Math.PI * 2, r1 = R, r0 = R - 0.035;
        c.board([cx + r0 * Math.cos(a0), cy + r0 * Math.sin(a0), front + 0.012], [cx + r0 * Math.cos(a1), cy + r0 * Math.sin(a1), front + 0.012], 0.03, 0.02);
        c.board([cx + r1 * Math.cos(a0), cy + r1 * Math.sin(a0), front + 0.012], [cx + r1 * Math.cos(a1), cy + r1 * Math.sin(a1), front + 0.012], 0.012, 0.02);
      }
      c.paint("#222F36", "plastic");
      for (let k = 0; k < 9; k++) {
        const y0 = -0.17 + k * 0.0378, y1 = y0 + 0.0378, ym = Math.min(Math.abs(y0), Math.abs(y1)), half = Math.sqrt(Math.max(0, 0.17 * 0.17 - ym * ym));
        c.box(cx - half, cx + half, front, front + 0.008, cy + y0, cy + y1);
      }
      c.paint("#3A4A52", "plastic"); c.box(-0.05, 0.05, front + 0.006, front + 0.01, cy - 0.04, cy + 0.04);   // a reflection
    }},
  rug: {name: "Rag rug (trasmatta)", mount: "floor", collision: false, params: [], defaults: {},
    size: () => [2.0, 0.8], height: () => 0.012,
    build(c) {
      const stripes = ["#8E3B32", "#D9CFB8", "#4E6A86", "#D9CFB8", "#5E7A62", "#D9CFB8"];
      for (let i = 0; i < 12; i++) { const x0 = -0.95 + i * 1.9 / 12; c.paint(stripes[i % stripes.length]); c.box(x0, x0 + 1.9 / 12, -0.4, 0.4, 0, 0.01); }
      c.paint("#E8E0CC"); c.box(-1, -0.95, -0.38, 0.38, 0, 0.008); c.box(0.95, 1, -0.38, 0.38, 0, 0.008);   // fringes
    }},
};


for (const [k, g] of Object.entries({"innerwall":"Walls and doors","kitchen":"Kitchen","kitchenunits":"Kitchen","cooker":"Kitchen","stove":"Kitchen","fridge":"Kitchen","pantry":"Kitchen","table":"Dining","chair":"Dining","sofa":"Living room","divan":"Living room","tvbench":"Living room","bookshelf":"Living room","bookcase":"Living room","rug":"Living room","bed":"Bedroom","singlebed":"Bedroom","wardrobe":"Bedroom","desk":"Office","toilet":"Bathroom","shower":"Bathroom","washbasin":"Bathroom","washer":"Bathroom"})) if (CATALOG[k]) CATALOG[k].group = g;   // (the palette's groups)

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
