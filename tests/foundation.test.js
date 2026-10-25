import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clamp, lerp, approach, mulberry32, fmtSig, angleDelta } from '../src/core/math.js';
import { formatNumber, formatTime, formatMult, formatRate } from '../src/core/format.js';
import { EventBus, EVT } from '../src/core/events.js';

test('math helpers', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(lerp(0, 10, 0.5), 5);
  const a = approach(10, 0, 5, 1);
  assert.ok(a > 0 && a < 10, 'approach decays');
  const rng = mulberry32(7);
  const rng2 = mulberry32(7);
  assert.equal(rng(), rng2());
  assert.ok(fmtSig(1.0000000000000002, 10) === 1);
  assert.ok(Math.abs(angleDelta(0.1, Math.PI * 2 - 0.1) + 0.2) < 1e-9);
});

test('formatNumber ladder', () => {
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(999), '999');
  assert.equal(formatNumber(1000), '1.00K');
  assert.equal(formatNumber(1234), '1.23K');
  assert.equal(formatNumber(1.234e5), '123.40K');
  assert.equal(formatNumber(1e6), '1.00M');
  assert.equal(formatNumber(1e9), '1.00B');
  assert.equal(formatNumber(1e12), '1.00T');
  assert.equal(formatNumber(1e15), '1.00Qa');
  assert.equal(formatNumber(1e33), '1.00Dd');
  assert.ok(/e\d+$/.test(formatNumber(1e70)), 'scientific past the ladder: ' + formatNumber(1e70));
  assert.equal(formatNumber(Infinity), '∞');
  assert.equal(formatNumber(NaN), '—');
  assert.equal(formatRate(1500), '1.50K/s');
  assert.equal(formatMult(1), 'x1');
  assert.equal(formatMult(2.5), 'x2.5');
});

test('formatTime', () => {
  assert.equal(formatTime(5), '5s');
  assert.equal(formatTime(95), '1m 35s');
  assert.equal(formatTime(3725), '1h 2m');
});

test('event bus isolates handler errors', () => {
  const bus = new EventBus();
  let hits = 0;
  bus.on(EVT.PULSE, () => { throw new Error('boom'); });
  bus.on(EVT.PULSE, () => { hits++; });
  let err = null;
  bus.on(EVT.ERROR, (p) => { err = p; });
  bus.emit(EVT.PULSE, { n: 1 });
  assert.equal(hits, 1);
  assert.ok(err && err.evt === EVT.PULSE, 'error surfaced on ERROR channel');
});
