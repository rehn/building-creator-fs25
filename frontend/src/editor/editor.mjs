// The house editor: controls, 3D preview and export, mounted into a DOM element.
// All model logic (settings, geometry, i3d) lives in model.mjs.
import * as THREE from "three";
import JSZip from "jszip";
import { t } from "../i18n/index.mjs";
import { walkArea, areaOf, cellRects } from "./walkarea.mjs";
import {
  SCHEMA, TABS, fieldsFor, WALLS, WALL_NAMES, DTYPES, DORM_DEF, MATS, fittingTextures,
  genRow, sanitize, serialize, slugify, buildGeometry, buildI3d, placeableSnippet, gamePlaces, surfaceSpec, scaledUV, colorFor, WP
} from "./model.mjs";
import { WINDOW_STYLES, DOOR_STYLES, PORCH_OPTIONS, PORCH_W, PORCH_D, WING_FIELDS, MAX_WINGS } from "./model.mjs";
import { pieceSheet, pieceMeshes, buildingTree, matList, matTable, slotOf, partStyle, splitAtOf, wallLabel, partName, wallItems, addOpening, addPartOn, addSplit, addPartSplit, duplicateOpening, duplicateSplit, moveBeside, moveToWall, openingProblem, setSectionFloorHeight, setTotalHeight, addPartDoor } from "./model.mjs";
import { lodKeeps } from "./model.mjs";
import { GLASS_ALPHA, ROOM_OPTIONS, CURTAIN_OPTIONS, MOD_FILES, modName, modDescXml, placeableXml, defaultModDescription, henYard, henCap, seeThroughGlass, kindOf } from "./model.mjs";
import { cowYard } from "./kinds/cow.mjs";
import { WALLPAPERS } from "./kinds/innerwall.mjs";
import { evalNumber } from "./calc.mjs";
import { DOUBLE_DOOR_FROM } from "./openings.mjs";
import { cleanPapers, wallBreaks, pieceGroups, roomOf, problems, footprint, snapItem, itemAt, placeNew, rotateItem, History, roomBox, wingsOf, liveWings, isSplitWall, MAX_SPLITS, wingSplitKey, sectionsOf, sectionRuns, splitsOf, maxFloors, maxFloorsWithAttic, wallFloorAt, dividerAt, splitAtFrom, floorsOf as floorHeightsOf, wingIdOf, wingWallKey, WING_PARTS, wallsOf, eaveWalls, autoPipes, pipePositions } from "./layout.mjs";
import { makeWalker } from "./walk.mjs";
import { exportPart, importPart } from "./partfile.mjs";
import { modelBundle } from "./bundle.mjs";
import { OBJECT_TYPES, objectInfo, OBJECT_LIMITS, GAP_LIMITS, objectOf, pastureOf, snapBox, snapPasture, objectProblems, objectWarnings, fencePoints, snapFencePoint, MAX_FENCE_POINTS, MANY, MAX_TROUGHS, nextTroughSpot, TROUGH_KINDS } from "./objects.mjs";
import { setAssets, catalogFor, usedAssets, troughLooks } from "./model.mjs";
import { readObj, assetFolder, flattenI3d, assetSize, normalizeMeta, turnedSize } from "./assets.mjs";
import { paintInterior, paintGlass } from "./interior.mjs";
import { SURFACES, paintSurface, normalFromHeight } from "./surfaces.mjs";
import { weather, MASK_RGB } from "./age.mjs";
import { splitBySurface } from "./i3d.mjs";
export { slugify };

const lerp = (a, b, t) => a + (b - a) * t;
/** Text for innerHTML (names of imported items are the user's own text). */
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// The settings are in one panel with a tab for each thing you do (TABS: building, inside, settings, game) and a search box that looks
// through all of them. On narrow screens the panel goes under the preview (see globals.css).
const MARKUP = `<div class="hx-editor" data-tab="building">
  <div class="hx-tabs" role="tablist" aria-label="Settings">
    ${TABS.map(([id, name]) => `<button type="button" role="tab" id="tab-${id}" aria-controls="panel">${name}</button>`).join("")}
  </div>
  <aside class="hx-panel" id="panel" role="tabpanel" aria-label="Settings">
    <div class="hx-search"><input type="search" id="settingsSearch" placeholder="Search all settings…" aria-label="Search all settings" autocomplete="off"><button type="button" id="searchClear" hidden aria-label="Clear the search">\u00D7</button></div>
    ${TABS.map(([id, name]) => `<div class="hx-tabbody" id="controls-${id}" data-tab="${id}"><h2 class="hx-side">${name}</h2></div>`).join("")}
    <div class="hx-tabbody" id="controls-shape" data-tab="shape" hidden></div>
    <p class="hint hx-nomatch" id="noMatches" hidden>Nothing matches. Try another word, like \u201Croof\u201D, \u201Ccolor\u201D or \u201Cdoor\u201D.</p>
  </aside>
  <aside class="hx-panel hx-details" id="details" aria-label="Details of what is chosen in the tree">
    <div class="hx-subtabs" id="mainSubtabs" role="tablist" hidden><button type="button" role="tab" data-sub="shape">Shape</button><button type="button" role="tab" data-sub="look">Look</button></div>
    <div id="mainShapeHost"></div><div id="mainCard"></div><div id="mainShapeHost2"></div><div id="wallCard"></div><div id="winEditor"></div><div id="wingsEditor"></div>
  </aside>
  <div class="hx-rz" id="rz1" role="separator" aria-orientation="vertical" tabindex="0" aria-label="Resize the left panel"></div>
  <div class="hx-rz" id="rz2" role="separator" aria-orientation="vertical" tabindex="0" aria-label="Resize the details panel"></div>
  <section class="hx-stage" id="stage" aria-label="3D preview">
    <canvas id="view"></canvas>
    <div class="readout" id="readout"></div>
    <div class="orbit-hint" id="orbitHint">Drag to orbit · right-drag or Shift+drag to move · scroll to zoom · double-click to look from there</div>
    <button type="button" class="hx-walk" id="walkBtn" title="See the building as a person walking round and in it">Walk around</button>
    <button type="button" class="hx-walk hx-walk2" id="walkAreaBtn" aria-pressed="false" hidden title="Where the animals can walk: in the yard, and inside the building where they can go in">Show where the animals can walk</button>
    <button type="button" class="hx-walk hx-walk3" id="lodBtn" aria-pressed="false" hidden title="Switch between the detailed model and the simple one the game shows from far away (set the distance under Game > Shop and mod)">Detail: close up</button>
    <div class="hx-inside-bar" id="insideBar" hidden>
      <div class="seg" role="group" aria-label="View">
        <button type="button" id="viewPlan" aria-pressed="true">Plan</button><button type="button" id="view3d" aria-pressed="false">3D</button>
      </div>
      <button type="button" id="insideUndo" title="Undo (Ctrl+Z)">Undo</button>
      <button type="button" id="insideRedo" title="Redo (Ctrl+Y)">Redo</button>
      <button type="button" id="insideDone" class="primary">Done</button>
    </div>
  </section>
  <div id="toast" class="hx-toast" role="status" aria-live="polite"></div>
  <dialog id="textDlg" class="hx-dialog">
    <h2 id="dlgTitle">Copy file</h2>
    <p class="hint">The download didn\u2019t start. Copy this text into a new file with the name below.</p>
    <textarea id="dlgText" readonly></textarea>
    <div class="row"><button id="dlgCopy" type="button">Copy</button><button id="dlgClose" class="primary" type="button">Close</button></div>
  </dialog>
</div>`;


/**
 * Mounts the editor in root.
 * options.initial: saved settings to start from
 * options.onChange(settings): called after every edit with the settings to save
 * options.assets: the user's imported items, {list(), file(id, name)} (see editor.d.mts)
 * Returns {getSettings, setSettings, exportModel, exportSettings, importSettings, snapshot, toast, destroy}.
 */
export function createEditor(root, {initial, onChange, author = "", assets = null, parts: partSource = null} = {}) {
root.innerHTML = MARKUP;
const $ = id => root.querySelector("#" + id);
const cleanups = [];
let destroyed = false, raf = 0;
let p = sanitize(initial || {});
let G = null, dims = {}, opsByWall = {};
function persist() { if (!destroyed && onChange) onChange(serialize(p)); }

// Which sections are open, and which tab: remembered in this browser only (a convenience).
const remember = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private window etc. */ } },
};
const openState = remember.get("hx-open-sections") || {};
const sideSeen = {};
const editorEl = root.querySelector(".hx-editor");
/**
 * Every slider's number can be clicked and typed over: a small box with the value, where a sum works too ("10+100" gives 110).
 * Enter or leaving the box sets it (kept within the slider's range and step, the slider's own handlers do the rest), Escape cancels.
 * A slider whose number is not its own value (a position as a fraction of the wall, shown in metres) says so with data-scale.
 */
function installNumberEntry() {
  const onClick = ev => {
    const out = ev.target.closest && ev.target.closest("output"), field = out && out.closest(".field"), slider = field && field.querySelector("input[type=range]");
    if (!slider || slider.disabled || field.querySelector("input.numin")) return;
    const scale = +slider.dataset.scale || 1, offset = +slider.dataset.offset || 0, unit = (out.textContent.match(/\s*(m|°|%)\b/) || [])[1];
    const box = document.createElement("input");
    box.type = "text"; box.className = "numin"; box.inputMode = "decimal"; box.value = String(+(offset + slider.value * scale).toFixed(3));
    box.setAttribute("aria-label", "Type a value; a sum like 10+100 works");
    out.hidden = true; out.after(box); box.focus(); box.select();
    let done = false;
    const finish = commit => {
      if (done) return;
      done = true;
      if (commit) {
        const v = evalNumber(box.value);
        if (v === null) toast("That is not a number");
        else {
          const raw = (v - offset) / scale, lo = +slider.min, hi = +slider.max;
          if (scale !== 1) slider.step = "any";   // (a position in metres is typed to the centimetre, finer than the slider's steps)
          slider.value = String(Math.min(hi, Math.max(lo, raw)));
          slider.dispatchEvent(new Event("input", {bubbles: true})); slider.dispatchEvent(new Event("change", {bubbles: true}));
          if (raw < lo - 1e-9 || raw > hi + 1e-9) toast(`Kept within the range ${+(offset + lo * scale).toFixed(2)} to ${+(offset + hi * scale).toFixed(2)}${unit ? " " + unit : ""}`);
        }
      }
      if (box.isConnected) box.remove();
      if (out.isConnected) out.hidden = false;
    };
    // (keys stay in the box: R, Delete and the other shortcuts of the editor are not for it)
    box.onkeydown = k => { if (k.key === "Enter") { k.preventDefault(); finish(true); } else if (k.key === "Escape") { k.preventDefault(); finish(false); } k.stopPropagation(); };
    box.onblur = () => finish(true);
  };
  editorEl.addEventListener("click", onClick);
  cleanups.push(() => editorEl.removeEventListener("click", onClick));
}
let searching = false;
// (the Shape tab's sections: shown in the details panel while the main building is chosen in the tree, see placeShape; declared early, setTab uses them when the editor starts)
const shapeSections = [];
// (the main building's two groups of cards; declared here because setTab runs placeShape before the rest of the file is read)
const SHAPE_FIRST = ["Size", "Roof", "Kupor (dormers)", "Open sides"], SHAPE_THEN = ["Surfaces", "Inside walls"];
let mainSub = remember.get("hx-main-sub") === "look" ? "look" : "shape";
const subtabs = $("mainSubtabs");
if (subtabs) subtabs.onclick = e => { const b = e.target.closest("[data-sub]"); if (!b) return; mainSub = b.dataset.sub; remember.set("hx-main-sub", mainSub); placeShape(); };
let mainChosen = false;
const openBeforeSearch = new Map();
/** Whether text matches every word of the query. */
const matches = (text, words) => words.every(w => text.includes(w));
/**
 * Searching: every tab shows at once (each section's summary names its tab); a section stays if its name or text has all the words, and in a
 * section that only matches through some of its settings the other settings go. A section opens while it is found and goes back when the search ends.
 */
function applySearch() {
  const words = $("settingsSearch").value.toLowerCase().split(/\s+/).filter(Boolean);
  $("searchClear").hidden = !words.length;
  const was = searching; searching = words.length > 0;
  editorEl.classList.toggle("searching", searching);
  placeShape();
  if (!searching) {
    if (was) {
      for (const d of editorEl.querySelectorAll(".hx-panel details")) { d.classList.remove("nomatch"); d.querySelectorAll(".nomatch").forEach(x => x.classList.remove("nomatch")); if (openBeforeSearch.has(d)) d.open = openBeforeSearch.get(d); }
      openBeforeSearch.clear(); $("noMatches").hidden = true;
    }
    setTab(editorEl.dataset.tab); return;
  }
  if (!was) editorEl.querySelectorAll(".hx-panel details").forEach(d => openBeforeSearch.set(d, d.open));
  for (const [s] of TABS) $("controls-" + s).hidden = false;
  $("controls-shape").hidden = false;   // (the main building's sections, which the search looks in too: they are in the details panel only while the main building is chosen)
  let any = false;
  for (const d of editorEl.querySelectorAll(".hx-panel details")) {
    if (d.hidden) continue;
    const head = (d.querySelector("summary").textContent + " " + d.dataset.section + " " + d.querySelector("summary").dataset.tabname).toLowerCase();
    const rows = [...d.querySelectorAll(":scope > div:not([id]) > [data-k]")];
    const rowText = rows.map(r => r.textContent.toLowerCase());
    const custom = d.querySelector(":scope > div[id$='Editor']"), bodyText = custom ? custom.textContent.toLowerCase() : "";   // (a list the section builds, not its help text)
    const titleHit = matches(head, words), rowHits = rows.map((_, i) => matches(rowText[i], words)), someRow = rowHits.some(Boolean);
    const hit = titleHit || someRow || (!!custom && matches(bodyText, words));
    d.classList.toggle("nomatch", !hit);
    rows.forEach((r, i) => r.classList.toggle("nomatch", hit && !titleHit && !rowHits[i] && someRow));
    if (hit) { any = true; d.open = true; }
  }
  $("noMatches").hidden = any;
}
function clearSearch() { $("settingsSearch").value = ""; applySearch(); }
/* ---------- The width of the panels: the left one (tabs and tree) and the details next to it ---------- */
const PANEL_MIN = 240, DETAILS_MIN = 260, STAGE_MIN = 320;
const panelSizes = Object.assign({panel: 360, details: 380}, remember.get("hx-panel-w") || {});
const desktop = () => window.matchMedia("(min-width: 821px)").matches;
const detailsShown = () => editorEl.dataset.tab === "building" && !searching;
function applyPanelSizes() {
  const room = editorEl.clientWidth || window.innerWidth;
  if (desktop()) {
    panelSizes.details = Math.max(DETAILS_MIN, Math.min(panelSizes.details, 800));
    panelSizes.panel = Math.max(PANEL_MIN, Math.min(panelSizes.panel, 800, room - STAGE_MIN - (detailsShown() ? panelSizes.details : 0)));
    if (detailsShown()) panelSizes.details = Math.max(DETAILS_MIN, Math.min(panelSizes.details, room - STAGE_MIN - panelSizes.panel));
  }
  editorEl.style.setProperty("--panelw", panelSizes.panel + "px");
  editorEl.style.setProperty("--detwset", panelSizes.details + "px");
}
/**
 * On the Building tab (wide screen, not searching) the tree fills the left panel down to its bottom edge, now that what is chosen has a panel of its own. Elsewhere it keeps the height the stylesheet
 * gives it (that is also what a narrow screen has).
 */
