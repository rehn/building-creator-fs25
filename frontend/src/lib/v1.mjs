// /api/v1 (the token API) is the Go API's, with the model files it keeps (see backend/internal/api/models.go). Other programs can use the API's
// own port or this app's address: this is what the app's address sends on, the token and what is asked for and nothing of the browser's.

/** Headers to send to the Go API for /api/v1. */
export function v1Headers(incoming) {
  const out = new Headers();
  for (const k of ["authorization", "accept", "if-none-match", "user-agent", "x-forwarded-for"]) {
    const v = incoming.get(k);
    if (v !== null) out.set(k, v);
  }
  return out;
}
