// Top-down look of the mall: a polished promenade with a fountain, glass shopfronts with name signs, each shop's
// own floor and fixtures, the food court and the staff corridors behind the shops.
import { drawDefined } from './outline2d.js';
const Sh = window.Shared;
const { TILE, COLS, ROWS } = Sh.C;

// a repeatable "random" number per spot, so the static map looks the same every time it's drawn
const hash = (x, y, k = 0) => { const s = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };
const BRIGHT = ['#e85d5d', '#f2b43b', '#4aa3df', '#6dbf5b', '#b48ee0', '#f07cb0', '#ffffff'];

function rr(m, x, y, w, h, r) {
  m.beginPath(); m.moveTo(x + r, y); m.arcTo(x + w, y, x + w, y + h, r); m.arcTo(x + w, y + h, x, y + h, r);
  m.arcTo(x, y + h, x, y, r); m.arcTo(x, y, x + w, y, r); m.closePath();
}

// floor colors and patterns for each kind of room (and each kind of shop)
const SHOP_FLOOR = { fashion: '#efe6dc', shoes: '#c79b6d', toys: '#bfe0f2', tech: '#d6d9de', books: '#b48a5e', cafe: '#a7774f', sports: '#9fcfa8', pharmacy: '#eef4f2', jewelry: '#2f2f3a' };
function floorTile(m, r, x, y) {
  const px = x * TILE, py = y * TILE, k = hash(x, y);
  const plain = (c, line = 'rgba(0,0,0,.12)') => { m.fillStyle = c; m.fillRect(px, py, TILE, TILE); m.strokeStyle = line; m.lineWidth = 1; m.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1); };
  if (!r || r.type === 'promenade') { // polished cream stone, with a darker border pattern every few tiles
    plain((x + y) % 2 ? '#ece5d8' : '#e6ddce', 'rgba(140,120,90,.25)');
    if (y === 12 || y === 18) { m.fillStyle = 'rgba(160,130,90,.25)'; m.fillRect(px, y === 12 ? py : py + TILE - 5, TILE, 5); }
    m.fillStyle = 'rgba(255,255,255,.3)'; m.fillRect(px + 5, py + 5, 10, 2);
  } else if (r.type === 'service' || r.type === 'passage') { // bare concrete
    plain(`rgb(${150 + k * 12 | 0},${152 + k * 12 | 0},${156 + k * 12 | 0})`, 'rgba(0,0,0,.08)');
  } else if (r.type === 'wc') {
    plain('#e4edf0'); m.strokeStyle = 'rgba(120,130,140,.3)'; m.beginPath(); m.moveTo(px + 20.5, py); m.lineTo(px + 20.5, py + TILE); m.moveTo(px, py + 20.5); m.lineTo(px + TILE, py + 20.5); m.stroke();
  } else if (r.type === 'food') { // checkerboard tiles
    plain((x + y) % 2 ? '#f4efe4' : '#d9cdb8');
  } else { // a shop
    const c = SHOP_FLOOR[r.theme] || '#e8e2d8';
    plain(c, 'rgba(0,0,0,.1)');
    if (r.theme === 'shoes' || r.theme === 'books' || r.theme === 'cafe') { // wooden boards
      m.strokeStyle = 'rgba(60,35,15,.25)'; m.beginPath();
      for (let i = 1; i < 4; i++) { m.moveTo(px, py + i * 10 + 0.5); m.lineTo(px + TILE, py + i * 10 + 0.5); }
      m.stroke();
    }
    if (r.theme === 'toys') { m.fillStyle = BRIGHT[Math.floor(k * 6)]; m.globalAlpha = 0.25; m.fillRect(px + 8, py + 8, TILE - 16, TILE - 16); m.globalAlpha = 1; } // play mat squares
    if (r.theme === 'jewelry') { m.fillStyle = 'rgba(255,215,120,.08)'; m.fillRect(px + 2, py + 2, TILE - 4, TILE - 4); }
  }
}

