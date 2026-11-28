"use client";
// The modeller (docs/PLAN_BUILDER.md): a project of kind "prop", saved like any project (data = the parts), edited in Builder.
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, ApiError, type Project } from "@/lib/api";
import { useUser } from "@/lib/useUser";
import { EditorShell } from "@/components/EditorShell";
import { exportI3dAtlas, atlasFiles, atlasDdsFiles, type TextureMaps } from "@/builder/atlas.mjs";
import { makeItem } from "@/builder/item.mjs";
import { t } from "@/i18n/index.mjs";
import { loadMaps } from "@/lib/textureMaps";

/** The atlas's DDS files: the textures the atlas is made of (the user's are fetched, the building surfaces made)  (diffuse and normal) and put together. */
async function atlasPictures(layout: Parameters<typeof atlasDdsFiles>[0], ids: string[]) {
  const maps = new Map<string, TextureMaps>();
  for (const id of ids) maps.set(id, await loadMaps(id));
  return atlasDdsFiles(layout, id => maps.get(id) ?? null);
}
import type { BuilderHandle, BuilderModel } from "@/builder/Builder";

const Builder = dynamic(() => import("@/builder/Builder"), { ssr: false, loading: () => <p className="loading">Loading the modeller…</p> });

type Status = "saved" | "dirty" | "saving" | "error" | "conflict";
const STATUS_TEXT: Record<Status, string> = { saved: "All changes saved", dirty: "Unsaved changes", saving: "Saving…", error: "Couldn’t save. Retrying…", conflict: "Changed somewhere else" };
const SAVE_DELAY = 1200;

