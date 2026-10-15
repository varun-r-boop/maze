// The mall in 3D, in clay: a sunny promenade under a glass skylight with a splashing fountain, benches, planters and
// kiosk carts; glass shopfronts with name signs; and every shop stocked (clothes on rails, walls of shoes, toys,
// screens, books, a café, sports gear, a pharmacy, jewelry cases), plus a food court and a car park outside.
// Map space -> 3D: x = tile x, z = tile y, y is up; one tile is one unit.
import * as THREE from 'three';
import { clay, rbox, blob, hash, clayKit, clayWalls } from './clay.js';

const Sh = window.Shared;
const { COLS, ROWS } = Sh.C;

const P = {
  wall: '#f3ece1', skirting: '#cbbfae', ceiling: '#f7f2e9', promenade: '#ece3d4', inlay: '#c9b28f', service: '#a3a8b0', wc: '#e2ecee',
  food: '#efe7d8', white: '#f6f1e8', wood: '#c88d5c', woodDark: '#8c5a36', dark: '#3d414a', steel: '#b6bfca', frame: '#4b5058',
  green: '#6dbf5b', green2: '#4e9c47', pot: '#cf7b51', stone: '#d9cfbf',
};
const SHOP_FLOOR = { fashion: '#efe2d6', shoes: '#c99a6a', toys: '#bfe0f2', tech: '#d3d7de', books: '#b8895a', cafe: '#a9784f', sports: '#9fcfa8', pharmacy: '#e9f2ef', jewelry: '#3a3846' };
const BRIGHT = ['#e85d5d', '#f2b43b', '#4aa3df', '#6dbf5b', '#b48ee0', '#f07cb0', '#ffffff'];
const pick = (list, ...k) => list[Math.floor(hash(...k) * list.length)];

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
// a sign: a rounded clay board with the text on its front (front = +z before rotating by `ry`)
function sign(add, text, color, x, y, z, ry, w = 1.6, h = 0.3) {
  const tex = canvasTex(512, Math.round(512 * h / w), (c, cw, ch) => {
    c.fillStyle = color; c.fillRect(0, 0, cw, ch);
    c.fillStyle = '#ffffff'; c.font = `bold ${Math.round(ch * 0.58)}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, cw / 2, ch / 2 + 2);
  });
  const b = add(rbox(w + 0.06, h + 0.06, 0.06, 0.03, 0), clay(color), x, y, z, { ry, cast: false });
  const f = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex })); f.position.z = 0.032; b.add(f);
  return b;
}

export function buildMall(scene, G, WALL_H) {
  const M = G.mall, X = { jets: [], water: null };
  const { add, many } = clayKit(scene);
  const goods = new Map(); // little things on shelves and tables, drawn together at the end: key -> { geo, color, list }
  const good = (key, geo, color, x, y, z, ry = 0, s = 1) => {
    const k = key + color;
    if (!goods.has(k)) goods.set(k, { geo, color, list: [] });
    goods.get(k).list.push({ x, y, z, ry, s });
  };
  const leaves = [];
  const plantAt = (x, z, y, s, n = 6) => { for (let i = 0; i < n; i++) leaves.push({ x: x + Math.cos(i * 2.4) * 0.11 * s, z: z + Math.sin(i * 2.4) * 0.11 * s, y: y + (i % 3) * 0.06 * s, s: s * (0.65 + hash(x, z, i) * 0.45), r: i }); };
  const chairs = []; // simple café chairs: { x, z, a (the way the sitter faces), c }
  const GEO = { // shared shapes for the goods
    shoe: rbox(0.2, 0.08, 0.09, 0.03, 0.004), block: rbox(0.12, 0.12, 0.12, 0.04, 0.006), ball: blob(0.07, 2, 0.004), book: rbox(0.05, 0.24, 0.17, 0.012, 0),
    box: rbox(0.14, 0.16, 0.1, 0.02, 0.003), bottle: new THREE.CylinderGeometry(0.035, 0.035, 0.13, 10), phone: rbox(0.07, 0.012, 0.14, 0.006, 0),
    shirt: rbox(0.22, 0.04, 0.2, 0.015, 0.004), hanger: rbox(0.06, 0.38, 0.3, 0.025, 0.006), cup: new THREE.CylinderGeometry(0.035, 0.03, 0.07, 10), sball: blob(0.1, 2, 0.004),
  };

  // ---- light: bright daylight pouring in through the skylight over the promenade
  scene.background = new THREE.Color('#bcdcf2');
  scene.fog = new THREE.Fog('#d9e6ee', 20, 48);
  scene.add(new THREE.HemisphereLight('#fff6e6', '#a89a8a', 1.3));
  const sun = new THREE.DirectionalLight('#fff0d4', 2.4);
  sun.position.set(COLS / 2 - 10, 32, ROWS / 2 - 8); sun.target.position.set(COLS / 2, 0, ROWS / 2);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 90 });
  scene.add(sun, sun.target);

  // ---- floors: a clay slab per room on a base slab; an inlaid border down both sides of the promenade
  add(new THREE.BoxGeometry(COLS, 0.1, ROWS), clay(P.promenade, { repeat: [COLS / 1.5, ROWS / 1.5] }), COLS / 2, -0.05, ROWS / 2, { cast: false });
  for (const r of M.rooms) {
    const w = r.x1 - r.x0 + 1, h = r.y1 - r.y0 + 1;
    const color = r.type === 'shop' ? SHOP_FLOOR[r.theme] : { service: P.service, passage: P.service, wc: P.wc, food: P.food, promenade: P.promenade }[r.type];
    add(rbox(w - 0.04, 0.06, h - 0.04, 0.03, 0.004, r.x0 + r.y0), clay(color, { repeat: [w / 1.5, h / 1.5] }), r.x0 + w / 2, -0.02, r.y0 + h / 2, { cast: false });
  }
  for (const z of [12.2, 18.8]) add(rbox(COLS - 2.4, 0.02, 0.18, 0.01, 0), clay(P.inlay), COLS / 2, 0.012, z, { cast: false });
  const food = M.rooms.find(r => r.type === 'food'), checks = [];
  for (let y = food.y0; y <= food.y1; y++) for (let x = food.x0; x <= food.x1; x++) if ((x + y) % 2 && G.grid[y][x] !== 1) checks.push({ x, y });
  many(rbox(0.98, 0.02, 0.98, 0.01, 0), clay('#d6c8b0'), checks, (o, p) => o.position.set(p.x + 0.5, 0.012, p.y + 0.5)); // food-court checkerboard

  // ---- walls
  const windowAt = new Set(M.windows.map(w => w.y * COLS + w.x));
  clayWalls(add, (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS && G.grid[y][x] === 1 && !windowAt.has(y * COLS + x), COLS, ROWS, WALL_H, P.wall, P.skirting);

  // ---- the glass entrance doors in the west wall, and the car park outside
  const frameMat = clay(P.frame);
  const glassMat = new THREE.MeshPhysicalMaterial({ color: '#d8eefa', transparent: true, opacity: 0.16, roughness: 0.05, depthWrite: false });
  for (const w of M.windows) {
    add(new THREE.BoxGeometry(0.03, WALL_H - 0.12, 1), glassMat, w.x + 0.5, (WALL_H - 0.12) / 2, w.y + 0.5, { cast: false });
    add(rbox(0.12, 0.08, 1, 0.03, 0), frameMat, w.x + 0.5, WALL_H - 0.08, w.y + 0.5, { cast: false });
    add(rbox(0.1, WALL_H, 0.07, 0.03, 0), frameMat, w.x + 0.5, WALL_H / 2, w.y + 1, { cast: false });
    if (w.y === 15) add(rbox(0.06, 0.3, 0.05, 0.02, 0), clay(P.steel), w.x + 0.6, 0.6, w.y + 0.5, { cast: false }); // door handles
  }
  add(new THREE.CircleGeometry(80, 32).rotateX(-Math.PI / 2), clay('#8db86a'), COLS / 2, -0.7, ROWS / 2, { cast: false }); // grass
  add(rbox(14, 0.06, 24, 0.03, 0), clay('#7c828b'), -8, -0.66, ROWS / 2, { cast: false }); // car park
  const bays = []; for (let i = 0; i < 9; i++) bays.push(i);
  many(rbox(2, 0.02, 0.08, 0.01, 0), clay('#f2efe6'), bays, (o, i) => o.position.set(-6, -0.62, 5.5 + i * 2.5));
  for (let i = 0; i < 6; i++) { // parked cars
    const cz = 6.5 + i * 2.5 + (i > 2 ? 2.5 : 0), col = BRIGHT[i % 6];
    add(rbox(1.8, 0.45, 1, 0.2, 0.01, i), clay(col), -6.2, -0.4, cz);
    add(rbox(1.0, 0.35, 0.9, 0.18, 0.01, i + 9), clay(col), -6.4, -0.05, cz);
    add(rbox(0.95, 0.28, 0.92, 0.12, 0), clay('#a9cce3'), -6.4, -0.05, cz, { cast: false });
    for (const [dx, dz] of [[0.55, 0.48], [-0.55, 0.48], [0.55, -0.48], [-0.55, -0.48]]) add(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 14).rotateX(Math.PI / 2), clay('#2a2d33'), -6.2 + dx, -0.5, cz + dz, { cast: false });
  }
  const trees = []; for (let i = 0; i < 18; i++) trees.push(i < 9 ? { x: -2.5, z: 1.5 + i * 3.4 } : { x: -12 + hash(i, 2) * 4, z: -2 + (i - 9) * 4 });
  many(new THREE.CylinderGeometry(0.12, 0.17, 1.6, 8), clay(P.woodDark), trees, (o, p) => o.position.set(p.x, 0.1, p.z));
  many(blob(1, 2, 0.12, 3), clay('#6aa84f'), trees, (o, p) => { o.position.set(p.x, 1.5, p.z); o.scale.setScalar(0.8 + hash(p.x, p.z) * 0.5); });
  const clouds = []; for (let i = 0; i < 10; i++) for (let k = 0; k < 4; k++) clouds.push({ x: -14 + i * 7 + k * 1.1, y: 11 + hash(i, 5) * 3 + (k % 2) * 0.4, z: -10 + hash(i, 6) * 40, s: 1.2 + hash(i, k) * 0.9 });
  many(blob(1, 2, 0.08, 7), new THREE.MeshLambertMaterial({ color: '#ffffff', fog: false }), clouds, (o, c) => { o.position.set(c.x, c.y, c.z); o.scale.set(c.s * 1.4, c.s * 0.8, c.s); });

  // ---- ceiling: solid over the shops and corridors, a glass skylight with clay beams over the promenade
  const ceilMat = clay(P.ceiling, { emissive: new THREE.Color('#e9e1d3'), emissiveIntensity: 0.55 });
  add(new THREE.PlaneGeometry(COLS, 12).rotateX(Math.PI / 2), ceilMat, COLS / 2, WALL_H, 6, { cast: false });
  add(new THREE.PlaneGeometry(COLS, ROWS - 19).rotateX(Math.PI / 2), ceilMat, COLS / 2, WALL_H, 19 + (ROWS - 19) / 2, { cast: false });
  add(new THREE.BoxGeometry(COLS - 2, 0.02, 7), new THREE.MeshPhysicalMaterial({ color: '#e6f4fb', transparent: true, opacity: 0.12, roughness: 0.05, depthWrite: false }), COLS / 2, WALL_H + 0.25, 15.5, { cast: false });
  for (let x = 2; x < COLS - 1; x += 3) add(rbox(0.12, 0.14, 7.2, 0.05, 0.004), clay('#ffffff'), x, WALL_H + 0.18, 15.5); // skylight beams (they cast stripes of shade)
  for (const z of [12, 19]) add(rbox(COLS - 2, 0.3, 0.2, 0.08, 0.004), clay('#ffffff'), COLS / 2, WALL_H + 0.1, z);
  const panels = [];
  for (let y = 1; y < ROWS - 1; y += 2) for (let x = 1; x < COLS - 1; x += 3) if (G.grid[y][x] !== 1 && (y < 12 || y > 18)) panels.push({ x, y });
  many(rbox(0.6, 0.04, 0.6, 0.02, 0), new THREE.MeshBasicMaterial({ color: '#fffdf5' }), panels, (o, p) => o.position.set(p.x + 0.5, WALL_H - 0.01, p.y + 0.5));

  // ---- glass shopfronts, with each shop's name on a sign above
  const frost = new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, roughness: 0.6, depthWrite: false });
  for (const w of M.glass) {
    add(new THREE.BoxGeometry(1, WALL_H, 0.03), glassMat, w.x + 0.5, WALL_H / 2, w.y + 0.5, { cast: false });
    add(new THREE.BoxGeometry(1, 0.06, 0.04), frost, w.x + 0.5, 0.95, w.y + 0.5, { cast: false });
    add(rbox(1, 0.07, 0.1, 0.03, 0), frameMat, w.x + 0.5, 0.035, w.y + 0.5, { cast: false });
    add(rbox(1, 0.26, 0.12, 0.04, 0), frameMat, w.x + 0.5, WALL_H - 0.13, w.y + 0.5, { cast: false }); // header band
  }
  for (const r of M.rooms.filter(r => r.type === 'shop')) {
    const cx = (r.x0 + r.x1 + 1) / 2, z = r.front + 0.5 + (r.north ? 0.09 : -0.09);
    sign(add, r.name.toUpperCase(), r.color, cx, WALL_H - 0.14, z, r.north ? 0 : Math.PI, Math.min(r.x1 - r.x0 - 0.5, 3.4), 0.22);
    for (const s of [0, 1.94]) add(rbox(0.07, WALL_H, 0.12, 0.03, 0), frameMat, r.door + s + 0.03, WALL_H / 2, r.front + 0.5, { cast: false }); // door frame
  }

  // ---- the shops' fixtures and stock
  // a shelving unit against a wall (face 1: on the west wall, open to the east; -1: the other way; 0: an island open both ways)
  const shelf = (it, color, h, stockFn) => {
    const cx = it.x + it.w / 2, cz = it.y + it.h / 2, alongZ = it.h >= it.w;
    add(rbox(it.w - 0.06, h, it.h - 0.06, 0.04, 0.004, cx + cz), clay(color), cx, h / 2, cz);
    const sides = it.face === 0 ? [-1, 1] : [it.face];
    for (const side of sides) for (let lv = 0; lv < 3; lv++) {
      const y = 0.18 + lv * (h - 0.25) / 3, len = alongZ ? it.h : it.w;
      for (let i = 0; i < len * 4; i++) {
        const t = (i + 0.5) / (len * 4), px = alongZ ? cx + side * (it.w / 2 - 0.15) : it.x + t * it.w, pz = alongZ ? it.y + t * it.h : cz + side * (it.h / 2 - 0.15);
        stockFn(px, y, pz, i * 7 + lv * 3 + it.x, alongZ ? Math.PI / 2 : 0);
      }
    }
  };
  const tableTop = (it, color, y = 0.72) => {
    const cx = it.x + it.w / 2, cz = it.y + it.h / 2;
    add(rbox(it.w - 0.12, 0.07, it.h - 0.2, 0.035, 0.004, cx), clay(color), cx, y, cz);
    add(rbox(it.w - 0.3, y - 0.04, it.h - 0.45, 0.06, 0.004, cz), clay(P.white), cx, (y - 0.04) / 2, cz);
    return { cx, cz };
  };
  for (const it of M.items) {
    const w = it.w || 1, h = it.h || 1, cx = it.x + w / 2, cz = it.y + h / 2;
    switch (it.type) {
      case 'rack': { // a clothes rail with things hanging on it
        const alongZ = h >= w, len = alongZ ? h : w;
        add(rbox(alongZ ? 0.05 : len - 0.1, 0.05, alongZ ? len - 0.1 : 0.05, 0.02, 0), clay(P.steel), cx, 1.12, cz, { cast: false });
        for (const s of [-1, 1]) add(rbox(0.05, 1.12, 0.05, 0.02, 0), clay(P.steel), cx + (alongZ ? 0 : s * (len / 2 - 0.08)), 0.56, cz + (alongZ ? s * (len / 2 - 0.08) : 0), { cast: false });
        for (let i = 0; i < len * 5; i++) { const t = (i + 0.5) / (len * 5) - 0.5; good('hanger', GEO.hanger, pick(BRIGHT, it.x, i), cx + (alongZ ? 0 : t * len), 0.88, cz + (alongZ ? t * len : 0), alongZ ? 0 : Math.PI / 2); }
        break;
      }
      case 'fitting': // two changing booths with curtains (the back wall is behind them)
        for (let i = 0; i < w; i++) {
          add(rbox(0.06, WALL_H - 0.1, 0.9, 0.02, 0), clay(P.white), it.x + i + 0.03, (WALL_H - 0.1) / 2, cz);
          add(rbox(0.9, 0.95, 0.06, 0.05, 0.02, i), clay('#c0598a'), it.x + i + 0.5, 0.62, it.y + 0.95);
        }
        add(rbox(0.06, WALL_H - 0.1, 0.9, 0.02, 0), clay(P.white), it.x + w - 0.03, (WALL_H - 0.1) / 2, cz);
        break;
      case 'mannequin': // a dressed mannequin on a stand
        add(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 16), clay(P.dark), cx, 0.015, cz, { cast: false });
        add(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 8), clay(P.dark), cx, 0.23, cz, { cast: false });
        add(rbox(0.26, 0.42, 0.2, 0.09, 0.006), clay(pick(BRIGHT, it.x, it.y)), cx, 0.66, cz);
        add(blob(0.09, 2, 0.003), clay('#efe6dc'), cx, 0.97, cz);
        break;
      case 'counter': case 'cafecounter': {
        add(rbox(w - 0.1, 0.92, h - 0.2, 0.06, 0.004, cx), clay(P.white), cx, 0.46, cz);
        add(rbox(w - 0.04, 0.05, h - 0.14, 0.02, 0), clay(it.type === 'cafecounter' ? P.woodDark : '#5a5f68'), cx, 0.94, cz);
        add(rbox(0.22, 0.16, 0.18, 0.04, 0), clay('#2c3036'), cx + (w > 1 ? w / 2 - 0.3 : 0), 1.04, cz); // till
        if (it.type === 'cafecounter') {
          add(rbox(0.3, 0.32, 0.26, 0.05, 0.004), clay('#8a8f99'), it.x + 0.3, 1.13, cz); // espresso machine
          const dome = add(new THREE.SphereGeometry(0.16, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: '#e6f4fb', transparent: true, opacity: 0.35, roughness: 0.05, depthWrite: false }), it.x + 1.3, 0.97, cz, { cast: false });
          dome.renderOrder = 2;
          for (let i = 0; i < 4; i++) good('pastry', GEO.ball, '#d9a35b', it.x + 1.22 + (i % 2) * 0.12, 1.0, cz - 0.05 + Math.floor(i / 2) * 0.1, 0, 0.7);
          for (let i = 0; i < 3; i++) good('cup', GEO.cup, '#ffffff', it.x + 0.75 + i * 0.1, 0.99, cz + 0.12);
        }
        break;
      }
      case 'shoeshelf': shelf(it, '#8c6a4c', 1.2, (x, y, z, k, ry) => good('shoe', GEO.shoe, pick(['#2b2b2b', '#e85d5d', '#ffffff', '#4aa3df', '#c88d5c'], k), x, y + 0.05, z, ry)); break;
      case 'toyshelf': shelf(it, '#f3f3f3', 1.2, (x, y, z, k, ry) => k % 2 ? good('block', GEO.block, pick(BRIGHT, k), x, y + 0.07, z, ry + k) : good('ball', GEO.ball, pick(BRIGHT, k, 1), x, y + 0.07, z)); break;
      case 'bookshelf': shelf(it, '#7a5a3e', 1.25, (x, y, z, k, ry) => good('book', GEO.book, pick(['#c0392b', '#2e86c1', '#27ae60', '#f39c12', '#8e44ad', '#ecf0f1'], k), x, y + 0.13, z, ry, 0.8 + hash(k, 3) * 0.3)); break;
      case 'sportshelf': shelf(it, '#5d6470', 1.2, (x, y, z, k, ry) => good('sball', GEO.sball, pick(['#f39c12', '#ffffff', '#2e86c1', '#e74c3c'], k), x, y + 0.1, z)); break;
      case 'pharmshelf': shelf(it, '#f5f7f8', 1.15, (x, y, z, k, ry) => k % 2 ? good('box', GEO.box, pick(['#ffffff', '#5dade2', '#58d68d', '#f5b7b1'], k), x, y + 0.08, z, ry) : good('bottle', GEO.bottle, pick(['#ffffff', '#f8c471', '#85c1e9'], k), x, y + 0.07, z)); break;
      case 'tvwall': { // a wall of TVs, each showing something
        add(rbox(0.2, WALL_H - 0.15, h - 0.06, 0.04, 0), clay('#2a2d33'), it.x + 0.1, (WALL_H - 0.15) / 2, cz);
        for (let i = 0; i < h * 2; i++) for (let j = 0; j < 2; j++) {
          const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.3), new THREE.MeshBasicMaterial({ color: pick(BRIGHT, i, j) }));
          sc.position.set(it.x + 0.215, 0.45 + j * 0.42, it.y + 0.27 + i * 0.5); sc.rotation.y = Math.PI / 2; scene.add(sc);
        }
        break;
      }
      case 'table': { // a display table, with whatever the shop sells on it
        const { cx: tx, cz: tz } = tableTop(it, it.kind === 'tech' ? P.white : '#e9dfcf');
        for (let i = 0; i < w * 4; i++) {
          const gx = it.x + 0.2 + (i % (w * 2)) * (w - 0.4) / (w * 2 - 1), gz = tz + (i < w * 2 ? -0.12 : 0.12);
          if (it.kind === 'tech') good('phone', GEO.phone, pick(['#23262c', '#e3e6ea', '#5aa9e6'], i, it.y), gx, 0.765, gz, 0.2);
          else if (it.kind === 'toys') good('block', GEO.block, pick(BRIGHT, i, it.y), gx, 0.82, gz, i);
          else good('shirt', GEO.shirt, pick(BRIGHT, i, it.x), gx, 0.78, gz, 0, 0.9);
        }
        break;
      }
      case 'bench': {
        const alongZ = h > w, len = alongZ ? h : w;
        add(rbox(alongZ ? 0.5 : len - 0.2, 0.08, alongZ ? len - 0.2 : 0.5, 0.04, 0.006, cx), clay('#b07b4f'), cx, 0.42, cz);
        for (const s of [-0.35, 0.35]) add(rbox(alongZ ? 0.45 : 0.08, 0.38, alongZ ? 0.08 : 0.45, 0.03, 0), clay(P.dark), cx + (alongZ ? 0 : s * len), 0.19, cz + (alongZ ? s * len : 0), { cast: false });
        break;
      }
      case 'mirror': // a tall standing mirror
        add(rbox(0.5, 1.15, 0.06, 0.2, 0.004), clay(P.wood), cx, 0.6, cz);
        add(new THREE.PlaneGeometry(0.4, 1.0), new THREE.MeshPhysicalMaterial({ color: '#dfeaf0', roughness: 0.05, metalness: 0.9 }), cx, 0.6, cz - 0.035, { ry: Math.PI, cast: false });
        break;
      case 'teddy': { // a giant teddy bear
        const bear = clay('#b07a4c'), snout = clay('#e8c9a0');
        add(blob(0.3, 3, 0.01, 1), bear, cx, 0.32, cz, { s: [1, 1, 0.9] });
        add(blob(0.22, 3, 0.008, 2), bear, cx, 0.78, cz);
        for (const s of [-1, 1]) { add(blob(0.08, 2, 0.004), bear, cx + s * 0.16, 0.97, cz); add(blob(0.1, 2, 0.006), bear, cx + s * 0.28, 0.4, cz - 0.08); add(blob(0.11, 2, 0.006), bear, cx + s * 0.16, 0.08, cz - 0.2); }
        add(blob(0.08, 2, 0.003), snout, cx, 0.74, cz - 0.19);
        for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.025, 8, 6), clay('#1d1410'), cx + s * 0.08, 0.84, cz - 0.19, { cast: false });
        add(new THREE.TorusGeometry(0.16, 0.035, 8, 18).rotateX(Math.PI / 2), clay('#e85d5d'), cx, 0.6, cz, { cast: false });
        break;
      }
      case 'armchair': {
        const g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = it.face === 0 ? -Math.PI / 2 : Math.PI / 2; // the back against the side wall
        const mat = clay(it.color);
        const seat = new THREE.Mesh(rbox(0.66, 0.16, 0.62, 0.07, 0.012), mat); seat.position.set(0, 0.36, 0); g.add(seat);
        const back = new THREE.Mesh(rbox(0.68, 0.5, 0.16, 0.08, 0.012), mat); back.position.set(0, 0.62, 0.28); back.rotation.x = -0.18; g.add(back);
        for (const [lx, lz] of [[-0.26, -0.24], [0.26, -0.24], [-0.26, 0.24], [0.26, 0.24]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.015, 0.3, 8), clay(P.wood)); l.position.set(lx, 0.15, lz); g.add(l); }
        g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); scene.add(g);
        break;
      }
      case 'bistro': // a little round café table for two
        add(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 22), clay('#f2ede4'), cx, 0.72, cz);
        add(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8), clay(P.dark), cx, 0.36, cz, { cast: false });
        add(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 16), clay(P.dark), cx, 0.015, cz, { cast: false });
        good('cup', GEO.cup, '#ffffff', cx - 0.08, 0.77, cz); good('cup', GEO.cup, '#e85d5d', cx + 0.1, 0.77, cz + 0.06);
        chairs.push({ x: cx - 0.42, z: cz, a: 0, c: '#3a3f4c' }, { x: cx + 0.42, z: cz, a: Math.PI, c: '#3a3f4c' });
        break;
      case 'bike': { // a bike on a display stand
        const frameC = clay('#e74c3c'), tyre = clay('#2b2b2b');
        for (const s of [-0.38, 0.38]) add(new THREE.TorusGeometry(0.24, 0.035, 8, 22), tyre, cx + s, 0.3, cz, { cast: false });
        add(new THREE.CylinderGeometry(0.025, 0.025, 0.8, 8), frameC, cx, 0.42, cz, { rz: Math.PI / 2 - 0.25, cast: false });
        add(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 8), frameC, cx - 0.12, 0.45, cz, { rz: 0.4, cast: false });
        add(rbox(0.2, 0.05, 0.1, 0.025, 0), clay(P.dark), cx - 0.2, 0.68, cz, { cast: false });
        add(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8), clay(P.dark), cx + 0.32, 0.7, cz, { rx: Math.PI / 2, cast: false });
        break;
      }
      case 'treadmill':
        add(rbox(w - 0.2, 0.16, 0.7, 0.06, 0.004), clay('#3a3f4c'), cx, 0.08, cz);
        add(rbox(w - 0.5, 0.02, 0.5, 0.01, 0), clay('#1e2026'), cx - 0.1, 0.17, cz, { cast: false });
        for (const s of [-0.3, 0.3]) add(rbox(0.05, 1.0, 0.05, 0.02, 0), clay(P.steel), it.x + w - 0.25, 0.5, cz + s, { cast: false });
        add(rbox(0.12, 0.25, 0.7, 0.05, 0), clay('#2c3036'), it.x + w - 0.22, 1.0, cz);
        break;
      case 'ballbin':
        for (let i = 0; i < 3; i++) add(new THREE.TorusGeometry(0.32, 0.015, 6, 22).rotateX(Math.PI / 2), clay(P.steel), cx, 0.1 + i * 0.22, cz, { cast: false });
        for (let i = 0; i < 9; i++) good('sball', GEO.sball, pick(['#f39c12', '#ffffff', '#2e86c1', '#e74c3c', '#27ae60'], i), cx + Math.cos(i * 1.7) * 0.18 * (i % 3) / 2, 0.15 + Math.floor(i / 3) * 0.16, cz + Math.sin(i * 1.7) * 0.18 * (i % 3) / 2, 0, 1.2);
        break;
      case 'case': { // a glass jewelry case with gold rings and necklaces inside
        add(rbox(w - 0.1, 0.7, h - 0.1, 0.05, 0.004), clay(P.white), cx, 0.35, cz);
        const glassBox = add(rbox(w - 0.12, 0.28, h - 0.12, 0.03, 0), new THREE.MeshPhysicalMaterial({ color: '#e6f4fb', transparent: true, opacity: 0.3, roughness: 0.05, depthWrite: false }), cx, 0.85, cz, { cast: false });
        glassBox.renderOrder = 2;
        for (let i = 0; i < w * h * 4; i++) add(new THREE.TorusGeometry(0.035, 0.01, 6, 14).rotateX(Math.PI / 2 - 0.4), clay(i % 3 ? '#e9c25a' : '#dfe8ee', { metalness: 0.5, roughness: 0.3 }), it.x + 0.15 + hash(it.x, i) * (w - 0.3), 0.74, it.y + 0.15 + hash(it.y, i) * (h - 0.3), { cast: false });
        break;
      }
      case 'plant': case 'planter':
        if (it.type === 'planter') add(rbox(0.7, 0.45, 0.7, 0.12, 0.008, it.x), clay(P.stone), cx, 0.225, cz);
        else add(new THREE.CylinderGeometry(0.2, 0.15, 0.38, 16), clay(P.pot), cx, 0.19, cz);
        add(new THREE.CylinderGeometry(it.type === 'planter' ? 0.3 : 0.19, 0.19, 0.02, 16), clay('#5b4636'), cx, it.type === 'planter' ? 0.45 : 0.38, cz, { cast: false });
        if (it.type === 'planter') { // a little tree
          add(new THREE.CylinderGeometry(0.04, 0.06, 0.6, 8), clay(P.woodDark), cx, 0.75, cz);
          add(blob(0.32, 2, 0.04, it.x), clay('#5aa84a'), cx, 1.1, cz);
        } else { plantAt(cx, cz, 0.55, 1.5, 8); plantAt(cx, cz, 0.82, 1.1, 6); }
        break;
      case 'fountain': { // a round stone basin, rippling water and a jet that splashes up
        add(new THREE.TorusGeometry(1.32, 0.16, 12, 40).rotateX(Math.PI / 2), clay(P.stone), cx, 0.28, cz);
        add(new THREE.CylinderGeometry(1.34, 1.4, 0.28, 40), clay(P.stone), cx, 0.14, cz);
        X.water = new THREE.MeshPhysicalMaterial({ color: '#5ab0e0', roughness: 0.08, metalness: 0.1, emissive: '#1f6fa0', emissiveIntensity: 0.25, transparent: true, opacity: 0.88 });
        add(new THREE.CylinderGeometry(1.24, 1.24, 0.03, 40), X.water, cx, 0.29, cz, { cast: false });
        add(new THREE.CylinderGeometry(0.22, 0.3, 0.6, 18), clay(P.stone), cx, 0.45, cz);
        add(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 24), clay(P.stone), cx, 0.77, cz);
        const jetMat = new THREE.MeshBasicMaterial({ color: '#d6f1ff', transparent: true, opacity: 0.55, depthWrite: false });
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * Math.PI * 2, jet = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.5, 8, 1, true), jetMat);
          jet.position.set(cx + Math.cos(a) * 0.32, 0.95, cz + Math.sin(a) * 0.32); jet.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
          scene.add(jet); X.jets.push({ m: jet, ph: i });
        }
        const top = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.6, 8, 1, true), jetMat); top.position.set(cx, 1.08, cz); scene.add(top); X.jets.push({ m: top, ph: 9 });
        break;
      }
      case 'kiosk': { // a cart with a striped awning
        add(rbox(w - 0.2, 0.8, 0.7, 0.08, 0.006, cx), clay(P.white), cx, 0.45, cz);
        for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 14).rotateX(Math.PI / 2), clay(P.dark), cx + s * (w / 2 - 0.25), 0.1, cz + 0.36, { cast: false });
        for (const s of [-1, 1]) add(rbox(0.05, 0.7, 0.05, 0.02, 0), clay(P.steel), cx + s * (w / 2 - 0.15), 1.15, cz, { cast: false });
        for (let i = 0; i < 8; i++) add(rbox((w - 0.1) / 8, 0.05, 0.85, 0.02, 0), clay(i % 2 ? '#ffffff' : it.color), it.x + 0.05 + (i + 0.5) * (w - 0.1) / 8, 1.5 - Math.abs(i - 3.5) * 0.01, cz, { rx: 0.08 });
        sign(add, it.name, it.color, cx, 0.6, cz + 0.36, 0, w - 0.5, 0.2);
        for (let i = 0; i < 6; i++) {
          if (it.name === 'Pretzels') add(new THREE.TorusGeometry(0.07, 0.03, 8, 14).rotateX(Math.PI / 2), clay('#b5793c'), it.x + 0.35 + i * 0.25, 0.88, cz, { cast: false });
          else good('phone', GEO.phone, pick(BRIGHT, i, 3), it.x + 0.35 + i * 0.25, 0.86, cz, 0.3);
        }
        break;
      }
      case 'escalator': { // an escalator rising to the (closed) upper floor, with glass sides and black handrails
        const steps = 12;
        for (let i = 0; i < steps; i++) {
          const hgt = 0.06 + i * (WALL_H - 0.1) / steps;
          add(rbox(w - 0.4, hgt, h / steps, 0.01, 0), clay(i % 2 ? '#7a828c' : '#8a929c'), cx, hgt / 2, it.y + (i + 0.5) * h / steps);
        }
        for (const s of [-1, 1]) {
          const side = add(new THREE.BoxGeometry(0.04, 0.9, h * 1.05), new THREE.MeshPhysicalMaterial({ color: '#e6f4fb', transparent: true, opacity: 0.3, roughness: 0.05, depthWrite: false }), cx + s * (w / 2 - 0.15), 0.45 + WALL_H / 2 - 0.1, cz, { rx: -Math.atan2(WALL_H, h), cast: false });
          side.renderOrder = 2;
          add(rbox(0.08, 0.06, h * 1.12, 0.03, 0), clay('#1e2026'), cx + s * (w / 2 - 0.15), 0.95 + WALL_H / 2 - 0.1, cz, { rx: -Math.atan2(WALL_H, h), cast: false });
        }
        sign(add, 'CLOSED', '#e85d5d', cx, 0.55, it.y - 0.05, Math.PI, 0.8, 0.24);
        break;
      }
      case 'directory': { // the mall map, on a totem by the entrance
        const map = canvasTex(256, 384, (c, cw, ch) => {
          c.fillStyle = '#ffffff'; c.fillRect(0, 0, cw, ch); c.fillStyle = '#2c3036'; c.font = 'bold 28px system-ui'; c.textAlign = 'center'; c.fillText('MALL MAP', cw / 2, 36);
          const shops = M.rooms.filter(r => r.type === 'shop');
          shops.forEach((r, i) => { const y = 60 + i * 34; c.fillStyle = r.color; c.fillRect(20, y, 26, 26); c.fillStyle = '#2c3036'; c.font = '20px system-ui'; c.textAlign = 'left'; c.fillText(r.name, 56, y + 20); });
        });
        add(rbox(0.5, 1.3, 0.18, 0.08, 0.004), clay('#2c3036'), cx, 0.65, cz);
        const f = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.63), new THREE.MeshBasicMaterial({ map })); f.position.set(cx + 0.27, 0.8, cz); f.rotation.y = Math.PI / 2; scene.add(f);
        add(rbox(0.06, 0.66, 0.46, 0.02, 0), clay('#2c3036'), cx + 0.24, 0.8, cz, { cast: false });
        break;
      }
      case 'toilet':
        add(blob(0.17, 2, 0.01), clay('#ffffff'), cx, 0.24, cz + 0.04, { s: [1, 0.8, 1.2] });
        add(rbox(0.38, 0.4, 0.15, 0.05, 0.005), clay('#ffffff'), cx, 0.48, it.y + 0.1);
        break;
      case 'sink':
        add(rbox(0.55, 0.1, 0.5, 0.04, 0.004), clay(P.white), cx, 0.84, cz);
        add(new THREE.SphereGeometry(0.15, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), clay('#e6ebee', { side: THREE.DoubleSide }), cx, 0.88, cz, { cast: false });
        break;
      case 'stall': { // a food stall: kitchen behind, a counter in front, its name on a big sign, and food on show
        const east = it.side === 'e', ry = east ? -Math.PI / 2 : Math.PI; // the way the counter faces
        add(rbox(w - 0.06, WALL_H - 0.05, h - 0.06, 0.05, 0.004, cx), clay('#5a5f68'), cx, (WALL_H - 0.05) / 2, cz); // kitchen
        const fx = east ? it.x - 0.18 : cx, fz = east ? cz : it.y - 0.18; // the counter in front
        add(rbox(east ? 0.4 : w - 0.1, 0.95, east ? h - 0.1 : 0.4, 0.06, 0.004), clay(P.white), fx, 0.475, fz);
        add(rbox(east ? 0.46 : w - 0.04, 0.05, east ? h - 0.04 : 0.46, 0.02, 0), clay(it.color), fx, 0.97, fz);
        sign(add, it.name, it.color, east ? it.x - 0.03 : cx, WALL_H - 0.25, east ? cz : it.y - 0.03, ry, Math.min((east ? h : w) - 0.4, 2.4), 0.36);
        for (let i = 0; i < 3; i++) { // the food on the counter
          const px = east ? fx : it.x + 0.6 + i * (w - 1.2) / 2, pz = east ? it.y + 0.6 + i * (h - 1.2) / 2 : fz;
          if (it.name === 'PIZZA') { add(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 20), clay('#e8b45a'), px, 1.01, pz, { cast: false }); for (let k = 0; k < 4; k++) good('pep', GEO.ball, '#c0392b', px + Math.cos(k * 1.6) * 0.08, 1.03, pz + Math.sin(k * 1.6) * 0.08, 0, 0.35); }
          else if (it.name === 'BURGERS') ['#d9a35b', '#6dbf5b', '#7a3e25', '#d9a35b'].forEach((c, k) => add(new THREE.CylinderGeometry(0.1, 0.1, 0.035, 16), clay(c), px, 1.01 + k * 0.035, pz, { cast: false }));
          else if (it.name === 'SUSHI') for (let k = 0; k < 4; k++) add(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 12), clay(k % 2 ? '#f6f1e8' : '#e8735a'), px - 0.12 + k * 0.08, 1.02, pz, { cast: false });
          else { add(new THREE.ConeGeometry(0.06, 0.16, 12).rotateX(Math.PI), clay('#d9a35b'), px, 1.07, pz, { cast: false }); add(blob(0.07, 2, 0.004), clay(pick(BRIGHT, i, 9)), px, 1.17, pz, { cast: false }); } // ice cream cones
        }
        break;
      }
      case 'dtable': // a food-court table for four
        add(rbox(0.7, 0.05, 0.7, 0.025, 0.004), clay('#f2ede4'), cx, 0.72, cz);
        add(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 8), clay(P.dark), cx, 0.36, cz, { cast: false });
        add(rbox(0.3, 0.02, 0.22, 0.01, 0), clay('#e85d5d'), cx - 0.1, 0.76, cz, { cast: false }); // a tray
        good('cup', GEO.cup, '#ffffff', cx + 0.18, 0.79, cz - 0.1);
        for (const [dx, dz, a] of [[0, -0.45, Math.PI / 2], [0, 0.45, -Math.PI / 2], [-0.45, 0, 0], [0.45, 0, Math.PI]]) chairs.push({ x: cx + dx, z: cz + dz, a, c: '#e8a33d' });
        break;
    }
  }

  // ---- everything collected above, drawn together
  for (const { geo, color, list } of goods.values()) many(geo, clay(color), list, (o, g) => { o.position.set(g.x, g.y, g.z); o.rotation.y = g.ry; o.scale.setScalar(g.s); });
  // café / food-court chairs: a seat, a back on the far side from where the sitter faces, four legs
  for (const color of [...new Set(chairs.map(c => c.c))]) {
    const list = chairs.filter(c => c.c === color);
    many(rbox(0.36, 0.06, 0.36, 0.03, 0.004), clay(color), list, (o, c) => { o.position.set(c.x, 0.44, c.z); o.rotation.y = c.a; }, { cast: true });
    many(rbox(0.06, 0.36, 0.36, 0.03, 0.004), clay(color), list, (o, c) => { o.position.set(c.x - Math.cos(c.a) * 0.16, 0.64, c.z + Math.sin(c.a) * 0.16); o.rotation.y = c.a; }, { cast: true });
    const legs = list.flatMap(c => [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => ({ x: c.x + a * 0.14, z: c.z + b * 0.14 })));
    many(new THREE.CylinderGeometry(0.018, 0.018, 0.42, 6), clay(P.dark), legs, (o, l) => o.position.set(l.x, 0.21, l.z));
  }
  many(blob(0.12, 1, 0.025, 2), clay(P.green), leaves.filter(l => l.r % 2), (o, l) => { o.position.set(l.x, l.y, l.z); o.scale.set(l.s, l.s * 0.75, l.s); o.rotation.y = l.r; });
  many(blob(0.12, 1, 0.025, 4), clay(P.green2), leaves.filter(l => !(l.r % 2)), (o, l) => { o.position.set(l.x, l.y, l.z); o.scale.set(l.s, l.s * 0.75, l.s); o.rotation.y = l.r; });
  return X;
}

// the fountain splashes and its water shimmers
export function updateMall(X, t) {
  for (const j of X.jets) { const k = 0.85 + 0.2 * Math.sin(t * 9 + j.ph * 1.7); j.m.scale.set(1, k, 1); }
  if (X.water) X.water.emissiveIntensity = 0.22 + 0.06 * Math.sin(t * 2.1);
}
