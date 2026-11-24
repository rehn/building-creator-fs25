// The mod's 3D plan (docs/PLAN_MOD.md step 3): the buildings and props of a mod on a ground, to look at and to move. Drag a thing to move it on the
// ground (it snaps to the grid and to the edges of the others, Alt held switches that off), drag the ground to turn the view, right-drag or Shift+drag
// to pan, scroll to zoom. three.js only; what to draw and how to snap come from modPlan.mjs, and the page keeps the posts (this view only draws them).
import * as THREE from "three";
import { snapPost } from "./modPlan.mjs";

const ACCENT = 0xd4553f;

/**
 * Mounts a view on canvas. show(posts) draws posts [{id, x, z, rot, groups (modPlan.mjs), bounds}] again (a post whose groups are the same array as
 * before keeps its meshes; only its place changes) and select(id) marks one. onSelect(id | null) is told which post was pressed on (null: the ground),
 * onMove(id, {x, z}) while one is dragged and onDrop(id, {x, z}) when it is let go where it was moved to. dispose() frees everything.
 * @param {HTMLCanvasElement} canvas
 * @param {{onSelect?: (id: string | null) => void, onMove?: (id: string, at: {x: number, z: number}) => void, onDrop?: (id: string, at: {x: number, z: number}) => void}} [handlers]
 */
