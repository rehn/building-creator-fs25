// What the /mods pages do to a mod's list of posts before it is saved. A post is a building or a prop (both are projects: a prop is a project of
// kind "prop") with its place in the mod's plan and the mod type it is generated with ("" = as the building is). The server keeps the list
// (backend/internal/store/mods.go) and gives each post its id and its name; these functions never change the list they are given.

/** Metres between two new posts, so a thing added is not put on top of another. */
const GAP = 12;

/** The list with a new post for the project `ref` (a plain one, further along the row); the same list if it is in the mod already. */
export function addPost(items, kind, ref) {
  if (items.some(p => p.ref === ref)) return items;
  return [...items, {id: "", kind, ref, type: "", x: items.length * GAP, z: 0, rot: 0}];
}

export const removePost = (items, id) => items.filter(p => p.id !== id);

export const setPostType = (items, id, type) => items.map(p => p.id === id ? {...p, type} : p);

/** The post with its place changed: any of x, z (metres) and rot (degrees, kept in 0 to 360). */
export const placePost = (items, id, place) => items.map(p => p.id === id ? {...p, ...place, ...(place.rot === undefined ? {} : {rot: ((place.rot % 360) + 360) % 360})} : p);

/** How many buildings and props the mod holds (the counts on its tabs). */
export function countsOf(items) {
  const n = {building: 0, prop: 0};
  for (const p of items) if (p.kind in n) n[p.kind]++;
  return n;
}

/** The projects that can be added as `kind` ("building" or "prop"): those of that kind that the mod does not hold yet. */
export function choices(projects, items, kind) {
  const held = new Set(items.map(p => p.ref));
  return projects.filter(h => ((h.kind || "house") === "prop") === (kind === "prop") && !held.has(h.id));
}

/** The list as the server takes it (it works out the names and what is missing itself). */
export const payload = items => items.map(({id, kind, ref, type, x, z, rot}) => ({id, kind, ref, type, x, z, rot}));
