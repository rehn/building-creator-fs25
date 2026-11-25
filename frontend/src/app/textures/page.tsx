"use client";
// My textures (docs/PLAN_BUILDER.md, step 2): a photo is cropped, sized and made seamless in the browser (photoTexture.mjs) and only the finished
// maps are saved, privately, so the server export never has to decode a photo.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type Texture } from "@/lib/api";
import { useUser } from "@/lib/useUser";
import { TopBar } from "@/components/TopBar";
import { t } from "@/i18n/index.mjs";
import { makePhotoTexture, photoTextureDds, squareCrop, nearestPow2 } from "@/editor/photoTexture.mjs";
import { prepareSource, COLOR_LIMITS } from "@/editor/photoEdit.mjs";
import { confirmDialog } from "@/components/dialog.mjs";

type Picture = { width: number; height: number; rgba: Uint8ClampedArray };
type Draft = { file: File; original: Picture; picture: Picture; flipX: boolean; flipY: boolean; turn: number; brightness: number; contrast: number; saturation: number; hue: number; name: string; zoom: number; cx: number; cy: number; rotate: number; flatten: number; size: number; meters: number; seamless: boolean; bump: number; mine: boolean; whole: boolean; background: string; margin: number };

/** The part of the picture that is used: all of it for a logo or a sign (stretched to the square), else the square frame. */
const cropOf = (d: Draft) => d.whole ? { x: 0, y: 0, w: 1, h: 1 } : squareCrop(d.picture.width, d.picture.height, d);
/** What makePhotoTexture is given for a draft: the whole picture is not straightened, evened out or blended at its edges. */
const optsOf = (d: Draft, size: number, bump = d.bump) => ({ size, crop: cropOf(d), rotate: d.whole ? 0 : d.rotate, flatten: d.whole ? 0 : d.flatten, seamless: d.seamless && !d.whole, bump, meters: d.meters, background: d.background, margin: d.whole ? d.margin / 100 : 0, brightness: d.brightness, contrast: d.contrast, saturation: d.saturation, hue: d.hue });

// (kept as string literals so that npm run i18n finds them)
const TEXT = {
  intro: "Make a texture from a photo, for example rusty corrugated metal. The picture is cropped and made ready for the game here in your browser. Only the finished texture is saved, and only you can use it.",
  bigger: "A bigger picture is sharper but uses more of the game’s texture memory.",
  straighten: "For a photo taken at an angle: lines that slope down to the right are levelled with a plus.",
  flatten: "If the photo is lighter on one side, you see a step where it repeats. This takes that shading out, sideways only, so horizontal bands stay.",
  frame: "The frame shows the part of the photo that is used.",
  right: "I have the right to use this photo, and to put it in a mod I share.",
};
const SIZES = [256, 512, 1024, 2048];
const MAX_SIDE = 3072; // a bigger photo is shrunk while it is read (memory)
const PREVIEW = 256;

/** The photo as pixels. */
async function readPicture(file: File): Promise<Picture> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  g.drawImage(bmp, 0, 0, w, h); bmp.close();
  return { width: w, height: h, rgba: g.getImageData(0, 0, w, h).data };
}

const canvasOf = (px: Uint8ClampedArray, n: number) => {
  const c = document.createElement("canvas"); c.width = n; c.height = n;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(px), n, n), 0, 0);
  return c;
};
const canvasOfPicture = (p: Picture) => {
  const c = document.createElement("canvas"); c.width = p.width; c.height = p.height;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(p.rgba), p.width, p.height), 0, 0);
  return c;
};
const blobOf = (b: Uint8Array) => new Blob([b as BlobPart], { type: "application/octet-stream" });

/** The texture as it will look: the picture twice across and down, so a seam shows. */
function Preview({ d }: { d: Draft }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current; if (!c) return;
    const tex = makePhotoTexture(d.picture, optsOf(d, PREVIEW));
    const one = canvasOf(tex.diffuse, PREVIEW), g = c.getContext("2d")!;
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) g.drawImage(one, x * PREVIEW, y * PREVIEW);
  }, [d.picture, d.zoom, d.cx, d.cy, d.rotate, d.flatten, d.seamless, d.bump, d.meters, d.whole, d.background, d.margin, d.brightness, d.contrast, d.saturation, d.hue]);
  return <canvas ref={canvas} className="tex-preview" width={PREVIEW * 2} height={PREVIEW * 2} aria-label="Preview of the texture, repeated twice across and down" />;
}

