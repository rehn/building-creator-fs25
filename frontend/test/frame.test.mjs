import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { frameAncestorsHeader, parentOrigin } from "../src/lib/frame.mjs";

test("frame-ancestors is 'none' without FRAME_ANCESTORS", () => {
  for (const v of [undefined, "", "  ", ","]) assert.equal(frameAncestorsHeader(v), "frame-ancestors 'none'");
});

test("frame-ancestors lists the origins (space or comma separated) after 'self'", () => {
  assert.equal(frameAncestorsHeader("https://map.example.se http://localhost:8080"), "frame-ancestors 'self' https://map.example.se http://localhost:8080");
  assert.equal(frameAncestorsHeader("https://map.example.se, http://localhost:8080"), "frame-ancestors 'self' https://map.example.se http://localhost:8080");
});

test("frame-ancestors drops values that could add other directives", () => {
  assert.equal(frameAncestorsHeader("https://a.se;script-src * 'self'"), "frame-ancestors 'none'");
});

test("parentOrigin is the first origin that is not 'self'", () => {
  assert.equal(parentOrigin("'self' https://map.example.se http://x"), "https://map.example.se");
  assert.equal(parentOrigin(""), "");
});

test("X-Frame-Options is not sent any more, the proxy sets the CSP at run time", () => {
  assert.doesNotMatch(readFileSync(new URL("../next.config.ts", import.meta.url), "utf8"), /X-Frame-Options/i);
  assert.match(readFileSync(new URL("../src/proxy.ts", import.meta.url), "utf8"), /Content-Security-Policy/);
});

test("notifyBuildingSaved tells the parent only inside an iframe and only with an origin", async () => {
  const { setParentOrigin, notifyBuildingSaved } = await import("../src/lib/frameParent.mjs");
  const sent = [];
  const parent = { postMessage: (m, o) => sent.push([m, o]) };
  const framed = { parent };
  framed.parent = parent;
  setParentOrigin("");
  assert.equal(notifyBuildingSaved("b1", 3, framed), false);
  setParentOrigin("https://map.example.se");
  const top = {}; top.parent = top;
  assert.equal(notifyBuildingSaved("b1", 3, top), false);
  assert.equal(notifyBuildingSaved("b1", 3, framed), true);
  assert.deepEqual(sent, [[{ type: "fs25-building-saved", id: "b1", version: 3 }, "https://map.example.se"]]);
});
