"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, type ProjectSummary } from "@/lib/api";
import { useUser } from "@/lib/useUser";
import { TopBar } from "@/components/TopBar";

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

  const create = () => run(async () => {
    const p = await api.createProject("New house");
    router.push(`/projects/${p.id}`);
  });
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
          <h2>My houses</h2>
          <button className="primary" type="button" onClick={create} disabled={!user || busy}>New house</button>
        </div>
        {(error || userError) && <p className="error" role="alert">{error || userError}</p>}
        {!houses && !error && !userError && <p className="loading">Loading your houses…</p>}
        {houses && houses.length === 0 && (
          <div className="empty">
            <h3>No houses yet</h3>
            <p className="hint">Start one, set its size, roof, windows and colors, and export it for Giants Editor.</p>
            <button className="primary" type="button" onClick={create} disabled={busy}>Build your first house</button>
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
