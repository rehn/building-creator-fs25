import type { BuilderProject, Part } from "./model.mjs";
export interface AtlasRow { key: string; smoothness: number; metalness: number; kind: "color" | "texture"; color?: string; textureId?: string; tiles: number; y: number; h: number }
export interface AtlasLayout { width: number; height: number; fits: boolean; rows: AtlasRow[] }
export interface TextureMaps { size: number; diffuse: Uint8ClampedArray; normal: Uint8ClampedArray }
export const MIN_WIDTH: number, PAD: number, COLOR_H: number, MAX_TILES: number, MAX_HEIGHT: number;
export function atlasLayout(model: unknown, opts?: { width?: number; autoWidth?: boolean }): AtlasLayout;
export function partAtlasUv(model: unknown, part: Part, layout: AtlasLayout): number[];
export function atlasPixels(layout: AtlasLayout, load: (id: string) => TextureMaps | null): { diffuse: Uint8ClampedArray; normal: Uint8ClampedArray; specular: Uint8ClampedArray };
export function atlasFiles(name: string): { diffuse: string; normal: string; specular: string };
export function atlasDdsFiles(layout: AtlasLayout, load: (id: string) => TextureMaps | null): { diffuse: Uint8Array; normal: Uint8Array; specular: Uint8Array };
export function exportI3dAtlas(model: unknown, opts?: { name?: string; width?: number; binary?: boolean; collision?: boolean; extraNodes?: unknown[] }): { i3d: string; shapes: Uint8Array | null; doc: unknown; root: unknown; layout: AtlasLayout; textures: string[] };
