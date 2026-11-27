// GET /api/v1/buildings/{id}/scenery (docs/API.md): what a map program needs to update a building a person has changed in the app, in the shape of the
// scenery answer of /api/v1/generate. Pure apart from `make` (the file maker), so it is tested without a server.
import { editedGeometry } from "./edited.mjs";
import { sceneryAnswer } from "./scenery.mjs";

const bad = (message) => ({ error: { code: "invalid_request", message } });
const TEXTURE_SIZES = [256, 512, 1024];

/** The query: ?textureSize=256|512|1024 (512), and ?x=&y=&angle= together (where the middle of the main part stands in the map's plane) -> {textureSize, origin} | {error}. */
export function parseSceneryQuery(params) {
  const raw = params.get("textureSize"), textureSize = raw === null ? 512 : Number(raw);
  if (!TEXTURE_SIZES.includes(textureSize)) return bad("textureSize is 256, 512 or 1024.");
  const given = ["x", "y", "angle"].filter(k => params.has(k));
  if (!given.length) return { textureSize, origin: null };
  const [x, y, angle] = ["x", "y", "angle"].map(k => params.get(k) === null || params.get(k) === "" ? NaN : Number(params.get(k)));
  if (given.length < 3 || ![x, y, angle].every(Number.isFinite)) return bad("x, y and angle go together, all numbers: where the middle of the main part stands (metres, x east, y north) and the angle of its width axis (degrees counter-clockwise from east).");
  return { textureSize, origin: { x, y, angle } };
}

/** The answer for one building as the API gives it ({id, name, version, edited, sourceId, settings}). */
export async function sceneryOfBuilding(b, { make, textureSize, origin }) {
  const g = editedGeometry(b.settings, origin);
  const blobs = new Map();
  const files = sceneryAnswer((await make(b.settings, b.name, { textureSize })).files, blobs);
  return {
    buildingId: b.id, name: b.name, version: b.version, ...(b.sourceId ? { sourceId: b.sourceId } : {}), ...(b.edited ? { edited: true } : {}),
    local: g.local, ...(g.placement ? { placement: g.placement, footprint: g.footprint } : {}),
    files, blobs: Object.fromEntries(blobs),
  };
}
