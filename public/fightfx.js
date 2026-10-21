// Arena fights: big, flashy hit effects for the dark neon arena. In 3D, where a hit lands: a soft glowing halo, a hot
// spiky starburst, a shockwave ring, ragged red slash streaks, and a spray of white and grey debris chunks that tumble
// and bounce. On the screen: an "impact frame" (everything flashes inverted) for big hits, speed lines while a beam
// fires, and cinematic letterbox bars for specials and knock-outs. Also the glowing grid the arena is made of.
// Used by the game's 3D view and by the practice room.
import * as THREE from 'three';

let starTex = null, ringTex = null, slashTex = null, haloTex = null;
function textures() {
  if (starTex) return;
  const make = (draw) => { const c = document.createElement('canvas'); c.width = c.height = 128; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  starTex = make(g => { // a spiky starburst: a white-hot centre and long uneven spikes
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,255,255,.85)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath();
    for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2, r = i % 2 ? 12 : [62, 40, 56, 34, 50, 44, 60][(i / 2) % 7]; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
    g.closePath(); g.fill();
  });
  haloTex = make(g => { const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64); grd.addColorStop(0, 'rgba(255,255,255,.9)'); grd.addColorStop(0.35, 'rgba(255,255,255,.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.fillRect(0, 0, 128, 128); });
  ringTex = make(g => { g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 6; g.shadowColor = '#fff'; g.shadowBlur = 12; g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.stroke(); });
  slashTex = make(g => { // ragged brush streaks curving round the hit, like paint flicked off a brush
    g.strokeStyle = '#fff'; g.lineCap = 'round';
    for (let s = 0; s < 5; s++) {
      const a0 = s * 1.3 + 0.2, a1 = a0 + 0.5 + (s % 3) * 0.25, r = 38 + (s % 2) * 16;
      for (let i = 0; i < 10; i++) { // (tapering: thick in the middle of each streak, thin at the ends)
        const t0 = i / 10, t1 = (i + 1) / 10, w = Math.sin(Math.PI * (t0 + 0.05)) * (7 - (s % 3) * 1.5);
        g.lineWidth = Math.max(0.5, w); g.beginPath(); g.arc(64, 64, r + Math.sin(i * 1.7 + s) * 3, a0 + (a1 - a0) * t0, a0 + (a1 - a0) * t1); g.stroke();
      }
    }
  });
}
// the burst's color for each kind of hit (the slashes are red for everything but the beams)
const COL = { punch: '#ffc233', kick: '#ff9a1a', kamehameha: '#33b8ff', finalflash: '#ffe14d', block: '#7fc8ff', rush: '#ffc233', rising: '#ff8a1a', spin: '#ff7a1a', upper: '#ffa21a', divekick: '#ff9a1a', airjab: '#ffc233', airspike: '#ff6a1a', tornado: '#ff8a1a' };
const SLASH = { kamehameha: '#1e88ff', finalflash: '#ffb300', block: '#5aa8ff' };
const SIZE = { punch: 0.6, kick: 1.0, kamehameha: 1.5, finalflash: 1.8, block: 0.5, rush: 0.55, rising: 1.1, spin: 1.25, upper: 1.05, divekick: 1.1, airjab: 0.6, airspike: 1.5, tornado: 1.0 };

export function createFightFx(scene) {
  textures();
  const mk = (tex, order = 20) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false })); s.visible = false; s.renderOrder = order; scene.add(s); return s; };
  const pool = Array.from({ length: 8 }, () => ({ halo: mk(haloTex, 19), star: mk(starTex), ring: mk(ringTex), slashes: [mk(slashTex), mk(slashTex)], t0: -1, size: 1 }));
  // debris: white and grey chunks that fly out, tumble, bounce and fade
  const shardGeo = new THREE.BoxGeometry(0.06, 0.06, 0.12);
  const shards = Array.from({ length: 70 }, () => { const m = new THREE.Mesh(shardGeo, new THREE.MeshStandardMaterial({ color: '#fff', roughness: 0.45, emissive: '#222', transparent: true })); m.visible = false; m.renderOrder = 18; scene.add(m); return { m, v: new THREE.Vector3(), spin: new THREE.Vector3(), t0: -1, last: 0 }; });
  let next = 0, nextShard = 0;
  return {
    // a hit at (x, y, z) in the 3D world: kind is what hit (or 'block')
    hit(x, y, z, kind) {
      const e = pool[next++ % pool.length], c = COL[kind] || '#ffffff', big = kind !== 'punch' && kind !== 'block' && kind !== 'airjab' && kind !== 'rush';
      e.t0 = performance.now() / 1000; e.size = SIZE[kind] || 0.6;
      for (const s of [e.halo, e.star, e.ring, ...e.slashes]) { s.position.set(x, y, z); s.visible = true; }
      e.halo.material.color.set(c); e.star.material.color.set(c); e.ring.material.color.set(c); e.star.material.rotation = Math.random() * Math.PI;
      e.slashes.forEach((s, i) => { s.material.color.set(SLASH[kind] || '#ff2a1a'); s.material.rotation = Math.random() * Math.PI * 2; s.visible = i === 0 || big; });
      for (let i = 0, n = big ? 16 : 7; i < n; i++) {
        const sh = shards[nextShard++ % shards.length], sp = (big ? 3.4 : 2.2) * (0.5 + Math.random()), grey = 0.55 + Math.random() * 0.45;
        sh.m.position.set(x, y, z); sh.m.material.color.setRGB(grey, grey, grey * 1.03); sh.m.visible = true; sh.t0 = e.t0; sh.last = 0;
        sh.v.set(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(sp);
        sh.spin.set(Math.random() * 20, Math.random() * 20, 0); sh.m.scale.setScalar(0.7 + Math.random() * (big ? 1.5 : 0.8));
      }
    },
    update() {
      const now = performance.now() / 1000;
      for (const e of pool) {
        if (e.t0 < 0) continue;
        const a = now - e.t0;
        if (a > 0.45) { e.halo.visible = e.star.visible = e.ring.visible = false; e.slashes.forEach(s => { s.visible = false; }); e.t0 = -1; continue; }
        const s = Math.min(1, a / 0.05); // (the burst pops out at once and fades; the ring spreads; the slashes flick open)
        e.halo.scale.setScalar(e.size * (1.6 + 0.8 * s)); e.halo.material.opacity = Math.max(0, 1 - a / 0.3) * 0.8;
        e.star.scale.setScalar(e.size * (0.7 + 0.7 * s)); e.star.material.opacity = Math.max(0, 1 - a / 0.22);
        e.ring.scale.setScalar(e.size * (0.3 + a * 5)); e.ring.material.opacity = Math.max(0, 1 - a / 0.4) * 0.8;
        for (const sl of e.slashes) { sl.scale.setScalar(e.size * (0.8 + 1.0 * Math.min(1, a / 0.1))); sl.material.opacity = Math.max(0, 1 - a / 0.32); }
      }
      for (const sh of shards) {
        if (sh.t0 < 0) continue;
        const a = now - sh.t0;
        if (a > 0.8) { sh.m.visible = false; sh.t0 = -1; continue; }
        const dt = Math.max(0, Math.min(0.05, a - sh.last)); sh.last = a;
        sh.v.y -= 7 * dt; sh.m.position.addScaledVector(sh.v, dt); if (sh.m.position.y < 0.04) { sh.m.position.y = 0.04; sh.v.y *= -0.35; sh.v.x *= 0.7; sh.v.z *= 0.7; }
        sh.m.rotation.x += sh.spin.x * dt; sh.m.rotation.y += sh.spin.y * dt; sh.m.material.opacity = Math.min(1, (0.8 - a) * 4);
      }
    },
  };
}

