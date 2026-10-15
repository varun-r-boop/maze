// Top-down look of the office map: carpet, stone, wood and tile floors by room, white walls, windows along the
// outside, glass-walled meeting rooms, and the furniture (desk pods, meeting tables, yellow sofas, lockers,
// filing cabinets with plants, kitchen, toilets...).
import { drawDefined } from './outline2d.js';
const Sh = window.Shared;
const { TILE, COLS, ROWS } = Sh.C;

// a repeatable "random" number per spot, so the static map looks the same every time it's drawn
const hash = (x, y, k = 0) => { const s = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };

function rr(m, x, y, w, h, r) {
  m.beginPath(); m.moveTo(x + r, y); m.arcTo(x + w, y, x + w, y + h, r); m.arcTo(x + w, y + h, x, y + h, r);
  m.arcTo(x, y + h, x, y, r); m.arcTo(x, y, x + w, y, r); m.closePath();
}

// floors, by room type
function floorTile(m, type, x, y) {
  const px = x * TILE, py = y * TILE, k = hash(x, y);
  if (type === 'lobby' || type === 'reception') { // polished stone
    m.fillStyle = (x + y) % 2 ? '#d8d3cb' : '#cfc9c0'; m.fillRect(px, py, TILE, TILE);
    m.strokeStyle = 'rgba(120,110,100,.35)'; m.lineWidth = 1; m.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
    m.fillStyle = 'rgba(255,255,255,.25)'; m.fillRect(px + 4, py + 4, 12, 2);
  } else if (type === 'lounge') { // light wooden planks
    m.fillStyle = '#b99a72'; m.fillRect(px, py, TILE, TILE);
    m.strokeStyle = 'rgba(90,60,30,.3)'; m.lineWidth = 1; m.beginPath();
    for (let i = 1; i < 4; i++) { m.moveTo(px, py + i * 10 + 0.5); m.lineTo(px + TILE, py + i * 10 + 0.5); }
    for (let i = 0; i < 4; i++) { const sx = px + ((i * 17 + x * 11) % TILE) + 0.5; m.moveTo(sx, py + i * 10); m.lineTo(sx, py + i * 10 + 10); }
    m.stroke();
  } else if (type === 'wc') { // small white tiles
    m.fillStyle = '#e4e8ea'; m.fillRect(px, py, TILE, TILE);
    m.strokeStyle = 'rgba(120,130,140,.35)'; m.lineWidth = 1; m.beginPath();
    for (let i = 0; i <= 4; i++) { m.moveTo(px + i * 10 + 0.5, py); m.lineTo(px + i * 10 + 0.5, py + TILE); m.moveTo(px, py + i * 10 + 0.5); m.lineTo(px + TILE, py + i * 10 + 0.5); }
    m.stroke();
  } else if (type === 'tech' || type === 'storage' || type === 'copy') { // grey vinyl
    m.fillStyle = '#a7acb2'; m.fillRect(px, py, TILE, TILE);
    m.fillStyle = 'rgba(0,0,0,.05)'; for (let i = 0; i < 6; i++) m.fillRect(px + hash(x, y, i) * TILE, py + hash(x, y, i + 9) * TILE, 3, 1);
  } else { // carpet: dark grey with white flecks, a little bluer in meeting rooms
    const base = type === 'meeting' || type === 'think' ? [74, 84, 98] : type === 'corridor' ? [96, 100, 106] : [84, 88, 94];
    m.fillStyle = `rgb(${base[0] + k * 6 | 0},${base[1] + k * 6 | 0},${base[2] + k * 6 | 0})`; m.fillRect(px, py, TILE, TILE);
    m.strokeStyle = 'rgba(255,255,255,.16)'; m.lineWidth = 1; m.beginPath();
    for (let i = 0; i < 14; i++) { const fx = px + hash(x, y, i) * TILE, fy = py + hash(x, y, i + 30) * TILE; m.moveTo(fx, fy); m.lineTo(fx + 1, fy + 4); }
    m.stroke();
  }
}

// chairs are just drawn on the floor around tables and desks (you can walk over them)
function chair(m, cx, cy, a, color = '#3d4148') {
  m.save(); m.translate(cx, cy); m.rotate(a);
  m.fillStyle = 'rgba(0,0,0,.18)'; m.beginPath(); m.arc(1.5, 1.5, 8, 0, Math.PI * 2); m.fill();
  m.fillStyle = color; rr(m, -7, -7, 14, 13, 4); m.fill();
  m.fillStyle = '#25282e'; rr(m, -7, -9, 14, 5, 2); m.fill(); // backrest
  m.restore();
}
function plant(m, cx, cy, r = 13) {
  m.fillStyle = '#6b6f75'; m.beginPath(); m.arc(cx, cy, r * 0.7, 0, Math.PI * 2); m.fill();
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9 + hash(cx, cy, i), d = r * 0.45;
    m.fillStyle = i % 2 ? '#3f8a3a' : '#57a94a';
    m.beginPath(); m.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * 0.45, r * 0.22, a, 0, Math.PI * 2); m.fill();
  }
}

