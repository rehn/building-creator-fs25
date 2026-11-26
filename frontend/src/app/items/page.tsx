"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, type Asset } from "@/lib/api";
import { useUser } from "@/lib/useUser";
import { TopBar } from "@/components/TopBar";
import { t } from "@/i18n/index.mjs";
import { KINDS } from "@/editor/model.mjs";
import { i3dToObj } from "@/editor/shapesObj.mjs";
import { diffuseFiles, readI3d, sortFiles, readObj, normalizeMeta, assetSize, nameFromFile, splitItems, importSettings, withImportSettings } from "@/editor/assets.mjs";
import { createItemView, itemIcon, ddsPicture } from "@/editor/itemView.mjs";
import { confirmDialog } from "@/components/dialog.mjs";

type Meta = ReturnType<typeof normalizeMeta>;
type Kind = { id: string; plural: string; catalog?: object; objects?: { types: string[] } };
// Kinds with an inside to put items in.
const walkIn = (KINDS as Kind[]).filter(k => k.catalog);
// Kinds with feed and water troughs in the pasture.
const troughKinds = (KINDS as Kind[]).filter(k => k.objects?.types.includes("feedTrough"));
const USES = [["piece", "Furniture inside"], ["feedTrough", "Feed trough in the pasture"], ["waterTrough", "Water trough in the pasture"]] as const;
const useText = (m: Meta) => t(USES.find(u => u[0] === m.use)?.[1] ?? "Furniture inside");
const TURNS = [0, 90, 180, 270];

// i3d files are ISO-8859-1; the .obj is plain ASCII.
const textOf = async (f: Blob) => new TextDecoder("iso-8859-1").decode(await f.arrayBuffer());
const mb = (n: number) => n < 1 << 20 ? `${Math.max(1, Math.round(n / 1024))} kB` : `${(n / (1 << 20)).toFixed(1)} MB`;
const sizeText = (m: Meta) => assetSize(m).map(v => v.toFixed(2)).join(" × ") + " m";
const kindsText = (m: Meta) => m.kinds.length ? [...walkIn, ...troughKinds].filter(k => m.kinds.includes(k.id)).map(k => k.plural).join(", ") : m.use === "piece" ? "Every building with an inside" : "Every building with troughs";

/** The 3D view of an item; draws again when positions or meta change. */
function ItemView({ positions, meta, look }: { positions: number[]; meta: Meta; look?: Look }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<ReturnType<typeof createItemView> | null>(null);
  useEffect(() => {
    if (!canvas.current) return;
    view.current = createItemView(canvas.current);
    return () => { view.current?.dispose(); view.current = null; };
  }, []);
  useEffect(() => { view.current?.show(positions, meta, look); }, [positions, meta, look]);
  return <canvas ref={canvas} className="item-view" aria-label="Preview of the item" />;
}

// What was chosen at the last import (what it is, where, turned, for which buildings, shared) starts the next one.
const SAVED = "hx-import-settings";
type Saved = ReturnType<typeof importSettings>;
const savedSettings = (): Saved | null => { try { return JSON.parse(localStorage.getItem(SAVED) || "null"); } catch { return null; } };
const keepSettings = (s: Saved) => { try { localStorage.setItem(SAVED, JSON.stringify(s)); } catch { /* private window: it just isn't remembered */ } };
const startFrom = (d: Draft): Draft => { const s = savedSettings(); return s ? { ...d, meta: withImportSettings(d.meta, s), shared: !!s.shared } : d; };

type Look = { uvs: number[]; picture: { width: number; height: number; data: Uint8Array } };
const ICON_VERSION = 2;   // 1: grey, 2: with the picture (items with an older number get a new one when the page opens)

type Draft = {
  // new: the files to upload; edit: the item being changed
  files?: File[]; asset?: Asset;
  name: string; meta: Meta; positions: number[];
  look?: Look;   // how it is drawn: its texture coordinates and picture (when it has one the browser can read)
  missing: string[]; ignored: string[];
  shared: boolean;
};

