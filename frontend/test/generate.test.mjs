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
  assert.equal(parseGenerate({ folder: "A", buildings: [b("a")], mode: "scenery" }).mode, "scenery");
  assert.equal(parseGenerate({ folder: "A", buildings: [b("a")], mode: "nonsense" }).error.code, "invalid_request");
});

test("parseGenerate: a building without an id or the same id twice is one failed building, not a failed request", () => {
  const r = parseGenerate({ folder: "A", buildings: [b("a"), { footprint: rect(0, 0, 5, 5) }, b("a")] });
  assert.equal(r.error, undefined);
  assert.equal(r.buildings[1].bad, "Each building needs an id (a string).");
  assert.match(r.buildings[2].bad, /same id/);
});

// a fake Go API that remembers what it was sent
function fakeApi({ kept = [], editedSettings = null } = {}) {
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
    const one = u.pathname.match(/^\/api\/v1\/buildings\/([^/]+)$/);
    if (one && (init?.method || "GET") === "GET") return editedSettings ? json(200, { id: one[1], version: 4, edited: true, settings: editedSettings }) : json(404, { error: "not_found" });
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
  assert.equal(first.footprint.parts[0].part, "main");
  assert.equal(first.footprint.angle, first.placement.angle);
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

test("generate: a kept building answers with its real placement and parts, from what is saved in the app", async () => {
  const { fetchImpl, log } = fakeApi({ kept: ["way/1"], editedSettings: { kind: "house", width: 14, depth: 9, wings: [] } });
  const out = await generate(parseGenerate({ folder: "A", buildings: [b("way/1")] }), { api: "http://api", authorization: "Bearer bc_x", fetchImpl, make: fakeMake });
  const e = out.buildings[0];
  assert.equal(e.kept, true);
  assert.equal(e.placement.width, 14);
  assert.equal(e.placement.depth, 9);
  assert.equal(e.footprint.parts.length, 1);
  assert.equal(e.version, 4);
  assert.equal(log.puts.length, 0);
});

test("generate in scenery mode: a kept building comes with its files, made from what is saved in the app", async () => {
  const { fetchImpl } = fakeApi({ kept: ["way/1"], editedSettings: { kind: "house", width: 14, depth: 9, wings: [] } });
  const seen = [];
  const make = async (settings, name, opts) => { seen.push({ settings, opts }); return { files: new Map([["house.i3d", new Uint8Array([1, 2])]]) }; };
  const out = await generate(parseGenerate({ folder: "A", mode: "scenery", textureSize: 256, buildings: [b("way/1")] }), { api: "http://api", authorization: "Bearer bc_x", fetchImpl, make });
  assert.equal(out.buildings[0].kept, true);
  assert.equal(out.buildings[0].files[0].path, "house.i3d");
  assert.equal(seen[0].settings.width, 14);
  assert.equal(seen[0].opts.textureSize, 256);
  assert.equal(Object.keys(out.blobs).length, 1);
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

// ---- scenery mode: hashed texture names and an answer with the files inline ----
import { hashTextures, sceneryAnswer } from "../src/lib/scenery.mjs";
import { makeSceneryFiles } from "../src/editor/headless.mjs";

const enc = s => Uint8Array.from(s, c => c.charCodeAt(0) & 255), dec = u => Buffer.from(u).toString("latin1");
const tiny = () => new Map([
  ["house.i3d", enc('<File fileId="1" filename="textures/walls_diffuse.dds"/><File fileId="2" filename="textures/walls_normal.dds"/>')],
  ["house.i3d.shapes", new Uint8Array([9, 9])],
  ["textures/walls_diffuse.dds", new Uint8Array([1, 2, 3])],
  ["textures/walls_normal.dds", new Uint8Array([4, 5])],
]);

test("hashTextures: a texture's name carries a hash of its bytes, and the i3d says so", async () => {
  const a = hashTextures(tiny()), b = hashTextures(tiny());
  const names = [...a.keys()].filter(n => n.startsWith("textures/"));
  assert.equal(names.length, 2);
  for (const n of names) assert.match(n, /^textures\/walls_(diffuse|normal)_[0-9a-f]{8}\.dds$/);
  assert.deepEqual([...a.keys()].sort(), [...b.keys()].sort(), "same bytes, same names");
  const text = dec(a.get("house.i3d"));
  for (const n of names) assert.ok(text.includes(`"${n}"`), n + " is in the i3d");
  assert.ok(!text.includes("walls_diffuse.dds"));
  const other = tiny(); other.set("textures/walls_diffuse.dds", new Uint8Array([7]));
  assert.notDeepEqual([...hashTextures(other).keys()].sort(), [...a.keys()].sort(), "other bytes, another name");
});

test("sceneryAnswer: a list {path, sha256, size} per building and each different file once in blobs", () => {
  const f1 = hashTextures(tiny()), f2 = hashTextures(tiny());
  f2.set("house.i3d.shapes", new Uint8Array([8, 8, 8]));
  const blobs = new Map(), l1 = sceneryAnswer(f1, blobs), l2 = sceneryAnswer(f2, blobs);
  assert.equal(l1.length, 4);
  for (const e of l1) { assert.match(e.sha256, /^[0-9a-f]{64}$/); assert.equal(typeof e.size, "number"); assert.ok(blobs.has(e.sha256)); }
  assert.equal(l1.find(e => e.path === "house.i3d").sha256, l2.find(e => e.path === "house.i3d").sha256);
  assert.equal(blobs.size, 5, "3 shared files + 2 different shapes");
  assert.equal(blobs.get(l2.find(e => e.path === "house.i3d.shapes").sha256), Buffer.from([8, 8, 8]).toString("base64"));
});

test("generate in scenery mode: files inline, nothing is uploaded, and the building is in the app", async () => {
  const { fetchImpl, log } = fakeApi();
  const make = async () => ({ files: hashTextures(tiny()) });
  const parsed = parseGenerate({ folder: "A", mode: "scenery", buildings: [b("way/1"), b("way/2")] });
  assert.equal(parsed.error, undefined);
  const out = await generate(parsed, { api: "http://api", authorization: "Bearer bc_x", fetchImpl, make });
  assert.equal(log.puts.length, 0);
  assert.equal(out.buildings[0].files.length, 4);
  assert.equal(out.buildings[0].gameMod, undefined);
  assert.ok(out.blobs && Object.keys(out.blobs).length === 4, "identical buildings share their files");
  assert.deepEqual(out.buildings[0].files, out.buildings[1].files);
});

test("a real scenery building: every texture the i3d names is in the files, with hashed names", () => {
  const r = osmToHouseForTest();
  const files = hashTextures(makeSceneryFiles(r.settings, r.name).files);
  const text = dec(files.get("house.i3d"));
  const named = [...text.matchAll(/filename="(textures\/[^"]+)"/g)].map(m => m[1]);
  assert.ok(named.length > 3);
  for (const n of named) { assert.ok(files.has(n), n); assert.match(n, /_[0-9a-f]{8}\.dds$/); }
});
import { osmToHouse } from "../src/editor/osm.mjs";
const osmToHouseForTest = () => osmToHouse({ footprint: rect(0, 0, 10, 7), tags: { building: "house" }, id: "w" });

test("parseGenerate: async is a flag, off by default", () => {
  assert.equal(parseGenerate({ folder: "A", buildings: [b("a")] }).async, false);
  assert.equal(parseGenerate({ folder: "A", buildings: [b("a")], async: true }).async, true);
  assert.equal(parseGenerate({ folder: "A", buildings: [b("a")], async: "yes" }).error.code, "invalid_request");
});

test("generate: tells how many buildings are done before each one", async () => {
  const { fetchImpl } = fakeApi();
  const seen = [];
  await generate(parseGenerate({ folder: "A", buildings: [b("a"), b("c")] }), { api: "http://x", authorization: "Bearer bc_t", fetchImpl, make: fakeMake, onProgress: n => seen.push(n) });
  assert.deepEqual(seen, [0, 1]);
});
