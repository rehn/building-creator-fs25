// Who may show this app in an iframe: the FRAME_ANCESTORS variable (origins, space or comma separated), read when a request comes in.
// Not set: nobody ('none'), as the X-Frame-Options: DENY this replaces.
export function frameOrigins(env = process.env.FRAME_ANCESTORS) {
  return String(env ?? "").split(/[\s,]+/).filter((o) => /^https?:\/\/[^\s;'"]+$/.test(o));
}

export function frameAncestorsHeader(env = process.env.FRAME_ANCESTORS) {
  const origins = frameOrigins(env);
  return origins.length ? `frame-ancestors 'self' ${origins.join(" ")}` : "frame-ancestors 'none'";
}

// The origin the page tells when a building was saved: the first listed one.
export function parentOrigin(env = process.env.FRAME_ANCESTORS) {
  return frameOrigins(env)[0] ?? "";
}
