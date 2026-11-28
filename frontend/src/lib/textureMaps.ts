// The maps of a texture a prop's material uses: one of the building surfaces (made here, builder/surfaceTextures.mjs) or one of the user's textures (read from the server).
import { api } from "@/lib/api";
import { decodeDds } from "@/editor/dds.mjs";
import { surfaceTextureMaps } from "@/builder/surfaceTextures.mjs";

/** The diffuse map as RGBA, top row first. */
export async function loadDiffuse(id: string): Promise<{ width: number; height: number; rgba: Uint8ClampedArray }> {
  const s = surfaceTextureMaps(id);
  if (s) return { width: s.size, height: s.size, rgba: s.diffuse };
  const d = decodeDds(new Uint8Array(await api.textureFile(id, "diffuse")));
  return { width: d.width, height: d.height, rgba: new Uint8ClampedArray(d.data) };
}

/** The diffuse and normal maps (square RGBA). */
export async function loadMaps(id: string): Promise<{ size: number; diffuse: Uint8ClampedArray; normal: Uint8ClampedArray }> {
  const s = surfaceTextureMaps(id);
  if (s) return s;
  const [d, n] = await Promise.all((["diffuse", "normal"] as const).map(async k => decodeDds(new Uint8Array(await api.textureFile(id, k)))));
  return { size: d.width, diffuse: new Uint8ClampedArray(d.data), normal: new Uint8ClampedArray(n.data) };
}
