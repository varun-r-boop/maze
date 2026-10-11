// Code shared by the server (Node) and the browser client.
(function (S) {
  const C = S.C = {
    TILE: 40, COLS: 41, ROWS: 31,
    PLAYER_SPEED: 165, PLAYER_R: 12,
    ENTITY_R: 15, ENTITY_BASE: 118, ENTITY_MAX: 150, ENTITY_RAMP: 0.25,
    SAFE_INTERVAL: 10, SAFE_WARN: 3,
    ENTITY_SEEN: 11, // tiles: how close the entity must be before a player's client is told where it is
    TEAM_LIVES: 3, INVULN: 3, MAX_PLAYERS: 4,
  };
  const { TILE, COLS, ROWS } = C;
  S.COLORS = ['#4fc3f7', '#ffb74d', '#81c784', '#f06292'];
  S.SPAWNS = [[1, 1], [3, 1], [1, 3], [3, 3]];
  // facing angle in map space (radians, as Math.atan2(dy, dx): 0 = east, PI/2 = south). Start facing east, into the maze.
  S.START_YAW = 0;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  const rand = S.rand = n => Math.floor(Math.random() * n);
  const I = S.I = (x, y) => y * COLS + x;
  S.center = t => t * TILE + TILE / 2;
  S.tileOf = o => ({ x: Math.floor(o.x / TILE), y: Math.floor(o.y / TILE) });
  S.dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const shuffle = S.shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  S.bfs = function (sx, sy, pass) {
    const d = new Int16Array(COLS * ROWS).fill(-1), par = new Int32Array(COLS * ROWS).fill(-1);
    const q = new Int32Array(COLS * ROWS); let h = 0, t = 0;
    d[I(sx, sy)] = 0; q[t++] = I(sx, sy);
    while (h < t) {
      const c = q[h++], x = c % COLS, y = (c / COLS) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const ni = I(nx, ny);
        if (d[ni] !== -1 || !pass(nx, ny)) continue;
        d[ni] = d[c] + 1; par[ni] = c; q[t++] = ni;
      }
    }
    return { d, par };
  };

  S.genMap = function () {
    const g = [...Array(ROWS)].map(() => Array(COLS).fill(1));
    // recursive-backtracker maze on odd cells
    const stack = [[1, 1]]; g[1][1] = 0;
    while (stack.length) {
      const [x, y] = stack[stack.length - 1];
      const opts = shuffle([[2, 0], [-2, 0], [0, 2], [0, -2]]).filter(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        return nx > 0 && ny > 0 && nx < COLS - 1 && ny < ROWS - 1 && g[ny][nx] === 1;
      });
      if (!opts.length) { stack.pop(); continue; }
      const [dx, dy] = opts[0];
      g[y + dy / 2][x + dx / 2] = 0; g[y + dy][x + dx] = 0;
      stack.push([x + dx, y + dy]);
    }
    // knock out walls to create loops (so players can circle around the entity)
    for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
      if (g[y][x] !== 1 || Math.random() > 0.14) continue;
      const h = g[y][x - 1] === 0 && g[y][x + 1] === 0, v = g[y - 1][x] === 0 && g[y + 1][x] === 0;
      if (h || v) g[y][x] = 0;
    }
    // a few open rooms
    for (let i = 0; i < 7; i++) {
      const w = 3 + rand(3), h = 3 + rand(3), x0 = 1 + rand(COLS - 2 - w), y0 = 1 + rand(ROWS - 2 - h);
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) g[y][x] = 0;
    }
    for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) g[y][x] = 0; // spawn room
    return g;
  };

  // `w` is any object with { grid, gate: { x, y, open } }
  S.solid = function (w, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return true;
    if (tx === w.gate.x && ty === w.gate.y) return !w.gate.open;
    return w.grid[ty][tx] === 1;
  };
  S.collides = function (w, x, y, r) {
    const x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE);
    const y0 = Math.floor((y - r) / TILE), y1 = Math.floor((y + r) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (!S.solid(w, tx, ty)) continue;
      const cx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE));
      const cy = Math.max(ty * TILE, Math.min(y, ty * TILE + TILE));
      if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true;
    }
    return false;
  };
  // slides toward the tile center when pushing into a wall, so turning into corridors feels easy
  function nudge(w, o, axis, amt, r) {
    const c = (Math.floor(o[axis] / TILE) + 0.5) * TILE, diff = c - o[axis];
    const n = Math.sign(diff) * Math.min(Math.abs(diff), amt);
    const nx = axis === 'x' ? o.x + n : o.x, ny = axis === 'y' ? o.y + n : o.y;
    if (n && !S.collides(w, nx, ny, r)) { o.x = nx; o.y = ny; }
  }
  S.moveCircle = function (w, o, dx, dy, r) {
    if (dx) { if (!S.collides(w, o.x + dx, o.y, r)) o.x += dx; else if (!dy) nudge(w, o, 'y', Math.abs(dx), r); }
    if (dy) { if (!S.collides(w, o.x, o.y + dy, r)) o.y += dy; else if (!dx) nudge(w, o, 'x', Math.abs(dy), r); }
  };
})(typeof module !== 'undefined' ? module.exports : (window.Shared = {}));