/** The photo with a frame round the part that is used (turned by "Straighten"), so zoom and position can be seen. */
function SourceView({ d }: { d: Draft }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const full = useMemo(() => canvasOfPicture(d.picture), [d.picture]);
  useEffect(() => {
    const c = canvas.current; if (!c) return;
    const k = Math.min(1, 360 / Math.max(d.picture.width, d.picture.height));
    c.width = Math.round(d.picture.width * k); c.height = Math.round(d.picture.height * k);
    const g = c.getContext("2d")!;
    g.drawImage(full, 0, 0, c.width, c.height);
    const r = cropOf(d), w = r.w * c.width, h = r.h * c.height;
    g.save(); g.translate((r.x + r.w / 2) * c.width, (r.y + r.h / 2) * c.height); g.rotate(d.rotate * Math.PI / 180);
    g.lineWidth = 3; g.strokeStyle = "#000"; g.strokeRect(-w / 2, -h / 2, w, h);
    g.lineWidth = 1.5; g.strokeStyle = "#fff"; g.strokeRect(-w / 2, -h / 2, w, h);
    g.restore();
  }, [full, d.picture, d.zoom, d.cx, d.cy, d.rotate, d.whole]);
  return <canvas ref={canvas} className="tex-source" aria-label="The photo, with a frame round the part that is used" />;
}

