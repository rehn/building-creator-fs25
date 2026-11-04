// The house editor: controls, 3D preview and export, mounted into a DOM element.
// All model logic (settings, geometry, i3d) lives in model.mjs.
import * as THREE from "three";
import JSZip from "jszip";
import {
  SCHEMA, FIELD, WALLS, WALL_NAMES, DTYPES, DORM_DEF, MATS,
  genRow, sanitize, serialize, slugify, buildGeometry, buildI3d, placeableSnippet, sleepPoint, surfaceSpec, scaledUV, colorFor, WP
} from "./model.mjs";
import { GLASS_ALPHA, ROOM_OPTIONS, CURTAIN_OPTIONS, MOD_FILES, modName, modDescXml, placeableXml, defaultModDescription, henYard, henCap, seeThroughGlass, kindOf } from "./model.mjs";
import { roomOf, problems, footprint, snapItem, itemAt, placeNew, rotateItem, History } from "./layout.mjs";
import { paintInterior, paintGlass } from "./interior.mjs";
export { slugify };

const lerp = (a, b, t) => a + (b - a) * t;
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
 * Returns {getSettings, setSettings, exportModel, exportSettings, importSettings, snapshot, toast, destroy}.
 */
export function createEditor(root, {initial, onChange, author = ""} = {}) {
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
  if (f.k === "doorPos") return v < -0.05 ? "Left" : v > 0.05 ? "Right" : "Center";
  if (f.k === "hens") { const cap = henCap(p); return v > cap ? `${cap} (barn full)` : `${v} (room for ${cap})`; }
  if (f.cm) return (Math.round(v * 1000) / 10) + " cm";
  if (f.money) return Math.round(v).toLocaleString("en-US");
  const dec = f.step >= 1 ? 0 : f.step >= 0.1 ? 1 : 2;
  return (+v).toFixed(dec) + (f.unit || "");
}
// Sections shown only for some building kinds (g.kinds): hidden for the others.
const kindSections = [];
function syncKind() { for (const {g, d} of kindSections) d.hidden = !g.kinds.includes(p.kind); }
SCHEMA.forEach(g => {
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
      // Mod details don't change the house, so skip the rebuild.
      if (f.k.startsWith("mod")) { syncOutputs(); persist(); return; }
      if (f.k === "halfStorey" && v) p.windows = p.windows.filter(w => !(w.floor >= p.floors && !gableWall(w.wall)));
      // Keep the kind's rules (a hen house's pasture never on the door's wall, no more hens than
      // fit ...) and show any setting they changed, so the preview, controls and export agree.
      const ruled = applyKindRules();
      if (ruled) syncControls(); else syncOutputs();
      persist(); rebuild(false);
      if (["floors", "halfStorey", "roofType", "ridge", "interior", "curtainStyle", "curtainColor"].includes(f.k)) { renderWinUI(); renderDormUI(); }
    });
  });
  if (g.custom === "dormers") { const ed = document.createElement("div"); ed.id = "dormEditor"; d.appendChild(ed); }
  if (g.custom === "inside") { const ed = document.createElement("div"); ed.id = "insideEditor"; d.appendChild(ed); }
  if (g.custom === "windows") {
    const ed = document.createElement("div"); ed.id = "winEditor"; d.appendChild(ed);
    const sub = document.createElement("p"); sub.className = "sub"; sub.textContent = "Size for new windows"; d.appendChild(sub);
  }
  d.appendChild(wrap);
  if (g.custom === "windows") {
    const b = document.createElement("button"); b.type = "button"; b.className = "wide"; b.textContent = "Use this size for all windows";
    b.onclick = () => { p.windows.forEach(w => { w.w = p.winW; w.h = p.winH; w.sill = p.sill; }); persist(); rebuild(false); renderWinUI(); toast("All windows now use this size"); };
    d.appendChild(b);
  }
  $("controls-" + g.side).appendChild(d);
});
function syncControls() {
  for (const k in inputs) {
    const f = FIELD[k], el = inputs[k];
    if (f.type === "check") el.checked = !!p[k]; else el.value = p[k];
  }
  syncOutputs();
  syncKind();
  renderWinUI();
  renderDormUI();
}
function syncOutputs() {
  for (const k in inputs) {
    const f = FIELD[k];
    const o = $("f-" + k + "-o");
    if (o) o.textContent = fmt(f, p[k]);
  }
  inputs.ridge.disabled = p.roofType !== "gable";
  inputs.panelSpacing.disabled = p.wallCladding === "plaster";
  inputs.battenWidth.disabled = p.wallCladding !== "lockpanel";
  inputs.roofMaterial.disabled = p.roofType === "flat";
  inputs.chimneyStyle.disabled = !p.chimney;
  inputs.kneeWall.disabled = !p.halfStorey;
  inputs.gutters.disabled = p.roofType === "flat";
  inputs.downpipes.disabled = !p.gutters || p.roofType === "flat";
  inputs.entranceWidth.disabled = inputs.entranceDepth.disabled = p.entrance === "none";
  inputs.curtainStyle.disabled = inputs.curtainColor.disabled = !p.interior;
  inputs.modDescription.placeholder = defaultModDescription(p);
}

