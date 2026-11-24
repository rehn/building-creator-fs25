// The mod's 3D plan (docs/PLAN_MOD.md step 3): the buildings and props of a mod on a ground, to look at and to move. Drag a thing to move it on the
// ground (it snaps to the grid and to the edges of the others, Alt held switches that off), drag the ground to turn the view, right-drag or Shift+drag
// to pan, scroll to zoom. three.js only; what to draw and how to snap come from modPlan.mjs, and the page keeps the posts (this view only draws them).
import * as THREE from "three";
import { snapPost } from "./modPlan.mjs";

const ACCENT = 0xd4553f;
/** The colour of a game object's box by its type (a type not listed gets the last one). */
const OBJECT_COLORS = {sleep: 0x3a7bd5, workshop: 0xc98a1a, counter: 0x2f8f6b, spawn: 0x2f8f6b, intake: 0xb8a02a, pump: 0xc4523a, palletcounter: 0x7b5fc9, palletspawn: 0x7b5fc9, unload: 0x7b5fc9};
const OBJECT_COLOR = type => OBJECT_COLORS[type] ?? 0x8a8f86;
const GRID = 0.25;

/**
 * Mounts a view on canvas. show(posts) draws posts [{id, x, z, rot, groups (modPlan.mjs), bounds, objects (its game objects: boxes {id, type, x, z, w, d, h}
 * in the post's own coordinates)}] again (a post whose groups are the same array as before keeps its meshes; only its place changes, and its game objects are
 * drawn again when that array changes) and select(id, objectId) marks a post and maybe one of its game objects. onSelect(id | null, objectId | null) is told what was
 * pressed on (null: the ground), onMove(id, {x, z}) while a post is dragged and onDrop(id, {x, z}) when it is let go where it was moved to, and onObjectMove(id, objectId,
 * {x, z}) and onObjectDrop(id, objectId, {x, z}) the same for a game object (dragged over the ground, on the grid, in its post's coordinates). dispose() frees everything.
 * @param {HTMLCanvasElement} canvas
 * @param {{onSelect?: (id: string | null, objectId: number | null) => void, onMove?: (id: string, at: {x: number, z: number}) => void, onDrop?: (id: string, at: {x: number, z: number}) => void, onObjectMove?: (id: string, objectId: number, at: {x: number, z: number}) => void, onObjectDrop?: (id: string, objectId: number, at: {x: number, z: number}) => void}} [handlers]
 */
