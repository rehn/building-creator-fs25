"use client";
import { t } from "@/i18n/index.mjs";
import { promptDialog } from "@/components/dialog.mjs";

const NEW = "\u0000new";

/** Asks for the name of a new folder; "" when none is given. */
export async function askFolderName(): Promise<string> {
  return (await promptDialog(t("Folder name"), "", { title: t("New folder…"), confirm: t("Create"), maxLength: 60 }))?.trim() ?? "";
}

/**
 * The choice of folder of a building, a prop or a mod (the folders are the app's own, useFolders): none, one of them, or a new one (asked for by name, made with onCreate, then chosen).
 */
export function FolderSelect({ value, folders, onChoose, onCreate, onError, disabled, label, className }: {
  value: string; folders: string[]; onChoose: (folder: string) => void; onCreate: (name: string) => Promise<void>;
  /** Told what went wrong when the folder could not be made (else nothing would show). */
  onError?: (message: string) => void;
  disabled?: boolean; label: string; className?: string;
}) {
  return (
    <select className={className} value={value} disabled={disabled} aria-label={label} onChange={async e => {
      let folder = e.target.value;
      if (folder === NEW) {
        folder = await askFolderName();
        if (!folder) return;
        try { await onCreate(folder); } catch (err) { onError?.((err as Error).message); return; }
      }
      if (folder !== value) onChoose(folder);
    }}>
      <option value="">{t("No folder")}</option>
      {folders.map(f => <option key={f} value={f} translate="no">{f}</option>)}
      <option value={NEW}>{t("New folder…")}</option>
    </select>
  );
}
