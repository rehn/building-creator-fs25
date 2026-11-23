export const MOD_STEM: string;
export function propAreas(model: unknown): { level: { x0: number; x1: number; z0: number; z1: number }; clear: { x0: number; x1: number; z0: number; z1: number }; test: { min: number[]; max: number[] } };
export function exportMod(model: unknown, opts?: { name?: string; author?: string; description?: string; width?: number }): { files: Record<string, string | Uint8Array | null>; layout: import("./atlas.mjs").AtlasLayout; textures: string[] };
