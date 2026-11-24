// The vehicle shop: a shop counter (walk into it to open the shop) and a delivery place (where a bought vehicle appears), two game objects (objects.mjs
// "counter", "spawn") that any building can have, and the vehicles it sells (vehicles.mjs, made from the game by scripts/gen-vehicles.mjs), chosen by group in the
// settings (sellTractors ...). The game has no placeable type with the "vehicleBuyingStation" specialization, so the mod defines one (gameobjects.mjs sharedPlaceable).
// The dealership is a building that has one; the map's shop (defaultdealer) and the warehouse use the counter for their own (kind.handles).
import { tg } from "../i3d.mjs";
import { objectOf, boxOf, iconOf } from "../objects.mjs";
import VEHICLES from "../vehicles.mjs";

/** The groups of vehicles a vehicle shop can sell: the setting that switches it on, its name, and which of the game's store categories are in it. */
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

/** Counter just inside the front wall in the middle, and the delivery place on open ground in front of it. (The map's shop has the same.) */
export function shopDefaults(p) {
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
export function shopScene(c) {
  const {p} = c, counter = objectOf(p, "counter"), spawn = objectOf(p, "spawn");
  if (!counter || !spawn) return {nodes: [], xml: "", areas: []};
  const [ix, iy, iz] = iconOf(counter), alongX = spawn.w >= spawn.d, len = alongX ? spawn.w : spawn.d, wid = alongX ? spawn.d : spawn.w;
  const a = alongX ? [spawn.x - len / 2, 0, spawn.z] : [spawn.x, 0, spawn.z - len / 2], d = alongX ? [len, 0, 0] : [0, 0, len];
  const nodes = [
    tg("shop", [0, 0, 0], [c.box("shopTrigger", boxOf(counter), c.trigger("0x20000000", "0x100000")), tg("markerShop", [ix, p.foundation + iy, iz])]),
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
        <trigger node="shopTrigger" text="Buy vehicles"/>
        <spawnPlaces>
            <spawnPlace startNode="vehicleSpawnStart01" endNode="vehicleSpawnEnd01" width="${wid.toFixed(2)}" maxWidth="${wid.toFixed(2)}" maxLength="${Math.min(len, 14).toFixed(2)}" maxHeight="${spawn.h.toFixed(2)}"/>
        </spawnPlaces>
${items}
    </vehicleBuyingStation>
`;
  return {nodes, xml, areas: []};
}
