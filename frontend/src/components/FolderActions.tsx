"use client";
import { t } from "@/i18n/index.mjs";
import { confirmDialog, promptDialog } from "@/components/dialog.mjs";

/**
 * Rename and delete for the folder that is shown (the tabs of the lists of buildings and mods; the folders are the app's own). Deleting takes what is in it out of it, and
 * deletes none of that. `onRename` and `onDelete` do it on the server and in the list; what goes wrong is told to `onError`.
 */
export function FolderActions({ folder, disabled, onRename, onDelete, onError }: {
  folder: string; disabled?: boolean;
  onRename: (to: string) => Promise<void>; onDelete: () => Promise<void>; onError: (message: string) => void;
}) {
  const rename = async () => {
    const to = (await promptDialog(t("Folder name"), folder, { title: t("Rename folder"), confirm: t("Rename"), maxLength: 60 }))?.trim() ?? "";
    if (!to || to === folder) return;
    try { await onRename(to); } catch (e) { onError((e as Error).message); }
  };
  const remove = async () => {
    if (!await confirmDialog(t("Delete the folder “{name}”? What is in it stays, in no folder.", { name: folder }), { title: t("Delete"), confirm: t("Delete"), danger: true })) return;
    try { await onDelete(); } catch (e) { onError((e as Error).message); }
  };
  return (
    <>
      <button type="button" className="starttab link" onClick={rename} disabled={disabled}>{t("Rename folder")}</button>
      <button type="button" className="starttab link" onClick={remove} disabled={disabled}>{t("Delete folder")}</button>
    </>
  );
}
