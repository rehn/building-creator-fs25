// The modeller (docs/PLAN_BUILDER.md), step 1: a project is a list of parts built from primitives (box, cylinder), each with its base at
// x, y, z, turned about its own middle (rotX, rotZ, then rotY last: R = Ry * Rx * Rz), with a colour. This file is the model: sanitize, a mesh per part and the i3d export.
// Pure, no DOM. It imports the i3d writer only, never the house editor (editor.mjs, model.mjs): the two views share the export code, not each other.
import { I3dDoc, tg, shape, boxMesh, v3 } from "../editor/i3d.mjs";

export const FORMAT = "fs25-builder", VERSION = 1, MAX_PARTS = 200, MAX_MATERIALS = 32;
export const SHAPES = ["box", "cylinder"];
const DEFAULT_COLOR = "#9aa3a8";

const num = (v, d) => { v = +v; return Number.isFinite(v) ? v : d; };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = v => Math.round(v * 1000) / 1000;
const text = (s, d) => (typeof s === "string" ? s.replace(/[<>"&'\u0000-\u001f]/g, "").trim().slice(0, 60) : "") || d;
const unit = (v, d) => round(clamp(num(v, d), 0, 1));
const color = c => (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : DEFAULT_COLOR);

/** A part as the model keeps it: known shape, every number in range. id: its place in the list. */
function cleanPart(raw, id) {
  const turn = v => round(((num(v, 0) % 360) + 540) % 360 - 180);   // (-180, 180]
  return {
    id, name: text(raw.name, `part${id}`), shape: SHAPES.includes(raw.shape) ? raw.shape : "box",
    x: round(clamp(num(raw.x, 0), -200, 200)), y: round(clamp(num(raw.y, 0), -10, 100)), z: round(clamp(num(raw.z, 0), -200, 200)),
    rotX: turn(raw.rotX), rotY: turn(raw.rotY), rotZ: turn(raw.rotZ),
    w: round(clamp(num(raw.w, 1), 0.01, 50)), h: round(clamp(num(raw.h, 1), 0.01, 50)), d: round(clamp(num(raw.d, 1), 0.01, 50)),
    r: round(clamp(num(raw.r, 0.5), 0.01, 25)), seg: Math.round(clamp(num(raw.seg, 16), 6, 64)),
    color: color(raw.color),
    faces: {}, faceRot: {}, collision: raw.collision !== false,
  };
}

/** The faces a shape has, in the order its mesh draws them: box -x +x -y +y -z +z (two triangles each), cylinder side, bottom, top. */
const BOX_FACES = [["nx", "Left (-x)"], ["px", "Right (+x)"], ["ny", "Bottom (-y)"], ["py", "Top (+y)"], ["nz", "Back (-z)"], ["pz", "Front (+z)"]];
const CYLINDER_FACES = [["side", "Side"], ["bottom", "Bottom"], ["top", "Top"]];
export const partFaces = part => (part.shape === "cylinder" ? CYLINDER_FACES : BOX_FACES).map(([id, label]) => ({id, label}));

/** For each triangle of partMesh(part) the face it is on. */
export function faceOfTriangle(part) {
  if (part.shape === "cylinder") return [...Array(part.seg * 2).fill("side"), ...Array(part.seg).fill("bottom"), ...Array(part.seg).fill("top")];
  return BOX_FACES.flatMap(([id]) => [id, id]);
}

/** The faces of a part keep only what exists: a face its shape has, pointing at a material row that exists. */
function cleanFaces(shape, raw, materialIds) {
  const out = {}, has = new Set((shape === "cylinder" ? CYLINDER_FACES : BOX_FACES).map(f => f[0]));
  if (raw && typeof raw === "object" && !Array.isArray(raw)) for (const [f, m] of Object.entries(raw)) if (has.has(f) && typeof m === "number" && materialIds.has(m)) out[f] = m;
  return out;
}

/** The quarter turns of faces' textures: {faceId: 90 | 180 | 270}, only for faces the shape has (0 is the same as none). */
function cleanRot(shape, raw) {
  const out = {}, has = new Set((shape === "cylinder" ? CYLINDER_FACES : BOX_FACES).map(f => f[0]));
  if (raw && typeof raw === "object" && !Array.isArray(raw)) for (const [f, d] of Object.entries(raw)) if (has.has(f) && (d === 90 || d === 180 || d === 270)) out[f] = d;
  return out;
}

/** A row's texture: one of the user's saved textures (a plain id), the real size of one repeat in metres and fit (the picture once over each whole face, for a logo or a sign: the size is not used); null for colour only. */
function cleanTexture(t) {
  if (!t || typeof t !== "object" || typeof t.id !== "string" || !/^[a-z0-9]{1,64}$/.test(t.id)) return null;
  const meters = round(num(t.meters, 1));
  return {id: t.id, meters: meters > 0 ? Math.min(100, meters) : 1, fit: t.fit === true};
}

/** Material rows: {id, name, color, texture, smoothness (0-1, how shiny: the game's specular map red), metalness (0-1)}, ids kept when they are whole numbers and not taken, else the next free; at most MAX_MATERIALS. */
function cleanMaterials(raw) {
  const rows = (Array.isArray(raw) ? raw : []).filter(m => m && typeof m === "object" && !Array.isArray(m)).slice(0, MAX_MATERIALS), used = new Set(), out = [];
  for (const m of rows) {
    const id = Number.isInteger(m.id) && m.id > 0 && !used.has(m.id) ? m.id : Math.max(0, ...used) + 1;
    used.add(id); out.push({id, name: text(m.name, `material${id}`), color: color(m.color), texture: cleanTexture(m.texture), smoothness: unit(m.smoothness, 0.3), metalness: unit(m.metalness, 0)});
  }
  return out;
}

/** The item (in My items) this project was last saved as: {id}, or null. The next "Save as item" replaces that item's files instead of making another. */
function cleanItem(raw) {
  return raw && typeof raw === "object" && !Array.isArray(raw) && typeof raw.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(raw.id) ? {id: raw.id} : null;
}

/** The game mod's settings: shop price, daily upkeep (both whole numbers in range) and whether it can be bought and sold. */
function cleanMod(raw) {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {price: Math.round(clamp(num(o.price, 1000), 0, 10000000)), upkeep: Math.round(clamp(num(o.upkeep, 0), 0, 100000)), sellable: o.sellable !== false};
}

/** The project as it can be kept and built: bad input becomes an empty project, the rest is cleaned (ids 1.. in order, at most MAX_PARTS). */
export function sanitize(raw) {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const parts = (Array.isArray(o.parts) ? o.parts : []).filter(p => p && typeof p === "object" && !Array.isArray(p)).slice(0, MAX_PARTS);
  const materials = cleanMaterials(o.materials), ids = new Set(materials.map(m => m.id));
  return {format: FORMAT, version: VERSION, kind: "prop", mod: cleanMod(o.mod), item: cleanItem(o.item), materials, parts: parts.map((p, k) => { const c = cleanPart(p, k + 1); c.faces = cleanFaces(c.shape, p.faces, ids); c.faceRot = cleanRot(c.shape, p.faceRot); return c; })};
}

/** The colour a face is drawn in: its material row's if it has one, else the part's own. */
export function faceColor(model, part, faceId) {
  const m = part.faces[faceId] && model.materials.find(x => x.id === part.faces[faceId]);
  return m ? m.color : part.color;
}

/** The material row a face is drawn in, or null (the part's own colour). */
export function faceMaterial(model, part, faceId) {
  return (part.faces[faceId] && model.materials.find(x => x.id === part.faces[faceId])) || null;
}

const MAX_UV = 30;   // (the game wants uvs inside [-32, 32])

/**
 * The uvs of a part's mesh (partMesh order, in its own frame: turning does not change them). A face drawn in a textured material gets uvs in
 * repeats, from its real size in metres: u along the face as seen from outside (left to right), v up (the wall's y; on a cap, away from you),
 * starting at 0 in the face's corner; a face too big for the limit is scaled down to fit. Other faces keep the mesh's own uvs.
 */
export function partUv(model, part) {
  const g = partMesh(part), uv = [...g.uv], face = faceOfTriangle(part), seen = new Map();
  face.forEach((f, t) => { for (let k = 0; k < 3; k++) { const v = g.i[t * 3 + k]; if (!seen.has(f)) seen.set(f, new Set()); seen.get(f).add(v); } });
  for (const [f, verts] of seen) {
    const row = faceMaterial(model, part, f);
    if (!row || !row.texture) continue;
    const ids = [...verts], x = v => g.p[v * 3], y = v => g.p[v * 3 + 1], z = v => g.p[v * 3 + 2], per = {
      nx: v => [z(v), y(v)], px: v => [-z(v), y(v)], nz: v => [-x(v), y(v)], pz: v => [x(v), y(v)], py: v => [x(v), -z(v)], ny: v => [x(v), z(v)],
      top: v => [x(v), -z(v)], bottom: v => [x(v), z(v)],
      side: v => [-Math.round((v >> 1)) / part.seg * 2 * Math.PI * part.r, y(v)],
    }[f];
    const rot = part.faceRot[f] || 0;   // (a quarter turn of the texture on the face: u and v swap, one of them runs the other way)
    const fit = row.texture.fit;
    const raw = ids.map(v => per(v)).map(([a, b]) => rot === 90 ? [b, -a] : rot === 180 ? [-a, -b] : rot === 270 ? [-b, a] : [a, b]), lo = [0, 1].map(k => Math.min(...raw.map(r => r[k])));
    if (fit) {   // the picture once over the face: 0 to 1 each way (turned first, so a turned picture still fills it)
      const hi = [0, 1].map(k => Math.max(...raw.map(r => r[k])));
      ids.forEach((v, k) => { uv[v * 2] = hi[0] > lo[0] ? (raw[k][0] - lo[0]) / (hi[0] - lo[0]) : 0; uv[v * 2 + 1] = hi[1] > lo[1] ? (raw[k][1] - lo[1]) / (hi[1] - lo[1]) : 0; });
      continue;
    }
    let scale = 1 / row.texture.meters;
    const extent = Math.max(...raw.map(r => Math.max(r[0] - lo[0], r[1] - lo[1])));
    if (extent * scale > MAX_UV) scale = MAX_UV / extent;
    ids.forEach((v, k) => { uv[v * 2] = (raw[k][0] - lo[0]) * scale; uv[v * 2 + 1] = (raw[k][1] - lo[1]) * scale; });
  }
  return uv;
}

/** The mesh made of some of g's triangles only (their vertices, renumbered). */
function subsetMesh(g, tris) {
  const g2 = {p: [], n: [], uv: [], i: []}, at = new Map();
  for (const t of tris) for (let k = 0; k < 3; k++) {
    const v = g.i[t * 3 + k];
    if (!at.has(v)) { at.set(v, g2.p.length / 3); g2.p.push(g.p[v * 3], g.p[v * 3 + 1], g.p[v * 3 + 2]); g2.n.push(g.n[v * 3], g.n[v * 3 + 1], g.n[v * 3 + 2]); g2.uv.push(g.uv[v * 2], g.uv[v * 2 + 1]); }
    g2.i.push(at.get(v));
  }
  return g2;
}

/** Closed cylinder mesh on its base: radius r, height h, seg sides; the side has smooth normals, the ends flat ones. */
function cylinderMesh(r, h, seg) {
  const g = {p: [], n: [], uv: [], i: []};
  const at = k => [Math.cos(k % seg / seg * 2 * Math.PI), Math.sin(k % seg / seg * 2 * Math.PI)];   // (k % seg: the last column is exactly the first)
  // the side has seg + 1 columns: the last is the first again, so a texture can run all the way round without a jump
  for (let k = 0; k <= seg; k++) {
    const [c, s] = at(k);
    g.p.push(r * c, 0, r * s, r * c, h, r * s); g.n.push(c, 0, s, c, 0, s); g.uv.push(k / seg, 0, k / seg, 1);
  }
  for (let k = 0; k < seg; k++) {
    const loK = k * 2, hiK = k * 2 + 1, loJ = (k + 1) * 2, hiJ = (k + 1) * 2 + 1;
    g.i.push(loK, hiJ, loJ, loK, hiK, hiJ);
  }
  for (const [y, up] of [[0, false], [h, true]]) {
    const centre = g.p.length / 3, ring = centre + 1;
    g.p.push(0, y, 0); g.n.push(0, up ? 1 : -1, 0); g.uv.push(0.5, 0.5);
    for (let k = 0; k < seg; k++) { const [c, s] = at(k); g.p.push(r * c, y, r * s); g.n.push(0, up ? 1 : -1, 0); g.uv.push(0.5 + c / 2, 0.5 + s / 2); }
    for (let k = 0; k < seg; k++) { const a = ring + k, b = ring + (k + 1) % seg; g.i.push(...(up ? [centre, b, a] : [centre, a, b])); }
  }
  return g;
}

/** A part's mesh in its own frame: standing on y = 0, centred on x = z = 0 (the node places and turns it). */
export function partMesh(part) {
  if (part.shape === "cylinder") return cylinderMesh(part.r, part.h, part.seg);
  const g = boxMesh([part.w, part.h, part.d]);
  for (let k = 1; k < g.p.length; k += 3) g.p[k] += part.h / 2;
  return g;
}

/** The turn of a part as a 3x3 matrix (rows), R = Ry * Rx * Rz, right-handed like three.js: a point is turned about z first, then x, then y. */
export function turnMatrix(part) {
  const [a, b, c] = [part.rotX, part.rotY, part.rotZ].map(d => d * Math.PI / 180), [ca, sa, cb, sb, cc, sc] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b), Math.cos(c), Math.sin(c)];
  const mul = (A, B) => A.map(r => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
  return mul(mul([[cb, 0, sb], [0, 1, 0], [-sb, 0, cb]], [[1, 0, 0], [0, ca, -sa], [0, sa, ca]]), [[cc, -sc, 0], [sc, cc, 0], [0, 0, 1]]);
}

/** A part's mesh as it is placed: turned about its middle (0, h/2, 0), positions and normals; the node's translation then puts it at x, y, z. */
export function placedMesh(part) {
  const g = partMesh(part);
  if (!part.rotX && !part.rotY && !part.rotZ) return g;
  const R = turnMatrix(part), cy = part.h / 2, at = v => [0, 1, 2].map(i => R[i][0] * v[0] + R[i][1] * v[1] + R[i][2] * v[2]);
  const p = [], n = [];
  for (let k = 0; k < g.p.length; k += 3) {
    const q = at([g.p[k], g.p[k + 1] - cy, g.p[k + 2]]); p.push(q[0], q[1] + cy, q[2]);
    n.push(...at([g.n[k], g.n[k + 1], g.n[k + 2]]));
  }
  return {...g, p, n};
}

/** The files of a texture in the export (the three maps the browser made, see photoTexture.mjs). */
export const textureFiles = id => ({diffuse: `textures/${id}_diffuse.dds`, normal: `textures/${id}_normal.dds`, specular: `textures/${id}_specular.dds`});

/**
 * The i3d: a group named name with a shape per part (at its place; the turn is in the mesh) and one material per colour or texture. A part whose
 * faces are not all alike is a shape for each colour or material row (name, name_2 ...); a face in a textured row has uvs in repeats (partUv).
 * withTextures (default true): false draws textured rows in their colour. -> {i3d, doc, textures}: the meshes for the .shapes file, and the ids
 * of the textures used (their files are textures/<id>_diffuse.dds, _normal.dds, _specular.dds: textureFiles).
 */
export function exportI3d(model, {name = "prop", withTextures = true} = {}) {
  const m = sanitize(model), doc = new I3dDoc(), mats = new Map(), used = [];
  const matOf = hex => {
    if (!mats.has(hex)) mats.set(hex, doc.material(`color_${hex.slice(1)}`, {diffuseColor: `${v3([1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255))} 1`}));
    return mats.get(hex);
  };
  const texOf = id => {
    const key = "t:" + id;
    if (!mats.has(key)) {
      const f = textureFiles(id); used.push(id);
      mats.set(key, doc.material(`tex_${id}`, {}, [["Texture", f.diffuse], ["Normalmap", f.normal], ["Glossmap", f.specular]]));
    }
    return mats.get(key);
  };
  const nodes = [];
  for (const p of m.parts) {
    const mesh = {...placedMesh(p), uv: withTextures ? partUv(m, p) : partMesh(p).uv}, face = faceOfTriangle(p), groups = new Map();
    face.forEach((f, t) => {
      const row = faceMaterial(m, p, f), tex = withTextures && row && row.texture;
      const key = tex ? `t:${row.id}` : `c:${faceColor(m, p, f)}`;
      if (!groups.has(key)) groups.set(key, {tris: [], color: faceColor(m, p, f), tex: tex ? tex.id : null});
      groups.get(key).tris.push(t);
    });
    [...groups.values()].forEach((gr, k) => {
      const shapeName = k === 0 ? p.name : `${p.name}_${k + 1}`;
      nodes.push(shape(shapeName, {
        translation: [p.x, p.y, p.z], shapeId: doc.shape(shapeName, groups.size === 1 ? mesh : subsetMesh(mesh, gr.tris)),
        castsShadows: true, receiveShadows: true, materialIds: gr.tex ? texOf(gr.tex) : matOf(gr.color)}));
    });
  }
  return {i3d: doc.write(tg(name, [0, 0, 0], nodes), {name}), doc, textures: used};
}

/* ---------- Operations: each gives a new project and leaves the one it is given alone ---------- */
/** The project with a part added last (extra: any of its settings). Nothing is added past MAX_PARTS. */
export function addPart(model, extra = {}) {
  const m = sanitize(model);
  return m.parts.length >= MAX_PARTS ? m : sanitize({...m, parts: [...m.parts, extra]});
}
/** The project without part id; the others keep their order and are numbered 1.. again. */
export const removePart = (model, id) => { const m = sanitize(model); return sanitize({...m, parts: m.parts.filter(p => p.id !== id)}); };
/** The project with part id changed by patch (cleaned like any part; its id stays). */
export const updatePart = (model, id, patch) => { const m = sanitize(model); return sanitize({...m, parts: m.parts.map(p => p.id === id ? {...p, ...patch, id: p.id} : p)}); };
/** A copy of part id put last, 0.5 m to the side so it can be seen. */
export function duplicatePart(model, id) {
  const m = sanitize(model), p = m.parts.find(q => q.id === id);
  return p ? addPart(m, {...p, name: `${p.name} copy`, x: p.x + 0.5}) : m;
}
/** The part with its lowest point on y = 0 (a part that lies down is not left under the ground or in the air). */
export function groundPart(model, id) {
  const m = sanitize(model), p = m.parts.find(q => q.id === id);
  if (!p) return m;
  const g = placedMesh(p);
  let lo = Infinity; for (let k = 1; k < g.p.length; k += 3) lo = Math.min(lo, g.p[k]);
  return updatePart(m, id, {y: 0 - lo});   // (0 - lo, so a part already on the ground gets 0 and not -0)
}

/* ---------- Material rows and the face of a part that uses one ---------- */
/** The project with a material row added last (extra: name, color); its id is the next free. Nothing is added past MAX_MATERIALS. */
export function addMaterial(model, extra = {}) {
  const m = sanitize(model);
  return m.materials.length >= MAX_MATERIALS ? m : sanitize({...m, materials: [...m.materials, {...extra, id: undefined}]});
}
/** The project with material id changed by patch (its id stays). */
export const updateMaterial = (model, id, patch) => { const m = sanitize(model); return sanitize({...m, materials: m.materials.map(x => x.id === id ? {...x, ...patch, id: x.id} : x)}); };
/** The project without material id: the faces that used it are the part's own colour again. */
export const removeMaterial = (model, id) => { const m = sanitize(model); return sanitize({...m, materials: m.materials.filter(x => x.id !== id)}); };
/** The project with face faceId of part partId drawn in material materialId (null: the part's own colour again). */
export function setFaceMaterial(model, partId, faceId, materialId) {
  const m = sanitize(model);
  return sanitize({...m, parts: m.parts.map(p => {
    if (p.id !== partId) return p;
    const faces = {...p.faces};
    if (materialId === null) delete faces[faceId]; else faces[faceId] = materialId;
    return {...p, faces};
  })});
}

/** The project with the texture on face faceId of part partId turned deg (0, 90, 180 or 270) on the face; anything else changes nothing. */
export function setFaceRotation(model, partId, faceId, deg) {
  const m = sanitize(model);
  return sanitize({...m, parts: m.parts.map(p => {
    if (p.id !== partId) return p;
    const faceRot = {...p.faceRot};
    if (deg === 0) delete faceRot[faceId]; else faceRot[faceId] = deg;
    return {...p, faceRot};
  })});
}
