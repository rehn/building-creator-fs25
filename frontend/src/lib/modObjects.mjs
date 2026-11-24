// Game objects on the posts of a mod (docs/PLAN_MOD.md): the objects of one building or prop (a sleep point, a workshop, a vehicle shop ...), in the post's own
// coordinates (the middle of its footprint), as the editor keeps them (editor/objects.mjs: boxes {id, type, x, z, w, d, h, ix, iz}). The shared groups only (kinds/gameobjects.mjs):
// they are never filtered by the post's type. The whole mod is ONE placeable when it is generated, so the objects of all posts are merged then, and the game takes one <farmhouse>,
// one <workshop> ... in a placeable: clashes() finds the groups that more than one post has. Pure functions; none of them changes the list it is given.
import { SHARED } from "../editor/kinds/gameobjects.mjs";
import { SHARED_GROUPS, OBJECT_LIMITS } from "../editor/objects.mjs";
import { sanitize } from "../editor/model.mjs";

const NAMES = {sleep: "Sleep point", workshop: "Vehicle workshop", vehicleshop: "Vehicle shop", intake: "Grain intake", pump: "Fuel area", warehouse: "Pallet shop"};

/** The groups a post can take: {id, name (for the player), types (the object types that go together)}. */
export const GROUPS = Object.keys(SHARED_GROUPS).map(id => ({id, name: NAMES[id], types: SHARED_GROUPS[id]}));

/** The group an object type belongs to, or null (the animals' objects are not here yet). */
export const groupOf = type => Object.keys(SHARED_GROUPS).find(id => SHARED_GROUPS[id].includes(type)) || null;

/** The building settings the defaults are worked out from: a building's own, or for a prop a building of the same width and depth. */
export const settingsFor = ({width, depth, foundation = 0}) => sanitize({kind: "house", width, depth, foundation});

const has = (post, group) => (post.objects || []).some(o => SHARED_GROUPS[group].includes(o.type));

/** The groups the post does not have yet. */
export const groupsFree = post => GROUPS.filter(g => !has(post, g.id));

const withPost = (items, id, fn) => items.map(p => p.id === id ? fn(p) : p);

/** The post with a group's objects added where they go to start with (ids after the highest it has); the same list if the post has the group already. */
export function addGroup(items, postId, group, p) {
  const post = items.find(x => x.id === postId);
  if (!post || !SHARED[group] || has(post, group)) return items;
  return withPost(items, postId, post => {
    let id = (post.objects || []).reduce((m, o) => Math.max(m, o.id), 0);
    return {...post, objects: [...(post.objects || []), ...SHARED[group].defaults(p).map(o => ({...o, id: ++id}))]};
  });
}

/** The post without the group of the object `objectId`: its objects come and go together (a shop counter and its delivery place). */
export function removeGroup(items, postId, objectId) {
  return withPost(items, postId, post => {
    const o = (post.objects || []).find(x => x.id === objectId), g = o && groupOf(o.type);
    if (!o) return post;
    const types = g ? SHARED_GROUPS[g] : [o.type];
    return {...post, objects: post.objects.filter(x => !types.includes(x.type))};
  });
}

const clampTo = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));
const round = v => Math.round(v * 1000) / 1000;

/** One object of the post with some of x, z, w, d, h, ix, iz changed (kept within the editor's limits, to a millimetre). */
export function setObjectOf(items, postId, objectId, patch) {
  return withPost(items, postId, post => ({...post, objects: (post.objects || []).map(o => {
    if (o.id !== objectId) return o;
    const next = {...o};
    for (const k of ["x", "z", "w", "d", "h", "ix", "iz"]) if (patch[k] !== undefined && Number.isFinite(+patch[k])) next[k] = round(clampTo(+patch[k], OBJECT_LIMITS[k]));
    return next;
  })}));
}

/** The groups that more than one post has, [{group, posts: [the names]}]: the game takes one of each in a placeable, so only the first is exported. */
export function clashes(items) {
  const found = [];
  for (const g of GROUPS) {
    const names = items.filter(p => has(p, g.id)).map(p => p.name);
    if (names.length > 1) found.push({group: g.id, name: g.name, posts: names});
  }
  return found;
}
