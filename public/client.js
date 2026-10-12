const Sh = window.Shared;
const { TILE, COLS, ROWS, PLAYER_R, PLAYER_SPEED, SAFE_WARN, TEAM_LIVES, MAX_PLAYERS } = Sh.C;
const { center, dist } = Sh;
const COLORS = Sh.COLORS;
const MINI = 3;
// vision: a small glow all around you, plus a headlight cone that reaches further. Walls block both.
const R_NEAR = TILE * 2.2, R_FAR = TILE * 7.5, CONE = 0.5; // CONE = half-angle in radians
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
function bindViewPicker() {
  panel.querySelectorAll('[data-view]').forEach(b => b.onclick = () => {
    setView(b.dataset.view);
    panel.querySelectorAll('[data-view]').forEach(x => x.classList.toggle('on', x === b));
  });
}
addEventListener('resize', () => { if (v3d) v3d.resize(W, H, DPR); });

// ---------------------------------------------------------------- networking
let ws, myId = null, lan = [], ui = 'home', homeError = '';
const room = { code: null, host: null, players: [], state: null };
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
      room.host = m.host; room.players = m.players; room.state = m.state;
      if (m.state === 'lobby') { ui = 'lobby'; G = null; renderLobby(); }
      else if (ui === 'ended') renderEnd();
      break;
    case 'start':
      initGame(m); ui = 'play'; overlay.classList.add('hidden');
      break;
    case 's': if (G) applySnapshot(m); break;
    case 'tp': if (G) { G.me.x = m.x; G.me.y = m.y; G.tpSeq = m.s; } break;
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
    <p class="sub">Online co-op escape. Everyone plays on their own device.</p>
    <label for="name">Your name</label>
    <input id="name" maxlength="14" placeholder="Name" value="${esc(store.get('kb-name') || '')}" style="margin-bottom:14px">
    ${viewPicker()}
    <div class="cols">
      <div class="card"><h3>Host a game</h3><p>Create a room, then send the invite link to your friends.</p><button class="go" id="host">Host game</button></div>
      <div class="card"><h3>Join a game</h3><input id="code" class="code" maxlength="4" placeholder="CODE" value="${esc(code)}"><button class="go" id="join">Join</button></div>
    </div>
    <p class="err">${esc(homeError || v3dError)}</p>
    ${musicButton()}
    <details ${code ? '' : 'open'}><summary>How to play</summary><ul class="rules">
      <li>The gate has <b>one lock per player</b>. Each of you has a hidden key that <b>only you can see</b>.</li>
      <li>Find your key (watch the signal meter), carry it to the <b style="color:#b388ff">gate</b>, then escape once every lock is open.</li>
      <li>It's dark. You only see what your headlight shows, and walls block it. Listen for the heartbeat: the <b style="color:#ff5252">entity</b> is close.</li>
      <li><b style="color:#69f0ae">Safe zones</b> move every 10 seconds. The entity can't touch you inside one. Dashed outlines show where the next ones will appear.</li>
      <li>Getting caught costs a team life (3 total). You respawn and drop your key where you were caught.</li>
      <li><b>Top-down, PC:</b> move with WASD or the arrow keys; your headlight points the way you walk. <b>Phone:</b> drag anywhere to move.</li>
      <li><b>First / third person, PC:</b> click the game to look around with the mouse (Esc frees it). W/S walk, A/D step sideways, ←/→ or Q/E turn. <b>Phone:</b> drag up/down to walk, left/right to turn.</li>
      <li>Press <b>V</b> during a game to switch views, and <b>M</b> to turn the music on or off.</li>
    </ul></details>`;
  bindViewPicker(); bindMusicButton();
  const nameEl = document.getElementById('name'), codeEl = document.getElementById('code');
  const name = () => { const n = nameEl.value.trim(); store.set('kb-name', n); return n; };
  document.getElementById('host').onclick = () => { ensureAudio(); homeError = ''; send({ t: 'create', name: name() }); };
  const join = () => {
    ensureAudio();
    if (codeEl.value.trim().length !== 4) { homeError = 'Enter the 4-letter room code.'; return renderHome(); }
    homeError = ''; send({ t: 'join', code: codeEl.value, name: name() });
  };
  document.getElementById('join').onclick = join;
  codeEl.onkeydown = e => { if (e.key === 'Enter') join(); };
  (code ? codeEl : nameEl).focus();
  if (code && nameEl.value) document.getElementById('join').focus();
}

function renderLobby() {
  overlay.classList.remove('hidden');
  const isHost = room.host === myId;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const links = local && lan.length ? lan.map(u => `${u}/?room=${room.code}`) : [`${location.origin}${location.pathname}?room=${room.code}`];
  panel.innerHTML = `
    <p class="sub" style="margin-bottom:4px">Room code</p>
    <div class="bigcode">${esc(room.code)}</div>
    <label>Invite link</label>
    ${links.map(l => `<div class="linkrow"><input readonly value="${esc(l)}"><button data-copy="${esc(l)}">Copy</button></div>`).join('')}
    ${local ? `<p class="note">You're playing on <b>localhost</b>, so the link above is your local-network address. It works for friends on the same Wi-Fi. For friends elsewhere, use a tunnel link instead (see README).</p>` : ''}
    <div style="margin-top:18px">${viewPicker()}</div>
    <h3>Players (${room.players.length}/${MAX_PLAYERS})</h3>
    <ul class="plist">${room.players.map(p => `<li><span class="dot" style="background:${COLORS[p.slot]}"></span>${esc(p.name)}${p.id === room.host ? '<em>host</em>' : ''}${p.id === myId ? '<em>you</em>' : ''}</li>`).join('')}</ul>
    ${isHost ? `<button class="go" id="start">Start game</button><p class="note">The gate will need ${room.players.length} key${room.players.length > 1 ? 's' : ''}, one for each player.</p>`
             : `<p class="sub">Waiting for the host to start…</p>`}
    ${musicButton()}`;
  panel.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => copy(b));
  bindViewPicker(); bindMusicButton();
  if (isHost) document.getElementById('start').onclick = () => { ensureAudio(); send({ t: 'start' }); };
}

function copy(btn) {
  const text = btn.dataset.copy, input = btn.previousElementSibling;
  const done = () => { btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = 'Copy', 1500); };
  if (navigator.clipboard && isSecureContext) navigator.clipboard.writeText(text).then(done, () => {});
  else { input.select(); try { document.execCommand('copy'); done(); } catch {} }
}

function renderEnd() {
  const r = G.result, isHost = room.host === myId;
  const m = Math.floor(r.time / 60), s = Math.floor(r.time % 60);
  overlay.classList.remove('hidden');
  panel.innerHTML = `
    <p class="result" style="color:${r.won ? '#ffd54f' : '#ff5252'}">${r.won ? 'YOU ESCAPED!' : 'THE ENTITY GOT YOU'}</p>
    <p class="sub">Time ${m}:${String(s).padStart(2, '0')} · Locks opened ${esc(r.locks)}</p>
    <ul class="plist">${r.stats.map(p => `<li><span class="dot" style="background:${COLORS[p.slot]}"></span>${esc(p.name)}<em>${p.escaped ? 'escaped' : 'trapped'} · caught ${p.caught}×</em></li>`).join('')}</ul>
    ${isHost ? `<div class="row"><button class="go" id="again">Play again</button><button id="lobby">Back to lobby</button></div>`
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
    grid: m.grid, gate: { ...m.gate, open: false, ins: [] }, n: m.players.length,
    players: new Map(), me: { x: meInfo.x, y: meInfo.y }, slot: meInfo.slot, tpSeq: 0,
    time: 0, lives: TEAM_LIVES, zt: 10, zones: [], next: [], key: null, ent: null, danger: 0,
    msgs: [], lastSent: 0, sentX: null, sentY: null, sentA: null, result: null, walk: 0, moving: false, flicker: 1, flip: 1,
  };
  for (const p of m.players)
    G.players.set(p.id, { ...p, rx: p.x, ry: p.y, tx: p.x, ty: p.y, ta: Sh.START_YAW, ra: Sh.START_YAW, safe: false, inv: true, esc: false, ks: 'hidden', walk: 0, flip: 1 });
  aim = Sh.START_YAW; pitch = 0;
  renderMaps();
  if (v3d) v3d.build(G);
}

