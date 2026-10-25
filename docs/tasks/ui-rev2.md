REVISION ORDER (2nd attempt) — UI. A previous worker was given this job and changed exactly TWO
LINES while claiming eight defects were fixed. The PM verified in a real browser that the defects
are still there. Do the actual work this time, and paste your final `git diff --stat` output.

READ FIRST: docs/INTERFACES.md §8 (your contract) and §6 (the snapshot shape you receive).
EDIT ONLY: src/ui/hud.js and styles/ui.css.

DEFECTS, all observed in Chrome at 1280x577 with a real snapshot:

D1. Shop rows render as jammed plain text: `Ion Spark120288.3M28.8/s`, `Plasma Coil9558.38M228.0/s`.
    There is no cost shown, no spacing, and no `.injector-row` element exists in the DOM.
    REQUIRED: each row is `<div class="injector-row" data-injector="<id>" data-affordable="0|1">`
    containing `<span class="inj-name">`, `<span class="inj-owned">`, `<span class="inj-cost">`
    (the cost from the snapshot, formatted), `<span class="inj-rate">` (its own rate/s). Style them
    as a grid row: name left, owned + rate right, cost on a second line in a dimmer colour. Rows
    must be legible and clickable, with a visible hover/affordable state.

D2. Locked injectors appear as ordinary rows. Show only the NEXT locked one, as
    `<div class="locked-ghost">LOCKED at &lt;flux&gt;</div>` using the row's `unlockAt` field.

D3. The left panel is a ~500px tall empty dark box; the right panel is an even bigger empty box.
    They cover the star. Panels must fit their content: `height:auto`,
    `max-height: calc(100vh - 150px)`, `overflow-y:auto`, left column max-width 320px, right
    column max-width 340px, and nothing may overlap the central 45% of the viewport.

D4. The mute button overlaps the play-time text in the top-right corner. Lay that block out with
    flex + gap so it cannot overlap at 1280px or at 380px.

D5. The overdrive meter only ever says "WAITING". It must show the fill percentage while charging,
    switch to a pulsing "READY — press O" state when full, and show remaining seconds while active.

D6. The UPGRADES tab is empty in the first minutes. Render affordable upgrades as live rows and the
    next three locked ones greyed with their requirement (e.g. "needs 10 Ion Spark"). Clicking a
    live row must call api.buyUpgrade(id).

D7. The COLLAPSE/ASCEND tab must state exactly what happens: "+N shards (each +1% forever)" and a
    disabled state explaining the requirement when unavailable.

D8. Clicking a shop row currently does nothing useful. Wire every row/perk/prestige control to the
    api. Handlers must read the latest snapshot from a closure variable (`latest`), never an
    out-of-scope `snap`.

CONSTRAINTS: keep `export function createHUD(root, bus, api) -> { update(snap), dispose() }`;
all numbers through src/core/format.js; build DOM once and update textContent in place; no
innerHTML per frame; `#hud` stays pointer-events:none with panels/rows opted back in.

VERIFY BEFORE FINISHING (paste real output, do not paraphrase):
  cd /home/hermes/projects/hypernova
  node --check src/ui/hud.js
  node -e "import('./src/ui/hud.js').then(m=>console.log('import ok', typeof m.createHUD))"
  node -e "
    const {JSDOM}=(()=>{try{return require('jsdom')}catch{return {}}})();
    console.log(JSDOM?'jsdom available: run a DOM smoke test':'no jsdom — say so honestly');
  "
  If jsdom is unavailable, say so plainly instead of claiming browser verification.
  Finally run: git diff --stat src/ui/hud.js styles/ui.css   and paste it.
