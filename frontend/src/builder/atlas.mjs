// The modeller's atlas (docs/PLAN_BUILDER.md, "UV och atlas"): the whole prop's surfaces in ONE texture (one material, one set of maps), the way the game's own models are.
// The atlas is a list of rows, each as wide as the texture: a colour (a thin strip) or one of the user's photo textures (width x width pixels, repeated `tiles` times
// upwards when a face needs more than one repeat). U may run any distance (the row is as wide as the texture, so it repeats cleanly); v must stay inside the row.
// Every row has PAD pixels above and below it that carry what the neighbouring pixels would be if the row repeated, so mips and filtering never pick up the next row.
// Pure, no DOM. v is counted from the bottom of the picture (as Giants Editor / Blender do): not tried in the game yet.
import { I3dDoc, tg, shape } from "../editor/i3d.mjs";
import { encodeDds } from "../editor/dds.mjs";
import { sanitize, partMesh, placedMesh, partUv, partFaces, faceOfTriangle, faceMaterial, faceColor } from "./model.mjs";

export const PAD = 8, COLOR_H = 8, MAX_TILES = 16, MIN_WIDTH = 128, MAX_HEIGHT = 4096, COLOR_WIDTH = 16, DEFAULT_WIDTH = 1024;
const pow2 = n => { let p = 16; while (p < n) p *= 2; return p; };

/** What a face is drawn in, for its row: {key, kind, color | textureId, smoothness, metalness} (a face without a material: the part's colour, smoothness 0.3, no metal). */
function surfaceOf(m, p, id) {
  const mr = faceMaterial(m, p, id), s = mr ? mr.smoothness : 0.3, mt = mr ? mr.metalness : 0, shine = `:${s}:${mt}`;
  return mr && mr.texture ? {key: "t:" + mr.texture.id + shine, kind: "texture", textureId: mr.texture.id, smoothness: s, metalness: mt}
    : {key: "c:" + faceColor(m, p, id) + shine, kind: "color", color: faceColor(m, p, id), smoothness: s, metalness: mt};
}

/** For each face of a part the vertices (indices into partMesh) that belong to it. */
function faceVertices(part) {
  const g = partMesh(part), face = faceOfTriangle(part), out = new Map();
  face.forEach((f, t) => { if (!out.has(f)) out.set(f, new Set()); for (let k = 0; k < 3; k++) out.get(f).add(g.i[t * 3 + k]); });
  return out;
}

/**
 * The rows of the atlas: {key, kind: "color" | "texture", color | textureId, tiles, y, h} (y: pixels from the top of the picture to the row's body, h: its height),
 * in the order the faces first use them; {width, height (a power of two), fits (within MAX_HEIGHT), rows}. A texture is one row however many material rows use it;
 * its tiles are the repeats of height the tallest face needs (1 to MAX_TILES; a face taller than that is squeezed). With no texture the atlas is COLOR_WIDTH wide.
 * width: the texture rows' width in pixels (a power of two); autoWidth: halve it (down to MIN_WIDTH) until the rows fit, else rows lose repeats of height, tallest first.
 */
export function atlasLayout(model, {width = DEFAULT_WIDTH, autoWidth = false} = {}) {
  const m = sanitize(model), rows = [], byKey = new Map();
  const row = (key, make) => { if (!byKey.has(key)) { const r = {key, ...make}; byKey.set(key, r); rows.push(r); } return byKey.get(key); };
  for (const p of m.parts) {
    const uv = partUv(m, p), verts = faceVertices(p);
    for (const {id} of partFaces(p)) {
      const {key, ...surf} = surfaceOf(m, p, id), r = row(key, {...surf, tiles: 1});
      if (surf.kind === "texture") {
        const top = Math.max(...[...verts.get(id)].map(v => uv[v * 2 + 1]));
        r.tiles = Math.max(r.tiles, Math.min(MAX_TILES, Math.max(1, Math.ceil(top - 1e-9))));
      }
    }
  }
  const textured = rows.some(r => r.kind === "texture");
  let W = textured ? pow2(width) : COLOR_WIDTH;
  const bodyH = r => r.kind === "color" ? COLOR_H : W * r.tiles;
  const total = () => rows.reduce((s, r) => s + bodyH(r) + 2 * PAD, 0);
  if (autoWidth) while (total() > MAX_HEIGHT && W > MIN_WIDTH) W /= 2;   // many or tall textures: a coarser atlas rather than fewer repeats
  while (total() > MAX_HEIGHT) {   // too much: take a repeat of height from the tallest row
    const tall = rows.filter(r => r.kind === "texture" && r.tiles > 1).sort((a, b) => b.tiles - a.tiles)[0];
    if (!tall) break;
    tall.tiles--;
  }
  let y = 0;
  for (const r of rows) { y += PAD; r.y = y; r.h = bodyH(r); y += r.h + PAD; }
  return {width: W, height: pow2(y), fits: y <= MAX_HEIGHT, rows};
}

/** The uvs of a part's mesh (partMesh order) in the atlas: a colour face in the middle of its row, a texture face by its real size inside its texture's row. */
export function partAtlasUv(model, part, layout) {
  const m = sanitize(model), g = partMesh(part), raw = partUv(m, part), uv = new Array(g.uv.length), verts = faceVertices(part), {width: W, height: H} = layout;
  for (const {id} of partFaces(part)) {
    const ids = [...verts.get(id)], key = surfaceOf(m, part, id).key, r = layout.rows.find(x => x.key === key);
    if (!r) continue;
    if (r.kind === "color") { for (const v of ids) { uv[v * 2] = 0.5; uv[v * 2 + 1] = 1 - (r.y + r.h / 2) / H; } continue; }
    const extent = Math.max(...ids.map(v => raw[v * 2 + 1])), squeeze = extent > r.tiles ? r.tiles / extent : 1, bottom = 1 - (r.y + r.h) / H;
    for (const v of ids) { uv[v * 2] = raw[v * 2]; uv[v * 2 + 1] = bottom + raw[v * 2 + 1] * squeeze * (W / H); }
  }
  return uv;
}

