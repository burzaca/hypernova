// HYPERNOVA — math helpers. PM-owned foundation. No dependencies.
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (a, b, v) => {
  const t = clamp(invLerp(a, b, v), 0, 1);
  return t * t * (3 - 2 * t);
};
// Frame-rate independent exponential approach toward a target.
export const approach = (cur, target, rate, dt) =>
  target + (cur - target) * Math.exp(-rate * Math.max(0, dt));
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeOutBack = (t) => {
  const c = 1.70158, s = clamp(t, 0, 1), c3 = c + 1;
  return 1 + c3 * Math.pow(s - 1, 3) + c * Math.pow(s - 1, 2);
};
// Deterministic PRNG so replays/sims are reproducible.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const randRange = (rng, a, b) => a + (b - a) * rng();
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];
// Round to N significant digits (kills float dust like 1.0000000000000002 in saves/tests).
export function fmtSig(n, digits = 10) {
  if (!Number.isFinite(n) || n === 0) return 0;
  const d = Math.ceil(Math.log10(Math.abs(n)));
  const power = digits - d;
  const magnitude = Math.pow(10, power);
  return Math.round(n * magnitude) / magnitude;
}
export const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
// Shortest signed angular difference, in radians.
export function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
