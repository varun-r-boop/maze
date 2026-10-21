// Keybound game server: serves the client and runs every room's game of freeze tag authoritatively.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const Sh = require('./public/shared.js');

const { TILE, COLS, ROWS, PLAYER_SPEED, PLAYER_R, MAX_PLAYERS, MIN_PLAYERS, TAGGER_SPEED, TAG_DIST, RESCUE_DIST,
  IMMUNE, HOLD, ACT_COOLDOWN, DANGER_DIST, ROUND_TIMES, ROUND_DEFAULT, TRAP_STEP, TRAP_COOLDOWN, NOISE_RADIUS, JUMP_T, JUMP_REST,
  SCULPT_TIME, HIDE_TIME, FIND_DIST, FIND_POINTS, FIND_BONUS, HIDDEN_POINTS, KEY_DIST, GATE_DIST, CATCH_DIST, BOT_SPEED, BOT_SPEED_END, ZONE_R, ZONE_TIME } = Sh.C;
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
      c.char = cleanChar(m.char); c.fighter = m.fighter;
      join(c, room, m.name);
      break;
    }
    case 'join': {
      if (r) return;
      const room = rooms.get(String(m.code || '').toUpperCase().trim());
      if (!room) return send(c.ws, { t: 'error', msg: 'Room not found. Check the code.' });
      if (room.state === 'play') return send(c.ws, { t: 'error', msg: 'That round is in progress. Try again when it ends.' });
      if (room.clients.size >= MAX_PLAYERS) return send(c.ws, { t: 'error', msg: `That room is full (${MAX_PLAYERS} players max).` });
      c.char = cleanChar(m.char); c.fighter = m.fighter;
      join(c, room, m.name);
      break;
    }
    case 'start':
      if (r && r.host === c.id && r.state !== 'play') {
        if (r.clients.size < MIN_PLAYERS && r.clients.size !== 1) return send(c.ws, { t: 'msg', text: `This needs at least ${MIN_PLAYERS} players.`, color: '#ffab91', dur: 3 });
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
    case 'act': // left click / Space / the on-screen button: tag a runner, or unfreeze a friend
      if (r && r.state === 'play') onAct(r, c);
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
    case 'fighter': c.fighter = m.f; break; // arena fights: the fighter you made (used from the next round)
    case 'fx': if (r && r.state === 'play') onFx(r, c, m); break; // ...a punch, kick, dodge or special
    case 'blk': if (r && r.state === 'play') onBlock(r, c, m); break; // ...block held down or let go
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
    if (g.mode === 'clay') clayLeft(r, c.id); else if (g.mode === 'fight') fightLeft(r, c.id); else { if (g.mode === 'escape') g.keys.delete(c.id); checkWin(r); }
  }
  broadcastLobby(r);
}

