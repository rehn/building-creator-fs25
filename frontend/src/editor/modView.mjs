// The mod's 3D plan (docs/PLAN_MOD.md): the buildings and props of a mod, and the mod's game objects, on a ground, to look at and to move. Drag a building or prop to move it on the
// ground (it snaps to the grid and to the edges of the others), drag a game object the same way (on the grid), Alt held switches snapping off, drag the ground to turn the view,
// right-drag or Shift+drag to pan, scroll to zoom. three.js only; what to draw and how to snap come from modPlan.mjs, and the page keeps the posts and the objects (this view only draws them).
import * as THREE from "three";
import { snapPost, mapKey } from "./modPlan.mjs";

const ACCENT = 0xd4553f;
/** The colour of a game object's box by its type (a type not listed gets the last one). */
const OBJECT_COLORS = {sleep: 0x3a7bd5, workshop: 0xc98a1a, counter: 0x2f8f6b, spawn: 0x2f8f6b, intake: 0xb8a02a, pump: 0xc4523a, palletcounter: 0x7b5fc9, palletspawn: 0x7b5fc9, unload: 0x7b5fc9};
const OBJECT_COLOR = type => OBJECT_COLORS[type] ?? 0x8a8f86;
const GRID = 0.25;

/**
 * Mounts a view on canvas. show(posts) draws posts [{id, x, z, y (the height above the ground, may be missing), rot, groups (modPlan.mjs), bounds}] again (a post whose groups are the same array as before keeps its meshes; only its
 * place changes), setMap(key, picture) gives the groups drawn with the map called key (modPlan.mjs mapKey) their picture {width, height, rgba} (they are drawn in their colour until it comes), showObjects(list) the mod's game objects (boxes {id, type, x, z, y (the height above the ground, may be missing), w, d, h} in the mod's coordinates) and select(postId, objectId) marks a building or prop
 * or a game object. onSelect(postId | null, objectId | null) is told what was pressed on (both null: the ground), onMove(id, {x, z}) while a post is dragged and onDrop(id, {x, z}) when it
 * is let go where it was moved to, and onObjectMove(objectId, {x, z}) and onObjectDrop(objectId, {x, z}) the same for a game object. dispose() frees everything.
 * @param {HTMLCanvasElement} canvas
 * @param {{onSelect?: (postId: string | null, objectId: number | null) => void, onMove?: (id: string, at: {x: number, z: number}) => void, onDrop?: (id: string, at: {x: number, z: number}) => void, onObjectMove?: (objectId: number, at: {x: number, z: number}) => void, onObjectDrop?: (objectId: number, at: {x: number, z: number}) => void}} [handlers]
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
  const objs = new Map();   // post id -> {group, src (the groups array it was made from), post, box}
  const maps = new Map();   // map key -> THREE.DataTexture
  const things = new THREE.Group(); scene.add(things);   // the game objects: one group for each, with its box and its outline
  let thingList = [];
  let selected = null, selectedObject = null, raf = 0, fitted = false;

  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const aim = e => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  };
  const groundAt = e => { aim(e); const hit = new THREE.Vector3(); return ray.ray.intersectPlane(plane, hit) ? hit : null; };
  /** What is under the pointer, the nearest of the buildings and the game objects: {postId} or {objectId}, or null. */
  const pickAt = e => {
    aim(e);
    const hits = ray.intersectObjects([...[...objs.values()].map(o => o.group), things], true);
    for (const h of hits) {
      let o = h.object;
      while (o && o.userData.postId === undefined && o.userData.objectId === undefined) o = o.parent;
      if (o) return o.userData.objectId !== undefined ? {objectId: o.userData.objectId} : {postId: o.userData.postId};
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
    for (const o of objs.values()) { o.box.visible = o.group.userData.postId === selected; if (o.box.visible) o.box.update(); }
    for (const g of things.children) g.userData.edge.material.color.setHex(g.userData.objectId === selectedObject ? ACCENT : g.userData.color);
    renderer.render(scene, camera);
  }
  const redraw = () => { if (!raf) raf = requestAnimationFrame(render); };

  function build(post) {
    const group = new THREE.Group();
    group.userData.postId = post.id;
    for (const g of post.groups) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(g.positions, 3));
      if (g.uvs && g.uvs.length === g.positions.length / 3 * 2) geo.setAttribute("uv", new THREE.Float32BufferAttribute(g.uvs, 2));
      if (g.colors) geo.setAttribute("color", new THREE.Float32BufferAttribute(g.colors, 3));
      geo.computeVertexNormals();
      const key = g.map ? mapKey(g.map) : null, map = key ? maps.get(key) || null : null;
      const mat = new THREE.MeshStandardMaterial({color: map || g.colors ? 0xffffff : new THREE.Color(...g.color), map, vertexColors: !!g.colors, roughness: g.rough ?? 0.8, metalness: g.metal ?? 0.05,
        side: THREE.DoubleSide, transparent: g.alpha < 1, opacity: g.alpha, depthWrite: g.alpha >= 1});
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.mapKey = key;
      group.add(mesh);
    }
    scene.add(group);
    const box = new THREE.BoxHelper(group, ACCENT);
    box.visible = false; scene.add(box);
    return {group, src: post.groups, post, box};
  }
  const disposeTree = root => root.traverse(m => { if (m.isMesh || m.isLineSegments) { m.geometry.dispose(); m.material.dispose(); } });
  function dropObj(o) {
    scene.remove(o.group); scene.remove(o.box);
    disposeTree(o.group);
    o.box.geometry.dispose(); o.box.material.dispose();
  }
  const place = (o, p) => { o.group.position.set(p.x, p.y || 0, p.z); o.group.rotation.y = p.rot * Math.PI / 180; o.group.updateMatrixWorld(true); o.post = {...o.post, ...p}; };

  /** A game object as a translucent box with an outline, standing on the ground (y from 0 to h). */
  function boxOf(ob) {
    const geo = new THREE.BoxGeometry(ob.w, ob.h, ob.d), color = OBJECT_COLOR(ob.type);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({color, transparent: true, opacity: 0.28, depthWrite: false}));
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({color}));
    const g = new THREE.Group();
    g.userData = {objectId: ob.id, color, edge};
    g.position.set(ob.x, (ob.y || 0) + ob.h / 2, ob.z);
    g.add(mesh, edge);
    return g;
  }
  function showObjects(list) {
    for (const c of [...things.children]) { things.remove(c); disposeTree(c); }
    thingList = list;
    for (const ob of list) things.add(boxOf(ob));
    redraw();
  }

  /** A picture for the groups drawn with the map called key (RGBA, the top row first as a canvas has it): they get it at once, and the groups made later too. */
  function setMap(key, {width, height, rgba}) {
    const flipped = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) flipped.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), (height - 1 - y) * width * 4);   // (v goes up, a picture's first row is its top)
    const tex = new THREE.DataTexture(flipped, width, height, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); tex.needsUpdate = true;
    if (maps.has(key)) maps.get(key).dispose();
    maps.set(key, tex);
    for (const o of objs.values()) o.group.traverse(m => { if (m.isMesh && m.userData.mapKey === key) { m.material.map = tex; m.material.color.setHex(0xffffff); m.material.needsUpdate = true; } });
    redraw();
  }
  const hasMap = key => maps.has(key);

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
  /** @param {string | null} postId @param {number | null} [objectId] */
  function select(postId, objectId = null) { selected = postId; selectedObject = objectId; redraw(); }

  // pointer: a press on a building or a game object selects it and drags it over the ground; a press on the ground turns the view; right button or Shift pans
  let drag = null;
  const others = id => [...objs.values()].filter(o => o.group.userData.postId !== id).map(o => o.post);
  const down = e => {
    canvas.setPointerCapture(e.pointerId);
    if (e.button === 2 || e.shiftKey) { drag = {mode: "pan", x: e.clientX, y: e.clientY}; return; }
    const hit = pickAt(e), at = groundAt(e);
    if (hit && hit.objectId !== undefined) {
      const ob = thingList.find(q => q.id === hit.objectId);
      selected = null; selectedObject = hit.objectId; onSelect(null, hit.objectId); redraw();
      drag = at && ob ? {mode: "object", objectId: ob.id, dx: at.x - ob.x, dz: at.z - ob.z, moved: false} : null;
    } else if (hit) {
      const o = objs.get(hit.postId);
      selected = hit.postId; selectedObject = null; onSelect(hit.postId, null); redraw();
      drag = at && o ? {mode: "move", id: hit.postId, dx: at.x - o.post.x, dz: at.z - o.post.z, moved: false} : null;
    } else drag = {mode: "orbit", x: e.clientX, y: e.clientY, moved: 0};
  };
  const move = e => {
    if (!drag) return;
    if (drag.mode === "object") {
      const at = groundAt(e), ob = thingList.find(q => q.id === drag.objectId);
      if (!at || !ob) return;
      const snap = v => (e.altKey ? Math.round(v * 100) / 100 : Math.round(v / GRID) * GRID) + 0;
      const x = snap(at.x - drag.dx), z = snap(at.z - drag.dz);
      if (ob.x === x && ob.z === z) return;
      thingList = thingList.map(q => q.id === ob.id ? {...q, x, z} : q);
      const g = things.children.find(c => c.userData.objectId === ob.id);
      if (g) g.position.set(x, (ob.y || 0) + ob.h / 2, z);
      drag.moved = true; onObjectMove(ob.id, {x, z}); redraw();
    } else if (drag.mode === "move") {
      const at = groundAt(e), o = objs.get(drag.id);
      if (!at || !o) return;
      const p = snapPost({x: at.x - drag.dx, z: at.z - drag.dz, rot: o.post.rot, bounds: o.post.bounds}, others(drag.id), {off: e.altKey});
      if (p.x === o.post.x && p.z === o.post.z) return;
      place(o, {...o.post, ...p}); drag.moved = true; onMove(drag.id, p); redraw();   // (it keeps its height: only x and z are dragged)
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
    if (d.mode === "object" && d.moved) { const ob = thingList.find(q => q.id === d.objectId); if (ob) onObjectDrop(ob.id, {x: ob.x, z: ob.z}); }
    if (d.mode === "orbit" && d.moved < 4) { selected = null; selectedObject = null; onSelect(null, null); redraw(); }   // (a click on the ground)
  };
  const wheel = e => { e.preventDefault(); look.dist = Math.min(600, Math.max(3, look.dist * Math.exp(e.deltaY * 0.001))); redraw(); };
  const menu = e => e.preventDefault();
  canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", wheel, {passive: false}); canvas.addEventListener("contextmenu", menu);
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(redraw) : null;
  if (ro) ro.observe(canvas);

  return {
    show, showObjects, select, setMap, hasMap, refit: () => { fit(); redraw(); },
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", wheel); canvas.removeEventListener("contextmenu", menu);
      if (ro) ro.disconnect();
      for (const o of objs.values()) dropObj(o);
      objs.clear();
      for (const c of [...things.children]) { things.remove(c); disposeTree(c); }
      for (const t of maps.values()) t.dispose();
      ground.geometry.dispose(); ground.material.dispose(); grid.geometry.dispose(); grid.material.dispose(); renderer.dispose();
    },
  };
}
