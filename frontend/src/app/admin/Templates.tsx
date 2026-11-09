"use client";
// The admin's templates: starting designs for everyone's "New", made from photos with the wizard.
import { t as tr } from "@/i18n/index.mjs";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, templatePhotoUrl, type Template } from "@/lib/api";
import { KIND } from "@/editor/model.mjs";

const kindName = (id: string) => (KIND as Record<string, { name: string } | undefined>)[id]?.name ?? id;

export function Templates() {
  const [list, setList] = useState<Template[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.allTemplates().then(setList).catch(e => setError(e.message)); }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    setBusy(false);
  }
  const replace = (t: Template) => setList(l => (l ?? []).map(x => (x.id === t.id ? t : x)));
  const publish = (t: Template, on: boolean) => run(async () => replace(await api.updateTemplate(t.id, { published: on })));
  const rename = (t: Template) => {
    const name = window.prompt(tr("Name"), t.name)?.trim();
    if (name === undefined || name === "") return;
    const blurb = window.prompt("Short description", t.blurb);
    if (blurb === null) return;
    run(async () => replace(await api.updateTemplate(t.id, { name, blurb: blurb.trim() })));
  };
  const remove = (t: Template) => {
    if (!window.confirm(tr("Delete the template “{name}” and its photos? Buildings made from it stay.", { name: t.name }))) return;
    run(async () => { await api.deleteTemplate(t.id); setList(l => (l ?? []).filter(x => x.id !== t.id)); });
  };

  return (
    <section className="admin-templates" aria-labelledby="templates-head">
      <div className="page-head">
        <h2 id="templates-head">Templates</h2>
        <Link className="btn primary" href="/admin/templates/new">New from photos</Link>
      </div>
      <p className="hint">Starting designs everyone can pick under “New”. Make one from photos of a real building: Claude suggests the settings, you adjust them in the editor and publish.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {list && list.length === 0 && <p className="hint">No templates yet.</p>}
      <div className="grid">
        {(list ?? []).map(t => {
          const open = t.projectId ? `/projects/${t.projectId}?template=${t.id}` : `/admin/templates/new?id=${t.id}`;
          const img = t.thumbnail || (t.photos ? templatePhotoUrl(t.id, 0) : "");
          return (
            <article className="house" key={t.id}>
              <Link className="thumb" href={open} aria-label={tr("Adjust {name}", { name: t.name })}>
                {img ? <img src={img} alt="" /> : <span className="none">No preview yet</span>}
              </Link>
              <div className="info">
                <Link className="name" translate="no" href={open}>{t.name}</Link>
                <small>{kindName(t.kind)} · {t.published ? <span className="badge ok">Published</span> : <span className="badge">Draft</span>}</small>
                <div className="actions">
                  <Link className="btn" href={open}>{t.projectId ? "Adjust" : "Continue"}</Link>
                  {t.published
                    ? <button type="button" onClick={() => publish(t, false)} disabled={busy}>Unpublish</button>
                    : t.projectId && <button type="button" onClick={() => publish(t, true)} disabled={busy}>Publish</button>}
                  <button type="button" onClick={() => rename(t)} disabled={busy}>Rename</button>
                  <button type="button" className="danger" onClick={() => remove(t)} disabled={busy}>Delete</button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
