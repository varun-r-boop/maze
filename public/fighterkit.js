// Arena fights: the quick character builder's kit. A character is built from slots (head, hair, face, torso, arms,
// hands, legs, feet, back, weapon, outfit); each slot has a few ready-made options, and each option is a handful of
// shapes on the skeleton. Shapes on an arm or leg ('arm', 'fore', 'leg', 'shin') are made for both sides. Each shape
// is in the body color ('b') or the accent color ('a'). The parts a slot adds are tagged g: 'slot.option', so picking
// another option for the slot swaps them, and o: 'b' | 'a', so the two colors can be changed later.
// Examples are finished characters made from the same options.
import { BODY_PARTS } from './fighter3d.js';

const S = (bone, t, p, s, r = [0, 0, 0], o = 'b') => ({ bone, t, p, s, r, o });
// a body part from the editor's body parts (fighter3d.js), thicker or thinner (k), in a color role
const part = (key, k = 1, o = 'b') => BODY_PARTS[key].shapes.map(([t, p, s, r = [0, 0, 0]]) => S(BODY_PARTS[key].bone, t, p, /^(arm|fore|leg|shin)$/.test(BODY_PARTS[key].bone) ? [s[0] * k, s[1], s[2] * k] : s.map(v => v * k), r, o));
const H = Math.PI / 2;

