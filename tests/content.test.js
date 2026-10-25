// Contract gate for src/core/content.js — written by the PM, enforced in CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INJECTORS, UPGRADES, STAGES, PERKS, ACHIEVEMENTS, MECHANIC_KEYS,
} from '../src/core/content.js';

const HEX = /^#[0-9a-f]{6}$/;
const ID = /^[a-z][a-z0-9_]*$/;

test('tables exist with the required size', () => {
  assert.equal(INJECTORS.length, 12, 'exactly 12 injectors');
  assert.ok(UPGRADES.length >= 44, 'at least 44 upgrades, got ' + UPGRADES.length);
  assert.equal(STAGES.length >= 14, true, 'at least 14 stages');
  assert.ok(PERKS.length >= 12, 'at least 12 perks');
  assert.ok(ACHIEVEMENTS.length >= 24, 'at least 24 achievements');
  assert.ok(Array.isArray(MECHANIC_KEYS) && MECHANIC_KEYS.length >= 10);
});

test('ids are valid and globally unique', () => {
  const seen = new Set();
  for (const rows of [INJECTORS, UPGRADES, STAGES, PERKS, ACHIEVEMENTS]) {
    for (const r of rows) {
      assert.match(r.id, ID, 'bad id ' + r.id);
      assert.ok(!seen.has(r.id), 'duplicate id ' + r.id);
      seen.add(r.id);
      assert.ok(typeof r.name === 'string' && r.name.length > 1 && r.name.length < 40, 'name for ' + r.id);
      assert.ok(typeof r.blurb === 'string' && r.blurb.length > 8, 'blurb for ' + r.id);
    }
  }
});

test('injector curve is monotonic and the first buy is cheap', () => {
  INJECTORS.forEach((inj, i) => {
    assert.equal(inj.tier, i, 'tier order');
    assert.ok(Number.isFinite(inj.baseCost) && inj.baseCost > 0, 'baseCost ' + inj.id);
    assert.ok(Number.isFinite(inj.baseRate) && inj.baseRate > 0, 'baseRate ' + inj.id);
    assert.ok(inj.costGrowth >= 1.1 && inj.costGrowth <= 1.2, 'costGrowth ' + inj.id);
    if (i > 0) {
      assert.ok(inj.baseCost > INJECTORS[i - 1].baseCost, 'cost must rise: ' + inj.id);
      assert.ok(inj.baseRate > INJECTORS[i - 1].baseRate, 'rate must rise: ' + inj.id);
      assert.ok(inj.unlockAt >= INJECTORS[i - 1].unlockAt, 'unlockAt must rise: ' + inj.id);
    }
  });
  assert.ok(INJECTORS[0].baseCost <= 20, 'tier 0 must be affordable in seconds');
  assert.equal(INJECTORS[0].unlockAt, 0);
});

test('upgrades reference real injectors and legal mechanics', () => {
  const injIds = new Set(INJECTORS.map((i) => i.id));
  for (const u of UPGRADES) {
    assert.ok(Number.isFinite(u.cost) && u.cost > 0, 'cost ' + u.id);
    assert.ok(u.requires && typeof u.requires === 'object', 'requires ' + u.id);
    if (u.requires.injector) assert.ok(injIds.has(u.requires.injector), 'bad injector ref ' + u.id);
    if (u.requires.totalFlux !== undefined) assert.ok(u.requires.totalFlux >= 0, 'totalFlux ' + u.id);
    if (u.kind === 'injector_mult') {
      assert.ok(injIds.has(u.target), 'target ' + u.id);
      assert.ok(u.mult >= 1.5, 'mult ' + u.id);
      assert.ok(Number.isInteger(u.requires.count) && u.requires.count >= 5, 'count ' + u.id);
    } else if (u.kind === 'global_mult') {
      assert.ok(u.mult >= 1.1, 'global mult ' + u.id);
    } else if (u.kind === 'mechanic') {
      assert.ok(MECHANIC_KEYS.includes(u.mechanic.key), 'bad mechanic key ' + u.id);
      assert.ok(Number.isFinite(u.mechanic.value), 'mechanic value ' + u.id);
    } else {
      assert.fail('unknown kind ' + u.kind + ' on ' + u.id);
    }
  }
  const mech = UPGRADES.filter((u) => u.kind === 'mechanic');
  assert.ok(mech.length >= 10, 'at least 10 mechanic-changing upgrades, got ' + mech.length);
});

test('stages ascend and carry a legal palette', () => {
  STAGES.forEach((s, i) => {
    assert.ok(Number.isFinite(s.at), 'at ' + s.id);
    if (i === 0) assert.equal(s.at, 0);
    else assert.ok(s.at > STAGES[i - 1].at, 'stage at must rise: ' + s.id);
    for (const key of ['core', 'glow', 'rim', 'bg', 'accent']) {
      assert.match(s.palette[key], HEX, 'palette.' + key + ' on ' + s.id);
    }
    assert.ok(s.bloom >= 0.1 && s.bloom <= 2.5, 'bloom ' + s.id);
    assert.ok(s.orbit >= 0.5 && s.orbit <= 4, 'orbit ' + s.id);
    assert.ok(s.camDist >= 2 && s.camDist <= 20, 'camDist ' + s.id);
    assert.ok(Number.isInteger(s.detail) && s.detail >= 1 && s.detail <= 6, 'detail ' + s.id);
  });
});

test('perks use legal effect keys', () => {
  for (const p of PERKS) {
    assert.ok(Number.isInteger(p.cost) && p.cost >= 1, 'cost ' + p.id);
    assert.ok(MECHANIC_KEYS.includes(p.effect.key), 'bad effect key ' + p.id);
    assert.ok(Number.isFinite(p.effect.value), 'effect value ' + p.id);
  }
});

test('achievements use legal counters', () => {
  const ALLOWED = ['pulses', 'crits', 'perfects', 'collapses', 'ascends', 'overdrives',
    'totalFlux', 'stageIndex', 'injectorsTotal', 'upgradesOwned', 'playSec'];
  for (const a of ACHIEVEMENTS) {
    assert.ok(a.at && typeof a.at === 'object', 'at ' + a.id);
    const keys = Object.keys(a.at);
    assert.ok(keys.length >= 1, 'at keys ' + a.id);
    for (const k of keys) {
      assert.ok(ALLOWED.includes(k), 'unknown counter ' + k + ' on ' + a.id);
      assert.ok(Number.isFinite(a.at[k]) && a.at[k] >= 0, 'at value ' + a.id);
    }
  }
});
