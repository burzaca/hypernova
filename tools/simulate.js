// HYPERNOVA — headless balance gate. PM-owned: this is the acceptance instrument.
//   node tools/simulate.js [runs] [seed] [maxSeconds]
// A greedy bot plays the real economy at 30 Hz through the PUBLIC API only (snapshot + actions),
// so it measures what the player can actually do. Fails the build on a pacing violation.
import { PACING, TUNE } from '../src/core/tune.js';
import { mulberry32 } from '../src/core/math.js';
import { formatNumber, formatTime } from '../src/core/format.js';
import { EventBus } from '../src/core/events.js';
import * as eco from '../src/core/economy.js';

const RUNS = Number(process.argv[2] || 1);
const SEED = Number(process.argv[3] || 42);
const MAXS = Number(process.argv[4] || 3600);
const DT = TUNE.sim.dt;

// How the bot plays, and why: a real incremental player buys the HIGHEST tier they can afford
// (chasing new tiers is the actual fun of the genre) and buys an upgrade when it beats that
// purchase on efficiency. Buying only the most cost-efficient unit — the naive greedy rule —
// starves progress and is not how anyone plays this.
function bestPurchase(s, snap) {
  const rate = snap.rate;
  let bestInjectors = [];
  for (const inj of snap.injectors) {
    if (!inj.unlocked || !inj.affordable) continue;
    const marginal = inj.owned > 0 ? inj.rate / inj.owned : (inj.baseRate || 0) * eco.globalMult(s);
    bestInjectors.push({ kind: 'injector', id: inj.id, gain: marginal, cost: inj.cost, tier: inj.tier });
  }
  bestInjectors.sort((a, b) => b.tier - a.tier);
  const top = bestInjectors[0] || null;
  const topEff = top ? top.gain / top.cost : 0;

  let bestUp = null;
  for (const up of snap.upgrades) {
    if (!up.unlocked || up.owned || !up.affordable) continue;
    let gain;
    if (up.kind === 'injector_mult') gain = eco.injectorRate(s, up.target) * (up.mult - 1);
    else if (up.kind === 'global_mult') gain = rate * (up.mult - 1);
    else gain = Math.max(rate * 0.25, 1); // mechanic upgrades change the game; value them
    const eff = gain / up.cost;
    if (top && eff < topEff * 0.5) continue; // not worth it versus just buying the next tier
    if (!bestUp || gain > bestUp.gain) bestUp = { kind: 'upgrade', id: up.id, gain, cost: up.cost };
  }
  if (!top) return bestUp;
  if (bestUp && bestUp.gain >= top.gain) return bestUp;
  return top;
}

function anyAffordable(snap) {
  return snap.injectors.some((i) => i.unlocked && i.affordable)
    || snap.upgrades.some((u) => u.unlocked && !u.owned && u.affordable);
}

function run(seed, maxSeconds) {
  const rng = mulberry32(seed);
  const bus = new EventBus();
  let s = eco.createState(seed);
  const t = {
    firstPurchase: null, firstStage: null, firstOverdrive: null,
    firstCollapse: null, secondCollapse: null, firstAscend: null,
    lastPurchaseAt: 0, maxPurchaseGap: 0, maxStall: 0, purchases: 0, stageTimes: {},
  };
  let clock = 0, buyTimer = 0, pulseTimer = 0, snapTimer = 0, stalledFor = 0;
  let snap = eco.snapshot(s);

  while (clock < maxSeconds) {
    const beforeStage = s.stageIndex;
    // click like an engaged player
    pulseTimer += DT;
    if (pulseTimer >= 1 / TUNE.sim.botPulseRate) {
      pulseTimer -= 1 / TUNE.sim.botPulseRate;
      eco.pulse(s, bus);
    }
    // fire the charge ring with human-ish accuracy
    const cs = eco.chargeState(s);
    if (cs.ready) eco.fireCharge(s, bus, (rng() - 0.5) * 2 * cs.window * 0.7);
    // ride overdrive the moment it is charged
    if (s.overdrive >= TUNE.overdrive.need && s.overdriveTimer <= 0) eco.triggerOverdrive(s, bus);

    // spend, every 0.5 s, like an engaged player: keep buying the best value until broke
    buyTimer += DT;
    if (buyTimer >= 0.5) {
      buyTimer = 0;
      for (let guard = 0; guard < 100; guard++) {
        const pick = bestPurchase(s, snap);
        if (!pick) break;
        const ok = pick.kind === 'injector' ? eco.buyInjector(s, bus, pick.id) : eco.buyUpgrade(s, bus, pick.id);
        if (!ok) break;
        t.purchases += 1;
        if (t.firstPurchase === null) t.firstPurchase = clock;
        t.maxPurchaseGap = Math.max(t.maxPurchaseGap, clock - t.lastPurchaseAt);
        t.lastPurchaseAt = clock;
      }
      snap = eco.snapshot(s);
    }

    // prestige decisions — a human collapses for a meaningful gain, not for crumbs
    const pending = eco.shardsFor(s);
    if (eco.canCollapse(s) && (pending >= Math.max(8, Math.ceil(0.25 * s.totalShards)) || stalledFor > 180)) {
      const before = s.collapses;
      s = eco.doCollapse(s, bus);
      if (s.collapses > before) {
        if (t.firstCollapse === null) t.firstCollapse = clock;
        if (s.collapses >= 2 && t.secondCollapse === null) t.secondCollapse = clock;
      }
      stalledFor = 0;
    }
    if (eco.canAscend(s)) {
      s = eco.doAscend(s, bus);
      if (t.firstAscend === null) t.firstAscend = clock;
    }

    eco.tick(s, DT, bus);
    for (let k = beforeStage + 1; k <= s.stageIndex; k++) {
      if (t.stageTimes[k] === undefined) t.stageTimes[k] = clock;
    }
    if (s.stageIndex > beforeStage && t.firstStage === null) t.firstStage = clock;
    if (s.overdriveTimer > 0 && t.firstOverdrive === null) t.firstOverdrive = clock;

    snapTimer += DT;
    if (snapTimer >= 0.25) {
      snapTimer = 0;
      snap = eco.snapshot(s);
      stalledFor = anyAffordable(snap) ? 0 : stalledFor + 0.25;
      t.maxStall = Math.max(t.maxStall || 0, stalledFor);
    }
    clock += DT;
  }
  t.maxPurchaseGap = Math.max(t.maxPurchaseGap, clock - t.lastPurchaseAt);
  t.finalFlux = s.totalFlux;
  t.rate = eco.totalRate(s);
  t.collapses = s.collapses;
  t.ascends = s.ascends;
  t.stages = s.stageIndex;
  return t;
}

