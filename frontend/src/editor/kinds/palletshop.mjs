// The pallet shop: where the player buys pallets of goods and sells goods, the game's `warehouse` placeable type (a sellingStation with a palletBuyingStation). Three game objects
// any building can have (objects.mjs): palletcounter (the shop counter), palletspawn (where the pallets appear) and unload (the selling area). The warehouse is a building with them.
// Nodes and XML follow the base game's data/placeables/mapAS/warehouseAS/warehouseAS.xml: palletBuyingActivationTrigger (static trigger, group 0x20000000, mask 0x100000) with its marker
// (the shopping icon), palletSpawner > palletAreaStart0n (turned 0 90 0 along x) > palletAreaEnd0n; sellingStation > unloadTrigger (kinematic compound, group 0x40000000, mask 0x20000000),
// unloadTriggerMarker (the pallet icon), unloadTriggerAINode and palletTrigger (kinematic compound trigger, group 0x20000000, mask 0x10000). What it sells and buys is chosen from lists made
// from the game's fill types (filltypes.mjs). Not yet tried in the game. Imports only the i3d writer and the objects.
import { tg } from "../i3d.mjs";
import { objectOf, boxOf, iconOf } from "../objects.mjs";
import FILL_TYPES from "../filltypes.mjs";

const SHOPPING = "$data/shared/assets/marker/markerIconShopping.i3d", PALLET = "$data/shared/assets/marker/markerIconPallet.i3d";
export const MAX_LINES = 3;
/** What can be bought (goods that come on pallets) and what can be sold to it (any fill type), by name, in the game's order. */
export const BUY_OPTIONS = FILL_TYPES.filter(f => f[3]), SELL_OPTIONS = FILL_TYPES.filter(f => (f[2] > 0 || f[3]) && !f[4]); // bale types are left out: the game wants a BaleUnloadTrigger for them
const START_LIST = ["BREAD", "CAKE", "CHEESE", "BUTTER", "EGG", "FLOUR", "HONEY", "MILK_BOTTLED", "SUGAR"];
/** The settings that are lists of names, chosen from the game's fill types: {key: {options (the valid names, in the game's order), start}}. Every building has them. */
export const LISTS = {
  buyList: {options: BUY_OPTIONS.map(f => f[0]), start: START_LIST},
  sellList: {options: SELL_OPTIONS.map(f => f[0]), start: START_LIST},
};

/** Where the game objects go to start with: the counter inside by the front, the pallets out on the right side, the selling area out in front. */
export function palletDefaults(p) {
  const W = +p.width, D = +p.depth, F = +p.foundation;
  return [
    {type: "palletcounter", x: -W / 4, z: D / 2 - 1.4, w: 2.4, d: 1.4, h: F + 2.2, ix: 0, iz: 0},
    {type: "palletspawn", x: W / 2 + 2.4, z: 0, w: 2.8, d: Math.max(3, Math.min(D, 9)), h: 0.4, ix: 0, iz: 0},
    {type: "unload", x: 0, z: -(D / 2 + 3.2), w: Math.min(6, W), d: 4, h: 3, ix: 0, iz: 0},
  ];
}

/**
 * The lines pallets appear on: along the long side of the delivery area, one to three of them side by side, as {a: start, d: along its length (x or z)}.
 * Each line is a start node and an end node (its child): the start turned 0 90 0 when the line runs along x, as in the base game.
 */
export function palletLines(p, o) {
  const alongX = o.w >= o.d, len = alongX ? o.w : o.d, across = alongX ? o.d : o.w, n = Math.max(1, Math.min(MAX_LINES, Math.round(+p.palletLines || 1)));
  const step = Math.min(1.5, across / n);
  return Array.from({length: n}, (_, k) => {
    const off = (k - (n - 1) / 2) * step, y = +p.foundation > 0.01 ? 0 : 0.03;
    return alongX ? {at: [o.x - len / 2, y, o.z + off], len, alongX} : {at: [o.x + off, y, o.z - len / 2], len, alongX};
  });
}

