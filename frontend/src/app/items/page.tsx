"use client";
import { useEffect, useRef, useState } from "react";
import { api, type Asset } from "@/lib/api";
import { useUser } from "@/lib/useUser";
import { TopBar } from "@/components/TopBar";
import { t } from "@/i18n/index.mjs";
import { KINDS } from "@/editor/model.mjs";
import { readI3d, missingFiles, readObj, normalizeMeta, assetSize, nameFromFile } from "@/editor/assets.mjs";
import { createItemView } from "@/editor/itemView.mjs";

type Meta = ReturnType<typeof normalizeMeta>;
type Kind = { id: string; plural: string; catalog?: object };
// Kinds with an inside to put items in.
const walkIn = (KINDS as Kind[]).filter(k => k.catalog);
const TURNS = [0, 90, 180, 270];

// i3d files are ISO-8859-1; the .obj is plain ASCII.
const textOf = async (f: Blob) => new TextDecoder("iso-8859-1").decode(await f.arrayBuffer());
const mb = (n: number) => n < 1 << 20 ? `${Math.max(1, Math.round(n / 1024))} kB` : `${(n / (1 << 20)).toFixed(1)} MB`;
const sizeText = (m: Meta) => assetSize(m).map(v => v.toFixed(2)).join(" × ") + " m";
const kindsText = (m: Meta) => m.kinds.length ? walkIn.filter(k => m.kinds.includes(k.id)).map(k => k.plural).join(", ") : "Every building with an inside";

/** The 3D view of an item; draws again when positions or meta change. */
function ItemView({ positions, meta }: { positions: number[]; meta: Meta }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<ReturnType<typeof createItemView> | null>(null);
  useEffect(() => {
    if (!canvas.current) return;
    view.current = createItemView(canvas.current);
    return () => { view.current?.dispose(); view.current = null; };
  }, []);
  useEffect(() => { view.current?.show(positions, meta); }, [positions, meta]);
  return <canvas ref={canvas} className="item-view" aria-label="Preview of the item" />;
}

type Draft = {
  // new: the files to upload; edit: the item being changed
  files?: File[]; asset?: Asset;
  name: string; meta: Meta; positions: number[];
  missing: string[]; ignored: string[];
  shared: boolean;
};

/** Reads the files someone picked: exactly one .i3d and one .obj, and what the i3d needs. */
async function draftFrom(picked: File[]): Promise<Draft> {
  const i3ds = picked.filter(f => /\.i3d$/i.test(f.name)), objs = picked.filter(f => /\.obj$/i.test(f.name));
  if (i3ds.length !== 1) throw new Error(i3ds.length ? "Pick only one .i3d file." : "Pick the item's .i3d file too.");
  if (objs.length !== 1) throw new Error(objs.length ? "Pick only one .obj file." : "Pick an .obj of the item too (in Giants Editor: select it, then File → Export → OBJ). It's used for the preview and to place it.");
  const i3dText = await textOf(i3ds[0]), info = readI3d(i3dText);
  const names = picked.map(f => f.name), missing = missingFiles(i3dText, names);
  const obj = readObj(await textOf(objs[0]), info.hidden);
  // Upload what the item uses; leave out anything else that was picked.
  const needed = new Set(info.own.map(p => p.split(/[\\/]/).pop()!.toLowerCase().replace(/\.(png|dds)$/, "")));
  const keep = picked.filter(f => f === i3ds[0] || f === objs[0] || needed.has(f.name.toLowerCase().replace(/\.(png|dds)$/, "")));
  return {
    files: keep, name: nameFromFile(i3ds[0].name), positions: obj.positions, missing,
    ignored: picked.filter(f => !keep.includes(f)).map(f => f.name), shared: false,
    meta: normalizeMeta({i3d: i3ds[0].name, obj: objs[0].name, hidden: info.hidden, box: obj.box, mount: "floor", turn: 0, kinds: []}),
  };
}

