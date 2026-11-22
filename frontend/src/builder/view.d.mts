import type { BuilderProject } from "./model.mjs";
export interface BuilderView {
  show(model: BuilderProject, selectedId: number | null, selectedFace?: string | null): void;
  frame(model: BuilderProject): void;
  snapshot(): string | null;
  dispose(): void;
}
export function createBuilderView(canvas: HTMLCanvasElement, opts?: { onPick?: (id: number | null, face: string | null) => void }): BuilderView;
