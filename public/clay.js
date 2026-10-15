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
  const n = 512, c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d');
  x.fillStyle = '#808080'; x.fillRect(0, 0, n, n);
  // draw a shape at every wrap-around offset too, so the texture tiles without seams
  const wrap = (px, py, r, f) => { for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) if (px + ox > -r && px + ox < n + r && py + oy > -r && py + oy < n + r) f(px + ox, py + oy); };
  for (let i = 0; i < 420; i++) { // dents and lumps, with a crisp rim on one side so they read as pressed in
    const px = hash(i, 1) * n, py = hash(i, 2) * n, r = 5 + hash(i, 3) * 26, dark = hash(i, 4) < 0.55;
    wrap(px, py, r, (cx, cy) => {
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r), v = dark ? 0 : 255, o = dark ? 0.26 : 0.2;
      const rgba = k => 'rgba(' + v + ',' + v + ',' + v + ',' + k + ')';
      g.addColorStop(0, rgba(o)); g.addColorStop(0.7, rgba(o * 0.4)); g.addColorStop(1, rgba(0));
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
      if (dark && r > 12) { x.strokeStyle = 'rgba(255,255,255,.18)'; x.lineWidth = 1.6; x.beginPath(); x.arc(cx, cy, r * 0.8, 3.6, 5.6); x.stroke(); }
    });
  }
  for (let i = 0; i < 70; i++) { // sculpting-tool strokes: a groove with a raised edge beside it
    const px = hash(i, 11) * n, py = hash(i, 12) * n, len = 30 + hash(i, 13) * 90, a = hash(i, 14) * Math.PI, bend = (hash(i, 15) - 0.5) * 40;
    const dx = Math.cos(a) * len / 2, dy = Math.sin(a) * len / 2, nx = -Math.sin(a), ny = Math.cos(a);
    wrap(px, py, len, (cx, cy) => {
      x.lineCap = 'round';
      for (const [off, col, w] of [[0, 'rgba(0,0,0,.28)', 3], [3, 'rgba(255,255,255,.22)', 2]]) {
        x.strokeStyle = col; x.lineWidth = w; x.beginPath();
        x.moveTo(cx - dx + nx * off, cy - dy + ny * off); x.quadraticCurveTo(cx + nx * (bend + off), cy + ny * (bend + off), cx + dx + nx * off, cy + dy + ny * off); x.stroke();
      }
    });
  }
  for (let f = 0; f < 14; f++) { // fingerprints: tight ridges with a light/dark pair so they catch the light
    const fx = hash(f, 5) * n, fy = hash(f, 6) * n, a = hash(f, 7) * 3;
    wrap(fx, fy, 34, (cx, cy) => {
      for (let r = 3; r < 32; r += 2.4) for (const [d, col] of [[0, 'rgba(0,0,0,.2)'], [0.9, 'rgba(255,255,255,.16)']]) {
        x.strokeStyle = col; x.lineWidth = 1; x.beginPath(); x.ellipse(cx, cy, r + d, (r + d) * 0.66, a, 0.25, Math.PI * 1.75); x.stroke();
      }
    });
  }
  for (let i = 0; i < 9000; i++) { // fine grain and tiny pits
    const v = hash(i, 8) < 0.5 ? 0 : 255;
    x.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (0.07 + hash(i, 16) * 0.08) + ')'; x.fillRect(hash(i, 9) * n, hash(i, 10) * n, 1 + hash(i, 17) * 1.5, 1 + hash(i, 18) * 1.5);
  }
  bumpTex = new THREE.CanvasTexture(c);
  bumpTex.wrapS = bumpTex.wrapT = THREE.RepeatWrapping;
  bumpTex.anisotropy = 8;
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
    color, roughness: 0.85, metalness: 0, sheen: 0.4, sheenRoughness: 0.7, sheenColor: new THREE.Color('#ffffff'),
    bumpMap: bump, bumpScale: 9, ...opts,
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

// shortcuts for building a clay scene: `add` places one mesh, `many` draws lots of copies of one piece together
export function clayKit(scene) {
  const add = (geo, mat, x, y, z, { ry = 0, rx = 0, rz = 0, cast = true, s } = {}) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    if (s) m.scale.set(...s);
    m.castShadow = cast; m.receiveShadow = true; scene.add(m); return m;
  };
  const many = (geo, mat, list, place, { cast = false } = {}) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length), o = new THREE.Object3D();
    list.forEach((it, i) => { o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); place(o, it, i); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix); });
    mesh.castShadow = cast; mesh.receiveShadow = true; scene.add(mesh);
  };
  return { add, many };
}

// a map's walls in clay: long rounded runs (with a row merged into the rows below while they repeat, so a solid
// block is one piece, not a stack), each with a skirting board along the bottom
export function clayWalls(add, isWall, cols, rows, wallH, wallColor, skirtColor) {
  const used = new Set(), runs = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { // horizontal runs first
    if (!isWall(x, y) || used.has(y * cols + x)) continue;
    let x1 = x; while (isWall(x1 + 1, y)) x1++;
    if (x1 > x) {
      let y1 = y;
      const rowFree = yy => { for (let i = x; i <= x1; i++) if (!isWall(i, yy) || used.has(yy * cols + i)) return false; return isWall(x - 1, yy) === isWall(x - 1, y) && isWall(x1 + 1, yy) === isWall(x1 + 1, y); };
      while (y1 + 1 < rows && rowFree(y1 + 1)) y1++;
      for (let yy = y; yy <= y1; yy++) for (let i = x; i <= x1; i++) used.add(yy * cols + i);
      runs.push({ x0: x, y0: y, x1, y1 });
    }
  }
  for (let x = 0; x < cols; x++) for (let y = 0; y < rows; y++) { // then vertical runs of what's left
    if (!isWall(x, y) || used.has(y * cols + x)) continue;
    let y1 = y; while (isWall(x, y1 + 1) && !used.has((y1 + 1) * cols + x)) y1++;
    for (let i = y; i <= y1; i++) used.add(i * cols + x);
    runs.push({ x0: x, y0: y, x1: x, y1 });
  }
  const skirtMat = clay(skirtColor);
  for (const r of runs) {
    const w = r.x1 - r.x0 + 1, d = r.y1 - r.y0 + 1, cx = r.x0 + w / 2, cz = r.y0 + d / 2;
    add(rbox(w, wallH, d, 0.07, 0.006, cx * 3 + cz, 0.09), clay(wallColor, { repeat: [Math.max(w, d), wallH] }), cx, wallH / 2, cz);
    add(rbox(w + 0.04, 0.09, d + 0.04, 0.03, 0), skirtMat, cx, 0.045, cz, { cast: false });
  }
}

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
      sheenColor: new THREE.Color('#ffffff'), bumpMap: clayBump(), bumpScale: 9,
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
  // name tags and see-through things (glass, the ice round a frozen runner) don't cast these shadows: without this,
  // a name tag's whole square would leave a dark smudge behind it
  const hideFromAO = ao.overrideVisibility.bind(ao);
  ao.overrideVisibility = () => {
    hideFromAO();
    scene.traverse(o => { if (o.isSprite || (o.isMesh && o.material && o.material.transparent && !o.material.depthWrite)) o.visible = false; });
  };
  composer.addPass(ao);
  composer.addPass(new OutputPass());
  return {
    render: () => composer.render(),
    setSize: (w, h, dpr) => { composer.setPixelRatio(dpr); composer.setSize(w, h); },
    dispose: () => composer.dispose(),
  };
}
