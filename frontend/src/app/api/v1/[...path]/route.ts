// The token API (/api/v1): the Go API answers the lists, one building and its picture; the model files (i3d, obj) are made here from
// the building's settings, because the model code is JavaScript. Other sites may call it from a browser: a token in a header, no cookies.
import type { NextRequest } from "next/server";
import { upstreamUrl, responseHeaders } from "@/lib/proxy.mjs";
import { modelRequest, modelFile, v1Headers } from "@/lib/v1.mjs";

export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL || "http://localhost:8080";
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "Authorization",
  "access-control-expose-headers": "Content-Disposition, ETag",
};

function fail(status: number, error: string, message: string): Response {
  return Response.json({ error, message }, { status, headers: CORS });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: { ...CORS, "access-control-max-age": "86400" } });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params;
  const model = modelRequest(path);
  const pathname = model ? `/api/v1/buildings/${encodeURIComponent(model.id)}` : req.nextUrl.pathname;
  const target = upstreamUrl(API_URL, pathname, model ? "" : req.nextUrl.search);
  if (!target) return fail(404, "not_found", "Not found.");
  const headers = v1Headers(req.headers);
  if (model) headers.delete("if-none-match"); // the ETag is checked below, against the file
  let res: Response;
  try {
    res = await fetch(target, { headers, redirect: "manual", cache: "no-store" });
  } catch {
    return fail(502, "api_unavailable", "The server isn't answering. Try again in a moment.");
  }
  if (!model || !res.ok) {
    const out = responseHeaders(res.headers);
    for (const [k, v] of Object.entries(CORS)) out.set(k, v);
    return new Response(res.status === 204 || res.status === 304 ? null : res.body, { status: res.status, headers: out });
  }
  const b = await res.json();
  const etag = 'W/"' + [b.id, b.version, model.file].join("-") + '"';
  const cache = { ...CORS, etag, "cache-control": "private, max-age=0, must-revalidate" };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: cache });
  try {
    const f = modelFile(b.settings, model.file, b.name);
    // An i3d says it is ISO-8859-1, so that is how its bytes go out.
    const body = f.type.includes("iso-8859-1") ? Buffer.from(f.body, "latin1") : f.body;
    return new Response(body, { headers: { ...cache, "content-type": f.type, "content-disposition": `inline; filename="${f.filename}"` } });
  } catch (e) {
    console.error("model export failed", e);
    return fail(500, "export_failed", "The model couldn't be made from this building.");
  }
}
