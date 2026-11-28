"use client";
// The modeller's editor, laid out as the building's and the mod's (docs/DESIGN.md "Editor pages"): the tree of the prop in the left panel, the settings of what is chosen as cards
// in the details panel, the 3D view filling the rest (docs/PLAN_BUILDER.md).
import { useEffect, useRef, useState } from "react";
import { addMaterial, addPart, duplicatePart, groundPart, partFaces, removeMaterial, removePart, sanitize, setFaceMaterial, setFaceRotation, updateMaterial, updatePart, MAX_MATERIALS, type BuilderProject, type Part } from "./model.mjs";
import { createBuilderView, type BuilderView } from "./view.mjs";
import { api, type Texture } from "@/lib/api";
import { loadDiffuse } from "@/lib/textureMaps";
import { SURFACE_TEXTURES, parseSurfaceTextureId, surfaceTextureId, surfaceTextureMeters } from "./surfaceTextures.mjs";
import { RangeField } from "@/components/RangeField";
import { TreeRow } from "@/components/TreeRow";
import { usePanelSizes } from "@/components/usePanelSizes";
import { t } from "@/i18n/index.mjs";

export type BuilderModel = BuilderProject;
export interface BuilderHandle { snapshot: () => string | null; picture: (size: number) => Promise<{ width: number; height: number; rgba: Uint8ClampedArray } | null>; setItemId: (id: string) => void }

type Num = "x" | "y" | "z" | "rotX" | "rotY" | "rotZ" | "w" | "d" | "h" | "r" | "seg" | "t" | "bendR" | "bendA";
// label, step, the slider's ends, the ends of what may be typed (what the model allows), unit
const NUM: Record<Num, [string, number, number, number, number, number, string]> = {
  x: ["x", 0.05, -10, 10, -200, 200, "m"], y: ["y", 0.05, 0, 10, -10, 100, "m"], z: ["z", 0.05, -10, 10, -200, 200, "m"],
  rotX: ["Tilt forward, around x (degrees)", 5, -180, 180, -180, 180, "°"], rotY: ["Turn, around y (degrees)", 5, -180, 180, -180, 180, "°"], rotZ: ["Tilt sideways, around z (degrees)", 5, -180, 180, -180, 180, "°"],
  seg: ["Sides (more is rounder)", 1, 6, 64, 6, 64, ""], w: ["Width", 0.05, 0.05, 10, 0.01, 50, "m"], d: ["Depth", 0.05, 0.05, 10, 0.01, 50, "m"], h: ["Height", 0.05, 0.05, 10, 0.01, 50, "m"], r: ["Radius", 0.05, 0.05, 5, 0.01, 25, "m"],
  t: ["Wall thickness", 0.01, 0.01, 0.5, 0.005, 25, "m"], bendR: ["Bend radius (to the middle of the pipe)", 0.05, 0.1, 5, 0.01, 50, "m"], bendA: ["Bend angle (degrees)", 5, 5, 180, 5, 180, "°"],
};

/** What the tree has chosen when no part is: the prop itself (its game mod settings) or the materials. */
type Node = "root" | "materials";

