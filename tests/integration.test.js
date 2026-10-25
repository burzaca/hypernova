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
