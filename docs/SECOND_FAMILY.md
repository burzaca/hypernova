# SECOND INJECTOR FAMILY — design + binding contract

The design document promised a second injector family unlocked by ASCEND. The data does not have it
yet. This is the feature.

## Why
After ASCEND the run restarts with the same 12 producers. Nova Cores make them stronger, but nothing
is *new*. A second family that only exists post-ascend gives the mid/late game its own progression
curve instead of a replay of the first one.

## Design
- A second family, `nova`, of **6 tiers**, unlocked by ascend count, not by flux.
- Nova producers are stronger per unit and steeper in cost than the base family.
- Their distinguishing rule: **nova output scales with Nova Cores**, so the second family is the one
  that rewards deep ascension. Base family does not get this bonus.
  `novaMult(state) = 1 + cores * TUNE.prestige.novaPerCore` (new knob, default `0.08`).
- They appear in the shop under a `NOVA` subheading, visually distinct from the base list.

## Files to change
- `src/core/content.js` — add `export const NOVA_INJECTORS = [...]`. Do not modify `INJECTORS`.
- `src/core/economy.js` — merge the family into the registry, apply `novaMult` to their rate only,
  and make sure `resetRun` / `doAscend` / `doCollapse` treat them like other injectors (they reset
  on prestige like everything else — say so in the tooltip).
- `src/core/tune.js` — add `prestige.novaPerCore: 0.08`. (The PM reviews this knob; keep it small.)
- `src/ui/hud.js` + `styles/ui.css` — the `NOVA` subheading and a one-line note on the first nova
  row: `Nova producers scale with your Nova Cores. They reset on prestige like the rest.`
- `tests/content.test.js` — the family invariants below.

## Shape (identical to INJECTORS — do not invent new fields)
```js
{ id: 'nova_spark', name: 'NOVA SPARK', tier: 13, family: 'nova',
  baseRate: <number>, cost: <number>, growth: <number>,
  requires: { ascends: 1 }, blurb: '<one plain sentence about what it does>' }
```
`family: 'nova'` is the only new field, and it must default to `'base'` when absent so existing
code paths are unaffected.

## Invariants the tests must enforce
- 6 entries, unique ids, `tier` strictly greater than every base-family tier.
- Every entry has `requires.ascends >= 1`.
- `baseRate` and `cost` strictly increase with tier; `cost` growth is steeper than the base family's
  steepest entry.
- With `cores = 0`, a nova injector's rate equals its `baseRate * globalMult` (no hidden bonus).
- With `cores = 10`, the nova rate is exactly `1 + 10 * TUNE.prestige.novaPerCore` times higher, and
  a base-family injector's rate is unchanged.
- A fresh state (0 ascends) does not offer any nova injector; a state with 1 ascend does.

## Balance gate (non-negotiable)
`node tools/simulate.js 3 42 3600 6` must still PASS the pacing contract. The family is gated behind
the first ascend (~30 min), so early pacing must not move at all — if the first-collapse or
first-ascend timings shift by more than ~10%, your unlock is wrong.

## Definition of done
- `node --check` clean on every file touched; `node --test tests/*.test.js` green.
- Report the files changed and paste the `NOVA_INJECTORS` table.
