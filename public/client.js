import { drawApartmentMap, drawDoors2D, doorSwing } from './apartment2d.js';
import { drawForestMap, drawForestGlow } from './forest2d.js';
import { drawOfficeMap, drawOfficeLamps } from './office2d.js';
import { drawMallMap, drawMallGlow } from './mall2d.js';
import { drawLibraryMap, drawLibraryGlow } from './library2d.js';
import { drawDefined } from './outline2d.js';
import { drawArenaMap } from './arena2d.js';
import { loadFighter, saveFighter } from './fighter.js';
// fighters' pictures (rendered from their 3D models; loaded only when needed, as it needs Three.js)
let spriteLib = null;
const loadSprites = () => spriteLib || (spriteLib = import('./fightersprite.js'));
const Sh = window.Shared;
const { TILE, COLS, ROWS, PLAYER_R, PLAYER_SPEED, MAX_PLAYERS, MIN_PLAYERS, TAGGER_SPEED, ROUND_TIMES, JUMP_T, JUMP_REST } = Sh.C;
const { center, dist } = Sh;
const COLORS = Sh.COLORS;
const MINI = 3;
// vision: a small glow all around you, plus a headlight cone that reaches further. Walls block both.
const R_NEAR = TILE * 2.2, R_FAR = TILE * 7.5, CONE = 0.5; // CONE = half-angle in radians
// on maps with the lights on (the office) you see in every direction, as far as R_BRIGHT, wherever nothing blocks the view
const R_BRIGHT = TILE * 9;
const isTouch = matchMedia('(pointer: coarse)').matches;
// a jump: how high you go (0..1) this far into it; drawn this many pixels up in top-down, and this high (in tiles) in 3D
// (fighters jump higher, and stay up longer)
const fightJump = () => typeof G !== 'undefined' && G && G.mode === 'fight';
const jumpLen = () => fightJump() ? Sh.FIGHT.JUMP_T : JUMP_T;
const jumpK = t => t >= 0 ? Math.sin(Math.PI * Math.min(1, t / jumpLen())) : 0;
const jumpPx = () => fightJump() ? Sh.FIGHT.JUMP_PX : 18, jump3d = () => fightJump() ? Sh.FIGHT.JUMP_H : 0.42;

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
const room = { code: null, host: null, players: [], state: null, map: 'building', roundTime: Sh.C.ROUND_DEFAULT, mode: 'tag' };
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
      room.host = m.host; room.players = m.players; room.state = m.state; room.map = m.map || 'building'; room.roundTime = m.roundTime || room.roundTime; room.mode = m.mode || 'tag';
      if (m.state === 'lobby') {
        if (document.pointerLockElement) document.exitPointerLock();
        ui = 'lobby'; G = null; exploreExit.hidden = true; actBtn.hidden = true; fpad.style.display = 'none'; renderLobby();
      }
      else if (ui === 'ended') renderEnd();
      break;
    case 'start':
      initGame(m); ui = 'play'; overlay.classList.add('hidden'); exploreExit.hidden = !G.explore;
      break;
    case 's': if (G) applySnapshot(m); break;
    case 'tp': if (G) {
      G.me.x = m.x; G.me.y = m.y; G.tpSeq = m.s;
      if (typeof m.f === 'number') G.fl = m.f;
      if (typeof m.a === 'number') { aim = m.a; pitch = 0; G.fade = 1; } // took the stairs: fade, and face out of the stairwell
    } break;
    case 'msg': if (G) addMsg(m.text, m.color, m.dur); break;
    case 'noise': if (G) onNoise(m); break;
    // hide clay
    case 'cs': if (G) G.sculptDone = m; break;
    case 'phase': if (G) onPhase(m); break;
    case 'placed': if (G) onPlaced(m); break;
    case 'target': if (G) onTarget(m); break;
    case 'found': if (G) onFound(m); break;
    case 'gone': if (G) G.objs.delete(m.id); break;
    // arena fights
    case 'bracket': if (G) G.bracket = m.rounds; break;
    case 'fround': if (G) { banner(`ROUND ${m.n}`, '#ffd54f', 1.6); } break;
    case 'fight': if (G) { banner('FIGHT!', '#ff5252', 1); playFight('bell'); } break;
    case 'hit': if (G) onHit(m); break;
    case 'special': if (G) { playFight(m.kind); if (FT[m.kind]) screenFx('fx-letterbox', (FT[m.kind].wind + FT[m.kind].beam) * 1000 + 200); if (FT[m.kind]) setTimeout(() => G && G.mode === 'fight' && screenFx('fx-speed', FT[m.kind].beam * 1000 + 200, m.kind === 'finalflash' ? '#fff3a0' : '#bfefff'), FT[m.kind].wind * 1000); // (speed lines as the beam fires)
       if (m.by !== myId) addMsg(`${(G.players.get(m.by) || { name: '?' }).name}: ${(Sh.SPECIAL_NAMES[m.kind] || '').toUpperCase()}!`, '#ffb74d', 1.5); } break;
    case 'ko': if (G) { screenFx('fx-letterbox', FT.KO_PAUSE * 1000 - 300); banner(m.ko ? 'K.O.!' : m.w ? 'TIME!' : 'DRAW', '#ffd54f', 2.2); playFight('bell'); } break;
    case 'kb': if (G) G.kb = { vx: m.vx, vy: m.vy, until: performance.now() + m.dur * 1000 }; break;
    case 'end':
      if (document.pointerLockElement) document.exitPointerLock();
      chase.pause(); chase.currentTime = 0;
      closeSculpt(); clayBtn.style.display = 'none'; actBtn.hidden = true; fpad.style.display = 'none';
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
      <li>Runners get a ${Sh.C.HOLD}-second head start. Then the taggers hunt them. A tagger <b>freezes</b> a runner by catching up to them and <b>left-clicking</b>, and frozen runners can't move.</li>
      <li>Get next to a frozen runner and <b>left-click</b> to <b>unfreeze</b> them. They're safe from tags for a moment afterwards. On a phone, use the button in the corner.</li>
      <li><b>Taggers win</b> if every runner is frozen before time runs out. <b>Runners win</b> if at least one of them is still free when the timer ends.</li>
      <li>It's dark: you only see what your headlight shows, and walls block it. Runners always know where their teammates are; taggers only show up when you can see them. Listen for the heartbeat: a tagger is close.</li>
      <li><b>Top-down, PC:</b> move with WASD or the arrow keys; your headlight points the way you walk. <b>Phone:</b> drag anywhere to move.</li>
      <li><b>First / third person, PC:</b> click the game to look around with the mouse (Esc frees it). W/S walk, A/D step sideways, ←/→ or Q/E turn. <b>Phone:</b> drag up/down to walk, left/right to turn.</li>
      <li><b>Hide clay</b> (a second game mode): everyone sculpts something out of clay, then hides it somewhere on the map. Then everyone is given someone else's sculpture to find. Find it fast for points; your own sculpture earns points for every second it stays hidden. <b>F</b> (or a left-click) hides your sculpture and picks up the one you're hunting.</li>
      <li><b>Key escape</b> (a third mode, also on your own): everyone has their own gold <b>key</b> hidden somewhere; it only shows up in your light. Find it and take it to the <b>EXIT gate</b> (the square on your minimap) to unlock your lock. The gate only opens once <b>everyone</b> has unlocked theirs; then walk through to escape. A <b style="color:#ff5252">bot</b> hunts you (more with lots of players), and if it catches you you're frozen until a friend unfreezes you. It can't get you in the green <b style="color:#69f0ae">safe box</b>, but the box moves every ${Sh.C.ZONE_TIME} seconds.</li>
      <li><b>Arena fights</b> (a fourth mode): make your own fighter, then everyone goes into a knockout bracket of 1 v 1 fights, best of 3 rounds. <b>Punch</b> (left and right jabs, in turn): left-click or J. <b>Hook kick</b>: right-click or K. <b>Block</b>: hold Shift. <b>Dodge</b>: C. <b>Special</b> (when its meter is full): F, a Kamehameha or a Final Flash beam. <b>Jump</b> high with Space: you can jump over a beam.</li>
      <li>Press <b>Space</b> to jump (or double-tap on a phone). Jump over a noise trap and it stays quiet.</li>
      <li>Press <b>V</b> during a game to switch views, and <b>M</b> to turn the music on or off.</li>
    </ul></details>`;
  bindViewPicker(); bindMusicButton(); bindCharPicker();
  const nameEl = document.getElementById('name'), codeEl = document.getElementById('code');
  const name = () => { const n = nameEl.value.trim(); store.set('kb-name', n); return n; };
  document.getElementById('host').onclick = () => { ensureAudio(); homeError = ''; send({ t: 'create', name: name(), char: myChar, fighter: myFighter }); };
  const join = () => {
    ensureAudio();
    if (codeEl.value.trim().length !== 4) { homeError = 'Enter the 4-letter room code.'; return renderHome(); }
    homeError = ''; send({ t: 'join', code: codeEl.value, name: name(), char: myChar, fighter: myFighter });
  };
  document.getElementById('join').onclick = join;
  codeEl.onkeydown = e => { if (e.key === 'Enter') join(); };
  (code ? codeEl : nameEl).focus();
  if (code && nameEl.value) document.getElementById('join').focus();
}

function renderLobby() {
  overlay.classList.remove('hidden');
  const isHost = room.host === myId, solo = room.players.length === 1, enough = solo || room.players.length >= MIN_PLAYERS, taggers = Sh.taggerCount(room.players.length);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const links = local && lan.length ? lan.map(u => `${u}/?room=${room.code}`) : [`${location.origin}${location.pathname}?room=${room.code}`];
  panel.innerHTML = `
    <p class="sub" style="margin-bottom:4px">Room code</p>
    <div class="bigcode">${esc(room.code)}</div>
    <label>Invite link</label>
    ${links.map(l => `<div class="linkrow"><input readonly value="${esc(l)}"><button data-copy="${esc(l)}">Copy</button></div>`).join('')}
    ${local ? `<p class="note">You're playing on <b>localhost</b>, so the link above is your local-network address. It works for friends on the same Wi-Fi. For friends elsewhere, use a tunnel link instead (see README).</p>` : ''}
    <div style="margin-top:18px">${room.mode === 'fight' ? '' : charPicker()}${viewPicker()}
      <label>Game mode${isHost ? '' : ' (the host picks)'}</label><div class="seg">${Sh.MODES.map(([k, n]) => `<button data-mode="${k}" class="${k === room.mode ? 'on' : ''}" ${isHost ? '' : 'disabled'}>${n}</button>`).join('')}</div>
      ${room.mode === 'fight' ? `<label>Your fighter</label><div class="fighter-row"><canvas id="fprev" width="168" height="192"></canvas><div><button class="go" id="fedit">Make your fighter</button> <button id="ftry">▶ Try it out</button><p class="note">Special move: <b>${Sh.SPECIAL_NAMES[myFighter.special]}</b></p></div></div>`
      : `<label>Map${isHost ? '' : ' (the host picks)'}</label><div class="seg">${Sh.MAPS.map(([k, n]) => `<button data-map="${k}" class="${k === room.map ? 'on' : ''}" ${isHost ? '' : 'disabled'}>${n}</button>`).join('')}</div>
      <label>${room.mode === 'clay' ? 'Hunt length' : 'Round length'}${isHost ? '' : ' (the host picks)'}</label><div class="seg">${ROUND_TIMES.map(s => `<button data-time="${s}" class="${s === room.roundTime ? 'on' : ''}" ${isHost ? '' : 'disabled'}>${s / 60} min</button>`).join('')}</div>`}
    </div>
    <h3>Players (${room.players.length}/${MAX_PLAYERS})</h3>
    <ul class="plist">${room.players.map(p => `<li><span class="dot" style="background:${COLORS[p.slot]}"></span>${esc(p.name)}${room.mode === 'fight' ? '' : `<em>${(CHARS.find(c => c[0] === p.char) || CHARS[0])[1]}</em>`}${p.id === room.host ? '<em>host</em>' : ''}${p.id === myId ? '<em>you</em>' : ''}</li>`).join('')}</ul>
    ${isHost ? (solo && room.mode === 'escape' ? `<button class="go" id="start">Start (you vs the bot)</button><p class="note">Find your key, unlock the gate and get out before the bot catches you. Hide in the green safe box; it moves every ${Sh.C.ZONE_TIME}s.</p>`
             : solo ? `<button class="go" id="start">Explore the map</button><p class="note">You're on your own, so there's no tagger and no clock: just walk around the map. You need at least ${MIN_PLAYERS} players to play, so send your friends the invite link.</p>`
             : `<button class="go" id="start" ${enough ? '' : 'disabled'}>Start round</button><p class="note">${!enough ? `You need at least ${MIN_PLAYERS} players. Send your friends the invite link.` : room.mode === 'fight' ? `Everyone goes into a knockout bracket of 1 v 1 fights (best of 3 rounds) until one champion is left. Everyone else watches from the stands.` : room.mode === 'escape' ? `Everyone searches for their own key and unlocks their lock on the gate; it opens once all the locks are open. ${Sh.botCount(room.players.length)} bot${Sh.botCount(room.players.length) > 1 ? 's' : ''} will hunt you; the safe box moves every ${Sh.C.ZONE_TIME}s.` : room.mode === 'clay' ? `Everyone sculpts something out of clay (${Sh.C.SCULPT_TIME / 60} min), hides it (${Sh.C.HIDE_TIME}s), then hunts for someone else's.` : `${taggers} random player${taggers > 1 ? 's' : ''} will be IT; the other ${room.players.length - taggers} will run.`}</p>`)
             : `<p class="sub">Waiting for the host to start…</p>`}
    ${musicButton()}`;
  panel.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => copy(b));
  bindViewPicker(); bindMusicButton(); bindCharPicker();
  if (room.mode === 'fight') {
    const cv = document.getElementById('fprev'), c = cv.getContext('2d');
    const slot = (room.players.find(p => p.id === myId) || { slot: 0 }).slot;
    loadSprites().then(L => { c.clearRect(0, 0, cv.width, cv.height); c.drawImage(L.fighterPicture(myFighter, slot), 0, 12, 168, 168); }).catch(e => console.error(e));
    document.getElementById('fedit').onclick = () => openFighterBuilder();
    document.getElementById('ftry').onclick = () => openFighterBuilder(true);
  }
  if (isHost) panel.querySelectorAll('[data-map]').forEach(b => b.onclick = () => send({ t: 'map', map: b.dataset.map }));
  if (isHost) panel.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => send({ t: 'mode', mode: b.dataset.mode }));
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
  if (G.result.mode === 'clay') return renderClayEnd();
  if (G.result.mode === 'fight') return renderFightEnd();
  if (G.result.mode === 'escape') return renderEscapeEnd();
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

// key escape: who got out (and when), who the bot caught
function renderEscapeEnd() {
  const r = G.result, isHost = room.host === myId, me = r.stats.find(p => p.id === myId);
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const title = r.winner === 'bot' ? 'THE BOT WINS' : me && me.escaped ? 'YOU ESCAPED' : 'SOME GOT OUT';
  overlay.classList.remove('hidden');
  panel.innerHTML = `
    <p class="result" style="color:${r.winner === 'bot' ? '#ff5252' : '#69f0ae'}">${title}</p>
    <p class="sub">${esc(r.reason)} · ${mmss(r.time)}</p>
    <ul class="plist">${[...r.stats].sort((a, b) => (b.escaped - a.escaped) || (a.escapedAt - b.escapedAt)).map(p => `<li><span class="dot" style="background:${COLORS[p.slot]}"></span>${esc(p.name)}
      <em style="color:${p.escaped ? '#9be7c4' : '#ff8a80'}">${p.escaped ? `escaped at ${mmss(p.escapedAt)}` : p.frozen ? 'caught' : 'still inside'}</em>
      <em>${p.hasKey ? 'found their key' : 'no key'} · unfroze ${p.saves} · caught ${p.timesFrozen}×</em></li>`).join('')}</ul>
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
    grid: m.grid, n: m.players.length, roundTime: m.roundTime, hold: m.hold, explore: !!m.explore,
    floors: m.floors || [{ x0: 0, x1: COLS - 1 }], stairs: m.stairs || [], floor: -1,
    mode: m.mode || 'tag', phase: m.phase || null, left: m.sculptTime || 0, sculptTime: m.sculptTime || 0, objs: new Map(), target: null, canFind: false, sculptDone: null,
    arena: m.arena || null, bracket: null, fm: null, fp: null, beams: [], beamsAt: 0, fx: [], sparks: [], sparkN: 0, hitStop: 0, banner: null, myAct: null, blocking: false, dodgeUntil: 0, dodgeCd: 0, kb: null, shake: 0,
    upper: m.upper || null, ramps: m.ramps || [], library: m.library || null, fl: meInfo.fl || 0, jumpT: -1, rest: 0, jc: 0, sentJ: 0,
    map: m.map || 'building', flights: m.flights || [], rooms: m.rooms || [], furniture: m.furniture || [], doors: m.doors || [], forest: m.forest || null, office: m.office || null, mall: m.mall || null, bright: !!m.bright, fade: 0,
    players: new Map(), me: { x: meInfo.x, y: meInfo.y }, slot: meInfo.slot, role: meInfo.role, tpSeq: 0,
    time: 0, danger: 0,
    msgs: [], lastSent: 0, sentX: null, sentY: null, sentA: null, result: null, walk: 0, moving: false, flicker: 1, flip: 1,
  };
  G.traps = (m.traps || []).map(t => ({ ...t, hot: false })); G.noises = [];
  G.esc = G.mode === 'escape' ? { gate: m.gate, key: m.key, bots: [], zone: null, zl: 0, signal: 0 } : null; // key escape: the gate, your key, the bots, the safe zone
  if (G.esc && m.key) { const kt = Sh.tileOf(m.key); G.esc.keyDist = Sh.reach(G, kt.x, kt.y, m.key.fl || 0); } // walking distance to your key from everywhere, for the key signal
  for (const p of m.players)
    G.players.set(p.id, { ...p, fl: p.fl || 0, rx: p.x, ry: p.y, tx: p.x, ty: p.y, ta: m.yaw ?? Sh.START_YAW, ra: m.yaw ?? Sh.START_YAW, fz: false, imm: false, tags: 0, walk: 0, flip: 1, jc: 0, jumpT: -1 });
  aim = m.yaw ?? Sh.START_YAW; pitch = 0;
  for (const d of G.doors) d.swing = doorSwing(G, d);
  G.doorOpen = new Float32Array(G.doors.length);
  renderMaps();
  if (v3d) v3d.build(G);
  closeSculpt();
  if (G.mode === 'clay' && G.phase === 'sculpt') startSculpt();
  if (G.arena) {
    const g = G;
    loadSprites().then(L => {
      if (G !== g) return;
      g.sprites = new Map([...g.players].map(([id, p]) => [id, L.fighterSprites(p.fighter, p.slot)]));
      g.drawSprite = L.drawFighterSprite;
    }).catch(e => console.error(e));
  }
}

