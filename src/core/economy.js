// HYPERNOVA — economy: the pure game-state engine (INTERFACES.md §6).
// No DOM, no three.js, no Math.random(), no console output. Node 24 + Chrome.
//
// Every number that reaches the state goes through fin()/safeAdd(), so NaN/Infinity can never
// leak into flux: a non-finite computation is clamped to 0 (or to Number.MAX_VALUE for costs)
// and the game keeps going.
import { INJECTORS, UPGRADES, STAGES, PERKS, ACHIEVEMENTS } from './content.js';
import { TUNE } from './tune.js';
import { clamp } from './math.js';
import { EVT } from './events.js';

const SAVE_VERSION = 1;
const TAU = Math.PI * 2;
const ACH_INTERVAL = 0.25; // checkAchievements runs from tick() at most 4x per second

// ---------------------------------------------------------------- content (defensive) ----
const arr = (a) => (Array.isArray(a) ? a.filter((r) => r && typeof r === 'object' && typeof r.id === 'string') : []);
const INJ = arr(INJECTORS);
const UPG = arr(UPGRADES);
const STG = arr(STAGES);
const PRK = arr(PERKS);
const ACH = arr(ACHIEVEMENTS);
const byId = (rows) => {
  const m = new Map();
  for (const r of rows) if (!m.has(r.id)) m.set(r.id, r);
  return m;
};
const INJ_BY_ID = byId(INJ);
const UPG_BY_ID = byId(UPG);
const PRK_BY_ID = byId(PRK);

// ---------------------------------------------------------------- numeric guards ----------
/** Finite number or fallback; also normalises -0 to 0 so JSON round-trips stay exact. */
function fin(n, fallback = 0) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return n === 0 ? 0 : n;
}
const num = (v, d = 0) => fin(typeof v === 'number' ? v : d, d);
/** Add without ever producing Infinity: saturates at Number.MAX_VALUE. */
function safeAdd(a, b) {
  const r = fin(a) + fin(b);
  return Number.isFinite(r) ? fin(r) : Number.MAX_VALUE;
}

// Transient, non-saved per-state bookkeeping (accumulators). Kept outside GameState so the
// state keeps its exact documented shape and save()/load() round-trips exactly.
const transient = new WeakMap();
function tr(state) {
  let t = transient.get(state);
  if (!t) {
    t = { autoAcc: 0, achAcc: ACH_INTERVAL };
    transient.set(state, t);
  }
  return t;
}

// ---------------------------------------------------------------- state ------------------
export function createState(seed = 1) {
  const injectors = {};
  for (const inj of INJ) injectors[inj.id] = 0;
  return {
    v: SAVE_VERSION,
    seed: fin(seed, 1),
    flux: 0, totalFlux: 0, runFlux: 0, lifetimeFlux: 0,
    injectors,
    upgrades: {}, perks: {}, achievements: {},
    shards: 0, totalShards: 0, collapses: 0,
    cores: 0, ascends: 0,
    combo: 0, comboTimer: 0,
    overdrive: 0, overdriveTimer: 0, overdrives: 0,
    charge: { angle: 0, cooldown: 0, hits: 0, perfects: 0 },
    stageIndex: 0,
    stats: { pulses: 0, crits: 0, perfects: 0, playSec: 0, bestRate: 0, spent: 0 },
    lastSave: 0,
  };
}

function gainFlux(state, amount) {
  const a = fin(amount);
  if (a <= 0) return 0;
  state.flux = safeAdd(state.flux, a);
  state.totalFlux = safeAdd(state.totalFlux, a);
  state.runFlux = safeAdd(state.runFlux, a);
  // lifetimeFlux is never reset by any prestige: it is what the STAGE ladder keys on, so the
  // star you built stays built. That permanence is the visual reward the whole game is built on.
  state.lifetimeFlux = safeAdd(state.lifetimeFlux, a);
  return a;
}
function spend(state, cost) {
  state.flux = Math.max(0, fin(state.flux - cost));
  state.stats.spent = safeAdd(state.stats.spent, cost);
}
const emit = (bus, evt, payload) => {
  if (bus && typeof bus.emit === 'function') bus.emit(evt, payload);
};

