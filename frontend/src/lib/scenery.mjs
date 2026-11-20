// Scenery files for the generate route (PLAN_OSM.md step 4): texture names that carry a hash of their bytes, so buildings of one map can be
// merged without two different textures having the same name, and the answer's file list {path, sha256, size} with each file's bytes once.
import { createHash } from "node:crypto";

const latin1 = text => Uint8Array.from(text, c => c.charCodeAt(0) & 255);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

/** The files with every textures/<name>.dds renamed <name>_<8 hex of its sha256>.dds, in the i3d too. A new Map. */
export function hashTextures(files) {
  const rename = new Map();
  for (const [path, bytes] of files) if (/^textures\/.+\.dds$/.test(path)) rename.set(path, path.replace(/\.dds$/, `_${sha(bytes).slice(0, 8)}.dds`));
  const out = new Map();
  for (const [path, bytes] of files) {
    if (rename.has(path)) { out.set(rename.get(path), bytes); continue; }
    if (path.endsWith(".i3d")) {
      let text = Buffer.from(bytes).toString("latin1");   // the i3d is ISO-8859-1 text
      for (const [from, to] of rename) text = text.split(`"${from}"`).join(`"${to}"`);
      out.set(path, latin1(text));
    } else out.set(path, bytes);
  }
  return out;
}

/** [{path, sha256, size}] for the files, and each file's bytes (base64) put in `blobs` (a Map by sha256) once however many buildings have it. */
export function sceneryAnswer(files, blobs) {
  const list = [];
  for (const [path, bytes] of [...files].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
    const sha256 = sha(bytes);
    if (!blobs.has(sha256)) blobs.set(sha256, Buffer.from(bytes).toString("base64"));
    list.push({ path, sha256, size: bytes.length });
  }
  return list;
}
