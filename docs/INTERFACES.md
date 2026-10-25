# HYPERNOVA — module contracts (BINDING)

Every worker writes ONLY the file(s) named in its task, and implements EXACTLY these exports,
names, argument orders and shapes. Do not rename. Do not add required parameters. Do not import
from a sibling module that another worker owns — import only from the foundation modules listed
as already written (`math.js`, `format.js`, `events.js`, `tune.js`).

Style: ES modules, plain modern JS, no dependencies except `three` in `src/render/**`.
No TypeScript, no build step, no bundler. Code must run in Node 24 (for `src/core/**`) and in
Chrome (for everything).

Foundation files that ALREADY EXIST — read them, use their helpers, do not re-implement them:
`src/core/math.js`, `src/core/format.js`, `src/core/events.js`, `src/core/tune.js`.

---

## 1. src/core/math.js  (DONE — PM-owned)
```js
export const clamp = (v, a, b) => number
export const lerp = (a, b, t) => number
export const invLerp = (a, b, v) => number
export const smoothstep = (a, b, v) => number
export const approach = (cur, target, rate, dt) => number   // exponential ease toward target
export const easeOutCubic = (t) => number
export const mulberry32 = (seed) => () => number            // deterministic 0..1
export const fmtSig = (n, digits) => number                 // round to significant digits
```

## 2. src/core/format.js  (DONE — PM-owned)
```js
export function formatNumber(n, decimals = 2) -> string
// 0 -> "0", 999.9 -> "1.00K"? NO: 999 -> "999", 1000 -> "1.00K", 1.234e5 -> "123.40K",
// 1e6 -> "1.00M", then B, T, Qa, Qi, Sx, Sp, Oc, No, Dc, Ud, Dd; past Dd -> "1.23e45".
export function formatInt(n) -> string                       // thousands-separated, < 1e6 only
export function formatMult(x) -> string                      // 1 -> "x1", 2.5 -> "x2.5"
export function formatTime(seconds) -> string                // 95 -> "1m 35s", 3725 -> "1h 2m"
export function formatRate(n) -> string                      // formatNumber + "/s"
```

## 3. src/core/events.js  (DONE — PM-owned)
```js
export class EventBus { on(evt, fn), off(evt, fn), clear(), emit(evt, payload) }
export const EVT = { PULSE:'pulse', CRIT:'crit', PERFECT:'perfect', OVERDRIVE_START:'overdrive_start',
  OVERDRIVE_END:'overdrive_end', OVERDRIVE_TICK:'overdrive_tick', BUY:'buy', STAGE_UP:'stage_up',
  COLLAPSE:'collapse', ASCEND:'ascend', ACHIEVEMENT:'achievement', MILESTONE:'milestone',
  LOG:'log', ERROR:'error' }
```
`emit(evt, payload)` calls every handler with one object argument. Handlers must not throw.

## 4. src/core/tune.js  (DONE — PM-owned; the balance knobs)
```js
export const TUNE = {
  combo:      { window: 1.25, maxCombo: 50, perCombo: 0.02, decayPerSec: 8 },
  charge:     { speed: 1.5, window: 0.22, perfectFrac: 0.25, critBase: 12, cooldown: 0.35 },
  overdrive:  { need: 100, gainPerPulse: 1.1, gainPerCrit: 9, duration: 12, mult: 8 },
  prestige:   { shardDiv: 1e6, shardExp: 0.5, shardGainPct: 0.01,
                ascendAt: 1e15, coreExp: 0.4, coreGainPct: 0.15 },
  pulse:      { base: 1, tierPerStage: 2.2 },
  save:       { key: 'hypernova.save.v1', autosaveSec: 15, maxOfflineSec: 8*3600, offlineFrac: 0.5 },
  sim:        { maxSeconds: 3600, dt: 1/30 }
};
```

---

## 5. src/core/content.js  — WORKER: content (data only, no logic beyond the validator)

Must export these five arrays. Pure data. Every `id` is snake_case, unique, and ASCII.