// ---------------------------------------------------------------- mechanics --------------
// mechanicValue(state, key) — how owned upgrades (kind 'mechanic') and owned perks combine:
//  * ADDITIVE keys: base + sum of contributions.
//      autoPulse         base 0                         (auto pulses per second)
//      overdriveDuration base TUNE.overdrive.duration   (seconds)
//      overdriveMult     base TUNE.overdrive.mult       (×, while overdrive is active)
//      chainSurge        base 0                         (extra orbs per crit, +50% crit each)
//      critMult          base 1                         (crit = critBase * pulseGain * critMult)
//      autoCollapse      base 0                         (>0 enables auto-collapse)
//  * FRACTIONAL keys: base + sum of contributions, clamped to [0, 0.9].
//      comboRetention    base 0   (combo decay rate is multiplied by 1 - value)
//      chargeWindow      base 0   (hit window is multiplied by 1 + value)
//      offlineFrac       base TUNE.save.offlineFrac (share of rate credited while away)
//  * MULTIPLICATIVE key: fluxMult, base 1, product of factors. A contribution v >= 1 is read
//      as "×v", a contribution 0 < v < 1 as "+v" (×(1+v)) — the most favourable reading, so a
//      perk can never act as a nerf; v <= 0 is ignored.
// With nothing owned the base value from TUNE is returned unchanged.
const BASES = {
  autoPulse: () => 0,
  overdriveDuration: () => num(TUNE.overdrive && TUNE.overdrive.duration, 12),
  overdriveMult: () => num(TUNE.overdrive && TUNE.overdrive.mult, 1),
  chainSurge: () => 0,
  critMult: () => 1,
  autoCollapse: () => 0,
  comboRetention: () => 0,
  chargeWindow: () => 0,
  offlineFrac: () => num(TUNE.save && TUNE.save.offlineFrac, 0),
  fluxMult: () => 1,
};
const FRACTIONAL = new Set(['comboRetention', 'chargeWindow', 'offlineFrac']);
const MULTIPLICATIVE = new Set(['fluxMult']);

function contributions(state, key) {
  const out = [];
  for (const id of Object.keys(state.upgrades || {})) {
    if (state.upgrades[id] !== true) continue;
    const u = UPG_BY_ID.get(id);
    if (u && u.kind === 'mechanic' && u.mechanic && u.mechanic.key === key) {
      const v = fin(u.mechanic.value, NaN);
      if (Number.isFinite(v)) out.push(v);
    }
  }
  for (const id of Object.keys(state.perks || {})) {
    if (state.perks[id] !== true) continue;
    const p = PRK_BY_ID.get(id);
    if (p && p.effect && p.effect.key === key) {
      const v = fin(p.effect.value, NaN);
      if (Number.isFinite(v)) out.push(v);
    }
  }
  return out;
}

export function mechanicValue(state, key) {
  const base = BASES[key] ? BASES[key]() : 0;
  const parts = contributions(state, key);
  if (parts.length === 0) return base;
  if (MULTIPLICATIVE.has(key)) {
    let m = base;
    for (const v of parts) if (v > 0) m *= v >= 1 ? v : 1 + v;
    return fin(m, base);
  }
  let s = base;
  for (const v of parts) s += v;
  if (FRACTIONAL.has(key)) return clamp(fin(s), 0, 0.9);
  return fin(s, base);
}

