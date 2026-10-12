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

  // A building: the floor is split into rooms and hallways joined by doorways, with furniture for cover.
  S.genMap = function () {
    for (;;) {
      const g = buildFloor();
      const d = S.bfs(2, 2, (x, y) => g[y][x] === 0).d;
      let ok = true;
      for (let y = 1; y < ROWS - 1 && ok; y++) for (let x = 1; x < COLS - 1; x++) if (g[y][x] === 0 && d[I(x, y)] < 0) { ok = false; break; }
      if (ok) return g;
    }
  };

  function buildFloor() {
    const g = [...Array(ROWS)].map((_, y) => Array(COLS).fill(0).map((_, x) => (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) ? 1 : 0));
    const rooms = [];

    // wall line from (x,y) along the axis, with one or two doorways (sometimes double width)
    function wall(vert, at, from, to) {
      for (let i = from; i <= to; i++) if (vert) g[i][at] = 1; else g[at][i] = 1;
      const len = to - from + 1, doors = 1 + (len >= 12 ? 1 : 0) + (len >= 22 && Math.random() < 0.5 ? 1 : 0);
      for (let k = 0; k < doors; k++) {
        const seg = Math.floor(len / doors), i = from + k * seg + rand(Math.max(1, seg - 1));
        const wide = Math.random() < 0.35 && i + 1 <= to;
        for (const j of wide ? [i, i + 1] : [i]) if (vert) g[j][at] = 0; else g[at][j] = 0;
      }
    }
    // a wall may only end against solid wall, never in front of an existing doorway
    const fitsV = (wx, y0, y1) => g[y0 - 1][wx] === 1 && g[y1 + 1][wx] === 1;
    const fitsH = (wy, x0, x1) => g[wy][x0 - 1] === 1 && g[wy][x1 + 1] === 1;

    function split(x0, y0, x1, y1) {
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      const canV = w >= 7, canH = h >= 7;
      if ((!canV && !canH) || (w * h <= 64 && Math.random() < 0.4)) { rooms.push({ x0, y0, x1, y1 }); return; }
      const vert = canV && (!canH || (w === h ? Math.random() < 0.5 : w > h));
      const lo = vert ? x0 : y0, hi = vert ? x1 : y1, fits = vert ? (a => fitsV(a, y0, y1)) : (a => fitsH(a, x0, x1));
      // long spans sometimes get a 2-wide hallway between two walls
      if ((hi - lo + 1) >= 15 && Math.random() < 0.45) {
        const opts = [];
        for (let a = lo + 3; a <= hi - 6; a++) if (fits(a) && fits(a + 3)) opts.push(a);
        if (opts.length) {
          const a = opts[rand(opts.length)];
          if (vert) { wall(true, a, y0, y1); wall(true, a + 3, y0, y1); split(x0, y0, a - 1, y1); split(a + 4, y0, x1, y1); }
          else { wall(false, a, x0, x1); wall(false, a + 3, x0, x1); split(x0, y0, x1, a - 1); split(x0, a + 4, x1, y1); }
          return;
        }
      }
      const opts = [];
      for (let a = lo + 3; a <= hi - 3; a++) if (fits(a)) opts.push(a);
      if (!opts.length) { rooms.push({ x0, y0, x1, y1 }); return; }
      const a = opts[rand(opts.length)];
      if (vert) { wall(true, a, y0, y1); split(x0, y0, a - 1, y1); split(a + 1, y0, x1, y1); }
      else { wall(false, a, x0, x1); split(x0, y0, x1, a - 1); split(x0, a + 1, x1, y1); }
    }
    split(1, 1, COLS - 2, ROWS - 2);

    // extra doorways so there are loops (so players can circle around the entity)
    for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
      if (g[y][x] !== 1 || Math.random() > 0.05) continue;
      const h = g[y][x - 1] === 0 && g[y][x + 1] === 0, v = g[y - 1][x] === 0 && g[y + 1][x] === 0;
      if (h !== v) g[y][x] = 0;
    }
    for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) g[y][x] = 0; // spawn area

    // furniture: blocks inside bigger rooms, always with a free tile all around so nothing gets cut off
    for (const r of rooms) {
      const w = r.x1 - r.x0 + 1, h = r.y1 - r.y0 + 1;
      if (w < 5 || h < 5) continue;
      for (let n = Math.floor(w * h / 18), tries = 0; n > 0 && tries < 40; tries++) {
        const bw = 1 + rand(2), bh = 1 + rand(2);
        const bx = r.x0 + 1 + rand(w - 1 - bw), by = r.y0 + 1 + rand(h - 1 - bh);
        if (bx + bw > r.x1 || by + bh > r.y1 || (bx <= 4 && by <= 4)) continue;
        let free = true;
        for (let y = by - 1; y <= by + bh && free; y++) for (let x = bx - 1; x <= bx + bw; x++) if (g[y][x] !== 0) { free = false; break; }
        if (!free) continue;
        for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) g[y][x] = 1;
        n--;
      }
    }
    return g;
  }

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
