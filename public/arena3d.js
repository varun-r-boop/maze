// The fight arena in 3D: a dark neon stage. A black void, a shiny black floor ruled with a glowing white grid, tall
// grid walls fading into the dark round the edge, and a low black barrier with a glowing top edge round the fighting
// area. The grid glows brighter when the fight gets exciting (lots of hits).
import * as THREE from 'three';
import { gridMaterial } from './fightfx.js';

const Sh = window.Shared;
const { COLS, ROWS } = Sh.C;

export function buildArena(scene, G) {
  const A = G.arena, g = G.grid;
  scene.background = new THREE.Color('#000000');
  scene.fog = new THREE.Fog('#000000', 14, 34); // (the far walls fade into the dark)
  scene.add(new THREE.HemisphereLight('#a8b4ff', '#000000', 0.7));
  const key = new THREE.DirectionalLight('#ffffff', 2.3);
  key.position.set(COLS / 2 + 6, 22, ROWS / 2 + 10); key.target.position.set(COLS / 2, 0, ROWS / 2);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0005; key.shadow.normalBias = 0.03; key.shadow.radius = 4;
  Object.assign(key.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 80 });
  const rim = new THREE.DirectionalLight('#7f8cff', 0.8); rim.position.set(COLS / 2 - 8, 10, ROWS / 2 - 10);
  scene.add(key, key.target, rim);
  // the floor: black, a little shiny, ruled with the glowing grid (one square per tile)
  const floorMat = gridMaterial(COLS, ROWS, 0.3);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(COLS, ROWS).rotateX(-Math.PI / 2), floorMat);
  floor.position.set(COLS / 2, 0, ROWS / 2); floor.receiveShadow = true; scene.add(floor);
  // the walls: tall black panels ruled with the grid; the barrier: low black blocks with a glowing top edge
  const place = (list, geo, mat, y) => {
    if (!list.length) return;
    const m = new THREE.InstancedMesh(geo, mat, list.length), o = new THREE.Object3D();
    list.forEach(([x, z], i) => { o.position.set(x + 0.5, y, z + 0.5); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
    m.castShadow = true; m.receiveShadow = true; scene.add(m);
  };
  const walls = [], barrier = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { if (g[y][x] === 1) walls.push([x, y]); else if (g[y][x] === 2) barrier.push([x, y]); }
  const wallMat = gridMaterial(1, 4, 0.2);
  place(walls, new THREE.BoxGeometry(1, 4, 1), wallMat, 2);
  place(barrier, new THREE.BoxGeometry(1, 0.3, 1), new THREE.MeshStandardMaterial({ color: '#0a0a0e', roughness: 0.5, metalness: 0.3 }), 0.15);
  const edgeMat = new THREE.MeshBasicMaterial({ color: '#cfd8ff' });
  place(barrier, new THREE.BoxGeometry(1.002, 0.025, 1.002), edgeMat, 0.31);
  // a faint glowing circle where each fighter starts
  for (const [fx, fy] of A.fighters) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.47, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#5a6080' }));
    ring.position.set(fx + 0.5, 0.005, fy + 0.5); scene.add(ring);
  }
  return { floorMat, wallMat };
}
// the grid pulses brighter with the excitement (0..1)
export function updateArena(S, t, excite) {
  if (!S || !S.floorMat) return;
  S.floorMat.emissiveIntensity = 0.3 + 0.4 * excite + 0.03 * Math.sin(t * 2);
  S.wallMat.emissiveIntensity = 0.2 + 0.25 * excite;
}
