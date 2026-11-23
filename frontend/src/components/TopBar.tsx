"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, type User } from "@/lib/api";
import { AppSwitch } from "./AppSwitch";
import { Brand } from "./Brand";
import { LanguageSelect } from "./LanguageSelect";
import { SettingsMenu } from "./SettingsMenu";
import { Version } from "./Version";

// The work (buildings, items, textures) as buttons; everything else is behind the gear (SettingsMenu), and logging out is the arrow at the end.
const NAV: [string, string][] = [["/", "Buildings"], ["/items", "Items"], ["/textures", "Textures"]];

export function TopBar({ user }: { user: User | null }) {
  const router = useRouter();
  const path = usePathname();
  async function logout() {
    try { await api.logout(); } finally { router.replace("/login"); }
  }
  const on = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const logoutBtn = (
    <button type="button" className="iconbtn" onClick={logout} aria-label="Log out" title="Log out">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="M16 17l5-5-5-5" />
        <path d="M21 12H9" />
      </svg>
    </button>
  );
  // Logged in: three zones, so the eye finds the pages in the middle (the brand and app switch left, settings and log out right).
  if (!user) return (
    <header className="topbar">
      <Brand />
      <LanguageSelect />
      <Version />
    </header>
  );
  return (
    <header className="topbar three">
      <div className="tb-left"><Brand /><AppSwitch /></div>
      <nav className="tb-nav" aria-label="Main">
        {NAV.map(([href, label]) => (
          <Link key={href} className={"btn" + (on(href) ? " current" : "")} href={href} aria-current={on(href) ? "page" : undefined}>{label}</Link>
        ))}
      </nav>
      <div className="tb-right"><SettingsMenu user={user} />{logoutBtn}</div>
    </header>
  );
}