export default function TexturesPage() {
  const { user, error: userError } = useUser();
  const [items, setItems] = useState<Texture[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<{ tex: Texture; name: string; meters: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { if (user) api.textures().then(setItems).catch(e => setError(e.message)); }, [user]);

  async function pick(files: FileList | null) {
    const file = files?.[0]; if (!file) return;
    setError(""); setEditing(null);
    try {
      const picture = await readPicture(file);
      setDraft({ file, original: picture, picture, flipX: false, flipY: false, turn: 0, brightness: 0, contrast: 0, saturation: 0, hue: 0, name: file.name.replace(/\.[^.]+$/, "").slice(0, 100), zoom: 1, cx: 0.5, cy: 0.5, rotate: 0, flatten: 0, size: 1024, meters: 1, seamless: false, bump: 2, mine: false, whole: false, background: "#ffffff", margin: 0 });
    } catch { setError(t("That file isn’t a picture the browser can read (use a JPEG, PNG or WebP).")); }
  }

  async function save() {
    if (!draft) return;
    setBusy(true); setError("");
    try {
      await new Promise(r => setTimeout(r, 30)); // let "Making the texture…" show before the heavy part
      const tex = makePhotoTexture(draft.picture, optsOf(draft, draft.size));
      const thumb = (() => {
        const small = makePhotoTexture(draft.picture, optsOf(draft, 64, 0));
        return canvasOf(small.diffuse, 64).toDataURL("image/jpeg", 0.85);
      })();
      const dds = photoTextureDds(tex);
      const form = new FormData();
      form.append("name", draft.name.trim());
      form.append("size", String(tex.size));
      form.append("meters", String(draft.meters));
      form.append("thumb", thumb);
      form.append("diffuse", blobOf(dds.diffuse), "diffuse.dds");
      form.append("normal", blobOf(dds.normal), "normal.dds");
      form.append("specular", blobOf(dds.specular), "specular.dds");
      const made = await api.createTexture(form);
      setItems(list => [made, ...(list ?? [])]);
      setDraft(null);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function saveEdit() {
    if (!editing) return;
    setBusy(true); setError("");
    try {
      const made = await api.updateTexture(editing.tex.id, { name: editing.name.trim(), meters: editing.meters });
      setItems(list => (list ?? []).map(x => x.id === made.id ? made : x));
      setEditing(null);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function remove(x: Texture) {
    if (!await confirmDialog(t("Delete “{name}”?", { name: x.name }), { confirm: t("Delete"), danger: true })) return;
    setBusy(true); setError("");
    try { await api.deleteTexture(x.id); setItems(list => (list ?? []).filter(y => y.id !== x.id)); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const change = (patch: Partial<Draft>) => setDraft(d => d && { ...d, ...patch });
  /** A flip or a turn of the photo: the picture the rest works on is made again from the photo as it was read, and the frame goes back to the middle. */
  const flipTurn = (f: (d: Draft) => Partial<Pick<Draft, "flipX" | "flipY" | "turn">>) => setDraft(d => {
    if (!d) return d;
    const n = { ...d, ...f(d) };
    return { ...n, picture: prepareSource(n.original, { flipX: n.flipX, flipY: n.flipY, turn: n.turn }), cx: 0.5, cy: 0.5 };
  });
  const edited = (d: Draft) => d.flipX || d.flipY || d.turn !== 0 || d.brightness !== 0 || d.contrast !== 0 || d.saturation !== 0 || d.hue !== 0;
  const colorSlider = (k: "brightness" | "contrast" | "saturation" | "hue", label: string, d: Draft) => (
    <label>{label} <small>{k === "hue" ? `${d[k]}°` : `${Math.round(d[k] * 100)} %`}</small>
      <input type="range" min={COLOR_LIMITS[k][0]} max={COLOR_LIMITS[k][1]} step={k === "hue" ? 1 : 0.01} value={d[k]} onChange={e => change({ [k]: Number(e.target.value) })} />
    </label>
  );
  const num = (v: string, fallback: number) => { const n = Number(v.replace(",", ".")); return Number.isFinite(n) ? n : fallback; };

  const form = draft && (
    <section className="item-form" aria-label="New texture">
      <div>
        <SourceView d={draft} />
        <p className="hint">{TEXT.frame}</p>
        <Preview d={draft} />
        <p className="hint">{t("Shown twice across and down, so you can see where it repeats.")}</p>
      </div>
      <div className="item-fields">
        <label>Name <input type="text" value={draft.name} maxLength={100} onChange={e => change({ name: e.target.value })} /></label>
        <label className="choice"><input type="checkbox" checked={draft.whole} onChange={e => change({ whole: e.target.checked })} /> Keep the whole picture (for a logo or a sign)</label>
        <p className="hint">The whole picture is stretched to the square, nothing is cut off. On a face set to “Fit to face” it comes back at its own proportions. Zoom, straighten and the seamless option are not used.</p>
        {draft.whole && <label>Margin round the picture <small>{draft.margin} %</small> <input type="range" min={0} max={40} step={1} value={draft.margin} onChange={e => change({ margin: Number(e.target.value) })} /></label>}
        {draft.whole && <p className="hint">A sign with a border: the picture is made smaller and the margin gets the colour below. The margin is a share of the face, so a wide sign gets a wider margin along its length.</p>}
        <fieldset>
          <legend>Turn and colour</legend>
          <div className="seg wrap">
            <button type="button" onClick={() => flipTurn(d => ({ flipX: !d.flipX }))} aria-pressed={draft.flipX}>{t("Flip left to right")}</button>
            <button type="button" onClick={() => flipTurn(d => ({ flipY: !d.flipY }))} aria-pressed={draft.flipY}>{t("Flip up and down")}</button>
            <button type="button" onClick={() => flipTurn(d => ({ turn: (d.turn + 3) % 4 }))}>{t("Turn left")}</button>
            <button type="button" onClick={() => flipTurn(d => ({ turn: (d.turn + 1) % 4 }))}>{t("Turn right")}</button>
          </div>
          {colorSlider("brightness", t("Brightness"), draft)}
          {colorSlider("contrast", t("Contrast"), draft)}
          {colorSlider("saturation", t("Saturation"), draft)}
          {colorSlider("hue", t("Colour shift"), draft)}
          <p className="hint">{t("The colour is the picture's only: the relief and the shine are worked out from the photo as it is.")}</p>
          {edited(draft) && <div className="row"><button type="button" onClick={() => { flipTurn(() => ({ flipX: false, flipY: false, turn: 0 })); change({ brightness: 0, contrast: 0, saturation: 0, hue: 0 }); }}>{t("Reset the edits")}</button></div>}
        </fieldset>
        <label>Fill see-through parts with <input type="color" value={draft.background} onChange={e => change({ background: e.target.value })} /></label>
        <p className="hint">A picture with a see-through background (a logo) is put on this colour, so it is not black round the edges.</p>
        <label>Zoom <small>{Math.round(draft.zoom * 100)} %</small> <input type="range" min={0.05} max={1} step={0.01} value={draft.zoom} onChange={e => change({ zoom: Number(e.target.value) })} /></label>
        <label>Left to right <small>{Math.round(draft.cx * 100)} %</small> <input type="range" min={0} max={1} step={0.01} value={draft.cx} onChange={e => change({ cx: Number(e.target.value) })} /></label>
        <label>Up and down <small>{Math.round(draft.cy * 100)} %</small> <input type="range" min={0} max={1} step={0.01} value={draft.cy} onChange={e => change({ cy: Number(e.target.value) })} /></label>
        <label>Straighten <small>{draft.rotate}°</small> <input type="range" min={-10} max={10} step={0.5} value={draft.rotate} onChange={e => change({ rotate: Number(e.target.value) })} /></label>
        <p className="hint">{TEXT.straighten}</p>
        <label>Even out the light <small>{Math.round(draft.flatten * 100)} %</small> <input type="range" min={0} max={1} step={0.05} value={draft.flatten} onChange={e => change({ flatten: Number(e.target.value) })} /></label>
        <p className="hint">{TEXT.flatten}</p>
        <label className="choice"><input type="checkbox" checked={draft.seamless} onChange={e => change({ seamless: e.target.checked })} /> Make it repeat without a seam</label>
        <p className="hint">Not needed for textures made to be repeated. For a photo it blends the edges, which softens the middle a little.</p>
        <label>Relief (normal map) <small>{draft.bump}</small> <input type="range" min={0} max={6} step={0.5} value={draft.bump} onChange={e => change({ bump: Number(e.target.value) })} /></label>
        <label>Real size of the square, in metres
          <input type="number" min={0.05} max={100} step={0.05} value={draft.meters} onChange={e => change({ meters: num(e.target.value, 1) })} />
        </label>
        <fieldset>
          <legend>Picture size</legend>
          <div className="seg">
            {SIZES.map(s => <button type="button" key={s} aria-pressed={draft.size === s} onClick={() => change({ size: nearestPow2(s) })}>{s}</button>)}
          </div>
          <p className="hint">{TEXT.bigger}</p>
        </fieldset>
        <label className="choice">
          <input type="checkbox" checked={draft.mine} onChange={e => change({ mine: e.target.checked })} />
          {TEXT.right}
        </label>
        <p className="hint">The texture is private to you. A mod you share contains it, so you answer for the right to share it.</p>
        <div className="row">
          <button type="button" className="primary" onClick={save} disabled={busy || !draft.name.trim() || !draft.mine || draft.meters <= 0}>{busy ? "Making the texture…" : "Save texture"}</button>
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
          <h2>Textures</h2>
          <button className="primary" type="button" onClick={() => fileInput.current?.click()} disabled={!user || busy}>Add a photo</button>
          <input ref={fileInput} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={e => { pick(e.target.files); e.target.value = ""; }} />
        </div>
        <p className="hint">{TEXT.intro}</p>
        {(error || userError) && <p className="error" role="alert">{error || userError}</p>}
        {form}
        {!items && !error && !userError && <p className="loading">Loading your textures…</p>}
        {items && items.length === 0 && !draft && (
          <div className="empty">
            <h3>No textures yet</h3>
            <p className="hint">Add a photo of a surface: metal, planks, brick, plaster.</p>
          </div>
        )}
        {items && items.length > 0 && (
          <ul className="item-list">
            {items.map(x => (
              <li key={x.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="tex-thumb" src={x.thumb} alt="" width={64} height={64} />
                {editing?.tex.id === x.id ? (
                  <div className="item-fields">
                    <label>Name <input type="text" value={editing.name} maxLength={100} onChange={e => setEditing({ ...editing, name: e.target.value })} /></label>
                    <label>Real size of the square, in metres <input type="number" min={0.05} max={100} step={0.05} value={editing.meters} onChange={e => setEditing({ ...editing, meters: num(e.target.value, editing.meters) })} /></label>
                    <div className="row">
                      <button type="button" className="primary" onClick={saveEdit} disabled={busy || !editing.name.trim() || editing.meters <= 0}>Save</button>
                      <button type="button" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <b translate="no">{x.name}</b>
                      <small>{x.size} × {x.size} px · {x.meters} m</small>
                    </div>
                    <div className="actions">
                      <button type="button" onClick={() => { setDraft(null); setEditing({ tex: x, name: x.name, meters: x.meters }); }} disabled={busy}>Change</button>
                      <button type="button" className="danger" onClick={() => remove(x)} disabled={busy}>Delete</button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
