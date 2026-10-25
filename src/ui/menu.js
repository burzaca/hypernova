export function createMenu(api, bus) {
  // Contrast rules for this panel, learned from a player: "the menu is beige with orange text,
  // hard to read". --hn-core is a LIGHT peach and --hn-accent is orange, so using them as
  // background+text produced orange-on-peach. Controls are dark with light text like the rest of
  // the HUD; the accent is reserved for borders and hover.
  const STYLE = `
    #hn-menu-btn { position:fixed; top:10px; right:14px; z-index:35; font:700 11px/1 ui-monospace,monospace; letter-spacing:.12em; text-transform:uppercase; background:rgba(10,7,4,.9); color:#ffe9c9; border:1px solid rgba(255,210,160,.3); border-radius:6px; padding:7px 11px; cursor:pointer; }
    #hn-menu-btn:hover, #hn-menu-btn:focus-visible { color:#fff; border-color:var(--hn-accent,#ffb347); background:rgba(24,15,7,.95); outline:none; }
    #hn-menu { position:fixed; inset:0; z-index:45; display:flex; align-items:center; justify-content:center; background:rgba(4,3,8,.82); pointer-events:none; opacity:0; transition:opacity .15s ease; }
    #hn-menu.open { opacity:1; pointer-events:auto; }
    #hn-menu .back { position:absolute; inset:0; }
    #hn-menu .box { position:relative; background:#0a0704; border:1px solid rgba(255,210,160,.28); border-radius:6px; padding:22px 24px; max-width:420px; width:92vw; box-shadow:0 0 40px rgba(0,0,0,.6); }
    #hn-menu h2 { margin:0 0 14px; font:800 16px/1 ui-monospace,monospace; color:#fff3d6; letter-spacing:.08em; }
    #hn-menu .row { margin:10px 0; }
    #hn-menu .label { font:600 10px/1 ui-monospace,monospace; letter-spacing:.1em; text-transform:uppercase; color:rgba(255,235,205,.5); margin:0 0 4px; }
    #hn-menu button { font:700 11px/1 ui-monospace,monospace; letter-spacing:.1em; text-transform:uppercase; background:#171008; color:#ffe9c9; border:1px solid rgba(255,210,160,.3); border-radius:4px; padding:10px 14px; cursor:pointer; width:100%; text-align:left; }
    #hn-menu button:hover, #hn-menu button:focus-visible { color:#fff; border-color:var(--hn-accent,#ffb347); background:#221608; outline:none; }
    #hn-menu button:disabled { opacity:.35; }
    #hn-menu #hn-reset { color:#ffb3a4; border-color:rgba(255,120,90,.35); }
    #hn-menu #hn-reset:hover { color:#fff; border-color:#ff7a52; background:#2a1108; }
    #hn-menu .hint { font:500 11px/1.4 ui-monospace,monospace; color:rgba(255,240,220,.72); margin-top:6px; }
    #hn-menu .note { font:500 12px/1.55 ui-monospace,monospace; color:rgba(255,240,220,.7); margin-top:16px; border-top:1px solid rgba(255,210,160,.18); padding-top:12px; }
    #hn-menu textarea { width:100%; height:64px; background:#060403; color:#fff3d6; border:1px solid rgba(255,210,160,.25); border-radius:4px; font:12px/1.4 ui-monospace,monospace; padding:8px; resize:none; }
    #hn-menu textarea::placeholder { color:rgba(255,240,220,.35); }
  `;
  const s = document.createElement('style'); s.textContent = STYLE; document.head.appendChild(s);

  const btn = document.createElement('button'); btn.id = 'hn-menu-btn'; btn.textContent = 'MENU'; document.body.appendChild(btn);

  // The mute control already lives in the top-right of the HUD. A second fixed button at the same
  // corner lands on top of it — separately clickable, but it reads as a mistake. Sit next to it
  // instead, on the same row, with a real gap.
  function place() {
    const mute = document.querySelector('.mute-btn');
    if (!mute) return;                       // HUD not mounted (or hidden): keep the CSS fallback
    const r = mute.getBoundingClientRect();
    if (!r.width || !r.height) return;
    btn.style.top = Math.round(r.top) + 'px';
    btn.style.right = Math.round(window.innerWidth - r.left + 10) + 'px';
  }
  place();
  window.addEventListener('resize', place);

  const overlay = document.createElement('div'); overlay.id = 'hn-menu';
  overlay.innerHTML = `<div class="back"></div><div class="box"></div>`;
  document.body.appendChild(overlay);
  const box = overlay.querySelector('.box');

  let open = false;
  function build() {
    let html = '<h2>MENU</h2>';
    if (api && api.saveNow) html += `<div class="row"><button id="hn-save">SAVE NOW</button><div class="hint" id="hn-save-hint"></div></div>`;
    if (api && api.exportSave) html += `<div class="row"><button id="hn-export">EXPORT</button><div class="hint" id="hn-export-hint"></div><div class="label">your save as text</div><textarea id="hn-export-ta" readonly placeholder="Press EXPORT and it appears here. Copy it somewhere safe — this text is your whole game."></textarea></div>`;
    if (api && api.importSave) html += `<div class="row"><div class="label">paste a save to load</div><textarea id="hn-import-ta" placeholder="Paste the text from EXPORT on another machine, then press IMPORT."></textarea><button id="hn-import">IMPORT</button><div class="hint" id="hn-import-hint"></div></div>`;
    if (api && api.resetSave) html += `<div class="row"><button id="hn-reset">RESET PROGRESS</button><div class="hint" id="hn-reset-hint">This deletes your game. Click again to confirm.</div></div>`;
    html += `<div class="note">Progress is stored in this browser (localStorage), not on a server. It survives closing the tab and restarting the browser, and it never expires on its own — but it does not follow you to another PC. Use EXPORT here to move a game between machines.</div>`;
    box.innerHTML = html;

    if (api && api.saveNow) document.getElementById('hn-save').onclick = () => { api.saveNow(); document.getElementById('hn-save-hint').textContent = 'Saved just now.'; };
    if (api && api.exportSave) document.getElementById('hn-export').onclick = () => { const t = api.exportSave(); const ta = document.getElementById('hn-export-ta'); ta.value = t; ta.select(); document.getElementById('hn-export-hint').textContent = 'Copy this text. It is your whole game.'; };
    if (api && api.importSave) document.getElementById('hn-import').onclick = () => { const ok = api.importSave(document.getElementById('hn-import-ta').value); document.getElementById('hn-import-hint').textContent = ok ? 'Imported.' : 'That did not look like a save. Nothing was changed.'; };
    if (api && api.resetSave) {
      const b = document.getElementById('hn-reset');
      b.onclick = () => { if (b.dataset.armed === '1') { api.resetSave(); return; } b.dataset.armed = '1'; b.textContent = 'This deletes your game. Click again'; setTimeout(() => { b.dataset.armed = '0'; b.textContent = 'RESET PROGRESS'; }, 4000); };
    }
  }
  build();

  function openMenu() { if (open) return; open = true; overlay.classList.add('open'); build(); }
  function closeMenu() { open = false; overlay.classList.remove('open'); }
  btn.onclick = openMenu;
  overlay.querySelector('.back').onclick = closeMenu;
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') open ? closeMenu() : openMenu(); });
  return { open: openMenu, close: closeMenu, toggle: () => open ? closeMenu() : openMenu(), isOpen: () => open, dispose: () => { btn.remove(); overlay.remove(); s.remove(); } };
}
