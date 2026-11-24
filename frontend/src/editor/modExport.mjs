// A mod as a game mod (docs/PLAN_MOD.md, decided 2026-11-24): the WHOLE mod is ONE placeable. Its i3d is one document: the areas the placeable needs (clear, level, test ...) covering everything the
// mod holds, the mod's game objects (sleep point, workshop ... of kinds/gameobjects.mjs) as the building export makes them, each BUILDING with its visuals, collision and doors (its nodes named
// b1_, b2_ ... so that the placeable XML can name them: the doors are animated by one <animatedObjects> block with all the buildings' doors), put where the plan puts it, and each PROP as a ReferenceNode
// to an i3d of its own (its atlas). The textures of a building are in posts/pN/textures/. The origin of the placeable is the middle of everything, so the posts and the objects are moved by minus
// that middle. Not tried in the game: that the game follows a ReferenceNode from a placeable's i3d is how the imported items already work (editor/model.mjs refNode); the doors of several buildings in one
// placeable are new.
//
//   makeModPackage({name, author, description, posts, objects, loadTextures, pictures})  ->  {files: Map(path -> text | bytes), warnings: [text], middle: [x, z], mod}
//
// posts: [{id, kind: "building" | "prop", name, x, z, y, rot (degrees, as three.js turns), data (the project's data)}]; objects: the mod's game objects (lib/modObjects.mjs, in the mod's coordinates).
// pictures: {icon, store} as {width, height, rgba} (a snapshot of the 3D view; the game needs an icon.dds, else "Missing icon filename" and the mod is not loaded): a plain one is made when there is none.
// loadTextures(ids) -> Map(id -> {size, diffuse, normal}) gives the user's textures a prop is made of (the page reads them from the server); without it they are plain grey.
import { sanitize, i3dFiles, placeableXml, modDescXml, modName, buildInMod, withTextureDir, MOD_FILES } from "./model.mjs";
import { textureMapFor } from "./headless.mjs";
import { I3dDoc, tg, prefixNames } from "./i3d.mjs";
import { mergeContainers } from "./kinds/gameobjects.mjs";
import { projectGroups, boundsOf, footprint, feetOf, buildingFeet, keepClear } from "./modPlan.mjs";
import { fenceProblems } from "../lib/modObjects.mjs";
import { insideNav } from "./kinds/modinside.mjs";
import { navContourNodes, ccwFence } from "./kinds/pasture.mjs";
import { KEEP } from "./walkarea.mjs";
import { exportI3dAtlas, atlasDdsFiles } from "../builder/atlas.mjs";
import { sanitize as sanitizeProp } from "../builder/model.mjs";
import { encodeDds } from "./dds.mjs";

// An i3d says it is ISO-8859-1, so that is how its bytes are written.
const latin1 = text => Uint8Array.from(text, c => c.charCodeAt(0) & 255);
const round = v => Math.round(v * 1000) / 1000;

/** A prop's own i3d and atlas in its folder: {files, i3d (the path to reference)}. */
async function propFiles(post, folder, {loadTextures}) {
  const out = new Map(), m = sanitizeProp(post.data), atlas = exportI3dAtlas(m, {name: "prop"});
  out.set(`${folder}/prop.i3d`, latin1(atlas.i3d));
  if (atlas.shapes) out.set(`${folder}/prop.i3d.shapes`, atlas.shapes);
  const maps = atlas.textures.length && loadTextures ? await loadTextures(atlas.textures) : new Map();
  const dds = atlasDdsFiles(atlas.layout, id => maps.get(id) || null);
  for (const [k, bytes] of Object.entries(dds)) out.set(`${folder}/textures/prop_${k}.dds`, bytes);
  return {files: out, i3d: `${folder}/prop.i3d`};
}

/** A plain picture w x w in one colour (when there is no snapshot of the view to use). */
const plain = (w, [r, g, b]) => ({width: w, height: w, rgba: Uint8ClampedArray.from({length: w * w * 4}, (_, i) => [r, g, b, 255][i % 4])});

