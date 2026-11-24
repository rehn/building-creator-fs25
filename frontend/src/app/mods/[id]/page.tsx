"use client";
// One mod (docs/PLAN_MOD.md step 3): the buildings and props in it. Each change is saved at once; the server gives each post its id and its
// name (the mod follows the building), and a post whose building was deleted is marked and stays until it is taken out.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type Mod, type ModPost, type ProjectSummary } from "@/lib/api";
import { useUser } from "@/lib/useUser";
import { TopBar } from "@/components/TopBar";
import { t } from "@/i18n/index.mjs";
import { KINDS } from "@/editor/model.mjs";
import { confirmDialog, promptDialog } from "@/components/dialog.mjs";
import { addPost, removePost, setPostType, countsOf, choices, payload } from "@/lib/mods.mjs";

type Tab = "building" | "prop";
type Kind = { id: string; name: string };
const TYPES = KINDS as Kind[];

export default function ModPage() {
  const { id } = useParams<{ id: string }>();
  const { user, error: userError } = useUser();
  const [mod, setMod] = useState<Mod | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [tab, setTab] = useState<Tab>("building");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([api.mod(id), api.projects()]).then(([m, list]) => { setMod(m); setProjects(list); }).catch(e => setError(e.message));
  }, [user, id]);

  /** Saves a change of the list (the answer has the ids and names); a change made somewhere else is not overwritten. */
  async function save(items: ModPost[]) {
    if (!mod) return;
    setBusy(true); setError("");
    try { setMod(await api.updateMod(mod.id, { items: payload(items), version: mod.version })); }
    catch (e) {
      setError((e as Error).message);
      api.mod(mod.id).then(setMod).catch(() => {}); // (what is saved now)
    } finally { setBusy(false); }
  }

  async function rename() {
    if (!mod) return;
    const name = await promptDialog(t("Name"), mod.name, { title: t("Rename"), confirm: t("Rename"), maxLength: 100 });
    if (!name?.trim() || name.trim() === mod.name) return;
    setBusy(true); setError("");
    try { setMod(await api.updateMod(mod.id, { name: name.trim(), version: mod.version })); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function remove() {
    if (!mod) return;
    if (!await confirmDialog(t("Delete the mod “{name}”? The buildings and props in it stay.", { name: mod.name }), { title: t("Delete"), confirm: t("Delete"), danger: true })) return;
    setBusy(true); setError("");
    try { await api.deleteMod(mod.id); window.location.href = "/mods"; }
    catch (e) { setError((e as Error).message); setBusy(false); }
  }

  const items = mod?.items ?? [];
  const n = countsOf(items);
  const shown = items.filter(p => p.kind === tab);
  const open = (p: ModPost) => (p.kind === "prop" ? `/builder/${p.ref}` : `/projects/${p.ref}`);
  const tabBtn = (k: Tab, label: string, count: number) => (
    <button type="button" role="tab" className={"starttab" + (tab === k ? " on" : "")} aria-selected={tab === k} onClick={() => { setTab(k); setAdding(false); }}>{label} <small>{count}</small></button>
  );
  const options: ProjectSummary[] = mod ? choices(projects, items, tab) : [];

  return (
    <>
      <TopBar user={user} />
      <main className="page">
        <div className="page-head">
          <h2 translate="no">{mod ? mod.name : t("Mod")}</h2>
          {mod && !adding && <button type="button" onClick={rename} disabled={busy}>Rename</button>}
          {mod && !adding && <button type="button" className="danger" onClick={remove} disabled={busy}>Delete</button>}
          {mod && !adding && <button type="button" className="primary" onClick={() => setAdding(true)} disabled={busy}>{tab === "prop" ? t("Add props") : t("Add buildings")}</button>}
          {mod && adding && <button type="button" onClick={() => setAdding(false)}>Done</button>}
        </div>
        <p className="hint"><Link href="/mods">{t("All mods")}</Link></p>
        {(error || userError) && <p className="error" role="alert">{error || userError}</p>}
        {!mod && !error && !userError && <p className="loading">Loading the mod…</p>}
        {mod && (
          <div className="starttabs" role="tablist" aria-label={t("What to show")}>
            {tabBtn("building", t("Buildings"), n.building)}
            {tabBtn("prop", t("Props"), n.prop)}
          </div>
        )}
        {mod && adding && (
          options.length === 0
            ? <div className="empty"><h3>{tab === "prop" ? t("No props to add") : t("No buildings to add")}</h3><p className="hint">{tab === "prop" ? t("Every prop you have is in this mod already, or you have none yet. Props are made in the modeller, from My buildings.") : t("Every building you have is in this mod already, or you have none yet.")}</p></div>
            : <ul className="item-list">
              {options.map(h => (
                <li key={h.id}>
                  <div><b translate="no">{h.name}</b></div>
                  <div className="actions"><button type="button" onClick={() => save(addPost(items, tab, h.id))} disabled={busy}>Add</button></div>
                </li>
              ))}
            </ul>
        )}
        {mod && !adding && shown.length === 0 && (
          <div className="empty">
            <h3>{tab === "prop" ? t("No props in this mod yet") : t("No buildings in this mod yet")}</h3>
            <p className="hint">{tab === "prop" ? t("A prop stands on its own in the mod. Add one with the button above.") : t("Add a building with the button above. The mod follows it when you change it.")}</p>
          </div>
        )}
        {mod && !adding && shown.length > 0 && (
          <ul className="item-list">
            {shown.map(p => (
              <li key={p.id}>
                <div>
                  <b translate="no">{p.missing ? t("Deleted") : p.name}</b>
                  {p.missing && <small>{t("What this was made from is gone. Take it out of the mod.")}</small>}
                </div>
                {p.kind === "building" && !p.missing && (
                  <label className="stack">{t("Mod type")}
                    <select value={p.type} onChange={e => save(setPostType(items, p.id, e.target.value))} disabled={busy}>
                      <option value="">{t("As the building is")}</option>
                      {TYPES.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                    </select>
                  </label>
                )}
                <div className="actions">
                  {!p.missing && <Link className="btn" href={open(p)}>Open</Link>}
                  <button type="button" className="danger" onClick={() => save(removePost(items, p.id))} disabled={busy}>Take out</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
