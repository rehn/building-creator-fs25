// The token API's model files, made here (the model code is JavaScript) from the settings the Go API keeps:
// /api/v1/buildings/{id}/model.i3d, model.obj and model.mtl. Everything else under /api/v1 is the Go API's.
import { sanitize, buildI3d, buildObj, slugify } from "../editor/model.mjs";

const FILES = new Set(["model.i3d", "model.obj", "model.mtl"]);

/** {id, file} if path (the parts after /api/v1) asks for a model file, else null. */
export function modelRequest(parts) {
  if (parts.length !== 3 || parts[0] !== "buildings" || !FILES.has(parts[2]) || !parts[1]) return null;
  return {id: parts[1], file: parts[2]};
}

/** {body, type, filename} for one model file of a building with these settings. */
export function modelFile(settings, file, name = "") {
  const p = sanitize(settings && typeof settings === "object" ? settings : {});
  const slug = slugify(name) || "building";
  if (file === "model.i3d") return {body: buildI3d(p, {withTex: false}), type: "application/xml; charset=iso-8859-1", filename: `${slug}.i3d`};
  const {obj, mtl} = buildObj(p);
  // The OBJ names its material file "model.mtl", which is what the API serves it as.
  return file === "model.obj"
    ? {body: obj, type: "text/plain; charset=utf-8", filename: `${slug}.obj`}
    : {body: mtl, type: "text/plain; charset=utf-8", filename: "model.mtl"};
}

/** Headers to send to the Go API for /api/v1: the token and what is asked for. */
export function v1Headers(incoming) {
  const out = new Headers();
  for (const k of ["authorization", "accept", "if-none-match", "user-agent", "x-forwarded-for"]) {
    const v = incoming.get(k);
    if (v !== null) out.set(k, v);
  }
  return out;
}
