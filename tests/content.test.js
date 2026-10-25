// Contract gate for src/core/content.js — written by the PM, enforced in CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INJECTORS, NOVA_INJECTORS, UPGRADES, STAGES, PERKS, ACHIEVEMENTS, MECHANIC_KEYS, BOONS, getStage, stageThreshold, GEN_STEP,
} from '../src/core/content.js';
import {
  createState, save, load, snapshot, tick, stageFor, injectorRate, globalMult, buyInjector, doCollapse, novaMult,
} from '../src/core/economy.js';
import { TUNE } from '../src/core/tune.js';

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
    'totalFlux', 'lifetimeFlux', 'stageIndex', 'injectorsTotal', 'upgradesOwned', 'playSec'];
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

// ---------------------------------------------------------------- endless stages (ENDLESS.md §1)
test('getStage returns authored stages, then generated ones forever', () => {
  const last = STAGES.length - 1;
  assert.equal(getStage(0), STAGES[0]);
  assert.equal(getStage(last), STAGES[last]);
  assert.equal(getStage(14), STAGES[14]);
  const names = new Set(STAGES.map((st) => st.name));
  let prevAt = STAGES[last].at;
  for (let i = 15; i <= 40; i++) {
    const g = getStage(i);
    assert.equal(g.generated, true, 'generated flag ' + i);
    assert.equal(g.id, 'beyond_' + i);
    assert.match(g.id, ID);
    assert.ok(g.at > prevAt, 'at must rise at ' + i);
    prevAt = g.at;
    for (const k of ['at', 'detail', 'bloom', 'orbit', 'camDist']) assert.ok(Number.isFinite(g[k]), k + ' finite at ' + i);
    for (const key of ['core', 'glow', 'rim', 'bg', 'accent']) assert.match(g.palette[key], HEX, 'palette.' + key + ' at ' + i);
    assert.equal(g.detail, 6);
    assert.ok(g.bloom <= 2.5 && g.orbit <= 4 && g.camDist >= 2, 'within authored ceiling at ' + i);
    assert.ok(typeof g.blurb === 'string' && g.blurb.length > 8);
    assert.ok(!names.has(g.name), 'duplicate name ' + g.name + ' at ' + i);
    names.add(g.name);
  }
  assert.equal(getStage(20), getStage(20), 'generated stages are cached');
});

test('generated names never repeat within the first 100 generated indices', () => {
  const names = new Set();
  for (let i = STAGES.length; i < STAGES.length + 100; i++) {
    const n = getStage(i).name;
    assert.ok(!names.has(n), 'repeat ' + n + ' at ' + i);
    names.add(n);
  }
});

test('stageThreshold is strictly increasing across the authored/generated boundary', () => {
  const last = STAGES.length - 1;
  for (let i = 0; i <= last; i++) assert.equal(stageThreshold(i), STAGES[i].at);
  assert.ok(stageThreshold(15) > STAGES[14].at);
  assert.equal(stageThreshold(last + 1), STAGES[last].at * GEN_STEP);
  for (let i = 1; i <= 120; i++) {
    assert.ok(stageThreshold(i) > stageThreshold(i - 1), 'threshold must rise at ' + i);
    assert.equal(stageThreshold(i), getStage(i).at);
  }
});

test('stage helpers never throw or go non-finite for odd indices', () => {
  for (const i of [-5, 0.7, 14.9, 1e3, 1e6, NaN, Infinity, -Infinity]) {
    assert.ok(Number.isFinite(stageThreshold(i)), 'threshold ' + i);
    const g = getStage(i);
    assert.ok(g && Number.isFinite(g.at), 'stage ' + i);
  }
});

test('a save at stage 30 round-trips and keeps stage 30', () => {
  const st = createState(7);
  st.lifetimeFlux = stageThreshold(30) * 1.5;
  st.stageIndex = 30;
  const back = load(save(st));
  assert.ok(back);
  assert.equal(back.stageIndex, 30);
  assert.equal(stageFor(back).id, 'beyond_30');
  const snap = snapshot(back);
  assert.equal(snap.stage.index, 30);
  assert.equal(snap.stage.nextAt, stageThreshold(31));
  assert.ok(snap.stage.progress > 0 && snap.stage.progress < 1);
});

