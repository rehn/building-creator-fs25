"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, type User } from "@/lib/api";
import { Brand } from "./Brand";
import { LanguageSelect } from "./LanguageSelect";

export function TopBar({ user }: { user: User | null }) {
  const router = useRouter();
  const path = usePathname();
  async function logout() {
    try { await api.logout(); } finally { router.replace("/login"); }
  }
  return (
    <header className="topbar">
      <Brand />
      {user && <span className="who" translate="no">{user.name}</span>}
      {user && <Link className={"btn" + (path === "/" ? " current" : "")} href="/" aria-current={path === "/" ? "page" : undefined}>My buildings</Link>}
      {user && <Link className={"btn" + (path.startsWith("/items") ? " current" : "")} href="/items" aria-current={path.startsWith("/items") ? "page" : undefined}>My items</Link>}
      {user?.isAdmin && <Link className="btn" href="/admin">Admin</Link>}
      <LanguageSelect />
      {user && <button type="button" onClick={logout}>Log out</button>}
    </header>
  );
}
