// Writing Giants i3d files: meshes, materials and a scene tree. The scene is built as plain
// objects first, so i3dMapping paths ("0>2|1") can be looked up by node name instead of counted.
// Pure functions, no DOM.

/** A number as the i3d writes it: at most 4 decimals, no "-0". */
export const num = v => { const r = Math.round(v * 10000) / 10000; return (Object.is(r, -0) ? 0 : r).toString(); };
export const v3 = a => a.map(num).join(" ");

/**
 * "CPU Mesh" flag, as Giants Editor writes it. The game keeps these meshes in memory so it can
 * rebuild their physics: placing a placeable turns its physics off and on again, and without
 * the flag our (inline, not pre-cooked) collision and trigger meshes would come back empty.
 */
const CPU_MESH = 256;

export function shapeXml(name, id, g, uv, {cpu = false} = {}) {
  uv = uv || g.uv;
  const nv = g.p.length / 3, nt = g.i.length / 3;
  const v = [], t = [];
  for (let i = 0; i < nv; i++) v.push(`        <v p="${num(g.p[i*3])} ${num(g.p[i*3+1])} ${num(g.p[i*3+2])}" n="${num(g.n[i*3])} ${num(g.n[i*3+1])} ${num(g.n[i*3+2])}" t0="${num(uv[i*2])} ${num(uv[i*2+1])}"/>`);
  for (let i = 0; i < nt; i++) t.push(`        <t vi="${g.i[i*3]} ${g.i[i*3+1]} ${g.i[i*3+2]}"/>`);
  return `    <IndexedTriangleSet name="${name}" shapeId="${id}"${cpu ? ` meshUsage="${CPU_MESH}"` : ""}>
      <Vertices count="${nv}" normal="true" uv0="true">
${v.join("\n")}
      </Vertices>
      <Triangles count="${nt}">
${t.join("\n")}
      </Triangles>
      <Subsets count="1">
        <Subset firstVertex="0" numVertices="${nv}" firstIndex="0" numIndices="${g.i.length}"/>
      </Subsets>
    </IndexedTriangleSet>`;
}

/** Closed box mesh of the given size, centred on the origin, faces turned outwards. */
export function boxMesh([sx, sy, sz]) {
  const g = {p:[], n:[], uv:[], i:[]};
  for (let ax = 0; ax < 3; ax++) for (const s of [-1, 1]) {
    const n = [0, 0, 0]; n[ax] = s;
    const a = (ax + 1) % 3, b = (ax + 2) % 3, base = g.p.length / 3, h = [sx/2, sy/2, sz/2];
    for (const [ua, ub] of [[-1,-1], [1,-1], [1,1], [-1,1]]) {
      const q = [0, 0, 0]; q[ax] = s * h[ax]; q[a] = ua * h[a]; q[b] = ub * h[b];
      g.p.push(...q); g.n.push(...n); g.uv.push((ua + 1) / 2, (ub + 1) / 2);
    }
    // (a, b) winding is counter-clockwise seen from +ax; flip it for the -ax face.
    g.i.push(...(s > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]).map(k => base + k));
  }
  return g;
}

/** Splits a mesh with vertex colors (g.c) into one mesh per color, each with that color. */
export function splitByColor(g) {
  const groups = new Map();
  for (let t = 0; t < g.i.length; t += 3) {
    const v = g.i[t], color = [g.c[v*3], g.c[v*3+1], g.c[v*3+2]], key = color.map(num).join(" ");
    if (!groups.has(key)) groups.set(key, {p:[], n:[], uv:[], i:[], color, map: new Map()});
    const out = groups.get(key);
    for (const u of [g.i[t], g.i[t+1], g.i[t+2]]) {
      if (!out.map.has(u)) {
        out.map.set(u, out.p.length / 3);
        out.p.push(g.p[u*3], g.p[u*3+1], g.p[u*3+2]); out.n.push(g.n[u*3], g.n[u*3+1], g.n[u*3+2]); out.uv.push(g.uv[u*2], g.uv[u*2+1]);
      }
      out.i.push(out.map.get(u));
    }
  }
  return [...groups.values()].map(({map, ...m}) => m);
}

/* ---------- Scene tree ---------- */
// A node: {tag, name, attrs, children}. Attributes are written in the order given; arrays are
// written as vectors, booleans as "true", undefined ones are left out.
const node = (tag, name, attrs = {}, children = []) => ({tag, name, attrs, children});
/** Transform group at translation, with optional children and extra attributes (rotation ...). */
export const tg = (name, translation, children = [], attrs = {}) => node("TransformGroup", name, {translation, ...attrs}, children);
export const shape = (name, attrs, children = []) => node("Shape", name, attrs, children);
export const camera = (name, attrs) => node("Camera", name, attrs);

