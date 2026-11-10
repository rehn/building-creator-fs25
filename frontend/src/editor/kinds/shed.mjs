// Shed: a garage, machine hall or woodshed you can walk (and drive) into. A plain placeable in the shop's sheds;
// a vehicle workshop is a game object (objects.mjs "workshop"): with one the building becomes a garageWorkshopSolarPanels
// placeable with the workshop's triggers, as the base game's garages (data/placeables/rudolfHormann/garageBigService).
// Imports only the i3d writer; the core hands in what it needs (see kinds/index.mjs).
import { tg } from "../i3d.mjs";
import { objectOf, boxOf, iconOf } from "../objects.mjs";
import { tone, shade } from "./props.mjs";
import { INNER_WALL } from "./innerwall.mjs";

const COL = {floor: "#8E8C86", wood: "#9C7448", dark: "#3C3F42", steel: "#6C7378", galv: "#BCC2C5", red: "#B8382C", yellow: "#D9A91C", blue: "#2F5F8F",
  rubber: "#26272A", crate: "#7B6A4A", barrel: "#2E5C8A", pipe: "#D4D8DB"};

/** The floor: poured concrete over the whole room. */
function furnish(c) { c.floor(COL.floor, "concrete"); }

/** Where a new vehicle workshop goes: a box over most of the floor, its wrench icon in the middle. */
function defaultObjects(p) {
  const w = Math.max(2, Math.min(40, p.width - 1)), d = Math.max(2, Math.min(40, p.depth - 1));
  return [{type: "workshop", x: 0, z: 0, w, d, h: p.foundation + Math.min(4, Math.max(2.5, p.floorHeight)), ix: 0, iz: 0}];
}

/** Scene: the workshop's vehicle and player triggers and the wrench icon, when the building has a workshop object. */
function scene(c) {
  const {p} = c, o = objectOf(p, "workshop");
  if (!o) return {nodes: [], xml: "", areas: []};
  const nodes = [tg("workShop", [0, 0, 0], [
    c.box("vehicleTrigger", boxOf(o), c.trigger("0x20000000", "0x10000")),
    c.box("playerTrigger", boxOf(o), c.trigger("0x20000000", "0x100000")),
    tg("markerWrench", (([x, , z]) => [x, p.foundation, z])(iconOf(o))),
  ])];
  const xml = `
    <triggerMarkers>
        <triggerMarker node="markerWrench" filename="$data/shared/assets/marker/markerIconWrench.i3d"/>
    </triggerMarkers>

    <hotspots>
        <hotspot type="SHOP" linkNode="vehicleTrigger" teleportNode="playerTrigger"/>
    </hotspots>

    <workshop>
        <sellingPoint playerTriggerNode="playerTrigger" iconNode="markerWrench" sellTriggerNode="vehicleTrigger" ownWorkshop="true" mobileWorkshop="false"/>
    </workshop>
`;
  return {nodes, xml, areas: []};
}

