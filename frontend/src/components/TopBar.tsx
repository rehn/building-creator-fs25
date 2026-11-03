"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, type User } from "@/lib/api";
import { Brand } from "./Brand";

export function TopBar({ user }: { user: User | null }) {
  const router = useRouter();
  async function logout() {
    try { await api.logout(); } finally { router.replace("/login"); }
  }
  return (
    <header className="topbar">
      <Brand />
      {user && <span className="who">{user.name}</span>}
      {user?.isAdmin && <Link className="btn" href="/admin">Invites</Link>}
      {user && <button type="button" onClick={logout}>Log out</button>}
    </header>
  );
}
