// Cross-module smoke test: the game must boot headlessly and never leak a non-finite number.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus, EVT } from '../src/core/events.js';
import { TUNE } from '../src/core/tune.js';
import * as eco from '../src/core/economy.js';
import { INJECTORS, STAGES } from '../src/core/content.js';

function deepFinite(obj, path = '', bad = []) {
  if (typeof obj === 'number') {
    if (!Number.isFinite(obj)) bad.push(path + ' = ' + obj);
  } else if (Array.isArray(obj)) {
    obj.forEach((v, i) => deepFinite(v, path + '[' + i + ']', bad));
  } else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) deepFinite(v, path + '.' + k, bad);
  }
  return bad;
}

test('a fresh game boots, plays 3 minutes, and stays finite', () => {
  const bus = new EventBus();
  let s = eco.createState(11);
  const seen = { stages: 0, buys: 0, pulses: 0, crits: 0, overdrives: 0 };
  bus.on(EVT.STAGE_UP, () => seen.stages++);
  bus.on(EVT.BUY, () => seen.buys++);
  bus.on(EVT.PULSE, () => seen.pulses++);
  bus.on(EVT.CRIT, () => seen.crits++);
  bus.on(EVT.OVERDRIVE_START, () => seen.overdrives++);

  let t = 0;
  let snap = eco.snapshot(s);
  while (t < 180) {
    if (Math.floor(t * 6) > Math.floor((t - TUNE.sim.dt) * 6)) eco.pulse(s, bus);
    const cs = eco.chargeState(s);
    if (cs.ready) eco.fireCharge(s, bus, 0);
    if (s.overdrive >= TUNE.overdrive.need && s.overdriveTimer <= 0) eco.triggerOverdrive(s, bus);
    for (const inj of snap.injectors) {
      if (inj.unlocked && inj.affordable) eco.buyInjector(s, bus, inj.id);
    }
    for (const up of snap.upgrades) {
      if (up.unlocked && !up.owned && up.affordable) eco.buyUpgrade(s, bus, up.id);
    }
    eco.tick(s, TUNE.sim.dt, bus);
    t += TUNE.sim.dt;
    if (Math.floor(t * 4) > Math.floor((t - TUNE.sim.dt) * 4)) snap = eco.snapshot(s);
    const bad = deepFinite(snap, 'snap');
    assert.deepEqual(bad, [], 'non-finite snapshot field at t=' + t.toFixed(1));
  }
  assert.ok(s.totalFlux > 0, 'flux must grow');
  assert.ok(seen.pulses > 100, 'pulses fired');
  assert.ok(snap.injectors.length === INJECTORS.length, 'snapshot lists every injector');
  assert.ok(snap.stage.index >= 0 && snap.stage.index < STAGES.length);
  assert.ok(snap.stage.nextAt > snap.totalFlux || snap.stage.index === STAGES.length - 1,
    'next stage threshold must be ahead of the player');
});

test('snapshot lists everything the UI needs', () => {
  const bus = new EventBus();
  const s = eco.createState(3);
  eco.tick(s, 1, bus);
  const snap = eco.snapshot(s);
  for (const key of ['flux', 'totalFlux', 'runFlux', 'rate', 'combo', 'comboMult', 'overdrive',
    'stage', 'injectors', 'upgrades', 'perks', 'shards', 'cores', 'collapse', 'ascend', 'charge', 'stats']) {
    assert.ok(key in snap, 'snapshot missing ' + key);
  }
  for (const inj of snap.injectors) {
    for (const k of ['id', 'name', 'tier', 'owned', 'cost', 'rate', 'affordable', 'unlocked']) {
      assert.ok(k in inj, 'injector row missing ' + k);
    }
  }
  assert.equal(typeof snap.collapse.available, 'boolean');
  assert.equal(typeof snap.ascend.available, 'boolean');
});

test('save round-trips through JSON', () => {
  const bus = new EventBus();
  const s = eco.createState(5);
  for (let i = 0; i < 400; i++) { eco.pulse(s, bus); eco.tick(s, 1 / 30, bus); }
  const text = eco.save(s);
  const back = eco.load(text);
  assert.ok(back, 'load returned state');
  assert.equal(back.totalFlux, s.totalFlux);
  assert.deepEqual(back.injectors, s.injectors);
  assert.equal(eco.load('not json'), null);
  assert.equal(eco.load(JSON.stringify({ v: 999 })), null);
});

