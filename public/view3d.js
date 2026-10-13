// First- and third-person 3D views (Three.js). Loaded only when a player picks one of them.
// Map space (px, y down) maps to 3D as x = px / TILE, z = py / TILE; one tile is one unit, y is up.
import * as THREE from 'three';
import { buildApartment, updateApartment } from './apartment3d.js';
import { buildForest, updateForest } from './forest3d.js';

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
  g.userData = { body, legs, eye: EYE };
  return g;
}

// the roundhead, facing +x: a huge bristly round head on a pale muscular torso, dark trousers,
// belt and headlamp strap in the player's color
let headTex = null, chestTex = null;
function makeRoundhead(color) {
  headTex = headTex || canvasTex(256, (x, n) => {
    x.fillStyle = '#625c68'; x.fillRect(0, 0, n, n);
    x.strokeStyle = 'rgba(18,14,22,.8)'; x.lineWidth = 2;
    for (let i = 0; i < 900; i++) { // short bristles
      const px = (i * 97.13) % n, py = (i * 57.71) % n, a = (i * 2.4) % 6.28;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * 7, py + Math.sin(a) * 7); x.stroke();
    }
  });
  chestTex = chestTex || canvasTex(256, (x, n) => {
    x.fillStyle = '#d6ced2'; x.fillRect(0, 0, n, n);
    x.strokeStyle = 'rgba(70,52,64,.75)'; x.lineWidth = 3; x.lineCap = 'round';
    const cx = n * 0.25, w = n * 0.11; // the front (+x) of a cylinder's texture is a quarter of the way along
    x.beginPath();
    x.moveTo(cx - w * 1.6, 70); x.quadraticCurveTo(cx - w * 0.8, 100, cx, 78); x.quadraticCurveTo(cx + w * 0.8, 100, cx + w * 1.6, 70);
    x.moveTo(cx, 80); x.lineTo(cx, 220);
    for (const y of [130, 165, 200]) { x.moveTo(cx - w, y - 4); x.lineTo(cx - 6, y); x.moveTo(cx + 6, y); x.lineTo(cx + w, y - 4); }
    x.stroke();
  });
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  const skin = std('#ffffff', { map: chestTex }), limb = std('#d3cbcf'), cloth = std('#2a2731');
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.14, 0.36, 18), skin);
  torso.position.y = 0.52; torso.scale.z = 1.25; body.add(torso);
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), limb);
  shoulders.position.y = 0.69; shoulders.scale.set(1, 0.3, 1.25); body.add(shoulders);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.08, 10), limb); neck.position.y = 0.74; body.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 24, 18), std('#ffffff', { map: headTex, roughness: 1 }));
  head.position.y = 0.94; body.add(head);
  for (const z of [-0.07, 0.07]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), glow('#e9e4e8'));
    eye.position.set(0.195, 0.95, z); body.add(eye);
  }
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.016, 6, 24), std(color));
  strap.rotation.x = Math.PI / 2; strap.position.y = 1.0; body.add(strap);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), glow('#fff3c4'));
  lamp.position.set(0.21, 1.0, 0); body.add(lamp);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 18), std(color));
  belt.position.y = 0.35; belt.scale.z = 1.25; body.add(belt);
  const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.08, 14), cloth);
  hips.position.y = 0.3; hips.scale.z = 1.25; body.add(hips);
  const limbGroup = (y, z, len, r, mat) => {
    const l = new THREE.Group(); l.position.set(0, y, z);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.85, len, 8), mat); m.position.y = -len / 2; l.add(m);
    return l;
  };
  const legs = [-0.08, 0.08].map(z => {
    const l = limbGroup(0.3, z, 0.27, 0.05, cloth);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), std('#18161c')); foot.scale.set(1.5, 0.6, 1); foot.position.set(0.03, -0.28, 0); l.add(foot);
    g.add(l); return l;
  });
  const arms = [-0.25, 0.25].map(z => { const a = limbGroup(0.67, z, 0.32, 0.045, limb); body.add(a); return a; });
  g.userData = { body, legs, arms, eye: 0.94 };
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
    headTex = chestTex = null; // shared character textures were freed with the old scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#050509');
    scene.fog = new THREE.Fog('#050509', 3, R_FAR + 1.5);
    scene.add(new THREE.AmbientLight('#8a86b8', 0.22));

    // the apartment has its own look (rooms, furniture, doors, real stairs); otherwise the default building
    let apt = null, forest = null;
    if (G.map === 'apartment') apt = buildApartment(scene, G, WALL_H);
    else if (G.map === 'forest') forest = buildForest(scene, G, WALL_H);
    else {
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

      // staircases: up = steps climbing to the ceiling against the wall, down = steps sinking into a dark stairwell
      const stepMat = std('#7a7494'), pitMat = glow('#050508');
      for (const s of G.stairs) {
        const wallDir = G.grid[s.y - 1] && G.grid[s.y - 1][s.x] === 1 ? -1 : 1; // which side the wall is on
        const n = 6, depth = 1 / n;
        if (s.up) {
          for (let i = 0; i < n; i++) {
            const h = WALL_H * (i + 1) / n;
            const step = new THREE.Mesh(new THREE.BoxGeometry(0.96, h, depth), stepMat);
            step.position.set(s.x + 0.5, h / 2, s.y + 0.5 - wallDir * (0.5 - depth / 2) + wallDir * i * depth);
            step.castShadow = step.receiveShadow = true; scene.add(step);
          }
        } else {
          const pit = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2), pitMat);
          pit.position.set(s.x + 0.5, 0.005, s.y + 0.5); scene.add(pit);
          for (let i = 0; i < 3; i++) { // the top few steps going down, fading into the dark
            const step = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.02, depth * 0.9), std(['#5a5570', '#3a3650', '#24212f'][i]));
            step.position.set(s.x + 0.5, 0.012, s.y + 0.5 - wallDir * (0.5 - depth / 2) + wallDir * i * depth); scene.add(step);
          }
        }
      }

    }

    // the gate, with one lock light per player on the side facing in
    const gate = new THREE.Group();
    gate.position.set(G.gate.x + 0.5, 0, G.gate.y + 0.5);
    const gateMat = std('#5e35b1', { emissive: '#3a1d80', emissiveIntensity: 0.8 });
    const door = new THREE.Mesh(new THREE.BoxGeometry(1, WALL_H, 1), gateMat); door.position.y = WALL_H / 2; gate.add(door);
    const nx = G.gate.ix - G.gate.x, nz = G.gate.iy - G.gate.y;
    const locks = [...G.players.values()].map(p => p.slot).sort().map((slot, i, all) => {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), glow('#1a1030'));
      const perRow = Math.min(4, all.length), rows = Math.ceil(all.length / perRow), row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, all.length - row * perRow);
      const along = (i % perRow - (inRow - 1) / 2) * 0.2, up = 0.75 - (row - (rows - 1) / 2) * 0.2;
      l.position.set(nx * 0.52 + nz * along, up, nz * 0.52 + nx * along); l.userData.slot = slot;
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
      const model = (p.char === 'roundhead' ? makeRoundhead : makeCarrot)(COLORS[p.slot]);
      const top = p.char === 'roundhead' ? 1.2 : 1.0;
      const tag = nameSprite(p.name, COLORS[p.slot]); tag.position.y = top + 0.05; model.add(tag);
      const carried = makeKey(COLORS[p.slot], 0.7); carried.position.set(0, top + 0.25, 0); carried.visible = false; model.add(carried);
      scene.add(model);
      players.set(id, { model, tag, carried });
    }

    // your key (only you can see it), and the entity
    const key = makeKey(COLORS[G.slot]); key.visible = false; scene.add(key);
    // one model per entity there can be in this game (more players, more entities)
    const ents = [];
    for (let k = 0; k < Sh.entityCount(Sh.C.MAX_PLAYERS); k++) {
      const body = new THREE.Group(), blobs = [];
      for (let i = 0; i < 8; i++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), std(i % 2 ? '#07020a' : '#1c0618', { roughness: 0.4 }));
        b.castShadow = true; body.add(b); blobs.push(b);
      }
      const eyes = new THREE.Group();
      for (const z of [-0.12, 0.12]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), glow('#ff1744')); e.position.set(0, 0, z); eyes.add(e); }
      const light = new THREE.PointLight('#ff1744', 0, 2.2, 1); body.add(light);
      body.visible = eyes.visible = false;
      scene.add(body, eyes);
      ents.push({ body, blobs, eyes, light, stun: null });
    }

    // safe zones are rebuilt whenever they move
    const zoneGroup = new THREE.Group(); scene.add(zoneGroup);
    const zoneFill = glow('#50e696', { transparent: true, opacity: 0.2, depthWrite: false });
    const zoneLine = new THREE.LineBasicMaterial({ color: '#69f0ae', transparent: true });
    const nextLine = new THREE.LineDashedMaterial({ color: '#69f0ae', dashSize: 0.2, gapSize: 0.2, transparent: true, opacity: 0.6 });

    S = { G, apt, forest, players, key, ents, gate, gateMat, door, locks, gateLight, spot, near, zoneGroup, zoneFill, zoneLine, nextLine, zoneSig: '' };
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
    const viewModel = S.players.get(view.id), eye = viewModel ? viewModel.model.userData.eye : EYE;
    const vh = (f.viewH || 0) * WALL_H; // how far up (or down) a staircase the viewer is
    const lamp = new THREE.Vector3(vx + dir.x * 0.22, eye + 0.06 + vh, vz + dir.z * 0.22);
    S.spot.position.copy(lamp); S.near.position.set(vx, Math.min(WALL_H - 0.1, Math.max(1.0, eye + 0.35)) + vh, vz); // just above the head
    S.spot.target.position.set(lamp.x + dir.x * 4, lamp.y + Math.tan(f.mode === 'fps' ? f.pitch : 0) * 4 - 0.25, lamp.z + dir.z * 4);
    S.spot.intensity = 9 * f.flicker; S.near.intensity = 1.6 * (0.5 + 0.5 * f.flicker);

    // camera
    let back = 0;
    if (f.mode === 'fps') {
      camera.position.set(vx, eye + vh + (f.walk ? Math.abs(Math.sin(f.walk)) * 0.025 : 0), vz);
      camera.lookAt(vx + Math.cos(view.a) * Math.cos(f.pitch), eye + vh + Math.sin(f.pitch), vz + Math.sin(view.a) * Math.cos(f.pitch));
    } else {
      back = Math.max(0.35, Math.min(1.9, f.backRoom / TILE - 0.25));
      // with a wall right behind you the camera rises a little to look over your head
      camera.position.set(vx - dir.x * back, 1.05 + (1.9 - back) * 0.17 + vh, vz - dir.z * back);
      camera.lookAt(vx + dir.x * 1.2, 0.5 + vh + Math.sin(f.pitch) * 1.2, vz + dir.z * 1.2);
    }

    // players
    for (const [id, o] of S.players) {
      const p = f.players.get(id);
      if (!p) { o.model.visible = false; continue; }
      const firstPersonBody = f.mode === 'fps' && id === view.id;
      const sameFloor = Sh.floorOf(G.floors, p.x) === Sh.floorOf(G.floors, view.x); // other floors are out of sight
      o.model.visible = sameFloor && p.show && !firstPersonBody && !(p.inv && Math.floor(t * 10) % 2);
      o.tag.visible = sameFloor && id !== view.id;
      o.model.position.set(p.x / TILE, (p.h || 0) * WALL_H, p.y / TILE);
      o.model.rotation.y = -p.a;
      // fade your own carrot when a wall pushes the third-person camera right up behind it
      const fade = f.mode === 'tpp' && id === view.id && back < 1 ? 0.3 : 1;
      if (o.model.userData.fade !== fade) {
        o.model.userData.fade = fade;
        o.model.traverse(c => { if (c.isMesh) { c.material.transparent = fade < 1; c.material.opacity = fade; } });
      }
      const { body, legs, arms } = o.model.userData;
      if (arms) { arms[0].rotation.z = -Math.sin(p.walk) * 0.5; arms[1].rotation.z = Math.sin(p.walk) * 0.5; }
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
    S.ents.forEach((m, k) => {
      const E = f.ents.find(e => e.id === k);
      m.body.visible = !!(E && E.lit); m.eyes.visible = !!(E && E.eyes);
      m.light.intensity = E && E.lit ? 1.2 : 0;
      if (!E) return;
      const te = t + k * 1.7, ex = E.x / TILE, ez = E.y / TILE;
      const eh = (E.h || 0) * WALL_H;
      m.body.position.set(ex, 0.5 + eh, ez);
      m.blobs.forEach((b, i) => {
        const a = te * 2.5 + i * 0.8, r = 0.8 + 0.25 * Math.sin(te * 5 + i);
        b.position.set(Math.cos(a) * 0.17, Math.sin(te * 3 + i) * 0.12 + (i % 3) * 0.12 - 0.1, Math.sin(a) * 0.17); b.scale.setScalar(r);
      });
      const toCam = Math.atan2(camera.position.z - ez, camera.position.x - ex), blink = Math.sin(te * 0.9) > 0.97 ? 0.3 : 1;
      m.eyes.position.set(ex + Math.cos(toCam) * 0.3, 0.68 + eh, ez + Math.sin(toCam) * 0.3);
      m.eyes.rotation.y = -toCam; m.eyes.scale.set(1, blink, 1);
      if (m.stun !== E.stun) { m.stun = E.stun; m.body.traverse(o => { if (o.material) { o.material.transparent = E.stun; o.material.opacity = E.stun ? 0.5 : 1; } }); }
    });

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

    if (S.apt) updateApartment(S.apt, f, t);
    if (S.forest) updateForest(S.forest, f, t, camera);
    renderer.render(scene, camera);
  }

  return { build, render, resize, get ready() { return !!S; } };
}
