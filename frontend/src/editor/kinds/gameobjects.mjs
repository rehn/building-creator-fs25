// Game objects that belong to no kind of building (docs/PLAN_MOD.md): a sleep point and a vehicle workshop can be put on any building.
// Each has its own export (the nodes and the placeable XML), where it goes to start with, and what the game needs to run it: a placeable
// type that has the right specializations. A kind that returns a plain placeable gets the game's own type (a farmhouse, a garage with a
// workshop); one with its own type, or a building with several of these, gets a type of the mod's own built on it (sharedPlaceable).
// Imports only the i3d writer and the layout helpers, never model.mjs; the core hands in the export context (see kinds/index.mjs).
import { tg, camera } from "../i3d.mjs";
import { wallsOf, openingSpan } from "../layout.mjs";
import { placeOnWall } from "../places.mjs";
import { objectOf, boxOf, iconOf, boxFrom } from "../objects.mjs";
import { shopScene, shopDefaults } from "./vehicleshop.mjs";

/** The specializations each of the game's placeable types has of its own on top of simplePlaceable (sdk/xmlDoku/placeableTypes.xml). */
const GAME_TYPES = {
  farmhouse: ["farmhouse", "wardrobe", "cartridgePlayer", "npcSpot"],
  garageWorkshopSolarPanels: ["workshop", "solarPanels", "incomePerHour"],
};