// ---------------------------------------------------------------- a round
function startGame(r) {
  const cl = [...r.clients.values()].sort((a, b) => a.slot - b.slot);
  const n = cl.length, explore = n === 1 && r.mode !== 'escape'; // alone: no taggers and no clock, just a map to walk around (key escape you can play alone, against the bot)
  const fightMode = r.mode === 'fight' && !explore;
  const level = Sh.genLevel(r.mode === 'fight' ? 'arena' : r.map), grid = level.grid; // (alone with arena fights picked, you explore the arena)
  const links = Sh.stairLinks(level.stairs);
  const reach = Sh.reach(level, level.spawns[0][0], level.spawns[0][1]), dSpawn = reach.d, N = reach.N;
  let maxD = 0; for (const v of dSpawn) if (v > maxD) maxD = v;

  // roles: random taggers; runners start at the map's spawn, taggers far away from them (and from each other)
  const clayMode = r.mode === 'clay' && !explore; // (on your own you explore, whichever mode is picked)
  const escMode = r.mode === 'escape'; // (everyone runs; bots do the chasing)
  const taggers = new Set(explore || clayMode || fightMode || escMode ? [] : shuffleArr(cl.map(c => c.id)).slice(0, Sh.taggerCount(n)));
  const far = [];
  for (const k of [0.6, 0]) { // (anywhere reachable, if no spot is that far away; never on a staircase)
    reach.grids.forEach((gr, fl) => {
      for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) if (gr[y][x] === 0 && !reach.ramp[I(x, y)] && dSpawn[fl * N + I(x, y)] > maxD * k) far.push({ x, y, fl });
    });
    if (far.length) break;
  }
  const taggerSpots = [], hunters = escMode ? Sh.botCount(n) : taggers.size; // (in key escape: where the bots start)
  for (let tries = 0; taggerSpots.length < hunters; tries++) {
    const t = far[rand(far.length)];
    if (tries < 500 && taggerSpots.some(s => Math.abs(s.x - t.x) + Math.abs(s.y - t.y) < 8)) continue;
    taggerSpots.push(t);
  }

  const now = Date.now();
  let runnerIdx = 0, taggerIdx = 0;
  const g = {
    mode: clayMode ? 'clay' : fightMode ? 'fight' : escMode ? 'escape' : 'tag', time: 0, roundTime: r.roundTime, explore, grid, floors: level.floors, stairs: level.stairs, links, upper: level.upper || null, ramps: level.ramps || [],
    stairAt: new Map(level.stairs.map(s => [I(s.x, s.y), s])),
    players: cl.map(c => {
      const it = taggers.has(c.id), spot = it ? taggerSpots[taggerIdx++] : { x: level.spawns[runnerIdx][0], y: level.spawns[runnerIdx++][1] };
      return {
        id: c.id, slot: c.slot, name: c.name, char: c.char, role: clayMode ? 'clay' : fightMode ? 'fan' : it ? 'it' : 'run', score: 0, finds: 0, target: null,
        fighter: Sh.cleanFighter(c.fighter, c.slot), hp: Sh.FIGHT.HP, meter: 0, act: null, block: false, mwins: 0,
        x: center(spot.x), y: center(spot.y), fl: spot.fl || 0, yaw: level.yaw ?? Sh.START_YAW, jumps: 0, airUntil: 0,
        frozen: false, immune: 0, nextAct: 0, tags: 0, saves: 0, timesFrozen: 0, tpSeq: 0, lastPosT: now, hasKey: false, unlocked: false, escaped: false, escapedAt: 0,
      };
    }),
  };

  g.traps = clayMode || escMode || level.name === 'arena' ? [] : placeTraps(level, reach);
  if (fightMode) Object.assign(g, { arena: level.arena, spawns: level.spawns, beams: [] });
  if (escMode) setupEscape(g, level, reach, taggerSpots);
  if (clayMode) Object.assign(g, { phase: 'sculpt', phaseEnd: SCULPT_TIME + 3, sculpts: new Map(), objs: new Map(), spawns: level.spawns }); // (3s for the last sculptures to arrive)

  clearInterval(r.timer);
  r.game = g; r.state = 'play'; r.last = now;
  const roster = g.players.map(p => ({ id: p.id, name: p.name, slot: p.slot, char: p.char, role: p.role, x: p.x, y: p.y, fl: p.fl, fighter: p.fighter }));
  const deco = { flights: level.flights || [], rooms: level.rooms || [], furniture: level.furniture || [], doors: level.doors || [], forest: level.forest || null, office: level.office || null, mall: level.mall || null, bright: !!level.bright,
    upper: level.upper || null, ramps: level.ramps || [], library: level.library || null, arena: level.arena || null };
  for (const c of cl) send(c.ws, { t: 'start', you: c.id, grid, map: level.name, yaw: level.yaw ?? Sh.START_YAW, floors: level.floors, stairs: level.stairs, ...deco, players: roster, roundTime: g.roundTime, hold: HOLD, mode: g.mode, phase: g.phase, sculptTime: SCULPT_TIME, traps: g.traps.map(({ id, x, y, fl, kind }) => ({ id, x, y, fl, kind })), explore,
    ...(escMode ? { gate: g.gate, key: g.keys.get(c.id) } : {}) }); // (in key escape you only know where your own key is)
  broadcastLobby(r);
  const its = g.players.filter(p => p.role === 'it'), names = its.map(p => p.name).join(' and ');
  if (explore) tell(r, g.players[0], 'Exploring on your own: no taggers, no clock. Invite friends to play.', '#69f0ae', 5);
  else if (clayMode) note(r, 'Sculpt your clay! Then you will hide it, and hunt for someone else\'s.', '#ffe9a8', 5);
  else if (fightMode) { note(r, 'Arena fights! Everyone is in the bracket: two fight while the rest watch from the stands.', '#ffd54f', 5); fightBegin(r); }
  else if (escMode) note(r, `Find your key and unlock your lock on the gate${g.players.length > 1 ? ': it only opens once everyone has unlocked theirs' : ''}! ${g.bots.length > 1 ? `${g.bots.length} bots wake` : 'The bot wakes'} up in ${HOLD}s. Hide in the green safe box.`, '#ffe9a8', 6);
  else for (const p of g.players) {
    if (p.role === 'it') tell(r, p, `You're IT${its.length > 1 ? ` (with ${its.filter(o => o !== p).map(o => o.name).join(', ')})` : ''}! Catch the runners and tag them.`, '#ff5252', 5);
    else tell(r, p, `${names} ${its.length > 1 ? 'are' : 'is'} IT! Run, and unfreeze your friends.`, '#69f0ae', 5);
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
    if (!p.frozen && now0 >= p.airUntil + JUMP_REST * 1000 - 100) p.airUntil = now0 + (g.mode === 'fight' ? FT.JUMP_T : JUMP_T) * 1000; // (fighters jump high)
    p.jumps = m.j;
  }
  const fighting = g.mode === 'fight' && g.match && (p.id === g.match.a || p.id === g.match.b);
  const pinned = fighting && (g.fphase !== 'fight' || (g.time < p.stunUntil && now0 > p.kbUntil));
  if (p.frozen || p.escaped || (p.role === 'it' && g.time < HOLD) || g.phase === 'sculpt' || pinned) { if (Math.hypot(m.x - p.x, m.y - p.y) > 2) teleport(r, p, p.x, p.y); return; }
  const x = Number(m.x), y = Number(m.y), now = Date.now();
  const dt = (now - p.lastPosT) / 1000;
  let speed = PLAYER_SPEED * (p.role === 'it' ? TAGGER_SPEED : 1);
  if (fighting) speed = (now < p.boostUntil ? 600 : PLAYER_SPEED * (p.block ? Sh.FIGHT.BLOCK_SPEED : 1)) + (now < p.kbUntil ? 420 : 0);
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

