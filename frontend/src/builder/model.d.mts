export interface Part {
  id: number; name: string; shape: "box" | "cylinder";
  x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number;
  w: number; h: number; d: number; r: number; seg: number; color: string;
}
export interface BuilderProject { format: string; version: number; kind: "prop"; parts: Part[] }
export const FORMAT: string;
export const VERSION: number;
export const MAX_PARTS: number;
export const SHAPES: string[];
export function sanitize(raw?: unknown): BuilderProject;
export function partMesh(part: Part): { p: number[]; n: number[]; uv: number[]; i: number[] };
export function exportI3d(model: unknown, opts?: { name?: string }): { i3d: string; doc: unknown };
export function addPart(model: unknown, extra?: Partial<Part>): BuilderProject;
export function removePart(model: unknown, id: number): BuilderProject;
export function updatePart(model: unknown, id: number, patch: Partial<Part>): BuilderProject;
export function duplicatePart(model: unknown, id: number): BuilderProject;
export function turnMatrix(part: Part): number[][];
export function placedMesh(part: Part): { p: number[]; n: number[]; uv: number[]; i: number[] };
export function groundPart(model: unknown, id: number): BuilderProject;
