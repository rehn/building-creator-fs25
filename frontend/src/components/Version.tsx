"use client";
// The release this runs: the web app's (/config) and the API's (/api/health), both set by their images (APP_VERSION).
// Shows one number when they agree, both when they don't (a half-finished upgrade). Nothing while it is unknown.
import { useEffect, useState } from "react";

type Versions = { web: string; api: string };

let cached: Promise<Versions> | null = null;
function load(): Promise<Versions> {
  if (!cached) {
    const get = (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => (j && typeof j.version === "string" ? (j.version as string) : "")).catch(() => "");
    cached = Promise.all([get("/config"), get("/api/health")]).then(([web, api]) => ({ web, api }));
  }
  return cached;
}

const label = (v: string) => (/^\d/.test(v) ? "v" + v : v);

export function Version() {
  const [v, setV] = useState<Versions | null>(null);
  useEffect(() => { let on = true; load().then((x) => { if (on) setV(x); }); return () => { on = false; }; }, []);
  if (!v || (!v.web && !v.api)) return null;
  const same = !v.web || !v.api || v.web === v.api;
  const text = same ? label(v.web || v.api) : `web ${label(v.web)} · api ${label(v.api)}`;
  return <span className="ver" translate="no" title={`web ${v.web || "?"} · api ${v.api || "?"}`}>{text}</span>;
}
