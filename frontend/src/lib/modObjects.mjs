// Game objects of a mod (docs/PLAN_MOD.md): the whole mod is ONE placeable when it is generated (decided 2026-11-24), so a sleep point, a workshop, a vehicle shop ... belong to the
// mod, not to one of its buildings: one of each, stored in the mod's own plan data (mod.data.objects), as boxes in the mod's coordinates (the same ground the buildings are placed on:
// {id, type, x, z, w, d, h, ix, iz}, as the editor keeps them, editor/objects.mjs). The shared groups only (kinds/gameobjects.mjs): they are never filtered by what the buildings are.
// Pure functions; none of them changes the list it is given.
import { SHARED } from "../editor/kinds/gameobjects.mjs";
import { SHARED_GROUPS, OBJECT_LIMITS } from "../editor/objects.mjs";
import { sanitize } from "../editor/model.mjs";

const NAMES = {sleep: "Sleep point", workshop: "Vehicle workshop", vehicleshop: "Vehicle shop", intake: "Grain intake", pump: "Fuel area", warehouse: "Pallet shop"};

/** The groups the mod can take: {id, name (for the player), types (the object types that go together)}. */
export const GROUPS = Object.keys(SHARED_GROUPS).map(id => ({id, name: NAMES[id], types: SHARED_GROUPS[id]}));

/** The group an object type belongs to, or null (the animals' objects are not here yet). */
export const groupOf = type => Object.keys(SHARED_GROUPS).find(id => SHARED_GROUPS[id].includes(type)) || null;

/** The building settings the defaults are worked out from: a building as wide and deep as the mod's things are. */
export const settingsFor = ({width, depth, foundation = 0}) => sanitize({kind: "house", width, depth, foundation});

const has = (objects, group) => objects.some(o => SHARED_GROUPS[group].includes(o.type));

/** The groups the mod does not have yet (the game takes one of each in a placeable). */
export const groupsFree = objects => GROUPS.filter(g => !has(objects, g.id));

const round = v => Math.round(v * 1000) / 1000;

/**
 * The objects with a group added where it goes to start with (ids after the highest): the defaults of settings p are around the origin, so they are moved by `at`
 * ([x, z], the middle of what the mod holds); the same list if the mod has the group already.
 */
export function addGroup(objects, group, p, at = [0, 0]) {
  if (!SHARED[group] || has(objects, group)) return objects;
  let id = objects.reduce((m, o) => Math.max(m, o.id), 0);
  return [...objects, ...SHARED[group].defaults(p).map(o => ({...o, id: ++id, x: round(o.x + at[0]), z: round(o.z + at[1])}))];
}

/** The objects without the group of the object `objectId`: its objects come and go together (a shop counter and its delivery place). */
export function removeGroup(objects, objectId) {
  const o = objects.find(x => x.id === objectId), g = o && groupOf(o.type);
  if (!o) return objects;
  const types = g ? SHARED_GROUPS[g] : [o.type];
  return objects.filter(x => !types.includes(x.type));
}

const clampTo = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

/** One object with some of x, z, w, d, h, ix, iz changed (kept within the editor's limits, to a millimetre). */
export function setObjectOf(objects, objectId, patch) {
  return objects.map(o => {
    if (o.id !== objectId) return o;
    const next = {...o};
    for (const k of ["x", "z", "w", "d", "h", "ix", "iz"]) if (patch[k] !== undefined && Number.isFinite(+patch[k])) next[k] = round(clampTo(+patch[k], OBJECT_LIMITS[k]));
    return next;
  });
}

/** The mod's objects out of its plan data (a list of boxes; anything else is no objects). */
export const objectsOfData = data => (data && Array.isArray(data.objects) ? data.objects.filter(o => o && typeof o.type === "string" && Number.isFinite(+o.id)) : []);
