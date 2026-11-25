"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from "react";

/**
 * The widths of the two panels beside the view (the left one and the details), the same as the building's editor has them: the same starting widths, the same limits and the same
 * place in the browser (so a width chosen on one page is the width on the other), and handles to drag (the keyboard: the arrows, Shift for more; double-click: back to the start).
 */
const KEY = "hx-panel-w";
const START = { panel: 360, details: 380 };
const MIN = { panel: 240, details: 260 }, MAX = 800, STAGE_MIN = 320;
export type PanelKey = keyof typeof START;

export function usePanelSizes(host: RefObject<HTMLElement | null>) {
  const [sizes, setSizes] = useState(START);
  const drag = useRef<{ key: PanelKey; x0: number; v0: number } | null>(null);
  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v && typeof v === "object") setSizes(s => ({ panel: +v.panel || s.panel, details: +v.details || s.details })); } catch { /* no storage: the start widths */ }
  }, []);
  const clamp = useCallback((s: typeof START, key: PanelKey, v: number) => {
    const room = host.current?.clientWidth || window.innerWidth, other = key === "panel" ? s.details : s.panel;
    return Math.round(Math.max(MIN[key], Math.min(v, MAX, room - STAGE_MIN - other)));
  }, [host]);
  const put = useCallback((key: PanelKey, v: number, save: boolean) => {
    setSizes(s => {
      const next = { ...s, [key]: clamp(s, key, v) };
      if (save) { try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private window */ } }
      return next;
    });
  }, [clamp]);
  const handle = (key: PanelKey, label: string) => ({
    className: "hx-rz", role: "separator" as const, "aria-orientation": "vertical" as const, tabIndex: 0, "aria-label": label,
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.classList.add("drag");
      drag.current = { key, x0: e.clientX, v0: sizes[key] };
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => { const d = drag.current; if (d && d.key === key) put(key, d.v0 + e.clientX - d.x0, false); },
    onPointerUp: (e: PointerEvent<HTMLDivElement>) => {
      const d = drag.current; drag.current = null; e.currentTarget.classList.remove("drag");
      if (d && d.key === key) put(key, d.v0 + e.clientX - d.x0, true);
    },
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault(); put(key, sizes[key] + (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 64 : 16), true);
    },
    onDoubleClick: () => put(key, START[key], true),
  });
  const style = { "--panelw": sizes.panel + "px", "--detw": sizes.details + "px" } as CSSProperties;
  return { sizes, style, handle };
}
