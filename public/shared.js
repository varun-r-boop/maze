// Code shared by the server (Node) and the browser client.
(function (S) {
  const C = S.C = {
    TILE: 40, COLS: 41, ROWS: 31,
    PLAYER_SPEED: 165, PLAYER_R: 12,
    ENTITY_R: 15, ENTITY_BASE: 118, ENTITY_MAX: 150, ENTITY_RAMP: 0.25,
    SAFE_INTERVAL: 10, SAFE_WARN: 3,
    ENTITY_SEEN: 11, // tiles: how close the entity must be before a player's client is told where it is
    INVULN: 3, MAX_PLAYERS: 12, // no lives: getting caught just sends you back to the start
    PLAYERS_PER_ENTITY: 4, // one more entity for every this many players
  };
  const { TILE, COLS, ROWS } = C;
  S.COLORS = ['#4fc3f7', '#ffb74d', '#81c784', '#f06292', '#fff176', '#4db6ac', '#ce93d8', '#ff8a65', '#7986cb', '#aed581', '#bcaaa4', '#e0e0e0'];
  // one spawn tile per player in the 4x3 spawn area at the top-left
  S.SPAWNS = [[1, 1], [3, 1], [1, 3], [3, 3], [2, 2], [4, 2], [2, 1], [4, 1], [1, 2], [3, 2], [2, 3], [4, 3]];
  // facing angle in map space (radians, as Math.atan2(dy, dx): 0 = east, PI/2 = south). Start facing east, into the maze.
  S.START_YAW = 0;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  const rand = S.rand = n => Math.floor(Math.random() * n);
  const I = S.I = (x, y) => y * COLS + x;
  S.center = t => t * TILE + TILE / 2;
  S.tileOf = o => ({ x: Math.floor(o.x / TILE), y: Math.floor(o.y / TILE) });
  S.dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  S.entityCount = n => Math.max(1, Math.ceil(n / C.PLAYERS_PER_ENTITY));

  // maps the host can pick
  S.MAPS = [['building', 'Building'], ['apartment', 'Apartment (3 floors)'], ['forest', 'Forest']];

  // `links` (optional): Map from a tile index to tile indexes it also connects to (stairs between floors)
  S.bfs = function (sx, sy, pass, links) {
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
      const l = links && links.get(c);
      if (l) for (const ni of l) {
        if (d[ni] !== -1 || !pass(ni % COLS, (ni / COLS) | 0)) continue;
        d[ni] = d[c] + 1; par[ni] = c; q[t++] = ni;
      }
    }
    return { d, par };
  };
  S.stairLinks = stairs => new Map(stairs.map(s => [I(s.x, s.y), [I(s.tx, s.ty)]]));
  // which floor a map-space x position is on (floors are side by side in the grid, split by solid walls)
  S.floorOf = (floors, px) => {
    const tx = Math.floor(px / TILE);
    for (let i = 0; i < floors.length; i++) if (tx <= floors[i].x1) return i;
    return floors.length - 1;
  };

  // a level: { name, grid, floors: [{x0, x1}], stairs: [{x, y, tx, ty, up}], spawns: [[x, y]], gate (or null to pick one) }
  S.genLevel = function (name) {
    if (name === 'apartment') return genApartment();
    if (name === 'forest') return genForest();
    return { name: 'building', grid: S.genMap(), floors: [{ x0: 0, x1: COLS - 1 }], stairs: [], spawns: S.SPAWNS, gate: null };
  };

  // A 3-floor apartment block. Each floor: a hallway down the middle with flats on both sides,
  // and a stairwell at each end of the hallway with real flights of stairs. You start on the top floor;
  // the way out is the building entrance at the bottom of the ground-floor hallway.
  // Grid values: 0 floor, 1 wall, 2 low furniture (blocks walking, not light), 3 tall furniture (blocks both).
  const FW = 12, FLOORS = 3, FLIGHT = 3; // floor width: 4 (flats) + 1 (wall) + 2 (hallway) + 1 (wall) + 4 (flats); FLIGHT: rows a staircase takes
  S.FLIGHT = FLIGHT;
  function genApartment() {
    for (;;) {
      const g = [...Array(ROWS)].map(() => Array(COLS).fill(1));
      const floors = [], stairs = [], flights = [], rooms = [], furniture = [], doors = [], top = 1, bot = ROWS - 2;
      const X = (k, lx) => 1 + k * (FW + 1) + lx;
      for (let k = 0; k < FLOORS; k++) {
        floors.push({ x0: X(k, 0), x1: X(k, FW - 1) });
        for (let y = top; y <= bot; y++) g[y][X(k, 5)] = g[y][X(k, 6)] = 0; // hallway
        rooms.push({ type: 'hall', x0: X(k, 5), y0: top, x1: X(k, 6), y1: bot });
        for (const east of [false, true]) {
          const ux0 = east ? X(k, 8) : X(k, 0), ux1 = ux0 + 3, doorX = east ? X(k, 7) : X(k, 4);
          const frontX = east ? ux0 : ux1, backX = east ? ux1 : ux0, face = east ? -1 : 1; // furniture on the back wall faces the hallway side
          const units = [];
          for (let y = top; y <= bot;) {
            const left = bot - y + 1;
            let h = 4 + rand(3);
            if (left - h - 1 < 4) h = left; // the last flat takes what's left
            units.push([y, y + h - 1]); y += h + 1; // +1: the wall between flats
          }
          for (const [ya, yb] of units) {
            for (let y = ya; y <= yb; y++) for (let x = ux0; x <= ux1; x++) g[y][x] = 0;
            const door = ya + 1 + rand(yb - ya - 1);
            g[door][doorX] = 0; doors.push({ x: doorX, y: door, vert: true }); // front door onto the hallway
            const R = (type, y0, y1) => furnish(g, furniture, rooms, { type, x0: ux0, x1: ux1, y0, y1 }, frontX, backX, face, door);
            const walls = [];
            for (let wy = ya + 2; wy <= yb - 2; wy++) if (wy !== door) walls.push(wy);
            if (yb - ya >= 4 && walls.length && Math.random() < 0.7) { // a bedroom or bathroom behind an inner wall
              const wy = walls[rand(walls.length)], ix = ux0 + 1 + rand(2);
              for (let x = ux0; x <= ux1; x++) g[wy][x] = 1;
              g[wy][ix] = 0; doors.push({ x: ix, y: wy, vert: false });
              const doorTop = door < wy, back = doorTop ? [wy + 1, yb] : [ya, wy - 1];
              R('living', ...(doorTop ? [ya, wy - 1] : [wy + 1, yb]));
              R(back[1] - back[0] + 1 <= 2 && Math.random() < 0.7 ? 'bath' : 'bed', ...back);
            } else R('studio', ya, yb);
          }
          // some neighbouring flats are joined by a doorway, so there are loops to run around
          for (let i = 0; i + 1 < units.length; i++) if (Math.random() < 0.35) {
            const y = units[i][1] + 1, x = ux0 + 1 + rand(2);
            g[y][x] = 0; doors.push({ x, y, vert: false });
          }
        }
      }
      // stairwells at both ends of every hallway: the left column is a flight going up, the right one going down.
      // Reach the far end of a flight and you arrive on the other floor next to the bottom of its matching flight.
      for (let k = 0; k < FLOORS; k++) for (const [y0, y1, dir] of [[top, top + FLIGHT - 1, -1], [bot - FLIGHT + 1, bot, 1]]) {
        const end = dir < 0 ? y0 : y1, out = dir < 0 ? y1 + 1 : y0 - 1, a = dir < 0 ? Math.PI / 2 : -Math.PI / 2; // face out of the stairwell
        if (k + 1 < FLOORS) {
          flights.push({ x: X(k, 5), y0, y1, dir, up: true });
          stairs.push({ x: X(k, 5), y: end, tx: X(k + 1, 6), ty: out, up: true, a });
        }
        if (k > 0) {
          flights.push({ x: X(k, 6), y0, y1, dir, up: false });
          stairs.push({ x: X(k, 6), y: end, tx: X(k - 1, 5), ty: out, up: false, a });
        }
      }
      const spawns = [];
      for (let y = top + FLIGHT + 2; spawns.length < 12; y++) spawns.push([X(FLOORS - 1, 5), y], [X(FLOORS - 1, 6), y]); // top-floor hallway
      const gate = { x: X(0, 6), y: ROWS - 1, ix: X(0, 6), iy: bot }; // ground-floor entrance
      // every open tile must be reachable from the spawn, using the stairs
      const d = S.bfs(spawns[0][0], spawns[0][1], (x, y) => g[y][x] === 0, S.stairLinks(stairs)).d;
      let ok = true;
      for (let y = 0; y < ROWS && ok; y++) for (let x = 0; x < COLS; x++) if (g[y][x] === 0 && d[I(x, y)] < 0) { ok = false; break; }
      if (ok) return { name: 'apartment', grid: g, floors, stairs, flights, rooms, furniture, doors, spawns, gate, yaw: -Math.PI / 2 }; // start facing up the hallway, toward the stairs
    }
  }

  // A forest at night. Trees (tile 3) block walking and light; bushes, rocks, logs and water (tile 2) block walking only;
  // the edge of the map (tile 1) is a dense treeline, plus the walls of an old log cabin.
  // You start at a campsite in the top-left; a path winds to the way out on the far right.
  function genForest() {
    for (;;) {
      const g = [...Array(ROWS)].map((_, y) => Array(COLS).fill(0).map((_, x) => (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) ? 1 : 0));
      const F = { trees: [], bushes: [], rocks: [], logs: [], water: [], bridge: [], path: [], cabin: null, fire: { x: 4, y: 4 } };
      const reserved = new Set(), key = (x, y) => y * COLS + x, inside = (x, y) => x > 0 && y > 0 && x < COLS - 1 && y < ROWS - 1;
      // campsite clearing
      for (let y = 1; y <= 8; y++) for (let x = 1; x <= 8; x++) if ((x - 4) ** 2 + (y - 4) ** 2 <= 13) reserved.add(key(x, y));
      // winding dirt paths: the main one to the way out, and a couple of side trails
      const pathSet = new Set();
      const trail = (x, y, tx, ty) => {
        for (let n = 0; n < 400 && (x !== tx || y !== ty); n++) {
          pathSet.add(key(x, y));
          const r = Math.random();
          if (r < 0.62) { if (Math.abs(tx - x) >= Math.abs(ty - y)) x += Math.sign(tx - x); else y += Math.sign(ty - y); }
          else if (r < 0.81) y += Math.random() < 0.5 ? 1 : -1;
          else x += Math.random() < 0.5 ? 1 : -1;
          x = Math.max(1, Math.min(COLS - 2, x)); y = Math.max(1, Math.min(ROWS - 2, y));
        }
        pathSet.add(key(tx, ty));
      };
      const gy = 6 + rand(ROWS - 12);
      trail(6, 5, COLS - 2, gy);
      trail(4, 7, 6 + rand(10), ROWS - 3);
      trail(7, 3, 18 + rand(10), 2 + rand(4));
      for (const k of pathSet) reserved.add(k);
      // a pond somewhere in the middle; where a path crosses it there's a bridge
      const pcx = 14 + rand(14), pcy = 9 + rand(12), prx = 2 + Math.random() * 1.6, pry = 1.5 + Math.random() * 1.2;
      for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
        if (((x - pcx) / prx) ** 2 + ((y - pcy) / pry) ** 2 > 1 || reserved.has(key(x, y)) && !pathSet.has(key(x, y))) continue;
        if (pathSet.has(key(x, y))) F.bridge.push({ x, y }); else { g[y][x] = 2; F.water.push({ x, y }); }
        reserved.add(key(x, y));
      }
      // an abandoned log cabin (walls are tile 1), door on its south side, a table inside
      for (let tries = 0; tries < 60 && !F.cabin; tries++) {
        const cx0 = 3 + rand(COLS - 12), cy0 = 3 + rand(ROWS - 10), w = 6, h = 5;
        let ok = true;
        for (let y = cy0 - 1; y <= cy0 + h && ok; y++) for (let x = cx0 - 1; x <= cx0 + w && ok; x++) if (!inside(x, y) || reserved.has(key(x, y)) || g[y][x] !== 0) ok = false;
        if (!ok) continue;
        const door = cx0 + 2 + rand(2);
        for (let y = cy0; y < cy0 + h; y++) for (let x = cx0; x < cx0 + w; x++) {
          const edge = y === cy0 || y === cy0 + h - 1 || x === cx0 || x === cx0 + w - 1;
          if (edge && !(y === cy0 + h - 1 && x === door)) g[y][x] = 1;
        }
        g[cy0 + 2][cx0 + 2] = 2; // table
        F.cabin = { x0: cx0, y0: cy0, x1: cx0 + w - 1, y1: cy0 + h - 1, door, table: { x: cx0 + 2, y: cy0 + 2 } };
        for (let y = cy0 - 1; y <= cy0 + h; y++) for (let x = cx0 - 1; x <= cx0 + w; x++) reserved.add(key(x, y));
        reserved.add(key(door, cy0 + h)); reserved.add(key(door, cy0 + h + 1));
      }
      // trees and undergrowth: every obstacle has free ground all around it, so the woods never get sealed off
      const clear = (x, y) => { for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) if (g[yy][xx] !== 0) return false; return true; };
      const dense = (x, y) => 0.5 + 0.5 * Math.sin(x * 0.45 + gy) * Math.cos(y * 0.5 + pcx); // groves and thinner patches
      const order = [];
      for (let y = 2; y < ROWS - 2; y++) for (let x = 2; x < COLS - 2; x++) order.push([x, y]);
      shuffleIn(order);
      for (const [x, y] of order) {
        if (reserved.has(key(x, y)) || !clear(x, y)) continue;
        const r = Math.random();
        if (r < 0.34 + 0.4 * dense(x, y)) {
          g[y][x] = 3;
          const k = Math.random();
          F.trees.push({ x, y, kind: k < 0.58 ? 'pine' : k < 0.9 ? 'oak' : 'dead', s: 0.8 + Math.random() * 0.45, ox: (Math.random() - 0.5) * 0.3, oz: (Math.random() - 0.5) * 0.3, rot: Math.random() * 6.28 });
        } else if (r < 0.48 + 0.4 * dense(x, y)) {
          g[y][x] = 2;
          const k = Math.random();
          if (k < 0.55) F.bushes.push({ x, y, s: 0.7 + Math.random() * 0.4 });
          else if (k < 0.85) F.rocks.push({ x, y, s: 0.6 + Math.random() * 0.5, rot: Math.random() * 6.28 });
          else F.logs.push({ x, y, rot: Math.random() * 3.14 });
        }
      }
      g[F.fire.y][F.fire.x] = 2; // the campfire
      const spawns = [];
      const ring = [];
      for (let y = 1; y <= 8; y++) for (let x = 1; x <= 8; x++) if (g[y][x] === 0 && reserved.has(key(x, y))) ring.push([x, y]);
      ring.sort((p, q) => ((p[0] - 4) ** 2 + (p[1] - 4) ** 2) - ((q[0] - 4) ** 2 + (q[1] - 4) ** 2));
      for (const t of ring) if (spawns.length < 12 && (t[0] !== 4 || t[1] !== 4)) spawns.push(t);
      if (spawns.length < 12) continue;
      // anything the paths can't reach (cut off by the pond, say) becomes undergrowth
      const d = S.bfs(spawns[0][0], spawns[0][1], (x, y) => g[y][x] === 0).d;
      for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) if (g[y][x] === 0 && d[I(x, y)] < 0) {
        const inCabin = F.cabin && x > F.cabin.x0 && x < F.cabin.x1 && y > F.cabin.y0 && y < F.cabin.y1;
        if (inCabin) continue; // (checked below)
        g[y][x] = 2; F.bushes.push({ x, y, s: 0.9 });
      }
      if (d[I(COLS - 2, gy)] < 0) continue; // the way out must be reachable
      if (F.cabin && d[I(F.cabin.door, F.cabin.y1)] < 0) continue;
      F.path = [...pathSet].filter(k => !F.bridge.some(b => key(b.x, b.y) === k)).map(k => ({ x: k % COLS, y: (k / COLS) | 0 }));
      const gate = { x: COLS - 1, y: gy, ix: COLS - 2, iy: gy };
      return { name: 'forest', grid: g, floors: [{ x0: 0, x1: COLS - 1 }], stairs: [], spawns, gate, yaw: 0, forest: F };
    }
  }
  function shuffleIn(a) { for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // Furniture goes only along the back wall and the hallway-side wall of a room, never in front of the
  // front door, so the middle two columns always stay free and nothing gets cut off.
  const FABRICS = ['#7a5c8a', '#4f6f8f', '#8a5a4a', '#5f7f5a', '#8a7a4a'];
  function furnish(g, furniture, rooms, room, frontX, backX, face, doorRow) {
    rooms.push(room);
    const free = (x, y) => y >= room.y0 && y <= room.y1 && g[y][x] === 0 && !(x === frontX && y === doorRow);
    const put = (type, x, y, len, tall, f) => {
      for (let i = 0; i < len; i++) if (!free(x, y + i)) return false;
      for (let i = 0; i < len; i++) g[y + i][x] = tall ? 3 : 2;
      furniture.push({ type, x, y, len, face: f, color: FABRICS[rand(FABRICS.length)] });
      return true;
    };
    // try to place a piece somewhere along a wall column, starting from a random row
    const along = (type, x, len, tall, f) => {
      const n = room.y1 - room.y0 + 1, s = rand(n);
      for (let i = 0; i < n; i++) if (put(type, x, room.y0 + (s + i) % n, len, tall, f)) return true;
      return false;
    };
    const back = (type, len, tall) => along(type, backX, len, tall, face);
    const front = (type, len, tall) => along(type, frontX, len, tall, -face);
    const t = room.type;
    if (t === 'living') { back('sofa', 2) || back('sofa', 1); front('tv', 1); front('counter', 2) || front('counter', 1); front('fridge', 1, true); back('plant', 1); }
    else if (t === 'bed') { back('bed', 2); back('nightstand', 1); front('wardrobe', 1, true); }
    else if (t === 'bath') { back('bathtub', 2) || back('toilet', 1); front('sink', 1); front('toilet', 1); }
    else { back('bed', 2); back('plant', 1); front('counter', 1); front('fridge', 1, true); front('tv', 1); } // studio
  }

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
    for (let y = 1; y <= 3; y++) for (let x = 1; x <= 4; x++) g[y][x] = 0; // spawn area

    // furniture: blocks inside bigger rooms, always with a free tile all around so nothing gets cut off
    for (const r of rooms) {
      const w = r.x1 - r.x0 + 1, h = r.y1 - r.y0 + 1;
      if (w < 5 || h < 5) continue;
      for (let n = Math.floor(w * h / 18), tries = 0; n > 0 && tries < 40; tries++) {
        const bw = 1 + rand(2), bh = 1 + rand(2);
        const bx = r.x0 + 1 + rand(w - 1 - bw), by = r.y0 + 1 + rand(h - 1 - bh);
        if (bx + bw > r.x1 || by + bh > r.y1 || (bx <= 5 && by <= 4)) continue;
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
    return w.grid[ty][tx] !== 0; // walls and furniture
  };
  // what your headlight can't shine through: walls and tall furniture (not beds, sofas, tables...)
  S.blocksLight = function (w, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return true;
    if (tx === w.gate.x && ty === w.gate.y) return !w.gate.open;
    const v = w.grid[ty][tx];
    return v === 1 || v === 3;
  };
  // how high up a staircase a map-space point is: 0 on the floor, up to 1 at the top of an up flight, down to -1 going down
  S.stairHeight = function (flights, px, py) {
    if (!flights) return 0;
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    for (const f of flights) {
      if (f.x !== tx || ty < f.y0 || ty > f.y1) continue;
      const k = f.dir < 0 ? ((f.y1 + 1) * TILE - py) / (FLIGHT * TILE) : (py - f.y0 * TILE) / (FLIGHT * TILE);
      return (f.up ? 1 : -1) * Math.max(0, Math.min(1, k));
    }
    return 0;
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