function applySnapshot(s) {
  G.chase = !!s.chase;
  const hot = new Set(s.tc || []); // traps that just went off
  for (const t of G.traps) t.hot = hot.has(t.id);
  G.time = s.time; G.danger = s.danger;
  if (s.ph) { G.phase = s.ph; G.left = s.left; }
  if (G.mode === 'fight') { G.fm = s.fm; G.fp = s.fp; G.left = s.left; G.beams = s.beams || []; G.beamsAt = performance.now(); }
  const seen = new Set();
  for (const sp of s.players) {
    const p = G.players.get(sp.id);
    if (!p) continue;
    seen.add(sp.id);
    Object.assign(p, { tx: sp.x, ty: sp.y, ta: sp.a, fz: sp.fz, imm: sp.imm, tags: sp.tags, fl: sp.f || 0, sc: sp.sc || 0, k: !!sp.k, u: !!sp.u, e: !!sp.e });
    if (sp.j > p.jc) { p.jc = sp.j; if (sp.id !== myId) p.jumpT = 0; } // they jumped
    if (sp.hp !== undefined) {
      if (sp.gu && !p.gu) p.guAt = performance.now(); // (they've landed and are getting up)
      Object.assign(p, { hp: sp.hp, mt: sp.mt, ak: sp.ak, sd: sp.sd, at: sp.at, atAt: performance.now(), bk: sp.bk, st: sp.st, dg: sp.dg, ay: sp.ay || 0, gu: sp.gu });
    }
  }
  for (const id of [...G.players.keys()]) if (!seen.has(id)) G.players.delete(id); // someone left
  if (G.esc && s.bots) {
    const E = G.esc;
    s.bots.forEach((b, i) => Object.assign(E.bots[i] || (E.bots[i] = { rx: b.x, ry: b.y, ra: b.a, walk: 0, flip: 1 }), { tx: b.x, ty: b.y, ta: b.a, fl: b.f || 0 }));
    E.bots.length = s.bots.length;
    E.zone = s.zone; E.zl = s.zl; E.open = !!s.go;
  }
  G.n = G.players.size;
}
const isTeammate = p => G.mode !== 'clay' && p.role === G.role; // (in hide clay it's everyone for themselves)

// a noise trap went off near you (or under you): show where, and play its sound (quieter the further away)
function onNoise(m) {
  const k = Sh.TRAPS[m.kind];
  G.noises.push({ x: m.x, y: m.y, fl: m.f || 0, kind: m.kind, t: Sh.C.NOISE_SHOW });
  const d = dist(G.me, m) / TILE;
  playNoise(k.sound, m.me ? 1 : Math.max(0.15, 1 - d / Sh.C.NOISE_RADIUS));
  if (m.me) addMsg(`You stepped on ${k.name}! The taggers heard that.`, '#ffcc80', 2.5);
  else if (G.role === 'it') addMsg(`You heard ${k.name} nearby…`, '#ffcc80', 2);
}

function addMsg(text, color = '#fff', dur = 3) { G.msgs.push({ text, color, t: dur }); if (G.msgs.length > 3) G.msgs.shift(); }

