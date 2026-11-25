// Small typed client for the Go API (reached through the /api proxy).

export interface User {
  id: number;
  email: string;
  name: string;
  isAdmin: boolean;
  hasPassword: boolean;
  hasGoogle: boolean;
  hasSSO?: boolean;
}

export interface ProjectSummary {
  id: string;
  name: string;
  thumbnail: string;
  /** Kind of building, only in the list ("" or missing: a farmhouse). */
  kind?: string;
  /** The folder (a map's name) the building is in; "" or missing: none. */
  folder?: string;
  version: number;
  /** The version the server's model files were made from; 0 or missing: it has none yet. */
  modelVersion?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Project extends ProjectSummary {
  data: Record<string, unknown>;
}

/** An imported item (see src/editor/assets.mjs for meta). */
export interface Asset {
  id: string;
  name: string;
  meta: Record<string, unknown>;
  files: { name: string; size: number }[];
  /** Shared with everyone (only the admin shares); only the owner (mine) can change it. */
  shared: boolean;
  mine: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A game object of a mod (editor/objects.mjs): a box in the mod's coordinates, standing on the ground, with its icon's place. Kept in the mod's plan data (data.objects). */
export interface ModObject {
  id: number;
  type: string;
  x: number;
  z: number;
  /** How high above the ground its bottom is; missing when 0. */
  y?: number;
  w: number;
  d: number;
  h: number;
  ix: number;
  iz: number;
  /** The turn round the Y axis in degrees, about the middle (a trough); left out when 0. */
  turn?: number;
  /** A fence has posts [[x, z] ...] instead of a box (its x, z, w, d and h are not there). */
  points?: [number, number][];
}

/** One post of a mod: a building or a prop (a project) with its place in the mod's plan and the mod type it is generated with ("" = as the building is). */
export interface ModPost {
  id: string;
  kind: "building" | "prop";
  /** The project's id. */
  ref: string;
  type: string;
  x: number;
  z: number;
  /** How high above the ground it stands (a sign on a roof). */
  y: number;
  rot: number;
  /** The project's name now (the mod follows it); "" and missing when it was deleted. */
  name: string;
  missing: boolean;
}

/** A folder of the app (the same for buildings, props and mods) and what is in it. */
export interface AppFolder { name: string; buildings: number; mods: number }

/** A mod: a container of buildings and props (docs/PLAN_MOD.md). The list has only itemCount; one mod has its items and plan data. */
export interface Mod {
  id: string;
  name: string;
  /** The app's folder it is in ("" or missing: none): the same folders as the buildings'. */
  folder?: string;
  /** A small picture of the mod (a data URL) that the page makes from its view; "" or missing: none yet. */
  thumbnail?: string;
  data?: Record<string, unknown>;
  items?: ModPost[];
  itemCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** A photo made into a game texture (private to its owner): the DDS files are at textureFileUrl. */
export interface Texture {
  id: string;
  name: string;
  /** The side in pixels (a power of two). */
  size: number;
  /** The real side of the texture in metres. */
  meters: number;
  /** A small JPEG data URL for the list. */
  thumb: string;
  createdAt: string;
  updatedAt: string;
}

/** A part of a building saved to be put on other buildings (the editor's part file is data; info: a few numbers for the list). */
export interface SavedPart {
  id: string;
  name: string;
  info: { parts?: number; windows?: number; items?: number };
  /** Only when one part is fetched. */
  data?: Record<string, unknown>;
  /** Shared with everyone (only the admin shares); only the owner (mine) changes it. */
  shared: boolean;
  mine: boolean;
  createdAt: string;
  updatedAt: string;
}

/** An API token for another program (token: the secret itself, only when it was just made). */
export interface ApiToken {
  id: string;
  name: string;
  prefix: string;
  token?: string;
  createdAt: string;
  lastUsedAt: string | null;
  /** May also create buildings and send their models (a token reads only otherwise). */
  write?: boolean;
}

/** A starting design the admin made for everyone, usually from photos (Claude suggests, the admin adjusts). */
export interface Template {
  id: string;
  kind: string;
  name: string;
  blurb: string;
  settings: Record<string, unknown>;
  thumbnail: string;
  /** Claude's last answer for the photos ({seen, settings, openings, notes}), or null. */
  suggestion: { seen?: string; notes?: string; [k: string]: unknown } | null;
  /** The admin's project it is adjusted in. */
  projectId: string;
  published: boolean;
  /** How many photos it has. */
  photos: number;
  createdAt: string;
  updatedAt: string;
}

export interface Invite {
  id: number;
  email: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public version?: number) {
    super(message);
  }
}

function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  return send<T>(method, path, body === undefined ? undefined : JSON.stringify(body), body === undefined ? undefined : { "Content-Type": "application/json" });
}

/** A request with a body as is (JSON text, or a FormData the browser encodes itself). */
async function send<T>(method: string, path: string, body?: BodyInit, headers?: HeadersInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api" + path, { method, headers, body, credentials: "same-origin", cache: "no-store" });
  } catch {
    throw new ApiError(0, "offline", "Can't reach the server. Check your connection.");
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, json?.error ?? "unknown", json?.message ?? `Request failed (${res.status}).`, json?.version);
  }
  return json as T;
}

