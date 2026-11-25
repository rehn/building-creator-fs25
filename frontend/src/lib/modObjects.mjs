// Game objects of a mod (docs/PLAN_MOD.md): the whole mod is ONE placeable when it is generated (decided 2026-11-24), so a sleep point, a workshop, a vehicle shop ... belong to the
// mod, not to one of its buildings: one of each, stored in the mod's own plan data (mod.data.objects), as boxes in the mod's coordinates (the same ground the buildings are placed on:
// {id, type, x, z, w, d, h, ix, iz}, as the editor keeps them, editor/objects.mjs). The shared groups only (kinds/gameobjects.mjs): they are never filtered by what the buildings are.
// Pure functions; none of them changes the list it is given.
import { SHARED } from "../editor/kinds/gameobjects.mjs";
import { SHARED_GROUPS, OBJECT_LIMITS, fencePoints, MAX_FENCE_POINTS, nextTroughSpot } from "../editor/objects.mjs";
import { HEN_TYPES, COW_TYPES, SHEEP_TYPES } from "../editor/kinds/modframe.mjs";
import { MAX_HENS } from "../editor/kinds/chicken.mjs";
import { MAX_COWS } from "../editor/kinds/cow.mjs";
import { MAX_SHEEP } from "../editor/kinds/sheep.mjs";
import { postsInside, edgesThrough } from "../editor/modPlan.mjs";
import { navContourNodes, ccwFence } from "../editor/kinds/pasture.mjs";
import { wallsOf } from "../editor/layout.mjs";
import { sanitize } from "../editor/model.mjs";

// The groups a mod can take: the shared ones (every one is a few boxes) and the yard of the animals (boxes and a fence of posts, kinds/modframe.mjs): the hens', the cows' or the sheep's. A mod has ONE of
// them (Lars): their objects are of the same types, so the animals of the mod (mod.data.animal) say which yard the objects are.
const NAMES = {sleep: "Sleep point", workshop: "Vehicle workshop", vehicleshop: "Vehicle shop", intake: "Grain intake", pump: "Fuel area", warehouse: "Pallet shop", hens: "Hen yard", cows: "Cow yard", sheep: "Sheep yard"};
const MOD_GROUPS = {...SHARED_GROUPS, hens: HEN_TYPES, cows: COW_TYPES, sheep: SHEEP_TYPES};
/** The animals a mod can have, with the most of them, how many to start with, and what the count is called in the plan data. */
export const ANIMALS = {hens: {max: MAX_HENS, start: 30}, cows: {max: MAX_COWS, start: 12}, sheep: {max: MAX_SHEEP, start: 20}};
const ANIMAL_TYPES = [...new Set(Object.keys(ANIMALS).flatMap(id => MOD_GROUPS[id]))];
const isAnimal = type => ANIMAL_TYPES.includes(type);

/** The groups the mod can take: {id, name (for the player), types (the object types that go together)}. */
export const GROUPS = Object.keys(MOD_GROUPS).map(id => ({id, name: NAMES[id], types: MOD_GROUPS[id]}));

/** The group an object type belongs to, or null. An animal's object belongs to the yard of the mod's animals (hens when not said). */
export const groupOf = (type, animal = "hens") => (isAnimal(type) ? (animal in ANIMALS ? animal : "hens") : Object.keys(MOD_GROUPS).find(id => !(id in ANIMALS) && MOD_GROUPS[id].includes(type)) || null);

/** The animals of a mod's plan data: "hens" (the first mods had only those), "cows" or "sheep". */
export const animalOfData = data => (data && data.animal in ANIMALS && typeof data.animal === "string" ? data.animal : "hens");
/** How many animals the mod is made for: 1 to the most the game's biggest barn holds, to start with 30 hens, 12 cows or 20 sheep (the plan data's hens, cows or sheep). */
export const countOfData = data => {
  const a = animalOfData(data), v = data && data[a] !== undefined && data[a] !== null && data[a] !== "" ? Math.round(+data[a]) : NaN;
  return Number.isFinite(v) ? Math.max(1, Math.min(ANIMALS[a].max, v)) : ANIMALS[a].start;
};

/** The building settings the defaults are worked out from: a building as wide and deep as the mod's things are. */
export const settingsFor = ({width, depth, foundation = 0}) => sanitize({kind: "house", width, depth, foundation});

// (a mod has one kind of animals: any animal object means it has its yard)
const has = (objects, group) => (group in ANIMALS ? objects.some(o => isAnimal(o.type)) : objects.some(o => MOD_GROUPS[group].includes(o.type)));

/** The groups the mod does not have yet (the game takes one of each in a placeable). */
export const groupsFree = objects => GROUPS.filter(g => !has(objects, g.id));

const round = v => Math.round(v * 1000) / 1000;

/**
 * The objects with a group added where it goes to start with (ids after the highest): the defaults of settings p are around the origin, so they are moved by `at`
 * ([x, z], the middle of what the mod holds); the same list if the mod has the group already.
 */
