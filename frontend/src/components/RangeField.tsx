"use client";
// A number as the building editor shows it: the label with the value at its right, and a slider under them. Click the value to type one instead (Enter or leaving the field keeps it,
// Esc drops it). While the slider is dragged onLive is given every value (to show it at once); onCommit is given the value when it is let go, or a typed one is kept, so a save
// is made once and not for every step. min and max are the slider's ends, hardMin and hardMax what may be typed (default the same).
import { useEffect, useRef, useState } from "react";

type Props = {
  label: string; value: number; min: number; max: number; step: number; unit?: string; hardMin?: number; hardMax?: number;
  onLive?: (v: number) => void; onCommit: (v: number) => void; disabled?: boolean;
};

const shown = (v: number) => String(Math.round(v * 100) / 100);

export function RangeField({ label, value, min, max, step, unit = "m", hardMin = min, hardMax = max, onLive, onCommit, disabled }: Props) {
  const [live, setLive] = useState(value);
  const [typing, setTyping] = useState<string | null>(null);
  const dragging = useRef(false);
  const id = useRef("rf" + Math.random().toString(36).slice(2, 8)).current;
  useEffect(() => { if (!dragging.current) setLive(value); }, [value]);

  const slide = (v: number) => { dragging.current = true; setLive(v); onLive?.(v); };
  const release = () => { if (!dragging.current) return; dragging.current = false; onCommit(live); };
  const keep = () => {
    if (typing === null) return;
    const v = Number(typing.replace(",", "."));
    setTyping(null);
    if (Number.isFinite(v)) { const c = Math.min(hardMax, Math.max(hardMin, v)); setLive(c); if (c !== value) onCommit(c); }
  };

  return (
    <div className="field rf">
      <div className="fl">
        <label htmlFor={id}>{label}</label>
        {typing === null
          ? <output title={label} tabIndex={disabled ? -1 : 0} onClick={() => { if (!disabled) setTyping(shown(live)); }} onKeyDown={e => { if (!disabled && e.key === "Enter") setTyping(shown(live)); }}>{shown(live)} {unit}</output>
          : <input type="text" className="rf-type" inputMode="decimal" autoFocus value={typing} aria-label={label} onFocus={e => e.target.select()} onChange={e => setTyping(e.target.value)} onBlur={keep}
              onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setTyping(null); }} />}
      </div>
      <input type="range" id={id} min={min} max={max} step={step} value={Math.min(max, Math.max(min, live))} disabled={disabled}
        onChange={e => slide(Number(e.target.value))} onPointerUp={release} onKeyUp={release} onBlur={release} />
    </div>
  );
}
