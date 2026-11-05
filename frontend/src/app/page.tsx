"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, type ProjectSummary, type Template } from "@/lib/api";
import { useUser } from "@/lib/useUser";
import { TopBar } from "@/components/TopBar";
import { PRESETS, CATEGORIES, KINDS, groupByKind } from "@/editor/model.mjs";

// A built-in design or a template the admin published (with its preview).
type Preset = { id: string; name: string; blurb: string; kind: string; category: string; settings: Record<string, unknown>; thumbnail?: string };
type Kind = { id: string; name: string; plural: string; category: string };
type Group<T> = { kind: Kind; items: T[] };
const presets = PRESETS as Preset[];
const byKind = groupByKind as <T>(list: T[], idOf: (x: T) => string | undefined) => Group<T>[];
// Groups with nothing to build yet, named under the templates.
const comingSoon = (CATEGORIES as { id: string; name: string }[])
  .filter(c => !(KINDS as Kind[]).some(k => k.category === c.id)).map(c => c.name);

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function edited(iso: string) {
  const s = (new Date(iso).getTime() - Date.now()) / 1000;
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [[60, "second"], [60, "minute"], [24, "hour"], [7, "day"], [4.35, "week"], [12, "month"], [Infinity, "year"]];
  let v = s;
  for (const [size, unit] of steps) {
    if (Math.abs(v) < size) return "Edited " + rtf.format(Math.round(v), unit);
    v /= size;
  }
  return "";
}

export default function HousesPage() {
  const router = useRouter();
  const { user, error: userError } = useUser();
  const [houses, setHouses] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // "New" is open: the templates, grouped by kind of building.
  const [choosing, setChoosing] = useState(false);
  const [templates, setTemplates] = useState<Preset[]>([]);

  useEffect(() => {
    if (!user) return;
    api.projects().then(setHouses).catch(e => setError(e.message));
    // templates are extras: "New" works without them
    api.templates().then(list => setTemplates(list.map((t: Template) => ({
      id: "template:" + t.id, name: t.name, blurb: t.blurb, kind: t.kind, category: "", settings: t.settings, thumbnail: t.thumbnail,
    })))).catch(() => setTemplates([]));
  }, [user]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    setBusy(false);
  }

  // A preset is the settings the new project starts with; everything stays editable.
  const presetGroups = byKind([...presets, ...templates], x => x.kind);
  const create = (preset: Preset) => run(async () => {
    const p = await api.createProject(preset.id === "farmhouse" ? "New house" : preset.name, preset.settings);
    router.push(`/projects/${p.id}`);
  });
  const chooser = (
    <section className="presets" aria-label="New">
      <div className="presets-head">
        <h3>What do you want to build?</h3>
        <button type="button" onClick={() => setChoosing(false)}>Cancel</button>
      </div>
      {presetGroups.map(g => (
        <div className="kind-group" key={g.kind.id}>
          <h4>{g.kind.plural}</h4>
          <div className="grid">
            {g.items.map(x => (
              <button type="button" className="preset" key={x.id} onClick={() => create(x)} disabled={busy}>
                {x.thumbnail && <img src={x.thumbnail} alt="" />}
                <b>{x.name}</b>
                <span>{x.blurb}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {comingSoon.length > 0 && <p className="hint">Coming soon: {comingSoon.join(", ").toLowerCase()}.</p>}
    </section>
  );
  // Duplicates come back with their data, not the list's kind.
  const kindOfHouse = (h: ProjectSummary) => h.kind ?? (("data" in h ? (h as { data: { kind?: unknown } }).data.kind : "") as string);
  const duplicate = (h: ProjectSummary) => run(async () => {
    const p = await api.duplicateProject(h.id);
    setHouses(list => [p, ...(list ?? [])]);
  });
  const rename = (h: ProjectSummary) => {
    const name = window.prompt("New name", h.name)?.trim();
    if (!name || name === h.name) return;
    run(async () => {
      const p = await api.updateProject(h.id, { name });
      setHouses(list => (list ?? []).map(x => (x.id === p.id ? p : x)));
    });
  };
  const remove = (h: ProjectSummary) => {
    if (!window.confirm(`Delete \u201C${h.name}\u201D? This can\u2019t be undone.`)) return;
    run(async () => {
      await api.deleteProject(h.id);
      setHouses(list => (list ?? []).filter(x => x.id !== h.id));
    });
  };

  return (
    <>
      <TopBar user={user} />
      <main className="page">
        <div className="page-head">
          <h2>My buildings</h2>
          <button className="primary" type="button" onClick={() => setChoosing(true)} disabled={!user || busy} aria-expanded={choosing}>New</button>
        </div>
        {(error || userError) && <p className="error" role="alert">{error || userError}</p>}
        {choosing && chooser}
        {!houses && !error && !userError && <p className="loading">Loading your buildings…</p>}
        {houses && houses.length === 0 && !choosing && (
          <div className="empty">
            <h3>Nothing built yet</h3>
            <p className="hint">Start from a farmhouse, a hen house or a cow barn, set its size, roof, windows and colors, and export it for Giants Editor or as a game mod.</p>
            <button className="primary" type="button" onClick={() => setChoosing(true)} disabled={busy}>Build your first building</button>
          </div>
        )}
        {houses && houses.length > 0 && byKind(houses, kindOfHouse).map(g => (
          <section className="kind-group" key={g.kind.id} aria-label={g.kind.plural}>
            <h3>{g.kind.plural} <small>{g.items.length}</small></h3>
            <div className="grid">
              {g.items.map(h => (
                <article className="house" key={h.id}>
                  <Link className="thumb" href={`/projects/${h.id}`} aria-label={`Open ${h.name}`}>
                    {h.thumbnail
                      ? <img src={h.thumbnail} alt="" />
                      : <span className="none">No preview yet</span>}
                  </Link>
                  <div className="info">
                    <Link className="name" href={`/projects/${h.id}`}>{h.name}</Link>
                    <small>{edited(h.updatedAt)}</small>
                    <div className="actions">
                      <button type="button" onClick={() => rename(h)} disabled={busy}>Rename</button>
                      <button type="button" onClick={() => duplicate(h)} disabled={busy}>Duplicate</button>
                      <button type="button" className="danger" onClick={() => remove(h)} disabled={busy}>Delete</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </main>
    </>
  );
}
