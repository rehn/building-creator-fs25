// The house editor: controls, 3D preview and export, mounted into a DOM element.
// All model logic (settings, geometry, i3d) lives in model.mjs.
import * as THREE from "three";
import JSZip from "jszip";
import {
  SCHEMA, fieldsFor, WALLS, WALL_NAMES, DTYPES, DORM_DEF, MATS, fittingTextures,
  genRow, sanitize, serialize, slugify, buildGeometry, buildI3d, placeableSnippet, gamePlaces, surfaceSpec, scaledUV, colorFor, WP
} from "./model.mjs";
import { WINDOW_STYLES, DOOR_STYLES, PORCH_OPTIONS, PORCH_W, PORCH_D, WING_FIELDS, MAX_WINGS } from "./model.mjs";
import { GLASS_ALPHA, ROOM_OPTIONS, CURTAIN_OPTIONS, MOD_FILES, modName, modDescXml, placeableXml, defaultModDescription, henYard, henCap, seeThroughGlass, kindOf } from "./model.mjs";
import { cowYard } from "./kinds/cow.mjs";
import { roomOf, problems, footprint, snapItem, itemAt, placeNew, rotateItem, History, roomBox, wingsOf, liveWings, wingFloors, wingHalf, wingIdOf, wingWallKey, WING_PARTS, wallsOf, eaveWalls, autoPipes, pipePositions } from "./layout.mjs";
import { OBJECT_TYPES, objectInfo, OBJECT_LIMITS, objectOf, pastureOf, snapBox, snapPasture, objectProblems } from "./objects.mjs";
import { setAssets, catalogFor, usedAssets } from "./model.mjs";
import { readObj, assetFolder, flattenI3d } from "./assets.mjs";
import { paintInterior, paintGlass } from "./interior.mjs";
import { SURFACES, paintSurface, normalFromHeight } from "./surfaces.mjs";
import { weather, MASK_RGB } from "./age.mjs";
import { splitBySurface } from "./i3d.mjs";
export { slugify };

