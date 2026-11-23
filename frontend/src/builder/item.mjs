// The modeller as a source of items for "My items" (docs/PLAN_BUILDER.md, the modeller is for objects; a mod or a building uses them): a prop saved as an asset the
// way /items stores one: an i3d with its own files beside it (no folders), its .shapes, the atlas's pictures and an .obj the preview draws (src/editor/assets.mjs).
// Pure, no DOM; the atlas's DDS files are made by the page (atlasDdsFiles) and added under the names in `pictures`.
import { sanitize, placedMesh } from "./model.mjs";
import { exportI3dAtlas, atlasFiles, partAtlasUv } from "./atlas.mjs";
import { flattenI3d } from "../editor/assets.mjs";

/** A file stem the server accepts: letters and digits with _ between ("My Silo / No. 2!" -> "My_Silo_No_2"), "item" when nothing is left. */
const itemStem = name => String(name || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "item";

const round = v => Math.round(v * 1000) / 1000;

/**
 * The item for a project. -> {files: Map(name -> string | Uint8Array) (i3d, .i3d.shapes, .obj), pictures: {diffuse, normal, specular} (the atlas files to add),
 * meta (as My items keeps it: i3d, obj, hidden = the collision shapes, box, mount "floor", turn 0, kinds [], use "piece", texture = the atlas's diffuse picture), layout, textures (ids of My textures it is made of)}.
 */
export function makeItem(model, {name = "item", width} = {}) {
  const m = sanitize(model), stem = itemStem(name);
  const atlas = exportI3dAtlas(m, {name: stem, ...(width ? {width} : {})});
  const pictures = Object.fromEntries(Object.entries(atlasFiles(stem)).map(([k, v]) => [k, v.replace(/^textures\//, "")]));
  const i3d = flattenI3d(atlas.i3d, [...Object.values(pictures), stem + ".i3d.shapes"]);
  // the preview: every part as it stands, as triangles in an .obj (the collision is not in it)
  const obj = ["# Wavefront OBJ file", "# made by the House to i3d modeller"], min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let base = 0;
  for (const p of m.parts) {
    const g = placedMesh(p), uv = partAtlasUv(m, p, atlas.layout);
    obj.push(`g ${p.name}`);
    for (let k = 0; k < uv.length; k += 2) obj.push(`vt ${round(uv[k])} ${round(uv[k + 1])}`);
    for (let k = 0; k < g.p.length; k += 3) {
      const v = [g.p[k] + p.x, g.p[k + 1] + p.y, g.p[k + 2] + p.z];
      for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], v[a]); max[a] = Math.max(max[a], v[a]); }
      obj.push(`v ${v.map(round).join(" ")}`);
    }
    for (let k = 0; k < g.i.length; k += 3) obj.push(`f ${[0, 1, 2].map(c => `${g.i[k + c] + 1 + base}/${g.i[k + c] + 1 + base}`).join(" ")}`);   // (v/vt: the vertex and its uv have the same number)
    base += g.p.length / 3;
  }
  const box = m.parts.length ? {min: min.map(round), max: max.map(round)} : {min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5]};
  const meta = {i3d: stem + ".i3d", obj: stem + ".obj", hidden: m.parts.filter(p => p.collision).map(p => "collision_" + p.name), box, mount: "floor", turn: 0, kinds: [], use: "piece", texture: pictures.diffuse, icon: "", iconV: 0};
  return {files: new Map([[stem + ".i3d", i3d], [stem + ".i3d.shapes", atlas.shapes], [stem + ".obj", obj.join("\n") + "\n"]]), pictures, meta, layout: atlas.layout, textures: atlas.textures};
}
