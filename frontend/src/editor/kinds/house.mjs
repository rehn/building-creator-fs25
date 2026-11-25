// Farmhouse: a house with rooms seen through the windows and, optionally, a sleep point that makes
// it an FS25 farmhouse placeable. Imports only the i3d writer; the core hands in the rest.
import { shopFor } from "./shop.mjs";
const FARMHOUSES = {category: "farmhouses", type: "placeable", brush: "buildings", tab: "farmhouses"};   // (the shop place of the kind: shop.mjs lets the player choose another)
import { CATALOG, autoFurnish } from "./furniture.mjs";

export default {
  id: "house",
  name: "Farmhouse",
  plural: "Farmhouses",
  category: "homes",
  // the ground floor is walked into, under a ceiling (the floors above are closed from inside; their windows
  // have the small rooms behind them); its doors open inwards
  walkIn: true,
  ceiling: "#F4F1EA",
  // what a new house's first door has in front of it
  entrance: "porch",
  insideWalls: {wall: ["#E6DCC6", "whitewash"], low: null, kick: ["#F2EFE8", "wood", 0.12]},
  furnish: c => c.floor("#A9835A", "boards"),
  catalog: CATALOG,
  autoFurnish,
  defaults: {},
  sections: [],
  hides: [],
  normalize: p => ({...p, interior: true}),
  placeable: p => ({type: "simplePlaceable", fn: "$l10n_function_decoration", shop: shopFor(p, FARMHOUSES)}),
  description: p => `A ${(+p.width).toFixed(1)} x ${(+p.depth).toFixed(1)} m house made with House to i3d.`,
  presets: [
    {id: "farmhouse", name: "Farmhouse", blurb: "Two-storey red farmhouse with a porch. Players can sleep here.", settings: {}},
  ],
};
