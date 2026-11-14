// Dealership: a showroom hall where the player buys vehicles. In the game a placeable with a vehicle buying station has a trigger (the shop
// counter: walk into it to open the vehicle shop), a list of vehicles from the base game with their prices, and spawn areas where a
// bought vehicle appears. The counter and the spawn area are game objects (objects.mjs "counter", "spawn"); the vehicles are chosen by group
// in the editor (the settings sellTractors ...). The vehicle list is vehicles.mjs, made from the game by scripts/gen-vehicles.mjs.
// The base game has no placeable of this kind, so the mod defines its own placeable type (modDesc <placeableTypes>, see modTypes) with the
// game's "vehicleBuyingStation" specialization; this is not yet tried in the game.
// Imports only the i3d writer; the core hands in what it needs (see kinds/index.mjs).
import { tg } from "../i3d.mjs";
import { objectOf, boxOf, iconOf } from "../objects.mjs";
import { tone } from "./props.mjs";
import { INNER_WALL } from "./innerwall.mjs";
import VEHICLES from "../vehicles.mjs";

/** The groups of vehicles a dealership can sell: the setting that switches it on, its name, and which of the game's store categories are in it. */
export const DEALER_GROUPS = [
  {key: "sellTractors", name: "Tractors", test: /^tractors/},
  {key: "sellLoaders", name: "Loaders and telehandlers", test: /^(frontLoader|teleLoader|wheelLoader|skidSteer|forklift)/},
  {key: "sellHarvesters", name: "Harvesters and headers", test: /(Harvest|harvest|^cutters|^cutterTrailers|Headers|^potatoHarvesting)/},
  {key: "sellSoil", name: "Soil work (ploughs, cultivators, harrows)", test: /^(cultivators|discHarrows|plows|powerHarrows|subsoilers|rollers|stonePickers|spaders|leveler)$/},
  {key: "sellSowing", name: "Seeders and planters", test: /^(seeders|seedTanks|planters|potatoPlanting|vegetablePlanters|ricePlanters|sugarcanePlanters)$/},
  {key: "sellSpreading", name: "Spreaders and sprayers", test: /^(fertilizerSpreaders|manureSpreaders|slurry|sprayers|weeders)/},
  {key: "sellHay", name: "Mowers, balers and hay", test: /^(balers|baleWrappers|baleLoaders|balingMisc|mowers|tedders|windrowers|strawBlowers|loaderWagons|mulchers|grasslandCare)/},
  {key: "sellTransport", name: "Trailers and trucks", test: /^(trailers|lowloaders|trucks|animalTransport|augerWagons|forageMixers|cottonTransport|sugarcaneTransport|beetLoading|woodTransport|barrels|grapeTrailers)/},
  {key: "sellForestry", name: "Forestry", test: /^(forestry|woodChippers)/},
  {key: "sellOther", name: "Everything else (cars, weights, tools)", test: () => true},
];
const groupOf = cat => DEALER_GROUPS.find((g, i) => i < DEALER_GROUPS.length - 1 && g.test.test(cat)) || DEALER_GROUPS[DEALER_GROUPS.length - 1];
/** Vehicles [path, name, brand, category, price] of the groups switched on in p (the tractors if none are). */
export function vehiclesFor(p) {
  const on = DEALER_GROUPS.filter(g => p[g.key]), keys = new Set((on.length ? on : [DEALER_GROUPS[0]]).map(g => g.key));
  return VEHICLES.filter(v => keys.has(groupOf(v[3]).key));
}

const COL = {floor: "#B9B7B0", wood: "#9C7448", dark: "#3C3F42", steel: "#6C7378", red: "#B8382C", paper: "#E9E4D8", green: "#2F8F6F"};

/** The floor: smooth concrete, as a showroom has. */
function furnish(c) { c.floor(COL.floor, "concrete"); }

/** Counter just inside the front wall in the middle, and the spawn area on open ground in front of it. */
function defaultObjects(p) {
  const W = +p.width, D = +p.depth, F = +p.foundation, H = Math.min(3, Math.max(2.2, +p.floorHeight));
  return [
    {type: "counter", x: 0, z: D / 2 - 2, w: 2, d: 1.4, h: F + H, ix: 0, iz: 0},
    {type: "spawn", x: 0, z: D / 2 + 5, w: Math.min(16, W + 4), d: 5, h: 3.5, ix: 0, iz: 0},
  ];
}

/**
 * Scene: the counter's trigger and the shopping icon, the spawn line (start node with the end node as its child) and the vehicle buying
 * station XML with the vehicles for sale.
 */
