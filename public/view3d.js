// First- and third-person 3D views (Three.js). Loaded only when a player picks one of them.
// Map space (px, y down) maps to 3D as x = px / TILE, z = py / TILE; one tile is one unit, y is up.
import * as THREE from 'three';

const Sh = window.Shared;
const { TILE, COLS, ROWS } = Sh.C;
const COLORS = Sh.COLORS;
const WALL_H = 1.4, EYE = 0.62;
const R_NEAR = 2.2, R_FAR = 7.5, CONE = 0.5; // tiles, the same vision as the top-down view

function canvasTex(size, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeatX, repeatY);
  t.anisotropy = 4;
  return t;
}

const std = (color, extra) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
const glow = (color, extra) => new THREE.MeshBasicMaterial({ color, ...extra });

// the carrot man, facing +x: cone body, leafy top, scarf in the player's color, face and headlamp
function makeCarrot(color) {
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  const orange = std('#f28c28'), leg = std('#b85a14'), dark = glow('#1a0f08');
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.58, 14), orange);
  cone.rotation.x = Math.PI; cone.position.y = 0.43; body.add(cone);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), orange);
  cap.position.y = 0.72; cap.scale.y = 0.35; body.add(cap);
  for (const [rx, rz, h, col] of [[0.5, 0, 0.26, '#3f9a3a'], [-0.5, 0, 0.24, '#3f9a3a'], [0, 0.15, 0.32, '#55b84a']]) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.05, h, 6), std(col));
    leaf.geometry.translate(0, h / 2, 0); leaf.position.y = 0.76; leaf.rotation.set(rx, 0, rz);
    body.add(leaf);
  }
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.035, 8, 20), std(color));
  scarf.rotation.x = Math.PI / 2; scarf.position.y = 0.56; body.add(scarf);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.06), std(color));
  tail.position.set(-0.22, 0.52, 0.06); tail.rotation.z = -0.5; body.add(tail);
  for (const z of [-0.06, 0.06]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), dark);
    eye.position.set(0.185, 0.66, z); body.add(eye);
  }
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.015, 6, 20), std(color));
  strap.rotation.x = Math.PI / 2; strap.position.y = 0.7; body.add(strap);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), glow('#fff3c4'));
  lamp.position.set(0.21, 0.71, 0); body.add(lamp);
  const legs = [-0.07, 0.07].map(z => {
    const l = new THREE.Group(); l.position.set(0, 0.16, z);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 6), leg); m.position.y = -0.07; l.add(m);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), std('#3b2a20')); foot.scale.set(1.4, 0.6, 1); foot.position.set(0.02, -0.145, 0); l.add(foot);
    g.add(l); return l;
  });
  g.userData = { body, legs };
  return g;
}

function makeKey(color, s = 1) {
  const m = glow(color), g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 8, 16), m); ring.position.x = -0.12; g.add(ring);
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.035, 0.035), m); shaft.position.x = 0.04; g.add(shaft);
  for (const x of [0.07, 0.13]) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.035), m); t.position.set(x, -0.04, 0); g.add(t); }
  const light = new THREE.PointLight(color, 0.6, 1.2, 1); g.add(light);
  g.scale.setScalar(s);
  return g;
}

function nameSprite(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.font = 'bold 30px system-ui'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,.85)'; x.strokeText(text, 128, 32);
  x.fillStyle = color; x.fillText(text, 128, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(0.8, 0.2, 1); s.renderOrder = 10;
  return s;
}