// ---------------------------------------------------------------- multipliers -----------
function stageMult(state) {
  // Optional knob: TUNE.stage.multPerIndex (absent => 1). Stage power otherwise shows up in
  // pulseGain via TUNE.pulse.tierPerStage.
  const per = num(TUNE.stage && TUNE.stage.multPerIndex, 0);
  return Math.max(0, 1 + per * fin(state.stageIndex));
}
function upgradeGlobalMult(state) {
  let m = 1;
  for (const id of Object.keys(state.upgrades || {})) {
    if (state.upgrades[id] !== true) continue;
    const u = UPG_BY_ID.get(id);
    if (u && u.kind === 'global_mult') {
      const v = fin(u.mult, 1);
      if (v > 0) m *= v;
    }
  }
  return fin(m, 1);
}
function globalMultInner(state, includeOverdrive) {
  const P = TUNE.prestige || {};
  const shardF = 1 + Math.max(0, fin(state.totalShards)) * num(P.shardGainPct, 0);
  const coreF = Math.pow(1 + num(P.coreGainPct, 0), Math.max(0, fin(state.cores)));
  let m = stageMult(state) * mechanicValue(state, 'fluxMult') * upgradeGlobalMult(state) * shardF * coreF;
  if (includeOverdrive && fin(state.overdriveTimer) > 0) m *= Math.max(1, mechanicValue(state, 'overdriveMult'));
  return Math.max(0, fin(m, 1));
}
export function globalMult(state) {
  return globalMultInner(state, true);
}

// ---------------------------------------------------------------- injectors -------------
export function injectorCost(state, id) {
  const inj = INJ_BY_ID.get(id);
  if (!inj) return Number.MAX_VALUE;
  const owned = Math.max(0, fin(state.injectors && state.injectors[id]));
  const c = num(inj.baseCost, 0) * Math.pow(num(inj.costGrowth, 1), owned);
  return Number.isFinite(c) ? Math.max(0, c) : Number.MAX_VALUE;
}
function injectorMult(state, id) {
  let m = 1;
  for (const uid of Object.keys(state.upgrades || {})) {
    if (state.upgrades[uid] !== true) continue;
    const u = UPG_BY_ID.get(uid);
    if (u && u.kind === 'injector_mult' && u.target === id) {
      const v = fin(u.mult, 1);
      if (v > 0) m *= v;
    }
  }
  return fin(m, 1);
}
function injectorRateInner(state, id, gm) {
  const inj = INJ_BY_ID.get(id);
  if (!inj) return 0;
  const owned = Math.max(0, fin(state.injectors && state.injectors[id]));
  return Math.max(0, fin(owned * num(inj.baseRate, 0) * injectorMult(state, id) * gm));
}
/** Total flux/s produced by that injector kind, all multipliers included. */
export function injectorRate(state, id) {
  return injectorRateInner(state, id, globalMult(state));
}
function totalRateInner(state, includeOverdrive) {
  const gm = globalMultInner(state, includeOverdrive);
  let r = 0;
  for (const inj of INJ) r += injectorRateInner(state, inj.id, gm);
  return Math.max(0, fin(r));
}
export function totalRate(state) {
  return totalRateInner(state, true);
}
function injectorUnlocked(state, inj) {
  return fin(state.injectors[inj.id]) > 0 || fin(state.totalFlux) >= num(inj.unlockAt, 0);
}

// ---------------------------------------------------------------- requirements ----------
function counter(state, key) {
  switch (key) {
    case 'injectorsTotal': {
      let n = 0;
      for (const k of Object.keys(state.injectors || {})) n += fin(state.injectors[k]);
      return n;
    }
    case 'upgradesOwned':
      return Object.keys(state.upgrades || {}).filter((k) => state.upgrades[k] === true).length;
    case 'pulses': case 'crits': case 'perfects': case 'playSec':
      return fin(state.stats[key]);
    default:
      return typeof state[key] === 'number' ? fin(state[key])
        : (state.stats && typeof state.stats[key] === 'number' ? fin(state.stats[key]) : 0);
  }
}
/** Generic `requires` / `at` check: { injector, count } or numeric counters (all must hold). */
function meets(state, req) {
  if (!req || typeof req !== 'object') return true;
  for (const key of Object.keys(req)) {
    if (key === 'count') continue;
    if (key === 'injector') {
      const have = fin(state.injectors && state.injectors[req.injector]);
      if (have < num(req.count, 1)) return false;
      continue;
    }
    const need = req[key];
    if (typeof need !== 'number') continue;
    if (counter(state, key) < need) return false;
  }
  return true;
}

