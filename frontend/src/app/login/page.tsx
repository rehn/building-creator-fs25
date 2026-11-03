"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, googleStartUrl, LOGIN_ERRORS } from "@/lib/api";
import { Brand } from "@/components/Brand";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(LOGIN_ERRORS[params.get("error") ?? ""] ?? "");
  const [busy, setBusy] = useState(false);
  const [google, setGoogle] = useState(false);

  useEffect(() => {
    api.me().then(() => router.replace("/")).catch(() => {});
    api.authConfig().then(c => setGoogle(c.google)).catch(() => {});
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.login(email, password);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <Brand href="/login" />
      <h2>Log in</h2>
      <p className="hint">Your houses are saved to your account.</p>
      {google && (
        <>
          <a className="btn google" href={googleStartUrl()}>Continue with Google</a>
          <p className="or">or with email</p>
        </>
      )}
      <form onSubmit={submit}>
        <label className="stack">Email
          <input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
        </label>
        <label className="stack">Password
          <input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" type="submit" disabled={busy}>{busy ? "Logging in\u2026" : "Log in"}</button>
      </form>
      <p className="hint">New here? Ask the admin for an invite link. Setting up the app? <Link href="/signup">Create the admin account</Link>.</p>
    </div>
  );
}

export default function LoginPage() {
  return <main className="auth"><Suspense><LoginForm /></Suspense></main>;
}