const lerp = (a, b, t) => a + (b - a) * t;
/** Text for innerHTML (names of imported items are the user's own text). */
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Two sides of settings: building the house (left) and finishing it (right). On narrower
// screens they share one column and the tabs switch between them (see globals.css).
const MARKUP = `<div class="hx-editor" data-tab="build">
  <div class="hx-tabs" role="tablist" aria-label="Settings">
    <button type="button" role="tab" id="tab-build" aria-controls="panel-build">Build</button>
    <button type="button" role="tab" id="tab-finish" aria-controls="panel-finish">Finish</button>
  </div>
  <aside class="hx-panel hx-build" id="panel-build" role="tabpanel" aria-labelledby="tab-build"><h2 class="hx-side">Build the house</h2><div id="controls-build"></div></aside>
  <section class="hx-stage" id="stage" aria-label="3D preview">
    <canvas id="view"></canvas>
    <div class="readout" id="readout"></div>
    <div class="orbit-hint" id="orbitHint">Drag to orbit, scroll to zoom</div>
    <div class="hx-inside-bar" id="insideBar" hidden>
      <div class="seg" role="group" aria-label="View">
        <button type="button" id="viewPlan" aria-pressed="true">Plan</button><button type="button" id="view3d" aria-pressed="false">3D</button>
      </div>
      <button type="button" id="insideUndo" title="Undo (Ctrl+Z)">Undo</button>
      <button type="button" id="insideRedo" title="Redo (Ctrl+Y)">Redo</button>
      <button type="button" id="insideDone" class="primary">Done</button>
    </div>
  </section>
  <aside class="hx-panel hx-finish" id="panel-finish" role="tabpanel" aria-labelledby="tab-finish"><h2 class="hx-side">Finish and export</h2><div id="controls-finish"></div></aside>
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
export function createEditor(root, {initial, onChange, author = "", assets = null} = {}) {
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
function setTab(t) {
  editorEl.dataset.tab = t;
  for (const s of ["build", "finish"]) {
    const b = $("tab-" + s);
    b.setAttribute("aria-selected", String(s === t));
    b.tabIndex = s === t ? 0 : -1;
  }
  remember.set("hx-tab", t);
}
for (const s of ["build", "finish"]) {
  const b = $("tab-" + s);
  b.onclick = () => setTab(s);
  b.onkeydown = e => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const other = s === "build" ? "finish" : "build";
    setTab(other); $("tab-" + other).focus(); e.preventDefault();
  };
}
setTab(remember.get("hx-tab") === "finish" ? "finish" : "build");
const inputs = {};
function fmt(f, v) {
  if (f.k === "hens") { const cap = henCap(p); return v > cap ? `${cap} (barn full)` : `${v} (room for ${cap})`; }
  if (f.cm) return (Math.round(v * 1000) / 10) + " cm";
  if (f.money) return Math.round(v).toLocaleString("en-US");
  const dec = f.step >= 1 ? 0 : f.step >= 0.1 ? 1 : 2;
  return (+v).toFixed(dec) + (f.unit || "");
}
// Only the sections for this project's kind are built (a project's kind never changes), and its
// fields are looked up by kind: kinds can have fields with the same key and different ranges.
const FLD = fieldsFor(kindOf(p));
const kindSections = [];
function syncKind() { for (const {g, d} of kindSections) d.hidden = !g.kinds.includes(p.kind); }
SCHEMA.forEach(g => {
  if (g.kinds && !g.kinds.includes(p.kind)) return;
  const d = document.createElement("details");
  if (g.kinds) kindSections.push({g, d});
  // First time: only the first section of each side is open. After that, as the user left them.
  d.open = g.title in openState ? !!openState[g.title] : !sideSeen[g.side];
  sideSeen[g.side] = true;
  d.addEventListener("toggle", () => { openState[g.title] = d.open; remember.set("hx-open-sections", openState); });
  d.innerHTML = `<summary>${g.title}</summary>` + (g.hint ? `<p class="hint">${g.hint}</p>` : "");
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
    wrap.appendChild(el);
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
      renderPipesUI();
      if (ob.sel || ob.on) renderObjectsUI();
    });
  });
  if (g.custom === "pipes") { const ed = document.createElement("div"); ed.id = "pipesEditor"; d.appendChild(ed); }
  if (g.custom === "wings") { const ed = document.createElement("div"); ed.id = "wingsEditor"; d.appendChild(ed); }
  if (g.custom === "dormers") { const ed = document.createElement("div"); ed.id = "dormEditor"; d.appendChild(ed); }
  if (g.custom === "inside") { const ed = document.createElement("div"); ed.id = "insideEditor"; d.appendChild(ed); }
  if (g.custom === "objects") { const ed = document.createElement("div"); ed.id = "objectsEditor"; d.appendChild(ed); }
  if (g.custom === "windows") {
    const ed = document.createElement("div"); ed.id = "winEditor"; d.appendChild(ed);
    const sub = document.createElement("p"); sub.className = "sub"; sub.textContent = "Size for new windows"; d.appendChild(sub);
  }
  d.appendChild(wrap);
  if (g.custom === "windows") {
    const b = document.createElement("button"); b.type = "button"; b.className = "wide"; b.textContent = "Use this size for all windows";
    b.onclick = () => { p.windows.forEach(w => { if (w.type === "door") return; w.w = p.winW; w.h = p.winH; w.sill = p.sill; }); persist(); rebuild(false); renderWinUI(); toast("All windows now use this size"); };
    d.appendChild(b);
  }
  $("controls-" + g.side).appendChild(d);
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
  renderPipesUI();
}
function syncOutputs() {
  for (const k in inputs) {
    const f = FLD[k];
    const o = $("f-" + k + "-o");
    if (o) o.textContent = fmt(f, p[k]);
  }
  // Controls that don't apply right now are greyed out (a kind may not have some of them at all).
  const off = (k, v) => { if (inputs[k]) inputs[k].disabled = v; };
  off("ridge", p.roofType !== "gable");
  // the walls' zones: board settings apply when either zone has boards
  const clads = p.wallSplit === "one" ? [p.wallCladding] : [p.wallCladding, p.lowerCladding];
  off("panelSpacing", clads.every(c => c === "plaster"));
  off("battenWidth", !clads.includes("lockpanel"));
  off("splitHeight", p.wallSplit !== "height");
  off("lowerCladding", p.wallSplit === "one"); off("lowerColor", p.wallSplit === "one");
  off("roofMaterial", p.roofType === "flat");
  off("chimneyStyle", !p.chimney);
  off("kneeWall", !p.halfStorey);
  off("gutters", p.roofType === "flat");
  off("downpipes", !p.gutters || p.roofType === "flat");
  off("ventilators", p.roofType === "flat");
  off("curtainStyle", !p.interior); off("curtainColor", !p.interior);
  inputs.modDescription.placeholder = defaultModDescription(p);
}

const TEX = 1024;
/** The materials with a surface texture (surfaceSpec), when their settings give them one. */
const TEXTURED = ["walls", "wallsLow", "roof", "chimney", "trim", "foundation", "door"];
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
  const strength = {lockpanel:10, horizontal:40, plaster:1.5, felt:1.2, tiles:60, metal:4.5, brick:3, paintedwood:0.6}[s.kind];
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
let interiorTex = null, interiorCv = null, groundObj = null, gridObj = null;
const interiorCanvas = () => interiorCv || (interiorCv = paintInterior(document));
let renderer, scene, camera, groundMat, selMesh = null, placesObj = null, yardObj = null, meshes = {}, matObjs = {}, needs = true, sunLight = null;

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
  MATS.forEach(m => {
    // The rooms are unlit and a little dark, so they read as indoors behind the glass.
    matObjs[m] = m === "interior" ? new THREE.MeshBasicMaterial({map: interiorTex, color: 0xc8c8c8})
      : new THREE.MeshStandardMaterial(m === "glass" ? {roughness:0.05, metalness:0.1} : m === "gutter" || m === "iron" ? {roughness:0.45, metalness:0.35} : m === "curtain" || m === "fittings" ? {roughness:0.95, metalness:0, vertexColors:true} : {roughness:0.85, metalness:0});
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), matObjs[m]);
    mesh.castShadow = !["glass", "interior", "curtain"].includes(m); mesh.receiveShadow = m !== "interior";
    meshes[m] = mesh; scene.add(mesh);
  });
  selMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({transparent:true, opacity:0.45, depthWrite:false, side:THREE.DoubleSide}));
  selMesh.visible = false; scene.add(selMesh);
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
function loop() { if (destroyed) return; if (needs) { renderer.render(scene, activeCam()); needs = false; } raf = requestAnimationFrame(loop); }

const view = {theta:0.75, phi:1.15, r:26, target:[0,3,0]};
function updateCam() {
  const {theta, phi, r, target} = view;
  camera.position.set(target[0] + r*Math.sin(phi)*Math.sin(theta), target[1] + r*Math.cos(phi), target[2] + r*Math.sin(phi)*Math.cos(theta));
  camera.lookAt(target[0], target[1], target[2]);
  needs = true;
}
function setupOrbit() {
  const ptrs = new Map(); let pinch = 0, downAt = null;
  const zoomPlan = k => { ortho.zoom = Math.min(8, Math.max(0.3, ortho.zoom * k)); ortho.updateProjectionMatrix(); needs = true; };
  canvas.addEventListener("pointerdown", e => {
    canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); downAt = ptrs.size === 1 ? [e.clientX, e.clientY] : null;
    // The yard's plan view: pressing on an object (or a pasture handle) picks it up.
    if (ob.on && ptrs.size === 1) {
      const q = groundPoint(e), hit = q && objectAt(q);
      if (hit) {
        const o = objectsNow().find(x => x.id === hit.id);
        ob.sel = hit.id; ob.drag = {...hit, off: o.type === "pasture" ? [0, 0] : [q[0] - o.x, q[1] - o.z], moved: false, before: p.objects};
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
      }
    }
  });
  canvas.addEventListener("pointerup", e => {
    const click = downAt && ptrs.size === 1 && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 5;
    if (ob.drag) {
      const d = ob.drag; ob.drag = null;
      if (d.moved) setObjects(sanitize({...p, objects: p.objects}).objects, d.id); else { renderObjectsUI(); updatePlacesMarker(); }
      downAt = null; return;
    }
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
      view.theta -= (e.clientX - prev[0]) * 0.008;
      view.phi = Math.min(1.5, Math.max(0.2, view.phi - (e.clientY - prev[1]) * 0.006));
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a[0]-b[0], a[1]-b[1]);
      if (pinch) view.r = Math.min(120, Math.max(5, view.r * pinch / d));
      pinch = d;
    }
    updateCam();
  });
  const end = e => { ptrs.delete(e.pointerId); pinch = 0; };
  canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    if (ins.on && ins.view === "plan") { zoomPlan(Math.exp(-e.deltaY * 0.001)); return; }
    view.r = Math.min(120, Math.max(3, view.r * Math.exp(e.deltaY * 0.001))); updateCam();
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
  for (const m of TEXTURED) {
    const st = ensureSurface(m), mat = matObjs[m];
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
function floorName(f) { return p.halfStorey && f === p.floors ? "Attic" : `Floor ${f + 1}`; }
/** How many floors a wall has: the house's, or its wing's. */
function floorsOf(wall) { const id = wingIdOf(wall), w = id && (p.wings || []).find(x => x.id === id); return w ? wingFloors(p, w) : p.floors; }
/** Whether a wall has a half floor in the roof (1½-plan): the house's, or its wing's. */
function halfOf(wall) { const id = wingIdOf(wall), w = id && (p.wings || []).find(x => x.id === id); return w ? wingHalf(p, w) : p.halfStorey; }
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
  return p.windows.filter(w => walls[w.wall] && w.floor < p.floors + (p.halfStorey ? 1 : 0)).sort((a, b) => ord(a.wall) - ord(b.wall) || a.floor - b.floor || a.pos - b.pos);
}
function winLabel(w) {
  const row = sortedWindows().filter(x => x.wall === w.wall && x.floor === w.floor);
  const same = row.filter(x => x.type === w.type);
  return `${WALL_NAMES[w.wall]}, ${floorName(w.floor).toLowerCase()}, ${w.type === "door" ? "door" : "window"} ${same.indexOf(w) + 1}` + (w._hidden ? " (hidden)" : "");
}
const WIN_FIELDS = [
  {k:"pos", label:"Position", min:0, max:1, step:0.005},
  {k:"w", label:"Width", min:0.3, max:3, step:0.05},
  {k:"h", label:"Height", min:0.3, max:2.4, step:0.05},
  {k:"sill", label:"Sill height", min:0, max:2, step:0.05}];
// a door's porch or canopy: its size, when it has one
const PORCH_FIELDS = [
  {k:"porchW", label:"Porch width", min:PORCH_W[0], max:PORCH_W[1], step:0.05},
  {k:"porchD", label:"Porch depth", min:PORCH_D[0], max:PORCH_D[1], step:0.05}];
/** After a window or door changed: the kind's rules follow (a pasture moves off a wall with a door), then save and redraw. */
function winChanged() {
  if (applyKindRules()) syncControls();
  persist(); rebuild(false);
}
const winOut = (f, s) => f.k === "pos" ? `${(s.pos * wallLen(s.wall)).toFixed(2)} m from left` : `${s[f.k].toFixed(2)} m`;
/** Room and curtain choices for one window or kupa (obj), with ids starting with prefix. */
function choiceFields(prefix, obj) {
  const dis = p.interior ? "" : "disabled";
  const house = (CURTAIN_OPTIONS.find(o => o[0] === p.curtainStyle) || CURTAIN_OPTIONS[0])[1].toLowerCase();
  const own = obj.curtainColor && obj.curtainColor !== "default";
  const opt = (v, label, cur) => `<option value="${v}" ${v === cur ? "selected" : ""}>${label}</option>`;
  return (p.interior ? "" : `<p class="hint">Turn on “Rooms behind the windows” under Interior to choose the room and curtains.</p>`)
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
function renderWinUI() {
  const ed = $("winEditor");
  if (!ed) return;
  const floors = p.floors + (p.halfStorey || (p.wings || []).some(w => wingHalf(p, w)) ? 1 : 0);
  let html = `<table class="wgrid"><thead><tr><th scope="col"><span class="sr">Wall</span></th>${Array.from({length: floors}, (_, f) => `<th scope="col">${floorName(f)}</th>`).join("")}</tr></thead><tbody>`;
  for (const wall of wallKeys()) {
    html += `<tr><th scope="row">${WALL_NAMES[wall]}</th>`;
    for (let f = 0; f < floors; f++) {
      if (!floorOk(f, wall)) { html += `<td><span aria-label="No windows on this floor of this wall">\u2013</span></td>`; continue; }
      const n = p.windows.filter(w => w.wall === wall && w.floor === f && w.type !== "door").length, nm = `${WALL_NAMES[wall]}, ${floorName(f).toLowerCase()}`;
      html += `<td><div class="step"><button type="button" data-w="${wall}" data-f="${f}" data-d="-1" aria-label="Fewer windows: ${nm}" ${n ? "" : "disabled"}>\u2212</button><span>${n}</span><button type="button" data-w="${wall}" data-f="${f}" data-d="1" aria-label="More windows: ${nm}" ${n >= 8 ? "disabled" : ""}>+</button></div></td>`;
    }
    html += `</tr>`;
  }
  html += `</tbody></table>`;
  const list = sortedWindows();
  if (!list.some(w => w.id === selId)) selId = null;
  html += `<div class="field"><div class="fl"><label for="winSel">Edit a window or door</label></div><div class="selrow"><button type="button" id="winPrev" aria-label="Previous window">\u2039</button><select id="winSel"><option value="">Choose one</option>${list.map(w => `<option value="${w.id}" ${w.id === selId ? "selected" : ""}>${winLabel(w)}</option>`).join("")}</select><button type="button" id="winNext" aria-label="Next window">\u203A</button></div></div>`;
  const s = list.find(w => w.id === selId);
  if (s) {
    const door = s.type === "door", styles = door ? DOOR_STYLES : WINDOW_STYLES;
    // a building keeps at least one door
    const lastDoor = door && p.windows.filter(w => w.type === "door").length === 1;
    const own = (styles.find(x => x.id === (door ? p.doorStyle : p.winStyle)) || styles[0]).name.toLowerCase();
    const opt = (v, label, cur) => `<option value="${v}" ${v === cur ? "selected" : ""}>${esc(label)}</option>`;
    const range = (f, lo = f.min, hi = f.max) => `<div class="field"><div class="fl"><label for="wf-${f.k}">${f.label}</label><output id="wf-${f.k}-o">${winOut(f, s)}</output></div><input type="range" id="wf-${f.k}" data-k="${f.k}" min="${lo}" max="${hi}" step="${f.step}" value="${s[f.k]}"></div>`;
    html += `<div class="wincard"><p class="warn" id="winWarn" ${s._hidden ? "" : "hidden"}>This overlaps a door or another window, so it’s hidden. Move it or make it smaller.</p>`;
    // a window on the ground floor can be a door (and back)
    html += `<div class="field"><div class="fl"><label for="wf-type">This is a</label></div><select id="wf-type" ${lastDoor ? "disabled" : ""}>${opt("window", "Window", s.type)}${s.floor === 0 ? opt("door", "Door", s.type) : ""}</select></div>`;
    if (lastDoor) html += `<p class="hint">This is the building’s only door, so it stays a door. Make another window a door first to remove this one or make it a window.</p>`;
    else if (s.floor !== 0) html += `<p class="hint">Doors can only go on the ground floor.</p>`;
    // any window or door can move to another wall (attic windows only to a gable)
    const walls = wallKeys().filter(k => floorOk(s.floor, k));
    html += `<div class="field"><div class="fl"><label for="wf-wall">Wall</label></div><select id="wf-wall">${walls.map(k => opt(k, WALL_NAMES[k], s.wall)).join("")}</select></div>`;
    html += `<div class="field"><div class="fl"><label for="wf-style">Style</label></div><select id="wf-style">${opt("default", `Same as the building (${own})`, s.style)}${styles.map(x => opt(x.id, x.name, s.style)).join("")}</select></div>`;
    for (const f of WIN_FIELDS) {
      if (door && f.k === "sill") continue;
      html += door && f.k === "h" ? range(f, 1.5, 2.6) : range(f);
    }
    if (door) {
      html += `<div class="field"><div class="fl"><label for="wf-porch">In front of the door</label></div><select id="wf-porch">${PORCH_OPTIONS.map(o => opt(o[0], o[1], s.porch)).join("")}</select></div>`;
      if (s.porch !== "none") html += PORCH_FIELDS.map(f => range(f)).join("");
      html += `<label class="check"><input type="checkbox" id="wf-opens" ${s.opens !== false ? "checked" : ""}> Opens (you can walk through it in the game)</label>`;
    }
    if (!door) html += choiceFields("wc", s);
    if (!lastDoor) html += `<button type="button" id="winRemove">Remove this ${door ? "door" : "window"}</button>`;
    html += `</div>`;
  }
  ed.innerHTML = html;
  ed.querySelectorAll(".step button").forEach(b => b.onclick = () => {
    const wall = b.dataset.w, f = +b.dataset.f;
    const n = p.windows.filter(w => w.wall === wall && w.floor === f && w.type !== "door").length + (+b.dataset.d);
    p.windows = genRow(p, p.windows, wall, f, Math.max(0, Math.min(8, n)));
    persist(); rebuild(false); renderWinUI();
  });
  const sel = $("winSel");
  sel.onchange = () => { selId = +sel.value || null; renderWinUI(); updateHighlight(); };
  const step = d => {
    if (!list.length) return;
    const i = list.findIndex(w => w.id === selId);
    selId = list[(i < 0 ? (d > 0 ? 0 : list.length - 1) : (i + d + list.length) % list.length)].id;
    renderWinUI(); updateHighlight();
  };
  $("winPrev").onclick = () => step(-1);
  $("winNext").onclick = () => step(1);
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
    if ($("wf-opens")) $("wf-opens").onchange = e => { s.opens = e.target.checked; winChanged(); };
    if ($("winRemove")) $("winRemove").onclick = () => { p.windows = p.windows.filter(w => w.id !== selId); selId = null; winChanged(); renderWinUI(); };
  }
}
/* ---------- Game places ---------- */
/* ---------- Downpipes ---------- */
// The downpipes (p.pipes): how many on each wall with a gutter, and where along it.
let pipeSel = null;
const renumber = list => list.map((x, i) => ({...x, id: i + 1}));
const pipeLabel = (x, list) => `${WALL_NAMES[x.wall]}, ${list.filter(y => y.wall === x.wall).sort((a, b) => a.pos - b.pos).indexOf(x) + 1}`;
function renderPipesUI() {
  const ed = $("pipesEditor");
  if (!ed) return;
  if (!p.gutters || p.roofType === "flat") { ed.innerHTML = `<p class="hint">${p.roofType === "flat" ? "A flat roof has no gutters or downpipes." : "Turn on Rain gutters under Roof to place downpipes."}</p>`; return; }
  const keys = eaveWalls(p), walls = wallsOf(p), pipes = (p.pipes || []).filter(x => keys.includes(x.wall));
  let out = null;
  if (!pipes.some(x => x.id === pipeSel)) pipeSel = null;
  let html = `<table class="wgrid"><thead><tr><th scope="col"><span class="sr">Wall</span></th><th scope="col">Downpipes</th></tr></thead><tbody>`;
  for (const k of keys) {
    const n = pipes.filter(x => x.wall === k).length, nm = WALL_NAMES[k];
    html += `<tr><th scope="row">${nm}</th><td><div class="step"><button type="button" data-pw="${k}" data-d="-1" aria-label="Fewer downpipes: ${nm}" ${n ? "" : "disabled"}>\u2212</button><span>${n}</span><button type="button" data-pw="${k}" data-d="1" aria-label="More downpipes: ${nm}" ${n >= 6 ? "disabled" : ""}>+</button></div></td></tr>`;
  }
  html += `</tbody></table>`;
  const list = [...pipes].sort((a, b) => keys.indexOf(a.wall) - keys.indexOf(b.wall) || a.pos - b.pos);
  html += `<div class="field"><div class="fl"><label for="pipeSel">Move a downpipe</label></div><select id="pipeSel"><option value="">Choose one</option>${list.map(x => `<option value="${x.id}" ${x.id === pipeSel ? "selected" : ""}>${esc(pipeLabel(x, pipes))}</option>`).join("")}</select></div>`;
  const s = pipes.find(x => x.id === pipeSel);
  if (s) {
    const L = walls[s.wall].L;
    out = v => `${(v * L).toFixed(2)} m from the left`;
    html += `<div class="wincard"><div class="field"><div class="fl"><label for="pipePos">Place along the wall</label><output id="pipePos-o">${out(s.pos)}</output></div><input type="range" id="pipePos" min="0" max="1" step="0.005" value="${s.pos}"></div>`
      + `<p class="hint">Seen from outside, from the wall’s left end. A pipe can’t stand where a wing meets the wall.</p><div class="row"><button type="button" id="pipeRemove" class="danger">Remove this downpipe</button></div></div>`;
  }
  html += `<button type="button" id="pipeAuto">Place them again from “Downpipes per long side”</button>`;
  ed.innerHTML = html;
  const save = () => { persist(); rebuild(false); renderPipesUI(); };
  ed.querySelectorAll("[data-pw]").forEach(b => b.onclick = () => {
    const k = b.dataset.pw, n = pipes.filter(x => x.wall === k).length + (+b.dataset.d);
    p.pipes = renumber([...(p.pipes || []).filter(x => x.wall !== k), ...pipePositions(walls[k].L, n).map(pos => ({wall: k, pos: +pos.toFixed(3)}))]);
    pipeSel = null; save();
  });
  $("pipeSel").onchange = e => { pipeSel = +e.target.value || null; renderPipesUI(); };
  $("pipeAuto").onclick = () => { p.pipes = autoPipes(p); pipeSel = null; save(); toast("Downpipes placed again"); };
  if (!s) return;
  const mine = () => (p.pipes || []).find(x => x.id === pipeSel);
  $("pipePos").oninput = e => { const x = mine(); x.pos = +e.target.value; $("pipePos-o").textContent = out(x.pos); persist(); rebuild(false); };
  $("pipePos").onchange = () => save();
  $("pipeRemove").onclick = () => { p.pipes = renumber((p.pipes || []).filter(x => x.id !== pipeSel)); pipeSel = null; save(); };
}
/* ---------- Wings ---------- */
// The house's wings (an L, T or U): a list in the Wings section, each with its wall, place, size and floors.
let wSel = null;
const wingLabel = w => `Wing ${w.id}: ${WALL_NAMES[w.wall]}`;
function renderWingsUI() {
  const ed = $("wingsEditor");
  if (!ed) return;
  const wings = p.wings || [], live = wingsOf(p);
  if (!wings.some(w => w.id === wSel)) wSel = null;
  const opt = (v, label, cur) => `<option value="${v}" ${String(v) === String(cur) ? "selected" : ""}>${esc(label)}</option>`;
  let html = wings.length ? `<ul class="objlist">${wings.map(w => { const l = live.find(x => x.id === w.id); return `<li><button type="button" data-wing="${w.id}" aria-pressed="${w.id === wSel}">${esc(wingLabel(w))}</button>${l && l.off ? ` <span class="warn">${esc(l.off)}</span>` : ""}</li>`; }).join("")}</ul>`
    : `<p class="hint">No wings: the house is a rectangle.</p>`;
  if (wings.length < MAX_WINGS) html += `<div class="addrow"><button type="button" id="wingAdd">+ Add a wing</button></div>`;
  const w = wings.find(x => x.id === wSel);
  if (w) {
    const range = f => `<div class="field"><div class="fl"><label for="wg-${f.k}">${f.label}</label><output id="wg-${f.k}-o">${(+w[f.k]).toFixed(2)}${f.k === "pos" ? "" : " m"}</output></div><input type="range" id="wg-${f.k}" data-k="${f.k}" min="${f.min}" max="${f.max}" step="${f.step}" value="${w[f.k]}"></div>`;
    html += `<div class="wincard"><div class="field"><div class="fl"><label for="wg-wall">On the wall</label></div><select id="wg-wall">${["front", "back", "left", "right"].map(k => opt(k, WALL_NAMES[k], w.wall)).join("")}</select></div>`
      + WING_FIELDS.map(range).join("")
      + `<div class="field"><div class="fl"><label for="wg-floors">Floors</label></div><select id="wg-floors">${opt(0, `As the house (${p.floors}${p.halfStorey ? "½" : ""})`, w.floors)}${[1, 2, 3].map(n => opt(n, `${n}${n < p.floors ? " (lower than the house)" : n > p.floors ? " (taller than the house)" : ""}`, w.floors)).join("")}</select></div>`
      + `<label class="check"><input type="checkbox" id="wg-half" ${wingHalf(p, w) ? "checked" : ""} ${w.floors ? "" : "disabled"}> Half floor in the roof (1½-plan)</label>`
      + `<div class="field"><div class="fl"><label for="wg-pitch">Roof angle</label><output id="wg-pitch-o">${w.pitch ? w.pitch + "°" : "as the house (" + p.roofPitch + "°)"}</output></div><input type="range" id="wg-pitch" min="0" max="60" step="1" value="${w.pitch}"></div>`
      + `<p class="hint">A wing with fewer floors, or a flatter roof, has a lower roof. Roof angle 0 follows the house.</p><div class="row"><button type="button" id="wingRemove" class="danger">Remove this wing</button></div></div>`;
  }
  ed.innerHTML = html;
  const changed = (renderToo = true) => {
    // (a removed wing takes its downpipes with it)
    const ids = new Set(liveWings(p).map(x => x.id));
    p.pipes = (p.pipes || []).filter(x => !wingIdOf(x.wall) || ids.has(wingIdOf(x.wall)));
    persist(); rebuild(false); if (renderToo) { renderWingsUI(); renderWinUI(); renderPipesUI(); }
  };
  ed.querySelectorAll("[data-wing]").forEach(b => b.onclick = () => { wSel = +b.dataset.wing; renderWingsUI(); });
  if ($("wingAdd")) $("wingAdd").onclick = () => {
    const id = [1, 2, 3, 4].find(i => !wings.some(x => x.id === i));
    // on the first wall without a wing (the back first), at an end
    const wall = ["back", "front", "right", "left"].find(k => !wings.some(x => x.wall === k)) || "back";
    p.wings = [...wings, {id, wall, pos: wall === "back" || wall === "front" ? 0.15 : 0.5, width: 6, depth: 5, floors: 0}];
    for (const part of WING_PARTS) for (let fl = 0; fl < p.floors; fl++) p.windows = genRow(p, p.windows, wingWallKey(id, part), fl, part === "End" ? 2 : 1);
    wSel = id; changed();
  };
  if (!w) return;
  ed.querySelectorAll(".wincard input[type=range]").forEach(inp => {
    inp.oninput = () => { w[inp.dataset.k] = +inp.value; $(`wg-${inp.dataset.k}-o`).textContent = `${(+inp.value).toFixed(2)}${inp.dataset.k === "pos" ? "" : " m"}`; persist(); rebuild(false); };
    inp.onchange = () => changed();
  });
  $("wg-wall").onchange = e => { w.wall = e.target.value; changed(); };
  $("wg-floors").onchange = e => { w.floors = +e.target.value; if (!w.floors) w.half = false; else if (w.half === undefined) w.half = p.halfStorey; changed(); };
  $("wg-half").onchange = e => { w.half = e.target.checked; changed(); };
  $("wg-pitch").oninput = e => { w.pitch = +e.target.value; $("wg-pitch-o").textContent = w.pitch ? w.pitch + "°" : `as the house (${p.roofPitch}°)`; persist(); rebuild(false); };
  $("wg-pitch").onchange = () => changed();
  $("wingRemove").onclick = () => {
    p.wings = wings.filter(x => x.id !== w.id);
    p.windows = p.windows.filter(x => wingIdOf(x.wall) !== w.id);
    wSel = null; selId = null; changed(); toast(`${wingLabel(w)} removed`);
  };
}
/* ---------- Game objects ---------- */
// The game's boxes and icons and the pasture's fence (objects.mjs): a list in the Game objects section, and
// a plan view of the yard to drag them in (ob.on).
const ob = {on: false, sel: null, drag: null, pan: [0, 0], saved: null};
/** A box object's sliders: [key, label, step]. */
const BOX_SLIDERS = [["x", "Left / right (+ to the right)", 0.25], ["z", "Back / front (+ to the front)", 0.25], ["w", "Width (left to right)", 0.05],
  ["d", "Depth (back to front)", 0.05], ["h", "Height", 0.05], ["ix", "Icon left / right", 0.05], ["iz", "Icon back / front", 0.05]];
const objectsNow = () => p.objects || [];
const selObject = () => objectsNow().find(o => o.id === ob.sel) || null;
const objName = o => objectInfo(kindOf(p), o.type).name;
/** An edit to the objects: snapped, saved and built. */
function setObjects(list, sel = ob.sel) {
  p.objects = list; ob.sel = sel;
  const ruled = applyKindRules(); if (ruled) syncControls();
  persist(); rebuild(false); renderObjectsUI();
}
const snapObj = o => o.type === "pasture" ? snapPasture(o, kindOf(p), p) : snapBox(o, p);
function renderObjectsUI() {
  const ed = $("objectsEditor");
  if (!ed) return;
  const kind = kindOf(p), spec = kind.objects || {types: [], required: []}, list = objectsNow(), pr = objectProblems(p);
  if (!spec.types.length) { ed.innerHTML = `<p class="hint">This building has no game objects.</p>`; return; }
  if (!list.some(o => o.id === ob.sel)) ob.sel = null;
  const opt = (v, label, cur) => `<option value="${v}" ${v === cur ? "selected" : ""}>${esc(label)}</option>`;
  const missing = spec.types.filter(t => !list.some(o => o.type === t));
  let html = `<div class="row"><button type="button" class="primary" id="objPlan" ${renderer ? "" : "disabled"}>${ob.on ? "Done moving" : "Move them in the plan view"}</button></div>`;
  html += `<ul class="objlist">${list.map(o => `<li><button type="button" data-obj="${o.id}" aria-pressed="${o.id === ob.sel}">${esc(objName(o))}</button>${pr.has(o.id) ? ` <span class="warn">${esc(pr.get(o.id))}</span>` : ""}</li>`).join("")}</ul>`;
  if (missing.length) html += `<div class="addrow">${missing.map(t => `<button type="button" data-addobj="${t}">+ ${esc(objectInfo(kind, t).name)}</button>`).join("")}</div>`;
  const o = selObject();
  if (o) {
    const t = objectInfo(kind, o.type), must = spec.required.includes(o.type), range = (k, label, lo, hi, step, v, unit = " m") =>
      `<div class="field"><div class="fl"><label for="ob-${k}">${label}</label><output id="ob-${k}-o">${(+v).toFixed(2)}${unit}</output></div><input type="range" id="ob-${k}" data-k="${k}" min="${lo}" max="${hi}" step="${step}" value="${v}"></div>`;
    html += `<div class="wincard"><p class="hint">${esc(t.hint)}</p>${pr.has(o.id) ? `<p class="warn">${esc(pr.get(o.id))}.</p>` : ""}`;
    if (o.type === "pasture") {
      const pa = pastureOf(p), ps = spec.pasture;
      html += `<div class="field"><div class="fl"><label for="ob-wall">Wall</label></div><select id="ob-wall">${WALLS.map(k => opt(k, WALL_NAMES[k], o.wall)).join("")}</select></div>`;
      html += range("a", "Start, from the wall’s left end (0: the corner)", OBJECT_LIMITS.end[0], pa.L, 0.25, o.a);
      html += range("b", "End, from the wall’s right end (0: the corner)", OBJECT_LIMITS.end[0], pa.L, 0.25, o.b);
      html += range("depth", "Depth, out from the wall", ps.depth[0], ps.depth[1], 0.5, o.depth);
      html += `<p class="hint">At least ${ps.minWidth} m wide. Below 0 it runs past the corner and back along the wall to the building.</p>`;
    } else for (const [k, label, step] of BOX_SLIDERS) {
      if ((k === "ix" || k === "iz") && !t.icon) continue;
      const [lo, hi] = OBJECT_LIMITS[k];
      html += range(k, label, lo, hi, step, o[k]);
    }
    html += `<div class="row">${o.type !== "pasture" ? `<button type="button" id="objTurn">Turn</button>` : ""}<button type="button" id="objRemove" class="danger" ${must ? `disabled title="The ${esc(kind.name.toLowerCase())} needs it"` : ""}>Remove</button></div></div>`;
  } else html += `<p class="hint">Choose one to change it, or move them in the plan view.</p>`;
  html += `<button type="button" id="objAuto">Place all automatically</button>`;
  ed.innerHTML = html;
  $("objPlan").onclick = () => ob.on ? leaveObjects() : (setTab("finish"), enterObjects());
  ed.querySelectorAll("[data-obj]").forEach(b => b.onclick = () => { ob.sel = +b.dataset.obj; renderObjectsUI(); updatePlacesMarker(); });
  ed.querySelectorAll("[data-addobj]").forEach(b => b.onclick = () => {
    // a new one goes where the kind puts it to start with
    const t = b.dataset.addobj, def = spec.defaults({...p}).find(x => x.type === t), id = list.reduce((m, x) => Math.max(m, x.id), 0) + 1;
    setObjects(sanitize({...p, objects: [...list, {...(def || {type: t, x: p.width / 2 + 3, z: 0}), id}]}).objects, id);
    toast(`${objectInfo(kindOf(p), t).name} added`);
  });
  $("objAuto").onclick = () => { setObjects(sanitize({...p, objects: spec.defaults({...p})}).objects, null); toast("Game objects placed where they go automatically"); };
  if (!o) return;
  const swap = next => setObjects(sanitize({...p, objects: list.map(x => x.id === o.id ? next : x)}).objects, o.id);
  ed.querySelectorAll(".wincard input[type=range]").forEach(inp => {
    inp.oninput = () => {
      const k = inp.dataset.k, cur = selObject(), next = {...cur, [k]: +inp.value};
      p.objects = objectsNow().map(x => x.id === cur.id ? next : x);
      $(`ob-${k}-o`).textContent = `${(+inp.value).toFixed(2)} m`;
      applyKindRules(); rebuild(false);
    };
    inp.onchange = () => swap(snapObj(selObject()));
  });
  if ($("ob-wall")) $("ob-wall").onchange = e => swap(snapObj({...selObject(), wall: e.target.value}));
  if ($("objTurn")) $("objTurn").onclick = () => { const c = selObject(); swap(snapObj({...c, w: c.d, d: c.w, ix: -c.iz, iz: c.ix})); };
  $("objRemove").onclick = () => setObjects(list.filter(x => x.id !== o.id), null);
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
/** The pasture's handles: its two ends (the fence's sides) and its outer edge, [{k, at: [x, z]}]. */
function pastureHandles() {
  const pa = pastureOf(p);
  if (!pa) return [];
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
const ins = {on: false, view: "plan", sel: null, drag: null, hist: null, keep: false, pan: [0, 0]};
let ortho = null, ghost = null, marks = null, planLines = null;
const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
const activeCam = () => (ins.on && ins.view === "plan") || ob.on ? ortho : camera;
const roomNow = () => { const k = kindOf(p); return roomOf(p, k.openings ? k.openings(p) : []); };
const catalogNow = () => catalogFor(p);
const selected = () => (p.items || []).find(it => it.id === ins.sel) || null;

function enterInside() {
  if (!renderer || !kindOf(p).catalog) return;
  if (ob.on) leaveObjects();
  ins.on = true; ins.sel = null; ins.drag = null; ins.pan = [0, 0];
  ins.hist = new History(p.items || []);
  ins.saved = {...view, target: [...view.target]};
  placesObj.group.visible = false; yardObj.group.visible = false;
  // The shadow pass isn't clipped, so the roof would still shade the floor: no shadows while arranging.
  sunLight.castShadow = false;
  $("insideBar").hidden = false; $("orbitHint").textContent = "Drag a piece to move it · R turns · Delete removes";
  window.addEventListener("keydown", insideKey);
  setInsideView(ins.view);
  renderInsideUI();
}
function leaveInside() {
  if (!ins.on) return;
  ins.on = false; ins.drag = null; ins.sel = null;
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
  const cut3d = kindOf(p).ceiling ? p.floorHeight - 0.05 : Math.max(1.4, eaves - 0.12);
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
    $("insideArrange").onclick = () => { setTab("build"); enterInside(); };
  } else {
    const it = selected(), def = it && cat[it.type];
    const fmtP = (f, v) => (+v).toFixed(f.step >= 1 ? 0 : 1) + (f.unit || "");
    const entries = Object.entries(cat);
    // the user's own items, and those the admin shares with everyone (mine is false only for those)
    const mine = entries.filter(([, d]) => d.asset && d.asset.mine !== false), shared = entries.filter(([, d]) => d.asset && d.asset.mine === false);
    const addBtn = ([type, d]) => `<button type="button" data-add="${type}">+ ${esc(d.name)}</button>`;
    ed.innerHTML = `<p class="hint">Click a piece to add it, then drag it into place. Wall pieces go against the nearest wall.</p>`
      + `<div class="palette">${entries.filter(([, d]) => !d.asset && !d.missing).map(addBtn).join("")}</div>`
      + `<h4 class="palette-head">My items</h4>`
      + (mine.length ? `<div class="palette">${mine.map(addBtn).join("")}</div>` : `<p class="hint">Items you import from Giants Editor show here.</p>`)
      + (shared.length ? `<h4 class="palette-head">Shared items</h4><div class="palette">${shared.map(addBtn).join("")}</div>` : "")
      + `<p class="hint"><a href="/items" target="_blank" rel="noopener">Import an item…</a></p>`
      + (it ? `<div class="piece"><h4>${esc(def.name)}</h4>${def.missing ? `<p class="warn">This item isn’t in My items any more, so it’s left out. Remove it, or import it again.</p>` : ""}${pr.has(it.id) ? `<p class="warn">${pr.get(it.id)}.</p>` : ""}`
          + def.params.map(f => f.options
            // a choice (wallpaper, a doorway or not): a list
            ? `<div class="field"><div class="fl"><label for="pc-${f.k}">${f.label}</label></div><select id="pc-${f.k}" data-k="${f.k}">${f.options.map((nm, i) => `<option value="${i}" ${i === Math.round(it[f.k]) ? "selected" : ""}>${esc(nm)}</option>`).join("")}</select></div>`
            : `<div class="field"><div class="fl"><label for="pc-${f.k}">${f.label}</label><output id="pc-${f.k}-o">${fmtP(f, it[f.k])}</output></div><input type="range" id="pc-${f.k}" data-k="${f.k}" min="${f.min}" max="${f.max}" step="${f.step}" value="${it[f.k]}"></div>`).join("")
          + `<div class="row"><button type="button" id="pcTurn" ${def.mount === "wall" ? "disabled title=\"Wall pieces always face the room\"" : ""}>Turn</button><button type="button" id="pcRemove" class="danger">Remove</button></div></div>`
        : `<p class="hint">Click a piece in the building to change or move it.</p>`)
      + (pr.size ? `<p class="warn">${pr.size} piece${pr.size > 1 ? "s have" : " has"} a problem (red).</p>` : "")
      + fillRow;
    ed.querySelectorAll("[data-add]").forEach(b => b.onclick = () => addPiece(b.dataset.add));
    if (it) {
      $("pcTurn").onclick = turnSelected; $("pcRemove").onclick = removeSelected;
      ed.querySelectorAll("[data-k]").forEach(inp => {
        const f = def.params.find(x => x.k === inp.dataset.k);
        // While sliding, rebuild without redrawing this panel; remember the edit when the slider is let go.
        inp.oninput = () => {
          const cur = selected(), next = snapItem({...cur, [f.k]: +inp.value}, def, roomNow(), p.items, catalogNow());
          p.items = p.items.map(x => x.id === cur.id ? next : x);
          if ($(`pc-${f.k}-o`)) $(`pc-${f.k}-o`).textContent = fmtP(f, inp.value);
          ins.keep = true; rebuild(false); ins.keep = false;
        };
        inp.onchange = () => { ins.hist.push(p.items); persist(); rebuild(false); };
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
  const sel = $("winSel");
  if (!sel) return;
  for (const opt of sel.options) { if (!opt.value) continue; const w = p.windows.find(x => x.id === +opt.value); if (w) opt.textContent = winLabel(w); }
  const warn = $("winWarn"), s = p.windows.find(x => x.id === selId);
  if (warn && s) warn.hidden = !s._hidden;
}
function updateHighlight() {
  if (!selMesh) return;
  let found = null;
  for (const key in opsByWall) { const op = opsByWall[key].ops.find(o => o.id === selId); if (op) { found = {w: opsByWall[key].w, op}; break; } }
  selMesh.visible = !!found;
  if (found) {
    const {w, op} = found, c = WP(w, (op.s0 + op.s1) / 2, (op.t0 + op.t1) / 2, 0.07);
    selMesh.position.set(c[0], c[1], c[2]);
    selMesh.scale.set(op.s1 - op.s0 + 0.2, op.t1 - op.t0 + 0.2, 1);
    selMesh.rotation.set(0, Math.atan2(w.n[0], w.n[2]), 0);
  }
  needs = true;
}
function pick(e) {
  const r = canvas.getBoundingClientRect();
  const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  const rc = new THREE.Raycaster(); rc.setFromCamera(v, camera);
  const hit = rc.intersectObjects(MATS.map(m => meshes[m]))[0];
  if (!hit) return;
  const q = hit.point;
  for (const key in opsByWall) {
    const {w, ops} = opsByWall[key];
    const dx = q.x - w.o[0], dz = q.z - w.o[2], s = dx*w.u[0] + dz*w.u[2], d = dx*w.n[0] + dz*w.n[2], t = q.y - w.o[1];
    if (d < -0.3 || d > 0.2) continue;
    const op = ops.find(o => o.id && (o.kind === "window" || o.kind === "door") && s > o.s0 - 0.12 && s < o.s1 + 0.12 && t > o.t0 - 0.12 && t < o.t1 + 0.12);
    if (op) {
      selId = op.id;
      setTab("build");
      const det = $("winEditor").closest("details"); det.open = true;
      renderWinUI(); updateHighlight();
      if (!window.matchMedia("(max-width: 820px)").matches) $("winSel").scrollIntoView({block:"nearest"});
      return;
    }
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
  const GLYPHS = {sleep: ["#2f6fd0", drawBed], food: ["#d07a1f", drawFeed], bales: ["#c0901a", drawBale], hen: ["#3f9a43", drawHen], cow: ["#3f9a43", drawCow], sheep: ["#3f9a43", drawSheep], pallet: ["#c9a514", drawPallet]};
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
  const handles = [0, 1, 2].map(() => { const m = new THREE.Mesh(handleGeo, handleMat); m.visible = false; m.renderOrder = 11; group.add(m); return m; });
  const dispose = () => {
    boxGeo.dispose(); edgeGeo.dispose();
    handleGeo.dispose(); handleMat.dispose();
    Object.values(boxes).forEach(b => { b.mesh.material.dispose(); b.edges.material.dispose(); });
    Object.values(icons).forEach(s => s.material.dispose());
    Object.values(textures).forEach(t => t.dispose());
  };
  return {group, boxes, icons, handles, boxFor, iconFor, dispose};
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
  const hs = ob.on ? pastureHandles() : [];
  placesObj.handles.forEach((m, i) => { m.visible = !!hs[i]; if (hs[i]) m.position.set(hs[i].at[0], 0.05, hs[i].at[1]); });
  needs = true;
}
function drawBed(x) {
  x.fillRect(26, 40, 10, 54);            // headboard
  x.fillRect(26, 74, 78, 10);            // frame
  x.fillRect(96, 74, 8, 20);             // foot
  x.beginPath(); x.arc(50, 64, 9, 0, Math.PI * 2); x.fill();  // pillow / head
  x.fillRect(62, 56, 42, 16);            // blanket
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
  const dispose = () => { for (const m of [net, posts, wires]) { m.geometry.dispose(); m.material.dispose(); } };
  return {group, net, posts, wires, dispose};
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
  if (!yardObj.group.visible) return;
  const fence = kind.yard(geo, p).fence;
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
}
function rebuild(fit) {
  const geo = buildGeometry(p);
  ({G, dims, opsByWall} = geo);
  const wingsNow = geo.wings || [];
  let tris = 0;
  if (renderer) {
    MATS.forEach(m => {
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
    if (!ins.on) {
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
  MATS.forEach(m => tris += G[m].i.length / 3);
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
  for (const m of TEXTURED) {
    if (!G[m].i.length) continue;
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
/** The house as a game mod: FS25_Name.zip with modDesc, store XML, i3d, textures, icon and shop picture. */
async function exportMod(name) {
  const mod = modName(name);
  toast("Packing the game mod\u2026");
  try {
    const zip = new JSZip();
    zip.file("modDesc.xml", modDescXml(p, name, {author}));
    zip.file(MOD_FILES.xml, placeableXml(p, name));
    zip.file(MOD_FILES.i3d, buildI3d(p, {withTex: true}));
    await addTextures(zip);
    await addItems(zip);
    const store = renderStoreImage(512), icon = renderStoreImage(256);
    if (store) zip.file(MOD_FILES.store, await canvasBlob(store));
    if (icon) zip.file(MOD_FILES.icon, await canvasBlob(icon));
    saveFile(`${mod}.zip`, await zip.generateAsync({type: "blob"}), () => toast("The download didn\u2019t start. Try again or use another browser."));
  } catch (e) { toast("Couldn\u2019t pack the mod. Try again."); }
}
async function exportModel(name) {
  const slug = slugify(name);
  const plain = () => showText("house.i3d", buildI3d(p, {withTex: false}));
  toast("Packing the model and textures\u2026");
  try {
    const zip = new JSZip(), dir = zip.folder(slug);
    dir.file("house.i3d", buildI3d(p, {withTex: true}));
    dir.file("placeable_snippet.xml", placeableSnippet(p));
    await addTextures(dir);
    await addItems(dir);
    saveFile(`${slug}.zip`, await zip.generateAsync({type: "blob"}), plain);
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
  for (const m of MATS) { if (meshes[m]) meshes[m].geometry.dispose(); const mat = matObjs[m]; if (mat) { if (mat.map) mat.map.dispose(); if (mat.normalMap) mat.normalMap.dispose(); mat.dispose(); } }
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

return {getSettings: () => serialize(p), setSettings, exportModel, exportMod, exportSettings, importSettings, snapshot, toast, destroy};
}