test('the advance loop climbs past the last authored stage, at most 3 forms per tick', () => {
  const st = createState(3);
  st.lifetimeFlux = stageThreshold(22) * 2;
  tick(st, 0.1, null);
  // One tick may fire at most 3 forms: an ascend can multiply lifetime flux by 1e5 at once, and
  // 15 forms in one frame is a dropped frame, not a spectacle. The cascade finishes over later ticks.
  assert.equal(st.stageIndex, 3);
  for (let i = 0; i < 40; i++) tick(st, 0.1, null);
  assert.equal(st.stageIndex, 22);
});

// ---------------------------------------------------------------- ascension boons (ENDLESS.md §2)
test('boon table: 12+ trades, unique ids, known keys only, every boon has a cost', () => {
  assert.ok(Array.isArray(BOONS) && BOONS.length >= 12, 'at least 12 boons, got ' + (BOONS && BOONS.length));
  const others = new Set([INJECTORS, UPGRADES, STAGES, PERKS, ACHIEVEMENTS].flat().map((r) => r.id));
  const seen = new Set();
  for (const b of BOONS) {
    assert.match(b.id, ID, 'bad id ' + b.id);
    assert.ok(!seen.has(b.id) && !others.has(b.id), 'duplicate id ' + b.id);
    seen.add(b.id);
    assert.ok(typeof b.name === 'string' && b.name.length > 1 && b.name.length < 40, 'name for ' + b.id);
    assert.ok(typeof b.blurb === 'string' && b.blurb.length > 20, 'blurb for ' + b.id);
    assert.ok(!/powerful|bonus!/i.test(b.blurb), 'blurb must say what changes: ' + b.id);
    assert.ok(b.mods && typeof b.mods === 'object', 'mods for ' + b.id);
    const keys = Object.keys(b.mods);
    assert.ok(keys.length >= 2, 'a boon trades at least two things: ' + b.id);
    for (const k of keys) {
      assert.ok(MECHANIC_KEYS.includes(k), 'unknown mechanic key ' + k + ' on ' + b.id);
      assert.ok(Number.isFinite(b.mods[k]) && b.mods[k] !== 0, 'mod value ' + k + ' on ' + b.id);
    }
    assert.ok(keys.some((k) => b.mods[k] < 0), 'boon needs at least one negative mod: ' + b.id);
    assert.ok(keys.some((k) => b.mods[k] > 0), 'boon needs at least one upside: ' + b.id);
    // mechanicValue reads a fluxMult contribution 0 < v < 1 as a bonus and ignores v <= 0, so
    // fluxMult cannot be the cost side of a boon.
    if ('fluxMult' in b.mods) assert.ok(b.mods.fluxMult >= 1, 'fluxMult must be >= 1 on ' + b.id);
  }
});

// ---------------------------------------------------------------- nova family (SECOND_FAMILY.md)
test('nova family: 6 tiers above the base family, unique ids, same row shape', () => {
  assert.ok(Array.isArray(NOVA_INJECTORS));
  assert.equal(NOVA_INJECTORS.length, 6, 'exactly 6 nova injectors');
  const others = new Set([INJECTORS, UPGRADES, STAGES, PERKS, ACHIEVEMENTS, BOONS].flat().map((r) => r.id));
  const seen = new Set();
  const topBaseTier = Math.max(...INJECTORS.map((i) => i.tier));
  const baseKeys = new Set(Object.keys(INJECTORS[0]));
  for (const n of NOVA_INJECTORS) {
    assert.match(n.id, ID, 'bad id ' + n.id);
    assert.ok(!seen.has(n.id) && !others.has(n.id), 'duplicate id ' + n.id);
    seen.add(n.id);
    assert.equal(n.family, 'nova', 'family on ' + n.id);
    assert.ok(n.tier > topBaseTier, 'tier must exceed every base tier: ' + n.id);
    assert.ok(n.requires && Number.isInteger(n.requires.ascends) && n.requires.ascends >= 1, 'requires.ascends on ' + n.id);
    assert.ok(typeof n.name === 'string' && n.name.length > 1 && n.name.length < 40, 'name for ' + n.id);
    assert.ok(typeof n.blurb === 'string' && n.blurb.length > 8, 'blurb for ' + n.id);
    for (const k of Object.keys(n)) {
      assert.ok(baseKeys.has(k) || k === 'family' || k === 'requires', 'invented field ' + k + ' on ' + n.id);
    }
    for (const k of baseKeys) assert.ok(k in n, 'missing field ' + k + ' on ' + n.id);
  }
  for (const b of INJECTORS) assert.ok(b.family === undefined || b.family === 'base', 'base rows stay base');
});

