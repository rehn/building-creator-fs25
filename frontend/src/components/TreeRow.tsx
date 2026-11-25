"use client";
import type { ReactNode } from "react";
import { t } from "@/i18n/index.mjs";

/**
 * One row of a tree in the left panel (the mod's, the modeller's): fold button, the name as a button that chooses it, then what the row may have after it (a warning, "+ Add").
 * The same markup and classes (`.tree .tnode .caret .tbtn`) as the building's tree in editor.mjs, so all the trees look and behave alike (docs/DESIGN.md "Editor pages").
 */
export function TreeRow({ depth, label, on, onChoose, folded, onFold, hint, strong, lead, warn, add, addDisabled }: {
  depth: number; label: string; on: boolean; onChoose: () => void;
  /** Has rows under it: `folded` says whether they are hidden, `onFold` shows or hides them. */
  folded?: boolean; onFold?: () => void;
  hint?: string; strong?: boolean;
  /** Something before the name (a colour swatch). */
  lead?: ReactNode;
  warn?: string; add?: () => void; addDisabled?: boolean;
}) {
  return (
    <li className={"tnode" + (strong ? " t-main" : "")} style={{ ["--d" as string]: depth }}>
      {onFold ? <button type="button" className="caret" aria-label={folded ? t("Unfold") : t("Fold")} aria-expanded={!folded} onClick={onFold}>{folded ? "▸" : "▾"}</button> : <span className="caret" aria-hidden="true" />}
      <button type="button" className="tbtn" aria-pressed={on} onClick={onChoose}>{lead}<span translate="no">{label}</span>{hint && <small> {hint}</small>}</button>
      {warn && <span className="twarn" role="img" tabIndex={0} title={warn} aria-label={warn}>⚠</span>}
      {add && <button type="button" className="linklike tadd" onClick={add} disabled={addDisabled}>{t("+ Add")}</button>}
    </li>
  );
}