function applySnapshot(s) {
  G.chase = !!s.chase;
  G.time = s.time; G.lives = s.lives; G.zt = s.zt; G.zones = s.zones; G.next = s.next;
  G.gate.open = s.gate.open; G.gate.ins = s.gate.ins; G.key = s.key; G.danger = s.danger;
  const seen = new Set();
  for (const sp of s.players) {
    const p = G.players.get(sp.id);
    if (!p) continue;
    seen.add(sp.id);
    Object.assign(p, { tx: sp.x, ty: sp.y, ta: sp.a, safe: sp.safe, inv: sp.inv, esc: sp.esc, ks: sp.ks });
  }
  for (const id of [...G.players.keys()]) if (!seen.has(id)) G.players.delete(id); // someone left
  G.n = G.players.size;
  if (s.e) {
    if (!G.ent) G.ent = { rx: s.e.x, ry: s.e.y };
    Object.assign(G.ent, { tx: s.e.x, ty: s.e.y, stun: s.e.stun });
  } else G.ent = null;
}

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

// ---------------------------------------------------------------- audio (background music, heartbeat when the entity is near)
let actx = null, nextBeat = 0;
const MUSIC_VOL = 0.35;
const music = new Audio('music.mp3'); music.loop = true; music.volume = MUSIC_VOL;
let musicOn = store.get('kb-music') !== 'off';
// chase sound: loops while the entity is hunting you, louder the closer it gets
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
  G.zt = Math.max(0, G.zt - dt);
  for (const m of G.msgs) m.t -= dt;
  G.msgs = G.msgs.filter(m => m.t > 0);
  const k = 1 - Math.exp(-dt * 14);
  for (const p of G.players.values()) {
    const moving = Math.hypot(p.tx - p.rx, p.ty - p.ry) > 0.8;
    p.rx += (p.tx - p.rx) * k; p.ry += (p.ty - p.ry) * k; p.ra = lerpAngle(p.ra, p.ta, k);
    const c = Math.cos(p.ta); if (Math.abs(c) > 0.3) p.flip = c < 0 ? -1 : 1; // walking straight up/down keeps their last side
    p.walk = moving ? p.walk + dt * 12 : 0;
  }
  if (G.ent) { G.ent.rx += (G.ent.tx - G.ent.rx) * k; G.ent.ry += (G.ent.ty - G.ent.ry) * k; }
  // the headlight flickers when the entity is close
  G.flicker = G.danger > 0.4 && Math.random() < G.danger * 0.2 ? 0.35 : 1;
  heartbeat();
  const chasing = G.chase && ui === 'play';
  // music gets quieter when the entity is near (and while it chases you), so you hear the heartbeat and the chase sound
  music.volume += (MUSIC_VOL * (1 - 0.7 * G.danger) * (chasing ? 0.4 : 1) - music.volume) * Math.min(1, dt * 3);
  const chaseVol = chasing ? 0.55 + 0.45 * G.danger : 0;
  chase.volume = Math.max(0, Math.min(1, chase.volume + (chaseVol - chase.volume) * Math.min(1, dt * (chasing ? 6 : 2.5))));
  if (chasing && chase.paused) chase.play().catch(() => {});
  else if (!chasing && !chase.paused && chase.volume < 0.02) { chase.pause(); chase.currentTime = 0; }

  const meP = G.players.get(myId);
  G.moving = false;
  if (ui !== 'play' || !meP || meP.esc) return;
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
  if (mx || my) {
    const bx = G.me.x, by = G.me.y;
    Sh.moveCircle(G, G.me, mx * PLAYER_SPEED * dt, my * PLAYER_SPEED * dt, PLAYER_R);
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
    if (Sh.solid(G, tx, ty)) return t;
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
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
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
  miniCanvas = document.createElement('canvas');
  miniCanvas.width = COLS * MINI; miniCanvas.height = ROWS * MINI;
  const n = miniCanvas.getContext('2d');
  n.fillStyle = '#0e0e18'; n.fillRect(0, 0, miniCanvas.width, miniCanvas.height);
  n.fillStyle = '#3a3654';
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (G.grid[y][x] === 1) n.fillRect(x * MINI, y * MINI, MINI, MINI);
}

