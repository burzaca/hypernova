// Fit the STAGES ladder to TARGET stage times by measuring the real economy.
// Each pass records lifetimeFlux at the target times, then sets each threshold to that value
// (damped). Thresholds feed back into growth (stage index scales pulse tier), so this iterates.
//   node tools/fit-stages.js [cps] [passes]
import { readFileSync, writeFileSync } from 'node:fs';
import { TUNE } from '../src/core/tune.js';
import { EventBus } from '../src/core/events.js';
import { mulberry32 } from '../src/core/math.js';
import { formatNumber, formatTime } from '../src/core/format.js';
import * as eco from '../src/core/economy.js';

// What the player should feel: first new form in ~15 s, then a steady drip, final authored form
// at ~40 minutes of engaged play at the researched average click rate (6 CPS).
const TARGETS = [0, 15, 40, 75, 120, 210, 330, 480, 660, 840, 1080, 1380, 1700, 2100, 2400];
const CPS = Number(process.argv[2] || 6);
const PASSES = Number(process.argv[3] || 4);
const DAMP = 0.75;
const DT = TUNE.sim.dt;
const PATH = 'src/core/content.js';

function bestPurchase(s, snap) {
  const rate = snap.rate;
  const list = [];
  for (const inj of snap.injectors) {
    if (!inj.unlocked || !inj.affordable) continue;
    const marginal = inj.owned > 0 ? inj.rate / inj.owned : (inj.baseRate || 0) * eco.globalMult(s);
    list.push({ kind: 'injector', id: inj.id, gain: marginal, cost: inj.cost, tier: inj.tier });
  }
  list.sort((a, b) => b.tier - a.tier);
  const top = list[0] || null;
  const topEff = top ? top.gain / top.cost : 0;
  let bestUp = null;
  for (const up of snap.upgrades) {
    if (!up.unlocked || up.owned || !up.affordable) continue;
    let gain;
    if (up.kind === 'injector_mult') gain = eco.injectorRate(s, up.target) * (up.mult - 1);
    else if (up.kind === 'global_mult') gain = rate * (up.mult - 1);
    else gain = Math.max(rate * 0.25, 1);
    if (top && gain / up.cost < topEff * 0.5) continue;
    if (!bestUp || gain > bestUp.gain) bestUp = { kind: 'upgrade', id: up.id, gain, cost: up.cost };
  }
  if (!top) return bestUp;
  if (bestUp && bestUp.gain >= top.gain) return bestUp;
  return top;
}

function measure(thresholds) {
  // lifetimeFlux at each target time, with the ladder currently in the file.
  const rng = mulberry32(42);
  const bus = new EventBus();
  let s = eco.createState(42);
  let snap = eco.snapshot(s);
  let buyTimer = 0, pulseTimer = 0, snapTimer = 0, stalledFor = 0, clock = 0, next = 1;
  const seen = new Array(TARGETS.length).fill(null);
  const maxT = TARGETS[TARGETS.length - 1] + 60;
  while (clock < maxT) {
    pulseTimer += DT;
    if (pulseTimer >= 1 / CPS) { pulseTimer -= 1 / CPS; eco.pulse(s, bus); }
    const cs = eco.chargeState(s);
    if (cs.ready) eco.fireCharge(s, bus, (rng() - 0.5) * 2 * cs.window * 0.7);
    if (s.overdrive >= TUNE.overdrive.need && s.overdriveTimer <= 0) eco.triggerOverdrive(s, bus);
    buyTimer += DT;
    if (buyTimer >= 0.5) {
      buyTimer = 0;
      for (let g = 0; g < 100; g++) {
        const p = bestPurchase(s, snap);
        if (!p) break;
        if (p.kind === 'injector') { if (!eco.buyInjector(s, bus, p.id)) break; }
        else if (!eco.buyUpgrade(s, bus, p.id)) break;
      }
      snap = eco.snapshot(s);
    }
    if (eco.canCollapse(s) && (eco.shardsFor(s) >= Math.max(8, Math.ceil(0.25 * s.totalShards)) || stalledFor > 180)) s = eco.doCollapse(s, bus);
    if (eco.canAscend(s)) s = eco.doAscend(s, bus);
    eco.tick(s, DT, bus);
    snapTimer += DT;
    if (snapTimer >= 0.25) {
      snapTimer = 0;
      snap = eco.snapshot(s);
      stalledFor = (snap.injectors.some((i) => i.unlocked && i.affordable) ||
        snap.upgrades.some((u) => u.unlocked && !u.owned && u.affordable)) ? 0 : stalledFor + 0.25;
    }
    while (next < TARGETS.length && clock >= TARGETS[next]) { seen[next] = s.lifetimeFlux; next++; }
    clock += DT;
  }
  return seen;
}

function writeThresholds(vals) {
  let src = readFileSync(PATH, 'utf8');
  const start = src.indexOf('export const STAGES = [');
  const end = src.indexOf('\n];', start);
  if (start < 0 || end < 0) { console.error('STAGES block not found'); process.exit(1); }
  let i = 0;
  const block = src.slice(start, end).replace(/at: [0-9e.]+,/g, () => `at: ${vals[i++]},`);
  if (i !== vals.length) { console.error(`replaced ${i}, expected ${vals.length}`); process.exit(1); }
  writeFileSync(PATH, src.slice(0, start) + block + src.slice(end));
}

function readThresholds() {
  const src = readFileSync(PATH, 'utf8');
  const start = src.indexOf('export const STAGES = [');
  const end = src.indexOf('\n];', start);
  return [...src.slice(start, end).matchAll(/at: ([0-9e.]+),/g)].map((m) => Number(m[1]));
}

const round = (x) => {
  if (!Number.isFinite(x) || x <= 0) return 1;
  const e = Math.floor(Math.log10(x));
  return Number((Math.round(x / 10 ** (e - 1)) * 10 ** (e - 1)).toPrecision(3));
};

for (let pass = 0; pass < PASSES; pass++) {
  const cur = readThresholds();
  const seen = measure(cur);
  const nextVals = cur.map((v, i) => {
    if (i === 0) return 0;
    const target = seen[i];
    if (target === null || !Number.isFinite(target) || target <= 0) return v; // never reached: leave
    const blended = v * (1 - DAMP) + target * DAMP;
    return Math.max(round(blended), cur[i - 1] + 1);
  });
  writeThresholds(nextVals);
  console.log(`pass ${pass + 1}: ${nextVals.slice(1).map((v) => formatNumber(v)).join(' ')}`);
}
console.log('\nfinal ladder written. verify with: node tools/simulate.js 1 42 3600 6');
