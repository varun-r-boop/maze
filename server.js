// Keybound game server: serves the client and runs every room's game of freeze tag authoritatively.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const Sh = require('./public/shared.js');

const { TILE, COLS, ROWS, PLAYER_SPEED, PLAYER_R, MAX_PLAYERS, MIN_PLAYERS, TAGGER_SPEED, TAG_DIST, RESCUE_DIST, RESCUE_TIME,
  IMMUNE, HOLD, DANGER_DIST, ROUND_TIMES, ROUND_DEFAULT, TRAP_STEP, TRAP_COOLDOWN, NOISE_RADIUS, JUMP_T, JUMP_REST,
  SCULPT_TIME, HIDE_TIME, FIND_DIST, FIND_POINTS, FIND_BONUS, HIDDEN_POINTS } = Sh.C;
const { I, center, tileOf, dist, rand } = Sh;
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
const wss = new WebSocketServer({ server, maxPayload: 256 * 1024 }); // (big enough for a clay sculpture)

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
      const room = { code: genCode(), host: c.id, clients: new Map(), state: 'lobby', game: null, timer: null, map: 'building', roundTime: ROUND_DEFAULT, mode: 'tag' };
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
        if (r.clients.size < MIN_PLAYERS) return send(c.ws, { t: 'msg', text: `This needs at least ${MIN_PLAYERS} players.`, color: '#ffab91', dur: 3 });
        startGame(r);
      }
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
    case 'mode': // ...the game mode
      if (r && r.host === c.id && r.state !== 'play' && Sh.MODES.some(m2 => m2[0] === m.mode)) { r.mode = m.mode; broadcastLobby(r); }
      break;
    case 'sculpt': if (r && r.state === 'play') onSculpt(r, c, m); break; // hide clay
    case 'place': if (r && r.state === 'play') onPlace(r, c); break;
    case 'find': if (r && r.state === 'play') onFind(r, c); break;
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
  broadcast(r, { t: 'lobby', code: r.code, host: r.host, state: r.state, map: r.map, roundTime: r.roundTime, mode: r.mode, players });
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
    if (g.mode === 'clay') clayLeft(r, c.id); else checkWin(r);
  }
  broadcastLobby(r);
}

