// The fuel area: where the player fills up, as the base game's own gas station (mapUS/sellingPoints/gasStation) is a buyingStation. A game object ("pump", objects.mjs)
// any building can have; the fuel station is a building with one, and with the pumps drawn on their island (kinds/fuelstation.mjs). The nodes follow that file:
// gasStation > gasStationTrigger (a static trigger shape, group 0x20000000, mask 0x40000000) and mapPosition (the hotspot FUEL's node);
// <loadTrigger fillTypes="DIESEL" fillLitersPerSecond autoStart infiniteCapacity> and <fillType name="diesel" priceScale>.
// The game's mapPositionIndex user attribute on gasStation is left out (its use is unknown). Not tried in the game.
// Imports only the i3d writer and the objects.
import { tg } from "../i3d.mjs";
import { objectOf, boxOf, iconOf } from "../objects.mjs";

export const MAX_PUMPS = 6, STEP = 1.9;

/** Where the pumps stand: x of each, in a row along the canopy's width, the middle of the row at the middle of the canopy. (A building without pumps has none.) */
export function pumpSpots(p) {
  const n = Math.max(0, Math.min(MAX_PUMPS, Math.round(+p.pumpCount || 0)));
  return Array.from({length: n}, (_, k) => (k - (n - 1) / 2) * STEP);
}

/** The fuel area to start with: over the island and the lanes beside it, high enough for a tall tractor. */
export function pumpDefaults(p) {
  const n = pumpSpots(p).length, len = Math.max(3, (n - 1) * STEP + 2);
  return [{type: "pump", x: 0, z: 0, w: Math.min(p.width, len + 4), d: Math.min(p.depth, 5), h: p.foundation + 4, ix: 0, iz: 0}];
}

/** Scene: the game's gasStation node with its trigger over the fuel area and the map position (the hotspot) at its icon, and the station's XML. */
export function pumpScene(c) {
  const {p} = c, o = objectOf(p, "pump");
  if (!o) return {nodes: [], xml: "", areas: []};
  const b = boxOf(o), [ix, iy, iz] = iconOf(o);
  const nodes = [tg("gasStation", [0, 0, 0], [
    c.box("gasStationTrigger", b, c.trigger("0x20000000", "0x40000000")),
    tg("mapPosition", [ix, +p.foundation + iy, iz]),
  ])];
  const price = +((+p.fuelPrice || 100) / 100).toFixed(3), rate = Math.round(+p.fuelRate || 20);
  const xml = `
    <hotspots>
        <hotspot type="FUEL" linkNode="mapPosition" teleportNode="mapPosition"/>
    </hotspots>

    <buyingStation node="gasStation" supportsExtension="false">
        <loadTrigger triggerNode="gasStationTrigger" fillTypes="DIESEL" fillLitersPerSecond="${rate}" autoStart="true" infiniteCapacity="true" startFillText="$l10n_action_refuel" stopFillText="$l10n_action_stopRefuel"/>
        <fillType name="diesel" priceScale="${price}"/>
    </buyingStation>
`;
  return {nodes, xml, areas: []};
}
