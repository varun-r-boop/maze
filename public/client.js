import { drawApartmentMap, drawDoors2D, doorSwing } from './apartment2d.js';
import { drawForestMap, drawForestGlow } from './forest2d.js';
import { drawOfficeMap, drawOfficeLamps } from './office2d.js';
const Sh = window.Shared;
const { TILE, COLS, ROWS, PLAYER_R, PLAYER_SPEED, MAX_PLAYERS, MIN_PLAYERS, TAGGER_SPEED, ROUND_TIMES } = Sh.C;
const { center, dist } = Sh;
const COLORS = Sh.COLORS;
const MINI = 3;
// vision: a small glow all around you, plus a headlight cone that reaches further. Walls block both.
const R_NEAR = TILE * 2.2, R_FAR = TILE * 7.5, CONE = 0.5; // CONE = half-angle in radians
// on maps with the lights on (the office) you see in every direction, as far as R_BRIGHT, wherever nothing blocks the view
const R_BRIGHT = TILE * 9;
const isTouch = matchMedia('(pointer: coarse)').matches;

// ---------------------------------------------------------------- canvases
const cvs = document.getElementById('c'), ctx = cvs.getContext('2d');
const mask = document.createElement('canvas'), mctx = mask.getContext('2d'); // darkness layer
let W, H, DPR, Z; // Z = world zoom
function resize() {
  W = innerWidth; H = innerHeight; DPR = Math.min(2, devicePixelRatio || 1);
  cvs.width = mask.width = W * DPR; cvs.height = mask.height = H * DPR;
  cvs.style.width = W + 'px'; cvs.style.height = H + 'px';
  Z = Math.max(0.8, Math.min(1.8, Math.min(W, H) / 470));
}
addEventListener('resize', resize); resize();

const overlay = document.getElementById('overlay'), panel = document.getElementById('panel');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

// ---------------------------------------------------------------- camera view: top-down, third person or first person
// Each player picks their own view; it only changes how your screen is drawn, not the game.
const VIEWS = [['top', 'Top-down'], ['tpp', 'Third person'], ['fps', 'First person']];
let viewMode = VIEWS.some(v => v[0] === store.get('kb-view')) ? store.get('kb-view') : 'top';
let pitch = 0; // up/down look in the 3D views
const glCanvas = document.getElementById('gl');
let v3d = null, v3dLoading = null, v3dError = '';
function load3D() {
  if (v3d || v3dLoading) return v3dLoading;
  v3dLoading = import('./view3d.js').then(m => {
    v3d = m.createView3D(glCanvas); v3d.resize(W, H, DPR);
    if (G) v3d.build(G);
  }).catch(e => { console.error(e); v3dError = '3D view failed to load. Using top-down.'; setView('top'); });
  return v3dLoading;
}
function setView(mode) {
  viewMode = mode; store.set('kb-view', mode); pitch = 0;
  if (mode !== 'top') load3D();
  else if (document.pointerLockElement) document.exitPointerLock();
  cvs.classList.toggle('mode3d', mode !== 'top');
  glCanvas.style.display = mode === 'top' ? 'none' : 'block';
  if (G && ui === 'play') addMsg(`View: ${VIEWS.find(v => v[0] === mode)[1]}`, '#b9b5d6', 1.5);
}
function viewPicker() {
  return `<label>Your view</label><div class="seg" id="viewpick">${VIEWS.map(([k, n]) => `<button data-view="${k}" class="${k === viewMode ? 'on' : ''}">${n}</button>`).join('')}</div>`;
}
// character: each player picks one; everyone sees each other's choice
let myChar = store.get('kb-char') === 'woman' ? 'woman' : 'man';
function charPicker() {
  return `<label>Your character</label><div class="seg chars">${CHARS.map(([k, n]) => `<button data-char="${k}" class="${k === myChar ? 'on' : ''}"><canvas width="96" height="84"></canvas>${n}</button>`).join('')}</div>`;
}
function bindCharPicker() {
  const color = COLORS[(room.players.find(p => p.id === myId) || { slot: 0 }).slot];
  panel.querySelectorAll('[data-char]').forEach(b => {
    const cv = b.querySelector('canvas'), c = cv.getContext('2d');
    const slot = (room.players.find(p => p.id === myId) || { slot: 0 }).slot;
    c.setTransform(1.15, 0, 0, 1.15, 48 - 48 * 1.15, 4); drawPerson(c, b.dataset.char, 48, 52, color, 1, 0, 1, slot);
    b.onclick = () => {
      myChar = b.dataset.char; store.set('kb-char', myChar);
      panel.querySelectorAll('[data-char]').forEach(x => x.classList.toggle('on', x === b));
      if (room.code) send({ t: 'char', char: myChar });
    };
  });
}
function bindViewPicker() {
  panel.querySelectorAll('[data-view]').forEach(b => b.onclick = () => {
    setView(b.dataset.view);
    panel.querySelectorAll('[data-view]').forEach(x => x.classList.toggle('on', x === b));
  });
}
addEventListener('resize', () => { if (v3d) v3d.resize(W, H, DPR); });

// ---------------------------------------------------------------- networking
let ws, myId = null, lan = [], ui = 'home', homeError = '';
const room = { code: null, host: null, players: [], state: null, map: 'building', roundTime: Sh.C.ROUND_DEFAULT };
let G = null; // current game, client side
const queue = [];

function connect() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => { while (queue.length) ws.send(queue.shift()); };
  ws.onmessage = e => onMsg(JSON.parse(e.data));
  ws.onclose = () => { ui = 'disconnected'; renderDisconnected(); };
}
function send(m) { const s = JSON.stringify(m); if (ws.readyState === 1) ws.send(s); else queue.push(s); }

function onMsg(m) {
  switch (m.t) {
    case 'joined':
      myId = m.you; room.code = m.code; lan = m.lan || [];
      history.replaceState(null, '', '?room=' + m.code);
      break;
    case 'error':
      homeError = m.msg; renderHome();
      break;
    case 'lobby':
      room.host = m.host; room.players = m.players; room.state = m.state; room.map = m.map || 'building'; room.roundTime = m.roundTime || room.roundTime;
      if (m.state === 'lobby') { ui = 'lobby'; G = null; renderLobby(); }
      else if (ui === 'ended') renderEnd();
      break;
    case 'start':
      initGame(m); ui = 'play'; overlay.classList.add('hidden');
      break;
    case 's': if (G) applySnapshot(m); break;
    case 'tp': if (G) {
      G.me.x = m.x; G.me.y = m.y; G.tpSeq = m.s;
      if (typeof m.a === 'number') { aim = m.a; pitch = 0; G.fade = 1; } // took the stairs: fade, and face out of the stairwell
    } break;
    case 'msg': if (G) addMsg(m.text, m.color, m.dur); break;
    case 'end':
      if (document.pointerLockElement) document.exitPointerLock();
      chase.pause(); chase.currentTime = 0;
      if (G) { G.result = m; ui = 'ended'; renderEnd(); }
      break;
  }
}

