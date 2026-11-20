// What the generate routes share: the real file makers, the background jobs (one set per Node process) and the owner of a job (a hash of the token header).
import { createHash } from "node:crypto";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { generate } from "@/lib/generate.mjs";
import { createJobs } from "@/lib/jobs.mjs";
import { createMaker } from "@/lib/maker.mjs";

export const API_URL = process.env.API_URL || "http://localhost:8080";
export const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, OPTIONS" };
export const fail = (status: number, code: string, message: string) => Response.json({ error: code, message }, { status, headers: CORS });
export const ownerOf = (authorization: string) => createHash("sha256").update(authorization).digest("hex");

// The files are made in a worker thread (src/lib/make-worker.mjs, a plain file next to the server: next.config.ts carries it into the standalone build) so a cold
// first house (~19 s of CPU) does not stop the web server answering. GENERATE_WORKER=off makes them on the main thread instead.
const w = globalThis as unknown as { __fileMaker?: ReturnType<typeof createMaker>; __generateJobs?: ReturnType<typeof createJobs> };
const maker = (w.__fileMaker ??= createMaker({ spawn: () => new Worker(path.join(process.cwd(), "src", "lib", "make-worker.mjs")) }));
const inWorker = () => process.env.GENERATE_WORKER !== "off";

type Scenery = { files: Map<string, Uint8Array> };
/** The game mod's files for a building: {obj, mtl, mod (zip), export (zip)}. */
export async function makeModZips(settings: unknown, name: string) {
  const head = await import("@/editor/headless.mjs");
  if (!inWorker()) return head.makeFiles(settings, name);
  const f = await maker.make("mod", settings, name);
  return { obj: f.obj, mtl: f.mtl, ...(await head.zipModFiles(f)) };
}
/** The scenery files for a building, textures named by their hash: {files}. */
export async function makeSceneryHashed(settings: unknown, name: string, opts?: { textureSize?: number }): Promise<Scenery> {
  if (inWorker()) return maker.make("scenery", settings, name, opts);
  const { makeSceneryFiles } = await import("@/editor/headless.mjs");
  const { hashTextures } = await import("@/lib/scenery.mjs");
  return { files: hashTextures(makeSceneryFiles(settings, name, opts).files) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runGenerate(parsed: any, authorization: string, onProgress?: (n: number) => void) {
  const make = parsed.mode === "scenery" ? makeSceneryHashed : makeModZips;
  return generate(parsed, { api: API_URL, authorization, make, onProgress });
}

// the limits: how many jobs wait or run (GENERATE_MAX_JOBS, 4) and how long an answer is kept (GENERATE_JOB_TTL_MINUTES, 10)
export const jobs = (w.__generateJobs ??= createJobs({
  run: (parsed: unknown, ctx: { authorization: string }, progress: (n: number) => void) => runGenerate(parsed, ctx.authorization, progress),
  maxQueued: Number(process.env.GENERATE_MAX_JOBS) || 4,
  ttlMs: (Number(process.env.GENERATE_JOB_TTL_MINUTES) || 10) * 60_000,
}));

// The reference building's answer (scenery files for both buildings), kept per texture size: making it takes seconds the first time.
const refCache = ((globalThis as unknown as { __referenceAnswers?: Map<number, unknown> }).__referenceAnswers ??= new Map<number, unknown>());
export async function referenceAnswer(textureSize: number) {
  if (refCache.has(textureSize)) return refCache.get(textureSize);
  const { sceneryAnswer } = await import("@/lib/scenery.mjs");
  const { referenceBuildings } = await import("@/lib/reference.mjs");
  const blobs = new Map<string, string>();
  const buildings = [];
  for (const b of referenceBuildings()) buildings.push({
    id: b.id,
    name: b.name,
    request: { id: b.id, footprint: b.footprint, tags: b.tags },
    placement: b.placement,
    footprint: b.outline,
    frontWall: b.frontWall,
    files: sceneryAnswer((await makeSceneryHashed(b.settings, b.name, { textureSize })).files, blobs),
  });
  const answer = {
    description: "An L-shaped house: main part 12 x 8 m, a 5 x 6 m wing at the back (north) towards the east end. The FRONT wall is red, the rest is white. Put both buildings on a map at their placement: the red wall must face south on the first and south turned 30 degrees counter-clockwise on the second, the wing must be at the back and to the east, and nothing may be mirrored.",
    buildings,
    blobs: Object.fromEntries(blobs),
  };
  refCache.set(textureSize, answer);
  return answer;
}
