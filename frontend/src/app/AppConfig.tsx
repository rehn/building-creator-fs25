"use client";
// Asks the server for its settings (MAX_PARTS ...) once, before any page that builds or saves a building is shown.
import { useEffect, useState } from "react";
import { setMaxParts } from "@/editor/layout.mjs";

let loaded: Promise<void> | null = null;
function load(): Promise<void> {
  if (!loaded) {
    loaded = fetch("/config", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => { if (c && c.maxParts !== undefined) setMaxParts(c.maxParts); })
      .catch(() => undefined);   // (the defaults stand if the server doesn't answer)
  }
  return loaded;
}

export default function AppConfig({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { let on = true; load().then(() => { if (on) setReady(true); }); return () => { on = false; }; }, []);
  return ready ? <>{children}</> : null;
}
