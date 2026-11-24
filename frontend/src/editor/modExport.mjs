// A mod as a game mod (docs/PLAN_MOD.md, decided 2026-11-24): the WHOLE mod is ONE placeable. Its i3d is a frame: the areas the placeable needs (clear, level, test ...) covering everything the
// mod holds, and the mod's game objects (sleep point, workshop ... of kinds/gameobjects.mjs) as the building export makes them; each building and prop is a ReferenceNode to an i3d of its own
// in posts/pN/, put where the plan puts it (a building as its own game mod's i3d, with the inside, a prop with its atlas). The origin of the placeable is the middle of everything, so the posts and
// the objects are moved by minus that middle. Not tried in the game: that a placeable's i3d may reference others this way is how the imported items already work (editor/model.mjs refNode).
//
//   makeModPackage({name, author, description, posts, objects, loadTextures})  ->  {files: Map(path -> text | bytes), warnings: [text], middle: [x, z]}
//
// posts: [{id, kind: "building" | "prop", name, x, z, y, rot (degrees, as three.js turns), data (the project's data)}]; objects: the mod's game objects (lib/modObjects.mjs, in the mod's coordinates).
// pictures: {icon, store} as {width, height, rgba} (a snapshot of the 3D view; the game needs an icon.dds, else "Missing icon filename" and the mod is not loaded): a plain one is made when there is none.
// loadTextures(ids) -> Map(id -> {size, diffuse, normal}) gives the user's textures a prop is made of (the page reads them from the server); without it they are plain grey.
import { sanitize, i3dFiles, placeableXml, modDescXml, modName, MOD_FILES } from "./model.mjs";
import { makeModFiles } from "./headless.mjs";
import { projectGroups, boundsOf, footprint } from "./modPlan.mjs";
import { exportI3dAtlas, atlasDdsFiles } from "../builder/atlas.mjs";
import { sanitize as sanitizeProp } from "../builder/model.mjs";
import { encodeDds } from "./dds.mjs";

// An i3d says it is ISO-8859-1, so that is how its bytes are written.
const latin1 = text => Uint8Array.from(text, c => c.charCodeAt(0) & 255);
const round = v => Math.round(v * 1000) / 1000;

/** The files of one post in its folder, and the i3d to reference: a building as its own game mod's i3d (inside, curtains, see-through glass, doors), a prop with its atlas. */
async function postFiles(post, folder, {loadTextures, encode}) {
  const out = new Map();
  if (post.kind === "prop") {
    const m = sanitizeProp(post.data), atlas = exportI3dAtlas(m, {name: "prop"});
    out.set(`${folder}/prop.i3d`, latin1(atlas.i3d));
    if (atlas.shapes) out.set(`${folder}/prop.i3d.shapes`, atlas.shapes);
    const maps = atlas.textures.length && loadTextures ? await loadTextures(atlas.textures) : new Map();
    const dds = atlasDdsFiles(atlas.layout, id => maps.get(id) || null);
    for (const [k, bytes] of Object.entries(dds)) out.set(`${folder}/textures/prop_${k}.dds`, bytes);
    return {files: out, i3d: `${folder}/prop.i3d`};
  }
  // (the whole building: what is behind the windows shows. Its doors stay shut for now: they are animated by the placeable XML, which is the mod's and not the building's.)
  const f = makeModFiles(post.data, post.name, {encode});
  for (const [path, bytes] of f.mod) if (path !== "modDesc.xml" && path !== MOD_FILES.xml) out.set(`${folder}/${path}`, bytes);
  return {files: out, i3d: `${folder}/${MOD_FILES.i3d}`};
}

/** A plain picture w x w in one colour (when there is no snapshot of the view to use). */
const plain = (w, [r, g, b]) => ({width: w, height: w, rgba: Uint8ClampedArray.from({length: w * w * 4}, (_, i) => [r, g, b, 255][i % 4])});

/** @param {{name: string, author?: string, description?: string, posts: any[], objects?: any[], loadTextures?: ((ids: string[]) => Promise<Map<string, any>>) | null, encode?: any, pictures?: {icon?: any, store?: any} | null}} mod */
export async function makeModPackage({name, author = "", description = "", posts, objects = [], loadTextures = null, encode = encodeDds, pictures = null}) {
  const warnings = [];
  const live = posts.filter(p => p.data);
  for (const p of posts) if (!p.data) warnings.push(`“${p.name || p.id}” could not be read and is left out.`);

  // the ground the mod covers: every post as it stands (turned), and every game object
  const rects = [];
  for (const p of live) {
    const f = footprint(boundsOf(projectGroups(p.data)), p.rot || 0);
    rects.push({x0: p.x + f.minX, x1: p.x + f.maxX, z0: p.z + f.minZ, z1: p.z + f.maxZ});
  }
  for (const o of objects) rects.push({x0: o.x - o.w / 2, x1: o.x + o.w / 2, z0: o.z - o.d / 2, z1: o.z + o.d / 2});
  if (!rects.length) rects.push({x0: -2, x1: 2, z0: -2, z1: 2});
  const all = {x0: Math.min(...rects.map(r => r.x0)), x1: Math.max(...rects.map(r => r.x1)), z0: Math.min(...rects.map(r => r.z0)), z1: Math.max(...rects.map(r => r.z1))};
  const cx = (all.x0 + all.x1) / 2, cz = (all.z0 + all.z1) / 2;
  const frame = {x0: round(all.x0 - cx), x1: round(all.x1 - cx), z0: round(all.z0 - cz), z1: round(all.z1 - cz)};

  // the posts' own files, and where each stands
  const files = new Map(), refs = [];
  let n = 0;
  for (const p of live) {
    n++;
    const folder = `posts/p${n}`, made = await postFiles(p, folder, {loadTextures, encode});
    for (const [path, bytes] of made.files) files.set(path, bytes);
    refs.push({name: `post${String(n).padStart(2, "0")}`, translation: [round(p.x - cx), round(p.y || 0), round(p.z - cz)], rotation: [0, round(p.rot || 0), 0], file: made.i3d});
  }

  // the frame: a building (a shed's settings) with the mod's game objects, drawn nothing and with the areas of the whole
  const host = {refs, rects: [frame], width: round(frame.x1 - frame.x0), depth: round(frame.z1 - frame.z0)};
  const placed = objects.map(o => ({...o, x: round(o.x - cx), z: round(o.z - cz)}));
  const p0 = sanitize({kind: "shed", objects: placed, modDescription: description});
  for (const [file, data] of Object.entries(i3dFiles(p0, {host}))) files.set(file, typeof data === "string" ? latin1(data) : data);
  const icon = (pictures && pictures.icon) || plain(256, [155, 42, 31]), store = (pictures && pictures.store) || plain(512, [155, 42, 31]);
  files.set(MOD_FILES.icon, encode(icon.width, icon.height, icon.rgba));
  files.set(MOD_FILES.store, encode(store.width, store.height, store.rgba));
  files.set(MOD_FILES.xml, placeableXml(p0, name, {host}));
  files.set("modDesc.xml", modDescXml(p0, name, {author}));
  if (!live.length) warnings.push("The mod holds no buildings or props yet.");
  return {files, warnings, middle: [round(cx), round(cz)], mod: modName(name)};
}
