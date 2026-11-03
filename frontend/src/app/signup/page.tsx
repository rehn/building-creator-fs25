"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, googleStartUrl } from "@/lib/api";
import { Brand } from "@/components/Brand";

function SignupForm() {
  const router = useRouter();
  const invite = useSearchParams().get("invite") ?? "";
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [inviteState, setInviteState] = useState<"none" | "checking" | "ok" | "bad">(invite ? "checking" : "none");
  const [busy, setBusy] = useState(false);
  const [google, setGoogle] = useState(false);

  useEffect(() => {
    api.authConfig().then(c => setGoogle(c.google)).catch(() => {});
    if (!invite) return;
    api.invite(invite)
      .then(r => { setEmail(r.email); setInviteState("ok"); })
      .catch(() => setInviteState("bad"));
  }, [invite]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.signup({ email, password, name, invite });
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-up failed.");
      setBusy(false);
    }
  }

  if (inviteState === "checking") {
    return <div className="card"><Brand href="/login" /><p className="hint">Checking your invite…</p></div>;
  }
  if (inviteState === "bad") {
    return (
      <div className="card">
        <Brand href="/login" />
        <h2>This invite doesn&rsquo;t work</h2>
        <p className="hint">It may have expired or already been used. Ask the admin for a new link, or <Link href="/login">log in</Link> if you already have an account.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <Brand href="/login" />
      <h2>{invite ? "You\u2019re invited" : "Create the admin account"}</h2>
      <p className="hint">
        {invite ? "Create your account to start building houses." : "Only the email set as ADMIN_EMAIL on the server can sign up without an invite."}
      </p>
      {google && (
        <>
          <a className="btn google" href={googleStartUrl(invite)}>Continue with Google</a>
          <p className="or">or with a password</p>
        </>
      )}
      <form onSubmit={submit}>
        <label className="stack">Email
          <input type="email" autoComplete="email" required readOnly={inviteState === "ok"} value={email} onChange={e => setEmail(e.target.value)} />
        </label>
        <label className="stack">Name
          <input type="text" autoComplete="name" maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="How others see you" />
        </label>
        <label className="stack">Password
          <input type="password" autoComplete="new-password" required minLength={10} maxLength={200} value={password} onChange={e => setPassword(e.target.value)} />
        </label>
        <p className="hint">At least 10 characters.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" type="submit" disabled={busy}>{busy ? "Creating account\u2026" : "Create account"}</button>
      </form>
      <p className="hint">Already have an account? <Link href="/login">Log in</Link></p>
    </div>
  );
}

export default function SignupPage() {
  return <main className="auth"><Suspense><SignupForm /></Suspense></main>;
}
