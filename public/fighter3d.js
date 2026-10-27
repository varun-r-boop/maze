// Arena fights: a fighter in 3D. The player drops shapes onto a human skeleton (hips, torso, head; each arm an upper
// arm and a forearm, each leg a thigh and a shin). The solid shapes are joined into one body, each keeping its own
// shape with a sharp edge where it meets the next (sdfmesh.js; nothing blends), skinned to the skeleton so it bends at the joints; hair, eyes and horns are separate pieces riding
// on their body part. poseFighter() moves the joints like a person's. The fighter faces +x; the left side is -z.
// Shapes are built while the skeleton stands in a T-pose (arms straight out to the sides).
import * as THREE from 'three';
import { fighterParts } from './fighter.js';
import { buildSdfGeometry } from './sdfmesh.js';

export const BONES = {
  hips: [null, [0, 0.47, 0]], torso: ['hips', [0, 0.02, 0]], head: ['torso', [0, 0.46, 0]],
  armL: ['torso', [0, 0.38, -0.19]], foreL: ['armL', [0, -0.2, 0]], armR: ['torso', [0, 0.38, 0.19]], foreR: ['armR', [0, -0.2, 0]],
  legL: ['hips', [0, -0.02, -0.09]], shinL: ['legL', [0, -0.22, 0]], legR: ['hips', [0, -0.02, 0.09]], shinR: ['legR', [0, -0.22, 0]],
};
export const BONE_NAMES = {
  torso: 'Torso', head: 'Head', hips: 'Hips', armL: 'Left upper arm', foreL: 'Left forearm', armR: 'Right upper arm', foreR: 'Right forearm',
  legL: 'Left thigh', shinL: 'Left shin', legR: 'Right thigh', shinR: 'Right shin',
};
export const BONE_ORDER = Object.keys(BONES);
// the shapes you can drop on: their names and starting sizes (width, height, depth)
export const SHAPES = {
  box: { name: 'Flat box', t: 'box', s: [0.3, 0.12, 0.3] }, tall: { name: 'Tall box', t: 'box', s: [0.14, 0.34, 0.14] },
  rbox: { name: 'Rounded box', t: 'rbox', s: [0.32, 0.2, 0.26] }, cylinder: { name: 'Cylinder', t: 'cylinder', s: [0.2, 0.3, 0.2] },
  sphere: { name: 'Ball', t: 'sphere', s: [0.24, 0.24, 0.24] }, cone: { name: 'Cone', t: 'cone', s: [0.22, 0.3, 0.22] },
  capsule: { name: 'Capsule', t: 'capsule', s: [0.14, 0.34, 0.14] }, torus: { name: 'Ring', t: 'torus', s: [0.3, 0.06, 0.3] },
  curly: { name: 'Curly hair', t: 'curly', s: [0.34, 0.22, 0.34] }, longhair: { name: 'Long hair', t: 'longhair', s: [0.34, 0.42, 0.34] },
  eye: { name: 'Eye', t: 'eye', s: [0.09, 0.09, 0.09] }, horn: { name: 'Horn / tail', t: 'horn', s: [0.07, 0.3, 0.07] },
  blade: { name: 'Curved blade', t: 'blade', s: [0.18, 0.55, 0.03] }, spike: { name: 'Spike / fin', t: 'spike', s: [0.09, 0.24, 0.02] },
  spear: { name: 'Spear', t: 'spear', s: [0.05, 1.3, 0.05] }, coat: { name: 'Long coat', t: 'coat', s: [0.4, 0.55, 0.4] },
};
export const SEPARATE = new Set(['curly', 'longhair', 'eye', 'horn', 'blade', 'spike', 'spear', 'coat']); // (pieces made separately, not part of the body)
export const MIRROR_BONE = { armL: 'armR', armR: 'armL', foreL: 'foreR', foreR: 'foreL', legL: 'legR', legR: 'legL', shinL: 'shinR', shinR: 'shinL' };
// the training dummy in "Try it out": a jointed grey mannequin, like an artist's wooden figure
export function dummyParts(c) {
  const out = [], k = 0.08;
  const add = (b, t, p, s) => out.push({ b, t, p, r: [0, 0, 0], s, u: 1, c, k, m: 0 });
  add('head', 'sphere', [0.012, 0.15, 0], [0.165, 0.225, 0.17]); add('head', 'capsule', [0, 0.02, 0], [0.07, 0.11, 0.07]);
  add('torso', 'sphere', [0, 0.32, 0], [0.21, 0.29, 0.37]);
  add('torso', 'rbox', [0, 0.165, 0], [0.15, 0.058, 0.25]); add('torso', 'rbox', [0, 0.103, 0], [0.145, 0.058, 0.245]); add('torso', 'rbox', [0, 0.041, 0], [0.15, 0.058, 0.255]);
  add('hips', 'rbox', [0, -0.035, 0], [0.16, 0.1, 0.27]);
  for (const s of ['L', 'R']) {
    add('arm' + s, 'sphere', [0, -0.005, 0], [0.1, 0.1, 0.1]); add('arm' + s, 'capsule', [0, -0.1, 0], [0.085, 0.215, 0.085]);
    add('fore' + s, 'sphere', [0, 0, 0], [0.07, 0.07, 0.07]); add('fore' + s, 'capsule', [0, -0.1, 0], [0.072, 0.2, 0.072]); add('fore' + s, 'rbox', [0, -0.225, 0], [0.075, 0.085, 0.07]);
    add('leg' + s, 'capsule', [0, -0.11, 0], [0.12, 0.25, 0.12]);
    add('shin' + s, 'sphere', [0, 0, 0], [0.09, 0.09, 0.09]); add('shin' + s, 'capsule', [0, -0.105, 0], [0.088, 0.215, 0.088]); add('shin' + s, 'rbox', [0.035, -0.215, 0], [0.17, 0.05, 0.085]);
  }
  return out;
}

// Body parts: drop one anywhere on the character and it goes onto its own bone (the left or right one, whichever
// side you dropped it on), sized to fit it. A part can be a few shapes (a claw hand is a hand and three claws).
// Positions are on the bone before the proportions stretch it, so a part keeps fitting when you lengthen the arms
// or legs. Each shape: [type, position, size, turn]. The Size slider makes a part thicker or thinner, not longer.
export const BODY_PARTS = {
  head: { name: 'Head', bone: 'head', shapes: [['sphere', [0.01, 0.14, 0], [0.2, 0.24, 0.2]]] },
  snout: { name: 'Snout', bone: 'head', shapes: [['rbox', [0.17, 0.11, 0], [0.26, 0.08, 0.13]], ['rbox', [0.15, 0.04, 0], [0.22, 0.04, 0.11]]] },
  neck: { name: 'Neck', bone: 'head', shapes: [['capsule', [0, 0.01, 0], [0.07, 0.14, 0.07]]] },
  chest: { name: 'Chest', bone: 'torso', shapes: [['rbox', [0, 0.32, 0], [0.18, 0.24, 0.32]]] },
  belly: { name: 'Belly', bone: 'torso', shapes: [['sphere', [0.01, 0.13, 0], [0.18, 0.24, 0.28]]] },
  pelvis: { name: 'Pelvis', bone: 'hips', shapes: [['rbox', [0, -0.015, 0], [0.16, 0.14, 0.27]]] },
  upperarm: { name: 'Upper arm', bone: 'arm', shapes: [['capsule', [0, -0.1, 0], [0.08, 0.24, 0.08]]] },
  forearm: { name: 'Forearm', bone: 'fore', shapes: [['capsule', [0, -0.1, 0], [0.07, 0.22, 0.07]]] },
  hand: { name: 'Hand', bone: 'fore', shapes: [['rbox', [0, -0.225, 0], [0.075, 0.09, 0.07]]] },
  clawhand: { name: 'Claw hand', bone: 'fore', shapes: [['sphere', [0, -0.215, 0], [0.07, 0.07, 0.07]],
    ['cone', [0.012, -0.27, -0.022], [0.028, 0.09, 0.028], [-0.35, 0, Math.PI]], ['cone', [0.012, -0.28, 0], [0.028, 0.1, 0.028], [0, 0, Math.PI]], ['cone', [0.012, -0.27, 0.022], [0.028, 0.09, 0.028], [0.35, 0, Math.PI]]] },
  thigh: { name: 'Thigh', bone: 'leg', shapes: [['capsule', [0, -0.11, 0], [0.11, 0.26, 0.11]]] },
  shin: { name: 'Shin', bone: 'shin', shapes: [['capsule', [0, -0.1, 0], [0.09, 0.23, 0.09]]] },
  foot: { name: 'Foot', bone: 'shin', shapes: [['rbox', [0.04, -0.215, 0], [0.18, 0.05, 0.09]]] },
  clawfoot: { name: 'Claw foot', bone: 'shin', shapes: [['rbox', [0.02, -0.215, 0], [0.1, 0.05, 0.09]],
    ...[-0.4, 0, 0.4].map(a => ['cone', [0.1, -0.222, a * 0.1], [0.035, 0.13, 0.03], [0, a, -Math.PI / 2 - 0.12]])] },
  joint: { name: 'Ball joint', bone: 'any', shapes: [['sphere', [0, 0, 0], [0.09, 0.09, 0.09]]] },
};