function chair(m, cx, cy, a, color = '#5d6475') {
  m.save(); m.translate(cx, cy); m.rotate(a);
  m.fillStyle = 'rgba(0,0,0,.18)'; m.beginPath(); m.arc(1.5, 1.5, 7, 0, Math.PI * 2); m.fill();
  m.fillStyle = color; rr(m, -6, -6, 12, 11, 4); m.fill();
  m.fillStyle = 'rgba(0,0,0,.25)'; rr(m, -6, -8, 12, 4, 2); m.fill();
  m.restore();
}
function leaves(m, cx, cy, r) {
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9 + hash(cx, cy, i), d = r * 0.45;
    m.fillStyle = i % 2 ? '#3f8a3a' : '#5aa84a';
    m.beginPath(); m.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * 0.45, r * 0.24, a, 0, Math.PI * 2); m.fill();
  }
}
// rows of little colored things on a shelf (shoes, toys, books, boxes...)
function stock(m, px, py, w, h, along, size, colors, k) {
  const n = Math.floor((along === 'y' ? h : w) / (size + 3));
  for (let i = 0; i < n; i++) {
    m.fillStyle = colors[Math.floor(hash(px + i, py, k) * colors.length)];
    if (along === 'y') m.fillRect(px + 5, py + 4 + i * (size + 3), w - 10, size);
    else m.fillRect(px + 4 + i * (size + 3), py + 5, size, h - 10);
  }
}

