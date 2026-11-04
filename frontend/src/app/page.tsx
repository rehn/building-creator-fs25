"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, type ProjectSummary } from "@/lib/api";
import { useUser } from "@/lib/useUser";
import { TopBar } from "@/components/TopBar";
import { PRESETS, CATEGORIES } from "@/editor/model.mjs";

type Preset = { id: string; name: string; blurb: string; category: string; settings: Record<string, unknown> };
type Category = { id: string; name: string; blurb: string };
const presets = PRESETS as Preset[];
const categories = CATEGORIES as Category[];

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
  // "New": null = closed, "" = choosing a category, else the category whose presets are shown.
  const [choosing, setChoosing] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    api.projects().then(setHouses).catch(e => setError(e.message));
  }, [user]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    setBusy(false);
  }

  // A preset is the settings the new project starts with; everything stays editable.
  const create = (preset: Preset) => run(async () => {
    const p = await api.createProject(preset.id === "farmhouse" ? "New house" : preset.name, preset.settings);
    router.push(`/projects/${p.id}`);
  });
  const category = categories.find(c => c.id === choosing);
  const chooser = (
    <section className="presets" aria-label="New">
      <div className="presets-head">
        <h3>{category ? category.name : "What do you want to build?"}</h3>
        {category && <button type="button" onClick={() => setChoosing("")}>Back</button>}
        <button type="button" onClick={() => setChoosing(null)}>Cancel</button>
      </div>
      <div className="grid">
        {category
          ? presets.filter(x => x.category === category.id).map(x => (
            <button type="button" className="preset" key={x.id} onClick={() => create(x)} disabled={busy}>
              <b>{x.name}</b>
              <span>{x.blurb}</span>
            </button>
          ))
          : categories.map(c => {
            const n = presets.filter(x => x.category === c.id).length;
            return (
              <button type="button" className="preset" key={c.id} onClick={() => setChoosing(c.id)} disabled={busy || !n}>
                <b>{c.name}</b>
                <span>{n ? c.blurb : "Coming soon"}</span>
              </button>
            );
          })}
      </div>
    </section>
  );
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
          <button className="primary" type="button" onClick={() => setChoosing("")} disabled={!user || busy} aria-expanded={choosing !== null}>New</button>
        </div>
        {(error || userError) && <p className="error" role="alert">{error || userError}</p>}
        {choosing !== null && chooser}
        {!houses && !error && !userError && <p className="loading">Loading your buildings…</p>}
        {houses && houses.length === 0 && choosing === null && (
          <div className="empty">
            <h3>Nothing built yet</h3>
            <p className="hint">Start from a farmhouse or a hen house, set its size, roof, windows and colors, and export it for Giants Editor or as a game mod.</p>
            <button className="primary" type="button" onClick={() => setChoosing("")} disabled={busy}>Build your first building</button>
          </div>
        )}
        {houses && houses.length > 0 && (
          <div className="grid">
            {houses.map(h => (
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
        )}
      </main>
    </>
  );
}