function fitTree() {
  const nav = $("treeNav"), panel = $("panel");
  if (!nav || !panel) return;
  if (!desktop() || !detailsShown()) { nav.style.height = ""; return; }
  nav.style.height = "";
  const room = panel.getBoundingClientRect().bottom - nav.getBoundingClientRect().top;
  nav.style.height = Math.max(160, Math.floor(room - 12)) + "px";
  const over = panel.scrollHeight - panel.clientHeight;   // (what is under the tree, and the panel's padding)
  if (over > 0) nav.style.height = Math.max(160, nav.offsetHeight - over) + "px";
}
function installPanelResizers() {
  const rz = [$("rz1"), $("rz2")], keys = ["panel", "details"], save = () => remember.set("hx-panel-w", panelSizes);
  rz.forEach((el, i) => {
    el.addEventListener("pointerdown", e => {
      if (e.button !== 0 || !desktop()) return;
      e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add("drag");
      const x0 = e.clientX, v0 = panelSizes[keys[i]];
      const move = ev => { panelSizes[keys[i]] = v0 + ev.clientX - x0; applyPanelSizes(); };
      const up = () => { el.classList.remove("drag"); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); save(); };
      el.addEventListener("pointermove", move); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    });
    el.addEventListener("keydown", e => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault(); panelSizes[keys[i]] += (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 64 : 16); applyPanelSizes(); save();
    });
    el.addEventListener("dblclick", () => { panelSizes[keys[i]] = i ? 380 : 360; applyPanelSizes(); save(); });
  });
  window.addEventListener("resize", applyPanelSizes);
  const fit = new ResizeObserver(() => fitTree());
  fit.observe($("panel"));
  cleanups.push(() => { window.removeEventListener("resize", applyPanelSizes); fit.disconnect(); });
  applyPanelSizes();
  fitTree();
}
function setTab(t) {
  if (!TABS.some(x => x[0] === t)) t = TABS[0][0];
  editorEl.dataset.tab = t;
  placeShape();
  $("controls-shape").hidden = !searching;   // (home of the main building's sections when they are not in the details panel: only looked at when searching)
  for (const [s] of TABS) {
    const b = $("tab-" + s);
    b.setAttribute("aria-selected", String(s === t));
    b.tabIndex = s === t ? 0 : -1;
    $("controls-" + s).hidden = !searching && s !== t;
  }
  remember.set("hx-tab", t);
  applyPanelSizes();
  fitTree();
}
for (const [s] of TABS) {
  const b = $("tab-" + s);
  b.onclick = () => { if (searching) clearSearch(); setTab(s); };
  b.onkeydown = ev => {
    if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
    const i = TABS.findIndex(x => x[0] === s), other = TABS[(i + (ev.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length][0];
    setTab(other); $("tab-" + other).focus(); ev.preventDefault();
  };
}
setTab(remember.get("hx-tab"));
installPanelResizers();
$("settingsSearch").addEventListener("input", applySearch);
$("settingsSearch").addEventListener("keydown", ev => { if (ev.key === "Escape") { ev.stopPropagation(); clearSearch(); } });
$("searchClear").onclick = () => { clearSearch(); $("settingsSearch").focus(); };
const inputs = {};
function fmt(f, v) {
  if (f.k === "hens") { const cap = henCap(p); return v > cap ? `${cap} (barn full)` : `${v} (room for ${cap})`; }
  if (f.cm) return (Math.round(v * 1000) / 10) + " cm";
  if (f.money) return Math.round(v).toLocaleString("en-US");
  if (f.zero && v < 2.3) return f.zero;
  const dec = f.step >= 1 ? 0 : f.step >= 0.1 ? 1 : 2;
  return (+v).toFixed(dec) + (f.unit || "");
}
// Only the sections for this project's kind are built (a project's kind never changes), and its
// fields are looked up by kind: kinds can have fields with the same key and different ranges.
const FLD = fieldsFor(kindOf(p));
const kindSections = [];
function syncKind() { for (const {g, d} of kindSections) d.hidden = !g.kinds.includes(p.kind); }
// (the Shape tab's sections: they are shown under the main building in the tree when it is chosen, see placeShape)
// (the rows for the heights of the floors: not in the Shape tab, they go in the card of a floor in the tree)
const floorRows = {};
SCHEMA.forEach(g => {
  if (g.kinds && !g.kinds.includes(p.kind)) return;
  const d = document.createElement("details");
  if (g.kinds) kindSections.push({g, d});
  // First time: only the first section of each side is open. After that, as the user left them.
  d.open = g.title in openState ? !!openState[g.title] : !sideSeen[g.tab];
  sideSeen[g.tab] = true;
  d.addEventListener("toggle", () => { openState[g.title] = d.open; remember.set("hx-open-sections", openState); fitTree(); });
  d.innerHTML = `<summary data-tabname="${TABS.find(x => x[0] === g.tab)[1]}">${g.label || g.title}</summary>` + (g.hint ? `<p class="hint">${g.hint}</p>` : "");
  d.dataset.section = g.title;
  if (g.detail) shapeSections.push(d);
  const wrap = document.createElement("div");
  if (g.colors) wrap.className = "colors";
  g.fields.forEach(f => {
    const id = "f-" + f.k;
    let el;
    if (f.type === "check") {
      el = document.createElement("label"); el.className = "check";
      el.innerHTML = `<input type="checkbox" id="${id}"> ${f.label}`;
    } else if (f.type === "text") {
      el = document.createElement("div"); el.className = "field";
      el.innerHTML = `<div class="fl"><label for="${id}">${f.label}</label></div>` + (f.multiline
        ? `<textarea id="${id}" rows="3" maxlength="${f.max}"></textarea>` : `<input type="text" id="${id}" maxlength="${f.max}">`);
      if (f.k === "modAuthor" && author) el.querySelector("input").placeholder = author;
    } else if (f.type === "select") {
      el = document.createElement("div"); el.className = "field";
      el.innerHTML = `<div class="fl"><label for="${id}">${f.label}</label></div><select id="${id}">${f.options.map(o => `<option value="${o[0]}">${o[1]}</option>`).join("")}</select>`;
    } else if (f.type === "color") {
      el = document.createElement("div"); el.className = "field";
      el.innerHTML = `<input type="color" id="${id}"><label for="${id}">${f.label}</label>`;
    } else {
      el = document.createElement("div"); el.className = "field";
      el.innerHTML = `<div class="fl"><label for="${id}">${f.label}</label><output id="${id}-o"></output></div><input type="range" id="${id}" min="${f.min}" max="${f.max}" step="${f.step}">`;
    }
    if (f.floorRow || f.cardRow) floorRows[f.k] = el; else wrap.appendChild(el);
    el.dataset.k = f.k;
    const input = el.querySelector("input,select,textarea");
    inputs[f.k] = input;
    input.addEventListener("input", () => {
      let v = f.type === "check" ? input.checked : (f.type === "select" || f.type === "color" || f.type === "text") ? input.value : +input.value;
      p[f.k] = v;
      // the downpipes are placed again when their count per side or the gutters change
      if (f.k === "downpipes" || f.k === "gutters") p.pipes = autoPipes(p);
      // Mod details don't change the house, so skip the rebuild.
      if (f.k.startsWith("mod")) { syncOutputs(); persist(); return; }
      if (f.k === "halfStorey" && v) p.windows = p.windows.filter(w => !(w.floor >= p.floors && !gableWall(w.wall)));
      // Keep the kind's rules (a hen house's pasture never on the door's wall, no more hens than
      // fit ...) and show any setting they changed, so the preview, controls and export agree.
      const ruled = applyKindRules();
      if (ruled) syncControls(); else syncOutputs();
      persist(); rebuild(false);
      if (["floors", "halfStorey", "roofType", "ridge", "interior", "curtainStyle", "curtainColor", "winStyle", "doorStyle"].includes(f.k)) { renderWinUI(); renderDormUI(); renderWingsUI(); }
      renderPipesUI(); renderPapersAll(); renderZonesAll();
      if (ob.sel || ob.on) renderObjectsUI();
    });
  });
  if (g.custom === "dormers") { const ed = document.createElement("div"); ed.id = "dormEditor"; d.appendChild(ed); }
  if (g.custom === "inside") { const ed = document.createElement("div"); ed.id = "insideEditor"; d.appendChild(ed); }
  if (g.custom === "tree") { const ed = document.createElement("div"); ed.id = "treeEditor"; ed.innerHTML = `<div id="treeNav"></div>`; d.appendChild(ed); }
  if (g.custom === "windows") {
    const sub = document.createElement("p"); sub.className = "sub"; sub.textContent = "Size for new windows"; d.appendChild(sub);
  }
  d.appendChild(wrap);
  if (g.custom === "windows") {
    const b = document.createElement("button"); b.type = "button"; b.className = "wide"; b.textContent = "Use this size for all windows";
    b.onclick = () => { p.windows.forEach(w => { if (w.type === "door") return; w.w = p.winW; w.h = p.winH; w.sill = p.sill; }); persist(); rebuild(false); renderWinUI(); toast("All windows now use this size"); };
    d.appendChild(b);
  }
  $(g.detail ? "controls-shape" : "controls-" + g.tab).appendChild(d);
});
function syncControls() {
  for (const k in inputs) {
    const f = FLD[k], el = inputs[k];
    if (f.type === "check") el.checked = !!p[k]; else el.value = p[k];
  }
  syncOutputs();
  syncKind();
  renderWinUI();
  renderDormUI();
  renderObjectsUI();
  renderWingsUI();
  renderPipesUI(); renderPapersAll(); renderZonesAll();
}
function syncOutputs() {
  for (const k in inputs) {
    const f = FLD[k];
    const o = $("f-" + k + "-o");
    if (o) o.textContent = fmt(f, p[k]);
  }
  // Controls that don't apply right now are not shown (a kind may not have some of them at all).
  const off = (k, v) => { if (inputs[k]) { inputs[k].disabled = v; const row = inputs[k].closest("[data-k]"); if (row) row.classList.toggle("na", v); } };
  off("ridge", p.roofType !== "gable");
  // the walls' zones: board settings apply when either zone has boards
  const clads = [p.wallCladding, ...(p.innerCladding === "same" || p.innerCladding === "sameLow" ? [] : [p.innerCladding]), ...(zonesUsed() || p.innerCladding === "sameLow" ? [p.lowerCladding] : [])];
  off("innerColor", p.innerCladding === "same" || p.innerCladding === "sameLow");
  off("panelSpacing", clads.every(c => c === "plaster"));
  off("battenWidth", !clads.includes("lockpanel"));
  off("splitHeight", p.wallSplit !== "height");
  { const low = zonesUsed() || p.innerCladding === "sameLow"; off("lowerCladding", !low); off("lowerColor", !low); }
  for (const k of ["studSpacing", "studWidth", "studIrregular", "insidePanel"]) off(k, !p.insideSame);
  off("roofMaterial", false);
  for (const w of ["Front", "Back", "Left", "Right"]) off("post" + w, !p["open" + w]);
  off("roofPitch", p.roofType === "flat"); off("ridge", p.roofType === "flat");
  off("roofTilt", p.roofType !== "flat"); off("tiltHigh", p.roofType !== "flat" || !p.roofTilt);
  off("chimneyStyle", !p.chimney);
  off("kneeWall", !(p.halfStorey || (p.splits || []).some(x => x.half === true) || (p.wings || []).some(w => w.half || (w.splits || []).some(x => x.half === true))));   // (a section's attic has the knee wall too)
  off("floor2Height", p.floors < 2); off("floor3Height", p.floors < 3);
  off("gutters", p.roofType === "flat" && !p.roofTilt);
  off("downpipes", !p.gutters || (p.roofType === "flat" && !p.roofTilt));
  off("ventilators", p.roofType === "flat");
  off("curtainStyle", !p.interior); off("curtainColor", !p.interior);
  inputs.modDescription.placeholder = defaultModDescription(p);
}

const TEX = 1024;
/** The materials with a surface texture (surfaceSpec), when their settings give them one. */
const TEXTURED = ["walls", "wallsLow", "wallsIn", "roof", "chimney", "trim", "foundation", "door", "doorSheet", "doorIn"];
/** Those, and the materials parts with a look of their own have (walls, roof and trim of their own: "roofP1" ...). */
const texturedNow = () => [...TEXTURED, ...matTable(p).variants.map(v => v.name)];
function hash(i, j, s) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, px, py, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const ux = fx*fx*(3 - 2*fx), uy = fy*fy*(3 - 2*fy);
  const w = (a, n) => ((a % n) + n) % n;
  const x0 = w(xi, px), x1 = w(xi + 1, px), y0 = w(yi, py), y1 = w(yi + 1, py);
  return lerp(lerp(hash(x0,y0,s), hash(x1,y0,s), ux), lerp(hash(x0,y1,s), hash(x1,y1,s), ux), uy);
}

/**
 * A surface of surfaces.mjs, ready to draw: its shade map and marks, weathered by age (age.mjs), a grey map
 * of it (for the preview, x1.5; marks darker) and its normal map. outdoor: out in the weather (the plinth).
 */
const fitBases = {};
function fitBase(kind, age = 0, outdoor = false) {
  const key = `${kind}|${age}|${outdoor}`;
  if (fitBases[key]) return fitBases[key];
  const fresh = paintSurface(kind), {N, S, H, Mk} = age ? weather({...fresh, Mk: null}, kind, age, {outdoor}) : {...fresh, Mk: null};
  const nrm = normalFromHeight(H, N, SURFACES[kind].bump);
  const canvasOf = fill => { const c = document.createElement("canvas"); c.width = c.height = N; const ctx = c.getContext("2d"), img = ctx.createImageData(N, N); fill(img.data); ctx.putImageData(img, 0, 0); return c; };
  const normal = canvasOf(D => { for (let i = 0, j = 0; i < N * N; i++, j += 4) { D[j] = (nrm[i*3]*0.5 + 0.5) * 255; D[j+1] = (nrm[i*3+1]*0.5 + 0.5) * 255; D[j+2] = (nrm[i*3+2]*0.5 + 0.5) * 255; D[j+3] = 255; } });
  const grey = canvasOf(D => { for (let i = 0, j = 0; i < N * N; i++, j += 4) { D[j] = D[j+1] = D[j+2] = Math.min(255, S[i] * (Mk && Mk[i] ? 0.7 : 1) / 1.5 * 255); D[j+3] = 255; } });
  return fitBases[key] = {N, S, Mk, normal, grey};
}
function genBase(s) {
  if (SURFACES[s.kind]) return fitBase(s.kind, s.age, true);
  let N = TEX, H = new Float32Array(N*N), S = new Float32Array(N*N), Mk = s.kind === "brick" ? new Uint8Array(N*N) : null;
  const strength = {lockpanel:10, vertical:14, horizontal:40, plaster:1.5, felt:1.2, tiles:60, metal:4.5, seamed:5, corrugated:9, brick:3, paintedwood:0.6}[s.kind];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let h = 0, sh = 1;
    if (s.kind === "lockpanel") {
      const P = N / s.n, bwp = s.bw * P, lx = x % P, d = Math.min(lx, P - lx);
      const grain = (vnoise(x/8, y/64, N/8, N/64, 3) - 0.5) * 0.12 + (vnoise(x/2, y/16, N/2, N/16, 5) - 0.5) * 0.06;
      if (d < bwp / 2) {
        h = 0.5 + 0.5 * Math.min(1, (bwp/2 - d) / 4);
        sh = 1.03 + (hash(Math.round(x / P) % s.n, 1, 11) - 0.5) * 0.06 + grain;
      } else {
        sh = (0.97 + (hash(Math.floor(x / P), 2, 13) - 0.5) * 0.08 + grain) * (1 - 0.4 * Math.exp(-(d - bwp/2) / 5));
      }
    } else if (s.kind === "vertical") {
      // plain boards standing side by side: a flat face with a small chamfer and a dark joint between the boards, grain running down
      const P = N / s.n, lx = x % P, d = Math.min(lx, P - lx), board = Math.floor(x / P);
      const grain = (vnoise(x/8, y/64, N/8, N/64, 3) - 0.5) * 0.12 + (vnoise(x/2, y/16, N/2, N/16, 5) - 0.5) * 0.06;
      h = d < 4 ? d / 4 : 1;
      sh = (0.98 + (hash(board % s.n, 4, 23) - 0.5) * 0.1 + grain) * (1 - 0.55 * Math.exp(-d / 2.5));
    } else if (s.kind === "horizontal") {
      const P = N / s.n, ly = y % P;
      h = ly / P;
      const grain = (vnoise(x/64, y/8, N/64, N/8, 3) - 0.5) * 0.12 + (vnoise(x/16, y/2, N/16, N/2, 5) - 0.5) * 0.06;
      sh = (0.97 + (hash(Math.floor(y / P), 3, 17) - 0.5) * 0.08 + grain) * (1 - 0.35 * Math.exp(-ly / 3));
    } else if (s.kind === "plaster" || s.kind === "felt") {
      const n1 = vnoise(x/4, y/4, N/4, N/4, 7), n2 = vnoise(x/32, y/32, N/32, N/32, 9);
      h = n1 * 0.6 + n2 * 0.4;
      sh = s.kind === "felt" ? 0.9 + 0.15*n2 + 0.08*n1 : 0.95 + 0.03*n2 + 0.08*n1;
    } else if (s.kind === "tiles") {
      const Px = N / 4, Py = N / 4, lx = x % Px, ly = y % Py;
      const wv = 0.5 + 0.5 * Math.cos(2 * Math.PI * lx / Px);
      h = 0.55 * wv + 0.45 * (ly / Py);
      sh = (0.95 + (hash(Math.floor(x/Px), Math.floor(y/Py), 19) - 0.5) * 0.1 + (vnoise(x/4, y/4, N/4, N/4, 21) - 0.5) * 0.08)
        * (1 - 0.5 * Math.exp(-ly / 5)) * (0.85 + 0.15 * wv);
    } else if (s.kind === "brick") {
      const Px = N / 4, Py = N / 8, row = Math.floor(y / Py), off = row % 2 ? Px / 2 : 0;
      const lx = (x + off) % Px, ly = y % Py, col = Math.floor(((x + off) % N) / Px);
      const e = Math.min(lx - 10, ly - 14, Px - lx, Py - ly);
      if (e < 0) {
        Mk[y*N + x] = 1;
        sh = 0.9 + (vnoise(x/2, y/2, N/2, N/2, 33) - 0.5) * 0.15;
      } else {
        h = 0.6 + 0.4 * Math.min(1, e / 3);
        sh = 0.85 + hash(col, row, 29) * 0.25 + (vnoise(x/4, y/4, N/4, N/4, 31) - 0.5) * 0.12;
      }
    } else if (s.kind === "paintedwood") {
      // Planed boards under paint: the paint fills the grain, so only long, faint streaks along y
      // show, mostly in the light; no growth rings, no board seams, almost even color.
      // (noise scales divide the texture size, so it tiles without a seam)
      const grain = vnoise(x/8, y/256, N/8, N/256, 41), wide = vnoise(x/32, y/512, N/32, N/512, 43);
      h = grain * 0.6 + wide * 0.4;
      sh = 0.99 + (grain - 0.5) * 0.012 + (wide - 0.5) * 0.02;
    } else if (s.kind === "corrugated") {
      // Corrugated sheet: 16 trapezoid ribs across (rounded tops, flat valleys), lit on one flank and dark on the other, with an overlap
      // (a thin step) across the sheet halfway down, shifted a little from rib to rib by the noise.
      const Px = N / 16, u = (x % Px) / Px, w = 0.5 - 0.5 * Math.cos(2 * Math.PI * u), rib = Math.min(1, Math.max(0, w * 1.7 - 0.25)), flank = Math.sin(2 * Math.PI * u);
      const Sy = N / 2, lap = (y + Math.round(vnoise(x/32, 3, N/32, 8, 27) * 6)) % Sy, step = lap < 3 ? 1 : 0;
      h = Math.max(rib, step * 0.4);
      sh = (1 + 0.16 * flank * (rib > 0.05 && rib < 0.95 ? 1 : 0.3) - 0.08 * (1 - rib) + (vnoise(x/64, y/6, N/64, N/6, 33) - 0.5) * 0.05) * (step ? 0.8 : 1);
    } else if (s.kind === "seamed") {
      // Falsad plåt: four 50 cm pans across; at each pan's edge a raised double seam (a rounded fold with a bright top and a dark foot) and,
      // every metre down the pan, a flat cross seam (tvärfals), staggered half a sheet from pan to pan; each sheet a touch lighter or darker.
      const Px = N / 4, lx = x % Px, d = Math.min(lx, Px - lx), pan = Math.floor(x / Px), Sy = N / 2, yy = (y + (pan % 2) * Sy / 2) % Sy, sheet = Math.floor((y + (pan % 2) * Sy / 2) / Sy);
      const fold = d < 3 ? 1 : d < 6 ? (6 - d) / 3 : 0, cross = Math.min(yy, Sy - yy) < 2 ? 0.7 : 0;
      h = Math.max(fold, cross);
      sh = (1 + (hash(pan, sheet, 31) - 0.5) * 0.06 + (vnoise(x/48, y/48, N/48, N/48, 25) - 0.5) * 0.05)
        * (d >= 3 && d < 6 ? 0.82 : d < 3 ? 1.1 : 1) * (cross ? 0.85 : 1);
    } else if (s.kind === "metal") {
      const Px = N / 4, lx = x % Px, d = Math.min(lx, Px - lx);
      h = d < 4 ? 1 : d < 7 ? (7 - d) / 3 : 0;
      sh = 1 + (vnoise(x/64, y/4, N/64, N/4, 23) - 0.5) * 0.06 - (d < 7 && d >= 4 ? 0.08 : 0);
    }
    H[y*N + x] = h; S[y*N + x] = sh;
  }
  // the building's age: dirt, peeling paint, moss, rust (age.mjs)
  if (s.age) ({S, H, Mk} = weather({S, H, Mk, N}, s.kind, s.age, {outdoor: true}));
  const nc = document.createElement("canvas"); nc.width = nc.height = N;
  const ctx = nc.getContext("2d"), img = ctx.createImageData(N, N), D = img.data;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const xl = (x + N - 1) % N, xr = (x + 1) % N, yu = (y + N - 1) % N, yd = (y + 1) % N;
    const nx = -(H[y*N + xr] - H[y*N + xl]) * 0.5 * strength, ny = (H[yd*N + x] - H[yu*N + x]) * 0.5 * strength;
    const l = Math.hypot(nx, ny, 1), j = (y*N + x) * 4;
    D[j] = (nx/l*0.5 + 0.5) * 255; D[j+1] = (ny/l*0.5 + 0.5) * 255; D[j+2] = (1/l*0.5 + 0.5) * 255; D[j+3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return {S, Mk, normal: nc};
}
function compose(S, hex, Mk, N = TEX) {
  const c = document.createElement("canvas"); c.width = c.height = N;
  const ctx = c.getContext("2d"), img = ctx.createImageData(N, N), D = img.data;
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  for (let i = 0, j = 0; i < S.length; i++, j += 4) { const k = S[i], mo = Mk && MASK_RGB[Mk[i]], [cr, cg, cb] = mo || [r, g, b]; D[j] = Math.min(255, cr*k); D[j+1] = Math.min(255, cg*k); D[j+2] = Math.min(255, cb*k); D[j+3] = 255; }
  ctx.putImageData(img, 0, 0);
  return c;
}
const surf = {};
function ensureSurface(m) {
  const s = surfaceSpec(p, m);
  if (!s) { surf[m] = null; return null; }
  const key = JSON.stringify(s);
  let st = surf[m];
  if (!st || st.key !== key) { st = surf[m] = {key, spec: s, base: genBase(s)}; }
  const col = colorFor(p, m);
  if (st.color !== col) { st.color = col; st.diffuse = compose(st.base.S, col, st.base.Mk, st.base.N); st.dirty = true; }
  return st;
}

const canvas = $("view");
const stage = $("stage");
const readout = $("readout");
// first-person walking (see "Walking around" below)
let lastGeo = null;
let showWalkArea = false;   // (paint where the animals can walk on the ground)
/** The Shape tab's sections live under the main building in the tree while it is chosen (and the Shape tab isn't shown), else in the Shape tab. */
// (the order of the main building's cards: the shape, then how it is divided, then what it looks like: Size, Roof, Open sides, Sections (the card in between), Surfaces, Inside walls, Kupor)
// (the main building's cards come in two groups, one at a time: Shape (Size, Roof, Kupor, Open sides, Sections) and Look (Surfaces, Inside walls))
function placeShape() {
  const host = $("mainShapeHost"), host2 = $("mainShapeHost2"), home = $("controls-shape");
  if (!host || !host2 || !home) return;
  const on = mainChosen && editorEl.dataset.tab === "building" && !searching;
  const rank = (list, d) => { const i = list.indexOf(d.dataset.section); return i < 0 ? list.length : i; };
  const first = shapeSections.filter(d => SHAPE_FIRST.includes(d.dataset.section)).sort((a, b) => rank(SHAPE_FIRST, a) - rank(SHAPE_FIRST, b));
  const then = shapeSections.filter(d => !SHAPE_FIRST.includes(d.dataset.section)).sort((a, b) => rank(SHAPE_THEN, a) - rank(SHAPE_THEN, b));
  if (subtabs) {
    subtabs.hidden = !on;
    subtabs.querySelectorAll("[data-sub]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.sub === mainSub)));
  }
  // (only the chosen group is shown; the Sections card is part of Shape)
  host.hidden = on && mainSub !== "shape"; if ($("mainCard")) $("mainCard").hidden = on && mainSub !== "shape"; host2.hidden = on && mainSub !== "look";
  for (const [list, want] of [[first, on ? host : home], [then, on ? host2 : home]]) {
    // (moved only when they are not there in this order: moving an element under the pointer would end a slider's drag)
    const there = [...want.children].filter(x => list.includes(x));
    if (there.length !== list.length || there.some((x, i) => x !== list[i])) for (const d of list) want.appendChild(d);
  }
}
/**
 * Every help text (a p.hint in the panels) sits behind a small "?": hover it, focus it or tap it to read the text. A hint right under a section's heading
 * goes into the heading's row; any other floats to the right of what it is in. (Texts that say what is wrong, not what a thing is, are marked class "keep" and stay.)
 */
// (what a hint says about the thing as it is now, or that something is missing or not allowed, stays in view: it is a status, not a help text)
const STATUS_HINT = /^(\d|Height |Post |The download|Loading|Nothing|This building has no|Choose an object|Press a post|Click a piece in the building|Doors can only|This is the building|An empty doorway|No opening|A flat roof has no|Sections \(walls|Kupor need|Items you import|This section has no|The first section has)|m long\. Add something/;
function tidyHints() {
  for (const h of editorEl.querySelectorAll(".hx-panel p.hint:not(.keep)")) {
    if (h.closest(".hx-q")) continue;
    const text = h.textContent.trim();
    if (text.length < 40 || STATUS_HINT.test(text)) { h.classList.add("keep"); continue; }
    const q = document.createElement("span"), prev = h.previousElementSibling, head = prev && (prev.tagName === "SUMMARY" || prev.matches("h3.sub, h3.hx-card-h")) ? prev : null;
    q.className = "hx-q" + (head ? " in-head" : ""); q.tabIndex = 0; q.setAttribute("role", "button"); q.setAttribute("aria-label", "Help");
    h.replaceWith(q); q.appendChild(h);
    if (head) head.appendChild(q);
    const flip = e => { e.preventDefault(); e.stopPropagation(); q.classList.toggle("open"); };
    q.addEventListener("click", flip);
    q.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") flip(e); else if (e.key === "Escape") q.classList.remove("open"); });
  }
}
let hintQueued = false;
const hintObs = new MutationObserver(() => { if (hintQueued) return; hintQueued = true; requestAnimationFrame(() => { hintQueued = false; tidyHints(); }); });
hintObs.observe(editorEl, {childList: true, subtree: true});
cleanups.push(() => hintObs.disconnect());
// (a text opened with a click closes when you click anywhere else)
const closeHints = e => editorEl.querySelectorAll(".hx-q.open").forEach(q => { if (!q.contains(e.target)) q.classList.remove("open"); });
document.addEventListener("click", closeHints);
cleanups.push(() => document.removeEventListener("click", closeHints));
tidyHints();
// the wall the "Things on a wall" view shows, and the floor a new window goes on
let wvWall = "front", wvFloor = 0, wvPart = 0, wvSec = 0, wSel = null, partImportWall = "back";
const walk = {on: false, pos: {x: 0, y: 0, z: 0}, yaw: 0, pitch: 0, keys: new Set(), last: 0, walker: null, eye: 1.65, ey: 0};
let interiorTex = null, interiorCv = null, groundObj = null, gridObj = null;
const interiorCanvas = () => interiorCv || (interiorCv = paintInterior(document));
let renderer, scene, camera, groundMat, selMesh = null, placesObj = null, yardObj = null, meshes = {}, matObjs = {}, needs = true, sunLight = null;

/** The mesh and material of one of the building's materials (the shared ones when the editor starts, a part's own when a building has them). */
function makeMesh(m) {
  const slot = slotOf(m);
  // The rooms are unlit and a little dark, so they read as indoors behind the glass.
  matObjs[m] = slot === "interior" ? new THREE.MeshBasicMaterial({map: interiorTex, color: 0xc8c8c8})
    : new THREE.MeshStandardMaterial(slot === "glass" ? {roughness:0.05, metalness:0.1} : slot === "gutter" || slot === "iron" ? {roughness:0.45, metalness:0.35} : slot === "curtain" || slot === "fittings" ? {roughness:0.95, metalness:0, vertexColors:true} : {roughness:0.85, metalness:0});
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), matObjs[m]);
  mesh.castShadow = !["glass", "interior", "curtain"].includes(slot); mesh.receiveShadow = slot !== "interior";
  meshes[m] = mesh; scene.add(mesh);
}
function initThree() {
  renderer = new THREE.WebGLRenderer({canvas, antialias:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 600);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7d8a72, 0.7));
  const sun = sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(14, 22, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {left:-22, right:22, top:22, bottom:-22, near:1, far:80});
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  groundMat = new THREE.MeshStandardMaterial({roughness:1});
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.001; ground.receiveShadow = true;
  scene.add(ground);
  groundObj = ground;
  const grid = gridObj = new THREE.GridHelper(60, 60, 0x000000, 0x000000);
  grid.material.transparent = true; grid.material.opacity = 0.08; grid.position.y = 0.002;
  scene.add(grid);
  interiorTex = new THREE.CanvasTexture(interiorCanvas());
  interiorTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  MATS.forEach(makeMesh);
  selMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({transparent:true, opacity:0.45, depthWrite:false, depthTest:false, side:THREE.DoubleSide}));
  // (drawn over everything, so a door hanging out from the wall or a window's frame never hides it; faceSel hides it from behind)
  selMesh.renderOrder = 50; selMesh.visible = false; scene.add(selMesh);
  placesObj = makePlacesMarker(); scene.add(placesObj.group);
  yardObj = makeYardMarker(); scene.add(yardObj.group);
  itemsGroup = new THREE.Group(); scene.add(itemsGroup);
  itemMat = new THREE.MeshStandardMaterial({color: 0x9aa3a8, roughness: 0.7, metalness: 0.15});
  ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
  makeInsideOverlay();
  $("viewPlan").onclick = () => setInsideView("plan");
  $("view3d").onclick = () => setInsideView("3d");
  $("insideUndo").onclick = undoInside; $("insideRedo").onclick = redoInside; $("insideDone").onclick = leaveInside;
  cleanups.push(() => window.removeEventListener("keydown", insideKey));
  installNumberEntry();
  applyTheme();
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", applyTheme);
  const mo = new MutationObserver(applyTheme);
  mo.observe(document.documentElement, {attributes:true, attributeFilter:["data-theme"]});
  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  cleanups.push(() => mq.removeEventListener("change", applyTheme), () => mo.disconnect(), () => ro.disconnect());
  resize();
  setupOrbit();
  raf = requestAnimationFrame(loop);
  return true;
}
function applyTheme() {
  const cs = getComputedStyle(document.documentElement);
  const bg = new THREE.Color(cs.getPropertyValue("--stage").trim() || "#D9E0D6");
  scene.background = bg;
  scene.fog = new THREE.Fog(bg, 70, 200);
  groundMat.color.set(cs.getPropertyValue("--ground").trim() || "#A9B59C");
  if (selMesh) selMesh.material.color.set(cs.getPropertyValue("--accent").trim() || "#9B2A1F");
  needs = true;
}
function resize() {
  const r = stage.getBoundingClientRect();
  if (!r.width || !r.height) return;
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
  if (ins.on && ins.view === "plan") fitOrtho();
  needs = true;
}
/** The chosen window's or door's mark is shown only from the side of the wall it is on (it is drawn over everything else). */
function faceSel() {
  const f = selMesh && selMesh.userData.face;
  if (!f) return;
  const c = activeCam().position;
  selMesh.visible = (c.x - f.c[0]) * f.n[0] + (c.z - f.c[2]) * f.n[2] > 0;
}
function loop() { if (destroyed) return; if (walk.on) walkStep(); if (needs) { faceSel(); renderer.render(scene, activeCam()); needs = false; } raf = requestAnimationFrame(loop); }

const view = {theta:0.75, phi:1.15, r:26, target:[0,3,0]};
function updateCam() {
  if (walk.on) return;
  const {theta, phi, r, target} = view;
  camera.position.set(target[0] + r*Math.sin(phi)*Math.sin(theta), target[1] + r*Math.cos(phi), target[2] + r*Math.sin(phi)*Math.cos(theta));
  camera.lookAt(target[0], target[1], target[2]);
  needs = true;
}
function setupOrbit() {
  const ptrs = new Map(); let pinch = 0, downAt = null;
  // moving the view: right button, middle button or Shift (and two fingers on a touch screen) pan the point the view turns round, so you can put it inside the building
  const panIds = new Set();
  canvas.addEventListener("contextmenu", e => e.preventDefault());
  const panView = (dx, dy) => {
    camera.updateMatrixWorld();
    const m = camera.matrixWorld.elements, k = 2 * view.r * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, canvas.clientHeight);
    for (let i = 0; i < 3; i++) view.target[i] += (-m[i] * dx + m[4 + i] * dy) * k;
    view.target[1] = Math.max(0.2, view.target[1]);
  };
  // double-click: the view turns round the spot you clicked (nothing there: back to the middle of the building)
  canvas.addEventListener("dblclick", e => {
    if (walk.on || ob.on || ins.on) return;
    const r = canvas.getBoundingClientRect(), v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(v, camera);
    const hit = rc.intersectObjects(Object.values(meshes))[0];
    view.target = hit ? [hit.point.x, Math.max(0.2, hit.point.y), hit.point.z] : [0, 3, 0];
    updateCam();
  });
  const zoomPlan = k => { ortho.zoom = Math.min(8, Math.max(0.3, ortho.zoom * k)); ortho.updateProjectionMatrix(); needs = true; };
  canvas.addEventListener("pointerdown", e => {
    canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); downAt = ptrs.size === 1 ? [e.clientX, e.clientY] : null;
    if (e.button === 1 || e.button === 2 || e.shiftKey) { panIds.add(e.pointerId); downAt = null; } else panIds.delete(e.pointerId);
    // The yard's plan view: pressing on an object (or a pasture handle) picks it up.
    if (ob.on && ptrs.size === 1) {
      const q = groundPoint(e), hit = q && objectAt(q);
      if (hit) {
        const o = objectsNow().find(x => x.id === hit.id);
        if (hit.handle && /^m[0-9]+$/.test(hit.handle) && o.points) {
          // a pale dot between two posts: a new post there, to drag
          const i = +hit.handle.slice(1), pts = o.points.slice(), m = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2];
          pts.splice(i + 1, 0, m); o.points = pts; p.objects = objectsNow().map(x => x.id === o.id ? {...x, points: pts} : x);
          hit.handle = "p" + (i + 1); ob.pt = i + 1; rebuild(false);
        } else if (hit.handle && /^p[0-9]+$/.test(hit.handle)) ob.pt = +hit.handle.slice(1);
        ob.sel = hit.id; treeKind = "object"; treeReveal = true; ob.drag = {...hit, off: o.type === "pasture" ? [0, 0] : [q[0] - o.x, q[1] - o.z], moved: false, before: p.objects};
        renderObjectsUI(); updatePlacesMarker();
      }
    }
    // Arranging the inside: pressing on a piece picks it up.
    if (ins.on && ptrs.size === 1) {
      const q = floorPoint(e), id = q && itemAt(p.items || [], catalogNow(), q[0], q[1]);
      if (id) {
        const it = p.items.find(x => x.id === id);
        ins.sel = id; ins.drag = {id, off: [q[0] - it.x, q[1] - it.z], moved: false, cand: it};
        renderInsideUI(); updateInsideOverlay();
      } else if (q && ins.view === "plan") {
        // the wall between two sections: dragged along the building (its place is the divider's "at")
        const dv = dividerAt(p, q[0], q[1]);
        if (dv) { ins.divider = dv; ins.sel = null; renderInsideUI(); updateInsideOverlay(); }
      }
    }
  });
  canvas.addEventListener("pointerup", e => {
    if (walk.on) { downAt = null; return; }
    const click = downAt && ptrs.size === 1 && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 5;
    if (ob.drag) {
      const d = ob.drag; ob.drag = null;
      if (d.moved) setObjects(sanitize({...p, objects: p.objects}).objects, d.id); else { renderObjectsUI(); updatePlacesMarker(); }
      downAt = null; return;
    }
    if (ins.divider) { ins.divider = null; persist(); renderTreeUI(); renderInsideUI(); updateInsideOverlay(); downAt = null; return; }
    if (ins.drag) {
      const d = ins.drag; ins.drag = null;
      if (d.moved && JSON.stringify(d.cand) !== JSON.stringify(p.items.find(x => x.id === d.id))) commitItems(p.items.map(x => x.id === d.id ? d.cand : x));
      else updateInsideOverlay();
    } else if (click) {
      if (ins.on) { ins.sel = null; renderInsideUI(); updateInsideOverlay(); } else pick(e);
    }
    downAt = null;
  });
  canvas.addEventListener("pointermove", e => {
    if (!ptrs.has(e.pointerId)) return;
    const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (walk.on) { walk.yaw -= (e.clientX - prev[0]) * 0.005; walk.pitch = Math.max(-1.4, Math.min(1.4, walk.pitch - (e.clientY - prev[1]) * 0.005)); walkLook(); return; }
    if (ob.drag && ptrs.size === 1) {
      // where it would go, snapped as it moves (the pasture rebuilds the fence, doorway and troughs as it goes)
      const q = groundPoint(e);
      if (q) {
        const next = dragTo(ob.drag, q);
        p.objects = objectsNow().map(x => x.id === ob.drag.id ? next : x);
        ob.drag.moved = true; applyKindRules(); rebuild(false);
      }
      return;
    }
    if (ob.on) {
      if (ptrs.size === 1) {
        const b = canvas.getBoundingClientRect(), k = (ortho.right - ortho.left) / ortho.zoom / b.width;
        ob.pan[0] -= (e.clientX - prev[0]) * k; ob.pan[1] -= (e.clientY - prev[1]) * k; fitSite();
      } else if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()], d = Math.hypot(a[0]-b[0], a[1]-b[1]);
        if (pinch) zoomPlan(d / pinch);
        pinch = d;
      }
      return;
    }
    if (ins.divider && ptrs.size === 1) {
      const q = floorPoint(e), d = ins.divider, list = d.pid ? ((p.wings || []).find(w => w.id === d.pid) || {}).splits : p.splits, s = list && list.find(x => x.id === d.id), at = q && s ? splitAtFrom(p, d.pid, d.id, q) : null;
      if (s && at !== null && at !== s.at) { s.at = at; rebuild(false); updateInsideOverlay(); }
      return;
    }
    if (ins.drag && ptrs.size === 1) {
      // Where the piece would land: snapped as it moves.
      const q = floorPoint(e);
      if (q) {
        const it = p.items.find(x => x.id === ins.drag.id);
        ins.drag.cand = snapItem({...it, x: q[0] - ins.drag.off[0], z: q[1] - ins.drag.off[1]}, catalogNow()[it.type], roomNow(), p.items, catalogNow());
        ins.drag.moved = true; updateInsideOverlay();
      }
      return;
    }
    if (ins.on && ins.view === "plan") {
      if (ptrs.size === 1) {
        // Pan: move the view with the pointer.
        const b = canvas.getBoundingClientRect(), k = (ortho.right - ortho.left) / ortho.zoom / b.width;
        ins.pan[0] -= (e.clientX - prev[0]) * k; ins.pan[1] -= (e.clientY - prev[1]) * k; fitOrtho();
      } else if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()], d = Math.hypot(a[0]-b[0], a[1]-b[1]);
        if (pinch) zoomPlan(d / pinch);
        pinch = d;
      }
      return;
    }
    if (ptrs.size === 1) {
      if (panIds.has(e.pointerId)) panView(e.clientX - prev[0], e.clientY - prev[1]);
      else {
        view.theta -= (e.clientX - prev[0]) * 0.008;
        // (from just over the ground up to under the target: you can look up at a roof from inside)
        view.phi = Math.min(2.7, Math.max(0.05, view.phi - (e.clientY - prev[1]) * 0.006));
      }
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a[0]-b[0], a[1]-b[1]);
      if (pinch) view.r = Math.min(120, Math.max(0.4, view.r * pinch / d));
      pinch = d;
      panView((e.clientX - prev[0]) / 2, (e.clientY - prev[1]) / 2);   // (two fingers also move the view)
    }
    updateCam();
  });
  const end = e => { ptrs.delete(e.pointerId); panIds.delete(e.pointerId); pinch = 0; };
  canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    if (walk.on) return;
    if (ins.on && ins.view === "plan") { zoomPlan(Math.exp(-e.deltaY * 0.001)); return; }
    view.r = Math.min(120, Math.max(0.4, view.r * Math.exp(e.deltaY * 0.001))); updateCam();
  }, {passive:false});
}

let surfTimer;
cleanups.push(() => clearTimeout(surfTimer));
function scheduleSurfaces() { clearTimeout(surfTimer); surfTimer = setTimeout(applySurfaces, 120); }
function mkTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
/**
 * The inside's surfaces in the preview: the plain-coloured fittings stay in meshes.fittings, each
 * surface gets a mesh of its own (children of it) with the surface's grey map over the vertex colours.
 */
const fitMeshes = {};
function bufferOf(g) {
  const b = new THREE.BufferGeometry();
  b.setAttribute("position", new THREE.Float32BufferAttribute(g.p, 3));
  b.setAttribute("normal", new THREE.Float32BufferAttribute(g.n, 3));
  b.setAttribute("uv", new THREE.Float32BufferAttribute(g.uv, 2));
  b.setAttribute("color", new THREE.Float32BufferAttribute(g.c, 3));
  b.setIndex(g.i);
  return b;
}
function drawFittingSurfaces() {
  const parts = splitBySurface(G.fittings), host = meshes.fittings;
  const plain = parts.get("") || {p: [], n: [], uv: [], c: [], i: []};
  host.geometry.dispose(); host.geometry = bufferOf(plain);
  for (const [surf, o] of Object.entries(fitMeshes)) if (!parts.has(surf)) o.visible = false;
  for (const [surf, g] of parts) {
    if (!surf) continue;
    let o = fitMeshes[surf];
    if (!o) {
      const mat = new THREE.MeshStandardMaterial({roughness: ["galv", "steel", "plastic"].includes(surf) ? 0.6 : 0.95,
        metalness: surf === "galv" ? 0.3 : 0, vertexColors: true});
      mat.color.setScalar(1.5);   // the grey map holds shade / 1.5
      o = fitMeshes[surf] = new THREE.Mesh(new THREE.BufferGeometry(), mat);
      o.castShadow = o.receiveShadow = true;
      host.add(o);
    }
    // the surface as weathered by the building's age
    if (o.userData.age !== p.age) {
      const base = fitBase(surf, p.age), mat = o.material;
      if (mat.map) mat.map.dispose(); if (mat.normalMap) mat.normalMap.dispose();
      mat.map = mkTex(base.grey); mat.normalMap = mkTex(base.normal); mat.needsUpdate = true;
      o.userData.age = p.age;
    }
    o.geometry.dispose(); o.geometry = bufferOf(g); o.visible = true;
  }
}
function applySurfaces() {
  if (!renderer || destroyed) return;
  for (const m of texturedNow()) {
    const st = ensureSurface(m), mat = matObjs[m];
    if (!mat) continue;
    if (!st) continue;
    if (st.dirty || mat.userData.key !== st.key || !mat.map) {
      if (mat.map) mat.map.dispose();
      mat.map = mkTex(st.diffuse);
      if (mat.userData.nkey !== st.key) { if (mat.normalMap) mat.normalMap.dispose(); mat.normalMap = mkTex(st.base.normal); }
      mat.userData = {key: st.key, nkey: st.key};
      st.dirty = false;
      mat.color.set("#ffffff"); mat.needsUpdate = true;
    }
  }
  needs = true;
}

