// Top-down look of the fight arena: a plain white room, the fighting area in the middle marked off by a low barrier.
const Sh = window.Shared;
const { TILE, COLS, ROWS } = Sh.C;

export function drawArenaMap(m, G) {
  const A = G.arena, R = A.ring, g = G.grid;
  const inRing = (x, y) => x >= R.x0 && x <= R.x1 && y >= R.y0 && y <= R.y1 && Math.min(x - R.x0, R.x1 - x) + Math.min(y - R.y0, R.y1 - y) >= 2;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const px = x * TILE, py = y * TILE, v = g[y][x];
    if (v === 1) { m.fillStyle = '#d9dade'; m.fillRect(px, py, TILE, TILE); m.fillStyle = '#e8e9ec'; m.fillRect(px, py, TILE, 4); continue; } // the walls
    m.fillStyle = inRing(x, y) ? '#ffffff' : '#f3f3f1'; m.fillRect(px, py, TILE, TILE); // the floor
    m.strokeStyle = 'rgba(0,0,0,.035)'; m.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
    if (v === 2) { // the barrier: a low white wall with a soft shadow
      m.fillStyle = 'rgba(0,0,0,.08)'; m.fillRect(px + 3, py + 5, TILE - 4, TILE - 4);
      m.fillStyle = '#ffffff'; m.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
      m.strokeStyle = '#cfd1d6'; m.lineWidth = 1.5; m.strokeRect(px + 2.5, py + 2.5, TILE - 5, TILE - 5); m.lineWidth = 1;
    }
  }
  // where the two fighters start
  for (const [fx, fy] of A.fighters) { m.strokeStyle = 'rgba(0,0,0,.12)'; m.lineWidth = 2; m.beginPath(); m.arc(Sh.center(fx), Sh.center(fy), 20, 0, Math.PI * 2); m.stroke(); m.lineWidth = 1; }
}