// Tagging and unfreezing happen on a click (or Space, or the on-screen button), not just by bumping into
// someone: a tagger freezes the nearest free runner within reach; a free runner unfreezes the nearest frozen one.
function onAct(r, c) {
  const g = r.game, p = g.players.find(p => p.id === c.id);
  if ((g.mode !== 'tag' && g.mode !== 'escape') || !p || p.frozen || p.escaped || g.time < p.nextAct) return;
  p.nextAct = g.time + ACT_COOLDOWN; // no machine-gun clicking
  const near = (want, reach) => g.players.filter(o => o !== p && want(o) && sameFloor(g, o, p) && dist(o, p) <= reach)
    .sort((a, b) => dist(a, p) - dist(b, p))[0];
  if (p.role === 'it') {
    if (g.time < HOLD) return;
    const v = near(o => o.role === 'run' && !o.frozen && o.immune <= 0, TAG_DIST);
    if (!v) return;
    v.frozen = true; v.timesFrozen++; p.tags++;
    teleport(r, v, v.x, v.y); // pin them where they were tagged
    note(r, `${p.name} froze ${v.name}!`, '#7fd4ff');
  } else {
    const v = near(o => o.role === 'run' && o.frozen, RESCUE_DIST);
    if (!v) return;
    v.frozen = false; v.immune = IMMUNE; p.saves++;
    note(r, `${p.name} unfroze ${v.name}!`, '#69f0ae');
  }
  checkWin(r);
  if (r.state === 'play') sendSnapshots(r);
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
  if (wasHold && g.time >= HOLD && g.mode === 'escape') note(r, g.bots.length > 1 ? 'The bots are awake!' : 'The bot is awake!', '#ff5252', 2.5);

  for (const p of g.players) {
    p.immune = Math.max(0, p.immune - dt);
    if (p.frozen || p.escaped) continue;
    const t = tileOf(p), stair = g.stairAt.get(I(t.x, t.y));
    if (stair) { // walked onto a staircase: arrive next to the matching one on the other floor
      p.yaw = stair.a ?? p.yaw;
      teleport(r, p, center(stair.tx), center(stair.ty), stair.a);
    }
  }

  if (g.mode === 'clay') { clayTick(r, dt); if (r.state === 'play') sendSnapshots(r); return; }
  if (g.mode === 'fight') { fightTick(r, dt); if (r.state === 'play') sendSnapshots(r); return; }
  if (g.mode === 'escape') escapeTick(r, dt);
  const runners = g.players.filter(p => p.role === 'run');
  if (!g.explore) stepOnTraps(r, runners, dt);
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
  if (g.explore) return; // nothing to win; it lasts until you go back to the lobby or leave
  if (g.mode === 'escape') return checkEscape(r);
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
    t: 'end', mode: g.mode, winner, reason, time: Math.min(g.time, g.roundTime),
    stats: g.players.map(p => ({ id: p.id, name: p.name, slot: p.slot, role: p.role, tags: p.tags, saves: p.saves, timesFrozen: p.timesFrozen, frozen: p.frozen, hasKey: p.hasKey, unlocked: p.unlocked, escaped: p.escaped, escapedAt: Math.round(p.escapedAt) })),
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
      fz: p.frozen, imm: p.immune > 0, tags: p.tags, f: p.fl, j: p.jumps, sc: Math.floor(p.score), k: p.hasKey, u: p.unlocked, e: p.escaped,
      ...(g.mode === 'fight' ? { hp: p.hp, mt: Math.floor(p.meter), ak: p.act ? p.act.k : null, sd: p.act ? p.act.side : null, at: p.act ? Math.round((g.time - p.act.t0) * 100) / 100 : 0,
        bk: p.block, st: g.time < p.stunUntil, dg: g.time < p.dodgeUntil, ay: p.air ? Math.round(p.air.y * 100) / 100 : 0, gu: g.time < (p.getupUntil || 0) } : {}),
    })),
  };
  if (g.mode === 'fight') Object.assign(shared, {
    fm: g.match ? { a: g.match.a, b: g.match.b, w: g.match.wins, rn: g.match.round } : null, fp: g.fphase, left: Math.max(0, Math.round((g.fUntil - g.time) * 10) / 10),
    beams: g.beams.map(b => ({ x: Math.round(b.x), y: Math.round(b.y), a: Math.round(b.a * 1000) / 1000, k: b.k, t: Math.round((g.time - b.t0) * 100) / 100 })),
  });
  if (g.mode === 'escape') Object.assign(shared, {
    bots: g.bots.map(b => ({ x: Math.round(b.x), y: Math.round(b.y), f: b.fl, a: Math.round(b.yaw * 100) / 100 })),
    go: g.gateOpen, zone: g.zone, zl: Math.max(0, Math.round((g.zoneNext - g.time) * 10) / 10), // where the safe zone is, and when it moves
  });
  if (g.mode === 'clay') Object.assign(shared, { ph: g.phase, left: Math.max(0, Math.round((g.phaseEnd - g.time) * 10) / 10) });
  for (const p of g.players) {
    const c = r.clients.get(p.id);
    if (!c) continue;
    let danger = 0;
    if (p.role === 'run' && !p.frozen && !p.escaped) for (const T of g.mode === 'escape' ? g.bots : g.players) { // (in key escape: the bots)
      if ((g.mode !== 'escape' && T.role !== 'it') || !sameFloor(g, T, p) || g.time < HOLD) continue;
      danger = Math.max(danger, 1 - dist(T, p) / (TILE * DANGER_DIST));
    }
    send(c.ws, { t: 's', ...shared, danger, chase: danger > 0.45 });
  }
}

