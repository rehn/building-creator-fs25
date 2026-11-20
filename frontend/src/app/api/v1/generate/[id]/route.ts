// GET /api/v1/generate/{jobId}: how a background job (POST /api/v1/generate with "async": true) is getting on, and its answer when done.
// Only the token that started the job sees it. Jobs are in this server's memory and forgotten after a while or when the server restarts (404).
import type { NextRequest } from "next/server";
import { CORS, fail, jobs, ownerOf } from "@/lib/generate-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const authorization = req.headers.get("authorization");
  if (!authorization) return fail(401, "unauthorized", "Send the token as Authorization: Bearer bc_...");
  const { id } = await params;
  const job = jobs.get(ownerOf(authorization), id);
  if (!job) return fail(404, "not_found", "No such job for this token. It may be too old (they are kept a few minutes) or the server restarted.");
  return Response.json(job, { headers: { ...CORS, "cache-control": "no-store" } });
}
