// Grain silo: an intake hall with round silos beside it, a selling station that buys the grain the player chooses. It is never in the shop:
// like the base game's own selling points (mapUS/sellingPoints/grainRiverSilo01Triggers) it has canBeSold and showInStore false, and a map
// places it. The nodes and the XML follow that file: unloadStationTrailer (turned 90 degrees) > unloadNodeTrailer (a kinematic collision shape
// the vehicles' unloading finds, group 0x40000000, mask 0x20000000), unloadMarkerTrailer, unloadNodeAI; the game's own hopper
// (sellingStationGenericMedium.i3d) loaded on the unload node; hotspot UNLOADING. Left out for now: the AI helper's spline (aiSpline), the pallet and
// bale triggers. Not yet tried in the game; `fillTypes` on the unloadTrigger (the game's own uses fillTypeCategories) is to be checked against placeable.xsd.
// The hall is a shed's (kinds/shed.mjs). Imports only the i3d writer, the objects and the shed (see kinds/index.mjs).
import { tg } from "../i3d.mjs";
import { objectOf, boxOf, iconOf } from "../objects.mjs";
import shed from "./shed.mjs";

/** What the station can buy: [setting, the game's fill type, name]. Wheat when none is ticked. */
export const GRAINS = [
  ["buyWheat", "WHEAT", "Wheat"], ["buyBarley", "BARLEY", "Barley"], ["buyOat", "OAT", "Oat"], ["buyCanola", "CANOLA", "Canola"],
  ["buyMaize", "MAIZE", "Maize"], ["buySoybean", "SOYBEAN", "Soybeans"], ["buySunflower", "SUNFLOWER", "Sunflowers"], ["buySorghum", "SORGHUM", "Sorghum"],
];
const MAX_SILOS = 4;
const HOPPER = "$data/placeables/shared/sellingStationGeneric/sellingStationGenericMedium.i3d";
const MARKER = "$data/shared/assets/marker/markerIconUnload.i3d";

export const grainsFor = p => {
  const on = GRAINS.filter(([k]) => p[k]).map(g => g[1]);
  return on.length ? on : ["WHEAT"];
};

/** Where the silos stand: [{x, z, r, h}], side by side along the chosen side, a roof's overhang away from the wall. */
export function siloSpots(p) {
  const n = Math.max(0, Math.min(MAX_SILOS, Math.round(+p.siloCount || 0))), r = +p.siloRadius, h = +p.siloHeight;
  const W = +p.width, D = +p.depth, gap = (+p.overhang || 0) + 0.6, step = 2 * r + 0.5;
  return Array.from({length: n}, (_, k) => {
    const a = (k - (n - 1) / 2) * step, out = r + gap;
    switch (p.siloSide) {
      case "front": return {x: a, z: D / 2 + out, r, h};
      case "left": return {x: -W / 2 - out, z: a, r, h};
      case "right": return {x: W / 2 + out, z: a, r, h};
      default: return {x: a, z: -D / 2 - out, r, h};
    }
  });
}

const COL = {steel: "#B3B9BC", dark: "#8D9498", concrete: "#9A968C"};

/** The silos, outside the walls: a galvanised tank on a concrete ring with a stepped cone roof, and a solid collision box. */
function outside(c) {
  for (const s of siloSpots(c.p)) {
    const at = y => [s.x, y, s.z], seg = Math.max(16, Math.round(s.r * 5));
    c.paint(COL.concrete, "concrete"); c.cyl(at(0), s.r + 0.15, 0.35, seg);
    c.paint(COL.steel, "galv"); c.cyl(at(0.35), s.r, s.h, seg);
    c.paint(COL.dark, "galv");
    for (const [k, f] of [[0, 0.92], [1, 0.7], [2, 0.42], [3, 0.16]]) c.cyl(at(0.35 + s.h + k * 0.3), s.r * f, 0.3, seg);
    const q = s.r * 0.8;
    c.abox("collision", [s.x - q, 0, s.z - q], [s.x + q, 0.35 + s.h + 1.2, s.z + q]);
  }
}

/** The intake to start with: a box over the hall's floor near the front, its icon in the middle. */
function defaultObjects(p) {
  const w = Math.max(2, Math.min(6, p.width - 1)), d = Math.max(2, Math.min(5, p.depth - 1));
  return [{type: "intake", x: 0, z: p.depth / 2 - d / 2 - 0.4, w, d, h: p.foundation + 1.5, ix: 0, iz: 0}];
}

/**
 * Scene: the game's unload station (the unload node as a box over the intake, the marker, the AI node) turned 90 degrees as in the base game, so
 * what is in it is given in that turned frame (world x = its z, world z = -its x); and the XML of the selling station.
 */