// ---------------------------------------------------------------- input
const keys = new Set();
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  keys.add(e.code);
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyM' && !e.repeat) setMusic(!musicOn);
  if (e.code === 'Space' && !e.repeat) jump();
  if (e.code === 'KeyF' && !e.repeat) { if (G && G.mode === 'fight') fightInput('special'); else clayAction(); }
  if (G && G.mode === 'fight' && !e.repeat) {
    if (e.code === 'KeyJ') fightInput('punch');
    if (e.code === 'KeyK') fightInput('kick');
    if (e.code === 'KeyC') fightInput('dodge');
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') setBlock(true);
  }
  if (e.code === 'KeyL' && !e.repeat && G && G.explore && ui === 'play') leaveExplore();
  if (e.code === 'KeyV' && !e.repeat && G && ui === 'play') {
    const i = VIEWS.findIndex(v => v[0] === viewMode);
    setView(VIEWS[(i + 1) % VIEWS.length][0]);
  }
});
addEventListener('keyup', e => { keys.delete(e.code); if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') setBlock(false); });

// exploring on your own: a button (and the L key) takes you back to the lobby
const exploreExit = document.getElementById('exploreExit');
function leaveExplore() { send({ t: 'lobby' }); }
exploreExit.onclick = leaveExplore;
addEventListener('pointerdown', () => { if (musicOn && music.paused) music.play().catch(() => {}); });
addEventListener('blur', () => keys.clear());

cvs.addEventListener('mousedown', e => {
  ensureAudio();
  if (e.button === 0) act(); // left click: tag, or unfreeze (a punch in a fight)
  if (e.button === 2 && G && G.mode === 'fight') fightInput('kick'); // right click: a kick
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

// jump (space, or a quick double tap on a phone): not while frozen, and not again until you've landed
function jump() {
  if (!G || ui !== 'play') return;
  const meP = G.players.get(myId);
  if (!meP || meP.fz || G.jumpT >= 0 || G.rest > 0) return;
  G.jumpT = 0; G.jc++;
}

// on the same floor as each other (in the library: within half a floor, like the server)
const sameFloorAs = (a, b) => G.upper ? Math.abs(Sh.elev(G, a) - Sh.elev(G, b)) < 0.5 : Sh.floorOf(G.floors, a.x) === Sh.floorOf(G.floors, b.x);
// tag a runner (if you're IT) or unfreeze a friend (if you're a runner); the server checks who's in reach
function act() {
  if (G && G.mode === 'clay') return clayAction(); // (in hide clay a click hides or picks up your sculpture)
  if (G && G.mode === 'fight') return fightInput('punch');
  if (!G || ui !== 'play' || G.explore) return;
  const meP = G.players.get(myId);
  if (!meP || meP.fz || (G.role === 'it' && G.time < G.hold)) return; // frozen, or still waiting out the head start
  send({ t: 'act' });
  G.actAt = performance.now();
}
// who a click would reach right now, for the hint and the on-screen button
function actTarget() {
  const meP = G && G.players.get(myId);
  if (!meP || G.explore || meP.fz || (G.role === 'it' && G.time < G.hold)) return null;
  const me = { x: G.me.x, y: G.me.y, fl: G.fl };
  let best = null, bd = Infinity;
  for (const [id, p] of G.players) {
    if (id === myId || p.role !== 'run') continue;
    if (G.role === 'it' ? (p.fz || p.imm) : !p.fz) continue;
    const pos = posOf(id, p), d = dist(me, pos);
    if (!sameFloorAs(me, pos) || d > (G.role === 'it' ? Sh.C.TAG_DIST : Sh.C.RESCUE_DIST) || d >= bd) continue;
    best = p; bd = d;
  }
  return best;
}
const actBtn = document.getElementById('actBtn');
actBtn.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); ensureAudio(); act(); }, { passive: false });
actBtn.onclick = act;

// touch: drag anywhere to move
let joy = null, lastTap = 0;
cvs.addEventListener('touchstart', e => {
  ensureAudio();
  const t = e.changedTouches[0];
  const now = performance.now(); if (now - lastTap < 300) jump(); lastTap = now;
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
// noise-trap sounds, made on the spot: short bursts of filtered noise and little tone sweeps
let noiseBuf = null;
function playNoise(sound, vol) {
  if (!actx || actx.state !== 'running') return;
  if (!noiseBuf) { noiseBuf = actx.createBuffer(1, actx.sampleRate / 2, actx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const now = actx.currentTime, out = actx.createGain(); out.gain.value = 0.5 * vol; out.connect(actx.destination);
  const burst = (t, dur, freq, q, v) => {
    const src = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
    src.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(out); src.start(t); src.stop(t + dur + 0.02);
  };
  const tone = (t, dur, f0, f1, type, v) => {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.02);
  };
  const r = Math.random;
  if (sound === 'crunch') for (let i = 0; i < 6; i++) burst(now + i * 0.025 + r() * 0.02, 0.06, 3000 + r() * 3000, 2, 0.8); // shards
  else if (sound === 'clank') { tone(now, 0.25, 620, 560, 'square', 0.18); tone(now + 0.07, 0.3, 840, 800, 'square', 0.14); burst(now, 0.08, 1800, 3, 0.5); }
  else if (sound === 'pop') for (let i = 0; i < 5; i++) burst(now + i * 0.06 + r() * 0.03, 0.03, 1200, 1.5, 1);
  else if (sound === 'squeak') { tone(now, 0.18, 900, 1700, 'sine', 0.5); tone(now + 0.2, 0.16, 1500, 900, 'sine', 0.4); }
  else if (sound === 'snap') { burst(now, 0.04, 2500, 1, 1); burst(now + 0.09, 0.05, 1600, 1, 0.8); }
  else if (sound === 'rustle') for (let i = 0; i < 10; i++) burst(now + i * 0.04, 0.08, 4000 + r() * 2000, 0.8, 0.35);
  else if (sound === 'thud') for (let i = 0; i < 4; i++) { tone(now + i * 0.09, 0.14, 150 - i * 15, 60, 'sine', 0.7 - i * 0.12); burst(now + i * 0.09, 0.05, 700, 1, 0.5); } // books toppling
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
    p.ayR = (p.ayR || 0) + ((p.ay || 0) - (p.ayR || 0)) * Math.min(1, k * 1.6); // (how high a launched fighter is flying, smoothed)
    if (moving) { // (which way they're stepping, relative to where they face: for a fighter's footwork)
      const dx = p.tx - p.rx, dy = p.ty - p.ry, l = Math.hypot(dx, dy), c = Math.cos(p.ra), s = Math.sin(p.ra);
      p.mv = { f: (dx * c + dy * s) / l, s: (dy * c - dx * s) / l };
    }
  }
  if (G.esc) {
    G.esc.zl = Math.max(0, G.esc.zl - dt);
    for (const b of G.esc.bots) {
      const d = Math.hypot(b.tx - b.rx, b.ty - b.ry);
      if (d > TILE * 2) { b.rx = b.tx; b.ry = b.ty; } // (it took the stairs)
      b.rx += (b.tx - b.rx) * k; b.ry += (b.ty - b.ry) * k; b.ra = lerpAngle(b.ra, b.ta, k);
      const c = Math.cos(b.ta); if (Math.abs(c) > 0.3) b.flip = c < 0 ? -1 : 1;
      b.walk = d > 0.8 ? b.walk + dt * 12 : 0;
    }
  }
  G.fade = Math.max(0, G.fade - dt * 2.2);
  if (G.mode === 'clay') clayUpdate(dt);
  if (G.mode === 'fight') fightUpdate(dt);
  // jumps in progress (yours, and other people's)
  if (G.jumpT >= 0) { G.jumpT += dt; if (G.jumpT >= jumpLen()) { G.jumpT = -1; G.rest = JUMP_REST; } } else G.rest = Math.max(0, G.rest - dt);
  for (const p of G.players.values()) if (p.jumpT >= 0 && (p.jumpT += dt) >= jumpLen()) p.jumpT = -1;
  for (const n of G.noises) n.t -= dt;
  G.noises = G.noises.filter(n => n.t > 0);
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
  const stuck = meP.fz || meP.e || (G.role === 'it' && G.time < G.hold) || G.phase === 'sculpt';
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
  let speed = PLAYER_SPEED * (G.role === 'it' ? TAGGER_SPEED : 1), still = stuck;
  if (G.mode === 'fight') ({ mx, my, speed, still } = fightSteer(dt, mx, my, speed, stuck));
  if ((mx || my) && !still) {
    const bx = G.me.x, by = G.me.y;
    Sh.moveCircle(Sh.world(G, G.fl), G.me, mx * speed * dt, my * speed * dt, PLAYER_R);
    G.moving = G.me.x !== bx || G.me.y !== by;
    const fl = Sh.nextFloor(G, G.me.x, G.me.y, G.fl); // up or down a staircase
    if (fl !== G.fl) { G.fl = fl; addMsg(fl ? 'Upstairs' : 'Ground floor', '#ffe9a8', 1.5); }
  }
  G.walk = G.moving ? G.walk + dt * 12 : 0;
  if (G.mode === 'fight' && (mx || my)) { const c = Math.cos(aim), s = Math.sin(aim); G.mv = { f: mx * c + my * s, s: my * c - mx * s }; } // (stepping in, back, or round them)
  aim = Math.atan2(Math.sin(aim), Math.cos(aim)); // keep it in -PI..PI

  const now = performance.now();
  const turned = G.sentA === null || Math.abs(aim - G.sentA) > 0.03;
  if ((now - G.lastSent > 50 && (G.me.x !== G.sentX || G.me.y !== G.sentY || turned)) || G.jc !== G.sentJ) {
    send({ t: 'pos', x: Math.round(G.me.x * 10) / 10, y: Math.round(G.me.y * 10) / 10, a: Math.round(aim * 100) / 100, s: G.tpSeq, j: G.jc });
    G.lastSent = now; G.sentX = G.me.x; G.sentY = G.me.y; G.sentA = aim; G.sentJ = G.jc;
  }
}

// ---------------------------------------------------------------- line of sight
// what blocks your view: the floor you're on (in the library, upstairs has its own walls)
const viewWorld = () => Sh.world(G, G.fl);
// distance a ray travels from (ox, oy) before hitting a wall (grid DDA), capped at maxD
function castRay(ox, oy, ang, maxD, w = viewWorld()) {
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
    if (Sh.blocksLight(w, tx, ty)) return t;
  }
}
const hasLOS = (a, b, w) => { const d = dist(a, b); return castRay(a.x, a.y, Math.atan2(b.y - a.y, b.x - a.x), d, w) >= d - 1; };

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
  if (G.upper) { // two floors: on the same floor as usual; between floors only through the open atrium (or a stairwell)
    const ev = Sh.elev(G, view), ep = Sh.elev(G, pt);
    if (Math.abs(ev - ep) >= 0.5) {
      const low = ev < ep ? view : pt;
      return d <= R_BRIGHT && Sh.openAbove(G, low.x, low.y) && hasLOS(view, pt, Sh.world(G, 1));
    }
  }
  if (G.bright) return d <= R_BRIGHT && hasLOS(view, pt);
  if (d > R_FAR || !hasLOS(view, pt)) return false;
  if (d < R_NEAR) return true;
  return Math.abs(Math.atan2(Math.sin(Math.atan2(pt.y - view.y, pt.x - view.x) - view.a), Math.cos(Math.atan2(pt.y - view.y, pt.x - view.x) - view.a))) < CONE;
}

// ---------------------------------------------------------------- map rendering (prerendered once per game)
let mapCanvas, miniCanvas, mapUp, miniUp; // (mapUp, miniUp: the library's upper floor)
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = v => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}
// the building: tiled floor, purple walls with a brick front face, and crates for the furniture
function drawBuildingMap(m) {
  const FACE = 14; // visible front face of walls, for a bit of depth
  const crate = buildingFurniture();
  const solid = (x, y) => y >= 0 && y < ROWS && x >= 0 && x < COLS && G.grid[y][x] === 1 && !crate.has(y * COLS + x);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const px = x * TILE, py = y * TILE;
    if (!solid(x, y)) {
      m.fillStyle = (x + y) % 2 ? '#2b2a38' : '#2e2d3c'; m.fillRect(px, py, TILE, TILE);
      m.strokeStyle = 'rgba(0,0,0,.25)'; m.lineWidth = 1; m.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
      m.fillStyle = 'rgba(255,255,255,.035)'; m.fillRect(px + 4, py + 4, TILE - 8, 2);
      if (solid(x, y - 1)) { m.fillStyle = 'rgba(0,0,0,.35)'; m.fillRect(px, py, TILE, 7); } // shadow under a wall
    } else {
      const faceShown = y + 1 < ROWS && !solid(x, y + 1);
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
      // a crisp edge where the wall meets the floor, and a light lip along the top of the wall
      m.fillStyle = '#141220';
      if (!solid(x - 1, y)) m.fillRect(px, py, 2, TILE);
      if (!solid(x + 1, y)) m.fillRect(px + TILE - 2, py, 2, TILE);
      if (!solid(x, y - 1)) { m.fillRect(px, py, TILE, 2); m.fillStyle = '#6c659a'; m.fillRect(px, py + 2, TILE, 2); }
      if (faceShown) { m.fillStyle = '#141220'; m.fillRect(px, py + TILE - 2, TILE, 2); m.fillStyle = '#6c659a'; m.fillRect(px, py + TILE - FACE, TILE, 1.5); }
    }
  }
  // furniture: wooden crates, outlined so they stand out from the walls and floor
  drawDefined(m, c => {
    for (const k of crate) {
      const x = k % COLS, y = (k - x) / COLS, px = x * TILE, py = y * TILE;
      const L = !crate.has(k - 1), R = !crate.has(k + 1), T = !crate.has(k - COLS), B = !crate.has(k + COLS); // outer sides of the block
      const x0 = px + (L ? 3 : 0), x1 = px + TILE - (R ? 3 : 0), y0 = py + (T ? 3 : 0), y1 = py + TILE - (B ? 3 : 0);
      c.fillStyle = '#8a6440'; c.fillRect(x0, y0, x1 - x0, y1 - y0);
      c.strokeStyle = 'rgba(40,24,10,.55)'; c.lineWidth = 1; c.beginPath(); // planks
      for (let i = 1; i < 4; i++) { c.moveTo(x0, py + i * 10 + 0.5); c.lineTo(x1, py + i * 10 + 0.5); }
      c.stroke();
      c.fillStyle = '#b08458'; // the frame round each crate, with a cross brace
      c.fillRect(px + 5, py + 5, TILE - 10, 3); c.fillRect(px + 5, py + TILE - 8, TILE - 10, 3);
      c.fillRect(px + 5, py + 5, 3, TILE - 10); c.fillRect(px + TILE - 8, py + 5, 3, TILE - 10);
      c.save(); c.translate(px + TILE / 2, py + TILE / 2); c.rotate(Math.PI / 4); c.fillRect(-19, -1.5, 38, 3); c.restore();
      c.fillStyle = '#3a2614'; for (const [dx, dy] of [[6.5, 6.5], [TILE - 6.5, 6.5], [6.5, TILE - 6.5], [TILE - 6.5, TILE - 6.5]]) { c.beginPath(); c.arc(px + dx, py + dy, 1.3, 0, Math.PI * 2); c.fill(); } // nails
    }
  }, { line: '#0b0a12', width: 2, rim: 'rgba(255,225,180,.3)', shadow: 'rgba(0,0,0,.65)', drop: 6, blur: 5 });
}

// the building's furniture: little blocks (up to 2x2) that aren't joined to any wall
function buildingFurniture() {
  const out = new Set(), seen = new Set();
  for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
    const k0 = y * COLS + x;
    if (G.grid[y][x] !== 1 || seen.has(k0)) continue;
    const part = [k0], stack = [k0]; seen.add(k0);
    let edge = false;
    while (stack.length) {
      const k = stack.pop(), cx = k % COLS, cy = (k - cx) / COLS;
      if (cx === 0 || cy === 0 || cx === COLS - 1 || cy === ROWS - 1) edge = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy, n = ny * COLS + nx;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || G.grid[ny][nx] !== 1 || seen.has(n)) continue;
        seen.add(n); part.push(n); stack.push(n);
      }
      if (part.length > 4) break;
    }
    if (!edge && part.length <= 4 && !stack.length) for (const k of part) out.add(k);
  }
  return out;
}

function renderMaps() {
  mapCanvas = document.createElement('canvas');
  mapCanvas.width = COLS * TILE; mapCanvas.height = ROWS * TILE;
  const m = mapCanvas.getContext('2d');
  mapUp = miniUp = null;
  if (G.upper) { // the library: one picture per floor (upstairs has see-through holes over the atrium and the stairs)
    drawLibraryMap(m, G, 0);
    mapUp = document.createElement('canvas'); mapUp.width = COLS * TILE; mapUp.height = ROWS * TILE;
    drawLibraryMap(mapUp.getContext('2d'), G, 1);
  }
  else if (G.map === 'apartment') drawApartmentMap(m, G);
  else if (G.map === 'forest') drawForestMap(m, G);
  else if (G.map === 'office') drawOfficeMap(m, G);
  else if (G.map === 'mall') drawMallMap(m, G);
  else if (G.arena) drawArenaMap(m, G);
  else drawBuildingMap(m);
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
  if (G.upper) { // the library: a minimap per floor, the staircases marked on both
    miniUp = document.createElement('canvas'); miniUp.width = miniCanvas.width; miniUp.height = miniCanvas.height;
    const u = miniUp.getContext('2d');
    u.fillStyle = '#0e0e18'; u.fillRect(0, 0, miniUp.width, miniUp.height);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const v = G.upper[y][x];
      if (v === 1) { u.fillStyle = '#3a3654'; u.fillRect(x * MINI, y * MINI, MINI, MINI); }
      else if (v === 4) { u.fillStyle = '#05050a'; u.fillRect(x * MINI, y * MINI, MINI, MINI); }
    }
    for (const c of [n, u]) { c.fillStyle = 'rgba(255,233,168,.6)'; for (const r of G.ramps) c.fillRect(r.x0 * MINI, r.y0 * MINI, (r.x1 - r.x0 + 1) * MINI, (r.y1 - r.y0 + 1) * MINI); }
  }
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
// runner, and the brief shimmer of a runner who was just unfrozen
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
    ctx.restore();
  }
}

