"use client";
import { useEffect, useRef } from "react";
import { createEditor, type EditorHandle, type Settings } from "./editor.mjs";

interface Props {
  initial: Settings;
  onChange: (settings: Settings) => void;
  onReady: (editor: EditorHandle | null) => void;
  /** Default mod author: the logged-in user. */
  author?: string;
}

/** Mounts the three.js editor once; later changes to `initial` are ignored. */
export default function Editor({ initial, onChange, onReady, author = "" }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const change = useRef(onChange);
  const ready = useRef(onReady);
  useEffect(() => { change.current = onChange; ready.current = onReady; });
  const start = useRef(initial);
  const by = useRef(author);

  useEffect(() => {
    if (!host.current) return;
    const ed = createEditor(host.current, { initial: start.current, onChange: s => change.current(s), author: by.current });
    ready.current(ed);
    return () => { ready.current(null); ed.destroy(); };
  }, []);

  return <div ref={host} className="editor-host" />;
}
