// Top-down look of the apartment map: room floors, walls with windows, stairs, furniture and swinging doors.
import { drawDefined } from './outline2d.js';
const Sh = window.Shared;
const { TILE, COLS, ROWS } = Sh.C;

const FLOORS = { hall: '#5a2a30', living: '#6b4a32', studio: '#6b4a32', bed: '#4f4a66', bath: '#8e98a2' };

function roundRect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

// the room type at every open tile
function roomMap(G) {
  const at = new Map();
  for (const r of G.rooms) for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) at.set(y * COLS + x, r.type);
  return at;
}

export function drawApartmentMap(m, G) {
  const at = roomMap(G);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const px = x * TILE, py = y * TILE, v = G.grid[y][x];
    if (v === 1) continue;
    const type = at.get(y * COLS + x) || 'hall';
    m.fillStyle = FLOORS[type]; m.fillRect(px, py, TILE, TILE);
    if (type === 'living' || type === 'studio') { // wooden planks
      m.strokeStyle = 'rgba(0,0,0,.25)'; m.lineWidth = 1;
      for (let i = 0; i < 4; i++) { m.beginPath(); m.moveTo(px, py + i * 10 + 0.5); m.lineTo(px + TILE, py + i * 10 + 0.5); m.stroke(); }
      m.beginPath(); m.moveTo(px + ((x * 7 + y * 13) % 4) * 10 + 0.5, py); m.lineTo(px + ((x * 7 + y * 13) % 4) * 10 + 0.5, py + 10); m.stroke();
    } else if (type === 'bath') { // tiles
      m.strokeStyle = 'rgba(255,255,255,.25)'; m.lineWidth = 1;
      for (let i = 0; i <= 4; i++) { m.beginPath(); m.moveTo(px + i * 10 + 0.5, py); m.lineTo(px + i * 10 + 0.5, py + TILE); m.moveTo(px, py + i * 10 + 0.5); m.lineTo(px + TILE, py + i * 10 + 0.5); m.stroke(); }
    } else if (type === 'hall') { // carpet runner with a border
      m.fillStyle = '#6e333a'; m.fillRect(px + 4, py, TILE - 8, TILE);
      m.fillStyle = 'rgba(214,170,90,.25)'; m.fillRect(px + 4, py, 2, TILE); m.fillRect(px + TILE - 6, py, 2, TILE);
    } else { // bedroom carpet
      m.fillStyle = 'rgba(255,255,255,.04)';
      for (let i = 0; i < 6; i++) m.fillRect(px + ((i * 17 + x * 5) % 36), py + ((i * 23 + y * 7) % 36), 3, 3);
    }
    if (y > 0 && G.grid[y - 1][x] === 1) { m.fillStyle = 'rgba(0,0,0,.35)'; m.fillRect(px, py, TILE, 7); } // shadow under a wall
  }
  // rugs in the middle of living rooms and bedrooms
  for (const r of G.rooms) {
    if (r.type === 'hall' || r.type === 'bath' || r.y1 - r.y0 < 2) continue;
    const cx = (r.x0 + r.x1 + 1) / 2 * TILE, cy = (r.y0 + r.y1 + 1) / 2 * TILE, h = Math.min(3, r.y1 - r.y0) * TILE * 0.8;
    m.fillStyle = r.type === 'bed' ? 'rgba(170,140,190,.35)' : 'rgba(150,60,50,.45)';
    roundRect(m, cx - TILE * 0.8, cy - h / 2, TILE * 1.6, h, 6); m.fill();
    m.strokeStyle = 'rgba(230,200,140,.35)'; m.lineWidth = 2; roundRect(m, cx - TILE * 0.8 + 4, cy - h / 2 + 4, TILE * 1.6 - 8, h - 8, 4); m.stroke();
  }
  // walls: warm plaster, with a front face for depth, and windows on the outside walls of the flats
  const FACE = 14;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (G.grid[y][x] !== 1) continue;
    const px = x * TILE, py = y * TILE;
    m.fillStyle = '#3d3630'; m.fillRect(px, py, TILE, TILE);
    m.fillStyle = '#4a423a'; m.fillRect(px, py, TILE, 3);
    if (y + 1 < ROWS && G.grid[y + 1][x] !== 1) { m.fillStyle = '#c9b89a'; m.fillRect(px, py + TILE - FACE, TILE, FACE); m.fillStyle = '#7a5a44'; m.fillRect(px, py + TILE - 4, TILE, 4); }
    const outside = G.floors.some(f => x === f.x0 - 1 || x === f.x1 + 1);
    if (outside && y % 2 === 0 && y > 0 && y < ROWS - 1) {
      const inside = (x + 1 < COLS && at.has(y * COLS + x + 1)) || (x > 0 && at.has(y * COLS + x - 1));
      if (inside) { m.fillStyle = '#7fa6c9'; m.fillRect(px + TILE / 2 - 3, py + 6, 6, TILE - 12); m.fillStyle = 'rgba(200,225,255,.6)'; m.fillRect(px + TILE / 2 - 1, py + 6, 2, TILE - 12); }
    }
  }
  // staircases: steps getting lighter going up, darker going down
  for (const f of G.flights) {
    for (let ty = f.y0; ty <= f.y1; ty++) for (let i = 0; i < 4; i++) {
      const along = f.dir < 0 ? (f.y1 - ty) * 4 + (3 - i) : (ty - f.y0) * 4 + i; // 0 at the bottom of the flight
      const k = f.up ? 0.6 + along * 0.06 : 1 - along * 0.075;
      m.fillStyle = shadeHex('#8a7f70', k); m.fillRect(f.x * TILE + 3, ty * TILE + i * 10 + 1, TILE - 6, 8);
    }
    const ex = f.x * TILE + TILE / 2, ey = (f.dir < 0 ? f.y0 : f.y1) * TILE + TILE / 2;
    m.fillStyle = f.up ? '#ffe9a8' : '#b9b5d6'; m.font = 'bold 18px system-ui'; m.textAlign = 'center'; m.textBaseline = 'middle';
    m.fillText(f.up ? (f.dir < 0 ? '▲' : '▼') : '⤓', ex, ey);
    m.font = 'bold 9px system-ui'; m.fillText(f.up ? 'UP' : 'DOWN', ex, ey + 13);
  }
  drawDefined(m, l => { for (const f of G.furniture) drawFurniture(l, f); });
}