// An i3d is ISO-8859-1 text: written back the same way.
const latin1 = (text: string, name: string) => new File([Uint8Array.from(text, c => c.charCodeAt(0) & 255)], name);
const stemOf = (name: string) => name.split(/[\\/]/).pop()!.toLowerCase().replace(/\.(png|dds)$/, "");
// Where a picked file lies in the folder that was picked or dropped ("model/textures/x.dds"); just its name when files were picked one by one.
const paths = new WeakMap<File, string>();
const pathOf = (f: File) => paths.get(f) ?? (f.webkitRelativePath || f.name);
// The picture of a file the i3d names: its own (found by name) or one of the game's ($data/...: the copy from the export, which is only used to draw
// the preview and is not uploaded).
const fromPicked = (own: File[], game: Map<string, File>) => async (ref: string) => {
  const f = ref.startsWith("$") ? game.get(ref) : own.find(x => stemOf(x.name) === stemOf(ref));
  return f && /\.dds$/i.test(f.name) ? { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) } : null;
};
/** What the i3d needs of the picked files (sortFiles), as files. */
function sortedFiles(i3dText: string, i3d: File, picked: File[]) {
  const sorted: { own: string[]; game: Map<string, string>; missing: string[]; leftOut: string[] } = sortFiles(i3dText, pathOf(i3d), picked.map(pathOf)), file = (p: string) => picked.find(f => pathOf(f) === p)!;
  return {
    own: sorted.own.map(file), missing: sorted.missing, leftOut: sorted.leftOut.map(file),
    game: new Map([...sorted.game].map(([ref, p]) => [ref, file(p)] as [string, File])),
  };
}

/**
 * The picked files with an .obj among them: the one someone picked, or else one made from the i3d and its .shapes file (the same .obj Giants Editor
 * would write: the preview and the placing use it). Without a .shapes file there is nothing to make it from; draftFrom says what is missing.
 */
async function withObj(picked: File[]): Promise<File[]> {
  if (picked.some(f => /\.obj$/i.test(f.name))) return picked;
  const i3ds = picked.filter(f => /\.i3d$/i.test(f.name)), shapes = picked.find(f => /\.shapes$/i.test(f.name));
  if (i3ds.length !== 1 || !shapes) return picked;
  try {
    const { obj } = i3dToObj(await textOf(i3ds[0]), new Uint8Array(await shapes.arrayBuffer()));
    return [...picked, new File([obj], i3ds[0].name.replace(/\.i3d$/i, ".obj"))];
  } catch (e) {
    throw new Error(t("The preview could not be made from the .shapes file: {why} Pick an .obj of the item too (in Giants Editor: select it, then File → Export → OBJ).", { why: e instanceof Error ? e.message : "" }));
  }
}

/**
 * Reads the files someone picked: exactly one .i3d, its .shapes (or an .obj), and what the i3d needs. An export
 * of several nodes gives one draft for each, each with its own i3d and .obj cut from the export.
 */
async function draftsFrom(files: File[]): Promise<Draft[]> {
  const picked = await withObj(files);
  const first = await draftFrom(picked);
  const i3d = picked.find(f => /\.i3d$/i.test(f.name))!, obj = picked.find(f => /\.obj$/i.test(f.name))!;
  const i3dText = await textOf(i3d), parts = splitItems(i3dText, await textOf(obj));
  if (parts.length < 2) return [first];
  return Promise.all(parts.map(async part => {
    const info = readI3d(part.i3d), { own, missing, game } = sortedFiles(part.i3d, i3d, picked);
    const objPart = readObj(part.obj, info.hidden);
    const look = await lookOf(part.i3d, objPart.uvs, fromPicked(own, game));
    return {
      files: [latin1(part.i3d, part.i3dFile), new File([part.obj], part.objFile), ...own.filter(f => f !== i3d && f !== obj)],
      name: part.name, positions: objPart.positions, look: look.look, missing, ignored: [], shared: false,
      meta: normalizeMeta({i3d: part.i3dFile, obj: part.objFile, hidden: info.hidden, box: objPart.box, mount: "floor", turn: 0, kinds: [], texture: look.texture}),
    } as Draft;
  }));
}