const TEX = 1024;
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

function genBase(s) {
  const N = TEX, H = new Float32Array(N*N), S = new Float32Array(N*N), Mk = s.kind === "brick" ? new Uint8Array(N*N) : null;
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
function compose(S, hex, Mk) {
  const c = document.createElement("canvas"); c.width = c.height = TEX;
  const ctx = c.getContext("2d"), img = ctx.createImageData(TEX, TEX), D = img.data;
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  for (let i = 0, j = 0; i < S.length; i++, j += 4) { const k = S[i], mo = Mk && Mk[i]; D[j] = Math.min(255, (mo ? 184 : r)*k); D[j+1] = Math.min(255, (mo ? 178 : g)*k); D[j+2] = Math.min(255, (mo ? 168 : b)*k); D[j+3] = 255; }
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
  if (st.color !== col) { st.color = col; st.diffuse = compose(st.base.S, col, st.base.Mk); st.dirty = true; }
  return st;
}

const canvas = $("view");
const stage = $("stage");
const readout = $("readout");
let interiorTex = null, interiorCv = null, groundObj = null, gridObj = null;
const interiorCanvas = () => interiorCv || (interiorCv = paintInterior(document));
let renderer, scene, camera, groundMat, selMesh = null, sleepObj = null, yardObj = null, meshes = {}, matObjs = {}, needs = true, sunLight = null;

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
      : new THREE.MeshStandardMaterial(m === "glass" ? {roughness:0.12, metalness:0.4} : m === "gutter" ? {roughness:0.45, metalness:0.35} : m === "curtain" || m === "fittings" ? {roughness:0.95, metalness:0, vertexColors:true} : {roughness:0.85, metalness:0});
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), matObjs[m]);
    mesh.castShadow = !["glass", "interior", "curtain"].includes(m); mesh.receiveShadow = m !== "interior";
    meshes[m] = mesh; scene.add(mesh);
  });
  selMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({transparent:true, opacity:0.45, depthWrite:false, side:THREE.DoubleSide}));
  selMesh.visible = false; scene.add(selMesh);
  sleepObj = makeSleepMarker(); scene.add(sleepObj.group);
  yardObj = makeYardMarker(); scene.add(yardObj.group);
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
    if (ins.drag) {
      const d = ins.drag; ins.drag = null;
      if (d.moved && (d.cand.x !== p.items.find(x => x.id === d.id).x || d.cand.z !== p.items.find(x => x.id === d.id).z)) commitItems(p.items.map(x => x.id === d.id ? d.cand : x));
      else updateInsideOverlay();
    } else if (click) {
      if (ins.on) { ins.sel = null; renderInsideUI(); updateInsideOverlay(); } else pick(e);
    }
    downAt = null;
  });
  canvas.addEventListener("pointermove", e => {
    if (!ptrs.has(e.pointerId)) return;
    const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ins.drag && ptrs.size === 1) {
      // Where the piece would land: snapped as it moves.
      const q = floorPoint(e);
      if (q) {
        const it = p.items.find(x => x.id === ins.drag.id);
        ins.drag.cand = snapItem({...it, x: q[0] - ins.drag.off[0], z: q[1] - ins.drag.off[1]}, catalogNow()[it.type], roomNow());
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
function applySurfaces() {
  if (!renderer || destroyed) return;
  for (const m of ["walls", "roof", "chimney", "trim"]) {
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
function gableWall(wall) { return p.roofType === "gable" && (p.ridge === "width" ? (wall === "left" || wall === "right") : (wall === "front" || wall === "back")); }
const wallLen = wall => (wall === "front" || wall === "back") ? p.width : p.depth;
function sortedWindows() {
  const order = {front:0, back:1, left:2, right:3};
  return p.windows.filter(w => w.floor < p.floors + (p.halfStorey ? 1 : 0)).sort((a, b) => order[a.wall] - order[b.wall] || a.floor - b.floor || a.pos - b.pos);
}
function winLabel(w) {
  const row = sortedWindows().filter(x => x.wall === w.wall && x.floor === w.floor);
  return `${WALL_NAMES[w.wall]}, ${floorName(w.floor).toLowerCase()}, window ${row.indexOf(w) + 1}` + (w._hidden ? " (hidden)" : "");
}
const WIN_FIELDS = [
  {k:"pos", label:"Position", min:0, max:1, step:0.005},
  {k:"w", label:"Width", min:0.3, max:3, step:0.05},
  {k:"h", label:"Height", min:0.3, max:2.4, step:0.05},
  {k:"sill", label:"Sill height", min:0, max:2, step:0.05}];
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
  const floors = p.floors + (p.halfStorey ? 1 : 0);
  let html = `<table class="wgrid"><thead><tr><th scope="col"><span class="sr">Wall</span></th>${Array.from({length: floors}, (_, f) => `<th scope="col">${floorName(f)}</th>`).join("")}</tr></thead><tbody>`;
  for (const wall of WALLS) {
    html += `<tr><th scope="row">${WALL_NAMES[wall]}</th>`;
    for (let f = 0; f < floors; f++) {
      if (f === p.floors && !gableWall(wall)) { html += `<td><span aria-label="No attic windows on this wall">\u2013</span></td>`; continue; }
      const n = p.windows.filter(w => w.wall === wall && w.floor === f).length, nm = `${WALL_NAMES[wall]}, ${floorName(f).toLowerCase()}`;
      html += `<td><div class="step"><button type="button" data-w="${wall}" data-f="${f}" data-d="-1" aria-label="Fewer windows: ${nm}" ${n ? "" : "disabled"}>\u2212</button><span>${n}</span><button type="button" data-w="${wall}" data-f="${f}" data-d="1" aria-label="More windows: ${nm}" ${n >= 8 ? "disabled" : ""}>+</button></div></td>`;
    }
    html += `</tr>`;
  }
  html += `</tbody></table>`;
  const list = sortedWindows();
  if (!list.some(w => w.id === selId)) selId = null;
  html += `<div class="field"><div class="fl"><label for="winSel">Edit a window</label></div><div class="selrow"><button type="button" id="winPrev" aria-label="Previous window">\u2039</button><select id="winSel"><option value="">Choose a window</option>${list.map(w => `<option value="${w.id}" ${w.id === selId ? "selected" : ""}>${winLabel(w)}</option>`).join("")}</select><button type="button" id="winNext" aria-label="Next window">\u203A</button></div></div>`;
  const s = list.find(w => w.id === selId);
  if (s) {
    html += `<div class="wincard"><p class="warn" id="winWarn" ${s._hidden ? "" : "hidden"}>This window overlaps the door or another window, so it\u2019s hidden. Move it or make it smaller.</p>`;
    for (const f of WIN_FIELDS) html += `<div class="field"><div class="fl"><label for="wf-${f.k}">${f.label}</label><output id="wf-${f.k}-o">${winOut(f, s)}</output></div><input type="range" id="wf-${f.k}" data-k="${f.k}" min="${f.min}" max="${f.max}" step="${f.step}" value="${s[f.k]}"></div>`;
    html += choiceFields("wc", s);
    html += `<button type="button" id="winRemove">Remove this window</button></div>`;
  }
  ed.innerHTML = html;
  ed.querySelectorAll(".step button").forEach(b => b.onclick = () => {
    const wall = b.dataset.w, f = +b.dataset.f;
    const n = p.windows.filter(w => w.wall === wall && w.floor === f).length + (+b.dataset.d);
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
      $(`wf-${inp.dataset.k}-o`).textContent = winOut(WIN_FIELDS.find(f => f.k === inp.dataset.k), s);
      persist(); rebuild(false);
    });
    bindChoices("wc", s);
    $("winRemove").onclick = () => { p.windows = p.windows.filter(w => w.id !== selId); selId = null; persist(); rebuild(false); renderWinUI(); };
  }
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
/* ---------- Arranging the inside ---------- */
// Interior mode: the building cut off at the top of its walls (a clipping plane), seen from straight
// above (Plan, an orthographic camera) or in 3D. Pieces are picked and dragged on the floor; the
// rules (snapping, problems, history) are in layout.mjs.
const ins = {on: false, view: "plan", sel: null, drag: null, hist: null, keep: false, pan: [0, 0]};
let ortho = null, ghost = null, marks = null, planLines = null;
const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
const activeCam = () => ins.on && ins.view === "plan" ? ortho : camera;
const roomNow = () => { const k = kindOf(p); return roomOf(p, k.openings ? k.openings(p) : []); };
const catalogNow = () => kindOf(p).catalog || {};
const selected = () => (p.items || []).find(it => it.id === ins.sel) || null;

function enterInside() {
  if (!renderer || !kindOf(p).catalog) return;
  ins.on = true; ins.sel = null; ins.drag = null; ins.pan = [0, 0];
  ins.hist = new History(p.items || []);
  ins.saved = {...view, target: [...view.target]};
  sleepObj.group.visible = false; yardObj.group.visible = false;
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
  clipPlane.constant = r.F + (v === "plan" ? 1.3 : Math.max(1.4, eaves - 0.12));
  renderer.clippingPlanes = [clipPlane];
  if (v === "3d") {
    view.target = [(r.x0 + r.x1) / 2, r.F + 0.4, (r.z0 + r.z1) / 2];
    view.r = Math.max(r.x1 - r.x0, r.z1 - r.z0) * 1.4 + 3; view.phi = Math.min(view.phi, 0.95);
    updateCam();
  } else fitOrtho();
  updateInsideOverlay();
}
/** The plan camera: straight down on the room (front of the building at the bottom), with pan and zoom. */
function fitOrtho() {
  const r = roomNow(), s = stage.getBoundingClientRect(), aspect = (s.width || 1) / (s.height || 1);
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
  const t = rotateItem(it, catalogNow()[it.type], roomNow());
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
  for (const r of [room, ...room.keepOut.map(k => k.rect)]) { const q = rect(r); for (let i = 0; i < q.length; i += 2) ln.push(q[i], y, q[i + 1]); }
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
  const cat = kind.catalog, items = p.items || [], pr = problems(items, cat, roomNow());
  const fillRow = `<div class="row"><button type="button" id="insideFill">Fill automatically</button><button type="button" id="insideClear" ${items.length ? "" : "disabled"}>Remove all</button></div>`;
  if (!ins.on) {
    const counts = new Map();
    for (const it of items) counts.set(it.type, (counts.get(it.type) || 0) + 1);
    const list = [...counts].map(([type, n]) => `<li>${cat[type].name}${n > 1 ? ` × ${n}` : ""}</li>`).join("");
    const out = [...pr.values()].filter(m => /outside/i.test(m)).length, other = pr.size - out;
    ed.innerHTML = (items.length ? `<ul class="pieces">${list}</ul>` : `<p class="hint">Nothing inside yet.</p>`)
      + (out ? `<p class="warn">${out} piece${out > 1 ? "s stick" : " sticks"} out through a wall and ${out > 1 ? "are" : "is"} left out. Make the building bigger, move ${out > 1 ? "them" : "it"} or fill it again.</p>` : "")
      + (other ? `<p class="warn">${other} piece${other > 1 ? "s overlap or block" : " overlaps or blocks"} something.</p>` : "")
      + `<div class="row"><button type="button" class="primary" id="insideArrange" ${renderer ? "" : "disabled"}>Arrange the inside</button></div>` + fillRow;
    $("insideArrange").onclick = () => { setTab("build"); enterInside(); };
  } else {
    const it = selected(), def = it && cat[it.type];
    const fmtP = (f, v) => (+v).toFixed(f.step >= 1 ? 0 : 1) + (f.unit || "");
    ed.innerHTML = `<p class="hint">Click a piece to add it, then drag it into place. Wall pieces go against the nearest wall.</p>`
      + `<div class="palette">${Object.entries(cat).map(([type, d]) => `<button type="button" data-add="${type}">+ ${d.name}</button>`).join("")}</div>`
      + (it ? `<div class="piece"><h4>${def.name}</h4>${pr.has(it.id) ? `<p class="warn">${pr.get(it.id)}.</p>` : ""}`
          + def.params.map(f => `<div class="field"><div class="fl"><label for="pc-${f.k}">${f.label}</label><output id="pc-${f.k}-o">${fmtP(f, it[f.k])}</output></div><input type="range" id="pc-${f.k}" data-k="${f.k}" min="${f.min}" max="${f.max}" step="${f.step}" value="${it[f.k]}"></div>`).join("")
          + `<div class="row"><button type="button" id="pcTurn" ${def.mount === "wall" ? "disabled title=\"Wall pieces always face the room\"" : ""}>Turn</button><button type="button" id="pcRemove" class="danger">Remove</button></div></div>`
        : `<p class="hint">Click a piece in the building to change or move it.</p>`)
      + (pr.size ? `<p class="warn">${pr.size} piece${pr.size > 1 ? "s have" : " has"} a problem (red).</p>` : "")
      + fillRow;
    ed.querySelectorAll("[data-add]").forEach(b => b.onclick = () => addPiece(b.dataset.add));
    if (it) {
      $("pcTurn").onclick = turnSelected; $("pcRemove").onclick = removeSelected;
      ed.querySelectorAll("input[data-k]").forEach(inp => {
        const f = def.params.find(x => x.k === inp.dataset.k);
        // While sliding, rebuild without redrawing this panel; remember the edit when the slider is let go.
        inp.oninput = () => {
          const cur = selected(), next = snapItem({...cur, [f.k]: +inp.value}, def, roomNow());
          p.items = p.items.map(x => x.id === cur.id ? next : x);
          $(`pc-${f.k}-o`).textContent = fmtP(f, inp.value);
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
    const op = ops.find(o => o.kind === "window" && s > o.s0 - 0.12 && s < o.s1 + 0.12 && t > o.t0 - 0.12 && t < o.t1 + 0.12);
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

/** Preview of the sleep point: the trigger as a faint box and the floating bed icon. */
function makeSleepMarker() {
  const group = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({color:0x3d7bd9, transparent:true, opacity:0.12, depthWrite:false}));
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const x = c.getContext("2d");
  x.fillStyle = "#2f6fd0"; x.beginPath(); x.arc(64, 64, 60, 0, Math.PI * 2); x.fill();
  x.fillStyle = "#fff";
  x.fillRect(26, 40, 10, 54);            // headboard
  x.fillRect(26, 74, 78, 10);            // frame
  x.fillRect(96, 74, 8, 20);             // foot
  x.beginPath(); x.arc(50, 64, 9, 0, Math.PI * 2); x.fill();  // pillow / head
  x.fillRect(62, 56, 42, 16);            // blanket
  const tex = new THREE.CanvasTexture(c);
  const icon = new THREE.Sprite(new THREE.SpriteMaterial({map:tex, transparent:true, depthWrite:false}));
  icon.scale.set(0.8, 0.8, 1); icon.renderOrder = 10;
  group.add(box, icon);
  const dispose = () => { box.geometry.dispose(); box.material.dispose(); tex.dispose(); icon.material.dispose(); };
  return {group, box, icon, dispose};
}
function updateSleepMarker(geo) {
  if (!sleepObj) return;
  sleepObj.group.visible = !!p.sleepPoint;
  if (!p.sleepPoint) return;
  const sp = sleepPoint(geo);
  sleepObj.box.position.set(...sp.trigger.center); sleepObj.box.scale.set(...sp.trigger.size);
  sleepObj.icon.position.set(sp.marker[0], sp.marker[1] + 1.3, sp.marker[2]);
}

/**
 * Preview of a chicken barn's yard: the starting fence as a see-through net, and faint boxes for
 * the feed (orange), egg pallet (yellow) and animal trailer (green) places.
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
  group.add(posts, wires);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const boxes = {};
  for (const [k, color] of [["food", 0xe08a2c], ["pallet", 0xe0c22c], ["loading", 0x4caf50]]) {
    boxes[k] = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({color, transparent:true, opacity:0.18, depthWrite:false}));
    group.add(boxes[k]);
  }
  group.add(net);
  // A floating icon over the middle of each place, like the bed icon of a sleep point.
  const icons = {};
  for (const [k, bg, glyph] of [["food", "#d07a1f", drawFeed], ["pallet", "#c9a514", drawPallet], ["loading", "#3f9a43", drawHen]]) {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const x = c.getContext("2d");
    x.fillStyle = bg; x.beginPath(); x.arc(64, 64, 60, 0, Math.PI * 2); x.fill();
    x.fillStyle = x.strokeStyle = "#fff"; x.lineWidth = 6; x.lineCap = x.lineJoin = "round";
    glyph(x);
    const tex = new THREE.CanvasTexture(c);
    icons[k] = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, transparent: true, depthWrite: false}));
    icons[k].scale.set(0.9, 0.9, 1); icons[k].renderOrder = 10;
    group.add(icons[k]);
  }
  const dispose = () => {
    for (const m of [net, posts, wires]) { m.geometry.dispose(); m.material.dispose(); }
    boxGeo.dispose(); Object.values(boxes).forEach(b => b.material.dispose());
    Object.values(icons).forEach(s => { s.material.map.dispose(); s.material.dispose(); });
  };
  return {group, net, posts, wires, boxes, icons, dispose};
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
  yardObj.group.visible = p.kind === "chicken";
  if (!yardObj.group.visible) return;
  const y = henYard(geo, p), h = 1.1, pos = [], wire = [], postAt = [];
  for (let i = 0; i + 1 < y.fence.length; i++) {
    const a = y.fence[i], b = y.fence[i + 1];
    pos.push(a[0], 0, a[2], b[0], 0, b[2], b[0], h, b[2], a[0], 0, a[2], b[0], h, b[2], a[0], h, a[2]);
    for (const t of [0.05, h]) wire.push(a[0], t, a[2], b[0], t, b[2]);
    // a post at each corner and at most 2 m apart in between
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 2));
    for (let k = 0; k < n; k++) postAt.push([a[0] + (b[0] - a[0]) * k / n, 0, a[2] + (b[2] - a[2]) * k / n]);
  }
  postAt.push(y.fence[y.fence.length - 1]);
  const set = (mesh, g) => { mesh.geometry.dispose(); mesh.geometry = g; };
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  set(yardObj.net, g);
  const wg = new THREE.BufferGeometry();
  wg.setAttribute("position", new THREE.Float32BufferAttribute(wire, 3));
  set(yardObj.wires, wg);
  set(yardObj.posts, postsGeometry(postAt, h + 0.1));
  for (const [k, b] of [["food", y.food], ["pallet", y.pallet.trigger], ["loading", y.loading]]) {
    yardObj.boxes[k].position.set(...b.center); yardObj.boxes[k].scale.set(...b.size);
    // the icon floats over the middle of the place, above head height
    yardObj.icons[k].position.set(b.center[0], Math.max(b.size[1], 1.6) + 0.6, b.center[2]);
  }
}
function rebuild(fit) {
  const geo = buildGeometry(p);
  ({G, dims, opsByWall} = geo);
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
    scheduleSurfaces();
    if (!ins.on) {
      view.target = [0, dims.ridgeY * 0.45, 0];
      if (fit) view.r = Math.max(dims.W, dims.D, dims.ridgeY) * 2.3 + 6;
      updateCam();
      updateHighlight();
      updateSleepMarker(geo);
      updateYardMarker(geo);
    }
    updateInsideOverlay();
  }
  refreshWin(); refreshDorm(); renderInsideUI();
  MATS.forEach(m => tris += G[m].i.length / 3);
  readout.innerHTML = `<span><b>${dims.W.toFixed(1)} \u00D7 ${dims.D.toFixed(1)} m</b> footprint</span><span><b>${dims.ridgeY.toFixed(1)} m</b> to the top</span><span><b>${tris.toLocaleString()}</b> triangles</span>`;
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
  for (const m of ["walls", "roof", "chimney", "trim"]) {
    if (!G[m].i.length) continue;
    const st = ensureSurface(m); if (!st) continue;
    dir.file(`textures/${m}_diffuse.png`, await canvasBlob(st.diffuse));
    dir.file(`textures/${m}_normal.png`, await canvasBlob(st.base.normal));
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
    const hide = [groundObj, gridObj, selMesh, sleepObj && sleepObj.group, yardObj && yardObj.group].filter(Boolean), was = hide.map(o => o.visible);
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
    saveFile(`${slug}.zip`, await zip.generateAsync({type: "blob"}), plain);
  } catch (e) { plain(); }
}
function exportSettings(name) { saveFile(`${slugify(name)}-settings.json`, JSON.stringify(serialize(p), null, 2)); }
async function importSettings(file) {
  try { setSettings(JSON.parse(await file.text())); persist(); toast("Settings loaded"); return true; }
  catch (e) { toast("That file isn\u2019t a settings file from this app."); return false; }
}
function setSettings(obj) { p = sanitize(obj); selId = null; dSel = null; syncControls(); rebuild(true); }

/** A small JPEG of the current view, for the project list. */
function snapshot() {
  if (!renderer) return null;
  // The project list's picture is always the whole building, even while arranging the inside.
  const wasVisible = selMesh.visible, sleepVisible = sleepObj.group.visible, yardVisible = yardObj.group.visible;
  const over = [ghost, marks, planLines].map(o => o.visible), clip = renderer.clippingPlanes;
  selMesh.visible = false; sleepObj.group.visible = false; yardObj.group.visible = false;
  [ghost, marks, planLines].forEach(o => o.visible = false); renderer.clippingPlanes = [];
  renderer.render(scene, camera);
  [ghost, marks, planLines].forEach((o, i) => o.visible = over[i]); renderer.clippingPlanes = clip;
  const src = renderer.domElement, W = 480, H = 300;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const k = Math.max(W / src.width, H / src.height), sw = W / k, sh = H / k;
  c.getContext("2d").drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, W, H);
  selMesh.visible = wasVisible; sleepObj.group.visible = sleepVisible; yardObj.group.visible = yardVisible; needs = true;
  return c.toDataURL("image/jpeg", 0.8);
}

function destroy() {
  destroyed = true;
  cancelAnimationFrame(raf);
  cleanups.forEach(f => f());
  for (const m of MATS) { if (meshes[m]) meshes[m].geometry.dispose(); const mat = matObjs[m]; if (mat) { if (mat.map) mat.map.dispose(); if (mat.normalMap) mat.normalMap.dispose(); mat.dispose(); } }
  if (sleepObj) sleepObj.dispose();
  if (yardObj) yardObj.dispose();
  if (interiorTex) interiorTex.dispose();
  if (renderer) renderer.dispose();
  root.innerHTML = "";
}

syncControls();
initThree();
rebuild(true);

return {getSettings: () => serialize(p), setSettings, exportModel, exportMod, exportSettings, importSettings, snapshot, toast, destroy};
}