// the neon grid: black squares with thin glowing lines (one square per unit), used as a glow map so the lines light up
let gridTex = null;
export function gridTexture(repeatX, repeatY) {
  if (!gridTex) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.strokeRect(0, 0, 128, 128);
    gridTex = new THREE.CanvasTexture(c); gridTex.colorSpace = THREE.SRGBColorSpace; gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping; gridTex.anisotropy = 8;
  }
  const t = gridTex.clone(); t.needsUpdate = true; t.repeat.set(repeatX, repeatY);
  return t;
}
// a surface of the neon grid: near-black, a little shiny, with the lines glowing (brightness: how bright the lines are)
export function gridMaterial(repeatX, repeatY, brightness = 0.55) {
  return new THREE.MeshStandardMaterial({ color: '#060608', roughness: 0.4, metalness: 0.3, emissive: '#ffffff', emissiveMap: gridTexture(repeatX, repeatY), emissiveIntensity: brightness });
}

// an impact frame: the screen (or the element) flashes inverted for a moment
export function impactFrame(container, ms = 70) {
  const d = document.createElement('div'); d.className = 'fx-impact'; container.appendChild(d);
  setTimeout(() => d.remove(), ms);
}
// speed lines rushing in from the edges, for ms
export function speedLines(container, ms, color = '#ffffff') {
  const d = document.createElement('div'); d.className = 'fx-speed'; d.style.setProperty('--fx-col', color); container.appendChild(d);
  setTimeout(() => d.remove(), ms);
}
// cinematic letterbox bars sliding in, for ms
export function letterbox(container, ms) {
  const d = document.createElement('div'); d.className = 'fx-letterbox'; d.innerHTML = '<i></i><i></i>'; container.appendChild(d);
  setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 300); }, ms);
}