const dims = q => q.s.map(v => v * (q.u ?? 1));

// Proportions: how long the arms, the legs and the body are (1 = like a person). Lengthening a bone moves the joints
// below it and stretches what's on it, so the parts you've placed keep fitting.
export const PROPS = { arm: 'Arm length', leg: 'Leg length', body: 'Body length' };
const STRETCH = { armL: 'arm', foreL: 'arm', armR: 'arm', foreR: 'arm', legL: 'leg', shinL: 'leg', legR: 'leg', shinR: 'leg', torso: 'body' };
// the skeleton: real bones (so the body can be skinned to them), nested like a body. Each bone has a frame
// (userData.frame) that the shapes sit on.
export function buildRig(prop) {
  const root = new THREE.Group(), bones = {};
  for (const [name, [parent, at]] of Object.entries(BONES)) {
    const b = new THREE.Bone(); b.position.set(...at); b.name = name;
    (parent ? bones[parent] : root).add(b); bones[name] = b;
    const f = new THREE.Object3D(); b.add(f); b.userData.frame = f;
  }
  setProportions(bones, prop);
  return { root, bones };
}
export const frameOf = (bones, b) => bones[b].userData.frame;
export function setProportions(bones, prop) {
  const P = k => (prop && prop[k]) || 1;
  for (const [name, [, at]] of Object.entries(BONES)) {
    const k = /^fore/.test(name) ? P('arm') : /^shin/.test(name) ? P('leg') : name === 'head' || /^arm/.test(name) ? P('body') : 1;
    bones[name].position.set(at[0], at[1] * k, at[2]);
    bones[name].userData.frame.scale.set(1, STRETCH[name] ? P(STRETCH[name]) : 1, 1);
  }
  const H = bones.hips.userData;
  H.prop = { arm: P('arm'), leg: P('leg'), body: P('body') }; H.leg = P('leg'); H.restY = 0.03 + 0.44 * P('leg');
  H.height = 1.21 + 0.44 * (P('leg') - 1) + 0.46 * (P('body') - 1);
  bones.hips.position.y = H.restY;
}
// arms straight out to the sides, everything else straight: how the body is built (and the editor shows it)
export function setTPose(bones) {
  for (const b of Object.values(bones)) b.rotation.set(0, 0, 0);
  bones.hips.position.set(0, bones.hips.userData.restY, 0);
  bones.armL.rotation.x = Math.PI / 2; bones.armR.rotation.x = -Math.PI / 2;
}

// The skeleton you can see: a block for each body part (head; chest, belly; hips; upper arms, forearms, thighs,
// shins). 'guide': see-through green blocks while you build (you drop shapes on them); 'solid': the body of a
// fighter who hasn't built anything. Each block knows its body part (userData.bone).
const BLOCKS = [
  ['head', [0, 0.14, 0], [0.2, 0.24, 0.2]], ['torso', [0, 0.35, 0], [0.18, 0.2, 0.34]], ['torso', [0, 0.13, 0], [0.16, 0.18, 0.3]],
  ['hips', [0, -0.02, 0], [0.16, 0.12, 0.28]],
  ...['L', 'R'].flatMap(s => [['arm' + s, [0, -0.1, 0], [0.09, 0.18, 0.09]], ['fore' + s, [0, -0.11, 0], [0.08, 0.2, 0.08]],
    ['leg' + s, [0, -0.11, 0], [0.1, 0.2, 0.1]], ['shin' + s, [0, -0.12, 0], [0.09, 0.22, 0.09]]]),
];
export function addSkeleton(bones, style) {
  const guide = style === 'guide', out = [];
  const mat = guide ? new THREE.MeshStandardMaterial({ color: '#2fa35a', roughness: 0.8, transparent: true, opacity: 0.55, depthWrite: false })
    : new THREE.MeshStandardMaterial({ color: '#3f8a5a', roughness: 0.7 });
  for (const [b, at, size] of BLOCKS) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
    m.position.set(...at); m.userData = { bone: b, skeleton: true, keepMaterial: true };
    m.castShadow = !guide; m.receiveShadow = true; if (guide) m.renderOrder = 2;
    frameOf(bones, b).add(m); out.push(m);
  }
  return out;
}

