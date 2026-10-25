REVISION ORDER — UI worker. The HUD renders now, but the PM verified it in a real browser and it
has real defects. Fix them. Same files, same API, no new files.

READ: docs/INTERFACES.md §8 and §6 (the snapshot shape). The files you already wrote:
src/ui/hud.js and styles/ui.css. You are editing them, not starting over.

DEFECTS OBSERVED IN CHROME (each one is real, with evidence):

1. RUNTIME ERROR, every frame: `Uncaught ReferenceError: snap is not defined at src/ui/hud.js:473`
   (inside the `buyHandlers` object). Several helper functions reference an `snap` that is not in
   their scope — also check `getLockedNextUpgrades(upgrade, count)` which uses `snap` too, and
   `unlockLockedInjector`. FIX: keep a module-scoped `let latest = null;` in createHUD, set it at
   the top of `update(snap)`, and have every handler/helper read `latest` (guard for null). Do not
   pass snapshots through the DOM.

2. The injector list renders as jammed plain text: `Ion Spark0150/s` — no cost, no owned count,
   no spacing, no classes. Each row MUST be structured markup with these classes:
   `.injector-row` (with `data-injector="<id>"` and `data-affordable="1|0"`), containing
   `.inj-name` (name), `.inj-owned` (owned count), `.inj-cost` (cost, prefixed with a small
   currency glyph), `.inj-rate` (its own +X/s). Use the classes in styles/ui.css; if a class is
   missing there, add it there.

3. Locked injectors are shown as normal rows. Requirement: hide every locked injector EXCEPT the
   next one, which renders as `.locked-ghost` with the text `LOCKED at <flux>` using its
   `unlockAt` field (the snapshot now provides `unlockAt` on every injector row).

4. The left and right panels are ~500px tall empty dark boxes that cover the star. Panels must
   size to their content (`height: auto`, `max-height: calc(100vh - 140px)`, `overflow-y: auto`)
   and must never cover the central 45% of the viewport horizontally. Keep the left column <= 320px
   wide and the right column <= 340px.

5. The mute button overlaps the play-time text in the top-right. Give that block a real row layout
   (flex, gap) so nothing overlaps at 1280px or at 380px wide.

6. The overdrive meter shows only "WAITING". It must show fill percentage while charging, and when
   full switch to a clear READY state (pulsing border + "READY — press O") and, while active, the
   remaining seconds.

7. Clicking an injector row must call api.buyInjector(id) and must work (it currently throws
   because of defect 1). Same for upgrade rows and the prestige buttons.

8. The UPGRADES tab renders nothing for the first minutes. Show the next 3 locked upgrades greyed
   out with their requirement text, and all affordable ones live. The COLLAPSE/ASCEND tab must
   state exactly what the player gains (`+N shards`) and what it costs them.

HARD CONSTRAINTS (unchanged):
- Only edit src/ui/hud.js and styles/ui.css.
- Keep the exported API: createHUD(root, bus, api) -> { update(snap), dispose() }.
- All numbers via formatNumber/formatRate/formatMult/formatTime from src/core/format.js.
- Build DOM once; update textContent in place; no innerHTML per frame; no per-frame querySelector.
- `#hud` itself stays pointer-events:none; its panels and rows are pointer-events:auto.

SELF-TEST before you finish (paste the real output):
  cd /home/hermes/projects/hypernova
  node --check src/ui/hud.js
  node -e "import('./src/ui/hud.js').then(m=>console.log('import ok', typeof m.createHUD))"
  grep -n "snap\." src/ui/hud.js | head -40   # every `snap.` reference must be inside a scope that has it
Then state, honestly, which defects you fixed and which you could not verify.