export const SLOTS = [
  { id: 'head', name: 'Head', options: [
    ['round', 'Round', [S('head', 'sphere', [0.01, 0.14, 0], [0.2, 0.22, 0.2])]],
    ['egg', 'Egg', [S('head', 'sphere', [0.012, 0.15, 0], [0.165, 0.23, 0.17])]],
    ['box', 'Box', [S('head', 'rbox', [0, 0.13, 0], [0.2, 0.2, 0.2])]],
    ['snout', 'Snout', [...part('head'), ...part('snout')]],
    ['skull', 'Skull', [S('head', 'sphere', [0, 0.16, 0], [0.2, 0.2, 0.2]), S('head', 'rbox', [0.04, 0.05, 0], [0.12, 0.07, 0.13])]],
    ['helmet', 'Helmet', [S('head', 'sphere', [0.01, 0.14, 0], [0.21, 0.23, 0.21]), S('head', 'rbox', [0.03, 0.25, 0], [0.16, 0.035, 0.05], [0, 0, 0], 'a')]],
  ] },
  { id: 'hair', name: 'Hair', options: [
    ['none', 'None', []],
    ['spiky', 'Spiky', [-0.06, 0, 0.06].map((z, i) => S('head', 'spike', [-0.02, 0.27, z], [0.08, 0.22, 0.02], [z * 6, 0, 0.5 + (i === 1 ? 0 : 0.15)], 'a'))],
    ['mohawk', 'Mohawk', [[0.07, 0.15], [0.01, 0.45], [-0.06, 0.75]].map(([x, rz]) => S('head', 'spike', [x, 0.25, 0], [0.1, 0.2, 0.02], [0, 0, rz], 'a'))],
    ['curly', 'Curly', [S('head', 'curly', [0, 0.22, 0], [0.24, 0.12, 0.24], [0, 0, 0], 'a')]],
    ['long', 'Long', [S('head', 'longhair', [-0.01, 0.17, 0], [0.23, 0.3, 0.23], [0, 0, 0], 'a')]],
    ['horns', 'Horns', [0.07, -0.07].map(z => S('head', 'horn', [0, 0.24, z], [0.05, 0.18, 0.05], [Math.sign(z) * 0.4, 0, 0], 'a'))],
    ['hat', 'Hat', [S('head', 'spike', [-0.02, 0.25, 0], [0.24, 0.22, 0.03], [0, 0, 0.9], 'a')]],
  ] },
  { id: 'face', name: 'Face', options: [
    ['none', 'None', []],
    ['eyes', 'Eyes', [0.045, -0.045].map(z => S('head', 'eye', [0.1, 0.16, z], [0.07, 0.07, 0.07], [0, 0, -H], 'a'))],
    ['big', 'Big eyes', [0.05, -0.05].map(z => S('head', 'eye', [0.09, 0.17, z], [0.1, 0.1, 0.1], [0, 0, -H], 'a'))],
    ['cyclops', 'One eye', [S('head', 'eye', [0.1, 0.16, 0], [0.11, 0.11, 0.11], [0, 0, -H], 'a')]],
    ['visor', 'Visor', [S('head', 'rbox', [0.095, 0.15, 0], [0.04, 0.05, 0.18], [0, 0, 0], 'a')]],
  ] },
  { id: 'torso', name: 'Torso', options: [
    ['slim', 'Slim', [...part('neck', 0.8), ...part('chest', 0.8), ...part('belly', 0.7), ...part('pelvis', 0.85)]],
    ['normal', 'Normal', [...part('neck'), ...part('chest'), ...part('belly'), ...part('pelvis')]],
    ['strong', 'Strong', [...part('neck', 1.3), S('torso', 'rbox', [0, 0.32, 0], [0.24, 0.27, 0.44]), ...part('belly'), ...part('pelvis', 1.1)]],
    ['round', 'Round', [...part('neck'), S('torso', 'sphere', [0.02, 0.22, 0], [0.32, 0.44, 0.4]), ...part('pelvis')]],
    ['robot', 'Robot', [...part('neck'), S('torso', 'box', [0, 0.32, 0], [0.2, 0.24, 0.34]), S('torso', 'box', [0, 0.12, 0], [0.16, 0.14, 0.26]), S('hips', 'box', [0, -0.03, 0], [0.16, 0.11, 0.27])]],
  ] },
  { id: 'arms', name: 'Arms', options: [
    ['thin', 'Thin', [...part('upperarm', 0.6), ...part('forearm', 0.6)]],
    ['normal', 'Normal', [...part('upperarm'), ...part('forearm')]],
    ['muscular', 'Muscular', [...part('upperarm', 1.5), ...part('forearm', 1.35)]],
    ['robot', 'Robot', [S('arm', 'box', [0, -0.1, 0], [0.08, 0.22, 0.08]), S('fore', 'box', [0, -0.1, 0], [0.075, 0.2, 0.075]), S('fore', 'sphere', [0, 0, 0], [0.08, 0.08, 0.08], [0, 0, 0], 'a')]],
  ] },
  { id: 'hands', name: 'Hands', options: [
    ['fists', 'Fists', part('hand')],
    ['claws', 'Claws', part('clawhand')],
    ['blades', 'Arm blades', [...part('hand'), S('fore', 'blade', [0.07, -0.11, 0], [0.2, 0.6, 0.03], [0, 0, 0], 'a')]],
    ['gloves', 'Gloves', [S('fore', 'sphere', [0, -0.235, 0], [0.12, 0.12, 0.12], [0, 0, 0], 'a')]],
    ['cuffs', 'Cuffs', [...part('hand'), S('fore', 'torus', [0, -0.18, 0], [0.1, 0.03, 0.1], [0, 0, 0], 'a')]],
  ] },
  { id: 'legs', name: 'Legs', options: [
    ['thin', 'Thin', [...part('thigh', 0.65), ...part('shin', 0.65)]],
    ['normal', 'Normal', [...part('thigh'), ...part('shin')]],
    ['strong', 'Strong', [...part('thigh', 1.4), ...part('shin', 1.3)]],
    ['robot', 'Robot', [S('leg', 'box', [0, -0.11, 0], [0.1, 0.24, 0.1]), S('shin', 'box', [0, -0.1, 0], [0.09, 0.22, 0.09]), S('shin', 'sphere', [0, 0, 0], [0.09, 0.09, 0.09], [0, 0, 0], 'a')]],
  ] },
  { id: 'feet', name: 'Feet', options: [
    ['shoes', 'Shoes', part('foot')],
    ['boots', 'Boots', [S('shin', 'rbox', [0.04, -0.21, 0], [0.2, 0.07, 0.1]), S('shin', 'torus', [0, -0.15, 0], [0.12, 0.035, 0.12], [0, 0, 0], 'a')]],
    ['claws', 'Claws', part('clawfoot')],
    ['hooves', 'Hooves', [S('shin', 'cylinder', [0, -0.21, 0], [0.1, 0.07, 0.1], [0, 0, 0], 'a')]],
  ] },
  { id: 'back', name: 'Back', options: [
    ['none', 'None', []],
    ['wings', 'Wings', [0.08, -0.08].map(z => S('torso', 'blade', [-0.12, 0.42, z], [0.22, 0.6, 0.03], [Math.sign(z) * 0.6, Math.PI, 0], 'a'))],
    ['tail', 'Tail', [S('hips', 'horn', [-0.12, -0.05, 0], [0.07, 0.45, 0.07], [0, 0, 2.2])]],
    ['spikes', 'Spikes', [0.15, 0.27, 0.39].map(y => S('torso', 'spike', [-0.1, y, 0], [0.09, 0.16, 0.02], [0, 0, 1.57], 'a'))],
    ['cloak', 'Cloak', [S('torso', 'coat', [0, 0.05, 0], [0.42, 0.75, 0.42], [0, 0, 0], 'a')]],
  ] },
  { id: 'weapon', name: 'Weapon', options: [
    ['none', 'None', []],
    ['spear', 'Spear', [S('foreR', 'spear', [0.02, -0.24, 0], [0.05, 1.3, 0.05], [0, 0, -H], 'a')]],
    ['sword', 'Sword', [S('foreR', 'spike', [0.36, -0.24, 0], [0.06, 0.62, 0.015], [0, 0, -H], 'a'), S('foreR', 'torus', [0.05, -0.24, 0], [0.09, 0.025, 0.09], [0, 0, H], 'a')]],
    ['staff', 'Staff', [S('foreR', 'cylinder', [0.02, -0.24, 0], [0.04, 1.3, 0.04], [0, 0, -H], 'a')]],
  ] },
  { id: 'outfit', name: 'Outfit', options: [
    ['none', 'None', []],
    ['coat', 'Long coat', [S('hips', 'coat', [0, -0.22, 0], [0.42, 0.6, 0.42], [0, 0, 0], 'a')]],
    ['belt', 'Belt', [S('hips', 'torus', [0, 0.01, 0], [0.3, 0.05, 0.3], [0, 0, 0], 'a')]],
    ['scarf', 'Scarf', [S('head', 'torus', [0, 0.0, 0], [0.17, 0.05, 0.17], [0, 0, 0], 'a')]],
  ] },
];
export const BUILDS = { short: { arm: 0.85, leg: 0.8, body: 0.9 }, normal: { arm: 1, leg: 1, body: 1 }, tall: { arm: 1.15, leg: 1.2, body: 1.1 }, lanky: { arm: 1.4, leg: 1.35, body: 1.1 } };

