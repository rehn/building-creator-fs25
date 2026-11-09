"use client";
import { t } from "@/i18n/index.mjs";
import { useEffect, useState } from "react";
import { api, type Invite } from "@/lib/api";
import { useUser } from "@/lib/useUser";
import { TopBar } from "@/components/TopBar";
import { Templates } from "./Templates";

const date = (iso: string) => new Date(iso).toLocaleDateString("sv-SE");

function inviteStatus(inv: Invite) {
  if (inv.usedAt) return <span className="badge ok">Joined {date(inv.usedAt)}</span>;
  if (new Date(inv.expiresAt) < new Date()) return <span className="badge">Expired</span>;
  return <span className="badge">Open until {date(inv.expiresAt)}</span>;
}

export default function AdminPage() {
  const { user, error: userError } = useUser();
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user?.isAdmin) api.invites().then(setInvites).catch(e => setError(e.message));
  }, [user]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(""); setCopied(false);
    try {
      const res = await api.createInvite(email);
      setLink({ email: res.invite.email, url: res.link });
      setInvites(list => [res.invite, ...(list ?? []).filter(x => !(x.email === res.invite.email && !x.usedAt))]);
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn\u2019t create the invite.");
    }
    setBusy(false);
  }

  async function copy() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link.url); setCopied(true); } catch { setCopied(false); }
  }

  async function remove(inv: Invite) {
    if (!window.confirm(t("Remove the invite for {email}?", { email: inv.email }))) return;
    try {
      await api.deleteInvite(inv.id);
      setInvites(list => (list ?? []).filter(x => x.id !== inv.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn\u2019t remove the invite.");
    }
  }

  return (
    <>
      <TopBar user={user} />
      <main className="page">
        <div className="page-head"><h2>Invites</h2></div>
        {userError && <p className="error" role="alert">{userError}</p>}
        {user && !user.isAdmin && <p className="error">Only the admin can invite people.</p>}
        {user?.isAdmin && (
          <>
            <form onSubmit={create} className="row">
              <label className="stack">Friend&rsquo;s email
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.se" />
              </label>
              <button className="primary" type="submit" disabled={busy}>Create invite link</button>
            </form>
            <p className="hint">The link works for that email address only, once, for 14 days. They can sign up with a password or with Google.</p>
            {error && <p className="error" role="alert">{error}</p>}
            {link && (
              <div className="linkbox">
                Send this link to {link.email}:
                <code>{link.url}</code>
                <button type="button" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
              </div>
            )}
            <div className="table-wrap" style={{ marginTop: 18 }}>
              <table className="list">
                <thead><tr><th>Email</th><th>Status</th><th><span className="sr">Actions</span></th></tr></thead>
                <tbody>
                  {(invites ?? []).map(inv => (
                    <tr key={inv.id}>
                      <td>{inv.email}</td>
                      <td>{inviteStatus(inv)}</td>
                      <td style={{ textAlign: "right" }}>
                        {!inv.usedAt && <button type="button" className="danger" onClick={() => remove(inv)}>Remove</button>}
                      </td>
                    </tr>
                  ))}
                  {invites && invites.length === 0 && <tr><td colSpan={3} className="hint">No invites yet.</td></tr>}
                </tbody>
              </table>
            </div>
            <Templates />
          </>
        )}
      </main>
    </>
  );
}
