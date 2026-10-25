# WORK ORDER — collapse honesty (design defect reported by the player)

## What the player said
> Also the Auto Collapsing, I didn't know it's going to wipe all of the bought upgrades.
> Why is it presented as an upgrade?

He is right. Two separate failures:
1. Nothing in the UI ever says what a COLLAPSE takes away. The button shows a Shard count only.
2. `auto_collapse` sits in the shop's upgrade list with the blurb "The core chooses its own
   collapse — automatic and final." That reads like a stat boost. It is not: it automates a reset.

## Files you may touch — and ONLY these
- `src/ui/hud.js`
- `styles/ui.css`
- `src/core/content.js` — ONLY the `auto_collapse` entry's `name`, `blurb`, `requires`. Do not
  touch any other entry, and do not touch the `at:` numbers on STAGES (the PM is retuning those
  in parallel; a concurrent edit will collide).
- Do NOT touch `src/core/economy.js`, `src/core/tune.js`, `src/main.js`, `src/render/**`,
  `tests/**`, `docs/**`. Do not run git.

## Contract you must use (already exists — no economy change is needed)
`snapshot.collapse = { available, shards }`
`snapshot.injectors[] = { id, name, owned, cost, unlocked, affordable, rate, baseRate, tier }`
`snapshot.upgrades[]  = { id, name, cost, owned, unlocked, affordable, kind, blurb }`
Everything the preview needs is already in the snapshot. Compute it in the HUD.

## Required behaviour

1. **The Collapse button must state the cost, not just the reward.** When a collapse is available,
   render the button as two lines:
   - line 1: `COLLAPSE  +<shards> Shards`
   - line 2 (muted, smaller): `resets <N> injectors (<L> levels) · <U> upgrades`
   where N = injectors with `owned > 0`, L = sum of their `owned`, U = upgrades with `owned === true`
   that are currently visible. If N and U are both 0, line 2 reads `nothing to lose yet`.

2. **First collapse needs a confirm, not a modal.** The first time the player clicks COLLAPSE in a
   session, do not collapse. Instead put the button into a 3-second armed state:
   `CONFIRM — reset everything for +<shards>` with a warning style, and a muted hint
   `click again to collapse`. A second click while armed performs the collapse. Any other click,
   or the timer expiring, disarms it. After one collapse has happened this session, a single click
   is enough (do not nag forever).

3. **Auto Collapse must be honest and gated.** In `src/core/content.js`, change ONLY that entry:
   - `requires`: `{ collapses: 3 }` — the player must have collapsed by hand at least three times,
     so they already know what it does. Remove the `totalFlux` requirement.
   - `blurb`: `Collapses on its own once the gain is worth it. Each collapse still resets every
     injector and upgrade.`
   Keep `id`, `kind`, `mechanic`, and `cost` exactly as they are.

4. **Mechanic upgrades must not look like stat boosts.** In the shop, render upgrades whose
   `kind === 'mechanic'` in their own group under a `MECHANICS` subheading, visually distinct
   (different accent, and the blurb shown in full rather than truncated). Multiplier upgrades stay
   in the existing group. If there are no visible mechanic upgrades, render no subheading.

5. **Teach it once.** When a collapse first becomes available, emit one coach line through the
   existing coach API used elsewhere in `hud.js` (it already has a way to reach the coach; if it
   genuinely does not, emit `EVT.LOG` with the same text instead — do not invent a new channel):
   `A collapse is ready. It resets your injectors and upgrades — Shards make the next run faster.`

## Hard rules
- No new dependencies, no build step, plain ES modules.
- Never mutate game state from the HUD; call the existing API actions only.
- The HUD must not throw if a snapshot field is missing — this layer already has a guard in
  `main.js`; keep it non-fatal.
- Keep the existing DOM structure and class names that `main.js` and tests rely on
  (`.injector-row`, `.upgrade-row`, `data-affordable`, `#overdrive-btn`).

## Definition of done
- `node --check src/ui/hud.js` passes.
- `node --test tests/*.test.js` still passes (14/14) — if a test breaks, your change is wrong;
  fix your change, not the test.
- Report exactly which files you changed and paste the new `auto_collapse` entry.
