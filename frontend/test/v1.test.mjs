// The token API's model files (/api/v1/buildings/{id}/model.*): which path asks for what, and the files themselves.
import { test } from "node:test";
import assert from "node:assert/strict";
import { modelRequest, modelFile, v1Headers } from "../src/lib/v1.mjs";

test("modelRequest: only the three model files of one building", () => {
  assert.deepEqual(modelRequest(["buildings", "abc123", "model.i3d"]), {id: "abc123", file: "model.i3d"});
  assert.deepEqual(modelRequest(["buildings", "abc123", "model.obj"]), {id: "abc123", file: "model.obj"});
  assert.deepEqual(modelRequest(["buildings", "abc123", "model.mtl"]), {id: "abc123", file: "model.mtl"});
  for (const bad of [["buildings"], ["buildings", "abc123"], ["buildings", "abc123", "icon"], ["buildings", "a", "model.zip"], ["x", "a", "model.obj"], ["buildings", "a", "model.obj", "more"]])
    assert.equal(modelRequest(bad), null, bad.join("/"));
});

test("modelFile builds the files from a building's settings", () => {
  const settings = {kind: "chicken"};
  const i3d = modelFile(settings, "model.i3d", "Hönshuset");
  assert.match(i3d.type, /xml/);
  assert.match(i3d.body, /<i3D /);
  assert.doesNotMatch(i3d.body, /textures\//, "no texture files are served, so none are referred to");
  const obj = modelFile(settings, "model.obj", "Hönshuset");
  assert.match(obj.body, /^mtllib model\.mtl$/m);
  assert.match(obj.filename, /^honshuset\.obj$/);
  assert.match(modelFile(settings, "model.mtl", "x").body, /^newmtl /m);
});

test("modelFile copes with settings from an old or odd save", () => {
  assert.ok(modelFile({}, "model.obj", "x").body.length > 1000);
  assert.ok(modelFile({kind: "nonsense", width: "wide"}, "model.i3d", "x").body.length > 1000);
});

test("v1Headers: the token goes on, nothing else of the browser's", () => {
  const h = v1Headers(new Headers({authorization: "Bearer bc_x", cookie: "hx_session=1", origin: "https://a.b", accept: "*/*"}));
  assert.equal(h.get("authorization"), "Bearer bc_x");
  assert.equal(h.get("cookie"), null);
  assert.equal(h.get("origin"), null);
});
