// Debug: what does the collapse card actually render with nothing owned?
import { JSDOM } from 'jsdom';
import { createHUD } from '../src/ui/hud.js';

const d = new JSDOM('<!DOCTYPE html><html><body><div id="hud"></div></body></html>');
global.document = d.window.document;
global.performance = { now: () => Date.now() };

const hud = createHUD(document.getElementById('hud'), { on() {}, off() {}, emit() {} }, {});
hud.update({
  flux: 0, rate: 0, combo: 0, comboMult: 1, overdrive: 0, overdriveTimer: 0, playSec: 0,
  stage: { name: 'S', progress: 0 }, injectors: [], upgrades: [], perks: [],
  collapse: { available: true, shards: 1 }, ascend: { available: false, cores: 0 },
  stats: {}, shards: 0, totalShards: 0, cores: 0, collapses: 0, ascends: 0,
  totalFlux: 0, runFlux: 0, bestRate: 0, spent: 0, pulses: 0, crits: 0, perfects: 0,
});
const cards = [...document.querySelectorAll('[data-available]')];
for (const c of cards) console.log('CARD', JSON.stringify(c.getAttribute('data-available')), '::', c.textContent.replace(/\s+/g, ' ').slice(0, 160));
console.log('has phrase:', document.body.innerHTML.includes('nothing to lose yet'));
