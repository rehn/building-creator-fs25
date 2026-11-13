export type Settings = Record<string, unknown>;
export interface EditorHandle {
  getSettings(): Settings;
  setSettings(settings: Settings): void;
  exportModel(name: string): Promise<void>;
  exportMod(name: string): Promise<void>;
  /** One building's mod files into a folder of a zip (for a mod of several buildings): the icon blob, description and author for the modDesc. */
  exportInto(dir: { file(name: string, data: unknown): unknown }, name: string, prefix?: string): Promise<{ icon: Blob | null; description: string; author: string }>;
  /** The model files the server keeps (for other programs): OBJ and MTL text and the game mod zip. Of these settings, or the editor's own. */
  modelFiles(name: string, settings?: Settings): Promise<{ obj: string; mtl: string; mod: Uint8Array; export?: Uint8Array }>;
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
/** The user's saved parts (and the shared ones): the list, one with its file, save, rename or share, delete, and whether the user is the admin (who shares). */
export interface PartSource {
  list(): Promise<any[]>;
  get(id: string): Promise<any>;
  save(input: { name: string; data: any; info?: any; shared?: boolean }): Promise<any>;
  update(id: string, patch: { name?: string; shared?: boolean }): Promise<any>;
  remove(id: string): Promise<void>;
  isAdmin(): Promise<boolean>;
}
export function createEditor(root: HTMLElement, options?: { initial?: Settings; onChange?: (settings: Settings) => void; author?: string; assets?: AssetSource; parts?: PartSource }): EditorHandle;
export function slugify(name: string): string;
