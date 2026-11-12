// Imported items ("assets"): props a user made in Giants Editor (a feeder ...) and placed inside a
// walk-in building like the kinds' own pieces. The game loads an item's i3d through a ReferenceNode
// (its mesh lives in an encrypted .shapes file we can't read); the preview draws the .obj that
// Giants Editor exports of the same model, in the same coordinates. No DOM, no three.js.
//
// An asset from the API: {id, name, meta, files: [{name, size}]}; meta (normalizeMeta):
//   i3d, obj    its file names
//   hidden      shapes the game doesn't draw (collision), left out of the preview
//   box         the model's bounding box {min, max} in its own coordinates (from the .obj)
//   mount       "floor" or "wall" (a wall piece's back, -z after turning, goes against the wall)
//   turn        degrees (0, 90, 180, 270) the model is turned before placing
//   kinds       kinds of building it's offered in; empty: every walk-in kind (a trough's: every kind with troughs)
//   use         "piece" (furniture inside, the default), "feedTrough" or "waterTrough": the look of that game object (objects.mjs)

export const ASSET_PREFIX = "asset:";
export const assetType = id => ASSET_PREFIX + id;
export const assetIdOf = type => typeof type === "string" && type.startsWith(ASSET_PREFIX) ? type.slice(ASSET_PREFIX.length) : null;

