// The mod's 3D plan (docs/PLAN_MOD.md): the buildings and props of a mod, and the mod's game objects, on a ground, to look at and to move. Drag a building or prop to move it on the
// ground (it snaps to the grid and to the edges of the others), drag a game object the same way (on the grid), Alt held switches snapping off, drag the ground to turn the view,
// right-drag or Shift+drag to pan, scroll to zoom. three.js only; what to draw and how to snap come from modPlan.mjs, and the page keeps the posts and the objects (this view only draws them).
import * as THREE from "three";
import { snapPost, snapFencePost, feetOf, stretchCuts, mapKey } from "./modPlan.mjs";

const ACCENT = 0xd4553f;
/** The colour of a game object's box by its type (a type not listed gets the last one). */
const OBJECT_COLORS = {sleep: 0x3a7bd5, workshop: 0xc98a1a, counter: 0x2f8f6b, spawn: 0x2f8f6b, intake: 0xb8a02a, pump: 0xc4523a, palletcounter: 0x7b5fc9, palletspawn: 0x7b5fc9, unload: 0x7b5fc9, food: 0xb8a02a, loading: 0x2f8f6b, pallets: 0xc98a1a, info: 0x8a8f86, pasture: 0x6b8f3a, feedTrough: 0xc4a24a, waterTrough: 0x4a90c4};
const OBJECT_COLOR = type => OBJECT_COLORS[type] ?? 0x8a8f86;
const GRID = 0.25;

/**
 * Mounts a view on canvas. show(posts) draws posts [{id, x, z, y (the height above the ground, may be missing), rot, groups (modPlan.mjs), bounds}] again (a post whose groups are the same array as before keeps its meshes; only its
 * place changes), setMap(key, picture) gives the groups drawn with the map called key (modPlan.mjs mapKey) their picture {width, height, rgba} (they are drawn in their colour until it comes), showObjects(list) the mod's game objects (boxes {id, type, x, z, y (the height above the ground, may be missing), w, d, h} in the mod's coordinates) and select(postId, objectId) marks a building or prop
 * or a game object. onSelect(postId | null, objectId | null) is told what was pressed on (both null: the ground), onMove(id, {x, z}) while a post is dragged and onDrop(id, {x, z}) when it
 * is let go where it was moved to, and onObjectMove(objectId, {x, z}) and onObjectDrop(objectId, {x, z}) the same for a game object, onPointMove(objectId, i, {x, z}) and onPointDrop(objectId, i, {x, z}) for post i of a fence (an object
 * with points [[x, z] ...] and no box (a stretch the game would cut short and leave a hole in, modPlan.mjs stretchCuts, is drawn as an orange strip while it is dragged): drawn as a line round the posts, each post a thin pole to press on), onPointSelect(objectId, i) when a pole is pressed, and selectPoint(i) marks post i of the chosen fence (its pole is
 * bigger and in the accent colour, so it is clear which post the properties are about). A fence is drawn as the cow pasture's is: the first post green (where it starts), the last red (where it stops), and a pale dot
 * between each two posts that is pressed and dragged out to a new post (onPointInsert(objectId, i, at): after post i). dispose() frees everything.
 * @param {HTMLCanvasElement} canvas
 * @param {{onSelect?: (postId: string | null, objectId: number | null) => void, onMove?: (id: string, at: {x: number, z: number}) => void, onDrop?: (id: string, at: {x: number, z: number}) => void, onObjectMove?: (objectId: number, at: {x: number, z: number}) => void, onObjectDrop?: (objectId: number, at: {x: number, z: number}) => void, onPointMove?: (objectId: number, i: number, at: {x: number, z: number}) => void, onPointDrop?: (objectId: number, i: number, at: {x: number, z: number}) => void, onPointSelect?: (objectId: number, i: number) => void, onPointInsert?: (objectId: number, i: number, at: {x: number, z: number}) => void}} [handlers]
 */
