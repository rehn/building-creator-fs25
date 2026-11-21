"use client";
// The switch between the two apps that share their accounts: the map app (fs25map-creator, which holds the accounts) and
// this one. The same markup and look as the map app's header (.appswitch). Shown only when "Sign in with the map app" is
// set up: the map app's address comes from /api/auth/config (ssoUrl).
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Logo } from "./Brand";

function MapLogo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M4 8.5 12 5l8 3.5L28 5v18.5L20 27l-8-3.5L4 27z" fill="var(--accent)" />
      <path d="M12 5v18.5M20 8.5V27" stroke="var(--panel)" strokeWidth="1.8" />
    </svg>
  );
}

let cached: Promise<string> | null = null;
function mapApp(): Promise<string> {
  if (!cached) cached = api.authConfig().then((c) => (c.sso && c.ssoUrl ? c.ssoUrl.replace(/\/$/, "") : "")).catch(() => "");
  return cached;
}

export function AppSwitch() {
  const [url, setUrl] = useState("");
  useEffect(() => { let on = true; mapApp().then((u) => { if (on) setUrl(u); }); return () => { on = false; }; }, []);
  if (!url) return null;
  return (
    <nav className="appswitch" aria-label="Apps">
      <a href={url + "/"} title="Open the map app"><MapLogo /><span>Maps</span></a>
      <Link href="/" aria-current="page"><Logo /><span>Buildings</span></Link>
    </nav>
  );
}
