// Background jobs for POST /api/v1/generate with "async": true. In memory, in this Node process: one job runs at a time (making buildings is CPU work),
// at most maxQueued wait or run (else "busy": the caller tries later), a finished job's answer is kept ttlMs and at most maxStored of them,
// and a job can only be read with the token that started it (the owner is a hash of the Authorization header, never the token itself).
//
//   createJobs({run, ttlMs, maxQueued, maxStored, now}) -> {submit(owner, parsed, ctx), get(owner, jobId)}
//   run(parsed, ctx, progress) -> the generate answer, or {status, error: {code, message}}; progress(n) = n buildings are done.
import { randomUUID } from "node:crypto";

export function createJobs({ run, ttlMs = 10 * 60 * 1000, maxQueued = 4, maxStored = 40, now = Date.now, newId = randomUUID }) {
  const jobs = new Map();   // jobId -> job, in the order they were made
  const queue = [];
  let running = false;

  const forget = () => {
    for (const [id, j] of jobs) if (j.finishedAt !== undefined && now() - j.finishedAt >= ttlMs) jobs.delete(id);
    let finished = [...jobs.values()].filter(j => j.finishedAt !== undefined);
    for (const j of finished) { if (finished.length <= maxStored) break; jobs.delete(j.jobId); finished = finished.filter(x => x !== j); }
  };

  const pump = async () => {
    if (running) return;
    const job = queue.shift();
    if (!job) return;
    running = true;
    job.status = "running";
    try {
      const out = await run(job.parsed, job.ctx, n => { job.done = Math.min(n, job.total); });
      if (out && out.error) { job.status = "failed"; job.error = out.error; job.httpStatus = out.status || 500; }
      else { job.status = "done"; job.done = job.total; job.result = out; }
    } catch {
      job.status = "failed"; job.error = { code: "internal", message: "The job failed. Try again." }; job.httpStatus = 500;
    }
    job.finishedAt = now();
    delete job.parsed; delete job.ctx;   // the request and its token are not kept
    running = false;
    forget();
    pump();
  };

  const get = (owner, jobId) => {
    forget();
    const j = jobs.get(jobId);
    if (!j || j.owner !== owner) return null;
    const { status, total, done, result, error, httpStatus } = j;
    return { jobId, status, total, done, ...(result ? { result } : {}), ...(error ? { error, httpStatus } : {}) };
  };

  return {
    get,
    submit(owner, parsed, ctx) {
      forget();
      if (queue.length + (running ? 1 : 0) >= maxQueued) return { error: { code: "busy", message: "Other jobs are still running. Try again in a minute." } };
      const job = { jobId: newId(), owner, status: "queued", total: parsed.buildings.length, done: 0, createdAt: now(), parsed, ctx };
      jobs.set(job.jobId, job);
      queue.push(job);
      pump();
      return { job: get(owner, job.jobId) };
    },
  };
}