test('the snapshot reports owned upgrades and the live click value', () => {
  const s = eco.createState({ seed: 11 });
  const bus = new EventBus();
  s.flux = 1e9; s.totalFlux = 1e9; s.runFlux = 1e9; s.lifetimeFlux = 1e9;
  const shop = eco.snapshot(s).upgrades.filter((u) => u.unlocked && u.affordable);
  assert.ok(shop.length > 0, 'there must be something to buy at 1e9 flux');
  const id = shop[0].id;
  assert.ok(eco.buyUpgrade(s, bus, id), 'the purchase must succeed');
  const after = eco.snapshot(s);
  // An owned upgrade must leave the shop list and appear in the owned list. It used to appear in
  // neither, which is why the collapse warning said "0 upgrades" to a player who owned several.
  assert.ok(!after.upgrades.some((u) => u.id === id), 'owned upgrade must not stay in the shop');
  assert.ok(after.ownedUpgrades.some((u) => u.id === id), 'owned upgrade must be reported');
  // The click value is real and overdrive multiplies it — combo and overdrive act on clicks, not
  // on the passive rate, so this is the number the HUD has to show for them to be felt at all.
  const plain = eco.pulseGain(s);
  s.overdriveTimer = 5;
  const boosted = eco.snapshot(s).pulseValue;
  s.overdriveTimer = 0;
  assert.ok(plain > 0, 'a pulse must be worth something');
  assert.ok(boosted > plain * 5, 'overdrive must multiply the click value');
});

test('buy multiplier: x1/x10/x100 buys that many levels at the true bundle price', () => {
  const s = eco.createState({ seed: 23 });
  const bus = new EventBus();
  s.flux = 1e12; s.totalFlux = 1e12; s.runFlux = 1e12; s.lifetimeFlux = 1e12;

  // The bundle price must equal the sum of buying one at a time — no hidden discount, no lie.
  const id = 'ion_spark';
  let sum = 0;
  for (let i = 0; i < 10; i++) { sum += eco.injectorCost(s, id); eco.buyInjector(s, bus, id, 1); }
  s.injectors[id] = 0;
  const bundle = eco.bundleCost(s, id, 10);
  assert.ok(Math.abs(bundle - sum) / sum < 1e-9, 'bundleCost must match ten single buys (' + bundle + ' vs ' + sum + ')');

  assert.ok(eco.buyInjector(s, bus, id, 10), 'a 10-bundle must be affordable at 1e12 flux');
  assert.strictEqual(s.injectors[id], 10, 'exactly 10 levels must be added');

  // Unaffordable bundle buys nothing rather than a partial, so the shown price is never a lie.
  s.flux = 1;
  const before = s.injectors[id];
  assert.strictEqual(eco.buyInjector(s, bus, id, 100), false);
  assert.strictEqual(s.injectors[id], before);

  // The preference is validated and reported, and the shop price follows it.
  assert.strictEqual(eco.setBuyMult(s, 100), 100);
  assert.strictEqual(eco.setBuyMult(s, 7), 1, 'an unknown multiplier must fall back to 1');
  eco.setBuyMult(s, 10);
  const snap = eco.snapshot(s);
  assert.strictEqual(snap.buyMult, 10);
  const row = snap.injectors.find((x) => x.id === id);
  assert.strictEqual(row.bundle, 10);
  assert.strictEqual(row.cost, eco.bundleCost(s, id, 10));
  assert.ok(row.singleCost < row.cost, 'the single price must stay lower than the bundle price');

  // It survives a save round-trip, and an older save without the field defaults to 1.
  const loaded = eco.load(eco.save(s));
  assert.strictEqual(eco.buyMultOf(loaded), 10);
  const legacy = eco.load(JSON.stringify({ v: 1, state: { ...s, buyMult: undefined } }));
  assert.strictEqual(eco.buyMultOf(legacy), 1);
});
