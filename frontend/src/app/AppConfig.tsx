"use client";
// Asks the server for its settings (MAX_PARTS ...) once, before any page that builds or saves a building is shown,
// and sets the language (the `lang` cookie; English if none) and translates what the pages show (i18n/dom.mjs).
import { useEffect, useState } from "react";
import { setMaxParts } from "@/editor/layout.mjs";
import { setLang } from "@/i18n/index.mjs";
import { startTranslating } from "@/i18n/dom.mjs";

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

function cookieLang(): string {
  const m = /(?:^|;\s*)lang=([\w-]+)/.exec(document.cookie);
  return m ? m[1] : "en";
}

export default function AppConfig({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { let on = true; load().then(() => { if (on) { setLang(cookieLang()); setReady(true); } }); return () => { on = false; }; }, []);
  useEffect(() => (ready ? startTranslating(document.body) : undefined), [ready]);
  return ready ? <>{children}</> : null;
}
