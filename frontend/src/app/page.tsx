"use client";
import { t, getLang } from "@/i18n/index.mjs";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, type ProjectSummary, type Template } from "@/lib/api";
import { useUser } from "@/lib/useUser";
import { TopBar } from "@/components/TopBar";
import { confirmDialog, promptDialog } from "@/components/dialog.mjs";
import { sanitize as newProp } from "@/builder/model.mjs";
import { PRESETS, CATEGORIES, KINDS, groupByKind, modName, slugify, authorName, modDescXmlMulti } from "@/editor/model.mjs";

// A built-in design or a template the admin published (with its preview).
type Preset = { id: string; name: string; blurb: string; kind: string; category: string; settings: Record<string, unknown>; thumbnail?: string };
type Kind = { id: string; name: string; plural: string; category: string };
type Group<T> = { kind: Kind; items: T[] };
const presets = PRESETS as Preset[];
const byKind = groupByKind as <T>(list: T[], idOf: (x: T) => string | undefined) => Group<T>[];
// Groups with nothing to build yet, named under the templates.
const comingSoon = (CATEGORIES as { id: string; name: string }[])
  .filter(c => !(KINDS as Kind[]).some(k => k.category === c.id)).map(c => c.name);

const rtfFor = () => new Intl.RelativeTimeFormat(getLang(), { numeric: "auto" });
function edited(iso: string) {
  const s = (new Date(iso).getTime() - Date.now()) / 1000;
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [[60, "second"], [60, "minute"], [24, "hour"], [7, "day"], [4.35, "week"], [12, "month"], [Infinity, "year"]];
  let v = s;
  for (const [size, unit] of steps) {
    if (Math.abs(v) < size) return t("Edited {when}", { when: rtfFor().format(Math.round(v), unit) });
    v /= size;
  }
  return "";
}

/**
 * Pictures of the starting points in "New": made in the browser by an editor that is out of sight (the same picture a saved building gets),
 * one preset at a time, and kept in localStorage until the preset or this version of the pictures changes.
 */
const THUMB_KEY = "hx-preset-thumbs", THUMB_VERSION = "2";
const hashOf = (settings: unknown) => { const t = THUMB_VERSION + JSON.stringify(settings); let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return String(h); };
const FOLDED_KEY = "hx-folded-groups";
const loadThumbs = (): Record<string, { h: string; url: string }> => { try { return JSON.parse(localStorage.getItem(THUMB_KEY) || "{}"); } catch { return {}; } };
const saveThumbs = (c: Record<string, { h: string; url: string }>) => { try { localStorage.setItem(THUMB_KEY, JSON.stringify(c)); } catch { /* full or blocked: the pictures are made again next time */ } };