/* ---------- Window editor ---------- */
let selId = null;
/** The name of floor f of the main building (part 0) or of a part. */
function floorNameIn(pid, f, si = -1) {
  const wg = pid && liveWings(p).find(x => x.id === pid), secs = sectionsOf(p, pid), sc = secs.length > 1 && secs[si] ? secs[si] : null;
  return (sc ? sc.half && f === sc.floors : (wg ? wg.half : p.halfStorey) && f === (wg ? wg.floors : p.floors)) ? "Attic" : `Floor ${f + 1}`;
}
/** The height of floor f of the main building or of a part (the attic: its knee wall). */
function floorHeightOf(pid, f, si = 0) { const wg = pid && liveWings(p).find(x => x.id === pid), secs = sectionsOf(p, pid), hs = secs.length > 1 && secs[si] ? secs[si].hs : wg ? wg.hs : floorHeightsOf(p); return f < hs.length ? hs[f] : ((secs.length > 1 && secs[si]) ? secs[si].half : (wg ? wg.half : p.halfStorey)) ? p.kneeWall : 0; }
function floorName(f) { return p.halfStorey && f === p.floors ? "Attic" : `Floor ${f + 1}`; }
/** How many floors a wall has: the house's, or its wing's. */
function floorsOf(wall) { const id = wingIdOf(wall), w = id && liveWings(p).find(x => x.id === id); return Math.max(w ? w.floors : p.floors, maxFloors(p, id)); }
/** Whether a wall has a half floor in the roof (1½-plan): the house's, or its wing's. */
function halfOf(wall) { const id = wingIdOf(wall), w = id && liveWings(p).find(x => x.id === id); return !!(w ? w.half : p.halfStorey) || sectionsOf(p, id).some(sc => sc.half); }
function gableWall(wall) {
  if (wingIdOf(wall)) return wall.endsWith("End") && p.roofType !== "flat";
  return p.roofType === "gable" && (p.ridge === "width" ? (wall === "left" || wall === "right") : (wall === "front" || wall === "back"));
}
/** Whether a window on floor f can be on wall k (attic windows only in a gable of a wall as tall as the house). */
const floorOk = (f, k) => f < floorsOf(k) || (f === floorsOf(k) && halfOf(k) && gableWall(k));
/** The building's walls now: the four, and the wing's when it has one. */
const wallKeys = () => Object.keys(wallsOf(p));
const wallLen = wall => (wallsOf(p)[wall] || {L: 1}).L;
function sortedWindows() {
  const order = {front: 0, back: 1, left: 2, right: 3}, ord = k => k in order ? order[k] : 10 * wingIdOf(k) + ["End", "Left", "Right"].findIndex(s => k.endsWith(s)), walls = wallsOf(p);
  // (the floors a wall has: the most of its sections, and the attic: a section can have more floors than the building's own setting)
  return p.windows.filter(w => walls[w.wall] && w.floor < floorsOf(w.wall) + (halfOf(w.wall) ? 1 : 0)).sort((a, b) => ord(a.wall) - ord(b.wall) || a.floor - b.floor || a.pos - b.pos);
}
function winLabel(w) {
  const row = sortedWindows().filter(x => x.wall === w.wall && x.floor === w.floor);
  const same = row.filter(x => x.type === w.type);
  return `${wallLabel(p, w.wall)}, ${floorName(w.floor).toLowerCase()}, ${w.type === "door" ? "door" : "window"} ${same.indexOf(w) + 1}` + (w._hidden ? " (hidden)" : "");
}
const WIN_FIELDS = [
  {k:"pos", label:"Position", min:0, max:1, step:0.005},
  {k:"w", label:"Width", min:0.3, max:3, step:0.05},
  {k:"h", label:"Height", min:0.3, max:2.4, step:0.05},
  {k:"sill", label:"Sill height", min:0, max:6, step:0.05}];
// a door's porch or canopy: its size, when it has one
const PORCH_FIELDS = [
  {k:"porchW", label:"Porch width", min:PORCH_W[0], max:PORCH_W[1], step:0.05},
  {k:"porchD", label:"Porch depth", min:PORCH_D[0], max:PORCH_D[1], step:0.05}];
/** After a window or door changed: the kind's rules follow (a pasture moves off a wall with a door), then save and redraw. */
function winChanged() {
  if (applyKindRules()) syncControls();
  persist(); rebuild(false);
}
const winOut = (f, s) => f.k === "pos" ? `${(s.pos * wallLen(s.wall)).toFixed(2)} m to the middle, from left` : `${s[f.k].toFixed(2)} m`;
/** Room and curtain choices for one window or kupa (obj), with ids starting with prefix. */
function choiceFields(prefix, obj) {
  const dis = p.interior ? "" : "disabled";
  const house = (CURTAIN_OPTIONS.find(o => o[0] === p.curtainStyle) || CURTAIN_OPTIONS[0])[1].toLowerCase();
  const own = obj.curtainColor && obj.curtainColor !== "default";
  const opt = (v, label, cur) => `<option value="${v}" ${v === cur ? "selected" : ""}>${label}</option>`;
  return (p.interior ? "" : `<p class="hint">Rooms and curtains behind the windows are only in houses. In a barn the windows on the upper floors have boards behind them (Inside → Inside walls).</p>`)
    + `<div class="field"><div class="fl"><label for="${prefix}-room">Room behind the glass</label></div><select id="${prefix}-room" ${dis}>${opt("auto", "Automatic", obj.room)}${ROOM_OPTIONS.map(o => opt(o[0], o[1], obj.room)).join("")}</select></div>`
    + `<div class="field"><div class="fl"><label for="${prefix}-curtain">Curtains</label></div><select id="${prefix}-curtain" ${dis}>${opt("default", `Same as the house (${house})`, obj.curtain)}${CURTAIN_OPTIONS.map(o => opt(o[0], o[1], obj.curtain)).join("")}</select></div>`
    + `<label class="check"><input type="checkbox" id="${prefix}-owncol" ${own ? "checked" : ""} ${dis}> Own curtain color</label>`
    + `<div class="field"><input type="color" id="${prefix}-col" value="${own ? obj.curtainColor : p.curtainColor}" ${own && p.interior ? "" : "disabled"}><label for="${prefix}-col">${own ? "Curtain color" : "Curtain color (same as the house)"}</label></div>`;
}
function bindChoices(prefix, obj) {
  const room = $(prefix + "-room"), cur = $(prefix + "-curtain");
  if (room) room.onchange = () => { obj.room = room.value; persist(); rebuild(false); };
  if (cur) cur.onchange = () => { obj.curtain = cur.value; persist(); rebuild(false); };
  const own = $(prefix + "-owncol"), col = $(prefix + "-col");
  if (own) own.onchange = () => {
    obj.curtainColor = own.checked ? col.value : "default";
    col.disabled = !own.checked;
    col.nextElementSibling.textContent = own.checked ? "Curtain color" : "Curtain color (same as the house)";
    if (!own.checked) col.value = p.curtainColor;
    persist(); rebuild(false);
  };
  if (col) col.oninput = () => { obj.curtainColor = col.value; persist(); rebuild(false); };
}
/** The card of the selected window or door (Building tab, below the tree). */
function renderWinCard() {
  const ed = $("winEditor");
  if (!ed) return;
  let html = "";
  const list = sortedWindows();
  if (!list.some(w => w.id === selId)) selId = null;
  const s = treeKind === "win" ? list.find(w => w.id === selId) : null;
  if (s) {
    const door = s.type === "door", styles = door ? DOOR_STYLES : WINDOW_STYLES;
    // a building keeps at least one door
    const lastDoor = door && p.windows.filter(w => w.type === "door").length === 1;
    const own = (styles.find(x => x.id === (door ? p.doorStyle : p.winStyle)) || styles[0]).name.toLowerCase();
    const opt = (v, label, cur) => `<option value="${v}" ${v === cur ? "selected" : ""}>${esc(label)}</option>`;
    const range = (f, lo = f.min, hi = f.max) => `<div class="field"><div class="fl"><label for="wf-${f.k}">${f.label}</label><output id="wf-${f.k}-o">${winOut(f, s)}</output></div><input type="range" id="wf-${f.k}" data-k="${f.k}" min="${lo}" max="${hi}" step="${f.step}" value="${s[f.k]}" ${f.k === "pos" ? `data-scale="${wallLen(s.wall)}"` : ""}></div>`;
    html += `<div class="wincard"><h3 class="sub">${door ? "Door" : "Window"}</h3><p class="warn" id="winWarn" ${s._hidden ? "" : "hidden"}>This overlaps a door or another window, so it’s hidden. Move it or make it smaller.</p>`;
    // a window on the ground floor can be a door (and back)
    html += `<div class="field"><div class="fl"><label for="wf-type">This is a</label></div><select id="wf-type" ${lastDoor ? "disabled" : ""}>${opt("window", "Window", s.type)}${s.floor === 0 ? opt("door", "Door", s.type) : ""}</select></div>`;
    if (lastDoor) html += `<p class="hint">This is the building’s only door, so it stays a door. Make another window a door first to remove this one or make it a window.</p>`;
    else if (s.floor !== 0) html += `<p class="hint">Doors can only go on the ground floor.</p>`;
    // any window or door can move to another wall (attic windows only to a gable)
    const walls = wallKeys().filter(k => floorOk(s.floor, k));
    html += `<div class="field"><div class="fl"><label for="wf-wall">Wall</label></div><select id="wf-wall">${walls.map(k => opt(k, wallLabel(p, k), s.wall)).join("")}</select></div>`;
    html += `<div class="field"><div class="fl"><label for="wf-style">Style</label></div><select id="wf-style">${opt("default", `Same as the building (${own})`, s.style)}${styles.map(x => opt(x.id, x.name, s.style)).join("")}</select></div>`;
    for (const f of WIN_FIELDS) {
      if (door && f.k === "sill") continue;
      html += door && f.k === "h" ? range(f, 1.5, 12) : door && f.k === "w" ? range(f, 0.3, 20) : range(f);
    }
    if (door) {
      html += `<div class="field"><div class="fl"><label for="wf-porch">In front of the door</label></div><select id="wf-porch">${PORCH_OPTIONS.map(o => opt(o[0], o[1], s.porch)).join("")}</select></div>`;
      if (s.porch !== "none") html += PORCH_FIELDS.map(f => range(f)).join("");
      html += `<label class="check"><input type="checkbox" id="wf-ramp" ${s.ramp ? "checked" : ""}> A ramp down to the ground (instead of steps; needs a foundation)</label>`;
      if ((s.style === "default" ? p.doorStyle : s.style) === "hole") html += `<p class="hint">An empty doorway: no door, so nothing to open.</p>`;
      else html += `<label class="check"><input type="checkbox" id="wf-opens" ${s.opens !== false ? "checked" : ""}> Opens (you can walk through it in the game)</label>`;
      if ((s.style === "default" ? p.doorStyle : s.style) !== "hole" && s.opens !== false && !(s.w > DOUBLE_DOOR_FROM)) html += `<div class="field"><div class="fl"><label for="wf-hinge">Hinges</label></div><select id="wf-hinge">${opt("left", "On the left (seen from outside)", s.hinge || "left")}${opt("right", "On the right (seen from outside)", s.hinge || "left")}</select></div>`;
      if ((s.style === "default" ? p.doorStyle : s.style) !== "hole" && s.opens !== false) html += `<div class="field"><div class="fl"><label for="wf-swing">Swings</label></div><select id="wf-swing">${opt("out", "Outwards", s.swing || "out")}${opt("in", "Inwards", s.swing || "out")}</select></div>`;
    }
    if (!door) html += choiceFields("wc", s);
    if (!lastDoor) html += `<button type="button" id="winRemove">Remove this ${door ? "door" : "window"}</button>`;
    html += `</div>`;
  }
  ed.innerHTML = html;
  if (s) {
    ed.querySelectorAll(".wincard input[type=range]").forEach(inp => inp.oninput = () => {
      s[inp.dataset.k] = +inp.value;
      $(`wf-${inp.dataset.k}-o`).textContent = winOut([...WIN_FIELDS, ...PORCH_FIELDS].find(f => f.k === inp.dataset.k), s);
      winChanged(); updateHighlight();
    });
    bindChoices("wc", s);
    $("wf-type").onchange = e => {
      // a new door gets a door's size and no porch, a window made again the building's window size
      if (e.target.value === "door") Object.assign(s, {type: "door", style: "default", w: 0.9, h: Math.min(2, p.floorHeight - 0.3), porch: "none", porchW: PORCH_W[2], porchD: PORCH_D[2]});
      else { Object.assign(s, {type: "window", style: "default", w: p.winW, h: p.winH, sill: p.sill}); delete s.porch; delete s.porchW; delete s.porchD; }
      winChanged(); renderWinUI(); updateHighlight();
    };
    $("wf-wall").onchange = e => { s.wall = e.target.value; winChanged(); renderWinUI(); updateHighlight(); };
    $("wf-style").onchange = e => { s.style = e.target.value; persist(); rebuild(false); };
    if ($("wf-porch")) $("wf-porch").onchange = e => { s.porch = e.target.value; winChanged(); renderWinUI(); };
    if ($("wf-ramp")) $("wf-ramp").onchange = e => { s.ramp = e.target.checked; winChanged(); };
    if ($("wf-opens")) $("wf-opens").onchange = e => { s.opens = e.target.checked; winChanged(); renderWinUI(); };
    if ($("wf-swing")) $("wf-swing").onchange = e => { s.swing = e.target.value; winChanged(); };
    if ($("wf-hinge")) $("wf-hinge").onchange = e => { s.hinge = e.target.value; winChanged(); };
    if ($("winRemove")) $("winRemove").onclick = () => removeWindow(s.id);
  }
}
/* ---------- Game places ---------- */
/* ---------- Downpipes ---------- */
// The downpipes (p.pipes): how many on each wall with a gutter, and where along it.
let pipeSel = null;
const renumber = list => list.map((x, i) => ({...x, id: i + 1}));
const pipeLabel = (x, list) => `${wallLabel(p, x.wall)}, ${list.filter(y => y.wall === x.wall).sort((a, b) => a.pos - b.pos).indexOf(x) + 1}`;
/* ---------- Two materials, wall by wall ---------- */
// p.wallZones: a wall with a split of its own instead of the building's (the two materials themselves are the building's).
let zoneWall = "front";
const zonesUsed = () => p.wallSplit !== "one" || Object.values(p.wallZones || {}).some(z => z.split !== "one");
const renderZonesAll = () => { renderZonesUI(); if ($("zonesEditorW")) renderZonesUI("zonesEditorW", wvWall); };
const renderPapersAll = () => { renderPapersUI(); if ($("papersEditorW")) renderPapersUI("papersEditorW", wvWall); };
function renderZonesUI(host = "zonesEditor", fixed = null) {
  const ed = $(host), sx = host === "zonesEditor" ? "" : "W";
  if (!ed) return;
  if (fixed) zoneWall = fixed;
  const walls = wallsOf(p), keys = Object.keys(walls);
  if (!walls[zoneWall]) zoneWall = keys[0];
  const z = (p.wallZones || {})[zoneWall], mode = z ? z.split : "same";
  const opt = (v, label, cur) => `<option value="${v}" ${v === cur ? "selected" : ""}>${esc(label)}</option>`;
  const own = Object.keys(p.wallZones || {});
  let html = `<p class="hint">The split under Surfaces is for every wall. A wall can have its own: one material, or split at the top of the ground floor or at a height.${own.length ? ` Walls with their own: ${own.map(k => esc(wallLabel(p, k))).join(", ")}.` : ""}</p>`;
  if (!fixed) html += `<div class="field"><div class="fl"><label for="znWall${sx}">Wall</label></div><select id="znWall${sx}">${keys.map(k => opt(k, wallLabel(p, k), zoneWall)).join("")}</select></div>`;
  html += `<div class="field"><div class="fl"><label for="znMode${sx}">Materials on this wall</label></div><select id="znMode${sx}">${opt("same", "Same as the building", mode)}${opt("one", "One material", mode)}${opt("floor", "Split at the top of the ground floor", mode)}${opt("height", "Split at a height", mode)}</select></div>`;
  if (mode === "height") html += `<div class="field"><div class="fl"><label for="znHeight${sx}">Split height, above the ground floor’s floor</label><output id="znHeight-o${sx}">${(+z.height).toFixed(2)} m</output></div><input type="range" id="znHeight${sx}" min="0.5" max="10" step="0.05" value="${z.height}"></div>`;
  ed.innerHTML = html;
  const save = (again = true) => { persist(); rebuild(false); syncOutputs(); applyKindRules(); if (again) renderZonesAll(); };
  if ($("znWall"+sx)) $("znWall"+sx).onchange = e => { zoneWall = e.target.value; renderZonesAll(); };
  $("znMode"+sx).onchange = e => {
    const v = e.target.value, zones = {...(p.wallZones || {})};
    if (v === "same") delete zones[zoneWall]; else zones[zoneWall] = v === "height" ? {split: "height", height: p.splitHeight} : {split: v};
    p.wallZones = zones; syncControls(); save();
  };
  if ($("znHeight"+sx)) {
    $("znHeight"+sx).oninput = e => { p.wallZones = {...p.wallZones, [zoneWall]: {split: "height", height: +e.target.value}}; $("znHeight-o"+sx).textContent = `${(+e.target.value).toFixed(2)} m`; rebuild(false); };
    $("znHeight"+sx).onchange = () => save(false);
  }
}
/* ---------- Wallpaper on the inside of the outer walls ---------- */
// Sections along each wall (p.papers), one per room behind it; the setting "every inside wall" is in the section's own field.
let paperWall = "front";
function renderPapersUI(host = "papersEditor", fixed = null) {
  const ed = $(host), sx = host === "papersEditor" ? "" : "W";
  if (!ed) return;
  if (fixed) paperWall = fixed;
  const walls = wallsOf(p), keys = Object.keys(walls);
  if (!walls[paperWall]) paperWall = keys[0];
  const L = walls[paperWall].L, list = (p.papers || []).filter(x => x.wall === paperWall).sort((a, b) => a.s0 - b.s0 || a.id - b.id);
  const opt = (v, label, cur) => `<option value="${v}" ${String(v) === String(cur) ? "selected" : ""}>${esc(label)}</option>`;
  const range = (sec, f, label) => `<div class="field"><div class="fl"><label for="pp${sec.id}${f}${sx}">${label}</label><output id="pp${sec.id}${f}-o${sx}">${(+sec[f]).toFixed(2)} m</output></div><input type="range" id="pp${sec.id}${f}${sx}" data-sec="${sec.id}" data-f="${f}" min="0" max="${L}" step="0.05" value="${sec[f]}"></div>`;
  let html = (fixed ? "" : `<div class="field"><div class="fl"><label for="ppWall${sx}">Sections along the wall</label></div><select id="ppWall${sx}">${keys.map(k => opt(k, wallLabel(p, k), paperWall)).join("")}</select></div>`)
    + `<p class="hint">Measured from the wall’s left end, seen from outside. Where no section is set, the wallpaper for every inside wall (or the plaster) shows. A later section lies over an earlier one.</p>`
    + list.map(sec => `<div class="wincard"><div class="field"><div class="fl"><label for="pp${sec.id}p${sx}">Wallpaper</label></div><select id="pp${sec.id}p${sx}" data-sec="${sec.id}" data-f="paper">${WALLPAPERS.map((w, i) => opt(i, w[0], sec.paper)).join("")}</select></div>${range(sec, "s0", "From")}${range(sec, "s1", "To")}<div class="row"><button type="button" class="danger" data-rm="${sec.id}">Remove this section</button></div></div>`).join("");
  html += `<div class="addrow"><button type="button" id="ppAdd${sx}">+ Add a section</button><button type="button" id="ppDivide${sx}" title="One section for each room the inner walls make behind this wall">Divide at the inner walls</button>${list.length ? `<button type="button" id="ppClear${sx}">Clear this wall</button>` : ""}</div>`;
  ed.innerHTML = html;
  const n = WALLPAPERS.length, save = (again = true) => { persist(); rebuild(false); if (again) renderPapersAll(); };
  const others = () => (p.papers || []).filter(x => x.wall !== paperWall);
  if ($("ppWall"+sx)) $("ppWall"+sx).onchange = e => { paperWall = e.target.value; renderPapersAll(); };
  $("ppAdd"+sx).onclick = () => {
    const from = list.length ? Math.min(L - 0.2, Math.max(...list.map(x => x.s1))) : 0;
    p.papers = cleanPapers([...(p.papers || []), {wall: paperWall, s0: from, s1: L, paper: (list.length ? list[list.length - 1].paper + 1 : 4) % n}], p, n); save();
  };
  $("ppDivide"+sx).onclick = () => {
    const cuts = [0, ...wallBreaks(p, paperWall), L], start = p.insidePaper !== "none" ? +p.insidePaper : 4;
    p.papers = cleanPapers([...others(), ...cuts.slice(0, -1).map((s0, i) => ({wall: paperWall, s0, s1: cuts[i + 1], paper: (start + i * 2) % n}))], p, n); save();
    toast(cuts.length > 2 ? `Divided into ${cuts.length - 1} sections` : "No inner walls meet this wall: one section for all of it");
  };
  if ($("ppClear"+sx)) $("ppClear"+sx).onclick = () => { p.papers = cleanPapers(others(), p, n); save(); };
  ed.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { p.papers = cleanPapers((p.papers || []).filter(x => x.id !== +b.dataset.rm), p, n); save(); });
  ed.querySelectorAll("[data-sec]").forEach(inp => {
    const f = inp.dataset.f, sec = () => (p.papers || []).find(x => x.id === +inp.dataset.sec);
    inp.oninput = () => {
      const s = sec(); if (!s) return;
      s[f] = f === "paper" ? +inp.value : +inp.value;
      if (f !== "paper") { const o = $(`pp${s.id}${f}-o${sx}`); if (o) o.textContent = s[f].toFixed(2) + " m"; }
      persist(); rebuild(false);
    };
    inp.onchange = () => { const s = sec(); if (s && f !== "paper" && s.s1 < s.s0) [s.s0, s.s1] = [s.s1, s.s0]; save(); };
  });
}
/** Downpipes on the wall chosen in the tree (walls with a gutter): how many, and where along it. */
function pipesCardHtml(key) {
  if (!eaveWalls(p).includes(key)) return "";
  return `<div class="wincard"><h3 class="sub">Downpipes</h3><div id="pipesEditorW"></div></div>`;
}
function renderPipesUI() {
  const ed = $("pipesEditorW");
  if (!ed) return;
  const key = wvWall, walls = wallsOf(p);
  if (!p.gutters || p.roofType === "flat") { ed.innerHTML = `<p class="hint">${p.roofType === "flat" ? "A flat roof has no gutters or downpipes." : "Turn on Rain gutters under Roof to place downpipes."}</p>`; return; }
  const L = walls[key].L, mine = (p.pipes || []).filter(x => x.wall === key).sort((u, v) => u.pos - v.pos), n = mine.length;
  const nm = wallLabel(p, key), out = v => `${(v * L).toFixed(2)} m from the left`;
  let html = `<div class="field"><div class="fl"><label>Downpipes on this wall</label></div><div class="step"><button type="button" data-pd="-1" aria-label="Fewer downpipes: ${nm}" ${n ? "" : "disabled"}>\u2212</button><span>${n}</span><button type="button" data-pd="1" aria-label="More downpipes: ${nm}" ${n >= 6 ? "disabled" : ""}>+</button></div></div>`;
  html += mine.map((x, i) => `<div class="field"><div class="fl"><label for="pipePos${x.id}">Downpipe ${i + 1}</label><output id="pipePos${x.id}-o">${out(x.pos)}</output></div><input type="range" id="pipePos${x.id}" data-pid="${x.id}" min="0" max="1" step="0.005" value="${x.pos}" data-scale="${L}"></div>`).join("");
  html += `<p class="hint">Seen from outside, from the wall’s left end. A pipe can’t stand where a wing meets the wall.</p>${n > 1 ? `<button type="button" id="pipeEven">Spread them evenly</button>` : ""}`;
  ed.innerHTML = html;
  const save = () => { persist(); rebuild(false); renderPipesUI(); };
  const set = count => { p.pipes = renumber([...(p.pipes || []).filter(x => x.wall !== key), ...pipePositions(L, count).map(pos => ({wall: key, pos: +pos.toFixed(3)}))]); save(); };
  ed.querySelectorAll("[data-pd]").forEach(btn => btn.onclick = () => set(n + (+btn.dataset.pd)));
  if ($("pipeEven")) $("pipeEven").onclick = () => set(n);
  ed.querySelectorAll("[data-pid]").forEach(inp => {
    const pipe = () => (p.pipes || []).find(x => x.id === +inp.dataset.pid);
    inp.oninput = () => { const x = pipe(); if (!x) return; x.pos = +inp.value; $(`pipePos${x.id}-o`).textContent = out(x.pos); persist(); rebuild(false); };
    inp.onchange = () => save();
  });
}
/* ---------- Wings ---------- */
// The house's wings (an L, T or U): a list in the Wings section, each with its wall, place, size and floors.
/** A part more on a wall (the house's or a part's), with windows on its walls like a new wing has. */
function addPart(wall) {
  const next = addPartOn(p, wall);
  if (!next) { toast("No room for an extension on that wall: it is full, or the most extensions is reached"); return false; }
  const id = next[next.length - 1].id;
  p.wings = next;
  { const d = addPartDoor(p, id); if (d) p.windows = d; }   // (the wall between it and what it stands on is whole, with a door in it)
  for (const part of WING_PARTS) for (let fl = 0; fl < p.floors; fl++) p.windows = genRow(p, p.windows, wingWallKey(id, part), fl, part === "End" ? 2 : 1);
  wSel = id; treeKind = "part"; partsChanged(); return true;
}
function partsChanged(renderToo = true) {
  // (a removed part takes its downpipes with it)
  const ids = new Set(liveWings(p).map(x => x.id));
  p.pipes = (p.pipes || []).filter(x => !wingIdOf(x.wall) || ids.has(wingIdOf(x.wall)));
  persist(); rebuild(false); if (renderToo) { renderWingsUI(); renderWinUI(); renderPipesUI(); renderPapersAll(); renderZonesAll(); }
}
/* ---------- A part's materials ---------- */
// Each is "as the parent" (the building for a part on the building) until the part sets its own.
let partLookOpen = false;
const PART_LOOK = [
  {k: "wallCladding", label: "Wall panel", kind: "select"}, {k: "wallColor", label: "Wall colour", kind: "color"},
  {k: "wallSplit", label: "Two materials on the walls", kind: "select"}, {k: "splitHeight", label: "Split height", kind: "range"},
  {k: "lowerCladding", label: "Lower panel", kind: "select", needsSplit: true}, {k: "lowerColor", label: "Lower colour", kind: "color", needsSplit: true},
  {k: "roofMaterial", label: "Roof covering", kind: "select"}, {k: "roofColor", label: "Roof colour", kind: "color"}, {k: "trimColor", label: "Trim colour (corners, frames, eaves)", kind: "color"}];