// ---------------------------------------------------------------- pulse & combo ---------
function comboMult(state) {
  return 1 + Math.max(0, fin(state.combo)) * num(TUNE.combo.perCombo, 0);
}
export function pulseGain(state) {
  const base = num(TUNE.pulse.base, 1) * (1 + fin(state.stageIndex) * num(TUNE.pulse.tierPerStage, 0));
  return Math.max(0, fin(base * comboMult(state) * globalMult(state)));
}
export function critGain(state) {
  return Math.max(0, fin(num(TUNE.charge.critBase, 1) * pulseGain(state) * mechanicValue(state, 'critMult')));
}
function fillOverdrive(state, amount) {
  if (fin(state.overdriveTimer) > 0) return; // the meter refills only after the window ends
  const need = num(TUNE.overdrive.need, 100);
  state.overdrive = clamp(fin(state.overdrive) + fin(amount), 0, need);
}

export function pulse(state, bus) {
  const gain = pulseGain(state);
  if (!(gain > 0)) return 0;
  gainFlux(state, gain);
  state.combo = Math.min(num(TUNE.combo.maxCombo, 50), fin(state.combo) + 1);
  state.comboTimer = num(TUNE.combo.window, 1);
  fillOverdrive(state, num(TUNE.overdrive.gainPerPulse, 0));
  state.stats.pulses = fin(state.stats.pulses) + 1;
  emit(bus, EVT.PULSE, { gain, combo: state.combo, comboMult: comboMult(state), auto: false });
  checkStage(state, bus);
  return gain;
}

// ---------------------------------------------------------------- charge ring -----------
function chargeSpeed(state) {
  // Sweep rises gently with stage (design §1B: "sweep speed rises with tier").
  const per = num(TUNE.charge.speedPerStage, 0.03);
  return num(TUNE.charge.speed, 1.5) * (1 + per * fin(state.stageIndex));
}
function chargeWindow(state) {
  return num(TUNE.charge.window, 0.2) * (1 + mechanicValue(state, 'chargeWindow'));
}
export function chargeState(state) {
  const cd = Math.max(0, fin(state.charge.cooldown));
  return {
    angle: fin(state.charge.angle),
    window: chargeWindow(state),
    perfectFrac: num(TUNE.charge.perfectFrac, 0.25),
    ready: cd <= 0,
    cooldownLeft: cd,
  };
}

/** offset in -1..1, 0 = dead centre. Returns flux gained (0 on miss / not ready). */
export function fireCharge(state, bus, offset) {
  const cs = chargeState(state);
  if (!cs.ready) return 0;
  state.charge.cooldown = num(TUNE.charge.cooldown, 0.35);
  const off = typeof offset === 'number' && Number.isFinite(offset) ? Math.abs(offset) : Infinity;
  if (off > cs.window) {
    const pen = clamp(num(TUNE.charge.missComboPenalty, 0.25), 0, 1);
    state.combo = Math.max(0, fin(state.combo * (1 - pen)));
    emit(bus, EVT.LOG, { kind: 'miss', combo: state.combo, offset: fin(offset) });
    return 0;
  }
  const perfect = off <= cs.window * cs.perfectFrac;
  const orbs = Math.max(0, Math.floor(mechanicValue(state, 'chainSurge')));
  let gain = critGain(state) * (perfect ? 2 : 1) * (1 + 0.5 * orbs);
  gain = gainFlux(state, gain);
  state.combo = Math.min(num(TUNE.combo.maxCombo, 50), fin(state.combo) + num(TUNE.charge.comboOnHit, 5));
  state.comboTimer = num(TUNE.combo.window, 1);
  fillOverdrive(state, num(TUNE.charge.overdriveOnHit, num(TUNE.overdrive.gainPerCrit, 9)));
  state.charge.hits = fin(state.charge.hits) + 1;
  state.stats.crits = fin(state.stats.crits) + 1;
  if (perfect) {
    state.charge.perfects = fin(state.charge.perfects) + 1;
    state.stats.perfects = fin(state.stats.perfects) + 1;
  }
  emit(bus, EVT.CRIT, { gain, perfect, orbs, combo: state.combo });
  if (perfect) emit(bus, EVT.PERFECT, { gain, orbs });
  checkStage(state, bus);
  return gain;
}

