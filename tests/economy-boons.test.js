// Ascension Boons flow — docs/ENDLESS.md §2 / §Acceptance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus, EVT } from '../src/core/events.js';
import { TUNE } from '../src/core/tune.js';
import { BOONS } from '../src/core/content.js';
import * as eco from '../src/core/economy.js';

function ascended(seed = 42, times = 1) {
  const s = eco.createState(seed);
  const bus = new EventBus();
  for (let i = 0; i < times; i++) {
    s.totalFlux = TUNE.prestige.ascendAt * 10;
    eco.doAscend(s, bus);
  }
  return { s, bus };
}

test('fresh state has no boons and no pending offer', () => {
  const s = eco.createState(1);
  assert.deepEqual(s.boons, {});
  assert.deepEqual(s.boonOffers, []);
  const snap = eco.snapshot(s);
  assert.deepEqual(snap.boons, { offers: [], owned: [], pending: false });
});

test('doAscend produces exactly 3 distinct, known, unowned offers', () => {
  const { s } = ascended(42);
  assert.equal(s.ascends, 1);
  assert.equal(s.boonOffers.length, 3);
  assert.equal(new Set(s.boonOffers).size, 3);
  const ids = new Set(BOONS.map((b) => b.id));
  for (const id of s.boonOffers) assert.ok(ids.has(id), 'unknown offer ' + id);
  const snap = eco.snapshot(s);
  assert.equal(snap.boons.pending, true);
  assert.deepEqual(snap.boons.offers.map((o) => o.id), s.boonOffers);
  for (const o of snap.boons.offers) {
    assert.ok(o.name && o.blurb && o.mods && typeof o.mods === 'object');
  }
});

test('a failed ascend does not roll an offer', () => {
  const s = eco.createState(5);
  eco.doAscend(s, new EventBus());
  assert.equal(s.ascends, 0);
  assert.deepEqual(s.boonOffers, []);
});

test('offers are deterministic for the same seed and ascend count', () => {
  const a = ascended(1234).s.boonOffers;
  const b = ascended(1234).s.boonOffers;
  assert.deepEqual(a, b);
  // A different seed (or ascend count) is allowed to differ; across many seeds they must.
  const variety = new Set();
  for (let seed = 1; seed <= 30; seed++) variety.add(ascended(seed).s.boonOffers.join(','));
  assert.ok(variety.size > 5, 'offers should vary across seeds, got ' + variety.size);
});

test('chooseBoon applies the mods measurably and emits BOON', () => {
  const { s, bus } = ascended(42);
  const id = s.boonOffers[0];
  const boon = BOONS.find((b) => b.id === id);
  const key = Object.keys(boon.mods)[0];
  const before = {};
  for (const k of Object.keys(boon.mods)) before[k] = eco.mechanicValue(s, k);
  const seen = [];
  bus.on(EVT.BOON, (p) => seen.push(p));
  assert.equal(eco.chooseBoon(s, bus, id), true);
  assert.equal(s.boons[id], true);
  assert.deepEqual(s.boonOffers, []);
  assert.deepEqual(seen, [{ id, name: boon.name }]);
  assert.ok(Object.keys(boon.mods).some((k) => eco.mechanicValue(s, k) !== before[k]), 'some mod must change ' + key);
  const snap = eco.snapshot(s);
  assert.equal(snap.boons.pending, false);
  assert.deepEqual(snap.boons.owned.map((o) => o.id), [id]);
});

test('every boon changes the mechanic values it names (fresh run, no other sources)', () => {
  for (const b of BOONS) {
    const s = eco.createState(9);
    const base = {};
    for (const k of Object.keys(b.mods)) base[k] = eco.mechanicValue(s, k);
    s.boons[b.id] = true;
    let changed = 0;
    for (const k of Object.keys(b.mods)) {
      const v = eco.mechanicValue(s, k);
      assert.ok(Number.isFinite(v), b.id + ' ' + k + ' finite');
      if (v !== base[k]) changed += 1;
    }
    assert.ok(changed >= 1, b.id + ' must change something on a fresh run');
  }
});

test('overdriveMult boon: explicit measurable change', () => {
  const s = eco.createState(3);
  const base = eco.mechanicValue(s, 'overdriveMult');
  s.boons.boon_long_burn = true;
  assert.equal(eco.mechanicValue(s, 'overdriveMult'), base - 4);
  assert.equal(eco.mechanicValue(s, 'overdriveDuration'), TUNE.overdrive.duration + 12);
});

