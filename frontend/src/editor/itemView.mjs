// A small 3D view of an imported item (the "My items" page): its .obj on a floor, turned as it will
// be placed, seen from the room. A wall piece shows the wall its back goes against.
import * as THREE from "three";
import { assetSize } from "./assets.mjs";
import { decodeDds, ddsReadable } from "./dds.mjs";

/**
 * A picture for an item: the DDS file's level small enough to be at most maxSize wide, as {width, height, data (RGBA, rows bottom first: v goes up)}, or
 * null when the file is not one decodeDds can read. Level 0 is the full size.
 */
export function ddsPicture(dds, maxSize = 256) {
  const bytes = dds instanceof Uint8Array ? dds : new Uint8Array(dds);
  if (!ddsReadable(bytes)) return null;
  const full = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(16, true);
  const d = decodeDds(bytes, Math.max(0, Math.ceil(Math.log2(Math.max(1, full / maxSize)))));
  const flipped = new Uint8Array(d.width * d.height * 4);
  for (let y = 0; y < d.height; y++) flipped.set(d.data.subarray(y * d.width * 4, (y + 1) * d.width * 4), (d.height - 1 - y) * d.width * 4);
  return {width: d.width, height: d.height, data: flipped};
}

/** Mounts a view on canvas. show(positions, meta) draws an item; dispose() frees it. */
export function createItemView(canvas, {size = null} = {}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true});
  renderer.setPixelRatio(size ? 1 : Math.min(window.devicePixelRatio || 1, 2));
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
  let mesh = null, texMat = null;

  function render() {
    const w = size ? size[0] : canvas.clientWidth || 300, h = size ? size[1] : canvas.clientHeight || 200;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }

  /** positions: the item's triangles (readObj); meta: its normalized meta (box, turn, mount); look: {uvs (readObj's), picture (ddsPicture)} to draw it with its picture. */
  function show(positions, meta, look = {}) {
    if (mesh) { mesh.geometry.dispose(); scene.remove(mesh); }
    if (texMat) { texMat.map.dispose(); texMat.dispose(); texMat = null; }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    if (look.picture && look.uvs && look.uvs.length === positions.length / 3 * 2) {
      g.setAttribute("uv", new THREE.Float32BufferAttribute(look.uvs, 2));
      const map = new THREE.DataTexture(look.picture.data, look.picture.width, look.picture.height, THREE.RGBAFormat);
      map.wrapS = map.wrapT = THREE.RepeatWrapping; map.minFilter = THREE.LinearMipmapLinearFilter; map.magFilter = THREE.LinearFilter; map.generateMipmaps = true; map.needsUpdate = true;
      texMat = new THREE.MeshStandardMaterial({map, roughness: 0.7, metalness: 0.1});
    }
    g.computeVertexNormals();
    const {min, max} = meta.box, c = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];
    g.translate(-c[0], -c[1], -c[2]);
    mesh = new THREE.Mesh(g, texMat || mat); mesh.rotation.y = meta.turn * Math.PI / 180; scene.add(mesh);
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
    mat.dispose(); if (texMat) { texMat.map.dispose(); texMat.dispose(); }
    renderer.dispose(); renderer.forceContextLoss();
  }
  return {show, render, dispose};
}

/** A small picture of an item for lists: a JPEG data: URL, the same view as the item page (positions: readObj's, meta: normalized). */
export function itemIcon(positions, meta, look = {}, width = 128, height = 96) {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const view = createItemView(canvas, {size: [width, height]});
  try { view.show(positions, meta, look); return canvas.toDataURL("image/jpeg", 0.8); } finally { view.dispose(); }
}
