export const MAX_ROTATE: number;
export const MIN_SIZE: number, MAX_SIZE: number, DEFAULT_SIZE: number;
export interface Crop { x: number; y: number; w: number; h: number }
export interface PhotoTexture { size: number; meters: number; diffuse: Uint8ClampedArray; normal: Uint8ClampedArray; specular: Uint8ClampedArray }
export function nearestPow2(n: number): number;
export function makePhotoTexture(
  img: { width: number; height: number; rgba: Uint8ClampedArray },
  opts?: { size?: number; crop?: Partial<Crop>; rotate?: number; flatten?: number; seamless?: boolean; bump?: number; meters?: number },
): PhotoTexture;
export function photoTextureDds(t: PhotoTexture): { diffuse: Uint8Array; normal: Uint8Array; specular: Uint8Array };
export function squareCrop(W: number, H: number, opts?: { zoom?: number; cx?: number; cy?: number }): Crop;
