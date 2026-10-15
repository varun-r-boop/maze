// Top-down look of the library, one picture per floor: wooden and marble floors, carpeted stacks of bookcases,
// reading tables with green lamps, the staircases, and upstairs the gallery railing around the open atrium
// (the holes in the upper floor are left see-through, so the ground floor shows through them).
const Sh = window.Shared;
const { TILE, COLS, ROWS } = Sh.C;

const hash = (x, y, k = 0) => { const s = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };
const BOOKS = ['#a8322a', '#2e6fa1', '#2f8a55', '#d08a26', '#71408f', '#e8e0cc', '#3d3d48', '#b85a2e'];
const BRIGHT = ['#e85d5d', '#f2b43b', '#4aa3df', '#6dbf5b', '#b48ee0', '#f07cb0'];

function rr(m, x, y, w, h, r) {
  m.beginPath(); m.moveTo(x + r, y); m.arcTo(x + w, y, x + w, y + h, r); m.arcTo(x + w, y + h, x, y + h, r);
  m.arcTo(x, y + h, x, y, r); m.arcTo(x, y, x + w, y, r); m.closePath();
}

// floors: carpet in the stacks (a color per section), wooden boards in the reading rooms, marble in the atrium and lobby
const CARPET = { FICTION: '#5d7f63', SCIENCE: '#4f6d8c', HISTORY: '#8a5150', 'RARE BOOKS': '#6e3b46' };
function floorTile(m, r, x, y) {
  const px = x * TILE, py = y * TILE, k = hash(x, y);
  const plain = (c, line = 'rgba(0,0,0,.1)') => { m.fillStyle = c; m.fillRect(px, py, TILE, TILE); m.strokeStyle = line; m.lineWidth = 1; m.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1); };
  const boards = c => { // wooden boards, staggered
    m.fillStyle = c; m.fillRect(px, py, TILE, TILE);
    m.strokeStyle = 'rgba(60,35,15,.22)'; m.lineWidth = 1; m.beginPath();
    for (let i = 0; i <= 4; i++) { m.moveTo(px, py + i * 10 + 0.5); m.lineTo(px + TILE, py + i * 10 + 0.5); }
    for (let i = 0; i < 4; i++) { const sx = px + ((i * 17 + x * 23) % TILE); m.moveTo(sx + 0.5, py + i * 10); m.lineTo(sx + 0.5, py + i * 10 + 10); }
    m.stroke();
  };
  const carpet = c => { plain(c, 'rgba(0,0,0,.04)'); m.fillStyle = 'rgba(255,255,255,.05)'; if ((x + y) % 2) m.fillRect(px + 8, py + 8, TILE - 16, TILE - 16); };
  const type = r ? r.type : 'atrium';
  if (type === 'stacks' || type === 'archive') carpet(CARPET[r.label] || '#5d7f63');
  else if (type === 'reading' || type === 'study' || type === 'gallery') boards(type === 'gallery' ? '#b5875b' : '#a9784f');
  else if (type === 'atrium' || type === 'lobby' || type === 'exhibit') { // marble squares with a dark diamond where four meet
    plain((x + y) % 2 ? '#ece6da' : '#ddd3c2', 'rgba(140,120,90,.2)');
    m.fillStyle = '#8b7a66'; m.beginPath(); m.moveTo(px, py - 5); m.lineTo(px + 5, py); m.lineTo(px, py + 5); m.lineTo(px - 5, py); m.fill();
  }
  else if (type === 'media' || type === 'lab') carpet('#6b7383');
  else if (type === 'group') carpet('#4e8a86');
  else if (type === 'kids') { plain(BRIGHT[Math.floor(k * 6)], 'rgba(255,255,255,.5)'); m.fillStyle = 'rgba(255,255,255,.35)'; m.fillRect(px + 4, py + 4, TILE - 8, TILE - 8); }
  else if (type === 'cafe') plain((x + y) % 2 ? '#c4744a' : '#b3683f', 'rgba(255,255,255,.18)');
  else plain('#e4dccd');
}