function partLookHtml(w, o = {}) {
  const pid = o.pid !== undefined ? o.pid : wingIdOf(w.wall), parentName = pid ? partName(p, pid) : "the building", up = partStyle(p, pid), mine = o.mine || partStyle(p, w.id);
  const optsOf = k => k === "wallSplit" ? [["one", "No, one material"], ["floor", "Split at the top of the ground floor"], ["height", "Split at a height"]] : (FLD[k] || FLD[k === "lowerCladding" ? "wallCladding" : k]).options;
  const nameOf = (k, v) => { const o = k === "splitHeight" || FLD[k] && FLD[k].type === "color" ? null : optsOf(k).find(x => x[0] === v); return o ? o[1] : v; };
  const rows = PART_LOOK.filter(f => (!o.keys || o.keys.includes(f.k)) && (!f.needsSplit || mine.wallSplit !== "one")).map(f => {
    const own = w[f.k] !== undefined && w[f.k] !== "", id = `pl-${f.k}`;
    if (f.k === "splitHeight" && mine.wallSplit !== "height") return "";
    if (f.kind === "select") return `<div class="field"><div class="fl"><label for="${id}">${f.label}</label></div><select id="${id}" data-pl="${f.k}"><option value="">${esc(`Same as ${parentName} (${nameOf(f.k, up[f.k])})`)}</option>${optsOf(f.k).map(([v, n]) => `<option value="${v}" ${own && w[f.k] === v ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>`;
    if (f.kind === "color") return `<div class="field"><div class="fl"><label for="${id}">${f.label}</label></div><label class="check"><input type="checkbox" data-plown="${f.k}" ${own ? "checked" : ""}> Its own colour${own ? "" : ` (same as ${esc(parentName)})`}</label>${own ? `<input type="color" id="${id}" data-pl="${f.k}" value="${w[f.k]}">` : ""}</div>`;
    return `<div class="field"><div class="fl"><label for="${id}">${f.label}</label><output id="${id}-o">${(+(own ? w[f.k] : up[f.k])).toFixed(2)} m</output></div><input type="range" id="${id}" data-pl="${f.k}" min="0.5" max="10" step="0.05" value="${own ? w[f.k] : up[f.k]}"></div>`;
  }).join("");
  return `<details class="partlook" ${o.open || partLookOpen ? "open" : ""}><summary>${o.summary ? esc(o.summary(parentName)) : `Materials: the same as ${esc(parentName)} unless set here`}</summary>${rows}</details>`;
}
function bindPartLook(ed, w, changed, pid) {
  const d = ed.querySelector(".partlook");
  if (d) d.addEventListener("toggle", () => { partLookOpen = d.open; });
  ed.querySelectorAll("[data-pl]").forEach(el => {
    const k = el.dataset.pl;
    if (el.tagName === "SELECT") el.onchange = () => { if (el.value === "") delete w[k]; else w[k] = el.value; changed(); };
    else if (el.type === "color") { el.oninput = () => { w[k] = el.value; persist(); rebuild(false); }; el.onchange = () => changed(); }
    else { el.oninput = () => { w[k] = +el.value; $(`pl-${k}-o`).textContent = `${(+el.value).toFixed(2)} m`; persist(); rebuild(false); }; el.onchange = () => changed(); }
  });
  ed.querySelectorAll("[data-plown]").forEach(el => el.onchange = () => {
    const k = el.dataset.plown;
    if (el.checked) w[k] = partStyle(p, pid !== undefined ? pid : wingIdOf(w.wall))[k]; else delete w[k];
    changed();
  });
}
/** Puts a part file on the wall chosen for imports; says how it went. */
function applyPart(data, wall = partImportWall, message = "Extension imported.") {
  const before = (p.wings || []).length, r = importPart(p, wall, data);
  if (r.error) { toast(r.error); return false; }
  const q = sanitize({...p, ...r.settings});
  p.wings = q.wings; p.windows = q.windows; if (r.settings.items) p.items = q.items;
  wSel = r.settings.wings[before].id;
  partsChanged(); toast([message, ...r.notes].join(" "));
  return true;
}
/* ---------- My parts: saved on the server, for every building ---------- */
let myParts = null, myPartsAdmin = false, myPartsLoading = false;
async function loadMyParts() {
  if (!partSource || myPartsLoading) return;
  myPartsLoading = true;
  try { const [list, admin] = await Promise.all([partSource.list(), partSource.isAdmin().catch(() => false)]); if (destroyed) return; myParts = list; myPartsAdmin = !!admin; }
  catch { myParts = myParts || []; }
  finally { myPartsLoading = false; }
  renderWingsUI();
}
function myPartsHtml() {
  if (!partSource) return "";
  if (myParts === null) { loadMyParts(); return `<p class="hint">Loading your extensions\u2026</p>`; }
  const info = it => [it.info && it.info.parts ? `${it.info.parts} extension${it.info.parts > 1 ? "s" : ""}` : "", it.info && it.info.items ? `${it.info.items} piece${it.info.items > 1 ? "s" : ""}` : "", it.shared ? "shared" : ""].filter(Boolean).join(", ");
  const rows = myParts.map(it => `<li><button type="button" data-usepart="${it.id}" title="Put it on the wall chosen above">${esc(it.name)} <span class="muted">${esc(info(it))}</span></button>`
    + (myPartsAdmin && it.mine ? ` <button type="button" class="small" data-sharepart="${it.id}" data-shared="${it.shared}">${it.shared ? "Stop sharing" : "Share with everyone"}</button>` : "")
    + (it.mine ? ` <button type="button" class="small danger" data-delpart="${it.id}" aria-label="Delete ${esc(it.name)}">Delete</button>` : "") + `</li>`).join("");
  return `<div class="myparts"><h4>My extensions</h4>` + (rows ? `<ul class="objlist">${rows}</ul>` : `<p class="hint">Nothing saved yet. Choose an extension and press “Save to My extensions” to use it in other buildings.</p>`) + `</div>`;
}
function bindMyParts(ed) {
  if (!partSource) return;
  ed.querySelectorAll("[data-usepart]").forEach(b => b.onclick = async () => {
    try { const full = await partSource.get(b.dataset.usepart); applyPart(full.data); } catch { toast("Couldn't load that extension. Try again."); }
  });
  ed.querySelectorAll("[data-sharepart]").forEach(b => b.onclick = async () => {
    try { await partSource.update(b.dataset.sharepart, {shared: b.dataset.shared !== "true"}); myParts = null; renderWingsUI(); } catch { toast("Couldn't change that. Try again."); }
  });
  ed.querySelectorAll("[data-delpart]").forEach(b => b.onclick = async () => {
    if (!window.confirm(t("Delete this saved extension? Buildings that already have it are not changed."))) return;
    try { await partSource.remove(b.dataset.delpart); myParts = null; renderWingsUI(); toast("Deleted"); } catch { toast("Couldn't delete it. Try again."); }
  });
  if ($("partSave")) $("partSave").onclick = async () => {
    const w = (p.wings || []).find(x => x.id === wSel), f = w && exportPart(p, w.id);
    if (!f) return;
    try { await partSource.save({name: f.name, info: {parts: f.parts.length, windows: f.windows.length, items: f.items.length}, data: f}); myParts = null; renderWingsUI(); toast(`${f.name} saved to My extensions`); }
    catch (e) { toast((e && e.message) || "Couldn't save it. Try again."); }
  };
}
/** A part in lists: its name and the wall it stands on. */
const wingLabel = w => `${partName(p, w.id)}: ${wallLabel(p, w.wall)}`;
/** The wall between a part and what it stands on: a wide opening (the rooms are one) or, with it off, an ordinary wall you put a door or a window in. */
function passageHtml(w) {
  return `<label class="check"><input type="checkbox" id="wg-open" ${w.closed ? "" : "checked"}> Wide opening into it (off: a whole wall, with doors and windows put in it as on any wall)</label>`
    + (w.closed ? `<div class="addrow"><button type="button" id="wg-door">+ Door in the wall between</button><button type="button" id="wg-window">+ Window in the wall between</button></div>` : "");
}
function bindPassage(w, changed) {
  $("wg-open").onchange = e => { w.closed = !e.target.checked; delete w.passage; changed(); };
  const add = kind => () => {
    const lw = liveWings(p).find(x => x.id === w.id);
    const next = lw && addOpening(p, w.wall, kind, 0, (lw.s0 + lw.s1) / 2);
    if (!next) { toast("No room for it in the wall between"); return; }
    p.windows = next; selId = next[next.length - 1].id; treeKind = "win"; winChanged(); renderTreeUI(); updateHighlight();
  };
  if ($("wg-door")) $("wg-door").onclick = add("door");
  if ($("wg-window")) $("wg-window").onclick = add("window");
}
/** The card of the selected part (Building tab, below the tree). */
function renderPartCard() {
  const ed = $("wingsEditor");
  if (!ed) return;
  const wings = p.wings || [], live = wingsOf(p);
  if (!wings.some(w => w.id === wSel)) wSel = null;
  const opt = (v, label, cur) => `<option value="${v}" ${String(v) === String(cur) ? "selected" : ""}>${esc(label)}</option>`;
  let html = "";
  const w = treeKind === "part" ? wings.find(x => x.id === wSel) : null;
  if (w) {
    const wallL = (wallsOf(p)[w.wall] || {L: w.wall === "front" || w.wall === "back" ? p.width : p.depth}).L;   // (the place along the wall is shown in metres)
    // the walls it can stand on: the house's and those of the parts before it in the list (its parent is one of them)
    const before = wings.slice(0, wings.findIndex(x => x.id === w.id)), onWalls = [...["front", "back", "left", "right"], ...before.flatMap(e => WING_PARTS.map(s => wingWallKey(e.id, s)))];
    const range = f => `<div class="field"><div class="fl"><label for="wg-${f.k}">${f.label}</label><output id="wg-${f.k}-o">${f.k === "pos" ? (w.pos * wallL).toFixed(2) : (+w[f.k]).toFixed(2)} m</output></div><input type="range" id="wg-${f.k}" data-k="${f.k}" min="${f.min}" max="${f.max}" step="${f.step}" value="${w[f.k]}" ${f.k === "pos" ? `data-scale="${wallL}"` : ""}></div>`;
    html += `<div class="wincard"><h3 class="sub" translate="no">${esc(partName(p, w.id))}</h3><div class="field"><div class="fl"><label for="wg-name">Name</label></div><input type="text" id="wg-name" maxlength="40" value="${esc(w.name || "")}" placeholder="${esc(`Extension ${w.id}`)}"></div>`
      + `<div class="field"><div class="fl"><label for="wg-wall">On the wall</label></div><select id="wg-wall">${onWalls.map(k => opt(k, wallLabel(p, k), w.wall)).join("")}</select></div>`
      + WING_FIELDS.map(range).join("")
      + `<div class="field"><div class="fl"><label for="wg-floors">Floors</label></div><select id="wg-floors">${opt(0, `As the house (${p.floors}${p.halfStorey ? "½" : ""})`, w.floors)}${[1, 2, 3].map(n => opt(n, `${n}${n < p.floors ? " (lower than the house)" : n > p.floors ? " (taller than the house)" : ""}`, w.floors)).join("")}</select></div>`
      + `<label class="check"><input type="checkbox" id="wg-half" ${(liveWings(p).find(x => x.id === w.id) || w).half ? "checked" : ""} ${w.floors ? "" : "disabled"}> Half floor in the roof (1½-plan)</label>`
      + passageHtml(w)
      + `<div class="field"><div class="fl"><label for="wg-pitch">Roof angle</label><output id="wg-pitch-o">${w.pitch ? w.pitch + "°" : "as the house (" + p.roofPitch + "°)"}</output></div><input type="range" id="wg-pitch" min="0" max="60" step="1" value="${w.pitch}"></div>`
      + `<div class="field"><div class="fl"><label for="wg-vent">Roof ventilators (lanterns on the ridge)</label><output id="wg-vent-o">${w.ventilators || 0}</output></div><input type="range" id="wg-vent" min="0" max="4" step="1" value="${w.ventilators || 0}"></div>`
      + partLookHtml(w)
      + dividersHtml(w.id)
      + `<p class="hint">An extension with fewer floors, or a flatter roof, has a lower roof. Roof angle 0 follows the house.</p><div class="row">${wings.length < MAX_WINGS ? `<button type="button" id="wingAddChild">+ Add an extension on ${esc(partName(p, w.id))}</button>` : ""}${partSource ? `<button type="button" id="partSave">Save to My extensions</button>` : ""}<button type="button" id="partExport">Export this extension</button><button type="button" id="wingRemove" class="danger">Remove ${esc(partName(p, w.id))} and what stands on it</button></div></div>`;
  }
  ed.innerHTML = html;
  const changed = partsChanged;
  bindMyParts(ed);
  if (!w) return;
  if ($("partExport")) $("partExport").onclick = () => {
    const f = exportPart(p, w.id);
    if (f) saveFile(`${slugify(f.name) || "part"}.part.json`, JSON.stringify(f, null, 1), () => showText(`${f.name}.part.json`, JSON.stringify(f, null, 1)));
  };
  ed.querySelectorAll(".wincard input[type=range]").forEach(inp => {
    inp.oninput = () => { w[inp.dataset.k] = +inp.value; $(`wg-${inp.dataset.k}-o`).textContent = `${(+inp.value * (inp.dataset.k === "pos" ? +inp.dataset.scale : 1)).toFixed(2)} m`; persist(); rebuild(false); };
    inp.onchange = () => changed();
  });
  $("wg-wall").onchange = e => { w.wall = e.target.value; changed(); };
  $("wg-floors").onchange = e => { w.floors = +e.target.value; if (!w.floors) w.half = false; else if (w.half === undefined) w.half = p.halfStorey; changed(); };
  $("wg-half").onchange = e => { w.half = e.target.checked; changed(); };
  bindPassage(w, changed);
  bindDividers(ed, w.id);
  $("wg-pitch").oninput = e => { w.pitch = +e.target.value; $("wg-pitch-o").textContent = w.pitch ? w.pitch + "°" : `as the house (${p.roofPitch}°)`; persist(); rebuild(false); };
  $("wg-pitch").onchange = () => changed();
  $("wg-vent").oninput = e => { w.ventilators = +e.target.value; $("wg-vent-o").textContent = String(w.ventilators); persist(); rebuild(false); };
  $("wg-vent").onchange = () => changed();
  if ($("wingAddChild")) $("wingAddChild").onclick = () => addChildPart(w.id);
  $("wg-name").onchange = e => { w.name = e.target.value.trim().slice(0, 40); changed(); };
  bindPartLook(ed, w, changed);
  $("wingRemove").onclick = () => removePart(w.id);
}
/* ---------- The building as a tree ---------- */
// The main building, its walls, and on each wall its windows, doors and parts (a part has its walls): one tree to choose from; what is chosen has its settings below.
let treeKind = "main";
const treeClosed = new Set();
let treeScroll = 0;
let treeReveal = false;   // (the next time the tree is drawn, what is chosen is made visible: its parents are opened)
function selectNode(kind, v) {
  treeKind = kind; treeReveal = true;
  selId = kind === "win" ? v : null;
  if (kind === "part") wSel = v;
  if (kind === "wall") { wvWall = typeof v === "string" ? v : v.key; if (typeof v !== "string") { wvFloor = v.floor; wvSec = v.section || 0; } }
  if (kind === "floor") { wvPart = v.part; wvFloor = v.floor; wvSec = v.section || 0; }
  if (kind === "section") { wvPart = v.part; wvSec = v.index; }
  if (kind === "object") { ob.sel = v; ob.pt = null; }
  if (kind === "group") { treeKind = "game"; ob.sel = null; ob.pt = null; }   // (a folder of troughs: the card of the game objects, where they are added)
  if (kind === "post") { treeKind = "object"; ob.sel = v.id; ob.pt = v.index; }   // (a post of the fence drawn by hand: its object is chosen, and the post in it)
  if (searching) clearSearch();
  setTab("building");
  const det = $("treeEditor") && $("treeEditor").closest("details"); if (det) det.open = true;
  renderTreeUI(); updateHighlight(); updatePlacesMarker();
  const card = {main: "mainCard", wall: "wallCard", floor: "wallCard", section: "wallCard", game: "wallCard", object: "wallCard", win: "winEditor", part: "wingsEditor"}[kind];
  if (card && $(card) && !window.matchMedia("(max-width: 820px)").matches) $(card).scrollIntoView({block: "nearest"});
}
const nodeKey = n => n.type === "main" ? "main" : n.type === "game" ? "game" : n.type === "group" ? "group:" + n.otype : n.type === "object" ? "object:" + n.id : n.type === "post" ? `post:${n.id}:${n.index}` : n.type === "section" ? `section:${n.part}:${n.index}` : n.type === "wall" ? `wall:${n.key}:${n.floor}:${n.section || 0}` : n.type === "floor" ? `floor:${n.part}:${n.floor}:${n.section || 0}` : n.type === "part" ? "part:" + n.id : "win:" + n.id;
/** What selectNode takes for a node written by nodeKey as kind:v:f:sc. */
const nodeArg = (kind, v, f, sc) => kind === "wall" ? {key: v, floor: +f, section: +sc || 0} : kind === "floor" ? {part: +v, floor: +f, section: +sc || 0} : kind === "section" ? {part: +v, index: +f} : kind === "post" ? {id: +v, index: +f} : kind === "main" || kind === "game" ? null : kind === "group" ? v : +v;
/** The tree node of a divider's wall: it is under the section with more floors. */
const splitNodeArg = key => { const runs = sectionRuns(p, key, (wallsOf(p)[key] || {L: 1}).L); return {key, floor: 0, section: runs.length ? runs[0].sec.index : 0}; };
function treeNavHtml() {
  const t = buildingTree(p), live = liveWings(p), fmt = v => (+v).toFixed(2).replace(/\.?0+$/, "");
  const multi = id => (id ? (live.find(x => x.id === id) || {floors: 1}).floors : p.floors) > 1;
  const isSel = n => n.type === "main" ? treeKind === "main" : n.type === "game" ? treeKind === "game" : n.type === "group" ? false : n.type === "object" ? treeKind === "object" && ob.sel === n.id && !((n.children || []).length && ob.pt !== null && ob.pt < n.children.length) : n.type === "post" ? treeKind === "object" && ob.sel === n.id && ob.pt === n.index : n.type === "section" ? treeKind === "section" && wvPart === n.part && wvSec === n.index : n.type === "wall" ? treeKind === "wall" && wvWall === n.key && wvFloor === n.floor && wvSec === (n.section || 0) : n.type === "floor" ? treeKind === "floor" && wvPart === n.part && wvFloor === n.floor && wvSec === (n.section || 0) : n.type === "part" ? treeKind === "part" && wSel === n.id : treeKind === "win" && selId === n.id;
  const label = (n, parentKey) => {
    if (n.type === "group") return `${esc(n.name)} <span class="muted">${n.children.length}</span>`;
    if (n.type === "game") return `Game objects <span class="muted">${(n.children || []).length}</span>`;
    if (n.type === "object") return esc(n.name) + ((n.children || []).length ? ` <span class="muted">${n.children.length} posts</span>` : "");
    if (n.type === "post") return esc(n.name) + (n.role ? ` <span class="muted">${n.role === "start" ? "start" : "stop"}</span>` : "");
    if (n.type === "main") return `Main building <span class="muted">${p.width} \u00D7 ${p.depth} m</span>`;
    if (n.type === "section") return `Section ${n.index + 1} <span class="muted">${fmt(n.from)}\u2013${fmt(n.to)} m, ${n.floors} floor${n.floors > 1 ? "s" : ""}</span>`;
    if (n.type === "wall") return `${esc(wallLabel(p, n.key))}${n.span ? ` <span class="muted">${fmt(n.span[0])}\u2013${fmt(n.span[1])} m</span>` : ""}`;
    if (n.type === "floor") { const h = floorHeightOf(n.part, n.floor, n.section); return `${esc(floorNameIn(n.part, n.floor, n.section))}${n.missing ? ` <span class="muted">(not in this section)</span>` : h ? ` <span class="muted">${fmt(h)} m</span>` : ""}`; }
    if (n.type === "part") { const l = live.find(x => x.id === n.id); return `${esc(partName(p, n.id))} <span class="muted">${l ? `${fmt(l.ww)} \u00D7 ${fmt(l.wd)} m` : "extension"}</span>`; }
    return `${n.type === "door" ? "Door" : "Window"} <span class="muted">${fmt(n.s0)}\u2013${fmt(n.s1)} m</span>`;
  };
  if (treeReveal) {
    treeReveal = false;
    const reveal = (n, trail) => { if (isSel(n)) { trail.forEach(a => treeClosed.delete(nodeKey(a))); return true; } return (n.children || []).some(c => reveal(c, [...trail, n])); };
    reveal(t, []); t.lost.forEach(l => reveal(l, [])); if (t.game) reveal(t.game, []);
  }
  const objProblems = t.game ? objectProblems(p) : new Map(), rows = [];
  const walk = (n, depth, parentKey) => {
    const k = nodeKey(n), kids = n.children || [], closed = treeClosed.has(k);
    const liData = n.type === "wall" ? `data-wall="${n.key}" data-floor="${n.floor}"${n.span ? ` data-at="${(n.span[0] + n.span[1]) / 2}"` : ""}` : (n.type === "window" || n.type === "door" || n.type === "part") && parentKey && parentKey.wall ? `data-wall="${parentKey.wall}" data-floor="${parentKey.floor}"` : "";
    rows.push(`<li class="tnode t-${n.type}" style="--d:${depth}" ${liData}>${kids.length ? `<button type="button" class="caret" data-toggle="${k}" aria-expanded="${!closed}" aria-label="${closed ? "Show" : "Hide"} what is under it">${closed ? "\u25B8" : "\u25BE"}</button>` : `<span class="caret"></span>`}`
      + `<button type="button" class="tbtn" data-node="${k}" ${n.type === "window" || n.type === "door" || n.type === "part" ? 'draggable="true"' : ""} aria-pressed="${isSel(n)}">${label(n, parentKey)}</button>${n.type === "object" && objProblems.has(n.id) ? ` <span class="warn" title="${esc(objProblems.get(n.id))}">!</span>` : n.off ? ` <span class="warn" title="${esc(n.off)}">left out</span>` : n.hidden ? ` <span class="warn">hidden</span>` : ""}</li>`);
    if (!closed) for (const c of kids) walk(c, depth + 1, n.type === "wall" ? {wall: n.key, floor: n.floor} : parentKey);
  };
  walk(t, 0, "");
  for (const l of t.lost) walk(l, 1, "");
  if (t.game) walk(t.game, 0, "");
  return `<ul class="objlist ptree tree">${rows.join("")}</ul>`;
}
/** The dividers of the building (pid 0: p.splits) or of a part (its splits): walls across it up to the roof, each with its place along it; a divider is a wall in the tree. */
function dividersHtml(pid = 0) {
  const w = pid ? (p.wings || []).find(x => x.id === pid) : null;
  if (pid && !w) return "";
  if (!pid && p.roofType === "hip") return `<p class="hint">Sections (walls across the building) need a gable or a flat roof.</p>`;
  const list = (pid ? w.splits : p.splits) || [];
  return `<div class="hx-card"><h3 class="hx-card-h">Sections</h3><p class="hint">${list.length ? `${list.length + 1} sections: choose one in the tree to move where it starts and to set its floors, then a floor to set its height.` : "Divide it across into sections with a wall between, each with its own floors. Add one, then choose it in the tree."}</p>`
    + `<div class="row"><button type="button" data-splitadd="1" ${list.length >= MAX_SPLITS ? "disabled" : ""}>+ Add a section</button></div></div>`;
}
/** The card of a divider chosen in the tree: its place, the floors after it, and removing it. */
function dividerCardHtml(key) {
  const pid = wingIdOf(key), id = +/(\d)$/.exec(key)[1], w = pid ? (p.wings || []).find(x => x.id === pid) : null;
  const list = (pid ? (w && w.splits) : p.splits) || [], i = list.findIndex(x => x.id === id);
  if (i < 0) return "";
  return `<div class="wincard"><h3 class="sub">${esc(wallLabel(p, key))}</h3><p class="hint">The wall between section ${i + 1} and section ${i + 2}. Where it stands and the floors of section ${i + 2} are set on that section.</p>`
    + `<div class="row"><button type="button" data-gosection="${i + 1}">Go to section ${i + 2}</button></div></div>`;
}
/** What a divider says about the section after it: its floors (the total height stays) and the ground floor's height when it has two or more. */
function sectionHtml(pid, s, sec, base) {
  // every number of floors is listed, with or without a half floor (1\u00BD, 2\u00BD ...: an attic over the full floors with the knee wall of the roof, taken from the section's height);
  // those that don't fit (each floor is at least 2.3 m, and the attic needs its knee wall) can't be chosen
  const lw = pid ? liveWings(p).find(x => x.id === pid) : null, baseHalf = !!(lw ? lw.half : p.halfStorey), knee = p.kneeWall;
  const totalH = base.reduce((a, b) => a + b, 0) + (baseHalf ? knee : 0), fits = k => k * 2.3 <= totalH + 1e-9, fitsHalf = k => k * 2.3 + knee <= totalH + 1e-9;
  const cur = (s.floors || 0) === 0 ? "0" : String(s.floors + ((s.half === undefined || s.half === null ? baseHalf : s.half) ? 0.5 : 0));
  const opt = (v, label, off = false) => `<option value="${v}" ${String(v) === cur ? "selected" : ""} ${off ? "disabled" : ""}>${esc(label)}</option>`;
  const list = [1, 2, 3].map(k => opt(String(k), String(k), !fits(k)) + opt(String(k + 0.5), k + "\u00BD", !fitsHalf(k))).join("");
  return `<div class="field"><div class="fl"><label for="sf${pid}-${s.id}">Floors</label></div><select id="sf${pid}-${s.id}" data-splitfloors="${s.id}">${opt("0", `As the building (${base.length}${baseHalf ? "\u00BD" : ""})`)}${list}</select></div>`
    + (fits(3) ? "" : `<p class="hint">More floors need more height: each floor is at least 2.3 m. Raise the height of all the floors together to fit another.</p>`)
    + `<p class="hint">1\u00BD is an attic over the full floors, with the knee wall of the roof (Roof, in the main building's card) taken from the section's height.</p>`;
}
/** The buttons and sliders of dividersHtml(pid) in host. */
/** A new section (a divider wall) in the building (pid 0) or in a part; it is chosen in the tree. */
function addSectionTo(pid) {
  const w = pid ? (p.wings || []).find(x => x.id === pid) : null;
  if (pid && !w) return;
  const had = new Set(((pid ? w.splits : p.splits) || []).map(x => x.id)), next = pid ? addPartSplit(p, pid) : addSplit(p);
  if (!next) { toast("No room for another section"); return; }
  if (pid) w.splits = next; else p.splits = next;
  persist(); rebuild(false);
  const added = next.find(x => !had.has(x.id));
  if (added) selectNode("section", {part: pid, index: next.findIndex(x => x.id === added.id) + 1}); else renderTreeUI();
}
function bindDividers(host, pid = 0) {
  const w = pid ? (p.wings || []).find(x => x.id === pid) : null;
  if (pid && !w) return;
  const get = () => pid ? (w.splits = w.splits || []) : (p.splits = p.splits || []), keyOf = id => pid ? wingSplitKey(pid, id) : "s" + id;
  const add = host.querySelector("[data-splitadd]");
  if (add) add.onclick = () => addSectionTo(pid);
  host.querySelectorAll("[data-split]").forEach(inp => {
    inp.oninput = () => { const s = get().find(x => x.id === +inp.dataset.split); if (!s) return; s.at = +inp.value; $(`sp${pid}-${s.id}-o`).textContent = s.at.toFixed(2) + " m"; persist(); rebuild(false); };
    inp.onchange = () => { get().sort((x, y) => x.at - y.at); renderTreeUI(); };
  });
  host.querySelectorAll("[data-splitfloors]").forEach(sel => sel.onchange = () => {
    const s = get().find(x => x.id === +sel.dataset.splitfloors); if (!s) return;
    const v = +sel.value, lw = pid ? liveWings(p).find(x => x.id === pid) : null, baseHalf = !!(lw ? lw.half : p.halfStorey);
    s.floors = Math.floor(v); s.half = v === 0 ? null : v % 1 ? true : false; s.heights = [];   // (the floors share the height again; a whole number says no attic, a half one an attic)
    persist(); rebuild(false); renderTreeUI(); renderWinUI();
  });
  host.querySelectorAll("[data-splitrm]").forEach(btn => btn.onclick = () => removeDivider(pid, +btn.dataset.splitrm));
}
/** The main building's card: what is where, adding a part, and parts from a file or from My parts. */
/** The card of the main building: its sections (the rest of what it has is in the sections below it, see placeShape). */
function mainCardHtml() {
  return dividersHtml();
}
const FLOOR_KEYS = ["floorHeight", "floor2Height", "floor3Height"], FLOOR_LABELS = ["Height of the ground floor", "Height of the second floor", "Height of the third floor"];
/** A floor of the building or of a part: its height (the attic's: the knee wall). */
function floorCardHtml() {
  const secs = sectionsOf(p, wvPart), sc = secs[wvSec], sectioned = secs.length > 1 && !!sc;
  const wg = wvPart ? liveWings(p).find(x => x.id === wvPart) : null, floors = wg ? wg.floors : p.floors, half = wg ? wg.half : p.halfStorey, w = wvPart ? (p.wings || []).find(x => x.id === wvPart) : null;
  if (wvFloor >= Math.max(maxFloorsWithAttic(p, wvPart), floors + (half ? 1 : 0))) wvFloor = 0;
  const fmt = v => (+v).toFixed(2).replace(/\.?0+$/, "");
  const title = `${esc(floorNameIn(wvPart, wvFloor, wvSec))}${sectioned ? " \u2013 section " + (wvSec + 1) : ""}${w ? " \u2013 " + esc(partName(p, w.id)) : ""}`;
  const walls = `<p class="hint">The walls of this floor are below it in the tree: choose one to put windows, doors and extensions on it and to set how it looks.</p>`;
  if (sectioned) {
    const n = sc.floors, attic = sc.half && wvFloor === n;
    if (wvFloor >= n && !attic) return `<div class="wincard"><h3 class="sub">${title}</h3><p class="hint keep">This section has no such floor: what is listed here is hidden.</p></div>`;
    if (attic) return `<div class="wincard"><h3 class="sub">${title}</h3><div id="floorFieldHost"></div>${walls}</div>`;
    const total = sc.hs.reduce((a, b) => a + b, 0), below = sc.hs.slice(0, wvFloor).reduce((a, b) => a + b, 0), hi = total - below - (n - 1 - wvFloor) * 2.3;
    const own = wvFloor === n - 1
      ? `<p class="hint">Height ${fmt(sc.hs[wvFloor])} m: ${n > 1 ? "the top floor is what is left of the section's " + fmt(total) + " m, so it follows the floors below it. Change one of them." : "the section's whole height, " + fmt(total) + " m. It follows the building's height."}</p>`
      : `<div class="field"><div class="fl"><label for="fl-sh">Height of this floor</label><output id="fl-sh-o">${fmt(sc.hs[wvFloor])} m</output></div><input type="range" id="fl-sh" min="2.3" max="${Math.max(2.3, hi).toFixed(2)}" step="0.05" value="${sc.hs[wvFloor].toFixed(2)}"></div><p class="hint">The floor above it takes the difference, then the next one up: the lowest floors decide.</p>`;
    return `<div class="wincard"><h3 class="sub">${title}</h3>${own}${walls}</div>`;
  }
  const attic = half && wvFloor === floors, k = FLOOR_KEYS[wvFloor];
  const own = w && !attic && k ? `<div class="field"><div class="fl"><label for="fl-h">${FLOOR_LABELS[wvFloor]}</label><output id="fl-h-o">${w[k] ? w[k].toFixed(2) + " m" : "as what it stands on"}</output></div><input type="range" id="fl-h" min="2.2" max="9" step="0.05" value="${w[k] || 2.2}"></div>` : "";
  return `<div class="wincard"><h3 class="sub">${title}</h3><div id="floorFieldHost">${own}</div>${walls}</div>`;
}
/** A section chosen in the tree: where it is, its floors, and where they are set (on the divider before it; the first section has the building's own). */
function sectionCardHtml() {
  const secs = sectionsOf(p, wvPart), sc = secs[wvSec];
  if (!sc) return "";
  const w = wvPart ? (p.wings || []).find(x => x.id === wvPart) : null, lw = wvPart ? liveWings(p).find(x => x.id === wvPart) : null, splits = wvPart ? (lw || {splits: []}).splits : splitsOf(p), dv = wvSec > 0 ? splits[wvSec - 1] : null;
  const fmt = v => (+v).toFixed(2).replace(/\.?0+$/, ""), total = sc.hs.reduce((a, b) => a + b, 0), L = wvPart ? (lw ? lw.wd : w.depth) : (p.ridge === "width" ? p.width : p.depth);
  const base = wvPart ? (lw ? lw.hs : []) : floorHeightsOf(p);
  return `<div class="wincard"><h3 class="sub">Section ${wvSec + 1}${w ? " \u2013 " + esc(partName(p, w.id)) : ""}</h3><p class="hint">${fmt(sc.from)} to ${fmt(sc.to)} m along ${w ? "the extension" : "the building"}: ${sc.floors} floor${sc.floors > 1 ? "s" : ""}, ${fmt(total)} m high. Choose a floor of it in the tree to set its height.</p>`
    + (dv ? `<div class="field"><div class="fl"><label for="sp${wvPart}-${dv.id}">Starts at</label><output id="sp${wvPart}-${dv.id}-o">${dv.at.toFixed(2)} m</output></div><input type="range" id="sp${wvPart}-${dv.id}" data-split="${dv.id}" min="2" max="${Math.max(2, L - 2)}" step="0.05" value="${dv.at}"></div>`
        + sectionHtml(wvPart, dv, sc, base)
        + `<div class="addrow"><button type="button" data-gosplit="${dv.id}">Go to the wall it starts with</button><button type="button" class="danger" data-splitrm="${dv.id}">Remove this section</button></div>`
      : `<p class="hint">The first section has the ${w ? "extension's" : "building's"} own floors: ${w ? "set them in the extension's card" : "set how many with Full floors, below"}.</p>`) + `</div>`;
}
/** Puts the settings row of the chosen floor in its card (the main building's: the rows of the schema; a part's have their own slider). */
function bindFloorCard() {
  const sl = $("fl-sh");
  if (sl) {
    // a floor of a section: setting it moves the floors above (setSectionFloorHeight); the card keeps its slider while it is dragged, the tree is drawn again
    sl.oninput = () => {
      const patch = setSectionFloorHeight(p, wvPart, wvSec, wvFloor, +sl.value);
      if (!patch) return;
      applyHeightPatch(patch, wvPart);
      const h = (sectionsOf(p, wvPart)[wvSec] || {hs: []}).hs[wvFloor];
      if (h) { sl.value = h.toFixed(2); $("fl-sh-o").textContent = (+h.toFixed(2)) + " m"; }
      renderTreeNav();
    };
    sl.onchange = () => renderTreeUI();
    return;
  }
  const host = $("floorFieldHost");
  if (!host) return;
  const wg = wvPart ? liveWings(p).find(x => x.id === wvPart) : null, half = wg ? wg.half : p.halfStorey, floors = wg ? wg.floors : p.floors;
  const attic = half && wvFloor === floors, k = attic ? "kneeWall" : FLOOR_KEYS[wvFloor];
  if (attic || !wvPart) { if (floorRows[k]) { host.appendChild(floorRows[k]); syncOutputs(); } return; }
  const w = (p.wings || []).find(x => x.id === wvPart), el = $("fl-h");
  if (!w || !el) return;
  el.oninput = e => { w[k] = +e.target.value < 2.3 ? 0 : +(+e.target.value).toFixed(2); $("fl-h-o").textContent = w[k] ? w[k].toFixed(2) + " m" : "as what it stands on"; persist(); rebuild(false); };
  el.onchange = () => { partsChanged(); };
}
/** Writes what setSectionFloorHeight gave: the building's own heights (and the Shape rows that show them), a part's, or the dividers' lists. */
function applyHeightPatch(patch, pid) {
  const w = pid ? (p.wings || []).find(x => x.id === pid) : null;
  if (patch.building) { Object.assign(p, patch.building); for (const k of Object.keys(patch.building)) if (inputs[k]) inputs[k].value = p[k]; syncOutputs(); }
  if (patch.wing && w) Object.assign(w, patch.wing);
  if (patch.splits) { if (pid) { if (w) w.splits = patch.splits; } else p.splits = patch.splits; }
  persist(); rebuild(false);
}
/** A wall's own panel and colour (p.wallStyles): the upper and, where the wall is split, the lower. Empty: as the part the wall belongs to. */
const WALL_LOOK_KEYS = ["wallCladding", "wallColor", "lowerCladding", "lowerColor"];
function wallLookHtml(key) {
  p.wallStyles = p.wallStyles || {};
  const ws = p.wallStyles[key] = p.wallStyles[key] || {}, pid = wingIdOf(key);
  const mine = {...partStyle(p, pid), ...ws, wallSplit: splitAtOf(p, key) > 0 ? "floor" : "one"};
  return partLookHtml(ws, {keys: WALL_LOOK_KEYS, pid, mine, open: true, summary: name => `Panel and colour: the same as ${name} unless set here`});
}
function bindWallLook(key) {
  const ed = $("wallLookW");
  if (!ed) return;
  const ws = (p.wallStyles = p.wallStyles || {})[key] = (p.wallStyles || {})[key] || {};
  bindPartLook(ed, ws, () => { if (!Object.keys(ws).length) delete p.wallStyles[key]; persist(); rebuild(false); syncOutputs(); renderTreeUI(); }, wingIdOf(key));
}
/** A wall's card: how long it is, and buttons to put a window, a door or a part on it where there is room. */
function wallCardHtml() {
  return (isSplitWall(wvWall) ? dividerCardHtml(wvWall) : "") + wallCardBody();
}
function wallCardBody() {
  const walls = wallsOf(p), L = walls[wvWall].L, wid = wingIdOf(wvWall), wf = wid ? liveWings(p).find(x => x.id === wid) : null;
  // (the floors the wall can have: the most of its sections, and the attic when there is one: choosing a later floor in the tree must not fall back to the ground floor)
  const floorsHere = Math.max(maxFloorsWithAttic(p, wid), (wf ? wf.floors : p.floors) + ((wf ? wf.half : p.halfStorey) ? 1 : 0));
  if (wvFloor >= floorsHere) wvFloor = 0;
  return `<div class="wincard"><h3 class="sub">${esc(wallLabel(p, wvWall))}</h3><p class="hint">${esc(wallLabel(p, wvWall))}, ${esc(floorNameIn(wid, wvFloor, wvSec).toLowerCase())}, ${L.toFixed(1)} m long. Add something on it:</p><div class="addrow"><button type="button" data-wvadd="window">+ Window</button><button type="button" data-wvadd="door" ${wvFloor === 0 ? "" : 'disabled title="Doors go on the ground floor"'}>+ Door</button>`
    + `<button type="button" data-wvadd="part" ${(p.wings || []).length >= MAX_WINGS || wvFloor !== 0 || isSplitWall(wvWall) ? "disabled" : ""}${wvFloor !== 0 ? ' title="Extensions stand on the ground floor"' : ""}>+ Extension</button>`
    + `</div></div>` + `<div class="wincard"><h3 class="sub">Look of this wall</h3><div id="wallLookW">${wallLookHtml(wvWall)}</div><div id="zonesEditorW"></div></div>`
    + `<div class="wincard"><h3 class="sub">Wallpaper on the inside</h3><div id="papersEditorW"></div></div>`
    + pipesCardHtml(wvWall);
}
/** Just the tree (not the card under it). */
function renderTreeNav() {
  const nav = $("treeNav");
  if (!nav) return;
  // (what was chosen may be gone)
  if (treeKind === "win" && !p.windows.some(w => w.id === selId)) treeKind = "main";
  if (treeKind === "part" && !(p.wings || []).some(w => w.id === wSel)) treeKind = "main";
  if (treeKind === "wall" && !wallsOf(p)[wvWall]) treeKind = "main";
  if (treeKind === "object" && !objectsNow().some(o => o.id === ob.sel)) treeKind = "game";
  if (treeKind === "game" && !(kindOf(p).objects || {types: []}).types.length) treeKind = "main";
  if ((treeKind === "floor" || treeKind === "section") && wvPart && !(p.wings || []).some(w => w.id === wvPart)) treeKind = "main";
  { const n = sectionsOf(p, treeKind === "wall" ? wingIdOf(wvWall) : wvPart).length; if (wvSec >= n) wvSec = 0; }
  nav.innerHTML = treeNavHtml();
  fitTree();
  nav.querySelectorAll("[data-node]").forEach(b => b.onclick = () => {
    const [kind, v, f, sc] = b.dataset.node.split(":");
    selectNode(kind, nodeArg(kind, v, f, sc));
  });
  nav.ondragstart = e => {
    const b = e.target.closest && e.target.closest("[data-node]");
    const [kind, v] = b ? b.dataset.node.split(":") : [];
    if (kind !== "win" && kind !== "part") { e.preventDefault(); return; }
    treeDrag = {kind, id: +v}; closeCtx();
    e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", b.dataset.node);
    b.closest("li").classList.add("dragging");
  };
  nav.ondragend = () => { treeDrag = null; clearDrop(); nav.querySelectorAll(".dragging").forEach(li => li.classList.remove("dragging")); };
  nav.ondragover = e => {
    const li = e.target.closest && e.target.closest("li.tnode"), zone = dropZone(li, e);
    clearDrop();
    if (!zone) return;
    e.preventDefault(); e.dataTransfer.dropEffect = "move";
    li.classList.add("drop-" + zone);
  };
  nav.ondragleave = e => { if (!nav.contains(e.relatedTarget)) clearDrop(); };
  nav.ondrop = e => {
    const li = e.target.closest && e.target.closest("li.tnode"), zone = dropZone(li, e);
    e.preventDefault(); clearDrop();
    if (zone) dropOn(li, zone);
    treeDrag = null;
  };
  nav.oncontextmenu = e => {
    const b = e.target.closest && e.target.closest("[data-node]");
    if (!b) return;
    const [kind, v, f, sc] = b.dataset.node.split(":"), target = nodeTarget(kind, v, f), adds = ctxAdds(kind, v, f);
    if (!target && !adds.length) return;
    e.preventDefault();
    selectNode(kind, nodeArg(kind, v, f, sc));
    showCtx(e.clientX, e.clientY, target, adds);
  };
  nav.querySelectorAll("[data-toggle]").forEach(b => b.onclick = () => { const k = b.dataset.toggle; if (treeClosed.has(k)) treeClosed.delete(k); else treeClosed.add(k); renderTreeNav(); });
  // the tree has a fixed height and scrolls inside: keep what is chosen in view (and where it was scrolled to, across redraws)
  const box = nav.querySelector(".tree"), cur = nav.querySelector('[aria-pressed="true"]');
  nav.scrollTop = treeScroll;
  if (cur && box) { const t = cur.offsetTop - nav.offsetTop; if (t < nav.scrollTop) nav.scrollTop = Math.max(0, t - 4); else if (t + cur.offsetHeight > nav.scrollTop + nav.clientHeight) nav.scrollTop = t + cur.offsetHeight - nav.clientHeight + 4; }
  nav.onscroll = () => { treeScroll = nav.scrollTop; };
}
function renderTreeUI() {
  const nav = $("treeNav");
  if (!nav) return;
  renderTreeNav();
  const main = $("mainCard"), wall = $("wallCard");
  main.innerHTML = treeKind === "main" ? mainCardHtml() : "";
  mainChosen = treeKind === "main"; placeShape();
  wall.innerHTML = treeKind === "wall" ? wallCardHtml() : treeKind === "floor" ? floorCardHtml() : treeKind === "section" ? sectionCardHtml() : "";
  if (treeKind === "game" || treeKind === "object") renderObjectsCard(wall);
  if (treeKind === "section" || treeKind === "floor") wall.querySelectorAll("[data-gosplit]").forEach(b => b.onclick = () => selectNode("wall", splitNodeArg(wvPart ? wingSplitKey(wvPart, +b.dataset.gosplit) : "s" + b.dataset.gosplit)));
  if (treeKind === "main") {
    bindDividers(main, 0);
  }
  if (treeKind === "section") bindDividers(wall, wvPart);
  if (treeKind === "wall" && isSplitWall(wvWall)) wall.querySelectorAll("[data-gosection]").forEach(b => b.onclick = () => selectNode("section", {part: wingIdOf(wvWall), index: +b.dataset.gosection}));
  if (treeKind === "wall") { renderPipesUI(); bindWallLook(wvWall); renderZonesUI("zonesEditorW", wvWall); renderPapersUI("papersEditorW", wvWall); }
  if (treeKind === "floor") bindFloorCard();
  if (treeKind === "wall") {
    wall.querySelectorAll("[data-wvadd]").forEach(b => b.onclick = () => addOnWall(b.dataset.wvadd));
  }
  renderWinCard(); renderPartCard();
}
/** A window, a door or a part on the wall chosen in the tree (its floor and section too): where there is room, with the reason when there is none. */
function addOnWall(kind) {
  if (kind === "part") { addPart(wvWall); return; }
  const runs = sectionRuns(p, wvWall, (wallsOf(p)[wvWall] || {L: 1}).L), mine = runs.find(r => r.sec.index === wvSec) || runs[0], run = runs.length > 1 ? mine : null;
  // (the section the wall is in here: a wall along the building has a stretch in each section, an end wall or a divider is in one, which is not always the first)
  const secHere = mine ? mine.sec : sectionsOf(p, wingIdOf(wvWall))[0], halfHere = (wingIdOf(wvWall) ? (liveWings(p).find(x => x.id === wingIdOf(wvWall)) || {}).half : p.halfStorey) ? 1 : 0;
  if (kind === "window" && secHere && wvFloor >= secHere.floors + (secHere.half ? 1 : 0)) { toast("This section has no such floor"); return; }
  const next = addOpening(p, wvWall, kind, wvFloor, run ? (run.a + run.b) / 2 : null);
  if (!next) { toast(openingProblem(p, wvWall, kind, wvFloor, run ? (run.a + run.b) / 2 : null) || `No room for a ${kind} on this ${kind === "door" ? "wall's ground floor" : "floor of this wall"}: move or remove something first`); return; }
  p.windows = next; selId = next[next.length - 1].id; treeKind = "win"; winChanged(); renderTreeUI(); updateHighlight();
}
/** A part on the main building (on the first wall with room) or on part pid (on a side or its end). */
function addChildPart(pid) {
  if (pid) { if (!["Left", "Right", "End"].some(sd => addPart(wingWallKey(pid, sd)))) toast(`No room for an extension on ${partName(p, pid)}`); }
  else if (!["back", "front", "right", "left"].some(k => addPart(k))) toast("No room for another extension on the main building");
}
/**
 * What can be added from a tree node, for the menu: [{act, label, on}] (on: whether it can be tried): a window, a door and a part on a wall (a door on the ground floor only, a part on the ground floor of a
 * wall that isn't a divider), a part on a part or on the main building.
 */
function ctxAdds(kind, v, f) {
  const room = (p.wings || []).length < MAX_WINGS;
  if (kind === "wall") return [{act: "add-window", label: "Add window", on: true}, {act: "add-door", label: "Add door", on: +f === 0}, {act: "add-part", label: "Add extension", on: +f === 0 && !isSplitWall(v) && room}];
  // (a part is added on a wall, so the menus of the building and of a part have no "add part": the walls under them have; what they are divided into is sections)
  if (kind === "main") return [{act: "add-section", label: "Add section", on: p.roofType !== "hip" && (p.splits || []).length < MAX_SPLITS}];
  if (kind === "part") { const w = (p.wings || []).find(x => x.id === +v); return [{act: "add-section", label: "Add section", on: !!w && (w.splits || []).length < MAX_SPLITS}]; }
  if (kind === "group") return objectsNow().filter(o => o.type === v).length < MAX_TROUGHS ? [{act: "add-obj:" + v, label: "Add " + objectInfo(kindOf(p), v).name.toLowerCase(), on: true}] : [];
  if (kind === "game") { const have = new Set(objectsNow().map(o => o.type)); return ((kindOf(p).objects || {types: []}).types).filter(t => MANY.includes(t) ? objectsNow().filter(o => o.type === t).length < MAX_TROUGHS : !have.has(t)).map(t => ({act: "add-obj:" + t, label: "Add " + objectInfo(kindOf(p), t).name.toLowerCase(), on: true})); }
  return [];
}
/* ---------- Duplicating and deleting what is chosen in the tree: the context menu, Ctrl+D and Delete ---------- */
function removeWindow(id) {
  const s = p.windows.find(w => w.id === id);
  if (!s) return false;
  if (s.type === "door" && p.windows.filter(w => w.type === "door").length === 1) { toast("This is the building's only door: it can't be removed"); return false; }
  p.windows = p.windows.filter(w => w.id !== id); selId = null; treeKind = "wall"; wvWall = s.wall; winChanged(); renderTreeUI(); updateHighlight();
  return true;
}
function removePart(id) {
  const wings = p.wings || [], w = wings.find(x => x.id === id);
  if (!w) return false;
  const gone = new Set([w.id]); for (let again = true; again;) { again = false; for (const x of wings) if (!gone.has(x.id) && gone.has(wingIdOf(x.wall))) { gone.add(x.id); again = true; } }
  const name = partName(p, w.id);
  p.wings = wings.filter(x => !gone.has(x.id));
  p.windows = p.windows.filter(x => !gone.has(wingIdOf(x.wall)));
  wSel = null; selId = null; treeKind = "wall"; wvWall = w.wall; partsChanged(); toast(gone.size > 1 ? `${name} and ${gone.size - 1} more removed` : `${name} removed`);
  return true;
}
function removeDivider(pid, id) {
  const w = pid ? (p.wings || []).find(x => x.id === pid) : null, key = pid ? wingSplitKey(pid, id) : "s" + id;
  if (pid && !w) return false;
  if (pid) w.splits = (w.splits || []).filter(x => x.id !== id); else p.splits = (p.splits || []).filter(x => x.id !== id);
  p.windows = p.windows.filter(x => x.wall !== key);
  persist(); rebuild(false); renderTreeUI();
  return true;
}
function duplicateWindow(id) {
  const next = duplicateOpening(p, id);
  if (!next) { toast("No room beside it on the wall"); return false; }
  p.windows = next; selId = next[next.length - 1].id; treeKind = "win"; winChanged(); renderTreeUI(); updateHighlight();
  return true;
}
function duplicatePart(id) {
  const w = (p.wings || []).find(x => x.id === id), f = w && exportPart(p, id);
  if (!f) return false;
  return applyPart(f, w.wall, "Extension copied.");
}
function duplicateDivider(pid, id) {
  const r = duplicateSplit(p, pid, id);
  if (!r) { toast("No room for another section"); return false; }
  if (pid) (p.wings || []).find(x => x.id === pid).splits = r.splits; else p.splits = r.splits;
  p.windows = r.windows; persist(); rebuild(false); winChanged();
  selectNode("section", {part: pid, index: r.splits.findIndex(x => x.id === r.id) + 1});
  return true;
}
/** What a tree node (as nodeKey writes it) can do: {kind, ...ids} for a window or door, a part or a divider, else null (walls, floors and the main building are not copied or deleted). */
function nodeTarget(kind, v, f) {
  if (kind === "object" && objectsNow().some(o => o.id === +v)) return {kind: "object", id: +v};
  if (kind === "section" && +f >= 1) { const w = +v ? (liveWings(p).find(x => x.id === +v) || {splits: []}) : null, dv = (w ? w.splits : splitsOf(p))[+f - 1]; return dv ? {kind: "split", pid: +v, id: dv.id} : null; }
  if (kind === "win" && p.windows.some(w => w.id === +v)) return {kind: "win", id: +v};
  if (kind === "part" && (p.wings || []).some(w => w.id === +v)) return {kind: "part", id: +v};
  if (kind === "wall" && isSplitWall(v)) return {kind: "split", pid: wingIdOf(v), id: +/(\d)$/.exec(v)[1]};
  return null;
}
/** The target of what is chosen now. */
const chosenTarget = () => treeKind === "object" ? nodeTarget("object", ob.sel) : treeKind === "win" ? nodeTarget("win", selId) : treeKind === "part" ? nodeTarget("part", wSel) : treeKind === "wall" ? nodeTarget("wall", wvWall) : treeKind === "section" ? nodeTarget("section", wvPart, wvSec) : null;
const duplicateTarget = t => t.kind === "object" ? false : t.kind === "win" ? duplicateWindow(t.id) : t.kind === "part" ? duplicatePart(t.id) : duplicateDivider(t.pid, t.id);
const deleteTarget = t => t.kind === "object" ? removeObject(t.id) : t.kind === "win" ? removeWindow(t.id) : t.kind === "part" ? removePart(t.id) : removeDivider(t.pid, t.id);
/** Applies what moveBeside / moveToWall gave (or says why not), and chooses the thing that was moved. */
function applyMove(item, r) {
  if (!r || r.error) { toast((r && r.error) || "It can't be moved there."); return false; }
  if (r.windows) p.windows = r.windows;
  if (r.wings) p.wings = r.wings;
  if (r.wings) partsChanged(); else winChanged();
  selectNode(item.kind, item.id);
  return true;
}
/** The list the tree shows a window, door or part in: [{kind, id, s0, s1 ...}] along its wall, and where it stands in it. */
function siblingsOf(t) {
  const a = t.kind === "win" ? p.windows.find(w => w.id === t.id) : (p.wings || []).find(w => w.id === t.id);
  if (!a) return null;
  const floor = t.kind === "win" ? a.floor : 0, list = wallItems(p, a.wall).filter(i => i.kind === "part" ? floor === 0 : i.floor === floor).sort((x, y) => x.s0 - y.s0);
  return {list, i: list.findIndex(x => x.id === t.id && (x.kind === "part") === (t.kind === "part"))};
}
/** One place up (dir -1) or down (+1) in its list. */
function moveStep(t, dir) {
  const sib = siblingsOf(t), n = sib && sib.list[sib.i + dir];
  if (!n) return false;
  return applyMove({kind: t.kind, id: t.id}, moveBeside(p, {kind: t.kind, id: t.id}, {kind: n.kind === "part" ? "part" : "win", id: n.id}, dir > 0));
}
let treeDrag = null;
const clearDrop = () => document.querySelectorAll("#treeNav .drop-before, #treeNav .drop-after, #treeNav .drop-into").forEach(li => li.classList.remove("drop-before", "drop-after", "drop-into"));
/** Where a drop on tree row li would go: "before" or "after" a window, door or part (the half of the row), "into" a wall, or null. */
function dropZone(li, e) {
  if (!treeDrag || !li) return null;
  const btn = li.querySelector(".tbtn"), [kind, v] = btn ? btn.dataset.node.split(":") : [];
  if (kind === "wall") return "into";
  if ((kind === "win" || kind === "part") && !(kind === treeDrag.kind && +v === treeDrag.id)) { const r = li.getBoundingClientRect(); return e.clientY < r.top + r.height / 2 ? "before" : "after"; }
  return null;
}
function dropOn(li, zone) {
  const item = treeDrag, [kind, v] = li.querySelector(".tbtn").dataset.node.split(":"), wall = li.dataset.wall, floor = +li.dataset.floor;
  if (zone === "into") return applyMove(item, moveToWall(p, item, wall, floor, null, true, li.dataset.at ? +li.dataset.at : null));
  const target = {kind, id: +v}, mine = item.kind === "win" ? p.windows.find(w => w.id === item.id) : (p.wings || []).find(w => w.id === item.id);
  if (mine && mine.wall === wall && (item.kind === "win" ? mine.floor : 0) === floor) return applyMove(item, moveBeside(p, item, target, zone === "after"));
  const near = wallItems(p, wall).find(i => i.id === target.id && (target.kind === "part") === (i.kind === "part"));
  return applyMove(item, moveToWall(p, item, wall, floor, near || null, zone === "after"));
}
let ctxMenu = null;
function closeCtx() { if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; } }
function showCtx(x, y, target, adds = []) {
  closeCtx();
  const m = document.createElement("div");
  m.className = "hx-ctx"; m.setAttribute("role", "menu");
  const item = (act, label, key = "", on = true) => `<button type="button" role="menuitem" data-act="${act}" ${on ? "" : "disabled"}><span>${label}</span>${key ? `<kbd>${key}</kbd>` : ""}</button>`;
  const sib = target && (target.kind === "win" || target.kind === "part") ? siblingsOf(target) : null, groups = [];
  if (adds.length) groups.push(adds.map(a => item(a.act, a.label, "", a.on)).join(""));
  if (sib) groups.push(item("up", "Move up", "Alt+\u2191", sib.i > 0) + item("down", "Move down", "Alt+\u2193", sib.i < sib.list.length - 1));
  if (target) groups.push((target.kind === "object" ? "" : item("dup", "Duplicate", "Ctrl+D")) + item("del", "Delete", "Del"));
  m.innerHTML = groups.join("<hr>");
  editorEl.appendChild(m); ctxMenu = m;
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(4, Math.min(x, window.innerWidth - r.width - 4)) + "px"; m.style.top = Math.max(4, Math.min(y, window.innerHeight - r.height - 4)) + "px";
  const on = (act, fn) => { const b = m.querySelector(`[data-act="${act}"]`); if (b) b.onclick = () => { closeCtx(); fn(); }; };
  const addRun = {"add-window": () => addOnWall("window"), "add-door": () => addOnWall("door"), "add-part": () => treeKind === "wall" ? addOnWall("part") : addChildPart(treeKind === "part" ? wSel : 0), "add-section": () => addSectionTo(treeKind === "part" ? wSel : 0)};
  for (const a of adds) on(a.act, a.act.startsWith("add-obj:") ? () => addObject(a.act.slice(8)) : addRun[a.act]);
  if (target) { on("dup", () => duplicateTarget(target)); on("del", () => deleteTarget(target)); on("up", () => moveStep(target, -1)); on("down", () => moveStep(target, 1)); }
  const first = m.querySelector("button:not([disabled])");
  if (first) first.focus();
  m.onkeydown = e => { const b = [...m.querySelectorAll("button:not([disabled])")], i = b.indexOf(document.activeElement); if (e.key === "ArrowDown") { e.preventDefault(); b[(i + 1) % b.length].focus(); } else if (e.key === "ArrowUp") { e.preventDefault(); b[(i + b.length - 1) % b.length].focus(); } };
}
function treeKey(e) {
  if (e.key === "Escape") { closeCtx(); return; }
  if (destroyed || ins.on || walk.on || editorEl.dataset.tab !== "building") return;
  const t = e.target;
  if (t && t.closest && t.closest("input, textarea, select, [contenteditable=true], dialog[open]")) return;
  if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
    const target = chosenTarget();
    if (target && target.kind !== "split") { e.preventDefault(); closeCtx(); moveStep(target, e.key === "ArrowUp" ? -1 : 1); }
    return;
  }
  if (e.altKey) return;
  const dup = (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "d", del = e.key === "Delete" && !e.ctrlKey && !e.metaKey && !e.shiftKey;
  if (!dup && !del) return;
  const target = chosenTarget();
  if (!target) return;
  e.preventDefault(); closeCtx();
  if (dup) duplicateTarget(target); else deleteTarget(target);
}
window.addEventListener("keydown", treeKey);
const closeCtxOutside = e => { if (ctxMenu && !ctxMenu.contains(e.target)) closeCtx(); };
window.addEventListener("pointerdown", closeCtxOutside, true); window.addEventListener("resize", closeCtx); window.addEventListener("blur", closeCtx);
cleanups.push(() => { window.removeEventListener("keydown", treeKey); window.removeEventListener("pointerdown", closeCtxOutside, true); window.removeEventListener("resize", closeCtx); window.removeEventListener("blur", closeCtx); closeCtx(); });
// (the old names: the parts and the windows used to be two editors; both are the tree now)
function renderWinUI() { renderTreeUI(); }
function renderWingsUI() { renderTreeUI(); }
/* ---------- Game objects ---------- */
// The game's boxes and icons and the pasture's fence (objects.mjs): a list in the Game objects section, and
// a plan view of the yard to drag them in (ob.on).
const ob = {on: false, sel: null, drag: null, pan: [0, 0], saved: null, pt: null};
/** A box object's sliders: [key, label, step]. */
const BOX_SLIDERS = [["x", "Left / right (+ to the right)", 0.25], ["z", "Back / front (+ to the front)", 0.25], ["w", "Width (left to right)", 0.05],
  ["d", "Depth (back to front)", 0.05], ["h", "Height", 0.05], ["ix", "Icon left / right", 0.05], ["iz", "Icon back / front", 0.05]];
const objectsNow = () => p.objects || [];
const selObject = () => objectsNow().find(o => o.id === ob.sel) || null;
const objName = o => { const name = objectInfo(kindOf(p), o.type).name, same = objectsNow().filter(x => x.type === o.type); return same.length > 1 ? `${name} ${same.indexOf(same.find(x => x.id === o.id)) + 1}` : name; };
/** An edit to the objects: snapped, saved and built. */
function setObjects(list, sel = ob.sel) {
  p.objects = list; ob.sel = sel;
  const ruled = applyKindRules(); if (ruled) syncControls();
  persist(); rebuild(false); renderObjectsUI();
}
const snapObj = o => o.type === "pasture" ? snapPasture(o, kindOf(p), p) : snapBox(o, p);
/** The details of the game objects chosen in the tree: the group (the plan view, the objects that can be added, place them all) or one object (its sliders), in host. */
function renderObjectsCard(ed) {
  const kind = kindOf(p), spec = kind.objects || {types: [], required: []}, list = objectsNow(), pr = objectProblems(p);
  if (!spec.types.length) { ed.innerHTML = `<p class="hint">This building has no game objects.</p>`; return; }
  const group = treeKind === "game";
  if (!list.some(o => o.id === ob.sel)) ob.sel = null;
  const opt = (v, label, cur) => `<option value="${v}" ${v === cur ? "selected" : ""}>${esc(label)}</option>`;
  // (one of each, but any number of feed and water troughs)
  const missing = spec.types.filter(t => MANY.includes(t) ? list.filter(o => o.type === t).length < MAX_TROUGHS : !list.some(o => o.type === t));
  let html = `<div class="row"><button type="button" class="primary" id="objPlan" ${renderer ? "" : "disabled"}>${ob.on ? "Done moving" : "Move them in the plan view"}</button></div>`;
  if (group) html += `<p class="hint">What the game needs around the building: where you sleep, tip feed, drop bales, load animals, collect eggs, and the pasture's fence. Add and remove them here, and drag them into place in the plan view.</p>`;
  if (group) html += objectWarnings(p).map(w => `<p class="warn">${esc(w)}</p>`).join("");
  if (group && missing.length) html += `<div class="addrow">${missing.map(t => `<button type="button" data-addobj="${t}">+ ${esc(objectInfo(kind, t).name)}</button>`).join("")}</div>`;
  const o = group ? null : selObject();
  if (o) {
    const t = objectInfo(kind, o.type), must = spec.required.includes(o.type), range = (k, label, lo, hi, step, v, unit = " m") =>
      `<div class="field"><div class="fl"><label for="ob-${k}">${label}</label><output id="ob-${k}-o">${(+v).toFixed(2)}${unit}</output></div><input type="range" id="ob-${k}" data-k="${k}" min="${lo}" max="${hi}" step="${step}" value="${v}"></div>`;
    html += `<div class="wincard"><h3 class="sub">${esc(t.name)}</h3><p class="hint">${esc(t.hint)}</p>${MANY.includes(o.type) && TROUGH_KINDS.includes(p.kind) && list.filter(x => x.type === o.type).length > 1 ? `<p class="hint">There are several: the animals use all of them, but the game shows the amount of feed (or water) in the first one only.</p>` : ""}${pr.has(o.id) ? `<p class="warn">${esc(pr.get(o.id))}.</p>` : ""}`;
    if (o.type === "pasture") {
      const pa = pastureOf(p), ps = spec.pasture;
      html += `<div class="field"><div class="fl"><label for="ob-wall">Wall</label></div><select id="ob-wall">${WALLS.map(k => opt(k, WALL_NAMES[k], o.wall)).join("")}</select></div>`;
      if (o.points) {
        const n = o.points.length, sel = ob.pt !== null && ob.pt < n ? ob.pt : null;
        html += `<p class="hint"><b>The fence is drawn by hand: ${n} posts.</b> Drag a post in the plan view; press a small dot between two posts to make a new one. The green post is where it starts, the red where it stops: put them at corners of the building (they snap there).</p>`
          + `<p class="hint">${sel === null ? "Press a post to choose it." : `Post ${sel + 1} of ${n}${sel === 0 ? " (the start)" : sel === n - 1 ? " (the stop)" : ""}. ${[sel < n - 1 ? `<b>${fenceDist(o.points, sel, sel + 1).toFixed(2)} m</b> to the next post` : "", sel > 0 ? `${fenceDist(o.points, sel, sel - 1).toFixed(2)} m from the previous one` : ""].filter(Boolean).join(", ")}.`} The whole fence is ${o.points.slice(1).reduce((s, q, j) => s + fenceDist(o.points, j, j + 1), 0).toFixed(1)} m.</p>`
          + `<div class="row">${ob.on ? "" : `<button type="button" id="ob-plan" class="primary">Drag the posts in the plan view</button>`}<button type="button" id="ob-addpt" ${n >= MAX_FENCE_POINTS ? "disabled" : ""}>+ Add a post</button><button type="button" id="ob-rmpt" ${sel === null || n <= 2 ? "disabled" : ""}>Remove this post</button><button type="button" id="ob-rect">Back to a rectangle</button></div>`;
        html += range("a", "Animals go out from the wall’s left end (0: the corner)", OBJECT_LIMITS.end[0], pa.L, 0.25, o.a);
        html += range("b", "…to the wall’s right end (0: the corner)", OBJECT_LIMITS.end[0], pa.L, 0.25, o.b);
      } else {
        html += range("a", "Start, from the wall’s left end (0: the corner)", OBJECT_LIMITS.end[0], pa.L, 0.25, o.a);
        html += range("b", "End, from the wall’s right end (0: the corner)", OBJECT_LIMITS.end[0], pa.L, 0.25, o.b);
        html += range("depth", "Depth, out from the wall", ps.depth[0], ps.depth[1], 0.5, o.depth);
        html += `<p class="hint">At least ${ps.minWidth} m wide. Below 0 it runs past the corner and back along the wall to the building.</p>`
          + `<div class="row"><button type="button" id="ob-draw">Draw the fence myself</button></div><p class="hint">Draw it with posts in the plan view: any shape, from one corner of the building round to another.</p>`;
      }
      // the opening to the pasture, like a door that is only a hole: where along the wall and how big
      html += `<label class="check"><input type="checkbox" id="ob-nogap" ${o.noGap ? "" : "checked"}> The building’s own opening to the pasture</label>`;
      html += o.noGap ? `<p class="hint">No opening: add a door and choose the style “Open doorway, framed (no door)” for an empty hole with a frame, wherever you want it.</p>`
        : `<p class="hint">The animals walk through it (a small hatch for hens). Its middle is measured from the wall’s left end seen from outside.</p>`;
      if (!o.noGap) html += `<label class="check"><input type="checkbox" id="ob-ramp" ${o.gapRamp ? "checked" : ""}> A ramp down to the ground (needs a foundation)</label>`;
      if (!o.noGap) html += range("gapAt", "Opening: position (m from the left end)", 0, pa.L, 0.05, pa.mid);
      if (ps.gapSize && !o.noGap) {
        html += range("gapW", "Opening: width", GAP_LIMITS.w[0], GAP_LIMITS.w[1], 0.05, pa.gapW);
        html += range("gapH", "Opening: height", GAP_LIMITS.h[0], GAP_LIMITS.h[1], 0.05, pa.gapH);
      }
    } else {
      // a trough can look like one of the user's items: its size is the model's
      const looks = o.type === "feedTrough" || o.type === "waterTrough" ? troughLooks(p, o.type) : null, shown = looks && looks.find(a => a.id === o.asset);
      if (looks && (looks.length || o.asset)) html += `<div class="field"><div class="fl"><label for="ob-look">Look</label></div><select id="ob-look">${opt("", "Plank trough (built in)", o.asset || "")}${looks.map(a => opt(a.id, a.name, o.asset || "")).join("")}${o.asset && !shown ? opt(o.asset, "(an item no longer in your list)", o.asset) : ""}</select></div>`
        + (shown ? `<p class="hint">Its size comes from the model: ${assetSize(normalizeMeta(shown.meta)).map(v => v.toFixed(2)).join(" × ")} m.</p>`
          + `<div class="field"><div class="fl"><label for="ob-rot">Rotation</label><output id="ob-rot-o">${Math.round(o.rot || 0)}°</output></div><input type="range" id="ob-rot" data-turn min="0" max="359" step="1" value="${Math.round(o.rot || 0)}"></div>` : "");
      for (const [k, label, step] of BOX_SLIDERS) {
      if ((k === "ix" || k === "iz") && !t.icon) continue;
      if (shown && (k === "w" || k === "d" || k === "h")) continue;
      const [lo, hi] = OBJECT_LIMITS[k];
      html += range(k, label, lo, hi, step, o[k]);
      }
    }
    html += `<div class="row">${o.type !== "pasture" ? `<button type="button" id="objTurn">Turn</button>` : ""}<button type="button" id="objRemove" class="danger" ${must ? `disabled title="The ${esc(kind.name.toLowerCase())} needs it"` : ""}>Remove</button></div></div>`;
  } else if (group) html += `<p class="hint">Choose an object in the tree to change it, or move them in the plan view.</p>`;
  if (group) html += `<button type="button" id="objAuto">Place all automatically</button>`;
  ed.innerHTML = html;
  $("objPlan").onclick = () => ob.on ? leaveObjects() : enterObjects();
  ed.querySelectorAll("[data-addobj]").forEach(b => b.onclick = () => addObject(b.dataset.addobj));
  if ($("objAuto")) $("objAuto").onclick = () => { setObjects(sanitize({...p, objects: spec.defaults({...p})}).objects, null); toast("Game objects placed where they go automatically"); };
  // the settings that belong to the fence (the kind's cardRow fields: the ground, animals walking inside) sit in the pasture's card
  if (o && o.type === "pasture") {
    const at = $("objRemove").parentNode;
    for (const f of Object.values(fieldsFor(kind))) if (f.cardRow && floorRows[f.k]) at.parentNode.insertBefore(floorRows[f.k], at);
    syncOutputs();
  }
  if (!o) return;
  const swap = next => setObjects(sanitize({...p, objects: list.map(x => x.id === o.id ? next : x)}).objects, o.id);
  // a look's rotation: the model turns about its middle; the footprint is the box round it
  const turned = c => {
    const a = troughLooks(p, c.type).find(x => x.id === c.asset);
    if (!a) return c;
    const rot = ((c.rot || 0) % 360 + 360) % 360, [w, d] = turnedSize(normalizeMeta(a.meta), rot), n = {...c, w, d};
    if (rot) n.rot = rot; else delete n.rot;
    return n;
  };
  if ($("ob-rot")) {
    const inp = $("ob-rot");
    inp.oninput = () => {
      const next = turned({...selObject(), rot: +inp.value});
      p.objects = objectsNow().map(x => x.id === next.id ? next : x);
      $("ob-rot-o").textContent = `${Math.round(+inp.value)}°`;
      applyKindRules(); rebuild(false);
    };
    inp.onchange = () => swap(snapObj(turned({...selObject(), rot: +inp.value})));
  }
  ed.querySelectorAll(".wincard input[type=range]:not([data-turn])").forEach(inp => {
    inp.oninput = () => {
      const k = inp.dataset.k, cur = selObject(), next = {...cur, [k]: +inp.value};
      p.objects = objectsNow().map(x => x.id === cur.id ? next : x);
      $(`ob-${k}-o`).textContent = `${(+inp.value).toFixed(2)} m`;
      applyKindRules(); rebuild(false);
    };
    inp.onchange = () => swap(snapObj(selObject()));
  });
  if ($("ob-ramp")) $("ob-ramp").onchange = e => { const c = {...selObject()}; if (e.target.checked) c.gapRamp = true; else delete c.gapRamp; swap(snapObj(c)); };
  if ($("ob-nogap")) $("ob-nogap").onchange = e => { const c = {...selObject()}; if (e.target.checked) delete c.noGap; else c.noGap = true; swap(snapObj(c)); };
  if ($("ob-wall")) $("ob-wall").onchange = e => swap(snapObj({...selObject(), wall: e.target.value}));
  // a fence drawn by hand: start it from the rectangle, add and remove posts, go back
  if ($("ob-draw")) $("ob-draw").onclick = () => { ob.pt = null; swap(snapObj({...selObject(), points: fencePoints(p)})); if (!ob.on) { enterObjects(); } };
  // the posts are dragged in the plan view: a button to it while the fence is being drawn
  if ($("ob-plan")) $("ob-plan").onclick = () => { enterObjects(); };
  if ($("ob-rect")) $("ob-rect").onclick = () => { const c = {...selObject()}; delete c.points; ob.pt = null; swap(snapObj(c)); };
  if ($("ob-addpt")) $("ob-addpt").onclick = () => {
    const c = selObject(), pts = c.points.slice(), i = ob.pt !== null && ob.pt < pts.length ? ob.pt : pts.length - 1;
    let q;
    if (i < pts.length - 1) {
      // halfway along the next stretch and 3 m out from it, away from the building (on the line it would not show)
      const a = pts[i], b2 = pts[i + 1], mx = (a[0] + b2[0]) / 2, mz = (a[1] + b2[1]) / 2;
      let nx = -(b2[1] - a[1]), nz = b2[0] - a[0]; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
      if (nx * mx + nz * mz < 0) { nx = -nx; nz = -nz; }
      q = snapFencePoint(p, [mx + nx * 3, mz + nz * 3]);
    }
    else { const dx = pts[i][0], dz = pts[i][1], l = Math.hypot(dx, dz) || 1; q = l < 1e-6 ? [pts[i][0] + 3, pts[i][1]] : [pts[i][0] + dx / l * 3, pts[i][1] + dz / l * 3]; }   // after the last post: 3 m further out, away from the building
    pts.splice(i + 1, 0, snapFencePoint(p, q)); ob.pt = i + 1;
    swap({...c, points: pts});
    if (!ob.on) { enterObjects(); }
  };
  if ($("ob-rmpt")) $("ob-rmpt").onclick = () => {
    const c = selObject(); if (ob.pt === null || c.points.length <= 2) return;
    const pts = c.points.filter((_, j) => j !== ob.pt); ob.pt = null;
    swap({...c, points: pts});
  };
  if ($("ob-look")) $("ob-look").onchange = e => {
    const c = {...selObject()}, a = troughLooks(p, c.type).find(x => x.id === e.target.value);
    if (!e.target.value) { delete c.asset; delete c.rot; }
    else if (a) { const [w, d, h] = assetSize(normalizeMeta(a.meta)); delete c.rot; Object.assign(c, {asset: a.id, w, d, h}); }
    else return;
    swap(snapObj(c));
  };
  if ($("objTurn")) $("objTurn").onclick = () => {
    const c = selObject(), a = c.asset && troughLooks(p, c.type).find(x => x.id === c.asset);
    if (a) { swap(snapObj(turned({...c, rot: (c.rot || 0) + 90}))); return; }   // an item's look: a quarter more, the footprint follows
    swap(snapObj({...c, w: c.d, d: c.w, ix: -c.iz, iz: c.ix})); };
  $("objRemove").onclick = () => removeObject(o.id);
}

/** The game objects in the tree: the card of the group or of one object (see renderObjectsCard); setObjects and the plan view draw it again. */
function renderObjectsUI() { if (treeKind === "game" || treeKind === "object") renderTreeUI(); else renderTreeNav(); }
/** A new object of a type the building lacks, where the kind puts it to start with. */
function addObject(type) {
  const kind = kindOf(p), spec = kind.objects, list = objectsNow(), def = MANY.includes(type) && (list.some(o => o.type === type) || !spec.defaults({...p}).some(x => x.type === type)) ? nextTroughSpot(p, type) : spec.defaults({...p}).find(x => x.type === type), id = list.reduce((m, x) => Math.max(m, x.id), 0) + 1;
  setObjects(sanitize({...p, objects: [...list, {...(def || {type, x: p.width / 2 + 3, z: 0}), id}]}).objects, id);
  toast(`${objectInfo(kind, type).name} added`);
  selectNode("object", id);
}
/** Takes an object away, unless the building needs it. */
function removeObject(id) {
  const o = objectsNow().find(x => x.id === id), spec = kindOf(p).objects;
  if (!o) return false;
  if (spec.required.includes(o.type)) { toast(`The ${kindOf(p).name.toLowerCase()} needs its ${objName(o).toLowerCase()}`); return false; }
  treeKind = "game";
  setObjects(objectsNow().filter(x => x.id !== id), null);
  return true;
}

/** The plan view of the yard: the building, its objects and its pasture from above, to drag them in. */
function enterObjects() {
  if (!renderer) return;
  if (ins.on) leaveInside();
  ob.on = true; ob.drag = null; ob.pan = [0, 0];
  ob.saved = {...view, target: [...view.target]};
  sunLight.castShadow = false;
  $("orbitHint").textContent = "Drag objects or the fence’s dots · drag to pan";
  fitSite(); renderObjectsUI(); updatePlacesMarker();
}
function leaveObjects() {
  if (!ob.on) return;
  ob.on = false; ob.drag = null;
  sunLight.castShadow = true;
  $("orbitHint").textContent = "Drag to orbit, scroll to zoom";
  Object.assign(view, ob.saved);
  updateCam(); rebuild(false); renderObjectsUI();
}
/** The plan camera over the building, its objects and its pasture, with a few metres round. */
function fitSite() {
  const rs = [{x0: -p.width / 2, x1: p.width / 2, z0: -p.depth / 2, z1: p.depth / 2}];
  for (const o of objectsNow()) if (o.type !== "pasture") rs.push({x0: o.x - o.w / 2, x1: o.x + o.w / 2, z0: o.z - o.d / 2, z1: o.z + o.d / 2});
  const pa = pastureOf(p); if (pa) rs.push(pa.rect);
  const x0 = Math.min(...rs.map(r => r.x0)) - 3, x1 = Math.max(...rs.map(r => r.x1)) + 3, z0 = Math.min(...rs.map(r => r.z0)) - 3, z1 = Math.max(...rs.map(r => r.z1)) + 3;
  const s = stage.getBoundingClientRect(), aspect = (s.width || 1) / (s.height || 1);
  const cx = (x0 + x1) / 2 + ob.pan[0], cz = (z0 + z1) / 2 + ob.pan[1];
  let hw = (x1 - x0) / 2, hh = (z1 - z0) / 2;
  if (hw / hh > aspect) hh = hw / aspect; else hw = hh * aspect;
  Object.assign(ortho, {left: -hw, right: hw, top: hh, bottom: -hh});
  ortho.position.set(cx, 80, cz); ortho.up.set(0, 0, -1); ortho.lookAt(cx, 0, cz);
  ortho.updateProjectionMatrix(); needs = true;
}
/** Where the pointer meets the ground: [x, z], or null. */
function groundPoint(e) {
  const b = canvas.getBoundingClientRect(), v = new THREE.Vector2(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
  const rc = new THREE.Raycaster(); rc.setFromCamera(v, activeCam());
  const hit = rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
  return hit ? [hit.x, hit.z] : null;
}
/** The distance (m) between two posts of a fence drawn by hand. */
const fenceDist = (pts, i, j) => Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
/** The pasture's handles: its two ends (the fence's sides) and its outer edge, [{k, at: [x, z]}]. */
function pastureHandles() {
  const pa = pastureOf(p), fo = objectOf(p, "pasture");
  if (!pa) return [];
  if (fo && fo.points) {
    // a fence drawn by hand: its posts (the first green, the last red) and a pale dot between each two
    const pts = fo.points;
    return [...pts.map((q, i) => ({k: "p" + i, at: [q[0], q[1]], style: i === 0 ? "start" : i === pts.length - 1 ? "end" : "pt", sel: i === ob.pt})),
      ...pts.slice(0, -1).map((q, i) => ({k: "m" + i, at: [(q[0] + pts[i + 1][0]) / 2, (q[1] + pts[i + 1][1]) / 2], style: "mid"}))];
  }
  const at = (s, d) => { const q = pa.at(s, d); return [q[0], q[2]]; };
  return [{k: "a", at: at(pa.s0, pa.depth / 2)}, {k: "b", at: at(pa.s1, pa.depth / 2)}, {k: "depth", at: at((pa.s0 + pa.s1) / 2, pa.depth)}];
}
/** What's under the pointer in the plan view: a pasture handle (within 1 m), else the smallest box there. */
function objectAt(q) {
  const scale = (ortho.right - ortho.left) / ortho.zoom / 60, reach = Math.max(1, scale);
  const h = pastureHandles().find(x => Math.hypot(x.at[0] - q[0], x.at[1] - q[1]) < reach);
  if (h) return {id: objectOf(p, "pasture").id, handle: h.k};
  const hits = objectsNow().filter(o => o.type !== "pasture" && Math.abs(q[0] - o.x) <= o.w / 2 && Math.abs(q[1] - o.z) <= o.d / 2)
    .sort((a, b) => a.w * a.d - b.w * b.d);
  return hits.length ? {id: hits[0].id} : null;
}
/** A drag of object (or pasture handle) d to ground point q: where it would go, snapped. */
function dragTo(d, q) {
  const o = objectsNow().find(x => x.id === d.id);
  if (!d.handle) return snapBox({...o, x: q[0] - d.off[0], z: q[1] - d.off[1]}, p);
  if (/^p[0-9]+$/.test(d.handle) && o.points) { const i = +d.handle.slice(1), at = snapFencePoint(p, q); return {...o, points: o.points.map((r, j) => j === i ? at : r)}; }
  const pa = pastureOf(p), w = pa.w, s = (q[0] - w.o[0]) * w.u[0] + (q[1] - w.o[2]) * w.u[2], dd = (q[0] - w.o[0]) * w.n[0] + (q[1] - w.o[2]) * w.n[2];
  const next = d.handle === "a" ? {...o, a: s} : d.handle === "b" ? {...o, b: pa.L - s} : {...o, depth: dd};
  return snapPasture(next, kindOf(p), p);
}
let dSel = null;
const TYPE_NAMES = {frontespis:"Frontespis", gable:"Gable kupa", shed:"Shed kupa"};
const DFIELDS = [
  {k:"pos", label:"Position along the roof", min:0, max:1, step:0.005},
  {k:"w", label:"Width", min:1, max:6, step:0.05},
  {k:"wallH", label:"Wall height above the attic floor", min:1.2, max:3, step:0.05},
  {k:"setback", label:"Set back from the wall", min:0.2, max:2.5, step:0.05},
  {k:"n", label:"Windows", min:1, max:4, step:1},
  {k:"ww", label:"Window width", min:0.4, max:1.6, step:0.05},
  {k:"wh", label:"Window height", min:0.5, max:1.6, step:0.05}];
function ridgeAlongWidth() { return p.roofType === "hip" ? p.width >= p.depth : p.ridge === "width"; }
function sideName(s) { return ridgeAlongWidth() ? (s > 0 ? "Front" : "Back") : (s > 0 ? "Right side" : "Left side"); }
function dOut(f, d) {
  if (f.k === "pos") { const m = (d.pos - 0.5) * (ridgeAlongWidth() ? p.width : p.depth); return Math.abs(m) < 0.05 ? "Center" : `${Math.abs(m).toFixed(1)} m ${m < 0 ? "one way" : "the other way"} from center`; }
  return f.k === "n" ? String(d.n) : `${d[f.k].toFixed(2)} m`;
}
function dormLabel(d) {
  const same = p.dormers.filter(x => x.side === d.side).sort((a, b) => a.pos - b.pos);
  return `${TYPE_NAMES[d.type]}, ${sideName(d.side).toLowerCase()} slope` + (same.length > 1 ? `, ${same.indexOf(d) + 1}` : "") + (d._hidden ? " (doesn\u2019t fit)" : "");
}
/** Applies the kind's rules to the simple settings; true if that changed any. */
function applyKindRules() {
  const q = kindOf(p).normalize(p);
  let changed = false;
  for (const k in q) if (typeof q[k] !== "object" && q[k] !== p[k]) { p[k] = q[k]; changed = true; }
  return changed;
}
/* ---------- Imported items ---------- */
// The game loads an item's own i3d; the preview draws the .obj exported with it, in one plain colour.
// Geometries by asset id: null while loading, false if the file couldn't be read.
const itemGeos = new Map();
let itemsGroup = null, itemMat = null, lastRefs = [];
function itemGeometry(asset) {
  if (itemGeos.has(asset.id)) return itemGeos.get(asset.id);
  itemGeos.set(asset.id, null);
  if (assets && asset.meta.obj) assets.file(asset.id, asset.meta.obj).then(buf => {
    if (destroyed) return;
    const o = readObj(new TextDecoder().decode(buf), asset.meta.hidden);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(o.positions, 3));
    g.computeVertexNormals();
    itemGeos.set(asset.id, g); drawItems(lastRefs);
  }).catch(() => itemGeos.set(asset.id, false));
  return null;
}
/** The placed items (buildGeometry's refs), each its model turned and moved like the game will. */
function drawItems(refs) {
  lastRefs = refs;
  if (!itemsGroup) return;
  itemsGroup.clear();
  for (const r of refs) {
    const g = itemGeometry(r.asset);
    if (!g) continue;
    const m = new THREE.Mesh(g, itemMat);
    m.castShadow = m.receiveShadow = true;
    m.position.set(...r.translation); m.rotation.y = r.rotY * Math.PI / 180;
    itemsGroup.add(m);
  }
  needs = true;
}
/** Loads the user's items; again when the page gets focus (they may have imported one in another tab). */
async function loadAssets() {
  if (!assets) return;
  try {
    const list = await assets.list();
    if (destroyed) return;
    setAssets(list); rebuild(false);
  } catch (e) { /* the building still works without them; its items wait as stand-ins */ }
}
if (assets) {
  const onFocus = () => loadAssets();
  window.addEventListener("focus", onFocus);
  cleanups.push(() => window.removeEventListener("focus", onFocus));
}
// An i3d is ISO-8859-1 text: one character per byte, both ways, so nothing else changes.
const latin1 = buf => { const b = new Uint8Array(buf); let s = ""; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192)); return s; };
const bytesOf = s => Uint8Array.from(s, ch => ch.charCodeAt(0) & 0xff);
/** The placed items' files, each item in its own folder next to the building's i3d (not the .obj: that's for the preview). */
async function addItems(dir) {
  for (const a of usedAssets(p)) {
    const folder = assetFolder(a), names = a.files.map(f => f.name);
    for (const f of a.files) {
      if (f.name === a.meta.obj) continue;
      const buf = await assets.file(a.id, f.name);
      dir.file(`${folder}/${f.name}`, f.name === a.meta.i3d ? bytesOf(flattenI3d(latin1(buf), names)) : buf);
    }
  }
}

/* ---------- Arranging the inside ---------- */
// Interior mode: the building cut off at the top of its walls (a clipping plane), seen from straight
// above (Plan, an orthographic camera) or in 3D. Pieces are picked and dragged on the floor; the
// rules (snapping, problems, history) are in layout.mjs.
const ins = {on: false, view: "plan", sel: null, drag: null, hist: null, keep: false, pan: [0, 0], closed: new Set()};
let ortho = null, ghost = null, marks = null, planLines = null;
const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
const activeCam = () => (ins.on && ins.view === "plan") || ob.on ? ortho : camera;
const roomNow = () => { const k = kindOf(p); return roomOf(p, k.openings ? k.openings(p) : []); };
const catalogNow = () => catalogFor(p);
const selected = () => (p.items || []).find(it => it.id === ins.sel) || null;

/**
 * Pictures of the pieces for the palette: one of each piece is built in a big empty room (pieceSheet), then each is drawn
 * on its own from the front corner into a small picture. Made once per kind of building, a moment after the arranging starts.
 */
let thumbUrls = {}, thumbKind = null, thumbBusy = false;
function ensureThumbs() {
  const kid = p.kind;
  if (thumbKind === kid || thumbBusy || !renderer) return;
  thumbBusy = true;
  setTimeout(() => {
    try { thumbUrls = makeThumbs(); thumbKind = kid; } catch (e) { console.warn("thumbnails", e); thumbKind = kid; }
    thumbBusy = false;
    if (ins.on) renderInsideUI();
  }, 40);
}
function makeThumbs() {
  const sheet = pieceSheet({...p, items: []}), W = 96, H = 72, urls = {};
  const r2 = new THREE.WebGLRenderer({alpha: true, antialias: true, preserveDrawingBuffer: true});
  try {
    r2.setPixelRatio(2); r2.setSize(W, H, false); r2.setClearColor(0x000000, 0);
    const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(28, W / H, 0.1, 100);
    sc.add(new THREE.HemisphereLight(0xffffff, 0x8a8678, 0.95));
    const dl = new THREE.DirectionalLight(0xffffff, 0.75); dl.position.set(3, 6, 4); sc.add(dl);
    for (const spot of sheet.spots) {
      const group = new THREE.Group(), geos = [];
      for (const {m, g} of pieceMeshes(sheet, spot.id)) {
        if (m === "glass") continue;
        if (!g.c) { const [r, gr, b] = new THREE.Color(colorFor(sheet.p, m)).toArray(); g.c = []; for (let k = 0; k < g.p.length; k += 3) g.c.push(r, gr, b); }
        const geo = bufferOf(g); geos.push(geo);
        group.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.8, metalness: m === "iron" ? 0.3 : 0, side: THREE.DoubleSide})));
      }
      sc.add(group);
      const box = new THREE.Box3().setFromObject(group), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
      const radius = 0.5 * Math.hypot(size.x, size.y, size.z) || 1, dir = new THREE.Vector3(0.75, 0.6, 1).normalize();
      cam.position.copy(mid).addScaledVector(dir, radius / Math.sin(14 * Math.PI / 180) * 1.02); cam.lookAt(mid); cam.updateMatrixWorld();
      r2.render(sc, cam);
      urls[spot.type] = r2.domElement.toDataURL("image/png");
      sc.remove(group); geos.forEach(g => g.dispose());
    }
  } finally { r2.dispose(); }
  return urls;
}
function enterInside() {
  if (!renderer || !kindOf(p).catalog) return;
  if (ob.on) leaveObjects();
  ins.on = true; ins.sel = null; ins.drag = null; ins.pan = [0, 0];
  ins.hist = new History(p.items || []);
  ins.saved = {...view, target: [...view.target]};
  placesObj.group.visible = false; yardObj.group.visible = false;
  // The shadow pass isn't clipped, so the roof would still shade the floor: no shadows while arranging.
  sunLight.castShadow = false;
  $("insideBar").hidden = false; $("orbitHint").textContent = "Drag a piece to move it · R turns · Delete removes · drag a wall between sections";
  window.addEventListener("keydown", insideKey);
  setInsideView(ins.view);
  renderInsideUI();
  ensureThumbs();
}
function leaveInside() {
  if (!ins.on) return;
  ins.on = false; ins.drag = null; ins.divider = null; ins.sel = null;
  window.removeEventListener("keydown", insideKey);
  renderer.clippingPlanes = [];
  sunLight.castShadow = true;
  $("insideBar").hidden = true; $("orbitHint").textContent = "Drag to orbit, scroll to zoom";
  Object.assign(view, ins.saved);
  rebuild(false);
}
function setInsideView(v) {
  ins.view = v;
  $("viewPlan").setAttribute("aria-pressed", String(v === "plan")); $("view3d").setAttribute("aria-pressed", String(v === "3d"));
  const r = roomNow();
  // Plan: cut through the walls at window height, like a drawing. 3D: just under the eaves (which
  // hang lower than the wall tops by the overhang's drop), so no roof is left over the walls.
  const eaves = r.H - (p.roofType === "flat" ? 0 : p.overhang * Math.tan(p.roofPitch * Math.PI / 180));
  // (under a ceiling: just under it)
  const cut3d = p.ceiling ? p.floorHeight - 0.05 : Math.max(1.4, eaves - 0.12);
  clipPlane.constant = r.F + (v === "plan" ? 1.3 : cut3d);
  renderer.clippingPlanes = [clipPlane];
  if (v === "3d") {
    const bx = roomBox(r);
    view.target = [(bx.x0 + bx.x1) / 2, r.F + 0.4, (bx.z0 + bx.z1) / 2];
    view.r = Math.max(bx.x1 - bx.x0, bx.z1 - bx.z0) * 1.4 + 3; view.phi = Math.min(view.phi, 0.95);
    updateCam();
  } else fitOrtho();
  updateInsideOverlay();
}
/** The plan camera: straight down on the room (front of the building at the bottom), with pan and zoom. */
function fitOrtho() {
  const r = roomBox(roomNow()), s = stage.getBoundingClientRect(), aspect = (s.width || 1) / (s.height || 1);
  const cx = (r.x0 + r.x1) / 2 + ins.pan[0], cz = (r.z0 + r.z1) / 2 + ins.pan[1];
  // room plus a metre round it, and room for the bar at the top
  let hw = (r.x1 - r.x0) / 2 + 1, hh = (r.z1 - r.z0) / 2 + 1.6;
  if (hw / hh > aspect) hh = hw / aspect; else hw = hh * aspect;
  Object.assign(ortho, {left: -hw, right: hw, top: hh, bottom: -hh});
  ortho.position.set(cx, 60, cz); ortho.up.set(0, 0, -1); ortho.lookAt(cx, 0, cz);
  ortho.updateProjectionMatrix(); needs = true;
}
/** Where the pointer meets the floor: [x, z], or null. */
function floorPoint(e) {
  const b = canvas.getBoundingClientRect(), v = new THREE.Vector2(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
  const rc = new THREE.Raycaster(); rc.setFromCamera(v, activeCam());
  const hit = rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -roomNow().F), new THREE.Vector3());
  return hit ? [hit.x, hit.z] : null;
}
/** An edit: the new pieces, remembered for undo, saved and built. */
function commitItems(items, sel = ins.sel) {
  p.items = items; ins.sel = sel; ins.hist.push(items); persist(); rebuild(false);
}
function undoInside() { if (ins.hist && ins.hist.canUndo) { p.items = ins.hist.undo(); if (!selected()) ins.sel = null; persist(); rebuild(false); } }
function redoInside() { if (ins.hist && ins.hist.canRedo) { p.items = ins.hist.redo(); if (!selected()) ins.sel = null; persist(); rebuild(false); } }
function addPiece(type) {
  const it = placeNew(type, p.items || [], catalogNow(), roomNow());
  commitItems([...(p.items || []), it], it.id);
}
function turnSelected() {
  const it = selected(); if (!it) return;
  const t = rotateItem(it, catalogNow()[it.type], roomNow(), p.items, catalogNow());
  if (t !== it) commitItems(p.items.map(x => x.id === it.id ? t : x));
}
function removeSelected() {
  if (!selected()) return;
  commitItems(p.items.filter(x => x.id !== ins.sel), null);
}
function insideKey(e) {
  if (!ins.on || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)) return;
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (mod && k === "z" && !e.shiftKey) undoInside();
  else if (mod && (k === "y" || (k === "z" && e.shiftKey))) redoInside();
  else if (k === "r" && !mod) turnSelected();
  else if (k === "delete" || k === "backspace") removeSelected();
  else if (k === "escape") { if (ins.sel) { ins.sel = null; renderInsideUI(); updateInsideOverlay(); } else leaveInside(); }
  else return;
  e.preventDefault();
}
/** Overlays: the room's outline and keep-outs, a box on each piece with a problem, and the selected (or dragged) piece. */
function makeInsideOverlay() {
  ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({transparent: true, opacity: 0.35, depthWrite: false}));
  ghost.renderOrder = 5; ghost.visible = false;
  marks = new THREE.Group();
  planLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({color: 0x2f3a2a}));
  planLines.visible = false;
  scene.add(ghost, marks, planLines);
}
const boxOn = (mesh, f, F, h) => { mesh.position.set((f.x0 + f.x1) / 2, F + h / 2, (f.z0 + f.z1) / 2); mesh.scale.set(Math.max(0.02, f.x1 - f.x0), h, Math.max(0.02, f.z1 - f.z0)); };
function updateInsideOverlay() {
  if (!ghost) return;
  for (const c of [...marks.children]) { marks.remove(c); c.geometry.dispose(); c.material.dispose(); }
  ghost.visible = planLines.visible = ins.on;
  updateInsideBar();
  if (!ins.on) { needs = true; return; }
  const room = roomNow(), cat = catalogNow(), items = p.items || [];
  // the room's outline and keep-outs, just above the floor
  const ln = [], y = room.F + 0.03, rect = r => [r.x0, r.z0, r.x1, r.z0, r.x1, r.z0, r.x1, r.z1, r.x1, r.z1, r.x0, r.z1, r.x0, r.z1, r.x0, r.z0];
  // the room's walls (every stretch of them, the whole outline when a wing opens into it) and the keep-outs
  for (const wl of room.walls) ln.push(wl.x0, y, wl.z0, wl.x1, y, wl.z1);
  for (const r of room.keepOut.map(k => k.rect)) { const q = rect(r); for (let i = 0; i < q.length; i += 2) ln.push(q[i], y, q[i + 1]); }
  planLines.geometry.dispose(); planLines.geometry = new THREE.BufferGeometry();
  planLines.geometry.setAttribute("position", new THREE.Float32BufferAttribute(ln, 3));
  // problems, except on the piece being dragged
  const pr = problems(items, cat, room);
  for (const it of items) if (pr.has(it.id) && !(ins.drag && ins.drag.id === it.id)) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({color: 0xd03a2a, transparent: true, opacity: 0.3, depthWrite: false}));
    boxOn(m, footprint(it, cat[it.type]), room.F, cat[it.type].height(it) + 0.05); marks.add(m);
  }
  // markers (def.ghost: the sleep point) are not drawn in the building: a blue box where their trigger is
  for (const it of items) if (cat[it.type] && cat[it.type].ghost && !(ins.drag && ins.drag.id === it.id)) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({color: 0x2f6fd0, transparent: true, opacity: 0.22, depthWrite: false}));
    boxOn(m, footprint(it, cat[it.type]), room.F, cat[it.type].height(it)); marks.add(m);
  }
  // the selected piece, or where the dragged one would land: green if fine, red if not
  const it = ins.drag ? ins.drag.cand : selected();
  ghost.visible = !!it;
  if (it) {
    const def = cat[it.type], others = items.filter(x => x.id !== it.id), bad = problems([...others, it], cat, room).has(it.id);
    boxOn(ghost, footprint(it, def), room.F, def.height(it) + 0.08);
    ghost.material.color.set(bad ? 0xd03a2a : ins.drag ? 0x3f9a43 : 0x2f6fd0);
  }
  needs = true;
}
function updateInsideBar() {
  if (!$("insideUndo")) return;
  $("insideUndo").disabled = !(ins.hist && ins.hist.canUndo);
  $("insideRedo").disabled = !(ins.hist && ins.hist.canRedo);
}

