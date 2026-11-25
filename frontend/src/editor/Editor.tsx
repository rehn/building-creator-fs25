"use client";
import { useEffect, useRef } from "react";
import { createEditor, type EditorHandle, type Settings } from "./editor.mjs";
import { api } from "@/lib/api";

interface Props {
  initial: Settings;
  onChange: (settings: Settings) => void;
  onReady: (editor: EditorHandle | null) => void;
  /** The building was changed to another type: the page saves these settings and mounts the editor again (its controls are built for one type). */
  onKindChange?: (settings: Settings) => void;
  /** Whether there is something to undo or redo (the page has the buttons). */
  onHistory?: (h: { canUndo: boolean; canRedo: boolean }) => void;
  /** Default mod author: the logged-in user. */
  author?: string;
}

/** Mounts the three.js editor once; later changes to `initial` are ignored. */
export default function Editor({ initial, onChange, onReady, onKindChange, onHistory, author = "" }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const change = useRef(onChange);
  const ready = useRef(onReady);
  const kindChange = useRef(onKindChange);
  const history = useRef(onHistory);
  useEffect(() => { change.current = onChange; ready.current = onReady; kindChange.current = onKindChange; history.current = onHistory; });
  const start = useRef(initial);
  const by = useRef(author);

  useEffect(() => {
    if (!host.current) return;
    const ed = createEditor(host.current, {
      initial: start.current, onChange: s => change.current(s), onKindChange: s => kindChange.current?.(s), onHistory: h => history.current?.(h), author: by.current,
      assets: { list: api.assets, file: api.assetFile },
      parts: { list: api.parts, get: api.part, save: api.savePart, update: api.updatePart, remove: api.deletePart, isAdmin: async () => (await api.me()).isAdmin },
    });
    ready.current(ed);
    return () => { ready.current(null); ed.destroy(); };
  }, []);

  return <div ref={host} className="editor-host" />;
}
