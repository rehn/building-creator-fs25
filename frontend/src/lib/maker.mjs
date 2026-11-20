// Making a building's files is CPU work (textures, meshes: a cold first house takes ~19 s), so the generate routes do it in a worker thread and the web server
// keeps answering. One worker, started when the first job comes (spawn() gives a Worker, or a fake in tests), restarted if it dies, stopped after idleMs without work
// (its texture cache goes with it). Jobs are handled in the order sent; the worker answers {id, ok, result | error}.
//
//   createMaker({spawn, idleMs}) -> {make(type, settings, name, opts) -> Promise, close()}   type: "mod" | "scenery" (src/lib/make-worker.mjs)

export function createMaker({ spawn, idleMs = 10 * 60 * 1000 }) {
  let worker = null, nextId = 1, timer = null;
  const pending = new Map();   // id -> {resolve, reject}

  const failAll = reason => { for (const [, p] of pending) p.reject(new Error(reason)); pending.clear(); };
  const drop = w => { if (worker === w) worker = null; };

  const start = () => {
    const w = spawn();
    worker = w;
    w.on("message", m => {
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      if (m.ok) p.resolve(m.result); else p.reject(new Error(m.error || "The files could not be made."));
    });
    const died = reason => () => { drop(w); failAll(reason); };
    w.on("error", e => { drop(w); failAll(`The file worker failed: ${e && e.message ? e.message : e}`); });
    w.on("exit", died("The file worker stopped."));
    return w;
  };

  const rest = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!pending.size && worker && worker.unref) worker.unref();   // an idle worker never keeps the server from exiting
    if (!pending.size && worker && idleMs > 0) {
      timer = setTimeout(() => { const w = worker; worker = null; if (w) w.terminate(); }, idleMs);
      if (timer.unref) timer.unref();
    }
  };

  return {
    make(type, settings, name, opts) {
      if (timer) { clearTimeout(timer); timer = null; }
      let w;
      try { w = worker || start(); } catch (e) { return Promise.reject(e); }
      if (w.ref) w.ref();   // while it works it does keep the process alive
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        try { w.postMessage({ id, type, settings, name, opts }); } catch (e) { pending.delete(id); reject(e); }
      }).finally(rest);
    },
    async close() {
      if (timer) clearTimeout(timer);
      timer = null;
      const w = worker;
      worker = null;
      failAll("The file worker was closed.");
      if (w) await w.terminate();
    },
  };
}
