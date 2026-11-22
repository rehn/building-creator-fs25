// The modeller (docs/PLAN_BUILDER.md), step 1: a project is a list of parts built from primitives (box, cylinder), each with its base at
// x, y, z, turned about its own middle (rotX, rotZ, then rotY last: R = Ry * Rx * Rz), with a colour. This file is the model: sanitize, a mesh per part and the i3d export.
// Pure, no DOM. It imports the i3d writer only, never the house editor (editor.mjs, model.mjs): the two views share the export code, not each other.
import { I3dDoc, tg, shape, boxMesh, v3 } from "../editor/i3d.mjs";

export const FORMAT = "fs25-builder", VERSION = 1, MAX_PARTS = 200;
export const SHAPES = ["box", "cylinder"];
const DEFAULT_COLOR = "#9aa3a8";

const num = (v, d) => { v = +v; return Number.isFinite(v) ? v : d; };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = v => Math.round(v * 1000) / 1000;
const text = (s, d) => (typeof s === "string" ? s.replace(/[<>"&'\u0000-\u001f]/g, "").trim().slice(0, 60) : "") || d;
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
  };
}

/** The project as it can be kept and built: bad input becomes an empty project, the rest is cleaned (ids 1.. in order, at most MAX_PARTS). */
export function sanitize(raw) {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const parts = (Array.isArray(o.parts) ? o.parts : []).filter(p => p && typeof p === "object" && !Array.isArray(p)).slice(0, MAX_PARTS);
  return {format: FORMAT, version: VERSION, kind: "prop", parts: parts.map((p, k) => cleanPart(p, k + 1))};
}

/** Closed cylinder mesh on its base: radius r, height h, seg sides; the side has smooth normals, the ends flat ones. */
function cylinderMesh(r, h, seg) {
  const g = {p: [], n: [], uv: [], i: []};
  const at = k => [Math.cos(k / seg * 2 * Math.PI), Math.sin(k / seg * 2 * Math.PI)];
  for (let k = 0; k < seg; k++) {
    const [c, s] = at(k);
    g.p.push(r * c, 0, r * s, r * c, h, r * s); g.n.push(c, 0, s, c, 0, s); g.uv.push(k / seg, 0, k / seg, 1);
  }
  for (let k = 0; k < seg; k++) {
    const j = (k + 1) % seg, loK = k * 2, hiK = k * 2 + 1, loJ = j * 2, hiJ = j * 2 + 1;
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

/** The i3d: a group named name with a shape per part (at its place; the turn is in the mesh) and one material per colour. {i3d, doc}: doc has the meshes for the .shapes file. */
export function exportI3d(model, {name = "prop"} = {}) {
  const m = sanitize(model), doc = new I3dDoc(), mats = new Map();
  const matOf = hex => {
    if (!mats.has(hex)) mats.set(hex, doc.material(`color_${hex.slice(1)}`, {diffuseColor: `${v3([1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255))} 1`}));
    return mats.get(hex);
  };
  const nodes = m.parts.map(p => shape(p.name, {
    translation: [p.x, p.y, p.z], shapeId: doc.shape(p.name, placedMesh(p)),
    castsShadows: true, receiveShadows: true, materialIds: matOf(p.color)}));
  return {i3d: doc.write(tg(name, [0, 0, 0], nodes), {name}), doc};
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
