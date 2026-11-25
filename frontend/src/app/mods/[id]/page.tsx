"use client";
// One mod (docs/PLAN_MOD.md): a full-size page to build it on, laid out as the building editor is (DESIGN 5) and like Giants Editor's scene tree: at the left a tree (the mod, its
// buildings and props, and a "Game objects" node with the mod's game objects), right of it the properties of what is chosen, and the 3D view filling the rest, where things are moved
// by dragging (they snap to the grid and to each other). The whole mod is ONE placeable when it is generated (decided 2026-11-24), so the game objects belong to the mod (one of
// each, in its plan data) and not to a building. Each change is saved at once, with the version, so a change made somewhere else is not overwritten.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, type Mod, type ModObject, type ModPost, type ProjectSummary } from "@/lib/api";
import { useUser } from "@/lib/useUser";
import { TopBar } from "@/components/TopBar";
import { t } from "@/i18n/index.mjs";
import { KINDS, sanitize, modName } from "@/editor/model.mjs";
import { OBJECT_TYPES, OBJECT_LIMITS } from "@/editor/objects.mjs";
import { createModView } from "@/editor/modView.mjs";
import { projectGroups, boundsOf, footprint, turnedBy, mapKey, proceduralPicture, feetOf, buildingFeet, stretchCuts } from "@/editor/modPlan.mjs";
import { decodeDds } from "@/editor/dds.mjs";
import { makeModPackage } from "@/editor/modExport.mjs";
import { confirmDialog, promptDialog } from "@/components/dialog.mjs";
import { RangeField } from "@/components/RangeField";
import { addPost, removePost, setPostType, placePost, choices, payload } from "@/lib/mods.mjs";
import { groupsFree, addGroup, removeGroup, setObjectOf, settingsFor, objectsOfData, setPoint, addPoint, removePoint, hensOfData, groupOf, entranceBuilding, fenceProblems, fenceProblemList, insertPoint, MIN_POSTS } from "@/lib/modObjects.mjs";

type Kind = { id: string; name: string };
type Groups = ReturnType<typeof projectGroups>;
type Shape = { groups: Groups; bounds: ReturnType<typeof boundsOf>; foundation: number; feet?: { x0: number; x1: number; z0: number; z1: number }[] };
type View = ReturnType<typeof createModView>;
/** What is chosen in the tree: the mod itself, a building or prop, the "Game objects" node, or one game object. */
type Sel = { kind: "root" } | { kind: "post"; post: string } | { kind: "group" } | { kind: "object"; object: number };
const TYPES = KINDS as Kind[];
/** The game objects that can be turned round the Y axis (the troughs; the others are boxes along the axes in the export so far). */
const TURNABLE = ["feedTrough", "waterTrough"];
/** The slider of a building's or prop's place: a mod can be big, and a number typed over may go further. */
const PLACE = { min: -100, max: 100, step: 0.25, hardMin: -5000, hardMax: 5000 };
const typeName = (type: string) => t((OBJECT_TYPES as Record<string, { name: string }>)[type]?.name ?? type);
const typeHint = (type: string) => t(type === "pasture" ? "The fence round the hens' yard. The green post is where it starts, the red where it stops: put them at a corner of a building or against a wall (they snap there, to any building, and can be on different walls). Drag a post to move it, or drag a pale dot between two posts out to a new post." : (OBJECT_TYPES as Record<string, { hint?: string }>)[type]?.hint ?? "");

