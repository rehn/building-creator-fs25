"use client";
// Mods (docs/PLAN_MOD.md step 3): a mod is a container of buildings and props. This is the list of them; one mod's page is /mods/[id].
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type Mod } from "@/lib/api";
import { useUser } from "@/lib/useUser";
import { TopBar } from "@/components/TopBar";
import { t } from "@/i18n/index.mjs";
import { confirmDialog, promptDialog } from "@/components/dialog.mjs";

export default function ModsPage() {
  const { user, error: userError } = useUser();
  const [mods, setMods] = useState<Mod[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (user) api.mods().then(setMods).catch(e => setError(e.message)); }, [user]);

  async function create() {
    const name = await promptDialog(t("Name"), "", { title: t("New mod"), confirm: t("Create"), maxLength: 100 });
    if (!name?.trim()) return;
    setBusy(true); setError("");
    try { const m = await api.createMod(name.trim()); setMods(list => [m, ...(list ?? [])]); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function rename(m: Mod) {
    const name = await promptDialog(t("Name"), m.name, { title: t("Rename"), confirm: t("Rename"), maxLength: 100 });
    if (!name?.trim() || name.trim() === m.name) return;
    setBusy(true); setError("");
    try { const made = await api.updateMod(m.id, { name: name.trim() }); setMods(list => (list ?? []).map(x => x.id === made.id ? made : x)); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function remove(m: Mod) {
    if (!await confirmDialog(t("Delete the mod “{name}”? The buildings and props in it stay.", { name: m.name }), { title: t("Delete"), confirm: t("Delete"), danger: true })) return;
    setBusy(true); setError("");
    try { await api.deleteMod(m.id); setMods(list => (list ?? []).filter(x => x.id !== m.id)); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <TopBar user={user} />
      <main className="page">
        <div className="page-head">
          <h2>Mods</h2>
          <button className="primary" type="button" onClick={create} disabled={!user || busy}>New mod</button>
        </div>
        <p className="hint">A mod holds buildings and props. Make one here and add what should be in it. The mod follows them when you change them.</p>
        {(error || userError) && <p className="error" role="alert">{error || userError}</p>}
        {!mods && !error && !userError && <p className="loading">Loading your mods…</p>}
        {mods && mods.length === 0 && (
          <div className="empty">
            <h3>No mods yet</h3>
            <p className="hint">Make a mod, then add the buildings and props that belong together.</p>
          </div>
        )}
        {mods && mods.length > 0 && (
          <div className="grid">
            {mods.map(m => (
              <article className="house" key={m.id}>
                <Link className="thumb" href={`/mods/${m.id}`} aria-label={m.name} translate="no"><div className="none">{t("No preview yet")}</div></Link>
                <div className="info">
                  <Link className="name" href={`/mods/${m.id}`} translate="no">{m.name}</Link>
                  <small>{t("Buildings and props: {count}", { count: m.itemCount })}</small>
                  <div className="actions">
                    <Link className="btn" href={`/mods/${m.id}`}>Open</Link>
                    <button type="button" onClick={() => rename(m)} disabled={busy}>Rename</button>
                    <button type="button" className="danger" onClick={() => remove(m)} disabled={busy}>Delete</button>
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
