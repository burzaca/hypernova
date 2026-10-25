# WORK ORDER — click numbers you can see (player report, verbatim)

> Could we have numbers on the screen, I don't have enough dopamine just from seeing a number in the
> top left, we need to see how much a click gets us in points.

The top-left counter is the only feedback a pulse gives. Incremental games live on visible per-hit
numbers. Build that.

## Files you may create — and ONLY these
- `src/ui/floating-numbers.js` — a self-contained module that injects its own `<style>` (see
  `src/ui/titlecard.js` for the pattern: create the element, append a `<style>` first, then the DOM).
Do NOT touch any other file. `src/main.js` is wired by the PM. Do not run git.

## Contract (match the existing module style)
```js
export function createFloatingNumbers(bus) => { mount(root), update(dt), dispose() }
```
- It subscribes to `EVT.PULSE` and `EVT.CRIT` from `src/core/events.js` (import `EVT`). The payload
  is `{ gain, combo, comboMult, auto, count }` — read `docs/INTERFACES.md` for the exact shape.
- On a manual pulse it spawns a number at the pointer position; on a crit it spawns a larger,
  differently coloured number; on an `auto: true` pulse it spawns a smaller, dimmer one, offset so
  it does not collide with the manual ones.
- Numbers rise ~60-90 px over ~0.9 s, fade out, and are removed from the DOM when done.
- Hard cap of 24 live numbers; when exceeded, drop the oldest. A player at 6 CPS must never make
  the page stutter.
- Use `formatNumber` from `src/core/format.js` — never raw `toFixed` or exponent notation.
- Never throw if `gain` is missing or zero: skip the number.
- No dependencies, no build step.

## Look
Match the game's existing visual language (dark panels, the `--hn-accent` CSS var the HUD already
sets from the stage palette). Crit numbers should read as a reward: bigger, brighter, slightly
heavier font. Do not use emoji.

## Definition of done
- `node --check src/ui/floating-numbers.js` clean.
- A short self-test: run `python3 -m http.server 8791 --bind 127.0.0.1`, open the game, click the
  core, and confirm numbers appear at the cursor and disappear. Report what you saw.
