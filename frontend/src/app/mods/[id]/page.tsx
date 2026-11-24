"use client";
// One mod (docs/PLAN_MOD.md): a full-size page to build it on, as the building editor is (DESIGN 5). On the left the mod as a tree: its buildings and props, and under each of
// them the game objects put on it; the big 3D view is where they are moved (dragged over the ground, they snap to the grid and to each other); what is chosen has its details
// under the tree. Each change is saved at once, with the version, so a change made somewhere else is not overwritten. The whole mod is ONE placeable when it is generated
// (PLAN_MOD, decided 2026-11-24): the game takes one sleep point, one workshop ... in it, so two posts with the same are warned about.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, type Mod, type ModPost, type ProjectSummary } from "@/lib/api";
import { useUser } from "@/lib/useUser";
import { TopBar } from "@/components/TopBar";
import { t } from "@/i18n/index.mjs";
import { KINDS, sanitize } from "@/editor/model.mjs";
import { OBJECT_TYPES, OBJECT_LIMITS } from "@/editor/objects.mjs";
import { createModView } from "@/editor/modView.mjs";
import { projectGroups, boundsOf, turnedBy } from "@/editor/modPlan.mjs";
import { confirmDialog, promptDialog } from "@/components/dialog.mjs";
import { addPost, removePost, setPostType, placePost, countsOf, choices, payload } from "@/lib/mods.mjs";
import { groupsFree, addGroup, removeGroup, setObjectOf, clashes, settingsFor } from "@/lib/modObjects.mjs";

type Kind = { id: string; name: string };
type Groups = ReturnType<typeof projectGroups>;
type Shape = { groups: Groups; bounds: ReturnType<typeof boundsOf>; settings: ReturnType<typeof settingsFor> };
type View = ReturnType<typeof createModView>;
type Choice = { post: string | null; object: number | null };
const TYPES = KINDS as Kind[];
const LIMIT = 5000;
const typeName = (type: string) => t((OBJECT_TYPES as Record<string, { name: string }>)[type]?.name ?? type);
const typeHint = (type: string) => t((OBJECT_TYPES as Record<string, { hint?: string }>)[type]?.hint ?? "");

