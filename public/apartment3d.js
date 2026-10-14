// The apartment map in 3D: room floors, wallpapered walls, windows, real flights of stairs, doors that swing
// open, furniture, and a few animated touches (flickering hallway lamps, TVs, ceiling fans).
// Map space -> 3D: x = tile x, z = tile y, y is up; one tile is one unit.
import * as THREE from 'three';

const Sh = window.Shared;
const { COLS, ROWS } = Sh.C;

function canvasTex(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const std = (color, extra) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
const basic = (color, extra) => new THREE.MeshBasicMaterial({ color, ...extra });
function box(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

// ---------------------------------------------------------------- textures
const TEX = {
  wood: () => canvasTex(128, (x, n) => {
    x.fillStyle = '#7a5236'; x.fillRect(0, 0, n, n);
    for (let i = 0; i < 4; i++) {
      x.fillStyle = ['#7a5236', '#6e4a30', '#845a3c', '#724c33'][i]; x.fillRect(0, i * 32, n, 32);
      x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, i * 32, n, 2); x.fillRect(((i * 53) % 96) + 16, i * 32, 2, 32);
      x.strokeStyle = 'rgba(40,20,10,.18)'; x.lineWidth = 1;
      for (let k = 0; k < 5; k++) { x.beginPath(); x.moveTo(0, i * 32 + 6 + k * 5); x.bezierCurveTo(40, i * 32 + 4 + k * 5, 80, i * 32 + 9 + k * 5, n, i * 32 + 6 + k * 5); x.stroke(); }
    }
  }),
  carpet: (base, fleck) => () => canvasTex(64, (x, n) => {
    x.fillStyle = base; x.fillRect(0, 0, n, n);
    for (let i = 0; i < 260; i++) { x.fillStyle = fleck; x.fillRect((i * 37) % n, (i * 53 + (i >> 3)) % n, 1, 1); }
  }),
  runner: () => canvasTex(128, (x, n) => { // hallway carpet with a gold border
    x.fillStyle = '#3e1c20'; x.fillRect(0, 0, n, n);
    x.fillStyle = '#7a2f37'; x.fillRect(10, 0, n - 20, n);
    x.fillStyle = '#c9a24e'; x.fillRect(14, 0, 4, n); x.fillRect(n - 18, 0, 4, n);
    x.fillStyle = 'rgba(201,162,78,.35)';
    for (let y = 8; y < n; y += 32) { x.beginPath(); x.moveTo(n / 2, y); x.lineTo(n / 2 + 14, y + 14); x.lineTo(n / 2, y + 28); x.lineTo(n / 2 - 14, y + 14); x.closePath(); x.fill(); }
  }),
  tiles: () => canvasTex(128, (x, n) => {
    x.fillStyle = '#c9d2d8'; x.fillRect(0, 0, n, n);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#d8e0e5' : '#bcc6cd'; x.fillRect(i * 32 + 1, j * 32 + 1, 30, 30); }
  }),
  wall: () => canvasTex(256, (x, n) => { // wallpaper above a wooden wainscot
    x.fillStyle = '#b9a98a'; x.fillRect(0, 0, n, n);
    x.fillStyle = 'rgba(120,95,70,.25)';
    for (let i = 0; i < n; i += 32) x.fillRect(i, 0, 12, n);
    x.fillStyle = 'rgba(255,255,255,.08)';
    for (let i = 16; i < n; i += 64) for (let y = 10; y < n * 0.6; y += 40) { x.beginPath(); x.arc(i + 6, y, 5, 0, Math.PI * 2); x.fill(); }
    const w = n * 0.64; // the bottom third is wood panelling
    x.fillStyle = '#5a3d29'; x.fillRect(0, w, n, n - w);
    x.fillStyle = '#7a5538'; x.fillRect(0, w, n, 8);
    x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 2;
    for (let i = 0; i < n; i += 64) x.strokeRect(i + 8, w + 18, 48, n - w - 30);
    x.fillStyle = '#3a271a'; x.fillRect(0, n - 10, n, 10); // skirting board
  }),
  ceiling: () => canvasTex(64, (x, n) => { x.fillStyle = '#d8d2c6'; x.fillRect(0, 0, n, n); x.strokeStyle = 'rgba(0,0,0,.08)'; x.strokeRect(0.5, 0.5, n - 1, n - 1); }),
};

// ---------------------------------------------------------------- furniture models (built facing +x, against a wall at -x)
const MATS = {};
function mats() {
  if (MATS.wood) return MATS;
  Object.assign(MATS, {
    wood: std('#6b4528'), darkWood: std('#3e2818'), white: std('#e8ebee', { roughness: 0.4 }), cream: std('#d9cdb4'),
    granite: std('#4a4a50', { roughness: 0.3 }), black: std('#141416', { roughness: 0.3 }), metal: std('#9aa0a6', { roughness: 0.25, metalness: 0.6 }),
    sheet: std('#ece6da'), leaf: std('#3f8a3a'), leaf2: std('#2f6f2c'), pot: std('#8a4f30'), water: std('#8fc3dc', { roughness: 0.1 }),
    mirror: std('#b8c8d4', { roughness: 0.05, metalness: 0.8 }), shade: basic('#ffd9a0'),
  });
  return MATS;
}

function furnitureModel(f) {
  const M = mats(), g = new THREE.Group(), L = f.len;
  const fabric = std(f.color), fabricDark = std(new THREE.Color(f.color).multiplyScalar(0.7));
  let tv = null;
  switch (f.type) {
    case 'sofa':
      box(0.62, 0.2, L - 0.12, fabric, 0.06, 0.12, 0, g);
      box(0.2, 0.5, L - 0.12, fabricDark, -0.36, 0.25, 0, g);
      for (const s of [-1, 1]) box(0.62, 0.32, 0.12, fabricDark, 0.06, 0.16, s * (L / 2 - 0.12), g);
      for (let i = 0; i < L * 2; i++) box(0.46, 0.07, (L - 0.4) / (L * 2) - 0.03, fabric, 0.1, 0.25, -(L - 0.4) / 2 + (i + 0.5) * (L - 0.4) / (L * 2), g);
      break;
    case 'bed':
      box(0.9, 0.18, L - 0.06, M.wood, 0, 0.09, 0, g);
      box(0.84, 0.13, L - 0.14, M.sheet, 0, 0.245, 0.02, g);
      box(0.88, 0.05, (L - 0.14) * 0.62, fabric, 0, 0.32, (L - 0.14) * 0.19 + 0.02, g);
      box(0.6, 0.08, 0.24, M.sheet, 0, 0.35, -L / 2 + 0.24, g);
      box(0.9, 0.55, 0.06, M.darkWood, 0, 0.275, -L / 2 + 0.03, g);
      break;
    case 'tv': {
      box(0.36, 0.26, 0.84, M.wood, -0.26, 0.13, 0, g);
      box(0.05, 0.36, 0.7, M.black, -0.3, 0.46, 0, g);
      tv = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.3), basic('#223'));
      tv.rotation.y = Math.PI / 2; tv.position.set(-0.27, 0.46, 0); g.add(tv);
      break;
    }
    case 'counter':
      box(0.6, 0.44, L - 0.02, M.cream, -0.2, 0.22, 0, g);
      box(0.66, 0.05, L, M.granite, -0.17, 0.465, 0, g);
      box(0.32, 0.32, L - 0.02, M.cream, -0.34, 1.0, 0, g); // wall cabinets
      box(0.3, 0.04, 0.36, M.metal, -0.15, 0.48, -L / 2 + 0.45, g); // sink
      box(0.03, 0.16, 0.03, M.metal, -0.4, 0.56, -L / 2 + 0.45, g); // tap
      if (L > 1) for (const [dx, dz] of [[-0.1, 0.35], [0.1, 0.35], [-0.1, 0.65], [0.1, 0.65]]) {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 14), M.black); ring.position.set(-0.17 + dx, 0.5, dz); g.add(ring);
      }
      break;
    case 'fridge':
      box(0.62, 1.08, 0.8, M.white, -0.18, 0.54, 0, g);
      box(0.01, 0.01, 0.78, M.metal, 0.13, 0.72, 0, g);
      box(0.03, 0.35, 0.03, M.metal, 0.14, 0.5, 0.3, g); box(0.03, 0.2, 0.03, M.metal, 0.14, 0.88, 0.3, g);
      break;
    case 'wardrobe':
      box(0.56, 1.18, 0.92, M.darkWood, -0.21, 0.59, 0, g);
      box(0.01, 1.1, 0.01, M.black, 0.075, 0.6, 0, g);
      for (const z of [-0.05, 0.05]) box(0.03, 0.06, 0.03, M.metal, 0.09, 0.62, z, g);
      break;
    case 'nightstand': {
      box(0.42, 0.3, 0.42, M.wood, -0.2, 0.15, 0, g);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.18, 10), M.metal); base.position.set(-0.22, 0.39, 0); g.add(base);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.14, 14, 1, true), M.shade); shade.position.set(-0.22, 0.52, 0); g.add(shade);
      break;
    }
    case 'plant': {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.26, 12), M.pot); pot.position.set(-0.1, 0.13, 0); pot.castShadow = true; g.add(pot);
      for (let i = 0; i < 7; i++) {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.12 + (i % 3) * 0.03, 8, 6), i % 2 ? M.leaf : M.leaf2);
        leaf.position.set(-0.1 + Math.cos(i * 0.9) * 0.1, 0.36 + (i % 4) * 0.08, Math.sin(i * 0.9) * 0.1); leaf.castShadow = true; g.add(leaf);
      }
      break;
    }
    case 'bathtub':
      box(0.72, 0.34, L - 0.08, M.white, -0.1, 0.17, 0, g);
      box(0.56, 0.02, L - 0.3, M.water, -0.1, 0.33, 0, g);
      box(0.03, 0.2, 0.03, M.metal, -0.42, 0.42, -L / 2 + 0.2, g);
      break;
    case 'toilet': {
      box(0.16, 0.32, 0.36, M.white, -0.36, 0.3, 0, g);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.11, 0.24, 14), M.white); bowl.position.set(-0.12, 0.12, 0); bowl.castShadow = true; g.add(bowl);
      box(0.32, 0.03, 0.3, M.white, -0.13, 0.25, 0, g);
      break;
    }
    case 'sink':
      box(0.44, 0.42, 0.62, M.wood, -0.27, 0.21, 0, g);
      box(0.4, 0.06, 0.46, M.white, -0.27, 0.45, 0, g);
      box(0.02, 0.42, 0.5, M.mirror, -0.49, 0.86, 0, g);
      break;
  }
  return { g, tv };
}

