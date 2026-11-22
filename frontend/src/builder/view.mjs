// The modeller's 3D view (docs/PLAN_BUILDER.md): the parts on a ground grid, drag to turn, wheel to zoom, click a part to choose it.
// three.js only; it knows nothing about the house editor. The model comes from model.mjs (partMesh gives each part's mesh).
import * as THREE from "three";
import { partMesh, faceOfTriangle, faceColor } from "./model.mjs";

/** Mounts a view on canvas. show(model, selectedId, selectedFace) draws the parts; onPick(id | null, faceId | null) is told which part and face was clicked; dispose() frees it. */
export function createBuilderView(canvas, {onPick = () => {}} = {}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, preserveDrawingBuffer: true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe9ece4);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7d8a72, 0.8));
  const sun = new THREE.DirectionalLight(0xffffff, 0.7);
  sun.position.set(6, 10, 8); scene.add(sun);
  scene.add(new THREE.GridHelper(40, 40, 0x8a9484, 0xc4cabd));
  // the axes: x red, y green (up), z blue, with a letter at each tip
  scene.add(new THREE.AxesHelper(2));
  for (const [text, color, pos] of [["X", "#d33", [2.35, 0, 0]], ["Y", "#2a2", [0, 2.35, 0]], ["Z", "#33d", [0, 0, 2.35]]]) {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const x = c.getContext("2d"); x.fillStyle = color; x.font = "bold 52px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(text, 32, 34);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({map: new THREE.CanvasTexture(c), depthTest: false, transparent: true}));
    label.position.set(...pos); label.scale.set(0.5, 0.5, 1); scene.add(label);
  }
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 500);
  const group = new THREE.Group(); scene.add(group);
  const look = {theta: 0.7, phi: 1.05, dist: 9, target: new THREE.Vector3(0, 1, 0)};
  let meshes = [];

  function place() {
    const s = Math.sin(look.phi), p = new THREE.Vector3(Math.sin(look.theta) * s, Math.cos(look.phi), Math.cos(look.theta) * s).multiplyScalar(look.dist);
    camera.position.copy(look.target).add(p); camera.lookAt(look.target);
  }
  function render() {
    const w = canvas.clientWidth || 600, h = canvas.clientHeight || 400;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    place(); renderer.render(scene, camera);
  }

  /** Draws the project (each face in its own colour); the chosen part gets an outline, the chosen face an orange tint. Keeps the camera where it is. */
  function show(model, selectedId, selectedFace = null) {
    for (const m of meshes) { m.geometry.dispose(); m.material.dispose(); }
    group.clear(); meshes = [];
    for (const part of model.parts) {
      const g = partMesh(part), geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(g.p, 3));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(g.n, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(g.uv, 2));
      geo.setIndex(g.i);
      geo.translate(0, -part.h / 2, 0);   // (a part turns about its middle, which is where the mesh is placed)
      // a colour per vertex from the face it is on (no vertex is shared between faces)
      const face = faceOfTriangle(part), colors = new Float32Array(g.p.length);
      face.forEach((f, t) => { const c = new THREE.Color(faceColor(model, part, f)); for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], g.i[t * 3 + k] * 3); });
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.7, metalness: 0.1}));
      mesh.userData.faces = face;
      mesh.position.set(part.x, part.y + part.h / 2, part.z);
      const rad = d => d * Math.PI / 180;
      mesh.rotation.set(rad(part.rotX), rad(part.rotY), rad(part.rotZ), "YXZ");   // = Ry * Rx * Rz, as turnMatrix in model.mjs
      mesh.userData.id = part.id;
      if (part.id === selectedId) {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({color: 0xe87722}));
        mesh.add(edges);
      }
      if (part.id === selectedId && selectedFace) {
        const idx = []; face.forEach((f, t) => { if (f === selectedFace) idx.push(g.i[t * 3], g.i[t * 3 + 1], g.i[t * 3 + 2]); });
        const tint = new THREE.BufferGeometry();
        tint.setAttribute("position", geo.getAttribute("position")); tint.setIndex(idx);
        const over = new THREE.Mesh(tint, new THREE.MeshBasicMaterial({color: 0xe87722, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2}));
        over.raycast = () => {};   // (a click goes to the face under it, not to the tint)
        mesh.add(over);
      }
      group.add(mesh); meshes.push(mesh);
    }
    render();
  }

  /** Looks at everything: the camera is put back so the whole project is in view. */
  function frame(model) {
    const box = new THREE.Box3();
    for (const m of group.children) { m.updateMatrixWorld(true); box.expandByObject(m); }
    if (!model.parts.length || box.isEmpty()) { look.target.set(0, 1, 0); look.dist = 9; render(); return; }
    box.getCenter(look.target);
    look.dist = Math.max(3, box.getSize(new THREE.Vector3()).length() * 1.4);
    render();
  }

  // orbit: drag; zoom: wheel; a press that hardly moves is a click
  let drag = null;
  const down = e => { canvas.setPointerCapture(e.pointerId); drag = {x: e.clientX, y: e.clientY, moved: 0}; };
  const move = e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
    look.theta -= dx * 0.008; look.phi = Math.min(Math.PI - 0.05, Math.max(0.05, look.phi - dy * 0.008));
    render();
  };
  const up = e => {
    if (!drag) return;
    const click = drag.moved < 4; drag = null;
    if (!click) return;
    const r = canvas.getBoundingClientRect(), ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(meshes, false)[0];
    onPick(hit ? hit.object.userData.id : null, hit ? hit.object.userData.faces[hit.faceIndex] ?? null : null);
  };
  const wheel = e => { e.preventDefault(); look.dist = Math.min(200, Math.max(0.5, look.dist * Math.exp(e.deltaY * 0.001))); render(); };
  canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerup", up);
  canvas.addEventListener("wheel", wheel, {passive: false});
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(render) : null;
  if (ro) ro.observe(canvas);
  render();

  return {
    // A small picture for the project list (the server refuses a data URL over 300 KB, which a full-size canvas on a big or retina window is).
    show, frame, snapshot: () => {
      try {
        render();
        const W = 480, H = 300, c = document.createElement("canvas"); c.width = W; c.height = H;
        const k = Math.max(W / canvas.width, H / canvas.height), sw = W / k, sh = H / k;
        c.getContext("2d").drawImage(canvas, (canvas.width - sw) / 2, (canvas.height - sh) / 2, sw, sh, 0, 0, W, H);
        return c.toDataURL("image/jpeg", 0.8);
      } catch { return null; }
    },
    dispose() {
      canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("wheel", wheel); if (ro) ro.disconnect();
      for (const m of meshes) { m.geometry.dispose(); m.material.dispose(); }
      renderer.dispose();
    },
  };
}
