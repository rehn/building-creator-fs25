// When the app runs in an iframe (the map app), it tells the page around it that a building was saved, so that page can fetch the change.
// The origin to tell comes from the server's /config (FRAME_ANCESTORS); without one nothing is sent (never "*").
let origin = "";
export function setParentOrigin(o) { origin = typeof o === "string" ? o : ""; }

export function notifyBuildingSaved(id, version, win = globalThis.window) {
  if (!win || !origin || win.parent === win) return false;
  win.parent.postMessage({ type: "fs25-building-saved", id, version }, origin);
  return true;
}
