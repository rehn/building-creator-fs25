"use client";
// The modeller's editor: a list of parts with the chosen one's settings on the left, the 3D view on the right (docs/PLAN_BUILDER.md).
import { useEffect, useRef, useState } from "react";
import { addMaterial, addPart, duplicatePart, groundPart, partFaces, removeMaterial, removePart, sanitize, setFaceMaterial, setFaceRotation, updateMaterial, updatePart, MAX_MATERIALS, type BuilderProject, type Part } from "./model.mjs";
import { createBuilderView, type BuilderView } from "./view.mjs";
import { draftValue, shownValue } from "./number.mjs";
import { api, type Texture } from "@/lib/api";
import { decodeDds } from "@/editor/dds.mjs";

export type BuilderModel = BuilderProject;
export interface BuilderHandle { snapshot: () => string | null; picture: (size: number) => Promise<{ width: number; height: number; rgba: Uint8ClampedArray } | null>; setItemId: (id: string) => void }

// label, step of the arrow keys, and the range of the slider (what is typed may go beyond it, up to what the model allows)
const NUM: Record<"x" | "y" | "z" | "rotX" | "rotY" | "rotZ" | "w" | "d" | "h" | "r" | "seg", [string, number, number, number]> = {
  x: ["x", 0.05, -10, 10], y: ["y", 0.05, 0, 10], z: ["z", 0.05, -10, 10],
  rotX: ["Tilt forward, around x (degrees)", 5, -180, 180], rotY: ["Turn, around y (degrees)", 5, -180, 180], rotZ: ["Tilt sideways, around z (degrees)", 5, -180, 180],
  seg: ["Sides (more is rounder)", 1, 6, 64], w: ["Width", 0.05, 0.05, 10], d: ["Depth", 0.05, 0.05, 10], h: ["Height", 0.05, 0.05, 10], r: ["Radius", 0.05, 0.05, 5],
};

/** A number field that keeps what is typed until it is left: the model clamps every value, and showing the clamped value while typing made 3 over 6 into 62. */
function NumberField({ label, value, step, min, max, onCommit }: { label: string; value: number; step: number; min?: number; max?: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(() => shownValue(value));
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setText(shownValue(value)); }, [value]);
  const typed = (t: string) => { setText(t); const v = draftValue(t); if (v !== null) onCommit(v); };
  return (
    <label className="field">{label}
      <span className="numrow">
      {min !== undefined && max !== undefined && (
        <input type="range" aria-label={label} min={min} max={max} step={step >= 1 ? step : 0.01} value={Math.min(max, Math.max(min, value))}
          onChange={e => { const v = Number(e.target.value); setText(shownValue(v)); onCommit(v); }} />
      )}
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
      </span>
    </label>
  );
}

