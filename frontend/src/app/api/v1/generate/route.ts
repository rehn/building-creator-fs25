// POST /api/v1/generate: footprints and OSM tags in, buildings and their files out (docs/API.md, PLAN_OSM.md step 4).
// The work is done here (Node, no browser) and saved through the Go API with the caller's own token. A request makes its buildings one
// after the other, so it can take a minute; the first house of a map is the slowest (the textures are made once and kept).
import type { NextRequest } from "next/server";
import { parseGenerate, generate } from "@/lib/generate.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 600;

const API_URL = process.env.API_URL || "http://localhost:8080";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "POST, OPTIONS" };

const fail = (status: number, code: string, message: string) => Response.json({ error: code, message }, { status, headers: CORS });

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
  try {
    const { makeFiles } = await import("@/editor/headless.mjs");
    const out = await generate(parsed, { api: API_URL, authorization, make: (settings: unknown, name: string) => makeFiles(settings, name) });
    if ("error" in out && out.error) return fail(out.status, out.error.code, out.error.message);
    return Response.json(out, { headers: CORS });
  } catch {
    return fail(502, "api_unavailable", "The server isn't answering. Try again in a moment.");
  }
}
