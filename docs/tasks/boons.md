# WORK ORDER — Ascension Boons

Read `docs/ENDLESS.md` §2 first. It is the binding contract; this file only scopes your work.
This is the anti-repetition feature the player asked for: after the authored content is exhausted
the run must still change shape.

## Files you may touch — and ONLY these
- `src/core/content.js` — add `export const BOONS = [...]` (12+ entries). Change nothing else.
- `src/core/economy.js` — `state.boons` / `state.boonOffers` in `createState`, the offer roll in
  `doAscend`, `chooseBoon`, the extra source in `contributions`, the `boons` block in `snapshot`,
  and the two keys in the save/load key list. Nothing else.
- `src/core/events.js` — add `BOON: 'boon'` to `EVT`.
- `src/ui/hud.js` + `styles/ui.css` — the offer panel and the owned-boons list.
- `tests/content.test.js` — the boon table invariants (known keys only, at least one negative mod
  per boon, unique ids).
- `tests/economy-boons.test.js` — NEW file: the flow tests listed in ENDLESS.md §Acceptance.
- Do NOT touch `src/main.js` (the PM wires `api.chooseBoon`), `src/render/**`, `docs/**`,
  `tools/**`. Do not run git.

## The one subtle bit — determinism
The three offers must be reproducible: same `state.seed` and same `state.ascends` must produce the
same three ids. Use `mulberry32` from `src/core/math.js` seeded with
`state.seed + state.ascends * 7919`. A test asserts this, because a save must reload to the same
offer and a future replay feature depends on it.

## Design intent for the table (this is the part that needs judgement)
A boon is a trade, never a strict improvement. Each entry has at least one negative mod, and the
interesting ones create a different build:
- give auto-pulse, take a big cut to injector output;
- huge crit multiplier, but the combo decays much faster;
- long overdrive, weak peak;
- wide ring window, no chain surge;
- strong offline progress, no overdrive at all (`overdriveMult` driven low);
- big combo ceiling, small charge window.
Blurbs state both sides in plain language — the player must be able to decide without opening a
wiki. Never write "powerful bonus!" — say what changes.

## Hard rules
- Only keys already in `MECHANIC_KEYS`. No new mechanic keys in this slice.
- Boon effects ride `contributions()` so clamping and multiplicative behaviour match upgrades/perks.
- `chooseBoon` must not mutate state when the id is invalid.
- No new dependencies, no build step, plain ES modules.

## Definition of done
- `node --check` clean on every file you touched.
- `node --test tests/*.test.js` green, including your new file.
- `node tools/simulate.js 3 42 3600 6` still PASSES the pacing contract (the bot should not pick
  boons — leave them pending; the contract must hold with boons unchosen).
- Report the files changed and paste the full `BOONS` table.