// hair, eyes and horns: separate pieces, centred on their spot, pointing along their y
const mats = new Map();
const mat = (c, extra = {}) => { const k = c + JSON.stringify(extra); if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, ...extra })); return mats.get(k); };
export function makeSeparate(q) {
  const g = new THREE.Group(), [w, hgt, d] = dims(q), add = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  if (q.t === 'eye') { // a white eyeball with a pupil looking out (along y) and a little shine
    add(new THREE.SphereGeometry(0.5, 20, 14), mat('#ffffff', { roughness: 0.25 })).scale.set(w, hgt, d);
    add(new THREE.SphereGeometry(0.5, 16, 10), mat(q.c, { roughness: 0.2 }), 0, hgt * 0.32, 0).scale.set(w * 0.55, hgt * 0.4, d * 0.55);
    add(new THREE.SphereGeometry(0.5, 10, 8), mat('#151515', { roughness: 0.1 }), 0, hgt * 0.47, 0).scale.set(w * 0.28, hgt * 0.12, d * 0.28);
    add(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }), w * 0.12, hgt * 0.5, d * 0.1).scale.setScalar(Math.min(w, d) * 0.12);
  } else if (q.t === 'curly') { // a mop of curls on a cap
    add(new THREE.SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(q.c)).scale.set(w * 0.9, hgt * 1.4, d * 0.9);
    for (let i = 0; i < 22; i++) {
      const a = i * 2.39996, r = Math.sqrt((i + 0.5) / 22), x = Math.cos(a) * r * w * 0.45, z = Math.sin(a) * r * d * 0.45;
      add(new THREE.SphereGeometry(0.5, 10, 8), mat(q.c), x, hgt * 0.15 + (1 - r * r) * hgt * 0.45, z).scale.setScalar(Math.min(w, d) * 0.3);
    }
  } else if (q.t === 'longhair') { // a cap, with hair falling down the back
    add(new THREE.SphereGeometry(0.5, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), mat(q.c)).scale.set(w, hgt * 0.55, d);
    add(new THREE.CylinderGeometry(0.5, 0.42, 1, 20, 1, false, Math.PI * 0.35, Math.PI * 1.3), mat(q.c, { side: THREE.DoubleSide }), 0, -hgt * 0.42, 0).scale.set(w, hgt * 0.9, d);
  } else if (q.t === 'blade') { // a curved blade: a flat crescent, bulging out along x, as tall as it is high
    const s = new THREE.Shape(); s.moveTo(0, -hgt / 2); s.quadraticCurveTo(w * 1.4, 0, 0, hgt / 2); s.quadraticCurveTo(w * 0.5, -hgt * 0.05, 0, -hgt / 2);
    add(new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 16 }).translate(0, 0, -d / 2), mat(q.c));
  } else if (q.t === 'spike') { // a spike or fin: a flat sharp triangle pointing along y (spiky hair, a crest, collar points)
    const s = new THREE.Shape(); s.moveTo(-w / 2, -hgt / 2); s.lineTo(w / 2, -hgt / 2); s.lineTo(w * 0.15, hgt / 2); s.closePath();
    add(new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2), mat(q.c));
  } else if (q.t === 'spear') { // a spear: a long pole along y with a leaf-shaped blade on top and a ring under it
    const r = Math.min(w, d) * 0.35, L = hgt * 0.2;
    add(new THREE.CylinderGeometry(r, r, hgt, 10), mat(q.c));
    const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(w * 1.3, L * 0.35, 0, L); s.quadraticCurveTo(-w * 1.3, L * 0.35, 0, 0);
    add(new THREE.ExtrudeGeometry(s, { depth: r * 1.2, bevelEnabled: false, curveSegments: 10 }).translate(0, 0, -r * 0.6), mat(q.c), 0, hgt / 2);
    add(new THREE.TorusGeometry(r * 1.8, r * 0.6, 6, 16).rotateX(Math.PI / 2), mat(q.c), 0, hgt / 2);
  } else if (q.t === 'coat') { // a long coat: a flared skirt, open at the front, hanging from the hips
    add(new THREE.CylinderGeometry(w * 0.32, w * 0.62, hgt, 28, 1, true, Math.PI * 0.62, Math.PI * 1.76), mat(q.c, { side: THREE.DoubleSide })).scale.set(1, 1, d / w);
  } else { // a horn (or a tail): a curved, tapering tube along y
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -hgt * 0.5, 0), new THREE.Vector3(hgt * 0.35, 0, 0), new THREE.Vector3(hgt * 0.15, hgt * 0.5, 0));
    const seg = 16, rad = 8, tube = new THREE.TubeGeometry(curve, seg, Math.min(w, d) / 2, rad, false), p = tube.attributes.position;
    for (let i = 0; i < p.count; i++) { // taper to a point
      const row = Math.floor(i / (rad + 1)), t = row / seg, c = curve.getPointAt(t), k = 1 - t * 0.92;
      p.setXYZ(i, c.x + (p.getX(i) - c.x) * k, c.y + (p.getY(i) - c.y) * k, c.z + (p.getZ(i) - c.z) * k);
    }
    tube.computeVertexNormals();
    add(tube, mat(q.c));
    add(new THREE.SphereGeometry(Math.min(w, d) / 2, 12, 8), mat(q.c), 0, -hgt * 0.5, 0);
  }
  g.position.set(...q.p); g.rotation.set(...q.r);
  g.traverse(o => { if (o.isMesh) o.userData.keepMaterial = true; });
  return g;
}

// the body: every solid shape joined together (sharp joins, no blending), skinned to the skeleton. The bones must be in the T-pose.
const bodyCache = new Map(); // (the same body is built once, however many times it's shown)
export function bodyGeometry(parts, bones, root) {
  const key = JSON.stringify([parts.filter(q => !SEPARATE.has(q.t)), bones.hips.userData.prop]);
  if (bodyCache.has(key)) return bodyCache.get(key);
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const shapes = parts.filter(q => !SEPARATE.has(q.t)).map(q => {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...q.p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...q.r)), new THREE.Vector3(1, 1, 1));
    const fr = frameOf(bones, q.b);
    m.premultiply(fr.matrixWorld).premultiply(toRoot); // shape space -> body space (stretched along the bone)
    const h = dims(q).map(v => v / 2);
    return { t: q.t, h, inv: m.clone().invert(), center: new THREE.Vector3().setFromMatrixPosition(m), radius: Math.hypot(...h) * Math.max(1, fr.scale.y), k: 0.004, m: q.m, color: new THREE.Color(q.c), bone: BONE_ORDER.indexOf(q.b) };
  });
  const geo = buildSdfGeometry(shapes);
  if (bodyCache.size > 40) bodyCache.clear();
  bodyCache.set(key, geo);
  return geo;
}
export function makeBody(parts, bones, root) {
  const geo = bodyGeometry(parts, bones, root);
  if (!geo) return null;
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42 }));
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.userData.keepMaterial = true; mesh.userData.body = true;
  root.add(mesh); root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(BONE_ORDER.map(b => bones[b])));
  return mesh;
}

export function makeFighter(f) {
  const { root, bones } = buildRig(f && f.prop);
  setTPose(bones);
  const parts = fighterParts(f);
  makeBody(parts, bones, root);
  for (const q of parts) if (SEPARATE.has(q.t)) frameOf(bones, q.b).add(makeSeparate(q));
  if (!parts.length) addSkeleton(bones, 'solid'); // (nothing built: they fight as the block skeleton)
  const H = bones.hips.userData;
  root.userData = { bones, fighter: true, live: true, eye: H.height - 0.23, height: H.height };
  addOrbs(bones, root);
  root.traverse(o => { if (o.isMesh) o.material = o.material.clone(); }); // (each fighter fades on their own)
  if (f) applyLook(root, { style: f.style, line: f.line }); // (flat ink, an outline)
  poseFighter(root, null, 0);
  return root;
}

