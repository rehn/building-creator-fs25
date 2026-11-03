"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, ApiError, type Project } from "@/lib/api";
import { useUser } from "@/lib/useUser";
import type { EditorHandle, Settings } from "@/editor/editor.mjs";
import { authorName } from "@/editor/model.mjs";

const Editor = dynamic(() => import("@/editor/Editor"), {
  ssr: false,
  loading: () => <p className="loading">Loading the 3D editor…</p>,
});

type Status = "saved" | "dirty" | "saving" | "error" | "conflict";
const STATUS_TEXT: Record<Status, string> = {
  saved: "All changes saved",
  dirty: "Unsaved changes",
  saving: "Saving…",
  error: "Couldn\u2019t save. Retrying…",
  conflict: "Changed somewhere else",
};
const SAVE_DELAY = 1200;

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const { user, error: userError } = useUser();
  const [project, setProject] = useState<Project | null>(null);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<Status>("saved");
  const editor = useRef<EditorHandle | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Autosave state lives in refs so the timer always sees the latest values.
  const version = useRef(0);
  const savedName = useRef("");
  const pending = useRef<{ data?: Settings; name?: string }>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef(false);
  const statusRef = useRef<Status>("saved");
  const conflictVersion = useRef(0);
  const set = (s: Status) => { statusRef.current = s; setStatus(s); };

  useEffect(() => {
    if (!user) return;
    api.project(id).then(p => {
      setProject(p);
      setName(p.name);
      savedName.current = p.name;
      version.current = p.version;
    }).catch(e => setLoadError(e instanceof ApiError && e.status === 404 ? "This house doesn\u2019t exist, or it isn\u2019t yours." : e.message));
  }, [user, id]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (statusRef.current === "conflict") return;
    if (inFlight.current) { timer.current = setTimeout(flush, 300); return; }
    const patch = pending.current;
    if (patch.data === undefined && patch.name === undefined) return;
    pending.current = {};
    inFlight.current = true;
    set("saving");
    try {
      const thumbnail = patch.data ? editor.current?.snapshot() ?? undefined : undefined;
      const p = await api.updateProject(id, { ...patch, thumbnail, version: version.current });
      version.current = p.version;
      savedName.current = p.name;
      set(pending.current.data || pending.current.name !== undefined ? "dirty" : "saved");
    } catch (e) {
      pending.current = { ...patch, ...pending.current };
      if (e instanceof ApiError && e.code === "version_conflict") {
        conflictVersion.current = e.version ?? 0;
        set("conflict");
      } else {
        set("error");
      }
    } finally {
      inFlight.current = false;
      const left = pending.current.data !== undefined || pending.current.name !== undefined;
      // set() inside try/catch may have changed it; TS still narrows from the check above
      const now = statusRef.current as Status;
      if (left && now !== "conflict") timer.current = setTimeout(flush, now === "error" ? 5000 : SAVE_DELAY);
    }
  }, [id]);

  const queue = useCallback((change: { data?: Settings; name?: string }, delay = SAVE_DELAY) => {
    pending.current = { ...pending.current, ...change };
    if (statusRef.current !== "conflict") set("dirty");
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  }, [flush]);

  // Save on the way out of the page, and warn before closing the tab with unsaved changes.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (statusRef.current !== "saved") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      flush();
    };
  }, [flush]);

  function commitName() {
    const n = name.trim();
    if (!n) { setName(savedName.current); return; }
    if (n !== savedName.current) queue({ name: n }, 0);
  }

  function keepMine() {
    version.current = conflictVersion.current;
    set("dirty");
    flush();
  }

  if (loadError || userError) {
    return (
      <main className="page">
        <p className="error" role="alert">{loadError || userError}</p>
        <Link className="btn" href="/">Back to my houses</Link>
      </main>
    );
  }

  return (
    <div className="editor-page">
      <div className="editor-bar">
        <Link className="btn back" href="/" aria-label="Back to my houses">‹ Houses</Link>
        <label className="sr" htmlFor="houseName">House name</label>
        <input
          id="houseName" className="name" value={name} maxLength={100} disabled={!project}
          onChange={e => setName(e.target.value)} onBlur={commitName}
          onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        />
        <span className={"status" + (status === "error" || status === "conflict" ? " bad" : "")} role="status">
          {project ? STATUS_TEXT[status] : ""}
        </span>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={async e => {
          const f = e.target.files?.[0];
          if (f && editor.current) await editor.current.importSettings(f);
          e.target.value = "";
        }} />
        <button type="button" disabled={!project} onClick={() => fileInput.current?.click()}>Import settings</button>
        <button type="button" disabled={!project} onClick={() => editor.current?.exportSettings(name)}>Download settings</button>
        <button type="button" disabled={!project} onClick={() => editor.current?.exportModel(name)}>Export model</button>
        <button type="button" className="primary" disabled={!project} onClick={() => editor.current?.exportMod(name)}>Export game mod</button>
      </div>
      {status === "conflict" && (
        <div className="editor-bar" role="alert">
          <span className="status bad">This house was changed in another tab or browser.</span>
          <button type="button" onClick={() => window.location.reload()}>Load that version</button>
          <button type="button" className="primary" onClick={keepMine}>Keep my version</button>
        </div>
      )}
      {project
        ? <Editor author={authorName(user)} initial={project.data} onChange={s => queue({ data: s })} onReady={ed => {
            editor.current = ed;
            // a new house has no preview yet: save once so the list shows one
            if (ed && !project.thumbnail) queue({ data: ed.getSettings() }, 1500);
          }} />
        : <p className="loading">Loading…</p>}
    </div>
  );
}