/* ---------- Pieces ---------- */
const CATALOG = {
  innerwall: INNER_WALL,
  workbench: {name: "Workbench", mount: "wall", collision: true,
    params: [{k: "length", label: "Length", min: 1, max: 6, step: 0.1, unit: " m"}], defaults: {length: 2.4},
    size: it => [it.length, 0.7], height: () => 1.0,
    build(c, it) {
      const L = it.length, xA = -L / 2, xB = L / 2, zb = -0.35, zf = 0.35;
      c.paint(COL.wood, "wood"); c.box(xA, xB, zb, zf, 0.86, 0.92);                                   // thick top
      c.paint(COL.dark, "steel"); c.box(xA + 0.04, xB - 0.04, zb + 0.04, zf - 0.04, 0.8, 0.86);       // frame under it
      for (const x of [xA + 0.05, xB - 0.09]) { c.box(x, x + 0.05, zb + 0.04, zb + 0.09, 0, 0.8); c.box(x, x + 0.05, zf - 0.09, zf - 0.04, 0, 0.8); }
      c.paint(tone(COL.wood, 1), "wood"); c.box(xA + 0.05, xB - 0.05, zb + 0.06, zf - 0.06, 0.2, 0.24);  // low shelf
      c.paint(COL.red, "steel"); c.box(xB - 0.4, xB - 0.2, zf - 0.22, zf - 0.04, 0.92, 1.0);          // a vise
      c.paint(COL.steel, "steel"); c.box(xB - 0.38, xB - 0.22, zf - 0.04, zf, 0.93, 0.99);
      c.paint(COL.yellow, "plastic"); c.box(xA + 0.3, xA + 0.5, zb + 0.15, zb + 0.35, 0.92, 0.97);    // a tin
      c.paint(COL.galv, "galv"); c.rod([xA + 0.55, 0.94, 0], [xA + 0.85, 0.94, 0.05], 0.012, 6);      // a spanner
      c.paint(tone(COL.dark, 1), "steel"); for (const y of [0.4, 0.6]) c.box(xA + 0.1, xA + 0.6, zf - 0.02, zf, y, y + 0.16);   // drawer fronts
      c.paint(COL.galv, "galv"); for (const y of [0.46, 0.66]) c.box(xA + 0.3, xA + 0.4, zf, zf + 0.0, y, y + 0.02);
    }},
  toolwall: {name: "Tool wall", mount: "wall", collision: true,
    params: [{k: "length", label: "Length", min: 1, max: 8, step: 0.1, unit: " m"}], defaults: {length: 2.4},
    size: it => [it.length, 0.12], height: () => 2.0,
    build(c, it) {
      const L = it.length, xA = -L / 2, xB = L / 2, zb = -0.06;
      c.paint(tone(COL.wood, 2), "wood"); c.box(xA, xB, zb, zb + 0.02, 1.0, 1.95);                    // pegboard
      c.paint(COL.dark, "steel"); c.box(xA, xB, zb + 0.02, zb + 0.04, 0.98, 1.0); c.box(xA, xB, zb + 0.02, zb + 0.04, 1.95, 1.97);
      for (let x = xA + 0.12, k = 0; x < xB - 0.1; x += 0.22, k++) {                                   // hanging tools
        c.paint(k % 2 ? COL.galv : COL.steel, "galv"); c.rod([x, 1.2 + (k % 3) * 0.2, zb + 0.05], [x, 1.55 + (k % 3) * 0.1, zb + 0.05], 0.012, 6);
        c.paint(k % 3 === 0 ? COL.red : COL.yellow, "plastic"); c.box(x - 0.02, x + 0.02, zb + 0.03, zb + 0.07, 1.1, 1.22);
      }
      c.paint(COL.red, "steel"); c.box(xA + 0.1, xA + 0.8, zb + 0.02, 0.06, 1.0, 1.04);     // a small shelf
    }},
  shelves: {name: "Shelving", mount: "wall", collision: true,
    params: [{k: "length", label: "Length", min: 0.8, max: 8, step: 0.1, unit: " m"}, {k: "tiers", label: "Shelves", min: 2, max: 5, step: 1}],
    defaults: {length: 2.4, tiers: 4},
    size: it => [it.length, 0.5], height: it => 0.3 + it.tiers * 0.45,
    build(c, it) {
      const L = it.length, xA = -L / 2, xB = L / 2, zb = -0.25, zf = 0.25, top = 0.3 + it.tiers * 0.45 - 0.45;
      c.paint(COL.blue, "steel");
      const posts = Math.max(2, Math.ceil(L / 1.2) + 1);
      for (let k = 0; k < posts; k++) { const x = xA + 0.025 + k * (L - 0.05) / (posts - 1); c.box(x - 0.025, x + 0.025, zb, zb + 0.05, 0, top + 0.45); c.box(x - 0.025, x + 0.025, zf - 0.05, zf, 0, top + 0.45); }
      for (let t = 0; t < it.tiers; t++) {
        const y = 0.3 + t * 0.45;
        c.paint(tone(COL.wood, t), "wood"); c.box(xA, xB, zb, zf, y, y + 0.03);
        for (let x = xA + 0.1, k = 0; x < xB - 0.5; x += 0.65, k++) {                                  // crates and tins
          c.paint(k % 2 ? tone(COL.crate, t) : COL.yellow, k % 2 ? "wood" : "plastic");
          c.box(x, x + 0.5, zb + 0.06, zf - 0.06, y + 0.03, y + 0.03 + 0.2 + (k % 3) * 0.05);
        }
      }
    }},
  lift: {name: "Vehicle lift", mount: "floor", collision: true, params: [], defaults: {},
    size: () => [3.4, 1.2], height: () => 2.2,
    build(c) {
      c.paint(COL.yellow, "steel");
      for (const x of [-1.5, 1.5]) {
        c.box(x - 0.15, x + 0.15, -0.3, 0.3, 0, 0.03);                                                  // base plate
        c.box(x - 0.1, x + 0.1, -0.15, 0.15, 0.03, 2.2);                                                // column
      }
      c.paint(COL.dark, "steel"); c.box(-1.5, 1.5, -0.25, 0.25, 0.03, 0.06);                            // floor beam
      c.paint(COL.red, "steel");
      for (const x of [-1.5, 1.5]) { c.board([x, 0.3, -0.05], [x, 0.3, -0.5], 0.12, 0.08); c.board([x, 0.3, 0.05], [x, 0.3, 0.5], 0.12, 0.08); }
      c.paint(COL.rubber, "rubber"); for (const x of [-1.5, 1.5]) { c.cyl(x, -0.5, 0.3, 0.07, 0.04, 8); c.cyl(x, 0.5, 0.3, 0.07, 0.04, 8); }
    }},
  pit: {name: "Service pit", mount: "floor", collision: false,
    params: [{k: "length", label: "Length", min: 2, max: 8, step: 0.1, unit: " m"}], defaults: {length: 4.5},
    size: it => [it.length, 1.0], height: () => 0.05,
    build(c, it) {
      const L = it.length, xA = -L / 2, xB = L / 2;
      c.paint(COL.dark, "steel"); c.box(xA + 0.1, xB - 0.1, -0.4, 0.4, 0, 0.02);                          // the dark opening
      c.paint(COL.yellow, "steel");
      c.box(xA, xB, -0.5, -0.4, 0, 0.04); c.box(xA, xB, 0.4, 0.5, 0, 0.04); c.box(xA, xA + 0.1, -0.4, 0.4, 0, 0.04); c.box(xB - 0.1, xB, -0.4, 0.4, 0, 0.04);   // the yellow frame
      c.paint(COL.galv, "galv"); for (let x = xA + 0.3; x < xB - 0.2; x += 0.25) c.box(x, x + 0.05, -0.38, 0.38, 0.02, 0.03);   // grating
    }},
  barrels: {name: "Oil drums", mount: "floor", collision: true,
    params: [{k: "count", label: "Drums", min: 1, max: 6, step: 1}], defaults: {count: 3},
    size: it => [0.62 * Math.min(it.count, 3), 0.62 * Math.ceil(it.count / 3)], height: () => 0.9,
    build(c, it) {
      for (let k = 0; k < it.count; k++) {
        const x = (k % 3 - (Math.min(it.count, 3) - 1) / 2) * 0.62, z = (Math.floor(k / 3) - (Math.ceil(it.count / 3) - 1) / 2) * 0.62;
        c.paint(tone(COL.barrel, k), "steel"); c.cyl(x, z, 0, 0.28, 0.88, 14);
        c.paint(shade(COL.barrel, -0.5), "steel"); for (const y of [0.2, 0.6]) c.cyl(x, z, y, 0.285, 0.03, 14);
        c.paint(COL.galv, "galv"); c.cyl(x, z, 0.88, 0.2, 0.02, 12);
      }
    }},
  tyres: {name: "Tyre stack", mount: "floor", collision: true,
    params: [{k: "count", label: "Tyres", min: 1, max: 8, step: 1}], defaults: {count: 4},
    size: () => [0.8, 0.8], height: it => 0.2 * it.count,
    build(c, it) {
      for (let k = 0; k < it.count; k++) {
        c.paint(tone(COL.rubber, k), "rubber"); c.cyl(0, 0, k * 0.2, 0.38, 0.2, 14);
        c.paint(COL.steel, "steel"); c.cyl(0, 0, k * 0.2 + 0.1, 0.18, 0.02, 10);
        c.paint(shade(COL.rubber, 1), "rubber"); c.cyl(0, 0, k * 0.2, 0.39, 0.02, 14); c.cyl(0, 0, k * 0.2 + 0.18, 0.39, 0.02, 14);
      }
    }},
};
for (const [k, g] of Object.entries({innerwall: "Walls and doors", workbench: "Workshop", toolwall: "Workshop", lift: "Workshop", pit: "Workshop", shelves: "Storage", barrels: "Storage", tyres: "Storage"})) CATALOG[k].group = g;

