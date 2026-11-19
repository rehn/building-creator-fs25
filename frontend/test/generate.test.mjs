// POST /api/v1/generate: parsing the request and making each building (plan step 4). A fake API and a fake file maker stand in for the Go API and the textures.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGenerate, generate, MAX_BUILDINGS } from "../src/lib/generate.mjs";

const rect = (x, y, w, d) => [[x, y], [x + w, y], [x + w, y + d], [x, y + d]];
const b = (id, extra = {}) => ({ id, footprint: rect(100, 200, 12, 7), tags: { building: "house" }, ...extra });

test("parseGenerate: a good request", () => {
  const r = parseGenerate({ folder: "Hallsberg", buildings: [b("way/1")] });
  assert.equal(r.error, undefined);
  assert.equal(r.folder, "Hallsberg");
  assert.equal(r.buildings.length, 1);
});

test("parseGenerate: what is wrong as a whole", () => {
  assert.equal(parseGenerate(null).error.code, "invalid_request");
  assert.equal(parseGenerate({ buildings: [b("a")] }).error.code, "invalid_request");
  assert.equal(parseGenerate({ folder: "", buildings: [b("a")] }).error.code, "invalid_request");
  assert.equal(parseGenerate({ folder: "x".repeat(81), buildings: [b("a")] }).error.code, "invalid_request");
  assert.equal(parseGenerate({ folder: "A", buildings: [] }).error.code, "invalid_request");
  assert.equal(parseGenerate({ folder: "A", buildings: "no" }).error.code, "invalid_request");
  const many = Array.from({ length: MAX_BUILDINGS + 1 }, (_, i) => b("w" + i));
  assert.equal(parseGenerate({ folder: "A", buildings: many }).error.code, "too_many");
  assert.equal(parseGenerate({ folder: "A", buildings: [b("a")], mode: "scenery" }).error.code, "not_available");
  assert.equal(parseGenerate({ folder: "A", buildings: [b("a")], mode: "nonsense" }).error.code, "invalid_request");
});

test("parseGenerate: a building without an id or the same id twice is one failed building, not a failed request", () => {
  const r = parseGenerate({ folder: "A", buildings: [b("a"), { footprint: rect(0, 0, 5, 5) }, b("a")] });
  assert.equal(r.error, undefined);
  assert.equal(r.buildings[1].bad, "Each building needs an id (a string).");
  assert.match(r.buildings[2].bad, /same id/);
});

// a fake Go API that remembers what it was sent
function fakeApi({ kept = [] } = {}) {
  const log = { posts: [], puts: [] };
  let n = 0;
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (u.pathname === "/api/v1/me") return json(200, { tokenName: "t", write: true, appVersion: "1" });
    if (u.pathname === "/api/v1/buildings" && init.method === "POST") {
      const body = JSON.parse(init.body);
      log.posts.push(body);
      const status = kept.includes(body.sourceId) ? "kept" : "created";
      return json(status === "created" ? 201 : 200, { status, building: { id: "id" + ++n, name: body.name, kind: body.settings.kind, version: 1 } });
    }
    const m = u.pathname.match(/^\/api\/v1\/buildings\/([^/]+)\/model$/);
    if (m && init.method === "PUT") { log.puts.push({ id: m[1], version: u.searchParams.get("version"), form: init.body, auth: init.headers.get("authorization") }); return new Response(null, { status: 204 }); }
    return json(404, { error: "not_found" });
  };
  return { fetchImpl, log };
}
const fakeMake = async () => ({ obj: "o", mtl: "m", mod: new Uint8Array([1]), export: new Uint8Array([2]) });

test("generate: makes each building, sends the files, answers in order and keeps going past a bad one", async () => {
  const { fetchImpl, log } = fakeApi();
  const parsed = parseGenerate({ folder: "Hallsberg", buildings: [b("way/1"), { id: "way/2", footprint: [[0, 0], [1, 0], [1, 1]] }, b("way/3")] });
  const out = await generate(parsed, { api: "http://api", authorization: "Bearer bc_x", fetchImpl, make: fakeMake });
  assert.equal(out.folder, "Hallsberg");
  assert.deepEqual(out.buildings.map(x => [x.id, x.ok]), [["way/1", true], ["way/2", false], ["way/3", true]]);
  assert.match(out.buildings[1].error, /too small/);
  assert.equal(out.buildings[1].code, "too_small");
  const first = out.buildings[0];
  assert.equal(first.buildingId, "id1");
  assert.equal(first.version, 1);
  assert.equal(first.kind, "house");
  assert.ok(first.placement && first.placement.width >= 11);
  assert.equal(first.gameMod, "/api/v1/buildings/id1/game-mod.zip");
  assert.equal(first.i3d, "/api/v1/buildings/id1/model.i3d");
  assert.equal(log.posts[0].folder, "Hallsberg");
  assert.equal(log.posts[0].sourceId, "way/1");
  assert.equal(log.puts.length, 2);
  assert.equal(log.puts[0].version, "1");
  assert.equal(log.puts[0].auth, "Bearer bc_x");
  for (const k of ["obj", "mtl", "mod", "export"]) assert.ok(log.puts[0].form.get(k), k);
});

test("generate: a building a person has changed is kept: no files are made or sent", async () => {
  const { fetchImpl, log } = fakeApi({ kept: ["way/1"] });
  let made = 0;
  const make = async (...a) => { made++; return fakeMake(...a); };
  const out = await generate(parseGenerate({ folder: "A", buildings: [b("way/1")] }), { api: "http://api", authorization: "Bearer bc_x", fetchImpl, make });
  assert.equal(out.buildings[0].ok, true);
  assert.equal(out.buildings[0].kept, true);
  assert.equal(made, 0);
  assert.equal(log.puts.length, 0);
});

test("generate: a failure while making files is that building's error", async () => {
  const { fetchImpl } = fakeApi();
  const make = async () => { throw new Error("boom"); };
  const out = await generate(parseGenerate({ folder: "A", buildings: [b("way/1")] }), { api: "http://api", authorization: "Bearer bc_x", fetchImpl, make });
  assert.equal(out.buildings[0].ok, false);
  assert.equal(out.buildings[0].code, "files_failed");
});

test("generate: a token that cannot be used stops the request with the API's own error", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ error: "forbidden", message: "This token may not create buildings." }), { status: 403 });
  const r = await generate(parseGenerate({ folder: "A", buildings: [b("way/1")] }), { api: "http://api", authorization: "Bearer bc_x", fetchImpl, make: fakeMake });
  assert.equal(r.status, 403);
  assert.equal(r.error.code, "forbidden");
});
