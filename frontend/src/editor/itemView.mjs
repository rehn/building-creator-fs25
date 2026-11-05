// A small 3D view of an imported item (the "My items" page): its .obj on a floor, turned as it will
// be placed, seen from the room. A wall piece shows the wall its back goes against.
import * as THREE from "three";
import { assetSize } from "./assets.mjs";

/** Mounts a view on canvas. show(positions, meta) draws an item; dispose() frees it. */
export function createItemView(canvas) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe9ece4);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7d8a72, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 0.75);
  sun.position.set(3, 6, 5); scene.add(sun);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 200);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({color: 0xcfd3c6, roughness: 1}));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({color: 0xb9a99a, roughness: 1}));
  scene.add(wall);
  const mat = new THREE.MeshStandardMaterial({color: 0x9aa3a8, roughness: 0.7, metalness: 0.15});
  let mesh = null;

  function render() {
    const w = canvas.clientWidth || 300, h = canvas.clientHeight || 200;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }

  /** positions: the item's triangles (readObj); meta: its normalized meta (box, turn, mount). */
  function show(positions, meta) {
    if (mesh) { mesh.geometry.dispose(); scene.remove(mesh); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.computeVertexNormals();
    const {min, max} = meta.box, c = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];
    g.translate(-c[0], -c[1], -c[2]);
    mesh = new THREE.Mesh(g, mat); mesh.rotation.y = meta.turn * Math.PI / 180; scene.add(mesh);
    const [w, d, h] = assetSize(meta), r = Math.max(w, d, h, 0.3);
    floor.scale.set(r * 3, r * 3, 1);
    // A wall piece: a slice of wall behind it (its back, -z, goes against the wall).
    wall.visible = meta.mount === "wall";
    wall.scale.set(Math.max(w + 0.4, r * 1.6), Math.max(h + 0.3, r), 0.12);
    wall.position.set(0, wall.scale.y / 2, -d / 2 - 0.06);
    // From the room, a little to the side and above.
    camera.position.set(r * 1.3, r * 1.1 + h / 2, r * 2.3);
    camera.lookAt(0, h / 2, 0);
    render();
  }

  function dispose() {
    if (mesh) mesh.geometry.dispose();
    [floor, wall].forEach(o => { o.geometry.dispose(); o.material.dispose(); });
    mat.dispose(); renderer.dispose();
  }
  return {show, render, dispose};
}
