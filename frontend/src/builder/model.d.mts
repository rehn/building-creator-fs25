export interface Part {
  id: number; name: string; shape: "box" | "cylinder";
  x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number;
  w: number; h: number; d: number; r: number; seg: number; color: string;
  /** face id -> material id (a face drawn in a material row instead of the part\u2019s colour) */
  faces: Record<string, number>;
}
export interface MaterialTexture { id: string; meters: number }
export interface Material { id: number; name: string; color: string; texture: MaterialTexture | null }
export interface Face { id: string; label: string }
export interface BuilderProject { format: string; version: number; kind: "prop"; materials: Material[]; parts: Part[] }
export const FORMAT: string;
export const VERSION: number;
export const MAX_PARTS: number;
export const SHAPES: string[];
export function sanitize(raw?: unknown): BuilderProject;
export function partMesh(part: Part): { p: number[]; n: number[]; uv: number[]; i: number[] };
export function exportI3d(model: unknown, opts?: { name?: string; withTextures?: boolean }): { i3d: string; doc: unknown; textures: string[] };
export function textureFiles(id: string): { diffuse: string; normal: string; specular: string };
export function partUv(model: BuilderProject, part: Part): number[];
export function faceMaterial(model: BuilderProject, part: Part, faceId: string): Material | null;
export function addPart(model: unknown, extra?: Partial<Part>): BuilderProject;
export function removePart(model: unknown, id: number): BuilderProject;
export function updatePart(model: unknown, id: number, patch: Partial<Part>): BuilderProject;
export function duplicatePart(model: unknown, id: number): BuilderProject;
export function turnMatrix(part: Part): number[][];
export function placedMesh(part: Part): { p: number[]; n: number[]; uv: number[]; i: number[] };
export function groundPart(model: unknown, id: number): BuilderProject;
export const MAX_MATERIALS: number;
export function partFaces(part: Part): Face[];
export function faceOfTriangle(part: Part): string[];
export function faceColor(model: BuilderProject, part: Part, faceId: string): string;
export function addMaterial(model: unknown, extra?: Partial<Material>): BuilderProject;
export function updateMaterial(model: unknown, id: number, patch: Partial<Material>): BuilderProject;
export function removeMaterial(model: unknown, id: number): BuilderProject;
export function setFaceMaterial(model: unknown, partId: number, faceId: string, materialId: number | null): BuilderProject;