function drawItem(m, it) {
  const px = it.x * TILE, py = it.y * TILE, w = it.w * TILE, h = it.h * TILE;
  m.save();
  switch (it.type) {
    case 'pod': { // a block of white desks, two rows facing each other, a monitor each, chairs outside
      for (let i = 0; i < it.w; i++) { chair(m, px + i * TILE + 20, py - 6, 0); chair(m, px + i * TILE + 20, py + h + 6, Math.PI); }
      m.fillStyle = 'rgba(0,0,0,.2)'; m.fillRect(px + 3, py + 4, w, h);
      m.fillStyle = '#eef0f2'; m.fillRect(px, py + 2, w, h - 4);
      m.strokeStyle = '#b8bcc2'; m.lineWidth = 1; m.strokeRect(px + 0.5, py + 2.5, w - 1, h - 5);
      m.fillStyle = '#9aa0a8'; m.fillRect(px, py + h / 2 - 2, w, 4); // privacy screen down the middle
      for (let i = 0; i < it.w; i++) for (const top of [true, false]) {
        const mx = px + i * TILE + 10, my = top ? py + h / 2 - 9 : py + h / 2 + 5;
        m.fillStyle = '#1d2026'; m.fillRect(mx, my, 20, 4); // monitor
        m.fillStyle = '#4a7fc0'; m.fillRect(mx + 2, top ? my + 1 : my + 1, 16, 2);
        m.fillStyle = '#c9ccd1'; m.fillRect(mx + 4, top ? my - 12 : my + 10, 12, 4); // keyboard
      }
      break;
    }
    case 'table': case 'longtable': { // meeting table: wood (or white in the kitchen) with chairs all round
      const along = it.w >= it.h;
      const n = along ? it.w : it.h;
      for (let i = 0; i < n; i++) {
        if (along) { chair(m, px + i * TILE + 20, py - 4, 0); chair(m, px + i * TILE + 20, py + h + 4, Math.PI); }
        else { chair(m, px - 4, py + i * TILE + 20, -Math.PI / 2); chair(m, px + w + 4, py + i * TILE + 20, Math.PI / 2); }
      }
      if (it.h >= 2 && it.w >= 2) { chair(m, px - 4, py + h / 2, -Math.PI / 2); chair(m, px + w + 4, py + h / 2, Math.PI / 2); }
      m.fillStyle = 'rgba(0,0,0,.22)'; rr(m, px + 6, py + 8, w - 8, h - 10, 10); m.fill();
      m.fillStyle = it.type === 'longtable' ? '#f1f1ef' : '#b8946a'; rr(m, px + 3, py + 4, w - 6, h - 8, 10); m.fill();
      m.strokeStyle = 'rgba(0,0,0,.25)'; m.lineWidth = 1; m.stroke();
      if (it.type === 'table' && it.w >= 3) { m.fillStyle = '#2a2d33'; m.fillRect(px + w / 2 - 8, py + h / 2 - 3, 16, 6); } // speakerphone
      break;
    }
    case 'sofa': { // yellow (or blue) sofa; `face` says which side the seat opens to
      m.fillStyle = 'rgba(0,0,0,.2)'; rr(m, px + 4, py + 6, w - 4, h - 4, 10); m.fill();
      m.fillStyle = it.color; rr(m, px + 2, py + 3, w - 4, h - 6, 10); m.fill();
      m.fillStyle = 'rgba(0,0,0,.18)';
      if (it.face === -1) rr(m, px + 2, py + h - 14, w - 4, 11, 6); else if (it.face === 1) rr(m, px + 2, py + 3, w - 4, 11, 6);
      else rr(m, px + w - 14, py + 3, 11, h - 6, 6);
      m.fill();
      break;
    }
    case 'armchair': {
      const a = [Math.PI, 0, -Math.PI / 2, Math.PI / 2][it.face === -1 ? 0 : it.face === 1 ? 1 : it.face === 0 ? 2 : 3];
      m.translate(px + 20, py + 20); m.rotate(a);
      m.fillStyle = 'rgba(0,0,0,.2)'; rr(m, -12, -10, 28, 26, 9); m.fill();
      m.fillStyle = it.color; rr(m, -14, -13, 28, 26, 9); m.fill();
      m.fillStyle = 'rgba(0,0,0,.2)'; rr(m, -14, -13, 28, 8, 4); m.fill(); // back
      m.strokeStyle = '#6b4a2e'; m.lineWidth = 2; for (const [lx, ly] of [[-12, 12], [12, 12]]) { m.beginPath(); m.moveTo(lx, ly); m.lineTo(lx * 1.1, ly + 3); m.stroke(); }
      break;
    }
    case 'coffee': {
      m.fillStyle = 'rgba(0,0,0,.18)'; m.beginPath(); m.ellipse(px + w / 2 + 2, py + h / 2 + 3, w / 2 - 6, h / 2 - 8, 0, 0, Math.PI * 2); m.fill();
      m.fillStyle = it.round ? '#f3f3f1' : '#d9c4a2'; m.beginPath(); m.ellipse(px + w / 2, py + h / 2, w / 2 - 6, h / 2 - 8, 0, 0, Math.PI * 2); m.fill();
      m.strokeStyle = 'rgba(0,0,0,.2)'; m.stroke();
      break;
    }
    case 'bartable': { // a tall table along the window with stools
      for (let i = 0; i < it.w; i++) { m.fillStyle = '#9aa0a8'; m.beginPath(); m.arc(px + i * TILE + 20, py + h + 2, 7, 0, Math.PI * 2); m.fill(); }
      m.fillStyle = '#e6e2da'; rr(m, px + 2, py + 6, w - 4, h - 14, 6); m.fill(); m.strokeStyle = 'rgba(0,0,0,.25)'; m.stroke();
      break;
    }
    case 'cabinet': { // white filing cabinets with a planter of trailing plants on top
      m.fillStyle = 'rgba(0,0,0,.2)'; m.fillRect(px + 3, py + 6, w, h - 6);
      m.fillStyle = '#f2f3f4'; m.fillRect(px + 1, py + 3, w - 2, h - 6); m.strokeStyle = '#b8bcc2'; m.strokeRect(px + 1.5, py + 3.5, w - 3, h - 7);
      m.fillStyle = '#4a4e55'; m.fillRect(px + 6, py + 10, w - 12, h - 20); // planter
      for (let i = 0; i < it.w * 6; i++) { m.fillStyle = i % 2 ? '#3f8a3a' : '#5aa84a'; m.beginPath(); m.ellipse(px + 8 + hash(px, i) * (w - 16), py + 10 + hash(py, i) * (h - 20), 6, 3.5, hash(i, px) * 3, 0, Math.PI * 2); m.fill(); }
      break;
    }
    case 'locker': { // wooden lockers with numbered doors
      m.fillStyle = '#7a5a3e'; m.fillRect(px + 1, py + 1, w - 2, h - 2);
      m.strokeStyle = '#4e3826'; m.lineWidth = 1;
      const vert = it.h > it.w;
      for (let i = 0; i < (vert ? it.h : it.w) * 2; i++) { if (vert) m.strokeRect(px + 2.5, py + i * 20 + 1.5, w - 5, 18); else m.strokeRect(px + i * 20 + 1.5, py + 2.5, 18, h - 5); }
      break;
    }
    case 'plant': plant(m, px + 20, py + 20, 15); break;
    case 'reception': { // curved front desk: white with a wooden top
      m.fillStyle = 'rgba(0,0,0,.2)'; rr(m, px + 4, py + 6, w - 4, h - 4, 18); m.fill();
      m.fillStyle = '#f2f2f0'; rr(m, px + 2, py + 2, w - 4, h - 4, 18); m.fill();
      m.fillStyle = '#b8946a'; rr(m, px + 8, py + 8, w - 16, 12, 6); m.fill();
      m.fillStyle = '#1d2026'; m.fillRect(px + w / 2 - 10, py + h / 2, 20, 4); chair(m, px + w / 2, py + h - 14, Math.PI);
      break;
    }
    case 'shelf': { // grey shelving with boxes
      m.fillStyle = '#6e737a'; m.fillRect(px + 2, py + 1, w - 4, h - 2);
      for (let i = 0; i < it.h * 3; i++) { m.fillStyle = ['#c9a46a', '#a88450', '#e0d6c4'][i % 3]; m.fillRect(px + 6, py + 4 + i * 13, w - 12, 10); }
      break;
    }
    case 'rack': { // server racks with blinking-light LEDs
      m.fillStyle = '#16181c'; m.fillRect(px + 3, py + 1, w - 6, h - 2);
      for (let i = 0; i < it.h * 4; i++) { m.fillStyle = '#2a2e35'; m.fillRect(px + 6, py + 4 + i * 10, w - 12, 7); m.fillStyle = i % 3 ? '#4cff7a' : '#4aa8ff'; m.fillRect(px + w - 12, py + 6 + i * 10, 3, 3); }
      break;
    }
    case 'toilet': {
      m.fillStyle = '#ffffff'; m.fillRect(px + 12, py + 26, 16, 10); m.beginPath(); m.ellipse(px + 20, py + 18, 9, 11, 0, 0, Math.PI * 2); m.fill();
      m.strokeStyle = '#a9b2b8'; m.lineWidth = 1.5; m.stroke(); m.beginPath(); m.ellipse(px + 20, py + 18, 5, 7, 0, 0, Math.PI * 2); m.stroke();
      break;
    }
    case 'partition': m.fillStyle = '#8f98a3'; m.fillRect(px + 17, py, 6, h); break; // stall wall
    case 'sink': { // vanity counter with basins
      m.fillStyle = '#f0f0ee'; m.fillRect(px + 8, py + 2, w - 8, h - 4); m.strokeStyle = '#a9b2b8'; m.strokeRect(px + 8.5, py + 2.5, w - 9, h - 5);
      for (let i = 0; i < it.h; i++) { m.beginPath(); m.ellipse(px + 24, py + i * TILE + 20, 7, 9, 0, 0, Math.PI * 2); m.stroke(); }
      break;
    }
    case 'copier': m.fillStyle = '#d6d9dd'; rr(m, px + 3, py + 4, w - 6, h - 8, 4); m.fill(); m.fillStyle = '#5a6068'; m.fillRect(px + 8, py + 10, w - 16, 8); m.fillStyle = '#7ec8ff'; m.fillRect(px + w - 12, py + 24, 5, 4); break;
    case 'elevator': { // steel doors with a lit call button
      m.fillStyle = '#9ea6ae'; m.fillRect(px, py + 4, w, h - 8);
      m.fillStyle = '#c3cad1'; m.fillRect(px + 4, py + 8, w - 8, h / 2 - 9); m.fillRect(px + 4, py + h / 2 + 1, w - 8, h / 2 - 9);
      m.fillStyle = '#ffd36b'; m.beginPath(); m.arc(px + w + 4, py + h / 2, 3, 0, Math.PI * 2); m.fill();
      break;
    }
    case 'counter': { // kitchen counter with a sink
      m.fillStyle = '#f2f2f0'; m.fillRect(px + 2, py + 1, w - 6, h - 2); m.strokeStyle = '#a9b2b8'; m.strokeRect(px + 2.5, py + 1.5, w - 7, h - 3);
      m.fillStyle = '#b8c0c8'; m.fillRect(px + 8, py + 10, w - 18, 18); m.fillStyle = '#2a2d33'; m.fillRect(px + 10, py + 50, 8, 8);
      break;
    }
    case 'fridge': m.fillStyle = '#cfd4d9'; m.fillRect(px + 2, py + 2, w - 6, h - 4); m.fillStyle = '#7d858d'; m.fillRect(px + w - 10, py + 8, 2, h - 16); break;
    case 'stairwell': { // the closed-off stairwell: two flights of steps with a landing
      m.fillStyle = '#c4c0b8'; m.fillRect(px, py, w, h);
      for (const sx of [px + 12, px + w / 2 + 6]) for (let i = 0; i < 12; i++) { m.fillStyle = i % 2 ? '#b2ada4' : '#a29d94'; m.fillRect(sx, py + 50 + i * 16, w / 2 - 18, 14); }
      m.fillStyle = '#8f8a82'; m.fillRect(px + w / 2 - 3, py + 50, 6, h - 70);
      m.fillStyle = '#2e7d32'; m.fillRect(px + w / 2 - 22, py + 14, 44, 18); m.fillStyle = '#fff'; m.font = 'bold 11px system-ui'; m.textAlign = 'center'; m.textBaseline = 'middle'; m.fillText('STAIRS', px + w / 2, py + 23);
      break;
    }
  }
  m.restore();
}

