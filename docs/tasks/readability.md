# WORK ORDER — make the star readable again (player report, verbatim)

> The star could be smaller, during overdrive you can't see anything, it's just a bright blur,
> and being so big, it's too much.
> What does space do? I don't see a marker, neither a marker crossing the bright arc,
> what is the bright arc?

Two separate failures: the star is too large and blows out, and the charge ring — the game's skill
layer — is not visible enough to be used.

## Files you may touch — and ONLY these
- `src/render/scene.js`
- `src/render/fx.js`
- `src/render/shaders.js`
Do NOT touch `src/core/**` (the palette and bloom *data* is the PM's), `src/ui/**`, `src/main.js`,
`tests/**`, `docs/**`, `tools/**`. Do not run git.

## What is already known
- Bloom strength is already compressed (`softBase` in `scene.js`) — do not undo that.
- The stage ladder sets `camDist: 5.0` and `bloom: 1.6` for late stages, and `stageScale` grows to
  ~1.56x with stage index. That combination is what fills the screen with the star.
- The player cannot see the ring marker or the bright hit arc at all. If the ring is only drawn at
  some stages, or its contrast is near zero against the core, that is the bug.

## Required behaviour

1. **The star must never fill the frame.** Cap the on-screen diameter of the core to roughly 55% of
   the viewport's smaller dimension at every stage, by adjusting the camera distance (or the scale
   ceiling) — whichever is the smaller change. Early stages must look exactly as they do today.
2. **Overdrive must not white out the star.** During overdrive the player must still be able to see
   the core's surface structure and the ring. Reduce whatever is pushing it into a flat blur
   (bloom radius/strength interplay, additive layers, exposure) rather than dimming overdrive's
   *colour* — the peak should still read as a peak.
3. **The charge ring must be legible at every stage.** Concretely, all three of these must be
   visible against the core and the background:
   - the ring itself,
   - the travelling marker,
   - the bright hit arc (the target window).
   Give the marker and the arc enough contrast and size to be tracked at a glance. If the ring is
   currently hidden at some stages, make it always present once the game has started.
4. Keep every existing juice hook working (shake, hit-stop, dolly, aberration, FX events).

## How to check your own work
`python3 -m http.server 8791 --bind 127.0.0.1` then open `http://127.0.0.1:8791/?state=<json>` —
`node tools/make-late-save.js` writes a deep-stage save to `/tmp/hn-late.json`. The PM will verify
visually; a report that says "improved" without a screenshot description of what is now visible will
be rejected.

## Definition of done
- `node --check` clean on the three files; `node --test tests/*.test.js` still green (50 tests).
- Report the files changed and describe, in plain words, what a player now sees at stage 24 during
  overdrive, and where the ring marker and hit arc are drawn.