function shadeHex(hex, k) {
  const n = parseInt(hex.slice(1), 16), c = v => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

// furniture seen from above. `face` is the x direction it faces (+1 east, -1 west).
function drawFurniture(m, f) {
  const x = f.x * TILE, y = f.y * TILE, w = TILE, h = f.len * TILE, back = f.face > 0 ? x : x + w; // the side against the wall
  const bx = f.face > 0 ? x + 3 : x + w - 3; // inner edge of the back
  m.save(); m.lineWidth = 1.5; m.strokeStyle = 'rgba(0,0,0,.6)';
  switch (f.type) {
    case 'sofa':
      m.fillStyle = f.color; roundRect(m, x + 4, y + 4, w - 8, h - 8, 6); m.fill(); m.stroke();
      m.fillStyle = shadeHex(f.color, 0.75); m.fillRect(f.face > 0 ? x + 4 : x + w - 14, y + 4, 10, h - 8); // backrest
      m.fillRect(x + 4, y + 4, w - 8, 6); m.fillRect(x + 4, y + h - 10, w - 8, 6); // arms
      m.strokeStyle = 'rgba(0,0,0,.3)'; for (let i = 1; i < f.len; i++) { m.beginPath(); m.moveTo(x + 6, y + i * TILE); m.lineTo(x + w - 6, y + i * TILE); m.stroke(); }
      break;
    case 'bed':
      m.fillStyle = '#5a3a26'; roundRect(m, x + 3, y + 3, w - 6, h - 6, 4); m.fill(); m.stroke();
      m.fillStyle = '#e9e4da'; m.fillRect(x + 6, y + 6, w - 12, h - 12);
      m.fillStyle = f.color; m.fillRect(x + 6, y + h * 0.38, w - 12, h * 0.62 - 6); // blanket
      m.fillStyle = '#ffffff'; roundRect(m, x + 9, y + 9, w - 18, 12, 4); m.fill(); // pillow
      break;
    case 'tv':
      m.fillStyle = '#3a2a20'; m.fillRect(x + 6, y + 8, w - 12, h - 16); m.strokeRect(x + 6, y + 8, w - 12, h - 16);
      m.fillStyle = '#111'; m.fillRect(f.face > 0 ? x + 8 : x + w - 12, y + 5, 4, h - 10); // the screen, edge-on
      break;
    case 'counter':
      m.fillStyle = '#b8b0a2'; m.fillRect(x + 2, y + 2, w - 4, h - 4); m.strokeRect(x + 2, y + 2, w - 4, h - 4);
      m.fillStyle = '#7d8a94'; m.beginPath(); m.ellipse(x + w / 2, y + TILE / 2, 9, 7, 0, 0, Math.PI * 2); m.fill(); // sink
      if (f.len > 1) { m.strokeStyle = '#333'; for (const [dx, dy] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) { m.beginPath(); m.arc(x + w / 2 + dx, y + TILE * 1.5 + dy, 4.5, 0, Math.PI * 2); m.stroke(); } } // stove
      break;
    case 'fridge':
      m.fillStyle = '#dfe3e6'; m.fillRect(x + 4, y + 4, w - 8, h - 8); m.strokeRect(x + 4, y + 4, w - 8, h - 8);
      m.fillStyle = '#888'; m.fillRect(f.face > 0 ? x + w - 9 : x + 6, y + 10, 3, h - 20);
      break;
    case 'wardrobe':
      m.fillStyle = '#6b4a30'; m.fillRect(x + 3, y + 3, w - 6, h - 6); m.strokeRect(x + 3, y + 3, w - 6, h - 6);
      m.beginPath(); m.moveTo(x + 3, y + h / 2); m.lineTo(x + w - 3, y + h / 2); m.stroke();
      break;
    case 'nightstand':
      m.fillStyle = '#7a5434'; m.fillRect(x + 8, y + 8, w - 16, h - 16); m.strokeRect(x + 8, y + 8, w - 16, h - 16);
      m.fillStyle = '#ffe9a8'; m.beginPath(); m.arc(x + w / 2, y + h / 2, 5, 0, Math.PI * 2); m.fill(); // lamp
      break;
    case 'plant':
      m.fillStyle = '#6b4a30'; m.beginPath(); m.arc(x + w / 2, y + h / 2, 9, 0, Math.PI * 2); m.fill();
      m.fillStyle = '#3f8a3a'; for (let i = 0; i < 6; i++) { const a = i * 1.05; m.beginPath(); m.arc(x + w / 2 + Math.cos(a) * 8, y + h / 2 + Math.sin(a) * 8, 6, 0, Math.PI * 2); m.fill(); }
      break;
    case 'bathtub':
      m.fillStyle = '#eef1f3'; roundRect(m, x + 4, y + 4, w - 8, h - 8, 10); m.fill(); m.stroke();
      m.fillStyle = '#9cc4d8'; roundRect(m, x + 9, y + 9, w - 18, h - 18, 8); m.fill();
      break;
    case 'toilet':
      m.fillStyle = '#eef1f3'; m.fillRect(f.face > 0 ? x + 4 : x + w - 14, y + 10, 10, h - 20); m.strokeRect(f.face > 0 ? x + 4 : x + w - 14, y + 10, 10, h - 20);
      m.beginPath(); m.ellipse(x + w / 2 + f.face * 3, y + h / 2, 9, 8, 0, 0, Math.PI * 2); m.fill(); m.stroke();
      break;
    case 'sink':
      m.fillStyle = '#d9d2c4'; m.fillRect(x + 4, y + 6, w - 8, h - 12); m.strokeRect(x + 4, y + 6, w - 8, h - 12);
      m.fillStyle = '#eef1f3'; m.beginPath(); m.ellipse(x + w / 2, y + h / 2, 9, 7, 0, 0, Math.PI * 2); m.fill();
      break;
  }
  m.restore();
}

// which way each door swings: into the flat (not into the hallway)
export function doorSwing(G, d) {
  const hall = G.rooms.filter(r => r.type === 'hall');
  if (d.vert) return hall.some(r => d.x + 1 >= r.x0 && d.x + 1 <= r.x1 && d.y >= r.y0 && d.y <= r.y1) ? -1 : 1;
  return 1;
}

// doors are drawn every frame because they swing open when someone is near
export function drawDoors2D(ctx, G) {
  for (let i = 0; i < G.doors.length; i++) {
    const d = G.doors[i], o = G.doorOpen[i], s = d.swing;
    const L = TILE - 6;
    ctx.save();
    ctx.lineCap = 'round';
    if (d.vert) { // a doorway in a north-south wall: the hinge is at its top, the leaf swings east or west
      const hx = d.x * TILE + TILE / 2, hy = d.y * TILE + 3, a = Math.PI / 2 - s * o * Math.PI / 2 * 0.95;
      ctx.strokeStyle = '#8a5a3a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + Math.cos(a) * L, hy + Math.sin(a) * L); ctx.stroke();
    } else { // a doorway in an east-west wall: the hinge is at its left, the leaf swings north or south
      const hx = d.x * TILE + 3, hy = d.y * TILE + TILE / 2, a = s * o * Math.PI / 2 * 0.95;
      ctx.strokeStyle = '#8a5a3a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + Math.cos(a) * L, hy + Math.sin(a) * L); ctx.stroke();
    }
    ctx.restore();
  }
}