const attrText = v => Array.isArray(v) ? v3(v) : typeof v === "number" ? num(v) : String(v);

/** The scene as i3d XML, with nodeIds 1, 2, 3 ... top-down (parents before their children). */
export function writeScene(root, depth = 2) {
  let nid = 1;
  const walk = (n, d) => {
    const ind = "  ".repeat(d);
    const attrs = Object.entries(n.attrs).filter(([, v]) => v !== undefined).map(([k, v]) => ` ${k}="${attrText(v)}"`).join("");
    const head = `${ind}<${n.tag} name="${n.name}"${attrs} nodeId="${nid++}"`;
    if (!n.children.length) return head + "/>";
    return `${head}>\n${n.children.map(c => walk(c, d + 1)).join("\n")}\n${ind}</${n.tag}>`;
  };
  return walk(root, depth);
}

/** The i3dMapping path of the first node called name ("0>2|1"), or null. The root is component 0. */
export function pathOf(root, name) {
  const find = (n, path) => {
    if (n.name === name) return path;
    for (let i = 0; i < n.children.length; i++) { const r = find(n.children[i], [...path, i]); if (r) return r; }
    return null;
  };
  const p = find(root, []);
  return p ? "0>" + p.join("|") : null;
}

/** Attributes in placeable XML whose value is the id of an i3dMapping. */
const NODE_ATTRS = ["node", "startNode", "endNode", "widthNode", "heightNode", "triggerNode", "teleportNode", "rootNode",
  "exactFillRootNode", "spawnNode", "cameraNode", "linkNode"];
/**
 * i3dMappings for every node the placeable XML names: [[id, path]], in the order it names them.
 * Values that are already paths ("0>") are left alone. Throws if a named node isn't in the scene.
 */
export function mappingsFor(root, xml) {
  const out = [], seen = new Set();
  for (const m of xml.matchAll(new RegExp(`\\b(?:${NODE_ATTRS.join("|")})="([^"]+)"`, "g"))) {
    const id = m[1];
    if (/^\d/.test(id) || seen.has(id)) continue;
    const path = pathOf(root, id);
    if (!path) throw new Error(`The placeable XML names "${id}", which isn't in the i3d scene`);
    seen.add(id); out.push([id, path]);
  }
  return out;
}

/* ---------- Document ---------- */
/** Collects files, materials and shapes, giving each an id in the order it is added. */
export class I3dDoc {
  constructor() { this.files = []; this.materials = []; this.shapes = []; }
  /** A texture or other file, by path; the same path gets the same id. */
  file(path) {
    const k = this.files.indexOf(path);
    if (k >= 0) return k + 1;
    this.files.push(path); return this.files.length;
  }
  /** A material: attributes (diffuseColor, alphaBlending ...) and maps [[kind, path]] (Texture, Normalmap ...). */
  material(name, attrs = {}, maps = []) {
    this.materials.push({name, attrs, maps: maps.map(([kind, path]) => [kind, this.file(path)])});
    return this.materials.length;
  }
  /** A mesh, with its own uvs if given; cpu: keep it in memory (collision and triggers). */
  shape(name, g, {uv, cpu = false} = {}) {
    const id = this.shapes.length + 1;
    this.shapes.push(shapeXml(name, id, g, uv, {cpu}));
    return id;
  }
  write(root, {name = "house", program = "House to i3d"} = {}) {
    const files = this.files.map((f, k) => `    <File fileId="${k + 1}" filename="${f}"/>`);
    const mats = this.materials.map((m, k) => {
      const head = `    <Material name="${m.name}" materialId="${k + 1}"${Object.entries(m.attrs).filter(([, v]) => v !== undefined).map(([a, v]) => ` ${a}="${attrText(v)}"`).join("")}`;
      return m.maps.length ? `${head}>\n${m.maps.map(([kind, id]) => `      <${kind} fileId="${id}"/>`).join("\n")}\n    </Material>` : head + "/>";
    });
    return `<?xml version="1.0" encoding="iso-8859-1"?>
<i3D name="${name}" version="1.6" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://i3d.giants.ch/schema/i3d-1.6.xsd">
  <Asset>
    <Export program="${program}" version="0.1"/>
  </Asset>
  ${files.length ? "<Files>\n" + files.join("\n") + "\n  </Files>" : "<Files/>"}
  <Materials>
${mats.join("\n")}
  </Materials>
  <Shapes>
${this.shapes.join("\n")}
  </Shapes>
  <Dynamics/>
  <Scene>
${writeScene(root)}
  </Scene>
</i3D>
`;
  }
}
