// The grain intake: the game's unload station, a box where the player tips grain from a trailer, and a selling station that buys the grain the settings choose
// (the game's own selling points, mapUS/sellingPoints/grainRiverSilo01Triggers). A game object ("intake", objects.mjs) any building can have; the grain silo is a
// building with one. The nodes and the XML follow that file: unloadStationTrailer (turned 90 degrees) > unloadNodeTrailer (a kinematic collision shape the vehicles'
// unloading finds, group 0x40000000, mask 0x20000000), unloadMarkerTrailer, unloadNodeAI; the game's own hopper (sellingStationGenericMedium.i3d) loaded on the unload
// node; hotspot UNLOADING. Left out for now: the AI helper's spline (aiSpline), the pallet and bale triggers. `fillTypes` on the unloadTrigger (the game's own uses
// fillTypeCategories) is to be checked against placeable.xsd. Imports only the i3d writer and the objects.
import { tg } from "../i3d.mjs";
import { objectOf, boxOf, iconOf } from "../objects.mjs";

/** What the station can buy: [setting, the game's fill type, name]. Wheat when none is ticked. */
export const GRAINS = [
  ["buyWheat", "WHEAT", "Wheat"], ["buyBarley", "BARLEY", "Barley"], ["buyOat", "OAT", "Oat"], ["buyCanola", "CANOLA", "Canola"],
  ["buyMaize", "MAIZE", "Maize"], ["buySoybean", "SOYBEAN", "Soybeans"], ["buySunflower", "SUNFLOWER", "Sunflowers"], ["buySorghum", "SORGHUM", "Sorghum"],
];
const HOPPER = "$data/placeables/shared/sellingStationGeneric/sellingStationGenericMedium.i3d";
const MARKER = "$data/shared/assets/marker/markerIconUnload.i3d";

/** The fill types the station buys: the ticked grains, wheat if none. */
export const grainsFor = p => {
  const on = GRAINS.filter(([k]) => p[k]).map(g => g[1]);
  return on.length ? on : ["WHEAT"];
};

/** The intake to start with: a box over the hall's floor near the front, its icon in the middle. */
export function intakeDefaults(p) {
  const w = Math.max(2, Math.min(6, p.width - 1)), d = Math.max(2, Math.min(5, p.depth - 1));
  return [{type: "intake", x: 0, z: p.depth / 2 - d / 2 - 0.4, w, d, h: p.foundation + 1.5, ix: 0, iz: 0}];
}

/**
 * Scene: the game's unload station (the unload node as a box over the intake, the marker, the AI node) turned 90 degrees as in the base game, so
 * what is in it is given in that turned frame (world x = its z, world z = -its x); and the XML of the selling station.
 */
export function intakeScene(c) {
  const {p} = c, o = objectOf(p, "intake");
  if (!o) return {nodes: [], xml: "", areas: []};
  const F = +p.foundation, local = ([x, y, z]) => [-z, y, x], b = boxOf(o), [ix, , iz] = iconOf(o);
  const nodes = [tg("unloadStationTrailer", [0, 0, 0], [
    c.box("unloadNodeTrailer", {center: local(b.center), size: [b.size[2], b.size[1], b.size[0]]},
      {kinematic: true, compound: true, collisionFilterGroup: "0x40000000", collisionFilterMask: "0x20000000"}),
    tg("unloadMarkerTrailer", local([ix, F, iz])),
    tg("unloadNodeAI", local([o.x, F, o.z + o.d / 2])),
  ], {rotation: [0, 90, 0]})];
  const price = +((+p.grainPrice || 100) / 100).toFixed(3);
  const xml = `
    <triggerMarkers>
        <triggerMarker node="unloadMarkerTrailer" filename="${MARKER}"/>
    </triggerMarkers>

    <hotspots>
        <hotspot type="UNLOADING" linkNode="unloadMarkerTrailer" teleportNode="unloadMarkerTrailer"/>
    </hotspots>
${p.siloHopper === false ? "" : `
    <dynamicallyLoadedParts>
        <dynamicallyLoadedPart filename="${HOPPER}" node="0" linkNode="unloadNodeTrailer" position="0.05 ${+(-b.center[1] - 0.01).toFixed(3)} 0.3" rotation="0 90 0"/>
    </dynamicallyLoadedParts>
`}
    <sellingStation supportsExtension="false" litersForFullPriceDrop="200000" fullPriceRecoverHours="48">
        <unloadTrigger exactFillRootNode="unloadNodeTrailer" fillTypes="${grainsFor(p).join(" ")}" priceScale="${price}" aiNode="unloadNodeAI"/>
    </sellingStation>
`;
  return {nodes, xml, areas: []};
}
