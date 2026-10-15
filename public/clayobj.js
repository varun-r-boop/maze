// Hide clay: the clay sculptures players make. Every sculpture starts as the same lump (a finely divided ball), so
// a sculpture is just where each of its points ended up, and which color each point is painted. That's what gets
// sent around: { n, pos, col } with the positions as 16-bit numbers and the colors as palette indexes, base64 encoded.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { clay } from './clay.js';

const Sh = window.Shared;
export const PALETTE = Sh.CLAY_COLORS;
const Q = 13000; // positions are stored as round(value * Q), so they can go out to about ±2.5
export const LIMIT = 2.4; // how far from the middle a point of the clay may be pushed

// the starting lump: the same on every device (same code, same Three.js), so points line up everywhere
let base = null;
function baseLump() {
  if (!base) {
    let g = new THREE.IcosahedronGeometry(1, 30); // about 9,600 points: fine enough for crisp painted edges
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = mergeVertices(g, 1e-5);
    base = g;
  }
  const g = base.clone();
  return g;
}
export const lumpSize = () => baseLump().attributes.position.count;

const toB64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = s => { const b = atob(s), u8 = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u8[i] = b.charCodeAt(i); return u8; };

export function encodeLump(positions, colors) {
  const n = colors.length, q = new Int16Array(n * 3);
  for (let i = 0; i < n * 3; i++) q[i] = Math.round(Math.max(-LIMIT, Math.min(LIMIT, positions[i])) * Q);
  return { n, pos: toB64(new Uint8Array(q.buffer)), col: toB64(colors) };
}

// set a geometry's vertex colors from palette indexes
export function paintColors(geo, idx) {
  const n = idx.length, c = new Float32Array(n * 3), tmp = new THREE.Color(), cols = PALETTE.map(h => new THREE.Color(h));
  for (let i = 0; i < n; i++) { tmp.copy(cols[idx[i] % cols.length]); c[i * 3] = tmp.r; c[i * 3 + 1] = tmp.g; c[i * 3 + 2] = tmp.b; }
  if (geo.attributes.color) { geo.attributes.color.array.set(c); geo.attributes.color.needsUpdate = true; }
  else geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
}

// a fresh lump, or a sculpture rebuilt from its data (`fill`: the palette color for a lump nobody sculpted)
export function lumpGeometry(data, fill = 0) {
  const g = baseLump(), n = g.attributes.position.count;
  let idx = new Uint8Array(n).fill(fill);
  try {
    if (data && data.n === n) {
      const q = new Int16Array(fromB64(data.pos).buffer), col = fromB64(data.col);
      if (q.length === n * 3 && col.length === n) {
        const p = g.attributes.position.array;
        for (let i = 0; i < n * 3; i++) p[i] = q[i] / Q;
        idx = col;
      }
    }
  } catch { /* a broken sculpture: show the plain lump */ }
  paintColors(g, idx);
  g.computeVertexNormals();
  return g;
}

export const clayMaterial = () => clay('#ffffff', { vertexColors: true, bumpScale: 4 });

// a sculpture ready to put in the world: standing on y = 0, centred, its biggest side `size` long
export function makeSculpture(data, fill, size) {
  const g = lumpGeometry(data, fill);
  g.computeBoundingBox();
  const b = g.boundingBox, dim = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) || 1, k = size / dim;
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); g.scale(k, k, k);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, clayMaterial()); m.castShadow = true; m.receiveShadow = true;
  return m;
}

// a little picture of a sculpture (for the top-down view and the HUD), from the front and a bit above
let thumbR = null, thumbScene = null, thumbCam = null;
export function thumbnail(data, fill, px = 96) {
  if (!thumbR) {
    thumbR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    thumbR.setSize(128, 128, false); thumbR.toneMapping = THREE.ACESFilmicToneMapping;
    thumbScene = new THREE.Scene();
    thumbScene.add(new THREE.HemisphereLight('#fff6e6', '#8a7a6a', 1.6));
    const sun = new THREE.DirectionalLight('#ffffff', 2.2); sun.position.set(2, 4, 3); thumbScene.add(sun);
    thumbCam = new THREE.PerspectiveCamera(32, 1, 0.1, 20); thumbCam.position.set(0, 1.25, 3.1); thumbCam.lookAt(0, 0.5, 0);
  }
  const m = makeSculpture(data, fill, 1.1);
  thumbScene.add(m);
  thumbR.render(thumbScene, thumbCam);
  thumbScene.remove(m); m.geometry.dispose();
  const c = document.createElement('canvas'); c.width = c.height = px;
  c.getContext('2d').drawImage(thumbR.domElement, 0, 0, px, px);
  return c;
}