```js
export const INJECTORS = [
  { id: 'ion_spark', name: 'Ion Spark', tier: 0, baseCost: 15, costGrowth: 1.15,
    baseRate: 0.1, unlockAt: 0, blurb: 'One short sentence of flavour text.' },
  // ... exactly 12 entries, tier 0..11, strictly increasing baseCost and baseRate.
];

export const UPGRADES = [
  // kind A: multiply one injector
  { id: 'ion_spark_10', kind: 'injector_mult', target: 'ion_spark', mult: 2, cost: 300,
    name: 'Ion Cascade', requires: { injector: 'ion_spark', count: 10 }, blurb: '...' },
  // kind B: multiply everything
  { id: 'field_harmony', kind: 'global_mult', mult: 1.5, cost: 50000,
    requires: { totalFlux: 20000 }, blurb: '...' },
  // kind C: change a mechanic. `mechanic.key` MUST be one of the MECHANIC_KEYS below.
  { id: 'auto_pulse_1', kind: 'mechanic', mechanic: { key: 'autoPulse', value: 2 }, cost: 4000,
    name: 'Kinetic Membrane', requires: { totalFlux: 1500 }, blurb: '...' },
  // ... at least 44 entries total.
];

export const MECHANIC_KEYS = ['autoPulse','comboRetention','chargeWindow','critMult',
  'overdriveDuration','overdriveMult','chainSurge','offlineFrac','fluxMult','autoCollapse'];

export const STAGES = [
  { id: 'spark', name: 'SPARK', at: 0, detail: 1, bloom: 0.35, orbit: 1.0, camDist: 6.0,
    palette: { core: '#ffd9a0', glow: '#ff7a1a', rim: '#fff3c4', bg: '#0a0705', accent: '#ffb347' },
    blurb: '...' },
  // ... at least 14 entries, `at` strictly increasing starting at 0.
];

export const PERKS = [
  { id: 'steady_hands', name: 'Steady Hands', cost: 3, effect: { key: 'comboRetention', value: 0.25 },
    requires: { collapses: 1 }, blurb: '...' },
  // ... at least 12 entries. `effect.key` MUST be in MECHANIC_KEYS.
];

export const ACHIEVEMENTS = [
  { id: 'first_light', name: 'First Light', at: { pulses: 1 }, blurb: '...' },
  // ... at least 24 entries. `at` may use any of:
  //   pulses, crits, perfects, collapses, ascends, overdrives, totalFlux, stageIndex,
  //   injectorsTotal, upgradesOwned, playSec
];
```

Content rules (a test will enforce them, `node --test tests/content.test.js`):
- 12 injectors, 14 stages, 44+ upgrades, 12+ perks, 24+ achievements.
- `INJECTORS[i].baseCost` and `.baseRate` strictly increasing with tier; `costGrowth` in 1.10–1.20.
- Tier 0 `baseCost` ≤ 20 and `unlockAt` = 0 so the first purchase is reachable in <10 s.
- Every `UPGRADES[].target` must be an existing injector id; every `requires.injector` too.
- Every `mechanic.key` / `effect.key` must be in `MECHANIC_KEYS`.
- `STAGES[].at` strictly increasing, first is 0; hex colours are 6-digit `#rrggbb`.
- All ids unique across all tables.

## 6. src/core/economy.js — WORKER: economy (the heart; pure, no DOM, no three)

```js
export function createState(seed = 1) -> GameState
export function tick(state, dt, bus) -> void                 // dt in seconds, fixed step
export function pulse(state, bus) -> number                  // returns flux gained; 0 if blocked
export function fireCharge(state, bus, offset) -> number     // offset -1..1, 0 = dead centre
export function chargeState(state) -> { angle, window, perfectFrac, ready, cooldownLeft }
export function buyInjector(state, bus, id) -> boolean
export function buyUpgrade(state, bus, id) -> boolean
export function buyPerk(state, bus, id) -> boolean
export function triggerOverdrive(state, bus) -> boolean
export function injectorCost(state, id) -> number
export function injectorRate(state, id) -> number            // total flux/s from that kind
export function totalRate(state) -> number                   // all injectors + all multipliers
export function pulseGain(state) -> number
export function critGain(state) -> number
export function globalMult(state) -> number
export function mechanicValue(state, key) -> number          // summed/most-favourable value
export function shardsFor(state) -> number                   // shards a collapse would give now
export function canCollapse(state) -> boolean
export function doCollapse(state, bus) -> GameState          // new state, same reference ok
export function coresFor(state) -> number
export function canAscend(state) -> boolean
export function doAscend(state, bus) -> GameState
export function stageFor(state) -> STAGES entry currently earned
export function checkAchievements(state, bus) -> void
export function snapshot(state) -> PlainObject               // see below, no functions
export function save(state) -> string                        // JSON
export function load(text) -> GameState | null               // null on bad/absent save
export function applyOffline(state, elapsedSec, bus) -> number
```

