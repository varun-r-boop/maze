// The fight arena in 3D: a plain white room, softly lit, with a low white barrier round the fighting area.
import * as THREE from 'three';
import { floorTiles } from './fightfx.js';

const Sh = window.Shared;
const { COLS, ROWS } = Sh.C;

export function buildArena(scene, G) {
  const A = G.arena, g = G.grid;
  const white = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }), wall = new THREE.MeshStandardMaterial({ color: '#f4f4f2', roughness: 0.95 });
  const edge = new THREE.MeshStandardMaterial({ color: '#d6d8dd', roughness: 0.8 });
  scene.background = new THREE.Color('#f2f2f0');
  scene.fog = new THREE.Fog('#f2f2f0', 26, 60);
  scene.add(new THREE.HemisphereLight('#ffffff', '#c9c9c9', 1.9));
  const sun = new THREE.DirectionalLight('#ffffff', 1.4);
  sun.position.set(COLS / 2 + 6, 26, ROWS / 2 + 8); sun.target.position.set(COLS / 2, 0, ROWS / 2);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03; sun.shadow.radius = 4;
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 80 });
  scene.add(sun, sun.target);
  // floor and ceiling
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(COLS, ROWS).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: floorTiles(COLS, ROWS), roughness: 0.85 })); // (white tiles)
  floor.position.set(COLS / 2, 0, ROWS / 2); floor.receiveShadow = true; scene.add(floor);
  // the walls (one box per tile, drawn together) and the barrier (low, with a pale grey top)
  const place = (list, geo, mat, y) => {
    if (!list.length) return;
    const m = new THREE.InstancedMesh(geo, mat, list.length), o = new THREE.Object3D();
    list.forEach(([x, z], i) => { o.position.set(x + 0.5, y, z + 0.5); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
    m.castShadow = true; m.receiveShadow = true; scene.add(m);
  };
  const walls = [], barrier = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { if (g[y][x] === 1) walls.push([x, y]); else if (g[y][x] === 2) barrier.push([x, y]); }
  place(walls, new THREE.BoxGeometry(1, 2.6, 1), wall, 1.3);
  place(barrier, new THREE.BoxGeometry(1, 0.4, 1), white, 0.2);
  place(barrier, new THREE.BoxGeometry(1.002, 0.03, 1.002), edge, 0.415);
  // a faint circle where each fighter starts
  for (const [fx, fy] of A.fighters) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.48, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#d6d8dd' }));
    ring.position.set(fx + 0.5, 0.005, fy + 0.5); scene.add(ring);
  }
  return {};
}
export function updateArena() {}