/** Where photo n of a template is (an <img> src). */
export const templatePhotoUrl = (id: string, n: number) => `/api/templates/${encodeURIComponent(id)}/photos/${n}`;

export const api = {
  authConfig: () => request<{ google: boolean; sso?: boolean; ssoUrl?: string }>("GET", "/auth/config"),
  me: () => request<User>("GET", "/auth/me"),
  login: (email: string, password: string) => request<User>("POST", "/auth/login", { email, password }),
  signup: (input: { email: string; password: string; name: string; invite: string }) => request<User>("POST", "/auth/signup", input),
  logout: () => request<void>("POST", "/auth/logout"),
  invite: (token: string) => request<{ email: string }>("GET", "/invites/" + encodeURIComponent(token)),

  projects: () => request<ProjectSummary[]>("GET", "/projects"),
  project: (id: string) => request<Project>("GET", "/projects/" + encodeURIComponent(id)),
  createProject: (name?: string, data?: Record<string, unknown>) => request<Project>("POST", "/projects", { name, data }),
  updateProject: (id: string, patch: { name?: string; data?: Record<string, unknown>; thumbnail?: string; folder?: string; version?: number }) =>
    request<Project>("PATCH", "/projects/" + encodeURIComponent(id), patch),
  deleteProject: (id: string) => request<void>("DELETE", "/projects/" + encodeURIComponent(id)),
  /** The model files (obj, mtl, game mod zip) made from saved version `version`, for other programs to read. */
  putModel: (id: string, version: number, files: { obj: string; mtl: string; mod: Uint8Array; export?: Uint8Array }) => {
    const form = new FormData();
    form.append("obj", new Blob([files.obj], { type: "text/plain" }), "model.obj");
    form.append("mtl", new Blob([files.mtl], { type: "text/plain" }), "model.mtl");
    form.append("mod", new Blob([files.mod as BlobPart], { type: "application/zip" }), "mod.zip");
    if (files.export) form.append("export", new Blob([files.export as BlobPart], { type: "application/zip" }), "model.zip");
    return send<void>("PUT", "/projects/" + encodeURIComponent(id) + "/model?version=" + version, form);
  },
  duplicateProject: (id: string) => request<Project>("POST", "/projects/" + encodeURIComponent(id) + "/duplicate"),

  assets: () => request<Asset[]>("GET", "/assets"),
  /** Imports an item: form fields name, meta (JSON) and files. */
  importAsset: (form: FormData) => send<Asset>("POST", "/assets", form),
  updateAsset: (id: string, patch: { name?: string; meta?: Record<string, unknown>; shared?: boolean }) =>
    request<Asset>("PATCH", "/assets/" + encodeURIComponent(id), patch),
  /** New files (and settings) for an item of mine: it keeps its id. */
  replaceAsset: (id: string, form: FormData) => send<Asset>("PUT", "/assets/" + encodeURIComponent(id), form),
  deleteAsset: (id: string) => request<void>("DELETE", "/assets/" + encodeURIComponent(id)),
  assetFile: async (id: string, name: string) => {
    const res = await fetch(`/api/assets/${encodeURIComponent(id)}/files/${encodeURIComponent(name)}`, { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) throw new ApiError(res.status, "file", `Couldn't load ${name} (${res.status}).`);
    return res.arrayBuffer();
  },

  mods: () => request<Mod[]>("GET", "/mods"),
  mod: (id: string) => request<Mod>("GET", "/mods/" + encodeURIComponent(id)),
  /** The folders of the app: the ones that were made and the ones something is in, with what is in each. */
  folders: () => request<{ folders: AppFolder[] }>("GET", "/folders"),
  /** Makes a folder that nothing is in yet (making one that is there is fine). */
  createFolder: (name: string) => request<{ name: string }>("POST", "/folders", { name }),
  /** Renames a folder: what is in it, buildings, props and mods, follows. Not into a name that holds something (409). */
  renameFolder: (from: string, to: string) => request<{ name: string }>("POST", "/folders/rename", { from, to }),
  /** Deletes a folder: what is in it stays, in no folder. */
  deleteFolder: (name: string) => request<void>("DELETE", "/folders?name=" + encodeURIComponent(name)),
  createMod: (name: string) => request<Mod>("POST", "/mods", { name }),
  updateMod: (id: string, patch: { name?: string; folder?: string; thumbnail?: string; items?: Pick<ModPost, "id" | "kind" | "ref" | "type" | "x" | "z" | "y" | "rot">[]; data?: Record<string, unknown>; version?: number }) =>
    request<Mod>("PATCH", "/mods/" + encodeURIComponent(id), patch),
  deleteMod: (id: string) => request<void>("DELETE", "/mods/" + encodeURIComponent(id)),
  /** The game mod of the whole mod (a zip), made from saved version `version` of the mod, kept for other programs to fetch (GET /api/v1/mods/{id}/mod.zip). */
  putModPackage: (id: string, version: number, zip: Blob) =>
    send<void>("PUT", "/mods/" + encodeURIComponent(id) + "/package?version=" + version, zip, { "Content-Type": "application/zip" }),
  textures: () => request<Texture[]>("GET", "/textures"),
  /** Saves a texture: form fields name, size, meters, thumb and the files diffuse, normal, specular (DDS). */
  createTexture: (form: FormData) => send<Texture>("POST", "/textures", form),
  /** One DDS file of a texture: diffuse, normal or specular. */
  textureFile: async (id: string, kind: "diffuse" | "normal" | "specular") => {
    const res = await fetch(`/api/textures/${encodeURIComponent(id)}/${kind}`, { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) throw new ApiError(res.status, "file", `Couldn't load the ${kind} map (${res.status}).`);
    return res.arrayBuffer();
  },
  updateTexture: (id: string, patch: { name?: string; meters?: number }) => request<Texture>("PATCH", "/textures/" + encodeURIComponent(id), patch),
  deleteTexture: (id: string) => request<void>("DELETE", "/textures/" + encodeURIComponent(id)),

  tokens: () => request<ApiToken[]>("GET", "/tokens"),
  createToken: (name: string, write = false) => request<ApiToken>("POST", "/tokens", { name, write }),
  deleteToken: (id: string) => request<void>("DELETE", "/tokens/" + encodeURIComponent(id)),

  parts: () => request<SavedPart[]>("GET", "/parts"),
  part: (id: string) => request<SavedPart>("GET", "/parts/" + encodeURIComponent(id)),
  savePart: (input: { name: string; data: Record<string, unknown>; info?: Record<string, unknown>; shared?: boolean }) => request<SavedPart>("POST", "/parts", input),
  updatePart: (id: string, patch: { name?: string; shared?: boolean }) => request<SavedPart>("PATCH", "/parts/" + encodeURIComponent(id), patch),
  deletePart: (id: string) => request<void>("DELETE", "/parts/" + encodeURIComponent(id)),

  templates: () => request<Template[]>("GET", "/templates"),
  allTemplates: () => request<Template[]>("GET", "/admin/templates"),
  template: (id: string) => request<Template>("GET", "/admin/templates/" + encodeURIComponent(id)),
  /** Starts a template: form fields kind, name, blurb and photos. */
  createTemplate: (form: FormData) => send<Template>("POST", "/admin/templates", form),
  updateTemplate: (id: string, patch: { name?: string; blurb?: string; settings?: Record<string, unknown>; thumbnail?: string; projectId?: string; published?: boolean; suggestion?: object }) =>
    request<Template>("PATCH", "/admin/templates/" + encodeURIComponent(id), patch),
  deleteTemplate: (id: string) => request<void>("DELETE", "/admin/templates/" + encodeURIComponent(id)),
  /** Asks Claude to suggest settings from the photos (takes up to a few minutes). */
  suggestTemplate: (id: string, input: { guide: string; notes: string; schema: object }) =>
    request<Template>("POST", "/admin/templates/" + encodeURIComponent(id) + "/suggest", input),

  /** Whether the server can ask Claude itself (it has an ANTHROPIC_API_KEY). */
  visionStatus: () => request<{ enabled: boolean }>("GET", "/admin/vision"),

  invites: () => request<Invite[]>("GET", "/admin/invites"),
  createInvite: (email: string) => request<{ invite: Invite; link: string }>("POST", "/admin/invites", { email }),
  deleteInvite: (id: number) => request<void>("DELETE", "/admin/invites/" + id),
};

/** Where Google sign-in starts; a full page navigation, not fetch. */
export function googleStartUrl(invite?: string) {
  return "/api/auth/google/start" + (invite ? "?invite=" + encodeURIComponent(invite) : "");
}

/** Where sign-in with the map app (where the accounts live) starts; a full page navigation, not fetch. */
export function ssoStartUrl() {
  return "/api/auth/sso/start";
}

export const LOGIN_ERRORS: Record<string, string> = {
  not_invited: "That Google account doesn't have an invite. Ask the admin for one.",
  google_failed: "Google sign-in didn't work. Try again, or use your email and password.",
  sso_failed: "Signing in with the map app didn't work. Try again, or use your email and password.",
};
