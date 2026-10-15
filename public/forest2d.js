// Top-down look of the forest map: grass, dirt paths, the pond and bridge, trees, undergrowth, the cabin and
// the campfire. The campfire glow and fireflies are drawn every frame on top of the darkness.
import { drawDefined } from './outline2d.js';
const Sh = window.Shared;
const { TILE, COLS, ROWS } = Sh.C;

// a repeatable "random" number per tile, so the static map looks the same every time it's drawn
const hash = (x, y, k = 0) => { const s = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };

export function drawForestMap(m, G) {
  const F = G.forest, at = new Map();
  for (const p of F.path) at.set(p.y * COLS + p.x, 'path');
  for (const p of F.water) at.set(p.y * COLS + p.x, 'water');
  for (const p of F.bridge) at.set(p.y * COLS + p.x, 'bridge');
  // ground
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const px = x * TILE, py = y * TILE, k = hash(x, y);
    m.fillStyle = `rgb(${28 + k * 8 | 0},${46 + k * 14 | 0},${30 + k * 6 | 0})`; m.fillRect(px, py, TILE, TILE);
    m.strokeStyle = 'rgba(90,140,80,.25)'; m.lineWidth = 1;
    for (let i = 0; i < 7; i++) { const gx = px + hash(x, y, i) * TILE, gy = py + hash(x, y, i + 9) * TILE; m.beginPath(); m.moveTo(gx, gy); m.lineTo(gx + 2, gy - 5); m.stroke(); }
    const t = at.get(y * COLS + x);
    if (t === 'path' || t === 'bridge') {
      m.fillStyle = '#5a4630'; m.fillRect(px - 2, py - 2, TILE + 4, TILE + 4);
      m.fillStyle = 'rgba(0,0,0,.18)'; for (let i = 0; i < 5; i++) m.fillRect(px + hash(x, y, i + 3) * TILE, py + hash(x, y, i + 5) * TILE, 3, 2); // pebbles
    }
    if (t === 'water' || t === 'bridge') {
      m.fillStyle = '#16304a'; m.fillRect(px, py, TILE, TILE);
      m.strokeStyle = 'rgba(140,190,230,.18)'; m.lineWidth = 1;
      for (let i = 0; i < 3; i++) { m.beginPath(); m.arc(px + hash(x, y, i) * TILE, py + hash(x, y, i + 4) * TILE, 5 + i * 3, 0.3, 2.6); m.stroke(); }
    }
    if (t === 'bridge') {
      m.fillStyle = '#7a5a3a'; m.fillRect(px + 4, py, TILE - 8, TILE);
      m.strokeStyle = 'rgba(0,0,0,.4)'; for (let i = 0; i < 5; i++) { m.beginPath(); m.moveTo(px + 4, py + i * 8 + 0.5); m.lineTo(px + TILE - 4, py + i * 8 + 0.5); m.stroke(); }
    }
  }
  // the cabin: log walls and a plank floor; its roof is left off so you can see in
  if (F.cabin) {
    const c = F.cabin;
    m.fillStyle = '#4a3a2a'; m.fillRect((c.x0 + 1) * TILE, (c.y0 + 1) * TILE, (c.x1 - c.x0 - 1) * TILE, (c.y1 - c.y0 - 1) * TILE);
    m.strokeStyle = 'rgba(0,0,0,.35)';
    for (let y = c.y0 + 1; y < c.y1; y++) for (let i = 0; i < 4; i++) { m.beginPath(); m.moveTo((c.x0 + 1) * TILE, y * TILE + i * 10 + 0.5); m.lineTo(c.x1 * TILE, y * TILE + i * 10 + 0.5); m.stroke(); }
  }
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (G.grid[y][x] !== 1) continue;
    const px = x * TILE, py = y * TILE;
    const cabin = F.cabin && x >= F.cabin.x0 && x <= F.cabin.x1 && y >= F.cabin.y0 && y <= F.cabin.y1;
    if (cabin) { // log wall
      m.fillStyle = '#6b4a2e'; m.fillRect(px, py, TILE, TILE);
      m.strokeStyle = '#3a2716'; m.lineWidth = 2; for (let i = 0; i < 4; i++) { m.beginPath(); m.moveTo(px, py + i * 10 + 5); m.lineTo(px + TILE, py + i * 10 + 5); m.stroke(); }
    } else { // the edge of the woods: thick, dark treetops
      m.fillStyle = '#0d1a10'; m.fillRect(px, py, TILE, TILE);
      for (let i = 0; i < 3; i++) { m.fillStyle = i % 2 ? '#132816' : '#173019'; m.beginPath(); m.arc(px + hash(x, y, i) * TILE, py + hash(x, y, i + 2) * TILE, 16 + i * 4, 0, Math.PI * 2); m.fill(); }
    }
  }
  // ferns and saplings you can walk through
  for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
    if (G.grid[y][x] !== 0 || at.has(y * COLS + x) || hash(x, y, 7) > 0.3) continue;
    const fx = x * TILE + hash(x, y, 8) * TILE, fy = y * TILE + hash(x, y, 9) * TILE;
    m.strokeStyle = 'rgba(70,130,60,.7)'; m.lineWidth = 2;
    for (let i = 0; i < 5; i++) { const a = i * 1.25 + hash(x, y); m.beginPath(); m.moveTo(fx, fy); m.lineTo(fx + Math.cos(a) * 9, fy + Math.sin(a) * 9); m.stroke(); }
  }
  // everything solid on the ground, drawn on its own layer so it gets an outline and a shadow
  drawDefined(m, l => {
    if (F.cabin) { l.fillStyle = '#5a3d25'; l.fillRect(F.cabin.table.x * TILE + 6, F.cabin.table.y * TILE + 8, TILE - 12, TILE - 16); } // table
    for (const r of F.rocks) {
      const cx = (r.x + 0.5) * TILE, cy = (r.y + 0.5) * TILE;
      l.fillStyle = '#3e4146'; l.beginPath(); l.ellipse(cx + 1, cy + 2, 14 * r.s, 11 * r.s, r.rot, 0, Math.PI * 2); l.fill(); // shaded underside
      l.fillStyle = '#5c6066'; l.beginPath(); l.ellipse(cx, cy, 14 * r.s, 11 * r.s, r.rot, 0, Math.PI * 2); l.fill();
      l.fillStyle = 'rgba(255,255,255,.12)'; l.beginPath(); l.ellipse(cx - 3, cy - 3, 7 * r.s, 5 * r.s, r.rot, 0, Math.PI * 2); l.fill();
    }
    for (const g of F.logs) {
      l.save(); l.translate((g.x + 0.5) * TILE, (g.y + 0.5) * TILE); l.rotate(g.rot);
      l.fillStyle = '#5a3d25'; l.fillRect(-18, -6, 36, 12);
      l.strokeStyle = 'rgba(0,0,0,.35)'; l.lineWidth = 1; l.beginPath(); l.moveTo(-16, -2.5); l.lineTo(14, -2.5); l.moveTo(-14, 2.5); l.lineTo(16, 2.5); l.stroke(); // bark
      l.fillStyle = '#8a6a48'; l.beginPath(); l.ellipse(18, 0, 3, 6, 0, 0, Math.PI * 2); l.fill();
      l.strokeStyle = '#5a3d25'; l.beginPath(); l.ellipse(18, 0, 1.5, 3, 0, 0, Math.PI * 2); l.stroke(); // rings
      l.restore();
    }
    for (const b of F.bushes) {
      const cx = (b.x + 0.5) * TILE, cy = (b.y + 0.5) * TILE;
      for (let i = 0; i < 4; i++) { l.fillStyle = i % 2 ? '#2e5a2a' : '#356632'; l.strokeStyle = 'rgba(0,0,0,.4)'; l.lineWidth = 1; l.beginPath(); l.arc(cx + Math.cos(i * 1.6) * 7 * b.s, cy + Math.sin(i * 1.6) * 7 * b.s, 10 * b.s, 0, Math.PI * 2); l.stroke(); l.fill(); }
    }
    // campfire: a ring of stones around the logs (the flames are drawn every frame)
    const fx = (F.fire.x + 0.5) * TILE, fy = (F.fire.y + 0.5) * TILE;
    for (let i = 0; i < 9; i++) { l.fillStyle = '#6a6a6a'; l.beginPath(); l.arc(fx + Math.cos(i * 0.7) * 15, fy + Math.sin(i * 0.7) * 15, 5, 0, Math.PI * 2); l.fill(); }
    l.fillStyle = '#3a2716'; l.save(); l.translate(fx, fy); for (const a of [0.4, -0.4]) { l.save(); l.rotate(a); l.fillRect(-12, -3, 24, 6); l.restore(); } l.restore();
    // trees last, so their crowns spread over the ground around them
    for (const t of F.trees) {
      const cx = (t.x + 0.5 + t.ox) * TILE, cy = (t.y + 0.5 + t.oz) * TILE, s = t.s;
      // each crown gets a dark rim of its own, so trees that overlap still read as separate trees
      l.strokeStyle = '#060d07'; l.lineWidth = 2; l.lineJoin = 'round';
      if (t.kind === 'pine') {
        for (let i = 0; i < 3; i++) {
          l.fillStyle = ['#183a22', '#1f4a2a', '#275a32'][i]; l.beginPath();
          const r = (24 - i * 7) * s;
          for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2 + t.rot, rr = k % 2 ? r * 0.7 : r; l.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
          l.closePath(); if (i === 0) l.stroke(); else { l.strokeStyle = 'rgba(0,0,0,.35)'; l.lineWidth = 1; l.stroke(); } l.fill();
        }
        l.fillStyle = '#3a2716'; l.beginPath(); l.arc(cx, cy, 2.5 * s, 0, Math.PI * 2); l.fill(); // the tip
      } else if (t.kind === 'oak') {
        const lobes = [0, 1, 2, 3, 4].map(i => [cx + Math.cos(i * 1.3 + t.rot) * 10 * s, cy + Math.sin(i * 1.3 + t.rot) * 10 * s]);
        for (const [x, y] of lobes) { l.beginPath(); l.arc(x, y, 15 * s, 0, Math.PI * 2); l.stroke(); }
        lobes.forEach(([x, y], i) => { l.fillStyle = ['#2a4a22', '#335a28', '#2e5226', '#3a6a2e', '#2a4a22'][i]; l.beginPath(); l.arc(x, y, 15 * s, 0, Math.PI * 2); l.fill(); });
        for (const [x, y] of lobes) { l.fillStyle = 'rgba(160,210,120,.12)'; l.beginPath(); l.arc(x - 4 * s, y - 4 * s, 7 * s, 0, Math.PI * 2); l.fill(); } // leaves catching the light
      } else { // dead tree: bare branches
        l.strokeStyle = '#4a3a2c'; l.lineCap = 'round';
        for (let i = 0; i < 5; i++) { const a = i * 1.26 + t.rot; l.lineWidth = 4; l.beginPath(); l.moveTo(cx, cy); l.lineTo(cx + Math.cos(a) * 20 * s, cy + Math.sin(a) * 20 * s); l.stroke(); }
        l.fillStyle = '#4a3a2c'; l.beginPath(); l.arc(cx, cy, 7, 0, Math.PI * 2); l.fill();
      }
    }
  }, { rim: 'rgba(200,230,170,.18)', shadow: 'rgba(0,0,0,.6)', drop: 5, blur: 5 });
}