// ---------------------------------------------------------------- overdrive -------------
export function triggerOverdrive(state, bus) {
  if (fin(state.overdriveTimer) > 0) return false;
  if (fin(state.overdrive) < num(TUNE.overdrive.need, 100)) return false;
  const duration = Math.max(0.1, mechanicValue(state, 'overdriveDuration'));
  state.overdrive = 0;
  state.overdriveTimer = duration;
  state.overdrives = fin(state.overdrives) + 1;
  emit(bus, EVT.OVERDRIVE_START, { duration, mult: mechanicValue(state, 'overdriveMult') });
  return true;
}

// ---------------------------------------------------------------- stages ----------------
export function stageFor(state) {
  if (STG.length === 0) return null;
  return STG[clamp(Math.floor(fin(state.stageIndex)), 0, STG.length - 1)];
}
function checkStage(state, bus) {
  while (state.stageIndex + 1 < STG.length && fin(state.lifetimeFlux) >= num(STG[state.stageIndex + 1].at, Infinity)) {
    state.stageIndex += 1;
    const s = STG[state.stageIndex];
    emit(bus, EVT.STAGE_UP, { index: state.stageIndex, id: s.id, name: s.name });
  }
}

// ---------------------------------------------------------------- purchases -------------
export function buyInjector(state, bus, id) {
  const inj = INJ_BY_ID.get(id);
  if (!inj || !injectorUnlocked(state, inj)) return false;
  const cost = injectorCost(state, id);
  if (!(cost < Number.MAX_VALUE) || fin(state.flux) < cost) return false;
  spend(state, cost);
  state.injectors[id] = fin(state.injectors[id]) + 1;
  emit(bus, EVT.BUY, { type: 'injector', id, owned: state.injectors[id], cost });
  return true;
}
function upgradeUnlocked(state, u) {
  return meets(state, u.requires);
}
export function buyUpgrade(state, bus, id) {
  const u = UPG_BY_ID.get(id);
  if (!u || state.upgrades[id] === true || !upgradeUnlocked(state, u)) return false;
  const cost = Math.max(0, num(u.cost, Infinity));
  if (!Number.isFinite(cost) || fin(state.flux) < cost) return false;
  spend(state, cost);
  state.upgrades[id] = true;
  emit(bus, EVT.BUY, { type: 'upgrade', id, cost, kind: u.kind });
  if (EVT.UPGRADE) emit(bus, EVT.UPGRADE, { id, kind: u.kind });
  return true;
}
function perkAffordable(state, p) {
  const cost = Math.max(0, num(p.cost, Infinity));
  return state.perks[p.id] !== true && meets(state, p.requires) && Number.isFinite(cost) && fin(state.shards) >= cost;
}
export function buyPerk(state, bus, id) {
  const p = PRK_BY_ID.get(id);
  if (!p || !perkAffordable(state, p)) return false;
  const cost = Math.max(0, num(p.cost, 0));
  state.shards = Math.max(0, fin(state.shards - cost));
  state.perks[id] = true;
  emit(bus, EVT.BUY, { type: 'perk', id, cost });
  return true;
}