// ---------------------------------------------------------------- a round
function startGame(r) {
  const cl = [...r.clients.values()].sort((a, b) => a.slot - b.slot);
  const n = cl.length;
  const level = Sh.genLevel(r.map), grid = level.grid;
  const links = Sh.stairLinks(level.stairs);
  const reach = Sh.reach(level, level.spawns[0][0], level.spawns[0][1]), dSpawn = reach.d, N = reach.N;
  let maxD = 0; for (const v of dSpawn) if (v > maxD) maxD = v;

  // roles: random taggers; runners start at the map's spawn, taggers far away from them (and from each other)
  const clayMode = r.mode === 'clay';
  const taggers = new Set(clayMode ? [] : shuffleArr(cl.map(c => c.id)).slice(0, Sh.taggerCount(n)));
  const far = [];
  for (const k of [0.6, 0]) { // (anywhere reachable, if no spot is that far away; never on a staircase)
    reach.grids.forEach((gr, fl) => {
      for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) if (gr[y][x] === 0 && !reach.ramp[I(x, y)] && dSpawn[fl * N + I(x, y)] > maxD * k) far.push({ x, y, fl });
    });
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
    mode: clayMode ? 'clay' : 'tag', time: 0, roundTime: r.roundTime, grid, floors: level.floors, stairs: level.stairs, links, upper: level.upper || null, ramps: level.ramps || [],
    stairAt: new Map(level.stairs.map(s => [I(s.x, s.y), s])),
    players: cl.map(c => {
      const it = taggers.has(c.id), spot = it ? taggerSpots[taggerIdx++] : { x: level.spawns[runnerIdx][0], y: level.spawns[runnerIdx++][1] };
      return {
        id: c.id, slot: c.slot, name: c.name, char: c.char, role: clayMode ? 'clay' : it ? 'it' : 'run', score: 0, finds: 0, target: null,
        x: center(spot.x), y: center(spot.y), fl: spot.fl || 0, yaw: level.yaw ?? Sh.START_YAW, jumps: 0, airUntil: 0,
        frozen: false, immune: 0, rescue: 0, rescuer: null, tags: 0, saves: 0, timesFrozen: 0, tpSeq: 0, lastPosT: now,
      };
    }),
  };

  g.traps = clayMode ? [] : placeTraps(level, reach);
  if (clayMode) Object.assign(g, { phase: 'sculpt', phaseEnd: SCULPT_TIME + 3, sculpts: new Map(), objs: new Map(), spawns: level.spawns }); // (3s for the last sculptures to arrive)

  clearInterval(r.timer);
  r.game = g; r.state = 'play'; r.last = now;
  const roster = g.players.map(p => ({ id: p.id, name: p.name, slot: p.slot, char: p.char, role: p.role, x: p.x, y: p.y, fl: p.fl }));
  const deco = { flights: level.flights || [], rooms: level.rooms || [], furniture: level.furniture || [], doors: level.doors || [], forest: level.forest || null, office: level.office || null, mall: level.mall || null, bright: !!level.bright,
    upper: level.upper || null, ramps: level.ramps || [], library: level.library || null };
  for (const c of cl) send(c.ws, { t: 'start', you: c.id, grid, map: level.name, yaw: level.yaw ?? Sh.START_YAW, floors: level.floors, stairs: level.stairs, ...deco, players: roster, roundTime: g.roundTime, hold: HOLD, mode: g.mode, phase: g.phase, sculptTime: SCULPT_TIME, traps: g.traps.map(({ id, x, y, fl, kind }) => ({ id, x, y, fl, kind })) });
  broadcastLobby(r);
  const its = g.players.filter(p => p.role === 'it'), names = its.map(p => p.name).join(' and ');
  if (clayMode) note(r, 'Sculpt your clay! Then you will hide it, and hunt for someone else\'s.', '#ffe9a8', 5);
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
  // a jump (the client counts them): in the air for a moment, so you don't set off noise traps. Not while frozen.
  const now0 = Date.now();
  if (Number.isInteger(m.j) && m.j > p.jumps) {
    if (!p.frozen && now0 >= p.airUntil + JUMP_REST * 1000 - 100) p.airUntil = now0 + JUMP_T * 1000;
    p.jumps = m.j;
  }
  if (p.frozen || (p.role === 'it' && g.time < HOLD) || g.phase === 'sculpt') { if (Math.hypot(m.x - p.x, m.y - p.y) > 2) teleport(r, p, p.x, p.y); return; }
  const x = Number(m.x), y = Number(m.y), now = Date.now();
  const dt = (now - p.lastPosT) / 1000;
  const speed = PLAYER_SPEED * (p.role === 'it' ? TAGGER_SPEED : 1);
  const allowed = speed * Math.max(dt, 0.05) * 1.6 + 10;
  const fl = Number.isFinite(x) && Number.isFinite(y) ? Sh.nextFloor(g, x, y, p.fl) : p.fl; // walking up or down a staircase
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x - p.x, y - p.y) > allowed || Sh.collides(Sh.world(g, fl), x, y, PLAYER_R - 3)) {
    teleport(r, p, p.x, p.y);
    return;
  }
  p.x = x; p.y = y; p.fl = fl; p.lastPosT = now;
}
function teleport(r, p, x, y, a) { // `a`: face this way afterwards (used by stairs)
  p.x = x; p.y = y; p.tpSeq++; p.lastPosT = Date.now();
  const c = r.clients.get(p.id);
  if (c) send(c.ws, { t: 'tp', x, y, s: p.tpSeq, a, f: p.fl });
}

// ---------------------------------------------------------------- simulation
// on the same floor: in the library, within half a floor of each other (so two people half way up a staircase count)
const sameFloor = (g, a, b) => g.upper ? Math.abs(Sh.elev(g, a) - Sh.elev(g, b)) < 0.5 : Sh.floorOf(g.floors, a.x) === Sh.floorOf(g.floors, b.x);