export function createView3D(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const camera = new THREE.PerspectiveCamera(72, 1, 0.04, 40);
  let scene = null, S = null; // S: everything built for the current game

  function resize(W, H, DPR) { renderer.setPixelRatio(DPR); renderer.setSize(W, H); camera.aspect = W / H; camera.updateProjectionMatrix(); }

  function build(G) {
    if (scene) scene.traverse(o => { // free the previous game's scene
      if (o.geometry) o.geometry.dispose();
      for (const m of [].concat(o.material || [])) { if (m.map) m.map.dispose(); m.dispose(); }
      if (o.shadow && o.shadow.map) o.shadow.map.dispose();
    });
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#050509');
    scene.fog = new THREE.Fog('#050509', 3, R_FAR + 1.5);
    scene.add(new THREE.AmbientLight('#8a86b8', 0.22));

    // floor, ceiling and walls
    const floorTex = canvasTex(128, (x, n) => {
      x.fillStyle = '#6e6a86'; x.fillRect(0, 0, n, n);
      x.fillStyle = '#625e78'; x.fillRect(0, 0, n / 2, n / 2); x.fillRect(n / 2, n / 2, n / 2, n / 2);
      x.strokeStyle = '#3e3b50'; x.lineWidth = 3; x.strokeRect(0, 0, n / 2, n / 2); x.strokeRect(n / 2, n / 2, n / 2, n / 2); x.strokeRect(n / 2, 0, n / 2, n / 2); x.strokeRect(0, n / 2, n / 2, n / 2);
    }, COLS / 2, ROWS / 2);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(COLS, ROWS), std('#ffffff', { map: floorTex }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(COLS / 2, 0, ROWS / 2); floor.receiveShadow = true;
    scene.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(COLS, ROWS), std('#26243a'));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(COLS / 2, WALL_H, ROWS / 2);
    scene.add(ceil);

    const wallTex = canvasTex(128, (x, n) => {
      x.fillStyle = '#4a4560'; x.fillRect(0, 0, n, n);
      const rows = 6, h = n / rows;
      for (let r = 0; r < rows; r++) {
        const off = r % 2 ? n / 4 : 0;
        for (let b = -1; b < 2; b++) {
          const shadeK = 0.85 + ((r * 7 + b * 3) % 5) * 0.05;
          x.fillStyle = `rgb(${Math.round(104 * shadeK)},${Math.round(97 * shadeK)},${Math.round(140 * shadeK)})`;
          x.fillRect(off + b * n / 2 + 3, r * h + 3, n / 2 - 6, h - 6);
        }
      }
    }, 1, WALL_H);
    const tiles = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++)
      if (G.grid[y][x] === 1 && !(x === G.gate.x && y === G.gate.y)) tiles.push([x, y]);
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, WALL_H, 1), std('#ffffff', { map: wallTex }), tiles.length);
    const m = new THREE.Matrix4();
    tiles.forEach(([x, y], i) => walls.setMatrixAt(i, m.makeTranslation(x + 0.5, WALL_H / 2, y + 0.5)));
    walls.castShadow = walls.receiveShadow = true;
    scene.add(walls);

    // the gate, with one lock light per player on the side facing in
    const gate = new THREE.Group();
    gate.position.set(G.gate.x + 0.5, 0, G.gate.y + 0.5);
    const gateMat = std('#5e35b1', { emissive: '#3a1d80', emissiveIntensity: 0.8 });
    const door = new THREE.Mesh(new THREE.BoxGeometry(1, WALL_H, 1), gateMat); door.position.y = WALL_H / 2; gate.add(door);
    const nx = G.gate.ix - G.gate.x, nz = G.gate.iy - G.gate.y;
    const locks = [...G.players.values()].map(p => p.slot).sort().map((slot, i, all) => {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), glow('#1a1030'));
      const along = (i - (all.length - 1) / 2) * 0.2;
      l.position.set(nx * 0.52 + nz * along, 0.75, nz * 0.52 + nx * along); l.userData.slot = slot;
      gate.add(l); return l;
    });
    const gateLight = new THREE.PointLight('#b388ff', 1.2, 3, 1); gateLight.position.set(nx * 0.8, 0.8, nz * 0.8); gate.add(gateLight);
    scene.add(gate);

    // your headlight: a narrow beam that reaches far plus a soft glow around you; walls cast shadows, so they block both
    const spot = new THREE.SpotLight('#ffe2b0', 9, R_FAR, CONE, 0.45, 1);
    spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.camera.near = 0.05; spot.shadow.bias = -0.0015; spot.shadow.normalBias = 0.02;
    scene.add(spot, spot.target);
    const near = new THREE.PointLight('#ffe2b0', 1.6, R_NEAR + 0.6, 1);
    near.castShadow = true; near.shadow.mapSize.set(256, 256); near.shadow.camera.near = 0.05; near.shadow.bias = -0.003;
    scene.add(near);

    // players
    const players = new Map();
    for (const [id, p] of G.players) {
      const model = makeCarrot(COLORS[p.slot]);
      const tag = nameSprite(p.name, COLORS[p.slot]); tag.position.y = 1.05; model.add(tag);
      const carried = makeKey(COLORS[p.slot], 0.7); carried.position.set(0, 1.25, 0); carried.visible = false; model.add(carried);
      scene.add(model);
      players.set(id, { model, tag, carried });
    }

    // your key (only you can see it), and the entity
    const key = makeKey(COLORS[G.slot]); key.visible = false; scene.add(key);
    const ent = new THREE.Group(), blobs = [];
    for (let i = 0; i < 8; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), std(i % 2 ? '#07020a' : '#1c0618', { roughness: 0.4 }));
      b.castShadow = true; ent.add(b); blobs.push(b);
    }
    const eyes = new THREE.Group();
    for (const z of [-0.12, 0.12]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), glow('#ff1744')); e.position.set(0, 0, z); eyes.add(e); }
    const entLight = new THREE.PointLight('#ff1744', 0, 2.2, 1); ent.add(entLight);
    scene.add(ent, eyes);

    // safe zones are rebuilt whenever they move
    const zoneGroup = new THREE.Group(); scene.add(zoneGroup);
    const zoneFill = glow('#50e696', { transparent: true, opacity: 0.2, depthWrite: false });
    const zoneLine = new THREE.LineBasicMaterial({ color: '#69f0ae', transparent: true });
    const nextLine = new THREE.LineDashedMaterial({ color: '#69f0ae', dashSize: 0.2, gapSize: 0.2, transparent: true, opacity: 0.6 });

    S = { G, players, key, ent, blobs, eyes, entLight, gate, gateMat, door, locks, gateLight, spot, near, zoneGroup, zoneFill, zoneLine, nextLine, zoneSig: '' };
  }

  function square(x, y, inset, mat) {
    const a = x - 1 + inset, b = x + 2 - inset, c = y - 1 + inset, d = y + 2 - inset, h = 0.03;
    const geo = new THREE.BufferGeometry().setFromPoints([[a, c], [b, c], [b, d], [a, d], [a, c]].map(([px, pz]) => new THREE.Vector3(px, h, pz)));
    const line = new THREE.Line(geo, mat); line.computeLineDistances(); line.renderOrder = 5;
    return line;
  }
  function rebuildZones(G) {
    const sig = JSON.stringify([G.zones, G.next]);
    if (sig === S.zoneSig) return;
    S.zoneSig = sig;
    for (const c of [...S.zoneGroup.children]) { S.zoneGroup.remove(c); c.geometry.dispose(); }
    const tile = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    for (const z of G.zones) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (G.grid[z.y + dy][z.x + dx] !== 0) continue;
        const f = new THREE.Mesh(tile.clone(), S.zoneFill); f.position.set(z.x + dx + 0.5, 0.012, z.y + dy + 0.5); S.zoneGroup.add(f);
      }
      S.zoneGroup.add(square(z.x, z.y, 0.05, S.zoneLine));
    }
    for (const z of G.next) { const l = square(z.x, z.y, 0.1, S.nextLine); l.userData.next = true; S.zoneGroup.add(l); }
  }

  // f: everything needed for this frame, prepared by client.js
  function render(f) {
    const { G, view, t } = f;
    const dir = new THREE.Vector3(Math.cos(view.a), 0, Math.sin(view.a));
    const vx = view.x / TILE, vz = view.y / TILE;

    // headlight from the viewer's lamp; it tilts with your look in first person
    const lamp = new THREE.Vector3(vx + dir.x * 0.22, 0.68, vz + dir.z * 0.22);
    S.spot.position.copy(lamp); S.near.position.set(vx, 1.0, vz);
    S.spot.target.position.set(lamp.x + dir.x * 4, 0.68 + Math.tan(f.mode === 'fps' ? f.pitch : 0) * 4 - 0.25, lamp.z + dir.z * 4);
    S.spot.intensity = 9 * f.flicker; S.near.intensity = 1.6 * (0.5 + 0.5 * f.flicker);

    // camera
    let back = 0;
    if (f.mode === 'fps') {
      camera.position.set(vx, EYE + (f.walk ? Math.abs(Math.sin(f.walk)) * 0.025 : 0), vz);
      camera.lookAt(vx + Math.cos(view.a) * Math.cos(f.pitch), EYE + Math.sin(f.pitch), vz + Math.sin(view.a) * Math.cos(f.pitch));
    } else {
      back = Math.max(0.35, Math.min(1.9, f.backRoom / TILE - 0.25));
      // with a wall right behind you the camera rises a little to look over your head
      camera.position.set(vx - dir.x * back, 1.05 + (1.9 - back) * 0.17, vz - dir.z * back);
      camera.lookAt(vx + dir.x * 1.2, 0.5 + Math.sin(f.pitch) * 1.2, vz + dir.z * 1.2);
    }

    // players
    for (const [id, o] of S.players) {
      const p = f.players.get(id);
      if (!p) { o.model.visible = false; continue; }
      const firstPersonBody = f.mode === 'fps' && id === view.id;
      o.model.visible = p.show && !firstPersonBody && !(p.inv && Math.floor(t * 10) % 2);
      o.tag.visible = id !== view.id;
      o.model.position.set(p.x / TILE, 0, p.y / TILE);
      o.model.rotation.y = -p.a;
      // fade your own carrot when a wall pushes the third-person camera right up behind it
      const fade = f.mode === 'tpp' && id === view.id && back < 1 ? 0.3 : 1;
      if (o.model.userData.fade !== fade) {
        o.model.userData.fade = fade;
        o.model.traverse(c => { if (c.isMesh) { c.material.transparent = fade < 1; c.material.opacity = fade; } });
      }
      const { body, legs } = o.model.userData;
      body.position.y = p.walk ? Math.abs(Math.cos(p.walk)) * 0.04 : 0;
      body.rotation.x = p.walk ? Math.sin(p.walk * 0.5) * 0.06 : 0;
      legs[0].rotation.z = Math.sin(p.walk) * 0.6; legs[1].rotation.z = -Math.sin(p.walk) * 0.6;
      o.carried.visible = p.ks === 'carried';
      o.carried.rotation.y = t * 2;
    }

    // your key, bobbing and turning
    S.key.visible = !!f.key;
    if (f.key) { S.key.position.set(f.key.x / TILE, 0.4 + Math.sin(t * 2) * 0.06, f.key.y / TILE); S.key.rotation.y = t * 1.5; }

    // the entity: its body shows only in your light, its glowing eyes whenever there's a clear line to it
    const E = f.ent;
    S.ent.visible = !!(E && E.lit); S.eyes.visible = !!(E && E.eyes);
    if (E) {
      const ex = E.x / TILE, ez = E.y / TILE;
      S.ent.position.set(ex, 0.5, ez);
      S.blobs.forEach((b, i) => {
        const a = t * 2.5 + i * 0.8, r = 0.8 + 0.25 * Math.sin(t * 5 + i);
        b.position.set(Math.cos(a) * 0.17, Math.sin(t * 3 + i) * 0.12 + (i % 3) * 0.12 - 0.1, Math.sin(a) * 0.17); b.scale.setScalar(r);
      });
      S.entLight.intensity = E.lit ? 1.2 : 0;
      const toCam = Math.atan2(camera.position.z - ez, camera.position.x - ex), blink = Math.sin(t * 0.9) > 0.97 ? 0.3 : 1;
      S.eyes.position.set(ex + Math.cos(toCam) * 0.3, 0.68, ez + Math.sin(toCam) * 0.3);
      S.eyes.rotation.y = -toCam; S.eyes.scale.set(1, blink, 1);
      S.ent.traverse(o => { if (o.material) { o.material.transparent = E.stun; o.material.opacity = E.stun ? 0.5 : 1; } });
    }

    // gate
    const open = G.gate.open;
    S.door.scale.set(open ? 0.6 : 1, 1, open ? 0.6 : 1);
    S.gateMat.color.set(open ? '#ffd54f' : '#5e35b1'); S.gateMat.emissive.set(open ? '#ffb300' : '#3a1d80');
    S.gateMat.emissiveIntensity = open ? 0.8 + 0.4 * Math.sin(t * 6) : 0.8;
    S.gateMat.transparent = open; S.gateMat.opacity = open ? 0.55 : 1;
    S.gateLight.color.set(open ? '#ffd54f' : '#b388ff');
    for (const l of S.locks) { l.visible = !open; l.material.color.set(G.gate.ins.includes(l.userData.slot) ? COLORS[l.userData.slot] : '#1a1030'); }

    // safe zones blink when they're about to move; the dashed outlines preview where they go next
    rebuildZones(G);
    const warn = G.zt < Sh.C.SAFE_WARN, blinkK = warn ? 0.35 + 0.35 * Math.sin(t * 14) : 0.55;
    S.zoneFill.opacity = 0.2 * blinkK + 0.08; S.zoneLine.opacity = Math.min(1, blinkK + 0.2);
    for (const c of S.zoneGroup.children) if (c.userData.next) c.visible = warn;

    renderer.render(scene, camera);
  }

  return { build, render, resize, get ready() { return !!S; } };
}
