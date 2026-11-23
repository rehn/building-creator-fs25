export function confirmDialog(message: string, opts?: { title?: string; confirm?: string; danger?: boolean }): Promise<boolean>;
export function promptDialog(label: string, value?: string, opts?: { title?: string; confirm?: string; maxLength?: number }): Promise<string | null>;
export function formDialog(opts: { title?: string; fields: { label: string; value?: string; maxLength?: number; multiline?: boolean }[]; confirm?: string }): Promise<string[] | null>;
