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
//   kinds       kinds of building it's offered in; empty: every walk-in kind

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
  };
}

const round = v => Math.round(v * 1000) / 1000;
/** [width, depth, height] of the model in metres, as placed (after its turn). */
export function assetSize(meta) {
  const {min, max} = meta.box, w = round(max[0] - min[0]), d = round(max[2] - min[2]);
  return meta.turn % 180 ? [d, w, round(max[1] - min[1])] : [w, d, round(max[1] - min[1])];
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
    const kinds = normalizeMeta(a.meta).kinds;
    if (!kinds.length || kinds.includes(kindId)) out[assetType(a.id)] = assetDef(a);
  }
  for (const it of items || []) if (it && assetIdOf(it.type) && !out[it.type]) out[it.type] = MISSING;
  return out;
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
