// Farmhouse: a house with rooms seen through the windows and, optionally, a sleep point that makes
// it an FS25 farmhouse placeable. Imports only the i3d writer; the core hands in the rest.
import { tg, camera } from "../i3d.mjs";

/**
 * Scene nodes and placeable XML for the sleep point. c: export context from the core
 * {p, geo, box(name, {center, size}, attrs), trigger(group, mask), sleepPoint(geo, p)}.
 */
function scene(c) {
  const {p, geo} = c;
  if (!p.sleepPoint) return {nodes: [], xml: "", areas: []};
  const sp = c.sleepPoint(geo, p);
  const nodes = [tg("farmhouseFeatures", [0, 0, 0], [
    c.box("sleepingTrigger", sp.trigger, c.trigger("0x20000000", "0x100000")),
    tg("sleepTriggerMarker", sp.marker),
    tg("spawnPoint", sp.spawn.pos, [], {rotation: sp.spawn.rot}),
    camera("sleepCamera", {translation: sp.camera.pos, rotation: sp.camera.rot, fov: "54.4322", nearClip: "0.1", farClip: "560"}),
  ])];
  const xml = `
    <hotspots>
        <hotspot type="FARM" linkNode="0>" teleportNode="spawnPoint"/>
    </hotspots>

    <triggerMarkers>
        <triggerMarker node="sleepTriggerMarker" filename="$data/shared/assets/marker/markerIconSleep.i3d"/>
    </triggerMarkers>

    <farmhouse spawnNode="spawnPoint">
        <sleeping triggerNode="sleepingTrigger" cameraNode="sleepCamera"/>
    </farmhouse>
`;
  return {nodes, xml, areas: []};
}
/** The farmhouse's game places, for the editor (places.mjs). */
const PLACES = [
  {id: "sleep", name: "Sleep point", hint: "Walk into the box to get the option to sleep; the bed icon floats over it. It starts at the first door; on another wall it goes to that wall's first door, or its middle.", wall: true, glyph: "sleep"},
];
/** What the preview shows of the game places: [{id, name, box, icon, glyph}]; nothing without a sleep point. */
const gamePlaces = c => {
  if (!c.p.sleepPoint) return [];
  const sp = c.sleepPoint(c.geo, c.p);
  return [{id: "sleep", name: PLACES[0].name, glyph: "sleep", box: sp.trigger, icon: sp.marker, wall: sp.place.wall, dims: [sp.place.along, sp.place.out, sp.place.h]}];
};

export default {
  id: "house",
  name: "Farmhouse",
  plural: "Farmhouses",
  category: "homes",
  walkIn: false,
  defaults: {},
  sections: [],
  hides: ["Inside"],
  normalize: p => p,
  placeable: p => p.sleepPoint
    ? {type: "farmhouse", fn: "$l10n_function_farmHouse", shop: {category: "farmhouses", type: "placeable", brush: "buildings", tab: "farmhouses"},
      note: `Sleep point: use <placeable type="farmhouse" ...> so the player can sleep here, as in the base game's farmhouses.`}
    : {type: "simplePlaceable", fn: "$l10n_function_decoration", shop: {category: "farmhouses", type: "placeable", brush: "buildings", tab: "farmhouses"}},
  description: p => `A ${(+p.width).toFixed(1)} x ${(+p.depth).toFixed(1)} m house made with House to i3d.${p.sleepPoint ? " Sleep here to skip the night." : ""}`,
  scene,
  places: PLACES,
  gamePlaces,
  presets: [
    {id: "farmhouse", name: "Farmhouse", blurb: "Two-storey red farmhouse with a porch. Players can sleep here.", settings: {}},
  ],
};
