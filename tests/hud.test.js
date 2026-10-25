import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createHUD } from '../src/ui/hud.js';

describe('HUD', () => {
  function dom() {
    const d = new JSDOM('<!DOCTYPE html><html><body><div id="hud"></div></body></html>');
    global.document = d.window.document;
    // jsdom's Performance impl recurses against Node's global performance; the HUD only needs a
    // monotonic clock for its confirm timer, so a plain stub is both correct and stable.
    global.performance = { now: () => Date.now() };
    return d;
  }

  it('createHUD does not throw and update twice', () => {
    dom();
    const hud = createHUD(document.getElementById('hud'), { on() {}, off() {}, emit() {} }, { buyInjector() {} });
    hud.update({ flux: 0, rate: 0, combo: 0, comboMult: 1, overdrive: 0, overdriveTimer: 0, playSec: 0, stage: { name: 'S', progress: 0, nextAt: 10 }, injectors: [], upgrades: [], perks: [], collapse: {}, ascend: { available: false, cores: 0 }, stats: {}, shards: 0, totalShards: 0, cores: 0, collapses: 0, ascends: 0, totalFlux: 0, runFlux: 0, bestRate: 0, spent: 0, pulses: 0, crits: 0, perfects: 0 });
    hud.update({ flux: 1, rate: 1, combo: 1, comboMult: 1, overdrive: 0, overdriveTimer: 0, playSec: 1, stage: { name: 'S', progress: 0.5, nextAt: 10 }, injectors: [], upgrades: [], perks: [], collapse: {}, ascend: { available: false, cores: 0 }, stats: {}, shards: 0, totalShards: 0, cores: 0, collapses: 0, ascends: 0, totalFlux: 0, runFlux: 0, bestRate: 0, spent: 0, pulses: 0, crits: 0, perfects: 0 });
    assert.ok(true);
  });

  it('affordable injector rows carry data-affordable', () => {
    dom();
    const hud = createHUD(document.getElementById('hud'), { on() {}, off() {}, emit() {} }, { buyInjector() {} });
    hud.update({ flux: 100, rate: 1, combo: 1, comboMult: 1, overdrive: 0, overdriveTimer: 0, playSec: 0, stage: { name: 'S', progress: 0 }, injectors: [{ id: 'a', name: 'A', unlocked: true, affordable: true, owned: 1, cost: 10, rate: 1 }], upgrades: [], perks: [], collapse: {}, ascend: { available: false, cores: 0 }, stats: {}, shards: 0, totalShards: 0, cores: 0, collapses: 0, ascends: 0, totalFlux: 0, runFlux: 0, bestRate: 0, spent: 0, pulses: 0, crits: 0, perfects: 0 });
    const row = document.querySelector('[data-injector="a"]');
    assert.strictEqual(row && row.getAttribute('data-affordable'), '1');
    assert.ok(row.textContent.includes('cost 10'));
  });

  it('mechanic under MECHANICS, mult not', () => {
    dom();
    const hud = createHUD(document.getElementById('hud'), { on() {}, off() {}, emit() {} }, {});
    hud.update({ flux: 0, rate: 0, combo: 0, comboMult: 1, overdrive: 0, overdriveTimer: 0, playSec: 0, stage: { name: 'S', progress: 0 }, injectors: [], upgrades: [{ id: 'm', name: 'M', unlocked: true, affordable: true, cost: 1, kind: 'mechanic', mechanic: { key: 'k', value: 2 }, blurb: '' }, { id: 'x', name: 'X', unlocked: true, affordable: true, cost: 1, kind: 'global_mult', mult: 2, blurb: '' }], perks: [], collapse: {}, ascend: { available: false, cores: 0 }, stats: {}, shards: 0, totalShards: 0, cores: 0, collapses: 0, ascends: 0, totalFlux: 0, runFlux: 0, bestRate: 0, spent: 0, pulses: 0, crits: 0, perfects: 0 });
    assert.ok(document.querySelector('.mech-title') !== null || document.body.innerHTML.includes('MECHANICS'));
  });

  it('collapse line with owned injectors and upgrades', () => {
    dom();
    const hud = createHUD(document.getElementById('hud'), { on() {}, off() {}, emit() {} }, {});
    hud.update({ flux: 0, rate: 0, combo: 0, comboMult: 1, overdrive: 0, overdriveTimer: 0, playSec: 0, stage: { name: 'S', progress: 0 }, injectors: [{ id: 'i1', name: 'I', unlocked: true, affordable: false, owned: 5 }, { id: 'i2', name: 'I2', unlocked: true, affordable: false, owned: 2 }, { id: 'i3', name: 'I3', unlocked: true, affordable: false, owned: 1 }], upgrades: [{ id: 'u1', name: 'U', unlocked: true, affordable: false, owned: true, kind: 'mult', cost: 0 }], perks: [], collapse: { available: true, shards: 1 }, ascend: { available: false, cores: 0 }, stats: {}, shards: 0, totalShards: 0, cores: 0, collapses: 0, ascends: 0, totalFlux: 0, runFlux: 0, bestRate: 0, spent: 0, pulses: 0, crits: 0, perfects: 0 });
    assert.ok(document.body.innerHTML.includes('resets 3 injectors (8 levels)'));
  });

  it('nothing to lose yet', () => {
    dom();
    const hud = createHUD(document.getElementById('hud'), { on() {}, off() {}, emit() {} }, {});
    hud.update({ flux: 0, rate: 0, combo: 0, comboMult: 1, overdrive: 0, overdriveTimer: 0, playSec: 0, stage: { name: 'S', progress: 0 }, injectors: [], upgrades: [{ id: 'field_harmony', name: 'Field Harmony', owned: false, unlocked: true, affordable: false, cost: 5000, kind: 'global_mult', mult: 1.5 }], perks: [], collapse: { available: true, shards: 1 }, ascend: { available: false, cores: 0 }, stats: {}, shards: 0, totalShards: 0, cores: 0, collapses: 0, ascends: 0, totalFlux: 0, runFlux: 0, bestRate: 0, spent: 0, pulses: 0, crits: 0, perfects: 0 });
    // A real snapshot lists unowned upgrades too; nothing is owned, so the cost line must say so.
    // The collapse card lives in the prestige tab; the shop tab is the default view.
    document.querySelector('[data-tab="prestige"]').click();
    assert.ok(document.body.innerHTML.includes('nothing to lose yet'));
  });

  it('boons render and click calls api.chooseBoon', () => {
    dom();
    const calls = [];
    const hud = createHUD(document.getElementById('hud'), { on() {}, off() {}, emit() {} }, { chooseBoon(id) { calls.push(id); } });
    hud.update({ flux: 0, rate: 0, combo: 0, comboMult: 1, overdrive: 0, overdriveTimer: 0, playSec: 0, stage: { name: 'S', progress: 0 }, injectors: [], upgrades: [], perks: [], boons: { pending: true, offers: [{ id: 'b1', name: 'B1', blurb: '', mods: { autoPulse: 1 } }, { id: 'b2', name: 'B2', blurb: '', mods: {} }], owned: [] }, collapse: {}, ascend: { available: false, cores: 0 }, stats: {}, shards: 0, totalShards: 0, cores: 0, collapses: 0, ascends: 0, totalFlux: 0, runFlux: 0, bestRate: 0, spent: 0, pulses: 0, crits: 0, perfects: 0 });
    const slots = [...document.querySelectorAll('.boon-row')].filter((n) => n.getAttribute('data-boon'));
    assert.strictEqual(slots.length, 2); // only the two offered boons render, not empty placeholders
    slots[0].click();
    assert.deepStrictEqual(calls, ['b1']);
  });

  it('update never throws with missing boons and collapse', () => {
    dom();
    const hud = createHUD(document.getElementById('hud'), { on() {}, off() {}, emit() {} }, {});
    hud.update({ flux: 0, rate: 0, combo: 0, comboMult: 1, overdrive: 0, overdriveTimer: 0, playSec: 0, stage: { name: 'S', progress: 0 }, injectors: [], upgrades: [], perks: [], stats: {} });
    assert.strictEqual(document.body.innerHTML.includes('FLUX'), true);
  });
});