/** Sheds are left empty to start with: the floor is for vehicles. The player places a workbench, shelving, a lift or a pit. */
function autoFurnish() { return {style: "shed", items: []}; }

const falu = {wallCladding: "lockpanel", wallColor: "#8E2A1E", trimColor: "#F2EFE8"};
export default {
  id: "shed",
  name: "Shed",
  plural: "Sheds",
  category: "sheds",
  walkIn: true,
  defaults: {ceiling: false, insideSame: true, winStyle: "single", doorStyle: "sliding"},
  sections: [],
  hides: ["Interior", "Kupor (dormers)"],
  /** Settings as this kind uses them: no sleep point, rooms or dormers. */
  normalize: p => ({...p, interior: false, dormers: []}),
  placeable: p => objectOf(p, "workshop")
    ? {type: "garageWorkshopSolarPanels", fn: "$l10n_function_workshop", shop: {category: "sheds", type: "placeable", brush: "buildings", tab: "sheds"},
      note: `Vehicle workshop: use <placeable type="garageWorkshopSolarPanels" ...>, as in the base game's garages with a workshop.`}
    : {type: "simplePlaceable", fn: "$l10n_function_decoration", shop: {category: "sheds", type: "placeable", brush: "buildings", tab: "sheds"}},
  description: p => `A ${(+p.width).toFixed(1)} x ${(+p.depth).toFixed(1)} m shed made with House to i3d.${objectOf(p, "workshop") ? " Repair and paint your vehicles inside." : ""}`,
  furnish,
  catalog: CATALOG,
  autoFurnish,
  scene,
  // the game objects: a vehicle workshop is optional
  objects: {types: ["workshop"], required: [], defaults: defaultObjects},
  presets: [
    {id: "garage", name: "Garage", blurb: "6 × 6 m red garage with a sliding door, room for a car or a tractor.", settings: {
      ...falu, width: 6, depth: 6, floors: 1, floorHeight: 3.2, foundation: 0.2, foundationColor: "#8C8A84", roofType: "gable", ridge: "width", roofPitch: 28, overhang: 0.4,
      roofMaterial: "tiles", roofColor: "#2B2D2F", chimney: false, gutters: true, downpipes: 2, ventilators: 0,
      winFront: 0, winBack: 1, winLeft: 1, winRight: 1, winW: 0.9, winH: 0.7, sill: 1.5,
      doorWall: "front", doorPos: 0, doorW: 3, doorH: 2.6, doorColor: "#F2EFE8", entrance: "none", doorStyle: "sliding",
      modPrice: 18000, modUpkeep: 40}},
    {id: "maskinhall", name: "Maskinhall", blurb: "20 × 12 m machine hall with a low metal roof and a tall sliding door, for tractors and implements.", settings: {
      wallCladding: "lockpanel", wallColor: "#A8A398", trimColor: "#3B3F42", width: 20, depth: 12, floors: 1, floorHeight: 5, foundation: 0.3, foundationColor: "#8C8A84",
      roofType: "gable", ridge: "width", roofPitch: 14, overhang: 0.5, roofMaterial: "metal", roofColor: "#4A4F52", chimney: false, gutters: true, downpipes: 2, ventilators: 2,
      winFront: 0, winBack: 6, winLeft: 0, winRight: 0, winW: 1.4, winH: 0.6, sill: 3.4,
      doorWall: "front", doorPos: 0, doorW: 6, doorH: 4.4, doorColor: "#3B3F42", entrance: "none", doorStyle: "sliding", winStyle: "single",
      modPrice: 65000, modUpkeep: 120}},
    {id: "vedbod", name: "Vedbod", blurb: "5 × 3 m woodshed with plank walls and a plain door, for tools and firewood.", settings: {
      wallCladding: "vertical", wallColor: "#6E4B33", trimColor: "#4A3322", width: 5, depth: 3, floors: 1, floorHeight: 2.3, foundation: 0.15, foundationColor: "#8C8A84",
      roofType: "gable", ridge: "width", roofPitch: 25, overhang: 0.4, roofMaterial: "metal", roofColor: "#3B3F42", chimney: false, gutters: false, downpipes: 0, ventilators: 0,
      winFront: 0, winBack: 0, winLeft: 1, winRight: 0, winW: 0.6, winH: 0.5, sill: 1.4,
      doorWall: "front", doorPos: 0, doorW: 1.1, doorH: 1.9, doorColor: "#4A3322", entrance: "none", doorStyle: "plank",
      modPrice: 3500, modUpkeep: 5}},
  ],
};
