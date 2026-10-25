// Prints the bot's flux curve so stage thresholds can be set from data, not hope.
// Usage: node tools/curve.js [cps] [seed]   — cps models the player's real click rate.
import { TUNE } from '../src/core/tune.js';
import { EventBus } from '../src/core/events.js';
import { mulberry32 } from '../src/core/math.js';
import { formatNumber } from '../src/core/format.js';
import * as eco from '../src/core/economy.js';

const MARKS = [10, 20, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 720, 900, 1080, 1200, 1500, 1800, 2100, 2400, 2700, 3000, 3600];
const CPS = Number(process.argv[2] || 6);   // 6 CPS = researched average player
const DT = TUNE.sim.dt;
const rng = mulberry32(Number(process.argv[3] || 42));
const bus = new EventBus();
let s = eco.createState(42);
let snap = eco.snapshot(s);
let buyTimer = 0, pulseTimer = 0, snapTimer = 0, stalledFor = 0, clock = 0;
let next = 0;
const out = [];

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

while (clock < 3600) {
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
      const ok = p.kind === 'injector' ? eco.buyInjector(s, bus, p.id) : eco.buyUpgrade(s, bus, p.id);
      if (!ok) break;
    }
    snap = eco.snapshot(s);
  }
  const pending = eco.shardsFor(s);
  if (eco.canCollapse(s) && (pending >= Math.max(8, Math.ceil(0.25 * s.totalShards)) || stalledFor > 180)) {
    s = eco.doCollapse(s, bus);
  }
  if (eco.canAscend(s)) s = eco.doAscend(s, bus);
  eco.tick(s, DT, bus);
  snapTimer += DT;
  if (snapTimer >= 0.25) {
    snapTimer = 0;
    snap = eco.snapshot(s);
    stalledFor = (snap.injectors.some((i) => i.unlocked && i.affordable) ||
      snap.upgrades.some((u) => u.unlocked && !u.owned && u.affordable)) ? 0 : stalledFor + 0.25;
  }
  while (next < MARKS.length && clock >= MARKS[next]) {
    out.push(`t=${String(MARKS[next]).padStart(5)}s lifetime=${formatNumber(s.lifetimeFlux).padStart(11)} ` +
      `totalFlux=${formatNumber(s.totalFlux).padStart(9)} rate=${formatNumber(eco.totalRate(s)).padStart(9)} ` +
      `stage=${s.stageIndex} shards=${s.totalShards} cores=${s.cores} collapses=${s.collapses}`);
    next++;
  }
  clock += DT;
}
console.log(out.join('\n'));
