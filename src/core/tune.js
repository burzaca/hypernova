// HYPERNOVA — tuning constants. PM-owned: the balance knobs live HERE, not scattered.
// Workers must import these and must not hardcode their own copies.
export const TUNE = {
  combo: {
    window: 1.25,        // seconds between pulses that keeps the combo alive
    maxCombo: 50,
    perCombo: 0.02,      // comboMult = 1 + combo * perCombo  => x2.0 at 50 combo
    decayPerSec: 8,      // combo lost per second once the window expires
  },
  charge: {
    speed: 1.5,          // rad/s of the sweep
    window: 0.22,        // |offset| <= window is a hit (radians)
    perfectFrac: 0.25,   // |offset| <= window * perfectFrac is PERFECT
    critBase: 12,        // crit = critBase * pulseGain * critMult
    cooldown: 0.35,      // s between shots
    missComboPenalty: 0.25,
    comboOnHit: 5,
    overdriveOnHit: 9,
  },
  overdrive: {
    need: 100,
    gainPerPulse: 1.1,
    duration: 12,
    mult: 8,
  },
  prestige: {
    shardDiv: 1e6,
    shardExp: 0.5,
    shardGainPct: 0.01,   // +1% per Shard ever earned
    ascendAt: 1e12,
    coreExp: 0.4,
    coreGainPct: 0.15,    // (1.15)^cores
  },
  pulse: {
    base: 1,
    tierPerStage: 2.2,    // pulses scale with stage index so clicking stays relevant
  },
  save: {
    key: 'hypernova.save.v1',
    autosaveSec: 15,
    maxOfflineSec: 8 * 3600,
    offlineFrac: 0.5,
  },
  sim: {
    dt: 1 / 30,
    maxSeconds: 3600,
    botPulseRate: 6,      // the sim bot clicks 6x/s
  },
};

// Pacing contract from docs/DESIGN.md §6 — the sim asserts these (seconds).
export const PACING = {
  firstPurchaseMax: 10,
  firstStageMax: 60,
  firstOverdriveMax: 90,
  firstCollapseMin: 180,
  firstCollapseMax: 480,
  purchaseGapMax: 90,
  firstAscendMin: 900,
  firstAscendMax: 2700,
  // Visual evolution must keep pace with the prestige loop: these are the stage indices a
  // competent player should have SEEN by these times (measured with tools/curve.js).
  minStagesBy: [[60, 4], [600, 8], [1800, 10]],
};
