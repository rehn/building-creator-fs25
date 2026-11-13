// /api/v1 through the app's address: the token goes on, nothing else of the browser's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { v1Headers } from "../src/lib/v1.mjs";

test("v1Headers: the token goes on, nothing else of the browser's", () => {
  const h = v1Headers(new Headers({authorization: "Bearer bc_x", cookie: "hx_session=1", origin: "https://a.b", accept: "*/*", "if-none-match": '"v3"'}));
  assert.equal(h.get("authorization"), "Bearer bc_x");
  assert.equal(h.get("if-none-match"), '"v3"');
  assert.equal(h.get("cookie"), null);
  assert.equal(h.get("origin"), null);
});
