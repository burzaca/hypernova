# WORK ORDER — tests that catch UI and renderer regressions

Two gaps in the safety net, both of which have already cost real time:
- The HUD was regressed twice by a weaker worker and **no test caught it** — the bugs only showed up
  in a browser (`snap is not defined`, jammed shop rows, invisible panel).
- The endless stage ladder produces *generated* palettes that the renderer has never seen in a test.

`jsdom` and `three` are already installed as devDependencies. Do not add any other dependency.

## Files you may create — and ONLY these
- `tests/hud.test.js`
- `tests/renderer.test.js`
Do not modify any source file, any existing test, `package.json`, `docs/**`, or `tools/**`.
If you believe a source file has a bug, **report it, do not fix it** — the PM decides.

## tests/hud.test.js — required assertions (all of them)
Use `jsdom` to build a DOM, then `createHUD(root, bus, api)` from `src/ui/hud.js` and drive it with
hand-written snapshot objects (see `docs/INTERFACES.md` §6 for the exact shape — copy it literally,
do not invent fields).

1. `createHUD` does not throw on a minimal valid snapshot, and `update(snap)` can be called twice.
2. Given two injectors (one affordable, one not), the rendered rows carry `data-affordable="1"` on
   exactly the affordable one, and the cost text matches `formatNumber(cost)`.
3. Upgrades with `kind: 'mechanic'` render under a `MECHANICS` subheading and multiplier upgrades
   do not appear under it.
4. With `collapse.available = true` and 3 owned injectors (levels 5, 2, 1) and 2 owned upgrades, the
   collapse card's secondary line contains `resets 3 injectors (8 levels) · 2 upgrades`.
5. With no owned anything, that line reads `nothing to lose yet`.
6. With `boons.pending = true` and two offers, two boon cards render, each showing its name and its
   mods; clicking one calls `api.chooseBoon` with exactly that id.
7. `update()` never throws when optional fields are missing (`boons` absent, `collapse` absent) —
   the HUD must degrade, not crash.

## tests/renderer.test.js — required assertions (all of them)
`three` works headless for scene-graph and material construction (no WebGLRenderer, no canvas).

1. `coreMaterial`, `ringMaterial`, `backgroundMaterial` from `src/render/shaders.js` build without
   throwing for an **authored** palette (`getStage(0).palette`) AND for **generated** palettes
   (`getStage(15).palette`, `getStage(40).palette`).
2. Every colour uniform on those materials is a finite number / a THREE.Color that does not produce
   NaN when read back.
3. The generated palette objects contain every key the authored ones do (`core`, `glow`, `rim`, `bg`,
   `accent`) — this is the authored/generated shape boundary, and it is the actual risk.
4. Calling the three material builders 20 times does not leak a listener or throw.

## Hard rules
- Plain `node:test` + `node:assert/strict`, matching the existing test files' style.
- No snapshots/golden files, no screenshots, no new dependencies.
- A test that cannot fail is worthless: assert specific strings and numbers, not "it rendered".

## Definition of done
- `node --test tests/*.test.js` green, including both new files.
- Report the files created and paste the assertion list you actually implemented.