/** The Inside section of a walk-in building: a summary and buttons, or (arranging) the palette and the selected piece. */
function renderInsideUI() {
  const ed = $("insideEditor"), kind = kindOf(p);
  if (!ed || !kind.catalog || ins.keep) return;
  const cat = catalogNow(), items = p.items || [], pr = problems(items, cat, roomNow());
  const fillRow = `<div class="row"><button type="button" id="insideFill">Fill automatically</button><button type="button" id="insideClear" ${items.length ? "" : "disabled"}>Remove all</button></div>`;
  if (!ins.on) {
    const counts = new Map();
    for (const it of items) counts.set(it.type, (counts.get(it.type) || 0) + 1);
    const list = [...counts].map(([type, n]) => `<li>${esc(cat[type].name)}${n > 1 ? ` × ${n}` : ""}</li>`).join("");
    const out = [...pr.values()].filter(m => /outside/i.test(m)).length, other = pr.size - out;
    ed.innerHTML = (items.length ? `<ul class="pieces">${list}</ul>` : `<p class="hint">Nothing inside yet.</p>`)
      + (out ? `<p class="warn">${out} piece${out > 1 ? "s stick" : " sticks"} out through a wall and ${out > 1 ? "are" : "is"} left out. Make the building bigger, move ${out > 1 ? "them" : "it"} or fill it again.</p>` : "")
      + (other ? `<p class="warn">${other} piece${other > 1 ? "s overlap or block" : " overlaps or blocks"} something.</p>` : "")
      + `<div class="row"><button type="button" class="primary" id="insideArrange" ${renderer ? "" : "disabled"}>Arrange the inside</button></div>` + fillRow;
    $("insideArrange").onclick = () => { setTab("inside"); enterInside(); };
  } else {
    const it = selected(), def = it && cat[it.type];
    // (a setting that is a place along the piece, f.metres: [offset, scale], is shown in metres: offset + value * scale)
    const fmtP = (f, v, at = it) => f.metres && at ? (f.metres(at)[0] + v * f.metres(at)[1]).toFixed(2) + " m" : (+v).toFixed(f.step >= 1 ? 0 : 1) + (f.unit || "");
    const entries = Object.entries(cat);
    // the user's own items, and those the admin shares with everyone (mine is false only for those)
    const mine = entries.filter(([, d]) => d.asset && d.asset.mine !== false), shared = entries.filter(([, d]) => d.asset && d.asset.mine === false);
    const addBtn = ([type, d]) => `<button type="button" class="pal" data-add="${type}" title="${esc(d.name)}">${thumbUrls[type] ? `<img src="${thumbUrls[type]}" alt="" width="96" height="72">` : ""}<span>${esc(d.name)}</span></button>`;
    // the pieces in groups (a group folds away; the choice is kept while arranging), each with a picture of it
    const groupsHtml = pieceGroups(cat).map(g => `<details class="pgroup" data-group="${esc(g.name)}" ${ins.closed.has(g.name) ? "" : "open"}><summary>${esc(g.name)} <span>${g.types.length}</span></summary><div class="palette">${g.types.map(t => addBtn([t, cat[t]])).join("")}</div></details>`).join("");
    ed.innerHTML = `<p class="hint">Click a piece to add it, then drag it into place or use the position sliders. Pieces are free; wall pieces (counters, beds, wardrobes) snap to a wall or inner wall when put close to it.</p>`
      + groupsHtml
      + `<h4 class="palette-head">My items</h4>`
      + (mine.length ? `<div class="palette">${mine.map(addBtn).join("")}</div>` : `<p class="hint">Items you import from Giants Editor show here.</p>`)
      + (shared.length ? `<h4 class="palette-head">Shared items</h4><div class="palette">${shared.map(addBtn).join("")}</div>` : "")
      + `<p class="hint"><a href="/items" target="_blank" rel="noopener">Import an item…</a></p>`
      + (it ? `<div class="piece"><h4>${esc(def.name)}</h4>${def.missing ? `<p class="warn">This item isn’t in My items any more, so it’s left out. Remove it, or import it again.</p>` : ""}${pr.has(it.id) ? `<p class="warn">${pr.get(it.id)}.</p>` : ""}`
          + def.params.filter(f => !f.when || f.when(it)).map(f => f.options
            // a choice (wallpaper, a doorway or not): a list
            ? `<div class="field"><div class="fl"><label for="pc-${f.k}">${f.label}</label></div><select id="pc-${f.k}" data-k="${f.k}">${f.options.map((nm, i) => `<option value="${i}" ${i === Math.round(it[f.k]) ? "selected" : ""}>${esc(nm)}</option>`).join("")}</select></div>`
            : `<div class="field"><div class="fl"><label for="pc-${f.k}">${f.label}</label><output id="pc-${f.k}-o">${fmtP(f, it[f.k])}</output></div><input type="range" id="pc-${f.k}" data-k="${f.k}" min="${f.min}" max="${f.max}" step="${f.step}" value="${it[f.k]}" ${f.metres ? `data-scale="${f.metres(it)[1]}" data-offset="${f.metres(it)[0]}"` : ""}></div>`).join("")
          + posSliders(it, def)
          + `<div class="row"><button type="button" id="pcTurn">Turn</button><button type="button" id="pcRemove" class="danger">Remove</button></div></div>`
        : `<p class="hint">Click a piece in the building to change or move it.</p>`)
      + (pr.size ? `<p class="warn">${pr.size} piece${pr.size > 1 ? "s have" : " has"} a problem (red).</p>` : "")
      + fillRow;
    ed.querySelectorAll("[data-add]").forEach(b => b.onclick = () => addPiece(b.dataset.add));
    ed.querySelectorAll(".pgroup").forEach(d => d.ontoggle = () => { if (d.open) ins.closed.delete(d.dataset.group); else ins.closed.add(d.dataset.group); });
    if (it) {
      // position sliders: move the piece without dragging (to the centimetre; wall pieces stay on their wall)
      // the rotation slider: any angle (the position is kept inside the room)
      ed.querySelectorAll("[data-rot]").forEach(inp => {
        inp.oninput = () => {
          const cur = selected(), next = snapItem({...cur, rot: +inp.value}, def, roomNow(), p.items, catalogNow(), true);
          p.items = p.items.map(x => x.id === cur.id ? next : x);
          $("pp-rot-o").textContent = Math.round(next.rot) + "°";
          for (const k of ["x", "z"]) { const o = $(`pp-${k}`); if (o) { o.value = next[k]; $(`pp-${k}-o`).textContent = next[k].toFixed(2) + " m"; } }
          ins.keep = true; rebuild(false); ins.keep = false;
        };
        inp.onchange = () => { ins.hist.push(p.items); persist(); rebuild(false); };
      });
      ed.querySelectorAll("[data-pos]").forEach(inp => {
        const axis = inp.dataset.pos;
        inp.oninput = () => {
          const cur = selected(), next = snapItem({...cur, [axis]: +inp.value}, def, roomNow(), p.items, catalogNow(), true);
          p.items = p.items.map(x => x.id === cur.id ? next : x);
          for (const k of ["x", "z"]) { const o = $(`pp-${k}`); if (o) { o.value = next[k]; $(`pp-${k}-o`).textContent = next[k].toFixed(2) + " m"; } }
          ins.keep = true; rebuild(false); ins.keep = false;
        };
        inp.onchange = () => { ins.hist.push(p.items); persist(); rebuild(false); };
      });
      $("pcTurn").onclick = turnSelected; $("pcRemove").onclick = removeSelected;
      ed.querySelectorAll("[data-k]").forEach(inp => {
        const f = def.params.find(x => x.k === inp.dataset.k);
        // While sliding, rebuild without redrawing this panel; remember the edit when the slider is let go.
        inp.oninput = () => {
          const cur = selected(), next = snapItem({...cur, [f.k]: +inp.value}, def, roomNow(), p.items, catalogNow());
          p.items = p.items.map(x => x.id === cur.id ? next : x);
          if ($(`pc-${f.k}-o`)) $(`pc-${f.k}-o`).textContent = fmtP(f, inp.value, next);
          ins.keep = true; rebuild(false); ins.keep = false;
        };
        inp.onchange = () => { ins.hist.push(p.items); persist(); rebuild(false); if (f.options) renderInsideUI(); };   // (a choice can show or hide other settings)
      });
    }
  }
  $("insideFill").onclick = () => {
    const items = kind.autoFurnish(p).items;
    if (ins.on) commitItems(items, null); else { p.items = items; persist(); rebuild(false); }
    toast("Filled to match the building");
  };
  $("insideClear").onclick = () => { if (ins.on) commitItems([], null); else { p.items = []; persist(); rebuild(false); } };
}
/** Sliders for where a piece stands: left/right (x) and back/front (z); a wall piece only slides along its wall. */
function posSliders(it, def) {
  if (def.missing) return "";
  const r = roomBox(roomNow()), alongX = it.rot % 180 === 0;
  const axes = ["x", "z"];
  const lab = {x: "Left / right", z: "Back / front"}, range = {x: [r.x0, r.x1], z: [r.z0, r.z1]};
  // (an inner wall only turns in quarters, with the Turn button)
  const rotation = def.snapWalls ? "" : `<div class="field"><div class="fl"><label for="pp-rot">Rotation</label><output id="pp-rot-o">${Math.round(it.rot)}°</output></div><input type="range" id="pp-rot" data-rot min="0" max="359" step="1" value="${Math.round(it.rot)}"></div>`;
  return axes.map(k => `<div class="field"><div class="fl"><label for="pp-${k}">${lab[k]} (position)</label><output id="pp-${k}-o">${(+it[k]).toFixed(2)} m</output></div><input type="range" id="pp-${k}" data-pos="${k}" min="${range[k][0].toFixed(2)}" max="${range[k][1].toFixed(2)}" step="0.01" value="${it[k]}"></div>`).join("") + rotation;
}
function renderDormUI() {
  const ed = $("dormEditor");
  if (!ed) return;
  if (p.roofType === "flat") { ed.innerHTML = `<p class="hint">Kupor need a gable or hip roof.</p>`; return; }
  let html = `<p class="hint">${p.halfStorey ? "Kupor sit on the long roof slopes." : "Kupor work best with the 1\u00BD-plan option under Size."}</p><div class="addrow">${DTYPES.map(t => `<button type="button" data-add="${t}">Add ${TYPE_NAMES[t].toLowerCase()}</button>`).join("")}</div>`;
  if (!p.dormers.some(d => d.id === dSel)) dSel = null;
  const d = p.dormers.find(x => x.id === dSel);
  if (p.dormers.length) {
    html += `<div class="field"><div class="fl"><label for="dormSel">Edit a kupa</label></div><select id="dormSel"><option value="">Choose a kupa</option>${p.dormers.map(x => `<option value="${x.id}" ${x.id === dSel ? "selected" : ""}>${dormLabel(x)}</option>`).join("")}</select></div>`;
  }
  if (d) {
    html += `<div class="wincard"><p class="warn" id="dormWarn" ${d._hidden ? "" : "hidden"}>This kupa doesn\u2019t fit there. Make it narrower or lower, or move it away from the roof ends and other kupor.</p>`;
    html += `<div class="field"><div class="fl"><label for="dType">Type</label></div><select id="dType">${DTYPES.map(t => `<option value="${t}" ${t === d.type ? "selected" : ""}>${TYPE_NAMES[t]}</option>`).join("")}</select></div>`;
    html += `<div class="field"><div class="fl"><label for="dSide">Roof slope</label></div><select id="dSide">${[1, -1].map(s => `<option value="${s}" ${s === d.side ? "selected" : ""}>${sideName(s)}</option>`).join("")}</select></div>`;
    for (const f of DFIELDS) {
      const dis = f.k === "setback" && d.type === "frontespis";
      html += `<div class="field"><div class="fl"><label for="df-${f.k}">${f.label}</label><output id="df-${f.k}-o">${dis ? "Flush with the wall" : dOut(f, d)}</output></div><input type="range" id="df-${f.k}" data-k="${f.k}" min="${f.min}" max="${f.max}" step="${f.step}" value="${d[f.k]}" ${dis ? "disabled" : ""}></div>`;
    }
    html += choiceFields("dc", d);
    html += `<button type="button" id="dormRemove">Remove this kupa</button></div>`;
  }
  ed.innerHTML = html;
  ed.querySelectorAll("[data-add]").forEach(b => b.onclick = () => {
    const t = b.dataset.add, id = p.dormers.reduce((m, x) => Math.max(m, x.id), 0) + 1;
    const taken = p.dormers.filter(x => x.side === 1).length;
    p.dormers.push({id, type: t, side: 1, pos: taken ? Math.min(0.85, 0.25 + taken * 0.5) : 0.5, ...DORM_DEF[t], room: "auto", curtain: "default", curtainColor: "default"});
    dSel = id; persist(); rebuild(false); renderDormUI();
  });
  const sel = $("dormSel");
  if (sel) sel.onchange = () => { dSel = +sel.value || null; renderDormUI(); };
  if (d) {
    $("dType").onchange = e => { d.type = e.target.value; persist(); rebuild(false); renderDormUI(); };
    $("dSide").onchange = e => { d.side = +e.target.value; persist(); rebuild(false); renderDormUI(); };
    ed.querySelectorAll(".wincard input[type=range]").forEach(inp => inp.oninput = () => {
      d[inp.dataset.k] = +inp.value;
      $(`df-${inp.dataset.k}-o`).textContent = dOut(DFIELDS.find(f => f.k === inp.dataset.k), d);
      persist(); rebuild(false);
    });
    bindChoices("dc", d);
    $("dormRemove").onclick = () => { p.dormers = p.dormers.filter(x => x.id !== dSel); dSel = null; persist(); rebuild(false); renderDormUI(); };
  }
}
function refreshDorm() {
  const sel = $("dormSel");
  if (!sel) return;
  for (const opt of sel.options) { if (!opt.value) continue; const x = p.dormers.find(y => y.id === +opt.value); if (x) opt.textContent = dormLabel(x); }
  const warn = $("dormWarn"), d = p.dormers.find(x => x.id === dSel);
  if (warn && d) warn.hidden = !d._hidden;
}
function refreshWin() {
  const warn = $("winWarn"), s = p.windows.find(x => x.id === selId);
  if (warn && s) warn.hidden = !s._hidden;
  renderTreeNav();   // (positions and "hidden" in the tree follow a window as it is moved)
}
function updateHighlight() {
  if (!selMesh) return;
  let found = null;
  for (const key in opsByWall) { const op = opsByWall[key].ops.find(o => o.id === selId); if (op) { found = {w: opsByWall[key].w, op}; break; } }
  selMesh.visible = !!found; selMesh.userData.face = null;
  if (found) {
    const {w, op} = found, c = WP(w, (op.s0 + op.s1) / 2, (op.t0 + op.t1) / 2, 0.07);
    selMesh.position.set(c[0], c[1], c[2]);
    selMesh.scale.set(op.s1 - op.s0 + 0.2, op.t1 - op.t0 + 0.2, 1);
    selMesh.rotation.set(0, Math.atan2(w.n[0], w.n[2]), 0);
    selMesh.userData.face = {c, n: w.n};
  }
  needs = true;
}
function pick(e) {
  const r = canvas.getBoundingClientRect();
  const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  const rc = new THREE.Raycaster(); rc.setFromCamera(v, camera);
  const hit = rc.intersectObjects(Object.values(meshes))[0];
  if (!hit) return;
  const q = hit.point;
  for (const key in opsByWall) {
    const {w, ops} = opsByWall[key];
    const dx = q.x - w.o[0], dz = q.z - w.o[2], s = dx*w.u[0] + dz*w.u[2], d = dx*w.n[0] + dz*w.n[2], t = q.y - w.o[1];
    if (d < -0.3 || d > 0.2) continue;
    const op = ops.find(o => o.id && (o.kind === "window" || o.kind === "door") && s > o.s0 - 0.12 && s < o.s1 + 0.12 && t > o.t0 - 0.12 && t < o.t1 + 0.12);
    if (op) {
      selectNode("win", op.id);
      return;
    }
  }
  // not on a window or door: on a wall. Its things are shown in the Openings tab ("Things on a wall").
  let wall = null, best = 1e9, wallS = 0, wallT = 0;
  for (const key in opsByWall) {
    const w = opsByWall[key].w, dx = q.x - w.o[0], dz = q.z - w.o[2], s = dx*w.u[0] + dz*w.u[2], d = dx*w.n[0] + dz*w.n[2], t = q.y - w.o[1];
    if (d < -0.3 || d > 0.2 || s < -0.1 || s > w.L + 0.1 || t < -0.5 || Math.abs(d) >= best) continue;
    wall = key; best = Math.abs(d); wallS = s; wallT = t;
  }
  if (wall) {
    const runs = sectionRuns(p, wall, opsByWall[wall].w.L), run = runs.find(r => wallS >= r.a && wallS < r.b) || runs[runs.length - 1];
    selectNode("wall", {key: wall, floor: wallFloorAt(p, wall, wallS, wallT), section: run ? run.sec.index : 0});
  }
}