const base = path => String(path).split(/[\\/]/).pop() || "";
const stem = name => base(name).toLowerCase().replace(/\.(png|dds)$/, "");
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`)); return m ? m[1] : null; };

/**
 * What an i3d needs and shows: shapesFile, own (its files, as written: the .shapes and its own
 * textures), game ($data/... files the game has), hidden (names of shapes that aren't drawn) and
 * root (its first node's name).
 */
export function readI3d(text) {
  const shapesFile = (text.match(/externalShapesFile="([^"]*)"/) || [])[1] || null;
  const paths = [...text.matchAll(/<File\b[^>]*>/g)].map(m => attr(m[0], "filename")).filter(Boolean);
  const own = [...(shapesFile ? [shapesFile] : []), ...paths.filter(f => !f.startsWith("$"))];
  const scene = text.slice(text.indexOf("<Scene"));
  const nodes = [...scene.matchAll(/<(Shape|TransformGroup|ReferenceNode)\b[^>]*>/g)].map(m => m[0]);
  return {
    shapesFile, own, game: paths.filter(f => f.startsWith("$")),
    hidden: nodes.filter(t => attr(t, "nonRenderable") === "true").map(t => attr(t, "name")),
    root: nodes.length ? attr(nodes[0], "name") : null,
  };
}

/** The i3d's own files (by name) that aren't among names. A .dds stands in for a .png of the same name. */
export function missingFiles(i3dText, names) {
  const have = new Set(names.map(stem));
  return readI3d(i3dText).own.map(base).filter(f => !have.has(stem(f)));
}

/**
 * The triangles of an .obj ({positions: flat [x, y, z, ...], box: {min, max}}), leaving out the
 * groups (Giants Editor writes one per node, "g name") named in skip.
 */
export function readObj(text, skip = []) {
  const v = [], out = [], leave = new Set(skip);
  let group = "", min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const line of text.split(/\r?\n/)) {
    const w = line.trim().split(/\s+/);
    if (w[0] === "v") v.push([+w[1], +w[2], +w[3]]);
    else if (w[0] === "g" || w[0] === "o") group = w.slice(1).join(" ");
    else if (w[0] === "f" && !leave.has(group)) {
      const idx = w.slice(1).map(s => { const k = parseInt(s, 10); return k < 0 ? v.length + k : k - 1; });
      for (let i = 1; i + 1 < idx.length; i++) for (const k of [idx[0], idx[i], idx[i + 1]]) {
        const q = v[k]; if (!q) throw new Error("The .obj file is damaged (a face uses a corner that isn't there).");
        out.push(...q);
        for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], q[a]); max[a] = Math.max(max[a], q[a]); }
      }
    }
  }
  if (!out.length) throw new Error("The .obj file has no faces.");
  return {positions: out, box: {min, max}};
}

const TURNS = [0, 90, 180, 270];
/** What an item is for: furniture inside, or the look of a feed or water trough in the pasture. */
export const USES = ["piece", "feedTrough", "waterTrough"];
const isVec = a => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
/** An asset's meta with every field known and in range. */
export function normalizeMeta(m) {
  m = m && typeof m === "object" ? m : {};
  const okBox = m.box && isVec(m.box.min) && isVec(m.box.max) && m.box.min.every((x, i) => x <= m.box.max[i]);
  return {
    i3d: typeof m.i3d === "string" ? m.i3d : "", obj: typeof m.obj === "string" ? m.obj : "",
    hidden: Array.isArray(m.hidden) ? m.hidden.filter(x => typeof x === "string") : [],
    box: okBox ? {min: [...m.box.min], max: [...m.box.max]} : {min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5]},
    mount: m.mount === "wall" ? "wall" : "floor",
    turn: TURNS.includes(m.turn) ? m.turn : 0,
    kinds: Array.isArray(m.kinds) ? m.kinds.filter(x => typeof x === "string") : [],
    use: USES.includes(m.use) ? m.use : "piece",
  };
}

const round = v => Math.round(v * 1000) / 1000;
/** [width, depth, height] of the model in metres, as placed (after its turn). */
export function assetSize(meta) {
  const {min, max} = meta.box, w = round(max[0] - min[0]), d = round(max[2] - min[2]);
  return meta.turn % 180 ? [d, w, round(max[1] - min[1])] : [w, d, round(max[1] - min[1])];
}

/**
 * [width, depth, height] of the box round the model turned rot degrees more (about its middle), as
 * placed: the footprint a trough takes up, and the box a game object stands for.
 */
export function turnedSize(meta, rot = 0) {
  const [w, d, h] = assetSize(meta), r = rot * Math.PI / 180, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
  return [round(w * c + d * s), round(w * s + d * c), h];
}

/** An imported item as a catalog piece (layout.mjs): no settings of its own, drawn by the editor. */
export function assetDef(asset) {
  const meta = normalizeMeta(asset.meta), [w, d, h] = assetSize(meta);
  return {name: asset.name, mount: meta.mount, params: [], defaults: {},
    // footprints at least 10 cm, so a thin model can still be picked and dragged
    size: () => [Math.max(0.1, w), Math.max(0.1, d)], height: () => Math.max(0.05, h),
    build() {}, asset: {...asset, meta}};
}
/** Stands in for an item whose asset was deleted (or hasn't loaded yet): kept, drawn as nothing. */
const MISSING = {name: "Missing item", mount: "floor", params: [], defaults: {}, size: () => [0.5, 0.5], height: () => 0.5, build() {}, missing: true};

/**
 * The pieces offered in a kind of building: its own catalog, then the user's items for that kind,
 * then a stand-in for each item type in items whose asset isn't in the list.
 */
export function withAssets(catalog, assets, kindId, items = []) {
  const out = {...catalog};
  for (const a of assets || []) {
    const {kinds, use} = normalizeMeta(a.meta);
    if (use === "piece" && (!kinds.length || kinds.includes(kindId))) out[assetType(a.id)] = assetDef(a);
  }
  for (const it of items || []) if (it && assetIdOf(it.type) && !out[it.type]) out[it.type] = MISSING;
  return out;
}

/** The user's items that can be the look of a trough object (type: feedTrough | waterTrough) in a kind of building. */
export function troughAssets(assets, type, kindId) {
  return (assets || []).filter(a => { const m = normalizeMeta(a.meta); return m.use === type && (!m.kinds.length || m.kinds.includes(kindId)); });
}

/**
 * Where the item's i3d goes for a placed item on a floor at height F: translation and rotY
 * (degrees, about y), so the model's box sits centred on the item, on the floor, turned with it.
 * Turning by r maps (x, z) to (x cos r + z sin r, -x sin r + z cos r), as layout.mjs toWorld does.
 */
export function placement(meta, item, F) {
  const {min, max} = meta.box, rotY = ((item.rot + meta.turn) % 360 + 360) % 360, r = rotY * Math.PI / 180;
  const cx = (min[0] + max[0]) / 2, cz = (min[2] + max[2]) / 2, c = Math.cos(r), s = Math.sin(r);
  return {translation: [item.x - (cx * c + cz * s), F - min[1], item.z - (-cx * s + cz * c)], rotY};
}

/** The item's folder in an export: items/<name in camelCase>_<id start>. */
export function assetFolder(asset) {
  const words = String(asset.name).normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/[^A-Za-z0-9]+/).filter(Boolean);
  const name = words.map((w, i) => i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()).join("") || "item";
  return `items/${name}_${String(asset.id).slice(0, 6)}`;
}

/**
 * The i3d with its own files pointing at the files next to it, as uploaded (a texture in a folder,
 * or a .png uploaded as .dds, by name); the game's files ($data/...) are left alone.
 */
export function flattenI3d(text, names) {
  const byStem = new Map(names.map(n => [stem(n), n]));
  return text.replace(/\b(filename|externalShapesFile)="([^"$][^"]*)"/g, (all, k, path) => {
    const n = byStem.get(stem(path));
    return n ? `${k}="${n}"` : all;
  });
}

/** "cow-feeder.i3d" -> "Cow feeder", "animalFeedersCow.i3d" -> "Animal feeders cow". */
export function nameFromFile(file) {
  const s = base(file).replace(/\.[^.]*$/, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[-_.]+/g, " ").trim().toLowerCase();
  return s ? s[0].toUpperCase() + s.slice(1) : "Item";
}

// ---- Several items in one export ----------------------------------------------------------------

/** The nodes directly under <Scene>, each {name, text (the whole node with its children), names (it and every node below)}. */
function sceneNodes(text) {
  const start = text.indexOf("<Scene"), end = text.lastIndexOf("</Scene>");
  if (start < 0 || end < 0) return [];
  const open = text.indexOf(">", start) + 1, out = [];
  let depth = 0, from = 0, names = [];
  for (const m of text.slice(open, end).matchAll(/<(\/?)([A-Za-z0-9]+)([^>]*?)(\/?)>/g)) {
    const [all, closing, , attrs, selfClosing] = m;
    if (!closing) {
      if (!depth) { from = m.index; names = []; }
      names.push(attr(attrs, "name") || "");
    }
    if (!closing && !selfClosing) depth++;
    else if (closing) depth--;
    if (!depth) out.push({name: names[0], names, text: text.slice(open + from, open + m.index + all.length)});
  }
  return out;
}

const numbers = s => s.trim().split(/\s+/).map(Number);
const fmt = v => String(Math.round(v * 1e6) / 1e6);

/** The text of an .obj with only the faces of the groups in keep, corners renumbered, positions moved by -shift. */
function objPart(objText, keep, shift) {
  const v = [], vt = [], vn = [], pick = [new Map(), new Map(), new Map()], used = [[], [], []], groups = new Map();
  let group = "", kept = false;
  const take = (kind, i) => {
    if (!pick[kind].has(i)) { pick[kind].set(i, pick[kind].size + 1); used[kind].push(i); }
    return pick[kind].get(i);
  };
  for (const line of objText.split(/\r?\n/)) {
    const w = line.trim().split(/\s+/);
    if (w[0] === "v") v.push(w.slice(1, 4).map(Number));
    else if (w[0] === "vt") vt.push(w.slice(1));
    else if (w[0] === "vn") vn.push(w.slice(1));
    else if (w[0] === "g" || w[0] === "o") { group = w.slice(1).join(" "); kept = keep.has(group); }
    else if (w[0] === "f" && kept) {
      const sizes = [v.length, vt.length, vn.length];
      const corners = w.slice(1).map(c => c.split("/").map((s, k) => {
        if (s === "") return "";
        const n = parseInt(s, 10);
        return take(k, n < 0 ? sizes[k] + n + 1 : n);
      }).join("/"));
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(`f ${corners.join(" ")}`);
    }
  }
  const lines = ["# Wavefront OBJ file", "# split from a Giants Editor export by building-creator-fs25"];
  for (const i of used[0]) lines.push(`v ${v[i - 1].map((x, a) => fmt(x - shift[a])).join(" ")}`);
  for (const i of used[1]) lines.push(`vt ${vt[i - 1].join(" ")}`);
  for (const i of used[2]) lines.push(`vn ${vn[i - 1].join(" ")}`);
  for (const [g, fs] of groups) lines.push(`g ${g}`, ...fs);
  return {text: lines.join("\n") + "\n", found: groups.size > 0};
}

/**
 * An export of several nodes (one i3d, one .obj in world coordinates) cut into one item per node under
 * <Scene>: [{name, i3dFile, objFile, i3d, obj, shapesFile}]. Each i3d keeps its node (moved to the
 * origin; the children as they are), the materials and files it uses and the same .shapes file (its
 * shapes are picked by shapeId); the .obj has its faces only, moved the same way. A node with a
 * turn or a scale is not straightened out: only its translation is taken off.
 */
export function splitItems(i3dText, objText) {
  const sceneAt = i3dText.indexOf("<Scene"), head = i3dText.slice(0, sceneAt), tail = i3dText.slice(i3dText.lastIndexOf("</Scene>"));
  // a self-closing <Material .../>, or one with children up to its closing tag
  const materials = [...head.matchAll(/<Material\b[^>]*\/>|<Material\b[^>]*>[\s\S]*?<\/Material>/g)].map(m => m[0]);
  const out = [], used = new Set();
  for (const node of sceneNodes(i3dText)) {
    const root = node.text.match(/^<[A-Za-z0-9]+[^>]*>/)[0];
    const t = attr(root, "translation");
    const shift = t ? numbers(t) : [0, 0, 0];
    const moved = node.text.replace(root, root.replace(/\s+translation="[^"]*"/, ""));
    const ids = new Set([...moved.matchAll(/materialIds="([^"]*)"/g)].flatMap(m => m[1].split(/[\s,]+/)));
    const mine = materials.filter(m => ids.has(attr(m.match(/^<Material\b[^>]*>/)[0], "materialId")));
    const fileIds = new Set(mine.flatMap(m => [...m.matchAll(/\bfileId="([^"]*)"/g)].map(x => x[1])));
    const files = head.match(/<Files>[\s\S]*?<\/Files>/);
    const keptFiles = files ? [...files[0].matchAll(/<File\b[^>]*\/>/g)].map(m => m[0]).filter(f => fileIds.has(attr(f, "fileId"))) : [];
    let h = head;
    if (files) h = h.replace(files[0], keptFiles.length ? `<Files>\n        ${keptFiles.join("\n        ")}\n    </Files>` : "");
    const block = head.match(/<Materials>[\s\S]*?<\/Materials>/);
    if (block) h = h.replace(block[0], mine.length ? `<Materials>\n        ${mine.join("\n        ")}\n    </Materials>` : "");
    const file = `${node.name}.i3d`;
    h = h.replace(/(<i3D\b[^>]*?\bname=")[^"]*"/, `$1${file}"`);
    const part = objPart(objText, new Set(node.names), shift);
    if (!part.found) throw new Error(`The .obj has no faces for “${node.name}”. Export the .obj of the same selection as the i3d.`);
    let name = file;
    for (let n = 2; used.has(name); n++) name = `${node.name}${n}.i3d`;
    used.add(name);
    out.push({name: nameFromFile(node.name + ".i3d"), i3dFile: name, objFile: name.replace(/\.i3d$/, ".obj"),
      i3d: `${h}<Scene>\n        ${moved}\n    ${tail}`, obj: part.text, shapesFile: attr(head.match(/<Shapes\b[^>]*>/)?.[0] || "", "externalShapesFile")});
  }
  return out;
}

// ---- Settings kept between imports --------------------------------------------------------------

/** The choices of an import worth keeping for the next one: {use, mount, turn, kinds, shared}. */
export function importSettings(meta, shared = false) {
  const m = normalizeMeta(meta);
  return {use: m.use, mount: m.mount, turn: m.turn, kinds: [...m.kinds], shared: !!shared};
}
/** A new item's meta with the choices of the last import (saved: importSettings's, or null; anything damaged is cleaned). */
export function withImportSettings(meta, saved) {
  if (!saved || typeof saved !== "object") return meta;
  const {use, mount, turn, kinds} = normalizeMeta({...meta, ...saved});
  return {...meta, use, mount, turn, kinds};
}
