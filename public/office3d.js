// The office map in 3D, in a clay style: everything is soft, rounded and slightly lumpy, in matte pastel clay.
// Daylight comes in through floor-to-ceiling windows (with clay trees, buildings and clouds outside); inside are
// glass meeting rooms, desk pods covered in mugs, papers and monitors, office chairs on wheels, yellow sofas with
// cushions, a kitchen with a coffee machine, framed art, lockers, plants everywhere and big dome lamps.
// Map space -> 3D: x = tile x, z = tile y, y is up; one tile is one unit.
import * as THREE from 'three';
import { clay, rbox, blob, hash } from './clay.js';

const Sh = window.Shared;
const { COLS, ROWS } = Sh.C;

const P = {
  wall: '#f2ebe0', skirting: '#cbbfae', ceiling: '#f7f2e9',
  carpet: '#6f7b8e', carpetMeet: '#6f82a0', corridor: '#848c99', stone: '#e6d8c2', woodFloor: '#d9a26c', tile: '#e2ecee', vinyl: '#b4bac4',
  white: '#f3ebdd', wood: '#c88d5c', woodDark: '#8c5a36', dark: '#56627a', steel: '#b6bfca',
  yellow: '#f4c64a', grey: '#a3abb5', blue: '#4f86c6', sage: '#9fb59a', green: '#6dbf5b', green2: '#4e9c47', pot: '#cf7b51', frame: '#4b5058',
};
const MUGS = ['#e85d5d', '#f4c64a', '#5aa9e6', '#f6f1e8', '#6dbf5b', '#b48ee0'];
const FLOOR = { lobby: P.stone, reception: P.stone, lounge: P.woodFloor, wc: P.tile, tech: P.vinyl, storage: P.vinyl, copy: P.vinyl, meeting: P.carpetMeet, think: P.carpetMeet, corridor: P.corridor, open: P.carpet, collab: P.carpet };

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function buildOffice(scene, G, WALL_H) {
  const O = G.office;
  const add = (geo, mat, x, y, z, { ry = 0, rx = 0, rz = 0, cast = true, s } = {}) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    if (s) m.scale.set(...s);
    m.castShadow = cast; m.receiveShadow = true; scene.add(m); return m;
  };
  // many copies of one piece, drawn together
  const many = (geo, mat, list, place, { cast = false } = {}) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length), o = new THREE.Object3D();
    list.forEach((it, i) => { o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); place(o, it, i); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix); });
    mesh.castShadow = cast; mesh.receiveShadow = true; scene.add(mesh);
  };
  // things collected while going through the furniture, drawn together at the end
  const chairs = [], leaves = [], mugs = [], monitors = [], keyboards = [], papers = [];

  // ---- light: a warm, soft daylight
  scene.background = new THREE.Color('#bcdcf2');
  scene.fog = new THREE.Fog('#d9e6ee', 18, 46);
  scene.add(new THREE.HemisphereLight('#fff6e6', '#a89a8a', 1.25));
  const sun = new THREE.DirectionalLight('#ffeccc', 2.2);
  sun.position.set(COLS + 14, 18, -16); sun.target.position.set(COLS / 2, 0, ROWS / 2);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03; sun.shadow.radius = 4;
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 90 });
  scene.add(sun, sun.target);

  // ---- floors: a clay slab per room, in that room's color, on a base slab
  add(new THREE.BoxGeometry(COLS, 0.1, ROWS), clay(P.corridor, { repeat: [COLS / 1.5, ROWS / 1.5] }), COLS / 2, -0.05, ROWS / 2, { cast: false });
  for (const r of O.rooms) {
    const w = r.x1 - r.x0 + 1, h = r.y1 - r.y0 + 1;
    add(rbox(w - 0.04, 0.06, h - 0.04, 0.03, 0.004, r.x0 + r.y0), clay(FLOOR[r.type] || P.carpet, { repeat: [w / 1.5, h / 1.5] }), r.x0 + w / 2, -0.02, r.y0 + h / 2, { cast: false });
  }
  // rugs: under the lounge sofas and armchairs, and a mat by the elevators
  const rug = (x, z, w, d, color) => add(wobbleDisc(w, d), clay(color, { repeat: [w, d] }), x, 0.016, z, { cast: false });
  rug(33, 4.5, 2.2, 1.9, '#e9d8b4'); rug(36.5, 4.5, 1.6, 1.6, '#c9d6e3'); rug(3.6, 14.5, 1.3, 1.6, '#8c6f5a'); rug(20, 4.5, 2.8, 1.8, '#d6c3a5');

  // ---- walls: long rounded clay runs, with skirting at the bottom
  const windowAt = new Set(O.windows.map(w => w.y * COLS + w.x));
  const isWall = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS && G.grid[y][x] === 1 && !windowAt.has(y * COLS + x);
  const used = new Set(), runs = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { // horizontal runs first
    if (!isWall(x, y) || used.has(y * COLS + x)) continue;
    let x1 = x; while (isWall(x1 + 1, y)) x1++;
    if (x1 > x) { // grow the run downwards while the row below is the same solid stretch (one block, not a stack)
      let y1 = y;
      const rowFree = yy => { for (let i = x; i <= x1; i++) if (!isWall(i, yy) || used.has(yy * COLS + i)) return false; return isWall(x - 1, yy) === isWall(x - 1, y) && isWall(x1 + 1, yy) === isWall(x1 + 1, y); };
      while (y1 + 1 < ROWS && rowFree(y1 + 1)) y1++;
      for (let yy = y; yy <= y1; yy++) for (let i = x; i <= x1; i++) used.add(yy * COLS + i);
      runs.push({ x0: x, y0: y, x1, y1 });
    }
  }
  for (let x = 0; x < COLS; x++) for (let y = 0; y < ROWS; y++) { // then vertical runs of what's left
    if (!isWall(x, y) || used.has(y * COLS + x)) continue;
    let y1 = y; while (isWall(x, y1 + 1) && !used.has((y1 + 1) * COLS + x)) y1++;
    for (let i = y; i <= y1; i++) used.add(i * COLS + x);
    runs.push({ x0: x, y0: y, x1: x, y1 });
  }
  const skirtMat = clay(P.skirting);
  for (const r of runs) {
    const w = r.x1 - r.x0 + 1, d = r.y1 - r.y0 + 1, cx = r.x0 + w / 2, cz = r.y0 + d / 2;
    add(rbox(w, WALL_H, d, 0.07, 0.006, cx * 3 + cz, 0.09), clay(P.wall, { repeat: [Math.max(w, d), WALL_H] }), cx, WALL_H / 2, cz);
    add(rbox(w + 0.04, 0.09, d + 0.04, 0.03, 0), skirtMat, cx, 0.045, cz, { cast: false });
  }

  // ---- windows: clay frames, glass, and a deep sill; outside, a little clay town
  const frameMat = clay(P.frame), glassMat = new THREE.MeshPhysicalMaterial({ color: '#d8eefa', transparent: true, opacity: 0.16, roughness: 0.05, depthWrite: false });
  for (const w of O.windows) {
    const north = w.y === 0, cx = w.x + 0.5, cz = w.y + 0.5;
    add(rbox(north ? 1 : 0.5, 0.16, north ? 0.5 : 1, 0.04, 0.004), clay(P.white), north ? cx : cx - 0.15, 0.08, north ? cz + 0.15 : cz, { cast: false }); // sill
    add(rbox(north ? 1 : 0.3, 0.1, north ? 0.3 : 1, 0.03, 0), frameMat, cx, WALL_H - 0.05, cz, { cast: false });
    add(rbox(0.07, WALL_H, 0.07, 0.025, 0), frameMat, north ? w.x + 1 : cx, WALL_H / 2, north ? cz : w.y + 1);
    add(new THREE.BoxGeometry(north ? 1 : 0.03, WALL_H - 0.26, north ? 0.03 : 1), glassMat, cx, WALL_H / 2, cz, { cast: false });
  }
  add(new THREE.CircleGeometry(80, 32).rotateX(-Math.PI / 2), clay('#8db86a'), COLS / 2, -0.7, ROWS / 2, { cast: false }); // lawn
  add(rbox(COLS + 26, 0.06, 7, 0.03, 0), clay('#7c828b'), COLS / 2 + 4, -0.66, -8, { cast: false }); // road
  for (let i = 0; i < 14; i++) add(rbox(0.9, 0.02, 0.15, 0.01, 0), clay('#f2efe6'), -6 + i * 4, -0.62, -8, { cast: false }); // lane markings
  const houses = [[4, -20, 12, 7, 4.5, '#e2a48a'], [20, -21, 14, 8, 6, '#f0d7a6'], [36, -19, 10, 6, 4, '#b8c9e6'], [COLS + 11, 6, 7, 12, 5, '#d6b3d8'], [COLS + 12, 22, 8, 9, 3.5, '#e2a48a']];
  for (const [x, z, w, d, h, c] of houses) {
    add(rbox(w, h, d, 0.4, 0.05, x), clay(c), x, h / 2 - 0.7, z, { cast: false });
    add(rbox(w + 0.5, 0.35, d + 0.5, 0.15, 0.02), clay('#8a8f99'), x, h - 0.55, z, { cast: false });
    const wins = [];
    const face = x > COLS ? 'w' : 's';
    for (let fy = 0.8; fy < h - 1.2; fy += 1.3) for (let fx = -(face === 's' ? w : d) / 2 + 1; fx < (face === 's' ? w : d) / 2 - 0.5; fx += 1.4) wins.push([fx, fy]);
    many(rbox(0.6, 0.7, 0.12, 0.08, 0), clay('#5e7a9a'), wins, (o, [fx, fy]) => o.position.set(face === 's' ? x + fx : x - w / 2 - 0.02, fy - 0.7, face === 's' ? z + d / 2 + 0.02 : z + fx));
  }
  const trees = [];
  for (let i = 0; i < 22; i++) trees.push(i < 13 ? { x: -3 + i * 3.6 + hash(i, 1) * 1.5, z: -3.4 - hash(i, 2) * 1.6 } : { x: COLS + 3 + hash(i, 3) * 2.5, z: 2 + (i - 13) * 3.2 + hash(i, 4) });
  many(new THREE.CylinderGeometry(0.12, 0.17, 1.6, 8), clay(P.woodDark), trees, (o, p) => o.position.set(p.x, 0.1, p.z));
  many(blob(1, 2, 0.12, 3), clay('#6aa84f'), trees, (o, p) => { o.position.set(p.x, 1.5, p.z); o.scale.setScalar(0.9 + hash(p.x, p.z) * 0.5); });
  many(blob(0.6, 2, 0.1, 5), clay('#7fbf5f'), trees, (o, p) => { o.position.set(p.x + 0.4, 2.1, p.z - 0.2); o.scale.setScalar(0.8 + hash(p.z, p.x) * 0.4); });
  const clouds = [];
  for (let i = 0; i < 9; i++) for (let k = 0; k < 4; k++) clouds.push({ x: -10 + i * 8 + k * 1.1, y: 9 + hash(i, 5) * 3 + (k % 2) * 0.4, z: -26 + hash(i, 6) * 6, s: 1.2 + hash(i, k) * 0.9 });
  many(blob(1, 2, 0.08, 7), new THREE.MeshLambertMaterial({ color: '#ffffff', fog: false }), clouds, (o, c) => { o.position.set(c.x, c.y, c.z); o.scale.set(c.s * 1.4, c.s * 0.8, c.s); });

  // ---- ceiling: soft white with rounded glowing light panels; a lowered grey panel over the lounge
  // (the ceiling faces down, away from the sky light, so it glows a little by itself instead of going muddy)
  add(new THREE.PlaneGeometry(COLS, ROWS).rotateX(Math.PI / 2), clay(P.ceiling, { emissive: new THREE.Color('#e9e1d3'), emissiveIntensity: 0.55 }), COLS / 2, WALL_H, ROWS / 2, { cast: false });
  const panels = [];
  for (let y = 1; y < ROWS - 1; y += 2) for (let x = 1; x < COLS - 1; x += 3) if (G.grid[y][x] !== 1) panels.push({ x, y });
  many(rbox(0.6, 0.04, 0.6, 0.02, 0), new THREE.MeshBasicMaterial({ color: '#fffdf5' }), panels, (o, p) => o.position.set(p.x + 0.5, WALL_H - 0.01, p.y + 0.5));
  const collab = O.rooms.find(r => r.type === 'collab');
  if (collab) add(rbox(collab.x1 - collab.x0 - 1, 0.1, collab.y1 - collab.y0 - 2, 0.05, 0.004), clay('#a7aeb8', { emissive: new THREE.Color('#9aa1ab'), emissiveIntensity: 0.5 }), (collab.x0 + collab.x1 + 1) / 2, WALL_H - 0.07, (collab.y0 + collab.y1) / 2, { cast: false });

  // ---- glass walls: a chunky clay frame, a pane of glass, and a frosted band
  const frost = new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, roughness: 0.6, depthWrite: false });
  for (const w of O.glass) {
    add(new THREE.BoxGeometry(1, WALL_H, 0.03), glassMat, w.x + 0.5, WALL_H / 2, w.y + 0.5, { cast: false });
    add(new THREE.BoxGeometry(1, 0.2, 0.04), frost, w.x + 0.5, 0.95, w.y + 0.5, { cast: false });
    add(rbox(1, 0.07, 0.09, 0.03, 0), frameMat, w.x + 0.5, 0.035, w.y + 0.5, { cast: false });
    add(rbox(1, 0.07, 0.09, 0.03, 0), frameMat, w.x + 0.5, WALL_H - 0.035, w.y + 0.5, { cast: false });
    add(rbox(0.06, WALL_H, 0.09, 0.025, 0), frameMat, w.x + 1, WALL_H / 2, w.y + 0.5, { cast: false });
  }
  for (const d of O.doors.filter(d => d.glass)) for (const s of [0.03, 0.97]) add(rbox(0.07, WALL_H, 0.1, 0.03, 0), frameMat, d.x + s, WALL_H / 2, d.y + 0.5);

  // ---- furniture
  const backDir = f => f === -1 ? [0, 1] : f === 1 ? [0, -1] : f === 0 ? [-1, 0] : [1, 0]; // which way a seat's back is
  const plantAt = (x, z, y, s, n = 6) => { for (let i = 0; i < n; i++) leaves.push({ x: x + Math.cos(i * 2.4) * 0.11 * s, z: z + Math.sin(i * 2.4) * 0.11 * s, y: y + (i % 3) * 0.06 * s, s: s * (0.65 + hash(x, z, i) * 0.45), r: i }); };
  const deskProps = (sx, cz, s, k) => { // what's on one desk: monitor, keyboard, mouse, and maybe a mug, papers...
    monitors.push({ x: sx, z: cz + s * 0.2, s, k });
    keyboards.push({ x: sx, z: cz + s * 0.48 });
    if (hash(sx, cz, k) < 0.6) mugs.push({ x: sx - 0.3 + hash(k, 1) * 0.1, y: 0.76, z: cz + s * 0.45, c: MUGS[Math.floor(hash(sx, k) * MUGS.length)] });
    if (hash(sx, cz, k + 3) < 0.45) papers.push({ x: sx + 0.32, z: cz + s * 0.38, a: hash(k, 4), n: 1 + Math.floor(hash(k, 5) * 4) });
    if (hash(sx, cz, k + 6) < 0.15) { add(new THREE.CylinderGeometry(0.06, 0.05, 0.1, 10), clay(P.pot), sx + 0.36, 0.81, cz + s * 0.12, { cast: false }); plantAt(sx + 0.36, cz + s * 0.12, 0.89, 0.45, 5); }
  };
  const officeChair = (x, z, a, color = P.dark) => chairs.push({ x, z, a, c: color });

  for (const it of O.items) {
    const w = it.w || 1, h = it.h || 1, cx = it.x + w / 2, cz = it.y + h / 2;
    switch (it.type) {
      case 'pod': {
        add(rbox(w - 0.04, 0.05, h - 0.12, 0.025, 0.003, cx), clay(P.white), cx, 0.74, cz);
        for (const [lx, lz] of [[it.x + 0.07, it.y + 0.12], [it.x + w - 0.07, it.y + 0.12], [it.x + 0.07, it.y + h - 0.12], [it.x + w - 0.07, it.y + h - 0.12]]) add(rbox(0.06, 0.72, 0.06, 0.025, 0), clay(P.steel), lx, 0.36, lz, { cast: false });
        add(rbox(w - 0.06, 0.34, 0.06, 0.03, 0.004, cz), clay(P.sage), cx, 0.94, cz); // fabric privacy screen
        for (let i = 0; i < w; i++) for (const s of [-1, 1]) {
          const sx = it.x + i + 0.5, k = i * 2 + (s > 0 ? 1 : 0) + it.x * 7 + it.y;
          deskProps(sx, cz, s, k);
          officeChair(sx, s < 0 ? it.y - 0.1 : it.y + h + 0.1, s < 0 ? Math.PI : 0);
        }
        break;
      }
      case 'table': case 'longtable': {
        const big = it.type === 'table' && w >= 4;
        add(rbox(w - 0.12, 0.07, h - 0.16, 0.035, 0.004, cx), clay(it.type === 'longtable' ? P.white : P.wood), cx, 0.74, cz);
        for (const lx of w > 2 ? [cx - w / 4, cx + w / 4] : [cx]) {
          add(new THREE.CylinderGeometry(0.06, 0.08, 0.7, 12), clay(P.steel), lx, 0.36, cz, { cast: false });
          add(rbox(0.5, 0.04, Math.min(0.5, h - 0.4), 0.02, 0), clay(P.steel), lx, 0.02, cz, { cast: false });
        }
        const along = w >= h, seats = [];
        for (let i = 0; i < (along ? w : h); i++) {
          if (along) { seats.push([it.x + i + 0.5, it.y - 0.02, Math.PI, it.y + 0.38]); seats.push([it.x + i + 0.5, it.y + h + 0.02, 0, it.y + h - 0.38]); }
          else { seats.push([it.x - 0.02, it.y + i + 0.5, Math.PI / 2, it.x + 0.38]); seats.push([it.x + w + 0.02, it.y + i + 0.5, -Math.PI / 2, it.x + w - 0.38]); }
        }
        if (w >= 2 && h >= 2) { seats.push([it.x - 0.02, cz, Math.PI / 2, it.x + 0.38]); seats.push([it.x + w + 0.02, cz, -Math.PI / 2, it.x + w - 0.38]); }
        seats.forEach(([x, z, a, edge], i) => {
          officeChair(x, z, a, it.type === 'longtable' ? P.blue : P.grey);
          // on the table in front of each seat: a laptop or a notepad, sometimes a mug or a water bottle
          const px = Math.abs(Math.sin(a)) > 0.5 ? edge : x, pz = Math.abs(Math.sin(a)) > 0.5 ? z : edge;
          const r = hash(x, z, i);
          if (big && r < 0.45) {
            const lap = new THREE.Group(); lap.position.set(px, 0.785, pz); lap.rotation.y = -a + Math.PI;
            const base = new THREE.Mesh(rbox(0.32, 0.018, 0.22, 0.008, 0), clay('#c9ced6')); lap.add(base);
            const lid = new THREE.Mesh(rbox(0.32, 0.2, 0.014, 0.008, 0), clay('#c9ced6')); lid.position.set(0, 0.1, 0.11); lid.rotation.x = -0.25; lap.add(lid);
            const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.17), new THREE.MeshBasicMaterial({ color: '#9fd0ff' })); glow.position.set(0, 0, -0.009); glow.rotation.y = Math.PI; lid.add(glow);
            lap.traverse(o => { if (o.isMesh) o.receiveShadow = true; }); scene.add(lap);
          } else if (r < 0.8) papers.push({ x: px, z: pz, a: a + 0.2, n: 1, pad: true });
          if (hash(z, x, i) < 0.35) mugs.push({ x: px + 0.2, y: 0.78, z: pz + 0.08, c: MUGS[i % MUGS.length] });
          else if (big && hash(z, x, i + 1) < 0.3) add(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 10), clay('#7fc3e8'), px - 0.2, 0.89, pz, { cast: false });
        });
        if (it.type === 'longtable') fruitBowl(cx, 0.78, cz);
        else if (big) add(blob(0.07, 1, 0.01), clay(P.dark), cx, 0.79, cz, { s: [1.2, 0.35, 1.2] }); // speakerphone
        break;
      }
      case 'sofa': {
        const mat = clay(it.color), [bx, bz] = backDir(it.face);
        const along = !bx, len = along ? w : h;
        add(rbox(along ? len - 0.06 : 0.86, 0.22, along ? 0.86 : len - 0.06, 0.08, 0.01, cx), mat, cx, 0.14, cz); // base
        const n = Math.max(1, Math.round(len));
        for (let i = 0; i < n; i++) { // seat cushions
          const t = (i + 0.5) / n - 0.5;
          add(rbox(along ? len / n - 0.06 : 0.62, 0.14, along ? 0.62 : len / n - 0.06, 0.06, 0.012, i + cx), mat, cx + (along ? t * len : -bx * 0.08), 0.32, cz + (along ? -bz * 0.08 : t * len));
          add(rbox(along ? len / n - 0.06 : 0.18, 0.36, along ? 0.18 : len / n - 0.06, 0.08, 0.012, i + cz), mat, cx + (along ? t * len : bx * 0.32), 0.48, cz + (along ? bz * 0.32 : t * len));
        }
        for (const s of [-1, 1]) add(rbox(along ? 0.16 : 0.86, 0.36, along ? 0.86 : 0.16, 0.07, 0.01), mat, cx + (along ? s * (len / 2 - 0.08) : 0), 0.3, cz + (along ? 0 : s * (len / 2 - 0.08))); // arms
        // a couple of throw pillows
        for (const [s, c] of [[-0.25, '#f6f1e8'], [0.25, '#5d7fa6']]) add(rbox(0.3, 0.28, 0.1, 0.06, 0.02), clay(c), cx + (along ? s * len : bx * 0.18), 0.55, cz + (along ? bz * 0.18 : s * len), { ry: along ? 0.15 * s : Math.PI / 2 + 0.15 * s });
        break;
      }
      case 'armchair': {
        const mat = clay(it.color), [bx, bz] = backDir(it.face), ry = Math.atan2(bx, bz);
        const g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = ry;
        const seat = new THREE.Mesh(rbox(0.66, 0.16, 0.62, 0.07, 0.012, cx), mat); seat.position.set(0, 0.36, -0.02); g.add(seat);
        const back = new THREE.Mesh(rbox(0.68, 0.5, 0.16, 0.08, 0.012, cz), mat); back.position.set(0, 0.62, 0.26); back.rotation.x = -0.18; g.add(back);
        for (const [lx, lz] of [[-0.26, -0.24], [0.26, -0.24], [-0.26, 0.24], [0.26, 0.24]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.015, 0.3, 8), clay(P.wood)); l.position.set(lx, 0.15, lz); l.rotation.set(lz * 0.6, 0, -lx * 0.6); g.add(l); }
        g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); scene.add(g);
        break;
      }
      case 'coffee':
        if (it.round) {
          add(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 28), clay(P.white), cx, 0.42, cz);
          add(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 10), clay(P.dark), cx, 0.2, cz, { cast: false });
          vase(cx + 0.1, 0.45, cz - 0.05);
        } else {
          add(rbox(w - 0.3, 0.06, h - 0.35, 0.03, 0.004), clay(P.wood), cx, 0.44, cz);
          for (const s of [-1, 1]) add(rbox(0.06, 0.42, h - 0.45, 0.025, 0), clay(P.woodDark), cx + s * (w / 2 - 0.25), 0.21, cz, { cast: false });
          papers.push({ x: cx - 0.3, z: cz, a: 0.3, n: 2, mag: true, y: 0.47 }); mugs.push({ x: cx + 0.35, y: 0.47, z: cz + 0.05, c: MUGS[1] });
        }
        break;
      case 'bartable':
        add(rbox(w - 0.1, 0.06, 0.62, 0.03, 0.004), clay('#efe9df'), cx, 1.04, cz - 0.1);
        add(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 10), clay(P.dark), cx, 0.52, cz - 0.1, { cast: false });
        add(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 20), clay(P.dark), cx, 0.02, cz - 0.1, { cast: false });
        for (let i = 0; i < w; i++) {
          const sx = it.x + i + 0.5, sz = cz + 0.48;
          add(new THREE.CylinderGeometry(0.18, 0.16, 0.08, 18), clay(P.grey), sx, 0.74, sz);
          add(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 8), clay(P.dark), sx, 0.35, sz, { cast: false });
          add(new THREE.TorusGeometry(0.13, 0.015, 6, 18).rotateX(Math.PI / 2), clay(P.dark), sx, 0.3, sz, { cast: false });
        }
        mugs.push({ x: cx + 0.4, y: 1.07, z: cz - 0.15, c: MUGS[2] });
        break;
      case 'cabinet': {
        add(rbox(w - 0.06, 0.9, h - 0.22, 0.04, 0.005, cx), clay(P.white), cx, 0.45, cz);
        for (let i = 0; i < w; i++) for (let j = 0; j < 3; j++) { // drawer fronts with handles, on both sides
          for (const s of [-1, 1]) {
            add(rbox(0.86, 0.24, 0.03, 0.02, 0), clay('#ece6db'), it.x + i + 0.5, 0.16 + j * 0.28, cz + s * (h / 2 - 0.1), { cast: false });
            add(rbox(0.2, 0.025, 0.03, 0.012, 0), clay(P.steel), it.x + i + 0.5, 0.22 + j * 0.28, cz + s * (h / 2 - 0.08), { cast: false });
          }
        }
        add(rbox(w - 0.3, 0.18, h - 0.45, 0.04, 0.005), clay('#454a52'), cx, 0.99, cz); // planter
        for (let i = 0; i < w * 3; i++) plantAt(it.x + 0.25 + i * (w - 0.5) / Math.max(1, w * 3 - 1), cz, 1.1, 0.8, 5);
        for (let i = 0; i < w * 4; i++) { const tx = it.x + 0.2 + i * (w - 0.4) / (w * 4 - 1), s = i % 2 ? 1 : -1; for (let k = 0; k < 3; k++) leaves.push({ x: tx, z: cz + s * (h / 2 - 0.12 + k * 0.02), y: 0.95 - k * 0.12, s: 0.35, r: i + k }); } // trailing leaves
        break;
      }
      case 'locker': {
        const vert = h > w, n = (vert ? h : w) * 2;
        add(rbox(w - 0.04, WALL_H - 0.1, h - 0.04, 0.04, 0.004, cx), clay(P.woodDark), cx, (WALL_H - 0.1) / 2, cz);
        for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) { // doors, handles and number plates
          const along = it[vert ? 'y' : 'x'] + (i + 0.5) / 2, yy = 0.32 + j * 0.62;
          const fx = vert ? it.x + w - 0.01 : along, fz = vert ? along : it.y - 0.01;
          add(rbox(vert ? 0.03 : 0.44, 0.56, vert ? 0.44 : 0.03, 0.02, 0.003), clay(P.wood), fx, yy, fz, { cast: false });
          add(rbox(vert ? 0.03 : 0.1, 0.05, vert ? 0.1 : 0.03, 0.012, 0), clay('#f1e5c8'), fx + (vert ? 0.01 : 0), yy + 0.18, fz - (vert ? 0 : 0.01), { cast: false });
          add(blob(0.02, 1, 0), clay('#d9b45a'), fx + (vert ? 0.02 : 0.14), yy, fz - (vert ? -0.12 : 0.02), { cast: false });
        }
        break;
      }
      case 'plant':
        add(new THREE.CylinderGeometry(0.2, 0.15, 0.38, 16), clay(hash(it.x, it.y) < 0.5 ? P.pot : '#e8e2d6'), cx, 0.19, cz);
        add(new THREE.CylinderGeometry(0.19, 0.19, 0.02, 16), clay('#5b4636'), cx, 0.38, cz, { cast: false }); // soil
        if (hash(it.y, it.x) < 0.5) { // a tall snake plant
          for (let i = 0; i < 7; i++) { const a = i * 0.9; add(rbox(0.06, 0.6 + hash(i, it.x) * 0.3, 0.02, 0.02, 0.01, i), clay(i % 2 ? P.green2 : '#78b356'), cx + Math.cos(a) * 0.07, 0.68, cz + Math.sin(a) * 0.07, { ry: a, rz: Math.cos(a) * 0.15, cast: false }); }
        } else { plantAt(cx, cz, 0.55, 1.5, 8); plantAt(cx, cz, 0.82, 1.1, 6); }
        break;
      case 'reception': {
        add(rbox(w - 0.1, 1.0, h - 0.4, 0.15, 0.008, cx), clay(P.white), cx, 0.5, cz - 0.1);
        add(rbox(w + 0.06, 0.06, 0.44, 0.03, 0.004), clay(P.wood), cx, 1.03, cz - 0.55);
        add(rbox(w - 0.3, 0.04, h - 0.7, 0.02, 0), clay(P.white), cx, 0.74, cz + 0.05, { cast: false }); // inner worktop
        monitors.push({ x: cx, z: cz - 0.15, s: 1, k: 5 }); keyboards.push({ x: cx, z: cz + 0.1 });
        add(new THREE.SphereGeometry(0.04, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), clay('#d9b45a'), cx + 0.6, 1.06, cz - 0.55, { cast: false }); // bell
        vase(cx - 0.6, 1.06, cz - 0.55);
        officeChair(cx, cz + 0.85, 0);
        break;
      }
      case 'shelf': {
        add(rbox(0.86, WALL_H - 0.15, h - 0.04, 0.03, 0.004), clay('#8f959d'), it.x + 0.47, (WALL_H - 0.15) / 2, cz);
        const items = [];
        for (let j = 0; j < 3; j++) for (let i = 0; i < h * 4; i++) items.push({ y: 0.2 + j * 0.4, z: it.y + 0.15 + i * 0.24, k: i * 3 + j });
        many(rbox(0.5, 0.26, 0.2, 0.03, 0.01), clay('#c9a46a'), items.filter(b => hash(b.k, 1) < 0.5), (o, b) => { o.position.set(it.x + 0.42, b.y + 0.13, b.z); o.rotation.y = (hash(b.k, 2) - 0.5) * 0.2; });
        many(rbox(0.36, 0.3, 0.07, 0.02, 0.004), clay('#5a8fd0'), items.filter(b => hash(b.k, 1) >= 0.5 && hash(b.k, 3) < 0.5), (o, b) => o.position.set(it.x + 0.42, b.y + 0.15, b.z));
        many(rbox(0.36, 0.3, 0.07, 0.02, 0.004), clay('#e85d5d'), items.filter(b => hash(b.k, 1) >= 0.5 && hash(b.k, 3) >= 0.5), (o, b) => o.position.set(it.x + 0.42, b.y + 0.15, b.z));
        break;
      }
      case 'rack': {
        add(rbox(w - 0.18, WALL_H - 0.2, h - 0.04, 0.04, 0.004, cz), clay('#2a2d33'), cx, (WALL_H - 0.2) / 2, cz);
        const leds = [];
        for (let i = 0; i < h * 8; i++) leds.push({ y: 0.15 + (i % 8) * 0.14, z: it.y + 0.25 + Math.floor(i / 8) + hash(i, 2) * 0.5, g: i % 3 !== 0 });
        many(blob(0.018, 1, 0), new THREE.MeshBasicMaterial({ color: '#57ff86' }), leds.filter(l => l.g), (o, l) => o.position.set(it.x + w - 0.08, l.y, l.z));
        many(blob(0.018, 1, 0), new THREE.MeshBasicMaterial({ color: '#58b4ff' }), leds.filter(l => !l.g), (o, l) => o.position.set(it.x + w - 0.08, l.y, l.z));
        many(rbox(0.02, 0.04, 0.7, 0.01, 0), clay('#3c4048'), [...Array(h * 8)].map((_, i) => i), (o, i) => o.position.set(it.x + w - 0.09, 0.12 + (i % 8) * 0.14, it.y + 0.5 + Math.floor(i / 8))); // vents
        break;
      }
      case 'toilet':
        add(blob(0.17, 2, 0.01), clay('#ffffff'), cx, 0.24, cz - 0.04, { s: [1, 0.8, 1.2] });
        add(new THREE.TorusGeometry(0.13, 0.025, 8, 20).rotateX(Math.PI / 2), clay('#f0ede6'), cx, 0.36, cz - 0.06, { s: [1, 1, 1.2], cast: false });
        add(rbox(0.38, 0.4, 0.15, 0.05, 0.005), clay('#ffffff'), cx, 0.48, cz + 0.32);
        add(new THREE.CylinderGeometry(0.09, 0.08, 0.26, 12), clay(P.steel), cx + 0.36, 0.13, cz + 0.3, { cast: false }); // bin
        break;
      case 'partition':
        add(rbox(0.05, 1.2, h - 0.02, 0.02, 0.003), clay('#a9b4c0'), cx, 0.72, cz);
        break;
      case 'sink': {
        add(rbox(0.55, 0.1, h - 0.1, 0.04, 0.004), clay(P.white), it.x + 0.7, 0.84, cz);
        for (let i = 0; i < h; i++) {
          add(new THREE.SphereGeometry(0.15, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), clay('#e6ebee', { side: THREE.DoubleSide }), it.x + 0.7, 0.88, it.y + i + 0.5, { cast: false });
          add(rbox(0.04, 0.16, 0.04, 0.015, 0), clay(P.steel), it.x + 0.92, 0.96, it.y + i + 0.5, { cast: false }); // tap
        }
        add(rbox(0.03, 0.7, h - 0.3, 0.015, 0), new THREE.MeshPhysicalMaterial({ color: '#dfeaf0', roughness: 0.05, metalness: 0.9 }), it.x + 0.99, 1.15, cz, { cast: false }); // mirror
        add(rbox(0.12, 0.26, 0.24, 0.04, 0.004), clay(P.white), it.x + 0.92, 1.0, it.y - 0.15 + h, { cast: false }); // hand dryer
        break;
      }
      case 'copier':
        add(rbox(0.82, 0.9, 0.66, 0.08, 0.008, cx), clay('#dfe2e6'), cx, 0.45, cz);
        add(rbox(0.6, 0.06, 0.4, 0.03, 0), clay('#b9bec5'), cx, 0.93, cz);
        add(rbox(0.3, 0.04, 0.14, 0.015, 0), new THREE.MeshBasicMaterial({ color: '#86d0ff' }), cx + 0.15, 0.97, cz + 0.22, { rx: -0.4, cast: false });
        add(rbox(0.42, 0.06, 0.3, 0.01, 0), clay('#ffffff'), cx - 0.05, 0.99, cz - 0.05, { cast: false }); // paper
        break;
      case 'elevator': {
        add(rbox(0.12, WALL_H - 0.12, h - 0.04, 0.03, 0.003), clay('#9aa3ad'), it.x + 0.08, (WALL_H - 0.12) / 2, cz); // frame
        for (const s of [-1, 1]) add(rbox(0.06, WALL_H - 0.32, h / 2 - 0.12, 0.02, 0.002), clay(P.steel), it.x + 0.16, (WALL_H - 0.28) / 2, cz + s * (h / 4 - 0.02));
        add(rbox(0.04, 0.1, 0.36, 0.02, 0), new THREE.MeshBasicMaterial({ color: '#ffb547' }), it.x + 0.16, WALL_H - 0.12, cz, { cast: false }); // floor display
        add(rbox(0.03, 0.18, 0.08, 0.015, 0), clay('#d9dde2'), it.x + 0.12, 0.75, it.y + h + 0.15, { cast: false });
        add(blob(0.02, 1, 0), new THREE.MeshBasicMaterial({ color: '#ffd36b' }), it.x + 0.15, 0.78, it.y + h + 0.15, { cast: false });
        break;
      }
      case 'counter': {
        add(rbox(0.62, 0.86, h - 0.04, 0.04, 0.004, cz), clay(P.white), it.x + 0.31, 0.43, cz);
        add(rbox(0.68, 0.05, h + 0.02, 0.02, 0), clay('#5a5f68'), it.x + 0.34, 0.885, cz);
        for (let i = 0; i < h; i++) add(rbox(0.03, 0.7, 0.44, 0.015, 0), clay('#ece6db'), it.x + 0.63, 0.43, it.y + i + 0.5, { cast: false }); // cupboard doors
        add(rbox(0.58, 0.45, h - 0.04, 0.04, 0.004), clay(P.white), it.x + 0.29, WALL_H - 0.3, cz); // wall cupboards
        add(rbox(0.3, 0.04, 0.4, 0.02, 0), clay('#c7ced4'), it.x + 0.3, 0.9, it.y + 0.5, { cast: false }); // sink
        add(new THREE.TorusGeometry(0.06, 0.012, 6, 12, Math.PI), clay(P.steel), it.x + 0.12, 0.98, it.y + 0.5, { ry: Math.PI / 2, cast: false }); // tap
        add(rbox(0.24, 0.32, 0.22, 0.04, 0.004), clay('#2e3238'), it.x + 0.26, 1.07, it.y + 1.45); // coffee machine
        mugs.push({ x: it.x + 0.33, y: 0.91, z: it.y + 1.45, c: MUGS[3] });
        add(blob(0.09, 2, 0.005), clay('#e85d5d'), it.x + 0.3, 1.0, it.y + 1.05, { s: [1, 1.1, 1] }); // kettle
        break;
      }
      case 'fridge':
        add(rbox(0.7, WALL_H - 0.15, 0.76, 0.06, 0.004), clay('#e3e7eb'), it.x + 0.37, (WALL_H - 0.15) / 2, cz);
        add(rbox(0.04, 0.4, 0.04, 0.015, 0), clay(P.steel), it.x + 0.74, 0.8, cz + 0.3, { cast: false });
        for (let i = 0; i < 4; i++) add(rbox(0.015, 0.06, 0.08, 0.008, 0), clay(MUGS[i]), it.x + 0.73, 0.9 + hash(i, 2) * 0.3, cz - 0.25 + i * 0.1, { cast: false }); // magnets
        break;
      case 'pendant': { // a big white dome lamp, glowing yellow underneath
        const px = it.x + 0.5, pz = it.y + 0.5;
        add(new THREE.SphereGeometry(0.3, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), clay(P.white, { side: THREE.DoubleSide }), px, WALL_H - 0.32, pz, { cast: false });
        add(new THREE.CircleGeometry(0.29, 28).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffe680' }), px, WALL_H - 0.325, pz, { cast: false });
        add(new THREE.CylinderGeometry(0.008, 0.008, 0.32, 4), clay(P.dark), px, WALL_H - 0.16, pz, { cast: false });
        const lamp = new THREE.PointLight('#ffe9b0', 2.2, 4.5, 1.2); lamp.position.set(px, WALL_H - 0.45, pz); scene.add(lamp);
        break;
      }
    }
  }

  function fruitBowl(x, y, z) {
    add(new THREE.SphereGeometry(0.16, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), clay('#f6f1e8', { side: THREE.DoubleSide }), x, y + 0.13, z, { cast: false });
    [['#e85d5d', 0.05, 0], ['#f4c64a', -0.05, 0.03], ['#6dbf5b', 0, -0.06], ['#f28c38', 0.02, 0.06]].forEach(([c, dx, dz]) => add(blob(0.05, 1, 0.004), clay(c), x + dx, y + 0.06, z + dz, { cast: false }));
  }
  function vase(x, y, z) {
    add(new THREE.CylinderGeometry(0.05, 0.07, 0.2, 12), clay('#5aa9e6'), x, y + 0.1, z, { cast: false });
    for (let i = 0; i < 4; i++) add(blob(0.04, 1, 0.01), clay(['#f28c38', '#e85d5d', '#f4c64a', '#ffffff'][i]), x + Math.cos(i * 1.6) * 0.05, y + 0.27 + (i % 2) * 0.04, z + Math.sin(i * 1.6) * 0.05, { cast: false });
  }
  function wobbleDisc(w, d) { const g = new THREE.CylinderGeometry(0.5, 0.5, 0.02, 40); g.scale(w, 1, d); return g; }

  // ---- wall decorations: framed art along the corridors, TVs and whiteboards in the meeting rooms, a clock, signs
  const arts = [0, 1, 2, 3].map(k => canvasTex(160, 120, (x, w, h) => { // aerial landscapes, like the one in the photo
    const sky = x.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, ['#8fb7d9', '#e7b79a', '#a9c6a0', '#cfc3e6'][k]); sky.addColorStop(1, ['#e4d3b4', '#7c6a8a', '#e6d9b8', '#8ea7c9'][k]);
    x.fillStyle = sky; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) { x.fillStyle = `rgba(${60 + i * 25},${70 + i * 18},${80 + i * 10},.35)`; x.beginPath(); x.moveTo(0, h * (0.35 + i * 0.12)); for (let s = 0; s <= 8; s++) x.lineTo(s * w / 8, h * (0.3 + i * 0.12) + Math.sin(s * 1.3 + k + i) * 10); x.lineTo(w, h); x.lineTo(0, h); x.fill(); }
  }));
  const hang = (tex, x, z, ny, wdt = 0.7, hgt = 0.5) => { // ny: the wall faces +z (1) or -z (-1)
    add(rbox(wdt + 0.08, hgt + 0.08, 0.05, 0.02, 0.003), clay(P.woodDark), x, 0.95, z + ny * 0.025, { cast: false });
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(wdt, hgt), new THREE.MeshBasicMaterial({ map: tex })); pic.position.set(x, 0.95, z + ny * 0.052); if (ny < 0) pic.rotation.y = Math.PI; scene.add(pic);
  };
  let n = 0;
  for (let x = 2; x < COLS - 2; x++) {
    if (G.grid[9][x] === 1 && G.grid[10][x] === 0 && G.grid[9][x + 1] === 1 && x % 5 === 2) hang(arts[n++ % 4], x + 1, 10, 1);
    if (G.grid[21][x] === 1 && G.grid[20][x] === 0 && G.grid[21][x + 1] === 1 && x % 6 === 3) hang(arts[n++ % 4], x + 1, 21, -1);
  }
  const boardTex = canvasTex(256, 128, (x, w, h) => { x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h); x.lineWidth = 3; for (const [c, y] of [['#2f6fb3', 30], ['#e85d5d', 60], ['#3a9b4a', 90]]) { x.strokeStyle = c; x.beginPath(); x.moveTo(20, y); for (let i = 1; i < 8; i++) x.lineTo(20 + i * 25, y + Math.sin(i * 2 + y) * 8); x.stroke(); } x.strokeStyle = '#2f6fb3'; x.strokeRect(170, 20, 60, 40); });
  for (const r of O.rooms.filter(r => r.type === 'meeting')) {
    const zc = (r.y0 + r.y1 + 1) / 2;
    const tv = add(rbox(0.05, 0.55, 0.95, 0.025, 0), clay('#24272c'), r.x1 + 0.97, 0.95, zc, { cast: false }); // TV on the end wall
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.48), new THREE.MeshBasicMaterial({ color: '#2a4f7a' })); screen.position.set(-0.03, 0, 0); screen.rotation.y = -Math.PI / 2; tv.add(screen);
    const wb = add(rbox(0.04, 0.6, 1.3, 0.02, 0), clay('#d9dde2'), r.x0 + 0.02, 0.95, zc, { cast: false }); // whiteboard on the other
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.54), new THREE.MeshBasicMaterial({ map: boardTex })); face.position.set(0.025, 0, 0); face.rotation.y = Math.PI / 2; wb.add(face);
  }
  const lounge = O.rooms.find(r => r.type === 'lounge');
  if (lounge) { // a wall clock
    const clockTex = canvasTex(128, 128, (x, w) => { x.fillStyle = '#fffaf0'; x.beginPath(); x.arc(64, 64, 62, 0, 7); x.fill(); x.fillStyle = '#3d414a'; for (let i = 0; i < 12; i++) x.fillRect(64 + Math.cos(i * 0.52) * 50 - 3, 64 + Math.sin(i * 0.52) * 50 - 3, 6, 6); x.lineWidth = 6; x.strokeStyle = '#3d414a'; x.beginPath(); x.moveTo(64, 64); x.lineTo(64, 26); x.moveTo(64, 64); x.lineTo(92, 74); x.stroke(); });
    add(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 28), clay('#e85d5d'), lounge.x0 - 0.02, 1.1, lounge.y0 + 5.5, { rz: Math.PI / 2, cast: false });
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.17, 28), new THREE.MeshBasicMaterial({ map: clockTex })); face.position.set(lounge.x0 + 0.01, 1.1, lounge.y0 + 5.5); face.rotation.y = Math.PI / 2; scene.add(face);
  }
  const sign = (text, bg, x, y, z, ry, w = 0.6) => {
    const tex = canvasTex(256, 96, (c, cw, ch) => { c.fillStyle = bg; c.fillRect(0, 0, cw, ch); c.fillStyle = '#ffffff'; c.font = 'bold 54px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, cw / 2, ch / 2 + 3); });
    const b = add(rbox(w + 0.06, w * 0.38 + 0.06, 0.05, 0.03, 0), clay(bg), x, y, z, { ry, cast: false });
    const f = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.375), new THREE.MeshBasicMaterial({ map: tex })); f.position.z = 0.027; b.add(f);
  };
  sign('STAIRS', '#1b8a3a', 3.5, WALL_H - 0.25, 10.03, 0);
  sign('KEYBOUND', '#3d414a', 11.97, 1.0, 15, -Math.PI / 2, 1.1); // the company name behind reception

  // ---- everything collected above, drawn together
  const seatGeo = rbox(0.44, 0.09, 0.42, 0.04, 0.006), backGeo = rbox(0.42, 0.4, 0.07, 0.035, 0.006);
  for (const color of [...new Set(chairs.map(c => c.c))]) {
    const list = chairs.filter(c => c.c === color);
    many(seatGeo, clay(color), list, (o, c) => { o.position.set(c.x, 0.46, c.z); o.rotation.y = c.a; }, { cast: true });
    many(backGeo, clay(color), list, (o, c) => { o.position.set(c.x - Math.sin(c.a) * 0.2, 0.72, c.z + Math.cos(c.a) * 0.2); o.rotation.set(Math.cos(c.a) * 0.12, c.a, -Math.sin(c.a) * 0.12, 'YXZ'); }, { cast: true });
  }
  many(new THREE.CylinderGeometry(0.03, 0.03, 0.36, 8), clay(P.dark), chairs, (o, c) => o.position.set(c.x, 0.25, c.z));
  const legs = chairs.flatMap(c => [0, 1, 2, 3, 4].map(i => ({ ...c, i })));
  many(rbox(0.24, 0.035, 0.05, 0.015, 0), clay(P.dark), legs, (o, l) => { const a = l.a + l.i * 1.2566; o.position.set(l.x + Math.cos(a) * 0.11, 0.06, l.z + Math.sin(a) * 0.11); o.rotation.y = -a; });
  many(blob(0.03, 1, 0), clay('#22252a'), legs, (o, l) => { const a = l.a + l.i * 1.2566; o.position.set(l.x + Math.cos(a) * 0.22, 0.03, l.z + Math.sin(a) * 0.22); });
  const screens = [0, 1, 2].map(k => new THREE.MeshBasicMaterial({ map: canvasTex(128, 80, (x, w, h) => { // something on every screen
    x.fillStyle = ['#1f3b5c', '#f4f6f8', '#273042'][k]; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) { x.fillStyle = ['#5aa9e6', '#f4c64a', '#6dbf5b', '#e85d5d'][(i + k) % 4]; x.fillRect(10, 10 + i * 11, 30 + hash(i, k) * 70, 6); }
  }) }));
  many(rbox(0.5, 0.3, 0.04, 0.02, 0.002), clay('#2c3036'), monitors, (o, m) => { o.position.set(m.x, 0.97, m.z); o.rotation.y = m.s < 0 ? Math.PI : 0; });
  many(rbox(0.06, 0.16, 0.04, 0.02, 0), clay('#2c3036'), monitors, (o, m) => o.position.set(m.x, 0.84, m.z - m.s * 0.02));
  many(rbox(0.22, 0.02, 0.15, 0.01, 0), clay('#2c3036'), monitors, (o, m) => o.position.set(m.x, 0.775, m.z - m.s * 0.02));
  screens.forEach((mat, k) => many(new THREE.PlaneGeometry(0.44, 0.25), mat, monitors.filter(m => m.k % 3 === k), (o, m) => { o.position.set(m.x, 0.97, m.z + m.s * 0.022); o.rotation.y = m.s < 0 ? Math.PI : 0; }));
  many(rbox(0.34, 0.025, 0.12, 0.012, 0), clay('#e3e6ea'), keyboards, (o, k) => o.position.set(k.x, 0.775, k.z));
  many(blob(0.03, 1, 0), clay('#e3e6ea'), keyboards, (o, k) => { o.position.set(k.x + 0.24, 0.775, k.z); o.scale.set(1, 0.5, 1.4); });
  for (const c of MUGS) {
    const list = mugs.filter(m => m.c === c);
    many(new THREE.CylinderGeometry(0.04, 0.035, 0.09, 12), clay(c), list, (o, m) => o.position.set(m.x, m.y + 0.045, m.z));
    many(new THREE.TorusGeometry(0.025, 0.008, 6, 10), clay(c), list, (o, m) => o.position.set(m.x + 0.045, m.y + 0.05, m.z));
  }
  many(rbox(0.21, 0.012, 0.29, 0.004, 0), clay('#ffffff'), papers.flatMap(p => [...Array(p.n)].map((_, i) => ({ ...p, i }))), (o, p) => { o.position.set(p.x, (p.y || 0.77) + 0.012 * p.i, p.z); o.rotation.y = p.a + p.i * 0.15; if (p.pad) o.scale.set(0.8, 1, 0.9); });
  many(rbox(0.22, 0.014, 0.3, 0.004, 0), clay('#f4c64a'), papers.filter(p => p.pad || p.mag), (o, p) => { o.position.set(p.x + 0.02, (p.y || 0.77) - 0.002, p.z + 0.02); o.rotation.y = p.a; if (p.pad) o.scale.set(0.8, 1, 0.9); });
  many(blob(0.12, 1, 0.025, 2), clay(P.green), leaves.filter(l => l.r % 2), (o, l) => { o.position.set(l.x, l.y, l.z); o.scale.set(l.s, l.s * 0.75, l.s); o.rotation.y = l.r; });
  many(blob(0.12, 1, 0.025, 4), clay(P.green2), leaves.filter(l => !(l.r % 2)), (o, l) => { o.position.set(l.x, l.y, l.z); o.scale.set(l.s, l.s * 0.75, l.s); o.rotation.y = l.r; });
  return {};
}