export default function Builder({ initial, onChange, onReady }: { initial: Record<string, unknown>; onChange: (m: BuilderModel) => void; onReady?: (h: BuilderHandle) => void }) {
  const [model, setModel] = useState<BuilderModel>(() => sanitize(initial));
  const modelRef = useRef(model);
  modelRef.current = model;
  const [chosen, setChosen] = useState<number | null>(null);
  const [node, setNode] = useState<Node>("root");
  const [closed, setClosed] = useState(false);
  const bench = useRef<HTMLDivElement>(null);
  const panels = usePanelSizes(bench);
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
      loadDiffuse(id).then(d => { view.current?.setTexture(id, d); setLoaded(n => n + 1); }).catch(() => asked.current.delete(id));
    }
  }, [model.materials]);

  const change = (next: BuilderModel) => { setModel(next); onChange(next); };
  const part = model.parts.find(p => p.id === chosen) ?? null;
  const add = (shape: Part["shape"]) => {
    const next = addPart(model, { shape, x: model.parts.length * 0.6 });
    change(next); setChosen(next.parts[next.parts.length - 1]?.id ?? null); setFace(null);
  };
  const set = (patch: Partial<Part>) => part && change(updatePart(model, part.id, patch));
  /** While a slider is dragged the view follows, and nothing is saved until it is let go. */
  const live = (patch: Partial<Part>) => part && setModel(updatePart(modelRef.current, part.id, patch));
  const field = (k: Num) => {
    const [label, step, min, max, hardMin, hardMax, unit] = NUM[k];
    return <RangeField key={`${part?.id}-${k}`} label={label} step={step} min={min} max={max} hardMin={hardMin} hardMax={hardMax} unit={unit}
      value={part?.[k] ?? 0} onLive={v => live({ [k]: v })} onCommit={v => set({ [k]: v })} />;
  };
  const choosePart = (id: number) => { setChosen(id); setFace(null); };
  const chooseNode = (n: Node) => { setChosen(null); setFace(null); setNode(n); };

  return (
    <div className="modedit" ref={bench} style={panels.style}>
      <div id="rz1" {...panels.handle("panel", t("Resize the left panel"))} />
      <div id="rz2" {...panels.handle("details", t("Resize the details panel"))} />
      <aside className="hx-panel modedit-tree" aria-label={t("Parts")}>
        <div className="mtree-menu">
          <button type="button" onClick={() => add("box")}>+ Box</button>
          <button type="button" onClick={() => add("cylinder")}>+ Cylinder</button>
          <button type="button" onClick={() => add("cone")}>+ Cone</button>
          <button type="button" onClick={() => add("sphere")}>+ Ball</button>
          <button type="button" onClick={() => add("pipe")}>+ Pipe</button>
          <button type="button" onClick={() => add("bend")}>+ Bent pipe</button>
        </div>
        <ul className="tree" role="tree">
          <TreeRow depth={0} label={t("The prop")} strong on={chosen === null && node === "root"} onChoose={() => chooseNode("root")} folded={closed} onFold={() => setClosed(c => !c)} />
          {!closed && <>
            <TreeRow depth={1} label={t("Materials")} hint={String(model.materials.length)} on={chosen === null && node === "materials"} onChoose={() => chooseNode("materials")} />
            {model.parts.map(p => (
              <TreeRow key={p.id} depth={1} label={p.name} on={p.id === chosen} onChoose={() => choosePart(p.id)}
                lead={<span className="swatch" style={{ background: p.color }} aria-hidden="true" />} />
            ))}
          </>}
        </ul>
        {model.parts.length === 0 && <p className="hint">Add a box or a cylinder to start. Drag in the view to turn, scroll to zoom, click a part to choose it.</p>}
        <p className="hint axes"><b style={{ color: "#d33" }}>x</b> red, <b style={{ color: "#2a2" }}>y</b> green (up), <b style={{ color: "#33d" }}>z</b> blue.</p>
      </aside>

      <aside className="hx-details modedit-props" aria-label={t("Properties")}>
        {part ? (
          <>
            <section className="hx-card" aria-label="Chosen part">
              <h3 className="hx-card-h" translate="no">{part.name}</h3>
              <label className="field">Name <input type="text" translate="no" maxLength={60} value={part.name} onChange={e => set({ name: e.target.value })} /></label>
              <label className="field">Colour <input type="color" value={part.color} onChange={e => set({ color: e.target.value })} /></label>
              <label className="check"><input type="checkbox" checked={part.collision} onChange={e => set({ collision: e.target.checked })} /> Solid (players and vehicles cannot pass through)</label>
              <div className="row">
                <button type="button" onClick={() => { const n = duplicatePart(model, part.id); change(n); setChosen(n.parts[n.parts.length - 1].id); setFace(null); }}>Duplicate</button>
                <button type="button" className="danger" onClick={() => { change(removePart(model, part.id)); setChosen(null); setFace(null); }}>Delete</button>
              </div>
            </section>
            <section className="hx-card" aria-label="Position">
              <h3 className="hx-card-h">{t("Position")}</h3>
              {(["x", "y", "z", "rotX", "rotY", "rotZ"] as const).map(field)}
              <div className="row">
                <button type="button" onClick={() => change(groundPart(model, part.id))} title="Move the part up or down so its lowest point is on the ground">Put on the ground</button>
              </div>
            </section>
            <section className="hx-card" aria-label="Size">
              <h3 className="hx-card-h">{t("Size")}</h3>
              {(part.shape === "sphere" ? (["r", "seg"] as const) : part.shape === "pipe" ? (["r", "t", "h", "seg"] as const) : part.shape === "bend" ? (["r", "t", "bendR", "bendA", "seg"] as const)
                : part.shape === "cylinder" || part.shape === "cone" ? (["r", "h", "seg"] as const) : (["w", "h", "d"] as const)).map(field)}
            </section>
            <section className="hx-card" aria-label="Faces">
              <h3 className="hx-card-h">{t("Faces")}</h3>
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
            </section>
          </>
        ) : node === "materials" ? (
          <section className="hx-card" aria-label="Materials">
            <h3 className="hx-card-h">{t("Materials")}</h3>
            {model.materials.length === 0 && <p className="hint">A material is a colour you can put on any face. Add one, then choose a face and pick it.</p>}
            <ul className="builder-list">
              {model.materials.map(m => (
                <li key={m.id} className="builder-material">
                  <div className="builder-material-head">
                    <input type="color" aria-label="Colour" value={m.color} onChange={e => {
                      // (a building surface is drawn in the row's colour: its texture id says the colour)
                      const s = m.texture && parseSurfaceTextureId(m.texture.id);
                      change(updateMaterial(model, m.id, s ? { color: e.target.value, texture: { ...m.texture!, id: surfaceTextureId(s.kind, e.target.value) } } : { color: e.target.value }));
                    }} />
                    <input type="text" translate="no" aria-label="Name" maxLength={60} value={m.name} onChange={e => change(updateMaterial(model, m.id, { name: e.target.value }))} />
                    <button type="button" className="danger" aria-label="Delete this material" onClick={() => change(removeMaterial(model, m.id))}>×</button>
                  </div>
                  <label className="field">Texture
                    <select value={m.texture ? (parseSurfaceTextureId(m.texture.id) ? "surface:" + parseSurfaceTextureId(m.texture.id)!.kind : m.texture.id) : ""} onChange={e => {
                      const v = e.target.value, fit = m.texture?.fit ?? false, tx = library.find(x => x.id === v);
                      const texture = v.startsWith("surface:") ? { id: surfaceTextureId(v.slice(8), m.color), meters: surfaceTextureMeters(v.slice(8)), fit } : tx ? { id: tx.id, meters: tx.meters, fit } : null;
                      change(updateMaterial(model, m.id, { texture }));
                    }}>
                      <option value="">Colour only</option>
                      {m.texture && !parseSurfaceTextureId(m.texture.id) && !library.some(x => x.id === m.texture!.id) && <option value={m.texture.id}>{"A texture that is gone"}</option>}
                      <optgroup label={t("Surfaces of the buildings")}>
                        {SURFACE_TEXTURES.map(s => <option key={s.kind} value={"surface:" + s.kind}>{t(s.label)}</option>)}
                      </optgroup>
                      {library.length > 0 && <optgroup label={t("My textures")}>{library.map(tx => <option key={tx.id} value={tx.id}>{tx.name}</option>)}</optgroup>}
                    </select>
                  </label>
                  {m.texture && parseSurfaceTextureId(m.texture.id) && <p className="hint">The colour above is the colour of this surface.</p>}
                  <RangeField key={`${m.id}-smooth`} label="Shine (0 matt, 1 glossy)" unit="" step={0.05} min={0} max={1} value={m.smoothness} onCommit={v => change(updateMaterial(model, m.id, { smoothness: v }))} />
                  <RangeField key={`${m.id}-metal`} label="Metal (0 none, 1 bare metal)" unit="" step={0.05} min={0} max={1} value={m.metalness} onCommit={v => change(updateMaterial(model, m.id, { metalness: v }))} />
                  {m.texture && <label className="check"><input type="checkbox" checked={m.texture.fit} onChange={e => change(updateMaterial(model, m.id, { texture: { id: m.texture!.id, meters: m.texture!.meters, fit: e.target.checked } }))} /> Fit to face (the picture once over the whole face)</label>}
                  {m.texture && !m.texture.fit && <RangeField key={`${m.id}-meters`} label="Size of one repeat, in metres" step={0.05} min={0.05} max={10} value={m.texture.meters} onCommit={v => change(updateMaterial(model, m.id, { texture: { id: m.texture!.id, meters: v, fit: false } }))} />}
                </li>
              ))}
            </ul>
            <div className="row">
              <button type="button" disabled={model.materials.length >= MAX_MATERIALS} onClick={() => change(addMaterial(model, { name: `Material ${model.materials.length + 1}` }))}>+ Material</button>
            </div>
          </section>
        ) : (
          <section className="hx-card" aria-label="The prop">
            <h3 className="hx-card-h">{t("The prop")}</h3>
            <p className="hint">{t("A prop has no shop or game settings of its own. Put it in a mod (Mods): the mod is what the game gets, with its price and the rest.")}</p>
          </section>
        )}
      </aside>

      <div className="modedit-stage">
        <canvas ref={canvas} aria-label="3D view of the parts" />
      </div>
    </div>
  );
}
