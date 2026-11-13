"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type ApiToken } from "@/lib/api";
import { useUser } from "@/lib/useUser";
import { TopBar } from "@/components/TopBar";
import { t } from "@/i18n/index.mjs";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : null);

export default function ApiAccessPage() {
  const { user, error: userError } = useUser();
  const [tokens, setTokens] = useState<ApiToken[] | null>(null);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<ApiToken | null>(null); // just made: the only time the token itself is shown
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("https://your-site");

  useEffect(() => { setOrigin(window.location.origin); }, []);
  useEffect(() => {
    if (user) api.tokens().then(setTokens).catch(e => setError(e.message));
  }, [user]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    setBusy(false);
  }
  const create = () => run(async () => {
    const tok = await api.createToken(name.trim());
    setFresh(tok); setCopied(false); setName("");
    setTokens(list => [{ ...tok, token: undefined }, ...(list ?? [])]);
  });
  const remove = (tok: ApiToken) => {
    if (!window.confirm(t("Delete the token “{name}”? Programs that use it stop working.", { name: tok.name }))) return;
    run(async () => {
      await api.deleteToken(tok.id);
      setTokens(list => (list ?? []).filter(x => x.id !== tok.id));
      if (fresh?.id === tok.id) setFresh(null);
    });
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(fresh?.token ?? ""); setCopied(true); } catch { /* the token is selectable in the box */ }
  };

  return (
    <>
      <TopBar user={user} />
      <main className="page">
        <div className="page-head">
          <Link className="btn back" href="/" aria-label="Back to my buildings"><span aria-hidden="true">‹</span> My buildings</Link>
          <h2>API access</h2>
        </div>
        <p className="hint">Let your own programs read your buildings: the list with name, type and picture, and each building as an .i3d or .obj file.
          A program sends one of these tokens with every request. A token can only read, and only your buildings.</p>
        {(error || userError) && <p className="error" role="alert">{error || userError}</p>}

        <form className="row" onSubmit={e => { e.preventDefault(); if (name.trim()) create(); }}>
          <label>Name of the program <input type="text" value={name} maxLength={80} placeholder={t("My viewer")} onChange={e => setName(e.target.value)} /></label>
          <button type="submit" className="primary" disabled={busy || !user || !name.trim()}>Make a token</button>
        </form>

        {fresh && (
          <section className="token-new" aria-label={t("New token")}>
            <p><b>{t("Copy the token now.")}</b> {t("It is only shown this once. If you lose it, delete it and make a new one.")}</p>
            <input type="text" readOnly value={fresh.token ?? ""} aria-label={t("Token")} onFocus={e => e.currentTarget.select()} translate="no" />
            <div className="row"><button type="button" onClick={copy}>{copied ? "Copied" : "Copy"}</button><button type="button" onClick={() => setFresh(null)}>Done</button></div>
          </section>
        )}

        {!tokens && !error && !userError && <p className="loading">Loading your tokens…</p>}
        {tokens && tokens.length === 0 && <div className="empty"><h3>No tokens yet</h3><p className="hint">Make one to let a program in.</p></div>}
        {tokens && tokens.length > 0 && (
          <ul className="item-list">
            {tokens.map(tok => {
              const made = when(tok.createdAt) ?? "", used = when(tok.lastUsedAt) ?? "";
              return (
              <li key={tok.id}>
                <div>
                  <b translate="no">{tok.name}</b>
                  <small><code translate="no">{tok.prefix}…</code> · {t("Made {when}", { when: made })} · {tok.lastUsedAt ? t("Last used {when}", { when: used }) : t("Never used")}</small>
                </div>
                <div className="actions"><button type="button" className="danger" onClick={() => remove(tok)} disabled={busy}>Delete</button></div>
              </li>
              );
            })}
          </ul>
        )}

        <h3 className="item-group">How to use it</h3>
        <p className="hint">Send the token as <code>Authorization: Bearer &lt;token&gt;</code>. All answers are JSON except the model files.</p>
        <pre className="api-doc" translate="no">{`GET ${origin}/api/v1/buildings
  -> { "buildings": [ { "id", "name", "kind", "icon", "i3d", "obj", "version", "updatedAt" } ] }
     kind: house, chicken, cow, sheep, shed
GET ${origin}/api/v1/buildings/{id}             the same, plus "settings" (what the editor saves)
GET ${origin}/api/v1/buildings/{id}/icon        the picture (PNG or JPEG)
GET ${origin}/api/v1/buildings/{id}/model.i3d   the model for Giants Editor (no textures)
GET ${origin}/api/v1/buildings/{id}/model.obj   the model to draw: metres, y up, one group per material
GET ${origin}/api/v1/buildings/{id}/model.mtl   the colours the .obj refers to

curl -H "Authorization: Bearer bc_..." ${origin}/api/v1/buildings`}</pre>
      </main>
    </>
  );
}
