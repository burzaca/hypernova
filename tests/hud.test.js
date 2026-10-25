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
    hud.update({ flux: 0, rate: 0, combo: 0, comboMult: 1, overdrive: 0, overdriveTimer: 0, playSec: 0, stage: { name: 'S', progress: 0 }, injectors: [{ id: 'i1', name: 'I', unlocked: true, affordable: false, owned: 5 }, { id: 'i2', name: 'I2', unlocked: true, affordable: false, owned: 2 }, { id: 'i3', name: 'I3', unlocked: true, affordable: false, owned: 1 }], upgrades: [], ownedUpgrades: [{ id: 'u1', name: 'U', kind: 'global_mult', mult: 2 }], perks: [], collapse: { available: true, shards: 1 }, ascend: { available: false, cores: 0 }, stats: {}, shards: 0, totalShards: 0, cores: 0, collapses: 0, ascends: 0, totalFlux: 0, runFlux: 0, bestRate: 0, spent: 0, pulses: 0, crits: 0, perfects: 0 });
    assert.ok(document.body.innerHTML.includes('resets 3 injectors (8 levels)'));
    // The shop list never contains owned upgrades, so the count has to come from ownedUpgrades.
    assert.ok(document.body.innerHTML.includes('1 upgrades'));
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

  it('owned upgrades stay visible in the upgrades tab', () => {
    dom();
    const hud = createHUD(document.getElementById('hud'), { on() {}, off() {}, emit() {} }, {});
    hud.update({ flux: 0, rate: 0, combo: 0, comboMult: 1, overdrive: 0, overdriveTimer: 0, playSec: 0, stage: { name: 'S', progress: 0 }, injectors: [], upgrades: [], ownedUpgrades: [{ id: 'field_harmony', name: 'Field Harmony', kind: 'global_mult', mult: 1.5, blurb: 'x1.5 all flux' }], perks: [], collapse: {}, ascend: { available: false, cores: 0 }, stats: {}, shards: 0, totalShards: 0, cores: 0, collapses: 0, ascends: 0, totalFlux: 0, runFlux: 0, bestRate: 0, spent: 0, pulses: 0, crits: 0, perfects: 0 });
    const owned = document.querySelector('.upg-owned');
    assert.ok(owned, 'an OWNED section must exist');
    assert.strictEqual(owned.hidden, false);
    assert.ok(owned.textContent.includes('Field Harmony'), 'the purchase must stay visible');
  });

  it('the per-pulse readout reflects overdrive', () => {
    dom();
    const hud = createHUD(document.getElementById('hud'), { on() {}, off() {}, emit() {} }, {});
    const base = { flux: 10, rate: 4, combo: 0, comboMult: 1, overdrive: 0, overdriveTimer: 0, playSec: 0, stage: { name: 'S', progress: 0 }, injectors: [], upgrades: [], ownedUpgrades: [], perks: [], collapse: {}, ascend: { available: false, cores: 0 }, stats: {}, shards: 0, totalShards: 0, cores: 0, collapses: 0, ascends: 0, totalFlux: 0, runFlux: 0, bestRate: 0, spent: 0, pulses: 0, crits: 0, perfects: 0 };
    hud.update({ ...base, pulseValue: 10 });
    const el = document.querySelector('.flux-pulse');
    assert.ok(el, 'the click value must be shown');
    assert.ok(el.textContent.includes('per pulse 10'));
    hud.update({ ...base, pulseValue: 80, overdriveTimer: 5 });
    assert.ok(el.textContent.includes('per pulse 80'), 'the shown value must follow the engine');
    assert.strictEqual(el.dataset.boost, '1');
  });

  it('Space never buys from a focused row; Enter does, and a click leaves no focus behind', () => {
    const d = dom();
    const calls = [];
    const hud = createHUD(document.getElementById('hud'), { on() {}, off() {}, emit() {} }, { buyInjector: (id) => { calls.push(id); return true; } });
    hud.update({ flux: 100, rate: 1, combo: 0, comboMult: 1, overdrive: 0, overdriveTimer: 0, playSec: 0, stage: { name: 'S', progress: 0 }, injectors: [{ id: 'a', name: 'A', unlocked: true, affordable: true, owned: 0, cost: 10, rate: 1, bundle: 1 }], upgrades: [], ownedUpgrades: [], perks: [], collapse: {}, ascend: { available: false, cores: 0 }, stats: {}, shards: 0, totalShards: 0, cores: 0, collapses: 0, ascends: 0, totalFlux: 0, runFlux: 0, bestRate: 0, spent: 0, pulses: 0, crits: 0, perfects: 0 });
    const row = document.querySelector('[data-injector="a"]');
    assert.ok(row, 'the row must render');
    row.focus();
    row.dispatchEvent(new d.window.KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    assert.deepStrictEqual(calls, [], 'Space must not buy — the player is told Space is the charge ring');
    row.dispatchEvent(new d.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.deepStrictEqual(calls, ['a'], 'Enter must still activate the focused row');
    row.click();
    assert.notEqual(document.activeElement, row, 'a mouse click must not leave focus that captures the next key');
  });

  it('update never throws with missing boons and collapse', () => {
    dom();
    const hud = createHUD(document.getElementById('hud'), { on() {}, off() {}, emit() {} }, {});
    hud.update({ flux: 0, rate: 0, combo: 0, comboMult: 1, overdrive: 0, overdriveTimer: 0, playSec: 0, stage: { name: 'S', progress: 0 }, injectors: [], upgrades: [], perks: [], stats: {} });
    assert.strictEqual(document.body.innerHTML.includes('FLUX'), true);
  });
});