// ---------------------------------------------------------------- key escape
// Everyone has their own key hidden somewhere on the map: walk over it to pick it up, then take it to the gate to
// unlock your own lock on it. The gate only opens once everyone has unlocked theirs; then anyone can get out.
// Bots hunt everyone down (caught = frozen, and a friend can unfreeze you, like in freeze tag). Standing in the safe
// zone keeps you safe from them, but it moves somewhere else every ZONE_TIME seconds.
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const stairTiles = level => new Set([...(level.flights || []).flatMap(f => Array.from({ length: f.y1 - f.y0 + 1 }, (_, i) => I(f.x, f.y0 + i))), ...level.stairs.map(s => I(s.x, s.y))]);
function setupEscape(g, level, reach, botSpots) {
  const { d, N, grids, ramp } = reach, stairs = stairTiles(level);
  let maxD = 0; for (const v of d) if (v > maxD) maxD = v;
  const open = []; // floor you can get to from the start, not on the stairs
  grids.forEach((gr, fl) => {
    for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++)
      if (gr[y][x] === 0 && d[fl * N + I(x, y)] >= 0 && !ramp[I(x, y)] && !stairs.has(I(x, y))) open.push({ x, y, fl, d: d[fl * N + I(x, y)] });
  });
  const far = k => { const c = open.filter(t => t.d >= maxD * k); return c.length ? c : open; };
  // the gate: about as far from the start as you can get
  const gates = far(0.8), gt = gates[rand(gates.length)];
  g.gate = { x: center(gt.x), y: center(gt.y), fl: gt.fl };
  // everyone's key: away from the start, and spread out (from each other and from the gate)
  g.keys = new Map();
  const used = [gt], cands = shuffleArr(far(0.3).slice()), apart = (t, n) => used.every(u => u.fl !== t.fl || Math.abs(u.x - t.x) + Math.abs(u.y - t.y) >= n);
  for (const p of g.players) {
    const t = cands.find(t => apart(t, 6)) || cands.find(t => apart(t, 1)) || cands[0];
    used.push(t); g.keys.set(p.id, { x: center(t.x), y: center(t.y), fl: t.fl });
  }
  // where the safe zone can go: somewhere roomy (not a dead end in a narrow corridor)
  const roomy = open.filter(t => { let n = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const r = grids[t.fl][t.y + dy]; if (r && r[t.x + dx] === 0) n++; } return n >= 13; });
  g.zoneSpots = roomy.length >= 4 ? roomy : open;
  g.ramp = ramp; g.zone = null; g.gateOpen = false; moveZone(g);
  g.bots = botSpots.map(s => ({ x: center(s.x), y: center(s.y), fl: s.fl || 0, yaw: 0 }));
}
// the safe zone moves: somewhere at least 8 tiles away from where it was
function moveZone(g) {
  const old = g.zone, c = g.zoneSpots.filter(t => !old || t.fl !== old.fl || Math.abs(t.x - old.tx) + Math.abs(t.y - old.ty) >= 8);
  const t = (c.length ? c : g.zoneSpots)[rand((c.length ? c : g.zoneSpots).length)];
  const z = g.zone = { x: center(t.x), y: center(t.y), fl: t.fl, r: ZONE_R * TILE, tx: t.x, ty: t.y };
  // the tiles the bot can't step on
  g.zoneTiles = new Set();
  const N = COLS * ROWS, zf = Sh.floorOf(g.floors, z.x), R = Math.ceil(ZONE_R);
  for (let y = t.y - R; y <= t.y + R; y++) for (let x = t.x - R; x <= t.x + R; x++)
    if (x >= 0 && y >= 0 && x < COLS && y < ROWS && Math.abs(center(x) - z.x) <= z.r && Math.abs(center(y) - z.y) <= z.r && Sh.floorOf(g.floors, center(x)) === zf) g.zoneTiles.add(t.fl * N + I(x, y));
  g.zoneNext = g.time + ZONE_TIME;
}
// the safe zone is a square box, `r` from its middle to each side
const inZone = (g, p) => sameFloor(g, p, g.zone) && Math.abs(p.x - g.zone.x) <= g.zone.r && Math.abs(p.y - g.zone.y) <= g.zone.r;