export default function BuilderPage() {
  const { id } = useParams<{ id: string }>();
  const { user, error: userError } = useUser();
  const [project, setProject] = useState<Project | null>(null);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<Status>("saved");
  const handle = useRef<BuilderHandle | null>(null);
  const version = useRef(0), savedName = useRef("");
  const pending = useRef<{ data?: BuilderModel; name?: string }>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef(false), statusRef = useRef<Status>("saved"), conflictVersion = useRef(0);
  const set = (s: Status) => { statusRef.current = s; setStatus(s); };

  useEffect(() => {
    if (!user) return;
    api.project(id).then(p => {
      setProject(p); setName(p.name); savedName.current = p.name; version.current = p.version;
    }).catch(e => setLoadError(e instanceof ApiError && e.status === 404 ? "This project doesn’t exist, or it isn’t yours." : e.message));
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
      const thumbnail = patch.data ? handle.current?.snapshot() ?? undefined : undefined;
      const p = await api.updateProject(id, { ...patch, data: patch.data as unknown as Record<string, unknown> | undefined, thumbnail, version: version.current });
      version.current = p.version; savedName.current = p.name;
      set(pending.current.data || pending.current.name !== undefined ? "dirty" : "saved");
    } catch (e) {
      pending.current = { ...patch, ...pending.current };
      if (e instanceof ApiError && e.code === "version_conflict") { conflictVersion.current = e.version ?? 0; set("conflict"); } else set("error");
    } finally {
      inFlight.current = false;
      const left = pending.current.data !== undefined || pending.current.name !== undefined;
      const now = statusRef.current as Status;
      if (left && now !== "conflict") timer.current = setTimeout(flush, now === "error" ? 5000 : SAVE_DELAY);
    }
  }, [id]);

  const queue = useCallback((change: { data?: BuilderModel; name?: string }, delay = SAVE_DELAY) => {
    pending.current = { ...pending.current, ...change };
    if (statusRef.current !== "conflict") set("dirty");
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  }, [flush]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (statusRef.current !== "saved") e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("beforeunload", warn); flush(); };
  }, [flush]);

  const latest = useRef<BuilderModel | null>(null);
  function commitName() {
    const n = name.trim();
    if (!n) { setName(savedName.current); return; }
    if (n !== savedName.current) queue({ name: n }, 0);
  }
  const [note, setNote] = useState(""), [done, setDone] = useState("");
  /** The i3d and the atlas in a zip (a prop is put in a game by a mod: Mods). */
  async function download() {
    if (!latest.current && !project) return;
    setNote("");
    const data = latest.current ?? project!.data;
    const stem = (name || "prop").replace(/[^\w-]+/g, "_");
    const out = exportI3dAtlas(data, { name: stem });
    if (!out.layout.fits) { setNote("The textures are too many or too big for one atlas (at most 4096 pixels high). Use fewer textures."); return; }
    let blob: Blob, file: string;
    try {
      // a zip with the i3d and the atlas beside it: the materials' textures are put together into one picture (atlas.mjs)
      const dds = await atlasPictures(out.layout, out.textures), names = atlasFiles(stem);
      const { default: JSZip } = await import("jszip"), zip = new JSZip();
      zip.file(stem + ".i3d", out.i3d); if (out.shapes) zip.file(stem + ".i3d.shapes", out.shapes);
      for (const k of ["diffuse", "normal", "specular"] as const) zip.file(names[k], dds[k]);
      blob = await zip.generateAsync({ type: "blob" }); file = stem + ".zip";
    } catch (e) { setNote(e instanceof Error ? e.message : "Couldn’t make the file."); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = file;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  /** The prop as an item in My items (buildings can place it): i3d, shapes, the atlas and a preview .obj. Saved again, it replaces the item it was saved as. */
  async function saveItem() {
    if (!latest.current && !project) return;
    setNote(""); setDone("");
    try {
      const item = makeItem(latest.current ?? project!.data, { name: name || "prop" });
      if (!item.layout.fits) { setNote("The textures are too many or too big for one atlas (at most 4096 pixels high). Use fewer textures."); return; }
      const dds = await atlasPictures(item.layout, item.textures), form = new FormData();
      form.append("name", name || "Prop");
      form.append("meta", JSON.stringify(item.meta));
      for (const [file, data] of item.files) if (data) form.append("files", new Blob([data as BlobPart]), file);
      for (const k of ["diffuse", "normal", "specular"] as const) form.append("files", new Blob([dds[k] as BlobPart]), item.pictures[k]);
      // an item saved before is given the new files (it keeps its id, so buildings that placed it keep it); if it is gone, a new one is made
      const before = ((latest.current ?? project!.data) as BuilderModel).item?.id;
      let replaced = false;
      if (before) {
        try { await api.replaceAsset(before, form); replaced = true; } catch (e) { if (!(e instanceof ApiError && e.status === 404)) throw e; }
      }
      if (!replaced) { const a = await api.importAsset(form); handle.current?.setItemId(a.id); }
      setDone(t(replaced ? "The item in My items is updated." : "Saved in My items."));
    } catch (e) { setNote(e instanceof Error ? e.message : "Couldn’t save the item."); }
  }
  function keepMine() { version.current = conflictVersion.current; set("dirty"); flush(); }

  if (loadError || userError) {
    return (<main className="page"><p className="error" role="alert">{loadError || userError}</p><Link className="btn" href="/">Back to my buildings</Link></main>);
  }
  return (
    <EditorShell
      user={user} back={{ href: "/", label: t("Buildings"), aria: t("Back to my buildings") }}
      nameId="propName" nameLabel="Name" name={name} onName={setName} onCommitName={commitName} nameDisabled={!project}
      status={project ? STATUS_TEXT[status] : ""} bad={status === "error" || status === "conflict"}
      notes={<>
        {note && <span className="status bad" role="alert">{note}</span>}
        {done && <span className="status" role="status">{done}</span>}
      </>}
      actions={<>
        <button type="button" disabled={!project} onClick={() => download()}>Download i3d + atlas</button>
        <button type="button" disabled={!project} onClick={saveItem}>Save as item</button>
      </>}
    >
      {status === "conflict" && (
        <div className="editor-bar" role="alert">
          <span className="status bad">This project was changed in another tab or browser.</span>
          <button type="button" onClick={() => window.location.reload()}>Load that version</button>
          <button type="button" className="primary" onClick={keepMine}>Keep my version</button>
        </div>
      )}
      {project
        ? <Builder initial={project.data} onChange={m => { latest.current = m; queue({ data: m }); }} onReady={h => { handle.current = h; }} />
        : <p className="loading">Loading…</p>}
    </EditorShell>
  );
}
