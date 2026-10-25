// HYPERNOVA — number formatting. PM-owned foundation. No dependencies.
// Suffix ladder: K M B T Qa Qi Sx Sp Oc No Dc Ud Dd, then scientific.
const SUFFIXES = [
  'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No',
  'Dc', 'Ud', 'Dd', 'Td', 'Qd', 'Qq', 'Sxd', 'Spd', 'Ocd', 'Nod', 'Vg',
];

export function formatNumber(n, decimals = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '-∞';
  const neg = n < 0;
  const v = Math.abs(n);
  if (v < 1000) {
    if (Number.isInteger(v)) return (neg ? '-' : '') + v;
    const s = v < 10 ? v.toFixed(Math.min(decimals, 2)) : v.toFixed(1);
    return (neg ? '-' : '') + s;
  }
  const tier = Math.floor(Math.log10(v) / 3); // 1 => thousands
  if (tier <= SUFFIXES.length) {
    const scaled = v / Math.pow(10, tier * 3);
    const dp = scaled >= 100 ? 1 : decimals;
    return (neg ? '-' : '') + scaled.toFixed(dp) + SUFFIXES[tier - 1];
  }
  const exp = Math.floor(Math.log10(v));
  return (neg ? '-' : '') + (v / Math.pow(10, exp)).toFixed(2) + 'e' + exp;
}

export function formatInt(n) {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) < 1e6) return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return formatNumber(n, 2);
}

export function formatMult(x) {
  if (!Number.isFinite(x)) return 'x∞';
  if (x < 100) return 'x' + (Number.isInteger(x) ? x : x.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));
  return 'x' + formatNumber(x, 2);
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

export const formatRate = (n) => formatNumber(n, 2) + '/s';

// Progress in 0..1 for bars; safe against zero/NaN.
export function progress01(cur, next) {
  if (!Number.isFinite(cur) || !Number.isFinite(next) || next <= 0) return 0;
  return Math.max(0, Math.min(1, cur / next));
}