export default function ItemsPage() {
  const { user, error: userError } = useUser();
  const [items, setItems] = useState<Asset[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) api.assets().then(setItems).catch(e => setError(e.message));
  }, [user]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    setBusy(false);
  }
  const pick = (list: FileList | null) => list && list.length && run(async () => {
    setDraft(null);
    setDraft(await draftFrom([...list]));
  });
  const edit = (a: Asset) => run(async () => {
    const meta = normalizeMeta(a.meta);
    const obj = readObj(new TextDecoder().decode(await api.assetFile(a.id, meta.obj)), meta.hidden);
    setDraft({ asset: a, name: a.name, meta, positions: obj.positions, missing: [], ignored: [], shared: a.shared });
  });
  const change = (patch: Partial<Meta>) => setDraft(d => d && { ...d, meta: { ...d.meta, ...patch } });
  const save = () => draft && run(async () => {
    if (draft.asset) {
      const a = await api.updateAsset(draft.asset.id, { name: draft.name, meta: draft.meta, shared: draft.shared });
      setItems(list => (list ?? []).map(x => (x.id === a.id ? a : x)));
    } else {
      const form = new FormData();
      form.append("name", draft.name);
      form.append("meta", JSON.stringify(draft.meta));
      if (draft.shared) form.append("shared", "true");
      for (const f of draft.files ?? []) form.append("files", f, f.name);
      const a = await api.importAsset(form);
      setItems(list => [a, ...(list ?? [])]);
    }
    setDraft(null);
  });
  const remove = (a: Asset) => {
    const who = t(a.shared ? "Everyone's buildings" : "Buildings");
    if (!window.confirm(t("Delete “{name}”? {who} that use it keep its place, but it's left out until it's imported again.", { name: a.name, who }))) return;
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
            <div>
              <b>{a.name} {a.shared && a.mine && <span className="badge ok">Shared with everyone</span>}</b>
              <small>{sizeText(m)} · {m.mount === "wall" ? "against a wall" : "on the floor"} · {kindsText(m)}</small>
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
      <ItemView positions={draft.positions} meta={draft.meta} />
      <div className="item-fields">
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
          <legend>Placed</legend>
          <label className="choice"><input type="radio" name="mount" checked={draft.meta.mount === "floor"} onChange={() => change({ mount: "floor" })} /> On the floor</label>
          <label className="choice"><input type="radio" name="mount" checked={draft.meta.mount === "wall"} onChange={() => change({ mount: "wall" })} /> Against a wall</label>
        </fieldset>
        <fieldset>
          <legend>Turn the model</legend>
          <p className="hint">{draft.meta.mount === "wall" ? "Turn it so its back is against the wall in the picture." : "Turn it so its front faces you."}</p>
          <div className="seg">
            {TURNS.map(t => <button type="button" key={t} aria-pressed={draft.meta.turn === t} onClick={() => change({ turn: t })}>{t}°</button>)}
          </div>
        </fieldset>
        <fieldset>
          <legend>Use in</legend>
          {walkIn.map(k => (
            <label className="choice" key={k.id}>
              <input type="checkbox" checked={!draft.meta.kinds.length || draft.meta.kinds.includes(k.id)} onChange={e => {
                const on = new Set(draft.meta.kinds.length ? draft.meta.kinds : walkIn.map(x => x.id));
                if (e.target.checked) on.add(k.id); else on.delete(k.id);
                // every kind ticked: stored as "every kind", so kinds added later get it too
                change({ kinds: on.size === walkIn.length ? [] : [...on] });
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
          <button type="button" onClick={() => setDraft(null)} disabled={busy}>Cancel</button>
        </div>
      </div>
    </section>
  );

  return (
    <>
      <TopBar user={user} />
      <main className="page">
        <div className="page-head">
          <h2>My items</h2>
          <button className="primary" type="button" onClick={() => fileInput.current?.click()} disabled={!user || busy}>Import an item</button>
          <input ref={fileInput} type="file" multiple hidden accept=".i3d,.shapes,.obj,.png,.dds" onChange={e => { pick(e.target.files); e.target.value = ""; }} />
        </div>
        <p className="hint">Props you made in Giants Editor, to place inside your animal buildings. Pick the item{"’"}s .i3d, its .i3d.shapes,
          an .obj of it (File {"→"} Export {"→"} OBJ, for the preview) and any textures of its own. Textures from the game ($data/...) need nothing.</p>
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
