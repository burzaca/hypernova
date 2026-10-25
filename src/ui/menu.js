export function createMenu(api, bus) {
  const STYLE = `
    #hn-menu-btn { position:fixed; top:10px; right:14px; z-index:35; font:700 11px/1 ui-monospace,monospace; letter-spacing:.12em; text-transform:uppercase; background:var(--hn-core,#0a0603); color:var(--hn-accent,#ffd9a0); border:1px solid rgba(255,210,160,.35); border-radius:2px; padding:6px 10px; cursor:pointer; }
    #hn-menu { position:fixed; inset:0; z-index:45; display:flex; align-items:center; justify-content:center; background:rgba(4,3,8,.82); pointer-events:none; opacity:0; transition:opacity .15s ease; }
    #hn-menu.open { opacity:1; pointer-events:auto; }
    #hn-menu .back { position:absolute; inset:0; }
    #hn-menu .box { position:relative; background:#0a0603; border:1px solid rgba(255,210,160,.35); border-radius:4px; padding:22px 24px; max-width:420px; width:92vw; box-shadow:0 0 40px rgba(255,150,40,.2); }
    #hn-menu h2 { margin:0 0 14px; font:800 16px/1 ui-monospace,monospace; color:#fff3d6; letter-spacing:.08em; }
    #hn-menu .row { margin:8px 0; }
    #hn-menu button { font:700 11px/1 ui-monospace,monospace; letter-spacing:.1em; text-transform:uppercase; background:var(--hn-core,#0a0603); color:var(--hn-accent,#ffd9a0); border:1px solid rgba(255,210,160,.45); border-radius:2px; padding:8px 14px; cursor:pointer; width:100%; text-align:left; }
    #hn-menu button:disabled { opacity:.35; }
    #hn-menu .hint { font:500 11px/1 ui-monospace,monospace; color:rgba(255,240,220,.6); margin-top:6px; }
    #hn-menu .note { font:500 12px/1.5 ui-monospace,monospace; color:rgba(255,240,220,.55); margin-top:14px; border-top:1px solid rgba(255,210,160,.15); padding-top:10px; }
    #hn-menu textarea { width:100%; height:70px; background:#050302; color:#fff3d6; border:1px solid rgba(255,210,160,.25); border-radius:2px; font:12px/1.4 ui-monospace,monospace; padding:6px; resize:none; }
  `;
  const s = document.createElement('style'); s.textContent = STYLE; document.head.appendChild(s);

  const btn = document.createElement('button'); btn.id = 'hn-menu-btn'; btn.textContent = 'MENU'; document.body.appendChild(btn);

  const overlay = document.createElement('div'); overlay.id = 'hn-menu';
  overlay.innerHTML = `<div class="back"></div><div class="box"></div>`;
  document.body.appendChild(overlay);
  const box = overlay.querySelector('.box');

  let open = false;
  function build() {
    let html = '<h2>MENU</h2>';
    if (api && api.saveNow) html += `<div class="row"><button id="hn-save">SAVE NOW</button><div class="hint" id="hn-save-hint"></div></div>`;
    if (api && api.exportSave) html += `<div class="row"><button id="hn-export">EXPORT</button><div class="hint" id="hn-export-hint"></div></div><textarea id="hn-export-ta" readonly></textarea>`;
    if (api && api.importSave) html += `<div class="row"><textarea id="hn-import-ta"></textarea><button id="hn-import">IMPORT</button><div class="hint" id="hn-import-hint"></div></div>`;
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
