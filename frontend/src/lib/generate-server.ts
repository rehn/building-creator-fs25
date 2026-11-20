// What the generate routes share: the real file makers, the background jobs (one set per Node process) and the owner of a job (a hash of the token header).
import { createHash } from "node:crypto";
import { generate } from "@/lib/generate.mjs";
import { createJobs } from "@/lib/jobs.mjs";

export const API_URL = process.env.API_URL || "http://localhost:8080";
export const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, OPTIONS" };
export const fail = (status: number, code: string, message: string) => Response.json({ error: code, message }, { status, headers: CORS });
export const ownerOf = (authorization: string) => createHash("sha256").update(authorization).digest("hex");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runGenerate(parsed: any, authorization: string, onProgress?: (n: number) => void) {
  const { makeFiles, makeSceneryFiles } = await import("@/editor/headless.mjs");
  const { hashTextures } = await import("@/lib/scenery.mjs");
  const make = parsed.mode === "scenery"
    ? async (settings: unknown, name: string, o?: { textureSize?: number }) => ({ files: hashTextures(makeSceneryFiles(settings, name, o).files) })
    : (settings: unknown, name: string) => makeFiles(settings, name);
  return generate(parsed, { api: API_URL, authorization, make, onProgress });
}

const g = globalThis as unknown as { __generateJobs?: ReturnType<typeof createJobs> };
// the limits: how many jobs wait or run (GENERATE_MAX_JOBS, 4) and how long an answer is kept (GENERATE_JOB_TTL_MINUTES, 10)
export const jobs = (g.__generateJobs ??= createJobs({
  run: (parsed: unknown, ctx: { authorization: string }, progress: (n: number) => void) => runGenerate(parsed, ctx.authorization, progress),
  maxQueued: Number(process.env.GENERATE_MAX_JOBS) || 4,
  ttlMs: (Number(process.env.GENERATE_JOB_TTL_MINUTES) || 10) * 60_000,
}));