// ---------------------------------------------------------------- screens
function renderHome() {
  ui = 'home';
  overlay.classList.remove('hidden');
  const code = new URLSearchParams(location.search).get('room') || '';
  panel.innerHTML = `
    <h1>KEY<span>BOUND</span></h1>
    <p class="sub">Online freeze tag in the dark. Everyone plays on their own device.</p>
    <label for="name">Your name</label>
    <input id="name" maxlength="14" placeholder="Name" value="${esc(store.get('kb-name') || '')}" style="margin-bottom:14px">
    ${charPicker()}
    ${viewPicker()}
    <div class="cols">
      <div class="card"><h3>Host a game</h3><p>Create a room, then send the invite link to your friends.</p><button class="go" id="host">Host game</button></div>
      <div class="card"><h3>Join a game</h3><input id="code" class="code" maxlength="4" placeholder="CODE" value="${esc(code)}"><button class="go" id="join">Join</button></div>
    </div>
    <p class="err">${esc(homeError || v3dError)}</p>
    ${musicButton()}
    <details ${code ? '' : 'open'}><summary>How to play</summary><ul class="rules">
      <li>At the start of each round some players are picked at random to be <b style="color:#ff5252">IT</b> (1 tagger for up to 6 players, 2 for 7–12). Everyone else is a <b style="color:#69f0ae">runner</b>.</li>
      <li>Runners get a ${Sh.C.HOLD}-second head start. Then the taggers hunt them. A tagger <b>freezes</b> any runner they touch, and frozen runners can't move.</li>
      <li>Stand next to a frozen runner for ${Sh.C.RESCUE_TIME} seconds to <b>unfreeze</b> them. They're safe from tags for a moment afterwards.</li>
      <li><b>Taggers win</b> if every runner is frozen before time runs out. <b>Runners win</b> if at least one of them is still free when the timer ends.</li>
      <li>It's dark: you only see what your headlight shows, and walls block it. Runners always know where their teammates are; taggers only show up when you can see them. Listen for the heartbeat: a tagger is close.</li>
      <li><b>Top-down, PC:</b> move with WASD or the arrow keys; your headlight points the way you walk. <b>Phone:</b> drag anywhere to move.</li>
      <li><b>First / third person, PC:</b> click the game to look around with the mouse (Esc frees it). W/S walk, A/D step sideways, ←/→ or Q/E turn. <b>Phone:</b> drag up/down to walk, left/right to turn.</li>
      <li>Press <b>V</b> during a game to switch views, and <b>M</b> to turn the music on or off.</li>
    </ul></details>`;
  bindViewPicker(); bindMusicButton(); bindCharPicker();
  const nameEl = document.getElementById('name'), codeEl = document.getElementById('code');
  const name = () => { const n = nameEl.value.trim(); store.set('kb-name', n); return n; };
  document.getElementById('host').onclick = () => { ensureAudio(); homeError = ''; send({ t: 'create', name: name(), char: myChar }); };
  const join = () => {
    ensureAudio();
    if (codeEl.value.trim().length !== 4) { homeError = 'Enter the 4-letter room code.'; return renderHome(); }
    homeError = ''; send({ t: 'join', code: codeEl.value, name: name(), char: myChar });
  };
  document.getElementById('join').onclick = join;
  codeEl.onkeydown = e => { if (e.key === 'Enter') join(); };
  (code ? codeEl : nameEl).focus();
  if (code && nameEl.value) document.getElementById('join').focus();
}

