"use client";
// The modeller's editor: a list of parts with the chosen one's settings on the left, the 3D view on the right (docs/PLAN_BUILDER.md).
import { useEffect, useRef, useState } from "react";
import { addPart, duplicatePart, removePart, sanitize, updatePart, type BuilderProject, type Part } from "./model.mjs";
import { createBuilderView, type BuilderView } from "./view.mjs";

export type BuilderModel = BuilderProject;
export interface BuilderHandle { snapshot: () => string | null }

const NUM: Record<"x" | "y" | "z" | "rotY" | "w" | "d" | "h" | "r", [string, number]> = { x: ["x", 0.05], y: ["y", 0.05], z: ["z", 0.05], rotY: ["Turn (degrees)", 5], w: ["Width", 0.05], d: ["Depth", 0.05], h: ["Height", 0.05], r: ["Radius", 0.05] };

export default function Builder({ initial, onChange, onReady }: { initial: Record<string, unknown>; onChange: (m: BuilderModel) => void; onReady?: (h: BuilderHandle) => void }) {
  const [model, setModel] = useState<BuilderModel>(() => sanitize(initial));
  const [chosen, setChosen] = useState<number | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<BuilderView | null>(null);
  const pick = useRef<(id: number | null) => void>(() => {});
  pick.current = setChosen;

  useEffect(() => {
    if (!canvas.current) return;
    const v = createBuilderView(canvas.current, { onPick: id => pick.current(id) });
    view.current = v;
    v.show(model, chosen); v.frame(model);
    onReady?.({ snapshot: v.snapshot });
    return () => { v.dispose(); view.current = null; };
    // (mounted once; later changes are drawn by the effect below)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { view.current?.show(model, chosen); }, [model, chosen]);

  const change = (next: BuilderModel) => { setModel(next); onChange(next); };
  const part = model.parts.find(p => p.id === chosen) ?? null;
  const add = (shape: Part["shape"]) => {
    const next = addPart(model, { shape, x: model.parts.length * 0.6 });
    change(next); setChosen(next.parts[next.parts.length - 1]?.id ?? null);
  };
  const set = (patch: Partial<Part>) => part && change(updatePart(model, part.id, patch));
  const field = (k: keyof typeof NUM) => {
    const [label, step] = NUM[k];
    return (
      <label key={k} className="field">{label}
        <input type="number" step={step} value={part ? part[k] : 0} onChange={e => e.target.value !== "" && set({ [k]: +e.target.value })} />
      </label>
    );
  };

  return (
    <div className="builder">
      <aside className="builder-panel" aria-label="Parts">
        <div className="builder-add">
          <button type="button" onClick={() => add("box")}>+ Box</button>
          <button type="button" onClick={() => add("cylinder")}>+ Cylinder</button>
        </div>
        {model.parts.length === 0 && <p className="hint">Add a box or a cylinder to start. Drag in the view to turn, scroll to zoom, click a part to choose it.</p>}
        <ul className="builder-list">
          {model.parts.map(p => (
            <li key={p.id}>
              <button type="button" className={p.id === chosen ? "on" : ""} aria-pressed={p.id === chosen} onClick={() => setChosen(p.id)}>
                <span className="swatch" style={{ background: p.color }} aria-hidden="true" /> <span translate="no">{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
        {part && (
          <section className="builder-part" aria-label="Chosen part">
            <label className="field">Name <input type="text" translate="no" maxLength={60} value={part.name} onChange={e => set({ name: e.target.value })} /></label>
            <label className="field">Colour <input type="color" value={part.color} onChange={e => set({ color: e.target.value })} /></label>
            {(["x", "y", "z", "rotY"] as const).map(field)}
            {(part.shape === "cylinder" ? (["r", "h"] as const) : (["w", "h", "d"] as const)).map(field)}
            <div className="builder-add">
              <button type="button" onClick={() => { const n = duplicatePart(model, part.id); change(n); setChosen(n.parts[n.parts.length - 1].id); }}>Duplicate</button>
              <button type="button" className="danger" onClick={() => { change(removePart(model, part.id)); setChosen(null); }}>Delete</button>
            </div>
          </section>
        )}
      </aside>
      <canvas ref={canvas} className="builder-canvas" aria-label="3D view of the parts" />
    </div>
  );
}
