// A "clay" look for the 3D views: soft rounded shapes that are a little lumpy, a matte waxy material with
// fingerprints and dents in it, and soft ambient-occlusion shadows wherever things meet.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// a repeatable "random" number, so the same scene always comes out the same
export const hash = (x, y, k = 0) => { const s = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };

// the clay surface: soft dents, smudges and the odd fingerprint swirl, used as a bump map
let bumpTex = null;
function clayBump() {
  if (bumpTex) return bumpTex;
  const n = 256, c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d');
  x.fillStyle = '#808080'; x.fillRect(0, 0, n, n);
  for (let i = 0; i < 260; i++) { // dents and lumps
    const px = hash(i, 1) * n, py = hash(i, 2) * n, r = 4 + hash(i, 3) * 18, v = hash(i, 4) < 0.5 ? 0 : 255;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, `rgba(${v},${v},${v},.10)`); g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
  }
  x.lineWidth = 1.2;
  for (let f = 0; f < 6; f++) { // fingerprint swirls
    const cx = hash(f, 5) * n, cy = hash(f, 6) * n, a = hash(f, 7) * 3;
    for (let r = 3; r < 26; r += 2.6) {
      x.strokeStyle = `rgba(${f % 2 ? 0 : 255},${f % 2 ? 0 : 255},${f % 2 ? 0 : 255},.07)`;
      x.beginPath(); x.ellipse(cx, cy, r, r * 0.7, a, 0.3, Math.PI * 1.8); x.stroke();
    }
  }
  for (let i = 0; i < 1800; i++) { // fine grain
    const v = hash(i, 8) < 0.5 ? 0 : 255;
    x.fillStyle = `rgba(${v},${v},${v},.05)`; x.fillRect(hash(i, 9) * n, hash(i, 10) * n, 1.5, 1.5);
  }
  bumpTex = new THREE.CanvasTexture(c);
  bumpTex.wrapS = bumpTex.wrapT = THREE.RepeatWrapping;
  return bumpTex;
}

// matte clay in any color, with a soft sheen like modelling clay. Materials are shared per color.
// `repeat: [x, y]` tiles the dents and fingerprints, for big surfaces like floors and long walls
// (otherwise one fingerprint gets stretched across a whole room).
const mats = new Map();
export function clay(color, { repeat, ...opts } = {}) {
  const key = color + JSON.stringify(opts) + (repeat || '');
  if (mats.has(key)) return mats.get(key);
  let bump = clayBump();
  if (repeat) { bump = bump.clone(); bump.repeat.set(repeat[0], repeat[1]); bump.needsUpdate = true; }
  const m = new THREE.MeshPhysicalMaterial({
    color, roughness: 0.85, metalness: 0, sheen: 0.6, sheenRoughness: 0.75, sheenColor: new THREE.Color('#ffffff'),
    bumpMap: bump, bumpScale: 5, ...opts,
  });
  mats.set(key, m);
  return m;
}
export function resetClay() { mats.clear(); bumpTex = null; } // the old scene's materials were freed

// push every point of a shape in or out a little, so it looks hand-made. Points are moved away from the
// shape's centre (not along their normals), so the corners of a box never crack open.
export function wobble(geo, amp = 0.012, seed = 0) {
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 7.3 + seed) * Math.sin(v.y * 6.1 + seed * 1.7) * Math.sin(v.z * 8.7 + seed * 0.6)
      + 0.5 * Math.sin(v.x * 17.1 + v.z * 13.3 + seed * 2.3);
    const len = v.length() || 1;
    v.multiplyScalar(1 + amp * n / Math.max(0.15, len));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// a rounded, slightly lumpy box (clay never has sharp edges)
// Edges are at least `soft` (about a third) of the thinnest side, so even flat pieces have soft, pillowy edges.
// Walls and other big blocks pass a smaller `soft`, or they'd look like bolsters.
export function rbox(w, h, d, r = 0.04, amp = 0.006, seed = 0, soft = 0.32) {
  const rr = Math.min(Math.max(r, Math.min(w, h, d) * soft), w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const geo = new RoundedBoxGeometry(w, h, d, 4, rr);
  return amp ? wobble(geo, amp * 1.6, seed) : geo;
}
// a lumpy ball
export function blob(r = 0.2, detail = 2, amp = 0.05, seed = 0) { return wobble(new THREE.IcosahedronGeometry(r, detail), amp, seed); }

// turn every ordinary material in the scene into clay of the same color.
// Each gets its own material, because the 3D view fades or recolors some of them on their own.
// Glowing things are left as they are.
export function clayifyScene(scene) {
  const done = new Map();
  scene.traverse(o => {
    if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
    const m = o.material;
    if (m.type !== 'MeshStandardMaterial' || m.transparent || m.emissive.getHex() !== 0) return;
    if (!done.has(m)) done.set(m, new THREE.MeshPhysicalMaterial({
      color: m.color, map: m.map, roughness: 0.8, metalness: 0, sheen: 0.45, sheenRoughness: 0.75,
      sheenColor: new THREE.Color('#ffffff'), bumpMap: clayBump(), bumpScale: 5,
    }));
    o.material = done.get(m);
    m.dispose();
  });
}

// soft contact shadows where things meet (ambient occlusion), drawn after the scene. Skipped on phones.
export function createClayFX(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const ao = new GTAOPass(scene, camera, size.x, size.y);
  ao.blendIntensity = 1.0;
  ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.2, thickness: 2, scale: 2, samples: 16, distanceFallOff: 1 });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
  composer.addPass(ao);
  composer.addPass(new OutputPass());
  return {
    render: () => composer.render(),
    setSize: (w, h, dpr) => { composer.setPixelRatio(dpr); composer.setSize(w, h); },
    dispose: () => composer.dispose(),
  };
}