function scene(c) {
  const {p} = c, counter = objectOf(p, "counter"), spawn = objectOf(p, "spawn");
  if (!counter || !spawn) return {nodes: [], xml: "", areas: []};
  const [ix, , iz] = iconOf(counter), alongX = spawn.w >= spawn.d, len = alongX ? spawn.w : spawn.d, wid = alongX ? spawn.d : spawn.w;
  const a = alongX ? [spawn.x - len / 2, 0, spawn.z] : [spawn.x, 0, spawn.z - len / 2], d = alongX ? [len, 0, 0] : [0, 0, len];
  const nodes = [
    tg("shop", [0, 0, 0], [c.box("shopTrigger", boxOf(counter), c.trigger("0x20000000", "0x100000")), tg("markerShop", [ix, p.foundation, iz])]),
    tg("vehicleSpawnStart01", a, [tg("vehicleSpawnEnd01", d)]),
  ];
  const factor = (+p.sellPrice || 100) / 100, esc = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const items = vehiclesFor(p).map(v => `        <storeItem xmlFilename="${esc(v[0])}" price="${Math.round(v[4] * factor)}" transportCosts="${Math.round(+p.sellDelivery || 0)}"/>`).join("\n");
  const xml = `
    <triggerMarkers>
        <triggerMarker node="markerShop" filename="$data/shared/assets/marker/markerIconShopping.i3d"/>
    </triggerMarkers>

    <hotspots>
        <hotspot type="SHOP" linkNode="shopTrigger" teleportNode="shopTrigger"/>
    </hotspots>

    <!-- The vehicles for sale: ${vehiclesFor(p).length} from the base game. They appear on the spawn line (vehicleSpawnStart01 to vehicleSpawnEnd01). -->
    <vehicleBuyingStation>
        <trigger node="shopTrigger"/>
        <spawnPlaces>
            <spawnPlace startNode="vehicleSpawnStart01" endNode="vehicleSpawnEnd01" width="${wid.toFixed(2)}" maxWidth="${wid.toFixed(2)}" maxLength="${Math.min(len, 14).toFixed(2)}" maxHeight="${spawn.h.toFixed(2)}"/>
        </spawnPlaces>
${items}
    </vehicleBuyingStation>
`;
  return {nodes, xml, areas: []};
}

/* ---------- Pieces ---------- */
const CATALOG = {
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
function autoFurnish() { return {style: "shed", items: []}; }

const sellField = g => ({k: g.key, label: g.name, type: "check"});
const paint = {wallCladding: "lockpanel", wallColor: "#C9C4B6", trimColor: "#3B3F42"};
export default {
  id: "dealership",
  name: "Dealership",
  plural: "Dealerships",
  category: "shops",
  walkIn: true,
  defaults: {ceiling: false, insideSame: true, winStyle: "single", doorStyle: "sliding", sellPrice: 100, sellDelivery: 0,
    ...Object.fromEntries(DEALER_GROUPS.map(g => [g.key, ["sellTractors", "sellLoaders", "sellTransport"].includes(g.key)]))},
  sections: [
    {title: "Vehicles for sale", tab: "game", hint: "What the shop counter sells: pick the groups of the base game's vehicles. The player walks into the counter (under Game objects) to open the shop; a bought vehicle appears in the spawn area outside. With no group ticked it sells tractors.", fields: [
      ...DEALER_GROUPS.map(sellField),
      {k: "sellPrice", label: "Prices, per cent of the game's own", min: 50, max: 200, step: 5, unit: " %"},
      {k: "sellDelivery", label: "Delivery fee", min: 0, max: 20000, step: 500, unit: " $"}]},
  ],
  hides: ["Interior", "Kupor (dormers)"],
  /** Settings as this kind uses them: no sleep point, rooms or dormers. */
  normalize: p => ({...p, interior: false, dormers: []}),
  /** The placeable type is the mod's own (modTypes): its name is the mod's name, a dot and the type's name. */
  placeable: (p, {mod = "FS25_Dealership"} = {}) => ({type: `${mod}.dealership`, fn: "$l10n_function_decoration", shop: {category: "sheds", type: "placeable", brush: "buildings", tab: "sheds"},
    note: `Vehicle dealership: add the placeable type to your modDesc.xml (<placeableTypes>, parent simplePlaceable, specialization vehicleBuyingStation).`}),
  /** Placeable types the mod's modDesc.xml must define: {name, parent, specializations}. */
  modTypes: [{name: "dealership", parent: "simplePlaceable", specializations: ["vehicleBuyingStation"]}],
  description: p => `A ${(+p.width).toFixed(1)} x ${(+p.depth).toFixed(1)} m dealership made with House to i3d. Buy ${vehiclesFor(p).length} vehicles at the counter.`,
  furnish,
  catalog: CATALOG,
  autoFurnish,
  scene,
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
