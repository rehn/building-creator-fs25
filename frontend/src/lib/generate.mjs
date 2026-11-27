// POST /api/v1/generate (PLAN_OSM.md, step 4): footprints and tags in, buildings with their files out. Pure apart from the fetch it is given,
// so it is tested with a fake API; the route (src/app/api/v1/generate/route.ts) passes the real fetch and headless.mjs makeFiles.
//
//   parseGenerate(body)  ->  {folder, buildings: [{id, footprint, tags, bad?}], mode} | {error: {code, message}}
//   generate(parsed, {api, authorization, fetchImpl, make})  ->  {folder, buildings: [...]} | {status, error: {code, message}}
//
// Each building is made one after the other: the work (surfaces, DDS) is CPU and runs on Node's one thread anyway.
import { osmToHouse } from "../editor/osm.mjs";
import { sceneryAnswer } from "./scenery.mjs";
import { editedGeometry } from "./edited.mjs";

export const MAX_BUILDINGS = 20;
const MODES = ["placeable", "scenery"];
const TEXTURE_SIZES = [256, 512, 1024];

const bad = (code, message) => ({ error: { code, message } });

export function parseGenerate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return bad("invalid_request", "Send a JSON object with folder and buildings.");
  const folder = typeof body.folder === "string" ? body.folder.trim() : "";
  if (!folder || folder.length > 80 || /[\u0000-\u001f\u007f]/.test(folder)) return bad("invalid_request", "folder is the map's name: 1 to 80 characters, no control characters.");
  if (!Array.isArray(body.buildings) || !body.buildings.length) return bad("invalid_request", "buildings must be a list with at least one building.");
  if (body.buildings.length > MAX_BUILDINGS) return bad("too_many", `At most ${MAX_BUILDINGS} buildings per request: send the rest in another.`);
  const mode = body.mode === undefined ? "placeable" : body.mode;
  if (!MODES.includes(mode)) return bad("invalid_request", `mode is "placeable" or "scenery".`);
  const textureSize = body.textureSize === undefined ? undefined : body.textureSize;
  if (textureSize !== undefined && (mode !== "scenery" || !TEXTURE_SIZES.includes(textureSize))) return bad("invalid_request", "textureSize is 256, 512 or 1024, and only for mode scenery.");
  const seen = new Set();
  const buildings = body.buildings.map(x => {
    const o = x && typeof x === "object" ? x : {};
    const id = typeof o.id === "string" ? o.id.trim() : "";
    if (!id || id.length > 200) return { id: id || "", bad: "Each building needs an id (a string)." };
    if (seen.has(id)) return { id, bad: `The same id (${id}) is sent twice in this request.` };
    seen.add(id);
    return { id, footprint: o.footprint, tags: o.tags };
  });
  if (body.async !== undefined && typeof body.async !== "boolean") return bad("invalid_request", "async is true or false.");
  return { folder, buildings, mode, textureSize, async: body.async === true };
}

function codeOf(message) {
  if (/too small/.test(message)) return "too_small";
  if (/footprint needs/.test(message)) return "invalid_footprint";
  return "degenerate";
}

const apiError = async res => {
  let e = null;
  try { e = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, error: { code: e?.error || "api_error", message: e?.message || `The API answered ${res.status}.` } };
};

/** What is saved for a building now: {settings, version}, or null when it cannot be read (the answer then has the footprint's own placement). */
async function currentSettings(fetchImpl, base, headers, id) {
  try {
    const res = await fetchImpl(`${base}/api/v1/buildings/${id}`, { headers: new Headers(headers) });
    if (!res.ok) return null;
    const b = await res.json();
    return b && b.settings && typeof b.settings === "object" ? { settings: b.settings, version: b.version } : null;
  } catch { return null; }
}