/**
 * Preview of the game places (gamePlaces): each FS25 box as a faint coloured box with its edges, and
 * its icon floating over where the game shows it. The place being edited is shown stronger.
 */
const PLACE_COLORS = {sleep: 0x3d7bd9, food: 0xe08a2c, bales: 0xd9a92a, loading: 0x4caf50, pallets: 0xe0c22c, info: 0x8a8f98};
function makePlacesMarker() {
  const group = new THREE.Group(), boxGeo = new THREE.BoxGeometry(1, 1, 1), edgeGeo = new THREE.EdgesGeometry(boxGeo);
  const boxes = {}, icons = {}, textures = {};
  // one canvas texture per glyph, drawn in white on a coloured circle
  const GLYPHS = {sleep: ["#2f6fd0", drawBed], food: ["#d07a1f", drawFeed], bales: ["#c0901a", drawBale], hen: ["#3f9a43", drawHen], cow: ["#3f9a43", drawCow], sheep: ["#3f9a43", drawSheep], pallet: ["#c9a514", drawPallet], wrench: ["#5a6a78", drawWrench], cart: ["#2f8f6f", drawCart]};
  const texture = glyph => {
    if (!textures[glyph]) {
      const c = document.createElement("canvas"); c.width = c.height = 128;
      const x = c.getContext("2d"), [bg, draw] = GLYPHS[glyph];
      x.fillStyle = bg; x.beginPath(); x.arc(64, 64, 60, 0, Math.PI * 2); x.fill();
      x.fillStyle = x.strokeStyle = "#fff"; x.lineWidth = 6; x.lineCap = x.lineJoin = "round";
      draw(x, bg);
      textures[glyph] = new THREE.CanvasTexture(c);
    }
    return textures[glyph];
  };
  const boxFor = id => {
    if (!boxes[id]) {
      const color = PLACE_COLORS[id] || 0x888888;
      const mesh = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({color, transparent: true, opacity: 0.14, depthWrite: false}));
      const edges = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({color, transparent: true, opacity: 0.35}));
      mesh.add(edges);
      group.add(mesh);
      boxes[id] = {mesh, edges};
    }
    return boxes[id];
  };
  const iconFor = (id, glyph) => {
    if (!icons[id]) {
      icons[id] = new THREE.Sprite(new THREE.SpriteMaterial({map: texture(glyph), transparent: true, depthWrite: false}));
      icons[id].scale.set(0.85, 0.85, 1); icons[id].renderOrder = 10;
      group.add(icons[id]);
    }
    return icons[id];
  };
  // the pasture's handles in the yard's plan view: its two ends and its outer edge
  const handleGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.06, 24), handleMat = new THREE.MeshBasicMaterial({color: 0x2f6fd0, depthTest: false});
  // (a fence drawn by hand: a handle for each post, green at the start, red at the stop, and a small pale one between two posts to make a new one)
  const handleMats = {pt: handleMat, start: new THREE.MeshBasicMaterial({color: 0x3f9a43, depthTest: false}), end: new THREE.MeshBasicMaterial({color: 0xd03a2a, depthTest: false}), mid: new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false})};
  // the length of the chosen post's next stretch, written over it
  const lc = document.createElement("canvas"); lc.width = 256; lc.height = 64;
  const labelTex = new THREE.CanvasTexture(lc), distLabel = new THREE.Sprite(new THREE.SpriteMaterial({map: labelTex, depthTest: false, transparent: true}));
  distLabel.visible = false; distLabel.renderOrder = 12; distLabel.scale.set(6, 1.5, 1); group.add(distLabel);
  const setLabel = text => {
    const x = lc.getContext("2d"); x.clearRect(0, 0, 256, 64);
    x.fillStyle = "rgba(255,255,255,0.92)"; x.strokeStyle = "#2f6fd0"; x.lineWidth = 3;
    x.beginPath(); if (x.roundRect) x.roundRect(6, 6, 244, 52, 14); else x.rect(6, 6, 244, 52); x.fill(); x.stroke();
    x.fillStyle = "#1b2a41"; x.font = "bold 30px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(text, 128, 33);
    labelTex.needsUpdate = true;
  };
  const handles = Array.from({length: 3 + 2 * MAX_FENCE_POINTS}, () => { const m = new THREE.Mesh(handleGeo, handleMat); m.visible = false; m.renderOrder = 11; group.add(m); return m; });
  const dispose = () => {
    boxGeo.dispose(); edgeGeo.dispose();
    handleGeo.dispose(); Object.values(handleMats).forEach(m => m.dispose()); distLabel.material.dispose(); labelTex.dispose();
    Object.values(boxes).forEach(b => { b.mesh.material.dispose(); b.edges.material.dispose(); });
    Object.values(icons).forEach(s => s.material.dispose());
    Object.values(textures).forEach(t => t.dispose());
  };
  return {group, boxes, icons, handles, handleMats, distLabel, setLabel, boxFor, iconFor, dispose};
}
function updatePlacesMarker() {
  if (!placesObj) return;
  placesObj.group.visible = true;
  const list = gamePlaces(p), shown = new Set(list.map(x => x.type)), pr = objectProblems(p);
  for (const [id, b] of Object.entries(placesObj.boxes)) b.mesh.visible = shown.has(id);
  for (const [id, s] of Object.entries(placesObj.icons)) s.visible = shown.has(id);
  for (const x of list) {
    const b = placesObj.boxFor(x.type), on = x.id === ob.sel, bad = pr.has(x.id);
    b.mesh.position.set(...x.box.center); b.mesh.scale.set(...x.box.size);
    b.mesh.material.opacity = on ? 0.32 : x.type === "info" ? 0.05 : 0.14;
    b.edges.material.opacity = on || bad ? 1 : 0.35;
    b.edges.material.color.set(bad ? 0xd03a2a : on ? 0x2f6fd0 : (PLACE_COLORS[x.type] || 0x888888));
    // the icon over its spot in the game, or a preview-only one over the middle of an icon-less place
    if (!x.glyph) continue;
    const at = x.icon || [x.box.center[0], 0, x.box.center[2]], s = placesObj.iconFor(x.type, x.glyph);
    s.position.set(at[0], at[1] + 1.3, at[2]);
  }
  const hs = ob.on || (ob.sel !== null && (objectOf(p, "pasture") || {}).id === ob.sel && (objectOf(p, "pasture") || {}).points) ? pastureHandles() : [];
  placesObj.handles.forEach((m, i) => {
    m.visible = !!hs[i];
    if (!hs[i]) return;
    m.position.set(hs[i].at[0], 0.05, hs[i].at[1]); m.material = placesObj.handleMats[hs[i].style || "pt"];
    const sc = hs[i].style === "mid" ? 0.5 : hs[i].sel ? 1.5 : 1; m.scale.set(sc, 1, sc);
  });
  // the length of the chosen post's next stretch (of the one before, for the last post), over its middle
  const fp = objectOf(p, "pasture"), lab = placesObj.distLabel;
  if (hs.length && fp && fp.points && ob.pt !== null && ob.pt < fp.points.length && fp.points.length > 1) {
    const n = fp.points.length, j = ob.pt < n - 1 ? ob.pt + 1 : ob.pt - 1, a = fp.points[ob.pt], b2 = fp.points[j];
    lab.visible = true; lab.position.set((a[0] + b2[0]) / 2, 1.2, (a[1] + b2[1]) / 2);
    const text = fenceDist(fp.points, ob.pt, j).toFixed(1) + " m";
    if (lab.userData.text !== text) { lab.userData.text = text; placesObj.setLabel(text); }
  } else lab.visible = false;
  needs = true;
}
function drawBed(x) {
  x.fillRect(26, 40, 10, 54);            // headboard
  x.fillRect(26, 74, 78, 10);            // frame
  x.fillRect(96, 74, 8, 20);             // foot
  x.beginPath(); x.arc(50, 64, 9, 0, Math.PI * 2); x.fill();  // pillow / head
  x.fillRect(62, 56, 42, 16);            // blanket
}
function drawCart(x, bg) {
  // A shopping trolley: a basket on two wheels with a handle.
  x.beginPath(); x.moveTo(26, 36); x.lineTo(40, 36); x.lineTo(50, 82); x.lineTo(98, 82); x.lineTo(108, 48); x.lineTo(44, 48); x.lineWidth = 9; x.strokeStyle = x.fillStyle; x.lineJoin = "round"; x.stroke();
  x.beginPath(); x.arc(58, 98, 8, 0, Math.PI * 2); x.arc(90, 98, 8, 0, Math.PI * 2); x.fill();
}
function drawWrench(x, bg) {
  // A spanner: a long handle with an open jaw at the top.
  x.save(); x.translate(64, 64); x.rotate(-Math.PI / 4);
  x.beginPath(); x.rect(-8, -10, 16, 56); x.fill();
  x.beginPath(); x.arc(0, -26, 22, 0, Math.PI * 2); x.fill();
  x.fillStyle = bg; x.fillRect(-9, -52, 18, 26);
  x.restore();
}
function drawBale(x, bg) {
  // A square bale: front face, top and side, with two strings.
  x.beginPath(); x.moveTo(26, 52); x.lineTo(44, 36); x.lineTo(104, 36); x.lineTo(104, 80); x.lineTo(86, 96); x.lineTo(26, 96); x.closePath(); x.fill();
  x.strokeStyle = bg; x.lineWidth = 4;
  x.beginPath(); x.moveTo(26, 52); x.lineTo(86, 52); x.lineTo(104, 36); x.moveTo(86, 52); x.lineTo(86, 96);
  x.moveTo(46, 52); x.lineTo(46, 96); x.moveTo(66, 52); x.lineTo(66, 96); x.stroke();
}
/**
 * Preview of an animal building's yard: the starting fence as a see-through net with posts and wires
 * (the places outside are drawn with the other game places).
 */
