// Dealership: a showroom hall where the player buys vehicles. In the game a placeable with a vehicle buying station has a trigger (the shop
// counter: walk into it to open the vehicle shop), a list of vehicles from the base game with their prices, and spawn areas where a
// bought vehicle appears. The counter and the spawn area are game objects (objects.mjs "counter", "spawn"); the vehicles are chosen by group
// in the editor (the settings sellTractors ...). The vehicle list is vehicles.mjs, made from the game by scripts/gen-vehicles.mjs.
// The base game has no placeable of this kind, so the mod defines its own placeable type (modDesc <placeableTypes>, see modTypes) with the
// game's "vehicleBuyingStation" specialization; this is not yet tried in the game.
// Imports only the i3d writer; the core hands in what it needs (see kinds/index.mjs).
import { shopFor } from "./shop.mjs";
const SHEDS = {category: "sheds", type: "placeable", brush: "buildings", tab: "sheds"};   // (the shop place of the kind: shop.mjs lets the player choose another)
import { tone } from "./props.mjs";
import { INNER_WALL } from "./innerwall.mjs";
import { DEALER_GROUPS, vehiclesFor, shopDefaults } from "./vehicleshop.mjs";
export { DEALER_GROUPS, vehiclesFor };
export const defaultObjects = shopDefaults;

const COL = {floor: "#B9B7B0", wood: "#9C7448", dark: "#3C3F42", steel: "#6C7378", red: "#B8382C", paper: "#E9E4D8", green: "#2F8F6F"};

/** The floor: smooth concrete, as a showroom has. */
export function furnish(c) { c.floor(COL.floor, "concrete"); }

/* ---------- Pieces ---------- */
export const CATALOG = {
  innerwall: INNER_WALL,
  salesdesk: {name: "Sales desk", mount: "floor", collision: true,
    params: [{k: "length", label: "Length", min: 1.2, max: 5, step: 0.1, unit: " m"}], defaults: {length: 2.4},
    size: it => [it.length, 0.8], height: () => 1.15,
    build(c, it) {
      const L = it.length, xA = -L / 2, xB = L / 2, zb = -0.4, zf = 0.4;
      c.paint(COL.dark, "steel"); c.box(xA, xB, zb, zf, 0, 0.08);                                      // the plinth
      c.paint(COL.green, "plastic"); c.box(xA, xB, zb + 0.02, zf, 0.08, 1.0);                          // the front and sides
      for (let x = xA + 0.15; x < xB - 0.3; x += 0.6) c.box(x, x + 0.45, zf - 0.02, zf, 0.2, 0.9);     // panels on the customer's side
      c.paint(COL.wood, "wood"); c.box(xA, xB, zb, zf, 1.0, 1.06);                                     // top
      c.paint(COL.dark, "steel"); c.box(xA + 0.3, xA + 0.8, zb + 0.15, zb + 0.4, 1.06, 1.09);          // a screen's foot
      c.box(xA + 0.52, xA + 0.58, zb + 0.26, zb + 0.3, 1.09, 1.25); c.box(xA + 0.3, xA + 0.8, zb + 0.22, zb + 0.26, 1.25, 1.45);   // its stand and the screen
      c.paint(COL.paper, "plastic"); c.box(xB - 0.6, xB - 0.2, zb + 0.1, zb + 0.4, 1.06, 1.08);        // papers
      c.paint(COL.red, "plastic"); c.box(xB - 0.9, xB - 0.8, zb + 0.15, zb + 0.25, 1.06, 1.16);       // a pen pot
    }},
  podium: {name: "Display podium", mount: "floor", collision: false,
    params: [{k: "length", label: "Length", min: 2, max: 12, step: 0.1, unit: " m"}, {k: "width", label: "Width", min: 1.5, max: 6, step: 0.1, unit: " m"}],
    defaults: {length: 5, width: 3},
    size: it => [it.length, it.width], height: () => 0.2,
    build(c, it) {
      const xA = -it.length / 2, xB = it.length / 2, zb = -it.width / 2, zf = it.width / 2;
      c.paint(tone(COL.dark, 1), "rubber"); c.box(xA, xB, zb, zf, 0, 0.15);
      c.paint(COL.red, "steel"); c.box(xA, xB, zb, zb + 0.06, 0.15, 0.2); c.box(xA, xB, zf - 0.06, zf, 0.15, 0.2); c.box(xA, xA + 0.06, zb, zf, 0.15, 0.2); c.box(xB - 0.06, xB, zb, zf, 0.15, 0.2);
      c.paint(COL.steel, "galv"); for (let x = xA + 0.5; x < xB - 0.3; x += 0.5) c.box(x, x + 0.04, zb + 0.1, zf - 0.1, 0.15, 0.17);   // ribs on the top
      c.paint(COL.dark, "steel"); for (const [x, z] of [[xA + 0.1, zb + 0.1], [xB - 0.14, zb + 0.1], [xA + 0.1, zf - 0.14], [xB - 0.14, zf - 0.14]]) c.box(x, x + 0.04, z, z + 0.04, 0.17, 0.2);   // bolts
    }},
  brochures: {name: "Brochure stand", mount: "wall", collision: true,
    params: [], defaults: {},
    size: () => [0.7, 0.3], height: () => 1.6,
    build(c) {
      c.paint(COL.dark, "steel"); c.box(-0.35, 0.35, -0.15, 0.15, 0, 0.06); c.box(-0.35, -0.31, -0.15, -0.11, 0, 1.6); c.box(0.31, 0.35, -0.15, -0.11, 0, 1.6);
      c.box(-0.35, 0.35, -0.15, -0.11, 1.56, 1.6);
      for (let k = 0; k < 4; k++) {
        const y = 0.35 + k * 0.32;
        c.paint(COL.dark, "steel"); c.box(-0.35, 0.35, -0.15, 0.1, y, y + 0.02); c.box(-0.35, 0.35, 0.08, 0.1, y + 0.02, y + 0.06);   // a shelf with a lip
        c.paint(k % 2 ? COL.red : COL.paper, "plastic"); c.box(-0.3, 0.3, -0.12, -0.08, y + 0.02, y + 0.28);                            // brochures
      }
    }},
};
for (const [k, g] of Object.entries({innerwall: "Walls and doors", salesdesk: "Showroom", podium: "Showroom", brochures: "Showroom"})) CATALOG[k].group = g;

