# WORK ORDER — endless stages

Read `docs/ENDLESS.md` §1 first. It is the binding contract; this file only scopes your work.

## Files you may touch — and ONLY these
- `src/core/content.js` — add `stageThreshold(index)` and `getStage(index)`, the curated word
  lists and the palette ring. Do NOT change the existing `STAGES`, `INJECTORS`, `UPGRADES`,
  `PERKS`, `ACHIEVEMENTS`, `MECHANIC_KEYS` entries.
- `src/core/economy.js` — `stageFor`, the stage-advance loop, and the `load()` clamp, as specified.
  Touch nothing else in that file.
- `tests/content.test.js` — add the new tests listed in ENDLESS.md §Acceptance.
- Do NOT touch `src/main.js`, `src/ui/**`, `src/render/**`, `styles/**`, `docs/**`, `tools/**`.
  Do not run git.

## Why this matters to the player
He asked for infinite progression. Today `stageFor` clamps at the 15th authored stage and the
advance loop stops at `STAGES.length`, so after ~30 minutes the star never changes again. After
your change it evolves forever, one form per decade of lifetime flux.

## Watch out for
- `getStage` is called from the render path every frame in some code paths — it must be cheap and
  allocation-light. Cache generated stages in a module-level Map keyed by index.
- The authored/generated boundary must be continuous: `stageThreshold(15)` must be greater than
  `STAGES[14].at`, and the ratio is exactly ×10 per step.
- Names must not repeat within the first 100 generated indices — assert that in the test.
- Do not let a generated stage produce a non-finite number anywhere; the game guards against NaN
  and a test asserts the whole 3-minute run stays finite.

## Definition of done
- `node --check src/core/content.js src/core/economy.js` clean.
- `node --test tests/*.test.js` green (the existing 14 plus your new ones).
- `node tools/simulate.js 1 42 7200 6` — report the stage ladder table it prints; the run should
  keep climbing past stage 14 instead of stopping there.
- Report the files you changed and paste the generated-stage helper you wrote.