// ---------------------------------------------------------------- the whole apartment
export function buildApartment(scene, G, WALL_H) {
  const A = { doors: [], tvs: [], fans: [], lamps: [], wallH: WALL_H };
  const roomAt = new Map();
  for (const r of G.rooms) for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) roomAt.set(y * COLS + x, r.type);
  const flightAt = new Map();
  for (const f of G.flights) for (let y = f.y0; y <= f.y1; y++) flightAt.set(y * COLS + f.x, f);
  const m4 = new THREE.Matrix4();

  // floors: one material per kind of room; no floor over a down flight (it's a hole)
  const floorMats = {
    hall: std('#ffffff', { map: TEX.runner() }), living: std('#ffffff', { map: TEX.wood() }), studio: null,
    bed: std('#ffffff', { map: TEX.carpet('#5c5578', '#6d6690')() }), bath: std('#ffffff', { map: TEX.tiles(), roughness: 0.35 }),
  };
  floorMats.studio = floorMats.living;
  const floorTiles = new Map(), ceilTiles = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (G.grid[y][x] === 1) continue;
    const f = flightAt.get(y * COLS + x);
    const type = roomAt.get(y * COLS + x) || 'hall';
    if (!f || f.up) { if (!floorTiles.has(type)) floorTiles.set(type, []); floorTiles.get(type).push([x, y]); }
    if (!f || !f.up) ceilTiles.push([x, y]);
  }
  const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  for (const [type, tiles] of floorTiles) {
    const mesh = new THREE.InstancedMesh(plane, floorMats[type], tiles.length);
    tiles.forEach(([x, y], i) => mesh.setMatrixAt(i, m4.makeTranslation(x + 0.5, 0, y + 0.5)));
    mesh.receiveShadow = true; scene.add(mesh);
  }
  const ceil = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(Math.PI / 2), std('#ffffff', { map: TEX.ceiling() }), ceilTiles.length);
  ceilTiles.forEach(([x, y], i) => ceil.setMatrixAt(i, m4.makeTranslation(x + 0.5, WALL_H, y + 0.5)));
  scene.add(ceil);

  // walls
  const wallTiles = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (G.grid[y][x] === 1) wallTiles.push([x, y]);
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, WALL_H, 1), std('#ffffff', { map: TEX.wall() }), wallTiles.length);
  wallTiles.forEach(([x, y], i) => walls.setMatrixAt(i, m4.makeTranslation(x + 0.5, WALL_H / 2, y + 0.5)));
  walls.castShadow = walls.receiveShadow = true;
  scene.add(walls);

  // windows on the outside walls of the flats, with moonlight coming in
  const glass = basic('#2c4a6e'), frame = std('#e2ddd2');
  for (const fl of G.floors) for (const [wx, dir] of [[fl.x0 - 1, 1], [fl.x1 + 1, -1]]) {
    for (let y = 1; y < ROWS - 1; y++) {
      const t = roomAt.get(y * COLS + wx + dir);
      if (!t || t === 'hall' || y % 2) continue;
      const fx = wx + 0.5 + dir * 0.505, win = new THREE.Group();
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.58), glass); pane.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2; win.add(pane);
      box(0.03, 0.66, 0.05, frame, 0, 0, -0.3, win); box(0.03, 0.66, 0.05, frame, 0, 0, 0.3, win);
      box(0.03, 0.05, 0.64, frame, 0, 0.33, 0, win); box(0.06, 0.05, 0.7, frame, dir * 0.02, -0.33, 0, win);
      box(0.03, 0.62, 0.025, frame, 0, 0, 0, win); box(0.03, 0.025, 0.6, frame, 0, 0, 0, win);
      win.position.set(fx, 0.82, y + 0.5); scene.add(win);
      const moon = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), basic('#7fa6d9', { transparent: true, opacity: 0.08, depthWrite: false }));
      moon.rotation.x = -Math.PI / 2; moon.position.set(fx + dir * 0.6, 0.01, y + 0.5); scene.add(moon); // a pale patch of moonlight on the floor
    }
  }

  // rugs
  for (const r of G.rooms) {
    if (r.type === 'hall' || r.type === 'bath' || r.y1 - r.y0 < 2) continue;
    const h = Math.min(3, r.y1 - r.y0) * 0.8;
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(1.6, h).rotateX(-Math.PI / 2), std(r.type === 'bed' ? '#8f7aa6' : '#8a3a30'));
    rug.position.set((r.x0 + r.x1 + 1) / 2, 0.006, (r.y0 + r.y1 + 1) / 2); rug.receiveShadow = true; scene.add(rug);
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(1.4, h - 0.2).rotateX(-Math.PI / 2), std(r.type === 'bed' ? '#a894c0' : '#b0704a'));
    edge.position.set(rug.position.x, 0.008, rug.position.z); edge.receiveShadow = true; scene.add(edge);
  }

  // stairs: real flights with a handrail. Up flights climb to the ceiling (there's an opening above);
  // down flights sink through an opening in the floor into a dark stairwell.
  const stepMat = std('#9a8c7a'), noseMat = std('#5a4030'), railMat = std('#5a3d29'), pitMat = std('#1a1714', { side: THREE.BackSide });
  const N = Sh.FLIGHT * 4;
  for (const f of G.flights) {
    const bottomEdge = f.dir < 0 ? f.y1 + 1 : f.y0; // where the flight starts (at floor level)
    for (let i = 0; i < N; i++) {
      const z = bottomEdge + f.dir * (i + 0.5) / 4;
      if (f.up) {
        const h = WALL_H * (i + 1) / N;
        box(0.94, h, 0.25, stepMat, f.x + 0.5, h / 2, z, scene);
        box(0.94, 0.02, 0.04, noseMat, f.x + 0.5, h + 0.01, z - f.dir * 0.11, scene);
      } else {
        const top = -WALL_H * (i + 1) / N, depth = WALL_H * 1.1 + top;
        box(0.94, depth, 0.25, stepMat, f.x + 0.5, top - depth / 2, z, scene);
      }
    }
    // handrail on the side facing the other flight, sloping with the steps
    const railX = f.x + (G.grid[f.y0][f.x + 1] === 0 ? 0.95 : 0.05), len = Sh.FLIGHT;
    const rise = f.up ? WALL_H : -WALL_H, slope = Math.atan2(rise, len);
    const rail = box(0.05, 0.05, Math.hypot(len, rise), railMat, railX, 0.55 + rise / 2, bottomEdge + f.dir * len / 2, scene);
    rail.rotation.x = -f.dir * slope;
    for (let i = 0; i <= len * 2; i++) {
      const zz = bottomEdge + f.dir * i / 2, yy = rise * i / (len * 2);
      box(0.03, 0.55, 0.03, railMat, railX, yy + 0.275, zz, scene);
    }
    if (!f.up) { // the stairwell below the opening
      const pit = new THREE.Mesh(new THREE.BoxGeometry(1, WALL_H * 1.2, Sh.FLIGHT), pitMat);
      pit.position.set(f.x + 0.5, -WALL_H * 0.6, (f.y0 + f.y1 + 1) / 2); scene.add(pit);
    } else { // the underside of the floor above, seen through the opening over an up flight
      const over = new THREE.Mesh(new THREE.PlaneGeometry(1, Sh.FLIGHT).rotateX(Math.PI / 2), std('#2a2622'));
      over.position.set(f.x + 0.5, WALL_H * 2, (f.y0 + f.y1 + 1) / 2); scene.add(over);
    }
  }

  // doors: a wooden leaf on a hinge, plus a lintel over the doorway
  const doorMat = std('#7a4e30'), lintelMat = std('#b9a98a'), knobMat = std('#c9a24e', { metalness: 0.7, roughness: 0.3 });
  const LH = WALL_H * 0.82;
  G.doors.forEach((d) => {
    const pivot = new THREE.Group();
    if (d.vert) { // in a north-south wall: hinge on the north side, the leaf runs south when shut
      pivot.position.set(d.x + 0.5, 0, d.y + 0.04);
      box(0.05, LH, 0.9, doorMat, 0, LH / 2, 0.46, pivot);
      box(0.06, 0.05, 0.05, knobMat, 0, LH * 0.5, 0.82, pivot).scale.x = 2;
      box(1, WALL_H - LH, 1, lintelMat, d.x + 0.5, (WALL_H + LH) / 2, d.y + 0.5, scene);
    } else { // in an east-west wall: hinge on the west side, the leaf runs east when shut
      pivot.position.set(d.x + 0.04, 0, d.y + 0.5);
      box(0.9, LH, 0.05, doorMat, 0.46, LH / 2, 0, pivot);
      box(0.05, 0.05, 0.06, knobMat, 0.82, LH * 0.5, 0, pivot).scale.z = 2;
      box(1, WALL_H - LH, 1, lintelMat, d.x + 0.5, (WALL_H + LH) / 2, d.y + 0.5, scene);
    }
    scene.add(pivot);
    A.doors.push({ pivot, vert: d.vert, swing: d.swing });
  });

  // furniture
  for (const f of G.furniture) {
    const { g, tv } = furnitureModel(f);
    g.position.set(f.x + 0.5, 0, f.y + f.len / 2);
    g.rotation.y = f.face > 0 ? 0 : Math.PI;
    scene.add(g);
    if (tv) A.tvs.push({ mat: tv.material, seed: Math.random() * 100 });
  }

  // ceiling fans in living rooms and studios, and lamps along the hallways
  const fanMat = std('#5a3d29'), hubMat = std('#c9a24e', { metalness: 0.6, roughness: 0.4 });
  for (const r of G.rooms) {
    if (r.type !== 'living' && r.type !== 'studio') continue;
    const fan = new THREE.Group(); fan.position.set((r.x0 + r.x1 + 1) / 2, WALL_H - 0.12, (r.y0 + r.y1 + 1) / 2);
    box(0.03, 0.12, 0.03, hubMat, 0, 0.06, 0, fan);
    const blades = new THREE.Group(); fan.add(blades);
    box(0.12, 0.05, 0.12, hubMat, 0, 0, 0, blades);
    for (let i = 0; i < 4; i++) { const b = box(0.55, 0.012, 0.1, fanMat, 0.32, 0, 0, null); const arm = new THREE.Group(); arm.rotation.y = i * Math.PI / 2; arm.add(b); blades.add(arm); }
    scene.add(fan);
    A.fans.push({ blades, speed: 2 + Math.random() * 2 });
  }
  for (const r of G.rooms) {
    if (r.type !== 'hall') continue;
    for (let y = r.y0 + Sh.FLIGHT + 1; y <= r.y1 - Sh.FLIGHT - 1; y += 4) {
      const mat = basic('#ffe2a8');
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.05, 16), mat);
      lamp.position.set(r.x0 + 1, WALL_H - 0.03, y + 0.5); scene.add(lamp);
      A.lamps.push({ mat, x: r.x0 + 1, z: y + 0.5, seed: Math.random() * 100 });
    }
  }
  // one real light: the hallway lamp nearest to you, flickering like the others
  A.hallLight = new THREE.PointLight('#ffd59a', 0, 4.5, 1.2);
  A.hallLight.castShadow = true; A.hallLight.shadow.mapSize.set(256, 256); A.hallLight.shadow.camera.near = 0.05; A.hallLight.shadow.bias = -0.003;
  scene.add(A.hallLight);
  return A;
}