// ---------------------------------------------------------------- prestige --------------
export function shardsFor(state) {
  const P = TUNE.prestige;
  const r = Math.max(0, fin(state.runFlux)) / num(P.shardDiv, 1e6);
  return Math.max(0, Math.floor(fin(Math.pow(r, num(P.shardExp, 0.5)))));
}
export function canCollapse(state) {
  return shardsFor(state) >= 1;
}
function resetRun(state) {
  for (const inj of INJ) state.injectors[inj.id] = 0;
  for (const k of Object.keys(state.injectors)) state.injectors[k] = 0;
  state.flux = 0;
  state.runFlux = 0;
  state.upgrades = {};
  state.combo = 0;
  state.comboTimer = 0;
  state.overdrive = 0;
  state.overdriveTimer = 0;
  state.charge.angle = 0;
  state.charge.cooldown = 0;
  const t = tr(state);
  t.autoAcc = 0;
}
/** Layer 1: reset flux/injectors/upgrades, keep stage (totalFlux), gain Shards. */
export function doCollapse(state, bus) {
  const gained = shardsFor(state);
  if (gained < 1) return state;
  const wasOverdrive = fin(state.overdriveTimer) > 0;
  resetRun(state);
  state.shards = safeAdd(state.shards, gained);
  state.totalShards = safeAdd(state.totalShards, gained);
  state.collapses = fin(state.collapses) + 1;
  if (wasOverdrive) emit(bus, EVT.OVERDRIVE_END, { reason: 'collapse' });
  emit(bus, EVT.COLLAPSE, { shards: gained, totalShards: state.totalShards, collapses: state.collapses });
  return state;
}
export function coresFor(state) {
  const P = TUNE.prestige;
  const r = Math.max(0, fin(state.totalFlux)) / num(P.ascendAt, 1e15);
  return Math.max(0, Math.floor(fin(Math.pow(r, num(P.coreExp, 0.4)))));
}
export function canAscend(state) {
  return fin(state.totalFlux) >= num(TUNE.prestige.ascendAt, 1e15) && coresFor(state) >= 1;
}
/** Layer 2: reset everything incl. Shards, perks and totalFlux; gain Nova Cores.
 *  Stages, achievements, lifetime stats and counters (collapses/overdrives/ascends) persist:
 *  the star you grew is permanent progress. */
export function doAscend(state, bus) {
  if (!canAscend(state)) return state;
  const gained = coresFor(state);
  const wasOverdrive = fin(state.overdriveTimer) > 0;
  resetRun(state);
  state.totalFlux = 0;
  state.shards = 0;
  state.totalShards = 0;
  state.perks = {};
  state.cores = safeAdd(state.cores, gained);
  state.ascends = fin(state.ascends) + 1;
  if (wasOverdrive) emit(bus, EVT.OVERDRIVE_END, { reason: 'ascend' });
  emit(bus, EVT.ASCEND, { cores: gained, totalCores: state.cores, ascends: state.ascends });
  return state;
}
// Auto-collapse (mechanic 'autoCollapse' > 0): collapse as soon as the pending gain is at least
// max(1, autoCollapse, 25% of totalShards) — avoids pointless micro-collapses late in the game.
function autoCollapseCheck(state, bus) {
  const ac = mechanicValue(state, 'autoCollapse');
  if (!(ac > 0)) return;
  const pending = shardsFor(state);
  if (pending >= Math.max(1, ac, Math.ceil(0.25 * fin(state.totalShards)))) doCollapse(state, bus);
}

// ---------------------------------------------------------------- achievements ----------
export function checkAchievements(state, bus) {
  for (const a of ACH) {
    if (state.achievements[a.id] === true) continue;
    if (!a.at || typeof a.at !== 'object') continue;
    if (meets(state, a.at)) {
      state.achievements[a.id] = true;
      emit(bus, EVT.ACHIEVEMENT, { id: a.id, name: a.name, blurb: a.blurb });
    }
  }
}

