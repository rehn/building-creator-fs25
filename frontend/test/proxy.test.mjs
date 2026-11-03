import { test } from "node:test";
import assert from "node:assert/strict";
import { upstreamUrl, requestHeaders, responseHeaders } from "../src/lib/proxy.mjs";

test("upstreamUrl joins the API base, path and query", () => {
  assert.equal(upstreamUrl("http://api:8080/", "/api/projects", "?a=1"), "http://api:8080/api/projects?a=1");
  assert.equal(upstreamUrl("http://api:8080", "/api/auth/me", ""), "http://api:8080/api/auth/me");
});

test("upstreamUrl only forwards /api/ paths", () => {
  assert.equal(upstreamUrl("http://api:8080", "/admin", ""), null);
  assert.equal(upstreamUrl("http://api:8080", "/api/../secret", ""), null);
  assert.equal(upstreamUrl("http://api:8080", "//evil.example/api/x", ""), null);
});

test("requestHeaders forwards what the API needs and nothing else", () => {
  const h = requestHeaders(new Headers({
    cookie: "hx_session=abc", "content-type": "application/json", origin: "https://hus.example.se",
    "sec-fetch-site": "same-origin", "x-forwarded-for": "203.0.113.9", "user-agent": "test",
    host: "hus.example.se", authorization: "Bearer x", connection: "keep-alive", "x-something": "1",
  }));
  assert.equal(h.get("cookie"), "hx_session=abc");
  assert.equal(h.get("content-type"), "application/json");
  assert.equal(h.get("origin"), "https://hus.example.se");
  assert.equal(h.get("sec-fetch-site"), "same-origin");
  assert.equal(h.get("x-forwarded-for"), "203.0.113.9");
  for (const k of ["host", "authorization", "connection", "x-something"]) assert.equal(h.get(k), null, k);
});

test("responseHeaders keeps every cookie and drops hop-by-hop headers", () => {
  const up = new Headers();
  up.append("set-cookie", "hx_session=abc; Path=/; HttpOnly");
  up.append("set-cookie", "hx_oauth_state=; Path=/api/auth/google; Max-Age=0");
  up.set("location", "/login?error=not_invited");
  up.set("content-type", "application/json");
  up.set("content-encoding", "gzip");
  up.set("content-length", "123");
  up.set("transfer-encoding", "chunked");
  up.set("connection", "close");
  const h = responseHeaders(up);
  assert.deepEqual(h.getSetCookie(), ["hx_session=abc; Path=/; HttpOnly", "hx_oauth_state=; Path=/api/auth/google; Max-Age=0"]);
  assert.equal(h.get("location"), "/login?error=not_invited");
  assert.equal(h.get("content-type"), "application/json");
  for (const k of ["content-encoding", "content-length", "transfer-encoding", "connection"]) assert.equal(h.get(k), null, k);
});