function drawItem(m, it) {
  const px = it.x * TILE, py = it.y * TILE, w = it.w * TILE, h = it.h * TILE, cx = px + w / 2, cy = py + h / 2;
  const along = it.h > it.w ? 'y' : 'x';
  m.save();
  m.fillStyle = 'rgba(0,0,0,.18)'; m.fillRect(px + 4, py + 5, w - 4, h - 4); // a soft shadow under everything
  switch (it.type) {
    case 'rack': // clothes on a rail
      m.fillStyle = '#8a8f99'; m.fillRect(cx - 2, py + 2, 4, h - 4);
      for (let i = 0; i < it.h * 4; i++) { m.fillStyle = BRIGHT[i % 6]; rr(m, cx - 12, py + 4 + i * 9.5, 24, 7, 3); m.fill(); }
      break;
    case 'fitting': // two curtained changing booths
      for (let i = 0; i < 2; i++) { m.fillStyle = '#f2ece4'; m.fillRect(px + i * TILE + 2, py + 2, TILE - 4, h - 4); m.fillStyle = '#c0598a'; m.fillRect(px + i * TILE + 2, py + h - 10, TILE - 4, 7); }
      break;
    case 'mannequin':
      m.fillStyle = '#efe6dc'; m.beginPath(); m.arc(cx, cy - 6, 5, 0, Math.PI * 2); m.fill();
      m.fillStyle = '#d96ba0'; rr(m, cx - 9, cy - 1, 18, 13, 5); m.fill();
      break;
    case 'counter': case 'cafecounter':
      m.fillStyle = '#f4f1ea'; rr(m, px + 2, py + 3, w - 4, h - 6, 5); m.fill(); m.strokeStyle = 'rgba(0,0,0,.2)'; m.stroke();
      m.fillStyle = '#2c3036'; m.fillRect(cx - 6, cy - 4, 12, 8); // till
      if (it.type === 'cafecounter') { m.fillStyle = '#6b4a2f'; m.fillRect(px + 6, py + 8, 14, 12); m.fillStyle = '#f3c26b'; for (let i = 0; i < 4; i++) { m.beginPath(); m.arc(px + 36 + i * 9, cy, 3.5, 0, Math.PI * 2); m.fill(); } } // espresso machine and pastries
      break;
    case 'shoeshelf': case 'toyshelf': case 'bookshelf': case 'sportshelf': case 'pharmshelf': {
      const c = { shoeshelf: '#8c6a4c', toyshelf: '#f3f3f3', bookshelf: '#7a5a3e', sportshelf: '#5d6470', pharmshelf: '#f5f7f8' }[it.type];
      m.fillStyle = c; m.fillRect(px + 2, py + 2, w - 4, h - 4);
      const goods = { shoeshelf: ['#2b2b2b', '#e85d5d', '#ffffff', '#4aa3df', '#c88d5c'], toyshelf: BRIGHT, bookshelf: ['#c0392b', '#2e86c1', '#27ae60', '#f39c12', '#8e44ad', '#ecf0f1'],
        sportshelf: ['#f39c12', '#ffffff', '#2e86c1', '#e74c3c'], pharmshelf: ['#ffffff', '#5dade2', '#58d68d', '#f5b7b1'] }[it.type];
      if (it.w > 1 && it.h > 1) { stock(m, px, py, w / 2, h, 'y', 6, goods, 1); stock(m, px + w / 2, py, w / 2, h, 'y', 6, goods, 2); }
      else stock(m, px, py, w, h, along, it.type === 'bookshelf' ? 4 : 7, goods, 0);
      break;
    }
    case 'bench':
      m.fillStyle = '#b07b4f'; rr(m, px + 6, py + 4, w - 12, h - 8, 5); m.fill();
      m.strokeStyle = 'rgba(60,35,15,.4)'; m.beginPath(); for (let i = 1; i < 3; i++) { if (along === 'y') { m.moveTo(px + 6 + i * (w - 12) / 3, py + 4); m.lineTo(px + 6 + i * (w - 12) / 3, py + h - 4); } else { m.moveTo(px + 4, py + 6 + i * (h - 12) / 3); m.lineTo(px + w - 4, py + 6 + i * (h - 12) / 3); } } m.stroke();
      break;
    case 'mirror': m.fillStyle = '#cfe4ee'; rr(m, px + 8, py + 4, w - 16, h - 8, 4); m.fill(); m.fillStyle = 'rgba(255,255,255,.7)'; m.fillRect(px + 12, py + 8, 3, h - 16); break;
    case 'teddy': // a giant teddy bear
      m.fillStyle = '#b07a4c'; m.beginPath(); m.arc(cx, cy + 4, 13, 0, Math.PI * 2); m.fill(); m.beginPath(); m.arc(cx, cy - 9, 9, 0, Math.PI * 2); m.fill();
      m.beginPath(); m.arc(cx - 7, cy - 16, 4, 0, Math.PI * 2); m.arc(cx + 7, cy - 16, 4, 0, Math.PI * 2); m.fill();
      m.fillStyle = '#e8c9a0'; m.beginPath(); m.arc(cx, cy - 7, 4, 0, Math.PI * 2); m.fill(); m.fillStyle = '#e85d5d'; m.fillRect(cx - 6, cy - 2, 12, 3);
      break;
    case 'table': // a display table, with whatever the shop sells on it
      m.fillStyle = it.kind === 'tech' ? '#f2f3f5' : '#e9dfcf'; rr(m, px + 3, py + 5, w - 6, h - 10, 6); m.fill(); m.strokeStyle = 'rgba(0,0,0,.18)'; m.stroke();
      for (let i = 0; i < it.w * 3; i++) {
        const gx = px + 10 + i * (w - 20) / Math.max(1, it.w * 3 - 1), gy = cy;
        if (it.kind === 'tech') { m.fillStyle = '#23262c'; m.fillRect(gx - 4, gy - 7, 8, 14); m.fillStyle = '#5aa9e6'; m.fillRect(gx - 3, gy - 6, 6, 11); }
        else if (it.kind === 'toys') { m.fillStyle = BRIGHT[i % 6]; m.beginPath(); m.arc(gx, gy, 5, 0, Math.PI * 2); m.fill(); }
        else { m.fillStyle = BRIGHT[(i + 2) % 6]; m.fillRect(gx - 6, gy - 5, 12, 10); } // folded clothes
      }
      break;
    case 'tvwall': // a wall of screens
      m.fillStyle = '#2a2d33'; m.fillRect(px + 2, py + 2, w - 4, h - 4);
      for (let i = 0; i < it.h * 2; i++) { const g = m.createLinearGradient(0, py + i * 20, 0, py + i * 20 + 16); g.addColorStop(0, BRIGHT[i % 6]); g.addColorStop(1, '#1a1c22'); m.fillStyle = g; m.fillRect(px + 8, py + 4 + i * 20, w - 16, 15); }
      break;
    case 'armchair':
      m.fillStyle = it.color; rr(m, px + 6, py + 6, w - 12, h - 12, 8); m.fill(); m.fillStyle = 'rgba(0,0,0,.18)';
      if (it.face === 0) rr(m, px + 6, py + 6, 8, h - 12, 4); else rr(m, px + w - 14, py + 6, 8, h - 12, 4); m.fill();
      break;
    case 'bistro': // a little round café table with two chairs
      chair(m, cx - 14, cy, -Math.PI / 2, '#3a3f4c'); chair(m, cx + 14, cy, Math.PI / 2, '#3a3f4c');
      m.fillStyle = '#f2ede4'; m.beginPath(); m.arc(cx, cy, 10, 0, Math.PI * 2); m.fill(); m.strokeStyle = 'rgba(0,0,0,.25)'; m.stroke();
      m.fillStyle = '#ffffff'; m.beginPath(); m.arc(cx - 3, cy - 2, 3, 0, Math.PI * 2); m.fill();
      break;
    case 'bike':
      m.strokeStyle = '#2b2b2b'; m.lineWidth = 3; m.beginPath(); m.arc(px + 14, cy, 10, 0, Math.PI * 2); m.arc(px + w - 14, cy, 10, 0, Math.PI * 2); m.stroke();
      m.strokeStyle = '#e74c3c'; m.lineWidth = 3; m.beginPath(); m.moveTo(px + 14, cy); m.lineTo(cx, cy - 6); m.lineTo(px + w - 14, cy); m.stroke();
      break;
    case 'treadmill': m.fillStyle = '#3a3f4c'; rr(m, px + 3, py + 8, w - 6, h - 16, 5); m.fill(); m.fillStyle = '#1e2026'; m.fillRect(px + 10, py + 12, w - 26, h - 24); m.fillStyle = '#9aa0a8'; m.fillRect(px + w - 14, py + 6, 8, h - 12); break;
    case 'ballbin': m.fillStyle = '#5d6470'; m.beginPath(); m.arc(cx, cy, 15, 0, Math.PI * 2); m.fill(); for (let i = 0; i < 5; i++) { m.fillStyle = ['#f39c12', '#ffffff', '#2e86c1', '#e74c3c', '#27ae60'][i]; m.beginPath(); m.arc(cx + Math.cos(i * 1.3) * 7, cy + Math.sin(i * 1.3) * 7, 5, 0, Math.PI * 2); m.fill(); } break;
    case 'case': // a glass jewelry case with gold things inside
      m.fillStyle = 'rgba(200,230,245,.6)'; rr(m, px + 4, py + 4, w - 8, h - 8, 4); m.fill(); m.strokeStyle = '#b8912e'; m.lineWidth = 2; m.stroke();
      for (let i = 0; i < it.w * it.h * 3; i++) { m.fillStyle = i % 3 ? '#e9c25a' : '#d8e6ef'; m.beginPath(); m.arc(px + 10 + hash(px, i) * (w - 20), py + 10 + hash(py, i) * (h - 20), 2.5, 0, Math.PI * 2); m.fill(); }
      break;
    case 'plant': case 'planter': // a big pot with a little tree in it
      m.fillStyle = it.type === 'planter' ? '#d8cfc0' : '#c7744a'; m.beginPath(); m.arc(cx, cy, 15, 0, Math.PI * 2); m.fill();
      leaves(m, cx, cy, it.type === 'planter' ? 20 : 15);
      break;
    case 'fountain': { // a round basin of water with a jet in the middle
      m.fillStyle = '#d8cfc0'; m.beginPath(); m.arc(cx, cy, w / 2 - 2, 0, Math.PI * 2); m.fill();
      const g = m.createRadialGradient(cx, cy, 4, cx, cy, w / 2 - 10); g.addColorStop(0, '#bfe9ff'); g.addColorStop(1, '#3d8fc4');
      m.fillStyle = g; m.beginPath(); m.arc(cx, cy, w / 2 - 10, 0, Math.PI * 2); m.fill();
      m.strokeStyle = 'rgba(255,255,255,.5)'; m.lineWidth = 1.5; for (let i = 1; i < 4; i++) { m.beginPath(); m.arc(cx, cy, i * 12, 0, Math.PI * 2); m.stroke(); }
      m.fillStyle = '#d8cfc0'; m.beginPath(); m.arc(cx, cy, 8, 0, Math.PI * 2); m.fill(); m.fillStyle = '#e8f8ff'; m.beginPath(); m.arc(cx, cy, 4, 0, Math.PI * 2); m.fill();
      break;
    }
    case 'kiosk': // a cart with a striped awning
      m.fillStyle = '#f4f1ea'; rr(m, px + 2, py + 6, w - 4, h - 12, 5); m.fill();
      for (let i = 0; i < 8; i++) { m.fillStyle = i % 2 ? '#ffffff' : it.color; m.fillRect(px + 2 + i * (w - 4) / 8, py + 2, (w - 4) / 8, 10); }
      m.fillStyle = it.color; m.font = 'bold 9px system-ui'; m.textAlign = 'center'; m.textBaseline = 'middle'; m.fillText(it.name, cx, cy + 6);
      break;
    case 'escalator': // a moving staircase (going up to the closed upper floor)
      m.fillStyle = '#9aa3ad'; m.fillRect(px + 2, py + 2, w - 4, h - 4);
      for (let i = 0; i < 12; i++) { m.fillStyle = i % 2 ? '#5f6770' : '#737c86'; m.fillRect(px + 8, py + 4 + i * (h - 8) / 12, w - 16, (h - 8) / 12); }
      m.fillStyle = '#2c3036'; m.fillRect(px + 2, py + 2, 6, h - 4); m.fillRect(px + w - 8, py + 2, 6, h - 4);
      m.fillStyle = '#e85d5d'; m.fillRect(cx - 18, py + 4, 36, 10); m.fillStyle = '#fff'; m.font = 'bold 8px system-ui'; m.textAlign = 'center'; m.textBaseline = 'middle'; m.fillText('CLOSED', cx, py + 9);
      break;
    case 'directory': m.fillStyle = '#2c3036'; rr(m, px + 8, py + 4, w - 16, h - 8, 4); m.fill(); m.fillStyle = '#7fc3e8'; m.fillRect(px + 11, py + 7, w - 22, h - 18); m.fillStyle = '#fff'; m.font = 'bold 12px system-ui'; m.textAlign = 'center'; m.textBaseline = 'middle'; m.fillText('i', cx, cy - 2); break;
    case 'toilet': m.fillStyle = '#ffffff'; m.fillRect(px + 12, py + 4, 16, 10); m.beginPath(); m.ellipse(cx, py + 24, 9, 11, 0, 0, Math.PI * 2); m.fill(); m.strokeStyle = '#a9b2b8'; m.stroke(); break;
    case 'sink': m.fillStyle = '#f2f2f0'; rr(m, px + 4, py + 6, w - 8, h - 12, 5); m.fill(); m.strokeStyle = '#a9b2b8'; m.beginPath(); m.ellipse(cx, cy, 9, 6, 0, 0, Math.PI * 2); m.stroke(); break;
    case 'stall': { // a food stall: kitchen behind, counter in front, the name on a colored sign
      const east = it.side === 'e';
      m.fillStyle = '#4a4f58'; m.fillRect(px + 2, py + 2, w - 4, h - 4); // kitchen
      m.fillStyle = '#f4f1ea'; if (east) m.fillRect(px + 2, py + 2, 12, h - 4); else m.fillRect(px + 2, py + 2, w - 4, 12); // counter
      m.fillStyle = it.color; if (east) m.fillRect(px + 14, py + 2, 8, h - 4); else m.fillRect(px + 2, py + 14, w - 4, 8);
      m.save(); m.translate(east ? px + 30 : cx, east ? cy : py + 30); if (east) m.rotate(-Math.PI / 2);
      m.fillStyle = '#fff'; m.font = 'bold 12px system-ui'; m.textAlign = 'center'; m.textBaseline = 'middle'; m.fillText(it.name, 0, 0);
      m.restore();
      break;
    }
    case 'dtable': // a food-court table with four chairs
      chair(m, cx, cy - 15, Math.PI, '#e8a33d'); chair(m, cx, cy + 15, 0, '#e8a33d'); chair(m, cx - 15, cy, -Math.PI / 2, '#e8a33d'); chair(m, cx + 15, cy, Math.PI / 2, '#e8a33d');
      m.fillStyle = '#f2ede4'; rr(m, cx - 11, cy - 11, 22, 22, 5); m.fill(); m.strokeStyle = 'rgba(0,0,0,.25)'; m.stroke();
      m.fillStyle = '#e85d5d'; m.beginPath(); m.arc(cx - 4, cy - 3, 3, 0, Math.PI * 2); m.fill(); m.fillStyle = '#f2b43b'; m.fillRect(cx + 1, cy, 6, 4);
      break;
  }
  m.restore();
}

