"use client";
// The mod's 3D plan (docs/PLAN_MOD.md step 3): the buildings and props of a mod on a ground, moved by dragging. The drawing is editor/modView.mjs (three.js),
// the snapping editor/modPlan.mjs. A move is saved when the thing is let go, a turn or a typed number at once (onChange saves the list on the server).
import { useEffect, useRef, useState } from "react";
import { api, type ModPost } from "@/lib/api";
import { t } from "@/i18n/index.mjs";
import { createModView } from "@/editor/modView.mjs";
import { projectGroups, boundsOf, turnedBy } from "@/editor/modPlan.mjs";
import { placePost } from "@/lib/mods.mjs";

type Groups = ReturnType<typeof projectGroups>;
type Shape = { groups: Groups; bounds: ReturnType<typeof boundsOf> };
type View = ReturnType<typeof createModView>;
const LIMIT = 5000;

/** A number field that keeps what is typed until it is left or Enter is pressed, then gives the number (kept within the plan). */
function PlaceField({ label, value, step, onCommit, disabled }: { label: string; value: number; step: number; onCommit: (v: number) => void; disabled?: boolean }) {
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
      <input type="text" inputMode="decimal" value={text} disabled={disabled} data-step={step}
        onFocus={e => { editing.current = true; e.target.select(); }} onChange={e => setText(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />
    </label>
  );
}

export default function ModPlan({ items, busy, onChange }: { items: ModPost[]; busy: boolean; onChange: (items: ModPost[]) => void }) {
  const [draft, setDraft] = useState<ModPost[]>(items);
  const [shapes, setShapes] = useState<Record<string, Shape | "error">>({});
  const [sel, setSel] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<View | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const asked = useRef(new Set<string>());

  useEffect(() => { setDraft(items); }, [items]);   // (what the server has now)

  // what each thing looks like: its project, read once
  useEffect(() => {
    for (const p of items) {
      if (p.missing || asked.current.has(p.ref)) continue;
      asked.current.add(p.ref);
      api.project(p.ref).then(pr => {
        const groups = projectGroups(pr.data);
        setShapes(s => ({ ...s, [p.ref]: { groups, bounds: boundsOf(groups) } }));
      }).catch(() => setShapes(s => ({ ...s, [p.ref]: "error" })));
    }
  }, [items]);

  useEffect(() => {
    if (!canvas.current) return;
    const v = createModView(canvas.current, {
      onSelect: id => setSel(id),
      onMove: (id: string, pos: { x: number; z: number }) => setDraft(placePost(draftRef.current, id, pos)),
      onDrop: (id: string, pos: { x: number; z: number }) => { const next = placePost(draftRef.current, id, pos); setDraft(next); changeRef.current(next); },
    });
    view.current = v;
    return () => { v.dispose(); view.current = null; };
  }, []);

  useEffect(() => {
    const posts = [];
    for (const p of draft) {
      const s = shapes[p.ref];
      if (s && s !== "error") posts.push({ id: p.id, x: p.x, z: p.z, rot: p.rot, groups: s.groups, bounds: s.bounds });
    }
    view.current?.show(posts);
  }, [draft, shapes]);
  useEffect(() => { view.current?.select(sel); }, [sel, draft, shapes]);

  const post = draft.find(p => p.id === sel) ?? null;
  const loading = items.some(p => !p.missing && !shapes[p.ref]);
  const failed = items.filter(p => !p.missing && shapes[p.ref] === "error").length;
  const place = (id: string, patch: { x?: number; z?: number; rot?: number }) => { const next = placePost(draft, id, patch); setDraft(next); onChange(next); };

  return (
    <div className="modplan">
      <div className="modplan-stage">
        <canvas ref={canvas} aria-label={t("The buildings and props of the mod in 3D")} />
        {loading && <p className="loading modplan-note">{t("Reading the buildings…")}</p>}
      </div>
      <aside className="modplan-side">
        <p className="hint">{t("Drag a building or a prop to move it. Drag the ground to turn the view, right-drag to pan and scroll to zoom. Hold Alt while you drag to move without snapping.")}</p>
        {failed > 0 && <p className="error" role="alert">{t("Some of the buildings could not be read, so they are not shown.")}</p>}
        {post ? (
          <div className="modplan-post">
            <h4 translate="no">{post.name || t("Deleted")}</h4>
            <PlaceField label={t("Along the width (m)")} value={post.x} step={0.5} onCommit={v => place(post.id, { x: v })} disabled={busy} />
            <PlaceField label={t("Along the depth (m)")} value={post.z} step={0.5} onCommit={v => place(post.id, { z: v })} disabled={busy} />
            <PlaceField label={t("Turn (degrees)")} value={post.rot} step={5} onCommit={v => place(post.id, { rot: v })} disabled={busy} />
            <div className="row">
              <button type="button" onClick={() => place(post.id, { rot: turnedBy(post.rot, -90) })} disabled={busy}>{t("Turn left")}</button>
              <button type="button" onClick={() => place(post.id, { rot: turnedBy(post.rot, 90) })} disabled={busy}>{t("Turn right")}</button>
            </div>
          </div>
        ) : <p className="hint">{t("Choose a building or a prop to see where it stands.")}</p>}
      </aside>
    </div>
  );
}
