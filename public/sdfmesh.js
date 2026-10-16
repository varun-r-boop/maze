// Arena fights: a fighter's body as ONE smooth surface, made from all its shapes at once. Each shape is described by
// a distance function (how far a point is from its surface); shapes are joined with a "smooth minimum", so the
// more a shape blends, the more it melts into what it touches, and "subtract" shapes carve away. The surface is
// found on a 3D grid (surface nets), then every point of it gets a color (from the shapes nearest it) and skeleton
// weights (from the body parts of the shapes nearest it), so the body bends smoothly at the joints when it animates.
import * as THREE from 'three';

// distance from a point (in the shape's own space; the shape is centred there, y up) to the shape's surface
// (negative inside). `h` is half the shape's size on each axis.
function shapeDist(t, x, y, z, hx, hy, hz) {
  switch (t) {
    case 'sphere': { // an ellipsoid
      const k0 = Math.hypot(x / hx, y / hy, z / hz), k1 = Math.hypot(x / (hx * hx), y / (hy * hy), z / (hz * hz));
      return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(hx, hy, hz);
    }
    case 'box': case 'rbox': {
      const r = t === 'rbox' ? Math.min(hx, hy, hz) * 0.6 : Math.min(0.012, Math.min(hx, hy, hz) * 0.3);
      const qx = Math.abs(x) - hx + r, qy = Math.abs(y) - hy + r, qz = Math.abs(z) - hz + r;
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
    }
    case 'cylinder': {
      const rr = Math.min(hx, hz), dx = Math.hypot(x * rr / hx, z * rr / hz) - rr, dy = Math.abs(y) - hy;
      return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
    }
    case 'capsule': {
      const rr = Math.min(hx, hz), half = Math.max(0, hy - rr), cy = Math.max(-half, Math.min(half, y));
      return Math.hypot(x * rr / hx, y - cy, z * rr / hz) - rr;
    }
    case 'cone': { // base at the bottom, point at the top
      const rr = Math.min(hx, hz), q = Math.hypot(x * rr / hx, z * rr / hz), h = hy * 2, yy = y + hy; // yy: 0 at the base
      const slope = rr / h, rAt = rr - yy * slope, side = (q - rAt) / Math.hypot(1, slope);
      return Math.max(side, -yy, yy - h);
    }
    case 'torus': { // a ring lying flat
      const tube = Math.max(0.01, hy), R = Math.max(tube, Math.min(hx, hz) - tube);
      return Math.hypot(Math.hypot(x, z) - R, y) - tube;
    }
  }
  return 1e9;
}
const smin = (a, b, k) => { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

// shapes: [{ t, h: [hx, hy, hz], inv: Matrix4 (body space -> the shape's space), center: Vector3, radius, k (blend
// distance), m (subtract), color: Color, bone: index }]. Returns a BufferGeometry with position, normal, color,
// skinIndex and skinWeight, in body space; or null if there's nothing to build.
export function buildSdfGeometry(shapes) {
  const add = shapes.filter(s => !s.m), cut = shapes.filter(s => s.m);
  if (!add.length) return null;
  for (const s of shapes) s.e = s.inv.elements;
  const local = (s, x, y, z) => { const e = s.e; return shapeDist(s.t, e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14], s.h[0], s.h[1], s.h[2]); };
  const field = (x, y, z) => {
    let d = 1e9;
    for (const s of add) {
      const b = Math.hypot(x - s.center.x, y - s.center.y, z - s.center.z) - s.radius;
      if (b > d + s.k) continue; // (too far away to matter)
      d = smin(d, local(s, x, y, z), s.k);
    }
    for (const s of cut) {
      const b = Math.hypot(x - s.center.x, y - s.center.y, z - s.center.z) - s.radius;
      if (b > s.k) continue;
      d = -smin(-d, local(s, x, y, z), s.k);
    }
    return d;
  };
  // the grid: just big enough for everything that adds
  const min = new THREE.Vector3(Infinity, Infinity, Infinity), max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const s of add) { min.min(s.center.clone().subScalar(s.radius + s.k)); max.max(s.center.clone().addScalar(s.radius + s.k)); }
  min.subScalar(0.03); max.addScalar(0.03);
  const span = max.clone().sub(min);
  let h = Math.max(0.012, Math.max(span.x, span.y, span.z) / 84);
  while ((span.x / h + 2) * (span.y / h + 2) * (span.z / h + 2) > 450000) h *= 1.1;
  const nx = Math.ceil(span.x / h) + 2, ny = Math.ceil(span.y / h) + 2, nz = Math.ceil(span.z / h) + 2;
  const F = new Float32Array(nx * ny * nz), at = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) F[at(i, j, k)] = field(min.x + i * h, min.y + j * h, min.z + k * h);

  // surface nets: one point in every grid cell the surface passes through (the average of where it crosses the
  // cell's edges), then a four-sided face across every grid edge the surface crosses
  const cellV = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1), cell = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos = [];
  const C = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const v = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let inside = 0;
    for (let c = 0; c < 8; c++) { v[c] = F[at(i + C[c][0], j + C[c][1], k + C[c][2])]; if (v[c] < 0) inside++; }
    if (inside === 0 || inside === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of E) {
      if ((v[a] < 0) === (v[b] < 0)) continue;
      const t = v[a] / (v[a] - v[b]);
      sx += C[a][0] + (C[b][0] - C[a][0]) * t; sy += C[a][1] + (C[b][1] - C[a][1]) * t; sz += C[a][2] + (C[b][2] - C[a][2]) * t; n++;
    }
    cellV[cell(i, j, k)] = pos.length / 3;
    pos.push(min.x + (i + sx / n) * h, min.y + (j + sy / n) * h, min.z + (k + sz / n) * h);
  }
  const idx = [];
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const f0 = F[at(i, j, k)] < 0;
    if (f0 !== (F[at(i + 1, j, k)] < 0)) quad(cellV[cell(i, j - 1, k - 1)], cellV[cell(i, j, k - 1)], cellV[cell(i, j, k)], cellV[cell(i, j - 1, k)], !f0);
    if (f0 !== (F[at(i, j + 1, k)] < 0)) quad(cellV[cell(i - 1, j, k - 1)], cellV[cell(i - 1, j, k)], cellV[cell(i, j, k)], cellV[cell(i, j, k - 1)], !f0);
    if (f0 !== (F[at(i, j, k + 1)] < 0)) quad(cellV[cell(i - 1, j - 1, k)], cellV[cell(i, j - 1, k)], cellV[cell(i, j, k)], cellV[cell(i - 1, j, k)], !f0);
  }
  if (!idx.length) return null;

  // per point: the normal (which way the surface faces), the color and the skeleton weights
  const nV = pos.length / 3, nor = new Float32Array(nV * 3), col = new Float32Array(nV * 3), si = new Uint16Array(nV * 4), sw = new Float32Array(nV * 4);
  const e = h * 0.5, ds = new Float32Array(add.length);
  for (let q = 0; q < nV; q++) {
    const x = pos[q * 3], y = pos[q * 3 + 1], z = pos[q * 3 + 2];
    const gx = field(x + e, y, z) - field(x - e, y, z), gy = field(x, y + e, z) - field(x, y - e, z), gz = field(x, y, z + e) - field(x, y, z - e), gl = Math.hypot(gx, gy, gz) || 1;
    nor[q * 3] = gx / gl; nor[q * 3 + 1] = gy / gl; nor[q * 3 + 2] = gz / gl;
    let dmin = Infinity;
    add.forEach((s, i) => { ds[i] = local(s, x, y, z); dmin = Math.min(dmin, ds[i]); });
    let cr = 0, cg = 0, cb = 0, cw = 0; const bw = new Map();
    add.forEach((s, i) => {
      const wc = Math.exp(-(ds[i] - dmin) / 0.006); cr += s.color.r * wc; cg += s.color.g * wc; cb += s.color.b * wc; cw += wc;
      const wb = Math.exp(-(ds[i] - dmin) / Math.max(0.02, s.k * 0.6)); bw.set(s.bone, (bw.get(s.bone) || 0) + wb);
    });
    col[q * 3] = cr / cw; col[q * 3 + 1] = cg / cw; col[q * 3 + 2] = cb / cw;
    const top = [...bw].sort((a, b) => b[1] - a[1]).slice(0, 4), tw = top.reduce((a, b) => a + b[1], 0) || 1;
    top.forEach(([bone, w], i) => { si[q * 4 + i] = bone; sw[q * 4 + i] = w / tw; });
  }
  // (make the faces wind the way the surface faces)
  for (let f = 0; f < idx.length; f += 3) {
    const [a, b, c] = [idx[f], idx[f + 1], idx[f + 2]];
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const wx = pos[c * 3] - pos[a * 3], wy = pos[c * 3 + 1] - pos[a * 3 + 1], wz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx;
    if (fx * (nor[a * 3] + nor[b * 3] + nor[c * 3]) + fy * (nor[a * 3 + 1] + nor[b * 3 + 1] + nor[c * 3 + 1]) + fz * (nor[a * 3 + 2] + nor[b * 3 + 2] + nor[c * 3 + 2]) < 0) { idx[f + 1] = c; idx[f + 2] = b; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.setIndex(idx);
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}
