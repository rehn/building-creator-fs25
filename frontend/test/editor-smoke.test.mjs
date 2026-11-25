// The building editor starts and takes a few clicks for every kind of building (jsdom, a fake WebGL context): a crash at start-up
// (a control that is not there any more) is caught here and not in the browser.
import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { KINDS } from "../src/editor/kinds/index.mjs";

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {pretendToBeVisual: true, url: "http://localhost/"});
const w = dom.window;
for (const k of ["document", "navigator", "HTMLElement", "Node", "MutationObserver", "localStorage", "requestAnimationFrame", "cancelAnimationFrame", "getComputedStyle", "Element", "Event", "KeyboardEvent", "PointerEvent", "MouseEvent", "CustomEvent", "DOMParser", "HTMLCanvasElement", "Image", "FileReader", "Blob"]) {
  try { if (w[k] !== undefined) Object.defineProperty(globalThis, k, {value: w[k], configurable: true, writable: true}); } catch { /* read-only in this node */ }
}
globalThis.window = w;
w.matchMedia = globalThis.matchMedia = () => ({matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}});
w.ResizeObserver = globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
w.Element.prototype.scrollIntoView = function () {};
// a context that answers everything with something harmless, so that three.js starts
const gl = new Proxy({}, {get(t, k) {
  if (k === "VERSION") return 7938;
  if (k === "SHADING_LANGUAGE_VERSION") return 35724;
  if (k === "getParameter") return q => (q === 7938 ? "WebGL 1.0" : q === 35724 ? "WebGL GLSL ES 1.00" : q === 7937 ? "fake" : 16);
  if (k === "getExtension") return () => null;
  if (k === "getShaderPrecisionFormat") return () => ({rangeMin: 127, rangeMax: 127, precision: 23});
  if (k === "getContextAttributes") return () => ({alpha: false, antialias: true, depth: true, stencil: true, premultipliedAlpha: true});
  if (k === "canvas") return w.document.createElement("canvas");
  if (k === "isContextLost") return () => false;
  if (k === "getProgramParameter" || k === "getShaderParameter") return () => true;
  if (k === "getProgramInfoLog" || k === "getShaderInfoLog") return () => "";
  if (k === "getSupportedExtensions") return () => [];
  if (typeof k === "symbol") return undefined;
  if (/^[A-Z_0-9]+$/.test(k)) return 1;
  return () => ({});
}});
w.HTMLCanvasElement.prototype.getContext = function (type) {
  return type === "2d" ? new Proxy({}, {get: (t, k) => k === "canvas" ? this : k === "measureText" ? () => ({width: 10})
    : k === "getImageData" || k === "createImageData" ? (x, y, ww, hh) => ({data: new Uint8ClampedArray((hh === undefined ? x * y : ww * hh) * 4), width: hh === undefined ? x : ww, height: hh === undefined ? y : hh})
    : () => ({addColorStop() {}}), set: () => true}) : gl;
};
// (three.js says what its fake context lacks: not interesting here)
const warn = console.warn; console.warn = (...a) => { if (!/extension not supported/.test(String(a[0]))) warn(...a); };

const { createEditor } = await import("../src/editor/editor.mjs");

for (const kind of KINDS.map(k => k.id)) {
  test(`the editor starts and takes clicks: ${kind}`, () => {
    const root = w.document.getElementById("root");
    root.innerHTML = "";
    const ed = createEditor(root, {initial: {kind}, onChange() {}});
    const range = root.querySelector("input[type=range]");
    range.value = range.min; range.dispatchEvent(new w.Event("input", {bubbles: true}));
    for (const t of ["building", "inside", "settings"]) { const b = root.querySelector(`[data-tab="${t}"]`); if (b) b.click(); }
    const nodes = [...root.querySelectorAll("[data-node]")];
    assert.ok(nodes.length > 1, "the tree has nodes");
    for (const b of nodes) b.click();
    ed.destroy();
  });
}
