// Arena fights in the top-down view: each fighter's 3D model is photographed once, from the side and a little in
// front, in every frame of every move. The top-down view then plays those pictures, so a fighter looks and moves
// the same as in 3D. (Also used for the lobby preview and the champion's picture.)
import * as THREE from 'three';
import { makeFighter, poseFighter, hitGroup } from './fighter3d.js';
export { hitGroup };

const FRAMES = { idle: 1, walk: 8, punch: 4, punchL: 4, kick: 5, block: 1, dodge: 6, stun: 3, ko: 3, kamehameha: 6, finalflash: 6, jump: 3, hit: 4, hitKick: 4, hitBeam: 4, blockhit: 2, win: 4, juggle: 1, getup: 3, rush: 6, rising: 4, spin: 6, upper: 4, divekick: 2, airjab: 3, airspike: 4, tornado: 6, barrage: 6, slam: 6, warp: 5 };
const PX = 128; // each picture is PX x PX; the fighter's feet are near the bottom
let R = null, scene = null, cam = null;
function setup() {
  if (R) return;
  R = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  R.setSize(PX, PX, false); R.toneMapping = THREE.ACESFilmicToneMapping;
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#6a6080', 1.5));
  const key = new THREE.DirectionalLight('#ffffff', 2.2); key.position.set(2, 4, 3); scene.add(key);
  cam = new THREE.OrthographicCamera(-0.85, 0.85, 1.55, -0.15, 0.1, 20); cam.position.set(0, 0, 5); cam.lookAt(0, 0, 0); // (the frame runs from just below the feet to above the head)
}
const snap = () => { const c = document.createElement('canvas'); c.width = c.height = PX; c.getContext('2d').drawImage(R.domElement, 0, 0); return c; };

// all the pictures of one fighter: { idle: [canvas], walk: [...], punch: [...], ... }
export function fighterSprites(f, slot) {
  setup();
  const model = makeFighter(f, slot); model.rotation.y = -0.45; // facing right, turned a little toward us
  model.userData.live = false; // (each picture posed exactly, no easing)
  scene.add(model);
  // (a tall fighter: zoom out, keeping the feet where they are)
  const z = Math.max(1, (model.userData.height + 0.12) / 1.4);
  Object.assign(cam, { left: -0.85 * z, right: 0.85 * z, top: 1.55 * z, bottom: -0.15 * z }); cam.updateProjectionMatrix();
  const out = {};
  for (const [k, n] of Object.entries(FRAMES)) {
    out[k] = [];
    for (let i = 0; i < n; i++) {
      const p = n === 1 ? (k === 'idle' ? 0 : 0.5) : (i + 0.5) / n;
      if (k === 'idle') poseFighter(model, null, 0);
      else if (k === 'walk') poseFighter(model, null, (i / n) * Math.PI * 2 + 0.01);
      else if (k === 'punchL') poseFighter(model, { k: 'punch', p, side: 'L' }, 0); // (a left jab)
      else if (k === 'hitKick' || k === 'hitBeam') poseFighter(model, { k: 'hit', p, kind: k === 'hitKick' ? 'kick' : 'kamehameha' }, 0); // (taking a kick, or a beam)
      else poseFighter(model, { k, p: k === 'ko' ? 1 : p }, 0);
      R.render(scene, cam); out[k].push(snap());
    }
  }
  scene.remove(model);
  model.traverse(o => { if (o.isMesh) o.material.dispose(); });
  return out;
}
// one picture of a fighter in a pose (for the lobby and the results)
export function fighterPicture(f, slot, k = null) {
  const s = fighterSprites(f, slot);
  return (k && s[k] ? s[k] : s.idle)[0];
}
// draw a fighter: feet at (x, y + 15), facing right (flip -1: left), in a pose { k, p } or walking (shadow: false
// to leave out the shadow at the feet, for the side-on fight, which puts it on the floor under a jump)
export function drawFighterSprite(c, sprites, x, y, flip, walk, pose, alpha = 1, size = 92, shadow = true) {
  let img;
  const pk = pose && (pose.k === 'punch' && pose.side === 'L' ? 'punchL' : pose.k === 'hit' ? { punch: 'hit', kick: 'hitKick', beam: 'hitBeam' }[hitGroup(pose.kind)] : pose.k);
  if (pk && sprites[pk]) { const fr = sprites[pk]; img = fr[Math.min(fr.length - 1, Math.max(0, Math.floor((pose.p || 0) * fr.length)))]; }
  else if (walk) { const fr = sprites.walk; img = fr[Math.floor(((walk % (Math.PI * 2)) / (Math.PI * 2)) * fr.length) % fr.length]; }
  else img = sprites.idle[0];
  c.save(); c.globalAlpha *= alpha;
  if (shadow) { c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(x, y + 15, 13, 4.5, 0, 0, Math.PI * 2); c.fill(); }
  c.translate(x, y + 15 + size * 0.09); c.scale(flip, 1);
  c.drawImage(img, -size / 2, -size, size, size);
  c.restore();
}