export default function HousesPage() {
  const router = useRouter();
  const { user, error: userError } = useUser();
  const [houses, setHouses] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // "New" is open: the templates, grouped by kind of building.
  const [choosing, setChoosing] = useState(false);
  const [templates, setTemplates] = useState<Preset[]>([]);
  // the pictures of the starting points (by id), and whether some are still being made
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [making, setMaking] = useState(false);
  // buildings ticked to be packed together into one game mod, its title, and how far the packing is
  const [picked, setPicked] = useState<string[]>([]);
  // Folders and kinds that are folded up, remembered in this browser ("f:<folder>", "k:<folder>:<kind>").
  const [folded, setFolded] = useState<string[]>([]);
  useEffect(() => { try { setFolded(JSON.parse(localStorage.getItem(FOLDED_KEY) || "[]")); } catch { /* blocked: everything starts open */ } }, []);
  const fold = (key: string) => setFolded(list => {
    const next = list.includes(key) ? list.filter(k => k !== key) : [...list, key];
    try { localStorage.setItem(FOLDED_KEY, JSON.stringify(next)); } catch { /* the fold just isn't remembered */ }
    return next;
  });
  const foldButton = (key: string) => (
    <button type="button" className="fold" onClick={() => fold(key)} aria-expanded={!folded.includes(key)} title={t(folded.includes(key) ? "Expand" : "Collapse")} aria-label={t(folded.includes(key) ? "Expand" : "Collapse")}>
      <span aria-hidden="true">{folded.includes(key) ? "\u25B6" : "\u25BC"}</span>
    </button>
  );
  // The tabs of the list: buildings or props (the modeller's), the folder and the kind of building chosen ("*" = all), and the kind chosen in "New".
  const [tab, setTab] = useState<"buildings" | "props">("buildings");
  const [folderSel, setFolderSel] = useState("*");
  const [kindSel, setKindSel] = useState("*");
  const [newType, setNewType] = useState("");
  const [modTitle, setModTitle] = useState("My buildings");
  const [packing, setPacking] = useState<{ done: number; total: number; name: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    api.projects().then(setHouses).catch(e => setError(e.message));
    // templates are extras: "New" works without them
    api.templates().then(list => setTemplates(list.map((t: Template) => ({
      id: "template:" + t.id, name: t.name, blurb: t.blurb, kind: t.kind, category: "", settings: t.settings, thumbnail: t.thumbnail,
    })))).catch(() => setTemplates([]));
  }, [user]);

  useEffect(() => {
    if (!choosing) return;
    let stop = false, host: HTMLDivElement | null = null, ed: { setSettings(s: Record<string, unknown>): void; snapshot(): string | null; destroy(): void } | null = null;
    (async () => {
      const cache = loadThumbs(), have: Record<string, string> = {}, todo: Preset[] = [];
      for (const x of presets) { const c = cache[x.id]; if (c && c.h === hashOf(x.settings)) have[x.id] = c.url; else todo.push(x); }
      setThumbs(have);
      if (!todo.length) return;
      setMaking(true);
      try {
        const { createEditor } = await import("@/editor/editor.mjs");
        if (stop) return;
        host = document.createElement("div");
        host.className = "editor-host";
        host.style.cssText = "position:fixed;left:-10000px;top:0;width:2200px;height:800px;visibility:hidden;pointer-events:none";   // (wide: the 3D view is what is left beside the two panels)
        document.body.appendChild(host);
        ed = createEditor(host, { initial: todo[0].settings });
        for (const x of todo) {
          if (stop) break;
          ed.setSettings(x.settings);
          await new Promise(r => setTimeout(r, 1000));   // (the textures are painted a moment after the building is built)
          const url = stop ? null : ed.snapshot();
          if (url) { cache[x.id] = { h: hashOf(x.settings), url }; saveThumbs(cache); setThumbs(t => ({ ...t, [x.id]: url })); }
        }
      } catch { /* no pictures: the cards work without them */ } finally {
        ed?.destroy(); host?.remove();
        if (!stop) setMaking(false);
      }
    })();
    return () => { stop = true; };
  }, [choosing]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    setBusy(false);
  }

  // A preset is the settings the new project starts with; everything stays editable.
  const presetGroups = byKind([...presets, ...templates], x => x.kind);
  const typeNow = newType === "prop" || presetGroups.some(g => g.kind.id === newType) ? newType : (presetGroups[0]?.kind.id ?? "prop");
  const create = (preset: Preset) => run(async () => {
    const p = await api.createProject(preset.id === "farmhouse" ? "New house" : preset.name, preset.settings);
    router.push(`/projects/${p.id}`);
  });
  // A new prop: an empty project of the modeller (docs/PLAN_BUILDER.md), opened on its own page.
  const createProp = () => run(async () => {
    const p = await api.createProject("New prop", newProp({}) as unknown as Record<string, unknown>);
    router.push(`/builder/${p.id}`);
  });
  const chooser = (
    <section className="presets" aria-label="New">
      <div className="presets-head">
        <h3>What do you want to build?</h3>
        <button type="button" onClick={() => setChoosing(false)}>Cancel</button>
      </div>
      <div className="starttabs sub" role="tablist" aria-label={t("Type")}>
        {presetGroups.map(g => (
          <button type="button" role="tab" key={g.kind.id} className={"starttab" + (typeNow === g.kind.id ? " on" : "")} aria-selected={typeNow === g.kind.id} onClick={() => setNewType(g.kind.id)}>
            {g.kind.plural} <small>{g.items.length}</small>
          </button>
        ))}
        <button type="button" role="tab" className={"starttab" + (typeNow === "prop" ? " on" : "")} aria-selected={typeNow === "prop"} onClick={() => setNewType("prop")}>{t("Props")}</button>
      </div>
      {typeNow === "prop"
        ? <div className="grid compact">
            <button type="button" className="preset" onClick={createProp} disabled={busy}>
              <b>{t("Empty prop")}</b>
              <span>{t("A free-form object made of boxes and cylinders: a sign, a bike stand ...")}</span>
            </button>
          </div>
        : presetGroups.filter(g => g.kind.id === typeNow).map(g => (
          <div className="grid compact" key={g.kind.id}>
            {g.items.map(x => (
              <button type="button" className="preset" key={x.id} onClick={() => create(x)} disabled={busy}>
                {(x.thumbnail || thumbs[x.id]) ? <img src={x.thumbnail || thumbs[x.id]} alt="" /> : making && !x.id.startsWith("template:") ? <div className="thumbph" aria-hidden="true" /> : null}
                <b>{x.name}</b>
                <span>{x.blurb}</span>
              </button>
            ))}
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
  const rename = async (h: ProjectSummary) => {
    const name = (await promptDialog(t("New name"), h.name, { title: t("Rename"), confirm: t("Rename"), maxLength: 80 }))?.trim();
    if (!name || name === h.name) return;
    run(async () => {
      const p = await api.updateProject(h.id, { name });
      setHouses(list => (list ?? []).map(x => (x.id === p.id ? p : x)));
    });
  };
  // Folders (a map's name): the buildings are grouped under them when there are any; a building moves with the select on its card.
  const folderOf = (h: ProjectSummary) => h.folder ?? "";
  const folders = [...new Set((houses ?? []).map(folderOf).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const NEW_FOLDER = "\u0000new";
  const move = async (h: ProjectSummary, to: string) => {
    let folder = to;
    if (to === NEW_FOLDER) {
      folder = (await promptDialog(t("Folder name"), "", { title: t("New folder…"), confirm: t("Create"), maxLength: 60 }))?.trim() ?? "";
      if (!folder) return;
    }
    if (folder === folderOf(h)) return;
    run(async () => {
      const p = await api.updateProject(h.id, { folder });
      setHouses(list => (list ?? []).map(x => (x.id === p.id ? { ...x, folder: p.folder, updatedAt: p.updatedAt, version: p.version } : x)));
    });
  };
  const toggle = (id: string) => setPicked(list => (list.includes(id) ? list.filter(x => x !== id) : [...list, id]));
  /**
   * One game mod of the ticked buildings: each is opened in an editor that is not shown (the same code as the editor's own
   * "Export game mod" makes its i3d, textures and pictures), its files go in a folder of its own and the modDesc lists them all.
   */
  const pack = () => run(async () => {
    const ids = picked.filter(id => houses?.some(h => h.id === id));
    if (!ids.length) return;
    const [{ createEditor }, { default: JSZip }] = await Promise.all([import("@/editor/editor.mjs"), import("jszip")]);
    const zip = new JSZip(), entries: { xml: string }[] = [], notes: string[] = [], used = new Set<string>(), types = new Map<string, { name: string; parent: string; specializations: string[] }>();
    let icon: Uint8Array | null = null, author = authorName(user);
    try {
      for (let i = 0; i < ids.length; i++) {
        const h = houses!.find(x => x.id === ids[i])!;
        setPacking({ done: i, total: ids.length, name: h.name });
        const proj = await api.project(h.id);
        let slug = slugify(h.name), n = 2;
        while (used.has(slug)) slug = slugify(h.name) + "_" + n++;
        used.add(slug);
        // an editor that is out of sight but laid out (the renderer needs a size)
        const host = document.createElement("div");
        host.className = "editor-host";
        host.style.cssText = "position:fixed;left:-10000px;top:0;width:900px;height:700px;visibility:hidden;pointer-events:none";
        document.body.appendChild(host);
        const ed = createEditor(host, { initial: proj.data as Record<string, unknown>, author, assets: { list: api.assets, file: api.assetFile } });
        try {
          const info = await ed.exportInto(zip.folder(slug)!, h.name, slug + "/", modName(modTitle));
          for (const ty of info.types) types.set(ty.name, ty);
          entries.push({ xml: slug + "/house.xml" });
          if (!icon && info.icon) icon = info.icon;
          if (info.author && !author) author = info.author;
          notes.push(h.name + (info.description ? ": " + info.description : ""));
        } finally { ed.destroy(); host.remove(); }
      }
      setPacking({ done: ids.length, total: ids.length, name: "" });
      zip.file("modDesc.xml", modDescXmlMulti(entries, { title: modTitle, description: notes.join("\n\n"), author, types: [...types.values()] }));
      if (icon) zip.file("icon.dds", icon);
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = modName(modTitle) + ".zip";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } finally { setPacking(null); }
  });
  const remove = async (h: ProjectSummary) => {
    if (!await confirmDialog(t("Delete \u201C{name}\u201D? This can\u2019t be undone.", { name: h.name }), { title: t("Delete"), confirm: t("Delete"), danger: true })) return;
    run(async () => {
      await api.deleteProject(h.id);
      setHouses(list => (list ?? []).filter(x => x.id !== h.id));
      setPicked(list => list.filter(x => x !== h.id));
    });
  };

  // A prop is a project of the modeller (docs/PLAN_BUILDER.md): its own group, opened on its own page.
  const isProp = (h: ProjectSummary) => kindOfHouse(h) === "prop";
  const openHref = (h: ProjectSummary) => (isProp(h) ? `/builder/${h.id}` : `/projects/${h.id}`);
  const kindGroups = (list: ProjectSummary[]) => [
    ...byKind(list.filter(h => !isProp(h)), kindOfHouse).map(g => ({ id: g.kind.id, title: g.kind.plural, items: g.items })),
    ...(list.some(isProp) ? [{ id: "prop", title: "Props", items: list.filter(isProp) }] : []),
  ];
  const renderGroup = (g: { id: string; title: string; items: ProjectSummary[] }, scope = "") => (
          <section className="kind-group" key={g.id} aria-label={g.title}>
            <h3>{foldButton(`k:${scope}:${g.id}`)}{g.title} <small>{g.items.length}</small>
              {g.items.length > 1 && (
                <button type="button" className="linklike" onClick={() => setPicked(list => g.items.every(h => list.includes(h.id)) ? list.filter(id => !g.items.some(h => h.id === id)) : [...new Set([...list, ...g.items.map(h => h.id)])])} disabled={busy}>
                  {g.items.every(h => picked.includes(h.id)) ? "Select none" : "Select all"}
                </button>
              )}
            </h3>
            {!folded.includes(`k:${scope}:${g.id}`) && <div className="grid">
              {g.items.map(h => (
                <article className="house" key={h.id}>
                  <label className="pick" title="Tick to pack with others into one game mod">
                    <input type="checkbox" checked={picked.includes(h.id)} onChange={() => toggle(h.id)} disabled={busy} aria-label={t("Pack {name} into a game mod", { name: h.name })} />
                  </label>
                  <Link className="thumb" href={openHref(h)} aria-label={t("Open {name}", { name: h.name })}>
                    {h.thumbnail
                      ? <img src={h.thumbnail} alt="" />
                      : <span className="none">No preview yet</span>}
                  </Link>
                  <div className="info">
                    <Link className="name" translate="no" href={openHref(h)}>{h.name}</Link>
                    <small>{edited(h.updatedAt)}</small>
                    <div className="actions">
                      <button type="button" onClick={() => rename(h)} disabled={busy}>Rename</button>
                      <button type="button" onClick={() => duplicate(h)} disabled={busy}>Duplicate</button>
                      <button type="button" className="danger" onClick={() => remove(h)} disabled={busy}>Delete</button>
                    </div>
                    <select className="move" value={folderOf(h)} onChange={e => move(h, e.target.value)} disabled={busy} aria-label={t("Move {name} to a folder", { name: h.name })}>
                      <option value="">{t("No folder")}</option>
                      {folders.map(f => <option key={f} value={f} translate="no">{f}</option>)}
                      <option value={NEW_FOLDER}>{t("New folder\u2026")}</option>
                    </select>
                  </div>
                </article>
              ))}
            </div>}
          </section>
        );

  // What the tabs show: buildings or props, then one folder, then one kind of building (a tab whose list has gone empty falls back to all).
  const inTab = (houses ?? []).filter(h => (tab === "props") === isProp(h));
  const tabFolders = [...new Set(inTab.map(folderOf).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const hasLoose = inTab.some(h => !folderOf(h));
  const folderNow = folderSel === "*" || (folderSel === "" ? hasLoose && tabFolders.length > 0 : tabFolders.includes(folderSel)) ? folderSel : "*";
  const inFolder = inTab.filter(h => folderNow === "*" || folderOf(h) === folderNow);
  const groups = kindGroups(inFolder);
  const kindNow = groups.some(g => g.id === kindSel) ? kindSel : "*";
  const shown = groups.filter(g => kindNow === "*" || g.id === kindNow);
  const visible = shown.flatMap(g => g.items);
  const allVisiblePicked = visible.length > 0 && visible.every(h => picked.includes(h.id));
  const pickVisible = () => setPicked(list => allVisiblePicked ? list.filter(id => !visible.some(h => h.id === id)) : [...new Set([...list, ...visible.map(h => h.id)])]);
  const tabBtn = (key: string, label: string, count: number, on: boolean, set: () => void, noTranslate = false) => (
    <button type="button" role="tab" key={key} className={"starttab" + (on ? " on" : "")} aria-selected={on} onClick={set}>
      <span translate={noTranslate ? "no" : undefined}>{label}</span> <small>{count}</small>
    </button>
  );
  const nBuildings = (houses ?? []).filter(h => !isProp(h)).length, nProps = (houses ?? []).filter(isProp).length;

  return (
    <>
      <TopBar user={user} />
      <main className="page">
        <div className="page-head">
          <h2>{tab === "props" ? t("Props") : t("Buildings")}</h2>
          <div className="head-actions">
            {visible.length > 1 && <button type="button" onClick={pickVisible} disabled={busy}>{allVisiblePicked ? "Select none" : "Select all"}</button>}
            <button className="primary" type="button" onClick={() => { if (tab === "props") setNewType("prop"); setChoosing(true); }} disabled={!user || busy} aria-expanded={choosing}>New</button>
          </div>
        </div>
        {!choosing && houses && houses.length > 0 && (
          <div className="starttabs" role="tablist" aria-label={t("What to show")}>
            {tabBtn("buildings", t("Buildings"), nBuildings, tab === "buildings", () => { setTab("buildings"); setFolderSel("*"); setKindSel("*"); })}
            {tabBtn("props", t("Props"), nProps, tab === "props", () => { setTab("props"); setFolderSel("*"); setKindSel("*"); })}
            <Link className="starttab link" href="/items">{t("My items")}</Link>
          </div>
        )}
        {!choosing && tabFolders.length > 0 && (
          <div className="starttabs sub" role="tablist" aria-label={t("Folders")}>
            {tabBtn("*", t("All folders"), inTab.length, folderNow === "*", () => { setFolderSel("*"); setKindSel("*"); })}
            {tabFolders.map(f => tabBtn("f:" + f, f, inTab.filter(h => folderOf(h) === f).length, folderNow === f, () => { setFolderSel(f); setKindSel("*"); }, true))}
            {hasLoose && tabBtn("", t("Not in a folder"), inTab.filter(h => !folderOf(h)).length, folderNow === "", () => { setFolderSel(""); setKindSel("*"); })}
          </div>
        )}
        {!choosing && groups.length > 1 && (
          <div className="starttabs sub" role="tablist" aria-label={t("Kinds")}>
            {tabBtn("*", t("All kinds"), inFolder.length, kindNow === "*", () => setKindSel("*"))}
            {groups.map(g => tabBtn(g.id, g.title, g.items.length, kindNow === g.id, () => setKindSel(g.id)))}
          </div>
        )}
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
        {!choosing && houses && houses.length > 0 && shown.map(g => renderGroup(g))}
        {!choosing && houses && houses.length > 0 && shown.length === 0 && (
          <p className="hint">{tab === "props" ? t("No props yet. Choose New, then Props.") : t("No buildings here.")}</p>
        )}
        {picked.length > 0 && (
          <div className="packbar" role="region" aria-label="Pack a game mod">
            <span><b>{picked.length}</b> selected</span>
            <label>Mod name <input type="text" value={modTitle} onChange={e => setModTitle(e.target.value)} maxLength={60} disabled={busy} /></label>
            <button className="primary" type="button" onClick={pack} disabled={busy}>
              {packing ? `Packing ${Math.min(packing.done + 1, packing.total)} of ${packing.total}${packing.name ? ": " + packing.name : ""}…` : "Pack into one game mod"}
            </button>
            <button type="button" onClick={() => setPicked([])} disabled={busy}>Clear</button>
          </div>
        )}
      </main>
    </>
  );
}