/** The showroom is left empty to start with: the player adds a desk, podiums and brochure stands. */
export function autoFurnish() { return {style: "shed", items: []}; }

const paint = {wallCladding: "lockpanel", wallColor: "#C9C4B6", trimColor: "#3B3F42"};
export default {
  id: "dealership",
  name: "Dealership",
  plural: "Dealerships",
  category: "shops",
  walkIn: true,
  // (the vehicle settings are every building's: sellTractors ..., in the Vehicles for sale section; a dealership starts by selling tractors, loaders and trucks)
  defaults: {ceiling: false, insideSame: true, winStyle: "single", doorStyle: "sliding", sellTractors: true, sellLoaders: true, sellTransport: true},
  sections: [],
  hides: ["Interior", "Kupor (dormers)"],
  /** Settings as this kind uses them: no sleep point, rooms or dormers. */
  normalize: p => ({...p, interior: false, dormers: []}),
  // (the vehicle buying station and the type that has it: kinds/vehicleshop.mjs and gameobjects.mjs, as for any building with a shop counter)
  placeable: p => ({type: "simplePlaceable", fn: "$l10n_function_decoration", shop: shopFor(p, SHEDS)}),
  description: p => `A ${(+p.width).toFixed(1)} x ${(+p.depth).toFixed(1)} m dealership made with House to i3d. Buy ${vehiclesFor(p).length} vehicles at the counter.`,
  furnish,
  catalog: CATALOG,
  autoFurnish,
  // the game objects: the counter and the spawn area are both needed
  objects: {types: ["counter", "spawn"], required: ["counter", "spawn"], defaults: defaultObjects},
  presets: [
    {id: "maskinaffar", name: "Maskinaffär", blurb: "20 × 12 m showroom hall with a wide sliding door, a counter at the front and a spawn area for the machines you buy.", settings: {
      ...paint, width: 20, depth: 12, floors: 1, floorHeight: 5, foundation: 0.3, foundationColor: "#8C8A84",
      roofType: "gable", ridge: "width", roofPitch: 14, overhang: 0.5, roofMaterial: "metal", roofColor: "#4A4F52", chimney: false, gutters: true, downpipes: 2, ventilators: 2,
      winFront: 4, winBack: 0, winLeft: 2, winRight: 2, winW: 2, winH: 1.8, sill: 1.1,
      doorWall: "front", doorPos: 0.5, doorW: 6, doorH: 4.2, doorColor: "#3B3F42", entrance: "none", doorStyle: "sheetslide",
      modPrice: 120000, modUpkeep: 200}},
    {id: "traktorhandlare", name: "Traktorhandlare", blurb: "12 × 9 m smaller shop with a sliding door and a counter, selling tractors, loaders and trailers.", settings: {
      wallCladding: "lockpanel", wallColor: "#8E2A1E", trimColor: "#F2EFE8", width: 12, depth: 9, floors: 1, floorHeight: 4, foundation: 0.3, foundationColor: "#8C8A84",
      roofType: "gable", ridge: "width", roofPitch: 24, overhang: 0.5, roofMaterial: "tiles", roofColor: "#2B2D2F", chimney: false, gutters: true, downpipes: 2, ventilators: 0,
      winFront: 2, winBack: 0, winLeft: 1, winRight: 1, winW: 1.6, winH: 1.4, sill: 1.2,
      doorWall: "front", doorPos: 0.5, doorW: 4, doorH: 3.4, doorColor: "#F2EFE8", entrance: "none", doorStyle: "sheetslide",
      modPrice: 60000, modUpkeep: 100}},
  ],
};
