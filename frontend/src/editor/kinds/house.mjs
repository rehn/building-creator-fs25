// Farmhouse: a house with rooms seen through the windows and, optionally, a sleep point that makes
// it an FS25 farmhouse placeable. Imports only the i3d writer; the core hands in the rest.
import { tg, camera } from "../i3d.mjs";
import { wallsOf, openingSpan } from "../layout.mjs";
import { placeOnWall } from "../places.mjs";
import { objectOf, boxFrom } from "../objects.mjs";
import { CATALOG, autoFurnish } from "./furniture.mjs";

/**
 * Scene nodes and placeable XML for the sleep point. c: export context from the core
 * {p, geo, box(name, {center, size}, attrs), trigger(group, mask), sleepPoint(geo, p)}.
 */
function scene(c) {
  const {p, geo} = c;
  const sp = c.sleepPoint(geo, p);
  if (!sp) return {nodes: [], xml: "", areas: []};
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
/**
 * Where the sleep point goes to start with: in front of the first door (the window list's first), 1.8 m
 * square, 2.2 m high above the floor; none when the house had it turned off (saves from before objects).
 */
function defaultObjects(p) {
  if (p.sleepPoint === false) return [];
  const walls = wallsOf(p), doors = (p.windows || []).filter(w => w.type === "door" && w.floor === 0 && walls[w.wall]).sort((a, b) => a.id - b.id);
  const pl = placeOnWall(walls, doors.length ? doors[0].wall : "front", (w, key) => {
    const d = doors.find(x => x.wall === key), s = d ? openingSpan(d, w.L).reduce((u, v) => (u + v) / 2) : w.L / 2;
    return {s, d: 0.9, along: 1.8, out: 1.8, h: p.foundation + 2.2, icon: [s, 0.9]};
  });
  return [boxFrom("sleep", pl.box, pl.icon)];
}

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
  placeable: p => objectOf(p, "sleep")
    ? {type: "farmhouse", fn: "$l10n_function_farmHouse", shop: {category: "farmhouses", type: "placeable", brush: "buildings", tab: "farmhouses"},
      note: `Sleep point: use <placeable type="farmhouse" ...> so the player can sleep here, as in the base game's farmhouses.`}
    : {type: "simplePlaceable", fn: "$l10n_function_decoration", shop: {category: "farmhouses", type: "placeable", brush: "buildings", tab: "farmhouses"}},
  description: p => `A ${(+p.width).toFixed(1)} x ${(+p.depth).toFixed(1)} m house made with House to i3d.${objectOf(p, "sleep") ? " Sleep here to skip the night." : ""}`,
  scene,
  // the sleep point is optional: with one, the house is a farmhouse in the game
  objects: {types: ["sleep"], required: [], defaults: defaultObjects},
  presets: [
    {id: "farmhouse", name: "Farmhouse", blurb: "Two-storey red farmhouse with a porch. Players can sleep here.", settings: {}},
  ],
};
