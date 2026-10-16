// Arena fights: the character editor. A block skeleton stands in a T-pose. Drag body parts onto it (a head, a snout,
// upper arms, forearms, claw hands, thighs, shins, feet...: each goes onto its own bone, on the side you drop it,
// sized to fit), or plain shapes (or click one, then click the character). Each shape sticks to the body part it's
// on and moves with it. The proportion sliders make the arms, legs and body longer or shorter.
// Size, Mirror (a matching shape on the other side) and Subtract
// (cut away instead of adding) apply to the next shape you drop, or to the shape you've picked. Click a shape on
// the character to pick it, then drag its handles to move, turn or stretch it. The Abilities tab picks the special.
// "Try it out" puts your fighter in a plain white room with a training dummy (practice.js).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { buildRig, setTPose, addSkeleton, makeSeparate, makeBody, poseFighter, BONE_NAMES, BONE_ORDER, SHAPES, SEPARATE, MIRROR_BONE, BODY_PARTS, PROPS, setProportions, frameOf, addOrbs, makeBeam, setBeam } from './fighter3d.js';
import { fighterParts } from './fighter.js';
import { createPractice } from './practice.js';

const Sh = window.Shared, FT = Sh.FIGHT;
export const SPECIAL_INFO = {
  kamehameha: 'Cup your hands at your side and charge a ball of blue energy, then fire it as a beam. Quick to charge.',
  finalflash: 'Fling your arms wide, charge a yellow ball in each hand, then slam them together for a huge beam. Slower, wider, stronger.',
};
const COLORS = ['#8a8f98', '#ffffff', '#151515', '#e53935', '#d9a066', '#4a2c1d', '#fb8c00', '#fdd835', '#43a047', '#4f9a94', '#26c6da', '#1e63e9', '#1a237e', '#ec4fd0', '#f2c9a8'];
// line drawings of the shapes for the palette
const ICON = {
  box: '<rect x="6" y="14" width="28" height="12" rx="1"/>', tall: '<rect x="13" y="5" width="14" height="30" rx="1"/>',
  rbox: '<rect x="6" y="11" width="28" height="18" rx="6"/>', cylinder: '<ellipse cx="20" cy="9" rx="10" ry="4"/><path d="M10 9v22a10 4 0 0 0 20 0V9"/>',
  sphere: '<circle cx="20" cy="20" r="14"/><ellipse cx="20" cy="20" rx="14" ry="5"/><path d="M20 6v28"/>', cone: '<path d="M20 5 L33 31 M20 5 L7 31"/><ellipse cx="20" cy="31" rx="13" ry="4" stroke-dasharray="3 2"/>',
  capsule: '<rect x="13" y="5" width="14" height="30" rx="7"/>', torus: '<ellipse cx="20" cy="20" rx="15" ry="8"/><ellipse cx="20" cy="19" rx="7" ry="3"/>',
  curly: '<path d="M8 28c-4-3-2-9 2-9-1-5 4-9 8-6 2-5 9-5 11 0 5-1 8 4 5 8 4 3 1 9-3 8"/><path d="M12 33c-2-3 0-6 3-5M28 33c2-3 0-6-3-5"/>',
  longhair: '<path d="M8 35V18a12 12 0 0 1 24 0v17"/><path d="M14 35V20a6 6 0 0 1 12 0v15"/>',
  eye: '<path d="M4 20c6-9 26-9 32 0-6 9-26 9-32 0z"/><circle cx="20" cy="20" r="5"/><circle cx="20" cy="20" r="1.5" fill="currentColor"/>',
  horn: '<path d="M8 32c6-1 14-8 16-16 1-5 0-9-2-11 6 2 9 9 7 16-3 8-11 12-21 11z"/>',
};

