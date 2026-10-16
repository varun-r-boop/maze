// Arena fights: "Try it out". Your fighter alone in a plain white room with a training dummy, to try every move:
// walk round it, punch, kick, block, dodge, jump and use your special. Hits pop up their damage; the dummy staggers,
// gets knocked back, and gets back up after a knock-out. It all runs on your own device (no server, no other players),
// with the same moves and numbers as a real fight (Shared.FIGHT).
import * as THREE from 'three';
import { makeFighter, poseFighter, dummyParts, makeBeam, setBeam } from './fighter3d.js';

const Sh = window.Shared, FT = Sh.FIGHT, U = 1 / Sh.C.TILE; // (the fight numbers are in pixels; here 1 unit = 1 tile)
const ROOM = 6; // half the width of the room
const isTouch = matchMedia('(pointer: coarse)').matches;

export function createPractice(canvas, renderer, fighter, host, onExit) {
  // ---- the room
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#f2f2f0'); scene.fog = new THREE.Fog('#f2f2f0', 16, 34);
  scene.add(new THREE.HemisphereLight('#ffffff', '#c9c9c9', 1.9));
  const sun = new THREE.DirectionalLight('#ffffff', 1.4); sun.position.set(4, 10, 6); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.radius = 4; Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
  scene.add(sun);
  const white = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }), wallM = new THREE.MeshStandardMaterial({ color: '#f4f4f2', roughness: 0.95 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM * 2, ROOM * 2).rotateX(-Math.PI / 2), white); floor.receiveShadow = true; scene.add(floor);
  for (const [x, z, ry] of [[0, -ROOM, 0], [0, ROOM, 0], [-ROOM, 0, Math.PI / 2], [ROOM, 0, Math.PI / 2]]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(ROOM * 2, 2.6, 0.2), wallM); w.position.set(x, 1.3, z); w.rotation.y = ry; w.receiveShadow = true; scene.add(w);
  }
  const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 60);

  // ---- you and the dummy (a grey mannequin)
  const me = makeFighter(fighter), dummy = makeFighter({ special: 'kamehameha', parts: dummyParts('#b8bcc4') });
  scene.add(me, dummy);
  const S = { x: -1.4, z: 0, a: 0, walk: 0, act: null, block: false, dodgeUntil: 0, dodgeCd: 0, jumpT: -1, meter: 100, jab: 'L' };
  const D = { x: 1.4, z: 0, hp: FT.HP, stunUntil: 0, koUntil: 0, kbx: 0, kbz: 0, kbUntil: 0 };
  const beams = [], beamMesh = makeBeam(); scene.add(beamMesh);

  // ---- the overlay: the dummy's health, your special meter, how to play, a way back, and buttons on phones
  const ui = document.createElement('div'); ui.className = 'pr';
  ui.innerHTML = `
    <div class="pr-top">
      <div><span>TRAINING DUMMY</span><div class="pr-bar pr-hp"><i></i></div></div>
      <div><span>YOUR SPECIAL (${Sh.SPECIAL_NAMES[fighter.special]})</span><div class="pr-bar pr-mt"><i></i></div></div>
    </div>
    <p class="pr-help">${isTouch ? 'Drag to move · buttons to fight' : 'W A S D move · J or click: punch · K or right-click: kick · hold Shift: block · C: dodge · F: special · Space: jump'}</p>
    <button class="pr-exit">◀ Back to editor</button>
    ${isTouch ? `<div class="pr-pad">${['punch', 'kick', 'block', 'dodge', 'special', 'jump'].map(k => `<button data-pr="${k}">${k.toUpperCase()}</button>`).join('')}</div>` : ''}`;
  host.appendChild(ui);
  const hpBar = ui.querySelector('.pr-hp i'), mtBar = ui.querySelector('.pr-mt i');
  ui.querySelector('.pr-exit').onclick = () => onExit();
  const pops = [];
  const pop = (text, color, big) => { const el = document.createElement('div'); el.className = 'pr-pop'; el.textContent = text; el.style.color = color; if (big) el.style.fontSize = '30px'; ui.appendChild(el); pops.push({ el, t0: performance.now(), x: D.x, z: D.z }); };

  // ---- controls
  const keys = new Set();
  const doMove = k => {
    const now = performance.now();
    if (k === 'jump') { if (S.jumpT < 0) S.jumpT = 0; return; }
    if (k === 'dodge') { if (now < S.dodgeCd || S.act) return; S.dodgeUntil = now + FT.DODGE.t * 1000; S.dodgeCd = now + FT.DODGE.cd * 1000; return; }
    if (S.act || S.block) return;
    let mv = k;
    if (k === 'special') {
      if (S.meter < 100) { pop('Special not ready yet', '#8a8f98'); return; }
      S.meter = 0; mv = fighter.special;
    }
    const spec = FT[mv];
    if (mv === 'punch') S.jab = S.jab === 'L' ? 'R' : 'L'; // (jabs: left, right, left...)
    S.act = { k: mv, t0: now, dur: Math.max(spec.cd, spec.wind + 0.05) * 1000, done: false, side: mv === 'punch' ? S.jab : null };
  };
  const onKey = e => {
    if (e.target.tagName === 'INPUT') return;
    keys.add(e.code);
    if (e.repeat) return;
    const k = { KeyJ: 'punch', KeyK: 'kick', KeyC: 'dodge', KeyF: 'special', Space: 'jump' }[e.code];
    if (k) { e.preventDefault(); doMove(k); }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') S.block = true;
    if (e.code === 'Escape') onExit();
  };
  const onKeyUp = e => { keys.delete(e.code); if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') S.block = false; };
  const onMouse = e => { if (e.button === 0) doMove('punch'); if (e.button === 2) doMove('kick'); };
  const noMenu = e => e.preventDefault();
  let drag = null;
  const onDown = e => { if (e.pointerType === 'touch') drag = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 }; };
  const onDrag = e => { if (drag && e.pointerId === drag.id) { drag.dx = e.clientX - drag.x; drag.dy = e.clientY - drag.y; } };
  const onLift = e => { if (drag && e.pointerId === drag.id) drag = null; };
  addEventListener('keydown', onKey); addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouse); canvas.addEventListener('contextmenu', noMenu);
  canvas.addEventListener('pointerdown', onDown); addEventListener('pointermove', onDrag); addEventListener('pointerup', onLift);
  ui.querySelectorAll('[data-pr]').forEach(b => {
    b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (b.dataset.pr === 'block') S.block = true; else doMove(b.dataset.pr); });
    b.addEventListener('pointerup', () => { if (b.dataset.pr === 'block') S.block = false; });
  });

  // ---- a hit on the dummy
  function hitDummy(kind, dirx, dirz) {
    const now = performance.now(), spec = FT[kind];
    if (now < D.koUntil) return;
    D.hp = Math.max(0, D.hp - spec.dmg); S.meter = Math.min(100, S.meter + spec.dmg * FT.METER_DEAL);
    pop(`${{ punch: 'POW', kick: 'BAM', kamehameha: 'KAMEHAMEHA', finalflash: 'FINAL FLASH' }[kind]} -${spec.dmg}`, kind === 'punch' ? '#e0a400' : '#ff7a1a', kind !== 'punch');
    D.stunUntil = now + (spec.stun || 0.15) * 1000;
    if (spec.kb) { D.kbx = dirx * spec.kb * U; D.kbz = dirz * spec.kb * U; D.kbUntil = now + 260; }
    if (D.hp <= 0) { D.koUntil = now + 1800; pop('K.O.!', '#e53935', true); }
  }

  // ---- every frame
  let last = performance.now();
  function frame() {
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (camera.aspect !== w / h) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
    // you always face the dummy
    const tx = D.x - S.x, tz = D.z - S.z, dist = Math.hypot(tx, tz) || 1;
    S.a = Math.atan2(tz, tx);
    const c = Math.cos(S.a), s = Math.sin(S.a);
    // moving: W/S toward or away from the dummy, A/D round it (or drag on a phone)
    let fwd = 0, side = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) fwd++; if (keys.has('KeyS') || keys.has('ArrowDown')) fwd--;
    if (keys.has('KeyD') || keys.has('ArrowRight')) side++; if (keys.has('KeyA') || keys.has('ArrowLeft')) side--;
    if (drag) { if (Math.abs(drag.dy) > 12) fwd = Math.max(-1, Math.min(1, -drag.dy / 50)); if (Math.abs(drag.dx) > 12) side = Math.max(-1, Math.min(1, drag.dx / 50)); }
    let mx = c * fwd - s * side, mz = s * fwd + c * side, speed = (S.block ? FT.BLOCK_SPEED : 1) * Sh.C.PLAYER_SPEED * U;
    if (now < S.dodgeUntil) { if (!mx && !mz) { mx = -c; mz = -s; } speed = FT.DODGE.speed * U; }
    if (S.act && FT[S.act.k].beam) speed = 0; // (rooted while charging and firing a beam)
    const ml = Math.hypot(mx, mz);
    if (ml > 0.01) { S.x += mx / ml * speed * dt; S.z += mz / ml * speed * dt; S.walk += dt * 12; } else S.walk = 0;
    // don't walk through the dummy, or out of the room
    const dd = Math.hypot(S.x - D.x, S.z - D.z);
    if (dd < 0.7) { S.x = D.x + (S.x - D.x) / (dd || 1) * 0.7; S.z = D.z + (S.z - D.z) / (dd || 1) * 0.7; }
    S.x = Math.max(-ROOM + 0.5, Math.min(ROOM - 0.5, S.x)); S.z = Math.max(-ROOM + 0.5, Math.min(ROOM - 0.5, S.z));
    // your move lands after its wind-up
    if (S.act) {
      const spec = FT[S.act.k], el = (now - S.act.t0) / 1000;
      if (!S.act.done && el >= spec.wind) {
        S.act.done = true;
        if ((S.act.k === 'punch' || S.act.k === 'kick') && dist <= spec.range * U) hitDummy(S.act.k, tx / dist, tz / dist); // (you always face the dummy)
        else if (spec.beam) beams.push({ x: S.x + c * 0.4, z: S.z + s * 0.4, dx: c, dz: s, a: S.a, k: S.act.k, t0: now, hit: false });
      }
      if (now - S.act.t0 > S.act.dur) S.act = null;
    }
    // beams: straight out from the hands; they hit the dummy once if it's in the way
    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i], spec = FT[b.k], age = (now - b.t0) / 1000;
      if (age > spec.beam) { beams.splice(i, 1); continue; }
      const rx = D.x - b.x, rz = D.z - b.z, along = rx * b.dx + rz * b.dz, across = Math.abs(rz * b.dx - rx * b.dz);
      if (!b.hit && along > -0.3 && along < spec.len * U * Math.min(1, age / 0.12) && across < (spec.w + 10) * U) { b.hit = true; hitDummy(b.k, b.dx, b.dz); }
    }
    const bm = beams[beams.length - 1];
    if (bm) { beamMesh.position.set(bm.x, 0.8, bm.z); beamMesh.rotation.y = -bm.a; setBeam(beamMesh, bm.k, FT[bm.k].len * U, (now - bm.t0) / 1000, FT[bm.k].beam, now / 1000); } else beamMesh.visible = false;
    // the dummy: pushed back by big hits, back on its feet after a knock-out; the meter fills up by itself too
    if (now < D.kbUntil) { D.x += D.kbx * dt; D.z += D.kbz * dt; D.x = Math.max(-ROOM + 0.6, Math.min(ROOM - 0.6, D.x)); D.z = Math.max(-ROOM + 0.6, Math.min(ROOM - 0.6, D.z)); }
    if (D.hp <= 0 && now > D.koUntil) { D.hp = FT.HP; pop('Back up!', '#43a047'); }
    S.meter = Math.min(100, S.meter + dt * 12);
    if (S.jumpT >= 0 && (S.jumpT += dt) >= FT.JUMP_T) S.jumpT = -1;

    // ---- drawing: poses, positions, the camera behind you, the overlay
    const myPose = now < S.dodgeUntil ? { k: 'dodge', p: 1 - (S.dodgeUntil - now) / (FT.DODGE.t * 1000) } : S.act ? { k: S.act.k, p: (now - S.act.t0) / S.act.dur, side: S.act.side } : S.jumpT >= 0 ? { k: 'jump', p: S.jumpT / FT.JUMP_T } : S.block ? { k: 'block', p: 1 } : null;
    poseFighter(me, myPose, myPose ? 0 : S.walk);
    me.position.set(S.x, S.jumpT >= 0 ? Math.sin(Math.PI * S.jumpT / FT.JUMP_T) * FT.JUMP_H : 0, S.z); me.rotation.y = -S.a;
    const dPose = now < D.koUntil ? { k: 'ko', p: 1 - (D.koUntil - now) / 1800 } : now < D.stunUntil ? { k: 'stun', p: (now % 1000) / 1000 } : null;
    poseFighter(dummy, dPose, 0);
    dummy.position.set(D.x, 0, D.z); dummy.rotation.y = -Math.atan2(S.z - D.z, S.x - D.x);
    // (over your shoulder, so you can see the dummy past yourself)
    camera.position.set(S.x - c * 2.4 - s * 0.9, 1.6, S.z - s * 2.4 + c * 0.9); camera.lookAt(S.x + c * 1.2 + s * 0.2, 0.55, S.z + s * 1.2 - c * 0.2);
    renderer.render(scene, camera);
    hpBar.style.width = `${D.hp / FT.HP * 100}%`; hpBar.style.background = D.hp > 50 ? '#43a047' : D.hp > 25 ? '#fdd835' : '#e53935';
    mtBar.style.width = `${S.meter}%`; mtBar.style.background = S.meter >= 100 ? '#fb8c00' : '#ffb74d';
    for (let i = pops.length - 1; i >= 0; i--) { // damage numbers float up off the dummy
      const p = pops[i], age = (now - p.t0) / 1000;
      if (age > 0.9) { p.el.remove(); pops.splice(i, 1); continue; }
      const v = new THREE.Vector3(p.x, 1.4 + age * 0.6, p.z).project(camera);
      p.el.style.left = `${(v.x + 1) / 2 * w}px`; p.el.style.top = `${(1 - v.y) / 2 * h}px`; p.el.style.opacity = String(1 - Math.max(0, age - 0.5) / 0.4);
    }
  }
  return {
    frame,
    dispose() {
      removeEventListener('keydown', onKey); removeEventListener('keyup', onKeyUp); removeEventListener('pointermove', onDrag); removeEventListener('pointerup', onLift);
      canvas.removeEventListener('mousedown', onMouse); canvas.removeEventListener('contextmenu', noMenu); canvas.removeEventListener('pointerdown', onDown);
      ui.remove();
    },
  };
}