function escapeTick(r, dt) {
  const g = r.game;
  if (g.time >= g.zoneNext) {
    const was = g.players.filter(p => !p.frozen && !p.escaped && inZone(g, p));
    moveZone(g);
    for (const p of was) if (!inZone(g, p)) tell(r, p, 'The safe zone moved! Find the new one.', '#69f0ae', 2.5);
  }
  for (const p of g.players) { // picking up your key, unlocking your lock on the gate, and getting out once it's open
    if (p.frozen || p.escaped) continue;
    const k = g.keys.get(p.id);
    if (!p.hasKey && k && sameFloor(g, p, k) && dist(p, k) <= KEY_DIST) { p.hasKey = true; tell(r, p, 'You found your key! Now take it to the gate.', '#ffd54f', 3); }
    if (!sameFloor(g, p, g.gate) || dist(p, g.gate) > GATE_DIST) continue;
    if (p.hasKey && !p.unlocked) {
      p.unlocked = true;
      const done = g.players.filter(q => q.unlocked).length;
      if (done < g.players.length) note(r, `${p.name} unlocked their lock on the gate (${done}/${g.players.length}). Everyone has to unlock theirs!`, '#ffd54f', 3);
    }
    if (g.gateOpen) {
      p.escaped = true; p.escapedAt = g.time;
      teleport(r, p, p.x, p.y); // (and stay put: you're out)
      note(r, `${p.name} escaped!`, '#69f0ae', 3);
    }
  }
  if (!g.gateOpen && g.players.length && g.players.every(p => p.unlocked)) { // (also when someone who hadn't unlocked theirs leaves)
    g.gateOpen = true;
    note(r, g.players.length > 1 ? 'Every lock is open: the gate is open! Everyone get out!' : 'The gate is open! Get out!', '#69f0ae', 4);
  }
  if (g.time < HOLD) return; // the bots wait out the head start
  const speed = PLAYER_SPEED * (BOT_SPEED + (BOT_SPEED_END - BOT_SPEED) * Math.min(1, g.time / g.roundTime)); // (they speed up as the round goes on)
  for (const b of g.bots) {
    moveBot(g, b, speed * dt);
    const t = tileOf(b), stair = g.stairAt.get(I(t.x, t.y));
    if (stair) { b.x = center(stair.tx); b.y = center(stair.ty); b.yaw = stair.a ?? b.yaw; } // took the stairs, like a player
    for (const p of g.players) {
      if (p.frozen || p.escaped || p.immune > 0 || inZone(g, p) || !sameFloor(g, b, p) || dist(b, p) > CATCH_DIST) continue;
      p.frozen = true; p.timesFrozen++;
      teleport(r, p, p.x, p.y); // pin them where they were caught
      note(r, g.players.length > 1 ? `The bot caught ${p.name}! Go and unfreeze them.` : 'The bot caught you!', '#ff5252', 3);
    }
  }
}

// The bot's way to everyone: a breadth-first search over the tiles of every floor, starting where it is. It can't step
// into the safe zone (unless the zone just landed on top of it: then it can walk out).
function botSearch(g, b) {
  const N = COLS * ROWS, grids = g.upper ? [g.grid, g.upper] : [g.grid], F = grids.length;
  const d = new Int16Array(N * F).fill(-1), par = new Int32Array(N * F).fill(-1), q = new Int32Array(N * F);
  const t0 = tileOf(b), s = (b.fl || 0) * N + I(t0.x, t0.y), free = g.zoneTiles.has(s);
  let h = 0, t = 0;
  d[s] = 0; q[t++] = s;
  const visit = (ni, c) => { if (d[ni] === -1 && (free || !g.zoneTiles.has(ni))) { d[ni] = d[c] + 1; par[ni] = c; q[t++] = ni; } };
  while (h < t) {
    const c = q[h++], f = (c / N) | 0, i = c - f * N, x = i % COLS, y = (i / COLS) | 0;
    const l = c !== s && g.links.get(i);
    if (l) { for (const ni of l) visit(f * N + ni, c); continue; } // stepping onto stairs takes you to the other end
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < COLS && ny < ROWS && grids[f][ny][nx] === 0) visit(f * N + I(nx, ny), c);
    }
    if (F > 1 && g.ramp[i]) visit((1 - f) * N + i, c); // a staircase in the library: on both floors
  }
  return { d, par, s, N };
}
// Each tick the bot goes for whoever is closest (by the way it has to walk) and isn't safe; if everyone it could
// chase is in the safe zone, it waits at the edge of the zone.
function moveBot(g, b, step) {
  const { d, par, s, N } = botSearch(g, b);
  const nodeOf = p => { const t = tileOf(p); return (p.fl || 0) * N + I(t.x, t.y); };
  let goal = -1, best = Infinity, prey = null;
  for (const p of g.players) {
    if (p.frozen || p.escaped || inZone(g, p)) continue;
    const n = nodeOf(p);
    if (d[n] >= 0 && d[n] < best) { best = d[n]; goal = n; prey = p; }
  }
  if (goal < 0) {
    if (!g.players.some(p => !p.frozen && !p.escaped)) return;
    const z = g.zone;
    let bd = Infinity;
    for (let n = 0; n < d.length; n++) {
      if (d[n] < 0 || ((n / N) | 0) !== z.fl) continue;
      const i = n % N, e = Math.hypot(center(i % COLS) - z.x, center((i / COLS) | 0) - z.y);
      if (e < bd) { bd = e; goal = n; }
    }
    if (goal < 0) return;
  }
  let target;
  if (prey && best <= 1) target = { x: prey.x, y: prey.y }; // right there: straight for them
  else {
    const path = [];
    for (let n = goal; n !== s && n >= 0; n = par[n]) path.push(n);
    const next = path.reverse().find(n => n % N !== s % N); // (changing floors on a staircase happens by walking along it)
    if (next === undefined) return;
    const i = next % N;
    target = { x: center(i % COLS), y: center((i / COLS) | 0) };
  }
  const dx = target.x - b.x, dy = target.y - b.y, l = Math.hypot(dx, dy);
  if (l < 0.5) return;
  const k = Math.min(step, l) / l;
  Sh.moveCircle(Sh.world(g, b.fl), b, dx * k, dy * k, PLAYER_R - 2);
  b.fl = Sh.nextFloor(g, b.x, b.y, b.fl);
  b.yaw = Math.atan2(dy, dx);
}

