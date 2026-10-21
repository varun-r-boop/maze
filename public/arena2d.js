// Top-down look of the fight arena: the dark neon stage. A black floor ruled with a glowing grid, grid walls round the
// edge, and the fighting area in the middle marked off by a low black barrier with a glowing edge.
const Sh = window.Shared;
const { TILE, COLS, ROWS } = Sh.C;

export function drawArenaMap(m, G) {
  const A = G.arena, R = A.ring, g = G.grid;
  const inRing = (x, y) => x >= R.x0 && x <= R.x1 && y >= R.y0 && y <= R.y1 && Math.min(x - R.x0, R.x1 - x) + Math.min(y - R.y0, R.y1 - y) >= 2;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const px = x * TILE, py = y * TILE, v = g[y][x];
    if (v === 1) { // the walls: dark panels with a dimmer grid
      m.fillStyle = '#0b0b10'; m.fillRect(px, py, TILE, TILE);
      m.strokeStyle = 'rgba(200,210,255,.22)'; m.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
      continue;
    }
    m.fillStyle = inRing(x, y) ? '#040406' : '#020203'; m.fillRect(px, py, TILE, TILE); // the floor
    m.strokeStyle = inRing(x, y) ? 'rgba(235,240,255,.26)' : 'rgba(235,240,255,.14)'; m.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1); // (the glowing grid)
    if (v === 2) { // the barrier: a low black block with a glowing edge
      m.fillStyle = '#0d0d12'; m.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
      m.strokeStyle = '#cfd8ff'; m.lineWidth = 1.5; m.strokeRect(px + 2.5, py + 2.5, TILE - 5, TILE - 5); m.lineWidth = 1;
    }
  }
  // where the two fighters start
  for (const [fx, fy] of A.fighters) { m.strokeStyle = 'rgba(160,170,220,.45)'; m.lineWidth = 2; m.beginPath(); m.arc(Sh.center(fx), Sh.center(fy), 20, 0, Math.PI * 2); m.stroke(); m.lineWidth = 1; }
}
