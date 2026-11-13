"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, ApiError, templatePhotoUrl, type Project, type Template } from "@/lib/api";
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
  // ?template=...: the admin is adjusting a template made from photos (see /admin/templates/new)
  const [template, setTemplate] = useState<Template | null>(null);
  const [publishing, setPublishing] = useState("");

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

  useEffect(() => {
    const tid = new URLSearchParams(window.location.search).get("template");
    if (tid && user?.isAdmin) api.template(tid).then(setTemplate).catch(() => setTemplate(null));
  }, [user]);

  async function publishTemplate() {
    if (!template || !editor.current) return;
    setPublishing("Publishing…");
    try {
      const t = await api.updateTemplate(template.id, {
        settings: editor.current.getSettings(), thumbnail: editor.current.snapshot() ?? undefined, projectId: id, published: true,
      });
      setTemplate(t);
      setPublishing(t.published ? "Published: everyone can pick it under New" : "");
    } catch (e) {
      setPublishing(e instanceof Error ? e.message : "Couldn’t publish.");
    }
  }

  // The model files other programs read are made here and kept by the server, for the version this save gave.
  async function sendModel(v: number, data: Settings, name: string) {
    if (!editor.current) return;
    try {
      await api.putModel(id, v, await editor.current.modelFiles(name, data));
    } catch (e) {
      if (e instanceof ApiError && e.code === "version_conflict") return; // saved again meanwhile: that save sends its own
      // The settings are saved. Only a failure that may pass (no connection, a server error) is tried again; a refusal (an older server
      // without the route, a file too big) would only repeat itself with every save.
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) return;
      throw e;
    }
  }

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
      if (patch.data) await sendModel(p.version, patch.data, p.name);
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
      {template && <TemplateBar template={template} status={publishing} onPublish={publishTemplate} />}
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
            // a new house has no preview or model files yet: save once so the list shows one and other programs get the model
            // (and once more for a model made before the game mod in it was the full one, with textures)
            let full = true;
            try { full = localStorage.getItem("model-full-2:" + id) === "1"; localStorage.setItem("model-full-2:" + id, "1"); } catch { /* no storage */ }
            if (ed && (!project.thumbnail || !project.modelVersion || !full)) queue({ data: ed.getSettings() }, 1500);
          }} />
        : <p className="loading">Loading…</p>}
    </div>
  );
}

/** While adjusting a template: its photos to compare with (click for a big one), Claude's notes and "Publish". */
function TemplateBar({ template, status, onPublish }: { template: Template; status: string; onPublish: () => void }) {
  const [big, setBig] = useState<number | null>(null);
  const [notes, setNotes] = useState(false);
  const s = template.suggestion;
  return (
    <div className="ref-strip" aria-label="Template photos">
      <span className="ref-label">Template<br /><b>{template.name}</b></span>
      <ul>
        {Array.from({ length: template.photos }, (_, i) => (
          <li key={i}><button type="button" onClick={() => setBig(i)} aria-label={`Show photo ${i + 1}`}><img src={templatePhotoUrl(template.id, i)} alt="" /></button></li>
        ))}
      </ul>
      {(s?.notes || s?.seen) && <button type="button" onClick={() => setNotes(n => !n)} aria-expanded={notes}>Claude’s notes</button>}
      <span className="status" role="status">{status}</span>
      <button type="button" className="primary" onClick={onPublish}>{template.published ? "Update template" : "Publish template"}</button>
      {notes && (
        <div className="ref-notes">
          {s?.seen && <p><b>Saw:</b> {s.seen}</p>}
          {s?.notes && <p><b>Check:</b> {s.notes}</p>}
        </div>
      )}
      {big !== null && (
        <div className="ref-big" role="dialog" aria-label={`Photo ${big + 1}`} onClick={() => setBig(null)}>
          <img src={templatePhotoUrl(template.id, big)} alt={`Photo ${big + 1}`} />
          <div className="ref-big-nav" onClick={e => e.stopPropagation()}>
            <button type="button" disabled={big === 0} onClick={() => setBig(big - 1)}>‹ Previous</button>
            <span>Photo {big + 1} of {template.photos}</span>
            <button type="button" disabled={big === template.photos - 1} onClick={() => setBig(big + 1)}>Next ›</button>
            <button type="button" onClick={() => setBig(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