export function createModView(canvas, {onSelect = () => {}, onMove = () => {}, onDrop = () => {}, onObjectMove = () => {}, onObjectDrop = () => {}} = {}) {
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
  let selected = null, selectedObject = null, raf = 0, fitted = false;

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
    for (const h of hits) {
      let o = h.object, objectId = null;
      while (o && o.userData.postId === undefined) { if (o.userData.objectId !== undefined) objectId = o.userData.objectId; o = o.parent; }
      if (o) return {id: o.userData.postId, objectId};
    }
    return null;
  };

  function render() {
    raf = 0;
    const w = canvas.clientWidth || 600, h = canvas.clientHeight || 400;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    const {theta, phi, dist, target} = look;
    camera.position.set(target.x + dist * Math.sin(phi) * Math.sin(theta), target.y + dist * Math.cos(phi), target.z + dist * Math.sin(phi) * Math.cos(theta));
    camera.lookAt(target);
    for (const o of objs.values()) {
      const mine = o.group.userData.postId === selected;
      o.box.visible = mine && selectedObject === null;
      for (const e of o.edges) e.material.color.setHex(mine && e.userData.objectId === selectedObject ? ACCENT : e.userData.color);
    }
    for (const o of objs.values()) if (o.box.visible) o.box.update();
    renderer.render(scene, camera);
  }
  const redraw = () => { if (!raf) raf = requestAnimationFrame(render); };

  function build(post) {
    const group = new THREE.Group(), body = new THREE.Group();
    group.userData.postId = post.id; group.add(body);
    for (const g of post.groups) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(g.positions, 3));
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({color: new THREE.Color(...g.color), roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide, transparent: g.alpha < 1, opacity: g.alpha, depthWrite: g.alpha >= 1});
      body.add(new THREE.Mesh(geo, mat));
    }
    scene.add(group);
    const box = new THREE.BoxHelper(body, ACCENT);   // (round the post's own meshes, not its game objects)
    box.visible = false; scene.add(box);
    const o = {group, body, src: post.groups, post, box, things: new THREE.Group(), edges: [], objectsSrc: null};
    group.add(o.things);
    return o;
  }
  /** The post's game objects as translucent boxes with an outline each, in the post's coordinates (a box stands on the ground: y from 0 to h). */
  function drawObjects(o, list) {
    for (const c of [...o.things.children]) { o.things.remove(c); c.traverse(m => { if (m.isMesh || m.isLineSegments) { m.geometry.dispose(); m.material.dispose(); } }); }
    o.edges = [];
    for (const ob of list || []) {
      const geo = new THREE.BoxGeometry(ob.w, ob.h, ob.d), color = OBJECT_COLOR(ob.type);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({color, transparent: true, opacity: 0.28, depthWrite: false}));
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({color}));
      edge.userData = {objectId: ob.id, color};
      const box = new THREE.Group();
      box.userData.objectId = ob.id; box.position.set(ob.x, ob.h / 2, ob.z);
      box.add(mesh, edge); o.things.add(box); o.edges.push(edge);
    }
    o.objectsSrc = list || null;
  }
  function dropObj(o) {
    scene.remove(o.group); scene.remove(o.box);
    o.group.traverse(m => { if (m.isMesh || m.isLineSegments) { m.geometry.dispose(); m.material.dispose(); } });
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
      if (o.objectsSrc !== (p.objects || null)) drawObjects(o, p.objects);
    }
    if (!fitted && objs.size) { fit(); fitted = true; }
    redraw();
  }
  /** @param {string | null} id @param {number | null} [objectId] */
  function select(id, objectId = null) { selected = id; selectedObject = objectId; redraw(); }

  // pointer: a press on a post selects it and drags it over the ground; a press on the ground turns the view; right button or Shift pans
  let drag = null;
  /** A ground point in a post's own coordinates (the post turned back by its turn): [x, z]. */
  const toLocal = (post, at) => {
    const a = post.rot * Math.PI / 180, dx = at.x - post.x, dz = at.z - post.z;
    return [dx * Math.cos(a) - dz * Math.sin(a), dx * Math.sin(a) + dz * Math.cos(a)];
  };
  const others = id => [...objs.values()].filter(o => o.group.userData.postId !== id).map(o => o.post);
  const down = e => {
    canvas.setPointerCapture(e.pointerId);
    if (e.button === 2 || e.shiftKey) { drag = {mode: "pan", x: e.clientX, y: e.clientY}; return; }
    const hit = pickPost(e);
    if (hit) {
      const {id, objectId} = hit, o = objs.get(id), at = groundAt(e);
      selected = id; selectedObject = objectId; onSelect(id, objectId); redraw();
      if (!at) drag = null;
      else if (objectId !== null) {
        const ob = (o.post.objects || []).find(x => x.id === objectId), local = toLocal(o.post, at);
        drag = ob ? {mode: "object", id, objectId, dx: local[0] - ob.x, dz: local[1] - ob.z, moved: false} : null;
      } else drag = {mode: "move", id, dx: at.x - o.post.x, dz: at.z - o.post.z, moved: false};
    } else drag = {mode: "orbit", x: e.clientX, y: e.clientY, moved: 0};
  };
  const move = e => {
    if (!drag) return;
    if (drag.mode === "object") {
      const at = groundAt(e), o = objs.get(drag.id);
      if (!at || !o) return;
      const [lx, lz] = toLocal(o.post, at), snap = v => (e.altKey ? Math.round(v * 100) / 100 : Math.round(v / GRID) * GRID) + 0;
      const x = snap(lx - drag.dx), z = snap(lz - drag.dz), ob = (o.post.objects || []).find(q => q.id === drag.objectId);
      if (!ob || (ob.x === x && ob.z === z)) return;
      const next = (o.post.objects || []).map(q => q.id === drag.objectId ? {...q, x, z} : q);
      o.post = {...o.post, objects: next}; drawObjects(o, next); drag.moved = true; onObjectMove(drag.id, drag.objectId, {x, z}); redraw();
    } else if (drag.mode === "move") {
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
    if (d.mode === "object" && d.moved) { const o = objs.get(d.id), ob = o && (o.post.objects || []).find(q => q.id === d.objectId); if (ob) onObjectDrop(d.id, d.objectId, {x: ob.x, z: ob.z}); }
    if (d.mode === "orbit" && d.moved < 4) { selected = null; selectedObject = null; onSelect(null, null); redraw(); }   // (a click on the ground)
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