`GameState` shape (exact keys; `injectors` keyed by injector id, `upgrades`/`perks`/
`achievements` are id → true maps):
```js
{
  v: 1, seed: 1,
  flux: 0, totalFlux: 0, runFlux: 0,
  injectors: { ion_spark: 0 },
  upgrades: {}, perks: {}, achievements: {},
  shards: 0, totalShards: 0, collapses: 0,
  cores: 0, ascends: 0,
  combo: 0, comboTimer: 0,
  overdrive: 0, overdriveTimer: 0, overdrives: 0,
  charge: { angle: 0, cooldown: 0, hits: 0, perfects: 0 },
  stageIndex: 0,
  stats: { pulses: 0, crits: 0, perfects: 0, playSec: 0, bestRate: 0, spent: 0 },
  lastSave: 0
}
```

`snapshot(state)` returns a plain, JSON-serialisable object for the UI and renderer (no functions,
no references into the live state):
```js
{
  flux, totalFlux, runFlux, rate,                       // rate = totalRate(state)
  combo, comboMult, comboTimer,
  overdrive,                                           // 0..TUNE.overdrive.need
  overdriveTimer,                                      // >0 while active
  stage: { index, id, name, palette, bloom, orbit, camDist, detail, nextAt, progress },
  injectors: [ { id, name, tier, owned, cost, rate, affordable, unlocked, blurb } ],
  upgrades:  [ { id, name, kind, cost, affordable, unlocked, blurb, mult, mechanic } ],
  perks:     [ { id, name, cost, affordable, owned, blurb } ],
  shards, totalShards, cores, ascends, collapses,
  collapse: { available, shards }, ascend: { available, cores },
  charge: { angle, window, perfectFrac, ready, cooldownLeft },
  stats, playSec
}
```

Behaviour the economy worker owns:
- Production: `flux += totalRate(state) * dt`; `totalFlux`/`runFlux` track every gain.
- Combo: `pulse()` raises `combo` by 1 (cap `maxCombo`) and sets `comboTimer = window`;
  `comboTimer` counts down, and when it hits 0 the combo decays at `decayPerSec` (modified by
  the `comboRetention` mechanic). `comboMult = 1 + combo * perCombo`.
- Charge ring: `chargeState(state).angle` advances at `TUNE.charge.speed` rad/s (modified by
  upgrades). `fireCharge(state, bus, offset)` succeeds when `|offset| <= window`; a hit with
  `|offset| <= window * perfectFrac` is PERFECT (×2). Success grants `critGain`, +5 combo,
  +`gainPerCrit` overdrive, sets `charge.cooldown = TUNE.charge.cooldown`. Failure costs the
  combo down by 25% (a real risk, so timing matters).
- Overdrive: fills from pulses/crits; `triggerOverdrive` only works at full; while
  `overdriveTimer > 0`, `globalMult` is multiplied by `overdriveMult`. Emits START/END.
- Auto-Pulse: when `mechanicValue(state,'autoPulse') > 0`, `tick` fires that many pulses/sec
  automatically (this is the automation layer).
- Stage: when `totalFlux >= STAGES[stageIndex+1].at`, raise `stageIndex`, emit `STAGE_UP`.
- `pulseGain = TUNE.pulse.base * (1 + stageIndex * TUNE.pulse.tierPerStage) * comboMult * globalMult`.
- `shardsFor = floor((runFlux / TUNE.prestige.shardDiv) ** TUNE.prestige.shardExp)`;
  `canCollapse` is true only when `shardsFor >= 1`.
- `coresFor = floor((totalFlux / TUNE.prestige.ascendAt) ** TUNE.prestige.coreExp)`;
  `canAscend` requires `totalFlux >= TUNE.prestige.ascendAt`.
- Shards give `1 + totalShards * shardGainPct` inside `globalMult`; Cores give
  `(1 + coreGainPct) ** cores`.
- `checkAchievements` is called from `tick` at most 4×/s and emits `ACHIEVEMENT`.
- `save`/`load` must round-trip exactly (test asserts it) and `load` must tolerate an unknown
  version by returning null.
- `applyOffline` credits `elapsedSec` capped at `maxOfflineSec` at `offlineFrac * totalRate`.
- No `Math.random()` anywhere — use `mulberry32(state.seed)` if randomness is needed.

