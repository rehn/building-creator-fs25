// Small typed client for the Go API (reached through the /api proxy).

export interface User {
  id: number;
  email: string;
  name: string;
  isAdmin: boolean;
  hasPassword: boolean;
  hasGoogle: boolean;
}

export interface ProjectSummary {
  id: string;
  name: string;
  thumbnail: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Project extends ProjectSummary {
  data: Record<string, unknown>;
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

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api" + path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
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

export const api = {
  authConfig: () => request<{ google: boolean }>("GET", "/auth/config"),
  me: () => request<User>("GET", "/auth/me"),
  login: (email: string, password: string) => request<User>("POST", "/auth/login", { email, password }),
  signup: (input: { email: string; password: string; name: string; invite: string }) => request<User>("POST", "/auth/signup", input),
  logout: () => request<void>("POST", "/auth/logout"),
  invite: (token: string) => request<{ email: string }>("GET", "/invites/" + encodeURIComponent(token)),

  projects: () => request<ProjectSummary[]>("GET", "/projects"),
  project: (id: string) => request<Project>("GET", "/projects/" + encodeURIComponent(id)),
  createProject: (name?: string, data?: Record<string, unknown>) => request<Project>("POST", "/projects", { name, data }),
  updateProject: (id: string, patch: { name?: string; data?: Record<string, unknown>; thumbnail?: string; version?: number }) =>
    request<Project>("PATCH", "/projects/" + encodeURIComponent(id), patch),
  deleteProject: (id: string) => request<void>("DELETE", "/projects/" + encodeURIComponent(id)),
  duplicateProject: (id: string) => request<Project>("POST", "/projects/" + encodeURIComponent(id) + "/duplicate"),

  invites: () => request<Invite[]>("GET", "/admin/invites"),
  createInvite: (email: string) => request<{ invite: Invite; link: string }>("POST", "/admin/invites", { email }),
  deleteInvite: (id: number) => request<void>("DELETE", "/admin/invites/" + id),
};

/** Where Google sign-in starts; a full page navigation, not fetch. */
export function googleStartUrl(invite?: string) {
  return "/api/auth/google/start" + (invite ? "?invite=" + encodeURIComponent(invite) : "");
}

export const LOGIN_ERRORS: Record<string, string> = {
  not_invited: "That Google account doesn't have an invite. Ask the admin for one.",
  google_failed: "Google sign-in didn't work. Try again, or use your email and password.",
};