function makeYardMarker() {
  const group = new THREE.Group();
  // The fence: a see-through green net, dark posts, and dark wires along its top and bottom.
  const netMat = new THREE.MeshBasicMaterial({color:0x5f7a4a, transparent:true, opacity:0.4, side:THREE.DoubleSide, depthWrite:false});
  const net = new THREE.Mesh(new THREE.BufferGeometry(), netMat);
  const postMat = new THREE.MeshLambertMaterial({color:0x3b3f37, side:THREE.DoubleSide});
  const posts = new THREE.Mesh(new THREE.BufferGeometry(), postMat);
  posts.castShadow = true;
  const wireMat = new THREE.LineBasicMaterial({color:0x2f3a2a});
  const wires = new THREE.LineSegments(new THREE.BufferGeometry(), wireMat);
  group.add(posts, wires, net);
  // where the animals can walk: a see-through green picture of the ground (walkarea.mjs), when asked for
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({transparent: true, depthWrite: false, side: THREE.DoubleSide}));
  ground.rotation.x = -Math.PI / 2; ground.position.y = 0.03; ground.visible = false; ground.renderOrder = 2;
  group.add(ground);
  const groundIn = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide}));   // (seen through the walls and roof)
  groundIn.rotation.x = -Math.PI / 2; groundIn.visible = false; groundIn.renderOrder = 3;
  group.add(groundIn);
  const dispose = () => { for (const m of [net, posts, wires, ground, groundIn]) { m.geometry.dispose(); if (m.material.map) m.material.map.dispose(); m.material.dispose(); } };
  return {group, net, posts, wires, ground, groundIn, dispose};
}
/* Icon glyphs, drawn in white on a 128 px circle. */
function drawFeed(x) {
  // An ear of grain: a stalk with kernels either side, and two leaves.
  x.beginPath(); x.moveTo(64, 108); x.lineTo(64, 26); x.stroke();
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
    x.beginPath(); x.ellipse(64 + s * 11, 36 + i * 14, 7, 11, s * 0.5, 0, Math.PI * 2); x.fill();
  }
  x.beginPath(); x.ellipse(64, 24, 6, 10, 0, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.moveTo(64, 96); x.quadraticCurveTo(44, 86, 38, 72); x.moveTo(64, 96); x.quadraticCurveTo(84, 86, 90, 72); x.stroke();
}
function drawPallet(x) {
  // An egg standing on a pallet.
  x.beginPath(); x.ellipse(64, 52, 20, 26, 0, 0, Math.PI * 2); x.fill();
  x.fillRect(28, 82, 72, 8);
  for (const px of [28, 59, 90]) x.fillRect(px, 90, 10, 10);
  x.fillRect(28, 100, 72, 6);
}
function drawCow(x, bg) {
  // A cow's head from the front: ears, horns, head, a pale muzzle with nostrils, eyes.
  x.beginPath(); x.ellipse(36, 50, 14, 8, -0.4, 0, Math.PI * 2); x.ellipse(92, 50, 14, 8, 0.4, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.moveTo(50, 40); x.quadraticCurveTo(44, 24, 52, 18); x.moveTo(78, 40); x.quadraticCurveTo(84, 24, 76, 18); x.stroke();
  x.beginPath(); x.ellipse(64, 62, 22, 28, 0, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.ellipse(64, 90, 20, 13, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = bg;
  for (const [cx, cy, r] of [[55, 56, 4], [73, 56, 4], [57, 91, 3.5], [71, 91, 3.5]]) { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); }
}
function drawSheep(x, bg) {
  // A sheep in profile: a woolly body of overlapping puffs, a dark head with an ear, and legs.
  for (const [cx, cy, r] of [[46, 62, 17], [62, 54, 18], [78, 62, 17], [60, 72, 18], [42, 76, 12], [78, 76, 12]]) { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); }
  x.beginPath(); x.ellipse(98, 58, 9, 13, 0.3, 0, Math.PI * 2); x.fill();
  x.fillStyle = bg; x.beginPath(); x.ellipse(98, 58, 7, 11, 0.3, 0, Math.PI * 2); x.fill(); x.beginPath(); x.arc(101, 54, 2, 0, Math.PI * 2); x.fillStyle = "#fff"; x.fill();
  x.strokeStyle = "#fff"; x.lineWidth = 6; x.beginPath(); x.moveTo(46, 88); x.lineTo(46, 108); x.moveTo(74, 88); x.lineTo(74, 108); x.stroke();
}
function drawHen(x) {
  // A hen in profile: body, head with comb and beak, tail, legs.
  x.beginPath(); x.ellipse(60, 70, 30, 22, 0, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.arc(84, 42, 13, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.moveTo(76, 56); x.lineTo(92, 50); x.lineTo(88, 66); x.closePath(); x.fill();
  x.beginPath(); x.moveTo(96, 40); x.lineTo(108, 45); x.lineTo(96, 48); x.closePath(); x.fill();   // beak
  x.beginPath(); x.arc(80, 28, 5, 0, Math.PI * 2); x.arc(88, 28, 5, 0, Math.PI * 2); x.fill();     // comb
  x.beginPath(); x.moveTo(34, 64); x.lineTo(20, 38); x.lineTo(40, 52); x.closePath(); x.fill();    // tail
  x.beginPath(); x.moveTo(54, 90); x.lineTo(54, 106); x.moveTo(68, 90); x.lineTo(68, 106); x.stroke();
}
/** Boxes (6 cm square, h high) standing at the given ground points, as one mesh with normals. */
function postsGeometry(points, h) {
  const pos = [], nrm = [], s = 0.03;
  const quad = (a, b, c, d, n) => { for (const q of [a, b, c, a, c, d]) { pos.push(...q); nrm.push(...n); } };
  for (const [x, , z] of points) {
    const P = (i, j, k) => [x + (i ? s : -s), k ? h : 0, z + (j ? s : -s)];
    quad(P(0,0,0), P(0,0,1), P(1,0,1), P(1,0,0), [0, 0, -1]);
    quad(P(1,1,0), P(1,1,1), P(0,1,1), P(0,1,0), [0, 0, 1]);
    quad(P(0,1,0), P(0,1,1), P(0,0,1), P(0,0,0), [-1, 0, 0]);
    quad(P(1,0,0), P(1,0,1), P(1,1,1), P(1,1,0), [1, 0, 0]);
    quad(P(0,0,1), P(0,1,1), P(1,1,1), P(1,0,1), [0, 1, 0]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}
function updateYardMarker(geo) {
  if (!yardObj) return;
  const kind = kindOf(p);
  yardObj.group.visible = !!kind.yard;
  $("walkAreaBtn").hidden = !kind.yard;
  if (!yardObj.group.visible) return;
  const yard = kind.yard(geo, p), fence = yard.fence;
  const h = 1.1, pos = [], wire = [], postAt = [];
  for (let i = 0; i + 1 < fence.length; i++) {
    const a = fence[i], b = fence[i + 1];
    pos.push(a[0], 0, a[2], b[0], 0, b[2], b[0], h, b[2], a[0], 0, a[2], b[0], h, b[2], a[0], h, a[2]);
    for (const t of [0.05, h]) wire.push(a[0], t, a[2], b[0], t, b[2]);
    // a post at each corner and at most 2 m apart in between
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 2));
    for (let k = 0; k < n; k++) postAt.push([a[0] + (b[0] - a[0]) * k / n, 0, a[2] + (b[2] - a[2]) * k / n]);
  }
  postAt.push(fence[fence.length - 1]);
  const set = (mesh, g) => { mesh.geometry.dispose(); mesh.geometry = g; };
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  set(yardObj.net, g);
  const wg = new THREE.BufferGeometry();
  wg.setAttribute("position", new THREE.Float32BufferAttribute(wire, 3));
  set(yardObj.wires, wg);
  set(yardObj.posts, postsGeometry(postAt, h + 0.1));
  paintWalkArea(yard);
}
/** Paints where the animals can walk (inside the fence, less the building and the troughs) on the ground, if that is switched on. */
function paintWalkArea(yard) {
  const btn = $("walkAreaBtn");
  yardObj.ground.visible = yardObj.groundIn.visible = false;
  if (!showWalkArea) return;
  const xs = yard.fence.map(q => q[0]), span = Math.max(...xs) - Math.min(...xs), cell = Math.max(0.2, span / 700);
  const rects = yard.nav ? yard.nav.rects : cellRects(walkArea(yard.contour || yard.fence, yard.blockers || [], cell));
  if (!rects.length) return;
  // one picture of the ground for the yard and one at the building's floor (where the animals can go inside)
  const paint = (mesh, list, y, ramps) => {
    if (!list.length) return;
    const x0 = Math.min(...list.map(r => r.x0)), x1 = Math.max(...list.map(r => r.x1)), z0 = Math.min(...list.map(r => r.z0)), z1 = Math.max(...list.map(r => r.z1));
    const nx = Math.max(1, Math.ceil((x1 - x0) / cell)), nz = Math.max(1, Math.ceil((z1 - z0) / cell));
    const cv = document.createElement("canvas"); cv.width = nx; cv.height = nz;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "rgba(70,190,90,0.47)";
    // (the top row of the picture is the smallest z)
    for (const r of list) ctx.fillRect(Math.round((r.x0 - x0) / cell), Math.round((r.z0 - z0) / cell), Math.max(1, Math.round((r.x1 - r.x0) / cell)), Math.max(1, Math.round((r.z1 - r.z0) / cell)));
    for (const ramp of ramps || []) { ctx.beginPath(); ramp.points.forEach(([x, z], k) => ctx[k ? "lineTo" : "moveTo"]((x - x0) / cell, (z - z0) / cell)); ctx.closePath(); ctx.fill(); }
    if (mesh.material.map) mesh.material.map.dispose();
    mesh.material.map = new THREE.CanvasTexture(cv); mesh.material.map.magFilter = THREE.NearestFilter; mesh.material.needsUpdate = true;
    mesh.scale.set(nx * cell, nz * cell, 1);
    mesh.position.set(x0 + nx * cell / 2, y + 0.03, z0 + nz * cell / 2);
    mesh.visible = true;
  };
  paint(yardObj.ground, rects.filter(r => !r.inside), 0, yard.nav && yard.nav.ramps);
  paint(yardObj.groundIn, rects.filter(r => r.inside), (rects.find(r => r.inside) || {y: 0}).y, null);
  const m2 = rects.reduce((sum, r) => sum + (r.x1 - r.x0) * (r.z1 - r.z0), 0);
  btn.title = t("Animals can walk on about {n} m²: in the yard, and inside the building where they can go in", {n: Math.round(m2)});
  needs = true;
}
// The detail toggle: the far view shows only what the game's simple model (LOD1 in the i3d) keeps.
let showFar = false;
function applyLod() {
  const on = p.lodDistance > 0;
  if (!on) showFar = false;
  const btn = $("lodBtn");
  btn.hidden = !on;
  btn.setAttribute("aria-pressed", String(showFar));
  btn.textContent = showFar ? t("Detail: far away (from {m} m)", {m: p.lodDistance}) : t("Detail: close up");
  for (const [m, o] of Object.entries(meshes)) o.visible = !showFar || lodKeeps(m);
  needs = true;
}
function rebuild(fit) {
  const geo = buildGeometry(p);
  lastGeo = geo;
  ({G, dims, opsByWall} = geo);
  const wingsNow = geo.wings || [];
  let tris = 0;
  if (renderer) {
    const live = matList(p);
    // (the materials of parts that no longer have a look of their own go; new ones get a mesh)
    for (const m of Object.keys(meshes)) if (!live.includes(m)) { scene.remove(meshes[m]); meshes[m].geometry.dispose(); delete meshes[m]; if (matObjs[m]) { if (matObjs[m].map) matObjs[m].map.dispose(); if (matObjs[m].normalMap) matObjs[m].normalMap.dispose(); matObjs[m].dispose(); delete matObjs[m]; } delete surf[m]; }
    for (const m of live) if (!meshes[m]) makeMesh(m);
    live.forEach(m => {
      const g = G[m], geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(g.p, 3));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(g.n, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(scaledUV(p, m, g), 2));
      if (g.c) geo.setAttribute("color", new THREE.Float32BufferAttribute(g.c, 3));
      geo.setIndex(g.i);
      meshes[m].geometry.dispose(); meshes[m].geometry = geo;
      if (m === "interior") return;
      if (m === "glass") {
        const mat = matObjs.glass, see = seeThroughGlass(p);
        if (mat.transparent !== see) { mat.transparent = see; mat.opacity = see ? GLASS_ALPHA : 1; mat.depthWrite = !see; mat.needsUpdate = true; }
        meshes.glass.renderOrder = see ? 2 : 0;
      }
      if (!surfaceSpec(p, m)) {
        const mat = matObjs[m];
        if (mat.map) { mat.map.dispose(); mat.map = null; mat.userData = {}; }
        if (mat.normalMap) { mat.normalMap.dispose(); mat.normalMap = null; }
        mat.color.set(m === "curtain" || m === "fittings" ? "#ffffff" : colorFor(p, m)); mat.needsUpdate = true;
      }
    });
    drawFittingSurfaces();
    scheduleSurfaces();
    drawItems(geo.refs);
    if (walk.on) walkRebuilt();
    else if (!ins.on) {
      view.target = [0, dims.ridgeY * 0.45, 0];
      if (fit) view.r = Math.max(dims.W, dims.D, dims.ridgeY) * 2.3 + 6;
      updateCam();
      updateHighlight();
      updatePlacesMarker();
      updateYardMarker(geo);
    }
    updateInsideOverlay();
  }
  refreshWin(); refreshDorm(); renderInsideUI();
  if ($("objPlan")) $("objPlan").disabled = !renderer;
  applyLod();
  Object.keys(G).forEach(m => { if (!showFar || lodKeeps(m)) tris += G[m].i.length / 3; });
  readout.innerHTML = `<span><b>${dims.W.toFixed(1)} \u00D7 ${dims.D.toFixed(1)} m</b>${wingsNow.map(w => ` + <b>${w.ww.toFixed(1)} × ${w.wd.toFixed(1)} m</b> wing`).join("")} footprint</span><span><b>${dims.ridgeY.toFixed(1)} m</b> to the top</span><span><b>${tris.toLocaleString()}</b> triangles</span>`;
}

const toastEl = $("toast"); let toastT;
cleanups.push(() => clearTimeout(toastT));
function toast(msg) { toastEl.textContent = msg; toastEl.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove("show"), 4200); }

const dlg = $("textDlg");
function showText(name, data) {
  $("dlgTitle").textContent = name;
  $("dlgText").value = data;
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
}
$("dlgClose").onclick = () => dlg.close ? dlg.close() : dlg.removeAttribute("open");
$("dlgCopy").onclick = async () => {
  const ta = $("dlgText");
  try { await navigator.clipboard.writeText(ta.value); toast("Copied"); } catch (e) { ta.select(); toast("Press Ctrl+C or Cmd+C to copy"); }
};

/* ---------- Walking around (first person) ---------- */
// "Walk around": the camera becomes a person of 1.65 m eye height: W A S D or the arrows to walk (Shift runs), drag to look,
// Esc to stop. It stands on the building's collision (floors, steps, ramps) and can't pass walls, closed doors or furniture (walk.mjs).
const WALK_KEYS = {KeyW: "f", ArrowUp: "f", KeyS: "b", ArrowDown: "b", KeyA: "l", ArrowLeft: "l", KeyD: "r", ArrowRight: "r"};
function walkLook() {
  camera.rotation.set(walk.pitch, walk.yaw, 0, "YXZ");
  camera.position.set(walk.pos.x, walk.ey, walk.pos.z);
  needs = true;
}
/** The person's start: out in front of the first door looking at it (or in the middle of the building). */
function walkStart() {
  const find = f => Object.values(lastGeo.opsByWall).map(e => ({e, o: e.ops.find(f)})).find(x => x.o);
  const door = find(x => x.kind === "door") || find(x => x.kind === "hatch" && x.t1 >= 1.8);
  if (door) {
    const {w} = door.e, q = WP(w, (door.o.s0 + door.o.s1) / 2, 0, 3.2);
    walk.pos = {x: q[0], y: 0, z: q[2]}; walk.yaw = Math.atan2(w.n[0], w.n[2]);
  } else { walk.pos = {x: 0, y: 0, z: 0}; walk.yaw = 0; }
  walk.pitch = -0.05;
  walk.pos.y = walk.walker.groundAt(walk.pos.x, walk.pos.z, 0.5);
}
function walkRebuilt() {
  walk.walker = makeWalker(lastGeo.collision);
  walk.pos = walk.walker.move(walk.pos, 0, 0); walk.ey = walk.pos.y + walk.eye; walkLook();
}
function walkKey(e) {
  if (!walk.on || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)) return;
  if (e.code === "Escape") { e.preventDefault(); leaveWalk(); return; }
  const k = WALK_KEYS[e.code];
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") { if (e.type === "keydown") walk.keys.add("run"); else walk.keys.delete("run"); return; }
  if (!k) return;
  e.preventDefault();
  if (e.type === "keydown") walk.keys.add(k); else walk.keys.delete(k);
}
function walkStep() {
  const now = performance.now(), dt = Math.min(0.05, (now - (walk.last || now)) / 1000); walk.last = now;
  const K = walk.keys, f = (K.has("f") ? 1 : 0) - (K.has("b") ? 1 : 0), r = (K.has("r") ? 1 : 0) - (K.has("l") ? 1 : 0);
  if (f || r) {
    const v = (K.has("run") ? 4 : 1.8) * dt / Math.hypot(f, r), sy = Math.sin(walk.yaw), cy = Math.cos(walk.yaw);
    walk.pos = walk.walker.move(walk.pos, (-sy * f + cy * r) * v, (-cy * f - sy * r) * v);
  }
  // the eyes follow the ground smoothly (steps, ramps)
  const want = walk.pos.y + walk.eye;
  if (Math.abs(walk.ey - want) > 1e-3) walk.ey += (want - walk.ey) * Math.min(1, dt * 14); else walk.ey = want;
  if (f || r || walk.ey !== want) walkLook();
}
function enterWalk() {
  if (walk.on || !renderer || !lastGeo) return;
  if (ins.on) leaveInside();
  if (ob.on) leaveObjects();
  walk.on = true; walk.keys.clear(); walk.last = 0;
  walk.walker = makeWalker(lastGeo.collision); walkStart(); walk.ey = walk.pos.y + walk.eye;
  camera.fov = 70; camera.near = 0.05; camera.updateProjectionMatrix();
  for (const o of [placesObj && placesObj.group, selMesh, gridObj]) if (o) o.visible = false;
  window.addEventListener("keydown", walkKey); window.addEventListener("keyup", walkKey);
  $("walkBtn").textContent = "Leave walk (Esc)"; $("walkBtn").setAttribute("aria-pressed", "true");
  $("orbitHint").textContent = "W A S D or arrows to walk, Shift to run, drag to look";
  $("view").style.cursor = "crosshair";
  walkLook();
}
function leaveWalk() {
  if (!walk.on) return;
  walk.on = false; walk.keys.clear();
  window.removeEventListener("keydown", walkKey); window.removeEventListener("keyup", walkKey);
  camera.fov = 38; camera.near = 0.1; camera.updateProjectionMatrix();
  if (gridObj) gridObj.visible = true;
  $("walkBtn").textContent = "Walk around"; $("walkBtn").setAttribute("aria-pressed", "false");
  $("orbitHint").textContent = "Drag to orbit, scroll to zoom";
  $("view").style.cursor = "";
  updateCam(); updateHighlight(); updatePlacesMarker();
}
$("lodBtn").onclick = () => { showFar = !showFar; rebuild(false); };
$("walkBtn").onclick = () => walk.on ? leaveWalk() : enterWalk();
$("walkAreaBtn").onclick = () => { showWalkArea = !showWalkArea; $("walkAreaBtn").setAttribute("aria-pressed", String(showWalkArea)); $("walkAreaBtn").textContent = showWalkArea ? "Hide where the animals can walk" : "Show where the animals can walk"; if (lastGeo) updateYardMarker(lastGeo); needs = true; };
cleanups.push(() => { window.removeEventListener("keydown", walkKey); window.removeEventListener("keyup", walkKey); });