async function draftFrom(picked: File[]): Promise<Draft> {
  const i3ds = picked.filter(f => /\.i3d$/i.test(f.name)), objs = picked.filter(f => /\.obj$/i.test(f.name));
  if (i3ds.length !== 1) throw new Error(i3ds.length ? "Pick only one .i3d file." : "Pick the item's .i3d file too.");
  if (objs.length !== 1) throw new Error(objs.length ? "Pick only one .obj file." : "Pick the item's .i3d.shapes file too (or an .obj of it: in Giants Editor, select it, then File → Export → OBJ). It's used for the preview and to place it.");
  const i3dText = await textOf(i3ds[0]), info = readI3d(i3dText);
  const { own, missing, game, leftOut } = sortedFiles(i3dText, i3ds[0], picked);
  const obj = readObj(await textOf(objs[0]), info.hidden);
  const look = await lookOf(i3dText, obj.uvs, fromPicked(own, game));
  // Upload what the item uses (not the game's copies, they stay in the game); leave out anything else that was picked.
  const keep = picked.filter(f => f === i3ds[0] || f === objs[0] || own.includes(f));
  return {
    files: keep, name: nameFromFile(i3ds[0].name), positions: obj.positions, look: look.look, missing,
    ignored: leftOut.filter(f => f !== objs[0]).map(f => f.name), shared: false,
    meta: normalizeMeta({i3d: i3ds[0].name, obj: objs[0].name, hidden: info.hidden, box: obj.box, mount: "floor", turn: 0, kinds: [], texture: look.texture}),
  };
}

// The list picture of a draft as it is now (turned, mounted); none if the browser cannot draw it.
const pictureOf = (d: Draft) => { try { return itemIcon(d.positions, d.meta, d.look); } catch { return ""; } };
const withIcon = (d: Draft) => ({ ...d.meta, icon: pictureOf(d), iconV: ICON_VERSION });

/** The look of a saved item: from its meta.texture, or else found in its i3d (the one picture it uses), from the files stored with it. */
async function lookOfAsset(a: Asset, meta: Meta, uvs: number[] | null): Promise<{ texture: string; look?: Look }> {
  const names = a.files.map(f => f.name);
  const find = async (ref: string) => {
    // the game's own pictures are not stored with the item
    const name = ref.startsWith("$") ? undefined : names.find(n => stemOf(n) === stemOf(ref) && /\.dds$/i.test(n));
    return name ? { name, bytes: new Uint8Array(await api.assetFile(a.id, name)) } : null;
  };
  if (meta.texture) {
    const f = uvs ? await find(meta.texture).catch(() => null) : null;
    const picture = f && ddsPicture(f.bytes);
    return picture && uvs ? { texture: f!.name, look: { uvs, picture } } : { texture: meta.texture };
  }
  if (!meta.i3d) return { texture: "" };
  return lookOf(await textOf(new Blob([await api.assetFile(a.id, meta.i3d)])), uvs, find).catch(() => ({ texture: "" }));
}

/**
 * How an item is drawn: when its i3d uses exactly one picture (diffuse) for what is drawn, and the .obj has texture coordinates, and the picture is
 * a DDS the browser can decode: {texture (the file's name), look}. A game picture ($data/...) is drawn only when find has a copy of it (an export
 * from fs25ModelExporter has); it is not a file of the item, so texture stays "" and the editor's 3D view draws the item grey. Otherwise grey too.
 */
async function lookOf(i3dText: string, uvs: number[] | null, find: (ref: string) => Promise<{ name: string; bytes: Uint8Array } | null>): Promise<{ texture: string; look?: Look }> {
  const one = diffuseFiles(i3dText);
  if (one.length !== 1 || !uvs) return { texture: "" };
  const file = await find(one[0]);
  const picture = file && ddsPicture(file.bytes);
  return picture ? { texture: one[0].startsWith("$") ? "" : file.name, look: { uvs, picture } } : { texture: "" };
}

