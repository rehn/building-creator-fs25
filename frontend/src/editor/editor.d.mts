export type Settings = Record<string, unknown>;
export interface EditorHandle {
  getSettings(): Settings;
  setSettings(settings: Settings): void;
  exportModel(name: string): Promise<void>;
  exportMod(name: string): Promise<void>;
  exportSettings(name: string): void;
  importSettings(file: File): Promise<boolean>;
  snapshot(): string | null;
  toast(message: string): void;
  destroy(): void;
}
export function createEditor(root: HTMLElement, options?: { initial?: Settings; onChange?: (settings: Settings) => void; author?: string }): EditorHandle;
export function slugify(name: string): string;
