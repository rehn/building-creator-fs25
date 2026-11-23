// The look of an i3d as an .obj, made from the i3d's scene and its .i3d.shapes file, so an item can be imported from Giants Editor without exporting an
// .obj too: the preview and the placing (assets.mjs readObj, splitItems) use the same kind of .obj Giants Editor writes. Pure functions, no DOM.
//
// Every Shape node of the scene that has a shapeId becomes a group named after the node ("g name"), its vertices moved by the node's own and its
// parents' translation, rotation and scale (the i3d's rotation is Euler angles in degrees, X first, then Y, then Z), with the first uv set.
import { readShapes } from "./shapes.mjs";

const num = s => String(s).trim().split(/\s+/).map(Number);
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`)); return m ? m[1] : null; };

/** 4x4 matrices as 16 numbers, column-major (like the engine's), for p' = M p. */
const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; }
  return o;
}
/** translation * Rz * Ry * Rx * scale, the angles in degrees. */
export function localMatrix(translation, rotation, scale) {
  const [tx, ty, tz] = translation, [sx, sy, sz] = scale, [ax, ay, az] = rotation.map(d => d * Math.PI / 180);
  const cx = Math.cos(ax), sxn = Math.sin(ax), cy = Math.cos(ay), syn = Math.sin(ay), cz = Math.cos(az), szn = Math.sin(az);
  const Rx = [1, 0, 0, 0, 0, cx, sxn, 0, 0, -sxn, cx, 0, 0, 0, 0, 1];
  const Ry = [cy, 0, -syn, 0, 0, 1, 0, 0, syn, 0, cy, 0, 0, 0, 0, 1];
  const Rz = [cz, szn, 0, 0, -szn, cz, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const S = [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, 0, 0, 0, 1];
  const T = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, ty, tz, 1];
  return mul(T, mul(Rz, mul(Ry, mul(Rx, S))));
}
const at = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
const fmt = v => String(Math.round(v * 1e6) / 1e6);

/**
 * The .obj text of an i3d (its text) and the bytes of its .i3d.shapes. Throws an Error with a plain message when the shapes file cannot be read (a kind
 * of file the reader does not know) or when the i3d keeps its meshes inside itself (an old file with no external shapes file: nothing to read there).
 * @returns {{obj: string, shapes: number, triangles: number}}
 */
export function i3dToObj(i3dText, shapesBytes) {
  const scene = i3dText.indexOf("<Scene");
  if (scene < 0) throw new Error("The i3d has no scene.");
  let list;
  try { list = readShapes(shapesBytes); } catch (e) { throw new Error("The .shapes file could not be read (" + (e && e.message || e) + ")."); }
  const byId = new Map(list.map(s => [s.id, s]));
  const lines = ["# Wavefront OBJ file", "# made from the i3d and its .shapes file by building-creator-fs25"];
  const stack = [IDENT];
  let nv = 0, nt = 0, shapes = 0;
  for (const m of i3dText.slice(scene).matchAll(/<(\/?)([A-Za-z0-9]+)\b([^>]*?)(\/?)>/g)) {
    const [, closing, tagName, attrs, selfClosing] = m;
    if (tagName === "Scene") continue;
    if (closing) { if (stack.length > 1) stack.pop(); continue; }
    // other elements (user attributes, a rigid body ...) sit inside a node and do not move anything; they only keep the open/close count right
    if (!["Shape", "TransformGroup", "ReferenceNode", "Light", "Camera", "Audio", "Dynamic", "Emitter"].includes(tagName)) { if (!selfClosing) stack.push(stack[stack.length - 1]); continue; }
    const t = attr(attrs, "translation"), r = attr(attrs, "rotation"), s = attr(attrs, "scale");
    const world = mul(stack[stack.length - 1], localMatrix(t ? num(t) : [0, 0, 0], r ? num(r) : [0, 0, 0], s ? num(s) : [1, 1, 1]));
    const id = tagName === "Shape" ? attr(attrs, "shapeId") : null;
    const shape = id !== null ? byId.get(+id) : null;
    if (shape) {
      shapes++;
      lines.push(`g ${attr(attrs, "name") || "shape" + id}`);
      const n = shape.positions.length / 3, uv = shape.uv && shape.uv.length >= n * 2 ? shape.uv : null;
      for (let i = 0; i < n; i++) lines.push("v " + at(world, shape.positions[i * 3], shape.positions[i * 3 + 1], shape.positions[i * 3 + 2]).map(fmt).join(" "));
      if (uv) for (let i = 0; i < n; i++) lines.push(`vt ${fmt(uv[i * 2])} ${fmt(uv[i * 2 + 1])}`);
      for (let i = 0; i + 2 < shape.indices.length; i += 3) {
        const c = [0, 1, 2].map(k => shape.indices[i + k] + 1 + nv);
        lines.push("f " + c.map(k => uv ? `${k}/${k}` : String(k)).join(" "));
        nt++;
      }
      nv += n;
    }
    if (!selfClosing) stack.push(world);
  }
  if (!nt) throw new Error("The i3d's shapes file has nothing the scene uses.");
  return {obj: lines.join("\n") + "\n", shapes, triangles: nt};
}