// ---------------------------------------------------------------- tick -------------------
export function tick(state, dt, bus) {
  const d = Math.max(0, fin(dt));
  if (d <= 0) return;
  state.stats.playSec = safeAdd(state.stats.playSec, d);

  // Production (uses the multiplier window as it stood at the start of this step).
  const rate = totalRate(state);
  gainFlux(state, rate * d);
  if (rate > fin(state.stats.bestRate)) state.stats.bestRate = rate;

  // Auto-Pulse: the automation layer. Grants pulse flux + overdrive fill, but does not raise
  // the combo (combo stays a reward for the player's own hands).
  const ap = mechanicValue(state, 'autoPulse');
  const t = tr(state);
  if (ap > 0) {
    t.autoAcc = fin(t.autoAcc) + ap * d;
    const n = Math.floor(t.autoAcc + 1e-9); // epsilon: 30 × (1/30) must count as 1 pulse
    if (n > 0) {
      t.autoAcc -= n;
      const each = pulseGain(state);
      const gain = gainFlux(state, each * n);
      fillOverdrive(state, num(TUNE.overdrive.gainPerPulse, 0) * n);
      state.stats.pulses = fin(state.stats.pulses) + n;
      emit(bus, EVT.PULSE, { gain, combo: state.combo, comboMult: comboMult(state), auto: true, count: n });
    }
  } else {
    t.autoAcc = 0;
  }

  // Combo: window countdown, then decay (slowed by comboRetention).
  if (state.comboTimer > 0) {
    state.comboTimer = Math.max(0, fin(state.comboTimer - d));
  } else if (state.combo > 0) {
    const decay = num(TUNE.combo.decayPerSec, 8) * (1 - mechanicValue(state, 'comboRetention'));
    state.combo = Math.max(0, fin(state.combo - decay * d));
  }

  // Charge ring sweep + cooldown.
  state.charge.angle = fin((fin(state.charge.angle) + chargeSpeed(state) * d) % TAU);
  if (state.charge.cooldown > 0) state.charge.cooldown = Math.max(0, fin(state.charge.cooldown - d));

  // Overdrive window.
  if (state.overdriveTimer > 0) {
    state.overdriveTimer = Math.max(0, fin(state.overdriveTimer - d));
    if (state.overdriveTimer > 0) {
      emit(bus, EVT.OVERDRIVE_TICK, { left: state.overdriveTimer });
    } else {
      emit(bus, EVT.OVERDRIVE_END, { reason: 'timeout' });
    }
  }

  checkStage(state, bus);
  autoCollapseCheck(state, bus);

  t.achAcc = fin(t.achAcc) + d;
  if (t.achAcc >= ACH_INTERVAL) {
    t.achAcc = 0;
    checkAchievements(state, bus);
  }
}

// ---------------------------------------------------------------- offline ---------------
/** Credits min(elapsedSec, maxOfflineSec) at offlineFrac * rate (overdrive excluded). */
export function applyOffline(state, elapsedSec, bus) {
  const secs = clamp(fin(elapsedSec), 0, num(TUNE.save.maxOfflineSec, 8 * 3600));
  if (secs <= 0) return 0;
  const gain = gainFlux(state, totalRateInner(state, false) * mechanicValue(state, 'offlineFrac') * secs);
  checkStage(state, bus);
  if (gain > 0) emit(bus, EVT.LOG, { kind: 'offline', seconds: secs, gain });
  return gain;
}

