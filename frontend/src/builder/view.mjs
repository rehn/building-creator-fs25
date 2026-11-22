// The modeller's 3D view (docs/PLAN_BUILDER.md): the parts on a ground grid, drag to turn, wheel to zoom, click a part to choose it.
// three.js only; it knows nothing about the house editor. The model comes from model.mjs (partMesh gives each part's mesh).
import * as THREE from "three";
import { partMesh } from "./model.mjs";

/** Mounts a view on canvas. show(model, selectedId) draws the parts; onPick(id | null) is told which one was clicked; dispose() frees it. */
export function createBuilderView(canvas, {onPick = () => {}} = {}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, preserveDrawingBuffer: true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe9ece4);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7d8a72, 0.8));
  const sun = new THREE.DirectionalLight(0xffffff, 0.7);
  sun.position.set(6, 10, 8); scene.add(sun);
  scene.add(new THREE.GridHelper(40, 40, 0x8a9484, 0xc4cabd));
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

  /** Draws the project; the chosen part gets an outline. Keeps the camera where it is. */
  function show(model, selectedId) {
    for (const m of meshes) { m.geometry.dispose(); m.material.dispose(); }
    group.clear(); meshes = [];
    for (const part of model.parts) {
      const g = partMesh(part), geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(g.p, 3));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(g.n, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(g.uv, 2));
      geo.setIndex(g.i);
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({color: part.color, roughness: 0.7, metalness: 0.1}));
      mesh.position.set(part.x, part.y, part.z); mesh.rotation.y = part.rotY * Math.PI / 180;
      mesh.userData.id = part.id;
      if (part.id === selectedId) {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({color: 0xe87722}));
        mesh.add(edges);
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
    onPick(hit ? hit.object.userData.id : null);
  };
  const wheel = e => { e.preventDefault(); look.dist = Math.min(200, Math.max(0.5, look.dist * Math.exp(e.deltaY * 0.001))); render(); };
  canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerup", up);
  canvas.addEventListener("wheel", wheel, {passive: false});
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(render) : null;
  if (ro) ro.observe(canvas);
  render();

  return {
    show, frame, snapshot: () => { try { render(); return canvas.toDataURL("image/jpeg", 0.8); } catch { return null; } },
    dispose() {
      canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("wheel", wheel); if (ro) ro.disconnect();
      for (const m of meshes) { m.geometry.dispose(); m.material.dispose(); }
      renderer.dispose();
    },
  };
}