export function createModView(canvas, {onSelect = () => {}, onMove = () => {}, onDrop = () => {}} = {}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe9ece4);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7d8a72, 0.8));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(40, 80, 30); scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({color: 0xa9b59c, roughness: 1}));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; scene.add(ground);
  const grid = new THREE.GridHelper(200, 200, 0x8a9484, 0x98a38b); scene.add(grid);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);
  const look = {theta: 0.6, phi: 0.95, dist: 40, target: new THREE.Vector3()};
  const objs = new Map();   // id -> {group, src (the groups array it was made from), post, box}
  let selected = null, raf = 0, fitted = false;

  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const groundAt = e => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    return ray.ray.intersectPlane(plane, hit) ? hit : null;
  };
  const pickPost = e => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects([...objs.values()].map(o => o.group), true);
    for (const h of hits) { let o = h.object; while (o && o.userData.postId === undefined) o = o.parent; if (o) return o.userData.postId; }
    return null;
  };

  function render() {
    raf = 0;
    const w = canvas.clientWidth || 600, h = canvas.clientHeight || 400;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    const {theta, phi, dist, target} = look;
    camera.position.set(target.x + dist * Math.sin(phi) * Math.sin(theta), target.y + dist * Math.cos(phi), target.z + dist * Math.sin(phi) * Math.cos(theta));
    camera.lookAt(target);
    for (const o of objs.values()) o.box.visible = o.group.userData.postId === selected;
    for (const o of objs.values()) if (o.box.visible) o.box.update();
    renderer.render(scene, camera);
  }
  const redraw = () => { if (!raf) raf = requestAnimationFrame(render); };

  function build(post) {
    const group = new THREE.Group();
    group.userData.postId = post.id;
    for (const g of post.groups) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(g.positions, 3));
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({color: new THREE.Color(...g.color), roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide, transparent: g.alpha < 1, opacity: g.alpha, depthWrite: g.alpha >= 1});
      group.add(new THREE.Mesh(geo, mat));
    }
    scene.add(group);
    const box = new THREE.BoxHelper(group, ACCENT);
    box.visible = false; scene.add(box);
    return {group, src: post.groups, post, box};
  }
  function dropObj(o) {
    scene.remove(o.group); scene.remove(o.box);
    o.group.traverse(m => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } });
    o.box.geometry.dispose(); o.box.material.dispose();
  }
  const place = (o, p) => { o.group.position.set(p.x, 0, p.z); o.group.rotation.y = p.rot * Math.PI / 180; o.group.updateMatrixWorld(true); o.post = {...o.post, ...p}; };

  function fit() {
    const b = new THREE.Box3();
    for (const o of objs.values()) b.expandByObject(o.group);
    if (b.isEmpty()) return;
    const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
    look.target.set(c.x, 0, c.z); look.dist = Math.min(500, Math.max(12, Math.max(s.x, s.z) * 1.6 + s.y));
  }

  function show(posts) {
    const ids = new Set(posts.map(p => p.id));
    for (const [id, o] of objs) if (!ids.has(id)) { dropObj(o); objs.delete(id); }
    for (const p of posts) {
      let o = objs.get(p.id);
      if (o && o.src !== p.groups) { dropObj(o); o = null; }
      if (!o) { o = build(p); objs.set(p.id, o); }
      place(o, p);
      o.post = p;
    }
    if (!fitted && objs.size) { fit(); fitted = true; }
    redraw();
  }
  function select(id) { selected = id; redraw(); }

  // pointer: a press on a post selects it and drags it over the ground; a press on the ground turns the view; right button or Shift pans
  let drag = null;
  const others = id => [...objs.values()].filter(o => o.group.userData.postId !== id).map(o => o.post);
  const down = e => {
    canvas.setPointerCapture(e.pointerId);
    if (e.button === 2 || e.shiftKey) { drag = {mode: "pan", x: e.clientX, y: e.clientY}; return; }
    const id = pickPost(e);
    if (id !== null) {
      const o = objs.get(id), at = groundAt(e);
      selected = id; onSelect(id); redraw();
      if (at) drag = {mode: "move", id, dx: at.x - o.post.x, dz: at.z - o.post.z, moved: false};
      else drag = null;
    } else drag = {mode: "orbit", x: e.clientX, y: e.clientY, moved: 0};
  };
  const move = e => {
    if (!drag) return;
    if (drag.mode === "move") {
      const at = groundAt(e), o = objs.get(drag.id);
      if (!at || !o) return;
      const p = snapPost({x: at.x - drag.dx, z: at.z - drag.dz, rot: o.post.rot, bounds: o.post.bounds}, others(drag.id), {off: e.altKey});
      if (p.x === o.post.x && p.z === o.post.z) return;
      place(o, {...o.post, ...p}); drag.moved = true; onMove(drag.id, p); redraw();
    } else if (drag.mode === "pan") {
      const k = look.dist * 0.0015, dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      look.target.x -= (Math.cos(look.theta) * dx + Math.sin(look.theta) * dy) * k;
      look.target.z -= (-Math.sin(look.theta) * dx + Math.cos(look.theta) * dy) * k;
      drag.x = e.clientX; drag.y = e.clientY; redraw();
    } else {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      look.theta -= dx * 0.008; look.phi = Math.min(1.5, Math.max(0.1, look.phi - dy * 0.008));
      drag.x = e.clientX; drag.y = e.clientY; redraw();
    }
  };
  const up = () => {
    const d = drag; drag = null;
    if (!d) return;
    if (d.mode === "move" && d.moved) { const o = objs.get(d.id); if (o) onDrop(d.id, {x: o.post.x, z: o.post.z}); }
    if (d.mode === "orbit" && d.moved < 4) { selected = null; onSelect(null); redraw(); }   // (a click on the ground)
  };
  const wheel = e => { e.preventDefault(); look.dist = Math.min(600, Math.max(3, look.dist * Math.exp(e.deltaY * 0.001))); redraw(); };
  const menu = e => e.preventDefault();
  canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", wheel, {passive: false}); canvas.addEventListener("contextmenu", menu);
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(redraw) : null;
  if (ro) ro.observe(canvas);

  return {
    show, select, refit: () => { fit(); redraw(); },
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", wheel); canvas.removeEventListener("contextmenu", menu);
      if (ro) ro.disconnect();
      for (const o of objs.values()) dropObj(o);
      objs.clear(); ground.geometry.dispose(); ground.material.dispose(); grid.geometry.dispose(); grid.material.dispose(); renderer.dispose();
    },
  };
}
