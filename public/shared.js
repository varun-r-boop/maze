// Code shared by the server (Node) and the browser client.
(function (S) {
  const C = S.C = {
    TILE: 40, COLS: 41, ROWS: 31,
    PLAYER_SPEED: 165, PLAYER_R: 12, MAX_PLAYERS: 12, MIN_PLAYERS: 2,
    // freeze tag
    TAGGER_SPEED: 1.1,   // taggers move this much faster than runners
    TAG_DIST: 44,        // px: how close a tagger has to be to freeze a runner with a click
    RESCUE_DIST: 48,     // px: how close a free runner has to be to unfreeze a frozen one with a click
    ACT_COOLDOWN: 0.35,  // seconds between clicks that count
    IMMUNE: 2,           // seconds a runner can't be tagged after being unfrozen
    HOLD: 5,             // seconds at the start when taggers can't move yet (the runners scatter)
    DANGER_DIST: 7,      // tiles: runners hear the heartbeat when a tagger is this close
    ROUND_TIMES: [60, 120, 180, 300, 480], ROUND_DEFAULT: 180, // seconds the host can pick from
    // noise traps: noisy things on the floor that give a runner away when they step on one
    TRAP_STEP: 16,       // px: how close to a trap's center you have to step to set it off
    TRAP_COOLDOWN: 8,    // seconds before a trap can go off again
    NOISE_RADIUS: 14,    // tiles: how far away (on the same floor) a noise is heard
    NOISE_SHOW: 4,       // seconds the alert stays up where the noise came from
    // jumping (space): a little hop. While you're in the air you don't set off noise traps, so you can jump over them.
    JUMP_T: 0.55,        // seconds a jump lasts
    JUMP_REST: 0.2,      // seconds after landing before you can jump again
    // hide clay: everyone sculpts a clay object, hides it, then hunts for someone else's
    SCULPT_TIME: 120,    // seconds to sculpt
    HIDE_TIME: 45,       // seconds to walk round and hide your sculpture
    FIND_DIST: 1.4,      // tiles: how close you have to be to pick up the sculpture you're hunting
    FIND_POINTS: 100,    // points for finding your target, plus up to FIND_BONUS more the sooner you find it
    FIND_BONUS: 150,
    HIDDEN_POINTS: 1,    // points a sculpture earns its maker for every second it stays hidden during the hunt
    // key escape: find your own key, get to the gate, don't let the bot catch you
    KEY_DIST: 26,        // px: how close you have to walk to your key to pick it up
    GATE_DIST: 34,       // px: how close to the gate you have to be (with your key) to get out
    CATCH_DIST: 24,      // px: how close the bot has to get to catch you
    BOT_SPEED: 0.92,     // the bot's speed (times a player's) at the start; it speeds up to BOT_SPEED_END by the end
    BOT_SPEED_END: 1.05,
    ZONE_R: 2.5,         // tiles: the safe zone's radius. The bot can't go in, and can't catch you while you're in it.
    ZONE_TIME: 10,       // seconds before the safe zone moves somewhere else
  };
  const { TILE, COLS, ROWS } = C;
  // how many taggers: 1 for up to 6 players, 2 for 7 to 12
  S.taggerCount = n => n <= 6 ? 1 : 2;
  // the kinds of noise trap (`sound` picks how it sounds), and which ones lie around on each map
  S.TRAPS = {
    glass: { name: 'broken glass', sound: 'crunch' }, cans: { name: 'tin cans', sound: 'clank' }, bubble: { name: 'bubble wrap', sound: 'pop' },
    toy: { name: 'a squeaky toy', sound: 'squeak' }, twigs: { name: 'dry twigs', sound: 'snap' }, leaves: { name: 'crunchy leaves', sound: 'rustle' },
    mug: { name: 'a smashed mug', sound: 'crunch' }, books: { name: 'a pile of books', sound: 'thud' },
  };
  S.MAP_TRAPS = {
    building: ['glass', 'cans', 'bubble'], apartment: ['glass', 'cans', 'toy'], forest: ['twigs', 'leaves'],
    office: ['bubble', 'mug'], mall: ['toy', 'glass', 'bubble', 'cans'], library: ['books', 'bubble', 'mug'],
  };
  // game modes the host can pick
  S.MODES = [['tag', 'Freeze tag'], ['clay', 'Hide clay'], ['escape', 'Key escape'], ['fight', 'Arena fights']];
  // key escape: how many bots chase you: 1 for up to 4 players, 2 for up to 8, 3 for more
  S.botCount = n => n <= 4 ? 1 : n <= 8 ? 2 : 3;
  // arena fights: 1 v 1 in a knockout bracket. All the numbers that decide how a fight feels are here.
  S.FIGHT = {
    HP: 100, ROUND_T: 60, WINS: 2,   // health; seconds per round; rounds needed to win a match (best of 3)
    INTRO: 3, KO_PAUSE: 3, BRACKET_PAUSE: 4, // seconds: "Round 1… FIGHT!", after a knock-out, showing the bracket
    punch: { dmg: 7, range: 50, arc: 1.0, wind: 0.07, cd: 0.32, stun: 0.34 },         // range px, arc: half-angle (radians); the stun lasts until your next jab lands (jabs chain)
    kick: { dmg: 14, range: 60, arc: 0.85, wind: 0.22, cd: 0.75, stun: 0.3, kb: 260 }, // kb: knock-back speed (px/s)
    RUN: 1.75, // running (hold R, or double-tap a direction): this much faster than walking
    BLOCK: 0.25, BLOCK_SPEED: 0.45,  // blocking: share of the damage you still take, and how fast you can move
    DODGE: { t: 0.28, speed: 430, cd: 1.0 }, // a roll: nothing hits you while it lasts
    METER_DEAL: 1.5, METER_TAKE: 1.0, // the special meter (0-100) fills by this much per point of damage dealt / taken
    // the specials are energy beams: charge up (wind, standing still; a hit stops it), then a beam shoots straight ahead
    // for `beam` seconds, `len` px long and `w` px wide. Jump over it to dodge it.
    kamehameha: { dmg: 24, wind: 0.75, beam: 0.5, len: 340, w: 22, cd: 1.5, stun: 0.5, kb: 380 },
    finalflash: { dmg: 30, wind: 1.0, beam: 0.6, len: 400, w: 34, cd: 1.85, stun: 0.6, kb: 460 },
    // combo moves: a sequence of jabs and kicks turns into a special attack (see COMBO_MOVES). hits: how many times it
    // hits (every `every` s); launch: how hard it sends them up into the air; lunge: how far (px) you dart in as it starts
    // (so it reaches someone a kick has just shoved back)
    rush: { dmg: 4, hits: 3, every: 0.09, wind: 0.06, cd: 0.5, range: 55, arc: 1.0, stun: 0.34, lunge: 35 },
    rising: { dmg: 12, wind: 0.16, cd: 0.62, range: 60, arc: 0.9, stun: 0.4, launch: 5.6, lunge: 45 },
    spin: { dmg: 16, wind: 0.28, cd: 0.8, range: 80, arc: 3.2, stun: 0.45, kb: 420, lunge: 70 },
    upper: { dmg: 11, wind: 0.12, cd: 0.55, range: 55, arc: 1.0, stun: 0.4, launch: 4.8, lunge: 75 },
    divekick: { dmg: 14, wind: 0.08, cd: 0.5, range: 68, arc: 1.0, stun: 0.4, kb: 300, lunge: 60 },
    LUNGE_T: 0.15, // (seconds the lunge takes)
    // air moves (while you're jumping): J an air jab; J then K a meteor smash (hammers them into the floor, and they
    // bounce back up: spike is how hard); K a dive kick, and K then K a tornado kick (a spinning double kick)
    airjab: { dmg: 6, wind: 0.05, cd: 0.22, range: 58, arc: 1.1, stun: 0.34, lunge: 45 },
    airspike: { dmg: 16, wind: 0.12, cd: 0.45, range: 66, arc: 1.0, stun: 0.5, spike: 7, lunge: 50 },
    tornado: { dmg: 7, hits: 2, every: 0.12, wind: 0.08, cd: 0.45, range: 75, arc: 3.2, stun: 0.4, kb: 200, lunge: 40 },
    // the sequences (checked in this order; each press must come within CHAIN seconds of the one before), and a kick
    // while you're in the air is a dive kick
    COMBO_MOVES: [['rush', ['punch', 'punch', 'punch']], ['rising', ['punch', 'punch', 'kick']], ['spin', ['kick', 'kick']], ['upper', ['kick', 'punch']]],
    CHAIN: 0.95,
    MOVE_NAMES: { rush: 'Rush', rising: 'Rising Kick', spin: 'Spin Kick', upper: 'Uppercut', divekick: 'Dive Kick', airspike: 'Meteor Smash', tornado: 'Tornado Kick' },
    // combos: hits that land within `window` seconds of each other chain; from the 3rd hit each does `scale` times less.
    // A ground combo is broken off (they're shoved away) after `breakAt` hits.
    COMBO: { window: 0.9, scale: 0.88, breakAt: 6 },
    // juggles: a kick as the 3rd hit of a combo (jab, jab, kick) launches them, and a beam always sends them flying.
    // While they're up, every hit pops them back up (less each time, `decay`; at most `max` times). Then they fall,
    // land and get up (`getup` seconds, nothing hits them). Heights in 3D units, `g` the gravity.
    JUGGLE: { bounce: 3.4, g: 11, launch: 5.4, pop: { punch: 2.4, kick: 3.8, kamehameha: 4.6, finalflash: 5.2 }, decay: 0.8, max: 6, getup: 0.55 },
    HIT_T: { punch: 0.3, kick: 0.5, kamehameha: 0.8, finalflash: 0.9, block: 0.25, rush: 0.25, rising: 0.5, spin: 0.6, upper: 0.4, divekick: 0.5, airjab: 0.3, airspike: 0.5, tornado: 0.5 }, // seconds each hit reaction plays (block: a hit on your guard)
    HIT_STOP: { punch: 0.06, kick: 0.12, kamehameha: 0.2, finalflash: 0.26, block: 0.05, rush: 0.04, rising: 0.12, spin: 0.15, upper: 0.11, divekick: 0.12, airjab: 0.05, airspike: 0.18, tornado: 0.08 }, // hit-stop: both fighters freeze for this long as a hit lands
    JUMP_T: 0.85, JUMP_H: 1.35, JUMP_PX: 46, // a fighter's jump: seconds in the air, how high (3D units, and px top-down)
  };
  // Building your own fighter: a character is a list of shapes dropped onto a skeleton. Each shape belongs to the body
  // part it was dropped on (so it moves with it), and has where it sits and how it's turned on that part, its size
  // (s: width, height and depth; u: an overall size on top), its color, how much it blends into the shapes it touches
  // (k: 0 = a sharp join, 1 = melted smoothly together) and whether it adds or cuts away (m: 1 = subtract).
  // Hair, eyes and horns are separate pieces (they don't blend). No shapes (parts: null) means just the skeleton.
  S.FIGHTER_PARTS = {
    // upper arm (shoulder to elbow), forearm (elbow to hand), thigh (hip to knee), shin (knee to foot), left and right
    bones: ['torso', 'head', 'hips', 'armL', 'foreL', 'armR', 'foreR', 'legL', 'shinL', 'legR', 'shinR'],
    types: ['box', 'rbox', 'cylinder', 'sphere', 'cone', 'capsule', 'torus', 'curly', 'longhair', 'eye', 'horn', 'blade', 'spike', 'spear', 'coat'],
    max: 90,
  };
  S.FIGHT_SPECIALS = ['kamehameha', 'finalflash'];
  S.SPECIAL_NAMES = { kamehameha: 'Kamehameha', finalflash: 'Final Flash' };
  S.cleanFighter = f => {
    const P = S.FIGHTER_PARTS, num = (v, lo, hi, d) => Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
    const v3 = (a, lo, hi, d) => Array.isArray(a) && a.length === 3 ? a.map(v => Math.round(num(v, lo, hi, d) * 1000) / 1000) : [d, d, d];
    const parts = Array.isArray(f && f.parts) ? f.parts.slice(0, P.max)
      .filter(q => q && P.bones.includes(q.b) && P.types.includes(q.t))
      .map(q => ({ b: q.b, t: q.t, p: v3(q.p, -1.5, 1.5, 0), r: v3(q.r, -7, 7, 0), s: v3(q.s, 0.02, 1.2, 0.2), u: Math.round(num(q.u, 0.2, 3, 1) * 100) / 100,
        c: /^#[0-9a-f]{6}$/i.test(q.c) ? q.c.toLowerCase() : '#cccccc', k: Math.round(num(q.k, 0, 1, 0.3) * 100) / 100, m: q.m ? 1 : 0,
        // (from the quick builder: which slot and option it came from, and whether it's in the body or the accent color)
        ...(typeof q.g === 'string' && /^[a-z]{1,10}\.[a-z0-9]{1,12}$/.test(q.g) ? { g: q.g } : {}), ...(q.o === 'a' || q.o === 'b' ? { o: q.o } : {}) })) : null;
    // proportions: how long the arms, legs and body are (1 = like a person)
    const pr = f && f.prop && typeof f.prop === 'object' ? f.prop : {};
    const prop = { arm: Math.round(num(pr.arm, 0.6, 1.6, 1) * 100) / 100, leg: Math.round(num(pr.leg, 0.6, 1.5, 1) * 100) / 100, body: Math.round(num(pr.body, 0.6, 1.4, 1) * 100) / 100 };
    // the look: shaded (lit, 3D), or flat (ink: no shading, so a black body is a pure silhouette); and an outline color (or none)
    const style = f && f.style === 'flat' ? 'flat' : 'shaded', line = f && /^#[0-9a-f]{6}$/i.test(f.line) ? f.line.toLowerCase() : null;
    return { special: S.FIGHT_SPECIALS.includes(f && f.special) ? f.special : 'kamehameha', parts: parts && parts.length ? parts : null, prop, style, line };
  };
  // a hit lands (not blocked): counts the combo, launches or juggles. att and def are the fighters (they keep comboN,
  // comboUntil, air: { y, vy }, juggles); time is the game clock in seconds. Returns { n, mult, launch }.
  S.fightCombo = (att, def, kind, time) => {
    const C = S.FIGHT.COMBO, J = S.FIGHT.JUGGLE, spec = S.FIGHT[kind], beam = !!spec.beam;
    const n = def.air || time < (att.comboUntil || 0) ? (att.comboN || 0) + 1 : 1;
    att.comboN = n; att.comboUntil = time + C.window; def.comboN = 0;
    let launch = false;
    if (spec.spike) { // a meteor smash: slammed down (and they'll bounce back up off the floor)
      if (def.air) { def.air.vy = -spec.spike; def.air.bounce = true; } else { def.air = { y: 0.01, vy: J.bounce }; def.juggles = 0; }
      return { n, mult: Math.pow(C.scale, Math.max(0, n - 2)), launch: false };
    }
    if (def.air) { if ((def.juggles || 0) < J.max) { def.air.vy = Math.max(def.air.vy, (J.pop[kind] || (spec.launch ? 4 : 2.6)) * Math.pow(J.decay, def.juggles || 0)); def.juggles = (def.juggles || 0) + 1; } }
    else if ((kind === 'kick' && n >= 3) || beam || spec.launch) { def.air = { y: 0.01, vy: beam ? J.pop[kind] : spec.launch || J.launch }; def.juggles = 0; launch = true; }
    return { n, mult: Math.pow(C.scale, Math.max(0, n - 2)), launch };
  };
  // a jab or a kick is pressed: what move it turns into, from the presses before it (hist: [{ k, t }], kept by the
  // caller; time in seconds; inAir: jumping)
  S.fightNextMove = (hist, k, time, inAir) => {
    const F = S.FIGHT;
    if (hist.length && time - hist[hist.length - 1].t > F.CHAIN) hist.length = 0; // (too slow: start again)
    if (inAir) { // in the air: an air jab, a dive kick, or the air combo it finishes
      const prev = hist[hist.length - 1], pm = prev && prev.air ? prev.mv : null;
      const mv = k === 'punch' ? 'airjab' : pm === 'airjab' ? 'airspike' : pm === 'divekick' ? 'tornado' : 'divekick';
      if (mv === 'airspike' || mv === 'tornado') hist.length = 0; else hist.push({ k, t: time, air: true, mv });
      return mv;
    }
    while (hist.length && hist[0].air) hist.shift(); // (on the ground: only what you pressed on the ground counts)
    hist.push({ k, t: time });
    for (const [move, seq] of F.COMBO_MOVES) {
      if (hist.length >= seq.length && seq.every((s, i) => hist[hist.length - seq.length + i].k === s)) { hist.length = 0; return move; }
    }
    if (hist.length > 4) hist.splice(0, hist.length - 4);
    return k;
  };
  // someone in the air: falls; true when they land
  S.fightAir = (p, dt) => {
    if (!p.air) return false;
    p.air.vy -= S.FIGHT.JUGGLE.g * dt; p.air.y += p.air.vy * dt;
    if (p.air.y > 0) return false;
    if (p.air.bounce) { p.air = { y: 0.01, vy: S.FIGHT.JUGGLE.bounce }; return false; } // (smashed down: they bounce back up)
    p.air = null; return true;
  };
  // the colors you can paint your clay sculpture
  S.CLAY_COLORS = ['#e85d5d', '#f28a3b', '#f2c94c', '#7fc65a', '#3fa66b', '#4aa3df', '#3c5fc4', '#9b6ad6', '#f07cb0', '#f4efe2', '#8a5a3a', '#3d3d48'];
  S.COLORS = ['#4fc3f7', '#ffb74d', '#81c784', '#f06292', '#fff176', '#4db6ac', '#ce93d8', '#ff8a65', '#7986cb', '#aed581', '#bcaaa4', '#e0e0e0'];
  // each player's skin tone and hair color come from their slot, so the clay people all look a bit different
  const SKINS = ['#f2c9a8', '#d9a07a', '#b97f55', '#8c5a3c', '#e8b58f', '#6b4430', '#f6d6bf', '#c58c66'];
  const HAIRS = ['#2b1d14', '#6b4223', '#d4a85a', '#151515', '#9b4a24', '#4a3020', '#e8d3a0', '#3a2a2a'];
  S.look = slot => ({ skin: SKINS[slot % SKINS.length], hair: HAIRS[(slot * 3 + 1) % HAIRS.length] });
  // one spawn tile per player in the 4x3 spawn area at the top-left
  S.SPAWNS = [[1, 1], [3, 1], [1, 3], [3, 3], [2, 2], [4, 2], [2, 1], [4, 1], [1, 2], [3, 2], [2, 3], [4, 3]];
  // facing angle in map space (radians, as Math.atan2(dy, dx): 0 = east, PI/2 = south). Start facing east, into the maze.
  S.START_YAW = 0;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  const rand = S.rand = n => Math.floor(Math.random() * n);
  const I = S.I = (x, y) => y * COLS + x;
  S.center = t => t * TILE + TILE / 2;
  S.tileOf = o => ({ x: Math.floor(o.x / TILE), y: Math.floor(o.y / TILE) });
  S.dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // maps the host can pick
  S.MAPS = [['building', 'Building'], ['apartment', 'Apartment (3 floors)'], ['forest', 'Forest'], ['office', 'Office (lights on)'], ['mall', 'Mall (daytime)'], ['library', 'Library (2 floors)']];

  // `links` (optional): Map from a tile index to tile indexes it also connects to (stairs between floors)
  S.bfs = function (sx, sy, pass, links) {
    const d = new Int16Array(COLS * ROWS).fill(-1), par = new Int32Array(COLS * ROWS).fill(-1);
    const q = new Int32Array(COLS * ROWS); let h = 0, t = 0;
    d[I(sx, sy)] = 0; q[t++] = I(sx, sy);
    while (h < t) {
      const c = q[h++], x = c % COLS, y = (c / COLS) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const ni = I(nx, ny);
        if (d[ni] !== -1 || !pass(nx, ny)) continue;
        d[ni] = d[c] + 1; par[ni] = c; q[t++] = ni;
      }
      const l = links && links.get(c);
      if (l) for (const ni of l) {
        if (d[ni] !== -1 || !pass(ni % COLS, (ni / COLS) | 0)) continue;
        d[ni] = d[c] + 1; par[ni] = c; q[t++] = ni;
      }
    }
    return { d, par };
  };
  S.stairLinks = stairs => new Map(stairs.map(s => [I(s.x, s.y), [I(s.tx, s.ty)]]));
  // which floor a map-space x position is on (floors are side by side in the grid, split by solid walls)
  S.floorOf = (floors, px) => {
    const tx = Math.floor(px / TILE);
    for (let i = 0; i < floors.length; i++) if (tx <= floors[i].x1) return i;
    return floors.length - 1;
  };

  // a level: { name, grid, floors: [{x0, x1}], stairs: [{x, y, tx, ty, up}], spawns: [[x, y]] }
  S.genLevel = function (name) {
    if (name === 'apartment') return genApartment();
    if (name === 'forest') return genForest();
    if (name === 'office') return genOffice();
    if (name === 'mall') return genMall();
    if (name === 'library') return genLibrary();
    if (name === 'arena') return genArena();
    return { name: 'building', grid: S.genMap(), floors: [{ x0: 0, x1: COLS - 1 }], stairs: [], spawns: S.SPAWNS };
  };

  // A 3-floor apartment block. Each floor: a hallway down the middle with flats on both sides,
  // and a stairwell at each end of the hallway with real flights of stairs. You start on the top floor;
  // the way out is the building entrance at the bottom of the ground-floor hallway.
  // Grid values: 0 floor, 1 wall, 2 low furniture (blocks walking, not light), 3 tall furniture (blocks both).
  const FW = 12, FLOORS = 3, FLIGHT = 3; // floor width: 4 (flats) + 1 (wall) + 2 (hallway) + 1 (wall) + 4 (flats); FLIGHT: rows a staircase takes
  S.FLIGHT = FLIGHT;
  function genApartment() {
    for (;;) {
      const g = [...Array(ROWS)].map(() => Array(COLS).fill(1));
      const floors = [], stairs = [], flights = [], rooms = [], furniture = [], doors = [], top = 1, bot = ROWS - 2;
      const X = (k, lx) => 1 + k * (FW + 1) + lx;
      for (let k = 0; k < FLOORS; k++) {
        floors.push({ x0: X(k, 0), x1: X(k, FW - 1) });
        for (let y = top; y <= bot; y++) g[y][X(k, 5)] = g[y][X(k, 6)] = 0; // hallway
        rooms.push({ type: 'hall', x0: X(k, 5), y0: top, x1: X(k, 6), y1: bot });
        for (const east of [false, true]) {
          const ux0 = east ? X(k, 8) : X(k, 0), ux1 = ux0 + 3, doorX = east ? X(k, 7) : X(k, 4);
          const frontX = east ? ux0 : ux1, backX = east ? ux1 : ux0, face = east ? -1 : 1; // furniture on the back wall faces the hallway side
          const units = [];
          for (let y = top; y <= bot;) {
            const left = bot - y + 1;
            let h = 4 + rand(3);
            if (left - h - 1 < 4) h = left; // the last flat takes what's left
            units.push([y, y + h - 1]); y += h + 1; // +1: the wall between flats
          }
          for (const [ya, yb] of units) {
            for (let y = ya; y <= yb; y++) for (let x = ux0; x <= ux1; x++) g[y][x] = 0;
            const door = ya + 1 + rand(yb - ya - 1);
            g[door][doorX] = 0; doors.push({ x: doorX, y: door, vert: true }); // front door onto the hallway
            const R = (type, y0, y1) => furnish(g, furniture, rooms, { type, x0: ux0, x1: ux1, y0, y1 }, frontX, backX, face, door);
            const walls = [];
            for (let wy = ya + 2; wy <= yb - 2; wy++) if (wy !== door) walls.push(wy);
            if (yb - ya >= 4 && walls.length && Math.random() < 0.7) { // a bedroom or bathroom behind an inner wall
              const wy = walls[rand(walls.length)], ix = ux0 + 1 + rand(2);
              for (let x = ux0; x <= ux1; x++) g[wy][x] = 1;
              g[wy][ix] = 0; doors.push({ x: ix, y: wy, vert: false });
              const doorTop = door < wy, back = doorTop ? [wy + 1, yb] : [ya, wy - 1];
              R('living', ...(doorTop ? [ya, wy - 1] : [wy + 1, yb]));
              R(back[1] - back[0] + 1 <= 2 && Math.random() < 0.7 ? 'bath' : 'bed', ...back);
            } else R('studio', ya, yb);
          }
          // some neighbouring flats are joined by a doorway, so there are loops to run around
          for (let i = 0; i + 1 < units.length; i++) if (Math.random() < 0.35) {
            const y = units[i][1] + 1, x = ux0 + 1 + rand(2);
            g[y][x] = 0; doors.push({ x, y, vert: false });
          }
        }
      }
      // stairwells at both ends of every hallway: the left column is a flight going up, the right one going down.
      // Reach the far end of a flight and you arrive on the other floor next to the bottom of its matching flight.
      for (let k = 0; k < FLOORS; k++) for (const [y0, y1, dir] of [[top, top + FLIGHT - 1, -1], [bot - FLIGHT + 1, bot, 1]]) {
        const end = dir < 0 ? y0 : y1, out = dir < 0 ? y1 + 1 : y0 - 1, a = dir < 0 ? Math.PI / 2 : -Math.PI / 2; // face out of the stairwell
        if (k + 1 < FLOORS) {
          flights.push({ x: X(k, 5), y0, y1, dir, up: true });
          stairs.push({ x: X(k, 5), y: end, tx: X(k + 1, 6), ty: out, up: true, a });
        }
        if (k > 0) {
          flights.push({ x: X(k, 6), y0, y1, dir, up: false });
          stairs.push({ x: X(k, 6), y: end, tx: X(k - 1, 5), ty: out, up: false, a });
        }
      }
      const spawns = [];
      for (let y = top + FLIGHT + 2; spawns.length < 12; y++) spawns.push([X(FLOORS - 1, 5), y], [X(FLOORS - 1, 6), y]); // top-floor hallway
      // every open tile must be reachable from the spawn, using the stairs
      const d = S.bfs(spawns[0][0], spawns[0][1], (x, y) => g[y][x] === 0, S.stairLinks(stairs)).d;
      let ok = true;
      for (let y = 0; y < ROWS && ok; y++) for (let x = 0; x < COLS; x++) if (g[y][x] === 0 && d[I(x, y)] < 0) { ok = false; break; }
      if (ok) return { name: 'apartment', grid: g, floors, stairs, flights, rooms, furniture, doors, spawns, yaw: -Math.PI / 2 }; // start facing up the hallway, toward the stairs
    }
  }

  // A forest at night. Trees (tile 3) block walking and light; bushes, rocks, logs and water (tile 2) block walking only;
  // the edge of the map (tile 1) is a dense treeline, plus the walls of an old log cabin.
  // You start at a campsite in the top-left; a path winds to the way out on the far right.
  function genForest() {
    for (;;) {
      const g = [...Array(ROWS)].map((_, y) => Array(COLS).fill(0).map((_, x) => (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) ? 1 : 0));
      const F = { trees: [], bushes: [], rocks: [], logs: [], water: [], bridge: [], path: [], cabin: null, fire: { x: 4, y: 4 } };
      const reserved = new Set(), key = (x, y) => y * COLS + x, inside = (x, y) => x > 0 && y > 0 && x < COLS - 1 && y < ROWS - 1;
      // campsite clearing
      for (let y = 1; y <= 8; y++) for (let x = 1; x <= 8; x++) if ((x - 4) ** 2 + (y - 4) ** 2 <= 13) reserved.add(key(x, y));
      // winding dirt paths: the main one to the way out, and a couple of side trails
      const pathSet = new Set();
      const trail = (x, y, tx, ty) => {
        for (let n = 0; n < 400 && (x !== tx || y !== ty); n++) {
          pathSet.add(key(x, y));
          const r = Math.random();
          if (r < 0.62) { if (Math.abs(tx - x) >= Math.abs(ty - y)) x += Math.sign(tx - x); else y += Math.sign(ty - y); }
          else if (r < 0.81) y += Math.random() < 0.5 ? 1 : -1;
          else x += Math.random() < 0.5 ? 1 : -1;
          x = Math.max(1, Math.min(COLS - 2, x)); y = Math.max(1, Math.min(ROWS - 2, y));
        }
        pathSet.add(key(tx, ty));
      };
      const gy = 6 + rand(ROWS - 12);
      trail(6, 5, COLS - 2, gy);
      trail(4, 7, 6 + rand(10), ROWS - 3);
      trail(7, 3, 18 + rand(10), 2 + rand(4));
      for (const k of pathSet) reserved.add(k);
      // a pond somewhere in the middle; where a path crosses it there's a bridge
      const pcx = 14 + rand(14), pcy = 9 + rand(12), prx = 2 + Math.random() * 1.6, pry = 1.5 + Math.random() * 1.2;
      for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
        if (((x - pcx) / prx) ** 2 + ((y - pcy) / pry) ** 2 > 1 || reserved.has(key(x, y)) && !pathSet.has(key(x, y))) continue;
        if (pathSet.has(key(x, y))) F.bridge.push({ x, y }); else { g[y][x] = 2; F.water.push({ x, y }); }
        reserved.add(key(x, y));
      }
      // an abandoned log cabin (walls are tile 1), door on its south side, a table inside
      for (let tries = 0; tries < 60 && !F.cabin; tries++) {
        const cx0 = 3 + rand(COLS - 12), cy0 = 3 + rand(ROWS - 10), w = 6, h = 5;
        let ok = true;
        for (let y = cy0 - 1; y <= cy0 + h && ok; y++) for (let x = cx0 - 1; x <= cx0 + w && ok; x++) if (!inside(x, y) || reserved.has(key(x, y)) || g[y][x] !== 0) ok = false;
        if (!ok) continue;
        const door = cx0 + 2 + rand(2);
        for (let y = cy0; y < cy0 + h; y++) for (let x = cx0; x < cx0 + w; x++) {
          const edge = y === cy0 || y === cy0 + h - 1 || x === cx0 || x === cx0 + w - 1;
          if (edge && !(y === cy0 + h - 1 && x === door)) g[y][x] = 1;
        }
        g[cy0 + 2][cx0 + 2] = 2; // table
        F.cabin = { x0: cx0, y0: cy0, x1: cx0 + w - 1, y1: cy0 + h - 1, door, table: { x: cx0 + 2, y: cy0 + 2 } };
        for (let y = cy0 - 1; y <= cy0 + h; y++) for (let x = cx0 - 1; x <= cx0 + w; x++) reserved.add(key(x, y));
        reserved.add(key(door, cy0 + h)); reserved.add(key(door, cy0 + h + 1));
      }
      // trees and undergrowth: every obstacle has free ground all around it, so the woods never get sealed off
      const clear = (x, y) => { for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) if (g[yy][xx] !== 0) return false; return true; };
      const dense = (x, y) => 0.5 + 0.5 * Math.sin(x * 0.45 + gy) * Math.cos(y * 0.5 + pcx); // groves and thinner patches
      const order = [];
      for (let y = 2; y < ROWS - 2; y++) for (let x = 2; x < COLS - 2; x++) order.push([x, y]);
      shuffleIn(order);
      for (const [x, y] of order) {
        if (reserved.has(key(x, y)) || !clear(x, y)) continue;
        const r = Math.random();
        if (r < 0.34 + 0.4 * dense(x, y)) {
          g[y][x] = 3;
          const k = Math.random();
          F.trees.push({ x, y, kind: k < 0.58 ? 'pine' : k < 0.9 ? 'oak' : 'dead', s: 0.8 + Math.random() * 0.45, ox: (Math.random() - 0.5) * 0.3, oz: (Math.random() - 0.5) * 0.3, rot: Math.random() * 6.28 });
        } else if (r < 0.48 + 0.4 * dense(x, y)) {
          g[y][x] = 2;
          const k = Math.random();
          if (k < 0.55) F.bushes.push({ x, y, s: 0.7 + Math.random() * 0.4 });
          else if (k < 0.85) F.rocks.push({ x, y, s: 0.6 + Math.random() * 0.5, rot: Math.random() * 6.28 });
          else F.logs.push({ x, y, rot: Math.random() * 3.14 });
        }
      }
      g[F.fire.y][F.fire.x] = 2; // the campfire
      const spawns = [];
      const ring = [];
      for (let y = 1; y <= 8; y++) for (let x = 1; x <= 8; x++) if (g[y][x] === 0 && reserved.has(key(x, y))) ring.push([x, y]);
      ring.sort((p, q) => ((p[0] - 4) ** 2 + (p[1] - 4) ** 2) - ((q[0] - 4) ** 2 + (q[1] - 4) ** 2));
      for (const t of ring) if (spawns.length < 12 && (t[0] !== 4 || t[1] !== 4)) spawns.push(t);
      if (spawns.length < 12) continue;
      // anything the paths can't reach (cut off by the pond, say) becomes undergrowth
      const d = S.bfs(spawns[0][0], spawns[0][1], (x, y) => g[y][x] === 0).d;
      for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) if (g[y][x] === 0 && d[I(x, y)] < 0) {
        const inCabin = F.cabin && x > F.cabin.x0 && x < F.cabin.x1 && y > F.cabin.y0 && y < F.cabin.y1;
        if (inCabin) continue; // (checked below)
        g[y][x] = 2; F.bushes.push({ x, y, s: 0.9 });
      }
      if (d[I(COLS - 2, gy)] < 0) continue; // the way out must be reachable
      if (F.cabin && d[I(F.cabin.door, F.cabin.y1)] < 0) continue;
      F.path = [...pathSet].filter(k => !F.bridge.some(b => key(b.x, b.y) === k)).map(k => ({ x: k % COLS, y: (k / COLS) | 0 }));
      return { name: 'forest', grid: g, floors: [{ x0: 0, x1: COLS - 1 }], stairs: [], spawns, yaw: 0, forest: F };
    }
  }
  // A bright open-plan office floor with the lights on, laid out like a real floor plan turned on its side.
  // Windows run along the top and right walls. Along the windows: a closed-off stairwell, a glass-walled meeting
  // room, the staff lounge, a think tank with storage, and an open collaboration lounge. Then the main corridor;
  // the elevator lobby (where you start) and reception, a storage room, a second think tank and the first open-plan
  // desk area; a second corridor; and the technical room, toilets, a second meeting room, the copy room and the
  // second desk area. The way out is the emergency stairwell door in the bottom wall.
  // Grid values as elsewhere: 0 floor, 1 wall, 2 low (blocks walking, not light: desks, sofas, glass walls), 3 tall.
  // Helpers for maps laid out by hand (the office and the mall): an empty floor inside the outer wall, walls with
  // doorways, glass walls with glass doors, furniture (`tall` lists the pieces that also block light), and rooms.
  function floorPlan(tall) {
    const g = [...Array(ROWS)].map((_, y) => Array(COLS).fill(0).map((_, x) => (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) ? 1 : 0));
    const P = { g, items: [], rooms: [], glass: [], doors: [], windows: [] };
    P.fill = (x0, y0, x1, y1, v) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = v; };
    P.hwall = (y, x0, x1, ...gaps) => { P.fill(x0, y, x1, y, 1); for (const x of gaps) { g[y][x] = 0; P.doors.push({ x, y }); } };
    P.vwall = (x, y0, y1, ...gaps) => { P.fill(x, y0, x, y1, 1); for (const y of gaps) { g[y][x] = 0; P.doors.push({ x, y }); } };
    P.glassH = (y, x0, x1, ...gaps) => {
      for (let x = x0; x <= x1; x++) if (gaps.includes(x)) { g[y][x] = 0; P.doors.push({ x, y, glass: true }); } else { g[y][x] = 2; P.glass.push({ x, y }); }
    };
    P.put = (type, x, y, w = 1, h = 1, extra = {}) => { P.fill(x, y, x + w - 1, y + h - 1, tall.has(type) ? 3 : 2); P.items.push({ type, x, y, w, h, ...extra }); };
    P.room = (type, x0, y0, x1, y1, extra = {}) => P.rooms.push({ type, x0, y0, x1, y1, ...extra });
    // every floor tile must be reachable from the spawn
    P.check = (name, spawns) => {
      const d = S.bfs(spawns[0][0], spawns[0][1], (x, y) => g[y][x] === 0).d;
      for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++)
        if (g[y][x] === 0 && d[I(x, y)] < 0) throw new Error(`${name} layout: tile ${x},${y} can't be reached`);
    };
    return P;
  }

  const OFFICE_TALL = new Set(['fridge', 'locker', 'shelf', 'rack', 'copier', 'elevator']);
  function genOffice() {
    const { g, items, rooms, glass, doors, windows, fill, hwall, vwall, glassH, put, room, check } = floorPlan(OFFICE_TALL);
    const YELLOW = '#f0c419', GREY = '#8a8f99', BLUE = '#2f6fb3';

    for (let x = 1; x < COLS - 1; x++) windows.push({ x, y: 0 });
    for (let y = 1; y < ROWS - 1; y++) windows.push({ x: COLS - 1, y });

    // ---- along the windows (rows 1-8)
    fill(1, 1, 5, 8, 1); items.push({ type: 'stairwell', x: 1, y: 1, w: 5, h: 8 }); // stairwell A, closed off
    vwall(6, 1, 8);
    room('meeting', 7, 1, 14, 8); put('table', 9, 3, 4, 4); put('plant', 7, 1); put('plant', 14, 8);
    vwall(15, 1, 8);
    room('lounge', 16, 1, 22, 8);
    put('counter', 16, 1, 1, 2); put('fridge', 16, 3); put('longtable', 18, 3, 4, 3); put('sofa', 18, 7, 3, 1, { color: YELLOW, face: -1 }); put('plant', 22, 1);
    vwall(23, 1, 8);
    room('think', 24, 1, 27, 4); put('table', 25, 2, 2, 1);
    hwall(5, 24, 27, 25);
    room('storage', 24, 6, 27, 8); put('shelf', 27, 6, 1, 3);
    vwall(28, 1, 8);
    room('collab', 29, 1, 39, 9); // open onto the corridor
    put('locker', 29, 1, 1, 3);
    put('sofa', 32, 3, 2, 1, { color: YELLOW, face: -1 }); put('coffee', 32, 4, 2, 1); put('sofa', 32, 5, 2, 1, { color: YELLOW, face: 1 });
    put('coffee', 36, 4, 1, 1, { round: true });
    put('armchair', 36, 3, 1, 1, { color: YELLOW, face: -1 }); put('armchair', 36, 5, 1, 1, { color: GREY, face: 1 });
    put('armchair', 35, 4, 1, 1, { color: GREY, face: 0 }); put('armchair', 37, 4, 1, 1, { color: YELLOW, face: 2 });
    put('bartable', 37, 1, 2, 1); put('armchair', 39, 7, 1, 1, { color: BLUE, face: 2 });
    put('cabinet', 30, 7, 2, 1); put('plant', 39, 1);
    items.push({ type: 'pendant', x: 33, y: 4 }, { type: 'pendant', x: 36.5, y: 4.5 }); // big dome lamps (decoration only)

    // ---- the main corridor (rows 10-11); the meeting room has a glass front with a glass door
    hwall(9, 1, 6); glassH(9, 7, 14, 10); hwall(9, 15, 28, 17, 21, 26);
    room('corridor', 1, 10, 39, 11);

    // ---- the middle (rows 12-18)
    room('lobby', 1, 12, 5, 18); put('elevator', 1, 13, 1, 2); put('elevator', 1, 16, 1, 2);
    room('reception', 6, 12, 11, 18); put('reception', 8, 14, 2, 2); put('plant', 11, 12); put('plant', 6, 18);
    hwall(12, 12, 24, 15, 21); hwall(18, 12, 24, 14, 22); vwall(12, 12, 18); vwall(18, 12, 18); vwall(24, 12, 18);
    room('storage', 13, 13, 17, 17); put('shelf', 13, 13, 1, 3); put('shelf', 17, 15, 1, 3);
    room('think', 19, 13, 23, 17); put('table', 20, 15, 2, 1); put('sofa', 23, 13, 1, 2, { color: BLUE, face: 2 });
    room('open', 25, 12, 39, 18);
    for (const [x, y] of [[26, 13], [32, 13], [26, 16], [32, 16]]) put('pod', x, y, 4, 2);
    put('cabinet', 37, 13, 2, 1); put('cabinet', 37, 17, 2, 1);

    // ---- the second corridor (rows 19-20)
    room('corridor', 1, 19, 39, 20);

    // ---- the inner side (rows 22-29)
    hwall(21, 1, 14, 3, 7, 12); glassH(21, 15, 21, 18); hwall(21, 22, 28, 25);
    vwall(5, 21, 29); vwall(10, 21, 29); vwall(14, 21, 29); vwall(22, 21, 29); vwall(28, 21, 29);
    room('tech', 1, 22, 4, 29); put('rack', 2, 23, 1, 5);
    room('wc', 6, 22, 9, 29); put('toilet', 6, 29); put('partition', 7, 28, 1, 2); put('toilet', 8, 29); put('sink', 9, 23, 1, 2);
    room('wc', 11, 22, 13, 29); put('toilet', 11, 29); put('partition', 12, 28, 1, 2); put('toilet', 13, 29); put('sink', 13, 23, 1, 2);
    room('meeting', 15, 22, 21, 29); put('table', 16, 24, 5, 3); put('plant', 15, 29); put('plant', 21, 22);
    room('copy', 23, 22, 27, 29); put('copier', 23, 22); put('locker', 24, 29, 4, 1); put('cabinet', 25, 25, 2, 1);
    room('open', 29, 21, 39, 29);
    for (const [x, y] of [[30, 23], [35, 23], [30, 26], [35, 26]]) put('pod', x, y, 4, 2);
    put('plant', 29, 29); put('plant', 39, 21);

    const spawns = [];
    for (let y = 13; y <= 15; y++) for (let x = 2; x <= 5; x++) spawns.push([x, y]); // the elevator lobby
    check('office', spawns);
    return { name: 'office', grid: g, floors: [{ x0: 0, x1: COLS - 1 }], stairs: [], spawns, yaw: 0, bright: true,
      office: { items, rooms, glass, doors, windows } };
  }

  // A bright shopping mall. A wide promenade runs down the middle from the glass entrance doors in the west wall,
  // with a fountain, benches, planters, kiosk carts and an escalator (closed). Shops with glass fronts line both
  // sides; some have back doors onto the staff service corridors behind them, which make loops for running away.
  // The food court fills the south-east corner, and the toilets are off a staff passage near the east end.
  const MALL_TALL = new Set(['rack', 'fitting', 'shoeshelf', 'toyshelf', 'teddy', 'tvwall', 'bookshelf', 'sportshelf', 'pharmshelf',
    'stall', 'escalator', 'directory']);
  // the shops: where they are (x0..x1 wide; the north row is rows 4-10, the south row 20-26), what they sell, the
  // name on the sign, its color, and the column of their back door (if any)
  const MALL_SHOPS = [
    { x0: 1, x1: 6, row: 'n', theme: 'fashion', name: 'Bloom', color: '#d96ba0', back: 3 },
    { x0: 8, x1: 13, row: 'n', theme: 'shoes', name: 'Stride', color: '#e08a3a' },
    { x0: 15, x1: 20, row: 'n', theme: 'toys', name: 'Toy Town', color: '#3d9be0', back: 17 },
    { x0: 22, x1: 27, row: 'n', theme: 'tech', name: 'Voltz', color: '#5b6bd6' },
    { x0: 29, x1: 34, row: 'n', theme: 'books', name: 'Pages', color: '#8a6a4a', back: 31 },
    { x0: 1, x1: 6, row: 's', theme: 'cafe', name: 'Bean There', color: '#7a5230', back: 4 },
    { x0: 8, x1: 13, row: 's', theme: 'sports', name: 'Pro Sport', color: '#2f9e6a' },
    { x0: 15, x1: 20, row: 's', theme: 'pharmacy', name: 'Pharmacy', color: '#25a39a', back: 18 },
    { x0: 22, x1: 26, row: 's', theme: 'jewelry', name: 'Gem', color: '#b8912e', back: 22 },
  ];
  function genMall() {
    const { g, items, rooms, glass, doors, windows, fill, hwall, vwall, glassH, put, room, check } = floorPlan(MALL_TALL);
    for (let y = 12; y <= 18; y++) windows.push({ x: 0, y }); // the glass entrance doors

    // ---- staff service corridors behind the shops, and the walls between them and the shops
    room('service', 1, 1, 39, 2);
    room('service', 1, 28, 26, 29);
    hwall(3, 1, 39, ...MALL_SHOPS.filter(s => s.row === 'n' && s.back).map(s => s.back), 36);
    hwall(27, 1, 26, ...MALL_SHOPS.filter(s => s.row === 's' && s.back).map(s => s.back));

    // ---- the shops: side walls, a glass shopfront with a 2-wide doorway, and stock
    for (const s of MALL_SHOPS) {
      const north = s.row === 'n', y0 = north ? 4 : 20, y1 = north ? 10 : 26, front = north ? 11 : 19, door = s.x0 + 2;
      vwall(s.x1 + 1, north ? 3 : 19, north ? 11 : 27);
      glassH(front, s.x0, s.x1, door, door + 1);
      room('shop', s.x0, y0, s.x1, y1, { theme: s.theme, name: s.name, color: s.color, front, door, north });
    }
    // north row: the shopfront is at the bottom (row 11), the back wall at the top (row 3)
    put('rack', 1, 5, 1, 4, { face: 1 }); put('rack', 6, 6, 1, 3, { face: -1 }); put('fitting', 5, 4, 2, 1); // Bloom (fashion)
    put('table', 3, 6, 2, 1, { kind: 'clothes' }); put('mannequin', 2, 8); put('mannequin', 5, 8); put('counter', 1, 10, 1, 1);
    put('shoeshelf', 8, 4, 1, 5, { face: 1 }); put('shoeshelf', 13, 4, 1, 5, { face: -1 }); // Stride (shoes)
    put('bench', 10, 6, 2, 1); put('counter', 10, 4, 2, 1); put('mirror', 12, 9);
    put('toyshelf', 15, 4, 1, 4, { face: 1 }); put('toyshelf', 20, 4, 1, 4, { face: -1 }); // Toy Town
    put('teddy', 19, 9); put('table', 16, 7, 2, 1, { kind: 'toys' }); put('counter', 15, 9, 1, 1);
    put('tvwall', 22, 4, 1, 5, { face: 1 }); put('table', 24, 5, 2, 1, { kind: 'tech' }); put('table', 24, 8, 2, 1, { kind: 'tech' }); // Voltz
    put('counter', 27, 4, 1, 2);
    put('bookshelf', 29, 4, 1, 5, { face: 1 }); put('bookshelf', 34, 4, 1, 5, { face: -1 }); put('bookshelf', 31, 6, 2, 2, { face: 0 }); // Pages
    put('armchair', 30, 9, 1, 1, { color: '#c0653c', face: 0 }); put('armchair', 33, 9, 1, 1, { color: '#4f86c6', face: 2 });
    // south row: the shopfront is at the top (row 19), the back wall at the bottom (row 27)
    put('cafecounter', 1, 26, 2, 1); put('bistro', 2, 22); put('bistro', 5, 22); put('bistro', 5, 25); put('plant', 1, 20); // Bean There
    put('sportshelf', 8, 20, 1, 5, { face: 1 }); put('bike', 12, 21, 2, 1); put('treadmill', 10, 24, 2, 1); put('ballbin', 13, 25); // Pro Sport
    put('pharmshelf', 15, 21, 1, 5, { face: 1 }); put('pharmshelf', 20, 23, 1, 3, { face: -1 }); put('counter', 19, 20, 2, 1); // Pharmacy
    put('case', 22, 21, 1, 3); put('case', 26, 21, 1, 3); put('case', 24, 25, 3, 1); // Gem (jewelry)

    // ---- the promenade
    room('promenade', 1, 12, 39, 18);
    put('fountain', 19, 14, 3, 3); put('bench', 16, 14, 1, 3); put('bench', 24, 14, 1, 3);
    for (const [x, y] of [[7, 12], [7, 18], [28, 12], [28, 18], [13, 12], [13, 18]]) put('planter', x, y);
    put('kiosk', 11, 15, 2, 1, { name: 'Pretzels', color: '#e8a33d' }); put('kiosk', 27, 15, 2, 1, { name: 'Phone cases', color: '#7d5bd6' });
    put('escalator', 33, 14, 2, 3); put('directory', 6, 15);

    // ---- the staff passage to the toilets (between the bookshop and the east wall)
    vwall(37, 4, 10, 5, 9); hwall(11, 36, 39, 36); hwall(7, 38, 39);
    room('passage', 36, 4, 36, 10);
    room('wc', 38, 4, 39, 6); put('toilet', 39, 4); put('sink', 38, 6);
    room('wc', 38, 8, 39, 10); put('toilet', 39, 10); put('sink', 38, 8);

    // ---- the food court: stalls along the walls, tables in the middle; a staff door to the service corridor
    vwall(27, 19, 29, 28);
    room('food', 28, 19, 39, 29);
    put('stall', 29, 28, 3, 2, { name: 'PIZZA', color: '#e0583a' }); put('stall', 33, 28, 3, 2, { name: 'BURGERS', color: '#f2a93b' });
    put('stall', 37, 28, 3, 2, { name: 'SUSHI', color: '#3aa776' }); put('stall', 39, 21, 1, 3, { name: 'ICE CREAM', color: '#f07cb0', side: 'e' });
    for (const x of [30, 33, 36]) for (const y of [21, 24]) put('dtable', x, y);
    put('planter', 39, 19);

    const spawns = [];
    for (let y = 13; y <= 15; y++) for (let x = 2; x <= 5; x++) spawns.push([x, y]); // just inside the entrance
    check('mall', spawns);
    return { name: 'mall', grid: g, floors: [{ x0: 0, x1: COLS - 1 }], stairs: [], spawns, yaw: 0, bright: true,
      mall: { items, rooms, glass, doors, windows } };
  }

  // ---------------------------------------------------------------- two real floors, one above the other
  // A map with an upper floor (the library) has a second grid, `upper`, for the floor above. Its value 4 is a hole
  // in the floor (the open atrium, stairwells): you can't walk there, but you can see across it and down through it.
  // `ramps` are staircases you actually walk up: { x0, y0, x1, y1, dir } where dir is the way you climb
  // ('n' = toward the top of the map). Their tiles are open on both grids; everything beside a staircase is blocked
  // on both floors, so the only ways on and off are its two ends: the bottom onto the ground floor, the top onto the
  // floor above. Every player has a floor, `fl` (0 or 1): past halfway up a staircase you're upstairs.
  // how far up a staircase a map-space point is (0 at the bottom edge, 1 at the top), or null if it isn't on one
  S.rampAt = function (ramps, px, py) {
    if (!ramps) return null;
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    for (const r of ramps) {
      if (tx < r.x0 || tx > r.x1 || ty < r.y0 || ty > r.y1) continue;
      const k = r.dir === 'n' ? ((r.y1 + 1) * TILE - py) / ((r.y1 - r.y0 + 1) * TILE) : r.dir === 's' ? (py - r.y0 * TILE) / ((r.y1 - r.y0 + 1) * TILE)
        : r.dir === 'e' ? (px - r.x0 * TILE) / ((r.x1 - r.x0 + 1) * TILE) : ((r.x1 + 1) * TILE - px) / ((r.x1 - r.x0 + 1) * TILE);
      return { r, h: Math.max(0, Math.min(1, k)) };
    }
    return null;
  };
  // which floor you're on after moving to (px, py), if you were on floor `fl`
  S.nextFloor = (L, px, py, fl) => { const a = L.upper && S.rampAt(L.ramps, px, py); return a ? (a.h >= 0.5 ? 1 : 0) : fl || 0; };
  // how high up you are, in floors: your floor, or part way up a staircase
  S.elev = (L, o) => { if (!L.upper) return 0; const a = S.rampAt(L.ramps, o.x, o.y); return a ? a.h : o.fl || 0; };
  // what to collide with (and what blocks light) on a floor: the ground floor is the map itself, the upper floor its `upper` grid
  S.world = (L, fl) => fl && L.upper ? (L._up || (L._up = { grid: L.upper })) : L;
  // can you see between the floors here? Only where the floor above is open: over the atrium and the staircases
  S.openAbove = (L, px, py) => {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    return !!L.upper && tx >= 0 && ty >= 0 && tx < COLS && ty < ROWS && (L.upper[ty][tx] === 4 || !!S.rampAt(L.ramps, px, py));
  };
  // distances (in steps) from a tile to every tile on every floor: index fl * COLS * ROWS + tile.
  // Uses the staircases (and the apartment's stairs).
  S.reach = function (L, sx, sy, sf = 0) { // (sf: the floor to start on)
    const N = COLS * ROWS, grids = L.upper ? [L.grid, L.upper] : [L.grid], ramp = new Uint8Array(N);
    for (const r of L.ramps || []) for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) ramp[I(x, y)] = 1;
    const links = S.stairLinks(L.stairs || []);
    const d = new Int16Array(N * grids.length).fill(-1), q = new Int32Array(N * grids.length); let h = 0, t = 0;
    d[sf * N + I(sx, sy)] = 0; q[t++] = sf * N + I(sx, sy);
    const visit = (ni, c) => { if (d[ni] === -1) { d[ni] = d[c] + 1; q[t++] = ni; } };
    while (h < t) {
      const c = q[h++], f = c >= N ? 1 : 0, i = c - f * N, x = i % COLS, y = (i / COLS) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < COLS && ny < ROWS && grids[f][ny][nx] === 0) visit(f * N + I(nx, ny), c);
      }
      if (ramp[i] && grids.length > 1) visit((1 - f) * N + i, c);
      const l = links.get(i);
      if (l) for (const ni of l) if (grids[f][(ni / COLS) | 0][ni % COLS] === 0) visit(f * N + ni, c);
    }
    return { d, N, grids, ramp };
  };

  // A big bright library on two floors, joined by three staircases you walk up: a grand one in the middle of the
  // atrium and one at each end of the building. The atrium goes up through both floors under a glass roof; upstairs,
  // a gallery with a railing runs all the way around it, so you can look down into it (and be seen from it).
  // Ground floor: the entrance lobby with the front desk, the atrium with reading tables, a reading room with a
  // fireplace, the fiction stacks (west), newspapers, computers and more stacks (east), a children's corner and a café.
  // Upstairs: the gallery, a study hall with carrels, the history stacks, the rare-books archive, a computer lab,
  // an exhibition with a dinosaur, and group-study tables.
  const LIB_TALL = new Set(['shelf', 'fireplace', 'dino']);
  function genLibrary() {
    const A = floorPlan(LIB_TALL), B = floorPlan(LIB_TALL); // A: the ground floor, B: upstairs
    const windows = [];
    // tall windows all round, two in every three tiles (with a stretch of wall between each pair)
    for (let x = 2; x < COLS - 2; x++) if (x % 3) windows.push({ x, y: 0 });
    for (let y = 2; y < ROWS - 2; y++) if (y % 3) windows.push({ x: 0, y }, { x: COLS - 1, y });
    for (let x = 2; x < COLS - 2; x++) if (x % 3 && (x < 17 || x > 23)) windows.push({ x, y: ROWS - 1 });
    const entrance = [19, 20, 21]; // glass doors in the bottom wall

    // the same walls on both floors (the upper walls stand on the lower ones), with doorways in the same places
    for (const P of [A, B]) {
      P.vwall(12, 1, 29, 4, 13, 14, 20, 26, 27); P.vwall(28, 1, 29, 4, 13, 14, 20, 26, 27);
      P.hwall(10, 13, 27, 14, 15, 25, 26);
      P.hwall(23, 1, 11, 5, 6); P.hwall(23, 29, 39, 34, 35);
    }
    A.hwall(23, 13, 27, 17, 18, 19, 20, 21, 22, 23); // a wide opening from the lobby into the atrium
    B.hwall(23, 13, 27, 19, 20, 21); // upstairs: the gallery to the exhibition

    // the staircases: the grand one up the middle of the atrium, and one by each end wall (all climb toward the top of the map)
    const ramps = [{ x0: 19, y0: 13, x1: 21, y1: 18, dir: 'n', grand: true }, { x0: 1, y0: 15, x1: 2, y1: 20, dir: 'n' }, { x0: 38, y0: 15, x1: 39, y1: 20, dir: 'n' }];
    // upstairs: the open atrium, and the holes the staircases come up through
    B.fill(15, 13, 25, 20, 4);
    B.fill(3, 15, 3, 20, 4); B.fill(1, 21, 2, 21, 4);
    B.fill(37, 15, 37, 20, 4); B.fill(38, 21, 39, 21, 4);
    for (const r of ramps) B.fill(r.x0, r.y0, r.x1, r.y1, 0);
    // downstairs: low bookcases along the sides of each staircase, and something solid under the top of each one
    A.put('lowshelf', 18, 13, 1, 6, { face: -1 }); A.put('lowshelf', 22, 13, 1, 6, { face: 1 }); A.put('display', 18, 12, 5, 1);
    A.put('lowshelf', 3, 15, 1, 6, { face: 1 }); A.put('shelf', 1, 14, 2, 1);
    A.put('lowshelf', 37, 15, 1, 6, { face: -1 }); A.put('shelf', 38, 14, 2, 1);

    // ================= ground floor
    // the reading room (top middle): a fireplace, armchairs and long tables
    A.room('reading', 13, 1, 27, 9);
    A.put('fireplace', 19, 1, 3, 1); A.put('armchair', 18, 3, 1, 1, { color: '#8a3b34', face: 0 }); A.put('armchair', 22, 3, 1, 1, { color: '#8a3b34', face: 2 });
    A.put('readtable', 14, 5, 4, 2); A.put('readtable', 23, 5, 4, 2); A.put('readtable', 14, 8, 4, 1); A.put('readtable', 23, 8, 4, 1);
    A.put('plant', 13, 1); A.put('plant', 27, 1);
    // the atrium: reading tables either side of the grand staircase
    A.room('atrium', 13, 11, 27, 22);
    for (const [x, y] of [[14, 15], [24, 15], [14, 19], [24, 19]]) A.put('readtable', x, y, 3, 2);
    // the fiction stacks (left wing)
    A.room('stacks', 1, 1, 11, 22, { label: 'FICTION' });
    for (const y of [3, 6, 9, 12]) A.put('shelf', 4, y, 7, 1);
    for (const y of [16, 19]) A.put('shelf', 5, y, 6, 1);
    // newspapers, computers and more stacks (right wing)
    A.room('media', 29, 1, 39, 13);
    A.put('magrack', 30, 1, 3, 1); A.put('magrack', 35, 1, 3, 1);
    A.put('pcdesk', 30, 4, 6, 1); A.put('pcdesk', 30, 7, 6, 1);
    A.put('armchair', 30, 11, 1, 1, { color: '#3f6f8f', face: 0 }); A.put('lowtable', 31, 11, 2, 1); A.put('armchair', 33, 11, 1, 1, { color: '#3f6f8f', face: 2 });
    A.put('plant', 39, 11);
    A.room('stacks', 29, 14, 39, 22, { label: 'SCIENCE' });
    for (const y of [16, 19]) A.put('shelf', 30, y, 6, 1);
    // the lobby, just inside the entrance: the front desk, a bench, a book-return box
    A.room('lobby', 13, 24, 27, 29);
    A.put('desk', 23, 25, 4, 2); A.put('bench', 14, 25, 1, 2); A.put('returnbox', 26, 28); A.put('plant', 13, 29); A.put('plant', 27, 24);
    // the children's corner (bottom left)
    A.room('kids', 1, 24, 11, 29);
    A.put('kidshelf', 1, 24, 1, 4); A.put('kidtable', 4, 25, 2, 1); A.put('castle', 8, 24, 2, 2);
    A.put('beanbag', 3, 28, 1, 1, { color: '#e85d5d' }); A.put('beanbag', 6, 28, 1, 1, { color: '#4aa3df' }); A.put('beanbag', 9, 28, 1, 1, { color: '#f2b43b' });
    // the café (bottom right)
    A.room('cafe', 29, 24, 39, 29);
    A.put('cafecounter', 36, 24, 4, 1);
    for (const [x, y] of [[31, 26], [34, 26], [31, 28], [34, 28], [37, 27]]) A.put('bistro', x, y);

    // ================= upstairs
    B.room('gallery', 13, 11, 27, 22);
    // the study hall (top middle): rows of study carrels, a globe, a long table
    B.room('study', 13, 1, 27, 9);
    B.put('carrel', 14, 2, 5, 1); B.put('carrel', 22, 2, 5, 1); B.put('carrel', 14, 5, 5, 1); B.put('carrel', 22, 5, 5, 1);
    B.put('globe', 20, 4); B.put('readtable', 17, 7, 7, 1);
    // the history stacks (left wing)
    B.room('stacks', 1, 1, 11, 22, { label: 'HISTORY' });
    for (const y of [3, 6, 9, 12]) B.put('shelf', 4, y, 7, 1);
    for (const y of [16, 19]) B.put('shelf', 5, y, 6, 1);
    // the rare-books archive (right wing): tall cases, glass display cases, a map table
    B.room('archive', 29, 1, 39, 22, { label: 'RARE BOOKS' });
    for (const x of [30, 33, 36]) B.put('shelf', x, 2, 1, 5);
    B.put('case', 31, 9, 2, 1); B.put('case', 35, 9, 2, 1); B.put('maptable', 32, 11, 3, 1);
    for (const y of [17, 20]) B.put('shelf', 30, y, 6, 1);
    // the computer lab (bottom left)
    B.room('lab', 1, 24, 11, 29);
    B.put('pcdesk', 2, 25, 8, 1); B.put('pcdesk', 2, 28, 8, 1);
    // the exhibition (bottom middle): a clay dinosaur and display cases
    B.room('exhibit', 13, 24, 27, 29);
    B.put('dino', 18, 26, 5, 2); B.put('case', 14, 25, 1, 2); B.put('case', 26, 25, 1, 2); B.put('case', 14, 28, 2, 1); B.put('case', 25, 28, 2, 1);
    // group study (bottom right)
    B.room('group', 29, 24, 39, 29);
    B.put('roundtable', 31, 26, 2, 2); B.put('roundtable', 36, 26, 2, 2); B.put('plant', 39, 24); B.put('plant', 29, 29);

    const spawns = [];
    for (let y = 26; y <= 27; y++) for (let x = 16; x <= 21; x++) spawns.push([x, y]); // just inside the entrance
    const L = { name: 'library', grid: A.g, upper: B.g, ramps, floors: [{ x0: 0, x1: COLS - 1 }], stairs: [], spawns, yaw: -Math.PI / 2, bright: true };
    // every open tile on both floors must be reachable from the entrance
    const { d, N } = S.reach(L, spawns[0][0], spawns[0][1]);
    [A.g, B.g].forEach((g, f) => { for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) if (g[y][x] === 0 && d[f * N + I(x, y)] < 0) throw new Error(`library layout: tile ${x},${y} on floor ${f} can't be reached`); });
    const tag = (list, fl) => list.map(o => ({ ...o, fl }));
    L.library = { items: [...tag(A.items, 0), ...tag(B.items, 1)], rooms: [...tag(A.rooms, 0), ...tag(B.rooms, 1)], doors: [...tag(A.doors, 0), ...tag(B.doors, 1)], windows, entrance, storyH: 1.7 };
    return L;
  }

  // The fight arena: the dark neon stage. A big fighting area filling most of the room with a low barrier all round it (fighters can't
  // get out, spectators can't get in); everyone not fighting walks round the outside and watches.
  function genArena() {
    const g = [...Array(ROWS)].map((_, y) => Array(COLS).fill(0).map((_, x) => (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) ? 1 : 0));
    const ring = { x0: 5, y0: 4, x1: 35, y1: 26 }; // (31 x 23 tiles; the stands are the strip round the outside)
    const inRing = (x, y) => x >= ring.x0 && x <= ring.x1 && y >= ring.y0 && y <= ring.y1 && // (with the corners cut off)
      Math.min(x - ring.x0, ring.x1 - x) + Math.min(y - ring.y0, ring.y1 - y) >= 2;
    for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
      if (inRing(x, y)) continue;
      let near = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inRing(x + dx, y + dy)) near = true;
      if (near) g[y][x] = 2; // the railing
    }
    const benches = []; // (none: it's a plain room)
    const spawns = [];
    for (let x = 8; x <= 32 && spawns.length < 12; x += 4) spawns.push([x, 2]), spawns.push([x, 28]);
    const fighters = [[15, 15], [25, 15]];
    // the stands must all join up, and so must the ring
    for (const [sx, sy, test] of [[spawns[0][0], spawns[0][1], (x, y) => !inRing(x, y)], [fighters[0][0], fighters[0][1], inRing]]) {
      const d = S.bfs(sx, sy, (x, y) => g[y][x] === 0).d;
      for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++)
        if (g[y][x] === 0 && test(x, y) && d[I(x, y)] < 0) throw new Error(`arena layout: tile ${x},${y} can't be reached`);
    }
    return { name: 'arena', grid: g, floors: [{ x0: 0, x1: COLS - 1 }], stairs: [], spawns, yaw: Math.PI / 2, bright: true,
      arena: { ring, benches, fighters } };
  }

  function shuffleIn(a) { for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // Furniture goes only along the back wall and the hallway-side wall of a room, never in front of the
  // front door, so the middle two columns always stay free and nothing gets cut off.
  const FABRICS = ['#7a5c8a', '#4f6f8f', '#8a5a4a', '#5f7f5a', '#8a7a4a'];
  function furnish(g, furniture, rooms, room, frontX, backX, face, doorRow) {
    rooms.push(room);
    const free = (x, y) => y >= room.y0 && y <= room.y1 && g[y][x] === 0 && !(x === frontX && y === doorRow);
    const put = (type, x, y, len, tall, f) => {
      for (let i = 0; i < len; i++) if (!free(x, y + i)) return false;
      for (let i = 0; i < len; i++) g[y + i][x] = tall ? 3 : 2;
      furniture.push({ type, x, y, len, face: f, color: FABRICS[rand(FABRICS.length)] });
      return true;
    };
    // try to place a piece somewhere along a wall column, starting from a random row
    const along = (type, x, len, tall, f) => {
      const n = room.y1 - room.y0 + 1, s = rand(n);
      for (let i = 0; i < n; i++) if (put(type, x, room.y0 + (s + i) % n, len, tall, f)) return true;
      return false;
    };
    const back = (type, len, tall) => along(type, backX, len, tall, face);
    const front = (type, len, tall) => along(type, frontX, len, tall, -face);
    const t = room.type;
    if (t === 'living') { back('sofa', 2) || back('sofa', 1); front('tv', 1); front('counter', 2) || front('counter', 1); front('fridge', 1, true); back('plant', 1); }
    else if (t === 'bed') { back('bed', 2); back('nightstand', 1); front('wardrobe', 1, true); }
    else if (t === 'bath') { back('bathtub', 2) || back('toilet', 1); front('sink', 1); front('toilet', 1); }
    else { back('bed', 2); back('plant', 1); front('counter', 1); front('fridge', 1, true); front('tv', 1); } // studio
  }

  // A building: the floor is split into rooms and hallways joined by doorways, with furniture for cover.
  S.genMap = function () {
    for (;;) {
      const g = buildFloor();
      const d = S.bfs(2, 2, (x, y) => g[y][x] === 0).d;
      let ok = true;
      for (let y = 1; y < ROWS - 1 && ok; y++) for (let x = 1; x < COLS - 1; x++) if (g[y][x] === 0 && d[I(x, y)] < 0) { ok = false; break; }
      if (ok) return g;
    }
  };

  function buildFloor() {
    const g = [...Array(ROWS)].map((_, y) => Array(COLS).fill(0).map((_, x) => (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) ? 1 : 0));
    const rooms = [];

    // wall line from (x,y) along the axis, with one or two doorways (sometimes double width)
    function wall(vert, at, from, to) {
      for (let i = from; i <= to; i++) if (vert) g[i][at] = 1; else g[at][i] = 1;
      const len = to - from + 1, doors = 1 + (len >= 12 ? 1 : 0) + (len >= 22 && Math.random() < 0.5 ? 1 : 0);
      for (let k = 0; k < doors; k++) {
        const seg = Math.floor(len / doors), i = from + k * seg + rand(Math.max(1, seg - 1));
        const wide = Math.random() < 0.35 && i + 1 <= to;
        for (const j of wide ? [i, i + 1] : [i]) if (vert) g[j][at] = 0; else g[at][j] = 0;
      }
    }
    // a wall may only end against solid wall, never in front of an existing doorway
    const fitsV = (wx, y0, y1) => g[y0 - 1][wx] === 1 && g[y1 + 1][wx] === 1;
    const fitsH = (wy, x0, x1) => g[wy][x0 - 1] === 1 && g[wy][x1 + 1] === 1;

    function split(x0, y0, x1, y1) {
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      const canV = w >= 7, canH = h >= 7;
      if ((!canV && !canH) || (w * h <= 64 && Math.random() < 0.4)) { rooms.push({ x0, y0, x1, y1 }); return; }
      const vert = canV && (!canH || (w === h ? Math.random() < 0.5 : w > h));
      const lo = vert ? x0 : y0, hi = vert ? x1 : y1, fits = vert ? (a => fitsV(a, y0, y1)) : (a => fitsH(a, x0, x1));
      // long spans sometimes get a 2-wide hallway between two walls
      if ((hi - lo + 1) >= 15 && Math.random() < 0.45) {
        const opts = [];
        for (let a = lo + 3; a <= hi - 6; a++) if (fits(a) && fits(a + 3)) opts.push(a);
        if (opts.length) {
          const a = opts[rand(opts.length)];
          if (vert) { wall(true, a, y0, y1); wall(true, a + 3, y0, y1); split(x0, y0, a - 1, y1); split(a + 4, y0, x1, y1); }
          else { wall(false, a, x0, x1); wall(false, a + 3, x0, x1); split(x0, y0, x1, a - 1); split(x0, a + 4, x1, y1); }
          return;
        }
      }
      const opts = [];
      for (let a = lo + 3; a <= hi - 3; a++) if (fits(a)) opts.push(a);
      if (!opts.length) { rooms.push({ x0, y0, x1, y1 }); return; }
      const a = opts[rand(opts.length)];
      if (vert) { wall(true, a, y0, y1); split(x0, y0, a - 1, y1); split(a + 1, y0, x1, y1); }
      else { wall(false, a, x0, x1); split(x0, y0, x1, a - 1); split(x0, a + 1, x1, y1); }
    }
    split(1, 1, COLS - 2, ROWS - 2);

    // extra doorways so there are loops (so runners can circle around a tagger)
    for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
      if (g[y][x] !== 1 || Math.random() > 0.05) continue;
      const h = g[y][x - 1] === 0 && g[y][x + 1] === 0, v = g[y - 1][x] === 0 && g[y + 1][x] === 0;
      if (h !== v) g[y][x] = 0;
    }
    for (let y = 1; y <= 3; y++) for (let x = 1; x <= 4; x++) g[y][x] = 0; // spawn area

    // furniture: blocks inside bigger rooms, always with a free tile all around so nothing gets cut off
    for (const r of rooms) {
      const w = r.x1 - r.x0 + 1, h = r.y1 - r.y0 + 1;
      if (w < 5 || h < 5) continue;
      for (let n = Math.floor(w * h / 18), tries = 0; n > 0 && tries < 40; tries++) {
        const bw = 1 + rand(2), bh = 1 + rand(2);
        const bx = r.x0 + 1 + rand(w - 1 - bw), by = r.y0 + 1 + rand(h - 1 - bh);
        if (bx + bw > r.x1 || by + bh > r.y1 || (bx <= 5 && by <= 4)) continue;
        let free = true;
        for (let y = by - 1; y <= by + bh && free; y++) for (let x = bx - 1; x <= bx + bw; x++) if (g[y][x] !== 0) { free = false; break; }
        if (!free) continue;
        for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) g[y][x] = 1;
        n--;
      }
    }
    return g;
  }

  // `w` is any object with { grid }
  S.solid = function (w, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return true;
    return w.grid[ty][tx] !== 0; // walls and furniture
  };
  // what your headlight can't shine through: walls and tall furniture (not beds, sofas, tables...)
  S.blocksLight = function (w, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return true;
    const v = w.grid[ty][tx];
    return v === 1 || v === 3;
  };
  // how high up a staircase a map-space point is: 0 on the floor, up to 1 at the top of an up flight, down to -1 going down
  S.stairHeight = function (flights, px, py) {
    if (!flights) return 0;
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    for (const f of flights) {
      if (f.x !== tx || ty < f.y0 || ty > f.y1) continue;
      const k = f.dir < 0 ? ((f.y1 + 1) * TILE - py) / (FLIGHT * TILE) : (py - f.y0 * TILE) / (FLIGHT * TILE);
      return (f.up ? 1 : -1) * Math.max(0, Math.min(1, k));
    }
    return 0;
  };
  S.collides = function (w, x, y, r) {
    const x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE);
    const y0 = Math.floor((y - r) / TILE), y1 = Math.floor((y + r) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (!S.solid(w, tx, ty)) continue;
      const cx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE));
      const cy = Math.max(ty * TILE, Math.min(y, ty * TILE + TILE));
      if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true;
    }
    return false;
  };
  // slides toward the tile center when pushing into a wall, so turning into corridors feels easy
  function nudge(w, o, axis, amt, r) {
    const c = (Math.floor(o[axis] / TILE) + 0.5) * TILE, diff = c - o[axis];
    const n = Math.sign(diff) * Math.min(Math.abs(diff), amt);
    const nx = axis === 'x' ? o.x + n : o.x, ny = axis === 'y' ? o.y + n : o.y;
    if (n && !S.collides(w, nx, ny, r)) { o.x = nx; o.y = ny; }
  }
  S.moveCircle = function (w, o, dx, dy, r) {
    if (dx) { if (!S.collides(w, o.x + dx, o.y, r)) o.x += dx; else if (!dy) nudge(w, o, 'y', Math.abs(dx), r); }
    if (dy) { if (!S.collides(w, o.x, o.y + dy, r)) o.y += dy; else if (!dx) nudge(w, o, 'x', Math.abs(dy), r); }
  };
})(typeof module !== 'undefined' ? module.exports : (window.Shared = {}));
