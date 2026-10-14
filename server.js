// Keybound game server: serves the client and runs every room's game of freeze tag authoritatively.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const Sh = require('./public/shared.js');

const { TILE, COLS, ROWS, PLAYER_SPEED, PLAYER_R, MAX_PLAYERS, MIN_PLAYERS, TAGGER_SPEED, TAG_DIST, RESCUE_DIST, RESCUE_TIME,
  IMMUNE, HOLD, DANGER_DIST, ROUND_TIMES, ROUND_DEFAULT } = Sh.C;
const { I, center, tileOf, dist, rand, bfs } = Sh;
const PORT = Number(process.env.PORT) || 3000;
const TICK_MS = 50;

// ---------------------------------------------------------------- static files
const PUB = path.join(__dirname, 'public');
const THREE_DIR = path.join(__dirname, 'node_modules', 'three', 'build');
const ADDONS_DIR = path.join(__dirname, 'node_modules', 'three', 'examples', 'jsm'); // rounded shapes, post-processing
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
  if (p === '/') p = '/index.html';
  // Three.js (for the first- and third-person views) is served straight from node_modules
  const vendor = p.startsWith('/vendor/three/'), addons = p.startsWith('/vendor/three-addons/');
  const base = vendor ? THREE_DIR : addons ? ADDONS_DIR : PUB;
  const file = path.join(base, path.normalize(vendor ? p.slice('/vendor/three'.length) : addons ? p.slice('/vendor/three-addons'.length) : p));
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
function tell(r, p, text, color = '#fff', t = 3) { const c = r.clients.get(p.id); if (c) send(c.ws, { t: 'msg', text, color, dur: t }); }
const CHARS = ['man', 'woman']; // characters players can pick
const cleanChar = ch => CHARS.includes(ch) ? ch : 'man';
function shuffleArr(a) { for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function cleanName(n) { return String(n || '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 14) || 'Player'; }
function genCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c; do c = Array.from({ length: 4 }, () => A[rand(A.length)]).join(''); while (rooms.has(c));
  return c;
}

wss.on('connection', ws => {
  const client = { id: nextId++, ws, name: 'Player', char: 'man', room: null, slot: -1 };
  ws.on('message', raw => { let m; try { m = JSON.parse(raw); } catch { return; } if (m && typeof m === 'object') handle(client, m); });
  ws.on('close', () => leave(client));
});

function handle(c, m) {
  const r = c.room;
  switch (m.t) {
    case 'create': {
      if (r) return;
      const room = { code: genCode(), host: c.id, clients: new Map(), state: 'lobby', game: null, timer: null, map: 'building', roundTime: ROUND_DEFAULT };
      rooms.set(room.code, room);
      c.char = cleanChar(m.char);
      join(c, room, m.name);
      break;
    }
    case 'join': {
      if (r) return;
      const room = rooms.get(String(m.code || '').toUpperCase().trim());
      if (!room) return send(c.ws, { t: 'error', msg: 'Room not found. Check the code.' });
      if (room.state === 'play') return send(c.ws, { t: 'error', msg: 'That round is in progress. Try again when it ends.' });
      if (room.clients.size >= MAX_PLAYERS) return send(c.ws, { t: 'error', msg: `That room is full (${MAX_PLAYERS} players max).` });
      c.char = cleanChar(m.char);
      join(c, room, m.name);
      break;
    }
    case 'start':
      if (r && r.host === c.id && r.state !== 'play') {
        if (r.clients.size < MIN_PLAYERS && r.clients.size !== 1) return send(c.ws, { t: 'msg', text: `Freeze tag needs at least ${MIN_PLAYERS} players.`, color: '#ffab91', dur: 3 });
        startGame(r); // on your own you just explore the map

      }
      break;
    case 'lobby': // back to the lobby after a round, or out of exploring on your own
      if (r && r.host === c.id && (r.state === 'ended' || (r.state === 'play' && r.game.explore))) {
        clearInterval(r.timer); r.timer = null;
        r.state = 'lobby'; r.game = null; broadcastLobby(r);
      }
      break;
    case 'pos':
      if (r && r.state === 'play') onPos(r, c, m);
      break;
    case 'map': // the host picks the map in the lobby
      if (r && r.host === c.id && r.state !== 'play' && Sh.MAPS.some(m2 => m2[0] === m.map)) { r.map = m.map; broadcastLobby(r); }
      break;
    case 'time': // ...and how long a round lasts
      if (r && r.host === c.id && r.state !== 'play' && ROUND_TIMES.includes(m.time)) { r.roundTime = m.time; broadcastLobby(r); }
      break;
    case 'char': // switch character (not mid-round)
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
  broadcast(r, { t: 'lobby', code: r.code, host: r.host, state: r.state, map: r.map, roundTime: r.roundTime, players });
}

function leave(c) {
  const r = c.room;
  if (!r) return;
  r.clients.delete(c.id);
  c.room = null;
  if (!r.clients.size) { clearInterval(r.timer); rooms.delete(r.code); return; }
  if (r.host === c.id) r.host = r.clients.keys().next().value;
  if (r.state === 'play') {
    const g = r.game, p = g.players.find(p => p.id === c.id);
    g.players = g.players.filter(p => p.id !== c.id);
    if (p) note(r, `${p.name} left the round.`, '#ffab91', 3);
    checkWin(r);
  }
  broadcastLobby(r);
}

// ---------------------------------------------------------------- a round
function startGame(r) {
  const cl = [...r.clients.values()].sort((a, b) => a.slot - b.slot);
  const n = cl.length, explore = n === 1; // alone: no taggers and no clock, just a map to walk around
  const level = Sh.genLevel(r.map), grid = level.grid;
  const links = Sh.stairLinks(level.stairs);
  const open = (x, y) => grid[y][x] === 0;
  const dSpawn = bfs(level.spawns[0][0], level.spawns[0][1], open, links).d;
  let maxD = 0; for (const v of dSpawn) if (v > maxD) maxD = v;

  // roles: random taggers; runners start at the map's spawn, taggers far away from them (and from each other)
  const taggers = new Set(explore ? [] : shuffleArr(cl.map(c => c.id)).slice(0, Sh.taggerCount(n)));
  const far = [];
  for (const k of [0.6, 0]) { // (anywhere reachable, if no spot is that far away)
    for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) if (open(x, y) && dSpawn[I(x, y)] > maxD * k) far.push({ x, y });
    if (far.length) break;
  }
  const taggerSpots = [];
  for (let tries = 0; taggerSpots.length < taggers.size; tries++) {
    const t = far[rand(far.length)];
    if (tries < 500 && taggerSpots.some(s => Math.abs(s.x - t.x) + Math.abs(s.y - t.y) < 8)) continue;
    taggerSpots.push(t);
  }

  const now = Date.now();
  let runnerIdx = 0, taggerIdx = 0;
  const g = {
    time: 0, roundTime: r.roundTime, explore, grid, floors: level.floors, stairs: level.stairs, links,
    stairAt: new Map(level.stairs.map(s => [I(s.x, s.y), s])),
    players: cl.map(c => {
      const it = taggers.has(c.id), spot = it ? taggerSpots[taggerIdx++] : { x: level.spawns[runnerIdx][0], y: level.spawns[runnerIdx++][1] };
      return {
        id: c.id, slot: c.slot, name: c.name, char: c.char, role: it ? 'it' : 'run',
        x: center(spot.x), y: center(spot.y), yaw: level.yaw ?? Sh.START_YAW,
        frozen: false, immune: 0, rescue: 0, rescuer: null, tags: 0, saves: 0, timesFrozen: 0, tpSeq: 0, lastPosT: now,
      };
    }),
  };

  clearInterval(r.timer);
  r.game = g; r.state = 'play'; r.last = now;
  const roster = g.players.map(p => ({ id: p.id, name: p.name, slot: p.slot, char: p.char, role: p.role, x: p.x, y: p.y }));
  const deco = { flights: level.flights || [], rooms: level.rooms || [], furniture: level.furniture || [], doors: level.doors || [], forest: level.forest || null, office: level.office || null };
  for (const c of cl) send(c.ws, { t: 'start', you: c.id, grid, map: level.name, yaw: level.yaw ?? Sh.START_YAW, floors: level.floors, stairs: level.stairs, ...deco, players: roster, roundTime: g.roundTime, hold: HOLD, explore });
  broadcastLobby(r);
  const its = g.players.filter(p => p.role === 'it'), names = its.map(p => p.name).join(' and ');
  if (explore) tell(r, g.players[0], 'Exploring on your own: no taggers, no clock. Invite friends to play freeze tag.', '#69f0ae', 5);
  else for (const p of g.players) {
    if (p.role === 'it') tell(r, p, `You're IT${its.length > 1 ? ` (with ${its.filter(o => o !== p).map(o => o.name).join(', ')})` : ''}! Freeze every runner before time runs out.`, '#ff5252', 5);
    else tell(r, p, `${names} ${its.length > 1 ? 'are' : 'is'} IT! Run. Unfreeze frozen friends by standing next to them.`, '#69f0ae', 5);
  }
  r.timer = setInterval(() => tick(r), TICK_MS);
}

// ---------------------------------------------------------------- movement from clients
// Clients move themselves (so it feels instant) and the server sanity-checks each position.
// Frozen runners, and taggers during the head start, can't move.
function onPos(r, c, m) {
  const g = r.game, p = g.players.find(p => p.id === c.id);
  if (!p) return;
  if (Number.isFinite(m.a)) p.yaw = m.a % (Math.PI * 2); // which way you face (and your headlight points)
  if (m.s !== p.tpSeq) return;
  if (p.frozen || (p.role === 'it' && g.time < HOLD)) { if (Math.hypot(m.x - p.x, m.y - p.y) > 2) teleport(r, p, p.x, p.y); return; }
  const x = Number(m.x), y = Number(m.y), now = Date.now();
  const dt = (now - p.lastPosT) / 1000;
  const speed = PLAYER_SPEED * (p.role === 'it' ? TAGGER_SPEED : 1);
  const allowed = speed * Math.max(dt, 0.05) * 1.6 + 10;
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
const sameFloor = (g, a, b) => Sh.floorOf(g.floors, a.x) === Sh.floorOf(g.floors, b.x);

function tick(r) {
  const g = r.game, now = Date.now();
  const dt = Math.min(0.1, (now - r.last) / 1000); r.last = now;
  const wasHold = g.time < HOLD;
  g.time += dt;
  if (wasHold && g.time >= HOLD) note(r, 'The taggers are coming!', '#ff5252', 2.5);

  for (const p of g.players) {
    p.immune = Math.max(0, p.immune - dt);
    if (p.frozen) continue;
    const t = tileOf(p), stair = g.stairAt.get(I(t.x, t.y));
    if (stair) { // walked onto a staircase: arrive next to the matching one on the other floor
      p.yaw = stair.a ?? p.yaw;
      teleport(r, p, center(stair.tx), center(stair.ty), stair.a);
    }
  }

  const runners = g.players.filter(p => p.role === 'run'), its = g.players.filter(p => p.role === 'it');
  // taggers freeze any free runner they touch
  if (g.time >= HOLD) for (const T of its) for (const p of runners) {
    if (p.frozen || p.immune > 0 || !sameFloor(g, T, p) || dist(T, p) > TAG_DIST) continue;
    p.frozen = true; p.rescue = 0; p.timesFrozen++; T.tags++;
    teleport(r, p, p.x, p.y); // pin them where they were tagged
    note(r, `${T.name} froze ${p.name}!`, '#7fd4ff');
  }
  // a free runner standing next to a frozen one thaws them out, bit by bit
  for (const p of runners) {
    if (!p.frozen) continue;
    const helper = runners.find(o => !o.frozen && sameFloor(g, o, p) && dist(o, p) <= RESCUE_DIST);
    p.rescuer = helper ? helper.id : null;
    p.rescue = helper ? p.rescue + dt / RESCUE_TIME : Math.max(0, p.rescue - dt / RESCUE_TIME);
    if (p.rescue >= 1) {
      p.frozen = false; p.rescue = 0; p.rescuer = null; p.immune = IMMUNE; helper.saves++;
      note(r, `${helper.name} unfroze ${p.name}!`, '#69f0ae');
    }
  }
  checkWin(r);
  if (r.state === 'play') sendSnapshots(r);
}

// taggers win when every runner is frozen; runners win if anyone's still free when time runs out
function checkWin(r) {
  if (r.state !== 'play') return;
  const g = r.game, runners = g.players.filter(p => p.role === 'run');
  if (g.explore) return; // nothing to win; it lasts until you go back to the lobby or leave
  if (!g.players.some(p => p.role === 'it')) return endGame(r, 'run', 'The taggers left.');
  if (!runners.length) return endGame(r, 'it', 'All the runners left.');
  if (runners.every(p => p.frozen)) return endGame(r, 'it', 'Every runner is frozen.');
  if (g.time >= g.roundTime) {
    const free = runners.filter(p => !p.frozen).length;
    endGame(r, 'run', `Time's up with ${free} runner${free > 1 ? 's' : ''} still free.`);
  }
}

function endGame(r, winner, reason) {
  clearInterval(r.timer); r.timer = null;
  const g = r.game;
  r.state = 'ended';
  sendSnapshots(r);
  broadcast(r, {
    t: 'end', winner, reason, time: Math.min(g.time, g.roundTime),
    stats: g.players.map(p => ({ name: p.name, slot: p.slot, role: p.role, tags: p.tags, saves: p.saves, timesFrozen: p.timesFrozen, frozen: p.frozen })),
  });
  broadcastLobby(r);
}

// Everyone gets everyone's position (the clients decide what you can actually see); runners also get
// `danger`: how close the nearest tagger on their floor is, for the heartbeat and the chase music.
function sendSnapshots(r) {
  const g = r.game;
  const shared = {
    time: g.time,
    players: g.players.map(p => ({
      id: p.id, x: Math.round(p.x), y: Math.round(p.y), a: Math.round(p.yaw * 100) / 100,
      fz: p.frozen, imm: p.immune > 0, rp: Math.round(p.rescue * 100) / 100, tags: p.tags,
    })),
  };
  for (const p of g.players) {
    const c = r.clients.get(p.id);
    if (!c) continue;
    let danger = 0;
    if (p.role === 'run' && !p.frozen) for (const T of g.players) {
      if (T.role !== 'it' || !sameFloor(g, T, p) || g.time < HOLD) continue;
      danger = Math.max(danger, 1 - dist(T, p) / (TILE * DANGER_DIST));
    }
    send(c.ws, { t: 's', ...shared, danger, chase: danger > 0.45 });
  }
}

server.listen(PORT, () => {
  console.log(`Keybound server running on port ${PORT}`);
  console.log(`  On this computer:      http://localhost:${PORT}`);
  for (const u of lanUrls()) console.log(`  Same Wi-Fi / network:  ${u}`);
});
