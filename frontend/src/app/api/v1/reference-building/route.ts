// GET /api/v1/reference-building: two copies of an L-shaped house with a red front wall (src/lib/reference.mjs) as scenery files, for a map program to check
// that it places and turns buildings the right way (docs/API.md). Any token. ?textureSize=256|512|1024 (512).
import type { NextRequest } from "next/server";
import { API_URL, CORS, fail, referenceAnswer } from "@/lib/generate-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest): Promise<Response> {
  const authorization = req.headers.get("authorization");
  if (!authorization) return fail(401, "unauthorized", "Send the token as Authorization: Bearer bc_...");
  const raw = req.nextUrl.searchParams.get("textureSize");
  const textureSize = raw === null ? 512 : Number(raw);
  if (![256, 512, 1024].includes(textureSize)) return fail(400, "invalid_request", "textureSize is 256, 512 or 1024.");
  try {
    const me = await fetch(API_URL.replace(/\/+$/, "") + "/api/v1/me", { headers: { authorization, accept: "application/json" }, cache: "no-store" });
    if (!me.ok) {
      let e: { error?: string; message?: string } = {};
      try { e = await me.json(); } catch { /* not JSON */ }
      return fail(me.status, e.error || "api_error", e.message || `The API answered ${me.status}.`);
    }
    return Response.json(await referenceAnswer(textureSize), { headers: { ...CORS, "cache-control": "no-store" } });
  } catch {
    return fail(502, "api_unavailable", "The server isn't answering. Try again in a moment.");
  }
}