/* ---------- Files ---------- */
function saveFile(name, data, fallback) {
  try {
    const blob = data instanceof Blob ? data : new Blob([data], {type: "application/octet-stream"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(`Saved ${name}`);
  } catch (e) { (fallback || (() => showText(name, typeof data === "string" ? data : "")))(); }
}
const canvasBlob = c => new Promise(res => c.toBlob(res, "image/png"));
/** Adds the texture files that buildI3d(p, {withTex: true}) refers to. */
async function addTextures(dir) {
  for (const m of texturedNow()) {
    if (!G[m] || !G[m].i.length) continue;
    const st = ensureSurface(m); if (!st) continue;
    dir.file(`textures/${m}_diffuse.png`, await canvasBlob(st.diffuse));
    dir.file(`textures/${m}_normal.png`, await canvasBlob(st.base.normal));
  }
  // The inside: each colour of a surface its own diffuse, one normal map per surface.
  for (const t of fittingTextures(p, G)) {
    const base = fitBase(t.surf, p.age);
    dir.file(t.diffuse, await canvasBlob(compose(base.S, t.color, base.Mk, base.N)));
    dir.file(t.normal, await canvasBlob(base.normal));
  }
  if (p.interior) dir.file("textures/interior_diffuse.png", await canvasBlob(interiorCanvas()));
  if (seeThroughGlass(p)) dir.file("textures/glass_diffuse.png", await canvasBlob(paintGlass(document)));
}
/** Square picture of the house from the front corner on a transparent background, for the shop. */
function renderStoreImage(size) {
  if (!renderer) return null;
  const r2 = new THREE.WebGLRenderer({alpha: true, antialias: true, preserveDrawingBuffer: true});
  try {
    r2.setPixelRatio(1); r2.setSize(size, size, false);
    r2.shadowMap.enabled = true; r2.shadowMap.type = THREE.PCFSoftShadowMap;
    r2.setClearColor(0x000000, 0);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 600);
    const target = new THREE.Vector3(0, dims.ridgeY * 0.45, 0);
    const radius = 0.5 * Math.hypot(dims.W + 2, dims.D + 2, dims.ridgeY);
    cam.position.copy(target).addScaledVector(new THREE.Vector3(0.8, 0.5, 1).normalize(), radius / Math.sin(15 * Math.PI / 180));
    cam.lookAt(target);
    const hide = [groundObj, gridObj, selMesh, placesObj && placesObj.group, yardObj && yardObj.group].filter(Boolean), was = hide.map(o => o.visible);
    const bg = scene.background, fog = scene.fog;
    hide.forEach(o => o.visible = false); scene.background = null; scene.fog = null;
    r2.render(scene, cam);
    hide.forEach((o, i) => o.visible = was[i]); scene.background = bg; scene.fog = fog;
    const c = document.createElement("canvas"); c.width = c.height = size;
    c.getContext("2d").drawImage(r2.domElement, 0, 0);
    return c;
  } finally { r2.dispose(); r2.forceContextLoss(); needs = true; }
}
/**
 * One building's files for a game mod, into dir (a zip or a folder of one): the placeable XML, the i3d, its textures and imported
 * items and the shop picture. Returns the 256 px icon as a PNG blob (or null), for the mod's own icon.
 */
async function fillMod(dir, name, prefix = "", mod = modName(name)) {
  dir.file(MOD_FILES.xml, placeableXml(p, name, {dir: prefix, mod}));
  dir.file(MOD_FILES.i3d, buildI3d(p, {withTex: true}));
  await addTextures(dir);
  await addItems(dir);
  const store = renderStoreImage(512), icon = renderStoreImage(256);
  if (store) dir.file(MOD_FILES.store, await canvasBlob(store));
  return icon ? await canvasBlob(icon) : null;
}
/** For a mod of several buildings: this one's files into folder dir (named prefix, "folder/": the game reads the XML's paths from the mod's root); {icon, description, author} for the modDesc. */
async function exportInto(dir, name, prefix = "", mod = modName(name)) {
  const icon = await fillMod(dir, name, prefix, mod);
  return {icon, description: p.modDescription || defaultModDescription(p), author: p.modAuthor || author, types: kindOf(p).modTypes || []};
}
/** The house as a game mod: FS25_Name.zip with modDesc, store XML, i3d, textures, icon and shop picture. */
async function exportMod(name) {
  const mod = modName(name);
  toast("Packing the game mod\u2026");
  try {
    const zip = new JSZip();
    zip.file("modDesc.xml", modDescXml(p, name, {author}));
    const icon = await fillMod(zip, name);
    if (icon) zip.file(MOD_FILES.icon, icon);
    saveFile(`${mod}.zip`, await zip.generateAsync({type: "blob"}), () => toast("The download didn\u2019t start. Try again or use another browser."));
  } catch (e) { toast("Couldn\u2019t pack the mod. Try again."); }
}
/** What "Export model" gives: a zip with a folder of house.i3d, placeable_snippet.xml, textures and imported items. */
async function modelZip(name, type = "blob") {
  const zip = new JSZip(), dir = zip.folder(slugify(name));
  dir.file("house.i3d", buildI3d(p, {withTex: true}));
  dir.file("placeable_snippet.xml", placeableSnippet(p));
  await addTextures(dir);
  await addItems(dir);
  return zip.generateAsync({type, compression: "DEFLATE"});
}
async function exportModel(name) {
  const slug = slugify(name);
  const plain = () => showText("house.i3d", buildI3d(p, {withTex: false}));
  toast("Packing the model and textures\u2026");
  try {
    saveFile(`${slug}.zip`, await modelZip(name), plain);
  } catch (e) { plain(); }
}
function exportSettings(name) { saveFile(`${slugify(name)}-settings.json`, JSON.stringify(serialize(p), null, 2)); }
async function importSettings(file) {
  try { setSettings(JSON.parse(await file.text())); persist(); toast("Settings loaded"); return true; }
  catch (e) { toast("That file isn\u2019t a settings file from this app."); return false; }
}
// Imported settings keep this project's kind: the editor is built for it.
function setSettings(obj) { p = sanitize({...obj, kind: p.kind}); selId = null; dSel = null; syncControls(); rebuild(true); }

/** A small JPEG of the current view, for the project list. */
function snapshot() {
  if (!renderer) return null;
  // The project list's picture is always the whole building, even while arranging the inside.
  const wasVisible = selMesh.visible, placesVisible = placesObj.group.visible, yardVisible = yardObj.group.visible;
  const over = [ghost, marks, planLines].map(o => o.visible), clip = renderer.clippingPlanes;
  selMesh.visible = false; placesObj.group.visible = false; yardObj.group.visible = false;
  [ghost, marks, planLines].forEach(o => o.visible = false); renderer.clippingPlanes = [];
  renderer.render(scene, camera);
  [ghost, marks, planLines].forEach((o, i) => o.visible = over[i]); renderer.clippingPlanes = clip;
  const src = renderer.domElement, W = 480, H = 300;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const k = Math.max(W / src.width, H / src.height), sw = W / k, sh = H / k;
  c.getContext("2d").drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, W, H);
  selMesh.visible = wasVisible; placesObj.group.visible = placesVisible; yardObj.group.visible = yardVisible; needs = true;
  return c.toDataURL("image/jpeg", 0.8);
}

function destroy() {
  destroyed = true;
  cancelAnimationFrame(raf);
  cleanups.forEach(f => f());
  for (const m of Object.keys(meshes)) { if (meshes[m]) meshes[m].geometry.dispose(); const mat = matObjs[m]; if (mat) { if (mat.map) mat.map.dispose(); if (mat.normalMap) mat.normalMap.dispose(); mat.dispose(); } }
  for (const o of Object.values(fitMeshes)) { o.geometry.dispose(); o.material.map.dispose(); o.material.normalMap.dispose(); o.material.dispose(); }
  if (placesObj) placesObj.dispose();
  if (yardObj) yardObj.dispose();
  if (interiorTex) interiorTex.dispose();
  for (const g of itemGeos.values()) if (g) g.dispose();
  if (itemMat) itemMat.dispose();
  setAssets([]);
  if (renderer) renderer.dispose();
  root.innerHTML = "";
}

syncControls();
initThree();
rebuild(true);
loadAssets();

/**
 * The OBJ and MTL are made from the settings given; the game mod is the full one (as "Download game mod": textures, imported items, shop
 * picture) of the building as the editor holds it now. If packing that fails the plain one (colours only) is sent instead.
 */
const modelFiles = async (name, settings) => {
  const files = await modelBundle(settings || p, name, {author});
  try {
    const zip = new JSZip();
    zip.file("modDesc.xml", modDescXml(p, name, {author}));
    const icon = await fillMod(zip, name);
    if (icon) zip.file(MOD_FILES.icon, icon);
    files.mod = await zip.generateAsync({type: "uint8array", compression: "DEFLATE"});
  } catch (e) { console.warn("The full game mod could not be packed; sending the plain one:", e); toast("Model files for the API: " + (e && e.message || e)); }
  try { files.export = await modelZip(name, "uint8array"); } catch (e) { console.warn("The model export could not be packed:", e); toast("Model export for the API: " + (e && e.message || e)); }
  return files;
};
return {getSettings: () => serialize(p), setSettings, modelFiles, exportModel, exportMod, exportInto, exportSettings, importSettings, snapshot, toast, destroy};
}