// just the floors (also used as the floor texture in 3D)
export function drawOfficeFloors(m, G) {
  const O = G.office, type = new Map();
  for (const r of O.rooms) for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) type.set(y * COLS + x, r.type);
  for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) if (G.grid[y][x] !== 1 || O.items.some(i => i.type === 'stairwell' && x >= i.x && x < i.x + i.w && y >= i.y && y < i.y + i.h)) {
    floorTile(m, type.get(y * COLS + x) || 'corridor', x, y);
  }
}

export function drawOfficeMap(m, G) {
  const O = G.office;
  drawOfficeFloors(m, G); // floors under everything that isn't wall, and under the doorways too
  // walls: white, with a pale front face where you can see it from below
  const windowAt = new Set(O.windows.map(w => w.y * COLS + w.x));
  const stairwell = O.items.find(i => i.type === 'stairwell');
  const inStair = (x, y) => stairwell && x >= stairwell.x && x < stairwell.x + stairwell.w && y >= stairwell.y && y < stairwell.y + stairwell.h;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (G.grid[y][x] !== 1 || inStair(x, y)) continue;
    const px = x * TILE, py = y * TILE;
    if (windowAt.has(y * COLS + x)) { // a window: glass with a mullion, daylight beyond
      const g = m.createLinearGradient(px, py, px + TILE, py + TILE);
      g.addColorStop(0, '#bfe0f5'); g.addColorStop(1, '#8cc0e2');
      m.fillStyle = '#5e646c'; m.fillRect(px, py, TILE, TILE);
      m.fillStyle = g; if (y === 0) m.fillRect(px, py + 10, TILE, 20); else m.fillRect(px + 10, py, 20, TILE);
      m.fillStyle = '#5e646c'; if (y === 0) m.fillRect(px + TILE - 2, py, 2, TILE); else m.fillRect(px, py + TILE - 2, TILE, 2);
      continue;
    }
    m.fillStyle = '#e9ebee'; m.fillRect(px, py, TILE, TILE);
    m.fillStyle = '#f8f9fa'; m.fillRect(px, py, TILE, 3);
    if (y + 1 < ROWS && G.grid[y + 1][x] !== 1) { m.fillStyle = '#c7cbd1'; m.fillRect(px, py + TILE - 12, TILE, 12); m.fillStyle = '#9ea4ab'; m.fillRect(px, py + TILE - 2, TILE, 2); }
    m.strokeStyle = 'rgba(0,0,0,.08)'; m.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
  }
  // soft shadows the walls cast on the floor
  for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) if (G.grid[y][x] !== 1 && G.grid[y - 1][x] === 1) { m.fillStyle = 'rgba(0,0,0,.12)'; m.fillRect(x * TILE, y * TILE, TILE, 6); }
  // daylight falling in through the windows
  const sun = m.createLinearGradient(0, TILE, 0, TILE * 5);
  sun.addColorStop(0, 'rgba(255,248,225,.22)'); sun.addColorStop(1, 'rgba(255,248,225,0)');
  m.fillStyle = sun; m.fillRect(TILE, TILE, (COLS - 2) * TILE, TILE * 4);
  const sunE = m.createLinearGradient((COLS - 1) * TILE, 0, (COLS - 5) * TILE, 0);
  sunE.addColorStop(0, 'rgba(255,248,225,.22)'); sunE.addColorStop(1, 'rgba(255,248,225,0)');
  m.fillStyle = sunE; m.fillRect((COLS - 5) * TILE, TILE, TILE * 4, (ROWS - 2) * TILE);
  // glass walls: see-through, with a frosted band and a slim black frame
  for (const w of O.glass) {
    const px = w.x * TILE, py = w.y * TILE;
    m.fillStyle = 'rgba(190,225,240,.45)'; m.fillRect(px, py + 15, TILE, 10);
    m.fillStyle = 'rgba(255,255,255,.55)'; for (let i = 0; i < 4; i++) m.fillRect(px + i * 10 + 2, py + 17, 5, 6);
    m.fillStyle = '#2a2d33'; m.fillRect(px, py + 14, TILE, 1.5); m.fillRect(px, py + 24.5, TILE, 1.5);
  }
  // furniture
  drawDefined(m, l => { for (const it of O.items) if (it.type !== 'pendant') drawItem(l, it); }, { shadow: 'rgba(30,30,40,.35)' });
}

// drawn on top every frame (above the dimming): the big dome lamps hanging over the lounge
export function drawOfficeLamps(ctx, G) {
  for (const it of G.office.items) {
    if (it.type !== 'pendant') continue;
    const cx = (it.x + 0.5) * TILE, cy = (it.y + 0.5) * TILE;
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, TILE * 1.6);
    g.addColorStop(0, 'rgba(255,240,170,.35)'); g.addColorStop(1, 'rgba(255,240,170,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, TILE * 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f4f4f2'; ctx.beginPath(); ctx.arc(cx, cy, 17, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#ffe680'; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
  }
}
