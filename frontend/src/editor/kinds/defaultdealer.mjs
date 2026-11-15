// Default dealer: the map's one vehicle shop, where the player buys anything from the shop menu and the bought vehicles appear. In the base game
// this is not a placeable: the map's i3d has a shop trigger (a trigger shape with the shopping icon and the player's spot as its children, script
// callback ShopTrigger.onCreate) and store spawn places (a start node with the end node as its child, BaseMission.onCreateStoreSpawnPlace), and
// each map has one of each. Here it is a walk-in hall as an ordinary placeable that has those nodes with the same names and callbacks (as user
// attributes), made for a map to place once. The two game objects are the dealership's (the counter and the spawn area), so the hall, the pieces
// and the editor are the same; the difference is the export: no vehicle buying station with a list of vehicles, no type of its own.
// Not yet tried in the game: whether the game runs the callbacks for a placeable; if not, the nodes can be copied into the map's i3d.
// Imports only the i3d writer and the dealership's pieces (see kinds/index.mjs).
import { tg, refNode } from "../i3d.mjs";
import { objectOf, boxOf, iconOf } from "../objects.mjs";
import dealership, { CATALOG, furnish, autoFurnish, defaultObjects } from "./dealership.mjs";

const MARKER = "$data/shared/assets/marker/markerIconShopping.i3d";

/**
 * Scene, as the base game's map has it: the shop trigger at the counter (children by position: the shopping icon first, the player's spot second,
 * which is where the player stands, facing the counter, when the shop is closed) and the first store spawn place along the spawn area's long side.
 */
function scene(c) {
  const {p, doc} = c, counter = objectOf(p, "counter"), spawn = objectOf(p, "spawn");
  if (!counter || !spawn) return {nodes: [], xml: "", areas: []};
  const F = +p.foundation, b = boxOf(counter), [cx, cy, cz] = b.center, [ix, , iz] = iconOf(counter);
  // the player stands on the front side of the counter, inside the hall
  const spot = [cx, F, Math.min(cz + counter.d / 2 + 0.5, p.depth / 2 - 0.4)];
  const alongX = spawn.w >= spawn.d, len = alongX ? spawn.w : spawn.d;
  const a = alongX ? [spawn.x - len / 2, 0, spawn.z] : [spawn.x, 0, spawn.z - len / 2], d = alongX ? [len, 0, 0] : [0, 0, len];
  const trigger = c.box("vehicleShopTrigger", b, {...c.trigger("0x20000000", "0x100000"), userAttributes: [["onCreate", "scriptCallback", "ShopTrigger.onCreate"]]}, [
    refNode("markerIconShopping", {translation: [ix - cx, F - cy, iz - cz], referenceId: doc.file(MARKER)}),
    tg("vehicleShopPlayerSpawn", [spot[0] - cx, spot[1] - cy, spot[2] - cz]),
  ]);
  const place = tg("storeSpawnPlace1Start", a, [tg("storeSpawnPlace1End", d)],
    {userAttributes: [["onCreate", "scriptCallback", "BaseMission.onCreateStoreSpawnPlace"], ["yOffset", "float", 0.1]]});
  const xml = `
    <!-- The shop: vehicleShopTrigger and storeSpawnPlace1Start/End are the nodes of the base game's map shop, with their onCreate callbacks as user
         attributes. If the game does not run them for a placeable, copy the nodes (with their user attributes) into the map's i3d: a map has one shop. -->
`;
  return {nodes: [tg("shop", [0, 0, 0], [trigger, place])], xml, areas: []};
}

const base = id => dealership.presets.find(x => x.id === id).settings;

export default {
  id: "defaultdealer",
  name: "Default dealer",
  plural: "Default dealers",
  category: "shops",
  walkIn: true,
  defaults: {ceiling: false, insideSame: true, winStyle: "single", doorStyle: "sliding", shopBuyable: true},
  sections: [
    {title: "Map shop", tab: "game", hint: "The map's own vehicle shop: the player walks into the shop trigger (under Game objects) to open the shop menu, and the vehicles bought from the menu appear on the delivery place outside. A map has one. Turn the shop box off when the map places the building for you.", fields: [
      {k: "shopBuyable", label: "Can be bought and sold in the shop (for trying it out)", type: "check"}]},
  ],
  hides: ["Interior", "Kupor (dormers)"],
  /** Settings as this kind uses them: no sleep point, rooms or dormers. */
  normalize: p => ({...p, interior: false, dormers: []}),
  /** An ordinary placeable; sellable: false leaves it out of the shop and makes it unsellable (for a map that places it). */
  placeable: p => ({type: "simplePlaceable", fn: "$l10n_function_decoration", sellable: p.shopBuyable !== false, shop: {category: "sheds", type: "placeable", brush: "buildings", tab: "sheds"},
    note: `Default dealer: the map's shop nodes (vehicleShopTrigger, storeSpawnPlace1Start/End) with their onCreate callbacks as user attributes.`}),
  description: p => `A ${(+p.width).toFixed(1)} x ${(+p.depth).toFixed(1)} m shop for the map, made with House to i3d. Buy vehicles at the counter and they appear outside.`,
  furnish,
  catalog: CATALOG,
  autoFurnish,
  scene,
  // the game objects: the counter (shop trigger) and the spawn area (delivery place) are both needed
  objects: {types: ["counter", "spawn"], required: ["counter", "spawn"], defaults: defaultObjects, labels: {
    counter: {name: "Shop trigger", hint: "Walk into the box to open the shop menu. The shopping icon floats over it, and the player stands in front of it when the menu is closed. It goes inside the building, by the counter."},
    spawn: {name: "Delivery place", hint: "Where the vehicles bought from the shop menu appear: they line up along the long side of the box. Keep it on open ground outside the building, with room for the biggest machine."}}},
  presets: [
    {id: "kartensbutik", name: "Kartans butik", blurb: "20 × 12 m showroom hall with a wide sliding door: the map's vehicle shop, with a delivery place out front.", settings: base("maskinaffar")},
    {id: "lillabutiken", name: "Lilla butiken", blurb: "12 × 9 m smaller shop with a sliding door and a counter, for the map's vehicle shop.", settings: base("traktorhandlare")},
  ],
};