/** Scene nodes and placeable XML for the sleep point (an object outside or the sleep point piece inside). c: {p, geo, box, trigger, sleepPoint}. */
function sleepScene(c) {
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

/** Where the sleep point goes to start with: in front of the first door (the window list's first), 1.8 m square, 2.2 m high above the floor. */
function sleepDefaults(p) {
  if (p.sleepPoint === false) return [];
  const walls = wallsOf(p), doors = (p.windows || []).filter(w => w.type === "door" && w.floor === 0 && walls[w.wall]).sort((a, b) => a.id - b.id);
  const pl = placeOnWall(walls, doors.length ? doors[0].wall : "front", (w, key) => {
    const d = doors.find(x => x.wall === key), s = d ? openingSpan(d, w.L).reduce((u, v) => (u + v) / 2) : w.L / 2;
    return {s, d: 0.9, along: 1.8, out: 1.8, h: p.foundation + 2.2, icon: [s, 0.9]};
  });
  return [boxFrom("sleep", pl.box, pl.icon)];
}

/** Scene: the workshop's vehicle and player triggers and the wrench icon, when the building has a workshop object. */
function workshopScene(c) {
  const {p} = c, o = objectOf(p, "workshop");
  if (!o) return {nodes: [], xml: "", areas: []};
  const nodes = [tg("workShop", [0, 0, 0], [
    c.box("vehicleTrigger", boxOf(o), c.trigger("0x20000000", "0x10000")),
    c.box("playerTrigger", boxOf(o), c.trigger("0x20000000", "0x100000")),
    tg("markerWrench", (([x, , z]) => [x, p.foundation, z])(iconOf(o))),
  ])];
  const xml = `
    <triggerMarkers>
        <triggerMarker node="markerWrench" filename="$data/shared/assets/marker/markerIconWrench.i3d"/>
    </triggerMarkers>

    <hotspots>
        <hotspot type="SHOP" linkNode="vehicleTrigger" teleportNode="playerTrigger"/>
    </hotspots>

    <workshop>
        <sellingPoint playerTriggerNode="playerTrigger" iconNode="markerWrench" sellTriggerNode="vehicleTrigger" ownWorkshop="true" mobileWorkshop="false"/>
    </workshop>
`;
  return {nodes, xml, areas: []};
}

/** Where a new vehicle workshop goes: a box over most of the floor, its wrench icon in the middle. */
function workshopDefaults(p) {
  const w = Math.max(2, Math.min(40, p.width - 1)), d = Math.max(2, Math.min(40, p.depth - 1));
  return [{type: "workshop", x: 0, z: 0, w, d, h: p.foundation + Math.min(4, Math.max(2.5, p.floorHeight)), ix: 0, iz: 0}];
}

/**
 * The shared objects, in the order their nodes are written. types: the object types it owns (objects.mjs SHARED_GROUPS has the same lists); has(p): the building has it;
 * scene(c): its nodes and XML; defaults(p): where new ones go; gameType: the game's placeable type that has what it needs (null: the game has none, the mod defines one),
 * with its specializations (the ones that type adds to simplePlaceable); fn: the shop function. A kind that uses the same object types for its own thing says so in
 * kind.handles, and the shared export leaves it alone.
 */
export const SHARED = {
  sleep: {types: ["sleep"], has: p => !!objectOf(p, "sleep") || (p.items || []).some(it => it.type === "sleeppoint"), scene: sleepScene, defaults: sleepDefaults,
    gameType: "farmhouse", specializations: GAME_TYPES.farmhouse, fn: "$l10n_function_farmHouse", name: "SleepPoint",
    note: `Sleep point: use <placeable type="farmhouse" ...> so the player can sleep here, as in the base game's farmhouses.`},
  workshop: {types: ["workshop"], has: p => !!objectOf(p, "workshop"), scene: workshopScene, defaults: workshopDefaults,
    gameType: "garageWorkshopSolarPanels", specializations: GAME_TYPES.garageWorkshopSolarPanels, fn: "$l10n_function_workshop", name: "Workshop",
    note: `Vehicle workshop: use <placeable type="garageWorkshopSolarPanels" ...>, as in the base game's garages with a workshop.`},
  // a shop counter and a delivery place: the player buys vehicles (kinds/vehicleshop.mjs); the game has no type for it, so the mod defines one
  vehicleshop: {types: ["counter", "spawn"], has: p => !!objectOf(p, "counter") && !!objectOf(p, "spawn"), scene: shopScene, defaults: shopDefaults,
    gameType: null, specializations: ["vehicleBuyingStation"], fn: null, name: "VehicleShop",
    note: `Vehicle shop: add the placeable type to your modDesc.xml (<placeableTypes>, parent simplePlaceable, specialization vehicleBuyingStation).`},
};
/** The shared objects (ids) the building has, except those its kind uses the object types of for its own (kind.handles). */
export const sharedOf = (p, kind = null) => Object.keys(SHARED).filter(id => !(kind && (kind.handles || []).some(t => SHARED[id].types.includes(t))) && SHARED[id].has(p));
/** Where a new shared object of a type goes (a list with one box, or none). */
export const sharedDefaults = (p, type) => {
  const id = Object.keys(SHARED).find(k => SHARED[k].types.includes(type));
  return id ? SHARED[id].defaults(p).filter(o => o.type === type) : [];
};

/**
 * One <triggerMarkers> and one <hotspots> in the placeable XML: the game reads only the first of each, so the ones that several objects (or a kind and an object) each write
 * are merged into the first, with every entry in order.
 */
export function mergeContainers(xml, tags = ["triggerMarkers", "hotspots"]) {
  for (const tag of tags) {
    const re = new RegExp(`[ \\t]*<${tag}>([\\s\\S]*?)</${tag}>[ \\t]*\\n?`, "g"), found = [...xml.matchAll(re)];
    if (found.length < 2) continue;
    const entries = found.map(m => m[1].replace(/^\s*\n/, "").replace(/\s+$/, "")).filter(Boolean).join("\n");
    let first = true;
    xml = xml.replace(re, () => { if (!first) return ""; first = false; return `    <${tag}>\n${entries}\n    </${tag}>\n`; });
  }
  return xml;
}

/** The nodes and XML of the shared objects the building has, merged. c: the export context. */
export function sharedScene(c) {
  const out = {nodes: [], xml: "", areas: []};
  for (const t of sharedOf(c.p, c.kind)) { const s = SHARED[t].scene(c); out.nodes.push(...s.nodes); out.xml += s.xml; out.areas.push(...s.areas); }
  return out;
}

/**
 * The placeable the building exports: what the kind says (base: {type, fn, shop, note}) with the shared objects added. -> {...base, modType}
 * where modType is a type the modDesc must define ({name, parent, specializations}) or null. A plain simplePlaceable with one shared object is the game's own
 * type for it; otherwise the type is the mod's (`<mod>.<name>`), built on the kind's type with the specializations it does not have.
 * mod: the mod's name (the game puts it in front of a type the mod defines); left out, the type is named without it (the snippet).
 */
export function sharedPlaceable(p, base, mod = "", kind = null) {
  const has = sharedOf(p, kind);
  if (!has.length) return {...base, modType: null};
  const fns = [...new Set([].concat(base.fn).filter(f => f !== "$l10n_function_decoration").concat(has.map(t => SHARED[t].fn)).filter(Boolean))];
  if (!fns.length) fns.push("$l10n_function_decoration");
  const notes = [base.note, ...has.map(t => SHARED[t].note)].filter(Boolean);
  if (has.length === 1 && base.type === "simplePlaceable" && SHARED[has[0]].gameType) return {...base, type: SHARED[has[0]].gameType, fn: fns, note: SHARED[has[0]].note, modType: null};
  const local = base.type.split(".").pop();   // (a type the kind defines for the mod is `<mod>.<name>`)
  const have = new Set(GAME_TYPES[base.type] || []);
  const specializations = [...new Set(has.flatMap(t => SHARED[t].specializations))].filter(s => !have.has(s));
  const name = local.replace(/[^A-Za-z0-9]/g, "") + "With" + has.map(t => SHARED[t].name).join("And");
  const modType = {name, parent: base.type, specializations};
  return {...base, type: mod ? `${mod}.${name}` : name, fn: fns, note: notes.join(" "), modType};
}
