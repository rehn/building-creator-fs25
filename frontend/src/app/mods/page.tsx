"use client";
// Mods (docs/PLAN_MOD.md step 3): a mod is a container of buildings and props. This is the list of them; one mod's page is /mods/[id].
// The folders are the app's own, the same as the buildings' (docs/DESIGN.md): tabs to show one, a select on each card to move a mod.
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type Mod } from "@/lib/api";
import { useUser } from "@/lib/useUser";
import { useFolders } from "@/lib/useFolders";
import { TopBar } from "@/components/TopBar";
import { FolderSelect, askFolderName } from "@/components/FolderSelect";
import { FolderActions } from "@/components/FolderActions";
import { t } from "@/i18n/index.mjs";
import { confirmDialog, promptDialog } from "@/components/dialog.mjs";

export default function ModsPage() {
  const { user, error: userError } = useUser();
  const [mods, setMods] = useState<Mod[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // the folder shown: "*" all, "" the mods in none, or a folder's name
  const [folderSel, setFolderSel] = useState("*");
  const folderOf = (m: Mod) => m.folder ?? "";
  const appFolders = useFolders(!!user, (mods ?? []).map(folderOf));
  const folders = appFolders.names;

  useEffect(() => { if (user) api.mods().then(setMods).catch(e => setError(e.message)); }, [user]);

  async function create() {
    const name = await promptDialog(t("Name"), "", { title: t("New mod"), confirm: t("Create"), maxLength: 100 });
    if (!name?.trim()) return;
    setBusy(true); setError("");
    try {
      let m = await api.createMod(name.trim());
      // (made while a folder is shown: it is put in it)
      if (folderSel !== "*" && folderSel !== "") m = await api.updateMod(m.id, { folder: folderSel, version: m.version });
      setMods(list => [m, ...(list ?? [])]);
    }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function rename(m: Mod) {
    const name = await promptDialog(t("Name"), m.name, { title: t("Rename"), confirm: t("Rename"), maxLength: 100 });
    if (!name?.trim() || name.trim() === m.name) return;
    setBusy(true); setError("");
    try { const made = await api.updateMod(m.id, { name: name.trim() }); setMods(list => (list ?? []).map(x => x.id === made.id ? made : x)); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function move(m: Mod, folder: string) {
    setBusy(true); setError("");
    try { const made = await api.updateMod(m.id, { folder, version: m.version }); setMods(list => (list ?? []).map(x => x.id === made.id ? { ...x, folder: made.folder, version: made.version, updatedAt: made.updatedAt } : x)); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function remove(m: Mod) {
    if (!await confirmDialog(t("Delete the mod “{name}”? The buildings and props in it stay.", { name: m.name }), { title: t("Delete"), confirm: t("Delete"), danger: true })) return;
    setBusy(true); setError("");
    try { await api.deleteMod(m.id); setMods(list => (list ?? []).filter(x => x.id !== m.id)); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const hasLoose = (mods ?? []).some(m => !folderOf(m));
  const folderNow = folderSel === "*" || (folderSel === "" ? hasLoose && folders.length > 0 : folders.includes(folderSel)) ? folderSel : "*";
  const shown = (mods ?? []).filter(m => folderNow === "*" || folderOf(m) === folderNow);
  const tab = (key: string, label: string, count: number, on: boolean, set: () => void, noTranslate = false) => (
    <button type="button" role="tab" key={key} className={"starttab" + (on ? " on" : "")} aria-selected={on} onClick={set}>
      <span translate={noTranslate ? "no" : undefined}>{label}</span> <small>{count}</small>
    </button>
  );

  return (
    <>
      <TopBar user={user} />
      <main className="page">
        <div className="page-head">
          <h2>Mods</h2>
          <button className="primary" type="button" onClick={create} disabled={!user || busy}>New mod</button>
        </div>
        <p className="hint">A mod holds buildings and props. Make one here and add what should be in it. The mod follows them when you change them.</p>
        {mods && mods.length > 0 && folders.length > 0 && (
          <div className="starttabs sub" role="tablist" aria-label={t("Folders")}>
            {tab("*", t("All folders"), mods.length, folderNow === "*", () => setFolderSel("*"))}
            {folders.map(f => tab("f:" + f, f, mods.filter(m => folderOf(m) === f).length, folderNow === f, () => setFolderSel(f), true))}
            {hasLoose && tab("", t("Not in a folder"), mods.filter(m => !folderOf(m)).length, folderNow === "", () => setFolderSel(""))}
            <button type="button" className="starttab link" onClick={async () => { const name = await askFolderName(); if (!name) return; try { await appFolders.add(name); setFolderSel(name); } catch (e) { setError((e as Error).message); } }}>{t("New folder…")}</button>
            {folderNow !== "*" && folderNow !== "" && (
              <FolderActions folder={folderNow} disabled={busy} onError={setError}
                onRename={async to => { const from = folderNow; await appFolders.rename(from, to); setMods(l => (l ?? []).map(m => (folderOf(m) === from ? { ...m, folder: to } : m))); setFolderSel(to); }}
                onDelete={async () => { const from = folderNow; await appFolders.remove(from); setMods(l => (l ?? []).map(m => (folderOf(m) === from ? { ...m, folder: "" } : m))); setFolderSel("*"); }} />
            )}
          </div>
        )}
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
            {shown.map(m => (
              <article className="house" key={m.id}>
                <Link className="thumb" href={`/mods/${m.id}`} aria-label={m.name} translate="no">{m.thumbnail ? <img src={m.thumbnail} alt="" /> : <div className="none">{t("No preview yet")}</div>}</Link>
                <div className="info">
                  <Link className="name" href={`/mods/${m.id}`} translate="no">{m.name}</Link>
                  <small>{t("Buildings and props: {count}", { count: m.itemCount })}</small>
                  <div className="actions">
                    <Link className="btn" href={`/mods/${m.id}`}>Open</Link>
                    <button type="button" onClick={() => rename(m)} disabled={busy}>Rename</button>
                    <button type="button" className="danger" onClick={() => remove(m)} disabled={busy}>Delete</button>
                  </div>
                  <FolderSelect className="move" value={folderOf(m)} folders={folders} onChoose={f => move(m, f)} onCreate={appFolders.add} disabled={busy} label={t("Move {name} to a folder", { name: m.name })} />
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