function chair(m, cx, cy, a, color = '#7a4a2c') {
  m.save(); m.translate(cx, cy); m.rotate(a);
  m.fillStyle = 'rgba(0,0,0,.18)'; m.beginPath(); m.arc(1.5, 1.5, 6.5, 0, Math.PI * 2); m.fill();
  m.fillStyle = color; rr(m, -6, -5, 12, 10, 3); m.fill();
  m.fillStyle = 'rgba(0,0,0,.28)'; rr(m, -6, -8, 12, 4, 2); m.fill();
  m.restore();
}
function leaves(m, cx, cy, r) {
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9 + hash(cx, cy, i), d = r * 0.45;
    m.fillStyle = i % 2 ? '#3f8a3a' : '#5aa84a';
    m.beginPath(); m.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * 0.45, r * 0.24, a, 0, Math.PI * 2); m.fill();
  }
}
// book spines along a shelf, seen from above: thin colored strips
function spines(m, x, y, w, h, alongX, k) {
  let i = 0;
  if (alongX) for (let sx = x; sx < x + w - 2; i++) { const bw = 3 + hash(k, i) * 3; m.fillStyle = BOOKS[Math.floor(hash(i, k, 2) * BOOKS.length)]; m.fillRect(sx, y, bw - 0.6, h); sx += bw; }
  else for (let sy = y; sy < y + h - 2; i++) { const bh = 3 + hash(k, i) * 3; m.fillStyle = BOOKS[Math.floor(hash(i, k, 2) * BOOKS.length)]; m.fillRect(x, sy, w, bh - 0.6); sy += bh; }
}
// a green banker's lamp
function lamp(m, x, y) {
  m.fillStyle = '#c9a646'; m.beginPath(); m.arc(x, y, 3, 0, Math.PI * 2); m.fill();
  m.fillStyle = '#2f7d4f'; rr(m, x - 6, y - 3, 12, 6, 3); m.fill();
  m.fillStyle = 'rgba(255,240,180,.35)'; m.beginPath(); m.arc(x, y + 6, 9, 0, Math.PI * 2); m.fill();
}

