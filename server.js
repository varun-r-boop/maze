// Keybound game server: serves the client and runs every room's game authoritatively.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const Sh = require('./public/shared.js');

const { TILE, COLS, ROWS, PLAYER_SPEED, PLAYER_R, ENTITY_R, ENTITY_BASE, ENTITY_MAX, ENTITY_RAMP,
  SAFE_INTERVAL, ENTITY_SEEN, INVULN, MAX_PLAYERS } = Sh.C;
const { I, center, tileOf, dist, rand, bfs } = Sh;
const PORT = Number(process.env.PORT) || 3000;
const TICK_MS = 50;

// ---------------------------------------------------------------- static files
const PUB = path.join(__dirname, 'public');
const THREE_DIR = path.join(__dirname, 'node_modules', 'three', 'build');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
  if (p === '/') p = '/index.html';
  // Three.js (for the first- and third-person views) is served straight from node_modules
  const vendor = p.startsWith('/vendor/three/');
  const base = vendor ? THREE_DIR : PUB;
  const file = path.join(base, path.normalize(vendor ? p.slice('/vendor/three'.length) : p));
  if (!file.startsWith(base + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

function lanUrls() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces()))
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${PORT}`);
  return out;
}

// ---------------------------------------------------------------- rooms & clients
const rooms = new Map();
let nextId = 1;
const wss = new WebSocketServer({ server, maxPayload: 4096 });

function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function broadcast(r, msg) { const s = JSON.stringify(msg); for (const c of r.clients.values()) if (c.ws.readyState === 1) c.ws.send(s); }
function note(r, text, color = '#fff', t = 3) { broadcast(r, { t: 'msg', text, color, dur: t }); }
const CHARS = ['carrot', 'roundhead']; // characters players can pick
const cleanChar = ch => CHARS.includes(ch) ? ch : 'carrot';
function shuffleArr(a) { for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function cleanName(n) { return String(n || '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 14) || 'Player'; }
function genCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c; do c = Array.from({ length: 4 }, () => A[rand(A.length)]).join(''); while (rooms.has(c));
  return c;
}

wss.on('connection', ws => {
  const client = { id: nextId++, ws, name: 'Player', char: 'carrot', room: null, slot: -1 };
  ws.on('message', raw => { let m; try { m = JSON.parse(raw); } catch { return; } if (m && typeof m === 'object') handle(client, m); });
  ws.on('close', () => leave(client));
});

function handle(c, m) {
  const r = c.room;
  switch (m.t) {
    case 'create': {
      if (r) return;
      const room = { code: genCode(), host: c.id, clients: new Map(), state: 'lobby', game: null, timer: null, map: 'building' };
      rooms.set(room.code, room);
      c.char = cleanChar(m.char);
      join(c, room, m.name);
      break;
    }
    case 'join': {
      if (r) return;
      const room = rooms.get(String(m.code || '').toUpperCase().trim());
      if (!room) return send(c.ws, { t: 'error', msg: 'Room not found. Check the code.' });
      if (room.state === 'play') return send(c.ws, { t: 'error', msg: 'That game is already in progress. Try again when it ends.' });
      if (room.clients.size >= MAX_PLAYERS) return send(c.ws, { t: 'error', msg: `That room is full (${MAX_PLAYERS} players max).` });
      c.char = cleanChar(m.char);
      join(c, room, m.name);
      break;
    }
    case 'start':
      if (r && r.host === c.id && r.state !== 'play') startGame(r);
      break;
    case 'lobby':
      if (r && r.host === c.id && r.state === 'ended') { r.state = 'lobby'; r.game = null; broadcastLobby(r); }
      break;
    case 'pos':
      if (r && r.state === 'play') onPos(r, c, m);
      break;
    case 'map': // the host picks the map in the lobby
      if (r && r.host === c.id && r.state !== 'play' && Sh.MAPS.some(m2 => m2[0] === m.map)) { r.map = m.map; broadcastLobby(r); }
      break;
    case 'char': // switch character (not mid-game)
      c.char = cleanChar(m.char);
      if (r && r.state !== 'play') broadcastLobby(r);
      break;
  }
}

function join(c, room, name) {
  c.name = cleanName(name);
  c.room = room;
  const used = new Set([...room.clients.values()].map(x => x.slot));
  c.slot = Sh.COLORS.findIndex((_, s) => !used.has(s));
  room.clients.set(c.id, c);
  send(c.ws, { t: 'joined', code: room.code, you: c.id, lan: lanUrls() });
  broadcastLobby(room);
}

function broadcastLobby(r) {
  const players = [...r.clients.values()].map(c => ({ id: c.id, name: c.name, slot: c.slot, char: c.char }));
  broadcast(r, { t: 'lobby', code: r.code, host: r.host, state: r.state, map: r.map, players });
}

function leave(c) {
  const r = c.room;
  if (!r) return;
  r.clients.delete(c.id);
  c.room = null;
  if (!r.clients.size) { clearInterval(r.timer); rooms.delete(r.code); return; }
  if (r.host === c.id) r.host = r.clients.keys().next().value;
  if (r.state === 'play') {
    const g = r.game;
    // the leaver's lock is removed so the rest of the team can still win
    g.players = g.players.filter(p => p.id !== c.id);
    g.gate.inserted = g.gate.inserted.filter(s => s !== c.slot);
    note(r, `${c.name} left. Their lock was removed from the gate.`, '#ffab91', 4);
    checkGate(r);
    if (g.players.every(p => p.escaped)) endGame(r, true);
  }
  broadcastLobby(r);
}

// ---------------------------------------------------------------- game setup
function genZones(g, count, avoid) {
  const zones = [];
  for (let tries = 0; zones.length < count && tries < 2000; tries++) {
    const x = 2 + rand(COLS - 4), y = 2 + rand(ROWS - 4);
    if (g.grid[y][x] !== 0) continue;
    if (Math.abs(x - g.gate.x) + Math.abs(y - g.gate.y) < 5) continue;
    if (zones.some(z => Math.abs(z.x - x) + Math.abs(z.y - y) < 9)) continue;
    if (tries < 1500 && avoid.some(z => Math.abs(z.x - x) + Math.abs(z.y - y) < 5)) continue;
    zones.push({ x, y });
  }
  return zones;
}
function buildSafe(g, zones) {
  const s = new Uint8Array(COLS * ROWS);
  for (const z of zones) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
    if (g.grid[z.y + dy][z.x + dx] === 0) s[I(z.x + dx, z.y + dy)] = 1;
  return s;
}

function startGame(r) {
  const cl = [...r.clients.values()].sort((a, b) => a.slot - b.slot);
  const n = cl.length;
  const level = Sh.genLevel(r.map), grid = level.grid;
  const links = Sh.stairLinks(level.stairs);
  const open = (x, y) => grid[y][x] === 0;
  const dSpawn = bfs(level.spawns[0][0], level.spawns[0][1], open, links).d;

  // the gate: fixed by the map, or on the right or bottom outer wall, far from spawn
  let gate = level.gate;
  if (!gate) {
    const cands = [];
    for (let y = 1; y < ROWS - 1; y++) if (grid[y][COLS - 2] === 0) cands.push({ x: COLS - 1, y, ix: COLS - 2, iy: y });
    for (let x = 1; x < COLS - 1; x++) if (grid[ROWS - 2][x] === 0) cands.push({ x, y: ROWS - 1, ix: x, iy: ROWS - 2 });
    cands.sort((a, b) => dSpawn[I(b.ix, b.iy)] - dSpawn[I(a.ix, a.iy)]);
    gate = cands[rand(Math.min(6, cands.length))];
  }
  gate = Object.assign({}, gate, { open: false, inserted: [] });

  // keys: one per player, far from spawn and from each other
  const openTiles = [];
  const onStairs = new Set((level.flights || []).flatMap(f => Array.from({ length: f.y1 - f.y0 + 1 }, (_, i) => I(f.x, f.y0 + i))));
  for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) if (open(x, y) && !onStairs.has(I(x, y))) openTiles.push({ x, y }); // (no keys on the stairs)
  const maxD = Math.max(...dSpawn);
  const keyTiles = [], sep = n <= 4 ? 10 : n <= 8 ? 7 : 5; // more players, keys closer together
  for (let tries = 0; keyTiles.length < n && tries < 5000; tries++) {
    const t = openTiles[rand(openTiles.length)];
    const relax = tries > 3000 ? 0.5 : 1;
    if (dSpawn[I(t.x, t.y)] < maxD * 0.35 * relax) continue;
    if (Math.abs(t.x - gate.x) + Math.abs(t.y - gate.y) < 6 * relax) continue;
    if (keyTiles.some(k => Math.abs(k.x - t.x) + Math.abs(k.y - t.y) < sep * relax)) continue;
    keyTiles.push(t);
  }
  // fallback so a key is always placed: any free tile away from spawn
  for (const t of shuffleArr(openTiles.filter(t => dSpawn[I(t.x, t.y)] > 6))) {
    if (keyTiles.length >= n) break;
    if (!keyTiles.some(k => k.x === t.x && k.y === t.y)) keyTiles.push(t);
  }

  const now = Date.now();
  const g = {
    time: 0, caught: 0, grid, gate, floors: level.floors, stairs: level.stairs, links,
    stairAt: new Map(level.stairs.map(s => [I(s.x, s.y), s])),
    players: cl.map((c, i) => ({
      id: c.id, slot: c.slot, name: c.name, char: c.char, spawn: level.spawns[i],
      x: center(level.spawns[i][0]), y: center(level.spawns[i][1]), yaw: level.yaw ?? Sh.START_YAW,
      key: { x: keyTiles[i].x, y: keyTiles[i].y, state: 'hidden' }, // hidden | carried | inserted
      invuln: INVULN, safe: false, escaped: false, caught: 0, tpSeq: 0, lastPosT: now,
    })),
  };
  // entities: one per PLAYERS_PER_ENTITY players, starting far from spawn and from each other, waking up a few seconds apart
  const far = openTiles.filter(t => dSpawn[I(t.x, t.y)] > maxD * 0.6);
  g.entities = [];
  for (let i = 0, tries = 0; i < Sh.entityCount(n); tries++) {
    const et = far[rand(far.length)];
    if (tries < 500 && g.entities.some(e => dist(e, { x: center(et.x), y: center(et.y) }) < TILE * 10)) continue;
    g.entities.push({ id: i, x: center(et.x), y: center(et.y), speed: ENTITY_BASE, path: [], think: 0, stun: 4 + i * 3, target: null, targetDist: 99 });
    i++;
  }
  g.zoneCount = Math.min(6, Math.max(2, n));
  g.zones = genZones(g, g.zoneCount, []);
  g.safe = buildSafe(g, g.zones);
  g.nextZones = genZones(g, g.zoneCount, g.zones);
  g.zoneTimer = SAFE_INTERVAL;

  clearInterval(r.timer);
  r.game = g; r.state = 'play'; r.last = now;
  const roster = g.players.map(p => ({ id: p.id, name: p.name, slot: p.slot, char: p.char, x: p.x, y: p.y }));
  const deco = { flights: level.flights || [], rooms: level.rooms || [], furniture: level.furniture || [], doors: level.doors || [], forest: level.forest || null };
  for (const c of cl) send(c.ws, { t: 'start', you: c.id, grid, map: level.name, yaw: level.yaw ?? Sh.START_YAW, floors: level.floors, stairs: level.stairs, ...deco, gate: { x: gate.x, y: gate.y, ix: gate.ix, iy: gate.iy }, players: roster });
  broadcastLobby(r);
  note(r, 'Find YOUR key. Only you can see it. Bring it to the gate.', '#fff', 5);
  if (g.entities.length > 1) note(r, `${g.entities.length} entities are hunting you.`, '#ff5252', 5);
  r.timer = setInterval(() => tick(r), TICK_MS);
}

// ---------------------------------------------------------------- movement from clients
// Clients move themselves (so it feels instant) and the server sanity-checks each position.
function onPos(r, c, m) {
  const g = r.game, p = g.players.find(p => p.id === c.id);
  if (!p || p.escaped) return;
  if (Number.isFinite(m.a)) p.yaw = m.a % (Math.PI * 2); // where your headlight points, so others see which way you face
  if (m.s !== p.tpSeq) return;
  const x = Number(m.x), y = Number(m.y), now = Date.now();
  const dt = (now - p.lastPosT) / 1000;
  const allowed = PLAYER_SPEED * Math.max(dt, 0.05) * 1.6 + 10;
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x - p.x, y - p.y) > allowed || Sh.collides(g, x, y, PLAYER_R - 3)) {
    teleport(r, p, p.x, p.y);
    return;
  }
  p.x = x; p.y = y; p.lastPosT = now;
}
function teleport(r, p, x, y, a) { // `a`: face this way afterwards (used by stairs)
  p.x = x; p.y = y; p.tpSeq++; p.lastPosT = Date.now();
  const c = r.clients.get(p.id);
  if (c) send(c.ws, { t: 'tp', x, y, s: p.tpSeq, a });
}

// ---------------------------------------------------------------- simulation
function tick(r) {
  const g = r.game, now = Date.now();
  const dt = Math.min(0.1, (now - r.last) / 1000); r.last = now;
  g.time += dt;

  g.zoneTimer -= dt;
  if (g.zoneTimer <= 0) {
    g.zones = g.nextZones;
    g.safe = buildSafe(g, g.zones);
    g.nextZones = genZones(g, g.zoneCount, g.zones);
    g.zoneTimer += SAFE_INTERVAL;
    for (const E of g.entities) E.think = 0;
    note(r, 'Safe zones moved!', '#69f0ae', 2);
  }

  const gate = g.gate, gateC = { x: center(gate.x), y: center(gate.y) };
  for (const p of g.players) {
    if (p.escaped) continue;
    p.invuln = Math.max(0, p.invuln - dt);
    const t = tileOf(p);
    p.safe = !!g.safe[I(t.x, t.y)];
    const stair = g.stairAt.get(I(t.x, t.y));
    if (stair) { // walked onto a staircase: arrive next to the matching one on the other floor
      p.yaw = stair.a ?? p.yaw;
      teleport(r, p, center(stair.tx), center(stair.ty), stair.a);
      continue;
    }
    if (p.key.state === 'hidden' && dist(p, { x: center(p.key.x), y: center(p.key.y) }) < 26) {
      p.key.state = 'carried';
      note(r, `${p.name} found their key!`, Sh.COLORS[p.slot]);
    }
    if (p.key.state === 'carried' && dist(p, gateC) < TILE * 1.3) {
      p.key.state = 'inserted';
      gate.inserted.push(p.slot);
      note(r, `${p.name} unlocked a lock (${gate.inserted.length}/${g.players.length})`, Sh.COLORS[p.slot]);
      checkGate(r);
    }
    if (gate.open && t.x === gate.x && t.y === gate.y) {
      p.escaped = true;
      note(r, `${p.name} escaped!`, Sh.COLORS[p.slot]);
    }
  }

  updateEntities(r, dt);
  if (r.state !== 'play') return;
  if (g.players.every(p => p.escaped)) return endGame(r, true);
  sendSnapshots(r);
}

function checkGate(r) {
  const g = r.game;
  if (!g.gate.open && g.players.length && g.players.every(p => p.key.state === 'inserted')) {
    g.gate.open = true;
    note(r, 'THE GATE IS OPEN. ESCAPE!', '#ffd54f', 5);
  }
}

function entityThink(g, E) {
  const et = tileOf(E), ei = I(et.x, et.y);
  // the entity cannot enter safe zones (unless it's already standing in one when they move)
  const { d, par } = bfs(et.x, et.y, (x, y) => g.grid[y][x] === 0 && !g.safe[I(x, y)], g.links);
  let goal = -1, best = 1e9, bestScore = 1e9;
  E.target = null;
  for (const p of g.players) {
    if (p.escaped || p.invuln > 0 || p.safe) continue;
    const t = tileOf(p), i = I(t.x, t.y);
    if (d[i] < 0) continue;
    // prefer players no other entity is already hunting, so they spread out
    const taken = g.entities.some(o => o !== E && o.target === p && o.targetDist < d[i]);
    const score = d[i] + (taken ? 8 : 0);
    if (score < bestScore) { bestScore = score; best = d[i]; goal = i; E.target = p; }
  }
  E.targetDist = best;
  if (goal < 0) {
    // nobody catchable: lurk as close as possible to the nearest player
    const act = g.players.filter(p => !p.escaped).map(p => ({ ...tileOf(p), f: Sh.floorOf(g.floors, p.x) }));
    let bs = 1e9;
    for (let i = 0; i < d.length; i++) {
      if (d[i] < 0) continue;
      const x = i % COLS, y = (i / COLS) | 0;
      const f = Sh.floorOf(g.floors, center(x));
      for (const t of act) { const s = (x - t.x) ** 2 + (y - t.y) ** 2 + d[i] * 0.01 + (f !== t.f ? 1e4 : 0); if (s < bs) { bs = s; goal = i; } }
    }
  }
  const path = [];
  for (let c = goal; c !== -1 && c !== ei; c = par[c]) path.push({ x: c % COLS, y: (c / COLS) | 0 });
  path.reverse();
  if (path.length) {
    const nx = center(path[0].x), ny = center(path[0].y);
    if (Math.abs(E.x - nx) > 2 && Math.abs(E.y - ny) > 2) path.unshift(et); // re-center before turning
  }
  E.path = path;
}

function updateEntities(r, dt) {
  for (const E of r.game.entities) { updateEntity(r, E, dt); if (r.state !== 'play') return; }
}
function updateEntity(r, E, dt) {
  const g = r.game;
  if (E.stun > 0) { E.stun -= dt; return; }
  E.speed = Math.min(ENTITY_MAX, ENTITY_BASE + g.time * ENTITY_RAMP);
  E.think -= dt;
  if (E.think <= 0) { entityThink(g, E); E.think = 0.2; }

  const sp = E.speed * dt, T = E.target;
  if (T && E.targetDist <= 1 && !T.safe && !T.escaped && T.invuln <= 0 && g.players.includes(T) && Sh.floorOf(g.floors, T.x) === Sh.floorOf(g.floors, E.x)) {
    const dx = T.x - E.x, dy = T.y - E.y, l = Math.hypot(dx, dy) || 1;
    Sh.moveCircle(g, E, dx / l * sp, dy / l * sp, 10);
  } else if (E.path.length) {
    const nd = E.path[0], tx = center(nd.x), ty = center(nd.y);
    const dx = tx - E.x, dy = ty - E.y, l = Math.hypot(dx, dy);
    if (l <= sp || l > TILE * 1.6) { E.x = tx; E.y = ty; E.path.shift(); } // (a far step is a staircase: it jumps floors)
    else { E.x += dx / l * sp; E.y += dy / l * sp; }
  }

  for (const p of g.players) {
    if (p.escaped || p.safe || p.invuln > 0) continue;
    if (dist(p, E) < PLAYER_R + ENTITY_R - 3) { catchPlayer(r, p, E); if (r.state !== 'play') return; }
  }
}

function catchPlayer(r, p, E) {
  const g = r.game;
  g.caught++;
  p.caught++;
  if (p.key.state === 'carried') {
    const t = tileOf(p);
    p.key = { x: t.x, y: t.y, state: 'hidden' }; // dropped where they were caught
    note(r, `${p.name} was caught and dropped their key!`, '#ff5252');
  } else note(r, `${p.name} was caught!`, '#ff5252');
  p.invuln = INVULN;
  teleport(r, p, center(p.spawn[0]), center(p.spawn[1]));
  E.stun = 2; E.path = []; // only the one that caught you pauses...
  // ...and it vanishes into the dark, reappearing far from where you respawn, so it can't camp the spawn
  const { d } = bfs(p.spawn[0], p.spawn[1], (x, y) => g.grid[y][x] === 0, g.links);
  let maxD = 0; for (const v of d) if (v > maxD) maxD = v;
  const far = [];
  for (let i = 0; i < d.length; i++) if (d[i] > maxD * 0.5 && !g.safe[i]) far.push(i);
  if (far.length) { const i = far[rand(far.length)]; E.x = center(i % COLS); E.y = center((i / COLS) | 0); E.think = 0; }
}

function endGame(r, won) {
  clearInterval(r.timer); r.timer = null;
  const g = r.game;
  r.state = 'ended';
  sendSnapshots(r);
  broadcast(r, {
    t: 'end', won, time: g.time,
    locks: `${g.gate.inserted.length}/${g.players.length}`,
    stats: g.players.map(p => ({ name: p.name, slot: p.slot, caught: p.caught, escaped: p.escaped })),
  });
  broadcastLobby(r);
}

// Each player gets a personal snapshot: only THEIR key, and the entity only when it's within their light.
function sendSnapshots(r) {
  const g = r.game;
  const shared = {
    time: g.time, caught: g.caught, zt: g.zoneTimer, zones: g.zones, next: g.nextZones,
    gate: { open: g.gate.open, ins: g.gate.inserted },
    players: g.players.map(p => ({ id: p.id, x: Math.round(p.x), y: Math.round(p.y), a: Math.round(p.yaw * 100) / 100, safe: p.safe, inv: p.invuln > 0, esc: p.escaped, ks: p.key.state })),
  };
  for (const p of g.players) {
    const c = r.clients.get(p.id);
    if (!c) continue;
    const es = []; let danger = 0, chase = false;
    const pf = Sh.floorOf(g.floors, p.x);
    for (const E of g.entities) {
      const d = dist(p, E);
      if (p.escaped || Sh.floorOf(g.floors, E.x) !== pf) continue; // you only see and hear entities on your floor
      if (d < TILE * ENTITY_SEEN) es.push({ id: E.id, x: Math.round(E.x), y: Math.round(E.y), stun: E.stun > 0 });
      if (E.stun <= 0) danger = Math.max(danger, 1 - d / (TILE * 7));
      // an entity is hunting YOU and is close behind (path distance in tiles)
      if (E.target === p && E.stun <= 0 && E.targetDist <= 12) chase = true;
    }
    send(c.ws, { t: 's', ...shared, key: p.key, es, danger, chase });
  }
}

server.listen(PORT, () => {
  console.log(`Keybound server running on port ${PORT}`);
  console.log(`  On this computer:      http://localhost:${PORT}`);
  for (const u of lanUrls()) console.log(`  Same Wi-Fi / network:  ${u}`);
});
