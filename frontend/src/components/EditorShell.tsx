"use client";
import Link from "next/link";
import type { ChangeEvent, ReactNode } from "react";
import type { User } from "@/lib/api";
import { TopBar } from "./TopBar";

/**
 * The frame of the pages where one thing is edited (a building, a prop, a mod): the top bar, then the sub-bar (back to the list, the name, what is
 * saved, the page's own buttons), then the page's work area, which fills what is left of the window. docs/DESIGN.md "Editor pages".
 */
export function EditorShell({ user, back, nameId, nameLabel, name, onName, onCommitName, nameDisabled = false, status, bad = false, notes, actions, children }: {
  user: User | null;
  /** The list this thing is in: where "‹ …" goes, the words after the arrow and what a screen reader says. */
  back: { href: string; label: string; aria: string };
  nameId: string;
  nameLabel: string;
  name: string;
  onName: (value: string) => void;
  onCommitName: () => void;
  nameDisabled?: boolean;
  /** What the sub-bar says about saving, and whether that is a problem. */
  status: string;
  bad?: boolean;
  /** More short messages after the status. */
  notes?: ReactNode;
  /** The page's own buttons, at the end of the sub-bar. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="editor-page">
      <TopBar user={user} />
      <div className="editor-bar">
        <Link className="btn back" href={back.href} aria-label={back.aria}>‹ {back.label}</Link>
        <label className="sr" htmlFor={nameId}>{nameLabel}</label>
        <input
          id={nameId} className="name" value={name} maxLength={100} disabled={nameDisabled}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onName(e.target.value)} onBlur={onCommitName}
          onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        />
        <span className={"status" + (bad ? " bad" : "")} role="status">{status}</span>
        {notes}
        {actions}
      </div>
      {children}
    </div>
  );
}