function drawItem(m, it) {
  const px = it.x * TILE, py = it.y * TILE, w = it.w * TILE, h = it.h * TILE, cx = px + w / 2, cy = py + h / 2;
  const alongX = it.w >= it.h;
  m.save();
  m.fillStyle = 'rgba(0,0,0,.18)'; m.fillRect(px + 4, py + 5, w - 4, h - 4); // a soft shadow under everything
  switch (it.type) {
    case 'shelf': case 'lowshelf': case 'kidshelf': { // a bookcase: wooden frame, books along both sides (or the open side)
      const wood = it.type === 'kidshelf' ? '#f3f3f3' : it.type === 'lowshelf' ? '#9a6a42' : '#6e4a2e';
      m.fillStyle = wood; m.fillRect(px + 2, py + 2, w - 4, h - 4);
      if (alongX) { spines(m, px + 4, py + 5, w - 8, h / 2 - 7, true, it.x + it.y); spines(m, px + 4, cy + 2, w - 8, h / 2 - 7, true, it.x * 3 + it.y); }
      else { spines(m, px + 5, py + 4, w / 2 - 7, h - 8, false, it.x + it.y); spines(m, cx + 2, py + 4, w / 2 - 7, h - 8, false, it.x * 3 + it.y); }
      m.fillStyle = 'rgba(0,0,0,.35)'; if (alongX) m.fillRect(px + 2, cy - 1, w - 4, 2); else m.fillRect(cx - 1, py + 2, 2, h - 4);
      if (it.type === 'kidshelf') for (let i = 0; i < 4; i++) { m.fillStyle = BRIGHT[i]; m.beginPath(); m.arc(cx, py + 20 + i * 40, 5, 0, Math.PI * 2); m.fill(); }
      break;
    }
    case 'display': // a low table of books on show, propped open
      m.fillStyle = '#7a5236'; rr(m, px + 3, py + 6, w - 6, h - 12, 5); m.fill();
      for (let i = 0; i < it.w * 2; i++) { const bx = px + 12 + i * (w - 24) / (it.w * 2 - 1); m.fillStyle = '#f4efe2'; m.fillRect(bx - 7, cy - 6, 14, 12); m.fillStyle = BOOKS[i % BOOKS.length]; m.fillRect(bx - 1, cy - 6, 2, 12); }
      break;
    case 'readtable': { // a long wooden table with green lamps down the middle and chairs along both sides
      if (alongX) for (let i = 0; i < it.w; i++) { chair(m, px + i * TILE + 20, py - 2, 0); chair(m, px + i * TILE + 20, py + h + 2, Math.PI); }
      else for (let i = 0; i < it.h; i++) { chair(m, px - 2, py + i * TILE + 20, -Math.PI / 2); chair(m, px + w + 2, py + i * TILE + 20, Math.PI / 2); }
      m.fillStyle = '#8a5a36'; rr(m, px + 3, py + 4, w - 6, h - 8, 4); m.fill();
      m.strokeStyle = 'rgba(60,35,15,.35)'; m.lineWidth = 1; m.strokeRect(px + 6.5, py + 7.5, w - 13, h - 15);
      for (let i = 0; i < it.w; i += 2) lamp(m, px + i * TILE + 26, cy);
      for (let i = 1; i < it.w; i += 2) { m.fillStyle = BOOKS[(i + it.y) % BOOKS.length]; m.fillRect(px + i * TILE + 12, cy - 5, 14, 10); m.fillStyle = '#f4efe2'; m.fillRect(px + i * TILE + 26, cy - 4, 10, 8); }
      break;
    }
    case 'fireplace': // a stone fireplace in the wall, a fire burning
      m.fillStyle = '#9b8f82'; m.fillRect(px + 2, py + 2, w - 4, h - 4);
      m.fillStyle = '#5b4f45'; m.fillRect(px + 2, py + 2, w - 4, 8);
      m.fillStyle = '#2a201b'; rr(m, cx - 30, py + 12, 60, h - 14, 6); m.fill();
      break;
    case 'armchair': // a leather armchair (face: which way it looks, 0 east / 2 west)
      m.fillStyle = it.color; rr(m, px + 6, py + 6, w - 12, h - 12, 8); m.fill();
      m.fillStyle = 'rgba(0,0,0,.22)'; if (it.face === 0) rr(m, px + 6, py + 6, 9, h - 12, 4); else rr(m, px + w - 15, py + 6, 9, h - 12, 4); m.fill();
      m.fillStyle = 'rgba(255,255,255,.12)'; rr(m, px + 14, py + 12, w - 28, 6, 3); m.fill();
      break;
    case 'magrack': // a magazine rack along the wall
      m.fillStyle = '#7a5236'; m.fillRect(px + 2, py + 2, w - 4, h - 10);
      for (let i = 0; i < it.w * 3; i++) { m.fillStyle = BRIGHT[(i + it.x) % 6]; m.fillRect(px + 6 + i * (w - 12) / (it.w * 3), py + 8, (w - 12) / (it.w * 3) - 3, h - 22); }
      break;
    case 'pcdesk': // a row of computers with chairs in front
      for (let i = 0; i < it.w; i++) chair(m, px + i * TILE + 20, py + h + 3, Math.PI, '#3a3f4c');
      m.fillStyle = '#e9e4da'; rr(m, px + 2, py + 6, w - 4, h - 12, 4); m.fill(); m.strokeStyle = 'rgba(0,0,0,.2)'; m.stroke();
      for (let i = 0; i < it.w; i++) { m.fillStyle = '#23262c'; m.fillRect(px + i * TILE + 8, py + 9, 24, 7); m.fillStyle = '#7fc3e8'; m.fillRect(px + i * TILE + 10, py + 10, 20, 4); m.fillStyle = '#555b66'; m.fillRect(px + i * TILE + 11, py + 20, 18, 6); }
      break;
    case 'carrel': // study desks side by side, with dividers and a lamp each
      for (let i = 0; i < it.w; i++) chair(m, px + i * TILE + 20, py + h + 3, Math.PI);
      m.fillStyle = '#b07b4f'; rr(m, px + 2, py + 6, w - 4, h - 12, 3); m.fill();
      m.fillStyle = '#6e4a2e'; m.fillRect(px + 2, py + 4, w - 4, 5);
      for (let i = 0; i <= it.w; i++) m.fillRect(px + i * TILE - (i === it.w ? 4 : 0) + (i ? 0 : 2), py + 4, 3, h - 10);
      for (let i = 0; i < it.w; i++) { lamp(m, px + i * TILE + 12, py + 14); m.fillStyle = '#f4efe2'; m.fillRect(px + i * TILE + 20, py + 16, 13, 10); }
      break;
    case 'lowtable': case 'kidtable':
      m.fillStyle = it.type === 'kidtable' ? '#f2b43b' : '#8a5a36'; rr(m, px + 5, py + 8, w - 10, h - 16, 6); m.fill();
      if (it.type === 'kidtable') for (const [dx, dy] of [[12, -16], [w - 12, -16], [12, 16], [w - 12, 16]]) { m.fillStyle = BRIGHT[(dx + dy) & 3]; m.beginPath(); m.arc(px + dx, cy + dy, 6, 0, Math.PI * 2); m.fill(); }
      else { m.fillStyle = BOOKS[2]; m.fillRect(cx - 10, cy - 5, 12, 9); }
      break;
    case 'desk': { // the front desk: a curved counter with a computer and a stack of books
      m.fillStyle = '#7a5236'; rr(m, px + 3, py + 3, w - 6, h - 6, 14); m.fill();
      m.fillStyle = '#e9e4da'; rr(m, px + 9, py + 9, w - 18, h - 18, 9); m.fill();
      m.fillStyle = '#23262c'; m.fillRect(px + 20, py + 18, 22, 8); m.fillStyle = '#7fc3e8'; m.fillRect(px + 22, py + 19, 18, 5);
      for (let i = 0; i < 4; i++) { m.fillStyle = BOOKS[i]; m.fillRect(px + w - 50, py + 18 + i * 7, 22, 6); }
      m.fillStyle = '#fff'; m.font = 'bold 10px system-ui'; m.textAlign = 'center'; m.textBaseline = 'middle'; m.fillText('INFO & LOANS', cx, py + h - 18);
      break;
    }
    case 'bench': m.fillStyle = '#8a5a36'; rr(m, px + 8, py + 4, w - 16, h - 8, 5); m.fill(); break;
    case 'returnbox': m.fillStyle = '#2e6fa1'; rr(m, px + 7, py + 7, w - 14, h - 14, 4); m.fill(); m.fillStyle = '#1d4a6e'; m.fillRect(px + 12, py + 12, w - 24, 4); m.fillStyle = '#fff'; m.font = 'bold 8px system-ui'; m.textAlign = 'center'; m.textBaseline = 'middle'; m.fillText('RETURN', cx, cy + 6); break;
    case 'plant': m.fillStyle = '#c7744a'; m.beginPath(); m.arc(cx, cy, 14, 0, Math.PI * 2); m.fill(); leaves(m, cx, cy, 16); break;
    case 'castle': { // a play castle with turrets at the corners
      m.fillStyle = '#d9cfe8'; m.fillRect(px + 6, py + 6, w - 12, h - 12);
      for (const [dx, dy] of [[0, 0], [w, 0], [0, h], [w, h]]) { m.fillStyle = '#b48ee0'; m.beginPath(); m.arc(px + (dx ? dx - 10 : 10), py + (dy ? dy - 10 : 10), 10, 0, Math.PI * 2); m.fill(); m.fillStyle = '#e85d5d'; m.beginPath(); m.arc(px + (dx ? dx - 10 : 10), py + (dy ? dy - 10 : 10), 5, 0, Math.PI * 2); m.fill(); }
      m.fillStyle = '#7a5236'; rr(m, cx - 8, py + h - 16, 16, 12, 6); m.fill();
      break;
    }
    case 'beanbag': m.fillStyle = it.color; m.beginPath(); m.ellipse(cx, cy + 2, 15, 13, 0.3, 0, Math.PI * 2); m.fill(); m.fillStyle = 'rgba(255,255,255,.25)'; m.beginPath(); m.ellipse(cx - 4, cy - 3, 6, 4, 0.3, 0, Math.PI * 2); m.fill(); break;
    case 'cafecounter':
      m.fillStyle = '#f4f1ea'; rr(m, px + 2, py + 3, w - 4, h - 8, 5); m.fill(); m.strokeStyle = 'rgba(0,0,0,.2)'; m.stroke();
      m.fillStyle = '#6b4a2f'; m.fillRect(px + 10, py + 8, 16, 14); m.fillStyle = '#2c3036'; m.fillRect(cx - 6, py + 10, 12, 8);
      m.fillStyle = '#f3c26b'; for (let i = 0; i < 4; i++) { m.beginPath(); m.arc(px + w - 50 + i * 10, cy - 2, 4, 0, Math.PI * 2); m.fill(); }
      break;
    case 'bistro':
      chair(m, cx - 14, cy, -Math.PI / 2, '#3a3f4c'); chair(m, cx + 14, cy, Math.PI / 2, '#3a3f4c');
      m.fillStyle = '#f2ede4'; m.beginPath(); m.arc(cx, cy, 10, 0, Math.PI * 2); m.fill(); m.strokeStyle = 'rgba(0,0,0,.25)'; m.stroke();
      m.fillStyle = '#ffffff'; m.beginPath(); m.arc(cx - 3, cy - 2, 3, 0, Math.PI * 2); m.fill();
      break;
    case 'globe':
      m.fillStyle = '#6e4a2e'; m.beginPath(); m.arc(cx, cy, 15, 0, Math.PI * 2); m.fill();
      m.fillStyle = '#4aa3df'; m.beginPath(); m.arc(cx, cy, 12, 0, Math.PI * 2); m.fill();
      m.fillStyle = '#6dbf5b'; m.beginPath(); m.ellipse(cx - 4, cy - 3, 5, 4, 0.5, 0, Math.PI * 2); m.ellipse(cx + 5, cy + 4, 4, 3, 0, 0, Math.PI * 2); m.fill();
      break;
    case 'case': // a glass display case with old books and scrolls inside
      m.fillStyle = '#7a5236'; m.fillRect(px + 3, py + 3, w - 6, h - 6);
      m.fillStyle = 'rgba(205,232,245,.75)'; m.fillRect(px + 6, py + 6, w - 12, h - 12);
      for (let i = 0; i < it.w * it.h * 2; i++) { m.fillStyle = i % 2 ? '#c9a646' : '#8a3b34'; m.fillRect(px + 10 + hash(px, i) * (w - 28), py + 10 + hash(py, i) * (h - 26), 12, 9); }
      m.fillStyle = 'rgba(255,255,255,.6)'; m.fillRect(px + 8, py + 8, 4, h - 16);
      break;
    case 'maptable': // an old map spread out on a table
      m.fillStyle = '#7a5236'; rr(m, px + 3, py + 4, w - 6, h - 8, 4); m.fill();
      m.fillStyle = '#e8d6a8'; m.fillRect(px + 12, py + 8, w - 24, h - 16);
      m.strokeStyle = '#8a6a48'; m.lineWidth = 1.5; m.beginPath(); m.moveTo(px + 20, cy); m.bezierCurveTo(px + 40, py + 10, px + 70, py + h - 10, px + w - 20, cy); m.stroke();
      m.fillStyle = '#c0392b'; m.beginPath(); m.arc(px + 70, cy - 3, 3, 0, Math.PI * 2); m.fill();
      break;
    case 'dino': { // a clay dinosaur on a plinth, seen from above
      m.fillStyle = '#d8cfc0'; rr(m, px + 4, py + 4, w - 8, h - 8, 8); m.fill();
      m.fillStyle = '#6dbf5b';
      m.beginPath(); m.ellipse(cx, cy, 44, 20, 0, 0, Math.PI * 2); m.fill(); // body
      m.beginPath(); m.moveTo(cx - 40, cy - 8); m.quadraticCurveTo(px + 6, cy, cx - 40, cy + 8); m.fill(); // tail
      m.beginPath(); m.ellipse(cx + 52, cy - 4, 18, 13, -0.2, 0, Math.PI * 2); m.fill(); // head
      m.fillStyle = '#4e9c47'; for (let i = 0; i < 6; i++) { m.beginPath(); m.arc(cx - 34 + i * 13, cy, 4, 0, Math.PI * 2); m.fill(); } // spines down its back
      m.fillStyle = '#1d1410'; m.beginPath(); m.arc(cx + 58, cy - 9, 2.2, 0, Math.PI * 2); m.fill();
      break;
    }
    case 'roundtable':
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; chair(m, cx + Math.cos(a) * 30, cy + Math.sin(a) * 30, a + Math.PI / 2, '#4e8a86'); }
      m.fillStyle = '#f2ede4'; m.beginPath(); m.arc(cx, cy, 24, 0, Math.PI * 2); m.fill(); m.strokeStyle = 'rgba(0,0,0,.2)'; m.stroke();
      m.fillStyle = BOOKS[1]; m.fillRect(cx - 12, cy - 6, 12, 9); m.fillStyle = '#f4efe2'; m.fillRect(cx + 2, cy - 2, 10, 8);
      break;
  }
  m.restore();
}

