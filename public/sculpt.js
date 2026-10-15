// Hide clay: the sculpting screen. You get a lump of clay on a turntable and shape it freely:
//   Grab: drag a bit of the clay out (or in) to make ears, arms, tails...
//   Pull / Push: build the clay up or press it in under the brush
//   Smooth: soften lumps and creases
//   Paint: color it
// Mirror makes both sides match (handy for faces). Drag the background to turn the clay; scroll or pinch to zoom.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { lumpGeometry, paintColors, encodeLump, clayMaterial, PALETTE, LIMIT } from './clayobj.js';

const TOOLS = [['grab', '✋ Grab'], ['pull', '➕ Pull'], ['push', '➖ Push'], ['smooth', '〰 Smooth'], ['paint', '🖌 Paint']];

// opens the sculpting screen in `host` (a DOM element). `fill`: the starting color (palette index).
// `deadline()`: seconds left; `status()`: a line about the others (e.g. "2 of 5 done"). `onDone(data)` gets the sculpture.
export function openSculpt(host, { fill = 0, deadline, status, onDone }) {
  host.innerHTML = `
    <canvas class="sc-canvas"></canvas>
    <div class="sc-top"><b>Sculpt your clay</b><span class="sc-time"></span><span class="sc-status"></span></div>
    <div class="sc-panel">
      <div class="sc-tools">${TOOLS.map(([k, n]) => `<button data-tool="${k}">${n}</button>`).join('')}</div>
      <label>Brush size <input type="range" class="sc-size" min="0.06" max="0.9" step="0.01" value="0.4"></label>
      <label>Strength <input type="range" class="sc-str" min="0.1" max="1" step="0.05" value="0.5"></label>
      <div class="sc-colors">${PALETTE.map((c, i) => `<button data-col="${i}" style="background:${c}" title="${c}"></button>`).join('')}</div>
      <div class="sc-row"><button class="sc-fill">Paint it all</button><button class="sc-mirror">Mirror: on</button></div>
      <div class="sc-row"><button class="sc-undo">↶ Undo</button><button class="sc-reset">Start over</button></div>
    </div>
    <div class="sc-bottom"><span class="sc-hint">Drag on the clay to shape it · drag the background to turn it · scroll or pinch to zoom</span><button class="go sc-done">I'm done</button></div>`;
  const $ = s => host.querySelector(s);
  const canvas = $('.sc-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#2a2638');
  scene.add(new THREE.HemisphereLight('#fff6e6', '#5a5070', 1.5));
  const key = new THREE.DirectionalLight('#ffffff', 2.0); key.position.set(3, 5, 4); scene.add(key);
  const rim = new THREE.DirectionalLight('#b9c8ff', 0.8); rim.position.set(-4, 2, -3); scene.add(rim);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50); camera.position.set(0, 1.2, 6);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false; controls.minDistance = 3; controls.maxDistance = 10; controls.enableDamping = true;
  // a turntable under the clay
  const table = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.7, 0.18, 48), new THREE.MeshStandardMaterial({ color: '#8a6a4a', roughness: 0.8 }));
  table.position.y = -2.55; scene.add(table);

  // the clay
  const geo = lumpGeometry(null, fill), pos = geo.attributes.position, P = pos.array, n = pos.count;
  const col = new Uint8Array(n).fill(fill);
  const mesh = new THREE.Mesh(geo, clayMaterial()); scene.add(mesh);
  // which points are joined to which (for smoothing)
  const idx = geo.index.array, nbSets = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < idx.length; i += 3) for (let k = 0; k < 3; k++) { const a = idx[i + k], b = idx[i + (k + 1) % 3]; nbSets[a].add(b); nbSets[b].add(a); }
  const nbStart = new Int32Array(n + 1), nbList = [];
  nbSets.forEach((s, i) => { nbStart[i] = nbList.length; nbList.push(...s); }); nbStart[n] = nbList.length;
  const NB = Int32Array.from(nbList);

  // each tool remembers its own brush size (painting wants a much smaller brush than shaping)
  const sizes = { grab: 0.4, pull: 0.3, push: 0.25, smooth: 0.35, paint: 0.13 };
  let tool = 'grab', size = sizes.grab, strength = 0.5, paintIdx = (fill + 3) % PALETTE.length, mirror = true;
  const undo = [];
  const remember = () => { undo.push({ p: P.slice(), c: col.slice() }); if (undo.length > 25) undo.shift(); };
  const changed = (colors = false) => {
    pos.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere();
    if (colors) paintColors(geo, col);
  };
  const clampP = i => { for (let k = 0; k < 3; k++) P[i * 3 + k] = Math.max(-LIMIT, Math.min(LIMIT, P[i * 3 + k])); };
  const fall = t => { const u = 1 - t * t; return u * u; }; // soft edge to the brush

  // one dab of the brush at point p (normal nr). With mirror on, the same dab on the other side too.
  const v = new THREE.Vector3();
  function dab(p, nr) {
    const centers = [[p, nr]];
    if (mirror && Math.abs(p.x) > size * 0.3) centers.push([new THREE.Vector3(-p.x, p.y, p.z), new THREE.Vector3(-nr.x, nr.y, nr.z)]);
    const R = size, R2 = R * R;
    for (const [c, nn] of centers) {
      const hits = [];
      for (let i = 0; i < n; i++) {
        const dx = P[i * 3] - c.x, dy = P[i * 3 + 1] - c.y, dz = P[i * 3 + 2] - c.z, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < R2) hits.push(i, fall(Math.sqrt(d2) / R));
      }
      if (tool === 'pull' || tool === 'push') {
        const s = (tool === 'pull' ? 1 : -1) * strength * R * 0.16;
        for (let k = 0; k < hits.length; k += 2) { const i = hits[k], w = hits[k + 1]; P[i * 3] += nn.x * s * w; P[i * 3 + 1] += nn.y * s * w; P[i * 3 + 2] += nn.z * s * w; clampP(i); }
      } else if (tool === 'smooth') {
        const avg = new Float32Array(hits.length / 2 * 3);
        for (let k = 0; k < hits.length; k += 2) {
          const i = hits[k]; let ax = 0, ay = 0, az = 0;
          for (let j = nbStart[i]; j < nbStart[i + 1]; j++) { const o = NB[j] * 3; ax += P[o]; ay += P[o + 1]; az += P[o + 2]; }
          const c2 = nbStart[i + 1] - nbStart[i]; avg[k / 2 * 3] = ax / c2; avg[k / 2 * 3 + 1] = ay / c2; avg[k / 2 * 3 + 2] = az / c2;
        }
        for (let k = 0; k < hits.length; k += 2) { const i = hits[k], w = hits[k + 1] * strength * 0.7; for (let a = 0; a < 3; a++) P[i * 3 + a] += (avg[k / 2 * 3 + a] - P[i * 3 + a]) * w; }
      } else if (tool === 'paint') {
        for (let k = 0; k < hits.length; k += 2) if (hits[k + 1] > 0.2) col[hits[k]] = paintIdx;
      }
    }
    changed(tool === 'paint');
  }

  // grabbing: the points under the brush follow the pointer, across a flat sheet facing you
  let grab = null;
  function startGrab(p) {
    const R = size, R2 = R * R, sets = [[p, 1]];
    if (mirror && Math.abs(p.x) > size * 0.5) sets.push([new THREE.Vector3(-p.x, p.y, p.z), -1]);
    grab = { p0: p.clone(), plane: new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).negate(), p), sets: [] };
    for (const [c, sx] of sets) {
      const list = [];
      for (let i = 0; i < n; i++) {
        const dx = P[i * 3] - c.x, dy = P[i * 3 + 1] - c.y, dz = P[i * 3 + 2] - c.z, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < R2) list.push({ i, w: fall(Math.sqrt(d2) / R), o: [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]] });
      }
      grab.sets.push({ sx, list });
    }
  }
  function moveGrab(ray) {
    const p = new THREE.Vector3();
    if (!ray.intersectPlane(grab.plane, p)) return;
    const d = p.sub(grab.p0), k = 0.4 + strength * 0.6;
    for (const { sx, list } of grab.sets) for (const { i, w, o } of list) {
      P[i * 3] = o[0] + d.x * sx * w * k; P[i * 3 + 1] = o[1] + d.y * w * k; P[i * 3 + 2] = o[2] + d.z * w * k; clampP(i);
    }
    changed();
  }

  // pointer: on the clay you sculpt, on the background you turn it
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const hitAt = e => {
    const r = canvas.getBoundingClientRect();
    ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObject(mesh)[0] || null;
  };
  let stroke = null;
  canvas.addEventListener('pointerdown', e => {
    if (stroke || (e.pointerType === 'touch' && !e.isPrimary)) return;
    const h = hitAt(e);
    if (!h) return; // the background: OrbitControls turns the view
    controls.enabled = false; canvas.setPointerCapture(e.pointerId);
    remember();
    stroke = { id: e.pointerId, last: h.point.clone() };
    if (tool === 'grab') startGrab(h.point); else dab(h.point, h.face.normal);
    e.stopImmediatePropagation();
  }, { capture: true });
  canvas.addEventListener('pointermove', e => {
    if (!stroke || e.pointerId !== stroke.id) return;
    if (tool === 'grab') { hitAt(e); moveGrab(ray.ray); return; }
    const h = hitAt(e);
    if (!h) return;
    const d = h.point.distanceTo(stroke.last), step = size * 0.3;
    if (d < step) return;
    for (let t = step; t <= d + 1e-6; t += step) { // even dabs along the stroke, however fast you move
      const p = stroke.last.clone().lerp(h.point, t / d); dab(p, h.face.normal);
    }
    stroke.last.copy(h.point);
  });
  const endStroke = e => { if (stroke && e.pointerId === stroke.id) { stroke = null; grab = null; controls.enabled = true; } };
  canvas.addEventListener('pointerup', endStroke); canvas.addEventListener('pointercancel', endStroke);

  // the buttons
  const setTool = t => { tool = t; size = sizes[t]; $('.sc-size').value = size; host.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t)); };
  const setColor = i => { paintIdx = i; host.querySelectorAll('[data-col]').forEach(b => b.classList.toggle('on', +b.dataset.col === i)); };
  host.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
  host.querySelectorAll('[data-col]').forEach(b => b.onclick = () => { setColor(+b.dataset.col); if (tool !== 'paint') setTool('paint'); });
  $('.sc-size').oninput = e => { size = sizes[tool] = +e.target.value; };
  $('.sc-str').oninput = e => strength = +e.target.value;
  $('.sc-mirror').onclick = e => { mirror = !mirror; e.target.textContent = `Mirror: ${mirror ? 'on' : 'off'}`; };
  $('.sc-fill').onclick = () => { remember(); col.fill(paintIdx); changed(true); };
  $('.sc-undo').onclick = () => { const u = undo.pop(); if (!u) return; P.set(u.p); col.set(u.c); changed(true); };
  $('.sc-reset').onclick = () => { remember(); const g = lumpGeometry(null, fill); P.set(g.attributes.position.array); g.dispose(); col.fill(fill); changed(true); };
  setTool('grab'); setColor(paintIdx);

  let done = false, raf = 0;
  const finish = () => {
    if (done) return; done = true;
    onDone(encodeLump(P, col));
    $('.sc-done').disabled = true; $('.sc-done').textContent = 'Sent!';
    $('.sc-hint').textContent = 'Waiting for everyone else to finish…';
  };
  $('.sc-done').onclick = finish;

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize();
  // (setTimeout, not requestAnimationFrame: keeps the deadline working even when the page is in the background)
  const tick = () => {
    raf = setTimeout(tick, 16);
    controls.update();
    const left = Math.max(0, deadline());
    $('.sc-time').textContent = ` · ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')} left`;
    $('.sc-status').textContent = status() ? ` · ${status()}` : '';
    if (left <= 0) finish();
    renderer.render(scene, camera);
  };
  tick();

  return {
    finish,
    close() { clearTimeout(raf); removeEventListener('resize', resize); controls.dispose(); geo.dispose(); renderer.dispose(); host.innerHTML = ''; },
  };
}
