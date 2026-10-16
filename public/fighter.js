// Arena fights: your own fighter, built from shapes on a skeleton (see Shared.FIGHTER_PARTS), saved on this device.
// A part is { b: body part, t: shape, p: [x, y, z] where it sits on that body part, r: [x, y, z] how it's turned
// (radians), s: [x, y, z] its size, c: color, f: finish }. The fighter faces +x; y is up; z is to its side (the left
// arm and leg are on -z). A fighter with no shapes is just its skeleton.
const Sh = window.Shared;

export const fighterParts = f => (f && f.parts ? f.parts : []);

export function loadFighter() {
  let f = null;
  try { f = JSON.parse(localStorage.getItem('kb-fighter') || 'null'); } catch {}
  return Sh.cleanFighter(f && f.parts !== undefined ? f : null); // (a fighter saved by the old clay maker starts over)
}
export function saveFighter(f) { try { localStorage.setItem('kb-fighter', JSON.stringify(f)); } catch {} }