// a staircase: steps across it, lighter the higher they are (`down`: seen from upstairs, so they drop away)
function drawRamp(m, r, down) {
  const px = r.x0 * TILE, py = r.y0 * TILE, w = (r.x1 - r.x0 + 1) * TILE, h = (r.y1 - r.y0 + 1) * TILE, n = 14;
  const vert = r.dir === 'n' || r.dir === 's';
  for (let i = 0; i < n; i++) { // i = 0 is the bottom step
    const k = down ? 0.35 + 0.65 * (i / (n - 1)) : 0.62 + 0.38 * (i / (n - 1)), along = (vert ? h : w) / n;
    const c = Math.round(205 * k), c2 = Math.round(178 * k), c3 = Math.round(150 * k);
    m.fillStyle = r.grand ? `rgb(${Math.round(150 * k)},${Math.round(52 * k)},${Math.round(48 * k)})` : `rgb(${c},${c2},${c3})`;
    const at = r.dir === 'n' ? py + h - (i + 1) * along : r.dir === 's' ? py + i * along : r.dir === 'e' ? px + i * along : px + w - (i + 1) * along;
    if (vert) m.fillRect(px + 4, at, w - 8, along - 1); else m.fillRect(at, py + 4, along - 1, h - 8);
    m.fillStyle = 'rgba(255,255,255,.22)'; if (vert) m.fillRect(px + 4, r.dir === 'n' ? at : at + along - 3, w - 8, 2); else m.fillRect(at, py + 4, 2, h - 8);
  }
  if (r.grand) { m.fillStyle = 'rgba(201,166,70,.8)'; if (vert) { m.fillRect(px + 4, py, 3, h); m.fillRect(px + w - 7, py, 3, h); } } // brass stair rods
  // the banisters down both sides
  m.fillStyle = '#5b3a24'; if (vert) { m.fillRect(px, py, 4, h); m.fillRect(px + w - 4, py, 4, h); } else { m.fillRect(px, py, w, 4); m.fillRect(px, py + h - 4, w, 4); }
  // which way: up from the ground floor, down from upstairs
  const ax = px + w / 2, ay = r.dir === 'n' ? (down ? py + 16 : py + h - 18) : py + h / 2;
  m.fillStyle = 'rgba(30,20,10,.55)'; rr(m, ax - 22, ay - 9, 44, 18, 9); m.fill();
  m.fillStyle = '#ffe9a8'; m.font = 'bold 11px system-ui'; m.textAlign = 'center'; m.textBaseline = 'middle';
  m.fillText(down ? '▼ DOWN' : '▲ UP', ax, ay + 1);
}