let auraTex = null;
function auraTexture() { // a tall glow with flame tongues licking up from it
  if (auraTex) return auraTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
  g.save(); g.translate(32, 78); g.scale(1, 1.7);
  const grd = g.createRadialGradient(0, 0, 4, 0, 0, 30); grd.addColorStop(0, 'rgba(255,255,255,.9)'); grd.addColorStop(0.5, 'rgba(255,255,255,.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(0, 0, 30, 0, Math.PI * 2); g.fill(); g.restore();
  for (const [x, h] of [[18, 60], [32, 76], [46, 58], [25, 50], [40, 52]]) {
    const f = g.createLinearGradient(0, 100 - h, 0, 100); f.addColorStop(0, 'rgba(255,255,255,0)'); f.addColorStop(1, 'rgba(255,255,255,.55)');
    g.fillStyle = f; g.beginPath(); g.moveTo(x - 7, 100); g.quadraticCurveTo(x - 4, 100 - h * 0.6, x, 100 - h); g.quadraticCurveTo(x + 4, 100 - h * 0.6, x + 7, 100); g.fill();
  }
  auraTex = new THREE.CanvasTexture(c); auraTex.colorSpace = THREE.SRGBColorSpace;
  return auraTex;
}
// The look: 'flat' swaps every material for an unlit one (no shading: a black body is a pure silhouette, colors stay
// bright like ink), 'shaded' puts the lit ones back. line: an outline color round the whole fighter (or null): a copy
// of each mesh drawn inside out and pushed out a little along its normals.
const outlineMats = new Map();
function outlineMat(c) {
  if (!outlineMats.has(c)) {
    const m = new THREE.MeshBasicMaterial({ color: c, side: THREE.BackSide });
    m.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += normalize(normal) * 0.013;'); };
    m.customProgramCacheKey = () => 'fighter-outline';
    outlineMats.set(c, m);
  }
  return outlineMats.get(c);
}
export function applyLook(root, look) {
  const flat = look && look.style === 'flat', line = look && look.line, old = [];
  root.traverse(o => { if (o.userData.outline) old.push(o); });
  for (const o of old) o.parent.remove(o);
  const meshes = [];
  root.traverse(o => { if (o.isMesh && !o.userData.glow && !o.userData.skeleton) meshes.push(o); });
  for (const o of meshes) {
    const m = o.material;
    if (flat && !o.userData.litMat) { o.userData.litMat = m; o.material = new THREE.MeshBasicMaterial({ color: m.color, vertexColors: m.vertexColors, side: m.side, transparent: m.transparent, opacity: m.opacity }); }
    else if (!flat && o.userData.litMat) { o.material = o.userData.litMat; delete o.userData.litMat; }
    if (!line) continue;
    const ol = o.isSkinnedMesh ? new THREE.SkinnedMesh(o.geometry, outlineMat(line)) : new THREE.Mesh(o.geometry, outlineMat(line));
    ol.userData = { outline: true, keepMaterial: true, noFade: true }; ol.raycast = () => {}; ol.frustumCulled = false;
    if (o.isSkinnedMesh) { o.parent.add(ol); ol.bind(o.skeleton, o.bindMatrix); } else o.add(ol);
  }
}

// Energy balls in the hands (hidden until a special charges), on the forearm bones at the hand; and the aura
export function addOrbs(bones, root) {
  const H = bones.hips.userData;
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: auraTexture(), color: '#5fd0ff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  aura.position.y = H.height * 0.5; aura.visible = false; aura.userData = { keepMaterial: true, glow: true, noFade: true };
  root.add(aura); root.userData.aura = aura;
  root.userData.orbs = ['foreL', 'foreR'].map(b => {
    const m = () => new THREE.MeshBasicMaterial({ color: '#5fd0ff', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    const o = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), m()), halo = new THREE.Mesh(new THREE.SphereGeometry(1.9, 16, 12), m());
    halo.material.opacity = 0.35; o.add(halo); o.position.set(0.04, -0.25 * H.prop.arm, 0); o.visible = false;
    o.traverse(x => { x.userData.keepMaterial = true; x.userData.glow = true; x.userData.noFade = true; }); bones[b].add(o);
    return o;
  });
}
// A beam (kamehameha or final flash): a white-hot core in a colored glow, along +x from 0 to 1 (scaled to its
// length), a burst at the hands and a big ball at its head. setBeam() shapes it for a moment of its life.
export function makeBeam() {
  const g = new THREE.Group(), tube = r => new THREE.CylinderGeometry(r, r, 1, 20, 1, true).rotateZ(-Math.PI / 2).translate(0.5, 0, 0);
  const glow = o => new THREE.MeshBasicMaterial({ color: '#5fd0ff', transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const core = new THREE.Mesh(tube(0.06), new THREE.MeshBasicMaterial({ color: '#ffffff' })), halo = new THREE.Mesh(tube(0.15), glow(0.65)), outer = new THREE.Mesh(tube(0.28), glow(0.25));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), glow(0.6)), muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), glow(0.7));
  g.add(core, halo, outer, head, muzzle); g.userData = { core, halo, outer, head, muzzle }; g.visible = false;
  g.traverse(o => { o.userData.keepMaterial = true; o.userData.glow = true; o.userData.noFade = true; }); // (left alone by the look and the fades)
  return g;
}
// kind, its full length, how long it's been out and how long it lasts (seconds), the time (for the flicker)
export function setBeam(g, kind, len, age, life, t) {
  const big = kind === 'finalflash', col = big ? '#ffe14d' : '#5fd0ff', w = big ? 1.45 : 1;
  const grow = Math.min(1, Math.max(0, age / 0.12)), fade = Math.min(1, Math.max(0, (life - age) / 0.15)), L = Math.max(0.01, len * grow), fl = 1 + 0.12 * Math.sin(t * 45);
  const { core, halo, outer, head, muzzle } = g.userData, r = w * fade * fl;
  for (const m of [core, halo, outer]) m.scale.set(L, r, r);
  head.position.x = L; head.scale.setScalar(r * 1.1); muzzle.scale.setScalar(w * fade * (1 + 0.25 * Math.sin(t * 30)));
  for (const m of [halo, outer, head, muzzle]) m.material.color.set(col);
  g.visible = fade > 0 && age >= 0;
}

// Poses, like a person's. Angles are in radians; for an arm or a leg, a positive z turn swings it forward. For a
// forearm a positive z bends the elbow (the hand comes up in front); for a shin a negative z bends the knee (the foot
// goes back). For the torso and hips a positive z leans back, a positive y turns the right shoulder forward.
// pose.side: which hand a punch (a jab) is thrown with, 'L' or 'R'.
// First the base (standing in a bouncing guard, or walking with the hands kept up), then the move on top.
// Every move has a wind-up, the strike (timed to land when the hit does), a short hold and a recovery.
// pose: { k, p } (k: the move, p: 0..1 how far through it), walk: the walk cycle (0 = standing still).
// A live model (userData.live: in the game, the practice room and the editor) also breathes and bounces on the spot,
// and eases from one pose into the next instead of snapping; the top-down pictures are posed exactly.
const ease = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
// a value through keyframes: kf(p, [t0, v0], [t1, v1], ...), eased between them
function kf(p, ...k) {
  if (p <= k[0][0]) return k[0][1];
  for (let i = 0; i < k.length - 1; i++) if (p <= k[i + 1][0]) return k[i][1] + (k[i + 1][1] - k[i][1]) * ease((p - k[i][0]) / (k[i + 1][0] - k[i][0]));
  return k[k.length - 1][1];
}
const TAU = Math.PI * 2;
// how a hit of this kind knocks you about: 'punch' (the head snaps back), 'kick' (folded over sideways) or 'beam' (blown back)
export const hitGroup = kind => ['punch', 'rush', 'upper', 'airjab', 'barrage'].includes(kind || 'punch') ? 'punch'
  : ['kick', 'rising', 'divekick', 'airspike', 'tornado', 'slam', 'warp'].includes(kind) ? 'kick' : 'beam';