export async function generate(parsed, { api, authorization, fetchImpl = fetch, make, onProgress }) {
  const base = api.replace(/\/+$/, "");
  const headers = { authorization, accept: "application/json" };

  // the token first: a bad one or one that cannot write stops the whole request, not each building
  const me = await fetchImpl(base + "/api/v1/me", { headers: new Headers(headers) });
  if (!me.ok) return apiError(me);
  const info = await me.json();
  if (info && info.write === false) return { status: 403, error: { code: "forbidden", message: "This token may not create buildings. Make one with May create buildings." } };

  const scenery = parsed.mode === "scenery", blobs = new Map(), out = [];
  for (const b of parsed.buildings) {
    if (onProgress) onProgress(out.length);   // how many are done (a background job shows it)
    await new Promise(r => setImmediate(r));   // let the server answer polls between two buildings
    if (b.bad) { out.push({ ok: false, id: b.id, code: "invalid_building", error: b.bad }); continue; }
    const r = osmToHouse({ footprint: b.footprint, tags: b.tags, id: b.id });
    if (!r.ok) { out.push({ ok: false, id: b.id, code: r.code || codeOf(r.error), error: r.error }); continue; }
    const name = r.name.slice(0, 100);
    const res = await fetchImpl(base + "/api/v1/buildings", {
      method: "POST", headers: new Headers({ ...headers, "content-type": "application/json" }),
      body: JSON.stringify({ folder: parsed.folder, sourceId: b.id, name, settings: r.settings }),
    });
    if (res.status === 401 || res.status === 403) return apiError(res);
    if (!res.ok) { const e = await apiError(res); out.push({ ok: false, id: b.id, code: e.error.code, error: e.error.message }); continue; }
    const { status, building } = await res.json();
    const entry = { ok: true, id: b.id, buildingId: building.id, name: building.name, kind: building.kind, version: building.version, placement: r.placement, footprint: r.footprint, notes: r.notes };
    if (status === "kept") {
      // a person changed it in the app: left alone. Its placement, parts and files are those of what is saved there, with its middle where the footprint put it
      // (a generated building does not remember where it stands; the program that sent the footprint does)
      const kept = { ...entry, kept: true, edited: true, notes: [...r.notes, "Changed in the app since it was generated, so it was left as it is."] };
      const cur = await currentSettings(fetchImpl, base, headers, building.id);
      if (!cur) { out.push({ ...kept, fallback: true }); continue; }   // fallback: the saved building could not be read, so this is the footprint's own answer
      const g = editedGeometry(cur.settings, r.placement);
      Object.assign(kept, { version: cur.version, placement: g.placement, footprint: g.footprint });
      if (scenery) {
        try { kept.files = sceneryAnswer((await make(cur.settings, building.name, { textureSize: parsed.textureSize })).files, blobs); }
        catch (e) { out.push({ ok: false, id: b.id, buildingId: building.id, code: "files_failed", error: `The files could not be made: ${e && e.message ? e.message : e}` }); continue; }
      }
      out.push(kept);
      continue;
    }
    if (scenery) {
      // the files go back in the answer (nothing is stored: the app's building has settings only, hasModel stays false)
      try { out.push({ ...entry, files: sceneryAnswer((await make(r.settings, name, { textureSize: parsed.textureSize })).files, blobs) }); }
      catch (e) { out.push({ ok: false, id: b.id, buildingId: building.id, code: "files_failed", error: `The files could not be made: ${e && e.message ? e.message : e}` }); }
      continue;
    }
    try {
      const f = await make(r.settings, name);
      const form = new FormData();
      form.set("obj", new Blob([f.obj]), "model.obj");
      form.set("mtl", new Blob([f.mtl]), "model.mtl");
      form.set("mod", new Blob([f.mod]), "mod.zip");
      if (f.export) form.set("export", new Blob([f.export]), "model.zip");
      const put = await fetchImpl(`${base}/api/v1/buildings/${building.id}/model?version=${building.version}`, { method: "PUT", headers: new Headers(headers), body: form });
      if (!put.ok) { const e = await apiError(put); out.push({ ...entry, ok: false, code: e.error.code, error: `The files were made but not saved: ${e.error.message}` }); continue; }
    } catch (e) {
      out.push({ ok: false, id: b.id, buildingId: building.id, code: "files_failed", error: `The files could not be made: ${e && e.message ? e.message : e}` });
      continue;
    }
    out.push({ ...entry, gameMod: `/api/v1/buildings/${building.id}/game-mod.zip`, i3d: `/api/v1/buildings/${building.id}/model.i3d` });
  }
  return scenery ? { folder: parsed.folder, buildings: out, blobs: Object.fromEntries(blobs) } : { folder: parsed.folder, buildings: out };
}