// draw one floor of the library onto `m` (fl 0: ground floor, 1: upstairs)
export function drawLibraryMap(m, G, fl) {
  const Lb = G.library, grid = fl ? G.upper : G.grid, roomAt = new Map();
  for (const r of Lb.rooms) if (r.fl === fl) for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) roomAt.set(y * COLS + x, r);
  const onRamp = (x, y) => G.ramps.some(r => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
  // floors (doorways take the floor of a room next to them); upstairs, the holes stay see-through
  for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
    const v = grid[y][x];
    if (v === 1 || v === 4) continue;
    floorTile(m, roomAt.get(y * COLS + x) || roomAt.get((y + 1) * COLS + x) || roomAt.get((y - 1) * COLS + x) || roomAt.get(y * COLS + x + 1) || roomAt.get(y * COLS + x - 1), x, y);
  }
  // downstairs: sunlight falls into the atrium through the glass roof (and a shadow under the gallery around it)
  if (!fl) {
    m.fillStyle = 'rgba(40,25,10,.13)'; m.fillRect(13 * TILE, 11 * TILE, 15 * TILE, 12 * TILE);
    const g = m.createRadialGradient(20.5 * TILE, 17 * TILE, TILE, 20.5 * TILE, 17 * TILE, 7 * TILE);
    g.addColorStop(0, 'rgba(255,248,220,.42)'); g.addColorStop(1, 'rgba(255,248,220,.12)');
    m.fillStyle = g; m.fillRect(15 * TILE, 13 * TILE, 11 * TILE, 8 * TILE);
    // a big round rug in the reading room, in front of the fire
    m.fillStyle = 'rgba(138,59,52,.75)'; m.beginPath(); m.ellipse(20.5 * TILE, 3.3 * TILE, 2.4 * TILE, 1.1 * TILE, 0, 0, Math.PI * 2); m.fill();
    m.strokeStyle = 'rgba(232,200,120,.7)'; m.lineWidth = 3; m.stroke();
  }
  // walls: cream plaster with dark wood trim; windows all round the outside; the glass entrance doors
  const windowAt = new Set(Lb.windows.map(w => w.y * COLS + w.x));
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (grid[y][x] !== 1) continue;
    const px = x * TILE, py = y * TILE;
    if (!fl && y === ROWS - 1 && Lb.entrance.includes(x)) { // the entrance doors
      m.fillStyle = '#4b5058'; m.fillRect(px, py, TILE, TILE);
      m.fillStyle = 'rgba(190,225,240,.9)'; m.fillRect(px + 2, py + 12, TILE - 4, 16);
      continue;
    }
    if (windowAt.has(y * COLS + x)) {
      m.fillStyle = '#5b3a24'; m.fillRect(px, py, TILE, TILE);
      const g = m.createLinearGradient(px, py, px + TILE, py + TILE); g.addColorStop(0, '#d5ecf8'); g.addColorStop(1, '#9ccbe6');
      m.fillStyle = g; if (x === 0 || x === COLS - 1) m.fillRect(px + 12, py + 2, 16, TILE - 4); else m.fillRect(px + 2, py + 12, TILE - 4, 16);
      continue;
    }
    m.fillStyle = '#efe5d2'; m.fillRect(px, py, TILE, TILE);
    m.fillStyle = '#fbf5ea'; m.fillRect(px, py, TILE, 3);
    if (y + 1 < ROWS && grid[y + 1][x] !== 1 && grid[y + 1][x] !== 4) { m.fillStyle = '#c9b89c'; m.fillRect(px, py + TILE - 12, TILE, 12); m.fillStyle = '#6e4a2e'; m.fillRect(px, py + TILE - 3, TILE, 3); }
    m.strokeStyle = 'rgba(0,0,0,.06)'; m.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
  }
  for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) { const v = grid[y][x]; if (v !== 1 && v !== 4 && grid[y - 1][x] === 1) { m.fillStyle = 'rgba(0,0,0,.1)'; m.fillRect(x * TILE, y * TILE, TILE, 6); } }
  // the staircases
  for (const r of G.ramps) drawRamp(m, r, !!fl);
  // furniture
  for (const it of Lb.items) if (it.fl === fl) drawItem(m, it);
  // upstairs: a wooden railing (with a brass top rail) wherever the floor stops at a hole or a staircase's side
  if (fl) {
    const open = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS && grid[y][x] === 4;
    const solidFloor = (x, y) => grid[y][x] !== 4 && grid[y][x] !== 1;
    for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
      if (!solidFloor(x, y) && !(onRamp(x, y))) continue;
      const px = x * TILE, py = y * TILE;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!open(x + dx, y + dy) || (onRamp(x, y) && dy)) continue; // (a staircase's bottom end isn't railed: it carries on down)
        const rx = dx > 0 ? px + TILE - 5 : px, ry = dy > 0 ? py + TILE - 5 : py;
        m.fillStyle = '#5b3a24'; m.fillRect(rx, ry, dx ? 5 : TILE, dy ? 5 : TILE);
        m.fillStyle = '#c9a646'; m.fillRect(rx + (dx ? 1.5 : 0), ry + (dy ? 1.5 : 0), dx ? 2 : TILE, dy ? 2 : TILE);
      }
    }
  }
  // labels on each section of the stacks
  m.font = 'bold 11px system-ui'; m.textAlign = 'center'; m.textBaseline = 'middle';
  for (const r of Lb.rooms) if (r.fl === fl && r.label) {
    const sx = (r.x0 + r.x1 + 1) / 2 * TILE, sy = (r.y0 + 1) * TILE + 2, sw = 96;
    m.fillStyle = 'rgba(0,0,0,.2)'; rr(m, sx - sw / 2 + 2, sy + 2, sw, 16, 4); m.fill();
    m.fillStyle = '#2b2420'; rr(m, sx - sw / 2, sy, sw, 16, 4); m.fill();
    m.fillStyle = '#f2e3c0'; m.fillText(r.label, sx, sy + 8.5);
  }
}

// drawn every frame on top of the dimming: the fire crackling in the reading room (only on the ground floor)
export function drawLibraryGlow(ctx, G, t) {
  if (G.fl) return;
  const f = G.library.items.find(i => i.type === 'fireplace');
  if (!f) return;
  const cx = (f.x + f.w / 2) * TILE, cy = (f.y + 0.75) * TILE;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const k = 0.75 + 0.25 * Math.sin(t * 13) * Math.sin(t * 7.3);
  const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 70);
  g.addColorStop(0, `rgba(255,170,60,${0.55 * k})`); g.addColorStop(1, 'rgba(255,120,30,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 70, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 5; i++) { // flames
    const fx = cx - 18 + i * 9, fh = 10 + 6 * Math.sin(t * 11 + i * 2.1);
    ctx.fillStyle = `rgba(255,${150 + i * 15},40,.8)`; ctx.beginPath(); ctx.ellipse(fx, cy - fh / 2 + 4, 4, fh / 2, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
