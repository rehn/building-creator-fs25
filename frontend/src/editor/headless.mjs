// A building's files made without a browser (PLAN_OSM.md, step 2): what the editor packs when it saves (the game mod and the model export,
// plus the OBJ and MTL), for the web server to make for the buildings the API generates. No DOM; jszip only in makeFiles.
//
//   makeModFiles(settings, name, {author, encode})  ->  {p, obj, mtl, mod: Map, export: Map}
//       mod     the game mod's files by path: modDesc.xml, house.xml, house.i3d (+ .shapes), textures/*.dds
//       export  the model export's: <slug>/house.i3d, <slug>/placeable_snippet.xml, <slug>/textures/*.dds
//   makeFiles(settings, name, {author})             ->  {obj, mtl, mod, export} (the two zips as Uint8Arrays), as editor.modelFiles gives
//
// Differences from the editor's own files: no shop picture or icon (they need WebGL), and the rooms behind the windows are a plain colour
// atlas (the painted rooms need a canvas) and the glass a computed gradient. A person who opens the building in the editor and saves it gets
// the editor's own files instead.
import { sanitize, buildGeometry, buildObj, i3dFiles, placeableXml, placeableSnippet, modDescXml, matTexture, seeThroughGlass, slugify, MOD_FILES, GLASS_ALPHA } from "./model.mjs";
import { textureFiles } from "./textures.mjs";
import { encodeDds } from "./dds.mjs";

// An i3d says it is ISO-8859-1, so that is how its bytes are written.
const latin1 = text => Uint8Array.from(text, c => c.charCodeAt(0) & 255);

/** The glass texture: the tint at GLASS_ALPHA with a faint bright stripe along the diagonal (as paintGlass in interior.mjs, in pixels). */
export function glassPixels(size = 64) {
  const D = new Uint8ClampedArray(size * size * 4), base = [115, 150, 171];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const t = (x + 0.5 + y + 0.5) / (2 * size), a = t < 0.35 || t > 0.65 ? 0 : 0.12 * (t < 0.5 ? (t - 0.35) / 0.15 : (0.65 - t) / 0.15);
    const outA = a + GLASS_ALPHA * (1 - a), j = (y * size + x) * 4;
    for (let k = 0; k < 3; k++) D[j + k] = (255 * a + base[k] * GLASS_ALPHA * (1 - a)) / outA;
    D[j + 3] = outA * 255;
  }
  return D;
}

/** The room atlas as three plain colours (back and side walls, floor): the layout is model.mjs ATLAS, the top three quarters walls and the last the floors and the ceiling. */
export function plainAtlasPixels(size = 64) {
  const D = new Uint8ClampedArray(size * size * 4), wall = [224, 211, 184], floor = [154, 116, 80];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const c = y < size * 0.75 ? wall : floor, j = (y * size + x) * 4;
    D[j] = c[0]; D[j + 1] = c[1]; D[j + 2] = c[2]; D[j + 3] = 255;
  }
  return D;
}

// What was encoded to DDS is kept by what it is made of (the surface, its colour, the age): most houses of a map share most of their files.
const KEEP = 400;
const caches = new WeakMap();   // by the function that encodes (a test passes its own)
function dds(key, width, height, pixels, encode) {
  let kept = caches.get(encode);
  if (!kept) caches.set(encode, kept = new Map());
  if (kept.has(key)) return kept.get(key);
  const bytes = encode(width, height, pixels());
  kept.set(key, bytes);
  if (kept.size > KEEP) kept.delete(kept.keys().next().value);
  return bytes;
}

export function makeModFiles(settings, name, { author = "", encode = encodeDds } = {}) {
  const p = sanitize(settings), { G } = buildGeometry(p), { obj, mtl } = buildObj(p);
  const textures = new Map();
  for (const f of textureFiles(p, G)) textures.set(f.path, dds(f.key, f.width, f.height, f.pixels, encode));
  if (p.interior) textures.set(matTexture("interior").diffuse, dds("interior", 64, 64, () => plainAtlasPixels(64), encode));
  if (seeThroughGlass(p)) textures.set(matTexture("glass").diffuse, dds("glass", 64, 64, () => glassPixels(64), encode));

  const i3d = new Map();
  for (const [n, data] of Object.entries(i3dFiles(p, { withTex: true }))) i3d.set(n, typeof data === "string" ? latin1(data) : data);

  const mod = new Map([["modDesc.xml", modDescXml(p, name, { author, icon: false })], [MOD_FILES.xml, placeableXml(p, name, { image: false })], ...i3d, ...textures]);
  const dir = slugify(name) + "/";
  const exported = new Map([...i3d].map(([n, d]) => [dir + n, d]));
  exported.set(dir + "placeable_snippet.xml", placeableSnippet(p));
  for (const [n, d] of textures) exported.set(dir + n, d);
  return { p, obj, mtl, mod, export: exported };
}

/** The same as editor.modelFiles: {obj, mtl, mod, export}, the zips as Uint8Arrays (jszip is loaded here, so the rest runs without it). */
export async function makeFiles(settings, name, opts = {}) {
  const { default: JSZip } = await import("jszip");
  const f = makeModFiles(settings, name, opts);
  const zip = files => { const z = new JSZip(); for (const [n, d] of files) z.file(n, d); return z.generateAsync({ type: "uint8array", compression: "DEFLATE" }); };
  return { obj: f.obj, mtl: f.mtl, mod: await zip(f.mod), export: await zip(f.export) };
}