function tick(r) {
  const g = r.game, now = Date.now();
  const dt = Math.min(0.1, (now - r.last) / 1000); r.last = now;
  const wasHold = g.time < HOLD;
  g.time += dt;
  if (wasHold && g.time >= HOLD && g.mode === 'tag') note(r, 'The taggers are coming!', '#ff5252', 2.5);

  for (const p of g.players) {
    p.immune = Math.max(0, p.immune - dt);
    if (p.frozen) continue;
    const t = tileOf(p), stair = g.stairAt.get(I(t.x, t.y));
    if (stair) { // walked onto a staircase: arrive next to the matching one on the other floor
      p.yaw = stair.a ?? p.yaw;
      teleport(r, p, center(stair.tx), center(stair.ty), stair.a);
    }
  }

  if (g.mode === 'clay') { clayTick(r, dt); if (r.state === 'play') sendSnapshots(r); return; }
  const runners = g.players.filter(p => p.role === 'run'), its = g.players.filter(p => p.role === 'it');
  stepOnTraps(r, runners, dt);
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

// ---------------------------------------------------------------- noise traps
// Noisy things scattered over the floor (every floor of the library), never near where the runners start, never
// on stairs, and spread out. About one for every 45 free tiles, between 8 and 18 (up to 26 with two floors).
function placeTraps(level, reach) {
  const kinds = Sh.MAP_TRAPS[level.name] || Sh.MAP_TRAPS.building;
  const stairs = new Set([...(level.flights || []).flatMap(f => Array.from({ length: f.y1 - f.y0 + 1 }, (_, i) => I(f.x, f.y0 + i))), ...level.stairs.map(s => I(s.x, s.y))]);
  const cands = [];
  reach.grids.forEach((gr, fl) => {
    for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++)
      if (gr[y][x] === 0 && reach.d[fl * reach.N + I(x, y)] >= 6 && !stairs.has(I(x, y)) && !reach.ramp[I(x, y)]) cands.push({ x, y, fl });
  });
  const n = Math.max(8, Math.min(8 + 10 * reach.grids.length, Math.round(cands.length / 45))), traps = [];
  for (const t of shuffleArr(cands)) {
    if (traps.length >= n) break;
    if (traps.some(o => o.fl === t.fl && Math.abs(o.x - t.x) + Math.abs(o.y - t.y) < 4)) continue;
    traps.push({ id: traps.length, x: t.x, y: t.y, fl: t.fl, kind: kinds[rand(kinds.length)], cd: 0 });
  }
  return traps;
}

// a free runner stepping right onto a trap sets it off: everyone close enough on the same floor hears it
function stepOnTraps(r, runners, dt) {
  const g = r.game;
  for (const t of g.traps) {
    t.cd = Math.max(0, t.cd - dt);
    if (t.cd > 0) continue;
    const spot = { x: center(t.x), y: center(t.y), fl: t.fl }, now = Date.now();
    const p = runners.find(p => !p.frozen && now >= p.airUntil && sameFloor(g, p, spot) && dist(p, spot) <= TRAP_STEP); // (jump over it and it stays quiet)
    if (!p) continue;
    t.cd = TRAP_COOLDOWN;
    for (const o of g.players) {
      const c = r.clients.get(o.id);
      if (!c || (o !== p && (!sameFloor(g, o, spot) || dist(o, spot) > NOISE_RADIUS * TILE))) continue;
      send(c.ws, { t: 'noise', id: t.id, x: spot.x, y: spot.y, f: t.fl, kind: t.kind, me: o === p });
    }
  }
}

// taggers win when every runner is frozen; runners win if anyone's still free when time runs out
function checkWin(r) {
  if (r.state !== 'play') return;
  const g = r.game, runners = g.players.filter(p => p.role === 'run');
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
    time: g.time, tc: g.traps.filter(t => t.cd > 0).map(t => t.id), // traps that just went off
    players: g.players.map(p => ({
      id: p.id, x: Math.round(p.x), y: Math.round(p.y), a: Math.round(p.yaw * 100) / 100,
      fz: p.frozen, imm: p.immune > 0, rp: Math.round(p.rescue * 100) / 100, tags: p.tags, f: p.fl, j: p.jumps, sc: Math.floor(p.score),
    })),
  };
  if (g.mode === 'clay') Object.assign(shared, { ph: g.phase, left: Math.max(0, Math.round((g.phaseEnd - g.time) * 10) / 10) });
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

