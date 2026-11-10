"use client";
// Chooses the language: remembered in the `lang` cookie, the page reloads to show it.
import { LANGS } from "@/i18n/index.mjs";

export function LanguageSelect() {
  const current = typeof document === "undefined" ? "en" : (/(?:^|;\s*)lang=([\w-]+)/.exec(document.cookie)?.[1] ?? "en");
  return (
    <select
      aria-label="Language"
      className="lang"
      defaultValue={current}
      translate="no"
      onChange={(e) => {
        document.cookie = `lang=${e.target.value}; path=/; max-age=31536000; samesite=lax`;
        window.location.reload();
      }}
    >
      {(LANGS as string[][]).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
    </select>
  );
}
