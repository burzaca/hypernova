# HYPERNOVA — game design

**Genre:** active incremental (numbers-go-up), 3D, browser.
**Promise:** *Feed the core. Break the scale.* Numbers rise relentlessly, every 20–60 seconds
something new becomes affordable, and the thing in the middle of your screen keeps becoming
more beautiful and more dangerous.

**Art direction (hard requirement from the brief):** smooth, not blocky. No textures, no
Minecraft/Roblox look. Everything is procedural: gradient/fresnel shaders, soft additive
particles, bloom, a dark volumetric-feeling background. Think plasma, glass, light.

---

## 1. The three nested loops

### A. 1-second loop — PULSE (active)
Click/hold/tap the Core to inject a Pulse: instant flux.
Each pulse within `combo.window` seconds of the last raises **COMBO** (up to `maxCombo`).
`comboMult = 1 + combo * perCombo`. Combo decays when you stop.
Payoff: rising audio pitch, core glows hotter, HUD counter punches. Fast hands = more money.

### B. 6-second loop — CHARGE RING (skill)
A marker sweeps a ring around the Core. Press SPACE (or right-click / tap the ring) to fire.
- Hit inside the window → **CRITICAL SURGE**: large one-shot flux, +combo, fills Overdrive.
- Hit inside the centre `perfectFrac` of the window → **PERFECT**: ×2 crit, screen flash, hit-stop.
Sweep speed rises with tier; upgrades widen the window. This is the skill layer that keeps the
game from being a spreadsheet — the player is *doing* something throughout.

### C. 60-second loop — OVERDRIVE (peak)
Pulses and crits fill the Overdrive meter. When full the player triggers it (agency; an upgrade
adds auto-trigger): `overdrive.duration` seconds of ×`overdrive.mult` on everything, with the
whole scene going berserk (bloom up, camera dolly-in, trails, shockwave). This is the designed
dopamine peak of every run.

## 2. Passive layer — INJECTORS
Classic incremental economy: each injector has `baseCost`, `costGrowth` per unit owned, and
`baseRate` flux/sec. Tiers unlock as `totalFlux` passes `unlockAt`. Multiplier upgrades per
injector at 10/25/50/100 owned. Global multipliers come from Shards, Cores, and perks.

## 3. Upgrades that CHANGE the game (not just multiply it)
Auto-Pulse (automation), Combo Retention (slower decay), Wide Window (easier crits), Triple
Crit, Chain Surge (crits fire extra orbs), Overdrive Duration/Multiplier, Offline Production,
and a couple of risky trade-off upgrades (e.g. ×3 production but combo decays twice as fast).
Rule from the research: an upgrade that changes *how you play* beats one that only makes numbers
bigger.

## 4. Prestige layers
- **COLLAPSE** (layer 1): reset flux + injectors + upgrades, gain **Shards**
  = `floor((runFlux / shardDiv) ^ shardExp)`. Each Shard gives `+shardGainPct` to all
  production, and Shards buy **PERKS** — 10+ mechanic-changing permanent upgrades. This is the
  "meaningful choice" layer.
- **ASCEND** (layer 2, unlocks at `ascend.at` total flux): reset everything including Shards,
  gain **Nova Cores** = `floor((totalFlux / ascend.at) ^ coreExp)`, each giving
  `+coreGainPct` (compounding), and Cores unlock a second injector family plus a new colour
  theme. This is what stops minute 30+ from being the same game.

## 5. Stage evolution (visible progress = the glue)
`STAGES` is a table of total-flux thresholds with a palette, bloom value, core geometry detail
level, camera distance and a name (SPARK → EMBER → PLASMA → STAR → RED GIANT → SUPERNOVA →
NEUTRON STAR → QUASAR → HYPERNOVA → …). Crossing one fires a shockwave, a fanfare, a toast, and
permanently changes how the Core looks. The player must *see* their power.

## 6. Pacing contract (the "not boring after 5 minutes" gate — the sim must pass this)
| By | Must happen |
|---|---|
| < 10 s | first injector affordable and bought |
| < 60 s | first STAGE up |
| < 90 s | first OVERDRIVE |
| 4–8 min | first COLLAPSE available |
| every ≤ 90 s | at least one affordable purchase at all times during Act 1 (no dead walls) |
| 25–45 min | first ASCEND available |
| always | next goal visible and its distance shown |

If `tools/simulate.js` fails this table, the build is not shipped — the numbers get retuned.

## 7. Juice (non-negotiable for "AAA feel")
Screen shake on crits/overdrive/stage-ups, 40 ms hit-stop on PERFECT, HUD number punch,
floating +flux numbers in 3D, particle streams into the core, procedural WebAudio (blip whose
pitch rises with combo, crit chord, overdrive sweep + drone, stage fanfare). No asset files.

## 8. Save / offline
Autosave to localStorage every 15 s, export/import string, offline progress capped at
`maxOfflineSec` at `offlineFrac` rate, with a "while you were away" toast.

## 9. Architecture rule (why this is testable)
- `src/core/**` — pure JS. No DOM, no three.js. Unit-tested with `node --test`.
- `src/render/**` — three.js only. Reads a state snapshot, never mutates game state.
- `src/ui/**` — DOM only.
- `src/main.js` — the only place that wires them together. Owned by the PM.
- `tools/simulate.js` — headless autoplay bot; the balance gate.