// the parts for one option of one slot, in the two colors ('L' shapes for both sides; the right one is mirrored)
export function slotParts(slotId, optId, body, accent) {
  const slot = SLOTS.find(s => s.id === slotId), opt = slot && slot.options.find(o => o[0] === optId);
  if (!opt) return [];
  const out = [];
  for (const q of opt[2]) {
    const base = { t: q.t, p: [...q.p], r: [...q.r], s: q.s.map(v => +v.toFixed(3)), u: 1, c: q.o === 'a' ? accent : body, k: 0, m: 0, g: `${slotId}.${optId}`, o: q.o };
    if (/^(arm|fore|leg|shin)$/.test(q.bone)) {
      out.push({ ...base, b: q.bone + 'L' }, { ...base, b: q.bone + 'R', p: [q.p[0], q.p[1], -q.p[2]], r: [-q.r[0], -q.r[1], q.r[2]] });
    } else out.push({ ...base, b: q.bone });
  }
  return out;
}
// which option each slot has, from a character's parts (null: nothing from that slot)
export function slotChoices(parts) {
  const c = {};
  for (const q of parts) if (q.g) { const [s, o] = q.g.split('.'); c[s] = o; }
  return c;
}

// finished characters to start from
export const EXAMPLES = [
  { id: 'blade', name: 'Blade Runner', slots: { head: 'egg', hair: 'mohawk', face: 'none', torso: 'slim', arms: 'thin', hands: 'blades', legs: 'thin', feet: 'boots' }, body: '#151515', accent: '#ff6d00', style: 'flat', line: null, build: 'lanky', special: 'kamehameha' },
  { id: 'lancer', name: 'Pink Lancer', slots: { head: 'round', hair: 'hat', torso: 'slim', arms: 'thin', hands: 'fists', legs: 'thin', feet: 'shoes', weapon: 'spear', outfit: 'coat' }, body: '#151515', accent: '#ff2bd6', style: 'flat', line: '#ff2bd6', build: 'tall', special: 'finalflash' },
  { id: 'brawler', name: 'Brawler', slots: { head: 'round', hair: 'spiky', face: 'eyes', torso: 'strong', arms: 'muscular', hands: 'gloves', legs: 'normal', feet: 'shoes', outfit: 'belt' }, body: '#d9a066', accent: '#e53935', style: 'shaded', line: null, build: 'normal', special: 'kamehameha' },
  { id: 'lizard', name: 'Lizard', slots: { head: 'snout', face: 'big', torso: 'normal', arms: 'normal', hands: 'claws', legs: 'strong', feet: 'claws', back: 'tail' }, body: '#43a047', accent: '#fdd835', style: 'shaded', line: null, build: 'normal', special: 'finalflash' },
  { id: 'robot', name: 'Robot', slots: { head: 'helmet', face: 'visor', torso: 'robot', arms: 'robot', hands: 'fists', legs: 'robot', feet: 'boots', back: 'spikes' }, body: '#8a8f98', accent: '#26c6da', style: 'shaded', line: '#151515', build: 'tall', special: 'kamehameha' },
];
