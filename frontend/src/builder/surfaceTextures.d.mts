export interface SurfaceTexture { kind: string; label: string }
export const SURFACE_TEXTURES: SurfaceTexture[];
export function surfaceTextureId(kind: string, color: string): string;
export function parseSurfaceTextureId(id: string): { kind: string; color: string } | null;
export function surfaceTextureMeters(kind: string): number;
export function surfaceTextureMaps(id: string): { size: number; diffuse: Uint8ClampedArray; normal: Uint8ClampedArray } | null;