// ---------------------------------------------------------------- sprites
function roundRect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

// the carrot man: an orange carrot body tapering to a point, leafy green top that sways as he walks,
// a face on the side he faces, stubby arms and legs, a scarf and headlamp strap in the player's color.
// `flip` is -1 facing left, 1 facing right.
function drawCarrot(x, y, color, flip, walk, alpha = 1) {
  const s = Math.sin(walk) * 2.5, bob = walk ? Math.abs(Math.cos(walk)) * 1.5 : 0, sway = Math.sin(walk * 0.5) * 0.15;
  ctx.save(); ctx.translate(x, y); ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(0, 15, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.scale(flip * 1.25, 1.25); ctx.translate(0, -bob - 3);
  ctx.lineWidth = 2; ctx.strokeStyle = "#1a0f08"; ctx.lineJoin = "round"; ctx.lineCap = "round";
  // legs
  ctx.strokeStyle = "#b85a14"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-3, 6); ctx.lineTo(-4 + s, 13); ctx.moveTo(3, 6); ctx.lineTo(4 - s, 13); ctx.stroke();
  ctx.fillStyle = "#3b2a20"; ctx.strokeStyle = "#1a0f08"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(-3 + s, 14, 3.5, 2.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(5 - s, 14, 3.5, 2.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // leafy top
  ctx.save(); ctx.translate(0, -16); ctx.rotate(sway);
  for (const [a, len, col] of [[-0.55, 11, "#3f9a3a"], [0.5, 10, "#3f9a3a"], [0, 14, "#55b84a"]]) {
    ctx.save(); ctx.rotate(a);
    ctx.fillStyle = col; ctx.strokeStyle = "#1d4a1b"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(4.5, -len * 0.55, 0, -len); ctx.quadraticCurveTo(-4.5, -len * 0.55, 0, 0);
    ctx.fill(); ctx.stroke(); ctx.restore();
  }
  ctx.restore();
  // carrot body: wide rounded top, tapering down to a point between the legs
  ctx.fillStyle = "#f28c28"; ctx.strokeStyle = "#1a0f08"; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-10, -11);
  ctx.quadraticCurveTo(-10, -18, 0, -18);
  ctx.quadraticCurveTo(10, -18, 10, -11);
  ctx.quadraticCurveTo(9, 0, 1, 10);
  ctx.quadraticCurveTo(0, 11, -1, 10);
  ctx.quadraticCurveTo(-9, 0, -10, -11);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // shading and the little ridges every carrot has
  ctx.fillStyle = "rgba(160,70,10,.35)";
  ctx.beginPath(); ctx.moveTo(-10, -11); ctx.quadraticCurveTo(-9, 0, -1, 10); ctx.quadraticCurveTo(-5, -2, -6, -12); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#c2621a"; ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-7, 0); ctx.lineTo(-3, 0.5); ctx.moveTo(4, 3); ctx.lineTo(7, 2.5); ctx.moveTo(-4, 6); ctx.lineTo(-1, 6.3);
  ctx.stroke();
  // scarf in the player's color, its tail flapping behind
  ctx.fillStyle = color; ctx.strokeStyle = "#1a0f08"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-9.6, -5); ctx.quadraticCurveTo(0, -2, 9.4, -5); ctx.lineTo(8.8, -1.5); ctx.quadraticCurveTo(0, 1.5, -9, -1.5); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-8, -3); ctx.lineTo(-14, -1 + s * 0.6); ctx.lineTo(-13, 3 + s * 0.6); ctx.lineTo(-7, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  // stubby arms
  ctx.strokeStyle = "#b85a14"; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(8.5, 1); ctx.lineTo(12, 4 - s * 0.5); ctx.moveTo(-8.5, 1); ctx.lineTo(-11, 5 + s * 0.5); ctx.stroke();
  // face, on the side he faces
  ctx.fillStyle = "#1a0f08";
  ctx.beginPath(); ctx.ellipse(2.5, -11, 1.6, 2.1, 0, 0, Math.PI * 2); ctx.ellipse(7, -11, 1.6, 2.1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(3, -11.8, 0.6, 0, Math.PI * 2); ctx.arc(7.5, -11.8, 0.6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#1a0f08"; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(5, -8, 2, 0.2, Math.PI - 0.2); ctx.stroke();
  // headlamp on a strap in the player's color
  ctx.strokeStyle = color; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(-9, -14.5); ctx.quadraticCurveTo(0, -16.5, 9.5, -14.5); ctx.stroke();
  ctx.fillStyle = "#5a5470"; ctx.strokeStyle = "#1a0f08"; ctx.lineWidth = 1.5; roundRect(ctx, 6.5, -17.5, 5, 5, 1.5); ctx.fill(); ctx.stroke();
  ctx.shadowColor = "#ffe9a8"; ctx.shadowBlur = 8;
  ctx.fillStyle = "#fff3c4"; ctx.beginPath(); ctx.arc(11.5, -15, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawKey(x, y, color, t, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 2) * 0.25); ctx.scale(s, s);
  ctx.shadowColor = color; ctx.shadowBlur = 14;
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(-7, 0, 5, 0, Math.PI * 2);
  ctx.moveTo(-2, 0); ctx.lineTo(11, 0);
  ctx.moveTo(6, 0); ctx.lineTo(6, 5);
  ctx.moveTo(10, 0); ctx.lineTo(10, 6);
  ctx.stroke(); ctx.restore();
}

function drawEntityBody(e, t) {
  ctx.save();
  ctx.globalAlpha = e.stun ? 0.5 : 1;
  const g = ctx.createRadialGradient(e.rx, e.ry, 4, e.rx, e.ry, 38);
  g.addColorStop(0, 'rgba(255,23,68,.35)'); g.addColorStop(1, 'rgba(255,23,68,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.rx, e.ry, 38, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 8; i++) {
    const a = t * 2.5 + i * 0.8, r = 10 + 3 * Math.sin(t * 5 + i);
    ctx.fillStyle = i % 2 ? '#07020a' : '#120410';
    ctx.beginPath(); ctx.arc(e.rx + Math.cos(a) * 7, e.ry + Math.sin(a) * 7 - 4, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
function drawEntityEyes(e, t) {
  ctx.save(); ctx.shadowColor = '#ff1744'; ctx.shadowBlur = 12; ctx.fillStyle = '#ff1744';
  const blink = Math.sin(t * 0.9) > 0.97 ? 0.3 : 1;
  ctx.beginPath(); ctx.ellipse(e.rx - 5, e.ry - 6, 2.6, 2.6 * blink, 0, 0, Math.PI * 2); ctx.ellipse(e.rx + 5, e.ry - 6, 2.6, 2.6 * blink, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawZones(t, outlineOnly) {
  const warn = G.zt < SAFE_WARN, blink = warn ? 0.35 + 0.35 * Math.sin(t * 14) : 0.55;
  for (const z of G.zones) {
    if (!outlineOnly) {
      ctx.fillStyle = `rgba(80, 230, 150, ${0.2 * blink + 0.08})`;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
        if (G.grid[z.y + dy][z.x + dx] === 0) ctx.fillRect((z.x + dx) * TILE, (z.y + dy) * TILE, TILE, TILE);
    } else {
      ctx.save(); ctx.strokeStyle = `rgba(105, 240, 174, ${blink + 0.2})`; ctx.lineWidth = 2;
      ctx.shadowColor = '#69f0ae'; ctx.shadowBlur = 12;
      ctx.strokeRect((z.x - 1) * TILE + 2, (z.y - 1) * TILE + 2, TILE * 3 - 4, TILE * 3 - 4);
      ctx.restore();
    }
  }
  if (outlineOnly && warn) { // preview where the next zones will appear
    ctx.save(); ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(105,240,174,.5)'; ctx.lineWidth = 2;
    for (const z of G.next) ctx.strokeRect((z.x - 1) * TILE + 4, (z.y - 1) * TILE + 4, TILE * 3 - 8, TILE * 3 - 8);
    ctx.restore();
  }
}

function drawGate(t) {
  const g = G.gate, x = g.x * TILE, y = g.y * TILE;
  ctx.save();
  ctx.shadowColor = g.open ? '#ffd54f' : '#b388ff'; ctx.shadowBlur = 18;
  ctx.fillStyle = g.open ? 'rgba(255,213,79,.4)' : '#5e35b1';
  ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
  ctx.shadowBlur = 0;
  if (!g.open) {
    const slots = [...G.players.values()].map(p => p.slot).sort();
    slots.forEach((slot, i) => { // one lock per player
      const sx = x + TILE / 2 + (i - (slots.length - 1) / 2) * 9, sy = y + TILE / 2;
      ctx.fillStyle = g.ins.includes(slot) ? COLORS[slot] : '#1a1030';
      ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, Math.PI * 2); ctx.fill();
    });
  } else {
    ctx.fillStyle = `rgba(255,255,255,${0.45 + 0.3 * Math.sin(t * 6)})`;
    ctx.fillRect(x + 8, y + 8, TILE - 16, TILE - 16);
  }
  ctx.restore();
}

function nameTag(text, x, y, color) {
  ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}

// ---------------------------------------------------------------- frame
// whose eyes we see through: yours, or a teammate's after you escape
function getView() {
  const meP = G.players.get(myId);
  if (meP && !meP.esc) return { x: G.me.x, y: G.me.y, a: aim, id: myId };
  const mate = [...G.players.entries()].find(([id, p]) => id !== myId && !p.esc);
  return mate ? { x: mate[1].rx, y: mate[1].ry, a: mate[1].ra, id: mate[0] }
              : { x: center(G.gate.ix), y: center(G.gate.iy), a: Math.atan2(G.gate.y - G.gate.iy, G.gate.x - G.gate.ix), id: null };
}

// first / third person: same visibility rules as top-down, drawn in 3D by view3d.js
function draw3D(t) {
  const view = getView(), mine = view.id === myId;
  const players = new Map();
  for (const [id, p] of G.players) {
    if (p.esc) continue;
    const self = id === myId;
    players.set(id, self ? { x: G.me.x, y: G.me.y, a: aim, walk: G.walk, inv: p.inv, ks: p.ks, show: true }
                         : { x: p.rx, y: p.ry, a: p.ra, walk: p.walk, inv: p.inv, ks: p.ks, show: true });
  }
  let key = null;
  if (G.key && G.key.state === 'hidden') { // only YOUR key
    const kp = { x: center(G.key.x), y: center(G.key.y) };
    if (isLit(view, kp)) key = kp;
  }
  let ent = null;
  if (G.ent) {
    const ep = { x: G.ent.rx, y: G.ent.ry }, lit = isLit(view, ep);
    ent = { ...ep, stun: !!G.ent.stun, lit, eyes: lit || hasLOS(view, ep) };
  }
  v3d.render({
    G, view, t, mode: viewMode, players, key, ent,
    pitch: mine ? pitch : 0, flicker: mine ? G.flicker : 1, walk: mine ? G.walk : 0,
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
  drawZones(t, false);
  drawGate(t);

  // things you can only see while they're in your light
  if (G.key && G.key.state === 'hidden') { // only YOUR key
    const kp = { x: center(G.key.x), y: center(G.key.y) };
    if (isLit(view, kp)) drawKey(kp.x, kp.y, COLORS[G.slot], t);
  }
  const E = G.ent, entLit = E && isLit(view, { x: E.rx, y: E.ry });
  // sort by y so characters lower on screen draw in front
  const actors = [];
  for (const [id, p] of G.players) {
    if (p.esc) continue;
    const self = id === myId;
    const pos = self ? { x: G.me.x, y: G.me.y } : { x: p.rx, y: p.ry };
    if (!self && id !== view.id && !isLit(view, pos)) continue;
    actors.push({ y: pos.y, draw: () => {
      const blinkOff = p.inv && Math.floor(t * 10) % 2;
      drawCarrot(pos.x, pos.y, COLORS[p.slot], self ? G.flip : p.flip, self ? G.walk : p.walk, blinkOff ? 0.4 : 1);
      if (p.ks === 'carried') drawKey(pos.x + 20, pos.y - 28, COLORS[p.slot], t, 0.6);
      if (p.safe) { ctx.strokeStyle = '#69f0ae'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(pos.x, pos.y + 15, 16, 6, 0, 0, Math.PI * 2); ctx.stroke(); }
    } });
  }
  if (entLit) actors.push({ y: E.ry, draw: () => drawEntityBody(E, t) });
  actors.sort((a, b) => a.y - b.y).forEach(a => a.draw());

  // darkness: everything outside your light. Walls block the light.
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.globalCompositeOperation = 'source-over';
  mctx.clearRect(0, 0, mask.width, mask.height);
  mctx.fillStyle = 'rgba(4,4,10,0.9)'; mctx.fillRect(0, 0, mask.width, mask.height);
  T(mctx, 1);
  mctx.globalCompositeOperation = 'destination-out';
  const near = visPoly(view, 0, Math.PI * 2, 160, R_NEAR);
  const gn = mctx.createRadialGradient(view.x, view.y, R_NEAR * 0.55, view.x, view.y, R_NEAR);
  gn.addColorStop(0, 'rgba(0,0,0,1)'); gn.addColorStop(1, 'rgba(0,0,0,0)');
  fillPoly(mctx, near, gn);
  const fl = view.id === myId ? G.flicker : 1;
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

  // visible through the dark: safe-zone outlines, the gate, teammates' markers, and the entity's eyes
  drawZones(t, true);
  drawGate(t);
  for (const [id, p] of G.players) {
    if (p.esc) continue;
    const self = id === myId, x = self ? G.me.x : p.rx, y = self ? G.me.y : p.ry;
    if (!self) { ctx.strokeStyle = COLORS[p.slot]; ctx.globalAlpha = 0.6; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
    nameTag(p.name, x, y - 46, self ? '#fff' : COLORS[p.slot]);
  }
  if (E && (entLit || hasLOS(view, { x: E.rx, y: E.ry }))) drawEntityEyes(E, t); // glowing eyes in the dark
  return view;
}

function fillPoly(c, pts, style) {
  c.beginPath(); c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath(); c.fillStyle = style; c.fill();
}

// ---------------------------------------------------------------- HUD
function drawMinimap(x, y, t) {
  ctx.save(); ctx.translate(x, y);
  ctx.globalAlpha = 0.85; ctx.drawImage(miniCanvas, 0, 0); ctx.globalAlpha = 1;
  ctx.fillStyle = G.zt < SAFE_WARN && Math.sin(t * 14) > 0 ? 'rgba(105,240,174,.3)' : 'rgba(105,240,174,.7)';
  for (const z of G.zones) ctx.fillRect((z.x - 1) * MINI, (z.y - 1) * MINI, MINI * 3, MINI * 3);
  ctx.fillStyle = G.gate.open ? '#ffd54f' : '#b388ff';
  ctx.fillRect(G.gate.x * MINI - 1, G.gate.y * MINI - 1, MINI + 2, MINI + 2);
  for (const [id, p] of G.players) {
    if (p.esc || id === myId) continue;
    ctx.fillStyle = COLORS[p.slot]; ctx.beginPath(); ctx.arc(p.rx / TILE * MINI, p.ry / TILE * MINI, 2.2, 0, Math.PI * 2); ctx.fill();
  }
  const meP = G.players.get(myId);
  if (meP && !meP.esc) { // you: an arrow showing where your headlight points
    ctx.save(); ctx.translate(G.me.x / TILE * MINI, G.me.y / TILE * MINI); ctx.rotate(aim + Math.PI / 2);
    ctx.fillStyle = COLORS[G.slot]; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(3.5, 3); ctx.lineTo(-3.5, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle = '#2c2a40'; ctx.lineWidth = 1; ctx.strokeRect(0, 0, COLS * MINI, ROWS * MINI);
  ctx.restore();
}

function drawStatus(meP) {
  const w = Math.min(300, W - 24), x = 12, y = H - 72;
  ctx.fillStyle = 'rgba(10,10,20,.8)'; roundRect(ctx, x, y, w, 60, 8); ctx.fill();
  ctx.fillStyle = COLORS[meP.slot]; ctx.fillRect(x, y, 4, 60);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 14px system-ui'; ctx.fillStyle = COLORS[meP.slot];
  ctx.fillText(meP.name, x + 14, y + 20);
  let status = '', col = '#e8e6f0';
  if (meP.esc) { status = 'ESCAPED ✓'; col = '#ffd54f'; }
  else if (meP.safe) { status = 'IN SAFE ZONE'; col = '#69f0ae'; }
  else if (meP.inv) { status = 'PROTECTED'; col = '#b388ff'; }
  if (status) { ctx.font = 'bold 12px system-ui'; ctx.fillStyle = col; ctx.textAlign = 'right'; ctx.fillText(status, x + w - 10, y + 20); ctx.textAlign = 'left'; }

  ctx.font = '13px system-ui'; ctx.fillStyle = '#e8e6f0';
  const key = G.key;
  if (!key) return;
  if (key.state === 'hidden') {
    const d = dist(G.me, { x: center(key.x), y: center(key.y) }) / TILE;
    const bars = d < 4 ? 5 : d < 8 ? 4 : d < 13 ? 3 : d < 20 ? 2 : 1;
    ctx.fillText('Key: searching   signal', x + 14, y + 44);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i < bars ? COLORS[meP.slot] : '#33304a';
      ctx.fillRect(x + 172 + i * 9, y + 44 - 4 - i * 2.5, 6, 6 + i * 2.5);
    }
  } else if (key.state === 'carried') {
    ctx.fillText('Key: CARRYING. Bring it to the gate!', x + 14, y + 44);
  } else {
    ctx.fillText(G.gate.open ? 'Key in gate ✓. Run for the exit!' : 'Key in gate ✓. Help your team.', x + 14, y + 44);
  }
}

function drawHud(t) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const meP = G.players.get(myId);
  if (!meP) return;
  if (G.danger > 0) { // red pulsing vignette
    const k = G.danger, pulse = 0.6 + 0.4 * Math.sin(t * (5 + 9 * k));
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    vg.addColorStop(0, 'rgba(255,0,40,0)'); vg.addColorStop(1, `rgba(255,0,40,${0.5 * k * pulse})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }
  drawMinimap(W - COLS * MINI - 10, 50, t);
  drawStatus(meP);

  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  if (meP.esc) {
    ctx.font = 'bold 34px system-ui'; ctx.fillStyle = '#ffd54f';
    ctx.fillText('ESCAPED', W / 2, 110);
    ctx.font = '15px system-ui'; ctx.fillStyle = '#c9c6da';
    if (G.players.size > 1) ctx.fillText('Watching your team…', W / 2, 134);
  }

  // top bar
  const bw = Math.min(560, W - 20), bx = (W - bw) / 2;
  ctx.fillStyle = 'rgba(10,10,20,.88)'; roundRect(ctx, bx, 8, bw, 32, 8); ctx.fill();
  ctx.strokeStyle = '#2c2a40'; ctx.lineWidth = 1; ctx.stroke();
  ctx.font = `bold ${W < 480 ? 12 : 14}px system-ui`; ctx.textBaseline = 'middle';
  const cy = 24, cols = [bx + bw * 0.12, bx + bw * 0.36, bx + bw * 0.64, bx + bw * 0.88];
  const lives = Math.max(0, G.lives);
  ctx.fillStyle = '#ff5252'; ctx.fillText('♥'.repeat(lives) + '♡'.repeat(TEAM_LIVES - lives), cols[0], cy);
  ctx.fillStyle = G.gate.open ? '#ffd54f' : '#b388ff'; ctx.fillText(G.gate.open ? 'GATE OPEN' : `Gate ${G.gate.ins.length}/${G.n}`, cols[1], cy);
  ctx.fillStyle = G.zt < SAFE_WARN ? (Math.sin(t * 14) > 0 ? '#69f0ae' : '#fff') : '#69f0ae';
  ctx.fillText(`Zones move in ${Math.ceil(G.zt)}s`, cols[2], cy);
  const m = Math.floor(G.time / 60), s = Math.floor(G.time % 60);
  ctx.fillStyle = '#c9c6da'; ctx.fillText(`${m}:${String(s).padStart(2, '0')}`, cols[3], cy);

  // which view you're in, and how to switch
  ctx.font = '12px system-ui'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = 'rgba(201,198,218,.75)';
  const vName = VIEWS.find(v => v[0] === viewMode)[1];
  ctx.fillText(isTouch ? vName : `${vName} · V to switch view · M music ${musicOn ? 'off' : 'on'}`, W - 12, H - 14);
  if (viewMode !== 'top' && !isTouch && document.pointerLockElement !== cvs && !meP.esc)
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
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const t = now / 1000;
  update(dt);
  if (G && G.players.get(myId)) {
    if (viewMode !== 'top' && v3d && v3d.ready) draw3D(t); else drawWorld(t); // top-down until the 3D view has loaded
    drawHud(t);
  }
  else { ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = '#07070d'; ctx.fillRect(0, 0, W, H); }
  requestAnimationFrame(frame);
}
setView(viewMode);
connect();
renderHome();
requestAnimationFrame(frame);
