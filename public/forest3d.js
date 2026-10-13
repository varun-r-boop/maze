// The forest map in 3D: a night sky with a moon and stars, grass and dirt paths, swaying trees, undergrowth,
// a pond with a bridge, an abandoned log cabin, a crackling campfire and drifting fireflies.
// Map space -> 3D: x = tile x, z = tile y, y is up; one tile is one unit.
import * as THREE from 'three';

const Sh = window.Shared;
const { COLS, ROWS } = Sh.C;
const hash = (x, y, k = 0) => { const s = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };

function canvasTex(size, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  return t;
}
const std = (color, extra) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
const basic = (color, extra) => new THREE.MeshBasicMaterial({ color, ...extra });

// wind: bends whatever uses this material, more the higher up it is, each instance on its own rhythm
function windy(mat, time, strength) {
  mat.customProgramCacheKey = () => 'wind' + strength; // each strength needs its own shader
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = time;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 ip = vec3(0.0);
      #ifdef USE_INSTANCING
        ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      #endif
      float h = max(position.y + 0.5, 0.0);
      float w = sin(uTime * 1.4 + ip.x * 0.8 + ip.z * 0.6) + 0.4 * sin(uTime * 3.1 + ip.x * 2.1);
      transformed.x += w * ${strength.toFixed(3)} * h;
      transformed.z += w * ${(strength * 0.6).toFixed(3)} * h;`);
  };
  return mat;
}

// one InstancedMesh for many copies of the same piece
function instances(scene, geo, mat, list, place, { cast = true, receive = true } = {}) {
  if (!list.length) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, list.length), o = new THREE.Object3D();
  list.forEach((it, i) => { o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); place(o, it, i); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix); });
  mesh.castShadow = cast; mesh.receiveShadow = receive;
  scene.add(mesh);
  return mesh;
}

export function buildForest(scene, G, WALL_H) {
  const F = G.forest, time = { value: 0 }, X = { time, fire: null, flames: [], flies: null, sky: null, water: null };
  scene.background = new THREE.Color('#070b16');
  scene.fog = new THREE.FogExp2('#0a1020', 0.11);
  const moon = new THREE.DirectionalLight('#8fa8ff', 0.35); moon.position.set(-20, 30, -10); scene.add(moon);

  // ground: grass, with dirt paths on top
  const grassTex = canvasTex(256, (x, n) => {
    x.fillStyle = '#2a4428'; x.fillRect(0, 0, n, n);
    for (let i = 0; i < 2600; i++) {
      const gx = hash(i, 1) * n, gy = hash(i, 2) * n, k = hash(i, 3);
      x.strokeStyle = `rgba(${60 + k * 60 | 0},${100 + k * 70 | 0},${50 + k * 30 | 0},.6)`; x.lineWidth = 1;
      x.beginPath(); x.moveTo(gx, gy); x.lineTo(gx + (k - 0.5) * 4, gy - 4 - k * 4); x.stroke();
    }
  }, COLS / 3, ROWS / 3);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(COLS + 30, ROWS + 30).rotateX(-Math.PI / 2), std('#ffffff', { map: grassTex }));
  ground.position.set(COLS / 2, 0, ROWS / 2); ground.receiveShadow = true; scene.add(ground);
  const dirtTex = canvasTex(128, (x, n) => {
    x.fillStyle = '#5a4630'; x.fillRect(0, 0, n, n);
    for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(0,0,0,${0.1 + hash(i, 5) * 0.2})`; x.fillRect(hash(i, 6) * n, hash(i, 7) * n, 2 + hash(i, 8) * 3, 2); }
    for (let i = 0; i < 60; i++) { x.fillStyle = 'rgba(160,140,110,.35)'; x.beginPath(); x.arc(hash(i, 9) * n, hash(i, 10) * n, 1 + hash(i, 11) * 2, 0, 6.3); x.fill(); }
  });
  instances(scene, new THREE.PlaneGeometry(1.15, 1.15).rotateX(-Math.PI / 2), std('#ffffff', { map: dirtTex }), F.path, (o, p) => { o.position.set(p.x + 0.5, 0.004 + hash(p.x, p.y) * 0.002, p.y + 0.5); o.rotation.y = hash(p.x, p.y, 1) * 0.5; }, { cast: false });

  // the pond: dark water that shimmers, a muddy bank, and a wooden bridge where the path crosses
  const waterMat = std('#14324e', { roughness: 0.05, metalness: 0.3, emissive: '#0a1a2c', emissiveIntensity: 0.6, transparent: true, opacity: 0.92 });
  X.water = waterMat;
  instances(scene, new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), waterMat, [...F.water, ...F.bridge], (o, p) => o.position.set(p.x + 0.5, 0.014, p.y + 0.5), { cast: false });
  instances(scene, new THREE.CylinderGeometry(0.62, 0.66, 0.01, 10), std('#2f2a1e'), F.water, (o, p) => o.position.set(p.x + 0.5, 0.006, p.y + 0.5), { cast: false }); // muddy bank
  const plank = std('#7a5a3a');
  instances(scene, new THREE.BoxGeometry(0.9, 0.05, 0.18), plank, F.bridge.flatMap(b => [0, 1, 2, 3, 4].map(i => ({ ...b, i }))), (o, p) => o.position.set(p.x + 0.5, 0.05, p.y + 0.12 + p.i * 0.19), { cast: false });
  for (const b of F.bridge) for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1), plank); rail.position.set(b.x + 0.5 + s * 0.45, 0.4, b.y + 0.5); scene.add(rail);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06), plank); post.position.set(b.x + 0.5 + s * 0.45, 0.2, b.y + 0.5); scene.add(post);
  }
  // lily pads
  instances(scene, new THREE.CircleGeometry(0.14, 10).rotateX(-Math.PI / 2), std('#2f6a34'), F.water.filter(w => hash(w.x, w.y, 3) < 0.4), (o, p) => o.position.set(p.x + 0.2 + hash(p.x, p.y) * 0.6, 0.018, p.y + 0.2 + hash(p.x, p.y, 2) * 0.6), { cast: false });

  // trees. Trunks block your light (they cast shadows); crowns sway in the wind.
  const bark = std('#4a3424'), barkDead = std('#5a4a3c');
  const needles = [windy(std('#1d4426'), time, 0.05), windy(std('#235230'), time, 0.06), windy(std('#2a5e36'), time, 0.07)];
  const leaves = [windy(std('#2c5426'), time, 0.05), windy(std('#36622c'), time, 0.06)];
  // the treeline around the edge of the map, plus a few more rows outside it so the woods go on into the dark
  const edge = [];
  for (let y = -3; y < ROWS + 3; y++) for (let x = -3; x < COLS + 3; x++) {
    const inMap = x >= 0 && y >= 0 && x < COLS && y < ROWS;
    if (inMap && G.grid[y][x] !== 1) continue;
    if (inMap && F.cabin && x >= F.cabin.x0 && x <= F.cabin.x1 && y >= F.cabin.y0 && y <= F.cabin.y1) continue;
    if (inMap && x === G.gate.x && y === G.gate.y) continue;
    if (!inMap && hash(x, y, 4) < 0.35) continue;
    edge.push({ x, y, kind: 'pine', s: 1.1 + hash(x, y) * 0.5, ox: (hash(x, y, 1) - 0.5) * 0.5, oz: (hash(x, y, 2) - 0.5) * 0.5, rot: hash(x, y, 3) * 6.3 });
  }
  const all = [...F.trees, ...edge], pines = all.filter(t => t.kind === 'pine'), oaks = all.filter(t => t.kind === 'oak'), dead = all.filter(t => t.kind === 'dead');
  const pos = t => [t.x + 0.5 + t.ox, t.y + 0.5 + t.oz];
  instances(scene, new THREE.CylinderGeometry(0.09, 0.14, 1, 7), bark, [...pines, ...oaks], (o, t) => { const [x, z] = pos(t); o.position.set(x, 0.5 * t.s * (t.kind === 'oak' ? 1.2 : 0.9), z); o.scale.set(t.s, t.s * (t.kind === 'oak' ? 1.2 : 0.9), t.s); });
  [[0.95, 0.85, 0.75], [0.75, 0.8, 1.25], [0.52, 0.7, 1.7]].forEach(([r, h, y], i) => { // three tiers of branches on each pine
    instances(scene, new THREE.ConeGeometry(r, h, 9), needles[i], pines, (o, t) => { const [x, z] = pos(t); o.position.set(x, y * t.s * 1.15, z); o.scale.setScalar(t.s); o.rotation.y = t.rot; }, { cast: false });
  });
  [[0, 1.55, 0, 0.62], [0.32, 1.35, 0.15, 0.48], [-0.28, 1.4, -0.2, 0.5], [0.05, 1.85, -0.1, 0.45]].forEach(([ox, y, oz, r], i) => { // a leafy crown on each oak
    instances(scene, new THREE.IcosahedronGeometry(r, 1), leaves[i % 2], oaks, (o, t) => { const [x, z] = pos(t); const c = Math.cos(t.rot), s = Math.sin(t.rot); o.position.set(x + (ox * c - oz * s) * t.s, y * t.s, z + (ox * s + oz * c) * t.s); o.scale.setScalar(t.s); }, { cast: false });
  });
  instances(scene, new THREE.CylinderGeometry(0.06, 0.13, 1.6, 6), barkDead, dead, (o, t) => { const [x, z] = pos(t); o.position.set(x, 0.8 * t.s, z); o.scale.setScalar(t.s); o.rotation.z = 0.06; });
  instances(scene, new THREE.CylinderGeometry(0.025, 0.05, 0.75, 5), barkDead, dead.flatMap(t => [0, 1, 2, 3].map(i => ({ ...t, i }))), (o, t) => {
    const [x, z] = pos(t), a = t.rot + t.i * 1.6;
    o.position.set(x + Math.cos(a) * 0.25 * t.s, (0.9 + t.i * 0.18) * t.s, z + Math.sin(a) * 0.25 * t.s);
    o.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9); o.scale.setScalar(t.s);
  });

  // undergrowth: bushes, rocks and fallen logs block your way but not your light
  const bushMat = windy(std('#2f5a2a'), time, 0.03);
  instances(scene, new THREE.IcosahedronGeometry(0.36, 1), bushMat, F.bushes.flatMap(b => [0, 1, 2].map(i => ({ ...b, i }))), (o, b) => {
    o.position.set(b.x + 0.5 + Math.cos(b.i * 2.1) * 0.18, 0.25 * b.s + b.i * 0.05, b.y + 0.5 + Math.sin(b.i * 2.1) * 0.18); o.scale.set(b.s, b.s * 0.8, b.s);
  });
  instances(scene, new THREE.DodecahedronGeometry(0.34, 0), std('#6a6e74', { roughness: 0.95, flatShading: true }), F.rocks, (o, r) => { o.position.set(r.x + 0.5, 0.15 * r.s, r.y + 0.5); o.scale.set(r.s, r.s * 0.7, r.s * 0.9); o.rotation.set(r.rot, r.rot * 2, 0); });
  instances(scene, new THREE.CylinderGeometry(0.16, 0.18, 0.95, 10).rotateZ(Math.PI / 2), std('#5a3d25'), F.logs, (o, l) => { o.position.set(l.x + 0.5, 0.16, l.y + 0.5); o.rotation.y = l.rot; });
  // ferns, saplings and tufts of grass you can walk through
  const fernMat = windy(std('#3a7a34', { side: THREE.DoubleSide }), time, 0.08), tuftMat = windy(std('#4a7a3a'), time, 0.12);
  const openTiles = [];
  for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) if (G.grid[y][x] === 0) openTiles.push({ x, y });
  const pathSet = new Set(F.path.map(p => p.y * COLS + p.x));
  const ferns = openTiles.filter(p => !pathSet.has(p.y * COLS + p.x) && hash(p.x, p.y, 7) < 0.3);
  instances(scene, new THREE.ConeGeometry(0.22, 0.32, 5, 1, true), fernMat, ferns.flatMap(p => [0, 1].map(i => ({ ...p, i }))), (o, p) => { o.position.set(p.x + hash(p.x, p.y, 8 + p.i), 0.16, p.y + hash(p.x, p.y, 9 + p.i)); o.scale.set(1, 1 + p.i * 0.5, 1); }, { cast: false });
  const tufts = [];
  for (const p of openTiles) if (!pathSet.has(p.y * COLS + p.x)) for (let i = 0; i < 3; i++) if (hash(p.x, p.y, 20 + i) < 0.6) tufts.push({ x: p.x + hash(p.x, p.y, 30 + i), y: p.y + hash(p.x, p.y, 40 + i), s: 0.6 + hash(p.x, p.y, 50 + i) * 0.8 });
  instances(scene, new THREE.ConeGeometry(0.03, 0.22, 3), tuftMat, tufts, (o, p) => { o.position.set(p.x, 0.11 * p.s, p.y); o.scale.setScalar(p.s); o.rotation.z = (hash(p.x, p.y) - 0.5) * 0.5; }, { cast: false, receive: false });

  // the abandoned cabin: log walls, a pitched roof, a table inside
  if (F.cabin) {
    const c = F.cabin, logTex = canvasTex(128, (x, n) => {
      for (let i = 0; i < 8; i++) { const g = x.createLinearGradient(0, i * 16, 0, i * 16 + 16); g.addColorStop(0, '#5a3d25'); g.addColorStop(0.5, '#7a5636'); g.addColorStop(1, '#3a2716'); x.fillStyle = g; x.fillRect(0, i * 16, n, 16); }
    });
    const cells = [];
    for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) if (G.grid[y][x] === 1) cells.push({ x, y });
    instances(scene, new THREE.BoxGeometry(1, WALL_H, 1), std('#ffffff', { map: logTex }), cells, (o, p) => o.position.set(p.x + 0.5, WALL_H / 2, p.y + 0.5));
    const w = c.x1 - c.x0 + 1, d = c.y1 - c.y0 + 1, roofMat = std('#3a2a1e', { side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const roof = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.6, d / 2 / Math.cos(0.5) + 0.3), roofMat);
      roof.rotation.x = -Math.PI / 2 + s * 0.5; roof.position.set(c.x0 + w / 2, WALL_H + d / 4 * Math.tan(0.5), c.y0 + d / 2 + s * d / 4);
      roof.castShadow = true; scene.add(roof);
    }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w - 2, d - 2).rotateX(-Math.PI / 2), std('#4a3a2a'));
    floor.position.set(c.x0 + w / 2, 0.005, c.y0 + d / 2); floor.receiveShadow = true; scene.add(floor);
    const table = new THREE.Group(); table.position.set(c.table.x + 0.5, 0, c.table.y + 0.5);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.6), std('#5a3d25')); top.position.y = 0.42; table.add(top);
    for (const [lx, lz] of [[-0.35, -0.25], [0.35, -0.25], [-0.35, 0.25], [0.35, 0.25]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.05), std('#4a3220')); leg.position.set(lx, 0.21, lz); table.add(leg); }
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 8), basic('#f4ecd8')); candle.position.y = 0.5; table.add(candle);
    table.traverse(o => { if (o.isMesh) o.castShadow = true; });
    scene.add(table);
  }

  // the campfire: stones, crossed logs, dancing flames and a flickering light that throws tree shadows
  const fx = F.fire.x + 0.5, fz = F.fire.y + 0.5;
  instances(scene, new THREE.DodecahedronGeometry(0.09, 0), std('#6a6a6a', { flatShading: true }), [...Array(10)].map((_, i) => i), (o, i) => { o.position.set(fx + Math.cos(i * 0.63) * 0.36, 0.05, fz + Math.sin(i * 0.63) * 0.36); o.rotation.set(i, i * 2, 0); });
  for (const a of [0.5, -0.5, 1.6]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 7).rotateZ(Math.PI / 2), std('#3a2716')); l.position.set(fx, 0.07, fz); l.rotation.y = a; scene.add(l); }
  for (let i = 0; i < 4; i++) {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12 - i * 0.02, 0.4, 8), basic(['#ff7a1a', '#ffa030', '#ffcf60', '#ff5a10'][i], { transparent: true, opacity: 0.85, depthWrite: false }));
    flame.position.set(fx + Math.cos(i * 1.7) * 0.06, 0.25, fz + Math.sin(i * 1.7) * 0.06); scene.add(flame);
    X.flames.push(flame);
  }
  X.fire = new THREE.PointLight('#ff8a3a', 2.2, 7, 1.3);
  X.fire.position.set(fx, 0.6, fz); X.fire.castShadow = true; X.fire.shadow.mapSize.set(512, 512); X.fire.shadow.camera.near = 0.1; X.fire.shadow.bias = -0.003;
  scene.add(X.fire);

  // a soft round dot, so stars and fireflies glow instead of drawing as squares
  const dot = canvasTex(64, (x, n) => { const g = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.8)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, n, n); });
  // sky: a moon and a dome of stars that stay put around you
  X.sky = new THREE.Group();
  const moonTex = canvasTex(128, (x, n) => { const g = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); g.addColorStop(0, '#fffbe8'); g.addColorStop(0.35, '#f2ecd0'); g.addColorStop(0.42, 'rgba(200,210,255,.35)'); g.addColorStop(1, 'rgba(120,140,220,0)'); x.fillStyle = g; x.fillRect(0, 0, n, n); });
  const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, fog: false, depthWrite: false }));
  moonSprite.scale.set(6, 6, 1); moonSprite.position.set(-14, 20, -14); X.sky.add(moonSprite);
  const starPos = [];
  for (let i = 0; i < 700; i++) { const a = hash(i, 1) * 6.283, e = 0.15 + hash(i, 2) * 1.3, r = 28; starPos.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r); }
  const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3)), new THREE.PointsMaterial({ color: '#cfd8ff', size: 0.16, fog: false, map: dot, transparent: true, depthWrite: false }));
  X.sky.add(stars); scene.add(X.sky);

  // fireflies that drift around wherever you are
  const n = 70, fly = new Float32Array(n * 3);
  X.flyData = [...Array(n)].map((_, i) => ({ ox: (hash(i, 3) - 0.5) * 16, oz: (hash(i, 4) - 0.5) * 16, oy: 0.3 + hash(i, 5) * 1.1, sp: 0.3 + hash(i, 6) * 0.5, ph: hash(i, 7) * 6.3 }));
  X.flies = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(fly, 3)),
    new THREE.PointsMaterial({ color: '#d8ff7a', size: 0.09, map: dot, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  X.flies.frustumCulled = false; scene.add(X.flies);
  return X;
}

export function updateForest(X, f, t, camera) {
  X.time.value = t;
  const k = 0.75 + 0.25 * Math.sin(t * 11) * Math.sin(t * 6.7) + (Math.random() - 0.5) * 0.1;
  X.fire.intensity = 2.2 * k;
  X.flames.forEach((fl, i) => { fl.scale.set(1, 0.7 + 0.5 * Math.abs(Math.sin(t * (7 + i) + i)), 1); fl.rotation.y = t * (1 + i * 0.3); });
  X.water.emissiveIntensity = 0.5 + 0.15 * Math.sin(t * 1.3);
  X.sky.position.set(camera.position.x, 0, camera.position.z);
  const TILE = Sh.C.TILE, vx = f.view.x / TILE, vz = f.view.y / TILE, arr = X.flies.geometry.attributes.position.array;
  X.flyData.forEach((d, i) => { // each firefly wanders around its own spot near you (the spots wrap around as you walk)
    const wrap = (v, c) => c + ((((v - c) % 16) + 24) % 16) - 8;
    arr[i * 3] = wrap(d.ox + Math.sin(t * d.sp + d.ph) * 1.2, vx);
    arr[i * 3 + 1] = d.oy + Math.sin(t * d.sp * 1.7 + d.ph) * 0.25;
    arr[i * 3 + 2] = wrap(d.oz + Math.cos(t * d.sp * 0.8 + d.ph) * 1.2, vz);
  });
  X.flies.geometry.attributes.position.needsUpdate = true;
  X.flies.material.opacity = 0.6 + 0.4 * Math.sin(t * 2.3);
}
