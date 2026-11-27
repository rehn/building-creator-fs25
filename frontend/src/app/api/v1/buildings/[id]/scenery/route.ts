// GET /api/v1/buildings/{id}/scenery: the scenery files and the shape of a building as it is saved now (docs/API.md), for a map program that placed it from an
// OSM footprint and wants to update it after a person changed it in the app. Any token that sees the building. ?textureSize=256|512|1024 (512), and
// ?x=&y=&angle= (where the middle of the main part stands in the map's plane) for its placement and footprint there. ETag, so an unchanged building is a 304.
import type { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { API_URL, CORS, fail, makeSceneryHashed } from "@/lib/generate-server";
import { parseSceneryQuery, sceneryOfBuilding } from "@/lib/building-scenery.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const authorization = req.headers.get("authorization");
  if (!authorization) return fail(401, "unauthorized", "Send the token as Authorization: Bearer bc_...");
  const query = parseSceneryQuery(req.nextUrl.searchParams);
  if ("error" in query) return fail(400, query.error.code, query.error.message);
  const { id } = await params;
  try {
    const res = await fetch(`${API_URL.replace(/\/+$/, "")}/api/v1/buildings/${encodeURIComponent(id)}`, { headers: { authorization, accept: "application/json" }, cache: "no-store" });
    if (!res.ok) {
      let e: { error?: string; message?: string } = {};
      try { e = await res.json(); } catch { /* not JSON */ }
      return fail(res.status, e.error || "api_error", e.message || `The API answered ${res.status}.`);
    }
    const building = await res.json();
    if (!building.settings || typeof building.settings !== "object") return fail(404, "not_found", "That building has no settings to make files from.");
    // the answer depends on the version, the size and the middle that was given
    const etag = `"v${building.version}-${createHash("sha256").update(JSON.stringify([query.textureSize, query.origin])).digest("hex").slice(0, 8)}"`;
    if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ...CORS, etag } });
    const answer = await sceneryOfBuilding(building, { make: makeSceneryHashed, textureSize: query.textureSize, origin: query.origin });
    return Response.json(answer, { headers: { ...CORS, etag, "cache-control": "no-cache" } });
  } catch {
    return fail(502, "api_unavailable", "The server isn't answering. Try again in a moment.");
  }
}