export function createModView(canvas, {onSelect = () => {}, onMove = () => {}, onDrop = () => {}, onObjectMove = () => {}, onObjectDrop = () => {}, onPointMove = () => {}, onPointDrop = () => {}, onPointSelect = () => {}, onPointInsert = () => {}} = {}) {
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
  // the axes: X red (to the right), Y green (up), Z blue (towards the viewer, as the view starts) at the origin of the mod's ground, and a small orientation gizmo in the corner of the view
  const AXES = [["X", 0xd04040, [1, 0, 0]], ["Y", 0x3aa05a, [0, 1, 0]], ["Z", 0x3a6fd0, [0, 0, 1]]];
  const axisLabel = (text, color) => {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d"); g.font = "bold 44px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.lineWidth = 7; g.strokeStyle = "#fff"; g.strokeText(text, 32, 34); g.fillStyle = "#" + color.toString(16).padStart(6, "0"); g.fillText(text, 32, 34);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: new THREE.CanvasTexture(c), depthTest: false, transparent: true}));
    sp.renderOrder = 20; return sp;
  };
  const axesOf = (len, thick) => {
    const g = new THREE.Group();
    for (const [name, color, d] of AXES) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(thick, thick, len, 8), new THREE.MeshBasicMaterial({color, depthTest: false}));
      bar.renderOrder = 19; bar.position.set(d[0] * len / 2, d[1] * len / 2, d[2] * len / 2);
      if (d[0]) bar.rotation.z = -Math.PI / 2; else if (d[2]) bar.rotation.x = Math.PI / 2;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(thick * 2.6, thick * 7, 10), new THREE.MeshBasicMaterial({color, depthTest: false}));
      tip.renderOrder = 19; tip.position.set(d[0] * len, d[1] * len, d[2] * len); tip.rotation.copy(bar.rotation);
      if (d[0]) tip.rotation.z = -Math.PI / 2; if (d[2]) tip.rotation.x = Math.PI / 2;
      const label = axisLabel(name, color); label.position.set(d[0] * (len + thick * 12), d[1] * (len + thick * 12), d[2] * (len + thick * 12)); label.scale.set(len * 0.45, len * 0.45, 1);
      g.add(bar, tip, label);
    }
    return g;
  };
  const worldAxes = axesOf(3, 0.05); worldAxes.position.y = 0.04; scene.add(worldAxes);
  const gizmoScene = new THREE.Scene(), gizmoCam = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
  gizmoScene.add(axesOf(1, 0.045));
  let showAxes = true;
  const things = new THREE.Group(); scene.add(things);   // the game objects: one group for each, with its box and its outline
  let thingList = [];
  let selected = null, selectedObject = null, selectedPoint = -1, raf = 0, fitted = false;

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
      let o = h.object, point, mid;
      while (o && o.userData.postId === undefined && o.userData.objectId === undefined) { if (point === undefined && o.userData.point !== undefined) point = o.userData.point; if (mid === undefined && o.userData.mid !== undefined) mid = o.userData.mid; o = o.parent; }
      if (o) return o.userData.objectId !== undefined ? {objectId: o.userData.objectId, ...(point !== undefined ? {point} : {}), ...(mid !== undefined ? {mid} : {})} : {postId: o.userData.postId};
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
    for (const g of things.children) {
      g.userData.edge.material.color.setHex(g.userData.objectId === selectedObject ? ACCENT : g.userData.color);
      // (the chosen post of the chosen fence: bigger and in the accent colour)
      for (const pole of g.userData.poles || []) {
        const on = g.userData.objectId === selectedObject && pole.userData.point === selectedPoint;
        pole.material.color.setHex(on ? ACCENT : pole.userData.base ?? g.userData.color); pole.scale.set(on ? 1.8 : 1, on ? 1.5 : 1, on ? 1.8 : 1);
      }
    }
    worldAxes.visible = showAxes;
    renderer.render(scene, camera);
    if (showAxes) {   // the orientation gizmo: the axes seen from the same side as the view, in the corner
      const size = 92, pad = 10;
      gizmoCam.position.copy(camera.position).sub(target).setLength(4.2); gizmoCam.up.copy(camera.up); gizmoCam.lookAt(0, 0, 0);
      renderer.autoClear = false; renderer.clearDepth(); renderer.setScissorTest(true);
      renderer.setViewport(pad, pad, size, size); renderer.setScissor(pad, pad, size, size);
      renderer.render(gizmoScene, gizmoCam);
      renderer.setScissorTest(false); renderer.setViewport(0, 0, w, h); renderer.autoClear = true;
    }
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
    g.rotation.y = (ob.turn || 0) * Math.PI / 180;   // (round Y, about its middle, as a post turns)
    g.add(mesh, edge);
    return g;
  }
  /** A fence: a line round its posts on the ground and a pole at each (a pole is what a press picks, and what is dragged). */
  function fenceOf(ob) {
    const color = OBJECT_COLOR(ob.type), g = new THREE.Group(), pts = ob.points || [];
    g.userData = {objectId: ob.id, color, poles: []};
    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts.map(([x, z]) => new THREE.Vector3(x, 0.08, z))), new THREE.LineBasicMaterial({color}));
    g.userData.edge = line;
    g.add(line);
    // the stretches the game would cut short (a hole before the next post): an orange strip over each, worked out from the buildings as they stand now
    for (const {i} of pts.length > 1 ? stretchCuts(pts, feetOf([...objs.values()].map(o => o.post))) : []) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.4), new THREE.MeshBasicMaterial({color: 0xf08a1c, transparent: true, opacity: 0.85}));
      strip.position.set((ax + bx) / 2, 0.1, (az + bz) / 2); strip.rotation.y = -Math.atan2(bz - az, bx - ax);
      g.add(strip);
    }
    pts.forEach(([x, z], i) => {
      const base = i === 0 ? 0x2e9e4a : i === pts.length - 1 ? 0xd03030 : color;   // (where the fence starts and where it stops)
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.4, 8), new THREE.MeshBasicMaterial({color: base}));
      pole.position.set(x, 0.7, z); pole.userData.point = i; pole.userData.base = base;
      g.add(pole); g.userData.poles.push(pole);
      // a pale dot between this post and the next: pressed and dragged out it makes a new post
      if (i + 1 < pts.length) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshBasicMaterial({color: 0xf4f1d8, transparent: true, opacity: 0.9}));
        dot.position.set((x + pts[i + 1][0]) / 2, 0.45, (z + pts[i + 1][1]) / 2); dot.userData.mid = i;
        g.add(dot);
      }
    });
    return g;
  }
  function showObjects(list) {
    for (const c of [...things.children]) { things.remove(c); disposeTree(c); }
    thingList = list;
    for (const ob of list) things.add(Array.isArray(ob.points) ? fenceOf(ob) : boxOf(ob));
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

  /** A square picture (size px) of the middle of the view without the marks of what is chosen, as {width, height, rgba}: the icon and the shop picture of the game mod. Null if it cannot be had. */
  function picture(size) {
    try {
      const keep = [selected, selectedObject], keepAxes = showAxes;
      fit(); selected = null; selectedObject = null; showAxes = false;   // (a picture for the shop shows no axes)
      render();
      const c = document.createElement("canvas"); c.width = c.height = size;
      const side = Math.min(canvas.width, canvas.height), x = c.getContext("2d");
      x.fillStyle = "#e9ece4"; x.fillRect(0, 0, size, size);
      x.drawImage(canvas, (canvas.width - side) / 2, (canvas.height - side) / 2, side, side, 0, 0, size, size);
      [selected, selectedObject] = keep; showAxes = keepAxes; redraw();
      return {width: size, height: size, rgba: x.getImageData(0, 0, size, size).data};
    } catch { return null; }
  }

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
    if (thingList.some(q => Array.isArray(q.points))) showObjects(thingList);   // (the fence's orange strips depend on where the buildings stand)
    redraw();
  }
  /** @param {string | null} postId @param {number | null} [objectId] */
  function select(postId, objectId = null) { selected = postId; selectedObject = objectId; redraw(); }
  /** Marks post i of the chosen fence (-1: none). */
  function selectPoint(i) { selectedPoint = i; redraw(); }

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
      if (ob && Array.isArray(ob.points) && hit.mid !== undefined && at && ob.points.length < 40) {
        // a dot between two posts: a new post is made there at once and dragged
        const feet = feetOf([...objs.values()].map(o => o.post)), [x, z] = snapFencePost([at.x, at.z], feet, {grid: GRID});
        const points = [...ob.points.slice(0, hit.mid + 1), [x, z], ...ob.points.slice(hit.mid + 1)];
        thingList = thingList.map(q => q.id === ob.id ? {...q, points} : q);
        const g = things.children.find(c => c.userData.objectId === ob.id);
        if (g) { things.remove(g); disposeTree(g); }
        things.add(fenceOf({...ob, points}));
        selectedPoint = hit.mid + 1; onPointInsert(ob.id, hit.mid, {x, z}); onPointSelect(ob.id, hit.mid + 1);
        drag = {mode: "point", objectId: ob.id, i: hit.mid + 1, moved: true, at: {x, z}}; redraw();
      } else if (ob && Array.isArray(ob.points)) {
        if (hit.point !== undefined) { selectedPoint = hit.point; onPointSelect(ob.id, hit.point); redraw(); }
        drag = hit.point !== undefined && at ? {mode: "point", objectId: ob.id, i: hit.point, moved: false} : null;
      }   // (a fence: a pole is dragged, the rest of it only selected)
      else drag = at && ob ? {mode: "object", objectId: ob.id, dx: at.x - ob.x, dz: at.z - ob.z, moved: false} : null;
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
    } else if (drag.mode === "point") {
      const at = groundAt(e), ob = thingList.find(q => q.id === drag.objectId);
      if (!at || !ob || !ob.points[drag.i]) return;
      // (a post goes to a corner or a wall of a building or prop close by, never inside one; Alt: where it is)
      const feet = feetOf([...objs.values()].map(o => o.post));   // (the real walls of a building: post.feet)
      const [x, z] = snapFencePost([at.x, at.z], feet, {off: e.altKey, grid: GRID}), [px, pz] = ob.points[drag.i];
      if (px === x && pz === z) return;
      const points = ob.points.map((q, k) => k === drag.i ? [x, z] : q);
      thingList = thingList.map(q => q.id === ob.id ? {...q, points} : q);
      const g = things.children.find(c => c.userData.objectId === ob.id);
      if (g) { things.remove(g); disposeTree(g); }
      things.add(fenceOf({...ob, points}));
      drag.moved = true; drag.at = {x, z}; onPointMove(ob.id, drag.i, {x, z}); redraw();
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
    if (d.mode === "point" && d.moved && d.at) onPointDrop(d.objectId, d.i, d.at);
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
    show, showObjects, select, selectPoint, setMap, hasMap, picture, refit: () => { fit(); redraw(); },
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