export function drawMallMap(m, G) {
  const M = G.mall, roomAt = new Map();
  for (const r of M.rooms) for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) roomAt.set(y * COLS + x, r);
  // floors (doorways take the floor of the room they open into)
  for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) if (G.grid[y][x] !== 1)
    floorTile(m, roomAt.get(y * COLS + x) || roomAt.get((y + 1) * COLS + x) || roomAt.get((y - 1) * COLS + x), x, y);
  // walls: warm white, with a pale front face where you can see it from below; the glass entrance doors in the west wall
  const windowAt = new Set(M.windows.map(w => w.y * COLS + w.x));
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (G.grid[y][x] !== 1) continue;
    const px = x * TILE, py = y * TILE;
    if (windowAt.has(y * COLS + x)) {
      m.fillStyle = '#5e646c'; m.fillRect(px, py, TILE, TILE);
      const g = m.createLinearGradient(px, py, px + TILE, py + TILE); g.addColorStop(0, '#cfeaf8'); g.addColorStop(1, '#93c6e6');
      m.fillStyle = g; m.fillRect(px + 10, py + 1, 20, TILE - 2);
      continue;
    }
    m.fillStyle = '#f0e9df'; m.fillRect(px, py, TILE, TILE);
    m.fillStyle = '#faf6f0'; m.fillRect(px, py, TILE, 3);
    if (y + 1 < ROWS && G.grid[y + 1][x] !== 1) { m.fillStyle = '#d6cbbb'; m.fillRect(px, py + TILE - 12, TILE, 12); m.fillStyle = '#b3a692'; m.fillRect(px, py + TILE - 2, TILE, 2); }
    m.strokeStyle = 'rgba(0,0,0,.06)'; m.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
  }
  for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) if (G.grid[y][x] !== 1 && G.grid[y - 1][x] === 1) { m.fillStyle = 'rgba(0,0,0,.1)'; m.fillRect(x * TILE, y * TILE, TILE, 6); }
  // sunlight from the skylights, down the length of the promenade
  const sky = m.createLinearGradient(0, 12 * TILE, 0, 19 * TILE);
  sky.addColorStop(0, 'rgba(255,250,230,0)'); sky.addColorStop(0.5, 'rgba(255,250,230,.25)'); sky.addColorStop(1, 'rgba(255,250,230,0)');
  m.fillStyle = sky; m.fillRect(TILE, 12 * TILE, (COLS - 2) * TILE, 7 * TILE);
  // glass shopfronts
  for (const w of M.glass) {
    const px = w.x * TILE, py = w.y * TILE;
    m.fillStyle = 'rgba(190,225,240,.55)'; m.fillRect(px, py + 14, TILE, 12);
    m.fillStyle = 'rgba(255,255,255,.6)'; m.fillRect(px + 4, py + 16, 10, 3);
    m.fillStyle = '#4a4f58'; m.fillRect(px, py + 13, TILE, 1.5); m.fillRect(px, py + 25.5, TILE, 1.5);
  }
  // fixtures and furniture
  drawDefined(m, l => { for (const it of M.items) drawItem(l, it); });
  // each shop's name on a colored sign over its shopfront
  for (const r of M.rooms) {
    if (r.type !== 'shop') continue;
    const sx = (r.x0 + r.x1 + 1) / 2 * TILE, sy = r.north ? r.front * TILE + TILE + 2 : r.front * TILE - 16, sw = Math.min((r.x1 - r.x0 + 1) * TILE - 16, 150);
    m.fillStyle = 'rgba(0,0,0,.2)'; rr(m, sx - sw / 2 + 2, sy + 2, sw, 15, 4); m.fill();
    m.fillStyle = r.color; rr(m, sx - sw / 2, sy, sw, 15, 4); m.fill();
    m.fillStyle = '#fff'; m.font = 'bold 11px system-ui'; m.textAlign = 'center'; m.textBaseline = 'middle'; m.fillText(r.name.toUpperCase(), sx, sy + 8);
  }
  // signs on the staff and toilet doors
  m.font = 'bold 9px system-ui'; m.textAlign = 'center'; m.textBaseline = 'middle';
  for (const [x, y, t] of [[36, 11, 'WC'], [27, 28, 'STAFF']]) { m.fillStyle = '#3d4148'; rr(m, x * TILE + 2, y * TILE + 13, TILE - 4, 14, 3); m.fill(); m.fillStyle = '#fff'; m.fillText(t, x * TILE + TILE / 2, y * TILE + 20); }
}

// drawn every frame, on top of the dimming: the fountain's water sparkles
export function drawMallGlow(ctx, G, t) {
  const f = G.mall.items.find(i => i.type === 'fountain');
  if (!f) return;
  const cx = (f.x + f.w / 2) * TILE, cy = (f.y + f.h / 2) * TILE;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 14; i++) {
    const a = i * 0.45 + t * 0.6, r = 12 + ((t * 18 + i * 9) % 34), k = 1 - r / 46;
    ctx.fillStyle = `rgba(220,245,255,${0.5 * k})`; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