test('chooseBoon never mutates state on an invalid id', () => {
  const { s, bus } = ascended(42);
  const notOffered = BOONS.map((b) => b.id).find((id) => !s.boonOffers.includes(id));
  const snapBefore = JSON.stringify(s);
  let events = 0;
  bus.on(EVT.BOON, () => { events += 1; });
  for (const bad of [notOffered, 'nope', '', null, undefined, 42, {}, '__proto__', 'constructor']) {
    assert.equal(eco.chooseBoon(s, bus, bad), false, 'should reject ' + String(bad));
  }
  assert.equal(JSON.stringify(s), snapBefore);
  assert.equal(events, 0);
  // and nothing to choose when no offer is pending
  const fresh = eco.createState(1);
  const freshBefore = JSON.stringify(fresh);
  assert.equal(eco.chooseBoon(fresh, bus, BOONS[0].id), false);
  assert.equal(JSON.stringify(fresh), freshBefore);
});

test('a pending offer survives save/load and does not block play', () => {
  const { s, bus } = ascended(77);
  const offers = s.boonOffers.slice();
  eco.tick(s, 1, bus);
  eco.pulse(s, bus);
  assert.deepEqual(s.boonOffers, offers, 'play does not clear the offer');
  const back = eco.load(eco.save(s));
  assert.ok(back);
  assert.deepEqual(back.boonOffers, offers);
  assert.equal(eco.chooseBoon(back, bus, offers[1]), true);
  const again = eco.load(eco.save(back));
  assert.deepEqual(again.boons, { [offers[1]]: true });
  assert.deepEqual(again.boonOffers, []);
  assert.equal(eco.save(again), eco.save(back), 'exact JSON round-trip');
});

test('load drops unknown/owned/duplicate boon ids', () => {
  const s = eco.createState(1);
  const [a, b] = BOONS;
  const text = JSON.stringify({ ...JSON.parse(eco.save(s)),
    boons: { [a.id]: true, ghost_boon: true, [b.id]: 'yes' },
    boonOffers: [a.id, 'ghost_boon', b.id, b.id, 7] });
  const back = eco.load(text);
  assert.deepEqual(back.boons, { [a.id]: true });
  assert.deepEqual(back.boonOffers, [b.id]);
});

test('a new ascend replaces an untouched offer; owned boons persist across ascends', () => {
  const { s, bus } = ascended(42);
  const first = s.boonOffers.slice();
  eco.chooseBoon(s, bus, first[0]);
  s.totalFlux = TUNE.prestige.ascendAt * 10;
  eco.doAscend(s, bus);
  assert.equal(s.boons[first[0]], true, 'boons survive ascend');
  assert.equal(s.boonOffers.length, 3);
  assert.ok(!s.boonOffers.includes(first[0]), 'owned boons are not offered again');
  const untouched = s.boonOffers.slice();
  s.totalFlux = TUNE.prestige.ascendAt * 10;
  eco.doAscend(s, bus);
  assert.equal(s.boonOffers.length, 3);
  // Deterministic replacement: the roll is keyed on the new ascend count.
  const twin = eco.createState(42);
  twin.boons = { ...s.boons };
  twin.ascends = s.ascends - 1;
  twin.totalFlux = TUNE.prestige.ascendAt * 10;
  eco.doAscend(twin, bus);
  assert.deepEqual(twin.boonOffers, s.boonOffers);
  assert.ok(untouched.length === 3);
});

test('offers stop once fewer than 3 boons remain unowned; stacking every boon stays finite', () => {
  const s = eco.createState(8);
  const bus = new EventBus();
  for (const b of BOONS.slice(0, BOONS.length - 2)) s.boons[b.id] = true;
  s.totalFlux = TUNE.prestige.ascendAt * 10;
  eco.doAscend(s, bus);
  assert.equal(s.ascends, 1);
  assert.deepEqual(s.boonOffers, []);
  for (const b of BOONS) s.boons[b.id] = true;
  for (let i = 0; i < 300; i++) { eco.tick(s, 1 / 30, bus); if (i % 5 === 0) eco.pulse(s, bus); }
  eco.fireCharge(s, bus, 0);
  eco.applyOffline(s, 3600, bus);
  const snap = eco.snapshot(s);
  for (const k of ['flux', 'rate', 'totalFlux']) assert.ok(Number.isFinite(snap[k]) && snap[k] >= 0, k);
});
