// Background jobs for POST /api/v1/generate with "async": true: one at a time, the queue is capped, results are kept a while and belong to the token that asked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createJobs } from "../src/lib/jobs.mjs";

const parsed = n => ({ folder: "A", buildings: Array.from({ length: n }, (_, i) => ({ id: "w" + i })), mode: "placeable" });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise(r => setImmediate(r));

test("a job is queued, runs, reports progress and keeps its answer", async () => {
  const gate = deferred();
  const jobs = createJobs({ run: async (p, ctx, progress) => { progress(1); await gate.promise; return { folder: p.folder, buildings: [{ ok: true }] }; } });
  const { job } = jobs.submit("tokA", parsed(2), {});
  assert.match(job.jobId, /./);
  await tick();
  let v = jobs.get("tokA", job.jobId);
  assert.equal(v.status, "running");
  assert.equal(v.total, 2);
  assert.equal(v.done, 1);
  assert.equal(v.result, undefined);
  gate.resolve();
  await tick(); await tick();
  v = jobs.get("tokA", job.jobId);
  assert.equal(v.status, "done");
  assert.equal(v.done, 2);
  assert.deepEqual(v.result, { folder: "A", buildings: [{ ok: true }] });
});

test("only the token that asked sees the job", async () => {
  const jobs = createJobs({ run: async () => ({ buildings: [] }) });
  const { job } = jobs.submit("tokA", parsed(1), {});
  assert.equal(jobs.get("tokB", job.jobId), null);
  assert.equal(jobs.get("tokA", "nope"), null);
});

test("jobs run one at a time, in order", async () => {
  const order = [], gates = [deferred(), deferred()];
  const jobs = createJobs({ run: async (p) => { const i = p.buildings.length - 1; order.push("start" + i); await gates[i].promise; order.push("end" + i); return { buildings: [] }; } });
  const a = jobs.submit("t", parsed(1), {}).job, b = jobs.submit("t", parsed(2), {}).job;
  await tick();
  assert.equal(jobs.get("t", a.jobId).status, "running");
  assert.equal(jobs.get("t", b.jobId).status, "queued");
  gates[0].resolve(); await tick(); await tick();
  gates[1].resolve(); await tick(); await tick();
  assert.deepEqual(order, ["start0", "end0", "start1", "end1"]);
  assert.equal(jobs.get("t", b.jobId).status, "done");
});

test("a full queue says busy", async () => {
  const gate = deferred();
  const jobs = createJobs({ maxQueued: 2, run: async () => { await gate.promise; return { buildings: [] }; } });
  assert.ok(jobs.submit("t", parsed(1), {}).job);
  assert.ok(jobs.submit("t", parsed(1), {}).job);
  assert.equal(jobs.submit("t", parsed(1), {}).error.code, "busy");
  gate.resolve(); await tick(); await tick(); await tick();
  assert.ok(jobs.submit("t", parsed(1), {}).job);
});

test("a run that answers with an error, or throws, makes a failed job", async () => {
  const jobs = createJobs({ run: async p => { if (p.folder === "E") return { status: 403, error: { code: "forbidden", message: "no" } }; throw new Error("boom"); } });
  const a = jobs.submit("t", { ...parsed(1), folder: "E" }, {}).job;
  await tick(); await tick();
  const va = jobs.get("t", a.jobId);
  assert.equal(va.status, "failed");
  assert.deepEqual(va.error, { code: "forbidden", message: "no" });
  assert.equal(va.httpStatus, 403);
  const b = jobs.submit("t", parsed(1), {}).job;
  await tick(); await tick();
  const vb = jobs.get("t", b.jobId);
  assert.equal(vb.status, "failed");
  assert.equal(vb.error.code, "internal");
});

test("finished jobs are forgotten after the time to live, and only so many are kept", async () => {
  let t = 0;
  const jobs = createJobs({ ttlMs: 1000, maxStored: 2, now: () => t, run: async () => ({ buildings: [] }) });
  const a = jobs.submit("t", parsed(1), {}).job;
  await tick(); await tick();
  assert.equal(jobs.get("t", a.jobId).status, "done");
  t = 1001;
  assert.equal(jobs.get("t", a.jobId), null);
  const ids = [];
  for (let i = 0; i < 3; i++) { ids.push(jobs.submit("t", parsed(1), {}).job.jobId); await tick(); await tick(); }
  assert.equal(jobs.get("t", ids[0]), null);
  assert.equal(jobs.get("t", ids[2]).status, "done");
});
