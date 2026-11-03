// The house editor: controls, 3D preview and export, mounted into a DOM element.
// All model logic (settings, geometry, i3d) lives in model.mjs.
import * as THREE from "three";
import JSZip from "jszip";
import {
  SCHEMA, FIELD, WALLS, WALL_NAMES, DTYPES, DORM_DEF, MATS,
  genRow, sanitize, serialize, slugify, buildGeometry, buildI3d, placeableSnippet, sleepPoint, surfaceSpec, scaledUV, colorFor, WP
} from "./model.mjs";
import { GLASS_ALPHA, ROOM_OPTIONS, CURTAIN_OPTIONS, MOD_FILES, modName, modDescXml, placeableXml, defaultModDescription } from "./model.mjs";
import { paintInterior, paintGlass } from "./interior.mjs";
export { slugify };

const lerp = (a, b, t) => a + (b - a) * t;
const MARKUP = `<div class="hx-editor">
  <aside class="hx-panel"><div id="controls"></div></aside>
  <section class="hx-stage" id="stage" aria-label="3D preview">
    <canvas id="view"></canvas>
    <div class="readout" id="readout"></div>
    <div class="orbit-hint">Drag to orbit, scroll to zoom</div>
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

const controls = $("controls");
const inputs = {};
function fmt(f, v) {
  if (f.k === "doorPos") return v < -0.05 ? "Left" : v > 0.05 ? "Right" : "Center";
  if (f.cm) return (Math.round(v * 1000) / 10) + " cm";
  if (f.money) return Math.round(v).toLocaleString("en-US");
  const dec = f.step >= 1 ? 0 : f.step >= 0.1 ? 1 : 2;
  return (+v).toFixed(dec) + (f.unit || "");
}
SCHEMA.forEach(g => {
  const d = document.createElement("details");
  d.open = g.title !== "Colors";
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
      syncOutputs(); persist(); rebuild(false);
      if (["floors", "halfStorey", "roofType", "ridge", "interior", "curtainStyle", "curtainColor"].includes(f.k)) { renderWinUI(); renderDormUI(); }
    });
  });
  if (g.custom === "dormers") { const ed = document.createElement("div"); ed.id = "dormEditor"; d.appendChild(ed); }
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
  controls.appendChild(d);
});
function syncControls() {
  for (const k in inputs) {
    const f = FIELD[k], el = inputs[k];
    if (f.type === "check") el.checked = !!p[k]; else el.value = p[k];
  }
  syncOutputs();
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
  const strength = {lockpanel:10, horizontal:40, plaster:1.5, felt:1.2, tiles:60, metal:4.5, brick:3}[s.kind];
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
let renderer, scene, camera, groundMat, selMesh = null, sleepObj = null, meshes = {}, matObjs = {}, needs = true;

function initThree() {
  renderer = new THREE.WebGLRenderer({canvas, antialias:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 600);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7d8a72, 0.7));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
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
      : new THREE.MeshStandardMaterial(m === "glass" ? {roughness:0.12, metalness:0.4} : m === "gutter" ? {roughness:0.45, metalness:0.35} : m === "curtain" ? {roughness:0.95, metalness:0, vertexColors:true} : {roughness:0.85, metalness:0});
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), matObjs[m]);
    mesh.castShadow = !["glass", "interior", "curtain"].includes(m); mesh.receiveShadow = m !== "interior";
    meshes[m] = mesh; scene.add(mesh);
  });
  selMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({transparent:true, opacity:0.45, depthWrite:false, side:THREE.DoubleSide}));
  selMesh.visible = false; scene.add(selMesh);
  sleepObj = makeSleepMarker(); scene.add(sleepObj.group);
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
  needs = true;
}
function loop() { if (destroyed) return; if (needs) { renderer.render(scene, camera); needs = false; } raf = requestAnimationFrame(loop); }

const view = {theta:0.75, phi:1.15, r:26, target:[0,3,0]};
function updateCam() {
  const {theta, phi, r, target} = view;
  camera.position.set(target[0] + r*Math.sin(phi)*Math.sin(theta), target[1] + r*Math.cos(phi), target[2] + r*Math.sin(phi)*Math.cos(theta));
  camera.lookAt(target[0], target[1], target[2]);
  needs = true;
}
function setupOrbit() {
  const ptrs = new Map(); let pinch = 0, downAt = null;
  canvas.addEventListener("pointerdown", e => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); downAt = ptrs.size === 1 ? [e.clientX, e.clientY] : null; });
  canvas.addEventListener("pointerup", e => { if (downAt && ptrs.size === 1 && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 5) pick(e); downAt = null; });
  canvas.addEventListener("pointermove", e => {
    if (!ptrs.has(e.pointerId)) return;
    const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
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
  canvas.addEventListener("wheel", e => { e.preventDefault(); view.r = Math.min(120, Math.max(5, view.r * Math.exp(e.deltaY * 0.001))); updateCam(); }, {passive:false});
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
  for (const m of ["walls", "roof", "chimney"]) {
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
  const icon = new THREE.Sprite(new THREE.SpriteMaterial({map:tex, depthTest:false, transparent:true}));
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
        const mat = matObjs.glass, see = !!p.interior;
        if (mat.transparent !== see) { mat.transparent = see; mat.opacity = see ? GLASS_ALPHA : 1; mat.depthWrite = !see; mat.needsUpdate = true; }
        meshes.glass.renderOrder = see ? 2 : 0;
      }
      if (!surfaceSpec(p, m)) {
        const mat = matObjs[m];
        if (mat.map) { mat.map.dispose(); mat.map = null; mat.userData = {}; }
        if (mat.normalMap) { mat.normalMap.dispose(); mat.normalMap = null; }
        mat.color.set(m === "curtain" ? "#ffffff" : colorFor(p, m)); mat.needsUpdate = true;
      }
    });
    scheduleSurfaces();
    view.target = [0, dims.ridgeY * 0.45, 0];
    if (fit) view.r = Math.max(dims.W, dims.D, dims.ridgeY) * 2.3 + 6;
    updateCam();
    updateHighlight();
    updateSleepMarker(geo);
  }
  refreshWin(); refreshDorm();
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
  for (const m of ["walls", "roof", "chimney"]) {
    if (!G[m].i.length) continue;
    const st = ensureSurface(m); if (!st) continue;
    dir.file(`textures/${m}_diffuse.png`, await canvasBlob(st.diffuse));
    dir.file(`textures/${m}_normal.png`, await canvasBlob(st.base.normal));
  }
  if (p.interior) {
    dir.file("textures/interior_diffuse.png", await canvasBlob(interiorCanvas()));
    dir.file("textures/glass_diffuse.png", await canvasBlob(paintGlass(document)));
  }
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
    const hide = [groundObj, gridObj, selMesh, sleepObj && sleepObj.group].filter(Boolean), was = hide.map(o => o.visible);
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
  const wasVisible = selMesh.visible, sleepVisible = sleepObj.group.visible;
  selMesh.visible = false; sleepObj.group.visible = false;
  renderer.render(scene, camera);
  const src = renderer.domElement, W = 480, H = 300;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const k = Math.max(W / src.width, H / src.height), sw = W / k, sh = H / k;
  c.getContext("2d").drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, W, H);
  selMesh.visible = wasVisible; sleepObj.group.visible = sleepVisible; needs = true;
  return c.toDataURL("image/jpeg", 0.8);
}

function destroy() {
  destroyed = true;
  cancelAnimationFrame(raf);
  cleanups.forEach(f => f());
  for (const m of MATS) { if (meshes[m]) meshes[m].geometry.dispose(); const mat = matObjs[m]; if (mat) { if (mat.map) mat.map.dispose(); if (mat.normalMap) mat.normalMap.dispose(); mat.dispose(); } }
  if (sleepObj) sleepObj.dispose();
  if (interiorTex) interiorTex.dispose();
  if (renderer) renderer.dispose();
  root.innerHTML = "";
}

syncControls();
initThree();
rebuild(true);

return {getSettings: () => serialize(p), setSettings, exportModel, exportMod, exportSettings, importSettings, snapshot, toast, destroy};
}