export function addGroup(objects, group, p, at = [0, 0], {wall = "back"} = {}) {
  if (!MOD_GROUPS[group] || has(objects, group)) return objects;
  let id = objects.reduce((m, o) => Math.max(m, o.id), 0);
  const made = group === "hens" ? henDefaults(p, wall) : group in ANIMALS ? barnDefaults(p, wall, group) : SHARED[group].defaults(p);
  // (a fence has no middle: its posts are moved)
  return [...objects, ...made.map(o => ({...o, id: ++id, ...(o.type === "pasture" ? {points: o.points.map(([x, z]) => [round(x + at[0]), round(z + at[1])])} : {x: round(o.x + at[0]), z: round(o.z + at[1])})}))];
}

/** Where a hen yard goes to start with: what a hen house as wide and deep as p has (its feed pad, trailer spot, egg pallets, info area), and its fence as posts the player can move. */
function henDefaults({width, depth, foundation = 0}, wall = "back") {
  // (the pasture goes on a wall without a door, so the door of the stand-in building is put on the opposite one)
  const q = sanitize({kind: "chicken", width, depth, foundation, pastureWall: wall, doorWall: OPPOSITE[wall] || "front"}), pa = q.objects.find(o => o.type === "pasture");
  // a feed trough and a water trough inside the fence, where the pasture of the stand-in hen house has room (not on each other)
  const feed = nextTroughSpot(q, "feedTrough"), withFeed = {...q, objects: [...q.objects, {id: 99, type: "feedTrough", ix: 0, iz: 0, ...feed}]}, water = nextTroughSpot(withFeed, "waterTrough");
  const trough = o => { const {x, z, w, d, h} = o; return {type: o.type, x, z, w, d, h, ix: 0, iz: 0}; };
  return [...q.objects.filter(o => o.type !== "pasture"), trough(feed), trough(water), {type: "pasture", wall: pa.wall, a: 0, b: 0, depth: pa.depth, points: fencePoints(q).slice(0, MAX_FENCE_POINTS)}];
}

/** Where a cow yard or sheep yard goes to start with: what a cow or sheep barn as wide and deep as p has (the feed pad, bale drop, trailer spot, info area, a feed and a water trough, wool pallets for sheep), and its fence as posts. */
function barnDefaults({width, depth, foundation = 0}, wall, animal) {
  const q = sanitize({kind: animal === "cows" ? "cow" : "sheep", width, depth, foundation, pastureWall: wall, doorWall: OPPOSITE[wall] || "front"}), pa = q.objects.find(o => o.type === "pasture");
  return [...q.objects.filter(o => o.type !== "pasture").map(({type, x, z, w, d, h, ix = 0, iz = 0}) => ({type, x, z, w, d, h, ix, iz})), {type: "pasture", wall: pa.wall, a: 0, b: 0, depth: pa.depth, points: fencePoints(q).slice(0, MAX_FENCE_POINTS)}];
}

const OPPOSITE = {front: "back", back: "front", left: "right", right: "left"};

/**
 * The first building with a ground floor door on a main wall, and the side of it (front, back, left or right of the building as it stands, turned by its rot) that door faces: {wall, index (in posts)},
 * where a hen yard goes to start with, against the house on the side people come in. posts: [{kind, rot, data}]; {wall: "back", index: -1} when no building has one.
 */
export function entranceBuilding(posts) {
  for (const [index, p] of posts.entries()) {
    if (p.kind !== "building" || !p.data) continue;
    const q = sanitize(p.data), walls = wallsOf(q), door = (q.windows || []).find(w => w.type === "door" && w.floor === 0 && walls[w.wall] && OPPOSITE[w.wall]);
    if (!door) continue;
    const [nx, , nz] = walls[door.wall].n, a = (p.rot || 0) * Math.PI / 180;
    const x = nx * Math.cos(a) + nz * Math.sin(a), z = -nx * Math.sin(a) + nz * Math.cos(a);
    return {wall: Math.abs(x) > Math.abs(z) ? (x > 0 ? "right" : "left") : (z > 0 ? "front" : "back"), index};
  }
  return {wall: "back", index: -1};
}
/** The side of the mod the first building's door faces (entranceBuilding), "back" when none does. */
export const entranceWall = posts => entranceBuilding(posts).wall;

/** The objects without the group of the object `objectId`: its objects come and go together (a shop counter and its delivery place). animal: the mod's animals (animalOfData). */
export function removeGroup(objects, objectId, animal = "hens") {
  const o = objects.find(x => x.id === objectId), g = o && groupOf(o.type, animal);
  if (!o) return objects;
  const types = g ? (g in ANIMALS ? ANIMAL_TYPES : MOD_GROUPS[g]) : [o.type];
  return objects.filter(x => !types.includes(x.type));
}

const clampTo = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

/** One object with some of x, z, y (the height above the ground), w, d, h, ix, iz and turn (degrees round Y) changed (kept within the editor's limits, to a millimetre). */
export function setObjectOf(objects, objectId, patch) {
  return objects.map(o => {
    if (o.id !== objectId) return o;
    const next = {...o};
    for (const k of ["x", "z", "y", "w", "d", "h", "ix", "iz"]) if (patch[k] !== undefined && Number.isFinite(+patch[k])) next[k] = round(clampTo(+patch[k], OBJECT_LIMITS[k]));
    if (patch.turn !== undefined && Number.isFinite(+patch.turn)) next.turn = Math.round((((+patch.turn % 360) + 360) % 360) * 10) / 10 % 360;   // (round the Y axis, degrees, as a post turns)
    if (!next.turn) delete next.turn;
    if (!next.y) delete next.y;   // (0 is how an object on the ground is kept)
    return next;
  });
}

