// The token API (/api/v1) belongs to the Go API, which keeps the building's model files. This only passes requests on, with the token
// (the general /api proxy never forwards Authorization), for programs that use this app's address instead of the API's port.
import type { NextRequest } from "next/server";
import { upstreamUrl, responseHeaders } from "@/lib/proxy.mjs";
import { v1Headers } from "@/lib/v1.mjs";

export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL || "http://localhost:8080";

async function pass(req: NextRequest): Promise<Response> {
  const target = upstreamUrl(API_URL, req.nextUrl.pathname, req.nextUrl.search);
  if (!target) return Response.json({ error: "not_found", message: "Not found." }, { status: 404 });
  try {
    const res = await fetch(target, { method: req.method, headers: v1Headers(req.headers), redirect: "manual", cache: "no-store" });
    return new Response(res.status === 204 || res.status === 304 ? null : res.body, { status: res.status, headers: responseHeaders(res.headers) });
  } catch {
    return Response.json({ error: "api_unavailable", message: "The server isn't answering. Try again in a moment." }, { status: 502, headers: { "access-control-allow-origin": "*" } });
  }
}

export { pass as GET, pass as OPTIONS };