// ---------------------------------------------------------------- hide clay
// 1. sculpt: everyone sculpts a lump of clay (on their own device) and sends it in.
// 2. hide: everyone walks the map, unseen by the others, and puts their sculpture down somewhere.
// 3. hunt: everyone goes back to the start and is given someone else's sculpture to find. Find it to score (more the
//    sooner); then you're given another. Your own sculpture scores for you every second it stays hidden.
const clayOwner = (g, id) => g.players.find(p => p.id === id);
function onSculpt(r, c, m) {
  const g = r.game;
  if (g.mode !== 'clay' || g.phase !== 'sculpt' || !g.players.some(p => p.id === c.id)) return;
  const n = m.n, ok = Number.isInteger(n) && n > 0 && n <= 20000 && typeof m.pos === 'string' && typeof m.col === 'string'
    && Math.abs(m.pos.length - Math.ceil(n * 6 / 3) * 4) <= 4 && Math.abs(m.col.length - Math.ceil(n / 3) * 4) <= 4;
  if (!ok) return;
  g.sculpts.set(c.id, { n, pos: m.pos, col: m.col });
  broadcast(r, { t: 'cs', done: g.sculpts.size, total: g.players.length });
}
// where a sculpture goes down: just in front of you if that's open floor, otherwise at your feet. Never on the stairs.
function dropSpot(g, p) {
  const w = Sh.world(g, p.fl), fx = p.x + Math.cos(p.yaw) * TILE * 0.45, fy = p.y + Math.sin(p.yaw) * TILE * 0.45;
  const free = (x, y) => !Sh.solid(w, Math.floor(x / TILE), Math.floor(y / TILE)) && !(g.upper && Sh.rampAt(g.ramps, x, y));
  if (free(fx, fy)) return { x: Math.round(fx), y: Math.round(fy), fl: p.fl };
  if (free(p.x, p.y)) return { x: Math.round(p.x), y: Math.round(p.y), fl: p.fl };
  // on a staircase: the nearest bit of open floor on the floor you're on
  let best = null;
  for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) if (free(center(x), center(y))) {
    const d = Math.hypot(center(x) - p.x, center(y) - p.y);
    if (!best || d < best.d) best = { d, x: center(x), y: center(y) };
  }
  return { x: best.x, y: best.y, fl: p.fl };
}
function onPlace(r, c) {
  const g = r.game, p = clayOwner(g, c.id);
  if (g.mode !== 'clay' || g.phase !== 'hide' || !p) return;
  const o = dropSpot(g, p);
  g.objs.set(p.id, { ...o, found: false, by: null, hidden: 0 });
  send(c.ws, { t: 'placed', ...o });
}
function beginHide(r) {
  const g = r.game;
  g.phase = 'hide'; g.phaseEnd = g.time + HIDE_TIME;
  broadcast(r, { t: 'phase', phase: 'hide', left: HIDE_TIME, objs: g.players.map(p => ({ id: p.id, data: g.sculpts.get(p.id) || null })) });
  note(r, 'Hide your sculpture! Walk somewhere sneaky and press F (or the button) to put it down. Nobody can see you.', '#ffe9a8', 6);
}
// a new sculpture for `p` to hunt: one that hasn't been found yet and isn't theirs
function newTarget(r, p) {
  const g = r.game, left = [...g.objs.entries()].filter(([id, o]) => id !== p.id && !o.found).map(([id]) => id);
  p.target = left.length ? left[rand(left.length)] : null;
  const c = r.clients.get(p.id);
  if (c) send(c.ws, { t: 'target', id: p.target });
}
function beginHunt(r) {
  const g = r.game;
  for (const p of g.players) if (!g.objs.has(p.id)) g.objs.set(p.id, { ...dropSpot(g, p), found: false, by: null, hidden: 0 }); // not hidden in time: it stays where they are
  g.phase = 'hunt'; g.phaseEnd = g.time + g.roundTime;
  g.players.forEach((p, i) => { const s = g.spawns[i % g.spawns.length]; p.fl = 0; teleport(r, p, center(s[0]), center(s[1])); }); // everyone back to the start
  broadcast(r, { t: 'phase', phase: 'hunt', left: g.roundTime, objs: [...g.objs.entries()].map(([id, o]) => ({ id, x: o.x, y: o.y, fl: o.fl })) });
  // everyone hunts someone else's sculpture (shuffled so nobody gets their own)
  const ids = g.players.map(p => p.id);
  let order;
  do order = shuffleArr(ids.slice()); while (ids.length > 1 && order.some((id, i) => id === ids[i]));
  g.players.forEach((p, i) => { p.target = order[i] === p.id ? null : order[i]; const c = r.clients.get(p.id); if (c) send(c.ws, { t: 'target', id: p.target }); });
  note(r, 'Hunt! Find the sculpture shown at the top of your screen.', '#69f0ae', 4);
}
function onFind(r, c) {
  const g = r.game, p = clayOwner(g, c.id);
  if (g.mode !== 'clay' || g.phase !== 'hunt' || !p || !p.target) return;
  const o = g.objs.get(p.target), owner = clayOwner(g, p.target);
  if (!o || o.found || !sameFloor(g, p, o) || dist(p, o) > FIND_DIST * TILE + 8) return;
  const pts = FIND_POINTS + Math.round(FIND_BONUS * Math.max(0, g.phaseEnd - g.time) / g.roundTime);
  o.found = true; o.by = p.id; p.score += pts; p.finds++;
  broadcast(r, { t: 'found', by: p.id, owner: p.target, pts });
  note(r, `${p.name} found ${owner ? owner.name + "'s" : 'a'} sculpture! +${pts}`, '#69f0ae', 3);
  const foundId = p.target;
  for (const q of g.players) if (q.target === foundId) newTarget(r, q); // (anyone else hunting it gets a new one too)
}
function clayTick(r, dt) {
  const g = r.game;
  if (g.phase === 'sculpt' && (g.time >= g.phaseEnd || g.players.every(p => g.sculpts.has(p.id)))) beginHide(r);
  else if (g.phase === 'hide' && g.time >= g.phaseEnd) beginHunt(r);
  else if (g.phase === 'hunt') {
    for (const [id, o] of g.objs) if (!o.found) { o.hidden += dt; const p = clayOwner(g, id); if (p) p.score += HIDDEN_POINTS * dt; }
    const unfound = [...g.objs.values()].filter(o => !o.found).length;
    if (!unfound) endClay(r, 'Every sculpture was found!');
    else if (g.time >= g.phaseEnd) endClay(r, `Time's up with ${unfound} sculpture${unfound > 1 ? 's' : ''} still hidden.`);
    else if (g.players.every(p => !p.target)) endClay(r, 'Nobody has anything left to find.');
  }
}
function clayLeft(r, id) {
  const g = r.game;
  g.sculpts.delete(id); g.objs.delete(id);
  if (g.players.length < MIN_PLAYERS) return endClay(r, 'Not enough players left.');
  if (g.phase === 'hunt') for (const q of g.players) if (q.target === id) newTarget(r, q);
  broadcast(r, { t: 'gone', id }); // (their sculpture goes with them)
}
function endClay(r, reason) {
  clearInterval(r.timer); r.timer = null;
  const g = r.game;
  r.state = 'ended';
  sendSnapshots(r);
  const best = Math.max(...g.players.map(p => p.score));
  broadcast(r, {
    t: 'end', mode: 'clay', winner: g.players.filter(p => p.score === best).map(p => p.id), reason, time: g.time,
    stats: g.players.map(p => { const o = g.objs.get(p.id), by = o && o.by && clayOwner(g, o.by); return { id: p.id, name: p.name, slot: p.slot, score: Math.floor(p.score), finds: p.finds, hidden: Math.round(o ? o.hidden : 0), foundBy: by ? by.name : null }; }),
    objs: [...g.objs.entries()].map(([id, o]) => ({ id, x: o.x, y: o.y, fl: o.fl })),
  });
  broadcastLobby(r);
}

server.listen(PORT, () => {
  console.log(`Keybound server running on port ${PORT}`);
  console.log(`  On this computer:      http://localhost:${PORT}`);
  for (const u of lanUrls()) console.log(`  Same Wi-Fi / network:  ${u}`);
});
