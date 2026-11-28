import type { BuilderProject } from "./model.mjs";
export interface BuilderView {
  show(model: BuilderProject, selectedId: number | null, selectedFace?: string | null): void;
  frame(model: BuilderProject): void;
  setTexture(id: string, picture: { width: number; height: number; rgba: Uint8Array | Uint8ClampedArray }): void;
  hasTexture(id: string): boolean;
  /** "object": a click chooses a part and a drag moves it; "material": a click chooses a face of a part. */
  setMode(mode: "object" | "material"): void;
  snapshot(): string | null;
  picture(size: number): Promise<{ width: number; height: number; rgba: Uint8ClampedArray } | null>;
  dispose(): void;
}
export function createBuilderView(canvas: HTMLCanvasElement, opts?: { onPick?: (id: number | null, face: string | null) => void; onMoveEnd?: (id: number, at: { x: number; y: number; z: number }) => void }): BuilderView;