/** @param {{name: string, author?: string, description?: string, posts: any[], objects?: any[], hens?: number, inside?: string | null, loadTextures?: ((ids: string[]) => Promise<Map<string, any>>) | null, encode?: any, pictures?: {icon?: any, store?: any} | null}} mod */
export async function makeModPackage({name, author = "", description = "", posts, objects = [], hens = 30, inside = null, loadTextures = null, encode = encodeDds, pictures = null}) {
  const warnings = [];
  const live = posts.filter(p => p.data);
  for (const p of posts) if (!p.data) warnings.push(`“${p.name || p.id}” could not be read and is left out.`);

  // the ground the mod covers: every post as it stands (turned), and every game object
  const rects = [];
  for (const p of live) {
    const f = footprint(boundsOf(projectGroups(p.data)), p.rot || 0);
    rects.push({x0: p.x + f.minX, x1: p.x + f.maxX, z0: p.z + f.minZ, z1: p.z + f.maxZ});
  }
  // (what the posts stand on, for the fence and the animals' blockers: a building's real walls, as the hen house has it, not the roof's edge; a prop's bounds)
  const feet = feetOf(live.map(p => ({ x: p.x, z: p.z, rot: p.rot || 0, bounds: boundsOf(projectGroups(p.data)), feet: p.kind === "prop" ? null : buildingFeet(p.data) })));
  for (const o of objects) {
    if (o.type === "pasture") { for (const [x, z] of o.points || []) rects.push({x0: x, x1: x, z0: z, z1: z}); continue; }   // (the fence's posts are ground the mod covers, too)
    rects.push({x0: o.x - o.w / 2, x1: o.x + o.w / 2, z0: o.z - o.d / 2, z1: o.z + o.d / 2});
  }
  if (!rects.length) rects.push({x0: -2, x1: 2, z0: -2, z1: 2});
  const all = {x0: Math.min(...rects.map(r => r.x0)), x1: Math.max(...rects.map(r => r.x1)), z0: Math.min(...rects.map(r => r.z0)), z1: Math.max(...rects.map(r => r.z1))};
  const cx = (all.x0 + all.x1) / 2, cz = (all.z0 + all.z1) / 2;
  const frame = {x0: round(all.x0 - cx), x1: round(all.x1 - cx), z0: round(all.z0 - cz), z1: round(all.z1 - cz)};

  // the posts: a building is made into the one i3d document (its nodes with a prefix of their own, its textures in its folder), a prop is files of its own to reference
  const files = new Map(), refs = [], nodes = [], doorXml = [], doc = new I3dDoc();
  let n = 0, insideInfo = null;
  for (const p of live) {
    n++;
    const folder = `posts/p${n}`, place = [round(p.x - cx), round(p.y || 0), round(p.z - cz)], turn = [0, round(p.rot || 0), 0];
    if (p.kind === "prop") {
      const made = await propFiles(p, folder, {loadTextures});
      for (const [path, bytes] of made.files) files.set(path, bytes);
      refs.push({name: `post${String(n).padStart(2, "0")}`, translation: place, rotation: turn, file: made.i3d});
      continue;
    }
    const q = sanitize(p.data), prefix = `b${n}_`;
    if (inside && p.id === inside) insideInfo = {name: p.name || p.id, settings: q, place: {x: round(p.x - cx), z: round(p.z - cz), y: p.y || 0, rot: p.rot || 0}};
    withTextureDir(folder + "/", () => {
      const {root, doorXml: doors} = buildInMod(q, doc);
      const xml = prefixNames(root, doors, prefix);
      if (xml.trim()) doorXml.push(xml);
      nodes.push(tg(`${prefix}post`, place, [root], {rotation: turn}));
      for (const [path, bytes] of textureMapFor(q, encode)) files.set(path, bytes);
    });
  }

  // the frame: a building (a shed's settings) with the mod's game objects, drawing nothing, with the areas of the whole
  const shift = r => ({x0: round(r.x0 - cx), x1: round(r.x1 - cx), z0: round(r.z0 - cz), z1: round(r.z1 - cz)});
  const host = {refs, nodes, doc, xml: mergeContainers(doorXml.join(""), ["animatedObjects"]), rects: [frame], footprints: feet.map(shift), inside: insideInfo, width: round(frame.x1 - frame.x0), depth: round(frame.z1 - frame.z0)};
  // The fence is stood 15 cm off the walls it was put against (modPlan.mjs keepClear): the hen type with only a footprint to cut out of the area made a sliver where the fence touched a building (seen in
  // the game). Where the hens walk inside a building the game makes the area outside as the fence less the walking shape, as in the cow barn, which has its posts on the walls: then the fence stays where it
  // was put, if the hens can get in with it there (else it is stood off, as without the choice).
  const feetShifted = feet.map(shift), asPut = pts => pts.map(([x, z]) => [round(x - cx), round(z - cz)]);
  const keeps = pts => {
    if (!insideInfo) return false;
    const fence = ccwFence(asPut(pts).map(([x, z]) => [x, 0, z]));
    const contour = [...fence, ...navContourNodes(fence, feetShifted).map(([x, z]) => [x, 0, z])];
    const blockers = feetShifted.map(r => ({center: [(r.x0 + r.x1) / 2, 1, (r.z0 + r.z1) / 2], size: [r.x1 - r.x0, 2, r.z1 - r.z0], keep: KEEP.wall}));
    return !!insideNav({settings: insideInfo.settings, place: insideInfo.place, contour, blockers}).nav;
  };
  const placed = objects.map(o => ({...o, x: round((o.x || 0) - cx), z: round((o.z || 0) - cz), ...(o.points ? {points: keeps(o.points) ? asPut(o.points) : asPut(keepClear(o.points, feet))} : {})}));
  const p0 = sanitize({kind: "modframe", objects: placed, hens, modDescription: description});
  for (const [file, data] of Object.entries(i3dFiles(p0, {host}))) files.set(file, typeof data === "string" ? latin1(data) : data);
  const icon = (pictures && pictures.icon) || plain(256, [155, 42, 31]), store = (pictures && pictures.store) || plain(512, [155, 42, 31]);
  files.set(MOD_FILES.icon, encode(icon.width, icon.height, icon.rgba));
  files.set(MOD_FILES.store, encode(store.width, store.height, store.rgba));
  files.set(MOD_FILES.xml, placeableXml(p0, name, {host}));
  files.set("modDesc.xml", modDescXml(p0, name, {author}));
  // (a fence post inside a building: the game cannot make the animals area from it, "Could not shrink polygon")
  for (const [id, found] of fenceProblems(objects, feet)) {
    for (const i of found.posts) warnings.push(`Post ${i + 1} of the fence stands inside a building: move it out, or the game cannot make the area the hens walk in.`);
    const n = objects.find(o => o.id === id).points.length;
    for (const i of found.edges) warnings.push(`The fence between post ${i + 1} and ${(i + 1) % n + 1} runs through a building: move the posts to the wall or out from it, or the game cannot make the area the hens walk in.`);
  }
  // (the hens were to walk inside a building and cannot: why, so the player can fix it; the hens then stay outside, as before)
  const why = insideInfo && host.insideResult && !host.insideResult.nav ? host.insideResult.reason : null;
  if (why) warnings.push({
    turned: `“${insideInfo.name}” is turned at an angle that is not a quarter turn, so the hens cannot walk inside it: turn it a quarter, or take the choice off.`,
    "no-door": `“${insideInfo.name}” has no open framed doorway on its ground floor (door style “Open doorway, framed”) and no open side, so the hens stay outside it.`,
    "no-entrance-faces-fence": `No open doorway or open side of “${insideInfo.name}” faces the hens' fence, so the hens stay outside it: put the fence on the side of the way in.`,
    "no-fence": `The hens cannot walk inside “${insideInfo.name}”: the fence is too small.`,
  }[why] || `The hens cannot walk inside “${insideInfo.name}”.`);
  if (!live.length) warnings.push("The mod holds no buildings or props yet.");
  return {files, warnings, middle: [round(cx), round(cz)], mod: modName(name)};
}
