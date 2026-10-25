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
    novaPerCore: 0.08,    // nova family only: x(1 + cores * novaPerCore)
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
    // The bot models a real player's CLICK rate, and that number is not a guess. Manual clicking
    // (the game has no auto-clicker) is 5-7 CPS for an average person sustained over 10-60 s
    // (cps-check.com, redragonshop.com/pages/cps-test, clickspeedtester.com), 10-14 CPS for a
    // trained jitter/butterfly clicker, ~12 CPS for the 10-second world record (cpstest.org).
    // 6 CPS is therefore the honest "normal player" baseline the ladder is tuned against;
    // `node tools/simulate.js 1 42 3600 10` checks the fast-player case.
    botPulseRate: 6,
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
  // player clicking at the researched average rate (6 CPS) should have SEEN by these times.
  // Measured with tools/fit-stages.js, then given ~30% slack so the contract cannot drift into
  // being tighter than the design intent.
  minStagesBy: [[90, 4], [700, 8], [1200, 10]],
  // Anti-repetition guarantee: every ascend offers a new boon, so the gap between ascends is how
  // long a player can go without the rules changing. Measured worst case over 4 h on seeds
  // 42/777/12345 at 6 CPS: 18m41s. The limit is set at ~2x that so a real regression trips CI
  // without the check being brittle.
  boonGapMax: 2400,
};
