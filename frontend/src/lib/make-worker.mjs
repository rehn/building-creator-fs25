// The worker thread of src/lib/maker.mjs: makes a building's files off the web server's main thread. Plain Node ESM that imports the editor's pure modules by
// relative path (no bundler, no jszip: the zips are made on the main thread from what comes back), so it is a file the standalone build must carry (next.config.ts).
//
//   in:  {id, type: "mod" | "scenery", settings, name, opts}
//   out: {id, ok: true, result} | {id, ok: false, error}
//        mod      -> {obj, mtl, mod: Map, export: Map}  (makeModFiles)
//        scenery  -> {files: Map}                       (makeSceneryFiles, textures named by content hash)
import { parentPort } from "node:worker_threads";
import { makeModFiles, makeSceneryFiles } from "../editor/headless.mjs";
import { hashTextures } from "./scenery.mjs";

parentPort.on("message", ({ id, type, settings, name, opts }) => {
  try {
    let result;
    if (type === "mod") { const f = makeModFiles(settings, name, opts); result = { obj: f.obj, mtl: f.mtl, mod: f.mod, export: f.export }; }
    else if (type === "scenery") result = { files: hashTextures(makeSceneryFiles(settings, name, opts).files) };
    else throw new Error(`Unknown job type ${type}.`);
    parentPort.postMessage({ id, ok: true, result });
  } catch (e) {
    parentPort.postMessage({ id, ok: false, error: e && e.message ? e.message : String(e) });
  }
});