// everyone out: they win. Everyone left caught (nobody to unfreeze them) or time's up: the bot wins, unless someone got out.
function checkEscape(r) {
  const g = r.game, ps = g.players;
  if (!ps.length) return endGame(r, 'bot', 'Everyone left.');
  const out = ps.filter(p => p.escaped).length, free = ps.filter(p => !p.escaped && !p.frozen).length;
  if (out === ps.length) return endGame(r, 'run', out > 1 ? 'Everyone escaped!' : 'You escaped!');
  if (!free) return endGame(r, out ? 'run' : 'bot', out ? `${out} of ${ps.length} escaped; the bot got the rest.` : ps.length > 1 ? 'The bot caught everyone.' : 'The bot caught you.');
  if (g.time >= g.roundTime) endGame(r, out ? 'run' : 'bot', `Time's up. ${out ? `${out} of ${ps.length} escaped.` : 'Nobody got out.'}`);
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

// ---------------------------------------------------------------- arena fights
// Everyone goes into a knockout bracket (in a random order; with an odd number, someone gets a bye). One match at
// a time: the two fighters go into the ring, everyone else watches from the stands. Best of 3 rounds; a round ends
// on a knock-out or when time runs out (then the one with more health wins it). The winner goes on to the next round
// of the bracket, until one champion is left.
const FT = Sh.FIGHT;
const fighterOf = (g, id) => g.players.find(p => p.id === id);
const pairUp = ids => { const out = []; for (let i = 0; i < ids.length; i += 2) out.push({ a: ids[i], b: ids[i + 1] ?? null, winner: ids[i + 1] == null ? ids[i] : null, wins: [0, 0], round: 0 }); return out; };
function sendBracket(r) {
  const g = r.game;
  broadcast(r, { t: 'bracket', rounds: g.bracket.map(rd => rd.map(m => ({ a: m.a, b: m.b, w: m.winner, s: m.wins }))) });
}
function fightBegin(r) {
  const g = r.game;
  g.bracket = [pairUp(shuffleArr(g.players.map(p => p.id)))]; g.match = null; g.beams = [];
  g.fphase = 'bracket'; g.fUntil = g.time + FT.BRACKET_PAUSE;
  sendBracket(r);
}
// the next match in this round of the bracket; or, when it's done, the next round; or the champion
function nextMatch(r) {
  const g = r.game, rd = g.bracket[g.bracket.length - 1], m = rd.find(m => m.winner == null);
  if (m) {
    const A = fighterOf(g, m.a), B = fighterOf(g, m.b);
    if (!A || !B) { m.winner = A ? m.a : B ? m.b : -1; sendBracket(r); return nextMatch(r); } // someone left: the other goes through
    return startMatch(r, m);
  }
  const winners = rd.map(m => m.winner).filter(id => id !== -1 && fighterOf(g, id));
  if (winners.length <= 1) return endFight(r, winners[0] ?? null);
  g.bracket.push(pairUp(shuffleArr(winners)));
  g.fphase = 'bracket'; g.fUntil = g.time + FT.BRACKET_PAUSE;
  sendBracket(r);
  note(r, winners.length === 2 ? 'The final!' : `Round ${g.bracket.length} of the bracket`, '#ffd54f', 3);
}
function startMatch(r, m) {
  const g = r.game, A = fighterOf(g, m.a), B = fighterOf(g, m.b);
  g.match = m; m.wins = [0, 0]; m.round = 0;
  for (const p of [A, B]) { p.meter = 0; p.role = 'fighter'; }
  note(r, `${A.name} vs ${B.name}!`, '#ffd54f', 3);
  startRound(r);
}
function startRound(r) {
  const g = r.game, m = g.match, sp = g.arena.fighters;
  m.round++;
  [m.a, m.b].forEach((id, i) => {
    const p = fighterOf(g, id);
    Object.assign(p, { hp: FT.HP, act: null, block: false, stunUntil: 0, dodgeUntil: 0, dodgeCd: 0, kbUntil: 0, boostUntil: 0, fl: 0, yaw: i ? Math.PI : 0, air: null, juggles: 0, getupUntil: 0, comboN: 0, comboUntil: 0, hist: [] });
    teleport(r, p, center(sp[i][0]), center(sp[i][1]), p.yaw);
  });
  g.beams = [];
  g.fphase = 'intro'; g.fUntil = g.time + FT.INTRO;
  broadcast(r, { t: 'fround', n: m.round });
}
// a hit lands: dodging makes it miss; blocking (facing the hit) takes a quarter of it; otherwise a stun and a shove
function landHit(r, att, def, kind) {
  const g = r.game, spec = FT[kind], now = Date.now();
  if (g.time < def.dodgeUntil) return broadcast(r, { t: 'hit', by: att.id, to: def.id, kind, miss: true, x: Math.round(def.x), y: Math.round(def.y) });
  const toAtt = Math.atan2(att.y - def.y, att.x - def.x), facing = Math.abs(Math.atan2(Math.sin(toAtt - def.yaw), Math.cos(toAtt - def.yaw))) < 1.4;
  const blocked = def.block && facing && !def.air; // (no blocking in the air)
  const cb = blocked ? null : Sh.fightCombo(att, def, kind, g.time); // (a combo, a launch, a juggle)
  if (blocked) att.comboN = 0;
  const dmg = Math.round(spec.dmg * (blocked ? FT.BLOCK : cb.mult));
  def.hp = Math.max(0, def.hp - dmg);
  att.meter = Math.min(100, att.meter + dmg * FT.METER_DEAL); def.meter = Math.min(100, def.meter + dmg * FT.METER_TAKE);
  if (!blocked) {
    if (spec.stun) { def.stunUntil = g.time + spec.stun; def.act = null; }
    // the shove: in the air a small one (so the juggle stays in reach), unless a beam blasted them; a long ground combo is broken off
    let kb = def.air && !spec.beam ? (cb.launch ? 220 : 130) : spec.kb || 0;
    if (cb.n >= FT.COMBO.breakAt && !def.air) { kb = 320; att.comboN = 0; }
    if (kb) {
      const dx = def.x - att.x, dy = def.y - att.y, l = Math.hypot(dx, dy) || 1;
      def.kbUntil = now + 320;
      const c = r.clients.get(def.id);
      if (c) send(c.ws, { t: 'kb', vx: dx / l * kb, vy: dy / l * kb, dur: 0.25 });
    }
  }
  broadcast(r, { t: 'hit', by: att.id, to: def.id, kind, dmg, blocked, hp: def.hp, x: Math.round(def.x), y: Math.round(def.y), combo: cb ? cb.n : 0, launch: !!(cb && cb.launch) });
}
const inReach = (p, o, range, arc) => {
  if (dist(p, o) > range) return false;
  const a = Math.atan2(o.y - p.y, o.x - p.x);
  return Math.abs(Math.atan2(Math.sin(a - p.yaw), Math.cos(a - p.yaw))) <= arc;
};
function onFx(r, c, m) {
  const g = r.game, p = g.mode === 'fight' && g.match && fighterOf(g, c.id);
  if (!p || (p.id !== g.match.a && p.id !== g.match.b) || g.fphase !== 'fight' || g.time < p.stunUntil) return;
  const k = m.a;
  if (k === 'dodge') {
    if (g.time < p.dodgeCd || p.act) return;
    p.dodgeUntil = g.time + FT.DODGE.t; p.dodgeCd = g.time + FT.DODGE.cd; p.boostUntil = Date.now() + FT.DODGE.t * 1000 + 150;
    return;
  }
  if (p.act || p.block) return;
  if (k === 'punch' || k === 'kick') { // (a jab or a kick, or a combo move if it finishes a sequence)
    const mv = Sh.fightNextMove(p.hist || (p.hist = []), k, g.time, Date.now() < p.airUntil);
    if (mv === 'punch') p.jab = p.jab === 'L' ? 'R' : 'L'; // (jabs: left, right, left...)
    p.act = { k: mv, t0: g.time, side: mv === 'punch' ? p.jab : null };
    if (FT.MOVE_NAMES[mv]) broadcast(r, { t: 'cmove', by: p.id, k: mv });
    if (FT[mv].lunge) p.boostUntil = Date.now() + FT.LUNGE_T * 1000 + 150; // (it darts in: allow the speed)
  }
  else if (k === 'special' && p.meter >= 100) {
    p.meter = 0; p.act = { k: p.fighter.special, t0: g.time };
    broadcast(r, { t: 'special', by: p.id, kind: p.act.k });
  }
}
function onBlock(r, c, m) {
  const g = r.game, p = g.mode === 'fight' && g.match && fighterOf(g, c.id);
  if (p && (p.id === g.match.a || p.id === g.match.b)) p.block = !!m.on;
}
function fightTick(r, dt) {
  const g = r.game;
  if (g.fphase === 'bracket') { if (g.time >= g.fUntil) nextMatch(r); return; }
  const m = g.match;
  if (!m) return;
  const A = fighterOf(g, m.a), B = fighterOf(g, m.b);
  if (g.fphase === 'intro') { if (g.time >= g.fUntil) { g.fphase = 'fight'; g.fUntil = g.time + FT.ROUND_T; broadcast(r, { t: 'fight' }); } return; }
  for (const p of [A, B]) stepAir(g, p, dt); // (launched fighters fall, even after a knock-out)
  if (g.fphase === 'ko') { if (g.time >= g.fUntil) afterRound(r); return; }
  // the moves: each lands after its wind-up
  const now = Date.now();
  for (const [p, o] of [[A, B], [B, A]]) {
    const a = p.act;
    if (!a) continue;
    const spec = FT[a.k];
    if (spec.hits) { // (a flurry: a hit every few moments)
      a.n = a.n || 0;
      while (a.n < spec.hits && g.time >= a.t0 + spec.wind + a.n * spec.every) { a.n++; if (inReach(p, o, spec.range, spec.arc)) landHit(r, p, o, a.k); }
    } else if (!a.done && g.time >= a.t0 + spec.wind) {
      a.done = true;
      if (spec.range && inReach(p, o, spec.range, spec.arc)) landHit(r, p, o, a.k);
      else if (spec.beam) g.beams.push({ x: p.x + Math.cos(p.yaw) * 16, y: p.y + Math.sin(p.yaw) * 16, a: p.yaw, k: a.k, o: p.id, t0: g.time, hit: false }); // (fired after the charge)
    }
    if (g.time >= a.t0 + Math.max(spec.cd, spec.wind + 0.05)) p.act = null;
  }
  // beams: straight out from the hands for a moment; they hit once, anyone in them who isn't in the air (jump them!)
  g.beams = g.beams.filter(b => {
    const spec = FT[b.k];
    if (g.time > b.t0 + spec.beam) return false;
    const owner = fighterOf(g, b.o), o = owner === A ? B : A;
    if (owner && o && !b.hit && now >= o.airUntil) {
      const dx = o.x - b.x, dy = o.y - b.y, along = dx * Math.cos(b.a) + dy * Math.sin(b.a), across = Math.abs(dy * Math.cos(b.a) - dx * Math.sin(b.a));
      if (along > -12 && along < spec.len * Math.min(1, (g.time - b.t0) / 0.12) && across < spec.w + 10) { b.hit = true; landHit(r, owner, o, b.k); }
    }
    return true;
  });
  if (A.hp <= 0 || B.hp <= 0 || g.time >= g.fUntil) roundOver(r);
}
// a launched fighter: helpless while up; lands and gets up (nothing hits them while they get up)
function stepAir(g, p, dt) {
  if (!p || !p.air) return;
  p.stunUntil = Math.max(p.stunUntil, g.time + 0.1); p.act = null;
  if (Sh.fightAir(p, dt)) {
    p.getupUntil = g.time + FT.JUGGLE.getup; p.juggles = 0;
    p.dodgeUntil = Math.max(p.dodgeUntil, p.getupUntil); p.stunUntil = Math.max(p.stunUntil, p.getupUntil);
  }
}
function roundOver(r) {
  const g = r.game, m = g.match, A = fighterOf(g, m.a), B = fighterOf(g, m.b);
  const w = A.hp > B.hp ? A : B.hp > A.hp ? B : null, ko = A.hp <= 0 || B.hp <= 0;
  if (w) m.wins[w === A ? 0 : 1]++;
  g.fphase = 'ko'; g.fUntil = g.time + FT.KO_PAUSE; g.beams = [];
  for (const p of [A, B]) { p.act = null; p.block = false; }
  broadcast(r, { t: 'ko', w: w ? w.id : null, ko });
  note(r, !w ? 'A draw! Nobody takes this round.' : ko ? `K.O.! ${w.name} takes round ${m.round}` : `Time! ${w.name} takes round ${m.round}`, '#ffd54f', 2.5);
}
function afterRound(r) {
  const g = r.game, m = g.match;
  let wi = m.wins.findIndex(w => w >= FT.WINS);
  if (wi < 0 && m.round >= 5) wi = m.wins[0] === m.wins[1] ? rand(2) : m.wins[0] > m.wins[1] ? 0 : 1; // (too many draws: decide it)
  if (wi < 0) return startRound(r);
  endMatch(r, wi ? m.b : m.a);
}
// the match is over: both go back to the stands, the winner goes through
function endMatch(r, winnerId) {
  const g = r.game, m = g.match;
  m.winner = winnerId;
  const w = fighterOf(g, winnerId);
  if (w) { w.mwins++; note(r, `${w.name} wins the match!`, '#69f0ae', 3); }
  [m.a, m.b].forEach((id, i) => {
    const p = fighterOf(g, id);
    if (!p) return;
    const s = g.spawns[(g.players.indexOf(p) + i) % g.spawns.length];
    Object.assign(p, { role: 'fan', act: null, block: false, hp: FT.HP }); teleport(r, p, center(s[0]), center(s[1]), Math.PI / 2);
  });
  g.match = null; g.beams = [];
  g.fphase = 'bracket'; g.fUntil = g.time + FT.BRACKET_PAUSE;
  sendBracket(r);
}
function fightLeft(r, id) {
  const g = r.game;
  if (g.players.length < 2) return endFight(r, g.players[0] ? g.players[0].id : null);
  if (g.match && (g.match.a === id || g.match.b === id)) endMatch(r, g.match.a === id ? g.match.b : g.match.a); // a walk-over
  else sendBracket(r);
}
function endFight(r, champion) {
  clearInterval(r.timer); r.timer = null;
  const g = r.game;
  r.state = 'ended';
  sendSnapshots(r);
  broadcast(r, {
    t: 'end', mode: 'fight', champion, time: g.time, reason: champion != null ? '' : 'Nobody left to fight.',
    rounds: g.bracket.map(rd => rd.map(m => ({ a: m.a, b: m.b, w: m.winner, s: m.wins }))),
    stats: g.players.map(p => ({ id: p.id, name: p.name, slot: p.slot, wins: p.mwins, fighter: p.fighter })),
  });
  broadcastLobby(r);
}

server.listen(PORT, () => {
  console.log(`Keybound server running on port ${PORT}`);
  console.log(`  On this computer:      http://localhost:${PORT}`);
  for (const u of lanUrls()) console.log(`  Same Wi-Fi / network:  ${u}`);
});
