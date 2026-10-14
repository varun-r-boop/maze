// First- and third-person 3D views (Three.js). Loaded only when a player picks one of them.
// Map space (px, y down) maps to 3D as x = px / TILE, z = py / TILE; one tile is one unit, y is up.
import * as THREE from 'three';
import { buildApartment, updateApartment } from './apartment3d.js';
import { buildForest, updateForest } from './forest3d.js';
import { buildOffice } from './office3d.js';
import { clay, rbox, blob, clayifyScene, createClayFX, resetClay } from './clay.js';

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

// a clay person, facing +x: a rounded body in the player's color (a shirt and trousers for the man, a dress for
// the woman), a round head with hair and a little face, arms and legs that swing, and a headlamp on a strap.
// Skin tone and hair color come from the player's slot (Sh.look).
const shadeHex = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
function makePerson(kind, color, slot) {
  const { skin, hair } = Sh.look(slot), woman = kind === 'woman';
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const skinM = clay(skin), clothM = clay(color), hairM = clay(hair), dark = clay('#2a1d18');
  const mesh = (geo, mat, x, y, z, parent = body) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  if (woman) {
    mesh(new THREE.CylinderGeometry(0.12, 0.25, 0.44, 20), clothM, 0, 0.46, 0); // a flared dress
    mesh(blob(0.15, 2, 0.004), clothM, 0, 0.66, 0).scale.set(0.95, 0.75, 1.15); // shoulders
  } else {
    mesh(rbox(0.26, 0.4, 0.38, 0.11, 0.008, slot), clothM, 0, 0.55, 0); // shirt
    mesh(rbox(0.25, 0.06, 0.34, 0.03, 0), clay('#3a3f4c'), 0, 0.37, 0); // belt
  }
  mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.08, 12), skinM, 0, 0.78, 0); // neck
  mesh(blob(0.17, 3, 0.006, slot), skinM, 0, 0.95, 0); // head
  // hair: a short cap for him; a fuller cap with hair down her back for her
  const cap = mesh(new THREE.SphereGeometry(0.18, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM, -0.01, 0.97, 0);
  cap.rotation.z = 0.25; // pushed back a little, so the forehead shows
  if (woman) mesh(blob(0.15, 2, 0.01, slot + 3), hairM, -0.09, 0.83, 0).scale.set(0.8, 1.5, 1.2);
  // face: eyes, a nose and rosy cheeks
  for (const z of [-0.06, 0.06]) {
    mesh(new THREE.SphereGeometry(0.022, 10, 8), dark, 0.155, 0.96, z);
    mesh(new THREE.SphereGeometry(0.03, 10, 8), clay('#e88a8a'), 0.14, 0.9, z * 1.6);
  }
  mesh(blob(0.03, 1, 0.002), skinM, 0.175, 0.92, 0);
  // headlamp on a strap in the player's color
  mesh(new THREE.TorusGeometry(0.172, 0.013, 6, 24), clothM, 0, 1.0, 0).rotation.x = Math.PI / 2;
  mesh(new THREE.SphereGeometry(0.035, 10, 8), glow('#fff3c4'), 0.17, 1.02, 0);
  const limb = (y, z, len, r, mat, parent) => {
    const l = new THREE.Group(); l.position.set(0, y, z);
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat); m.position.y = -len / 2 - r * 0.3; m.castShadow = true; l.add(m);
    parent.add(l); return l;
  };
  const legs = [-0.08, 0.08].map(z => {
    const l = limb(0.3, z, 0.18, 0.055, woman ? skinM : clay('#4b566b'), g);
    const foot = new THREE.Mesh(blob(0.055, 1, 0.004), clay(woman ? shadeHex(color, 0.6) : '#3a2c26'));
    foot.scale.set(1.5, 0.6, 1); foot.position.set(0.03, -0.29, 0); l.add(foot);
    return l;
  });
  const arms = [-0.21, 0.21].map(z => {
    const a = limb(0.7, z, 0.22, 0.045, clothM, body);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), skinM); hand.position.y = -0.33; a.add(hand);
    return a;
  });
  // everyone gets their own materials, so fading one person (in third person) never changes anyone else
  g.traverse(o => { if (o.isMesh) o.material = o.material.clone(); });
  g.userData = { body, legs, arms, eye: 0.95 };
  return g;
}