// drawn over the darkness: the campfire's glow and flames, and fireflies
export function drawForestGlow(ctx, G, t) {
  const F = G.forest, fx = (F.fire.x + 0.5) * TILE, fy = (F.fire.y + 0.5) * TILE;
  const k = 0.8 + 0.2 * Math.sin(t * 13) * Math.sin(t * 7.3);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, TILE * 3.2 * k);
  g.addColorStop(0, `rgba(255,150,60,${0.35 * k})`); g.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(fx, fy, TILE * 3.2, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 5; i++) { // flames
    const a = t * 6 + i * 1.3, r = 6 + 3 * Math.sin(a);
    ctx.fillStyle = i % 2 ? 'rgba(255,200,80,.8)' : 'rgba(255,110,40,.8)';
    ctx.beginPath(); ctx.arc(fx + Math.sin(a) * 4, fy + Math.cos(a * 1.3) * 4, r, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < 40; i++) { // fireflies drifting through the woods
    const x = ((hash(i, 1) * COLS + Math.sin(t * 0.3 + i) * 1.5) % COLS) * TILE, y = ((hash(i, 2) * ROWS + Math.cos(t * 0.25 + i * 2) * 1.5) % ROWS) * TILE;
    const on = 0.5 + 0.5 * Math.sin(t * 2 + i * 1.7);
    if (on < 0.3) continue;
    ctx.fillStyle = `rgba(210,255,120,${on})`; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
