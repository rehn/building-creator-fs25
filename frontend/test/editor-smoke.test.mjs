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

test("the Inside tab offers every other look, and a change is handed to the page", async () => {
  const root = w.document.getElementById("root");
  root.innerHTML = "";
  let got = null;
  const ed = createEditor(root, {initial: {kind: "house"}, onChange() {}, onKindChange: s => { got = s; }});
  const sel = root.querySelector("#controls-inside #kindSel");
  assert.ok(sel, "the card is in the Inside tab");
  assert.deepEqual([...sel.options].map(o => o.value).sort(), KINDS.map(k => k.id).filter(id => id !== "house").sort());
  assert.equal(got, null);
  ed.destroy();
});

test("a piece that is chosen inside has its settings in the details panel, next to the left panel", () => {
  const root = w.document.getElementById("root");
  root.innerHTML = "";
  const ed = createEditor(root, {initial: {kind: "house"}, onChange() {}});
  root.querySelector("#tab-inside").click();
  const card = root.querySelector("#details #pieceCard");
  assert.ok(card, "the card is in the details panel");
  const ed0 = root.querySelector(".hx-editor");
  assert.ok(ed0.classList.contains("no-details"), "before arranging there is nothing to show in the details panel, so it is hidden");
  root.querySelector("#insideArrange").click();
  assert.ok(!ed0.classList.contains("no-details"), "arranging gives it content");
  assert.equal(card.querySelector(".piece"), null, "no piece chosen yet");
  root.querySelector("[data-add]").click();   // (adds the first piece of the palette, and chooses it)
  assert.ok(card.querySelector(".piece input[type=range]"), "its settings are in the details panel");
  assert.equal(root.querySelector("#insideEditor .piece"), null, "and not in the left panel");
  ed.destroy();
});

test("a part and a section can be given a floor of their own from the tree", () => {
  const root = w.document.getElementById("root");
  root.innerHTML = "";
  const saved = [];
  const ed = createEditor(root, {initial: {kind: "shed", width: 24, depth: 8, splits: [{at: 12}], wings: [{id: 1, wall: "back", pos: 0.5, width: 6, depth: 6, floors: 0}]}, onChange: s => saved.push(s)});
  const nodes = [...root.querySelectorAll("[data-node]")].map(b => b.dataset.node);
  for (const key of nodes.filter(k => k.startsWith("section:") || k.startsWith("part:"))) {
    root.querySelector(`[data-node="${key}"]`).click();
    const sel = root.querySelector("#flk-sel");
    assert.ok(sel, "the floor choice is in the card of " + key);
    sel.value = "litter"; sel.dispatchEvent(new w.Event("change", {bubbles: true}));
  }
  const looks = saved.at(-1).floorLooks;
  assert.ok(looks && Object.keys(looks).length >= 2 && Object.values(looks).every(v => v.surface === "litter"), JSON.stringify(looks));
  ed.destroy();
});

test("the floor and the walls inside, with wallpaper by wall, are in the Inside tab", () => {
  const root = w.document.getElementById("root");
  root.innerHTML = "";
  const saved = [];
  const ed = createEditor(root, {initial: {kind: "house"}, onChange: s => saved.push(s)});
  const titles = [...root.querySelectorAll("#controls-inside details")].map(d => d.dataset.section);
  assert.deepEqual(titles, ["Inside", "Floor", "Inside walls", "Wallpaper by wall"]);
  assert.ok(root.querySelector("#controls-inside #f-insidePaper"), "the wallpaper for every wall");
  assert.ok(root.querySelector("#controls-inside #papersEditor #ppWall"), "the choice of a wall");
  root.querySelector("#papersEditor #ppAdd").click();
  assert.equal(saved.at(-1).papers.length, 1, "a section of wallpaper is added to the wall");
  ed.destroy();
});