function scene(c) {
  const {p} = c, o = objectOf(p, "intake");
  if (!o) return {nodes: [], xml: "", areas: siloSpots(p).map(s => ({x0: s.x - s.r - 0.2, x1: s.x + s.r + 0.2, z0: s.z - s.r - 0.2, z1: s.z + s.r + 0.2}))};
  const F = +p.foundation, local = ([x, y, z]) => [z, y, -x], b = boxOf(o), [ix, , iz] = iconOf(o);
  const nodes = [tg("unloadStationTrailer", [0, 0, 0], [
    c.box("unloadNodeTrailer", {center: local(b.center), size: [b.size[2], b.size[1], b.size[0]]},
      {kinematic: true, compound: true, collisionFilterGroup: "0x40000000", collisionFilterMask: "0x20000000"}),
    tg("unloadMarkerTrailer", local([ix, F, iz])),
    tg("unloadNodeAI", local([o.x, F, o.z + o.d / 2])),
  ], {rotation: [0, 90, 0]})];
  const price = +((+p.sellPrice || 100) / 100).toFixed(3);
  const xml = `
    <triggerMarkers>
        <triggerMarker node="unloadMarkerTrailer" filename="${MARKER}"/>
    </triggerMarkers>

    <hotspots>
        <hotspot type="UNLOADING" linkNode="unloadMarkerTrailer" teleportNode="unloadMarkerTrailer"/>
    </hotspots>
${p.siloHopper === false ? "" : `
    <dynamicallyLoadedParts>
        <dynamicallyLoadedPart filename="${HOPPER}" node="0" linkNode="unloadNodeTrailer" position="0.05 -0.01 0.3" rotation="0 90 0"/>
    </dynamicallyLoadedParts>
`}
    <sellingStation supportsExtension="false" litersForFullPriceDrop="200000" fullPriceRecoverHours="48">
        <unloadTrigger exactFillRootNode="unloadNodeTrailer" fillTypes="${grainsFor(p).join(" ")}" priceScale="${price}" aiNode="unloadNodeAI"/>
    </sellingStation>
`;
  const areas = siloSpots(p).map(s => ({x0: s.x - s.r - 0.2, x1: s.x + s.r + 0.2, z0: s.z - s.r - 0.2, z1: s.z + s.r + 0.2}));
  return {nodes, xml, areas};
}

const base = {...shed.presets.find(x => x.id === "maskinhall").settings};
export default {
  id: "grainsilo",
  name: "Grain silo",
  plural: "Grain silos",
  category: "stations",
  walkIn: true,
  defaults: {...shed.defaults, openFront: true, sellPrice: 100, siloCount: 2, siloRadius: 3.5, siloHeight: 14, siloSide: "back", siloHopper: true,
    ...Object.fromEntries(GRAINS.map(([k]) => [k, ["buyWheat", "buyBarley", "buyOat", "buyCanola", "buyMaize"].includes(k)]))},
  sections: [
    {title: "Silos", tab: "building", detail: true, hint: "Round tanks beside the hall, in a row along the side you choose. They are solid: vehicles and players cannot walk through them.", fields: [
      {k: "siloCount", label: "Number of silos", min: 0, max: MAX_SILOS, step: 1},
      {k: "siloRadius", label: "Radius", min: 1.5, max: 8, step: 0.1, unit: " m"},
      {k: "siloHeight", label: "Height of the tank", min: 5, max: 30, step: 0.5, unit: " m"},
      {k: "siloSide", label: "Side of the hall", type: "select", options: [["back", "Back"], ["front", "Front"], ["left", "Left"], ["right", "Right"]]}]},
    {title: "What it buys", tab: "game", hint: "The grain the station buys: the player tips it at the intake (under Game objects) and is paid the game's price for it. With none ticked it buys wheat. It cannot be bought or sold: a map places it.", fields: [
      ...GRAINS.map(([k, , name]) => ({k, label: name, type: "check"})),
      {k: "sellPrice", label: "Price, per cent of the game's own", min: 50, max: 200, step: 5, unit: " %"},
      {k: "siloHopper", label: "The game's tipping hopper at the intake", type: "check"}]},
    ...shed.sections,
  ],
  hides: shed.hides,
  normalize: shed.normalize,
  /** A selling station like the game's own: not for sale, not sellable. */
  placeable: () => ({type: "sellingStation", fn: "$l10n_function_decoration", sellable: false, shop: {category: "placeableMisc", type: "placeable", brush: "buildings", tab: "sheds"},
    note: `Grain silo: use <placeable type="sellingStation" ...> with canBeSold and showInStore false, as the base game's selling points (mapUS/sellingPoints).`}),
  description: p => `A ${(+p.width).toFixed(1)} x ${(+p.depth).toFixed(1)} m grain silo made with House to i3d. It buys ${grainsFor(p).length} kinds of grain.`,
  furnish: shed.furnish,
  catalog: shed.catalog,
  autoFurnish: shed.autoFurnish,
  outside,
  scene,
  objects: {types: ["intake"], required: ["intake"], defaults: defaultObjects, labels: {}},
  presets: [
    {id: "kornsilo", name: "Kornsilo", blurb: "14 × 10 m intake hall, open at the front, with two galvanised silos behind it: the map's grain buyer.", settings: {
      ...base, width: 14, depth: 10, floorHeight: 5, openFront: true, winBack: 0, doorWall: "left", doorPos: 0, doorW: 1.1, doorH: 2.1, doorStyle: "plank",
      siloCount: 2, siloRadius: 3.5, siloHeight: 14, siloSide: "back", modPrice: 0, modUpkeep: 0}},
    {id: "spannmalsdepa", name: "Spannmålsdepå", blurb: "24 × 14 m hall with four big silos along the back, for a larger map.", settings: {
      ...base, width: 24, depth: 14, floorHeight: 6, openFront: true, winBack: 0, doorWall: "left", doorPos: 0, doorW: 1.1, doorH: 2.1, doorStyle: "plank",
      siloCount: 4, siloRadius: 4.2, siloHeight: 18, siloSide: "back", modPrice: 0, modUpkeep: 0}},
  ],
};
