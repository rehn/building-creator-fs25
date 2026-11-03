// Helpers for the /api proxy route: which requests and headers pass between
// the browser and the Go API. Plain JS so they can be tested with node --test.

const FORWARD = ["accept", "content-type", "cookie", "origin", "sec-fetch-site", "user-agent", "x-forwarded-for"];
const HOP_BY_HOP = new Set(["connection", "keep-alive", "transfer-encoding", "content-encoding", "content-length", "set-cookie", "upgrade", "proxy-connection", "te", "trailer"]);

/** The API URL for a browser path, or null if the path shouldn't be forwarded. */
export function upstreamUrl(base, pathname, search) {
  if (!pathname.startsWith("/api/") || pathname.includes("..") || pathname.includes("//")) return null;
  return base.replace(/\/+$/, "") + pathname + (search || "");
}

/** Headers to send to the API: only the ones it uses. */
export function requestHeaders(incoming) {
  const out = new Headers();
  for (const k of FORWARD) {
    const v = incoming.get(k);
    if (v !== null) out.set(k, v);
  }
  return out;
}

/** Headers to send back to the browser, keeping each Set-Cookie separate. */
export function responseHeaders(upstream) {
  const out = new Headers();
  upstream.forEach((v, k) => { if (!HOP_BY_HOP.has(k.toLowerCase())) out.set(k, v); });
  for (const c of upstream.getSetCookie()) out.append("set-cookie", c);
  return out;
}
