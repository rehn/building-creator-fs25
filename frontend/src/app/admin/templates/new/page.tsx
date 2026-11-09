"use client";
// The admin's wizard for a template from photos: 1. what it is, 2. photos and notes, 3. Claude's
// suggestion, from the API (needs ANTHROPIC_API_KEY on the server) or from a chat on claude.ai (copy
// the prompt, attach the photos, paste the answer back); then on to the editor to adjust it (the
// project page shows the photos and "Publish").
import { useEffect, useMemo, useState } from "react";
import { t } from "@/i18n/index.mjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, templatePhotoUrl, type Template } from "@/lib/api";
import { useUser } from "@/lib/useUser";
import { shrinkPhoto } from "@/lib/photos";
import { TopBar } from "@/components/TopBar";
import { KINDS, PRESETS, FIELD, sanitize, wallLabel, partName } from "@/editor/model.mjs";
import { photoRequest, applyAnswer, answerProblems, chatPrompt, readAnswer } from "@/editor/fromPhotos.mjs";
import { liveWings } from "@/editor/layout.mjs";

type Kind = { id: string; name: string };
type Preset = { id: string; name: string; kind: string; settings: Record<string, unknown> };
const kinds = KINDS as Kind[];
const MAX_PHOTOS = 8;
const STEPS = ["What it is", "Photos", "Claude’s suggestion"];

