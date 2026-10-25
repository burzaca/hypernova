# HYPERNOVA

**Feed the core. Break the scale.**

An active 3D incremental game. Pulse a living star, nail the charge ring for critical surges,
ride overdrive, collapse the whole thing into shards, and ascend — while the numbers climb out of
notation entirely.

**Play it now: <https://burzaca.github.io/hypernova/>** (no install, no account, saves locally)

![HYPERNOVA title screen](assets/title.png)
![A star at the GALAXY FORGE stage](assets/gameplay.png)
![Overdrive: the designed 12-second peak of every run](assets/overdrive.png)

No textures, no sprites, no asset files: every visual is a procedural shader, every sound is
synthesised. Runs from a static folder — open `index.html` on any static server.

## Play

- **Click / hold the core** — inject a pulse. Keep the rhythm and your COMBO multiplier climbs.
- **SPACE / right-click** — fire the charge ring when the marker crosses the bright arc.
  Dead centre = PERFECT (×2, and the screen notices).
- **O** — trigger OVERDRIVE when the meter is full.
- **M** — mute. **P** — pause.

Progress is saved locally; offline production is credited when you come back.

## Why it is built this way

`docs/DESIGN.md` is the design document, including the **pacing contract** — the timings that keep
the game from going flat after five minutes. `tools/simulate.js` plays the game with a greedy bot
and fails CI if the contract is violated. Balance is measured, not hoped for. The current contract,
enforced in CI:

| By | Guaranteed |
|---|---|
| 1 s | first purchase |
| 1 s | first stage evolution |
| 2 s | first overdrive |
| 60 s | 5 distinct star forms seen |
| 10 min | 9 forms seen |
| ~4 min | first collapse (never before 3 min) |
| 30 min | first ascend |
| always | something affordable within 90 s — no dead walls |

```bash
node --test tests/*.test.js      # contract tests for the economy, content tables, formatting
node tools/simulate.js 3 42 3600 # balance gate: times to every milestone, 3 seeds
node tools/curve.js 42           # the growth curve the stage ladder was fitted to
```

## Layout

```
src/core/     pure game logic — no DOM, no three.js, unit-tested in Node
  math.js format.js events.js tune.js   foundation + every balance knob
  content.js        injectors, upgrades, stages, perks, achievements (data)
  economy.js        state, production, combo, charge ring, overdrive, prestige, save
  audio.js          WebAudio synthesis, no files
src/render/   three.js — core plasma shader, charge ring, particles, bloom, camera
src/ui/       DOM overlay (hud.js) + styles/ui.css
src/main.js   the only file that wires state → render → UI → audio
tools/        run-worker.sh, simulate.js
docs/         DESIGN.md, INTERFACES.md, tasks/ (the work orders this build was assembled from)
```

`src/core/**` never imports `three` and never touches the DOM. That is what makes the economy
testable headless and the renderer replaceable.

## Credits

Built in one session by muha7a and Anakin, with implementation work delegated to Claude Opus 5.5
(economy, renderer) and free-tier agents (content, UI, audio) under a written interface contract.
Three.js r186. MIT.