// noise traps lying on the floor; one that just went off jiggles
function drawTrap(t, time) {
  const cx = center(t.x) + (t.hot ? Math.sin(time * 40) * 1.5 : 0), cy = center(t.y);
  ctx.save(); ctx.translate(cx, cy);
  switch (t.kind) {
    case 'glass': case 'mug': // shards
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05 + t.id, r = 4 + (i % 3) * 3;
        ctx.save(); ctx.translate(Math.cos(a) * r, Math.sin(a) * r); ctx.rotate(a * 2);
        ctx.fillStyle = t.kind === 'glass' ? 'rgba(190,230,250,.85)' : (i % 2 ? '#f4f1ea' : '#e85d5d');
        ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(3.5, 3); ctx.lineTo(-3, 2.5); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 0.8; ctx.stroke();
        ctx.restore();
      }
      if (t.kind === 'mug') { ctx.strokeStyle = '#f4f1ea'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(7, -5, 3.5, -1, 2); ctx.stroke(); }
      break;
    case 'cans': // a few tin cans knocked over
      for (let i = 0; i < 3; i++) {
        ctx.save(); ctx.translate(-7 + i * 7, (i % 2) * 5 - 2); ctx.rotate(0.6 * i - 0.4);
        ctx.fillStyle = '#9aa3ad'; ctx.fillRect(-5, -3, 10, 6); ctx.fillStyle = ['#e85d5d', '#4aa3df', '#f2b43b'][i]; ctx.fillRect(-3, -3, 6, 6);
        ctx.fillStyle = '#c9d0d6'; ctx.beginPath(); ctx.ellipse(5, 0, 1.5, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      break;
    case 'bubble': // a sheet of bubble wrap
      ctx.fillStyle = 'rgba(220,240,250,.55)'; ctx.fillRect(-11, -9, 22, 18); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 0.8;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { ctx.beginPath(); ctx.arc(-7.5 + i * 5, -5 + j * 5, 1.8, 0, Math.PI * 2); ctx.stroke(); }
      break;
    case 'toy': // a squeaky rubber duck
      ctx.fillStyle = '#f7d038'; ctx.beginPath(); ctx.ellipse(0, 2, 8, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(4, -4, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f08a24'; ctx.beginPath(); ctx.moveTo(8, -4); ctx.lineTo(12, -3); ctx.lineTo(8, -2); ctx.fill();
      ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(5, -5, 0.9, 0, Math.PI * 2); ctx.fill();
      break;
    case 'twigs': // dry sticks
      ctx.strokeStyle = '#8a6a48'; ctx.lineCap = 'round';
      for (let i = 0; i < 5; i++) { const a = i * 0.7 + t.id; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * -10, Math.sin(a) * -10); ctx.lineTo(Math.cos(a) * 10, Math.sin(a) * 10); ctx.stroke(); }
      break;
    case 'leaves': // a pile of dry leaves
      for (let i = 0; i < 9; i++) { const a = i * 0.7 + t.id; ctx.fillStyle = ['#c7742e', '#a85a24', '#d99a3a'][i % 3]; ctx.beginPath(); ctx.ellipse(Math.cos(a) * 7, Math.sin(a) * 6, 4.5, 2.5, a, 0, Math.PI * 2); ctx.fill(); }
      break;
    case 'books': // a toppled pile of books
      for (let i = 0; i < 5; i++) {
        ctx.save(); ctx.rotate(i * 1.3 + t.id); ctx.translate((i % 3 - 1) * 5, (i % 2) * 4 - 2);
        ctx.fillStyle = ['#c0392b', '#2e86c1', '#27ae60', '#f39c12', '#8e44ad'][i]; ctx.fillRect(-7, -5, 14, 10);
        ctx.fillStyle = '#f4efe2'; ctx.fillRect(-5, -5, 11, 2); ctx.restore();
      }
      break;
  }
  ctx.restore();
}

// where a noise came from: rings spreading out from the spot (shown through walls; you heard it)
function drawNoisePing(n, time) {
  const k = n.t / Sh.C.NOISE_SHOW;
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const r = 10 + ((time * 40 + i * 18) % 54);
    ctx.strokeStyle = `rgba(255,183,77,${k * (1 - r / 64)})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = `rgba(255,183,77,${k})`; ctx.beginPath(); ctx.arc(n.x, n.y, 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = `rgba(40,20,0,${k})`; ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', n.x, n.y + 1);
  ctx.restore();
}

// ---------------------------------------------------------------- key escape sprites
const onMyFloor = o => !G.upper || (o.fl || 0) === G.fl; // (in the library: only what's on your floor)
// (the safe zone is a square box, `r` from its middle to each side)
const inSafeZone = pos => { const z = G.esc && G.esc.zone; return !!z && sameFloorAs({ ...pos, fl: pos.fl ?? G.fl }, z) && Math.abs(pos.x - z.x) <= z.r && Math.abs(pos.y - z.y) <= z.r; };
// the gate: 'open' once everyone has unlocked their lock, 'mine' once you've unlocked yours (waiting for the others),
// 'key' while you carry your key there, 'locked' before that; and how many of the locks are open
function gateState() {
  const meP = G.players.get(myId), ps = [...G.players.values()];
  return { state: G.esc.open ? 'open' : meP.u ? 'mine' : meP.k ? 'key' : 'locked', done: ps.filter(p => p.u).length, total: ps.length };
}
const GATE_COLORS = { open: '#69f0ae', mine: '#ffd54f', key: '#ffd54f', locked: '#ff5252' };
// the bot: a clunky clay robot with a glowing red visor, and a tagger's red ring at its feet
function drawBot(c, x, y, flip, walk, t) {
  const s = Math.sin(walk) * 2.5, bob = walk ? Math.abs(Math.cos(walk)) * 1.5 : 0, ink = 'rgba(20,20,30,.6)';
  c.save(); c.translate(x, y);
  c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(0, 15, 12, 4.5, 0, 0, Math.PI * 2); c.fill();
  c.scale(flip * 1.25, 1.25); c.translate(0, -bob - 2);
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.strokeStyle = '#3c4150'; c.lineWidth = 4.5; // legs
  c.beginPath(); c.moveTo(-3.5, 4); c.lineTo(-4 + s, 12.5); c.moveTo(3.5, 4); c.lineTo(4 - s, 12.5); c.stroke();
  c.strokeStyle = '#555c6e'; c.lineWidth = 3.5; // arms
  c.beginPath(); c.moveTo(-8, -7); c.lineTo(-10 - s * 0.5, 3); c.moveTo(8, -7); c.lineTo(10 + s * 0.5, 3); c.stroke();
  c.fillStyle = clayFill(c, 0, -3, 12, '#6b7285'); c.strokeStyle = ink; c.lineWidth = 1.2; // body, with a light on its chest
  roundRect(c, -8.5, -10, 17, 15, 4); c.fill(); c.stroke();
  c.fillStyle = Math.sin(t * 6) > 0 ? '#ff5252' : '#8a2323'; c.beginPath(); c.arc(0, -3, 2, 0, Math.PI * 2); c.fill();
  c.fillStyle = clayFill(c, 0, -19, 9, '#7d8497'); c.strokeStyle = ink; // head
  roundRect(c, -8, -27, 16, 13, 4); c.fill(); c.stroke();
  c.shadowColor = '#ff2a2a'; c.shadowBlur = 10; c.fillStyle = '#ff3b3b'; roundRect(c, -1, -23.5, 9, 4.5, 2); c.fill(); c.shadowBlur = 0; // visor
  c.strokeStyle = '#3c4150'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, -27); c.lineTo(0, -32); c.stroke(); // antenna
  c.fillStyle = '#ff5252'; c.beginPath(); c.arc(0, -33, 2, 0, Math.PI * 2); c.fill();
  c.restore();
  drawTagMarks({ role: 'it' }, x, y, t);
}
// your key: gold, glowing, bobbing over the floor
function drawKey(x, y, t) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, y + 10, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(x, y - 6 + Math.sin(t * 3) * 3); ctx.rotate(-0.5);
  ctx.shadowColor = '#ffd54f'; ctx.shadowBlur = 16; ctx.strokeStyle = ctx.fillStyle = '#ffc93c'; ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.arc(-7, 0, 5, 0, Math.PI * 2); ctx.stroke();
  ctx.fillRect(-2, -1.75, 15, 3.5); ctx.fillRect(9, 1, 2.5, 4.5); ctx.fillRect(4.5, 1, 2.5, 3.5);
  ctx.restore();
}
// the exit gate: bars between two posts, with a padlock: red, yellow once yours is unlocked (it swings open), and
// green with the bars gone once everyone's is. Under it, how many locks are open.
function drawGate(x, y, t, { state, done, total }) {
  const col = GATE_COLORS[state], open = state === 'open';
  ctx.save(); ctx.translate(x, y);
  ctx.shadowColor = col; ctx.shadowBlur = 14 + 6 * Math.sin(t * 4);
  ctx.fillStyle = '#4a4458'; ctx.fillRect(-19, -26, 5, 40); ctx.fillRect(14, -26, 5, 40); ctx.fillRect(-21, -31, 42, 6);
  ctx.shadowBlur = 0; ctx.strokeStyle = '#8d88a0'; ctx.lineWidth = 2;
  if (!open) for (let i = -9; i <= 9; i += 6) { ctx.beginPath(); ctx.moveTo(i, -25); ctx.lineTo(i, 13); ctx.stroke(); }
  else { ctx.fillStyle = `rgba(105,240,174,${0.25 + 0.15 * Math.sin(t * 6)})`; ctx.fillRect(-14, -25, 28, 38); } // the way out
  ctx.shadowColor = col; ctx.shadowBlur = 10; ctx.fillStyle = ctx.strokeStyle = col;
  if (!open) {
    roundRect(ctx, -6, -6, 12, 9, 2); ctx.fill();
    ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(state === 'mine' ? 3 : 0, -6, 3.8, Math.PI, 0); ctx.stroke(); // your shackle swings open
  }
  ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText('EXIT', 0, -28);
  ctx.shadowBlur = 0; ctx.font = 'bold 11px system-ui'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.fillStyle = col;
  const lbl = open ? 'OPEN!' : `🔒 ${done}/${total} unlocked`;
  ctx.strokeText(lbl, 0, 26); ctx.fillText(lbl, 0, 26);
  ctx.restore();
}
// the safe zone: a green square box on the floor with a countdown; it flashes just before it moves
function drawZone(z, t, zl) {
  const blink = zl < 3 && Math.floor(t * 6) % 2, x0 = z.x - z.r, y0 = z.y - z.r, s = z.r * 2;
  ctx.save();
  ctx.fillStyle = `rgba(105,240,174,${blink ? 0.04 : 0.12})`; ctx.fillRect(x0, y0, s, s);
  ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t * 20; ctx.strokeStyle = `rgba(105,240,174,${blink ? 0.3 : 0.85})`; ctx.lineWidth = 3;
  ctx.strokeRect(x0, y0, s, s); ctx.setLineDash([]);
  ctx.fillStyle = `rgba(105,240,174,${blink ? 0.3 : 0.9})`; // solid corners, so it reads as a box
  for (const [cx, cy] of [[x0, y0], [x0 + s, y0], [x0, y0 + s], [x0 + s, y0 + s]]) ctx.fillRect(cx - 4, cy - 4, 8, 8);
  ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.fillStyle = '#69f0ae';
  ctx.strokeText(`SAFE · ${Math.ceil(zl)}`, z.x, z.y - z.r - 8); ctx.fillText(`SAFE · ${Math.ceil(zl)}`, z.x, z.y - z.r - 8);
  ctx.restore();
}

function nameTag(text, x, y, color) {
  ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}

// ---------------------------------------------------------------- frame
// you always see through your own eyes (frozen runners included: they can still turn and look around)
function getView() { return { x: G.me.x, y: G.me.y, fl: G.fl, a: aim, id: myId }; }
// Who you can see: yourself, and anyone in your light. Your teammates also show through the dark as a ring
// and a name (so runners can find frozen friends), but the other side only shows up when you can actually see them.
const posOf = (id, p) => id === myId ? { x: G.me.x, y: G.me.y, fl: G.fl } : { x: p.rx, y: p.ry, fl: p.fl };
// how high someone is, in floors (the apartment's flights of stairs, or the library's floors and staircases)
const heightAt = pos => G.upper ? Sh.elev(G, pos) : Sh.stairHeight(G.flights, pos.x, pos.y);
const canSee = (view, id, p, pos) => id === myId || (!(G.mode === 'clay' && G.phase !== 'hunt') && isLit(view, pos));

// first / third person: same visibility rules as top-down, drawn in 3D by view3d.js
function draw3D(t) {
  const view = getView();
  const players = new Map();
  for (const [id, p] of G.players) {
    const pos = posOf(id, p), self = id === myId;
    players.set(id, {
      ...pos, a: self ? aim : p.ra, walk: self ? G.walk : p.walk, role: p.role, fz: p.fz, imm: p.imm,
      show: canSee(view, id, p, pos) && !(G.mode === 'clay' && G.phase === 'sculpt') && !(p.e && !self), mark: !self && isTeammate(p) && !p.e, h: heightAt(pos), jump: jumpK(self ? G.jumpT : p.jumpT) * jump3d() + (p.ayR || 0),
      pose: G.arena ? poseOf(id, p) : null, move: self ? G.mv : p.mv,
    });
  }
  v3d.render({
    G, view, t, mode: viewMode, players, noises: G.noises, beams: G.mode === 'fight' ? G.beams.map(b => ({ ...b, age: b.t + (performance.now() - G.beamsAt) / 1000, len: FT[b.k] ? FT[b.k].len : 0, life: FT[b.k] ? FT[b.k].beam : 0 })) : null, fightCam: G.mode === 'fight' && inMatch(myId), sparks: G.sparks,
    koCam: G.mode === 'fight' && G.fm && G.fp === 'ko' ? (() => { const a = G.players.get(G.fm.a), b = G.players.get(G.fm.b); return a && b ? { x: (posOf(G.fm.a, a).x + posOf(G.fm.b, b).x) / 2, y: (posOf(G.fm.a, a).y + posOf(G.fm.b, b).y) / 2 } : null; })() : null, hitStop: G.hitStop, shake: G.shake || 0, // (a knock-out: the camera circles the fighters)
    camZoom: (() => { const me = G.mode === 'fight' && inMatch(myId) && poseOf(myId, G.players.get(myId)); return me && FT[me.k] && FT[me.k].beam ? 1 : 0; })(),  excite: G.mode === 'fight' ? Math.min(1, G.fx.length * 0.5) : 0, // (push in close while you charge and fire a beam)
    clay: G.mode === 'clay' ? [...G.objs.values()].map(o => ({ ...o, show: o.x != null && (G.phase === 'hunt' || o.id === myId), fill: lumpColor((G.players.get(o.id) || { slot: 0 }).slot) })) : null,
    pitch, flicker: G.flicker, walk: G.walk, viewH: heightAt(view), viewJump: jumpK(G.jumpT) * jump3d() + ((G.players.get(myId) || {}).ayR || 0),
    escape: G.esc && {
      bots: G.esc.bots.map(b => { const pos = { x: b.rx, y: b.ry, fl: b.fl }; return { ...pos, a: b.ra, walk: b.walk, h: heightAt(pos), show: isLit(view, pos) }; }),
      key: G.esc.key && { ...G.esc.key, show: !G.players.get(myId).k && isLit(view, G.esc.key) },
      gate: G.esc.gate, gateState: gateState().state, zone: G.esc.zone, zl: G.esc.zl,
    },
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
  if (mapUp && G.fl) { // upstairs: the ground floor shows (dimmer) only through the holes in the floor
    ctx.fillStyle = 'rgba(12,14,24,.42)'; ctx.fillRect(0, 0, COLS * TILE, ROWS * TILE);
    ctx.drawImage(mapUp, 0, 0);
  }
  if (G.doors.length) drawDoors2D(ctx, G);
  for (const tr of G.traps) if ((tr.fl || 0) === G.fl) drawTrap(tr, t);
  if (G.mode === 'clay') for (const o of G.objs.values()) drawClayObj(o, view, t);
  const meK = G.esc && G.players.get(myId).k;
  if (G.esc && G.esc.key && !meK && onMyFloor(G.esc.key) && isLit(view, G.esc.key)) drawKey(G.esc.key.x, G.esc.key.y, t); // your key: only in your light

  // everyone you can see, sorted by y so characters lower on screen draw in front
  const actors = [];
  for (const [id, p] of G.players) {
    const pos = posOf(id, p), self = id === myId;
    if (!canSee(view, id, p, pos) || (p.e && !self)) continue; // (in key escape, anyone who got out is gone)
    const below = G.upper && Sh.elev(G, pos) < Sh.elev(G, view) - 0.5; // seen down in the atrium from the gallery
    const up = jumpK(self ? G.jumpT : p.jumpT) * jumpPx() + (p.ayR || 0) * 34;
    actors.push({ y: pos.y + (below ? -1e5 : 0), draw: () => {
      const blink = p.imm && Math.floor(t * 10) % 2; // just unfrozen: can't be tagged for a moment
      if (up) { ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(pos.x, pos.y + 15, 11 * (1 - up / 60), 4, 0, 0, Math.PI * 2); ctx.fill(); } // their shadow stays on the floor
      const sprites = G.arena && G.sprites && G.sprites.get(id);
      if (sprites) G.drawSprite(ctx, sprites, pos.x, pos.y - up, self ? G.flip : p.flip, self ? G.walk : p.walk, poseOf(id, p));
      else drawPerson(ctx, p.char, pos.x, pos.y - up, p.fz ? shade(COLORS[p.slot], 0.75) : COLORS[p.slot], self ? G.flip : p.flip, self ? G.walk : p.walk, (blink ? 0.45 : 1) * (below ? 0.7 : 1), p.slot);
      drawTagMarks(p, pos.x, pos.y - up, t);
    } });
  }
  if (G.esc) for (const b of G.esc.bots) { // the bots: only when you can see them
    const pos = { x: b.rx, y: b.ry, fl: b.fl };
    if (isLit(view, pos)) actors.push({ y: pos.y, draw: () => drawBot(ctx, pos.x, pos.y, b.flip, b.walk, t) });
  }
  actors.sort((a, b) => a.y - b.y).forEach(a => a.draw());
  if (G.mode === 'fight') drawFightWorld(t);
  const sinceAct = (performance.now() - (G.actAt || -1e9)) / 250;
  if (sinceAct < 1) { // a quick ring around you when you click: your reach
    const reach = G.role === 'it' ? Sh.C.TAG_DIST : Sh.C.RESCUE_DIST;
    ctx.strokeStyle = G.role === 'it' ? `rgba(255,90,90,${1 - sinceAct})` : `rgba(105,240,174,${1 - sinceAct})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(G.me.x, G.me.y, reach * (0.6 + 0.4 * sinceAct), 0, Math.PI * 2); ctx.stroke();
  }

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
    if (G.office) drawOfficeLamps(ctx, G);
    if (G.mall) drawMallGlow(ctx, G, t);
    if (G.library) drawLibraryGlow(ctx, G, t);
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
  for (const n of G.noises) drawNoisePing(n, t);
  if (G.esc) { // the safe zone and the exit gate glow through the dark, so you can always find them
    if (G.esc.zone && onMyFloor(G.esc.zone)) drawZone(G.esc.zone, t, G.esc.zl);
    if (onMyFloor(G.esc.gate)) drawGate(G.esc.gate.x, G.esc.gate.y, t, gateState());
    for (const b of G.esc.bots) if (isLit(view, { x: b.rx, y: b.ry, fl: b.fl })) nameTag('BOT', b.rx, b.ry - 50, '#ff6b6b');
  }
  // on top of the dark: names of everyone you can see, and your teammates' markers wherever they are
  for (const [id, p] of G.players) {
    const pos = posOf(id, p), self = id === myId, seen = canSee(view, id, p, pos), mate = !self && isTeammate(p);
    if ((!seen && !mate) || (p.e && !self)) continue;
    const col = p.role === 'it' ? '#ff6b6b' : self ? '#fff' : COLORS[p.slot];
    if (mate && !seen) { // a teammate out of sight: a ring (icy blue if they're frozen) where they are
      ctx.strokeStyle = p.fz ? '#7fd4ff' : COLORS[p.slot]; ctx.globalAlpha = 0.7; ctx.lineWidth = p.fz ? 3 : 2;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, 18, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      if (p.fz) { ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#bfefff'; ctx.fillText('❄', pos.x, pos.y); }
    }
    const updown = !G.upper || self ? '' : p.fl > G.fl ? ' ↑' : p.fl < G.fl ? ' ↓' : ''; // on the floor above or below you
    nameTag((p.role === 'it' ? `${p.name} · IT` : p.fz ? `${p.name} · frozen` : p.name) + updown, pos.x, pos.y - 46, col);
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
  ctx.globalAlpha = 0.85; ctx.drawImage(miniUp && G.fl ? miniUp : miniCanvas, 0, 0); ctx.globalAlpha = 1;
  for (const [id, p] of G.players) { // your teammates (frozen ones as an icy ring; fainter if they're on the other floor)
    if (id === myId || !isTeammate(p) || p.e) continue;
    const px = p.rx / TILE * MINI, py = p.ry / TILE * MINI;
    ctx.globalAlpha = G.upper && p.fl !== G.fl ? 0.45 : 1;
    if (p.fz) { ctx.strokeStyle = '#7fd4ff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px, py, 3.2, 0, Math.PI * 2); ctx.stroke(); }
    else { ctx.fillStyle = COLORS[p.slot]; ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  const mine = G.mode === 'clay' && G.objs.get(myId);
  if (mine && mine.x != null && (mine.fl || 0) === G.fl) { // your sculpture: a little star
    ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('★', mine.x / TILE * MINI, mine.y / TILE * MINI);
  }
  if (G.esc) { // key escape: the safe zone (green) and the exit gate
    const z = G.esc.zone, gt = G.esc.gate;
    if (z) { ctx.globalAlpha = G.upper && z.fl !== G.fl ? 0.4 : 1; ctx.fillStyle = 'rgba(105,240,174,.35)'; ctx.strokeStyle = '#69f0ae'; ctx.lineWidth = 1.2; const zs = z.r / TILE * MINI; ctx.fillRect(z.x / TILE * MINI - zs, z.y / TILE * MINI - zs, zs * 2, zs * 2); ctx.strokeRect(z.x / TILE * MINI - zs, z.y / TILE * MINI - zs, zs * 2, zs * 2); }
    ctx.globalAlpha = G.upper && gt.fl !== G.fl ? 0.4 : 1;
    const gx = gt.x / TILE * MINI, gy = gt.y / TILE * MINI, on = Math.floor(performance.now() / 400) % 2;
    ctx.fillStyle = G.esc.open ? '#69f0ae' : '#ffd54f'; ctx.fillRect(gx - 3.5, gy - 3.5, 7, 7);
    if (on) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(gx - 5, gy - 5, 10, 10); }
    ctx.globalAlpha = 1;
  }
  for (const n of G.noises) if (Math.floor(n.t * 6) % 2) { // noises you heard, flashing
    ctx.fillStyle = '#ffb74d'; ctx.beginPath(); ctx.arc(n.x / TILE * MINI, n.y / TILE * MINI, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  // you: an arrow showing where your headlight points
  ctx.save(); ctx.translate(G.me.x / TILE * MINI, G.me.y / TILE * MINI); ctx.rotate(aim + Math.PI / 2);
  ctx.fillStyle = G.role === 'it' ? '#ff5252' : COLORS[G.slot]; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(3.5, 3); ctx.lineTo(-3.5, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = '#2c2a40'; ctx.lineWidth = 1; ctx.strokeRect(0, 0, COLS * MINI, ROWS * MINI);
  if (G.upper) { // which floor of the library you're on
    ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = '#ffe9a8';
    ctx.fillText(G.fl ? 'UPSTAIRS' : 'GROUND FLOOR', COLS * MINI / 2, ROWS * MINI + 3);
  }
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
  const target = actTarget(), clickWord = isTouch ? 'Tap the button' : 'Click';
  if (G.explore) { status = 'EXPLORING'; col = '#69f0ae'; }
  else if (G.esc) [status, col] = meP.e ? ['ESCAPED', '#69f0ae'] : meP.fz ? ['CAUGHT', '#7fd4ff'] : inSafeZone(G.me) ? ['SAFE', '#69f0ae'] : G.esc.open ? ['GATE OPEN', '#69f0ae'] : meP.u ? ['UNLOCKED', '#ffd54f'] : meP.k ? ['GOT YOUR KEY', '#ffd54f'] : ['SEARCHING', '#ffe9a8'];
  else if (it) { status = G.time < G.hold ? 'IT · WAIT' : 'IT'; col = '#ff5252'; }
  else if (meP.fz) { status = 'FROZEN'; col = '#7fd4ff'; }
  else if (meP.imm) { status = 'SAFE FOR A MOMENT'; col = '#b388ff'; }
  else { status = 'RUNNER'; col = '#69f0ae'; }
  ctx.font = 'bold 12px system-ui'; ctx.fillStyle = col; ctx.textAlign = 'right'; ctx.fillText(status, x + w - 10, y + 20); ctx.textAlign = 'left';
  ctx.font = '13px system-ui'; ctx.fillStyle = '#e8e6f0';
  let hint;
  if (G.explore) hint = isTouch ? 'Walk around and look at the map' : 'Walk around and look at the map · L to leave';
  else if (G.esc) hint = meP.e ? 'You got out! Watch the others…' : meP.fz ? 'The bot caught you. Wait for a friend to unfreeze you' : target ? `${clickWord} to unfreeze ${target.name}!`
    : G.esc.open ? 'The gate is open! Get to it and get out' : meP.u ? `Your lock is open. Waiting for everyone (${gateState().done}/${gateState().total})`
    : meP.k ? 'Take your key to the EXIT gate (the square on the map)' : 'Find your gold key: it shines in your light';
  else if (it) hint = G.time < G.hold ? `Get ready… you can move in ${Math.ceil(G.hold - G.time)}s` : target ? `${clickWord} to freeze ${target.name}!` : `Catch a runner and ${clickWord.toLowerCase()} · frozen so far: ${meP.tags}`;
  else if (meP.fz) hint = 'Wait for a friend to come and unfreeze you';
  else hint = target ? `${clickWord} to unfreeze ${target.name}!` : `Get next to frozen friends and ${clickWord.toLowerCase()} to unfreeze them`;
  if (target) { ctx.font = 'bold 13px system-ui'; ctx.fillStyle = '#ffe680'; } // someone's in reach: say so
  ctx.fillText(hint, x + 14, y + 44);
}

// someone's in reach of a click: a bouncing arrow and a ring on them (top-down), a pulsing banner (every view),
// and a ping the moment they come into reach
function drawReachCue(t) {
  const target = actTarget(), it = G.role === 'it';
  if (target !== G.cueTarget) { if (target) reachPing(it); G.cueTarget = target; }
  if (!target) return;
  const col = it ? '255,82,82' : '105,240,174', pulse = 0.5 + 0.5 * Math.sin(t * 12);
  ctx.save();
  if (viewMode === 'top') {
    const view = getView(), sx = W / 2 + (target.rx - view.x) * Z, sy = H / 2 + (target.ry - view.y) * Z;
    ctx.strokeStyle = `rgba(${col},${0.6 + 0.4 * pulse})`; ctx.lineWidth = 3; ctx.shadowColor = `rgb(${col})`; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.ellipse(sx, sy + 15 * Z, (20 + 4 * pulse) * Z, (8 + 1.5 * pulse) * Z, 0, 0, Math.PI * 2); ctx.stroke();
    const ay = sy - 58 * Z - 6 * Math.abs(Math.sin(t * 6)); // arrow over their head, bouncing
    ctx.fillStyle = `rgb(${col})`;
    ctx.beginPath(); ctx.moveTo(sx, ay + 12); ctx.lineTo(sx - 11, ay - 2); ctx.lineTo(sx - 4, ay - 2); ctx.lineTo(sx - 4, ay - 14);
    ctx.lineTo(sx + 4, ay - 14); ctx.lineTo(sx + 4, ay - 2); ctx.lineTo(sx + 11, ay - 2); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)';
    const word = isTouch ? 'TAP!' : 'CLICK!';
    ctx.strokeText(word, sx, ay - 17); ctx.fillText(word, sx, ay - 17);
  }
  const text = `${isTouch ? (it ? 'TAP TAG' : 'TAP UNFREEZE') : 'CLICK / SPACE'} · ${it ? 'freeze' : 'unfreeze'} ${target.name}!`;
  ctx.font = `bold ${W < 480 ? 14 : 18}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const bw = ctx.measureText(text).width + 36, bh = 38, bx = (W - bw) / 2, by = H * 0.68;
  ctx.fillStyle = `rgba(10,10,20,${0.75 + 0.15 * pulse})`; roundRect(ctx, bx, by, bw, bh, 10); ctx.fill();
  ctx.strokeStyle = `rgba(${col},${0.55 + 0.45 * pulse})`; ctx.lineWidth = 2.5; ctx.shadowColor = `rgb(${col})`; ctx.shadowBlur = 10 * pulse; ctx.stroke();
  ctx.shadowBlur = 0; ctx.fillStyle = `rgb(${col})`; ctx.fillText(text, W / 2, by + bh / 2 + 1);
  ctx.restore();
}
// key escape: the key signal. Five bars, short to tall, light up one by one the closer you walk to your key (by the
// way you'd have to walk, so walls don't fool it); each new bar beeps a little higher.
const SIGNAL_STEPS = [22, 15, 10, 6, 3]; // tiles away for 1, 2, 3, 4 and 5 bars
function keySignal() {
  const kd = G.esc.keyDist;
  if (!kd) return 0;
  const tl = Sh.tileOf(G.me), i = Sh.I(tl.x, tl.y);
  let d = kd.d[G.fl * kd.N + i];
  if (d < 0 && kd.grids.length > 1) d = kd.d[(1 - G.fl) * kd.N + i]; // (half way up a staircase)
  return d < 0 ? 0 : SIGNAL_STEPS.filter(s => d <= s).length;
}
function drawKeySignal(meP, t) {
  if (meP.k || meP.e || meP.fz) { G.esc.signal = 0; return; }
  const n = keySignal();
  if (n > G.esc.signal) signalBeep(n);
  G.esc.signal = n;
  const x = 12, w = 168, h = 52, y = H - 72 - h - 8;
  ctx.save();
  ctx.fillStyle = 'rgba(10,10,20,.8)'; roundRect(ctx, x, y, w, h, 8); ctx.fill();
  ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#ffe9a8';
  ctx.fillText('KEY SIGNAL', x + 12, y + 18);
  ctx.font = '12px system-ui'; ctx.fillStyle = n >= 4 ? '#ffd54f' : '#b9b5d6';
  ctx.fillText(['No signal', 'Faint', 'Getting closer', 'Close', 'Very close', 'Right here!'][n], x + 12, y + 38);
  const bx = x + w - 84, base = y + h - 10;
  for (let i = 0; i < 5; i++) { // bars rising from short to tall
    const bh = 8 + i * 7, on = i < n, top = on && i === n - 1;
    ctx.fillStyle = on ? (top ? `rgba(255,213,79,${0.65 + 0.35 * Math.sin(t * (6 + n * 2))})` : '#ffc93c') : 'rgba(255,255,255,.14)';
    if (on) { ctx.shadowColor = '#ffd54f'; ctx.shadowBlur = 6 + n * 2; } else ctx.shadowBlur = 0;
    roundRect(ctx, bx + i * 15, base - bh, 10, bh, 2); ctx.fill();
  }
  ctx.restore();
}
function signalBeep(n) {
  if (!actx || actx.state !== 'running') return;
  const now = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
  o.type = 'sine'; o.frequency.value = 440 * Math.pow(1.26, n);
  g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.12, now + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
  o.connect(g).connect(actx.destination); o.start(now); o.stop(now + 0.17);
}
function reachPing(it) {
  if (!actx || actx.state !== 'running') return;
  const now = actx.currentTime;
  [0, 0.08].forEach((dt, i) => {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'triangle'; o.frequency.value = (it ? 660 : 880) * (i ? 1.5 : 1);
    g.gain.setValueAtTime(0.0001, now + dt); g.gain.exponentialRampToValueAtTime(0.18, now + dt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, now + dt + 0.12);
    o.connect(g).connect(actx.destination); o.start(now + dt); o.stop(now + dt + 0.14);
  });
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
  if (G.mode === 'clay') { actBtn.hidden = true; drawClayHud(meP, t); drawHudFooter(); return; }
  if (G.mode === 'fight') { actBtn.hidden = true; drawFightHud(meP, t); drawHudFooter(); return; }
  drawStatus(meP);
  if (G.esc) drawKeySignal(meP, t);
  drawReachCue(t);
  // phones: the tag / unfreeze button, lit up when someone's in reach
  const showBtn = isTouch && !G.explore && !(meP.fz && G.role !== 'it');
  actBtn.hidden = !showBtn;
  if (showBtn) {
    actBtn.textContent = G.role === 'it' ? 'TAG' : 'UNFREEZE';
    actBtn.classList.toggle('ready', !!actTarget());
    actBtn.classList.toggle('it', G.role === 'it');
  }

  // top bar: your role, how many runners are still free, and the time left
  const bw = Math.min(560, W - 20), bx = (W - bw) / 2;
  ctx.fillStyle = 'rgba(10,10,20,.88)'; roundRect(ctx, bx, 8, bw, 32, 8); ctx.fill();
  ctx.strokeStyle = '#2c2a40'; ctx.lineWidth = 1; ctx.stroke();
  ctx.font = `bold ${W < 480 ? 12 : 14}px system-ui`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  const cy = 24, cols = [bx + bw * 0.17, bx + bw * 0.5, bx + bw * 0.83];
  if (G.explore) {
    ctx.fillStyle = '#69f0ae'; ctx.fillText(`Exploring · ${Sh.MAPS.find(mp => mp[0] === G.map)?.[1] || G.map}`, bx + bw / 2, cy);
  } else if (G.esc) {
    const ps = [...G.players.values()], out = ps.filter(p => p.e).length;
    ctx.fillStyle = meP.e || G.esc.open ? '#69f0ae' : meP.k ? '#ffd54f' : '#ffe9a8';
    ctx.fillText(meP.e ? 'ESCAPED' : G.esc.open ? 'GATE OPEN!' : meP.u ? 'LOCK OPEN ✓' : meP.k ? 'KEY ✓ → GATE' : 'FIND YOUR KEY', cols[0], cy);
    const gs = gateState();
    ctx.fillStyle = '#c9e9ff'; ctx.fillText(G.esc.open ? `Escaped ${out}/${ps.length}` : `Locks open ${gs.done}/${gs.total}`, cols[1], cy);
    const left = Math.max(0, G.roundTime - G.time), m = Math.floor(left / 60), s = Math.floor(left % 60);
    ctx.fillStyle = left < 15 && Math.sin(t * 10) > 0 ? '#ff5252' : '#ffe9a8';
    ctx.fillText(G.time < G.hold ? `Bot wakes in ${Math.ceil(G.hold - G.time)}` : `${m}:${String(s).padStart(2, '0')} left`, cols[2], cy);
    // when the safe zone moves next (it flashes for the last 3 seconds)
    const zt = `Safe zone moves in ${Math.ceil(G.esc.zl)}s`, warn = G.esc.zl < 3;
    ctx.font = 'bold 12px system-ui'; const zw = ctx.measureText(zt).width + 22;
    ctx.fillStyle = 'rgba(10,10,20,.8)'; roundRect(ctx, (W - zw) / 2, 44, zw, 20, 6); ctx.fill();
    ctx.fillStyle = warn && Math.sin(t * 14) > 0 ? '#ffffff' : '#69f0ae'; ctx.fillText(zt, W / 2, 54);
  } else {
  ctx.fillStyle = G.role === 'it' ? '#ff5252' : '#69f0ae'; ctx.fillText(G.role === 'it' ? "YOU'RE IT" : 'RUNNER', cols[0], cy);
  const runners = [...G.players.values()].filter(p => p.role === 'run'), free = runners.filter(p => !p.fz).length;
  ctx.fillStyle = '#c9e9ff'; ctx.fillText(`Free runners ${free}/${runners.length}`, cols[1], cy);
  const left = Math.max(0, G.roundTime - G.time), m = Math.floor(left / 60), s = Math.floor(left % 60);
  ctx.fillStyle = left < 15 && Math.sin(t * 10) > 0 ? '#ff5252' : '#ffe9a8';
  ctx.fillText(G.time < G.hold ? `Taggers in ${Math.ceil(G.hold - G.time)}` : `${m}:${String(s).padStart(2, '0')} left`, cols[2], cy);
  }
  drawHudFooter();
}

// the bottom-right hints, messages and the touch joystick (both game modes)
function drawHudFooter() {
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
    ctx.fillText(mg.text, W / 2, (G.esc ? 84 : 62) + i * 24); // (below the safe zone's countdown in key escape)
  });
  ctx.globalAlpha = 1;

  if (joy) { // touch joystick
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 50, 0, Math.PI * 2); ctx.stroke();
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy, l = Math.hypot(dx, dy), k = l > 50 ? 50 / l : 1;
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.beginPath(); ctx.arc(joy.ox + dx * k, joy.oy + dy * k, 20, 0, Math.PI * 2); ctx.fill();
  }
}

// ---------------------------------------------------------------- hide clay
// sculpt (the sculpting screen) → hide (walk round unseen, F puts your sculpture down) → hunt (find the one you're given)
const sculptHost = document.getElementById('sculpt'), clayBtn = document.getElementById('act');
let clayLib = null, sculptUI = null;
const loadClay = () => clayLib || (clayLib = import('./clayobj.js'));
const lumpColor = slot => (slot * 5) % Sh.CLAY_COLORS.length; // the color your lump starts out
const ownerName = id => (G.players.get(id) || { name: 'someone' }).name;
clayBtn.onclick = () => clayAction();

function startSculpt() {
  sculptHost.classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
  const t0 = performance.now(), total = G.sculptTime;
  import('./sculpt.js').then(mod => {
    if (!G || G.phase !== 'sculpt') return;
    sculptUI = mod.openSculpt(sculptHost, {
      fill: lumpColor(G.slot), deadline: () => total - (performance.now() - t0) / 1000,
      status: () => G && G.sculptDone ? `${G.sculptDone.done} of ${G.sculptDone.total} done` : '',
      onDone: data => send({ t: 'sculpt', ...data }),
    });
  }).catch(e => { console.error(e); closeSculpt(); if (G) addMsg("Couldn't open the sculpting screen: you'll get a plain lump of clay.", '#ffab91', 4); });
}
function closeSculpt() { if (sculptUI) { sculptUI.close(); sculptUI = null; } sculptHost.classList.add('hidden'); }

function onPhase(m) {
  G.phase = m.phase; G.left = m.left;
  if (m.phase === 'hide') { // everyone's sculptures arrive (but not where they'll be hidden)
    if (sculptUI) sculptUI.finish(); // (in case yours hadn't been sent yet)
    closeSculpt();
    for (const o of m.objs) G.objs.set(o.id, { id: o.id, data: o.data, x: null, y: null, fl: 0, found: false, by: null, thumb: null });
    loadClay().then(L => { for (const o of G.objs.values()) o.thumb = L.thumbnail(o.data, lumpColor((G.players.get(o.id) || { slot: 0 }).slot)); }).catch(e => console.error(e));
  }
  if (m.phase === 'hunt') for (const o of m.objs) { const ob = G.objs.get(o.id); if (ob) Object.assign(ob, { x: o.x, y: o.y, fl: o.fl }); }
}
function onPlaced(m) {
  const mine = G.objs.get(myId);
  if (mine) Object.assign(mine, { x: m.x, y: m.y, fl: m.f ?? m.fl ?? 0 });
  addMsg('Hidden! Press F again to move it somewhere else.', '#9be7c4', 2.5);
}
function onTarget(m) {
  G.target = m.id;
  addMsg(m.id ? `Find ${ownerName(m.id)}'s sculpture!` : "Nothing left for you to find. Your sculpture keeps scoring while it's hidden.", '#ffe9a8', 3);
}
function onFound(m) {
  const o = G.objs.get(m.owner);
  if (o) { o.found = true; o.by = m.by; }
  if (m.by === myId) { addMsg(`You found it! +${m.pts}`, '#69f0ae', 3); playNoise('squeak', 0.8); }
  else if (m.owner === myId) addMsg(`${ownerName(m.by)} found your sculpture!`, '#ffab91', 3);
}
// F (or the round button on a phone): put your sculpture down, or pick up the one you're hunting
function clayAction() {
  if (!G || G.mode !== 'clay' || ui !== 'play') return;
  if (G.phase === 'hide') send({ t: 'place' });
  else if (G.phase === 'hunt' && G.canFind) send({ t: 'find' });
}
function clayUpdate(dt) {
  G.left = Math.max(0, G.left - dt);
  const o = G.phase === 'hunt' && G.target && G.objs.get(G.target);
  G.canFind = !!(o && o.x != null && !o.found && (o.fl || 0) === G.fl && dist(G.me, o) <= Sh.C.FIND_DIST * TILE && isLit(getView(), o));
  const label = ui !== 'play' ? '' : G.phase === 'hide' ? 'Hide it here' : G.canFind ? 'Pick it up!' : '';
  clayBtn.style.display = isTouch && label ? 'block' : 'none';
  if (clayBtn.textContent !== label) clayBtn.textContent = label;
}

// a sculpture on the floor (top-down): only your own while hiding; during the hunt, any you can see
function drawClayObj(o, view, t) {
  if (o.x == null || !o.thumb || (o.fl || 0) !== G.fl) return;
  const mine = o.id === myId;
  if (G.phase !== 'hunt' && !mine) return;
  if (!mine && !isLit(view, o)) return;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(o.x, o.y + 10, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.drawImage(o.thumb, o.x - 19, o.y - 26, 38, 38);
  if (o.found) { ctx.fillStyle = '#69f0ae'; ctx.beginPath(); ctx.arc(o.x + 14, o.y - 22, 7, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#0b2a1a'; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✓', o.x + 14, o.y - 21); }
  else if (mine) nameTag('your sculpture', o.x, o.y + 26, '#ffe9a8');
  else if (o.id === G.target && G.canFind) { ctx.strokeStyle = `rgba(105,240,174,${0.6 + 0.4 * Math.sin(t * 8)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(o.x, o.y - 6, 26, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
}

function drawClayHud(meP, t) {
  const phaseCol = { sculpt: '#ffd54f', hide: '#b388ff', hunt: '#69f0ae' }[G.phase] || '#fff';
  // the top bar: the phase, what's going on, the time left in this phase
  const bw = Math.min(560, W - 20), bx = (W - bw) / 2;
  ctx.fillStyle = 'rgba(10,10,20,.88)'; roundRect(ctx, bx, 8, bw, 32, 8); ctx.fill();
  ctx.strokeStyle = '#2c2a40'; ctx.lineWidth = 1; ctx.stroke();
  ctx.font = `bold ${W < 480 ? 12 : 14}px system-ui`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  const cy = 24, cols = [bx + bw * 0.17, bx + bw * 0.5, bx + bw * 0.83], objs = [...G.objs.values()], mine = G.objs.get(myId);
  ctx.fillStyle = phaseCol; ctx.fillText({ sculpt: 'SCULPT', hide: 'HIDE IT', hunt: 'HUNT' }[G.phase] || '', cols[0], cy);
  ctx.fillStyle = '#c9e9ff';
  ctx.fillText(G.phase === 'hunt' ? `Found ${objs.filter(o => o.found).length}/${objs.length}` : G.phase === 'hide' ? (mine && mine.x != null ? 'Yours is hidden ✓' : 'Not hidden yet') : 'Sculpting…', cols[1], cy);
  const m = Math.floor(G.left / 60), s = Math.floor(G.left % 60);
  ctx.fillStyle = G.left < 10 && Math.sin(t * 10) > 0 ? '#ff5252' : '#ffe9a8'; ctx.fillText(`${m}:${String(s).padStart(2, '0')} left`, cols[2], cy);

  // the sculpture you're hunting, and the scores
  let y = 50;
  const tgt = G.phase === 'hunt' && G.target && G.objs.get(G.target);
  if (tgt) {
    ctx.fillStyle = 'rgba(10,10,20,.85)'; roundRect(ctx, 12, y, 124, 148, 10); ctx.fill();
    ctx.strokeStyle = G.canFind ? '#69f0ae' : '#2c2a40'; ctx.lineWidth = G.canFind ? 2.5 : 1; ctx.stroke();
    if (tgt.thumb) ctx.drawImage(tgt.thumb, 26, y + 6, 96, 96);
    ctx.font = 'bold 12px system-ui'; ctx.fillStyle = '#ffe9a8'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('FIND THIS', 74, y + 118); ctx.font = '12px system-ui'; ctx.fillStyle = '#c9c6da'; ctx.fillText(`${ownerName(G.target)}'s`, 74, y + 136);
    y += 158;
  }
  if (G.phase === 'hunt') {
    const list = [...G.players.values()].sort((a, b) => (b.sc || 0) - (a.sc || 0)).slice(0, 6);
    ctx.fillStyle = 'rgba(10,10,20,.75)'; roundRect(ctx, 12, y, 124, 14 + list.length * 18, 8); ctx.fill();
    ctx.font = '12px system-ui'; ctx.textBaseline = 'middle';
    list.forEach((p, i) => {
      ctx.textAlign = 'left'; ctx.fillStyle = COLORS[p.slot]; ctx.fillText(p.name.slice(0, 10), 22, y + 16 + i * 18);
      ctx.textAlign = 'right'; ctx.fillStyle = '#e8e6f0'; ctx.fillText(p.sc || 0, 128, y + 16 + i * 18);
    });
  }

  // the status box: your score and what to do now
  const w = Math.min(340, W - 24), x = 12, by = H - 72;
  ctx.fillStyle = 'rgba(10,10,20,.8)'; roundRect(ctx, x, by, w, 60, 8); ctx.fill();
  ctx.fillStyle = phaseCol; ctx.fillRect(x, by, 4, 60);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.font = 'bold 14px system-ui'; ctx.fillStyle = COLORS[meP.slot]; ctx.fillText(meP.name, x + 14, by + 20);
  ctx.font = 'bold 12px system-ui'; ctx.fillStyle = '#ffe9a8'; ctx.textAlign = 'right'; ctx.fillText(`SCORE ${meP.sc || 0}`, x + w - 10, by + 20); ctx.textAlign = 'left';
  const key = isTouch ? 'the button' : 'F';
  const hint = G.phase === 'sculpt' ? 'Sculpting… everyone hides theirs next'
    : G.phase === 'hide' ? (mine && mine.x != null ? `Hidden! ${key} again moves it here` : `Find a sneaky spot and press ${key} to hide it`)
    : !G.target ? 'Nothing left to find. Stay hidden, little sculpture!'
    : G.canFind ? `It's right here! Press ${key} to pick it up` : 'Look for the sculpture in the picture';
  ctx.font = '13px system-ui'; ctx.fillStyle = '#e8e6f0'; ctx.fillText(hint, x + 14, by + 44);
}

function renderClayEnd() {
  const r = G.result, isHost = room.host === myId, won = r.winner.includes(myId);
  const names = r.stats.filter(p => r.winner.includes(p.id)).map(p => esc(p.name)).join(' and ');
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  overlay.classList.remove('hidden');
  panel.innerHTML = `
    <p class="result" style="color:${won ? '#69f0ae' : '#ffd54f'}">${names} ${r.winner.length > 1 ? 'WIN' : 'WINS'}!</p>
    <p class="sub">${esc(r.reason)}${won ? ' · You won!' : ''}</p>
    <ul class="plist">${[...r.stats].sort((a, b) => b.score - a.score).map(p => `<li><span class="dot" style="background:${COLORS[p.slot]}"></span>${esc(p.name)}
      <em style="color:#ffe9a8">${p.score} pts</em>
      <em>found ${p.finds} · theirs ${p.foundBy ? `was found by ${esc(p.foundBy)} after ${mmss(p.hidden)}` : `stayed hidden (${mmss(p.hidden)})`}</em></li>`).join('')}</ul>
    ${isHost ? `<div class="row"><button class="go" id="again">Play again</button><button id="lobby">Back to lobby</button></div>`
             : `<p class="sub">Waiting for the host…</p>`}`;
  if (isHost) {
    document.getElementById('again').onclick = () => send({ t: 'start' });
    document.getElementById('lobby').onclick = () => send({ t: 'lobby' });
  }
}

// ---------------------------------------------------------------- arena fights
// Make your own fighter (saved on this device), then a knockout bracket of 1 v 1 fights. While you're in the ring you
// always face your opponent; the server decides what hits.
const FT = Sh.FIGHT;
let myFighter = loadFighter();
const fbuildHost = document.getElementById('fbuild'), fpad = document.getElementById('fpad');
function openFighterBuilder(practice = false) {
  import('./fightui.js').then(mod => mod.openBuilder(fbuildHost, myFighter, f => {
    myFighter = f; saveFighter(f); send({ t: 'fighter', f });
    if (ui === 'lobby') renderLobby();
  }, { practice })).catch(e => { console.error(e); alert("Couldn't open the fighter maker (it needs WebGL)."); });
}
cvs.addEventListener('contextmenu', e => { if (G && G.mode === 'fight') e.preventDefault(); }); // (right-click kicks)
// phone buttons: punch, kick, dodge, special, and block (held down)
fpad.querySelectorAll('button').forEach(b => {
  const k = b.dataset.f;
  b.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); ensureAudio(); if (k === 'block') setBlock(true); else fightInput(k); }, { passive: false });
  b.addEventListener('touchend', e => { e.preventDefault(); if (k === 'block') setBlock(false); }, { passive: false });
  b.onmousedown = () => { if (k === 'block') setBlock(true); else fightInput(k); }; b.onmouseup = () => { if (k === 'block') setBlock(false); };
});
const inMatch = id => !!(G && G.fm && (G.fm.a === id || G.fm.b === id));
const oppOf = id => G.fm && G.players.get(G.fm.a === id ? G.fm.b : G.fm.a);
const nameOf = id => (G.players.get(id) || { name: '—' }).name;
const banner = (text, color, dur) => { G.banner = { text, color, t: dur, d: dur }; };

// a move: shown straight away on your own screen; the server works out whether it lands
function fightInput(a) {
  if (!G || G.mode !== 'fight' || ui !== 'play' || !inMatch(myId) || G.fp !== 'fight') return;
  const meP = G.players.get(myId), now = performance.now();
  if (!meP || meP.st) return;
  if (a === 'dodge') {
    if (now < G.dodgeCd || G.myAct) return;
    G.dodgeUntil = now + FT.DODGE.t * 1000; G.dodgeCd = now + FT.DODGE.cd * 1000;
    send({ t: 'fx', a }); playFight('swish');
    return;
  }
  if (G.myAct || G.blocking) return;
  let k = a;
  if (a === 'special') {
    if ((meP.mt || 0) < 100) { addMsg("Your special isn't ready: land (or take) some hits to fill the meter.", '#ffcc80', 1.6); return; }
    k = meP.fighter.special;
  }
  if (k === 'punch') G.jab = G.jab === 'L' ? 'R' : 'L'; // (jabs: left, right, left...)
  G.myAct = { k, t0: now, dur: Math.max(FT[k].cd, FT[k].wind + 0.05) * 1000, side: k === 'punch' ? G.jab : null };
  send({ t: 'fx', a });
  if (k === 'punch' || k === 'kick') playFight('swish');
}
function setBlock(on) {
  if (!G || G.mode !== 'fight') return;
  on = !!on && inMatch(myId);
  if (on !== G.blocking) { G.blocking = on; send({ t: 'blk', on }); }
}
// anime touches on the screen: an impact frame (everything flashes inverted) and speed lines rushing in
function screenFx(cls, ms, col) {
  const d = document.createElement('div'); d.className = cls; if (col) d.style.setProperty('--fx-col', col);
  if (cls === 'fx-letterbox') d.innerHTML = '<i></i><i></i>';
  document.body.appendChild(d); setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 300); }, ms);
}
function onHit(m) {
  const big = m.kind !== 'punch';
  if (!m.miss) { // a burst where it lands, a split-second freeze, and for a big clean hit an impact frame
    const kind = m.blocked ? 'block' : m.kind, now = performance.now();
    G.sparks.push({ id: ++G.sparkN, x: m.x, y: m.y, kind, t0: now });
    G.hitStop = now + (FT.HIT_STOP[kind] || 0.06) * 1000;
    if (big && !m.blocked) screenFx('fx-impact', m.kind === 'kick' ? 50 : 90);
    if (m.combo >= 2) G.comboHud = { by: m.by, n: m.combo, t0: now }; // (the combo counter)
    if (m.launch) { G.fx.push({ x: m.x, y: m.y - 26, t: 0.9, d: 0.9, text: 'LAUNCH!', dmg: 0, color: '#ff5252', big: true }); playFight('swish'); }
  }
  const v = G.players.get(m.to), att = G.players.get(m.by);
  if (v && !m.miss) Object.assign(v, { hitAt: performance.now(), hitK: m.blocked ? 'block' : m.kind, hitSide: m.by === myId ? G.myAct && G.myAct.side : att && att.sd }); // (they react to it)
  G.fx.push({ x: m.x, y: m.y, t: 0.7, d: 0.7, text: m.miss ? 'MISS' : m.blocked ? 'BLOCK' : { punch: 'POW', kick: 'BAM', kamehameha: 'KAMEHAMEHA', finalflash: 'FINAL FLASH' }[m.kind], dmg: m.miss ? 0 : m.dmg, color: m.miss ? '#b9b5d6' : m.blocked ? '#7fd4ff' : big ? '#ff8a3d' : '#ffe066', big });
  playFight(m.miss ? 'swish' : m.blocked ? 'block' : big ? 'kick' : 'punch');
  if (m.to === myId && !m.miss && !m.blocked) G.shake = big ? 0.35 : 0.15;
}
function fightUpdate(dt) {
  G.left = Math.max(0, G.left - dt);
  for (const f of G.fx) f.t -= dt;
  G.sparks = G.sparks.filter(s => performance.now() - s.t0 < 1000);
  G.fx = G.fx.filter(f => f.t > 0);
  if (G.banner && (G.banner.t -= dt) <= 0) G.banner = null;
  G.shake = Math.max(0, G.shake - dt);
  if (G.myAct && performance.now() - G.myAct.t0 > G.myAct.dur) G.myAct = null;
  const show = isTouch && ui === 'play' && inMatch(myId);
  fpad.style.display = show ? 'grid' : 'none';
  if (show) fpad.querySelector('[data-f="special"]').classList.toggle('ready', (G.players.get(myId).mt || 0) >= 100);
  if (!inMatch(myId) && G.blocking) setBlock(false);
}
// how you move while fighting: always facing your opponent; pinned before the bell, after a knock-out and while
// stunned, and while charging and firing a beam; slower while blocking; a dodge rolls you (back, if you're not steering);
// a big hit knocks you back. (The server allows exactly this.)
function fightSteer(dt, mx, my, speed, stuck) {
  if (!inMatch(myId)) return { mx, my, speed, still: stuck };
  const meP = G.players.get(myId), o = oppOf(myId), now = performance.now();
  if (o) aim = Math.atan2(o.ry - G.me.y, o.rx - G.me.x);
  G.flip = Math.cos(aim) < 0 ? -1 : 1;
  if (G.kb && now < G.kb.until) Sh.moveCircle(G, G.me, G.kb.vx * dt, G.kb.vy * dt, PLAYER_R);
  if (G.fp !== 'fight' || meP.st) return { mx: 0, my: 0, speed, still: true };
  if (now < G.dodgeUntil) {
    if (!mx && !my) { mx = -Math.cos(aim); my = -Math.sin(aim); }
    const l = Math.hypot(mx, my);
    return { mx: mx / l, my: my / l, speed: FT.DODGE.speed, still: false };
  }
  if (G.myAct && FT[G.myAct.k].beam) return { mx: 0, my: 0, speed, still: true };
  if (o) { // don't walk through each other
    const dx = G.me.x - o.rx, dy = G.me.y - o.ry, d = Math.hypot(dx, dy);
    if (d < 30 && d > 0.1) { const push = Math.min(30 - d, 160 * dt); Sh.moveCircle(G, G.me, dx / d * push, dy / d * push, PLAYER_R); }
  }
  return { mx, my, speed: speed * (G.blocking ? FT.BLOCK_SPEED : 1), still: false };
}
// what a fighter is doing right now, for drawing them: { k: move, p: 0..1 }
function poseOf(id, p) {
  if (!G.arena || !p) return null;
  const now = performance.now(), fighting = inMatch(id);
  if (fighting && p.hp <= 0) return { k: 'ko', p: 1 };
  if (!fighting) return null;
  if ((p.ayR || 0) > 0.03 || p.ay > 0) return { k: 'juggle', p: 0 }; // (launched: flying, helpless)
  if (p.gu) return { k: 'getup', p: Math.min(1, (now - (p.guAt || now)) / (FT.JUGGLE.getup * 1000)) };
  if (G.fp === 'ko' && p.hp > 0) { const o = oppOf(id); if (!o || (o.hp ?? 1) <= 0 || p.hp > o.hp) return { k: 'win', p: 0.5 }; } // (the round's winner celebrates)
  if (p.hitAt) { // taking a hit (or a hit on your guard)
    const d = FT.HIT_T[p.hitK] || 0.3, e = (now - p.hitAt) / 1000;
    if (e < d) return p.hitK === 'block' ? { k: 'blockhit', p: e / d } : { k: 'hit', p: e / d, kind: p.hitK, side: p.hitSide };
  }
  if (id === myId) {
    if (now < G.dodgeUntil) return { k: 'dodge', p: 1 - (G.dodgeUntil - now) / (FT.DODGE.t * 1000) };
    if (p.st) return { k: 'stun', p: (now % 1000) / 1000 };
    if (G.myAct) return { k: G.myAct.k, p: (now - G.myAct.t0) / G.myAct.dur, side: G.myAct.side };
    if (G.jumpT >= 0) return { k: 'jump', p: G.jumpT / jumpLen() };
    if (G.blocking) return { k: 'block', p: 1 };
    return null;
  }
  if (p.dg) return { k: 'dodge', p: (now % 280) / 280 };
  if (p.st) return { k: 'stun', p: (now % 1000) / 1000 };
  if (p.ak && FT[p.ak]) { const s = FT[p.ak]; return { k: p.ak, p: (p.at + (now - p.atAt) / 1000) / Math.max(s.cd, s.wind + 0.05), side: p.sd }; }
  if (p.jumpT >= 0) return { k: 'jump', p: p.jumpT / jumpLen() };
  if (p.bk) return { k: 'block', p: 1 };
  return null;
}
// fight sounds, made on the spot: thumps for punches and kicks, a clank for a block, a whoosh, a bell
function playFight(kind) {
  if (!actx || actx.state !== 'running') return;
  const now = actx.currentTime, out = actx.createGain(); out.gain.value = 0.5; out.connect(actx.destination);
  if (!noiseBuf) { noiseBuf = actx.createBuffer(1, actx.sampleRate / 2, actx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const tone = (t, dur, f0, f1, type, v) => { const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.02); };
  const burst = (t, dur, freq, q, v) => { const s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain(); s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f).connect(g).connect(out); s.start(t); s.stop(t + dur + 0.02); };
  if (kind === 'punch') { tone(now, 0.12, 180, 60, 'sine', 0.9); burst(now, 0.05, 900, 1, 0.6); }
  else if (kind === 'kick') { tone(now, 0.2, 140, 40, 'sine', 1); burst(now, 0.08, 500, 1, 0.8); }
  else if (kind === 'block') { tone(now, 0.15, 900, 700, 'square', 0.15); burst(now, 0.05, 2500, 3, 0.4); }
  else if (kind === 'swish') burst(now, 0.12, 1800, 0.7, 0.35);
  else if (kind === 'bell') { tone(now, 1.2, 1320, 1300, 'sine', 0.35); tone(now, 1.0, 660, 655, 'sine', 0.25); }
  else if (kind === 'kamehameha' || kind === 'finalflash') { // a rising charge, then the roar of the beam
    const s = FT[kind], big = kind === 'finalflash';
    tone(now, s.wind, big ? 160 : 220, big ? 700 : 900, 'sawtooth', 0.05); tone(now, s.wind, big ? 320 : 440, big ? 1400 : 1800, 'sine', 0.08);
    burst(now + s.wind, s.beam + 0.25, big ? 500 : 800, 0.4, 0.9); tone(now + s.wind, s.beam + 0.1, big ? 90 : 120, 45, 'sawtooth', 0.25);
  }
}

// in the world (top-down): beams, a special's energy ball as it charges, health bars over the two fighters, hit pops
function drawFightWorld(t) {
  for (const b of G.beams) {
    const s = FT[b.k]; if (!s) continue;
    const age = b.t + (performance.now() - G.beamsAt) / 1000, grow = Math.min(1, Math.max(0, age / 0.12)), fade = Math.min(1, Math.max(0, (s.beam - age) / 0.15));
    if (fade <= 0) continue;
    const col = b.k === 'finalflash' ? '255,225,77' : '95,208,255', L = s.len * grow, w = s.w * fade * (1 + 0.1 * Math.sin(t * 45));
    ctx.save(); ctx.translate(b.x, b.y - 14); ctx.rotate(b.a); ctx.lineCap = 'round';
    for (const [lw, c] of [[w * 2.2, `rgba(${col},.25)`], [w * 1.2, `rgba(${col},.75)`], [w * 0.45, '#ffffff']]) { ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L, 0); ctx.stroke(); }
    ctx.restore();
  }
  if (G.fm) for (const id of [G.fm.a, G.fm.b]) { // (charging: a growing ball of energy in the hands)
    const p = G.players.get(id), ps = p && poseOf(id, p), s = ps && FT[ps.k];
    if (!s || !s.beam) continue;
    const c = ps.p * Math.max(s.cd, s.wind + 0.05) / s.wind; if (c >= 1) continue;
    const pos = posOf(id, p), a = id === myId ? aim : (p.ra || 0), x = pos.x + Math.cos(a) * 10, y = pos.y - 16, r = 4 + 12 * c;
    const g = ctx.createRadialGradient(x, y, 1, x, y, r); g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, ps.k === 'finalflash' ? '#ffe14d' : '#5fd0ff'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * (1 + 0.1 * Math.sin(t * 50)), 0, Math.PI * 2); ctx.fill();
  }
  if (G.fm) for (const id of [G.fm.a, G.fm.b]) {
    const p = G.players.get(id); if (!p) continue;
    const pos = posOf(id, p), w = 40, hp = Math.max(0, p.hp ?? FT.HP) / FT.HP;
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(pos.x - w / 2 - 1, pos.y - 56, w + 2, 6);
    ctx.fillStyle = hp > 0.5 ? '#69f0ae' : hp > 0.25 ? '#ffd54f' : '#ff5252'; ctx.fillRect(pos.x - w / 2, pos.y - 55, w * hp, 4);
  }
  for (const f of G.fx) {
    const k = f.t / f.d, s = (f.big ? 1.4 : 1) * (1.3 - 0.3 * k);
    ctx.save(); ctx.translate(f.x, f.y - 30 - (1 - k) * 14); ctx.scale(s, s); ctx.globalAlpha = Math.min(1, k * 2);
    ctx.fillStyle = f.color; ctx.beginPath();
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, r = i % 2 ? 11 : 19; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.fill();
    ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#2a1400'; ctx.fillText(f.text, 0, 0);
    if (f.dmg) { ctx.font = 'bold 10px system-ui'; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeText(`-${f.dmg}`, 0, 22); ctx.fillText(`-${f.dmg}`, 0, 22); }
    ctx.restore();
  }
}

function drawFightHud(meP, t) {
  const fm = G.fm, bar = (x, y, w, h, k, c, back = 'rgba(0,0,0,.55)') => { ctx.fillStyle = back; roundRect(ctx, x, y, w, h, h / 2); ctx.fill(); if (k > 0) { ctx.fillStyle = c; roundRect(ctx, x, y, Math.max(h, w * k), h, h / 2); ctx.fill(); } };
  ctx.textBaseline = 'middle';
  if (fm) {
    // the two fighters: name, health, special meter and rounds won
    const pw = Math.min(260, (W - 120) / 2);
    [[fm.a, 12, 'left', fm.w[0]], [fm.b, W - 12 - pw, 'right', fm.w[1]]].forEach(([id, x, side, wins]) => {
      const p = G.players.get(id), hp = p ? Math.max(0, p.hp ?? FT.HP) / FT.HP : 0, mt = p ? (p.mt || 0) / 100 : 0;
      ctx.fillStyle = 'rgba(10,10,20,.8)'; roundRect(ctx, x, 8, pw, 54, 8); ctx.fill();
      ctx.font = 'bold 14px system-ui'; ctx.textAlign = side; ctx.fillStyle = p ? COLORS[p.slot] : '#999';
      ctx.fillText(`${nameOf(id)}${id === myId ? ' (you)' : ''}`, side === 'left' ? x + 10 : x + pw - 10, 20);
      for (let i = 0; i < FT.WINS; i++) { ctx.fillStyle = i < wins ? '#ffd54f' : 'rgba(255,255,255,.2)'; ctx.beginPath(); ctx.arc(side === 'left' ? x + pw - 14 - i * 14 : x + 14 + i * 14, 20, 5, 0, Math.PI * 2); ctx.fill(); }
      const hx = x + 10, hw = pw - 20;
      bar(hx, 30, hw, 12, hp, hp > 0.5 ? '#69f0ae' : hp > 0.25 ? '#ffd54f' : '#ff5252');
      bar(hx, 47, hw, 7, mt, mt >= 1 ? (Math.sin(t * 10) > 0 ? '#ffb347' : '#fff3c4') : '#ff9e40');
      if (mt >= 1) { ctx.font = 'bold 9px system-ui'; ctx.textAlign = side; ctx.fillStyle = '#2a1400'; ctx.fillText('SPECIAL READY', side === 'left' ? hx + 6 : hx + hw - 6, 51); }
    });
    ctx.textAlign = 'center'; ctx.font = 'bold 22px system-ui'; ctx.fillStyle = G.fp === 'fight' && G.left < 10 ? '#ff5252' : '#fff';
    ctx.fillText(G.fp === 'fight' ? String(Math.ceil(G.left)) : G.fp === 'intro' ? `${Math.ceil(G.left)}` : '—', W / 2, 26);
    ctx.font = 'bold 11px system-ui'; ctx.fillStyle = '#b9b5d6'; ctx.fillText(`ROUND ${fm.rn}`, W / 2, 48);
    // the combo counter: big slanted "N HITS" on the side of whoever's combo it is
    const ch = G.comboHud, ca = ch ? (performance.now() - ch.t0) / 1000 : 9;
    if (ch && ca < 1.4) {
      const left = ch.by === fm.a, pop = 1 + 0.35 * Math.max(0, 1 - ca / 0.12), x = left ? 40 : W - 40;
      ctx.save(); ctx.globalAlpha = Math.min(1, (1.4 - ca) * 3); ctx.translate(x, 118); ctx.rotate(-0.12); ctx.scale(pop, pop); ctx.textAlign = left ? 'left' : 'right';
      ctx.font = 'italic 900 40px system-ui'; ctx.lineWidth = 7; ctx.strokeStyle = '#1a0a00'; ctx.fillStyle = ch.by === myId ? '#ffd54f' : '#ff5252';
      ctx.strokeText(String(ch.n), 0, 0); ctx.fillText(String(ch.n), 0, 0);
      const nw = ctx.measureText(String(ch.n)).width; ctx.font = 'italic 900 18px system-ui'; ctx.lineWidth = 5;
      ctx.strokeText('HITS', left ? nw + 8 : -nw - 8, 8); ctx.fillStyle = '#fff'; ctx.fillText('HITS', left ? nw + 8 : -nw - 8, 8);
      ctx.restore();
    }
  } else {
    // between matches: who's up next
    const rd = G.bracket && G.bracket[G.bracket.length - 1], next = rd && rd.find(m => m.w == null);
    ctx.fillStyle = 'rgba(10,10,20,.85)'; roundRect(ctx, W / 2 - 170, 8, 340, 40, 8); ctx.fill();
    ctx.textAlign = 'center'; ctx.font = 'bold 15px system-ui'; ctx.fillStyle = '#ffd54f';
    ctx.fillText(next ? `Next up: ${nameOf(next.a)} vs ${nameOf(next.b)} · ${Math.ceil(G.left)}s` : `Next round of the bracket · ${Math.ceil(G.left)}s`, W / 2, 28);
  }
  // the bracket
  if (G.bracket && W > 700) {
    let y = 76;
    ctx.fillStyle = 'rgba(10,10,20,.75)'; roundRect(ctx, 12, y, 190, 22 + G.bracket.reduce((n, rd) => n + rd.length * 17 + 18, 0), 8); ctx.fill();
    ctx.textAlign = 'left'; ctx.font = 'bold 12px system-ui'; ctx.fillStyle = '#ffd54f'; ctx.fillText('BRACKET', 22, y + 13); y += 26;
    G.bracket.forEach((rd, i) => {
      ctx.font = 'bold 10px system-ui'; ctx.fillStyle = '#8f8ca6'; ctx.fillText(i === G.bracket.length - 1 && rd.length === 1 && G.bracket.length > 1 ? 'FINAL' : `ROUND ${i + 1}`, 22, y); y += 14;
      for (const m of rd) {
        const live = fm && fm.a === m.a && fm.b === m.b, nm = id => id == null ? 'bye' : nameOf(id).slice(0, 9);
        ctx.font = `${live ? 'bold ' : ''}11px system-ui`; ctx.fillStyle = live ? '#ff8a80' : m.w != null ? '#c9c6da' : '#e8e6f0';
        ctx.fillText(`${m.w === m.a ? '✓ ' : ''}${nm(m.a)}  vs  ${m.w === m.b && m.b != null ? '✓ ' : ''}${nm(m.b)}${live ? '  ●' : ''}`, 22, y); y += 17;
      }
      y += 4;
    });
  }
  // the big announcements
  if (G.banner) {
    const b = G.banner, k = b.t / b.d, s = 1 + Math.max(0, (k - 0.8) * 2.5);
    ctx.save(); ctx.translate(W / 2, H * 0.4); ctx.scale(s, s); ctx.globalAlpha = Math.min(1, k * 3);
    ctx.font = `900 ${Math.min(96, W / 8)}px system-ui`; ctx.textAlign = 'center'; ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(0,0,0,.7)';
    ctx.strokeText(b.text, 0, 0); ctx.fillStyle = b.color; ctx.fillText(b.text, 0, 0);
    ctx.restore();
  }
  // the bottom: the controls if you're fighting, or what's on if you're watching
  const w = Math.min(560, W - 24), x = 12, y = H - 72, fighting = inMatch(myId);
  ctx.fillStyle = 'rgba(10,10,20,.8)'; roundRect(ctx, x, y, w, 60, 8); ctx.fill();
  ctx.fillStyle = fighting ? '#ff5252' : '#b388ff'; ctx.fillRect(x, y, 4, 60);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.font = 'bold 14px system-ui'; ctx.fillStyle = COLORS[meP.slot]; ctx.fillText(meP.name, x + 14, y + 20);
  ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'right'; ctx.fillStyle = fighting ? '#ff8a80' : '#b388ff'; ctx.fillText(fighting ? 'FIGHTING' : 'WATCHING', x + w - 10, y + 20); ctx.textAlign = 'left';
  ctx.font = '12px system-ui'; ctx.fillStyle = '#e8e6f0';
  ctx.fillText(fighting ? (isTouch ? 'Use the buttons · double-tap to jump' : 'Jab: click / J · Hook kick: right-click / K · Block: hold Shift · Duck: C · Special: F · Jump: Space')
    : fm ? `${nameOf(fm.a)} vs ${nameOf(fm.b)}: watch from the stands` : 'Waiting for the next fight…', x + 14, y + 44);
}

function renderFightEnd() {
  const r = G.result, isHost = room.host === myId, champ = r.stats.find(p => p.id === r.champion);
  overlay.classList.remove('hidden');
  panel.innerHTML = `
    <p class="result" style="color:#ffd54f">${champ ? `🏆 ${esc(champ.name)} IS THE CHAMPION!` : 'NO CHAMPION'}</p>
    <p class="sub">${esc(r.reason || '')}${champ && champ.id === myId ? 'You won the tournament!' : ''}</p>
    ${champ ? '<canvas id="champ" width="168" height="192" style="position:static;display:block;margin:0 auto 12px;width:150px;height:171px"></canvas>' : ''}
    <h3>The bracket</h3>
    <ul class="plist">${r.rounds.map((rd, i) => rd.map(m => {
      const nm = id => id == null ? 'bye' : esc((r.stats.find(p => p.id === id) || { name: '—' }).name);
      return `<li><em style="margin:0 8px 0 0">${i === r.rounds.length - 1 && rd.length === 1 ? 'Final' : `Round ${i + 1}`}</em>${m.w === m.a ? '<b>' + nm(m.a) + '</b>' : nm(m.a)} vs ${m.w === m.b && m.b != null ? '<b>' + nm(m.b) + '</b>' : nm(m.b)}${m.b != null ? `<em>${m.s[0]}–${m.s[1]}</em>` : ''}</li>`;
    }).join('')).join('')}</ul>
    ${isHost ? `<div class="row"><button class="go" id="again">Play again</button><button id="lobby">Back to lobby</button></div>`
             : `<p class="sub">Waiting for the host…</p>`}`;
  if (champ) loadSprites().then(L => document.getElementById('champ').getContext('2d').drawImage(L.fighterPicture(champ.fighter, champ.slot, 'block'), 0, 12, 168, 168)).catch(e => console.error(e));
  if (isHost) {
    document.getElementById('again').onclick = () => send({ t: 'start' });
    document.getElementById('lobby').onclick = () => send({ t: 'lobby' });
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