const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));

/**
 * The atlas's three pictures as RGBA (Uint8ClampedArray width * height * 4 each: diffuse, normal, specular). load(textureId) -> {size, diffuse, normal} (square RGBA maps) or null: a texture that cannot be had is plain grey. Specular is made from each row's material (R smoothness, G 255 no baked occlusion, B metalness: the game's baseShader getSpecular); a texture's stored specular map is not used. A texture is sampled to the atlas's width (nearest) and repeated up the row.
 * (square RGBA maps) or null: a texture that cannot be had is plain grey. A texture is sampled to the atlas's width (nearest) and repeated up the row.
 */
export function atlasPixels(layout, load) {
  const {width: W, height: H} = layout, out = {diffuse: new Uint8ClampedArray(W * H * 4), normal: new Uint8ClampedArray(W * H * 4), specular: new Uint8ClampedArray(W * H * 4)};
  for (let i = 0; i < W * H; i++) { out.diffuse.set([128, 128, 128, 255], i * 4); out.normal.set([128, 128, 255, 255], i * 4); out.specular.set([77, 255, 0, 255], i * 4); }
  for (const r of layout.rows) {
    const t = r.kind === "texture" ? load(r.textureId) : null;
    for (let y = r.y - PAD; y < r.y + r.h + PAD; y++) for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      out.specular.set([Math.round(r.smoothness * 255), 255, Math.round(r.metalness * 255), 255], o);   // (the game: R smoothness, G baked occlusion, B metalness)
      if (r.kind === "color") { out.diffuse.set([...hex(r.color), 255], o); continue; }
      if (!t) continue;   // (grey)
      const ly = ((y - r.y) % W + W) % W, sx = Math.floor(x * t.size / W), sy = Math.floor(ly * t.size / W), s = (sy * t.size + sx) * 4;
      for (const k of ["diffuse", "normal"]) out[k].set(t[k].subarray(s, s + 4), o);   // (a saved texture's own specular is not used: the material's shine is)
    }
  }
  return out;
}

/** The files of the atlas in the export. */
export const atlasFiles = name => ({diffuse: `textures/${name}_diffuse.dds`, normal: `textures/${name}_normal.dds`, specular: `textures/${name}_specular.dds`});

/** The three DDS files (with mips) of the atlas: {diffuse, normal, specular} as Uint8Array. */
export function atlasDdsFiles(layout, load) {
  const px = atlasPixels(layout, load), out = {};
  for (const k of ["diffuse", "normal", "specular"]) out[k] = encodeDds(layout.width, layout.height, px[k]);
  return out;
}

/**
 * The i3d of the prop with the atlas: a group with a shape per part and ONE material (textures/<name>_diffuse|normal|specular.dds, atlasFiles).
 * binary (default): the meshes are a binary <name>.i3d.shapes (shapes, bytes) as Giants Editor saves them, else XML in the i3d (shapes null).
 * -> {i3d, doc, layout, textures (ids of the user's textures the atlas is made of)}. The pictures come from atlasDdsFiles(layout, load).
 */
export function exportI3dAtlas(model, {name = "prop", width = DEFAULT_WIDTH, binary = true, collision = true, extraNodes = []} = {}) {
  const m = sanitize(model), layout = atlasLayout(m, {width, autoWidth: true}), doc = new I3dDoc(), f = atlasFiles(name);
  const material = doc.material("atlas", {}, [["Texture", f.diffuse], ["Normalmap", f.normal], ["Glossmap", f.specular]]);
  const nodes = m.parts.map(p => shape(p.name, {
    translation: [p.x, p.y, p.z], shapeId: doc.shape(p.name, {...placedMesh(p), uv: partAtlasUv(m, p, layout)}),
    castsShadows: true, receiveShadows: true, materialIds: material,
  }));
  // collision: a static shape for each part that has it, the same form and place as the part (the game keeps it in memory: meshUsage CPU, no tangents); the house export's group and mask
  const cm = collision && m.parts.some(p => p.collision) ? doc.material("collision_mat", {diffuseColor: "1 0 1 1"}) : 0;
  const solids = collision ? m.parts.filter(p => p.collision).map(p => shape("collision_" + p.name, {
    translation: [p.x, p.y, p.z], shapeId: doc.shape("collision_" + p.name, placedMesh(p), {cpu: true}), static: true, collisionFilterGroup: "0x3e", collisionFilterMask: "0xfffffbff",
    nonRenderable: true, castsShadows: false, receiveShadows: false, materialIds: cm})) : [];
  const root = tg(name, [0, 0, 0], [...extraNodes, tg("visuals", [0, 0, 0], nodes), ...(solids.length ? [tg("collisions", [0, 0, 0], solids)] : [])]);
  return {i3d: doc.write(root, {name, ...(binary ? {shapesFile: name + ".i3d.shapes"} : {})}), shapes: binary ? doc.shapesData() : null, doc, root, layout, textures: layout.rows.filter(r => r.kind === "texture").map(r => r.textureId)};
}