export default function Builder({ initial, onChange, onReady }: { initial: Record<string, unknown>; onChange: (m: BuilderModel) => void; onReady?: (h: BuilderHandle) => void }) {
  const [model, setModel] = useState<BuilderModel>(() => sanitize(initial));
  const modelRef = useRef(model);
  modelRef.current = model;
  const [chosen, setChosen] = useState<number | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<BuilderView | null>(null);
  const [face, setFace] = useState<string | null>(null);
  const [library, setLibrary] = useState<Texture[]>([]);   // the user's saved textures (My textures)
  const [loaded, setLoaded] = useState(0);                // how many texture pictures the view has got (a change redraws)
  const asked = useRef(new Set<string>());
  const pick = useRef<(id: number | null, face: string | null) => void>(() => {});
  pick.current = (id, f) => { setChosen(id); setFace(id === null ? null : f); };

  useEffect(() => {
    if (!canvas.current) return;
    const v = createBuilderView(canvas.current, { onPick: (id, f) => pick.current(id, f) });
    view.current = v;
    v.show(model, chosen, face); v.frame(model);
    onReady?.({ snapshot: v.snapshot, picture: v.picture, setItemId: id => { const next = sanitize({ ...modelRef.current, item: { id } }); setModel(next); onChange(next); } });
    return () => { v.dispose(); view.current = null; };
    // (mounted once; later changes are drawn by the effect below)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { view.current?.show(model, chosen, face); }, [model, chosen, face, loaded]);
  useEffect(() => { api.textures().then(setLibrary).catch(() => setLibrary([])); }, []);
  // the pictures of the textures the materials use, fetched once each and handed to the view
  useEffect(() => {
    for (const m of model.materials) {
      const id = m.texture?.id;
      if (!id || asked.current.has(id)) continue;
      asked.current.add(id);
      api.textureFile(id, "diffuse").then(buf => { const d = decodeDds(new Uint8Array(buf)); view.current?.setTexture(id, { width: d.width, height: d.height, rgba: d.data }); setLoaded(n => n + 1); }).catch(() => asked.current.delete(id));
    }
  }, [model.materials]);

  const change = (next: BuilderModel) => { setModel(next); onChange(next); };
  const part = model.parts.find(p => p.id === chosen) ?? null;
  const add = (shape: Part["shape"]) => {
    const next = addPart(model, { shape, x: model.parts.length * 0.6 });
    change(next); setChosen(next.parts[next.parts.length - 1]?.id ?? null); setFace(null);
  };
  const set = (patch: Partial<Part>) => part && change(updatePart(model, part.id, patch));
  const field = (k: keyof typeof NUM) => {
    const [label, step, min, max] = NUM[k];
    return <NumberField key={`${part?.id}-${k}`} label={label} step={step} min={min} max={max} value={part ? part[k] : 0} onCommit={v => set({ [k]: v })} />;
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
        <section className="builder-materials" aria-label="Materials">
          <h3>Materials</h3>
          {model.materials.length === 0 && <p className="hint">A material is a colour you can put on any face. Add one, then choose a face and pick it.</p>}
          <ul className="builder-list">
            {model.materials.map(m => (
              <li key={m.id} className="builder-material">
                <div className="builder-material-head">
                  <input type="color" aria-label="Colour" value={m.color} onChange={e => change(updateMaterial(model, m.id, { color: e.target.value }))} />
                  <input type="text" translate="no" aria-label="Name" maxLength={60} value={m.name} onChange={e => change(updateMaterial(model, m.id, { name: e.target.value }))} />
                  <button type="button" className="danger" aria-label="Delete this material" onClick={() => change(removeMaterial(model, m.id))}>×</button>
                </div>
                <label className="field">Texture
                  <select value={m.texture?.id ?? ""} onChange={e => {
                    const t = library.find(x => x.id === e.target.value);
                    change(updateMaterial(model, m.id, { texture: t ? { id: t.id, meters: t.meters, fit: m.texture?.fit ?? false } : null }));
                  }}>
                    <option value="">Colour only</option>
                    {m.texture && !library.some(x => x.id === m.texture!.id) && <option value={m.texture.id}>{"A texture that is gone"}</option>}
                    {library.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
                <NumberField key={`${m.id}-smooth`} label="Shine (0 matt, 1 glossy)" step={0.05} min={0} max={1} value={m.smoothness} onCommit={v => change(updateMaterial(model, m.id, { smoothness: v }))} />
                <NumberField key={`${m.id}-metal`} label="Metal (0 none, 1 bare metal)" step={0.05} min={0} max={1} value={m.metalness} onCommit={v => change(updateMaterial(model, m.id, { metalness: v }))} />
                {m.texture && <label className="check"><input type="checkbox" checked={m.texture.fit} onChange={e => change(updateMaterial(model, m.id, { texture: { id: m.texture!.id, meters: m.texture!.meters, fit: e.target.checked } }))} /> Fit to face (the picture once over the whole face)</label>}
                {m.texture && !m.texture.fit && <NumberField key={`${m.id}-meters`} label="Size of one repeat, in metres" step={0.05} min={0.05} max={10} value={m.texture.meters} onCommit={v => change(updateMaterial(model, m.id, { texture: { id: m.texture!.id, meters: v, fit: false } }))} />}
              </li>
            ))}
          </ul>
          <button type="button" disabled={model.materials.length >= MAX_MATERIALS} onClick={() => change(addMaterial(model, { name: `Material ${model.materials.length + 1}` }))}>+ Material</button>
        </section>
        <section className="builder-materials" aria-label="Game mod">
          <h3>Game mod</h3>
          <NumberField key="mod-price" label="Price in the shop" step={100} value={model.mod.price} onCommit={v => change(sanitize({ ...model, mod: { ...model.mod, price: v } }))} />
          <NumberField key="mod-upkeep" label="Upkeep per day" step={1} value={model.mod.upkeep} onCommit={v => change(sanitize({ ...model, mod: { ...model.mod, upkeep: v } }))} />
          <label className="check"><input type="checkbox" checked={model.mod.sellable} onChange={e => change(sanitize({ ...model, mod: { ...model.mod, sellable: e.target.checked } }))} /> Can be bought and sold in the shop</label>
        </section>
        <h3>Parts</h3>
        <ul className="builder-list">
          {model.parts.map(p => (
            <li key={p.id}>
              <button type="button" className={p.id === chosen ? "on" : ""} aria-pressed={p.id === chosen} onClick={() => { setChosen(p.id); setFace(null); }}>
                <span className="swatch" style={{ background: p.color }} aria-hidden="true" /> <span translate="no">{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
        {part && (
          <section className="builder-part" aria-label="Chosen part">
            <label className="field">Name <input type="text" translate="no" maxLength={60} value={part.name} onChange={e => set({ name: e.target.value })} /></label>
            <label className="field">Colour <input type="color" value={part.color} onChange={e => set({ color: e.target.value })} /></label>
            <label className="check"><input type="checkbox" checked={part.collision} onChange={e => set({ collision: e.target.checked })} /> Solid (players and vehicles cannot pass through)</label>
            <fieldset className="builder-faces">
              <legend>Faces</legend>
              <p className="hint">Click a face in the view, or pick it here, to give it a material.</p>
              <div className="seg wrap">
                {partFaces(part).map(f => (
                  <button type="button" key={f.id} aria-pressed={face === f.id} onClick={() => setFace(face === f.id ? null : f.id)}>{f.label}</button>
                ))}
              </div>
              {face && (
                <label className="field">Material of this face
                  <select value={part.faces[face] ?? ""} onChange={e => change(setFaceMaterial(model, part.id, face, e.target.value === "" ? null : Number(e.target.value)))}>
                    <option value="">The part’s colour</option>
                    {model.materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </label>
              )}
              {face && model.materials.find(m => m.id === part.faces[face])?.texture && (
                <label className="field">Turn the texture
                  <select value={part.faceRot[face] ?? 0} onChange={e => change(setFaceRotation(model, part.id, face, Number(e.target.value)))}>
                    <option value={0}>Not turned</option>
                    <option value={90}>Quarter turn</option>
                    <option value={180}>Half turn</option>
                    <option value={270}>Three quarters</option>
                  </select>
                </label>
              )}
            </fieldset>
            {(["x", "y", "z", "rotX", "rotY", "rotZ"] as const).map(field)}
            {(part.shape === "cylinder" ? (["r", "h", "seg"] as const) : (["w", "h", "d"] as const)).map(field)}
            <div className="builder-add">
              <button type="button" onClick={() => change(groundPart(model, part.id))} title="Move the part up or down so its lowest point is on the ground">Put on the ground</button>
            </div>
            <div className="builder-add">
              <button type="button" onClick={() => { const n = duplicatePart(model, part.id); change(n); setChosen(n.parts[n.parts.length - 1].id); setFace(null); }}>Duplicate</button>
              <button type="button" className="danger" onClick={() => { change(removePart(model, part.id)); setChosen(null); setFace(null); }}>Delete</button>
            </div>
          </section>
        )}
      </aside>
      <canvas ref={canvas} className="builder-canvas" aria-label="3D view of the parts" />
    </div>
  );
}