// the freeze-tag bits around a person: a glowing red ring under a tagger, a block of ice around a frozen runner,
// and a green ring that fills up while a friend unfreezes them. (These never fade with the person.)
function addTagBits(model, role) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 8, 32), glow('#ff3b3b', { transparent: true }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.03; ring.visible = role === 'it';
  const ice = new THREE.Mesh(rbox(0.62, 1.3, 0.62, 0.12, 0.01),
    new THREE.MeshPhysicalMaterial({ color: '#cdefff', transparent: true, opacity: 0.42, roughness: 0.08, clearcoat: 1, depthWrite: false }));
  ice.position.y = 0.62; ice.visible = false;
  const rescue = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.46, 40), glow('#69f0ae', { side: THREE.DoubleSide }));
  rescue.rotation.x = -Math.PI / 2; rescue.position.y = 0.04; rescue.visible = false;
  for (const o of [ring, ice, rescue]) { o.userData.noFade = true; model.add(o); }
  return { ring, ice, rescue };
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
  let fx = null, dpr = 1; // clay maps: soft contact shadows drawn after the scene (not on phones, it's too slow there)
  const lowPower = matchMedia('(pointer: coarse)').matches;

  function resize(W, H, DPR) {
    dpr = DPR; renderer.setPixelRatio(DPR); renderer.setSize(W, H); camera.aspect = W / H; camera.updateProjectionMatrix();
    if (fx) fx.setSize(W, H, DPR);
  }

  function build(G) {
    if (fx) { fx.dispose(); fx = null; }
    resetClay();
    if (scene) scene.traverse(o => { // free the previous game's scene
      if (o.geometry) o.geometry.dispose();
      for (const m of [].concat(o.material || [])) { if (m.map) m.map.dispose(); m.dispose(); }
      if (o.shadow && o.shadow.map) o.shadow.map.dispose();
    });
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#050509');
    scene.fog = new THREE.Fog('#050509', 3, R_FAR + 1.5);
    scene.add(new THREE.AmbientLight('#8a86b8', 0.22));

    // the apartment has its own look (rooms, furniture, doors, real stairs); otherwise the default building
    let apt = null, forest = null;
    if (G.map === 'apartment') apt = buildApartment(scene, G, WALL_H);
    else if (G.map === 'forest') forest = buildForest(scene, G, WALL_H);
    else if (G.map === 'office') buildOffice(scene, G, WALL_H);
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
        if (G.grid[y][x] === 1) tiles.push([x, y]);
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

    // your headlight: a narrow beam that reaches far plus a soft glow around you; walls cast shadows, so they block both
    const spot = new THREE.SpotLight('#ffe2b0', 9, R_FAR, CONE, 0.45, 1);
    spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.camera.near = 0.05; spot.shadow.bias = -0.0015; spot.shadow.normalBias = 0.02;
    scene.add(spot, spot.target);
    const near = new THREE.PointLight('#ffe2b0', 1.6, R_NEAR + 0.6, 1);
    near.castShadow = true; near.shadow.mapSize.set(256, 256); near.shadow.camera.near = 0.05; near.shadow.bias = -0.003;
    scene.add(near);

    // players. Name tags float above everyone you can see; your teammates' tags also show through walls
    // (a frozen teammate's says so), so you can find them.
    const players = new Map();
    for (const [id, p] of G.players) {
      const model = makePerson(p.char, COLORS[p.slot], p.slot);
      const bits = addTagBits(model, p.role);
      const tag = nameSprite(p.role === 'it' ? `${p.name} · IT` : p.name, p.role === 'it' ? '#ff6b6b' : COLORS[p.slot]);
      const tagFz = nameSprite(`❄ ${p.name} · frozen`, '#9fe3ff');
      scene.add(model, tag, tagFz);
      players.set(id, { model, tag, tagFz, ...bits, rp: 0 });
    }

    S = { G, apt, forest, players, spot, near };

    // the office is all clay (the people already are): a softer color grade,
    // and (on computers) soft shadows wherever things touch. It also needs a longer view, to see outside.
    const clayMap = G.map === 'office';
    if (clayMap) clayifyScene(scene);
    renderer.toneMapping = clayMap ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    renderer.toneMappingExposure = 0.95;
    camera.far = clayMap ? 75 : 40; camera.updateProjectionMatrix();
    if (clayMap && !lowPower) {
      fx = createClayFX(renderer, scene, camera);
      const size = renderer.getSize(new THREE.Vector2());
      fx.setSize(size.x, size.y, dpr);
    }
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
    const lampK = G.bright ? 0.12 : 1; // with the lights on, your headlight barely adds anything
    S.spot.intensity = 9 * f.flicker * lampK; S.near.intensity = 1.6 * (0.5 + 0.5 * f.flicker) * lampK;

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
      if (!p) { o.model.visible = o.tag.visible = o.tagFz.visible = false; continue; }
      const firstPersonBody = f.mode === 'fps' && id === view.id;
      const sameFloor = Sh.floorOf(G.floors, p.x) === Sh.floorOf(G.floors, view.x); // other floors are out of sight
      o.model.visible = sameFloor && p.show && !firstPersonBody && !(p.imm && Math.floor(t * 10) % 2);
      const showTag = sameFloor && id !== view.id && (p.show || p.mark);
      o.tag.visible = showTag && !p.fz; o.tagFz.visible = showTag && p.fz;
      const px = p.x / TILE, py = (p.h || 0) * WALL_H, pz = p.y / TILE;
      o.model.position.set(px, py, pz); o.model.rotation.y = -p.a;
      o.tag.position.set(px, py + 1.32, pz); o.tagFz.position.copy(o.tag.position);
      // fade your own person when a wall pushes the third-person camera right up behind them
      const fade = f.mode === 'tpp' && id === view.id && back < 1 ? 0.3 : 1;
      if (o.model.userData.fade !== fade) {
        o.model.userData.fade = fade;
        o.model.traverse(c => { if (c.isMesh && !c.userData.noFade) { c.material.transparent = fade < 1; c.material.opacity = fade; } });
      }
      const { body, legs, arms } = o.model.userData;
      arms[0].rotation.z = -Math.sin(p.walk) * 0.5; arms[1].rotation.z = Math.sin(p.walk) * 0.5;
      body.position.y = p.walk ? Math.abs(Math.cos(p.walk)) * 0.04 : 0;
      body.rotation.x = p.walk ? Math.sin(p.walk * 0.5) * 0.06 : 0;
      legs[0].rotation.z = Math.sin(p.walk) * 0.6; legs[1].rotation.z = -Math.sin(p.walk) * 0.6;
      // tag bits: the tagger's ring pulses; ice while frozen, and the unfreeze ring fills up as a friend helps
      o.ring.material.opacity = 0.55 + 0.45 * Math.sin(t * 6);
      o.ice.visible = p.fz;
      if (p.fz && p.rp > 0) {
        const q = Math.round(p.rp * 20) / 20;
        if (q !== o.rp) { o.rp = q; o.rescue.geometry.dispose(); o.rescue.geometry = new THREE.RingGeometry(0.4, 0.46, 40, 1, 0, Math.PI * 2 * Math.max(0.02, q)); }
        o.rescue.visible = true;
      } else o.rescue.visible = false;
    }

    if (S.apt) updateApartment(S.apt, f, t);
    if (S.forest) updateForest(S.forest, f, t, camera);
    if (fx) fx.render(); else renderer.render(scene, camera);
  }

  return { build, render, resize, get ready() { return !!S; } };
}
