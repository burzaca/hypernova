# WORK ORDER — a menu, and an honest answer about saving (player report, verbatim)

> Also we should have a menu, with a way to save our progress, how do we save it now? If it uses
> cookies, how long do these cookies last, what if we wanted to continue on another pc?
> What about if I wanted to reset and start a new one?

The game already autosaves to `localStorage` (key `hypernova.save.v1`, every 15 s, and on tab hide)
and has Export/Import buried in the STATS tab. The player could not find it and had no way to start
over. Build the menu that answers all of it.

## Files you may create — and ONLY these
- `src/ui/menu.js` — self-contained: injects its own `<style>` before its DOM (see
  `src/ui/titlecard.js` for the pattern).
Do NOT touch any other file. `src/main.js` is wired by the PM and exposes exactly these, already:
```js
api.exportSave()      // -> string
api.importSave(text)  // -> boolean
api.canCollapse() / api.canAscend()
```
and the PM is adding, in parallel:
```js
api.saveNow()         // -> void, writes immediately
api.resetSave()       // -> void, clears the save and reloads the page
```
Call those two through `api`; do not touch `localStorage` yourself.

## Contract
```js
export function createMenu(api, bus) => { open(), close(), toggle(), isOpen(), dispose() }
```
- Opens on the `Escape` key and from a small `MENU` button the module creates in the top bar area.
- Closes on Escape again, on the backdrop click, or on its own close button.
- While open, the game must NOT pause by itself (the PM decides that) — just do not change any
  game state.

## Contents (this copy is the point — it must be honest and plain)
1. `SAVE NOW` — calls `api.saveNow()`, then shows `Saved just now`.
2. `EXPORT` — calls `api.exportSave()`, puts the text in a textarea, selects it, and shows the hint
   `Copy this text. It is your whole game.`
3. `IMPORT` — a textarea plus a button calling `api.importSave(text)`; on failure show
   `That did not look like a save. Nothing was changed.`
4. `RESET PROGRESS` — two-step: first click arms it for 4 s with `This deletes your game. Click again`,
   second click calls `api.resetSave()`.
5. A short, factual note, no marketing:
   `Progress is stored in this browser (localStorage), not on a server. It survives closing the tab
   and restarting the browser, and it never expires on its own — but it does not follow you to
   another PC. Use EXPORT here to move a game between machines.`

## Hard rules
- No dependencies, no build step, plain ES modules, no emoji.
- Never throw if `api` is missing an optional method — hide that row instead.
- Style with the existing CSS variables (`--hn-accent`, `--hn-core`) like the other overlays.

## Definition of done
- `node --check src/ui/menu.js` clean.
- Self-test in a browser (`python3 -m http.server 8791 --bind 127.0.0.1`): Escape opens it, the
  buttons work, reset asks twice. Report what you actually saw.