// when a special fires, as a share of the whole move (from the fight numbers)
const fireAt = k => { const s = window.Shared && window.Shared.FIGHT[k]; return s ? s.wind / Math.max(s.cd, s.wind + 0.05) : 0.5; };
// each special's energy color (the aura, and the balls in the hands)
const SPECIAL_COLOR = { kamehameha: '#5fd0ff', finalflash: '#ffe14d', barrage: '#ff8a1a', slam: '#b388ff', warp: '#e040fb' };
// move: which way you're stepping, relative to where you face ({ f: forward, s: to your right }); walk: the step cycle
export function poseFighter(model, pose, walk, move) {
  const U = model.userData, B = U.bones, live = !!U.live, now = live ? performance.now() / 1000 : 0;
  if (live && U.stopUntil && now < U.stopUntil) return; // (hit-stop: frozen mid-pose for a split second as a hit lands)
  let k = pose && pose.k, p = pose ? Math.min(1, Math.max(0, pose.p || 0)) : 0;
  const special = k, vanish = k === 'warp' && p > 0.12 && p < fireAt('warp'); // (an instant strike: gone, then it lands as a kick)
  if (k === 'warp' && p >= fireAt('warp')) { const f = fireAt('warp'); k = 'kick'; p = 0.12 + 0.88 * (p - f) / (1 - f); }
  if (live) { // (a knock-out plays its own fall, from when it starts)
    if (k === 'ko') { if (U.koT == null) U.koT = now; p = Math.min(1, (now - U.koT) / 1.2); } else U.koT = null;
  }
  const R = {}; for (const b in B) R[b] = [0, 0, 0];
  let hy = 0.45, hx = 0, rate = 16; // (rate: how quickly it eases into this pose)

  if (walk) { // footwork in a fighting stance, hands up: stepping in, backing off, or shuffling sideways round them
    const mv = move && (move.f || move.s) ? move : { f: 1, s: 0 }, ml = Math.hypot(mv.f, mv.s), fw = mv.f / ml, sw = mv.s / ml, af = Math.abs(fw), as = Math.abs(sw);
    const dirS = sw >= 0 ? 1 : -1, w = fw >= 0 ? walk : -walk; // (backing off: the cycle runs the other way, so the feet push back)
    const sn = Math.sin(w), cs = Math.cos(w);
    // forward or back: a short boxer's stride, the knee folding as each leg comes through
    R.legL = [0, 0, 0.18 + sn * 0.38 * af]; R.shinL[2] = -(0.3 + Math.max(0, cs) * 0.8 * af);
    R.legR = [0, 0, -0.04 - sn * 0.38 * af]; R.shinR[2] = -(0.25 + Math.max(0, -cs) * 0.8 * af);
    // sideways: the leg on that side steps out, then the other one closes up to it (never crossing)
    const out = Math.max(0, sn) * as, close = Math.max(0, -sn) * as;
    R.legR[0] += -dirS * 0.3 * (dirS > 0 ? out : close); R.legL[0] += -dirS * 0.3 * (dirS > 0 ? close : out);
    R.shinR[2] -= 0.35 * (dirS > 0 ? out : close); R.shinL[2] -= 0.35 * (dirS > 0 ? close : out);
    R.hips = [0.04 * cs * af, -0.12 * sn * af, 0]; R.torso = [0.06 * dirS * as, -0.1 + 0.18 * sn * af, fw >= 0 ? -0.13 : -0.02]; R.head = [-0.04 * dirS * as, 0.1 - 0.06 * sn * af, 0.1];
    R.armL = [-0.15, 0, 0.4 - 0.12 * sn]; R.foreL[2] = 1.72 + 0.1 * sn; R.armR = [0.15, 0, 0.24 + 0.12 * sn]; R.foreR[2] = 1.92 - 0.1 * sn;
    hy = 0.44 + 0.012 * Math.cos(2 * walk); // (highest as the legs pass, lowest with both feet down)
    if (mv.run) { // running: a long fast stride, leaning into it, arms pumping out of the guard
      R.legL = [0, 0, 0.15 + sn * 0.85]; R.shinL[2] = -(0.35 + Math.max(0, cs) * 1.5);
      R.legR = [0, 0, 0.15 - sn * 0.85]; R.shinR[2] = -(0.35 + Math.max(0, -cs) * 1.5);
      R.hips = [0, -0.18 * sn, 0]; R.torso = [0, 0.25 * sn, -0.32]; R.head = [0, -0.12 * sn, 0.3];
      R.armL = [-0.1, 0, -sn * 1.0]; R.foreL[2] = 1.4; R.armR = [0.1, 0, sn * 1.0]; R.foreR[2] = 1.4;
      hy = 0.425 + 0.03 * Math.cos(2 * w);
    }
  } else { // the guard: an anime fighting stance: wide and low, side-on and leaning in, fists up, bouncing hard on the toes
    const bt = now * TAU * 1.8, bob = Math.sin(bt), br = Math.sin(now * TAU * 0.35), wv = Math.sin(now * 1.3);
    R.legL = [0.12, 0, 0.38]; R.shinL[2] = -0.6 - 0.1 * bob; R.legR = [-0.12, 0, -0.28]; R.shinR[2] = -0.5 - 0.1 * bob;
    R.armL = [-0.2, 0, 0.5 + 0.05 * Math.sin(bt + 1)]; R.foreL[2] = 1.85; R.armR = [0.25, 0, 0.15 + 0.05 * Math.sin(bt + 2)]; R.foreR[2] = 2.1;
    R.torso = [0.04 * wv, -0.25 + 0.03 * br, -0.16 + 0.02 * br]; R.head = [0.05 * Math.sin(now * 1.3 + 0.6), 0.22, 0.14 - 0.02 * br]; // (breathing; eyes locked on the opponent)
    hy = 0.425 + 0.014 * bob;
  }

  // (energy balls in the hands while a special charges: left, right)
  let oL = 0, oR = 0, aura = 0;
  const SM = {}; // smears: a limb stretched out at the fastest moment of a strike (bone: how much longer)
  const side = pose && pose.side === 'L' ? 'L' : 'R', sg = side === 'R' ? 1 : -1;
  // blend the guard (g) with two other positions: what the arms do while charging (c) and when firing (t)
  const mix3 = (g, cv, tv, c, t) => g * Math.max(0, 1 - c - t) + cv * c + tv * t;
  if (k === 'punch') { // a jab with the left or right hand: a small wind-back, then the arm snaps straight out, shoulder behind it
    rate = 45;
    const e = kf(p, [0, 0], [0.08, -0.25], [0.18, 1.12], [0.24, 1], [0.4, 1], [1, 0]), x = Math.max(0, e), w = Math.min(0, e); // (a wind-up, then it snaps out past the target)
    const J = side, O = side === 'R' ? 'L' : 'R';
    const sm = kf(p, [0.1, 0], [0.18, 1], [0.3, 0]); SM['fore' + J] = 1 + 0.4 * sm; SM['arm' + J] = 1 + 0.2 * sm;
    R['arm' + J] = [sg * (0.12 - 0.12 * x), 0, (J === 'R' ? 0.21 : 0.36) + 1.3 * x + 0.3 * w]; R['fore' + J][2] = (J === 'R' ? 1.95 : 1.75) * (1 - x) + 0.04 * x - 0.2 * w;
    R['arm' + O] = [-sg * 0.15, 0, 0.3]; R['fore' + O][2] = 1.95; // (the other fist stays up by the chin)
    R.hips[1] = 0.1 * sg * x; R.torso[1] = -0.1 + 0.4 * sg * x; R.torso[2] = -0.06 - 0.08 * x; R.head[1] = 0.1 - 0.35 * sg * x; hx = 0.04 * x;
    R.legL[2] += 0.12 * x; R.shinL[2] -= 0.1 * x; R.legR[2] -= 0.06 * x; R['fore' + J][1] = sg * 0.9 * x; // (the lead foot steps in; the fist turns over as it lands)
  } else if (k === 'kick') { // a hook kick: the leg rises out to the side, straightens past the target, then the heel whips back across
    rate = 35;
    const ch = kf(p, [0, 0], [0.15, 1], [0.55, 1], [0.8, 0.2], [1, 0]);
    const ex = kf(p, [0, 0], [0.1, 0], [0.2, 1], [0.26, 1], [0.34, 0.2], [0.5, 0]), hook = kf(p, [0, 0], [0.2, 0], [0.3, 1], [0.5, 1], [0.72, 0]);
    R.legR = [-0.6 * ch * (1 - hook) + 0.25 * hook * ch, 0, -0.12 + 1.55 * ch];
    const sm = kf(p, [0.14, 0], [0.22, 1], [0.34, 0.3], [0.42, 0]); SM.shinR = 1 + 0.35 * sm; SM.legR = 1 + 0.15 * sm; R.shinR[2] = (-0.3 - 1.4 * ch) * (1 - ex) - 0.05 * ex;
    R.legL[2] = 0.05; R.shinL[2] = -0.35 - 0.1 * ch; // (pivoting on the standing leg)
    R.hips = [0.15 * ch, -0.3 * ch + 0.45 * hook, 0.1 * ch]; R.torso = [-0.1 * ch, -0.1 - 0.3 * ch + 0.25 * hook, -0.05 + 0.4 * ch]; R.head = [0, 0.1 + 0.3 * ch - 0.35 * hook, -0.25 * ch];
    R.armL = [-0.2, 0, 0.45]; R.foreL[2] = 1.8; R.armR = [0.2 + 0.3 * hook, 0, 0.2 - 0.6 * hook]; R.foreR[2] = 1.95 - 1.1 * hook; // (the arm swings back for balance)
    hy += 0.015 * ch;
  } else if (k === 'rush') { // a flurry: three quick punches, right, left, right, leaning in
    rate = 50;
    const cyc = Math.min(2.999, p / 0.62 * 3), idx = Math.floor(cyc), x = Math.sin(Math.PI * (cyc - idx)), J = idx % 2 ? 'L' : 'R', O = J === 'R' ? 'L' : 'R', g2 = J === 'R' ? 1 : -1;
    R['arm' + J] = [g2 * 0.1 * (1 - x), 0, (J === 'R' ? 0.21 : 0.36) + 1.35 * x]; R['fore' + J][2] = (J === 'R' ? 1.95 : 1.75) * (1 - x) + 0.04 * x;
    R['arm' + O] = [-g2 * 0.15, 0, 0.35]; R['fore' + O][2] = 1.9;
    R.torso[1] = -0.1 + 0.35 * g2 * x; R.torso[2] = -0.2; R.head[1] = 0.1 - 0.3 * g2 * x; hx = 0.05; SM['fore' + J] = 1 + 0.3 * x;
  } else if (k === 'rising') { // a rising kick: the leg swings straight up in front, body leaning back, up on the toes
    rate = 40;
    const u = kf(p, [0, 0], [0.26, 1], [0.5, 1], [0.8, 0]);
    R.legR = [0, 0, -0.12 + 2.7 * u]; R.shinR[2] = -0.3 * (1 - u); R.legL[2] = 0.05; R.shinL[2] = -0.25;
    R.torso = [0, -0.1, -0.06 + 0.45 * u]; R.head[2] = -0.25 * u; R.armL = [-0.3, 0, -0.4 * u + 0.36 * (1 - u)]; R.armR = [0.3, 0, -0.5 * u + 0.21 * (1 - u)];
    hy += 0.05 * u; SM.shinR = 1 + 0.25 * kf(p, [0.16, 0], [0.24, 1], [0.34, 0]);
  } else if (k === 'spin') { // a spin kick: a full turn on the standing leg with the other leg swung straight out
    rate = 45;
    const turn = ease(kf(p, [0.05, 0], [0.55, 1])), ex = kf(p, [0.1, 0], [0.22, 1], [0.5, 1], [0.7, 0]);
    R.hips = [0.15 * ex, -turn * TAU, 0]; R.legR = [-1.3 * ex, 0, -0.12 + 0.5 * ex]; R.shinR[2] = -0.3 * (1 - ex);
    R.legL[2] = 0.1; R.shinL[2] = -0.4; R.torso = [-0.2 * ex, -0.1, -0.06]; R.armL = [1.0 * ex, 0, 0.36]; R.armR = [-0.6 * ex, 0, 0.21];
    SM.legR = 1 + 0.15 * ex; SM.shinR = 1 + 0.3 * kf(p, [0.22, 0], [0.32, 1], [0.45, 0]);
  } else if (k === 'upper') { // an uppercut: drop low, then drive the right fist straight up, rising with it
    rate = 45;
    const c = kf(p, [0, 0], [0.1, 1], [0.22, 0]), u = kf(p, [0.1, 0], [0.22, 1], [0.45, 1], [1, 0]);
    R.armR = [0.1, 0, 0.21 + 2.5 * u]; R.foreR[2] = 1.95 * (1 - u) + 0.5 * u; R.armL = [-0.15, 0, 0.3]; R.foreL[2] = 1.9;
    R.torso = [0, -0.1 + 0.45 * u, -0.06 - 0.25 * c + 0.25 * u]; R.head[2] = 0.2 * u;
    R.shinL[2] -= 0.5 * c; R.shinR[2] -= 0.5 * c; R.legL[2] += 0.3 * c; hy += -0.08 * c + 0.05 * u; SM.foreR = 1 + 0.3 * kf(p, [0.12, 0], [0.2, 1], [0.32, 0]);
  } else if (k === 'airjab') { // an air jab: knees tucked, a quick straight punch
    rate = 50;
    const x = kf(p, [0, 0], [0.2, 1], [0.45, 1], [1, 0]);
    R.armR = [0.1 - 0.1 * x, 0, 0.21 + 1.35 * x]; R.foreR[2] = 1.95 * (1 - x) + 0.04 * x; R.armL = [-0.2, 0, 0.45]; R.foreL[2] = 1.9;
    R.torso = [0, -0.1 + 0.4 * x, -0.15]; R.legL[2] = 0.9; R.shinL[2] = -1.4; R.legR[2] = 0.5; R.shinR[2] = -1.0; SM.foreR = 1 + 0.3 * kf(p, [0.1, 0], [0.2, 1], [0.32, 0]);
  } else if (k === 'airspike') { // a meteor smash: both fists raised high, then hammered down in front
    rate = 45;
    const up = kf(p, [0, 0], [0.15, 1], [0.25, 0]), dn = kf(p, [0.15, 0], [0.27, 1], [0.6, 1], [1, 0]);
    R.armL = [-0.2, 0, 0.36 + 2.5 * up + 0.4 * dn]; R.armR = [0.2, 0, 0.21 + 2.6 * up + 0.5 * dn]; R.foreL[2] = R.foreR[2] = 0.3 + 1.4 * (1 - up - dn);
    R.torso = [0, -0.1, -0.06 + 0.3 * up - 0.55 * dn]; R.head[2] = -0.2 * up + 0.3 * dn; R.legL[2] = 0.8; R.shinL[2] = -1.3; R.legR[2] = 0.6; R.shinR[2] = -1.1;
  } else if (k === 'tornado') { // a tornado kick: two quick turns in the air, legs swung out
    rate = 50;
    const turn = kf(p, [0.05, 0], [0.75, 1]), ex = kf(p, [0.05, 0], [0.15, 1], [0.6, 1], [0.8, 0]);
    R.hips = [0, -turn * TAU * 2, 0]; R.legR = [-1.2 * ex, 0, 0.3]; R.shinR[2] = -0.2; R.legL = [0.5 * ex, 0, 0.9 * ex]; R.shinL[2] = -1.0;
    R.armL = [0.9 * ex, 0, 0.36]; R.armR = [-0.6 * ex, 0, 0.21]; SM.shinR = 1 + 0.25 * ex;
  } else if (k === 'divekick') { // a dive kick: tipped forward in the air, one leg driving down at them, the other tucked
    rate = 45;
    const d = kf(p, [0, 0], [0.12, 1], [0.7, 1], [1, 0]);
    R.hips[2] = -0.55 * d; R.legR = [0, 0, -0.12 + 1.0 * d]; R.shinR[2] = -0.3 * (1 - d); R.legL[2] = 0.25 + 1.0 * d; R.shinL[2] = -0.42 - 1.4 * d;
    R.torso[2] = -0.06 - 0.25 * d; R.armL = [-0.3, 0, 0.36 - 0.9 * d]; R.armR = [0.3, 0, 0.21 - 0.9 * d]; SM.shinR = 1 + 0.2 * d;
  } else if (k === 'barrage') { // dragon barrage: six punches, right and left in turn, so fast the fists smear, leaning right in
    rate = 55;
    const cyc = Math.min(5.999, Math.max(0, (p - 0.1) / 0.5 * 6)), idx = Math.floor(cyc), x = p < 0.1 || p > 0.6 ? 0 : Math.sin(Math.PI * (cyc - idx)), J = idx % 2 ? 'L' : 'R', O = J === 'R' ? 'L' : 'R', g2 = J === 'R' ? 1 : -1;
    R['arm' + J] = [g2 * 0.1 * (1 - x), 0, (J === 'R' ? 0.21 : 0.36) + 1.4 * x]; R['fore' + J][2] = (J === 'R' ? 1.95 : 1.75) * (1 - x) + 0.04 * x;
    R['arm' + O] = [-g2 * 0.15, 0, 0.5]; R['fore' + O][2] = 1.5; SM['fore' + J] = 1 + 0.45 * x; SM['arm' + J] = 1 + 0.15 * x;
    R.torso[1] = -0.1 + 0.3 * g2 * x; R.torso[2] = -0.28; R.head[1] = 0.1 - 0.25 * g2 * x; R.legL[2] += 0.2; R.shinL[2] -= 0.2; hx = 0.06; aura = 0.6 * kf(p, [0, 0], [0.1, 1], [0.6, 1], [0.8, 0]);
  } else if (k === 'slam') { // shockwave slam: crouch, leap up with both fists raised over the head, then hammer them into the floor
    rate = 30;
    const f = fireAt('slam'), cr = kf(p, [0, 0], [0.12, 1], [0.2, 0]), up = kf(p, [0.1, 0], [0.3, 1], [f - 0.06, 1], [f, 0]), dn = kf(p, [f - 0.06, 0], [f, 1], [0.85, 1], [1, 0]);
    R.armL = [-0.2, 0, 0.36 + 2.6 * up + 1.0 * dn]; R.armR = [0.2, 0, 0.21 + 2.7 * up + 1.1 * dn]; R.foreL[2] = R.foreR[2] = 0.25 + 1.5 * (1 - up - dn);
    R.torso = [0, -0.1, -0.06 + 0.25 * up - 0.65 * dn]; R.head = [0, 0.1, -0.15 * up + 0.35 * dn];
    R.legL[2] = 0.25 + 0.6 * up + 0.9 * dn; R.shinL[2] = -0.42 - 1.0 * up - 1.4 * dn; R.legR[2] = -0.12 + 0.4 * up + 0.5 * dn; R.shinR[2] = -0.32 - 0.8 * up - 1.6 * dn;
    hy += -0.1 * cr + 0.45 * up - 0.16 * dn; aura = Math.max(up, 0.6 * dn); oL = oR = 0.1 * up;
  } else if (k === 'kamehameha' || k === 'finalflash') {
    rate = 30;
    const f = fireAt(k), grow = Math.min(1, p / f);
    if (k === 'kamehameha') { // cup the hands together at the hip, twisted back, a blue ball growing; then thrust both palms out
      const c = kf(p, [0, 0], [0.15, 1], [f - 0.02, 1], [f + 0.04, 0]), t = kf(p, [f - 0.05, 0], [f + 0.03, 1], [0.88, 1], [1, 0]), s = Math.max(c, t);
      R.armL = [mix3(-0.15, -0.6, -0.28, c, t), 0, mix3(0.36, -0.15, 1.45, c, t)]; R.foreL[2] = mix3(1.75, 1.55, 0.05, c, t);
      R.armR = [mix3(0.15, -0.1, 0.28, c, t), 0, mix3(0.21, -0.4, 1.45, c, t)]; R.foreR[2] = mix3(1.95, 1.45, 0.05, c, t);
      R.torso = [0, -0.1 - 0.7 * c + 0.25 * t, -0.06 + 0.12 * c - 0.15 * t]; R.head = [0, 0.1 + 0.6 * c - 0.15 * t, 0.06];
      oR = (0.04 + 0.12 * grow) * c + 0.17 * t; aura = s;
      R.legL = [0.15 * s, 0, 0.25 + 0.2 * s]; R.shinL[2] = -0.42 - 0.35 * s; R.legR = [-0.15 * s, 0, -0.12 - 0.28 * s]; R.shinR[2] = -0.32 - 0.25 * s; hy -= 0.05 * s;
    } else { // final flash: arms flung wide to the sides, chest out, a yellow ball in each palm; then palms slammed together in front
      const c = kf(p, [0, 0], [0.18, 1], [f - 0.08, 1], [f, 0]), t = kf(p, [f - 0.08, 0], [f + 0.02, 1], [0.88, 1], [1, 0]), s = Math.max(c, t);
      R.armL = [mix3(-0.15, 1.45, -0.25, c, t), 0, mix3(0.36, 0.15, 1.5, c, t)]; R.foreL[2] = mix3(1.75, 0.15, 0.05, c, t);
      R.armR = [mix3(0.15, -1.45, 0.25, c, t), 0, mix3(0.21, 0.15, 1.5, c, t)]; R.foreR[2] = mix3(1.95, 0.15, 0.05, c, t);
      R.torso = [0, -0.1 * (1 - s), -0.06 + 0.22 * c - 0.15 * t]; R.head = [0, 0.1, 0.06 + 0.15 * c];
      oL = oR = (0.03 + 0.1 * grow) * c + 0.14 * t; aura = s;
      R.legL = [0.22 * s, 0, 0.25]; R.shinL[2] = -0.42 - 0.25 * s; R.legR = [-0.22 * s, 0, -0.15]; R.shinR[2] = -0.32 - 0.3 * s; hy -= 0.045 * s;
    }
  } else if (k === 'jump') { // up into the air, knees tucked high, arms up for balance; then reaching for the ground
    rate = 25;
    const u = Math.sin(Math.PI * p), land = kf(p, [0.7, 0], [1, 1]);
    R.legL[2] = 0.25 + 1.0 * u; R.shinL[2] = -0.42 - 1.5 * u; R.legR[2] = -0.12 + 0.75 * u; R.shinR[2] = -0.32 - 1.2 * u + 0.2 * land;
    R.armL = [-0.15 - 0.3 * u, 0, 0.36 + 0.6 * u]; R.armR = [0.15 + 0.3 * u, 0, 0.21 + 0.6 * u]; R.foreL[2] = 1.75 - 0.6 * u; R.foreR[2] = 1.95 - 0.6 * u;
    R.torso[2] = -0.06 - 0.15 * u; R.head[2] = 0.1 * u;
  } else if (k === 'hit') { // taking a hit: a jab snaps the head back and round, a hook kick folds you sideways, a beam blows you back
    rate = 40;
    const kind = hitGroup(pose.kind), hs = side === 'L' ? 1 : -1;
    if (kind === 'punch') {
      const q = kf(p, [0, 0], [0.12, 1], [1, 0]);
      R.head = [0.25 * hs * q, 0.1 + 0.4 * hs * q, 0.06 + 0.45 * q]; R.torso[2] += 0.15 * q; R.torso[1] += 0.12 * hs * q;
      R.armL[2] -= 0.12 * q; R.armR[2] -= 0.12 * q; hx = -0.04 * q;
    } else if (kind === 'kick') {
      const q = kf(p, [0, 0], [0.15, 1], [0.45, 1], [1, 0]);
      R.torso = [0.35 * q, -0.1, -0.06 - 0.3 * q]; R.head = [0.3 * q, 0.1, -0.1 * q];
      R.armL = [-0.3, 0, 0.15 + 0.2 * (1 - q)]; R.foreL[2] = 1.4; R.armR = [0.3, 0, 0.1 + 0.1 * (1 - q)]; R.foreR[2] = 1.5; // (arms down, covering the body)
      R.shinL[2] -= 0.3 * q; R.shinR[2] -= 0.3 * q; hy -= 0.04 * q; hx = -0.07 * q;
    } else { // a beam
      const q = kf(p, [0, 0], [0.1, 1], [0.6, 1], [1, 0]);
      R.torso = [0, -0.1, -0.06 + 0.6 * q]; R.head[2] = 0.45 * q; R.armL = [-0.3 * q, 0, 0.36 + 1.2 * q]; R.armR = [0.3 * q, 0, 0.21 + 1.3 * q];
      R.foreL[2] = R.foreR[2] = 0.3 + 1.4 * (1 - q); R.legR[2] = 0.55 * q; R.shinR[2] = -0.32 - 0.6 * q; hx = -0.14 * q; hy -= 0.03 * q;
    }
  } else if (k === 'blockhit') { // a hit on your guard: the forearms are knocked back into your face, you rock back, then brace again
    rate = 45;
    const q = kf(p, [0, 0], [0.15, 1], [1, 0]);
    R.armL = [-0.35, 0, 0.8 - 0.25 * q]; R.foreL[2] = 2.3 + 0.2 * q; R.armR = [0.35, 0, 0.8 - 0.25 * q]; R.foreR[2] = 2.3 + 0.2 * q;
    R.head[2] = -0.2 + 0.12 * q; R.torso[2] = -0.14 + 0.18 * q; R.shinL[2] -= 0.22; R.shinR[2] -= 0.22; R.legL[2] += 0.1; R.legR[2] += 0.1; hy -= 0.035; hx = -0.04 * q;
  } else if (k === 'win') { // the winner: a fist pumped in the air, the other hand on the hip, chest up, bouncing
    rate = 12;
    const s = live ? now : p * 2, pump = Math.max(0, Math.sin(s * 6));
    R.armR = [0.25, 0, 2.75 + 0.2 * pump]; R.foreR[2] = 0.4 + 0.5 * (1 - pump); R.armL = [-0.7, 0, -0.35]; R.foreL[2] = 1.7;
    R.torso = [0, 0.15, 0.18]; R.head = [0, 0.1, 0.3]; R.legL[2] = 0.1; R.legR[2] = -0.08; R.shinL[2] = R.shinR[2] = -0.15 - 0.15 * pump; hy = 0.462 - 0.012 * pump;
  } else if (k === 'juggle') { // launched: flung back through the air, limbs flailing
    rate = 18;
    const s = live ? now : 0;
    R.hips = [0, 0, 1.15 + 0.2 * Math.sin(s * 5)]; R.torso = [0, 0, 0.3]; R.head = [0, 0, 0.35];
    R.armL = [-0.5, 0, 2.2 + 0.45 * Math.sin(s * 13)]; R.armR = [0.5, 0, 2.0 + 0.45 * Math.sin(s * 11 + 1)]; R.foreL[2] = R.foreR[2] = 0.5;
    R.legL[2] = 0.7 + 0.35 * Math.sin(s * 9); R.shinL[2] = -0.9; R.legR[2] = 0.15 + 0.3 * Math.sin(s * 8 + 2); R.shinR[2] = -0.4;
  } else if (k === 'getup') { // back on the feet: push up off the floor, through a crouch, into the stance
    rate = 22;
    const q = 1 - ease(Math.min(1, p * 1.3)), cr = Math.sin(Math.PI * p);
    R.hips[2] = 1.45 * q; hy = 0.45 - 0.3 * q - 0.08 * cr; hx = -0.3 * q;
    R.legL[2] += 0.6 * cr; R.shinL[2] -= 1.0 * cr; R.legR[2] += 0.5 * cr; R.shinR[2] -= 0.9 * cr;
    R.armL[2] = -0.3 * q + R.armL[2] * (1 - q); R.armR[2] = -0.3 * q + R.armR[2] * (1 - q); R.torso[2] -= 0.4 * cr;
  } else if (k === 'block') { // both forearms snap up in front of the face, crouched, chin tucked
    rate = 35;
    const sh = live ? Math.sin(now * 40) * 0.012 : 0;
    R.armL = [-0.35, 0, 0.8 + sh]; R.foreL[2] = 2.3; R.armR = [0.35, 0, 0.8 - sh]; R.foreR[2] = 2.3; R.head[2] = -0.2; R.torso[2] = -0.14;
    R.shinL[2] -= 0.22; R.shinR[2] -= 0.22; R.legL[2] += 0.1; R.legR[2] += 0.1; hy -= 0.035;
  } else if (k === 'dodge') { // duck and weave: drop low, bending at the waist and slipping to one side, eyes up, hands tight
    rate = 40;
    const d = kf(p, [0, 0], [0.25, 1], [0.7, 1], [1, 0]), ws = pose.side === 'L' ? -1 : 1;
    hy = 0.45 - 0.14 * d; R.torso = [0.35 * d * ws, -0.1, -0.06 - 0.45 * d]; R.head = [0.12 * d * ws, 0.1, 0.25 * d];
    R.legL[2] = 0.25 + 0.45 * d; R.shinL[2] = -0.42 - 0.7 * d; R.legR[2] = -0.12 + 0.35 * d; R.shinR[2] = -0.32 - 0.6 * d;
    R.armL = [-0.2, 0, 0.45]; R.foreL[2] = 2.0; R.armR = [0.2, 0, 0.35]; R.foreR[2] = 2.1;
  } else if (k === 'stun') { // dazed: swaying, head lolling, arms hanging, knees going
    rate = 10;
    const s = live ? now : p * 6;
    R.torso = [Math.sin(s * 4.2) * 0.14, Math.sin(s * 2.7) * 0.1, 0.08]; R.head = [Math.sin(s * 5.3 + 1) * 0.3, 0, -0.25 + Math.sin(s * 3) * 0.1];
    R.armL = [0.05, 0, -0.05 + Math.sin(s * 4.2) * 0.12]; R.armR = [-0.05, 0, -0.05 - Math.sin(s * 4.2) * 0.12]; R.foreL[2] = R.foreR[2] = 0.25;
    R.legL[2] = R.legR[2] = 0.25; R.shinL[2] = R.shinR[2] = -0.5 - 0.15 * Math.sin(s * 2.6); hy = 0.43 - 0.02 * Math.sin(s * 2.6);
  } else if (k === 'ko') { // knocked out: staggers back, knees give, falls flat on the back, bounces once, lies still
    rate = 25;
    const q = kf(p, [0, 0], [0.18, 0.12], [0.55, 1]), bounce = Math.sin(Math.PI * Math.min(1, Math.max(0, (p - 0.55) / 0.15))) * 0.05;
    R.hips[2] = Math.PI / 2 * q; hy = 0.45 - 0.31 * q + bounce; hx = -0.35 * q;
    R.armL = [-0.3 * q, 0, 2.6 * q]; R.armR = [0.3 * q, 0, 2.6 * q]; R.foreL[2] = R.foreR[2] = 0.3; R.head[2] = 0.3 * q;
    R.legL[2] = 0.35 * q; R.legR[2] = 0.2 * q; R.shinL[2] = -0.2 - 0.6 * (1 - q) * Math.min(1, p * 5); R.shinR[2] = -0.1;
  }
  if (U.aura) { // the aura: flaring up around the body as a special charges and fires
    const a = U.aura, h = U.height || 1.21, fl = 1 + 0.07 * Math.sin((live ? now : p) * 37) + 0.04 * Math.sin((live ? now : p) * 61);
    if (vanish) aura = 1; // (where they vanished: a flash of their aura)
    a.visible = aura > 0.05;
    if (a.visible) { a.scale.set(0.95 * h * fl, 1.55 * h * (0.85 + 0.15 * aura) * fl, 1); a.material.opacity = 0.7 * aura; a.material.color.set(SPECIAL_COLOR[special] || '#5fd0ff'); }
  }
  if (live) { // ducking and weaving fast: the body flickers (an afterimage)
    const off = vanish || (k === 'dodge' && p > 0.1 && p < 0.8 && Math.floor(now * 40) % 2 === 0);
    if (off !== !!U.flickOff) { U.flickOff = off; model.traverse(o => { if (o.isMesh && !o.userData.glow) o.visible = !off; }); }
  }
  for (const b of ['armL', 'armR', 'foreL', 'foreR', 'legL', 'legR', 'shinL', 'shinR']) B[b].scale.y = SM[b] || 1;
  if (U.orbs) { // the energy balls: blue for a kamehameha, yellow for a final flash, flickering
    const col = SPECIAL_COLOR[special] || '#5fd0ff', fl = 1 + 0.12 * Math.sin((live ? now : p) * 60);
    U.orbs.forEach((o, i) => { const s = i ? oR : oL; o.visible = s > 0.035; o.scale.setScalar(s * fl); o.material.color.set(col); o.children[0].material.color.set(col); });
  }

  const H = B.hips.userData; // (longer legs: the hips are higher, and dip further)
  const hipY = H.restY + (hy - 0.47) * H.leg;
  if (!live) { for (const b in B) B[b].rotation.set(...R[b]); B.hips.position.set(hx, hipY, 0); return; }
  // ease toward this pose (taking the short way round, so a roll doesn't unwind backwards)
  const dt = U.poseT == null ? 1 : Math.min(0.1, Math.max(0, now - U.poseT)); U.poseT = now;
  const a = 1 - Math.exp(-dt * rate);
  for (const b in B) {
    const r = B[b].rotation, t = R[b];
    for (const [i, ax] of [[0, 'x'], [1, 'y'], [2, 'z']]) { let d = t[i] - r[ax]; d -= Math.round(d / TAU) * TAU; r[ax] += d * a; }
  }
  const hp = B.hips.position; hp.set(hp.x + (hx - hp.x) * a, hp.y + (hipY - hp.y) * a, 0);
}
