// The real worker thread: makes a small building's files off the main thread (a cold texture set takes seconds, so one building of each kind).
import { test } from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { createMaker } from "../src/lib/maker.mjs";

const spawn = () => new Worker(new URL("../src/lib/make-worker.mjs", import.meta.url));
const settings = { kind: "house", width: 8, depth: 6, floors: 1 };

test("worker: makes the game mod's files and the scenery files, and says what went wrong", async () => {
  const maker = createMaker({ spawn });
  try {
    const m = await maker.make("mod", settings, "Hus");
    assert.ok(m.obj.length > 100 && m.mtl.length > 10);
    assert.ok(m.mod instanceof Map && m.mod.has("modDesc.xml") && m.mod.has("house.i3d"));
    assert.ok([...m.export.keys()].some(k => k.endsWith("placeable_snippet.xml")));
    const s = await maker.make("scenery", settings, "Hus", { textureSize: 256 });
    assert.ok(s.files.has("house.i3d") && [...s.files.keys()].some(k => /^textures\/.+_[0-9a-f]{8}\.dds$/.test(k)));
    await assert.rejects(maker.make("nonsense", settings, "Hus"), /Unknown job type/);
  } finally { await maker.close(); }
});