function renderLobby() {
  overlay.classList.remove('hidden');
  const isHost = room.host === myId, enough = room.players.length >= MIN_PLAYERS, taggers = Sh.taggerCount(room.players.length);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const links = local && lan.length ? lan.map(u => `${u}/?room=${room.code}`) : [`${location.origin}${location.pathname}?room=${room.code}`];
  panel.innerHTML = `
    <p class="sub" style="margin-bottom:4px">Room code</p>
    <div class="bigcode">${esc(room.code)}</div>
    <label>Invite link</label>
    ${links.map(l => `<div class="linkrow"><input readonly value="${esc(l)}"><button data-copy="${esc(l)}">Copy</button></div>`).join('')}
    ${local ? `<p class="note">You're playing on <b>localhost</b>, so the link above is your local-network address. It works for friends on the same Wi-Fi. For friends elsewhere, use a tunnel link instead (see README).</p>` : ''}
    <div style="margin-top:18px">${charPicker()}${viewPicker()}
      <label>Map${isHost ? '' : ' (the host picks)'}</label><div class="seg">${Sh.MAPS.map(([k, n]) => `<button data-map="${k}" class="${k === room.map ? 'on' : ''}" ${isHost ? '' : 'disabled'}>${n}</button>`).join('')}</div>
      <label>Round length${isHost ? '' : ' (the host picks)'}</label><div class="seg">${ROUND_TIMES.map(s => `<button data-time="${s}" class="${s === room.roundTime ? 'on' : ''}" ${isHost ? '' : 'disabled'}>${s / 60} min</button>`).join('')}</div>
    </div>
    <h3>Players (${room.players.length}/${MAX_PLAYERS})</h3>
    <ul class="plist">${room.players.map(p => `<li><span class="dot" style="background:${COLORS[p.slot]}"></span>${esc(p.name)}<em>${(CHARS.find(c => c[0] === p.char) || CHARS[0])[1]}</em>${p.id === room.host ? '<em>host</em>' : ''}${p.id === myId ? '<em>you</em>' : ''}</li>`).join('')}</ul>
    ${isHost ? `<button class="go" id="start" ${enough ? '' : 'disabled'}>Start round</button><p class="note">${enough ? `${taggers} random player${taggers > 1 ? 's' : ''} will be IT; the other ${room.players.length - taggers} will run.` : `Freeze tag needs at least ${MIN_PLAYERS} players. Send your friends the invite link.`}</p>`
             : `<p class="sub">Waiting for the host to start…</p>`}
    ${musicButton()}`;
  panel.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => copy(b));
  bindViewPicker(); bindMusicButton(); bindCharPicker();
  if (isHost) panel.querySelectorAll('[data-map]').forEach(b => b.onclick = () => send({ t: 'map', map: b.dataset.map }));
  if (isHost) panel.querySelectorAll('[data-time]').forEach(b => b.onclick = () => send({ t: 'time', time: Number(b.dataset.time) }));
  if (isHost) document.getElementById('start').onclick = () => { ensureAudio(); send({ t: 'start' }); };
}

function copy(btn) {
  const text = btn.dataset.copy, input = btn.previousElementSibling;
  const done = () => { btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = 'Copy', 1500); };
  if (navigator.clipboard && isSecureContext) navigator.clipboard.writeText(text).then(done, () => {});
  else { input.select(); try { document.execCommand('copy'); done(); } catch {} }
}

function renderEnd() {
  const r = G.result, isHost = room.host === myId, meP = G.players.get(myId);
  const m = Math.floor(r.time / 60), s = Math.floor(r.time % 60);
  const iWon = meP && meP.role === r.winner;
  overlay.classList.remove('hidden');
  panel.innerHTML = `
    <p class="result" style="color:${r.winner === 'it' ? '#ff5252' : '#69f0ae'}">${r.winner === 'it' ? 'TAGGERS WIN' : 'RUNNERS WIN'}</p>
    <p class="sub">${esc(r.reason)} · ${m}:${String(s).padStart(2, '0')}${meP ? ` · You ${iWon ? 'won' : 'lost'} as ${meP.role === 'it' ? 'a tagger' : 'a runner'}.` : ''}</p>
    <ul class="plist">${[...r.stats].sort((a, b) => (a.role === 'it' ? -1 : 0) - (b.role === 'it' ? -1 : 0)).map(p => `<li><span class="dot" style="background:${COLORS[p.slot]}"></span>${esc(p.name)}
      <em style="color:${p.role === 'it' ? '#ff8a80' : '#9be7c4'}">${p.role === 'it' ? 'IT' : 'runner'}</em>
      <em>${p.role === 'it' ? `froze ${p.tags}` : `unfroze ${p.saves} · frozen ${p.timesFrozen}×${p.frozen ? ' · ended frozen' : ''}`}</em></li>`).join('')}</ul>
    ${isHost ? `<div class="row"><button class="go" id="again">Play again (new taggers)</button><button id="lobby">Back to lobby</button></div>`
             : `<p class="sub">Waiting for the host…</p>`}`;
  if (isHost) {
    document.getElementById('again').onclick = () => send({ t: 'start' });
    document.getElementById('lobby').onclick = () => send({ t: 'lobby' });
  }
}

function renderDisconnected() {
  overlay.classList.remove('hidden');
  panel.innerHTML = `<p class="result" style="color:#ff5252">Connection lost</p>
    <p class="sub">The server stopped or your network dropped.</p>
    <button class="go" onclick="location.reload()">Reconnect</button>`;
}

// ---------------------------------------------------------------- game state
let aim = Sh.START_YAW; // where your headlight points (map-space angle)

function initGame(m) {
  const meInfo = m.players.find(p => p.id === m.you);
  G = {
    grid: m.grid, n: m.players.length, roundTime: m.roundTime, hold: m.hold,
    floors: m.floors || [{ x0: 0, x1: COLS - 1 }], stairs: m.stairs || [], floor: -1,
    map: m.map || 'building', flights: m.flights || [], rooms: m.rooms || [], furniture: m.furniture || [], doors: m.doors || [], forest: m.forest || null, office: m.office || null, bright: !!m.office, fade: 0,
    players: new Map(), me: { x: meInfo.x, y: meInfo.y }, slot: meInfo.slot, role: meInfo.role, tpSeq: 0,
    time: 0, danger: 0,
    msgs: [], lastSent: 0, sentX: null, sentY: null, sentA: null, result: null, walk: 0, moving: false, flicker: 1, flip: 1,
  };
  for (const p of m.players)
    G.players.set(p.id, { ...p, rx: p.x, ry: p.y, tx: p.x, ty: p.y, ta: m.yaw ?? Sh.START_YAW, ra: m.yaw ?? Sh.START_YAW, fz: false, imm: false, rp: 0, tags: 0, walk: 0, flip: 1 });
  aim = m.yaw ?? Sh.START_YAW; pitch = 0;
  for (const d of G.doors) d.swing = doorSwing(G, d);
  G.doorOpen = new Float32Array(G.doors.length);
  renderMaps();
  if (v3d) v3d.build(G);
}

function applySnapshot(s) {
  G.chase = !!s.chase;
  G.time = s.time; G.danger = s.danger;
  const seen = new Set();
  for (const sp of s.players) {
    const p = G.players.get(sp.id);
    if (!p) continue;
    seen.add(sp.id);
    Object.assign(p, { tx: sp.x, ty: sp.y, ta: sp.a, fz: sp.fz, imm: sp.imm, rp: sp.rp, tags: sp.tags });
  }
  for (const id of [...G.players.keys()]) if (!seen.has(id)) G.players.delete(id); // someone left
  G.n = G.players.size;
}
const isTeammate = p => p.role === G.role;

function addMsg(text, color = '#fff', dur = 3) { G.msgs.push({ text, color, t: dur }); if (G.msgs.length > 3) G.msgs.shift(); }

// ---------------------------------------------------------------- input
const keys = new Set();
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  keys.add(e.code);
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyM' && !e.repeat) setMusic(!musicOn);
  if (e.code === 'KeyV' && !e.repeat && G && ui === 'play') {
    const i = VIEWS.findIndex(v => v[0] === viewMode);
    setView(VIEWS[(i + 1) % VIEWS.length][0]);
  }
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('pointerdown', () => { if (musicOn && music.paused) music.play().catch(() => {}); });
addEventListener('blur', () => keys.clear());

cvs.addEventListener('mousedown', () => {
  ensureAudio();
  // 3D views: click to capture the mouse for looking around
  if (viewMode !== 'top' && ui === 'play' && !document.pointerLockElement && cvs.requestPointerLock) {
    try { const r = cvs.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch {}
  }
});
addEventListener('mousemove', e => {
  if (document.pointerLockElement !== cvs || viewMode === 'top' || ui !== 'play') return;
  aim += e.movementX * 0.0025;
  pitch = Math.max(-0.7, Math.min(0.7, pitch - e.movementY * 0.0025));
});

// touch: drag anywhere to move
let joy = null;
cvs.addEventListener('touchstart', e => {
  ensureAudio();
  const t = e.changedTouches[0];
  if (!joy) joy = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
  e.preventDefault();
}, { passive: false });
cvs.addEventListener('touchmove', e => {
  for (const t of e.changedTouches) if (joy && t.identifier === joy.id) { joy.x = t.clientX; joy.y = t.clientY; }
  e.preventDefault();
}, { passive: false });
const endTouch = e => { for (const t of e.changedTouches) if (joy && t.identifier === joy.id) joy = null; };
cvs.addEventListener('touchend', endTouch); cvs.addEventListener('touchcancel', endTouch);

function inputVector() {
  let mx = 0, my = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx--;
  if (keys.has('KeyD') || keys.has('ArrowRight')) mx++;
  if (keys.has('KeyW') || keys.has('ArrowUp')) my--;
  if (keys.has('KeyS') || keys.has('ArrowDown')) my++;
  if (joy) {
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy, l = Math.hypot(dx, dy);
    if (l > 12) { const k = Math.min(1, l / 50); mx = dx / l * k; my = dy / l * k; }
  }
  const l = Math.hypot(mx, my);
  return l > 1 ? [mx / l, my / l] : [mx, my];
}

const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

// ---------------------------------------------------------------- audio (background music, heartbeat when a tagger is near)
let actx = null, nextBeat = 0;
const MUSIC_VOL = 0.35;
const music = new Audio('music.mp3'); music.loop = true; music.volume = MUSIC_VOL;
let musicOn = store.get('kb-music') !== 'off';
// chase sound: loops while a tagger is close behind you, louder the closer they get
const chase = new Audio('chase.mp3'); chase.loop = true; chase.volume = 0;
function ensureAudio() {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
  } catch {}
  if (musicOn && music.paused) music.play().catch(() => {}); // browsers only allow this after a click or key press
}
function setMusic(on) {
  musicOn = on; store.set('kb-music', on ? 'on' : 'off');
  if (on) music.play().catch(() => {}); else music.pause();
  document.querySelectorAll('[data-music]').forEach(b => b.textContent = musicLabel());
  if (G && ui === 'play') addMsg(on ? 'Music on' : 'Music off', '#b9b5d6', 1.5);
}
const musicLabel = () => musicOn ? '♪ Music: on' : '♪ Music: off';
function musicButton() { return `<button data-music style="margin-top:12px">${musicLabel()}</button>`; }
function bindMusicButton() { panel.querySelectorAll('[data-music]').forEach(b => b.onclick = () => setMusic(!musicOn)); }
function thump(time, vol) {
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(75, time); o.frequency.exponentialRampToValueAtTime(38, time + 0.16);
  g.gain.setValueAtTime(0.0001, time); g.gain.exponentialRampToValueAtTime(vol, time + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
  o.connect(g).connect(actx.destination); o.start(time); o.stop(time + 0.25);
}
function heartbeat() {
  if (!actx || actx.state !== 'running' || !G || ui !== 'play' || G.danger < 0.05) return;
  const now = actx.currentTime;
  if (now < nextBeat) return;
  const v = 0.12 + 0.5 * G.danger;
  thump(now, v); thump(now + 0.17, v * 0.7);
  nextBeat = now + 1.15 - 0.7 * G.danger;
}

// ---------------------------------------------------------------- update
function update(dt) {
  if (!G) return;
  G.time += dt; // (corrected by every snapshot; this keeps the clock smooth in between)
  for (const m of G.msgs) m.t -= dt;
  G.msgs = G.msgs.filter(m => m.t > 0);
  const k = 1 - Math.exp(-dt * 14);
  for (const p of G.players.values()) {
    const moving = Math.hypot(p.tx - p.rx, p.ty - p.ry) > 0.8;
    p.rx += (p.tx - p.rx) * k; p.ry += (p.ty - p.ry) * k; p.ra = lerpAngle(p.ra, p.ta, k);
    const c = Math.cos(p.ta); if (Math.abs(c) > 0.3) p.flip = c < 0 ? -1 : 1; // walking straight up/down keeps their last side
    p.walk = moving ? p.walk + dt * 12 : 0;
  }
  G.fade = Math.max(0, G.fade - dt * 2.2);
  // doors swing open when anyone comes close, and fall shut after
  if (G.doors.length) {
    const near = [G.me, ...[...G.players.values()].map(p => ({ x: p.rx, y: p.ry }))];
    G.doors.forEach((d, i) => {
      const cx = center(d.x), cy = center(d.y), want = near.some(o => Math.abs(o.x - cx) < TILE * 1.3 && Math.abs(o.y - cy) < TILE * 1.3) ? 1 : 0;
      G.doorOpen[i] += (want - G.doorOpen[i]) * Math.min(1, dt * (want ? 6 : 2.5));
    });
  }
  // the headlight flickers when a tagger is close
  G.flicker = G.danger > 0.4 && Math.random() < G.danger * 0.2 ? 0.35 : 1;
  heartbeat();
  const chasing = G.chase && ui === 'play';
  // music gets quieter when a tagger is near (and while one chases you), so you hear the heartbeat and the chase sound
  music.volume += (MUSIC_VOL * (1 - 0.7 * G.danger) * (chasing ? 0.4 : 1) - music.volume) * Math.min(1, dt * 3);
  const chaseVol = chasing ? 0.55 + 0.45 * G.danger : 0;
  chase.volume = Math.max(0, Math.min(1, chase.volume + (chaseVol - chase.volume) * Math.min(1, dt * (chasing ? 6 : 2.5))));
  if (chasing && chase.paused) chase.play().catch(() => {});
  else if (!chasing && !chase.paused && chase.volume < 0.02) { chase.pause(); chase.currentTime = 0; }

  const meP = G.players.get(myId);
  G.moving = false;
  if (G.floors.length > 1) {
    const f = Sh.floorOf(G.floors, G.me.x);
    if (f !== G.floor) { if (G.floor >= 0) addMsg(`Floor ${f + 1}`, '#ffe9a8', 1.5); G.floor = f; }
  }
  if (ui !== 'play' || !meP) return;
  // frozen runners can't move (but can still turn and look around), and taggers wait out the head start
  const stuck = meP.fz || (G.role === 'it' && G.time < G.hold);
  let mx, my;
  if (viewMode === 'top') {
    [mx, my] = inputVector();
    // A/D (or ←/→) turn you left/right; the headlight points the way you're walking
    if (mx) G.flip = mx < 0 ? -1 : 1;
    if (mx || my) aim = lerpAngle(aim, Math.atan2(my, mx), 1 - Math.exp(-dt * 12));
  } else {
    // 3D views: W/S walk where you face, A/D step sideways, ←/→ or Q/E turn (the mouse turns too)
    let fwd = 0, side = 0, turn = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) fwd++;
    if (keys.has('KeyS') || keys.has('ArrowDown')) fwd--;
    if (keys.has('KeyD')) side++;
    if (keys.has('KeyA')) side--;
    if (keys.has('ArrowRight') || keys.has('KeyE')) turn++;
    if (keys.has('ArrowLeft') || keys.has('KeyQ')) turn--;
    if (joy) { // touch: drag up/down to walk, left/right to turn
      const dx = joy.x - joy.ox, dy = joy.y - joy.oy;
      if (Math.abs(dy) > 12) fwd = Math.max(-1, Math.min(1, -dy / 50));
      if (Math.abs(dx) > 12) turn = Math.max(-1, Math.min(1, dx / 60));
    }
    aim += turn * 2.6 * dt;
    const c = Math.cos(aim), s = Math.sin(aim);
    mx = c * fwd - s * side; my = s * fwd + c * side;
    const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
    if (c > 0.3) G.flip = 1; else if (c < -0.3) G.flip = -1;
  }
  if ((mx || my) && !stuck) {
    const bx = G.me.x, by = G.me.y, speed = PLAYER_SPEED * (G.role === 'it' ? TAGGER_SPEED : 1);
    Sh.moveCircle(G, G.me, mx * speed * dt, my * speed * dt, PLAYER_R);
    G.moving = G.me.x !== bx || G.me.y !== by;
  }
  G.walk = G.moving ? G.walk + dt * 12 : 0;
  aim = Math.atan2(Math.sin(aim), Math.cos(aim)); // keep it in -PI..PI

  const now = performance.now();
  const turned = G.sentA === null || Math.abs(aim - G.sentA) > 0.03;
  if (now - G.lastSent > 50 && (G.me.x !== G.sentX || G.me.y !== G.sentY || turned)) {
    send({ t: 'pos', x: Math.round(G.me.x * 10) / 10, y: Math.round(G.me.y * 10) / 10, a: Math.round(aim * 100) / 100, s: G.tpSeq });
    G.lastSent = now; G.sentX = G.me.x; G.sentY = G.me.y; G.sentA = aim;
  }
}

// ---------------------------------------------------------------- line of sight
// distance a ray travels from (ox, oy) before hitting a wall (grid DDA), capped at maxD
function castRay(ox, oy, ang, maxD) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  let tx = Math.floor(ox / TILE), ty = Math.floor(oy / TILE);
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
  const ddx = Math.abs(TILE / dx), ddy = Math.abs(TILE / dy);
  let nx = dx > 0 ? ((tx + 1) * TILE - ox) / dx : dx < 0 ? (tx * TILE - ox) / dx : Infinity;
  let ny = dy > 0 ? ((ty + 1) * TILE - oy) / dy : dy < 0 ? (ty * TILE - oy) / dy : Infinity;
  for (;;) {
    let t;
    if (nx < ny) { t = nx; nx += ddx; tx += sx; } else { t = ny; ny += ddy; ty += sy; }
    if (t >= maxD) return maxD;
    if (Sh.blocksLight(G, tx, ty)) return t;
  }
}
const hasLOS = (a, b) => { const d = dist(a, b); return castRay(a.x, a.y, Math.atan2(b.y - a.y, b.x - a.x), d) >= d - 1; };

// the area a viewer can see: polygon points from casting rays between two angles
function visPoly(o, a0, a1, n, r) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * i / n, d = Math.min(r, castRay(o.x, o.y, a, r) + 10); // +10 lights the wall's edge
    pts.push(o.x + Math.cos(a) * d, o.y + Math.sin(a) * d);
  }
  return pts;
}
function isLit(view, pt) {
  const d = dist(view, pt);
  if (G.bright) return d <= R_BRIGHT && hasLOS(view, pt);
  if (d > R_FAR || !hasLOS(view, pt)) return false;
  if (d < R_NEAR) return true;
  return Math.abs(Math.atan2(Math.sin(Math.atan2(pt.y - view.y, pt.x - view.x) - view.a), Math.cos(Math.atan2(pt.y - view.y, pt.x - view.x) - view.a))) < CONE;
}

// ---------------------------------------------------------------- map rendering (prerendered once per game)
let mapCanvas, miniCanvas;
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = v => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}
function renderMaps() {
  mapCanvas = document.createElement('canvas');
  mapCanvas.width = COLS * TILE; mapCanvas.height = ROWS * TILE;
  const m = mapCanvas.getContext('2d');
  const FACE = 14; // visible front face of walls, for a bit of depth
  if (G.map === 'apartment') drawApartmentMap(m, G);
  else if (G.map === 'forest') drawForestMap(m, G);
  else if (G.map === 'office') drawOfficeMap(m, G);
  else for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const px = x * TILE, py = y * TILE;
    if (G.grid[y][x] === 0) {
      m.fillStyle = (x + y) % 2 ? '#2b2a38' : '#2e2d3c'; m.fillRect(px, py, TILE, TILE);
      m.strokeStyle = 'rgba(0,0,0,.25)'; m.lineWidth = 1; m.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
      m.fillStyle = 'rgba(255,255,255,.035)'; m.fillRect(px + 4, py + 4, TILE - 8, 2);
      if (y > 0 && G.grid[y - 1][x] === 1) { m.fillStyle = 'rgba(0,0,0,.35)'; m.fillRect(px, py, TILE, 7); } // shadow under a wall
    } else {
      const faceShown = y + 1 < ROWS && G.grid[y + 1][x] === 0;
      m.fillStyle = '#4a4466'; m.fillRect(px, py, TILE, TILE);
      m.fillStyle = '#56507a'; m.fillRect(px, py, TILE, 3);
      if (faceShown) {
        const fy = py + TILE - FACE;
        m.fillStyle = '#2f2a45'; m.fillRect(px, fy, TILE, FACE);
        m.strokeStyle = '#231f36'; m.lineWidth = 1;
        m.beginPath(); m.moveTo(px, fy + FACE / 2 + 0.5); m.lineTo(px + TILE, fy + FACE / 2 + 0.5);
        const off = x % 2 ? TILE / 2 : TILE / 4;
        m.moveTo(px + off + 0.5, fy); m.lineTo(px + off + 0.5, fy + FACE / 2);
        m.moveTo(px + (off + TILE / 2) % TILE + 0.5, fy + FACE / 2); m.lineTo(px + (off + TILE / 2) % TILE + 0.5, fy + FACE);
        m.stroke();
      }
    }
  }
  // staircases: steps, with an arrow for up or down (the apartment draws its own flights)
  if (G.map !== 'apartment') for (const s of G.stairs) {
    const px = s.x * TILE, py = s.y * TILE;
    for (let i = 0; i < 5; i++) {
      const k = s.up ? 0.55 + i * 0.12 : 1 - i * 0.16;
      m.fillStyle = shade('#6a6488', k); m.fillRect(px + 3, py + 3 + i * 7, TILE - 6, 6);
    }
    m.fillStyle = s.up ? '#ffe9a8' : '#b9b5d6'; m.font = 'bold 16px system-ui'; m.textAlign = 'center'; m.textBaseline = 'middle';
    m.fillText(s.up ? '▲' : '▼', px + TILE / 2, py + TILE / 2);
  }
  miniCanvas = document.createElement('canvas');
  miniCanvas.width = COLS * MINI; miniCanvas.height = ROWS * MINI;
  const n = miniCanvas.getContext('2d');
  n.fillStyle = '#0e0e18'; n.fillRect(0, 0, miniCanvas.width, miniCanvas.height);
  n.fillStyle = '#3a3654';
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (G.grid[y][x] === 1) n.fillRect(x * MINI, y * MINI, MINI, MINI);
  if (G.forest) { n.fillStyle = '#1f3a24'; for (const t of G.forest.trees) n.fillRect(t.x * MINI, t.y * MINI, MINI, MINI); } // trees
  n.fillStyle = '#ffe9a8';
  for (const s of G.stairs) n.fillRect(s.x * MINI, s.y * MINI, MINI, MINI);
  n.fillStyle = 'rgba(255,233,168,.45)';
  for (const f of G.flights) n.fillRect(f.x * MINI, f.y0 * MINI, MINI, (f.y1 - f.y0 + 1) * MINI);
}

// ---------------------------------------------------------------- sprites
function roundRect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

// clay people: soft, rounded little plasticine figures, lit from the top-left. Their clothes are in the
// player's color; skin tone and hair come from their slot (Sh.look), so everyone looks a bit different.
const look = Sh.look;
// a gradient that makes a flat shape look like a soft lump of clay
function clayFill(c, x, y, r, base) {
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.1, x, y, r * 1.15);
  g.addColorStop(0, shade(base, 1.2)); g.addColorStop(0.55, base); g.addColorStop(1, shade(base, 0.72));
  return g;
}
// `kind` is 'man' or 'woman'; `flip` is -1 facing left, 1 facing right
function drawPerson(c, kind, x, y, color, flip, walk, alpha = 1, slot = 0) {
  const s = Math.sin(walk) * 2.5, bob = walk ? Math.abs(Math.cos(walk)) * 1.5 : 0;
  const { skin, hair } = look(slot), ink = 'rgba(45,30,25,.45)', woman = kind === 'woman';
  c.save(); c.translate(x, y); c.globalAlpha *= alpha;
  c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(0, 15, 11, 4, 0, 0, Math.PI * 2); c.fill();
  c.scale(flip * 1.2, 1.2); c.translate(0, -bob - 2);
  c.lineJoin = 'round'; c.lineCap = 'round';
  // legs (trousers for him, bare legs under a dress for her) and shoes
  c.strokeStyle = woman ? shade(skin, 0.9) : '#4b566b'; c.lineWidth = woman ? 3.4 : 4.6;
  c.beginPath(); c.moveTo(-3, 4); c.lineTo(-3.5 + s, 12.5); c.moveTo(3, 4); c.lineTo(3.5 - s, 12.5); c.stroke();
  c.fillStyle = woman ? shade(color, 0.6) : '#3a2c26';
  c.beginPath(); c.ellipse(-2.5 + s, 13.8, 3.6, 2.1, 0, 0, Math.PI * 2); c.ellipse(4.5 - s, 13.8, 3.6, 2.1, 0, 0, Math.PI * 2); c.fill();
  // her hair falls down her back, behind everything else
  if (woman) { c.fillStyle = clayFill(c, -3, -12, 9, hair); c.beginPath(); c.ellipse(-3.5, -12, 6.5, 10, 0.15, 0, Math.PI * 2); c.fill(); }
  // back arm
  c.strokeStyle = shade(skin, 0.82); c.lineWidth = 3.4;
  c.beginPath(); c.moveTo(-6.5, -6); c.quadraticCurveTo(-9, -1, -8.5 - s * 0.6, 3.5); c.stroke();
  // body: a rounded shirt for him, a flared dress for her
  c.fillStyle = clayFill(c, 0, -3, 12, color); c.strokeStyle = ink; c.lineWidth = 1.2;
  c.beginPath();
  if (woman) { c.moveTo(-6, -9); c.quadraticCurveTo(0, -11, 6, -9); c.quadraticCurveTo(7, 0, 9.5, 7); c.quadraticCurveTo(0, 9.5, -9.5, 7); c.quadraticCurveTo(-7, 0, -6, -9); }
  else roundRect(c, -7.5, -10, 15, 15.5, 6);
  c.closePath(); c.fill(); c.stroke();
  if (!woman) { c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(-7, 3, 14, 2.5); } // belt line
  // front arm: a sleeve in the shirt color, then the hand
  c.strokeStyle = shade(color, 0.9); c.lineWidth = 4;
  c.beginPath(); c.moveTo(6, -7); c.quadraticCurveTo(8.5, -4, 8.8 + s * 0.4, -1.5); c.stroke();
  c.strokeStyle = skin; c.lineWidth = 3.4;
  c.beginPath(); c.moveTo(8.8 + s * 0.4, -1.5); c.lineTo(9 + s * 0.6, 3.5); c.stroke();
  // neck and head
  c.fillStyle = shade(skin, 0.88); c.fillRect(-2, -12.5, 4, 3.5);
  c.fillStyle = clayFill(c, 0, -18, 8, skin); c.strokeStyle = ink; c.lineWidth = 1.1;
  c.beginPath(); c.arc(0, -18, 7.6, 0, Math.PI * 2); c.fill(); c.stroke();
  // hair on top: short for him, with a fringe and fuller sides for her
  c.fillStyle = clayFill(c, -1, -22, 8, hair);
  c.beginPath();
  if (woman) { c.arc(0, -18.5, 8.1, Math.PI * 0.92, Math.PI * 2.08); c.quadraticCurveTo(4, -21, -2, -19.5); c.quadraticCurveTo(-6, -17, -8, -13); }
  else { c.arc(0, -18.5, 7.9, Math.PI * 0.98, Math.PI * 2.02); c.quadraticCurveTo(2, -22.5, -7.6, -18); }
  c.closePath(); c.fill();
  // face on the side they're facing: eyes, a rosy cheek, a little smile
  c.fillStyle = '#2a1d18';
  c.beginPath(); c.ellipse(3, -17.6, 1.05, 1.4, 0, 0, Math.PI * 2); c.ellipse(6.2, -17.6, 1.05, 1.4, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(230,110,110,.35)'; c.beginPath(); c.arc(5, -14.8, 1.8, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(60,30,25,.7)'; c.lineWidth = 0.9; c.beginPath(); c.arc(5.2, -15.3, 1.6, 0.3, Math.PI - 0.6); c.stroke();
  // a headlamp on a strap in the player's color
  c.strokeStyle = color; c.lineWidth = 1.8;
  c.beginPath(); c.arc(0, -18, 7.6, Math.PI * 1.1, Math.PI * 1.95); c.stroke();
  c.fillStyle = '#5a5470'; c.beginPath(); c.arc(7, -22.3, 2.1, 0, Math.PI * 2); c.fill();
  c.shadowColor = '#ffe9a8'; c.shadowBlur = 7; c.fillStyle = '#fff3c4'; c.beginPath(); c.arc(8.2, -22.3, 1.3, 0, Math.PI * 2); c.fill();
  c.restore();
}

const CHARS = [['man', 'Man'], ['woman', 'Woman']];

// what goes around a character on top of the body: the tagger's red glow and IT badge, ice around a frozen
// runner (with the unfreeze progress ring), and the brief shimmer of a runner who was just unfrozen
function drawTagMarks(p, x, y, t) {
  if (p.role === 'it') {
    ctx.save();
    const pulse = 0.65 + 0.35 * Math.sin(t * 6);
    ctx.strokeStyle = `rgba(255,60,60,${0.8 * pulse})`; ctx.lineWidth = 3; ctx.shadowColor = '#ff3b3b'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.ellipse(x, y + 15, 17, 6.5, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  if (p.fz) {
    ctx.save();
    const g = ctx.createLinearGradient(x - 16, y - 40, x + 16, y + 18);
    g.addColorStop(0, 'rgba(225,248,255,.55)'); g.addColorStop(1, 'rgba(120,200,240,.45)');
    ctx.fillStyle = g; roundRect(ctx, x - 16, y - 42, 32, 60, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(x - 11, y - 37, 4, 22); ctx.fillRect(x - 5, y - 37, 2, 10); // glints
    if (p.rp > 0) { // a friend is thawing them out
      ctx.strokeStyle = '#69f0ae'; ctx.lineWidth = 3.5; ctx.shadowColor = '#69f0ae'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(x, y - 12, 25, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, p.rp)); ctx.stroke();
    }
    ctx.restore();
  }
}

function nameTag(text, x, y, color) {
  ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}

// ---------------------------------------------------------------- frame
// you always see through your own eyes (frozen runners included: they can still turn and look around)
function getView() { return { x: G.me.x, y: G.me.y, a: aim, id: myId }; }
// Who you can see: yourself, and anyone in your light. Your teammates also show through the dark as a ring
// and a name (so runners can find frozen friends), but the other side only shows up when you can actually see them.
const posOf = (id, p) => id === myId ? { x: G.me.x, y: G.me.y } : { x: p.rx, y: p.ry };
const canSee = (view, id, p, pos) => id === myId || isLit(view, pos);

// first / third person: same visibility rules as top-down, drawn in 3D by view3d.js
function draw3D(t) {
  const view = getView();
  const players = new Map();
  for (const [id, p] of G.players) {
    const pos = posOf(id, p), self = id === myId;
    players.set(id, {
      ...pos, a: self ? aim : p.ra, walk: self ? G.walk : p.walk, role: p.role, fz: p.fz, imm: p.imm, rp: p.rp,
      show: canSee(view, id, p, pos), mark: !self && isTeammate(p), h: Sh.stairHeight(G.flights, pos.x, pos.y),
    });
  }
  v3d.render({
    G, view, t, mode: viewMode, players,
    pitch, flicker: G.flicker, walk: G.walk, viewH: Sh.stairHeight(G.flights, view.x, view.y),
    backRoom: castRay(view.x, view.y, view.a + Math.PI, 2.2 * TILE), // room behind you for the third-person camera
  });
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cvs.width, cvs.height);
}

function drawWorld(t) {
  const view = getView();
  const T = (c, s) => c.setTransform(DPR * Z * s, 0, 0, DPR * Z * s, DPR * (W / 2 - view.x * Z), DPR * (H / 2 - view.y * Z));

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#07070d'; ctx.fillRect(0, 0, W, H);
  T(ctx, 1);
  ctx.drawImage(mapCanvas, 0, 0);
  if (G.doors.length) drawDoors2D(ctx, G);

  // everyone you can see, sorted by y so characters lower on screen draw in front
  const actors = [];
  for (const [id, p] of G.players) {
    const pos = posOf(id, p), self = id === myId;
    if (!canSee(view, id, p, pos)) continue;
    actors.push({ y: pos.y, draw: () => {
      const blink = p.imm && Math.floor(t * 10) % 2; // just unfrozen: can't be tagged for a moment
      drawPerson(ctx, p.char, pos.x, pos.y, p.fz ? shade(COLORS[p.slot], 0.75) : COLORS[p.slot], self ? G.flip : p.flip, self ? G.walk : p.walk, blink ? 0.45 : 1, p.slot);
      drawTagMarks(p, pos.x, pos.y, t);
    } });
  }
  actors.sort((a, b) => a.y - b.y).forEach(a => a.draw());

  // darkness: everything outside your light. Walls block the light.
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.globalCompositeOperation = 'source-over';
  mctx.clearRect(0, 0, mask.width, mask.height);
  if (G.bright) { // lights on: what you can't see from here is only dimmed, and there's no beam to aim
    mctx.fillStyle = 'rgba(20,24,34,0.5)'; mctx.fillRect(0, 0, mask.width, mask.height);
    T(mctx, 1);
    mctx.globalCompositeOperation = 'destination-out';
    const gb = mctx.createRadialGradient(view.x, view.y, R_BRIGHT * 0.7, view.x, view.y, R_BRIGHT);
    gb.addColorStop(0, 'rgba(0,0,0,1)'); gb.addColorStop(1, 'rgba(0,0,0,0)');
    fillPoly(mctx, visPoly(view, 0, Math.PI * 2, 240, R_BRIGHT), gb);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(mask, 0, 0);
    T(ctx, 1);
    drawOfficeLamps(ctx, G);
  } else {
    mctx.fillStyle = 'rgba(4,4,10,0.9)'; mctx.fillRect(0, 0, mask.width, mask.height);
    T(mctx, 1);
    mctx.globalCompositeOperation = 'destination-out';
    const near = visPoly(view, 0, Math.PI * 2, 160, R_NEAR);
    const gn = mctx.createRadialGradient(view.x, view.y, R_NEAR * 0.55, view.x, view.y, R_NEAR);
    gn.addColorStop(0, 'rgba(0,0,0,1)'); gn.addColorStop(1, 'rgba(0,0,0,0)');
    fillPoly(mctx, near, gn);
    const fl = G.flicker;
    const cone = [view.x, view.y, ...visPoly(view, view.a - CONE, view.a + CONE, 60, R_FAR)];
    const gc = mctx.createRadialGradient(view.x, view.y, 0, view.x, view.y, R_FAR);
    gc.addColorStop(0, `rgba(0,0,0,${0.95 * fl})`); gc.addColorStop(0.6, `rgba(0,0,0,${0.75 * fl})`); gc.addColorStop(1, 'rgba(0,0,0,0)');
    fillPoly(mctx, cone, gc);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(mask, 0, 0);
    // a warm tint inside the headlight beam
    T(ctx, 1);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const warm = ctx.createRadialGradient(view.x, view.y, 0, view.x, view.y, R_FAR);
    warm.addColorStop(0, `rgba(255,220,150,${0.12 * fl})`); warm.addColorStop(1, 'rgba(255,220,150,0)');
    fillPoly(ctx, cone, warm);
    ctx.restore();
  }

  if (G.forest) drawForestGlow(ctx, G, t); // the campfire and fireflies glow through the dark
  // on top of the dark: names of everyone you can see, and your teammates' markers wherever they are
  for (const [id, p] of G.players) {
    const pos = posOf(id, p), self = id === myId, seen = canSee(view, id, p, pos), mate = !self && isTeammate(p);
    if (!seen && !mate) continue;
    const col = p.role === 'it' ? '#ff6b6b' : self ? '#fff' : COLORS[p.slot];
    if (mate && !seen) { // a teammate out of sight: a ring (icy blue if they're frozen) where they are
      ctx.strokeStyle = p.fz ? '#7fd4ff' : COLORS[p.slot]; ctx.globalAlpha = 0.7; ctx.lineWidth = p.fz ? 3 : 2;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, 18, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      if (p.fz) { ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#bfefff'; ctx.fillText('❄', pos.x, pos.y); }
    }
    nameTag(p.role === 'it' ? `${p.name} · IT` : p.fz ? `${p.name} · frozen` : p.name, pos.x, pos.y - 46, col);
  }
  if (G.floors.length > 1) { // other floors are out of sight: black out everything beyond this floor's walls
    const f = G.floors[Sh.floorOf(G.floors, view.x)];
    ctx.beginPath(); ctx.rect(-1e4, -1e4, 2e4 + COLS * TILE, 2e4 + ROWS * TILE);
    ctx.rect((f.x0 - 1) * TILE, 0, (f.x1 - f.x0 + 3) * TILE, ROWS * TILE);
    ctx.fillStyle = '#07070d'; ctx.fill('evenodd');
  }
  return view;
}

function fillPoly(c, pts, style) {
  c.beginPath(); c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath(); c.fillStyle = style; c.fill();
}

// ---------------------------------------------------------------- HUD
function drawMinimap(x, y) {
  ctx.save(); ctx.translate(x, y);
  ctx.globalAlpha = 0.85; ctx.drawImage(miniCanvas, 0, 0); ctx.globalAlpha = 1;
  for (const [id, p] of G.players) { // your teammates (frozen ones as an icy ring)
    if (id === myId || !isTeammate(p)) continue;
    const px = p.rx / TILE * MINI, py = p.ry / TILE * MINI;
    if (p.fz) { ctx.strokeStyle = '#7fd4ff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px, py, 3.2, 0, Math.PI * 2); ctx.stroke(); }
    else { ctx.fillStyle = COLORS[p.slot]; ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2); ctx.fill(); }
  }
  // you: an arrow showing where your headlight points
  ctx.save(); ctx.translate(G.me.x / TILE * MINI, G.me.y / TILE * MINI); ctx.rotate(aim + Math.PI / 2);
  ctx.fillStyle = G.role === 'it' ? '#ff5252' : COLORS[G.slot]; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(3.5, 3); ctx.lineTo(-3.5, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = '#2c2a40'; ctx.lineWidth = 1; ctx.strokeRect(0, 0, COLS * MINI, ROWS * MINI);
  if (G.floors.length > 1) { // floor labels under the minimap; yours is highlighted
    ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    G.floors.forEach((f, i) => {
      ctx.fillStyle = i === G.floor ? '#ffe9a8' : '#6d6a85';
      ctx.fillText(`${i + 1}F`, (f.x0 + f.x1 + 1) / 2 * MINI, ROWS * MINI + 3);
    });
  }
  ctx.restore();
}

function drawStatus(meP) {
  const w = Math.min(320, W - 24), x = 12, y = H - 72, it = G.role === 'it';
  ctx.fillStyle = 'rgba(10,10,20,.8)'; roundRect(ctx, x, y, w, 60, 8); ctx.fill();
  ctx.fillStyle = it ? '#ff5252' : COLORS[meP.slot]; ctx.fillRect(x, y, 4, 60);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 14px system-ui'; ctx.fillStyle = COLORS[meP.slot];
  ctx.fillText(meP.name, x + 14, y + 20);
  let status, col;
  if (it) { status = G.time < G.hold ? 'IT · WAIT' : 'IT'; col = '#ff5252'; }
  else if (meP.fz) { status = 'FROZEN'; col = '#7fd4ff'; }
  else if (meP.imm) { status = 'SAFE FOR A MOMENT'; col = '#b388ff'; }
  else { status = 'RUNNER'; col = '#69f0ae'; }
  ctx.font = 'bold 12px system-ui'; ctx.fillStyle = col; ctx.textAlign = 'right'; ctx.fillText(status, x + w - 10, y + 20); ctx.textAlign = 'left';
  ctx.font = '13px system-ui'; ctx.fillStyle = '#e8e6f0';
  let hint;
  if (it) hint = G.time < G.hold ? `Get ready… you can move in ${Math.ceil(G.hold - G.time)}s` : `Touch runners to freeze them · frozen so far: ${meP.tags}`;
  else if (meP.fz) hint = meP.rp > 0 ? `A friend is unfreezing you… ${Math.round(meP.rp * 100)}%` : 'Wait for a friend to stand next to you';
  else hint = 'Stand next to frozen friends to unfreeze them';
  ctx.fillText(hint, x + 14, y + 44);
}

function drawHud(t) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const meP = G.players.get(myId);
  if (!meP) return;
  if (G.fade > 0) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, G.fade * 1.3)})`; ctx.fillRect(0, 0, W, H); } // taking the stairs
  if (G.danger > 0) { // red pulsing vignette: a tagger is close
    const k = G.danger, pulse = 0.6 + 0.4 * Math.sin(t * (5 + 9 * k));
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    vg.addColorStop(0, 'rgba(255,0,40,0)'); vg.addColorStop(1, `rgba(255,0,40,${0.5 * k * pulse})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }
  if (meP.fz) { // frosty edges while you're frozen
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7);
    vg.addColorStop(0, 'rgba(160,220,255,0)'); vg.addColorStop(1, 'rgba(190,235,255,.55)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }
  drawMinimap(W - COLS * MINI - 10, 50);
  drawStatus(meP);

  // top bar: your role, how many runners are still free, and the time left
  const bw = Math.min(560, W - 20), bx = (W - bw) / 2;
  ctx.fillStyle = 'rgba(10,10,20,.88)'; roundRect(ctx, bx, 8, bw, 32, 8); ctx.fill();
  ctx.strokeStyle = '#2c2a40'; ctx.lineWidth = 1; ctx.stroke();
  ctx.font = `bold ${W < 480 ? 12 : 14}px system-ui`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  const cy = 24, cols = [bx + bw * 0.17, bx + bw * 0.5, bx + bw * 0.83];
  ctx.fillStyle = G.role === 'it' ? '#ff5252' : '#69f0ae'; ctx.fillText(G.role === 'it' ? "YOU'RE IT" : 'RUNNER', cols[0], cy);
  const runners = [...G.players.values()].filter(p => p.role === 'run'), free = runners.filter(p => !p.fz).length;
  ctx.fillStyle = '#c9e9ff'; ctx.fillText(`Free runners ${free}/${runners.length}`, cols[1], cy);
  const left = Math.max(0, G.roundTime - G.time), m = Math.floor(left / 60), s = Math.floor(left % 60);
  ctx.fillStyle = left < 15 && Math.sin(t * 10) > 0 ? '#ff5252' : '#ffe9a8';
  ctx.fillText(G.time < G.hold ? `Taggers in ${Math.ceil(G.hold - G.time)}` : `${m}:${String(s).padStart(2, '0')} left`, cols[2], cy);

  // which view you're in, and how to switch
  ctx.font = '12px system-ui'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = 'rgba(201,198,218,.75)';
  const vName = VIEWS.find(v => v[0] === viewMode)[1];
  ctx.fillText(isTouch ? vName : `${vName} · V to switch view · M music ${musicOn ? 'off' : 'on'}`, W - 12, H - 14);
  if (viewMode !== 'top' && !isTouch && document.pointerLockElement !== cvs)
    ctx.fillText('Click to look around with the mouse', W - 12, H - 32);
  ctx.textAlign = 'center';
  G.msgs.forEach((mg, i) => {
    ctx.globalAlpha = Math.min(1, mg.t);
    ctx.font = `bold ${W < 480 ? 13 : 16}px system-ui`; ctx.fillStyle = mg.color;
    ctx.fillText(mg.text, W / 2, 62 + i * 24);
  });
  ctx.globalAlpha = 1;

  if (joy) { // touch joystick
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 50, 0, Math.PI * 2); ctx.stroke();
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy, l = Math.hypot(dx, dy), k = l > 50 ? 50 / l : 1;
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.beginPath(); ctx.arc(joy.ox + dx * k, joy.oy + dy * k, 20, 0, Math.PI * 2); ctx.fill();
  }
}

// ---------------------------------------------------------------- loop
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame); // first, so one bad frame can never stop the game loop
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const t = now / 1000;
  update(dt);
  if (!W || !H) return; // minimized or zero-size window: nothing to draw
  if (G && G.players.get(myId)) {
    if (viewMode !== 'top' && v3d && v3d.ready) draw3D(t); else drawWorld(t); // top-down until the 3D view has loaded
    drawHud(t);
  }
  else { ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = '#07070d'; ctx.fillRect(0, 0, W, H); }
}
setView(viewMode);
connect();
renderHome();
requestAnimationFrame(frame);
