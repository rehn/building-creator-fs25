"use client";
// The modeller's editor: a list of parts with the chosen one's settings on the left, the 3D view on the right (docs/PLAN_BUILDER.md).
import { useEffect, useRef, useState } from "react";
import { addPart, duplicatePart, groundPart, removePart, sanitize, updatePart, type BuilderProject, type Part } from "./model.mjs";
import { createBuilderView, type BuilderView } from "./view.mjs";
import { draftValue, shownValue } from "./number.mjs";

export type BuilderModel = BuilderProject;
export interface BuilderHandle { snapshot: () => string | null }

const NUM: Record<"x" | "y" | "z" | "rotX" | "rotY" | "rotZ" | "w" | "d" | "h" | "r" | "seg", [string, number]> = { x: ["x", 0.05], y: ["y", 0.05], z: ["z", 0.05], rotX: ["Tilt forward, around x (degrees)", 5], rotY: ["Turn, around y (degrees)", 5], rotZ: ["Tilt sideways, around z (degrees)", 5], seg: ["Sides (more is rounder)", 1], w: ["Width", 0.05], d: ["Depth", 0.05], h: ["Height", 0.05], r: ["Radius", 0.05] };

/** A number field that keeps what is typed until it is left: the model clamps every value, and showing the clamped value while typing made 3 over 6 into 62. */
function NumberField({ label, value, step, onCommit }: { label: string; value: number; step: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(() => shownValue(value));
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setText(shownValue(value)); }, [value]);
  const typed = (t: string) => { setText(t); const v = draftValue(t); if (v !== null) onCommit(v); };
  return (
    <label className="field">{label}
      <input type="text" inputMode="decimal" value={text}
        onFocus={e => { editing.current = true; e.target.select(); }}
        onChange={e => typed(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const v = (draftValue(text) ?? value) + (e.key === "ArrowUp" ? step : -step);
            setText(shownValue(v)); onCommit(+shownValue(v));
          }
        }}
        onBlur={() => { editing.current = false; setText(shownValue(value)); }} />
    </label>
  );
}

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
    return <NumberField key={`${part?.id}-${k}`} label={label} step={step} value={part ? part[k] : 0} onCommit={v => set({ [k]: v })} />;
  };

  return (
    <div className="builder">
      <aside className="builder-panel" aria-label="Parts">
        <div className="builder-add">
          <button type="button" onClick={() => add("box")}>+ Box</button>
          <button type="button" onClick={() => add("cylinder")}>+ Cylinder</button>
        </div>
        <p className="hint axes"><b style={{ color: "#d33" }}>x</b> red, <b style={{ color: "#2a2" }}>y</b> green (up), <b style={{ color: "#33d" }}>z</b> blue.</p>
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
            {(["x", "y", "z", "rotX", "rotY", "rotZ"] as const).map(field)}
            {(part.shape === "cylinder" ? (["r", "h", "seg"] as const) : (["w", "h", "d"] as const)).map(field)}
            <div className="builder-add">
              <button type="button" onClick={() => change(groundPart(model, part.id))} title="Move the part up or down so its lowest point is on the ground">Put on the ground</button>
            </div>
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
