// Fuel station: a canopy on posts over a row of pumps, where the player fills up. The fuel area (where the player fills up: the game's buyingStation, as the base game's gas
// station) is a game object any building can have (kinds/fuelpump.mjs); the station is a building with one, and with the pumps drawn on their island here. It is never in the shop: like
// the base game's own (mapUS/sellingPoints/gasStation) it has canBeSold and showInStore false, and a map places it.
// The canopy is a shed open on every side (kinds/shed.mjs). Imports only the i3d writer, the objects and the shed (see kinds/index.mjs).
import { tg } from "../i3d.mjs";
import { MAX_PUMPS, pumpSpots, pumpDefaults } from "./fuelpump.mjs";
import shed from "./shed.mjs";

const ISLAND_H = 0.2;
const COL = {island: "#8F8C85", edge: "#D9D6CE", body: "#ECEAE4", accent: "#2A4F94", display: "#2B2F33", hose: "#1E1F20"};

/** The island and the pumps on it: a body with a coloured head, a display on both faces and a nozzle with its hose on both sides. Solid. */
function outside(c) {
  const xs = pumpSpots(c.p);
  if (!xs.length) return;
  const x0 = xs[0] - 1, x1 = xs[xs.length - 1] + 1, hw = 0.55;
  c.paint(COL.island, "concrete"); c.abox("fittings", [x0, 0, -hw], [x1, ISLAND_H, hw]);
  c.paint(COL.edge, "concrete"); c.abox("fittings", [x0 - 0.02, 0, -hw - 0.02], [x1 + 0.02, 0.06, hw + 0.02]);
  for (const x of xs) {
    const y = ISLAND_H;
    c.paint(COL.body); c.abox("fittings", [x - 0.28, y, -0.21], [x + 0.28, y + 1.5, 0.21]);
    c.paint(COL.accent); c.abox("fittings", [x - 0.31, y + 1.5, -0.24], [x + 0.31, y + 1.85, 0.24]);
    c.paint(COL.display);
    for (const s of [-1, 1]) c.abox("fittings", [x - 0.2, y + 1.05, s * 0.2], [x + 0.2, y + 1.4, s * 0.23]);   // (starts inside the body: no face shared with it)
    c.paint(COL.hose);
    for (const s of [-1, 1]) {
      c.abox("fittings", [x + s * 0.28, y + 1.1, -0.05], [x + s * 0.36, y + 1.3, 0.05]);
      c.tube([[x + s * 0.32, y + 1.1, 0], [x + s * 0.42, y + 0.8, 0], [x + s * 0.42, y + 0.45, 0]], 0.02, 6);
    }
  }
  c.abox("collision", [x0, 0, -hw], [x1, ISLAND_H + 1.85, hw]);
}

const base = {...shed.presets.find(x => x.id === "carport").settings};
export default {
  id: "fuelstation",
  name: "Fuel station",
  plural: "Fuel stations",
  category: "stations",
  walkIn: true,
  defaults: {...shed.defaults, openFront: true, openBack: true, openLeft: true, openRight: true, pumpCount: 4},
  sections: [
    {title: "Pumps", tab: "building", detail: true, hint: "A row of pumps on an island under the canopy, along its width. They are solid: vehicles and players cannot walk through them. Where the player fills up is the fuel area (under Game objects).", fields: [
      {k: "pumpCount", label: "Number of pumps", min: 0, max: MAX_PUMPS, step: 1}]},
    ...shed.sections,
  ],
  hides: shed.hides,
  normalize: shed.normalize,
  /** A buying station like the game's own: not for sale, not sellable (the buying station type: gameobjects.mjs sharedPlaceable, for the fuel area). */
  placeable: () => ({type: "simplePlaceable", fn: "$l10n_function_decoration", sellable: false, shop: {category: "placeableMisc", type: "placeable", brush: "buildings", tab: "sheds"}}),
  description: p => `A ${(+p.width).toFixed(1)} x ${(+p.depth).toFixed(1)} m fuel station with ${pumpSpots(p).length} pumps made with House to i3d.`,
  furnish: shed.furnish,
  catalog: shed.catalog,
  autoFurnish: shed.autoFurnish,
  outside,
  objects: {types: ["pump"], required: ["pump"], defaults: pumpDefaults, labels: {}},
  presets: [
    {id: "bensinmack", name: "Bensinmack", blurb: "12 × 7 m canopy on posts with a flat, white roof and a blue edge, over four pumps on an island: fills diesel.", settings: {
      ...base, wallColor: "#F2F2F0", trimColor: "#2A4F94", roofMaterial: "seamed", roofColor: "#F2F2F0", width: 12, depth: 7, floorHeight: 4.6, foundation: 0.1, overhang: 0.8, roofTilt: 3, gutters: false, downpipes: 0,
      openFront: true, openBack: true, openLeft: true, openRight: true, pumpCount: 4, modPrice: 0, modUpkeep: 0}},
  ],
};
