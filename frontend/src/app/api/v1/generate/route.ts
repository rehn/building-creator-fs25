// POST /api/v1/generate: footprints and OSM tags in, buildings and their files out (docs/API.md, PLAN_OSM.md step 4).
// The work is done here (Node, no browser) and saved through the Go API with the caller's own token. A request makes its buildings one
// after the other, so it can take a minute; the first house of a map is the slowest (the textures are made once and kept).
// With "async": true it answers 202 at once and the work goes on in the background (GET /api/v1/generate/{jobId}, one job at a time).
import type { NextRequest } from "next/server";
import { parseGenerate } from "@/lib/generate.mjs";
import { CORS, fail, jobs, ownerOf, runGenerate } from "@/lib/generate-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 600;

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest): Promise<Response> {
  const authorization = req.headers.get("authorization");
  if (!authorization) return fail(401, "unauthorized", "Send the token as Authorization: Bearer bc_...");
  let body: unknown;
  try { body = await req.json(); } catch { return fail(400, "invalid_request", "Send a JSON body."); }
  const parsed = parseGenerate(body);
  if ("error" in parsed && parsed.error) return fail(parsed.error.code === "too_many" ? 413 : 400, parsed.error.code, parsed.error.message);
  if (parsed.async) {
    const r = jobs.submit(ownerOf(authorization), parsed, { authorization });
    if ("error" in r && r.error) return fail(429, r.error.code, r.error.message);
    const job = r.job!;
    return Response.json({ jobId: job.jobId, status: job.status, total: job.total, done: job.done, statusUrl: `/api/v1/generate/${job.jobId}` }, { status: 202, headers: { ...CORS, location: `/api/v1/generate/${job.jobId}` } });
  }
  try {
    const out = await runGenerate(parsed, authorization);
    if ("error" in out && out.error) return fail(out.status, out.error.code, out.error.message);
    return Response.json(out, { headers: CORS });
  } catch {
    return fail(502, "api_unavailable", "The server isn't answering. Try again in a moment.");
  }
}
