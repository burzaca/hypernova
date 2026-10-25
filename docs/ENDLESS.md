# ENDLESS PROGRESSION — design + binding contract

Agreed with the player (2026-10-25): the game must not feel repetitive once the authored content
is exhausted. Two features, in this order:

1. **Endless stages** — past SINGULARITY the star keeps evolving forever.
2. **Ascension Boons** — at every ASCEND the player picks 1 of 3 modifiers that change the RULES.

Why boons and not more multipliers: the game is already infinite in numbers (Nova Cores compound
×1.15 forever, `lifetimeFlux` never resets). What runs out is *novelty*. A boon changes how the run
plays, so the next run is a different run.

---

## 1. Endless stages

### Generation rule (content.js)
```js
export function stageThreshold(index)   // number, monotonic, for ANY index >= 0
export function getStage(index)         // full stage object for ANY index >= 0
```
- `index < STAGES.length` → return the authored entry, `stageThreshold` returns its `at`.
- `index >= STAGES.length` → generate deterministically:
  - `at = STAGES[last].at * Math.pow(10, index - last)` — one new form per decade of flux, forever.
  - `id = 'beyond_' + index`
  - `name` from two curated word lists combined deterministically (`PREFIX[(i*7) % P.length] + ' ' +
     NOUN[(i*3) % N.length]`), uppercase, never repeating within the first 100 indices.
  - `palette` from a ring of 8 authored palettes, cycled by `index % 8`, with `bg` darkened.
  - `detail = 6`, `bloom = 1.6`, `orbit = 2.2`, `camDist = 5.0` (the authored ceiling — do not
    grow these past the ceiling; the renderer clamps them anyway).
  - `blurb` from a curated list, cycled.
  - `generated: true`
- Both functions must be **pure and side-effect free** and must never throw for any finite index.

### economy.js changes
- `stageFor(state)` → `getStage(state.stageIndex)`.
- the stage-advance loop → `while (lifetimeFlux >= stageThreshold(state.stageIndex + 1))`.
- `load()` must NOT clamp `stageIndex` to `STAGES.length - 1` any more (that would erase a
  deep save's stage). Clamp to `>= 0` only.
- `snapshot.stage` shape is UNCHANGED — the renderer and HUD must not need any change.

### Renderer
No change required, because it reads `snapshot.stage` (index, palette, bloom, …). Verify it does
not index into `STAGES` itself.

---

## 2. Ascension Boons

### Data (content.js)
```js
export const BOONS = [ { id, name, blurb, mods: { <mechanicKey>: value, ... } }, ... ];
```
Hard rules for the table:
- **12 boons minimum.**
- Every `mods` key MUST be an existing key in `MECHANIC_KEYS`. No new mechanic keys in this slice.
- Every boon has **at least one negative mod** — a boon with no cost is not a choice.
- Blurbs state both sides plainly, e.g. `'The core feeds itself (auto-pulse). Injectors produce 30% less.'`
- Suggested flavour directions (not mandatory): auto-pulse at a cost; huge crit but combo decays
  faster; long overdrive but weaker peak; wide ring window but no chain surge; strong offline
  progress but no overdrive; big combo ceiling but a smaller charge window.

### State (economy.js)
```js
state.boons      = {}          // owned boon id -> true
state.boonOffers = []          // ids offered right now (empty when none pending)
```
Both keys must be added to the save/load key list and survive a JSON round-trip.

### Flow
- `doAscend()` finishes as it does today, then: if at least 3 unowned boons are available, set
  `state.boonOffers` to **3 ids chosen deterministically** from the state's own PRNG
  (`mulberry32` seeded from `state.seed + state.ascends * 7919`) — deterministic so tests and a
  restored save reproduce the same offer.
- `export function chooseBoon(state, bus, id)` → validates the id is in `boonOffers`, marks it
  owned, clears `boonOffers`, emits `EVT.BOON = 'boon'` with `{ id, name }`, returns true; false
  for anything else. Never mutates on failure.
- A pending offer does NOT block play: the player can keep playing and choose later. The offer
  persists across save/load. A new `doAscend` replaces an untouched offer with a new one.

### Effects
`contributions(state, key)` gains one more source: for each owned boon, its `mods[key]`. That is
the whole implementation of boon effects — they ride the existing mechanic pipeline, so clamping
and multiplicative rules behave exactly as for upgrades and perks.

### Snapshot (unchanged elsewhere)
```js
boons: {
  offers: [ { id, name, blurb, mods } ],   // [] when none pending
  owned:  [ { id, name, blurb } ],
  pending: boolean,                        // offers.length > 0
}
```

### UI (hud.js + main.js)
- When `snapshot.boons.pending`, show a **Boons** panel (same visual language as the shop) listing
  the three offers with name, blurb, and the mods rendered honestly (`Overdrive ×3`,
  `Overdrive duration −6s`). Clicking one calls `api.chooseBoon(id)`.
- Owned boons appear in a small `BOONS` section under the perks/shop so the player can see the
  rules their run is playing by.
- `main.js` (PM-owned) exposes `api.chooseBoon`.

---

## Acceptance (all of these must pass)
- `node --test tests/*.test.js` green, including NEW tests:
  - `getStage(0)` equals the authored first stage; `getStage(14)` the authored last;
    `getStage(15..40)` returns generated stages with strictly increasing `at`, unique names,
    finite numbers, and no throw.
  - `stageThreshold` is strictly increasing across the authored/generated boundary.
  - a save at stage 30 round-trips and keeps stage 30.
  - `doAscend` produces exactly 3 offers, deterministic for the same seed, and `chooseBoon`
    applies the mods (assert a measurable change, e.g. `mechanicValue(state,'overdriveMult')`).
  - every boon has ≥1 negative mod and only known mechanic keys.
- `node tools/simulate.js` still PASSES the pacing contract (boons must not break pacing).
- No new dependencies. No build step. Plain ES modules.