export default function NewTemplatePage() {
  const router = useRouter();
  const { user, error: userError } = useUser();
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState("cow");
  const [name, setName] = useState("");
  const [blurb, setBlurb] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [notes, setNotes] = useState("");
  const [tpl, setTpl] = useState<Template | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  // whether the server can ask Claude itself (it has an API key); null until known
  const [apiOn, setApiOn] = useState<boolean | null>(null);
  // the chat way: shown, the prompt copied, the pasted answer
  const [chat, setChat] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState("");
  const previews = useMemo(() => files.map(f => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach(u => URL.revokeObjectURL(u)), [previews]);

  useEffect(() => {
    if (!user?.isAdmin) return;
    api.visionStatus().then(v => setApiOn(v.enabled)).catch(() => setApiOn(false));
    // ?id=...: carry on with a draft (from the admin page)
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) api.template(id).then(t => {
      setTpl(t); setKind(t.kind); setName(t.name); setBlurb(t.blurb); setStep(2);
    }).catch(e => setError(e.message));
  }, [user]);

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label); setError("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    setBusy("");
  }

  function addFiles(list: FileList | null) {
    const imgs = Array.from(list ?? []).filter(f => f.type.startsWith("image/"));
    setFiles(fs => [...fs, ...imgs].slice(0, MAX_PHOTOS));
  }

  const ask = (t: Template) => run("Claude is looking at the photos. This takes a minute or two…", async () => {
    const { guide, schema } = photoRequest(t.kind);
    setTpl(await api.suggestTemplate(t.id, { guide, schema, notes }));
    setChat(false);
  });

  // Step 2 done: send the photos (made smaller first). Claude is asked on the next step, either way.
  const upload = () => run("Sending the photos…", async () => {
    if (!tpl) {
      const form = new FormData();
      form.set("kind", kind); form.set("name", name.trim()); form.set("blurb", blurb.trim());
      for (const f of files) form.append("photos", await shrinkPhoto(f), f.name.replace(/\.\w+$/, "") + ".jpg");
      setTpl(await api.createTemplate(form));
    }
    setStep(2);
  });

  async function copyPrompt() {
    if (!tpl) return;
    try { await navigator.clipboard.writeText(chatPrompt(tpl.kind, notes)); setCopied(true); }
    catch { setError("Couldn’t copy. Try again, or allow the clipboard for this site."); }
  }
  // The answer pasted from the chat is kept with the template, like one from the API.
  const usePasted = () => run("Reading the answer…", async () => {
    if (!tpl) return;
    const answer = readAnswer(pasted);
    setTpl(await api.updateTemplate(tpl.id, { suggestion: answer }));
    setChat(false); setPasted(""); setCopied(false);
  });

  // On to the editor: a project of the admin's with the suggested (or a preset's) settings.
  const adjust = (settings: Record<string, unknown>) => run("Opening the editor…", async () => {
    if (!tpl) return;
    const p = await api.createProject(tpl.name, settings);
    await api.updateTemplate(tpl.id, { projectId: p.id });
    router.push(`/projects/${p.id}?template=${tpl.id}`);
  });
  const presets = (PRESETS as Preset[]).filter(x => x.kind === kind);
  const suggestion = tpl?.suggestion;

  return (
    <>
      <TopBar user={user} />
      <main className="page wizard">
        <div className="page-head">
          <h2>New template from photos</h2>
          <Link className="btn" href="/admin">Cancel</Link>
        </div>
        {userError && <p className="error" role="alert">{userError}</p>}
        {user && !user.isAdmin && <p className="error">Only the admin can make templates.</p>}
        {user?.isAdmin && (
          <>
            <ol className="steps" aria-label="Steps">
              {STEPS.map((s, i) => <li key={s} aria-current={i === step ? "step" : undefined} className={i < step ? "done" : ""}>{s}</li>)}
            </ol>

            {step === 0 && (
              <form className="wizard-card" onSubmit={e => { e.preventDefault(); setStep(1); }}>
                <p className="hint">A template is a starting design everyone can pick under “New”. Claude reads your photos of a real building and suggests the settings; then you adjust them in the editor and publish.</p>
                <label className="stack">Kind of building
                  <select value={kind} onChange={e => setKind(e.target.value)}>
                    {kinds.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                  </select>
                </label>
                <label className="stack">Name
                  <input type="text" required maxLength={100} value={name} onChange={e => setName(e.target.value)} placeholder="Ladugård från Dalarna" />
                </label>
                <label className="stack">Short description (shown under the name)
                  <input type="text" maxLength={300} value={blurb} onChange={e => setBlurb(e.target.value)} placeholder="Long red barn with a stone base and white trim." />
                </label>
                <div className="wizard-nav"><button className="primary" type="submit" disabled={!name.trim()}>Next: photos</button></div>
              </form>
            )}

            {step === 1 && (
              <div className="wizard-card">
                <p className="hint">Add 1 to {MAX_PHOTOS} photos: the front, the back and both ends if you have them, taken from a little way off. Photos straight at a wall show sizes best.</p>
                <label className="drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
                  <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
                  <span>Drop photos here, or <u>choose them</u></span>
                </label>
                {files.length > 0 && (
                  <ul className="photo-grid">
                    {files.map((f, i) => (
                      <li key={previews[i]}>
                        <img src={previews[i]} alt={`Photo ${i + 1}`} />
                        <span>Photo {i + 1}</span>
                        <button type="button" onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))} aria-label={`Remove photo ${i + 1}`}>Remove</button>
                      </li>
                    ))}
                  </ul>
                )}
                <label className="stack">What you know about it (optional)
                  <textarea rows={3} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder="About 30 m long and 12 m wide. Photo 1 is the front, the cows go out at the back. Corrugated metal roof." />
                </label>
                <p className="hint">The photos are kept with the template, so you can look at them while adjusting. On the next step Claude reads them, here or in a chat.</p>
                <div className="wizard-nav">
                  <button type="button" onClick={() => setStep(0)} disabled={!!busy}>{t("Go back")}</button>
                  <button className="primary" type="button" onClick={upload} disabled={!files.length || !!busy}>Next: Claude’s suggestion</button>
                </div>
              </div>
            )}

            {step === 2 && tpl && (
              <div className="wizard-card">
                {tpl.photos > 0 && (
                  <ul className="photo-grid small">
                    {Array.from({ length: tpl.photos }, (_, i) => <li key={i}><img src={templatePhotoUrl(tpl.id, i)} alt={`Photo ${i + 1}`} /><span>Photo {i + 1}</span></li>)}
                  </ul>
                )}
                {busy && <p className="loading" role="status">{busy}</p>}
                {!busy && suggestion && !chat && (
                  <>
                    {suggestion.seen && <><h3>What Claude saw</h3><p className="says">{suggestion.seen}</p></>}
                    {suggestion.notes && <><h3>Worth checking</h3><p className="says">{suggestion.notes}</p></>}
                    <Summary kind={tpl.kind} answer={suggestion} />
                    {(() => {
                      const found = answerProblems(tpl.kind, suggestion) as string[];
                      if (!found.length) return null;
                      return (
                        <div className="checks" role="status">
                          <h3>Check these</h3>
                          <ul>{found.map(m => <li key={m}>{m}</li>)}</ul>
                          <button type="button" onClick={() => setNotes(n => (n.trim() ? n.trim() + " " : "") + "Fix this from the last try: " + found.join(" "))}>Add them to the notes for another try</button>
                        </div>
                      );
                    })()}
                    <label className="stack">Notes for another try (optional)
                      <textarea rows={2} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} placeholder="The barn is 40 m long; photo 2 is the back." />
                    </label>
                    <div className="wizard-nav">
                      {apiOn && <button type="button" onClick={() => ask(tpl)}>Ask again</button>}
                      <button type="button" onClick={() => setChat(true)}>{apiOn ? "Try in a chat instead" : "Paste another answer"}</button>
                      <button className="primary" type="button" onClick={() => adjust(applyAnswer(tpl.kind, suggestion) as Record<string, unknown>)}>Adjust in the editor</button>
                    </div>
                  </>
                )}
                {!busy && (!suggestion || chat) && (
                  <>
                    <p className="hint">Let Claude read the photos and suggest the settings, one of two ways:</p>
                    <div className="ways">
                      <section className="way">
                        <h3>Ask Claude here</h3>
                        <p className="hint">The server sends the photos to Claude and fills in the answer. It uses the Anthropic API, paid per use (about $0.10 to $0.30 a try).</p>
                        {apiOn
                          ? <button className="primary" type="button" onClick={() => ask(tpl)}>Ask Claude</button>
                          : <p className="hint"><b>Not set up:</b> {apiOn === null ? "checking…" : "the server needs an ANTHROPIC_API_KEY. Use a chat instead."}</p>}
                      </section>
                      <section className="way">
                        <h3>Use Claude in a chat</h3>
                        <p className="hint">Included in your Claude subscription. Copy a prompt to claude.ai and paste the answer back.</p>
                        <ol className="chat-steps">
                          <li><button type="button" onClick={copyPrompt}>{copied ? "Copied ✓" : "Copy the prompt"}</button></li>
                          <li>Start a new chat at claude.ai, paste the prompt and attach the same photos{tpl.photos ? ` (${tpl.photos})` : ""}.</li>
                          <li>Copy Claude’s whole answer (the code block) and paste it here:
                            <textarea rows={5} value={pasted} onChange={e => setPasted(e.target.value)} placeholder={"```json\n{ \"seen\": \"...\", \"settings\": { ... }, \"openings\": [ ... ], \"notes\": \"...\" }\n```"} aria-label="Claude’s answer" />
                          </li>
                        </ol>
                        <button className="primary" type="button" onClick={usePasted} disabled={!pasted.trim()}>Use this answer</button>
                      </section>
                    </div>
                    {suggestion && <div className="wizard-nav left"><button type="button" onClick={() => setChat(false)}>Back to the last answer</button></div>}
                    {presets.length > 0 && (
                      <>
                        <p className="hint">Or skip Claude and start from one of the designs, matching the photos by hand:</p>
                        <div className="wizard-nav left">
                          {presets.map(x => <button key={x.id} type="button" onClick={() => adjust(sanitize(x.settings) as Record<string, unknown>)}>{x.name}</button>)}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
            {error && <p className="error" role="alert">{error}</p>}
          </>
        )}
      </main>
    </>
  );
}

/** A select setting's name for its value, as the editor shows it. */
const named = (k: string, v: unknown) =>
  ((FIELD as Record<string, { options?: [string, string][] }>)[k]?.options?.find(o => o[0] === v)?.[1] ?? String(v)).toLowerCase();

/** The main things Claude chose, so the admin sees at a glance whether it got the building right. */
function Summary({ kind, answer }: { kind: string; answer: unknown }) {
  const p = applyAnswer(kind, answer) as Record<string, unknown> & { windows: { type: string }[] };
  const doors = p.windows.filter(w => w.type === "door").length;
  const wings = liveWings(p) as { id: number; wall: string; ww: number; wd: number; floors: number }[];
  const own = (id: number) => { const w = ((p.wings as Record<string, unknown>[]) || []).find(x => x.id === id) || {}; return [["wallCladding", "wallColor"].some(k => w[k]) ? "walls" : "", ["roofMaterial", "roofColor"].some(k => w[k]) ? "roof" : "", w.trimColor ? "trim" : ""].filter(Boolean); };
  const rows: [string, string][] = [
    ["Shape", wings.length ? `${wings.length} wing${wings.length > 1 ? "s" : ""}: ${wings.map(w => `${partName(p, w.id)} ${w.ww.toFixed(1)} × ${w.wd.toFixed(1)} m on ${wallLabel(p, w.wall).toLowerCase()}${w.floors < (p.floors as number) ? " (lower)" : ""}${own(w.id).length ? ` (own ${own(w.id).join(", ")})` : ""}`).join("; ")}` : "rectangle"],
    ["Size", `${p.width} × ${p.depth} m, ${p.floors} floor${p.floors === 1 ? "" : "s"} of ${p.floorHeight} m${p.halfStorey ? " and a half floor" : ""}`],
    ["Roof", `${named("roofType", p.roofType)}, ${p.roofPitch}°, ${named("roofMaterial", p.roofMaterial)}`],
    ["Walls", p.wallSplit === "one" ? named("wallCladding", p.wallCladding) : `${named("lowerCladding", p.lowerCladding)} below, ${named("wallCladding", p.wallCladding)} above`],
    ["Openings", `${p.windows.length - doors} windows, ${doors} door${doors === 1 ? "" : "s"}`],
  ];
  const colors = ["wallColor", "trimColor", "roofColor", "doorColor", "foundationColor"].map(k => p[k] as string);
  return (
    <dl className="summary">
      {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      <div><dt>Colours</dt><dd>{colors.map((c, i) => <span key={i} className="swatch" style={{ background: c }} title={c} />)}</dd></div>
    </dl>
  );
}
