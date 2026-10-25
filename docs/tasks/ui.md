You are the UI worker on the HYPERNOVA game build. You build the DOM overlay that sits on top of
the WebGL canvas. It must feel like a spacecraft console: dark, glassy, high-contrast numbers,
fast feedback. No frameworks, no HTML file edits.

READ FIRST:
1. docs/INTERFACES.md §8 (your contract) and §6 (the exact `snapshot` shape you receive).
2. docs/DESIGN.md §5-§7 (what the player must always be able to see).
3. src/core/format.js — you MUST use formatNumber / formatRate / formatMult / formatTime /
   progress01 for every number and bar. Never hand-format a number.

WRITE THESE TWO FILES AND NOTHING ELSE:
  src/ui/hud.js        — export function createHUD(root, bus, api) -> { update(snap), dispose() }
  styles/ui.css        — all styling

LAYOUT (desktop >= 900px):
- Top-left: FLUX (huge, tabular numerals, the biggest text on screen), under it the rate and the
  current global multiplier.
- Top-right: stage name + a progress bar to the next stage + play time + a mute button.
- Left column: INJECTORS list — one row per unlocked injector: name, owned count, cost, its own
  rate. Row is dimmed when unaffordable, hidden when locked (show a "LOCKED at X flux" ghost for
  the next one only). Click = buy. Show "+X/s" delta on hover/focus.
- Right column: two stacked panels with tabs — UPGRADES (only show affordable + next-3 locked),
  COLLAPSE/ASCEND (prestige: exactly how many shards/cores you would gain, and what it costs
  you), STATS.
- Bottom-centre: COMBO meter (fills and shows xN.NN, turns red as it decays) and OVERDRIVE meter
  (when full it must scream: pulsing border + "READY — press O").
- Bottom-left: a toast log (last 5 events: achievements, milestones, purchases). Keep it small.
- Mobile (< 900px): single column, panels collapse into a bottom sheet with tabs; the core stays
  visible above it.

BEHAVIOUR:
- `update(snap)` is called every frame. Create DOM rows ONCE and update textContent in place;
  never innerHTML per frame; never query the DOM per frame (cache references in a Map by id).
- Buy actions call api.buyInjector(id) etc. — never mutate state yourself.
- Keyboard: O = api.toggleOverdrive(). Also expose a visible button for it (mobile).
- Prestige buttons must be disabled with a clear reason when unavailable.
- Add a `data-affordable="1|0"` attribute on buy rows so CSS can style them; do not set inline
  styles per frame beyond transform/width on bars.
- Style: pure CSS, no images, no webfonts (system font stack + `font-variant-numeric: tabular-nums`).
  Use CSS custom properties for the palette so the renderer can retint the UI per stage:
  read `--hn-core`, `--hn-glow`, `--hn-accent` from :root and update them in `update()` from
  snap.stage.palette (throttled to when the stage actually changes).
- Panels: rgba dark glass, 1px hairline borders, subtle backdrop-filter blur, no drop shadows
  heavier than 0 0 24px rgba(0,0,0,.6). Nothing may obscure the centre of the screen.

SELF-TEST (must pass, paste real output):
  cd /home/hermes/projects/hypernova
  node --check src/ui/hud.js
  node -e "import('./src/ui/hud.js').then(m=>{console.log(typeof m.createHUD)}).catch(e=>{console.error('FAIL',e.message);process.exit(1)})"
  (it must at least parse and export the function; it will not run without a DOM — that is fine,
  but the import must not throw a syntax error.)
Also confirm styles/ui.css has no syntax errors by checking balanced braces.

Finish by printing the absolute paths you wrote, the self-test output, and the word DONE.
