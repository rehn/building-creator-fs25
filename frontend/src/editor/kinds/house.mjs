// Farmhouse: a house with rooms seen through the windows and, optionally, a sleep point that makes
// it an FS25 farmhouse placeable. Imports only the i3d writer; the core hands in the rest.
import { shopFor } from "./shop.mjs";
const FARMHOUSES = {category: "farmhouses", type: "placeable", brush: "buildings", tab: "farmhouses"};   // (the shop place of the kind: shop.mjs lets the player choose another)
import { SHARED, sharedDefaults } from "./gameobjects.mjs";
/** Whether the house is a farmhouse (you can sleep in it): a sleep point object outside, or the sleep point piece placed in a room. */
const hasSleep = SHARED.sleep.has;
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
  // (a sleep point makes it a farmhouse: gameobjects.mjs sharedPlaceable)
  placeable: p => ({type: "simplePlaceable", fn: "$l10n_function_decoration", shop: shopFor(p, FARMHOUSES)}),
  description: p => `A ${(+p.width).toFixed(1)} x ${(+p.depth).toFixed(1)} m house made with House to i3d.${hasSleep(p) ? " Sleep here to skip the night." : ""}`,
  // the sleep point is optional: with one, the house is a farmhouse in the game
  objects: {types: ["sleep"], required: [], defaults: p => sharedDefaults(p, "sleep")},
  presets: [
    {id: "farmhouse", name: "Farmhouse", blurb: "Two-storey red farmhouse with a porch. Players can sleep here.", settings: {}},
  ],
};
