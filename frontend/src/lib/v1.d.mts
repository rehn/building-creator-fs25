export function modelRequest(parts: string[]): { id: string; file: string } | null;
export function modelFile(settings: unknown, file: string, name?: string): { body: string; type: string; filename: string };
export function v1Headers(incoming: Headers): Headers;
