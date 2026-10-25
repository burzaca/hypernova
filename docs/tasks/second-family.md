# WORK ORDER — the second (Nova) injector family

Read `docs/SECOND_FAMILY.md` first. It is the binding contract and it contains the exact data shape,
the invariants, and the balance gate. This file only scopes your work.

## Files you may touch — and ONLY these
- `src/core/content.js` — add `NOVA_INJECTORS`; change nothing else.
- `src/core/economy.js` — merge the family, apply the cores-scaled bonus to that family only.
- `src/core/tune.js` — add `prestige.novaPerCore: 0.08` and nothing else.
- `src/ui/hud.js`, `styles/ui.css` — the `NOVA` subheading and its one-line explanation.
- `tests/content.test.js` — the invariants listed in the contract.
- Do NOT touch `src/main.js`, `src/render/**`, `tests/hud.test.js`, `tests/renderer.test.js`
  (another worker owns those two right now), `docs/**`, `tools/**`. Do not run git.

## Write the data file FIRST
Put the `NOVA_INJECTORS` table in `src/core/content.js` before you start reasoning about wiring —
the table is the part the player sees and the part the tests gate.

## The judgement calls that are yours
- The 6 names, blurbs and the cost/rate curve. They must read as a distinct family (nova, not more
  of the same) and the curve must be steeper than the base family's, per the contract.
- Making the unlock legible: the player must understand, from the shop alone, that this family exists
  only after ASCEND and that it rewards Nova Cores.

## Balance gate you must run before reporting
`node tools/simulate.js 3 42 3600 6` → must print `pacing contract: PASS`, and the first-collapse /
first-ascend columns must not move by more than ~10% versus the current build (they are
3m-6m and ~30m today). If they move, your unlock gate is wrong, not the balance.

## Definition of done
- `node --check` clean on every file you touched; `node --test tests/*.test.js` green.
- Report the files changed and paste the full `NOVA_INJECTORS` table.