const scale = v => +((+v || 100) / 100).toFixed(3);
const names = list => list.join(" ");

export function palletScene(c) {
  const {p} = c, counter = objectOf(p, "palletcounter"), spawn = objectOf(p, "palletspawn"), unload = objectOf(p, "unload");
  if (!counter || !spawn || !unload) return {nodes: [], xml: "", areas: []};
  const F = +p.foundation, cb = boxOf(counter), [ix, , iz] = iconOf(counter), ub = boxOf(unload), [ux, , uz] = iconOf(unload);
  // the shop: the trigger at the counter with the shopping icon as its marker node beside it
  const shop = tg("warehouse", [0, 0, 0], [
    c.box("palletBuyingActivationTrigger", cb, c.trigger("0x20000000", "0x100000")),
    tg("palletBuyingActivationTriggerMarker", [ix, F, iz]),
  ]);
  // the pallets: lines on the delivery area
  const lines = palletLines(p, spawn);
  const spawner = tg("palletSpawner", [0, 0, 0], lines.map((l, k) => tg(`palletAreaStart0${k + 1}`, l.at, [tg(`palletAreaEnd0${k + 1}`, [0, 0, l.len])], {rotation: [0, l.alongX ? 90 : 0, 0]})));
  // the selling: what is tipped in the box, and the pallets put on it
  const selling = tg("sellingStation", [0, 0, 0], [
    c.box("unloadTrigger", ub, {kinematic: true, compound: true, collisionFilterGroup: "0x40000000", collisionFilterMask: "0x20000000"}),
    tg("unloadTriggerMarker", [ux, F, uz]),
    tg("unloadTriggerAINode", [unload.x, F, unload.z + unload.d / 2]),
    c.box("palletTrigger", {center: [unload.x, F + 2, unload.z], size: [unload.w, 4, unload.d]}, {kinematic: true, compound: true, trigger: true, collisionFilterGroup: "0x20000000", collisionFilterMask: "0x10000"}),
  ]);
  const buy = scale(p.buyPrice), sell = scale(p.goodsPrice), sellNames = names((p.sellList || []).length ? p.sellList : ["EGG"]);
  const xml = `
    <triggerMarkers>
        <triggerMarker node="palletBuyingActivationTriggerMarker" filename="${SHOPPING}"/>
        <triggerMarker node="unloadTriggerMarker" adjustToGround="true" filename="${PALLET}"/>
    </triggerMarkers>

    <hotspots>
        <hotspot type="SHOP" linkNode="palletBuyingActivationTriggerMarker" teleportNode="palletBuyingActivationTriggerMarker"/>
        <hotspot type="UNLOADING_PALLET" linkNode="unloadTriggerMarker" teleportNode="unloadTriggerMarker"/>
    </hotspots>

    <palletBuyingStation triggerNode="palletBuyingActivationTrigger">
${(p.buyList || []).map(n => `        <fillType name="${n}" priceScale="${buy}"/>`).join("\n")}
        <palletSpawner>
            <spawnPlaces>
${lines.map((l, k) => `                <spawnPlace startNode="palletAreaStart0${k + 1}" endNode="palletAreaEnd0${k + 1}"${l.alongX ? ' palletRotationOffset="90"' : ""}/>`).join("\n")}
            </spawnPlaces>
        </palletSpawner>
    </palletBuyingStation>

    <sellingStation appearsOnStats="true" litersForFullPriceDrop="200000" fullPriceRecoverHours="48" supportsExtension="false">
        <unloadTrigger exactFillRootNode="unloadTrigger" aiNode="unloadTriggerAINode" fillTypes="${sellNames}" priceScale="${sell}"/>
        <palletTrigger triggerNode="palletTrigger" aiNode="unloadTriggerAINode" fillTypes="${sellNames}" priceScale="${sell}"/>
    </sellingStation>
`;
  return {nodes: [shop, spawner, selling], xml, areas: []};
}
