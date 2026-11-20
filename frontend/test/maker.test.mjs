// The worker that makes building files off the main thread: one worker, started when needed, restarted if it dies, stopped when idle.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createMaker } from "../src/lib/maker.mjs";

// a fake worker: answers each message with what `reply` says (or never)
function fakeSpawn(reply) {
  const made = [];
  const spawn = () => {
    const w = new EventEmitter();
    w.terminated = false;
    w.sent = [];
    w.postMessage = m => { w.sent.push(m); const r = reply(m, w); if (r) setImmediate(() => w.emit("message", { id: m.id, ...r })); };
    w.terminate = async () => { w.terminated = true; };
    w.unref = () => {};
    made.push(w);
    return w;
  };
  return { spawn, made };
}

test("make: sends the job to the worker and gives its answer", async () => {
  const { spawn, made } = fakeSpawn(m => ({ ok: true, result: { echo: m.name } }));
  const maker = createMaker({ spawn });
  assert.deepEqual(await maker.make("mod", { kind: "house" }, "A"), { echo: "A" });
  assert.deepEqual(await maker.make("scenery", {}, "B", { textureSize: 256 }), { echo: "B" });
  assert.equal(made.length, 1, "one worker serves both");
  assert.deepEqual(made[0].sent.map(m => [m.type, m.name]), [["mod", "A"], ["scenery", "B"]]);
  assert.deepEqual(made[0].sent[1].opts, { textureSize: 256 });
});

test("make: an error in the worker is an error for that job only", async () => {
  const { spawn } = fakeSpawn(m => m.name === "bad" ? { ok: false, error: "no shape" } : { ok: true, result: 1 });
  const maker = createMaker({ spawn });
  await assert.rejects(maker.make("mod", {}, "bad"), /no shape/);
  assert.equal(await maker.make("mod", {}, "good"), 1);
});

test("make: a worker that dies fails what it was doing, and the next job starts a new one", async () => {
  let n = 0;
  const { spawn, made } = fakeSpawn((m, w) => { if (n++ === 0) { setImmediate(() => w.emit("exit", 1)); return null; } return { ok: true, result: "again" }; });
  const maker = createMaker({ spawn });
  await assert.rejects(maker.make("mod", {}, "A"), /stopped/);
  assert.equal(await maker.make("mod", {}, "B"), "again");
  assert.equal(made.length, 2);
});

test("make: a worker that cannot start fails the job", async () => {
  const maker = createMaker({ spawn: () => { throw new Error("Cannot find module"); } });
  await assert.rejects(maker.make("mod", {}, "A"), /Cannot find module/);
});

test("close: stops the worker, and a later job starts another", async () => {
  const { spawn, made } = fakeSpawn(() => ({ ok: true, result: 1 }));
  const maker = createMaker({ spawn });
  await maker.make("mod", {}, "A");
  await maker.close();
  assert.equal(made[0].terminated, true);
  await maker.make("mod", {}, "B");
  assert.equal(made.length, 2);
});

test("an idle worker is stopped after the idle time", async () => {
  const { spawn, made } = fakeSpawn(() => ({ ok: true, result: 1 }));
  const maker = createMaker({ spawn, idleMs: 20 });
  await maker.make("mod", {}, "A");
  await new Promise(r => setTimeout(r, 60));
  assert.equal(made[0].terminated, true);
});
