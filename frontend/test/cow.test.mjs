import { test } from "node:test";
import assert from "node:assert/strict";
import { PRESETS, KIND, sanitize, buildGeometry, buildI3d, placeableXml, placementAreas } from "../src/editor/model.mjs";
import { roomOf, problems } from "../src/editor/layout.mjs";
import { cowCap, MAX_COWS } from "../src/editor/kinds/cow.mjs";

// Scene tree of an i3d, enough to resolve "0>6|2|0" mapping paths.
function sceneTree(xml) {
  const scene = xml.slice(xml.indexOf("<Scene>"), xml.indexOf("</Scene>"));
  const root = { children: [] }, stack = [root];
  for (const m of scene.matchAll(/<(\/?)(TransformGroup|Shape|Camera)\b([^>]*?)(\/?)>/g)) {
    if (m[1]) { stack.pop(); continue; }
    const attr = k => (m[3].match(new RegExp(`\\b${k}="([^"]*)"`)) || [])[1];
    const node = { name: attr("name"), translation: (attr("translation") || "0 0 0").split(" ").map(Number), rotation: (attr("rotation") || "0 0 0").split(" ").map(Number), attrs: m[3], children: [] };
    stack[stack.length - 1].children.push(node);
    if (!m[4]) stack.push(node);
  }
  return root.children;
}
function resolve(tree, path) {
  const [comp, rest] = path.split(">");
  let node = tree[+comp], pos = node.translation.slice();
  for (const i of rest.split("|").map(Number)) { node = node.children[i]; pos = pos.map((v, k) => v + node.translation[k]); }
  return { node, pos };
}
const mappings = xml => Object.fromEntries([...xml.matchAll(/<i3dMapping id="([^"]+)" node="([^"]+)"\/>/g)].map(m => [m[1], m[2]]));
const insidePoly = (poly, x, z) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, , zi] = poly[i], [xj, , zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
};
const cow = (o = {}) => sanitize({ kind: "cow", width: 12, depth: 8, cows: 12, floors: 1, floorHeight: 3, ...o });
const cowPresets = () => PRESETS.filter(x => x.kind === "cow");
const OPP = { front: "back", back: "front", left: "right", right: "left" };

/* ---------- Settings and presets ---------- */


/* ---------- Placeable XML ---------- */


/* ---------- Troughs and the yard ---------- */



/* ---------- The cow opening ---------- */

/* ---------- Inside ---------- */

/* ---------- Roof ventilators (any building) ---------- */
test("roof: ventilators stand on the ridge, a Swedish barn's lantern", () => {
  const plain = buildGeometry(sanitize({ width: 12, depth: 8 }));
  const vent = buildGeometry(sanitize({ width: 12, depth: 8, ventilators: 2 }));
  const top = g => Math.max(...g.p.filter((_, i) => i % 3 === 1));
  assert.ok(top(vent.G.roof) > plain.dims.ridgeY + 0.6, "a little roof above the ridge");
  assert.ok(top(vent.G.walls) > plain.dims.ridgeY + 0.3, "louvred sides above the ridge");
  assert.equal(sanitize({}).ventilators, 0, "houses have none by default");
  assert.ok(sanitize(PRESETS.find(x => x.id === "ladugard").settings).ventilators >= 1, "the red barn has one");
});

/** The wall of the building's first door. */
function firstDoorWall(p) { return p.windows.find(w => w.type === "door" && w.floor === 0).wall; }

