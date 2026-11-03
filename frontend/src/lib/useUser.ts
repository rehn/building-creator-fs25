"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, type User } from "./api";

/** The logged-in user. Sends the visitor to /login if nobody is logged in. */
export function useUser() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    api.me().then(u => { if (alive) setUser(u); }).catch((e: unknown) => {
      if (!alive) return;
      if (e instanceof ApiError && e.status === 401) router.replace("/login");
      else setError(e instanceof Error ? e.message : "Something went wrong.");
    });
    return () => { alive = false; };
  }, [router]);
  return { user, error };
}
