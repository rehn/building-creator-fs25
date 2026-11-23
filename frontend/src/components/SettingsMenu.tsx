"use client";
// The gear in the top bar: what is not about the work itself (language, API access, admin, version), in one menu (docs/DESIGN.md 4.1).
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { LanguageSelect } from "./LanguageSelect";
import { Version } from "./Version";
import type { User } from "@/lib/api";

export function SettingsMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const path = usePathname();
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);
  return (
    <div className="menu-wrap" ref={box}>
      <button type="button" className="iconbtn" aria-haspopup="true" aria-expanded={open} aria-label="Settings" title="Settings" onClick={() => setOpen(o => !o)}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-head" translate="no">{user.name}</div>
          <label className="menu-row"><span>Language</span><LanguageSelect /></label>
          <Link className="menu-item" role="menuitem" href="/api-access" aria-current={path.startsWith("/api-access") ? "page" : undefined}>API</Link>
          {user.isAdmin && <Link className="menu-item" role="menuitem" href="/admin" aria-current={path.startsWith("/admin") ? "page" : undefined}>Admin</Link>}
          <div className="menu-foot"><Version /></div>
        </div>
      )}
    </div>
  );
}