export default function ModPage() {
  const { id } = useParams<{ id: string }>();
  const { user, error: userError } = useUser();
  const [mod, setMod] = useState<Mod | null>(null);
  const [draft, setDraft] = useState<ModPost[]>([]);
  const [objects, setObjects] = useState<ModObject[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [shapes, setShapes] = useState<Record<string, Shape | "error">>({});
  const [sel, setSel] = useState<Sel>({ kind: "root" });
  const [adding, setAdding] = useState<"building" | "prop">("building");   // which list the mod's properties offer to add from
  const [closed, setClosed] = useState<Record<string, boolean>>({});   // the tree nodes folded up
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<View | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const objectsRef = useRef(objects);
  objectsRef.current = objects;
  const modRef = useRef(mod);
  modRef.current = mod;
  const asked = useRef(new Set<string>());
  const mapsAsked = useRef(new Set<string>());
  const datas = useRef(new Map<string, Record<string, unknown>>());   // the projects' data as read, for the game mod
  const [made, setMade] = useState<{ name: string; warnings: string[] } | null>(null);
  const [postIx, setPostIx] = useState(0);   // the post of a fence the properties show
  const [postOn, setPostOn] = useState(false);   // a post of the fence is chosen (in the tree or the view), not the fence as a whole
  const hens: number = hensOfData(mod?.data);
  const insideId: string | null = typeof mod?.data?.inside === "string" ? mod.data.inside : null;   // the building whose floor the hens walk on

  useEffect(() => {
    if (!user) return;
    Promise.all([api.mod(id), api.projects()]).then(([m, list]) => { setMod(m); setProjects(list); }).catch(e => setError(e.message));
  }, [user, id]);
  useEffect(() => { setDraft(mod?.items ?? []); setObjects(objectsOfData(mod?.data)); }, [mod]);   // (what the server has now)

  // what each thing looks like: its project, read once
  useEffect(() => {
    for (const p of mod?.items ?? []) {
      if (p.missing || asked.current.has(p.ref)) continue;
      asked.current.add(p.ref);
      api.project(p.ref).then(pr => {
        datas.current.set(p.ref, pr.data);
        const groups = projectGroups(pr.data);
        setShapes(s => ({ ...s, [p.ref]: { groups, bounds: boundsOf(groups), foundation: pr.data.kind === "prop" ? 0 : sanitize(pr.data).foundation, feet: pr.data.kind === "prop" ? undefined : buildingFeet(pr.data) } }));
      }).catch(() => setShapes(s => ({ ...s, [p.ref]: "error" })));
    }
  }, [mod]);

  /** Saves the buildings and props and/or the game objects (the answer has the ids and the names); a change made somewhere else is not overwritten but read again. */
  async function save(patch: { items?: ModPost[]; objects?: ModObject[]; hens?: number; inside?: string | null }) {
    const m = modRef.current;
    if (!m) return;
    setBusy(true); setError("");
    try {
      setMod(await api.updateMod(m.id, {
        ...(patch.items ? { items: payload(patch.items) } : {}),
        ...(patch.objects || patch.hens || "inside" in patch ? { data: { ...(m.data ?? {}), ...(patch.objects ? { objects: patch.objects } : {}), ...(patch.hens ? { hens: patch.hens } : {}), ...("inside" in patch ? { inside: patch.inside } : {}) } } : {}),
        version: m.version,
      }));
    } catch (e) { setError((e as Error).message); api.mod(m.id).then(setMod).catch(() => {}); }
    finally { setBusy(false); }
  }
  const change = (next: ModPost[]) => { setDraft(next); save({ items: next }); };
  const changeObjects = (next: ModObject[]) => { setObjects(next); save({ objects: next }); };

  // the 3D view
  useEffect(() => {
    if (!canvas.current) return;
    const v = createModView(canvas.current, {
      onSelect: (post: string | null, object: number | null) => setSel(object !== null ? { kind: "object", object } : post !== null ? { kind: "post", post } : { kind: "root" }),
      onMove: (pid: string, at: { x: number; z: number }) => setDraft(placePost(draftRef.current, pid, at)),
      onDrop: (pid: string, at: { x: number; z: number }) => change(placePost(draftRef.current, pid, at)),
      onObjectMove: (oid: number, at: { x: number; z: number }) => setObjects(setObjectOf(objectsRef.current, oid, at)),
      onObjectDrop: (oid: number, at: { x: number; z: number }) => changeObjects(setObjectOf(objectsRef.current, oid, at)),
      onPointMove: (oid: number, i: number, at: { x: number; z: number }) => { setPostIx(i); setObjects(setPoint(objectsRef.current, oid, i, at)); },
      onPointDrop: (oid: number, i: number, at: { x: number; z: number }) => changeObjects(setPoint(objectsRef.current, oid, i, at)),
      onPointSelect: (_oid: number, i: number) => { setPostIx(i); setPostOn(true); },
      onPointInsert: (oid: number, i: number, at: { x: number; z: number }) => setObjects(insertPoint(objectsRef.current, oid, i, at)),
    });
    view.current = v;
    return () => { v.dispose(); view.current = null; };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  // the textures: drawn in their colours first, then each picture as it is made (a surface of a building) or read (one of the user's textures), one at a time
  useEffect(() => {
    const todo: { key: string; map: { spec?: unknown; hex?: string; textureId?: string } }[] = [];
    for (const s of Object.values(shapes)) {
      if (s === "error") continue;
      for (const g of s.groups as { map: { spec?: unknown; hex?: string; textureId?: string } | null }[]) {
        if (!g.map) continue;
        const key = mapKey(g.map);
        if (!mapsAsked.current.has(key)) { mapsAsked.current.add(key); todo.push({ key, map: g.map }); }
      }
    }
    if (!todo.length) return;
    let live = true;
    (async () => {
      for (const { key, map } of todo) {
        if (!live) { mapsAsked.current.delete(key); continue; }
        await new Promise(r => setTimeout(r, 30));   // (let the page draw between two heavy ones)
        try {
          if (map.textureId) { const d = decodeDds(new Uint8Array(await api.textureFile(map.textureId, "diffuse"))); view.current?.setMap(key, { width: d.width, height: d.height, rgba: d.data }); }
          else view.current?.setMap(key, proceduralPicture(map));
        } catch { /* the group stays in its colour */ }
      }
    })();
    return () => { live = false; };
  }, [shapes]);
  useEffect(() => {
    const posts = [];
    for (const p of draft) {
      const s = shapes[p.ref];
      if (s && s !== "error") posts.push({ id: p.id, x: p.x, z: p.z, y: p.y, rot: p.rot, groups: s.groups, bounds: s.bounds, feet: s.feet });
    }
    view.current?.show(posts);
  }, [draft, shapes]);
  useEffect(() => { view.current?.showObjects(objects); }, [objects]);
  // the post of a fence the properties are about is marked in the view
  useEffect(() => { view.current?.selectPoint(sel.kind === "object" ? postIx : -1); }, [sel, postIx, objects]);
  useEffect(() => {
    view.current?.select(sel.kind === "post" ? sel.post : null, sel.kind === "object" ? sel.object : null);
  }, [sel, draft, objects]);

  async function rename() {
    if (!mod) return;
    const name = await promptDialog(t("Name"), mod.name, { title: t("Rename"), confirm: t("Rename"), maxLength: 100 });
    if (!name?.trim() || name.trim() === mod.name) return;
    setBusy(true); setError("");
    try { setMod(await api.updateMod(mod.id, { name: name.trim(), version: mod.version })); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  /** The game mod as a zip: the whole mod is one placeable (editor/modExport.mjs), made here in the browser from what the posts are now, and downloaded. */
  async function generate() {
    if (!mod) return;
    setBusy(true); setError(""); setMade(null);
    try {
      const posts = [];
      for (const p of draft) {
        if (p.missing) continue;
        let data = datas.current.get(p.ref);
        if (!data) { try { data = (await api.project(p.ref)).data; } catch { data = undefined; } }
        posts.push({ id: p.id, kind: p.kind, name: p.name, x: p.x, z: p.z, y: p.y ?? 0, rot: p.rot, data });
      }
      const pkg = await makeModPackage({
        name: mod.name, author: user?.name ?? "", posts, objects, hens, inside: insideId,
        // the icon and the shop picture: a snapshot of the 3D view (the game does not load a mod without an icon)
        pictures: view.current ? { icon: view.current.picture(256), store: view.current.picture(512) } : null,
        // the user's textures a prop is made of: their diffuse and normal maps from the server
        loadTextures: async (ids: string[]) => {
          const maps = new Map<string, { size: number; diffuse: Uint8ClampedArray; normal: Uint8ClampedArray }>();
          for (const id of ids) {
            try {
              const [d, n] = await Promise.all((["diffuse", "normal"] as const).map(async k => decodeDds(new Uint8Array(await api.textureFile(id, k)))));
              maps.set(id, { size: d.width, diffuse: new Uint8ClampedArray(d.data), normal: new Uint8ClampedArray(n.data) });
            } catch { /* grey */ }
          }
          return maps;
        },
      });
      const JSZip = (await import("jszip")).default, zip = new JSZip();
      for (const [path, content] of pkg.files as Map<string, string | Uint8Array>) zip.file(path, content);
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" }), file = modName(mod.name) + ".zip";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = file; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      setMade({ name: file, warnings: pkg.warnings as string[] });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!mod) return;
    if (!await confirmDialog(t("Delete the mod “{name}”? The buildings and props in it stay.", { name: mod.name }), { title: t("Delete"), confirm: t("Delete"), danger: true })) return;
    setBusy(true); setError("");
    try { await api.deleteMod(mod.id); window.location.href = "/mods"; }
    catch (e) { setError((e as Error).message); setBusy(false); }
  }

  const post = sel.kind === "post" ? draft.find(p => p.id === sel.post) ?? null : null;
  const object = sel.kind === "object" ? objects.find(o => o.id === sel.object) ?? null : null;
  // a fence with a post inside a building: the game cannot make the animals' area from it, so it is marked (the tree, and its properties)
  const fenceBad = fenceProblems(objects, feetOf(draft.flatMap(p => { const s = shapes[p.ref]; return s && s !== "error" ? [{ x: p.x, z: p.z, rot: p.rot, bounds: s.bounds, feet: s.feet }] : []; }))) as Map<number, { posts: number[]; edges: number[] }>;
  /** The warning for post i of fence id: the problems that are about it (it is inside a building, or a stretch it ends runs through one). */
  // the stretches the game would cut short and leave a hole in (orange in the view): each says how long it is, what the game cuts off and the whole length the mod is made with
  const feet = feetOf(draft.flatMap(p => { const s = shapes[p.ref]; return s && s !== "error" ? [{ x: p.x, z: p.z, rot: p.rot, bounds: s.bounds, feet: s.feet }] : []; }));
  const cutTexts = (id: number, only?: number) => {
    const pts = objects.find(o => o.id === id)?.points;
    if (!pts) return [] as string[];
    return (stretchCuts(pts, feet) as { i: number; length: number; cut: number; to: number }[]).filter(c => only === undefined || c.i === only || c.i + 1 === only)
      .map(c => t("The stretch between posts {a} and {b} is {len} m long: the game cuts {cut} m off it and leaves a hole. The mod is made with the posts moved a little so that it is whole ({to} m), or move a post yourself.", { a: c.i + 1, b: c.i + 2, len: c.length.toFixed(1), cut: c.cut.toFixed(2), to: c.to.toFixed(2) }));
  };
  const postWarning = (id: number, i: number) => {
    const bad = fenceBad.get(id), n = objects.find(o => o.id === id)?.points?.length ?? 0;
    if (!bad) return cutTexts(id, i).join(" ");
    const mine = { posts: bad.posts.filter(k => k === i), edges: bad.edges.filter(k => k === i || (k + 1) % n === i) };
    const found = mine.posts.length || mine.edges.length ? (fenceProblemList(mine, n) as [string, Record<string, string>][]).map(([text, values]) => t(text, values)) : [];
    return [...found, ...cutTexts(id, i)].join(" ");
  };
  const fenceWarning = (id: number) => {
    const bad = fenceBad.get(id), n = objects.find(o => o.id === id)?.points?.length ?? 0;
    const found = bad ? (fenceProblemList(bad, n) as [string, Record<string, string>][]).map(([text, values]) => t(text, values)) : [];
    return [...found, ...cutTexts(id)].join(" ");
  };
  const options: ProjectSummary[] = mod ? choices(projects, draft, adding) : [];
  const loading = draft.some(p => !p.missing && !shapes[p.ref]);
  const failed = draft.filter(p => !p.missing && shapes[p.ref] === "error").length;
  const open = (p: ModPost) => (p.kind === "prop" ? `/builder/${p.ref}` : `/projects/${p.ref}`);
  const put = (pid: string, patch: { x?: number; z?: number; y?: number; rot?: number }) => change(placePost(draftRef.current, pid, patch));
  const live = (pid: string, patch: { x?: number; z?: number; y?: number; rot?: number }) => setDraft(placePost(draftRef.current, pid, patch));
  const fold = (key: string) => setClosed(c => ({ ...c, [key]: !c[key] }));

  /** The size and middle of everything in the mod seen from above (the things as they stand, turned), for where a new game object starts: the middle, as big as the mod. */
  function around(only?: string) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, foundation = 0;
    for (const p of draft) {
      if (only && p.id !== only) continue;
      const s = shapes[p.ref];
      if (!s || s === "error") continue;
      const f = footprint(s.bounds, p.rot);
      minX = Math.min(minX, p.x + f.minX); maxX = Math.max(maxX, p.x + f.maxX); minZ = Math.min(minZ, p.z + f.minZ); maxZ = Math.max(maxZ, p.z + f.maxZ);
      if (p.kind === "building") foundation = Math.max(foundation, s.foundation);
    }
    if (minX === Infinity) return { width: 8, depth: 8, foundation: 0, at: [0, 0] as [number, number] };
    return { width: maxX - minX, depth: maxZ - minZ, foundation, at: [(minX + maxX) / 2, (minZ + maxZ) / 2] as [number, number] };
  }
  /** The fence as a rectangle again, where a new one starts (against the first building with a door): the posts the player moved are put back. */
  function backToRectangle() {
    const door = entranceBuilding(draft.map(p => ({ kind: p.kind, rot: p.rot, data: datas.current.get(p.ref) })));
    const a = door.index >= 0 ? around(draft[door.index].id) : around();
    const fresh = (addGroup([], "hens", settingsFor(a), a.at, { wall: door.wall }) as ModObject[]).find(o => o.type === "pasture");
    if (!fresh) return;
    setPostIx(0);
    changeObjects(objects.map(o => (o.type === "pasture" ? { ...o, points: fresh.points } : o)));
  }
  function addObjects(group: string) {
    // (a hen yard goes against the first building with a door, on the side the door faces, with its fence 15 cm out from the wall as the hen house has it)
    const door = entranceBuilding(draft.map(p => ({ kind: p.kind, rot: p.rot, data: datas.current.get(p.ref) }))), wall: string = door.wall;
    const a = group === "hens" && door.index >= 0 ? around(draft[door.index].id) : around();
    const next: ModObject[] = addGroup(objects, group, settingsFor(a), a.at, { wall });
    changeObjects(next);
    const added = next.slice(-1)[0];
    if (added) setSel({ kind: "object", object: added.id });
  }

  /** One row of the tree, as the building editor draws it: a caret (when it has children) and a button. */
  const row = (key: string, depth: number, label: string, on: boolean, choose: () => void, opts: { kids?: boolean; hint?: string; strong?: boolean; add?: () => void; warn?: string } = {}) => (
    <li className={"tnode" + (opts.strong ? " t-main" : "")} style={{ ["--d" as string]: depth }} key={key}>
      {opts.kids ? <button type="button" className="caret" aria-label={closed[key] ? t("Unfold") : t("Fold")} aria-expanded={!closed[key]} onClick={() => fold(key)}>{closed[key] ? "▸" : "▾"}</button> : <span className="caret" aria-hidden="true" />}
      <button type="button" className="tbtn" aria-pressed={on} onClick={choose}><span translate="no">{label}</span>{opts.hint && <small> {opts.hint}</small>}</button>
      {opts.warn && <span className="twarn" role="img" tabIndex={0} title={opts.warn} aria-label={opts.warn}>⚠</span>}
      {opts.add && <button type="button" className="linklike tadd" onClick={opts.add} disabled={busy}>{t("+ Add")}</button>}
    </li>
  );

  const tree = mod && (
    <ul className="tree" role="tree">
      {row("root", 0, mod.name, sel.kind === "root", () => setSel({ kind: "root" }), { kids: true, strong: true, add: () => setSel({ kind: "root" }) })}
      {!closed.root && [
        ...draft.map(p => row(p.id, 1, p.missing ? t("Deleted") : p.name, sel.kind === "post" && sel.post === p.id, () => setSel({ kind: "post", post: p.id }),
          { hint: p.kind === "prop" ? t("prop") : p.type ? TYPES.find(k => k.id === p.type)?.name : undefined })),
        row("objects", 1, t("Game objects"), sel.kind === "group", () => setSel({ kind: "group" }), { kids: objects.length > 0 }),
        ...(closed.objects ? [] : objects.flatMap(o => {
          const posts = Array.isArray(o.points) ? o.points : null, mine = sel.kind === "object" && sel.object === o.id;
          return [
            row(`o:${o.id}`, 2, typeName(o.type), mine && !(posts && postOn), () => { setPostOn(false); setSel({ kind: "object", object: o.id }); }, { warn: fenceWarning(o.id), kids: !!posts }),
            // (each post of a fence is an item of its own under it: the first is where it starts, the last where it stops)
            ...(posts && !closed[`o:${o.id}`] ? posts.map((_, i) => row(`o:${o.id}:${i}`, 3,
              i === 0 ? t("Post {n} (start)", { n: i + 1 }) : i === posts.length - 1 ? t("Post {n} (stop)", { n: i + 1 }) : t("Post {n}", { n: i + 1 }),
              mine && postOn && Math.min(postIx, posts.length - 1) === i, () => { setPostIx(i); setPostOn(true); setSel({ kind: "object", object: o.id }); }, { warn: postWarning(o.id, i) })) : []),
          ];
        })),
      ]}
    </ul>
  );

  return (
    <>
      <TopBar user={user} />
      <main className="modedit">
        <aside className="hx-panel modedit-tree" aria-label={t("The mod")}>
          <p className="hint"><Link href="/mods">{t("All mods")}</Link></p>
          {!mod && !error && !userError && <p className="loading">Loading the mod…</p>}
          {tree}
        </aside>

        <aside className="hx-details modedit-props" aria-label={t("Properties")}>
          {(error || userError) && <p className="error" role="alert">{error || userError}</p>}
          {failed > 0 && <p className="error">{t("Some of the buildings could not be read, so they are not shown.")}</p>}

          {mod && sel.kind === "root" && (
            <>
              <section className="hx-card">
                <h3 className="hx-card-h" translate="no">{mod.name}</h3>
                <p className="hint">{t("A mod holds buildings and props, and the player puts the whole of it out in one go. Drag them in the view to place them. The game objects, like where the player sleeps, belong to the whole mod.")}</p>
                <div className="row"><button type="button" onClick={rename} disabled={busy}>Rename</button><button type="button" className="danger" onClick={remove} disabled={busy}>Delete</button></div>
              </section>
              <section className="hx-card">
                <h3 className="hx-card-h">{t("Game mod")}</h3>
                <p className="hint">{t("Makes the whole mod as one placeable in the game: the buildings and props where you have put them, and the game objects. Put the zip in the game's mods folder.")}</p>
                <div className="row"><button type="button" className="primary" onClick={generate} disabled={busy || draft.length === 0}>{t("Generate game mod")}</button></div>
                {made && <p className="hint">{t("Made {file}.", { file: made.name })} {t("Not tried in the game yet.")}</p>}
                {made && made.warnings.map(w => <p className="error" key={w}>{w}</p>)}
              </section>
              <section className="hx-card">
                <h3 className="hx-card-h">{t("Add to the mod")}</h3>
                <div className="starttabs sub" role="tablist" aria-label={t("What to add")}>
                  {(["building", "prop"] as const).map(k => (
                    <button type="button" role="tab" key={k} className={"starttab" + (adding === k ? " on" : "")} aria-selected={adding === k} onClick={() => setAdding(k)}>{k === "prop" ? t("Props") : t("Buildings")} <small>{choices(projects, draft, k).length}</small></button>
                  ))}
                </div>
                {options.length === 0
                  ? <p className="hint">{adding === "prop" ? t("Every prop you have is in this mod already, or you have none yet. Props are made in the modeller, from My buildings.") : t("Every building you have is in this mod already, or you have none yet.")}</p>
                  : <ul className="item-list compact">{options.map(h => (
                    <li key={h.id}><div><b translate="no">{h.name}</b></div><div className="actions"><button type="button" onClick={() => change(addPost(draft, adding, h.id))} disabled={busy}>Add</button></div></li>
                  ))}</ul>}
              </section>
            </>
          )}

          {mod && post && (
            <section className="hx-card">
              <h3 className="hx-card-h" translate="no">{post.missing ? t("Deleted") : post.name}</h3>
              {post.missing && <p className="hint">{t("What this was made from is gone. Take it out of the mod.")}</p>}
              {post.kind === "building" && !post.missing && (
                <label className="stack">{t("Mod type")}
                  <select value={post.type} onChange={e => change(setPostType(draft, post.id, e.target.value))} disabled={busy}>
                    <option value="">{t("As the building is")}</option>
                    {TYPES.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                  </select>
                </label>
              )}
              {post.kind === "building" && !post.missing && objects.some(o => o.type === "pasture") && (
                <label className="check" title={t("Gives the building a floor the hens can walk on, and a ramp through each open framed doorway (door style Open doorway, framed) or open side (a carport) that faces the fence, as in the game's own hen barns. One building in a mod. The way in has to be on the side of the fence.")}>
                  <input type="checkbox" checked={insideId === post.id} onChange={e => save({ inside: e.target.checked ? post.id : null })} disabled={busy} /> {t("The hens walk inside this building")}
                </label>
              )}
              <RangeField label="X" value={post.x} {...PLACE} onLive={v => live(post.id, { x: v })} onCommit={v => put(post.id, { x: v })} disabled={busy} />
              <RangeField label="Y" value={post.y ?? 0} min={0} max={30} step={0.05} hardMin={-50} hardMax={500} onLive={v => live(post.id, { y: v })} onCommit={v => put(post.id, { y: v })} disabled={busy} />
              <RangeField label="Z" value={post.z} {...PLACE} onLive={v => live(post.id, { z: v })} onCommit={v => put(post.id, { z: v })} disabled={busy} />
              <RangeField label={t("Turn")} value={post.rot} min={0} max={360} step={1} unit="°" hardMin={0} hardMax={360} onLive={v => live(post.id, { rot: v })} onCommit={v => put(post.id, { rot: v % 360 })} disabled={busy} />
              <div className="row">
                <button type="button" onClick={() => put(post.id, { rot: turnedBy(post.rot, -90) })} disabled={busy}>{t("Turn left")}</button>
                <button type="button" onClick={() => put(post.id, { rot: turnedBy(post.rot, 90) })} disabled={busy}>{t("Turn right")}</button>
              </div>
              <div className="row">
                {!post.missing && <Link className="btn" href={open(post)}>Open</Link>}
                <button type="button" className="danger" onClick={() => { setSel({ kind: "root" }); change(removePost(draft, post.id)); }} disabled={busy}>Take out</button>
              </div>
            </section>
          )}

          {mod && sel.kind === "group" && (
            <section className="hx-card">
              <h3 className="hx-card-h">{t("Game objects")}</h3>
              <p className="hint">{t("What the game needs around the mod: where the player sleeps, shops or fills up. The game takes one of each in a mod, so each is added once. Drag them in the view to put them where they belong.")}</p>
              {groupsFree(objects).length === 0 && <p className="hint">{t("The mod has all of them.")}</p>}
              <div className="mtree-menu">
                {groupsFree(objects).map((g: { id: string; name: string }) => (
                  <button type="button" key={g.id} onClick={() => addObjects(g.id)} disabled={busy}>{t("+ Add")} {t(g.name)}</button>
                ))}
              </div>
            </section>
          )}

          {mod && object && (
            <section className="hx-card">
              <h3 className="hx-card-h">{typeName(object.type)}</h3>
              <p className="hint">{typeHint(object.type)}</p>
              {fenceWarning(object.id) && <p className="error" role="alert">{fenceWarning(object.id)}</p>}
              {object.type === "pasture" ? (
                <>
                  <div className="row">
                    <button type="button" onClick={() => setPostIx(Math.max(0, Math.min(object.points?.length ?? 1, postIx) - 1))} disabled={busy || postIx <= 0} aria-label={t("The post before")}>‹</button>
                    <b>{t("Post {n} of {total}", { n: Math.min(postIx, (object.points?.length ?? 1) - 1) + 1, total: object.points?.length ?? 0 })}</b>
                    <button type="button" onClick={() => setPostIx(Math.min((object.points?.length ?? 1) - 1, postIx + 1))} disabled={busy || postIx >= (object.points?.length ?? 1) - 1} aria-label={t("The post after")}>›</button>
                  </div>
                  {(["x", "z"] as const).map((k, c) => {
                    const i = Math.min(postIx, (object.points?.length ?? 1) - 1), q = object.points?.[i] ?? [0, 0], to = (v: number) => (c === 0 ? { x: v, z: q[1] } : { x: q[0], z: v });
                    return <RangeField key={`${object.id}:${i}:${k}`} label={k === "x" ? "X" : "Z"} value={q[c]} min={OBJECT_LIMITS[k][0]} max={OBJECT_LIMITS[k][1]} step={0.25}
                      onLive={v => setObjects(setPoint(objectsRef.current, object.id, i, to(v)))} onCommit={v => changeObjects(setPoint(objectsRef.current, object.id, i, to(v)))} disabled={busy} />;
                  })}
                  {(() => { const pts = object.points ?? [], i = Math.min(postIx, pts.length - 1); return i + 1 < pts.length ? <p className="hint">{t("{d} m to the next post", { d: Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]).toFixed(1) })}</p> : null; })()}
                  <div className="row">
                    <button type="button" onClick={() => { const i = Math.min(postIx, (object.points?.length ?? 1) - 1); changeObjects(addPoint(objects, object.id, i)); setPostIx(i + 1); }} disabled={busy}>{t("Add a post after it")}</button>
                    <button type="button" onClick={() => changeObjects(removePoint(objects, object.id, Math.min(postIx, (object.points?.length ?? 1) - 1)))} disabled={busy || (object.points?.length ?? 0) <= MIN_POSTS}>{t("Take this post out")}</button>
                    <button type="button" onClick={backToRectangle} disabled={busy}>{t("Back to a rectangle")}</button>
                  </div>
                </>
              ) : (["x", "y", "z", "w", "d", "h"] as const).map(k => (
                <RangeField key={`${object.id}:${k}`} label={{ x: "X", y: "Y", z: "Z", w: t("Width"), d: t("Depth"), h: t("Height") }[k]} value={object[k] ?? 0}
                  min={OBJECT_LIMITS[k][0]} max={OBJECT_LIMITS[k][1]} step={k === "x" || k === "z" ? 0.25 : 0.05}
                  onLive={v => setObjects(setObjectOf(objectsRef.current, object.id, { [k]: v }))} onCommit={v => changeObjects(setObjectOf(objectsRef.current, object.id, { [k]: v }))} disabled={busy} />
              ))}
              {TURNABLE.includes(object.type) && (
                <>
                  <RangeField label={t("Turn")} value={object.turn ?? 0} min={0} max={360} step={1} unit="°" hardMin={0} hardMax={360}
                    onLive={v => setObjects(setObjectOf(objectsRef.current, object.id, { turn: v }))} onCommit={v => changeObjects(setObjectOf(objectsRef.current, object.id, { turn: v }))} disabled={busy} />
                  <div className="row">
                    <button type="button" onClick={() => changeObjects(setObjectOf(objects, object.id, { turn: turnedBy(object.turn ?? 0, -90) }))} disabled={busy}>{t("Turn left")}</button>
                    <button type="button" onClick={() => changeObjects(setObjectOf(objects, object.id, { turn: turnedBy(object.turn ?? 0, 90) }))} disabled={busy}>{t("Turn right")}</button>
                  </div>
                </>
              )}
              {groupOf(object.type) === "hens" && <RangeField label={t("Hens")} value={hens} min={1} max={360} step={1} unit="" onCommit={v => save({ hens: Math.round(v) })} disabled={busy} />}
              <p className="hint">{t("Measured from the middle of the mod, the same ground the buildings stand on: X to the right, Y up and Z towards you, as the axes in the view show. Taking it away takes the objects that go with it too.")}</p>
              <div className="row">
                <button type="button" className="danger" onClick={() => { setSel({ kind: "group" }); changeObjects(removeGroup(objects, object.id)); }} disabled={busy}>Remove</button>
              </div>
            </section>
          )}
        </aside>

        <div className="modedit-stage">
          <canvas ref={canvas} aria-label={t("The buildings and props of the mod in 3D")} />
          {loading && <p className="loading modplan-note">{t("Reading the buildings…")}</p>}
          <p className="modedit-keys hint">{t("Drag a building or a prop to move it. Drag the ground to turn the view, right-drag to pan and scroll to zoom. Hold Alt while you drag to move without snapping.")}</p>
        </div>
      </main>
    </>
  );
}