// ---------------------------------------------------------------- snapshot --------------
export function snapshot(state) {
  const rate = totalRate(state);
  const gm = globalMult(state);
  const flux = fin(state.flux);
  const s = stageFor(state);
  const idx = s ? STG.indexOf(s) : 0;
  const next = STG[idx + 1];
  const curAt = s ? num(s.at, 0) : 0;
  const nextAt = next ? num(next.at, 0) : null;
  const progress = next ? clamp(fin((fin(state.lifetimeFlux) - curAt) / Math.max(1e-9, nextAt - curAt)), 0, 1) : 1;
  const pal = s && s.palette && typeof s.palette === 'object' ? { ...s.palette } : {};

  const injectors = INJ.map((inj) => {
    const cost = injectorCost(state, inj.id);
    const unlocked = injectorUnlocked(state, inj);
    return {
      id: inj.id, name: inj.name, tier: num(inj.tier, 0),
      owned: fin(state.injectors[inj.id]), cost, unlockAt: num(inj.unlockAt, 0),
      rate: injectorRateInner(state, inj.id, gm),
      affordable: unlocked && flux >= cost, unlocked, blurb: inj.blurb || '',
    };
  });
  // Owned upgrades are omitted: this list is what can still be bought.
  const upgrades = UPG.filter((u) => state.upgrades[u.id] !== true).map((u) => {
    const unlocked = upgradeUnlocked(state, u);
    const cost = num(u.cost, Number.MAX_VALUE);
    return {
      id: u.id, name: u.name || u.id, kind: u.kind, cost,
      affordable: unlocked && flux >= cost, unlocked, blurb: u.blurb || '',
      mult: typeof u.mult === 'number' ? fin(u.mult, 1) : null,
      mechanic: u.mechanic ? { key: u.mechanic.key, value: fin(u.mechanic.value) } : null,
    };
  });
  const perks = PRK.map((p) => ({
    id: p.id, name: p.name || p.id, cost: num(p.cost, Number.MAX_VALUE),
    affordable: perkAffordable(state, p), owned: state.perks[p.id] === true, blurb: p.blurb || '',
  }));
  const shardsNow = shardsFor(state);
  const coresNow = coresFor(state);

  return {
    flux, totalFlux: fin(state.totalFlux), runFlux: fin(state.runFlux), rate,
    combo: fin(state.combo), comboMult: comboMult(state), comboTimer: fin(state.comboTimer),
    overdrive: fin(state.overdrive),
    overdriveTimer: fin(state.overdriveTimer),
    stage: {
      index: idx, id: s ? s.id : '', name: s ? s.name : '', palette: pal,
      bloom: s ? num(s.bloom, 0) : 0, orbit: s ? num(s.orbit, 1) : 1,
      camDist: s ? num(s.camDist, 6) : 6, detail: s ? num(s.detail, 1) : 1,
      nextAt, progress,
    },
    injectors, upgrades, perks,
    shards: fin(state.shards), totalShards: fin(state.totalShards), cores: fin(state.cores),
    ascends: fin(state.ascends), collapses: fin(state.collapses),
    collapse: { available: shardsNow >= 1, shards: shardsNow },
    ascend: { available: canAscend(state), cores: coresNow },
    charge: chargeState(state),
    stats: { ...state.stats },
    playSec: fin(state.stats.playSec),
  };
}

// ---------------------------------------------------------------- save / load -----------
export function save(state) {
  return JSON.stringify(state);
}

const isObj = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
function trueMap(src) {
  const out = {};
  if (isObj(src)) for (const k of Object.keys(src)) if (src[k] === true) out[k] = true;
  return out;
}

/** Returns a GameState, or null on absent/malformed text or an unknown version. */
export function load(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  let d;
  try {
    d = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(d) || d.v !== SAVE_VERSION) return null;
  const s = createState(num(d.seed, 1));
  for (const k of ['flux', 'totalFlux', 'runFlux', 'lifetimeFlux', 'shards', 'totalShards', 'collapses', 'cores',
    'ascends', 'combo', 'comboTimer', 'overdrive', 'overdriveTimer', 'overdrives', 'stageIndex', 'lastSave']) {
    s[k] = Math.max(0, num(d[k], 0));
  }
  if (isObj(d.injectors)) {
    for (const k of Object.keys(d.injectors)) {
      const n = d.injectors[k];
      if (typeof n === 'number') s.injectors[k] = Math.max(0, fin(n));
    }
  }
  s.upgrades = trueMap(d.upgrades);
  s.perks = trueMap(d.perks);
  s.achievements = trueMap(d.achievements);
  if (isObj(d.charge)) {
    for (const k of Object.keys(s.charge)) s.charge[k] = Math.max(0, num(d.charge[k], 0));
  }
  if (isObj(d.stats)) {
    for (const k of Object.keys(s.stats)) s.stats[k] = Math.max(0, num(d.stats[k], 0));
  }
  s.stageIndex = STG.length ? clamp(Math.floor(s.stageIndex), 0, STG.length - 1) : 0;
  s.overdrive = clamp(s.overdrive, 0, num(TUNE.overdrive.need, 100));
  s.combo = Math.min(s.combo, num(TUNE.combo.maxCombo, 50));
  return s;
}