// opts.practice: open straight into "Try it out"
export function openBuilder(host, start, onSave, opts = {}) {
  let parts = fighterParts(start).map(q => ({ ...JSON.parse(JSON.stringify(q)) }));
  let special = start.special, sel = -1, armed = null, preview = null, nextId = 1;
  let prop = { arm: 1, leg: 1, body: 1, ...(start.prop || {}) };
  const set = { c: '#43a047', u: 1, k: 0, mirror: true, m: 0 }; // (k: no blending; parts keep their own shape)
  const twins = new Map(); // part id -> its mirror twin's id
  parts.forEach(q => { q._id = nextId++; });
  // pair up shapes that already mirror each other
  parts.forEach(a => parts.forEach(b => {
    if (a === b || twins.has(a._id) || twins.has(b._id) || a.t !== b.t || (MIRROR_BONE[a.b] || a.b) !== b.b) return;
    if (Math.abs(a.p[0] - b.p[0]) + Math.abs(a.p[1] - b.p[1]) + Math.abs(a.p[2] + b.p[2]) < 0.01 && (a.b !== b.b || Math.abs(a.p[2]) > 0.01)) { twins.set(a._id, b._id); twins.set(b._id, a._id); }
  }));
  const byId = id => parts.find(q => q._id === id);

  host.innerHTML = `
    <div class="ce">
      <div class="ce-side">
        <h2>CHARACTER EDITOR</h2>
        <div class="ce-tabs"><button data-tab="shape" class="on">CHARACTER<br>SHAPE</button><button data-tab="abil">CHARACTER<br>ABILITIES</button></div>
        <div class="ce-pane" data-pane="shape">
          <p class="ce-label">DRAG BODY PARTS ONTO YOUR CHARACTER</p>
          <div class="ce-parts">${Object.entries(BODY_PARTS).map(([k, d]) => `<button data-shape="part:${k}">${d.name}</button>`).join('')}</div>
          <p class="ce-label">PROPORTIONS</p>
          ${Object.entries(PROPS).map(([k, n]) => `<label class="ce-row ce-prop"><span>${n.toUpperCase()}</span><input type="range" data-prop="${k}" min="0.6" max="${k === 'arm' ? 1.6 : k === 'leg' ? 1.5 : 1.4}" step="0.01"></label>`).join('')}
          <p class="ce-label">OR ANY SHAPE</p>
          <div class="ce-shapes">${Object.entries(SHAPES).map(([k, d]) => `<button data-shape="${k}" title="${d.name}"><svg viewBox="0 0 40 40">${ICON[k]}</svg></button>`).join('')}</div>
          <div class="ce-colors">${COLORS.map(c => `<button data-col="${c}" style="background:${c}"></button>`).join('')}<input type="color" class="ce-any" title="Any color"></div>
          <label class="ce-row"><span>SIZE</span><input type="range" data-set="u" min="0.3" max="3" step="0.01"></label>
          <label class="ce-row"><span>MIRROR</span><input type="checkbox" data-set="mirror"></label>
          <label class="ce-row"><span>SUBTRACT</span><input type="checkbox" data-set="m"></label>
          <div class="ce-sel"></div>
          <div class="ce-tools"><button class="ce-undo">↶ Undo</button><button class="ce-paint" title="Give every shape the color you've picked">Paint all</button><button class="ce-clear">Clear all</button><button class="ce-bones">Skeleton: shown</button></div>
        </div>
        <div class="ce-pane" data-pane="abil" hidden>
          <p class="ce-label">SPECIAL MOVE</p>
          <div class="ce-specials">${Sh.FIGHT_SPECIALS.map(s => `<button data-sp="${s}"><b>${{ kamehameha: '🌀 Kamehameha', finalflash: '⚡ Final Flash' }[s]}</b><span>${SPECIAL_INFO[s]}</span></button>`).join('')}</div>
          <p class="note">Every fighter can also punch, kick, block and dodge. Try them with the buttons under your character, or press Try it out.</p>
        </div>
        <button class="ce-try">▶ Try it out</button>
        <div class="ce-foot"><button class="go ce-save">Save fighter</button><button class="ce-cancel">Cancel</button></div>
      </div>
      <div class="ce-view"><canvas></canvas>
        <p class="ce-hint"></p>
        <div class="ce-anim">${['walk', 'punch', 'kick', 'block', 'jump', 'special'].map(a => `<button data-anim="${a}">${a[0].toUpperCase() + a.slice(1)}</button>`).join('')}</div>
      </div>
    </div>`;
  const $ = s => host.querySelector(s), $$ = s => host.querySelectorAll(s);

  // ---- the 3D view: the character on a round stand
  const canvas = $('canvas'), renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#203048');
  scene.add(new THREE.HemisphereLight('#ffffff', '#4a4060', 1.5));
  const key = new THREE.DirectionalLight('#ffffff', 2.0); key.position.set(1.5, 4, 3); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); scene.add(key);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.1, 64), new THREE.MeshStandardMaterial({ color: '#8a6a55', roughness: 0.9 }));
  stand.position.y = -0.05; stand.receiveShadow = true; scene.add(stand);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50); camera.position.set(0, 0.85, 3.4);
  const orbit = new OrbitControls(camera, canvas); orbit.target.set(0, 0.62, 0); orbit.enablePan = false; orbit.minDistance = 1.2; orbit.maxDistance = 6; orbit.update();
  const gizmo = new TransformControls(camera, canvas); gizmo.setSize(0.7); gizmo.setSpace('local');
  scene.add(gizmo.getHelper());
  gizmo.addEventListener('dragging-changed', e => { orbit.enabled = !e.value; if (e.value) snapshot(); });

  const { root, bones } = buildRig(prop); root.rotation.y = -Math.PI / 2; // facing you
  const onBone = b => frameOf(bones, b); // (where shapes on that bone sit)
  root.userData.bones = bones; root.userData.live = true; // (for the move previews)
  addOrbs(bones, root); const beam = makeBeam(); root.add(beam); // (the special's energy and its beam)
  setTPose(bones); scene.add(root);
  const guides = addSkeleton(bones, 'guide');
  let showBones = true;
  let body = null, pieces = []; // the body (all the solid shapes), and the separate pieces (hair, eyes, horns)
  const proxy = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: '#ffd54f', depthTest: false, transparent: true }));
  proxy.renderOrder = 10; proxy.visible = false;
  let ghost = null;

  const dims = q => q.s.map(v => v * q.u);
  const clean = () => parts.map(({ _id, ...q }) => q);
  function rebuild() { // the body and the pieces from the shapes (the skeleton must be in its T-pose)
    setTPose(bones); root.updateMatrixWorld(true);
    if (body) { body.parent.remove(body); body.material.dispose(); }
    body = makeBody(clean(), bones, root);
    for (const p of pieces) p.parent.remove(p);
    pieces = parts.filter(q => SEPARATE.has(q.t)).map(q => { const g = makeSeparate(q); g.userData.partId = q._id; g.traverse(o => { if (o.isMesh) o.userData.partId = q._id; }); onBone(q.b).add(g); return g; });
    placeProxy();
  }
  let rebuildT = 0, rebuildPending = false;
  function rebuildSoon() { // (at most every 80ms while you drag things about)
    if (rebuildPending) return; rebuildPending = true;
    setTimeout(() => { rebuildPending = false; rebuild(); }, Math.max(0, 80 - (performance.now() - rebuildT)));
    rebuildT = performance.now();
  }
  function placeProxy() {
    const q = parts[sel];
    if (!q || preview || practice) { proxy.visible = false; gizmo.detach(); return; }
    onBone(q.b).add(proxy); proxy.position.set(...q.p); proxy.rotation.set(...q.r); proxy.scale.set(...dims(q)); proxy.visible = true;
    if (gizmo.object !== proxy) gizmo.attach(proxy);
  }

  // ---- undo
  const undo = [];
  const snapshot = () => { undo.push(JSON.stringify({ parts, twins: [...twins], nextId, prop })); if (undo.length > 40) undo.shift(); };
  $('.ce-undo').onclick = () => {
    const u = undo.pop(); if (!u) return;
    const s = JSON.parse(u); parts = s.parts; twins.clear(); for (const [a, b] of s.twins) twins.set(a, b); nextId = s.nextId; prop = s.prop; setProportions(bones, prop); sel = -1; rebuild(); syncUi();
  };

  // ---- applying a change to a shape, and to its mirror twin (when Mirror is on)
  const mirrored = q => ({ ...q, b: MIRROR_BONE[q.b] || q.b, p: [q.p[0], q.p[1], -q.p[2]], r: [-q.r[0], -q.r[1], q.r[2]] });
  function changeSel(fn) {
    const q = parts[sel]; if (!q) return;
    fn(q);
    const tw = set.mirror && twins.has(q._id) && byId(twins.get(q._id));
    if (tw) { const m = mirrored(q); Object.assign(tw, { t: q.t, s: [...q.s], u: q.u, c: q.c, k: q.k, m: q.m, p: m.p, r: m.r }); }
    rebuildSoon();
  }
  gizmo.addEventListener('objectChange', () => changeSel(q => {
    q.p = proxy.position.toArray().map(v => +v.toFixed(3));
    q.r = [proxy.rotation.x, proxy.rotation.y, proxy.rotation.z].map(v => +v.toFixed(3));
    q.s = proxy.scale.toArray().map(v => +Math.max(0.02, Math.min(1.2, v / q.u)).toFixed(3));
  }));

  // ---- the settings
  function syncUi() {
    const q = parts[sel];
    const src = q ? { c: q.c, u: q.u, k: q.k, m: q.m } : set;
    $$('[data-col]').forEach(b => b.classList.toggle('on', b.dataset.col === src.c));
    $('.ce-any').value = src.c;
    $('[data-set="u"]').value = src.u; $('[data-set="m"]').checked = !!src.m; $('[data-set="mirror"]').checked = set.mirror;
    $$('[data-shape]').forEach(b => b.classList.toggle('armed', b.dataset.shape === armed));
    $$('[data-prop]').forEach(i => { i.value = prop[i.dataset.prop]; });
    $('.ce-sel').innerHTML = q ? `<div class="ce-selname">Picked: <b>${SHAPES[Object.keys(SHAPES).find(k => SHAPES[k].t === q.t && (q.t !== 'box' || (k === 'tall') === (q.s[1] > q.s[0])))]?.name || q.t}</b> on the ${BONE_NAMES[q.b].toLowerCase()}</div>
      <div class="ce-gizmo"><button data-gm="translate" class="${gizmo.mode === 'translate' ? 'on' : ''}">✥ Move</button><button data-gm="rotate" class="${gizmo.mode === 'rotate' ? 'on' : ''}">⟳ Turn</button><button data-gm="scale" class="${gizmo.mode === 'scale' ? 'on' : ''}">⤢ Stretch</button><button class="ce-del">🗑 Delete</button></div>` : '';
    $$('[data-gm]').forEach(b => b.onclick = () => { gizmo.setMode(b.dataset.gm); syncUi(); });
    const del = $('.ce-del'); if (del) del.onclick = deleteSel;
    $$('[data-sp]').forEach(b => b.classList.toggle('on', b.dataset.sp === special));
    $('.ce-hint').textContent = armed ? `Click on your character to stick on a ${keyInfo(armed).name.toLowerCase()} (click it again to stop)`
      : q ? 'Drag the handles to move, turn or stretch it · Delete key removes it · click empty space to let go'
      : parts.length ? 'Drag a shape onto your character · click a shape on it to pick it · drag the background to turn the view'
      : 'Drag body parts onto the skeleton: a head, a chest, upper arms, forearms, hands, thighs, shins, feet... then shape them';
  }
  const setting = (k, v) => {
    if (k === 'mirror') { set.mirror = v; return; }
    set[k] = v;
    if (parts[sel]) changeSel(q => { q[k] = v; });
  };
  $$('[data-col]').forEach(b => b.onclick = () => { if (parts[sel]) snapshot(); setting('c', b.dataset.col); syncUi(); });
  $('.ce-any').oninput = e => { setting('c', e.target.value.toLowerCase()); };
  $('.ce-any').onchange = () => syncUi();
  for (const inp of $$('[data-set]')) {
    inp.addEventListener('pointerdown', () => { if (parts[sel]) snapshot(); });
    inp.addEventListener(inp.type === 'checkbox' ? 'change' : 'input', () => {
      if (inp.type === 'checkbox' && parts[sel] && inp.dataset.set === 'm') snapshot();
      setting(inp.dataset.set, inp.type === 'checkbox' ? (inp.dataset.set === 'm' ? (inp.checked ? 1 : 0) : inp.checked) : +inp.value);
    });
  }
  function deleteSel() {
    const q = parts[sel]; if (!q) return;
    snapshot();
    const tw = set.mirror && twins.get(q._id);
    parts = parts.filter(x => x._id !== q._id && !(tw && x._id === tw));
    twins.delete(q._id); if (tw) twins.delete(tw);
    sel = -1; rebuild(); syncUi();
  }
  $('.ce-clear').onclick = () => { if (!parts.length || !confirm('Remove every shape and go back to the bare skeleton?')) return; snapshot(); parts = []; twins.clear(); sel = -1; rebuild(); syncUi(); };
  // proportions: longer or shorter arms, legs and body (what's on them stretches with them)
  for (const inp of $$('[data-prop]')) {
    inp.addEventListener('pointerdown', () => snapshot());
    inp.addEventListener('input', () => { prop = { ...prop, [inp.dataset.prop]: +inp.value }; stopPreview(); setProportions(bones, prop); rebuildSoon(); });
  }
  $('.ce-paint').onclick = () => { if (!parts.length) return; snapshot(); for (const q of parts) if (q.t !== 'eye') q.c = set.c; rebuild(); syncUi(); };
  $('.ce-bones').onclick = e => { showBones = !showBones; e.target.textContent = `Skeleton: ${showBones ? 'shown' : 'hidden'}`; for (const g of guides) g.visible = showBones; };
  $$('[data-tab]').forEach(b => b.onclick = () => { $$('[data-tab]').forEach(x => x.classList.toggle('on', x === b)); $$('[data-pane]').forEach(p => p.hidden = p.dataset.pane !== b.dataset.tab); });
  $$('[data-sp]').forEach(b => b.onclick = () => { special = b.dataset.sp; syncUi(); playPreview('special'); });

  // ---- finding what's under the pointer: the body (which body part there?), a piece, or a skeleton block
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return null;
    ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const targets = [...(body ? [body] : []), ...pieces.flatMap(p => { const a = []; p.traverse(o => { if (o.isMesh) a.push(o); }); return a; }), ...(showBones ? guides : [])];
    const hit = ray.intersectObjects(targets, false)[0];
    if (!hit) return null;
    const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
    if (n.dot(ray.ray.direction) > 0) n.negate();
    let bone = hit.object.userData.bone;
    const partId = hit.object.userData.partId;
    if (partId) bone = byId(partId).b;
    if (hit.object === body) { // the body part with the most say over that spot of the body
      const si = body.geometry.attributes.skinIndex, sw = body.geometry.attributes.skinWeight, w = new Map();
      for (const vi of [hit.face.a, hit.face.b, hit.face.c]) for (let j = 0; j < 4; j++) w.set(si.getComponent(vi, j), (w.get(si.getComponent(vi, j)) || 0) + sw.getComponent(vi, j));
      bone = BONE_ORDER[[...w].sort((a, b) => b[1] - a[1])[0][0]];
    }
    return { point: hit.point.clone(), normal: n, bone, partId, object: hit.object };
  }

  // ---- placing a shape where the pointer is. Dropped on a bone of the skeleton, a solid shape becomes that
  // part of the body: centred on the bone and lined up along it (a capsule on the upper arm is an upper arm).
  // Otherwise (on the body you've built, or hair, eyes and horns) it points out of the surface, sunk in a little.
  function placement(keyName, hit) {
    const d = SHAPES[keyName], u = set.u, h = d.s[1] * u / 2;
    if (hit.object.userData.skeleton && !SEPARATE.has(d.t)) {
      const bone = onBone(hit.bone); root.updateMatrixWorld(true);
      const lp = bone.worldToLocal(hit.point.clone()); lp.x = 0; lp.z = 0;
      return { centre: bone.localToWorld(lp), qWorld: bone.getWorldQuaternion(new THREE.Quaternion()), d };
    }
    const sink = d.t === 'horn' ? -h * 0.9 : d.t === 'eye' ? h * 0.35 : d.t === 'curly' || d.t === 'longhair' ? h * 0.6 : h * 0.45;
    const centre = hit.point.clone().addScaledVector(hit.normal, -sink);
    const qWorld = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), hit.normal);
    return { centre, qWorld, d };
  }
  // a body part: onto its own bone (left or right: whichever side it was dropped on), sized to fit the bone
  const keyInfo = k => k.startsWith('part:') ? BODY_PARTS[k.slice(5)] : SHAPES[k];
  const planeHit = new THREE.Vector3();
  function partBone(def, hit) {
    if (def.bone === 'any') return hit ? hit.bone : null;
    if (!/^(arm|fore|leg|shin)$/.test(def.bone)) return def.bone;
    let side = hit && /[LR]$/.test(hit.bone) ? hit.bone.slice(-1) : null;
    if (!side) { // (which side of the body is the pointer on?)
      const pt = hit ? hit.point : ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), new THREE.Vector3(0, 0.6, 0)), planeHit);
      if (!pt) return null;
      side = root.worldToLocal(pt.clone()).z < 0 ? 'L' : 'R';
    }
    return def.bone + side;
  }
  function partShapes(def, b) {
    const limb = /^(arm|fore|leg|shin)/.test(b), right = /R$/.test(b) && def.bone !== 'any';
    return def.shapes.map(([t, p, s, r = [0, 0, 0]]) => {
      const q = { b, t, p: [...p], r: [...r], s: limb ? [s[0] * set.u, s[1], s[2] * set.u] : s.map(v => v * set.u), u: 1, c: set.c, k: set.k, m: 0 };
      q.s = q.s.map(v => +Math.max(0.02, Math.min(1.2, v)).toFixed(3));
      return right ? { ...q, p: [p[0], p[1], -p[2]], r: [-r[0], -r[1], r[2]] } : q; // (the parts are drawn for the left side)
    });
  }
  function addPart(key, hit) {
    const def = BODY_PARTS[key], b = partBone(def, hit);
    if (!b) return;
    snapshot();
    const mine = partShapes(def, b).map(q => ({ ...q, _id: nextId++ }));
    parts.push(...mine);
    if (set.mirror && MIRROR_BONE[b]) for (const q of mine) { const tw = { ...mirrored(q), _id: nextId++ }; parts.push(tw); twins.set(q._id, tw._id); twins.set(tw._id, q._id); }
    if (parts.length > Sh.FIGHTER_PARTS.max) parts.length = Sh.FIGHTER_PARTS.max;
    sel = parts.indexOf(mine[0]); rebuild(); syncUi();
  }
  function addAt(keyName, hit) {
    if (keyName.startsWith('part:')) return addPart(keyName.slice(5), hit);
    const { centre, qWorld, d } = placement(keyName, hit), bone = onBone(hit.bone);
    root.updateMatrixWorld(true);
    const p = bone.worldToLocal(centre.clone()), qb = bone.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(qWorld);
    const e = new THREE.Euler().setFromQuaternion(qb);
    snapshot();
    const q = { _id: nextId++, b: hit.bone, t: d.t, p: p.toArray().map(v => +v.toFixed(3)), r: [e.x, e.y, e.z].map(v => +v.toFixed(3)), s: [...d.s], u: set.u, c: set.c, k: set.k, m: SEPARATE.has(d.t) ? 0 : set.m };
    parts.push(q);
    const middle = Math.abs(root.worldToLocal(centre.clone()).z) < 0.03 && !MIRROR_BONE[hit.bone]; // (on the middle line: no twin needed)
    if (set.mirror && !middle && parts.length < Sh.FIGHTER_PARTS.max) {
      const tw = { ...mirrored(q), _id: nextId++ };
      parts.push(tw); twins.set(q._id, tw._id); twins.set(tw._id, q._id);
    }
    if (parts.length > Sh.FIGHTER_PARTS.max) parts.length = Sh.FIGHTER_PARTS.max;
    sel = parts.indexOf(q); rebuild(); syncUi();
  }
  // a see-through preview of the shape (or body part) while you drag it over the character
  const ghostGeo = t => ({ box: () => new THREE.BoxGeometry(1, 1, 1), rbox: () => new THREE.BoxGeometry(1, 1, 1), cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 24), sphere: () => new THREE.SphereGeometry(0.5, 24, 16),
    cone: () => new THREE.ConeGeometry(0.5, 1, 24), capsule: () => new THREE.CapsuleGeometry(0.25, 0.5, 6, 16).scale(2, 1, 2), torus: () => new THREE.TorusGeometry(0.4, 0.1, 10, 28).rotateX(Math.PI / 2) }[t]());
  const seeThrough = g => g.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.55; o.material.depthWrite = false; } });
  function showGhost(keyName, hit) {
    if (ghost) { ghost.parent.remove(ghost); ghost = null; }
    if (!keyName) return;
    if (keyName.startsWith('part:')) { // (a body part: shown on the bone it would go on)
      const def = BODY_PARTS[keyName.slice(5)], b = (hit || def.bone !== 'any') && partBone(def, hit);
      if (!b) return;
      ghost = new THREE.Group();
      for (const q of partShapes(def, b)) { const m = new THREE.Mesh(ghostGeo(q.t), new THREE.MeshStandardMaterial({ color: set.c })); m.position.set(...q.p); m.rotation.set(...q.r); m.scale.set(...q.s); ghost.add(m); }
      seeThrough(ghost); onBone(b).add(ghost);
      return;
    }
    if (!hit) return;
    const { centre, qWorld, d } = placement(keyName, hit), dm = d.s.map(v => v * set.u);
    if (SEPARATE.has(d.t)) ghost = makeSeparate({ t: d.t, p: [0, 0, 0], r: [0, 0, 0], s: d.s, u: set.u, c: set.c });
    else { ghost = new THREE.Mesh(ghostGeo(d.t), new THREE.MeshStandardMaterial({ color: set.c })); ghost.scale.set(...dm); }
    seeThrough(ghost);
    ghost.position.copy(centre); ghost.quaternion.copy(qWorld); scene.add(ghost);
  }

  // ---- dragging shapes out of the palette (or clicking one to arm it, then clicking the character)
  let drag = null;
  $$('[data-shape]').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); drag = { key: b.dataset.shape, x: e.clientX, y: e.clientY, moved: false }; }));
  const onMove = e => {
    if (!drag) return;
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) drag.moved = true;
    if (drag.moved) { stopPreview(); showGhost(drag.key, pick(e)); canvas.style.cursor = 'copy'; }
  };
  const onUp = e => {
    if (!drag) return;
    const d = drag; drag = null; canvas.style.cursor = ''; showGhost(null);
    if (d.moved) { const hit = pick(e), r = canvas.getBoundingClientRect(); if (hit || (d.key.startsWith('part:') && e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom)) addAt(d.key, hit); }
    else { armed = armed === d.key ? null : d.key; sel = -1; placeProxy(); syncUi(); } // (a click: arm it for clicking onto the character)
  };
  addEventListener('pointermove', onMove); addEventListener('pointerup', onUp);
  // clicking in the view: stick on the armed shape, or pick a shape (or let go of it)
  let downAt = null;
  canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointermove', e => { if (armed && !drag && !practice) showGhost(armed, pick(e)); });
  canvas.addEventListener('pointerup', e => {
    if (practice || !downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5 || gizmo.dragging || drag) return;
    const hit = pick(e);
    if (armed) { if (hit || armed.startsWith('part:')) addAt(armed, hit); return; }
    if (hit && hit.partId) sel = parts.findIndex(q => q._id === hit.partId);
    else if (hit && hit.object === body) { // the shape nearest that spot
      let best = Infinity;
      parts.forEach((q, i) => {
        if (SEPARATE.has(q.t)) return;
        const c = onBone(q.b).localToWorld(new THREE.Vector3(...q.p)), dd = c.distanceTo(hit.point) / Math.max(...dims(q));
        if (dd < best) { best = dd; sel = i; }
      });
    } else sel = -1;
    placeProxy(); syncUi();
  });
  const onKey = e => {
    if (e.target.tagName === 'INPUT' || practice) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && parts[sel]) { e.preventDefault(); deleteSel(); }
    if (e.key === 'Escape') { armed = null; sel = -1; placeProxy(); syncUi(); showGhost(null); }
    if (e.key === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('.ce-undo').click(); }
  };
  addEventListener('keydown', onKey);

  // ---- trying it out: your fighter (as it is now) against a training dummy in a plain white room
  let practice = null;
  function startPractice() {
    armed = null; sel = -1; stopPreview(); showGhost(null); orbit.enabled = false;
    practice = true; placeProxy();
    $('.ce').classList.add('practicing');
    practice = createPractice(canvas, renderer, Sh.cleanFighter({ special, parts: clean(), prop }), $('.ce-view'), stopPractice);
  }
  function stopPractice() {
    if (!practice) return;
    practice.dispose(); practice = null;
    $('.ce').classList.remove('practicing'); orbit.enabled = true; placeProxy(); syncUi();
  }
  $('.ce-try').onclick = startPractice;

  // ---- previewing the moves
  let jab = 'L';
  function playPreview(a) { preview = { k: a === 'special' ? special : a, t0: performance.now(), side: a === 'punch' ? (jab = jab === 'L' ? 'R' : 'L') : null }; placeProxy(); for (const g of guides) g.visible = false; }
  function stopPreview() { if (!preview) return; preview = null; setTPose(bones); root.position.y = 0; beam.visible = false; for (const o of root.userData.orbs) o.visible = false; for (const g of guides) g.visible = showBones; placeProxy(); }
  $$('[data-anim]').forEach(b => b.onclick = () => playPreview(b.dataset.anim));

  let raf = 0;
  function frame() {
    raf = requestAnimationFrame(frame);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w && (canvas.width !== Math.round(w * devicePixelRatio) || canvas.height !== Math.round(h * devicePixelRatio))) { renderer.setPixelRatio(devicePixelRatio); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    if (practice) return practice.frame();
    if (preview) {
      const t = (performance.now() - preview.t0) / 1000;
      if (preview.k === 'walk') { poseFighter(root, null, t * 10 + 0.01); if (t > 2.4) stopPreview(); }
      else if (preview.k === 'jump') {
        poseFighter(root, { k: 'jump', p: Math.min(1, t / FT.JUMP_T) }, 0); root.position.y = t < FT.JUMP_T ? Math.sin(Math.PI * t / FT.JUMP_T) * FT.JUMP_H * 0.6 : 0;
        if (t > FT.JUMP_T + 0.4) stopPreview();
      } else {
        const s = FT[preview.k], dur = s ? Math.max(s.cd, s.wind + 0.05) : 0.9;
        poseFighter(root, { k: preview.k, p: t / dur, side: preview.side }, 0);
        if (s && s.beam) { beam.position.set(0.3, 0.8, 0); setBeam(beam, preview.k, 2.4, t - s.wind, s.beam, t); }
        if (t > dur + 0.4) stopPreview();
      }
    }
    renderer.render(scene, camera);
  }
  rebuild(); syncUi(); frame();
  if (opts.practice) startPractice();

  const close = () => { if (practice) practice.dispose(); cancelAnimationFrame(raf); removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); removeEventListener('keydown', onKey); gizmo.dispose(); orbit.dispose(); renderer.dispose(); host.innerHTML = ''; host.classList.add('hidden'); };
  $('.ce-save').onclick = () => {
    if (!parts.length && !confirm('Your fighter is just a skeleton. Fight like that?')) return;
    close(); onSave(Sh.cleanFighter({ special, parts: clean(), prop }));
  };
  $('.ce-cancel').onclick = close;
  host.classList.remove('hidden');
  return { close };
}