/** A number field that keeps what is typed until it is left or Enter is pressed, then gives the number (the caller keeps it within its range). */
function NumField({ label, value, onCommit, disabled }: { label: string; value: number; onCommit: (v: number) => void; disabled?: boolean }) {
  const shown = (v: number) => String(Math.round(v * 100) / 100);
  const [text, setText] = useState(shown(value));
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setText(shown(value)); }, [value]);
  const commit = () => {
    editing.current = false;
    const v = Number(text.replace(",", "."));
    if (Number.isFinite(v) && Math.abs(v) <= LIMIT && v !== value) onCommit(v); else setText(shown(value));
  };
  return (
    <label className="stack">{label}
      <input type="text" inputMode="decimal" value={text} disabled={disabled}
        onFocus={e => { editing.current = true; e.target.select(); }} onChange={e => setText(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />
    </label>
  );
}

export default function ModPage() {
  const { id } = useParams<{ id: string }>();
  const { user, error: userError } = useUser();
  const [mod, setMod] = useState<Mod | null>(null);
  const [draft, setDraft] = useState<ModPost[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [shapes, setShapes] = useState<Record<string, Shape | "error">>({});
  const [sel, setSel] = useState<Choice>({ post: null, object: null });
  const [adding, setAdding] = useState<"building" | "prop" | null>(null);
  const [menu, setMenu] = useState<string | null>(null);   // the post whose list of game objects to add is open
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<View | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const modRef = useRef(mod);
  modRef.current = mod;
  const asked = useRef(new Set<string>());

  useEffect(() => {
    if (!user) return;
    Promise.all([api.mod(id), api.projects()]).then(([m, list]) => { setMod(m); setProjects(list); }).catch(e => setError(e.message));
  }, [user, id]);
  useEffect(() => { setDraft(mod?.items ?? []); }, [mod]);   // (what the server has now)

  // what each thing looks like and the settings its game objects start from: its project, read once
  useEffect(() => {
    for (const p of mod?.items ?? []) {
      if (p.missing || asked.current.has(p.ref)) continue;
      asked.current.add(p.ref);
      api.project(p.ref).then(pr => {
        const groups = projectGroups(pr.data), bounds = boundsOf(groups);
        const settings = pr.data.kind === "prop" ? settingsFor({ width: bounds.max[0] - bounds.min[0], depth: bounds.max[2] - bounds.min[2] }) : sanitize(pr.data);
        setShapes(s => ({ ...s, [p.ref]: { groups, bounds, settings } }));
      }).catch(() => setShapes(s => ({ ...s, [p.ref]: "error" })));
    }
  }, [mod]);

  /** Saves the list (the answer has the ids and the names); a change made somewhere else is not overwritten but read again. */
  async function save(items: ModPost[]) {
    const m = modRef.current;
    if (!m) return;
    setBusy(true); setError("");
    try { setMod(await api.updateMod(m.id, { items: payload(items), version: m.version })); }
    catch (e) { setError((e as Error).message); api.mod(m.id).then(setMod).catch(() => {}); }
    finally { setBusy(false); }
  }
  const change = (next: ModPost[]) => { setDraft(next); save(next); };

  // the 3D view
  useEffect(() => {
    if (!canvas.current) return;
    const v = createModView(canvas.current, {
      onSelect: (post: string | null, object: number | null) => { setSel({ post, object }); setAdding(null); },
      onMove: (pid: string, at: { x: number; z: number }) => setDraft(placePost(draftRef.current, pid, at)),
      onDrop: (pid: string, at: { x: number; z: number }) => change(placePost(draftRef.current, pid, at)),
      onObjectMove: (pid: string, oid: number, at: { x: number; z: number }) => setDraft(setObjectOf(draftRef.current, pid, oid, at)),
      onObjectDrop: (pid: string, oid: number, at: { x: number; z: number }) => change(setObjectOf(draftRef.current, pid, oid, at)),
    });
    view.current = v;
    return () => { v.dispose(); view.current = null; };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const posts = [];
    for (const p of draft) {
      const s = shapes[p.ref];
      if (s && s !== "error") posts.push({ id: p.id, x: p.x, z: p.z, rot: p.rot, groups: s.groups, bounds: s.bounds, objects: p.objects ?? [] });
    }
    view.current?.show(posts);
  }, [draft, shapes]);
  useEffect(() => { view.current?.select(sel.post, sel.object); }, [sel, draft, shapes]);

  async function rename() {
    if (!mod) return;
    const name = await promptDialog(t("Name"), mod.name, { title: t("Rename"), confirm: t("Rename"), maxLength: 100 });
    if (!name?.trim() || name.trim() === mod.name) return;
    setBusy(true); setError("");
    try { setMod(await api.updateMod(mod.id, { name: name.trim(), version: mod.version })); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!mod) return;
    if (!await confirmDialog(t("Delete the mod “{name}”? The buildings and props in it stay.", { name: mod.name }), { title: t("Delete"), confirm: t("Delete"), danger: true })) return;
    setBusy(true); setError("");
    try { await api.deleteMod(mod.id); window.location.href = "/mods"; }
    catch (e) { setError((e as Error).message); setBusy(false); }
  }

  const n = countsOf(draft);
  const post = draft.find(p => p.id === sel.post) ?? null;
  const object = post && sel.object !== null ? (post.objects ?? []).find(o => o.id === sel.object) ?? null : null;
  const options: ProjectSummary[] = mod && adding ? choices(projects, draft, adding) : [];
  const loading = draft.some(p => !p.missing && !shapes[p.ref]);
  const failed = draft.filter(p => !p.missing && shapes[p.ref] === "error").length;
  const open = (p: ModPost) => (p.kind === "prop" ? `/builder/${p.ref}` : `/projects/${p.ref}`);
  const put = (pid: string, patch: { x?: number; z?: number; rot?: number }) => change(placePost(draft, pid, patch));
  const pick = (pid: string, oid: number | null = null) => { setSel({ post: pid, object: oid }); setAdding(null); };

  function addObjects(pid: string, group: string) {
    const s = shapes[draft.find(p => p.id === pid)?.ref ?? ""];
    if (!s || s === "error") return;
    const next: ModPost[] = addGroup(draft, pid, group, s.settings);
    const added = (next.find(p => p.id === pid)?.objects ?? []).slice(-1)[0];
    setMenu(null); change(next);
    if (added) pick(pid, added.id);
  }

  const node = (label: string, on: boolean, onClick: () => void, extra?: string) => (
    <button type="button" className={"tnode" + (on ? " on" : "")} aria-pressed={on} onClick={onClick}><span translate="no">{label}</span>{extra && <small>{extra}</small>}</button>
  );
  const group = (kind: "building" | "prop", title: string, count: number) => (
    <section className="mtree-group">
      <h4>{title} <small>{count}</small><button type="button" className="linklike" onClick={() => { setAdding(kind); setSel({ post: null, object: null }); }} disabled={busy}>{kind === "prop" ? t("Add props") : t("Add buildings")}</button></h4>
      <ul className="mtree">
        {draft.filter(p => p.kind === kind).map(p => (
          <li key={p.id}>
            {node(p.missing ? t("Deleted") : p.name, sel.post === p.id && sel.object === null, () => pick(p.id), p.missing ? undefined : p.type ? TYPES.find(k => k.id === p.type)?.name : undefined)}
            {!p.missing && (
              <ul>
                {(p.objects ?? []).map(o => <li key={o.id}>{node(typeName(o.type), sel.post === p.id && sel.object === o.id, () => pick(p.id, o.id))}</li>)}
                <li>
                  <button type="button" className="linklike" aria-expanded={menu === p.id} onClick={() => { setMenu(menu === p.id ? null : p.id); setSel({ post: p.id, object: null }); }} disabled={busy || !shapes[p.ref] || shapes[p.ref] === "error"}>{t("Add a game object")}</button>
                  {menu === p.id && (
                    <div className="mtree-menu">
                      {groupsFree(p).length === 0 && <p className="hint">{t("This one has all of them.")}</p>}
                      {groupsFree(p).map((g: { id: string; name: string }) => <button type="button" key={g.id} onClick={() => addObjects(p.id, g.id)} disabled={busy}>{t(g.name)}</button>)}
                    </div>
                  )}
                </li>
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );

  const clash = clashes(draft) as { group: string; name: string; posts: string[] }[];

  return (
    <>
      <TopBar user={user} />
      <main className="modedit">
        <aside className="modedit-side">
          <p className="hint"><Link href="/mods">{t("All mods")}</Link></p>
          <div className="modedit-head">
            <h2 translate="no">{mod ? mod.name : t("Mod")}</h2>
            {mod && <button type="button" onClick={rename} disabled={busy}>Rename</button>}
            {mod && <button type="button" className="danger" onClick={remove} disabled={busy}>Delete</button>}
          </div>
          {(error || userError) && <p className="error" role="alert">{error || userError}</p>}
          {!mod && !error && !userError && <p className="loading">Loading the mod…</p>}
          {failed > 0 && <p className="error">{t("Some of the buildings could not be read, so they are not shown.")}</p>}
          {clash.map(c => <p className="error" key={c.group}>{t("The game takes one of these in a mod: {name}. Only the first is used. It is on: {posts}.", { name: t(c.name), posts: c.posts.join(", ") })}</p>)}

          {mod && adding && (
            <section>
              <h4>{adding === "prop" ? t("Add props") : t("Add buildings")}</h4>
              {options.length === 0
                ? <p className="hint">{adding === "prop" ? t("Every prop you have is in this mod already, or you have none yet. Props are made in the modeller, from My buildings.") : t("Every building you have is in this mod already, or you have none yet.")}</p>
                : <ul className="item-list compact">{options.map(h => (
                  <li key={h.id}><div><b translate="no">{h.name}</b></div><div className="actions"><button type="button" onClick={() => change(addPost(draft, adding, h.id))} disabled={busy}>Add</button></div></li>
                ))}</ul>}
              <button type="button" className="primary" onClick={() => setAdding(null)}>Done</button>
            </section>
          )}

          {mod && !adding && (
            <>
              {group("building", t("Buildings"), n.building)}
              {group("prop", t("Props"), n.prop)}
              {draft.length === 0 && <p className="hint">{t("Add buildings and props first. Then you place them here.")}</p>}

              <section className="modedit-details">
                {!post && <p className="hint">{t("Drag a building or a prop to move it. Drag the ground to turn the view, right-drag to pan and scroll to zoom. Hold Alt while you drag to move without snapping.")}</p>}
                {post && !object && (
                  <div className="modplan-post">
                    <h4 translate="no">{post.missing ? t("Deleted") : post.name}</h4>
                    {post.missing && <p className="hint">{t("What this was made from is gone. Take it out of the mod.")}</p>}
                    {post.kind === "building" && !post.missing && (
                      <label className="stack">{t("Mod type")}
                        <select value={post.type} onChange={e => change(setPostType(draft, post.id, e.target.value))} disabled={busy}>
                          <option value="">{t("As the building is")}</option>
                          {TYPES.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                        </select>
                      </label>
                    )}
                    <NumField label={t("Along the width (m)")} value={post.x} onCommit={v => put(post.id, { x: v })} disabled={busy} />
                    <NumField label={t("Along the depth (m)")} value={post.z} onCommit={v => put(post.id, { z: v })} disabled={busy} />
                    <NumField label={t("Turn (degrees)")} value={post.rot} onCommit={v => put(post.id, { rot: v })} disabled={busy} />
                    <div className="row">
                      <button type="button" onClick={() => put(post.id, { rot: turnedBy(post.rot, -90) })} disabled={busy}>{t("Turn left")}</button>
                      <button type="button" onClick={() => put(post.id, { rot: turnedBy(post.rot, 90) })} disabled={busy}>{t("Turn right")}</button>
                    </div>
                    <div className="row">
                      {!post.missing && <Link className="btn" href={open(post)}>Open</Link>}
                      <button type="button" className="danger" onClick={() => { setSel({ post: null, object: null }); change(removePost(draft, post.id)); }} disabled={busy}>Take out</button>
                    </div>
                  </div>
                )}
                {post && object && (
                  <div className="modplan-post">
                    <h4>{typeName(object.type)}</h4>
                    <p className="hint">{typeHint(object.type)}</p>
                    {(["x", "z", "w", "d", "h"] as const).map(k => (
                      <NumField key={k} label={{ x: t("Along the width (m)"), z: t("Along the depth (m)"), w: t("Width (m)"), d: t("Depth (m)"), h: t("Height (m)") }[k]} value={object[k]}
                        onCommit={v => change(setObjectOf(draft, post.id, object.id, { [k]: Math.min(OBJECT_LIMITS[k][1], Math.max(OBJECT_LIMITS[k][0], v)) }))} disabled={busy} />
                    ))}
                    <p className="hint">{t("Measured from the middle of the building. Taking it away takes the objects that go with it too.")}</p>
                    <div className="row">
                      <button type="button" onClick={() => pick(post.id)}>{t("Back to the building")}</button>
                      <button type="button" className="danger" onClick={() => { setSel({ post: post.id, object: null }); change(removeGroup(draft, post.id, object.id)); }} disabled={busy}>Remove</button>
                    </div>
                  </div>
                )}
              </section>
            </>
          )}
        </aside>
        <div className="modedit-stage">
          <canvas ref={canvas} aria-label={t("The buildings and props of the mod in 3D")} />
          {loading && <p className="loading modplan-note">{t("Reading the buildings…")}</p>}
        </div>
      </main>
    </>
  );
}
