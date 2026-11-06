export type Settings = Record<string, unknown>;
export interface EditorHandle {
  getSettings(): Settings;
  setSettings(settings: Settings): void;
  exportModel(name: string): Promise<void>;
  exportMod(name: string): Promise<void>;
  /** One building's mod files into a folder of a zip (for a mod of several buildings): the icon blob, description and author for the modDesc. */
  exportInto(dir: { file(name: string, data: unknown): unknown }, name: string): Promise<{ icon: Blob | null; description: string; author: string }>;
  exportSettings(name: string): void;
  importSettings(file: File): Promise<boolean>;
  snapshot(): string | null;
  toast(message: string): void;
  destroy(): void;
}
/** The user's imported items: the list (as the API sends it) and the contents of one of their files. */
export interface AssetSource {
  list(): Promise<unknown[]>;
  file(id: string, name: string): Promise<ArrayBuffer>;
}
export function createEditor(root: HTMLElement, options?: { initial?: Settings; onChange?: (settings: Settings) => void; author?: string; assets?: AssetSource }): EditorHandle;
export function slugify(name: string): string;