const fmt = (sec) => (sec === null || sec === undefined ? 'never' : formatTime(sec));

const rows = [];
const failures = [];
for (let i = 0; i < RUNS; i++) {
  const t = run(SEED + i * 7919, MAXS);
  rows.push(t);
  const chk = (msg, ok) => { if (!ok) failures.push(`run ${i + 1}: ${msg}`); };
  chk(`first purchase ${fmt(t.firstPurchase)} > ${PACING.firstPurchaseMax}s`, (t.firstPurchase ?? 1e9) <= PACING.firstPurchaseMax);
  chk(`first stage ${fmt(t.firstStage)} > ${PACING.firstStageMax}s`, (t.firstStage ?? 1e9) <= PACING.firstStageMax);
  chk(`first overdrive ${fmt(t.firstOverdrive)} > ${PACING.firstOverdriveMax}s`, (t.firstOverdrive ?? 1e9) <= PACING.firstOverdriveMax);
  chk(`longest stretch with nothing affordable ${Math.round(t.maxStall)}s > ${PACING.purchaseGapMax}s`, t.maxStall <= PACING.purchaseGapMax);
  if (t.firstCollapse !== null) {
    chk(`first collapse ${fmt(t.firstCollapse)} outside ${PACING.firstCollapseMin}-${PACING.firstCollapseMax}s`,
      t.firstCollapse >= PACING.firstCollapseMin && t.firstCollapse <= PACING.firstCollapseMax);
  } else {
    failures.push(`run ${i + 1}: never reached a collapse in ${MAXS}s`);
  }
  if (t.firstAscend !== null) {
    chk(`first ascend ${fmt(t.firstAscend)} outside ${PACING.firstAscendMin}-${PACING.firstAscendMax}s`,
      t.firstAscend >= PACING.firstAscendMin && t.firstAscend <= PACING.firstAscendMax);
  } else {
    failures.push(`run ${i + 1}: never reached an ascend in ${MAXS}s`);
  }
  for (const [atSec, minStages] of (PACING.minStagesBy || [])) {
    const reached = t.stageTimes[minStages];
    chk(`stage ${minStages} ${fmt(reached)} later than ${atSec}s`, reached !== undefined && reached <= atSec);
  }
}

console.log(`HYPERNOVA balance sim — runs=${RUNS} seed=${SEED} maxSeconds=${MAXS}`);
console.log('run  1stBuy  1stStage  1stOD  1stCollapse  2ndCollapse  1stAscend  maxGap  stages  collapses  ascends    finalFlux        rate');
rows.forEach((t, i) => {
  console.log([
    String(i + 1).padStart(3), fmt(t.firstPurchase).padStart(6), fmt(t.firstStage).padStart(8),
    fmt(t.firstOverdrive).padStart(6), fmt(t.firstCollapse).padStart(11),
    fmt(t.secondCollapse).padStart(11), fmt(t.firstAscend).padStart(9),
    String(Math.round(t.maxStall) + 's').padStart(6), String(t.stages).padStart(7),
    String(t.collapses).padStart(9), String(t.ascends).padStart(7),
    formatNumber(t.finalFlux).padStart(12), formatNumber(t.rate).padStart(10),
  ].join(' '));
});

if (failures.length) {
  console.log('\nPACING CONTRACT FAILED:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('\npacing contract: PASS');