// a lamp's brightness over time: mostly steady and dim, now and then it stutters
function flicker(t, seed) {
  const s = Math.sin(t * 1.7 + seed) * Math.sin(t * 3.1 + seed * 2);
  if (s > 0.93) return Math.random() < 0.5 ? 0.15 : 1;
  return 0.75 + 0.25 * Math.sin(t * 9 + seed);
}

export function updateApartment(A, f, t) {
  const { G, view } = f, TILE = Sh.C.TILE;
  A.doors.forEach((d, i) => {
    const a = G.doorOpen[i] * Math.PI / 2 * 0.95 * d.swing;
    d.pivot.rotation.y = d.vert ? a : -a;
  });
  for (const tv of A.tvs) { // a TV left on in an empty flat
    const k = 0.35 + 0.65 * Math.abs(Math.sin(t * 2.3 + tv.seed) * Math.sin(t * 7.1 + tv.seed * 3));
    tv.mat.color.setRGB(0.25 * k, 0.35 * k, 0.6 * k + 0.05);
  }
  for (const fan of A.fans) fan.blades.rotation.y = t * fan.speed;
  let best = null, bd = 1e9;
  const vx = view.x / TILE, vz = view.y / TILE, vf = Sh.floorOf(G.floors, view.x);
  for (const l of A.lamps) {
    const k = flicker(t, l.seed);
    l.mat.color.setRGB(k, k * 0.88, k * 0.66);
    const d = Math.hypot(l.x - vx, l.z - vz);
    if (d < bd && Sh.floorOf(G.floors, l.x * TILE) === vf) { bd = d; best = l; }
  }
  if (best) { A.hallLight.position.set(best.x, A.wallH - 0.15, best.z); A.hallLight.intensity = 1.1 * flicker(t, best.seed); }
}
