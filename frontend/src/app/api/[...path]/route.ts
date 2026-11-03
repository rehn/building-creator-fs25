// Forwards /api/* to the Go API, so the browser only ever talks to this app.
import type { NextRequest } from "next/server";
import { upstreamUrl, requestHeaders, responseHeaders } from "@/lib/proxy.mjs";

export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL || "http://localhost:8080";

async function proxy(req: NextRequest): Promise<Response> {
  const target = upstreamUrl(API_URL, req.nextUrl.pathname, req.nextUrl.search);
  if (!target) return Response.json({ error: "not_found", message: "Not found." }, { status: 404 });
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  try {
    const res = await fetch(target, {
      method: req.method,
      headers: requestHeaders(req.headers),
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: "manual",
      cache: "no-store",
    });
    return new Response(res.status === 204 || res.status === 304 ? null : res.body, {
      status: res.status,
      headers: responseHeaders(res.headers),
    });
  } catch {
    return Response.json({ error: "api_unavailable", message: "The server isn't answering. Try again in a moment." }, { status: 502 });
  }
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as PUT, proxy as DELETE };