## 7. src/render/scene.js + src/render/shaders.js + src/render/fx.js — WORKER: renderer (three.js)

```js
// scene.js
import * as THREE from 'three';
export function createScene(canvas, bus) -> {
  update(snap, dt), resize(w, h), dispose(), setPaused(bool)
}
// shaders.js
export function coreMaterial(palette) -> THREE.ShaderMaterial   // vertex-noise plasma, fresnel rim
export function ringMaterial(palette) -> THREE.ShaderMaterial
export function backgroundMaterial(palette) -> THREE.ShaderMaterial // fullscreen gradient + stars
// fx.js
export function createFX(three, scene, bus) -> { update(snap, dt), burst(kind, worldPos), dispose() }
```
Rules:
- Only `src/render/**` may import `three` (bare specifier `three` and `three/addons/...`; the
  import map is already in index.html — do not add one).
- Never mutate the game state; `update(snap, dt)` reads the snapshot only.
- No texture/image files. All materials are procedural shaders or additive point sprites.
- Use `EffectComposer` + `UnrealBloomPass` + `OutputPass` from `three/addons/postprocessing/`.
- Must be readable at 60 fps on integrated graphics: keep the particle budget ≤ 4000, reuse
  geometries, no per-frame allocations inside `update`.
- The Core must visibly transform across stages (detail, palette, bloom, camera distance) and
  react to combo/overdrive (emissive intensity, spin, orbit count). Screen shake and hit-stop
  are driven by `bus` events.

## 8. src/ui/hud.js + styles/ui.css — WORKER: ui (DOM only, no three, no economy internals)

```js
export function createHUD(root, bus, api) -> { update(snap), dispose() }
// api = { buyInjector(id), buyUpgrade(id), buyPerk(id), collapse(), ascend(),
//         toggleOverdrive(), exportSave(), importSave(text) }
```
- Builds its DOM in JS (no HTML file edits), all styling in `styles/ui.css`.
- Must show: flux + rate, combo meter, overdrive meter with a "READY — press O" state, stage
  name + progress-to-next-stage bar, injector list (buy on click, greyed when unaffordable,
  hidden when locked), upgrade list, prestige panel with exact shard/core gain, stats, save
  export/import, and a toast log for events.
- Numbers come from `formatNumber` / `formatRate` / `formatTime` — never hand-format.
- Must not create layout thrash: update text nodes in place, create rows once and reuse them.
- Mobile-safe: works at 380px wide, no hover-only affordances.

## 9. src/core/audio.js — WORKER: audio (WebAudio, no files)

```js
export function createAudio(bus) -> { start(), setEnabled(bool), isEnabled(), dispose() }
```
- Pure synthesis (oscillators, gain envelopes, noise buffer). No audio files, no fetch.
- Must not create an AudioContext until `start()` is called after a user gesture.
- Sounds for: PULSE (pitch rises with combo), CRIT, PERFECT, OVERDRIVE_START, OVERDRIVE_END,
  BUY, STAGE_UP, COLLAPSE, ASCEND, ACHIEVEMENT. Overdrive adds a sustained drone.
- Must hard-limit polyphony and never leak nodes (disconnect on end).

## 10. tests/economy.test.js — WORKER: tests (node:test, node:assert/strict)
Contract tests for section 6 using only the public API. Must cover at minimum:
createState shape; first purchase affordable after ~10 s of pulses+idle; cost growth exact;
combo rise/decay; fireCharge hit/miss/perfect boundaries; overdrive gate and multiplier window;
stage advance; shardsFor/canCollapse/doCollapse leaves shards and clears runFlux; doAscend;
save→load round-trip equality; applyOffline cap; no NaN ever (assert every snapshot field is a
finite number). Run with `node --test tests/economy.test.js`.

## 11. tools/simulate.js — WORKER: sim (headless balance gate)
```
node tools/simulate.js [runs] [seed] [maxSeconds]
```
Greedy bot: every 0.5 s buys the best cost-per-rate purchase, pulses at 6/s, fires the charge
ring when `ready`, collapses when `shardsFor >= 8` or when progress stalls, ascends when
available. Prints a table of times to: first upgrade, first stage, first overdrive, first
collapse, second collapse, first ascend, and final flux. Exits 1 if the pacing contract in
`docs/DESIGN.md` §6 fails.