/** The fewest posts a fence has (a fence round something). */
export const MIN_POSTS = 3;

/** The fence `objectId` with its posts changed by f (a list of [x, z] -> a list), the posts kept to the editor's limits and a millimetre; the same list when it is not a fence. */
function withPosts(objects, objectId, f) {
  const o = objects.find(x => x.id === objectId);
  if (!o || o.type !== "pasture" || !Array.isArray(o.points)) return objects;
  const points = f(o.points);
  if (!points) return objects;
  return objects.map(x => x === o ? {...x, points: points.map(([px, pz]) => [round(clampTo(px, OBJECT_LIMITS.x)), round(clampTo(pz, OBJECT_LIMITS.z))])} : x);
}

/** Post i of the fence moved to {x, z}. */
export const setPoint = (objects, objectId, i, {x, z}) => withPosts(objects, objectId, pts => (i >= 0 && i < pts.length && Number.isFinite(+x) && Number.isFinite(+z) ? pts.map((q, k) => k === i ? [+x, +z] : q) : null));

/** A new post after post i at {x, z} (the player dragged a dot between two posts out to it). */
export const insertPoint = (objects, objectId, i, {x, z}) => withPosts(objects, objectId, pts => (i < 0 || i >= pts.length || pts.length >= MAX_FENCE_POINTS || !Number.isFinite(+x) || !Number.isFinite(+z) ? null : [...pts.slice(0, i + 1), [+x, +z], ...pts.slice(i + 1)]));

/** A new post after post i, in the middle of that stretch of the fence (the last stretch runs back to the first post). */
export const addPoint = (objects, objectId, i) => withPosts(objects, objectId, pts => {
  if (i < 0 || i >= pts.length || pts.length >= MAX_FENCE_POINTS) return null;
  const a = pts[i], b = pts[(i + 1) % pts.length];
  return [...pts.slice(0, i + 1), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], ...pts.slice(i + 1)];
});

/** Post i taken out of the fence, unless that leaves fewer than MIN_POSTS. */
export const removePoint = (objects, objectId, i) => withPosts(objects, objectId, pts => (pts.length > MIN_POSTS && i >= 0 && i < pts.length ? pts.filter((_, k) => k !== i) : null));

/** The number of hens the mod's barn is made for: 1 to the most the game's biggest barn has (the mod's plan data, 30 to start with). */
export const hensOfData = data => {
  const n = data && data.hens !== undefined && data.hens !== null && data.hens !== "" ? Math.round(+data.hens) : NaN;
  return Number.isFinite(n) ? Math.max(1, Math.min(MAX_HENS, n)) : 30;
};

/** The mod's objects out of its plan data (a list of boxes; anything else is no objects). */
export const objectsOfData = data => (data && Array.isArray(data.objects) ? data.objects.filter(o => o && typeof o.type === "string" && Number.isFinite(+o.id)) : []);

/**
 * The fences of the mod with a post inside a building or prop, or a stretch through one (rects: what they stand on, modPlan.mjs feetOf): Map fence id -> {posts: the posts that are inside
 * (0-based), edges: the stretches (i = from post i to post i + 1, the last back to the first) that run through a building without a post of theirs inside it}. The game cannot make the
 * animals' area then ("Could not shrink polygon"), so the page marks the fence and generating the mod says so.
 */
/** The sentence about a fence's problems found by fenceProblems ({posts, edges}), as numbers for the player (from 1): [text key, values] for each, in the order to say them. */
export const fenceProblemList = ({posts, edges}, n) => [
  ...(posts.length ? [["Post {posts} of the fence stands inside a building. Move it out, or the game cannot make the area the hens walk in.", {posts: posts.map(i => i + 1).join(", ")}]] : []),
  ...(edges.length ? [["The fence between {stretches} runs through a building. Move the posts to the wall or out from it, or the game cannot make the area the hens walk in.", {stretches: edges.map(i => `${i + 1} and ${(i + 1) % n + 1}`).join("; ")}]] : []),
];

export function fenceProblems(objects, rects) {
  const out = new Map();
  for (const o of objects) {
    if (o.type !== "pasture" || !Array.isArray(o.points)) continue;
    const posts = postsInside(o.points, rects), n = o.points.length;
    // (the game closes the fence from its last post to its first along the building when the ends are at one: the way the export gives it, navContourNodes)
    const edges = edgesThrough(o.points, rects, undefined, navContourNodes(ccwFence(o.points.map(([x, z]) => [x, 0, z])), rects)).filter(i => !posts.includes(i) && !posts.includes((i + 1) % n));
    if (posts.length || edges.length) out.set(o.id, {posts, edges});
  }
  return out;
}
