"use client";
// One mod (docs/PLAN_MOD.md): a full-size page to build it on, laid out as the building editor is (DESIGN 5) and like Giants Editor's scene tree: at the left a tree (the mod, its
// buildings and props, and under each of them a "Game objects" node with the game objects put on it), right of it the properties of what is chosen, and the 3D view filling the
// rest, where things are moved by dragging (they snap to the grid and to each other). Each change is saved at once, with the version, so a change made somewhere else is not
// overwritten. The whole mod is ONE placeable when it is generated (PLAN_MOD, decided 2026-11-24): the game takes one sleep point, one workshop ... in it, so two posts with the
// same are warned about.
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
import { addPost, removePost, setPostType, placePost, choices, payload } from "@/lib/mods.mjs";
import { groupsFree, addGroup, removeGroup, setObjectOf, clashes, settingsFor } from "@/lib/modObjects.mjs";

type Kind = { id: string; name: string };
type Groups = ReturnType<typeof projectGroups>;
type Shape = { groups: Groups; bounds: ReturnType<typeof boundsOf>; settings: ReturnType<typeof settingsFor> };
type View = ReturnType<typeof createModView>;
/** What is chosen in the tree: the mod itself, a post, a post's "Game objects" node, or one game object. */
type Sel = { kind: "root" } | { kind: "post"; post: string } | { kind: "group"; post: string } | { kind: "object"; post: string; object: number };
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
  const [sel, setSel] = useState<Sel>({ kind: "root" });
  const [adding, setAdding] = useState<"building" | "prop">("building");   // which list the mod's properties offer to add from
  const [closed, setClosed] = useState<Record<string, boolean>>({});   // the tree nodes folded up
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
      onSelect: (post: string | null, object: number | null) => setSel(post === null ? { kind: "root" } : object === null ? { kind: "post", post } : { kind: "object", post, object }),
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
  useEffect(() => {
    view.current?.select(sel.kind === "root" ? null : sel.post, sel.kind === "object" ? sel.object : null);
  }, [sel, draft, shapes]);

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

  const post = sel.kind === "root" ? null : draft.find(p => p.id === sel.post) ?? null;
  const object = post && sel.kind === "object" ? (post.objects ?? []).find(o => o.id === sel.object) ?? null : null;
  const options: ProjectSummary[] = mod ? choices(projects, draft, adding) : [];
  const loading = draft.some(p => !p.missing && !shapes[p.ref]);
  const failed = draft.filter(p => !p.missing && shapes[p.ref] === "error").length;
  const clash = clashes(draft) as { group: string; name: string; posts: string[] }[];
  const open = (p: ModPost) => (p.kind === "prop" ? `/builder/${p.ref}` : `/projects/${p.ref}`);
  const put = (pid: string, patch: { x?: number; z?: number; rot?: number }) => change(placePost(draft, pid, patch));
  const fold = (key: string) => setClosed(c => ({ ...c, [key]: !c[key] }));
  const shapeOf = (p: ModPost) => shapes[p.ref];

  function addObjects(pid: string, group: string) {
    const s = shapes[draft.find(p => p.id === pid)?.ref ?? ""];
    if (!s || s === "error") return;
    const next: ModPost[] = addGroup(draft, pid, group, s.settings);
    const added = (next.find(p => p.id === pid)?.objects ?? []).slice(-1)[0];
    change(next);
    if (added) setSel({ kind: "object", post: pid, object: added.id });
  }

  /** One row of the tree, as the building editor draws it: a caret (when it has children) and a button. */
  const row = (key: string, depth: number, label: string, on: boolean, choose: () => void, opts: { kids?: boolean; hint?: string; strong?: boolean; add?: () => void } = {}) => (
    <li className={"tnode" + (opts.strong ? " t-main" : "")} style={{ ["--d" as string]: depth }} key={key}>
      {opts.kids ? <button type="button" className="caret" aria-label={closed[key] ? t("Unfold") : t("Fold")} aria-expanded={!closed[key]} onClick={() => fold(key)}>{closed[key] ? "▸" : "▾"}</button> : <span className="caret" aria-hidden="true" />}
      <button type="button" className="tbtn" aria-pressed={on} onClick={choose}><span translate="no">{label}</span>{opts.hint && <small> {opts.hint}</small>}</button>
      {opts.add && <button type="button" className="linklike tadd" onClick={opts.add} disabled={busy}>{t("+ Add")}</button>}
    </li>
  );

  const tree = mod && (
    <ul className="tree" role="tree">
      {row("root", 0, mod.name, sel.kind === "root", () => setSel({ kind: "root" }), { kids: draft.length > 0, strong: true, add: () => setSel({ kind: "root" }) })}
      {!closed.root && draft.flatMap(p => {
        const here = sel.kind !== "root" && sel.post === p.id;
        const rows = [row(p.id, 1, p.missing ? t("Deleted") : p.name, here && sel.kind === "post", () => setSel({ kind: "post", post: p.id }),
          { kids: !p.missing, hint: p.kind === "prop" ? t("prop") : p.type ? TYPES.find(k => k.id === p.type)?.name : undefined })];
        if (!p.missing && !closed[p.id]) {
          rows.push(row("g:" + p.id, 2, t("Game objects"), here && sel.kind === "group", () => setSel({ kind: "group", post: p.id }), { kids: (p.objects ?? []).length > 0 }));
          if (!closed["g:" + p.id]) for (const o of p.objects ?? []) rows.push(row(`o:${p.id}:${o.id}`, 3, typeName(o.type), here && sel.kind === "object" && sel.object === o.id, () => setSel({ kind: "object", post: p.id, object: o.id })));
        }
        return rows;
      })}
    </ul>
  );

  return (
    <>
      <TopBar user={user} />
      <main className="modedit">
        <aside className="hx-panel modedit-tree" aria-label={t("The mod")}>
          <p className="hint"><Link href="/mods">{t("All mods")}</Link></p>
          {!mod && !error && !userError && <p className="loading">Loading the mod…</p>}
          {tree}
          {draft.length === 0 && mod && <p className="hint">{t("Add buildings and props first. Then you place them here.")}</p>}
        </aside>

        <aside className="hx-details modedit-props" aria-label={t("Properties")}>
          {(error || userError) && <p className="error" role="alert">{error || userError}</p>}
          {failed > 0 && <p className="error">{t("Some of the buildings could not be read, so they are not shown.")}</p>}
          {clash.map(c => <p className="error" key={c.group}>{t("The game takes one of these in a mod: {name}. Only the first is used. It is on: {posts}.", { name: t(c.name), posts: c.posts.join(", ") })}</p>)}

          {mod && sel.kind === "root" && (
            <>
              <section className="hx-card">
                <h3 className="hx-card-h" translate="no">{mod.name}</h3>
                <p className="hint">{t("A mod holds buildings and props, and the player puts the whole of it out in one go. Drag them in the view to place them, and put the game objects on the building they belong to.")}</p>
                <div className="row"><button type="button" onClick={rename} disabled={busy}>Rename</button><button type="button" className="danger" onClick={remove} disabled={busy}>Delete</button></div>
              </section>
              <section className="hx-card">
                <h3 className="hx-card-h">{t("Add to the mod")}</h3>
                <div className="starttabs sub" role="tablist" aria-label={t("What to add")}>
                  {(["building", "prop"] as const).map(k => (
                    <button type="button" role="tab" key={k} className={"starttab" + (adding === k ? " on" : "")} aria-selected={adding === k} onClick={() => setAdding(k)}>{k === "prop" ? t("Props") : t("Buildings")} <small>{choices(projects, draft, k).length}</small></button>
                  ))}
                </div>
                {options.length === 0
                  ? <p className="hint">{adding === "prop" ? t("Every prop you have is in this mod already, or you have none yet. Props are made in the modeller, from My buildings.") : t("Every building you have is in this mod already, or you have none yet.")}</p>
                  : <ul className="item-list compact">{options.map(h => (
                    <li key={h.id}><div><b translate="no">{h.name}</b></div><div className="actions"><button type="button" onClick={() => change(addPost(draft, adding, h.id))} disabled={busy}>Add</button></div></li>
                  ))}</ul>}
              </section>
            </>
          )}

          {mod && post && sel.kind === "post" && (
            <section className="hx-card">
              <h3 className="hx-card-h" translate="no">{post.missing ? t("Deleted") : post.name}</h3>
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
                <button type="button" className="danger" onClick={() => { setSel({ kind: "root" }); change(removePost(draft, post.id)); }} disabled={busy}>Take out</button>
              </div>
            </section>
          )}

          {mod && post && sel.kind === "group" && (
            <section className="hx-card">
              <h3 className="hx-card-h">{t("Game objects")}</h3>
              <p className="hint">{t("What the game needs around this building: where the player sleeps, shops or fills up. They are put on the building and move with it.")}</p>
              {groupsFree(post).length === 0 && <p className="hint">{t("This one has all of them.")}</p>}
              <div className="mtree-menu">
                {groupsFree(post).map((g: { id: string; name: string }) => (
                  <button type="button" key={g.id} onClick={() => addObjects(post.id, g.id)} disabled={busy || !shapeOf(post) || shapeOf(post) === "error"}>{t("+ Add")} {t(g.name)}</button>
                ))}
              </div>
            </section>
          )}

          {mod && post && object && (
            <section className="hx-card">
              <h3 className="hx-card-h">{typeName(object.type)}</h3>
              <p className="hint">{typeHint(object.type)}</p>
              {(["x", "z", "w", "d", "h"] as const).map(k => (
                <NumField key={k} label={{ x: t("Along the width (m)"), z: t("Along the depth (m)"), w: t("Width (m)"), d: t("Depth (m)"), h: t("Height (m)") }[k]} value={object[k]}
                  onCommit={v => change(setObjectOf(draft, post.id, object.id, { [k]: Math.min(OBJECT_LIMITS[k][1], Math.max(OBJECT_LIMITS[k][0], v)) }))} disabled={busy} />
              ))}
              <p className="hint">{t("Measured from the middle of the building. Taking it away takes the objects that go with it too.")}</p>
              <div className="row">
                <button type="button" className="danger" onClick={() => { setSel({ kind: "group", post: post.id }); change(removeGroup(draft, post.id, object.id)); }} disabled={busy}>Remove</button>
              </div>
            </section>
          )}
        </aside>

        <div className="modedit-stage">
          <canvas ref={canvas} aria-label={t("The buildings and props of the mod in 3D")} />
          {loading && <p className="loading modplan-note">{t("Reading the buildings…")}</p>}
          <p className="modedit-keys hint">{t("Drag a building or a prop to move it. Drag the ground to turn the view, right-drag to pan and scroll to zoom. Hold Alt while you drag to move without snapping.")}</p>
        </div>
      </main>
    </>
  );
}
