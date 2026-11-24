// Warehouse: a shop where the player buys pallets of goods and sells goods, the game's `warehouse` placeable type (a sellingStation with a palletBuyingStation). The shop itself is
// game objects any building can have (kinds/palletshop.mjs: the counter, the delivery area and the selling area, with the lists of goods and the prices); the warehouse is a building with
// them. Like the base game's own it is placed by a map; shopBuyable puts it in the shop to try it out. Not yet tried in the game.
// The hall and its inside are a dealership's (kinds/dealership.mjs). Imports only the i3d writer, the objects and the other kinds (see kinds/index.mjs).
import { palletDefaults } from "./palletshop.mjs";
import dealership, { CATALOG, furnish, autoFurnish } from "./dealership.mjs";

const base = dealership.presets.find(x => x.id === "traktorhandlare").settings;
export default {
  id: "warehouse",
  name: "Warehouse",
  plural: "Warehouses",
  category: "shops",
  walkIn: true,
  defaults: {ceiling: false, insideSame: true, winStyle: "single", doorStyle: "plank", shopBuyable: false},
  sections: [
    {title: "In the shop", tab: "game", fields: [
      {k: "shopBuyable", label: "Can be bought in the shop (to try it out; the game's own is placed by a map)", type: "check"}]},
  ],
  hides: ["Interior", "Kupor (dormers)"],
  normalize: p => ({...p, interior: false, dormers: []}),
  /** Not for sale unless shopBuyable (the warehouse type: gameobjects.mjs sharedPlaceable, for the pallet shop). */
  placeable: p => ({type: "simplePlaceable", fn: "$l10n_function_decoration", sellable: p.shopBuyable === true, shop: {category: "placeableMisc", type: "placeable", brush: "buildings", tab: "sheds"}}),
  description: p => `A ${(+p.width).toFixed(1)} x ${(+p.depth).toFixed(1)} m shop made with House to i3d. Buy pallets of ${p.buyList.length} kinds of goods and sell ${p.sellList.length} kinds.`,
  furnish,
  catalog: CATALOG,
  autoFurnish,
  // the game objects: the shop counter, the delivery area (pallets appear) and the selling area (goods are tipped or put down) are all needed
  objects: {types: ["palletcounter", "palletspawn", "unload"], required: ["palletcounter", "palletspawn", "unload"], defaults: palletDefaults},
  presets: [
    {id: "affar", name: "Affär", blurb: "12 × 9 m shop with a counter inside, pallets delivered at the side and a selling area out front: buy and sell goods.", settings: {
      ...base, modPrice: 0, modUpkeep: 0}},
  ],
};