test('nova curve: cost and rate rise with tier; cost growth steeper than any base entry', () => {
  const steepestBase = Math.max(...INJECTORS.map((i) => i.costGrowth));
  NOVA_INJECTORS.forEach((n, i) => {
    assert.ok(Number.isFinite(n.baseCost) && n.baseCost > 0, 'baseCost ' + n.id);
    assert.ok(Number.isFinite(n.baseRate) && n.baseRate > 0, 'baseRate ' + n.id);
    assert.ok(n.costGrowth > steepestBase, 'costGrowth must beat ' + steepestBase + ': ' + n.id);
    if (i > 0) {
      const prev = NOVA_INJECTORS[i - 1];
      assert.ok(n.tier > prev.tier, 'tier must rise: ' + n.id);
      assert.ok(n.baseCost > prev.baseCost, 'cost must rise: ' + n.id);
      assert.ok(n.baseRate > prev.baseRate, 'rate must rise: ' + n.id);
      assert.ok(n.requires.ascends >= prev.requires.ascends, 'ascend gate must not fall: ' + n.id);
    }
  });
});

test('nova rate: no hidden bonus at 0 cores, exact novaPerCore scaling at 10, base untouched', () => {
  const nova = NOVA_INJECTORS[0];
  const base = INJECTORS[3];
  const st = createState(1);
  st.ascends = 1;
  st.injectors[nova.id] = 1;
  st.injectors[base.id] = 1;
  const gm0 = globalMult(st);
  assert.equal(novaMult(st), 1);
  assert.equal(injectorRate(st, nova.id), nova.baseRate * gm0, 'cores=0 => baseRate * globalMult');
  const baseAt0 = injectorRate(st, base.id) / gm0;

  st.cores = 10;
  const gm10 = globalMult(st);
  const want = 1 + 10 * TUNE.prestige.novaPerCore;
  assert.ok(Math.abs(novaMult(st) - want) < 1e-12);
  const ratio = (injectorRate(st, nova.id) / gm10) / nova.baseRate;
  assert.ok(Math.abs(ratio - want) < 1e-9, 'nova rate x' + ratio + ', want x' + want);
  assert.ok(Math.abs(injectorRate(st, base.id) / gm10 - baseAt0) < 1e-9, 'base family must not get the nova bonus');
});

test('nova is not offered before the first ascend, and is after it', () => {
  const fresh = createState(1);
  fresh.flux = 1e30; fresh.totalFlux = 1e30;
  const s0 = snapshot(fresh);
  assert.ok(!s0.injectors.some((i) => i.family === 'nova'), 'fresh state lists no nova row');
  for (const n of NOVA_INJECTORS) assert.equal(buyInjector(fresh, null, n.id), false, 'cannot buy ' + n.id + ' at 0 ascends');

  const st = createState(1);
  st.ascends = 1;
  st.flux = 1e6;
  const s1 = snapshot(st);
  const offered = s1.injectors.filter((i) => i.family === 'nova' && i.unlocked);
  assert.ok(offered.length >= 1, 'one ascend unlocks at least the first nova tier');
  assert.ok(s1.injectors.filter((i) => i.family === 'base').length === INJECTORS.length, 'base family still listed');
  for (const i of s1.injectors.filter((x) => x.family === 'nova')) {
    const row = NOVA_INJECTORS.find((n) => n.id === i.id);
    if (row.requires.ascends > 1) assert.equal(i.unlocked, false, 'deeper tier waits for more ascends: ' + i.id);
  }
  assert.equal(buyInjector(st, null, NOVA_INJECTORS[0].id), true);
  assert.equal(st.injectors[NOVA_INJECTORS[0].id], 1);
});

test('nova injectors reset on prestige and survive save/load', () => {
  const st = createState(1);
  st.ascends = 1;
  st.injectors[NOVA_INJECTORS[0].id] = 4;
  const back = load(save(st));
  assert.equal(back.injectors[NOVA_INJECTORS[0].id], 4);
  st.runFlux = 1e8;
  doCollapse(st, null);
  for (const n of NOVA_INJECTORS) assert.equal(st.injectors[n.id], 0, 'collapse resets ' + n.id);
});
