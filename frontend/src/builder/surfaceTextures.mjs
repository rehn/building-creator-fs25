// The modeller can draw with the surfaces of the buildings (editor/surfaces.mjs: concrete, boards, galvanised steel ...), made by the same code,
// so a prop looks like what stands next to it. A material row's texture is an id; for one of these the id says what it is made of, so nothing
// is saved per user and the atlas, the view and the export treat it like any texture: "sys" + the surface's name in lower case + its colour (6 hex digits).
// The row's colour is the surface's colour (the surfaces are shade maps that the colour multiplies). Pure, no DOM.
import { SURFACES } from "../editor/surfaces.mjs";
import { fitBase, compose } from "../editor/textures.mjs";

/** The surfaces offered, in the order of the list: {kind (the key in SURFACES), label}. A test keeps this equal to SURFACES. */
export const SURFACE_TEXTURES = [
  ["concrete", "Concrete"], ["whitewash", "Whitewash"], ["grime", "Grimy whitewash"], ["timber", "Rough timber"], ["oldboards", "Old boards"], ["oldtimber", "Old timber"],
  ["wood", "Planed wood"], ["boards", "Roof boards"], ["galv", "Galvanised steel"], ["steel", "Painted steel"], ["plastic", "Plastic"], ["rubber", "Rubber"],
  ["straw", "Straw"], ["litter", "Wood shavings"], ["paperPlain", "Wallpaper, plain"], ["paperStripe", "Wallpaper, striped"], ["paperFlower", "Wallpaper, flowers"],
].map(([kind, label]) => ({kind, label}));

const KINDS = new Map(Object.keys(SURFACES).map(k => [k.toLowerCase(), k]));
const ID = new RegExp(`^sys(${[...KINDS.keys()].join("|")})([0-9a-f]{6})$`);

/** The texture id of a surface in a colour ("#rrggbb"). */
export const surfaceTextureId = (kind, color) => "sys" + kind.toLowerCase() + color.slice(1).toLowerCase();

/** {kind, color} of a surface's texture id, or null for any other id (a texture of the user's). */
export function parseSurfaceTextureId(id) {
  const m = typeof id === "string" ? ID.exec(id) : null;
  return m ? {kind: KINDS.get(m[1]), color: "#" + m[2]} : null;
}

/** The metres one repeat covers: the maps are square, a surface is w x h in a building, so the side of a square of the same area. */
export const surfaceTextureMeters = kind => Math.round(Math.sqrt(SURFACES[kind].w * SURFACES[kind].h) * 100) / 100;

/** The maps of a surface's texture: {size, diffuse, normal} (square RGBA, row by row from the top), or null when the id is not one. */
export function surfaceTextureMaps(id) {
  const s = parseSurfaceTextureId(id);
  if (!s) return null;
  const base = fitBase(s.kind, 0), N = base.N;
  return {size: N, diffuse: compose(base.S, s.color, null, N), normal: base.normal};
}
