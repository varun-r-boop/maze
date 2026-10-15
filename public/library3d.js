// The library in 3D, in clay: two real floors, one above the other. A grand red-carpeted staircase climbs up the
// middle of the sunny atrium (and plainer ones climb by each end wall); upstairs, a gallery with a wooden railing
// runs round the open atrium under a glass roof. Bookcases full of books, reading tables with green lamps, a fireplace
// with a crackling fire, armchairs, computers, a children's corner with a play castle, a café, study carrels, a globe,
// the rare-books archive, and a clay dinosaur in the exhibition.
// Map space -> 3D: x = tile x, z = tile y, y is up; one tile is one unit. The upper floor is storyH up.
import * as THREE from 'three';
import { clay, rbox, blob, hash, clayKit, clayWalls } from './clay.js';

const Sh = window.Shared;
const { COLS, ROWS } = Sh.C;

const P = {
  plaster: '#f1e6d2', trim: '#6e4a2e', wood: '#a8754a', woodDark: '#6e4a2e', woodLight: '#c99a66', ceiling: '#f6efe2',
  marble: '#e6dfd2', marble2: '#d3c8b6', brass: '#c9a646', lampGreen: '#2f7d4f', leaf: '#5aa84a', leaf2: '#3f8a3a', pot: '#c7744a',
  stone: '#b9ad9c', white: '#f6f1e8', dark: '#3d414a', carpet: '#9c3a33', steel: '#b6bfca', frame: '#4b5058',
};
const BOOKS = ['#a8322a', '#2e6fa1', '#2f8a55', '#d08a26', '#71408f', '#e8e0cc', '#3d3d48', '#b85a2e'];
const BRIGHT = ['#e85d5d', '#f2b43b', '#4aa3df', '#6dbf5b', '#b48ee0', '#f07cb0'];
const FLOOR = { reading: '#a9784f', study: '#a9784f', gallery: '#b5875b', atrium: P.marble, lobby: P.marble, exhibit: '#e3dccf', media: '#6b7383', lab: '#6b7383', group: '#4e8a86', kids: '#8fcbe8', cafe: '#c4744a' };
const CARPET = { FICTION: '#5d7f63', SCIENCE: '#4f6d8c', HISTORY: '#8a5150', 'RARE BOOKS': '#6e3b46' };
const floorColor = r => !r ? FLOOR.atrium : r.label ? CARPET[r.label] : FLOOR[r.type] || '#e4dccd';
const pick = (list, ...k) => list[Math.floor(hash(...k) * list.length)];

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
// a sign: a rounded clay board with the text on its front (front = +z before rotating by `ry`)
function sign(add, text, color, x, y, z, ry, w = 1.6, h = 0.3, ink = '#ffffff') {
  const tex = canvasTex(512, Math.round(512 * h / w), (c, cw, ch) => {
    c.fillStyle = color; c.fillRect(0, 0, cw, ch);
    c.fillStyle = ink; c.font = `bold ${Math.round(ch * 0.56)}px Georgia, serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, cw / 2, ch / 2 + 2);
  });
  const b = add(rbox(w + 0.06, h + 0.06, 0.06, 0.03, 0), clay(color), x, y, z, { ry, cast: false });
  const f = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex })); f.position.z = 0.032; b.add(f);
  return b;
}

export function buildLibrary(scene, G, WALL_H) {
  const Lb = G.library, S = Lb.storyH, up = G.upper, X = { flames: [], fire: null, t0: 0 };
  const { add, many } = clayKit(scene);
  const inb = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
  const rampAt = (x, y) => G.ramps.find(r => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
  const hole = (x, y) => up[y][x] === 4 || !!rampAt(x, y); // no floor upstairs here
  const rooms = [new Map(), new Map()];
  for (const r of Lb.rooms) for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) rooms[r.fl].set(y * COLS + x, r);
  const roomOf = (fl, x, y) => rooms[fl].get(y * COLS + x) || rooms[fl].get((y + 1) * COLS + x) || rooms[fl].get((y - 1) * COLS + x) || rooms[fl].get(y * COLS + x + 1) || rooms[fl].get(y * COLS + x - 1);

  // little things drawn together at the end (books, cups, chairs...): key -> { geo, color, list }
  const goods = new Map();
  const good = (key, geo, color, x, y, z, ry = 0, sx = 1, sy = sx, sz = sx) => {
    const k = key + color;
    if (!goods.has(k)) goods.set(k, { geo, color, list: [] });
    goods.get(k).list.push({ x, y, z, ry, sx, sy, sz });
  };
  const leaves = [], chairs = [], balusters = [];
  const plantAt = (x, z, y, s, n = 6) => { for (let i = 0; i < n; i++) leaves.push({ x: x + Math.cos(i * 2.4) * 0.11 * s, z: z + Math.sin(i * 2.4) * 0.11 * s, y: y + (i % 3) * 0.06 * s, s: s * (0.65 + hash(x, z, i) * 0.45), r: i }); };
  const GEO = {
    book: rbox(0.06, 0.26, 0.2, 0.012, 0), cup: new THREE.CylinderGeometry(0.035, 0.03, 0.07, 10), ball: blob(0.07, 2, 0.004),
    block: rbox(0.12, 0.12, 0.12, 0.04, 0.006), page: rbox(0.2, 0.012, 0.14, 0.004, 0), shade: new THREE.CylinderGeometry(0.06, 0.09, 0.07, 14, 1, true),
  };
  // a row of books standing on a shelf from (x0, z0) to (x1, z1) at height y (their spines face sideways)
  const bookRow = (x0, z0, x1, z1, y, k) => {
    const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.abs(x1 - x0) > Math.abs(z1 - z0) ? 0 : Math.PI / 2;
    for (let d = 0.03, i = 0; d < len - 0.05; i++) {
      const th = 0.045 + hash(k, i) * 0.04, ht = 0.2 + hash(i, k, 3) * 0.09, gap = hash(k, i, 5) < 0.06 ? 0.08 : 0;
      const t = (d + th / 2) / len;
      good('book', GEO.book, pick(BOOKS, k, i), x0 + (x1 - x0) * t, y + ht / 2, z0 + (z1 - z0) * t, ry, th / 0.06, ht / 0.26, 0.85 + hash(i, k) * 0.2);
      d += th + 0.004 + gap;
    }
  };
  const lampAt = (x, y, z) => { // a green banker's lamp, glowing
    add(new THREE.CylinderGeometry(0.05, 0.06, 0.02, 12), clay(P.brass), x, y + 0.01, z, { cast: false });
    add(new THREE.CylinderGeometry(0.01, 0.01, 0.16, 6), clay(P.brass), x, y + 0.09, z, { cast: false });
    add(new THREE.SphereGeometry(0.09, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), clay(P.lampGreen, { side: THREE.DoubleSide }), x, y + 0.15, z, { s: [1.3, 0.6, 0.7] });
    add(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff3c4' }), x, y + 0.14, z, { cast: false });
  };

  // ---- light: bright daylight through the windows and the glass roof over the atrium
  scene.background = new THREE.Color('#bcdcf2');
  scene.fog = new THREE.Fog('#d9e6ee', 22, 55);
  scene.add(new THREE.HemisphereLight('#fff6e6', '#b8a690', 1.35));
  const sun = new THREE.DirectionalLight('#fff0d4', 2.2);
  sun.position.set(COLS / 2 - 6, 34, ROWS / 2 + 12); sun.target.position.set(COLS / 2, 0, ROWS / 2);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 90 });
  scene.add(sun, sun.target);

  // ---- the ground floor: a clay slab per room; marble squares in the atrium and the lobby
  add(new THREE.BoxGeometry(COLS, 0.1, ROWS), clay(P.marble, { repeat: [COLS / 1.5, ROWS / 1.5] }), COLS / 2, -0.05, ROWS / 2, { cast: false });
  for (const r of Lb.rooms.filter(r => r.fl === 0)) {
    const w = r.x1 - r.x0 + 1, h = r.y1 - r.y0 + 1;
    add(rbox(w - 0.04, 0.06, h - 0.04, 0.03, 0.004, r.x0 + r.y0), clay(floorColor(r), { repeat: [w / 1.5, h / 1.5] }), r.x0 + w / 2, -0.02, r.y0 + h / 2, { cast: false });
  }
  const checks = [];
  for (let y = 11; y <= 29; y++) for (let x = 13; x <= 27; x++) if ((x + y) % 2 && G.grid[y][x] !== 1 && !rampAt(x, y)) checks.push({ x, y });
  many(rbox(0.98, 0.02, 0.98, 0.01, 0), clay(P.marble2), checks, (o, p) => o.position.set(p.x + 0.5, 0.012, p.y + 0.5));
  add(new THREE.CylinderGeometry(2.2, 2.2, 0.02, 40), clay('#8a3b34'), 20.5, 0.012, 3.4, { cast: false, s: [1.1, 1, 0.5] }); // a rug by the fire
  add(new THREE.TorusGeometry(2.1, 0.04, 6, 48).rotateX(Math.PI / 2), clay('#e8c878'), 20.5, 0.02, 3.4, { cast: false, s: [1.1, 1, 0.5] });

  // ---- the upper floor: a slab over everything except the atrium and the stairwells, the floor of each room on top,
  // and underneath, a pale ceiling for the ground floor
  const slabMat = clay(P.ceiling, { emissive: new THREE.Color('#e9e1d3'), emissiveIntensity: 0.45 });
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS;) {
    if (hole(x, y)) { x++; continue; }
    let x1 = x; while (x1 + 1 < COLS && !hole(x1 + 1, y)) x1++;
    add(new THREE.BoxGeometry(x1 - x + 1, 0.16, 1), slabMat, (x + x1 + 1) / 2, S - 0.1, y + 0.5);
    x = x1 + 1;
  }
  for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1;) { // the floors upstairs, in runs of one color
    const c = up[y][x] === 1 || hole(x, y) ? null : floorColor(roomOf(1, x, y));
    if (!c) { x++; continue; }
    let x1 = x; while (x1 + 1 < COLS - 1 && up[y][x1 + 1] !== 1 && !hole(x1 + 1, y) && floorColor(roomOf(1, x1 + 1, y)) === c) x1++;
    add(new THREE.BoxGeometry(x1 - x + 1, 0.03, 1), clay(c, { repeat: [(x1 - x + 1) / 1.5, 1 / 1.5] }), (x + x1 + 1) / 2, S - 0.005, y + 0.5, { cast: false });
    x = x1 + 1;
  }
  const marbleUp = [];
  for (let y = 24; y <= 29; y++) for (let x = 13; x <= 27; x++) if ((x + y) % 2 && up[y][x] === 0) marbleUp.push({ x, y });
  many(rbox(0.98, 0.02, 0.98, 0.01, 0), clay(P.marble2), marbleUp, (o, p) => o.position.set(p.x + 0.5, S + 0.018, p.y + 0.5));

  // ---- walls on both floors (the upper ones stand on the lower ones); windows and the entrance doors in the outer walls
  const windowAt = new Set(Lb.windows.map(w => w.y * COLS + w.x));
  const doorAt = (x, y) => y === ROWS - 1 && Lb.entrance.includes(x);
  clayWalls(add, (x, y) => inb(x, y) && G.grid[y][x] === 1 && !windowAt.has(y * COLS + x) && !doorAt(x, y), COLS, ROWS, S, P.plaster, P.trim);
  const addUp = (geo, mat, x, y, z, o) => add(geo, mat, x, y + S, z, o);
  clayWalls(addUp, (x, y) => inb(x, y) && up[y][x] === 1 && !windowAt.has(y * COLS + x), COLS, ROWS, S, P.plaster, P.trim);
  const glassMat = new THREE.MeshPhysicalMaterial({ color: '#d8eefa', transparent: true, opacity: 0.18, roughness: 0.05, depthWrite: false });
  const wallMat = clay(P.plaster), frameMat = clay(P.woodDark);
  for (const w of Lb.windows) for (const b of [0, S]) { // a tall window: wall below and above, glass between, a wooden frame
    const ns = w.y === 0 || w.y === ROWS - 1, cx = w.x + 0.5, cz = w.y + 0.5, gh = S - 0.78;
    const box = (along, hgt, th, y, mat, r = 0.03) => add(rbox(ns ? along : th, hgt, ns ? th : along, r, 0), mat, cx, b + y, cz, { cast: false });
    box(1, 0.44, 1, 0.22, wallMat); box(1, 0.34, 1, S - 0.17, wallMat);
    add(new THREE.BoxGeometry(ns ? 1 : 0.03, gh, ns ? 0.03 : 1), glassMat, cx, b + 0.44 + gh / 2, cz, { cast: false });
    box(1.02, 0.06, 1.12, 0.47, frameMat, 0.02); // window board
    box(0.06, gh, 0.12, 0.44 + gh / 2, frameMat, 0.02); // mullion
    box(1, 0.05, 0.12, 0.44 + gh * 0.7, frameMat, 0.02); // transom
    for (const s of [-0.48, 0.48]) add(rbox(ns ? 0.05 : 0.12, gh, ns ? 0.12 : 0.05, 0.02, 0), frameMat, cx + (ns ? s : 0), b + 0.44 + gh / 2, cz + (ns ? 0 : s), { cast: false });
  }
  for (const x of Lb.entrance) { // the glass entrance doors
    const cz = ROWS - 0.5;
    add(new THREE.BoxGeometry(1, 1.3, 0.03), glassMat, x + 0.5, 0.65, cz, { cast: false });
    add(rbox(1, S - 1.3, 1, 0.03, 0), wallMat, x + 0.5, 1.3 + (S - 1.3) / 2, cz, { cast: false });
    add(rbox(0.07, 1.3, 0.12, 0.02, 0), clay(P.frame), x + 0.035, 0.65, cz, { cast: false });
    add(rbox(0.05, 0.3, 0.05, 0.02, 0), clay(P.brass), x + 0.85, 0.65, cz - 0.04, { cast: false });
  }
  add(rbox(0.07, 1.3, 0.12, 0.02, 0), clay(P.frame), Lb.entrance[Lb.entrance.length - 1] + 0.965, 0.65, ROWS - 0.5, { cast: false });

  // ---- outside: lawn, a stone plaza with steps up to the doors, trees, clouds, and the library's name over the door
  add(new THREE.CircleGeometry(90, 32).rotateX(-Math.PI / 2), clay('#8db86a'), COLS / 2, -0.32, ROWS / 2, { cast: false });
  add(rbox(9, 0.3, 5, 0.05, 0), clay(P.stone), 20.5, -0.17, ROWS + 2.5, { cast: false });
  for (let i = 0; i < 3; i++) add(rbox(5 - i * 0.6, 0.1, 0.4, 0.03, 0), clay('#cfc4b2'), 20.5, -0.02 - i * 0.1, ROWS + 0.2 + i * 0.4, { cast: false });
  sign(add, 'PUBLIC LIBRARY', '#2b2420', 20.5, S + 0.55, ROWS + 0.04, 0, 3.6, 0.42, '#f2e3c0');
  const trees = [];
  for (let i = 0; i < 14; i++) trees.push({ x: -2.5, z: 2 + i * 2.1 }, { x: COLS + 2.5, z: 2 + i * 2.1 });
  for (let i = 0; i < 12; i++) if (i < 4 || i > 7) trees.push({ x: 3 + i * 3.2, z: ROWS + 3 });
  many(new THREE.CylinderGeometry(0.12, 0.17, 1.8, 8), clay(P.woodDark), trees, (o, p) => o.position.set(p.x, 0.6, p.z));
  many(blob(1, 2, 0.12, 3), clay('#6aa84f'), trees, (o, p) => { o.position.set(p.x, 2.1, p.z); o.scale.setScalar(0.85 + hash(p.x, p.z) * 0.5); });
  const clouds = []; for (let i = 0; i < 10; i++) for (let k = 0; k < 4; k++) clouds.push({ x: -14 + i * 7 + k * 1.1, y: 12 + hash(i, 5) * 3 + (k % 2) * 0.4, z: -10 + hash(i, 6) * 40, s: 1.2 + hash(i, k) * 0.9 });
  many(blob(1, 2, 0.08, 7), new THREE.MeshLambertMaterial({ color: '#ffffff', fog: false }), clouds, (o, c) => { o.position.set(c.x, c.y, c.z); o.scale.set(c.s * 1.4, c.s * 0.8, c.s); });

  // ---- the roof: a ceiling over the upper floor, and a glass roof with clay beams over the atrium; lights in the ceilings
  const ceilMat = clay(P.ceiling, { emissive: new THREE.Color('#e9e1d3'), emissiveIntensity: 0.5 });
  const sky = { x0: 15, x1: 26, z0: 13, z1: 21 }; // the glass roof (map x 15..25, y 13..20)
  for (const [x0, x1, z0, z1] of [[0, COLS, 0, sky.z0], [0, COLS, sky.z1, ROWS], [0, sky.x0, sky.z0, sky.z1], [sky.x1, COLS, sky.z0, sky.z1]])
    add(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(Math.PI / 2), ceilMat, (x0 + x1) / 2, 2 * S, (z0 + z1) / 2, { cast: false });
  add(new THREE.BoxGeometry(sky.x1 - sky.x0, 0.02, sky.z1 - sky.z0), new THREE.MeshPhysicalMaterial({ color: '#e6f4fb', transparent: true, opacity: 0.12, roughness: 0.05, depthWrite: false }),
    (sky.x0 + sky.x1) / 2, 2 * S + 0.45, (sky.z0 + sky.z1) / 2, { cast: false });
  for (let x = sky.x0; x <= sky.x1; x += 1.5) add(rbox(0.1, 0.12, sky.z1 - sky.z0 + 0.2, 0.04, 0.004), clay('#ffffff'), x, 2 * S + 0.38, (sky.z0 + sky.z1) / 2);
  for (const z of [sky.z0, sky.z1]) add(rbox(sky.x1 - sky.x0 + 0.2, 0.5, 0.14, 0.05, 0.004), clay('#ffffff'), (sky.x0 + sky.x1) / 2, 2 * S + 0.2, z);
  for (const x of [sky.x0, sky.x1]) add(rbox(0.14, 0.5, sky.z1 - sky.z0 + 0.2, 0.05, 0.004), clay('#ffffff'), x, 2 * S + 0.2, (sky.z0 + sky.z1) / 2);
  const panels = [[], []], panelMat = new THREE.MeshBasicMaterial({ color: '#fffdf5' });
  for (let y = 1; y < ROWS - 1; y += 2) for (let x = 1; x < COLS - 1; x += 3) {
    if (G.grid[y][x] !== 1 && !hole(x, y)) panels[0].push({ x, y });
    if (up[y][x] !== 1 && up[y][x] !== 4 && !(x >= sky.x0 && x < sky.x1 && y >= sky.z0 && y < sky.z1)) panels[1].push({ x, y });
  }
  many(rbox(0.6, 0.03, 0.6, 0.015, 0), panelMat, panels[0], (o, p) => o.position.set(p.x + 0.5, S - 0.19, p.y + 0.5));
  many(rbox(0.6, 0.03, 0.6, 0.015, 0), panelMat, panels[1], (o, p) => o.position.set(p.x + 0.5, 2 * S - 0.015, p.y + 0.5));
  // a big brass chandelier hanging from the glass roof over the bottom of the grand staircase
  {
    const cx = 20.5, cz = 20.2, y = 2 * S - 0.55;
    add(new THREE.CylinderGeometry(0.015, 0.015, 0.95, 6), clay(P.brass), cx, y + 0.5, cz, { cast: false });
    add(new THREE.TorusGeometry(0.45, 0.03, 8, 32).rotateX(Math.PI / 2), clay(P.brass), cx, y, cz, { cast: false });
    add(new THREE.TorusGeometry(0.25, 0.025, 8, 24).rotateX(Math.PI / 2), clay(P.brass), cx, y + 0.18, cz, { cast: false });
    add(blob(0.07, 2, 0.003), clay(P.brass), cx, y - 0.06, cz, { cast: false });
    const bulb = new THREE.MeshBasicMaterial({ color: '#fff3c4' });
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; add(new THREE.SphereGeometry(0.045, 10, 8), bulb, cx + Math.cos(a) * 0.45, y + 0.06, cz + Math.sin(a) * 0.45, { cast: false }); }
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; add(new THREE.SphereGeometry(0.04, 10, 8), bulb, cx + Math.cos(a) * 0.25, y + 0.24, cz + Math.sin(a) * 0.25, { cast: false }); }
  }

  // ---- the staircases: solid clay steps (the grand one with a red carpet and brass stair rods), banisters up both sides
  for (const r of G.ramps) {
    const vert = r.dir === 'n' || r.dir === 's', len = vert ? r.y1 - r.y0 + 1 : r.x1 - r.x0 + 1, wid = vert ? r.x1 - r.x0 + 1 : r.y1 - r.y0 + 1;
    const n = len * 3, d = len / n, sign1 = r.dir === 'n' || r.dir === 'w' ? -1 : 1; // which way along the axis you climb
    const start = r.dir === 'n' ? r.y1 + 1 : r.dir === 's' ? r.y0 : r.dir === 'e' ? r.x0 : r.x1 + 1, mid = vert ? (r.x0 + r.x1 + 1) / 2 : (r.y0 + r.y1 + 1) / 2;
    const at = (along, across, y) => vert ? [across, y, along] : [along, y, across];
    for (let i = 0; i < n; i++) {
      const hgt = (i + 1) / n * S, c = start + sign1 * (i + 0.5) * d;
      const [x, y, z] = at(c, mid, hgt / 2);
      add(rbox(vert ? wid - 0.02 : d, hgt, vert ? d : wid - 0.02, 0.012, 0, i, 0.05), clay(i % 2 ? (r.grand ? '#ddd3c2' : P.woodLight) : (r.grand ? '#d3c8b6' : '#bf8f5c')), x, y, z);
      if (r.grand) { // the carpet runner and a brass rod at the back of each tread
        const [rx, ry, rz] = at(c, mid, hgt + 0.012);
        add(rbox(vert ? wid - 0.7 : d + 0.002, 0.025, vert ? d + 0.002 : wid - 0.7, 0.008, 0), clay(P.carpet), rx, ry, rz, { cast: false });
        const [bx, by, bz] = at(c - sign1 * d * 0.42, mid, hgt + 0.03);
        add(new THREE.CylinderGeometry(0.012, 0.012, wid - 0.6, 6).rotateZ(Math.PI / 2).rotateY(vert ? 0 : Math.PI / 2), clay(P.brass), bx, by, bz, { cast: false });
      }
    }
    // banisters: a sloping handrail on posts up each side, a newel post at the bottom
    const slope = Math.atan2(S, len), railLen = Math.hypot(S, len);
    for (const side of [-1, 1]) {
      const across = mid + side * (wid / 2 - 0.07), [hx, hy, hz] = at(start + sign1 * len / 2, across, S / 2 + 0.88);
      const rail = add(rbox(vert ? 0.08 : railLen, 0.07, vert ? railLen : 0.08, 0.03, 0), clay(P.woodDark), hx, hy, hz, { cast: false });
      if (vert) rail.rotation.x = sign1 < 0 ? slope : -slope; else rail.rotation.z = sign1 > 0 ? slope : -slope;
      for (let i = 0; i < n; i++) { const [px, , pz] = at(start + sign1 * (i + 0.5) * d, across, 0); balusters.push({ x: px, y: (i + 1) / n * S + 0.44, z: pz, h: 0.86 }); }
      const [nx, , nz] = at(start + sign1 * 0.12, across, 0);
      add(rbox(0.14, 1.05, 0.14, 0.04, 0.004), clay(P.woodDark), nx, 0.52, nz);
      add(blob(0.09, 2, 0.004), clay(P.brass), nx, 1.1, nz, { cast: false });
    }
  }

  // ---- upstairs: a railing round the atrium and the stairwells, a dark wooden edge to the floor, and wall-mounted lamps
  const rails = [];
  for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
    if (hole(x, y) || up[y][x] === 1) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (up[y + dy][x + dx] !== 4) continue;
      rails.push({ x: x + 0.5 + dx * 0.44, z: y + 0.5 + dy * 0.44, alongX: !!dy });
      for (const k of [-0.33, 0, 0.33]) balusters.push({ x: x + 0.5 + dx * 0.44 + (dy ? k : 0), y: S + 0.45, z: y + 0.5 + dy * 0.44 + (dx ? k : 0), h: 0.82 });
    }
  }
  const railPlace = y => (o, r) => { o.position.set(r.x, y, r.z); if (!r.alongX) o.rotation.y = Math.PI / 2; };
  many(rbox(1.02, 0.07, 0.1, 0.03, 0), clay(P.woodDark), rails, railPlace(S + 0.88), { cast: true });
  many(rbox(1.02, 0.04, 0.06, 0.015, 0), clay(P.brass), rails, railPlace(S + 0.93));
  many(rbox(1.02, 0.05, 0.08, 0.02, 0), clay(P.woodDark), rails, railPlace(S + 0.08));
  many(rbox(1.02, 0.2, 0.06, 0.02, 0), clay(P.woodDark), rails.map(r => ({ ...r, x: r.x + (r.alongX ? 0 : Math.sign(r.x % 1 - 0.5) * 0.06), z: r.z + (r.alongX ? Math.sign(r.z % 1 - 0.5) * 0.06 : 0) })), railPlace(S - 0.1));
  many(new THREE.CylinderGeometry(0.022, 0.022, 1, 8), clay(P.woodDark), balusters, (o, b) => { o.position.set(b.x, b.y, b.z); o.scale.set(1, b.h, 1); }, { cast: true });

  // ---- hanging signs over the sections of the stacks
  for (const r of Lb.rooms) if (r.label) {
    const b = r.fl * S, x = (r.x0 + r.x1 + 1) / 2, z = r.y0 + (r.y0 < 10 ? 0.15 : 0.55);
    sign(add, r.label, '#2b2420', x, b + S - 0.42, z, 0, 1.6, 0.26, '#f2e3c0');
    for (const s of [-0.7, 0.7]) add(new THREE.CylinderGeometry(0.01, 0.01, 0.3, 4), clay(P.brass), x + s, b + S - 0.14, z, { cast: false });
  }

  // ---- furniture
  for (const it of Lb.items) {
    const B = it.fl * S, w = it.w || 1, h = it.h || 1, cx = it.x + w / 2, cz = it.y + h / 2, alongX = w >= h, len = alongX ? w : h;
    const A = (geo, mat, x, y, z, o) => add(geo, mat, x, y + B, z, o);
    const gd = (key, geo, color, x, y, z, ...rest) => good(key, geo, color, x, y + B, z, ...rest);
    const chair = (x, z, a, c = P.woodDark) => chairs.push({ x, z, y: B, a, c });
    switch (it.type) {
      case 'shelf': case 'lowshelf': case 'kidshelf': { // bookcases: books on every shelf, both sides
        const tall = it.type === 'shelf', H = tall ? 1.5 : 0.78, levels = tall ? 4 : 2, depth = 0.9;
        const col = it.type === 'kidshelf' ? '#f3f3f3' : tall ? '#7a5236' : '#9a6a42';
        const L2 = len - 0.06;
        for (const s of [-1, 1]) A(rbox(alongX ? 0.06 : depth, H, alongX ? depth : 0.06, 0.025, 0.003), clay(col), cx + (alongX ? s * (L2 / 2 - 0.03) : 0), H / 2, cz + (alongX ? 0 : s * (L2 / 2 - 0.03)));
        A(rbox(alongX ? L2 : depth, 0.06, alongX ? depth : L2, 0.025, 0.003), clay(col), cx, H - 0.03, cz);
        A(rbox(alongX ? L2 - 0.1 : 0.04, H - 0.06, alongX ? 0.04 : L2 - 0.1, 0.015, 0), clay(col), cx, (H - 0.06) / 2, cz);
        for (let lv = 0; lv < levels; lv++) {
          const y = 0.06 + lv * (H - 0.1) / levels;
          A(rbox(alongX ? L2 - 0.1 : depth - 0.04, 0.035, alongX ? depth - 0.04 : L2 - 0.1, 0.012, 0), clay(col), cx, y, cz, { cast: false });
          for (const s of [-1, 1]) {
            const off = s * 0.22, a0 = alongX ? it.x + 0.08 : it.y + 0.08, a1 = alongX ? it.x + w - 0.08 : it.y + h - 0.08;
            if (alongX) bookRow(a0, cz + off, a1, cz + off, y + 0.018 + B, it.x * 7 + it.y * 3 + lv * 11 + s + it.fl * 5);
            else bookRow(cx + off, a0, cx + off, a1, y + 0.018 + B, it.x * 7 + it.y * 3 + lv * 11 + s + it.fl * 5);
          }
        }
        if (it.type === 'kidshelf') for (let i = 0; i < 4; i++) gd('ball', GEO.ball, pick(BRIGHT, i, it.y), cx, H + 0.07, it.y + 0.5 + i, 0, 1.2);
        if (tall) A(rbox(alongX ? L2 + 0.06 : depth + 0.06, 0.07, alongX ? depth + 0.06 : L2 + 0.06, 0.03, 0.003), clay(P.woodDark), cx, 0.035, cz, { cast: false }); // plinth
        break;
      }
      case 'display': { // a long low table under the top of the grand staircase, with books propped open on it
        A(rbox(w - 0.1, 0.62, h - 0.2, 0.06, 0.004, cx), clay(P.wood), cx, 0.31, cz);
        for (let i = 0; i < w * 2; i++) {
          const x = it.x + 0.3 + i * (w - 0.6) / (w * 2 - 1);
          A(rbox(0.26, 0.02, 0.18, 0.006, 0), clay('#f4efe2'), x, 0.64, cz, { rx: -0.25, cast: false });
          A(rbox(0.02, 0.18, 0.18, 0.006, 0), clay(pick(BOOKS, i, it.x)), x, 0.7, cz + 0.07, { rx: -0.25, cast: false });
        }
        break;
      }
      case 'readtable': { // a long table with green lamps down the middle and chairs along both sides
        A(rbox(w - 0.12, 0.07, h - 0.2, 0.035, 0.004, cx), clay(P.wood), cx, 0.72, cz);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) A(rbox(0.09, 0.69, 0.09, 0.03, 0), clay(P.woodDark), cx + sx * (w / 2 - 0.2), 0.345, cz + sz * (h / 2 - 0.2), { cast: false });
        for (let i = 0; i < len; i++) {
          const t = it.x + i + 0.5;
          if (i % 2 === 0) lampAt(t + 0.1, 0.755 + B, cz);
          else { gd('book', GEO.book, pick(BOOKS, i, it.y), t - 0.1, 0.77, cz - 0.08, Math.PI / 2, 1.8, 0.2, 1); gd('page', GEO.page, '#f4efe2', t + 0.15, 0.765, cz + 0.06, 0.3); }
          chair(t, it.y - 0.08, Math.PI / 2); chair(t, it.y + h + 0.08, -Math.PI / 2);
        }
        break;
      }
      case 'fireplace': { // a stone fireplace with a fire burning, a mantelpiece and a painting above it
        const stone = clay(P.stone), z = it.y + 0.45;
        A(rbox(w + 0.2, 0.06, 1.1, 0.02, 0), stone, cx, 0.03, it.y + 0.6, { cast: false });
        for (const s of [-1, 1]) A(rbox(0.6, 0.95, 0.85, 0.06, 0.006, s + 3), stone, cx + s * (w / 2 - 0.3), 0.475, z);
        A(rbox(w, 0.22, 0.85, 0.06, 0.006), stone, cx, 1.06, z);
        A(rbox(w + 0.25, 0.08, 0.98, 0.03, 0.003), clay(P.woodDark), cx, 1.21, z + 0.05);
        A(rbox(w - 0.4, S - 1.25, 0.6, 0.06, 0.006), stone, cx, 1.25 + (S - 1.25) / 2, it.y + 0.3);
        A(rbox(w - 1.15, 0.92, 0.12, 0.03, 0), clay('#2a201b'), cx, 0.46, it.y + 0.1, { cast: false }); // the back of the firebox
        for (const s of [-0.25, 0.25]) A(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 8).rotateZ(Math.PI / 2).rotateY(s), clay('#6b4226'), cx, 0.12, it.y + 0.45, { cast: false });
        const flameMat = new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.9 });
        for (let i = 0; i < 5; i++) {
          const f = A(new THREE.ConeGeometry(0.09 - (i % 2) * 0.02, 0.4, 8), i % 2 ? new THREE.MeshBasicMaterial({ color: '#ff7a2a' }) : flameMat, cx - 0.32 + i * 0.16, 0.36, it.y + 0.45 + (i % 2) * 0.06, { cast: false });
          X.flames.push({ m: f, ph: i * 1.7, y: 0.36 + B });
        }
        X.fire = new THREE.PointLight('#ff9a40', 2.2, 5.5, 1.6); X.fire.position.set(cx, 0.6 + B, it.y + 1.0); scene.add(X.fire);
        const art = canvasTex(256, 160, (c, cw, ch) => { // a landscape painting
          const g = c.createLinearGradient(0, 0, 0, ch); g.addColorStop(0, '#9fd0ee'); g.addColorStop(0.6, '#e9f2dc'); g.addColorStop(0.61, '#7aa85a'); g.addColorStop(1, '#4f7d3c');
          c.fillStyle = g; c.fillRect(0, 0, cw, ch);
          c.fillStyle = '#5c7f9c'; c.beginPath(); c.moveTo(0, 100); c.lineTo(70, 40); c.lineTo(130, 95); c.lineTo(190, 55); c.lineTo(256, 100); c.fill();
        });
        A(rbox(1.1, 0.72, 0.06, 0.03, 0), clay(P.brass), cx, 1.62, it.y + 0.63, { cast: false });
        const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.58), new THREE.MeshBasicMaterial({ map: art })); pic.position.set(cx, 1.62 + B, it.y + 0.665); scene.add(pic);
        for (const s of [-1, 1]) { A(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 10), clay('#f4efe2'), cx + s * 1.1, 1.34, z + 0.1, { cast: false }); A(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffd27a' }), cx + s * 1.1, 1.45, z + 0.1, { cast: false }); }
        A(blob(0.1, 2, 0.004), clay(P.brass), cx, 1.33, z + 0.12, { s: [1, 1, 0.5] }); // a clock
        break;
      }
      case 'armchair': { // a leather armchair; face 0 looks east (+x), 2 looks west
        const g = new THREE.Group(); g.position.set(cx, B, cz); g.rotation.y = it.face === 2 ? Math.PI : 0;
        const mat = clay(it.color), part = (geo, x, y, z, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.z = rz; m.castShadow = m.receiveShadow = true; g.add(m); };
        part(rbox(0.62, 0.2, 0.66, 0.08, 0.01), 0.02, 0.34, 0);
        part(rbox(0.18, 0.62, 0.7, 0.08, 0.01), -0.28, 0.6, 0, -0.12);
        for (const s of [-1, 1]) part(rbox(0.6, 0.26, 0.14, 0.06, 0.01), 0, 0.5, s * 0.33);
        part(rbox(0.6, 0.12, 0.62, 0.05, 0.008), 0.03, 0.18, 0);
        scene.add(g);
        break;
      }
      case 'magrack': { // a slanted magazine rack against the wall
        A(rbox(w - 0.1, 1.0, 0.3, 0.04, 0.004), clay(P.wood), cx, 0.5, it.y + 0.2);
        for (let lv = 0; lv < 3; lv++) for (let i = 0; i < w * 3; i++)
          A(rbox(0.26, 0.3, 0.02, 0.01, 0), clay(pick(BRIGHT, i, lv, it.x)), it.x + 0.2 + i * (w - 0.4) / (w * 3 - 1), 0.25 + lv * 0.3, it.y + 0.38, { rx: -0.3, cast: false });
        break;
      }
      case 'pcdesk': { // a row of computers, chairs in front
        A(rbox(w - 0.08, 0.06, 0.66, 0.03, 0.004), clay('#e9e4da'), cx, 0.72, cz - 0.05);
        for (const s of [-1, 1]) A(rbox(0.06, 0.69, 0.6, 0.02, 0), clay('#e9e4da'), cx + s * (w / 2 - 0.1), 0.345, cz - 0.05, { cast: false });
        for (let i = 0; i < w; i++) {
          const x = it.x + i + 0.5;
          A(rbox(0.46, 0.3, 0.04, 0.02, 0), clay('#23262c'), x, 0.98, cz - 0.2);
          const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.24), new THREE.MeshBasicMaterial({ color: pick(['#7fc3e8', '#a7e0c4', '#f2d99b'], i, it.y) })); scr.position.set(x, 0.98 + B, cz - 0.177); scene.add(scr);
          A(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6), clay('#555b66'), x, 0.8, cz - 0.24, { cast: false });
          A(rbox(0.32, 0.015, 0.1, 0.006, 0), clay('#3a3f4c'), x, 0.76, cz + 0.06, { cast: false });
          chair(x, it.y + h + 0.05, -Math.PI / 2, '#3a3f4c');
        }
        break;
      }
      case 'carrel': { // study desks side by side, with dividers, a shelf at the back and a lamp each
        A(rbox(w - 0.06, 0.06, 0.7, 0.03, 0.004), clay(P.woodLight), cx, 0.72, cz);
        A(rbox(w - 0.06, 0.55, 0.06, 0.02, 0.003), clay(P.woodDark), cx, 1.0, it.y + 0.18);
        for (let i = 0; i <= w; i++) A(rbox(0.04, 0.5, 0.62, 0.015, 0), clay(P.woodDark), it.x + Math.min(Math.max(i, 0.03), w - 0.03), 0.98, cz, { cast: false });
        for (let i = 0; i < w; i++) {
          const x = it.x + i + 0.5;
          lampAt(x - 0.25, 0.755 + B, cz - 0.15);
          gd('book', GEO.book, pick(BOOKS, i, it.y, 2), x + 0.1, 0.77, cz + 0.05, 0.2, 2.2, 0.2, 1);
          for (let k = 0; k < 4; k++) gd('book', GEO.book, pick(BOOKS, i, k), x - 0.2 + k * 0.08, 1.12, it.y + 0.3, 0, 1, 0.9, 0.8);
          chair(x, it.y + h + 0.05, -Math.PI / 2);
        }
        for (const s of [-1, 1]) A(rbox(0.06, 0.69, 0.6, 0.02, 0), clay(P.woodDark), cx + s * (w / 2 - 0.06), 0.345, cz, { cast: false });
        break;
      }
      case 'lowtable': A(rbox(w - 0.2, 0.06, 0.6, 0.03, 0.004), clay(P.wood), cx, 0.4, cz); A(rbox(w - 0.5, 0.36, 0.4, 0.04, 0), clay(P.woodDark), cx, 0.18, cz, { cast: false }); gd('book', GEO.book, BOOKS[2], cx, 0.45, cz, 0.4, 2.5, 0.25, 1); break;
      case 'kidtable': { // a little yellow table with four colored stools
        A(rbox(w - 0.3, 0.06, 0.6, 0.03, 0.004), clay('#f2b43b'), cx, 0.45, cz);
        for (const s of [-1, 1]) A(rbox(0.08, 0.42, 0.5, 0.03, 0), clay('#f2b43b'), cx + s * (w / 2 - 0.35), 0.21, cz, { cast: false });
        [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].forEach(([dx, dz], i) => A(new THREE.CylinderGeometry(0.13, 0.13, 0.26, 14), clay(BRIGHT[i]), cx + dx * (w - 0.6), 0.13, cz + dz * 0.95));
        for (let i = 0; i < 3; i++) gd('block', GEO.block, BRIGHT[i + 2], cx - 0.3 + i * 0.3, 0.54, cz, i);
        break;
      }
      case 'desk': { // the front desk: a big curved counter with a computer, stacks of books and a sign
        A(rbox(w - 0.1, 0.95, h - 0.1, 0.25, 0.008, cx), clay(P.wood), cx, 0.475, cz);
        A(rbox(w - 0.02, 0.06, h - 0.02, 0.25, 0.004), clay(P.woodDark), cx, 0.98, cz);
        A(rbox(w - 0.8, 0.5, h - 0.8, 0.15, 0), clay('#e9e4da'), cx, 0.72, cz, { cast: false });
        A(rbox(0.5, 0.34, 0.05, 0.02, 0), clay('#23262c'), cx - 0.8, 1.2, cz - 0.1);
        for (let i = 0; i < 6; i++) gd('book', GEO.book, pick(BOOKS, i, 9), cx + 0.6, 1.03 + i * 0.05, cz + 0.2, i * 0.3, 3.5, 0.18, 1);
        sign(add, 'INFO & LOANS', '#2b2420', cx, B + 1.38, it.y + h - 0.05, 0, 1.6, 0.24, '#f2e3c0');
        for (const s of [-0.7, 0.7]) A(rbox(0.04, 0.4, 0.04, 0.015, 0), clay(P.brass), cx + s, 1.12, it.y + h - 0.08, { cast: false });
        break;
      }
      case 'bench': {
        A(rbox(0.5, 0.08, h - 0.2, 0.04, 0.006, cx), clay(P.wood), cx, 0.42, cz);
        for (const s of [-1, 1]) A(rbox(0.45, 0.38, 0.08, 0.03, 0), clay(P.woodDark), cx, 0.19, cz + s * (h / 2 - 0.3), { cast: false });
        break;
      }
      case 'returnbox': A(rbox(0.6, 1.0, 0.5, 0.1, 0.006), clay('#2e6fa1'), cx, 0.5, cz); A(rbox(0.4, 0.05, 0.06, 0.02, 0), clay('#1d4a6e'), cx, 0.8, cz + 0.25, { cast: false }); A(blob(0.3, 2, 0.01), clay('#2e6fa1'), cx, 1.0, cz, { s: [1, 0.35, 0.83] }); break;
      case 'plant':
        A(new THREE.CylinderGeometry(0.2, 0.15, 0.38, 16), clay(P.pot), cx, 0.19, cz);
        A(new THREE.CylinderGeometry(0.19, 0.19, 0.02, 16), clay('#5b4636'), cx, 0.38, cz, { cast: false });
        plantAt(cx, cz, 0.55 + B, 1.5, 8); plantAt(cx, cz, 0.82 + B, 1.1, 6);
        break;
      case 'castle': { // a soft play castle: walls with battlements, a turret at each corner, a doorway
        const wall = clay('#d9cfe8'), roof = clay('#e85d5d');
        A(rbox(w - 0.5, 0.75, h - 0.5, 0.08, 0.008), wall, cx, 0.375, cz);
        for (let i = 0; i < 6; i++) A(rbox(0.16, 0.14, 0.16, 0.04, 0), wall, it.x + 0.4 + i * (w - 0.8) / 5, 0.82, it.y + 0.28, { cast: false });
        for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const tx = it.x + 0.28 + dx * (w - 0.56), tz = it.y + 0.28 + dz * (h - 0.56);
          A(new THREE.CylinderGeometry(0.22, 0.24, 1.0, 16), clay('#b48ee0'), tx, 0.5, tz);
          A(new THREE.ConeGeometry(0.28, 0.4, 16), roof, tx, 1.2, tz);
        }
        A(rbox(0.4, 0.5, 0.06, 0.15, 0), clay('#7a5236'), cx, 0.25, it.y + h - 0.24, { cast: false });
        sign(add, 'STORY CASTLE', '#b48ee0', cx, B + 1.0, it.y + h - 0.22, 0, 0.9, 0.18);
        break;
      }
      case 'beanbag': A(blob(0.34, 3, 0.03, it.x), clay(it.color), cx, 0.2, cz, { s: [1, 0.6, 0.9] }); break;
      case 'cafecounter': {
        A(rbox(w - 0.1, 0.92, h - 0.3, 0.06, 0.004, cx), clay(P.white), cx, 0.46, it.y + 0.4);
        A(rbox(w - 0.04, 0.05, h - 0.24, 0.02, 0), clay(P.woodDark), cx, 0.94, it.y + 0.4);
        A(rbox(0.3, 0.32, 0.26, 0.05, 0.004), clay('#8a8f99'), it.x + 0.4, 1.13, it.y + 0.35);
        for (let i = 0; i < 4; i++) gd('ball', GEO.ball, '#d9a35b', it.x + 1.6 + i * 0.14, 1.0, it.y + 0.45, 0, 0.8);
        for (let i = 0; i < 3; i++) gd('cup', GEO.cup, '#ffffff', it.x + 2.6 + i * 0.12, 0.99, it.y + 0.45);
        sign(add, 'CAFÉ', '#7a5230', cx, B + S - 0.35, it.y + 0.06, 0, 1.0, 0.24);
        break;
      }
      case 'bistro':
        A(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 22), clay('#f2ede4'), cx, 0.72, cz);
        A(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8), clay(P.dark), cx, 0.36, cz, { cast: false });
        A(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 16), clay(P.dark), cx, 0.015, cz, { cast: false });
        gd('cup', GEO.cup, '#ffffff', cx - 0.08, 0.77, cz); gd('cup', GEO.cup, '#e85d5d', cx + 0.1, 0.77, cz + 0.06);
        chair(cx - 0.42, cz, 0, '#3a3f4c'); chair(cx + 0.42, cz, Math.PI, '#3a3f4c');
        break;
      case 'globe': { // a big globe on a wooden stand
        A(new THREE.CylinderGeometry(0.25, 0.3, 0.06, 18), clay(P.woodDark), cx, 0.03, cz);
        A(new THREE.CylinderGeometry(0.04, 0.05, 0.55, 10), clay(P.woodDark), cx, 0.32, cz, { cast: false });
        A(new THREE.TorusGeometry(0.36, 0.02, 8, 32), clay(P.brass), cx, 0.95, cz, { ry: 0.4, cast: false });
        const gl = A(blob(0.33, 3, 0.004, 4), clay('#4aa3df'), cx, 0.95, cz);
        for (let i = 0; i < 7; i++) { const a = i * 0.9, b2 = (hash(i, 3) - 0.5) * 1.6, l = new THREE.Mesh(blob(0.11 + hash(i, 1) * 0.06, 2, 0.02, i), clay('#6dbf5b')); l.position.set(Math.cos(a) * Math.cos(b2) * 0.3, Math.sin(b2) * 0.3, Math.sin(a) * Math.cos(b2) * 0.3); l.scale.set(1, 1, 0.45); l.lookAt(0, 0, 0); gl.add(l); }
        break;
      }
      case 'case': { // a wooden display case with a glass top, old books and scrolls inside
        A(rbox(w - 0.1, 0.75, h - 0.1, 0.05, 0.004), clay(P.woodDark), cx, 0.375, cz);
        const gb = A(rbox(w - 0.14, 0.32, h - 0.14, 0.03, 0), new THREE.MeshPhysicalMaterial({ color: '#e6f4fb', transparent: true, opacity: 0.3, roughness: 0.05, depthWrite: false }), cx, 0.92, cz, { cast: false });
        gb.renderOrder = 2;
        for (let i = 0; i < w * h * 2; i++) {
          const x = it.x + 0.25 + hash(it.x, i) * (w - 0.5), z = it.y + 0.25 + hash(it.y, i) * (h - 0.5);
          if (i % 2) A(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 10).rotateZ(Math.PI / 2), clay('#e8d6a8'), x, 0.8, z, { ry: i, cast: false }); // a scroll
          else gd('book', GEO.book, pick(['#6e3b46', '#4a3020', '#2f4a3a'], i), x, 0.79, z, i, 3, 0.15, 1.1);
        }
        break;
      }
      case 'maptable': {
        A(rbox(w - 0.1, 0.07, h - 0.2, 0.035, 0.004), clay(P.wood), cx, 0.72, cz);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) A(rbox(0.09, 0.69, 0.09, 0.03, 0), clay(P.woodDark), cx + sx * (w / 2 - 0.2), 0.345, cz + sz * (h / 2 - 0.2), { cast: false });
        const map = canvasTex(384, 128, (c, cw, ch) => {
          c.fillStyle = '#e8d6a8'; c.fillRect(0, 0, cw, ch); c.fillStyle = '#b9d4c4'; c.fillRect(0, 0, cw, ch);
          c.fillStyle = '#e8d6a8'; c.beginPath(); c.ellipse(110, 64, 90, 48, 0.3, 0, 7); c.ellipse(280, 70, 70, 40, -0.2, 0, 7); c.fill();
          c.strokeStyle = '#8a6a48'; c.lineWidth = 3; c.setLineDash([8, 6]); c.beginPath(); c.moveTo(60, 70); c.bezierCurveTo(150, 10, 220, 120, 300, 60); c.stroke();
          c.fillStyle = '#c0392b'; c.font = 'bold 30px serif'; c.fillText('✕', 290, 72);
        });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.4, h - 0.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map })); m.position.set(cx, 0.76 + B, cz); scene.add(m);
        break;
      }
      case 'dino': { // a big friendly clay dinosaur on a plinth, looking east
        const skin = clay('#6dbf5b'), belly = clay('#cfe8a8'), dark = clay('#4e9c47'), y0 = 0.3;
        A(rbox(w - 0.2, 0.3, h - 0.2, 0.08, 0.004), clay(P.stone), cx, 0.15, cz);
        A(blob(0.62, 3, 0.02, 1), skin, cx - 0.1, y0 + 0.95, cz, { s: [1.5, 0.85, 0.8] }); // body
        A(blob(0.42, 3, 0.02, 2), belly, cx + 0.05, y0 + 0.85, cz, { s: [1.4, 0.8, 0.75] });
        A(new THREE.ConeGeometry(0.34, 1.9, 16).rotateZ(Math.PI / 2 + 0.25), skin, cx - 1.55, y0 + 0.75, cz, { s: [1, 1, 0.8] }); // tail
        A(new THREE.CylinderGeometry(0.2, 0.3, 0.7, 14).rotateZ(-0.7), skin, cx + 0.8, y0 + 1.35, cz); // neck
        A(blob(0.3, 3, 0.015, 3), skin, cx + 1.15, y0 + 1.7, cz, { s: [1.5, 0.9, 0.9] }); // head
        A(blob(0.2, 2, 0.01, 4), skin, cx + 1.45, y0 + 1.62, cz, { s: [1.4, 0.7, 0.85] }); // snout
        for (const s of [-1, 1]) {
          A(new THREE.SphereGeometry(0.06, 10, 8), clay('#ffffff'), cx + 1.25, y0 + 1.82, cz + s * 0.2, { cast: false });
          A(new THREE.SphereGeometry(0.032, 8, 6), clay('#1d1410'), cx + 1.29, y0 + 1.83, cz + s * 0.22, { cast: false });
          A(new THREE.CylinderGeometry(0.15, 0.13, 0.75, 12), skin, cx - 0.15, y0 + 0.37, cz + s * 0.32); // legs
          A(blob(0.15, 2, 0.01), dark, cx - 0.05, y0 + 0.05, cz + s * 0.32, { s: [1.5, 0.6, 1] });
          A(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8).rotateZ(-1), skin, cx + 0.62, y0 + 0.95, cz + s * 0.25, { cast: false }); // little arms
        }
        for (let i = 0; i < 7; i++) A(new THREE.ConeGeometry(0.09, 0.22, 4), dark, cx - 1.2 + i * 0.32, y0 + 1.42 - Math.abs(i - 3) * 0.06, cz, { cast: false }); // spines
        A(new THREE.TorusGeometry(0.12, 0.012, 6, 16, Math.PI), clay('#1d1410'), cx + 1.55, y0 + 1.56, cz, { rz: Math.PI, cast: false }); // a smile
        sign(add, 'T. REX (CLAY)', '#2b2420', cx, B + 0.2, it.y + h - 0.08, 0, 1.0, 0.14, '#f2e3c0');
        break;
      }
      case 'roundtable':
        A(new THREE.CylinderGeometry(0.75, 0.75, 0.06, 32), clay('#f2ede4'), cx, 0.72, cz);
        A(new THREE.CylinderGeometry(0.08, 0.1, 0.69, 10), clay(P.dark), cx, 0.345, cz, { cast: false });
        A(new THREE.CylinderGeometry(0.35, 0.35, 0.04, 20), clay(P.dark), cx, 0.02, cz, { cast: false });
        gd('book', GEO.book, BOOKS[1], cx - 0.2, 0.77, cz, 0.5, 2.5, 0.2, 1); gd('page', GEO.page, '#f4efe2', cx + 0.2, 0.765, cz + 0.1, 0.2); gd('cup', GEO.cup, '#ffffff', cx + 0.1, 0.79, cz - 0.25);
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; chair(cx + Math.cos(a) * 0.98, cz + Math.sin(a) * 0.98, Math.PI - a, '#4e8a86'); }
        break;
    }
  }

  // ---- everything collected above, drawn together
  for (const { geo, color, list } of goods.values()) many(geo, clay(color), list, (o, g) => { o.position.set(g.x, g.y, g.z); o.rotation.y = g.ry; o.scale.set(g.sx, g.sy, g.sz); });
  // chairs: a seat, a back on the far side from where the sitter faces, four legs (`a`: the way the sitter faces)
  for (const color of [...new Set(chairs.map(c => c.c))]) {
    const list = chairs.filter(c => c.c === color);
    many(rbox(0.36, 0.06, 0.36, 0.03, 0.004), clay(color), list, (o, c) => { o.position.set(c.x, c.y + 0.44, c.z); o.rotation.y = c.a; }, { cast: true });
    many(rbox(0.06, 0.4, 0.36, 0.03, 0.004), clay(color), list, (o, c) => { o.position.set(c.x - Math.cos(c.a) * 0.16, c.y + 0.66, c.z + Math.sin(c.a) * 0.16); o.rotation.y = c.a; }, { cast: true });
    const legs = list.flatMap(c => [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => ({ x: c.x + a * 0.14, z: c.z + b * 0.14, y: c.y })));
    many(new THREE.CylinderGeometry(0.018, 0.018, 0.42, 6), clay(P.dark), legs, (o, l) => o.position.set(l.x, l.y + 0.21, l.z));
  }
  many(blob(0.12, 1, 0.025, 2), clay(P.leaf), leaves.filter(l => l.r % 2), (o, l) => { o.position.set(l.x, l.y, l.z); o.scale.set(l.s, l.s * 0.75, l.s); o.rotation.y = l.r; });
  many(blob(0.12, 1, 0.025, 4), clay(P.leaf2), leaves.filter(l => !(l.r % 2)), (o, l) => { o.position.set(l.x, l.y, l.z); o.scale.set(l.s, l.s * 0.75, l.s); o.rotation.y = l.r; });
  return X;
}

// the fire flickers
export function updateLibrary(X, t) {
  for (const f of X.flames) { const k = 0.8 + 0.3 * Math.sin(t * 11 + f.ph) * Math.sin(t * 6.3 + f.ph * 2); f.m.scale.set(1, k, 1); f.m.position.y = f.y + (k - 1) * 0.2; }
  if (X.fire) X.fire.intensity = 2.0 + 0.5 * Math.sin(t * 13) * Math.sin(t * 7.7);
}
