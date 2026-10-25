You are the ECONOMY worker on the HYPERNOVA game build. You are one of several agents working
in parallel on the same repo; discipline about file ownership is what makes this work.

READ FIRST (in this order):
1. docs/INTERFACES.md — section 6 is your contract, and sections 1-4 are the foundation you must reuse.
2. docs/DESIGN.md — the game you are implementing (loops, prestige layers, pacing contract).
3. src/core/tune.js, src/core/math.js, src/core/format.js, src/core/events.js — already written, import them.
4. src/core/content.js may NOT exist yet (another worker writes it). Import it anyway:
   `import { INJECTORS, UPGRADES, STAGES, PERKS, ACHIEVEMENTS } from './content.js';`
   and code defensively against the SHAPES documented in INTERFACES.md §5 — do not invent fields.

WRITE THIS ONE FILE, COMPLETE AND RUNNABLE: src/core/economy.js

Implement EXACTLY the exports in INTERFACES.md §6 with those names and argument orders, the
exact GameState keys, and the exact snapshot() shape. Every behaviour bullet in §6 is a
requirement, including:
- combo window/decay with the comboRetention mechanic,
- charge ring hit/miss/perfect with the miss penalty,
- overdrive gate + multiplier window + autoCollapse/autoPulse mechanics,
- stage advancement, achievements (throttled),
- shards/cores formulas from TUNE, doCollapse/doAscend,
- globalMult composition: stage/perk/upgrade multipliers × (1 + totalShards*shardGainPct)
  × (1 + coreGainPct)^cores × overdriveMult (while active) × global_mult upgrades,
- mechanicValue(): for additive keys (autoPulse, overdriveDuration, chainSurge, critMult) sum the
  contributions; for fractional keys (comboRetention, chargeWindow, offlineFrac) sum and clamp to
  [0, 0.9]; return the base value from TUNE when nothing is owned. Document that rule in a comment.
- save()/load() exact round-trip, load() returns null on malformed input or wrong `v`,
- applyOffline() cap,
- no Math.random(), no DOM, no three.js, no console.log in library code.

Hard quality bar: this file is the heart of the game. Every number must stay finite — guard
against NaN/Infinity leaking into flux (if a computation yields non-finite, clamp to 0 and keep
going). Costs must never go to Infinity for reasonable play (use the geometric series formula
`baseCost * growth^owned`).

SELF-TEST (must pass before you finish):
  cd /home/hermes/projects/hypernova
  node -e "import('./src/core/economy.js').then(async m => { const s=m.createState(1); for(let i=0;i<600;i++){ m.pulse(s,new (await import('./src/core/events.js')).EventBus)(); m.tick(s,1/30,new (await import('./src/core/events.js')).EventBus)(); } const sn=m.snapshot(s); const bad=Object.entries(sn).filter(([k,v])=>typeof v==='number'&&!Number.isFinite(v)); console.log('flux',sn.flux,'rate',sn.rate,'bad',JSON.stringify(bad)); })"
  Expected: flux > 0, rate >= 0, bad = [] (empty array).
Also verify `node --check src/core/economy.js` passes.

Note: content.js may be missing when you test, so the import above may fail. If it does, create
a TEMPORARY file /tmp/hn-content-stub.js with 3 fake injectors, temporarily point your import at
it to run the self-test, then restore the real import path './content.js' before finishing. The
final file MUST import './content.js'.

Finish by printing the absolute path you wrote and the word DONE.
