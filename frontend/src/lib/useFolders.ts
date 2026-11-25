"use client";
import { useCallback, useEffect, useState } from "react";
import { api, type AppFolder } from "@/lib/api";
import { folderNames } from "@/lib/folders.mjs";

/**
 * The app's folders (buildings, props and mods use the same ones): the names the server knows, and `add` to make one. `names` adds the names of what the page itself
 * has in folders, so that a folder shows at once even before the list is fetched.
 */
export function useFolders(enabled: boolean, own: (string | undefined)[] = []) {
  const [list, setList] = useState<AppFolder[]>([]);
  useEffect(() => { if (enabled) api.folders().then(r => setList(r.folders)).catch(() => { /* the page's own names are shown */ }); }, [enabled]);
  const add = useCallback(async (name: string) => {
    await api.createFolder(name);
    setList(l => (l.some(f => f.name === name) ? l : [...l, { name, buildings: 0, mods: 0 }]));
  }, []);
  /** Renames one on the server (what is in it follows there); the page changes what it holds itself. */
  const rename = useCallback(async (from: string, to: string) => {
    await api.renameFolder(from, to);
    setList(l => l.filter(f => f.name !== to).map(f => (f.name === from ? { ...f, name: to } : f)));
  }, []);
  /** Deletes one on the server (what is in it stays, in no folder); the page takes its own out of it. */
  const remove = useCallback(async (name: string) => {
    await api.deleteFolder(name);
    setList(l => l.filter(f => f.name !== name));
  }, []);
  return { names: folderNames(list.map(f => f.name), own), add, rename, remove };
}