/** The files of what was dropped, folders too (their files with the path in the folder, see pathOf). */
async function droppedFiles(dt: DataTransfer): Promise<File[]> {
  const out: File[] = [];
  const walk = async (entry: FileSystemEntry, dir: string): Promise<void> => {
    if (entry.isFile) {
      const f = await new Promise<File>((ok, no) => (entry as FileSystemFileEntry).file(ok, no));
      paths.set(f, dir + f.name); out.push(f);
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      for (;;) {   // readEntries gives a part of the list at a time
        const part = await new Promise<FileSystemEntry[]>((ok, no) => reader.readEntries(ok, no));
        if (!part.length) break;
        for (const e of part) await walk(e, dir + entry.name + "/");
      }
    }
  };
  const entries = [...dt.items].map(i => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e);
  for (const e of entries) await walk(e, "");
  return out;
}

export default function ItemsPage() {
  const { user, error: userError } = useUser();
  const [items, setItems] = useState<Asset[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [queue, setQueue] = useState<Draft[]>([]); // the rest of an export of several items
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) api.assets().then(setItems).catch(e => setError(e.message));
  }, [user]);
  // Items saved before pictures existed (or replaced from the modeller) get one: made here from the item's .obj, one at a time, and kept in its meta.
  const iconing = useRef(false);
  useEffect(() => {
    if (!items || iconing.current) return;
    const todo = items.filter(a => a.mine && normalizeMeta(a.meta).obj && (!normalizeMeta(a.meta).icon || normalizeMeta(a.meta).iconV < ICON_VERSION));
    if (!todo.length) return;
    iconing.current = true;
    let stop = false;
    (async () => {
      for (const a of todo) {
        if (stop) break;
        try {
          const meta = normalizeMeta(a.meta), obj = readObj(new TextDecoder().decode(await api.assetFile(a.id, meta.obj)), meta.hidden);
          const look = await lookOfAsset(a, meta, obj.uvs);
          const icon = itemIcon(obj.positions, meta, look.look);
          const saved = await api.updateAsset(a.id, { meta: { ...a.meta, texture: look.texture, icon, iconV: ICON_VERSION } });
          if (!stop) setItems(list => (list ?? []).map(x => (x.id === saved.id ? saved : x)));
        } catch { /* no picture for this one: the list works without */ }
      }
      iconing.current = false;
    })();
    return () => { stop = true; iconing.current = false; };
  }, [items]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    setBusy(false);
  }
  const pick = (list: ArrayLike<File> | null) => list && list.length && run(async () => {
    setDraft(null); setQueue([]);
    const [first, ...rest] = await draftsFrom(Array.from(list));
    setDraft(startFrom(first)); setQueue(rest); setTotal(rest.length + 1);
  });
  // on to the next item of an export (or done)
  const next = () => { setDraft(queue[0] ? startFrom(queue[0]) : null); setQueue(q => q.slice(1)); };
  const edit = (a: Asset) => run(async () => {
    const meta = normalizeMeta(a.meta);
    const obj = readObj(new TextDecoder().decode(await api.assetFile(a.id, meta.obj)), meta.hidden);
    const look = await lookOfAsset(a, meta, obj.uvs);
    setDraft({ asset: a, name: a.name, meta: look.texture === meta.texture ? meta : { ...meta, texture: look.texture }, positions: obj.positions, look: look.look, missing: [], ignored: [], shared: a.shared });
  });
  const change = (patch: Partial<Meta>) => setDraft(d => d && { ...d, meta: { ...d.meta, ...patch } });
  const save = () => draft && run(async () => {
    if (draft.asset) {
      const a = await api.updateAsset(draft.asset.id, { name: draft.name, meta: withIcon(draft), shared: draft.shared });
      setItems(list => (list ?? []).map(x => (x.id === a.id ? a : x)));
    } else {
      const form = new FormData();
      form.append("name", draft.name);
      form.append("meta", JSON.stringify(withIcon(draft)));
      if (draft.shared) form.append("shared", "true");
      for (const f of draft.files ?? []) form.append("files", f, f.name);
      const a = await api.importAsset(form);
      setItems(list => [a, ...(list ?? [])]);
      keepSettings(importSettings(draft.meta, draft.shared));
      next(); return;
    }
    setDraft(null);
  });
  const remove = async (a: Asset) => {
    const who = t(a.shared ? "Everyone's buildings" : "Buildings");
    if (!await confirmDialog(t("Delete “{name}”? {who} that use it keep its place, but it's left out until it's imported again.", { name: a.name, who }), { confirm: t("Delete"), danger: true })) return;
    run(async () => {
      await api.deleteAsset(a.id);
      setItems(list => (list ?? []).filter(x => x.id !== a.id));
      if (draft?.asset?.id === a.id) setDraft(null);
    });
  };

  const list = (shown: Asset[]) => (
    <ul className="item-list">
      {shown.map(a => {
        const m = normalizeMeta(a.meta);
        return (
          <li key={a.id}>
            {m.icon ? <img className="item-icon" src={m.icon} alt="" width={96} height={72} /> : <span className="item-icon none" aria-hidden="true" />}
            <div>
              <b>{a.name} {a.shared && a.mine && <span className="badge ok">Shared with everyone</span>}</b>
              <small>{sizeText(m)} · {m.use !== "piece" ? useText(m) : m.mount === "wall" ? "against a wall" : "on the floor"} · {kindsText(m)}</small>
              <small>{a.files.length} files, {mb(a.files.reduce((s, f) => s + f.size, 0))}</small>
            </div>
            {a.mine && (
              <div className="actions">
                <button type="button" onClick={() => edit(a)} disabled={busy}>Change</button>
                <button type="button" className="danger" onClick={() => remove(a)} disabled={busy}>Delete</button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );

  const form = draft && (
    <section className="item-form" aria-label={draft.asset ? "Change item" : "Import item"}>
      <ItemView positions={draft.positions} meta={draft.meta} look={draft.look} />
      <div className="item-fields">
        {!draft.asset && total > 1 && <p><b>{t("Item {n} of {total} from this export", { n: total - queue.length, total })}</b></p>}
        {draft.files && (
          <ul className="item-files">
            {draft.files.map(f => <li key={f.name}>{f.name} <small>{mb(f.size)}</small></li>)}
            {draft.missing.map(n => <li key={n} className="missing">{n} <small>missing</small></li>)}
          </ul>
        )}
        {draft.missing.length > 0 && <p className="warn">The i3d uses {draft.missing.length > 1 ? "these files" : "this file"}, which you didn{"’"}t pick. Pick {draft.missing.length > 1 ? "them" : "it"} too, with the others.</p>}
        {draft.ignored.length > 0 && <p className="hint">Left out (the item doesn{"’"}t use {draft.ignored.length > 1 ? "them" : "it"}): {draft.ignored.join(", ")}</p>}
        <label>Name <input type="text" value={draft.name} maxLength={100} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
        <p className="hint">Size {sizeText(draft.meta)} (width × depth × height)</p>
        <fieldset>
          <legend>What is it</legend>
          {USES.map(([u, label]) => (
            <label className="choice" key={u}><input type="radio" name="use" checked={draft.meta.use === u} onChange={() => change({ use: u, kinds: [] })} /> {label}</label>
          ))}
          {draft.meta.use !== "piece" && <p className="hint">The trough in the pasture of a cow, sheep or hen house can look like this. Its size comes from the model.</p>}
        </fieldset>
        {draft.meta.use === "piece" && (
          <fieldset>
            <legend>Placed</legend>
            <label className="choice"><input type="radio" name="mount" checked={draft.meta.mount === "floor"} onChange={() => change({ mount: "floor" })} /> On the floor</label>
            <label className="choice"><input type="radio" name="mount" checked={draft.meta.mount === "wall"} onChange={() => change({ mount: "wall" })} /> Against a wall</label>
          </fieldset>
        )}
        <fieldset>
          <legend>Turn the model</legend>
          <p className="hint">{draft.meta.mount === "wall" ? "Turn it so its back is against the wall in the picture." : "Turn it so its front faces you."}</p>
          <div className="seg">
            {TURNS.map(t => <button type="button" key={t} aria-pressed={draft.meta.turn === t} onClick={() => change({ turn: t })}>{t}°</button>)}
          </div>
        </fieldset>
        <fieldset>
          <legend>Use in</legend>
          {(draft.meta.use === "piece" ? walkIn : troughKinds).map(k => (
            <label className="choice" key={k.id}>
              <input type="checkbox" checked={!draft.meta.kinds.length || draft.meta.kinds.includes(k.id)} onChange={e => {
                const all = draft.meta.use === "piece" ? walkIn : troughKinds;
                const on = new Set(draft.meta.kinds.length ? draft.meta.kinds : all.map(x => x.id));
                if (e.target.checked) on.add(k.id); else on.delete(k.id);
                // every kind ticked: stored as "every kind", so kinds added later get it too
                change({ kinds: on.size === all.length ? [] : [...on] });
              }} /> {k.plural}
            </label>
          ))}
        </fieldset>
        {user?.isAdmin && (
          <fieldset>
            <legend>Sharing</legend>
            <label className="choice">
              <input type="checkbox" checked={draft.shared} onChange={e => setDraft({ ...draft, shared: e.target.checked })} /> Share with everyone
            </label>
            <p className="hint">Everyone can place a shared item in their buildings. Only you can change or delete it.</p>
          </fieldset>
        )}
        <div className="row">
          <button type="button" className="primary" onClick={save} disabled={busy || !draft.name.trim() || draft.missing.length > 0}>
            {draft.asset ? "Save" : "Import"}
          </button>
          {!draft.asset && queue.length > 0 && <button type="button" onClick={next} disabled={busy}>Skip this one</button>}
          <button type="button" onClick={() => { setDraft(null); setQueue([]); }} disabled={busy}>{queue.length > 0 ? "Stop" : "Cancel"}</button>
        </div>
      </div>
    </section>
  );

  return (
    <>
      <TopBar user={user} />
      <main className="page" onDragOver={e => { if (user && !busy) e.preventDefault(); }} onDrop={e => {
        if (!user || busy) return;
        e.preventDefault();
        const dropped = droppedFiles(e.dataTransfer);   // started before the first await: the event's items are gone after it
        dropped.then(files => { pick(files); }, err => setError(err instanceof Error ? err.message : "Something went wrong."));
      }}>
        <div className="page-head">
          <h2>Items</h2>
          <button className="primary" type="button" onClick={() => fileInput.current?.click()} disabled={!user || busy}>Import an item</button>
          <button type="button" onClick={() => folderInput.current?.click()} disabled={!user || busy}>Import a folder</button>
          <input ref={fileInput} type="file" multiple hidden accept=".i3d,.shapes,.obj,.png,.dds" onChange={e => { pick(e.target.files); e.target.value = ""; }} />
          <input ref={folderInput} type="file" hidden {...({ webkitdirectory: "" } as object)} onChange={e => { pick(e.target.files); e.target.value = ""; }} />
        </div>
        <p className="hint">{t("Items you made in Giants Editor or in the modeller, to place inside your buildings or beside them. Pick the item's .i3d, its .i3d.shapes and any textures of its own (.dds or .png), or pick or drop a whole folder from fs25ModelExporter. Textures that come with the game ($data/...) need not be picked: the game has them. A copy of them in the folder (data/...) is used for the preview here but is not saved with the item. An .obj of the item is not needed; if you pick one it is used for the preview instead.")}</p>
        {(error || userError) && <p className="error" role="alert">{error || userError}</p>}
        {form}
        {!items && !error && !userError && <p className="loading">Loading your items…</p>}
        {items && items.length === 0 && !draft && (
          <div className="empty">
            <h3>No items yet</h3>
            <p className="hint">Import a feeder, a drinker or anything else you made in Giants Editor.</p>
          </div>
        )}
        {items && items.some(a => a.mine) && list(items.filter(a => a.mine))}
        {items && items.some(a => !a.mine) && (
          <>
            <h3 className="item-group">Shared items</h3>
            <p className="hint">Shared by the admin, for everyone to use.</p>
            {list(items.filter(a => !a.mine))}
          </>
        )}
      </main>
    </>
  );
}
