// Arena fights: big, flashy hit effects. In 3D: a starburst, a shockwave ring, red slash arcs and a spray of glowing
// debris shards where a hit lands. On the screen: an "impact frame" (everything flashes inverted) for big hits, speed
// lines while a beam fires, and cinematic letterbox bars for specials and knock-outs. Also the tiled floor texture.
// Used by the game's 3D view and by the practice room.
import * as THREE from 'three';

let starTex = null, ringTex = null, slashTex = null;
function textures() {
  if (starTex) return;
  const make = (draw) => { const c = document.createElement('canvas'); c.width = c.height = 128; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  starTex = make(g => { // a spiky starburst with a hot centre
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,.8)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath();
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, r = i % 2 ? 18 : 60 - (i % 4) * 8; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
    g.closePath(); g.fill();
  });
  ringTex = make(g => { g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 7; g.shadowColor = '#fff'; g.shadowBlur = 10; g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.stroke(); });
  slashTex = make(g => { // a crescent slash, thick in the middle and sharp at both ends
    g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 56, Math.PI * 0.15, Math.PI * 0.85); g.arc(64, 44, 46, Math.PI * 0.82, Math.PI * 0.18, true); g.closePath(); g.fill();
  });
}
const COL = { punch: '#ffb300', kick: '#ff6d00', kamehameha: '#29b6f6', finalflash: '#ffd600', block: '#64b5f6' };
const SLASH = { punch: '#ff3d00', kick: '#ff1744', kamehameha: '#0091ea', finalflash: '#ff9100', block: '#82b1ff' };
const SIZE = { punch: 0.55, kick: 0.85, kamehameha: 1.4, finalflash: 1.7, block: 0.5 };

export function createFightFx(scene) {
  textures();
  const mk = tex => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false })); s.visible = false; s.renderOrder = 20; scene.add(s); return s; };
  const pool = Array.from({ length: 8 }, () => ({ star: mk(starTex), ring: mk(ringTex), slashes: [mk(slashTex), mk(slashTex)], t0: -1, size: 1 }));
  // debris: little glowing chunks that fly out, tumble and fall
  const shardGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
  const shards = Array.from({ length: 60 }, () => { const m = new THREE.Mesh(shardGeo, new THREE.MeshBasicMaterial({ color: '#fff', transparent: true })); m.visible = false; m.renderOrder = 19; scene.add(m); return { m, v: new THREE.Vector3(), spin: new THREE.Vector3(), t0: -1 }; });
  let next = 0, nextShard = 0;
  return {
    // a hit at (x, y, z) in the 3D world: kind is what hit (or 'block')
    hit(x, y, z, kind) {
      const e = pool[next++ % pool.length], c = COL[kind] || '#ffffff', big = kind !== 'punch' && kind !== 'block';
      e.t0 = performance.now() / 1000; e.size = SIZE[kind] || 0.6;
      for (const s of [e.star, e.ring, ...e.slashes]) { s.position.set(x, y, z); s.visible = true; }
      e.star.material.color.set(c); e.ring.material.color.set(c); e.star.material.rotation = Math.random() * Math.PI;
      e.slashes.forEach((s, i) => { s.material.color.set(SLASH[kind] || '#ff1744'); s.material.rotation = Math.random() * Math.PI * 2; s.visible = i === 0 || big; });
      for (let i = 0, n = big ? 14 : 6; i < n; i++) {
        const sh = shards[nextShard++ % shards.length], sp = (big ? 3.2 : 2) * (0.5 + Math.random());
        sh.m.position.set(x, y, z); sh.m.material.color.set(Math.random() < 0.5 ? '#ffffff' : c); sh.m.visible = true; sh.t0 = e.t0; sh.last = 0;
        sh.v.set(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(sp);
        sh.spin.set(Math.random() * 20, Math.random() * 20, 0); sh.m.scale.setScalar(0.6 + Math.random() * (big ? 1.4 : 0.8));
      }
    },
    update() {
      const now = performance.now() / 1000;
      for (const e of pool) {
        if (e.t0 < 0) continue;
        const a = now - e.t0;
        if (a > 0.4) { e.star.visible = e.ring.visible = false; e.slashes.forEach(s => { s.visible = false; }); e.t0 = -1; continue; }
        const s = Math.min(1, a / 0.06); // (the star pops out at once and fades; the ring spreads out; the slashes sweep open)
        e.star.scale.setScalar(e.size * (0.6 + 0.6 * s)); e.star.material.opacity = Math.max(0, 1 - a / 0.2);
        e.ring.scale.setScalar(e.size * (0.3 + a * 5)); e.ring.material.opacity = Math.max(0, 1 - a / 0.4) * 0.9;
        for (const sl of e.slashes) { sl.scale.setScalar(e.size * (0.4 + 0.75 * Math.min(1, a / 0.1))); sl.material.opacity = Math.max(0, 1 - a / 0.28); }
      }
      for (const sh of shards) {
        if (sh.t0 < 0) continue;
        const a = now - sh.t0;
        if (a > 0.7) { sh.m.visible = false; sh.t0 = -1; continue; }
        const dt = Math.min(0.05, a - (sh.last ?? 0)); sh.last = a;
        sh.v.y -= 7 * dt; sh.m.position.addScaledVector(sh.v, dt); if (sh.m.position.y < 0.03) { sh.m.position.y = 0.03; sh.v.y *= -0.35; sh.v.x *= 0.7; sh.v.z *= 0.7; }
        sh.m.rotation.x += sh.spin.x * dt; sh.m.rotation.y += sh.spin.y * dt; sh.m.material.opacity = Math.min(1, (0.7 - a) * 4);
      }
    },
  };
}

// a floor of square tiles with thin grey grout lines (one tile per unit)
let tileTex = null;
export function floorTiles(repeatX, repeatY) {
  if (!tileTex) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#e6e6e4'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#a3a5ad'; g.lineWidth = 3;  g.strokeRect(0, 0, 128, 128); // (darker than it looks: the room is brightly lit)
    tileTex = new THREE.CanvasTexture(c); tileTex.colorSpace = THREE.SRGBColorSpace; tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping; tileTex.anisotropy = 4;
  }
  const t = tileTex.clone(); t.needsUpdate = true; t.repeat.set(repeatX, repeatY);
  return t;
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
