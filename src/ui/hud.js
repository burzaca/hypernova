// HYPERNOVA — HUD (DOM only). Contract: docs/INTERFACES.md §8.
// The DOM is built once; update(snap) only writes textContent / data-* / style widths on
// existing nodes. Rows are created the first time their id appears and reused forever after.
// Every click handler reads the closure variable `latest`, never a per-frame argument.
import { formatNumber, formatRate, formatMult, formatTime, progress01 } from '../core/format.js';
import { TUNE } from '../core/tune.js';
import { EVT } from '../core/events.js';
// Static data lookup only (names + `requires`): the snapshot carries neither upgrade/perk
// requirements nor injector names for requirement text, so D6 needs the content tables.
import { INJECTORS, NOVA_INJECTORS, UPGRADES, PERKS } from '../core/content.js';

const INJ_NAME = new Map([...INJECTORS, ...NOVA_INJECTORS].map((i) => [i.id, i.name]));
const NOVA_IDS = new Set(NOVA_INJECTORS.map((i) => i.id));
const NOVA_NOTE = 'Nova producers scale with your Nova Cores. They reset on prestige like the rest.';
const NOVA_TIP = ' Output x(1 + cores x ' + (TUNE.prestige.novaPerCore || 0) + '). Collapse and ascend reset it like every injector.';
const REQ = new Map([...UPGRADES, ...PERKS].map((u) => [u.id, u.requires || null]));
const LOCKED_UPGRADES_SHOWN = 3;
const TOAST_SLOTS = 4;
const TOAST_MS = 3200;
const CONFIRM_MS = 3000;
const COLLAPSE_COACH = 'A collapse is ready. It resets your injectors and upgrades — Shards make the next run faster.';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function setText(n, t) { if (n.textContent !== t) n.textContent = t; }
function setData(n, k, v) { if (n.dataset[k] !== v) n.dataset[k] = v; }
function setHidden(n, h) { if (n.hidden !== h) n.hidden = h; }
function pct(x) { return formatNumber(Math.floor(x * 100)) + '%'; }

const REQ_LABEL = {
  totalFlux: (v) => formatNumber(v) + ' total flux',
  collapses: (v) => formatNumber(v) + (v === 1 ? ' collapse' : ' collapses'),
  ascends: (v) => formatNumber(v) + (v === 1 ? ' ascend' : ' ascends'),
  pulses: (v) => formatNumber(v) + ' pulses',
  crits: (v) => formatNumber(v) + ' crits',
  perfects: (v) => formatNumber(v) + ' perfects',
  overdrives: (v) => formatNumber(v) + ' overdrives',
  stageIndex: (v) => 'stage ' + formatNumber(v + 1),
  injectorsTotal: (v) => formatNumber(v) + ' injectors',
  upgradesOwned: (v) => formatNumber(v) + ' upgrades',
  playSec: (v) => formatTime(v) + ' played',
};
function requirementText(id) {
  const req = REQ.get(id);
  if (!req) return 'locked';
  const parts = [];
  if (req.injector) parts.push(formatNumber(req.count != null ? req.count : 1) + ' ' + (INJ_NAME.get(req.injector) || req.injector));
  for (const k of Object.keys(req)) {
    if (k === 'injector' || k === 'count' || typeof req[k] !== 'number') continue;
    parts.push(REQ_LABEL[k] ? REQ_LABEL[k](req[k]) : formatNumber(req[k]) + ' ' + k);
  }
  return parts.length ? 'needs ' + parts.join(', ') : 'locked';
}
function upgradeEffect(u) {
  if (u.kind === 'injector_mult' && u.mult != null) return formatMult(u.mult) + ' one injector';
  if (u.kind === 'global_mult' && u.mult != null) return formatMult(u.mult) + ' all flux';
  if (u.kind === 'mechanic' && u.mechanic) return u.mechanic.key + ' ' + formatNumber(u.mechanic.value);
  return '';
}

// What a collapse takes away, computed from the snapshot only.
// The economy omits already-bought upgrades from snapshot.upgrades (it lists what can still be
// bought), so owned upgrades = content ids missing from that list, plus any flagged owned === true.
// Ascension Boon mods, rendered honestly (both signs, real units). Unknown keys fall back to
// "key +v" so a new mechanic can never render as blank.
const MINUS = '\u2212';
const signed = (v, digits = 0) => (v < 0 ? MINUS : '+') + formatNumber(Number(Math.abs(v).toFixed(digits)));
const BOON_MOD_LABEL = {
  autoPulse: (v) => 'Auto-pulse ' + signed(v) + '/s',
  overdriveMult: (v) => 'Overdrive peak ' + signed(v) + '\u00d7',
  overdriveDuration: (v) => 'Overdrive duration ' + signed(v) + 's',
  critMult: (v) => 'Crit multiplier ' + signed(v, 1),
  chainSurge: (v) => 'Chain orbs ' + signed(v),
  comboRetention: (v) => 'Combo retention ' + signed(v * 100) + '%',
  chargeWindow: (v) => 'Ring window ' + signed(v * 100) + '%',
  offlineFrac: (v) => 'Offline share ' + signed(v * 100) + '%',
  fluxMult: (v) => 'All flux ' + formatMult(v),
  autoCollapse: (v) => (v > 0 ? 'Auto-collapse on' : 'Auto-collapse off'),
};
function boonModParts(mods) {
  const out = [];
  if (!mods || typeof mods !== 'object') return out;
  for (const k of Object.keys(mods)) {
    const v = Number(mods[k]);
    if (!Number.isFinite(v) || v === 0) continue;
    const label = BOON_MOD_LABEL[k] ? BOON_MOD_LABEL[k](v) : k + ' ' + signed(v, 2);
    // fluxMult >= 1 is always an upside; everything else follows the sign.
    out.push({ text: label, good: k === 'fluxMult' ? v >= 1 : v > 0 });
  }
  return out;
}

function collapseLossText(snap) {
  let n = 0, levels = 0;
  for (const inj of (Array.isArray(snap.injectors) ? snap.injectors : [])) {
    const o = Number(inj && inj.owned) || 0;
    if (o > 0) { n += 1; levels += o; }
  }
  const listed = Array.isArray(snap.upgrades) ? snap.upgrades : [];
  // Count only what the snapshot says is owned. An earlier version counted ids that were *absent*
  // from the snapshot as owned, which is backwards: with a partial or empty list it claimed the
  // whole upgrade table would be lost. Unknown is not the same as owned.
  const u = listed.filter((x) => x && x.owned === true).length;
  if (n === 0 && u === 0) return 'nothing to lose yet';
  return 'resets ' + formatNumber(n) + ' injectors (' + formatNumber(levels) + ' levels) · ' + formatNumber(u) + ' upgrades';
}

export function createHUD(root, bus, api) {
  let latest = null;
  let collapsedThisSession = false; // set by any collapse (manual or auto) seen this session
  let collapseCoached = false;
  let activeTab = 'upgrades';
  let lastPalette = '';
  const disposers = [];
  const on = (target, evt, fn, opts) => { target.addEventListener(evt, fn, opts); disposers.push(() => target.removeEventListener(evt, fn, opts)); };
  const onBus = (evt, fn) => { bus.on(evt, fn); disposers.push(() => bus.off(evt, fn)); };

  // ------------------------------------------------------------ skeleton
  const left = el('div', 'hud-col hud-left');
  const right = el('div', 'hud-col hud-right');
  const meters = el('div', 'hud-meters');
  root.append(left, right, meters);

  // flux block
  const fluxBlock = el('div', 'panel flux-block');
  const fluxValue = el('div', 'flux-value', '0');
  const fluxRate = el('div', 'flux-rate', '');
  const fluxMult = el('div', 'flux-mult', '');
  fluxBlock.append(el('div', 'flux-label', 'FLUX'), fluxValue, fluxRate, fluxMult);

  // injector shop
  const shop = el('div', 'panel shop');
  const shopList = el('div', 'shop-list');
  const lockedGhost = el('div', 'locked-ghost');
  lockedGhost.hidden = true;
  // Second family (docs/SECOND_FAMILY.md): its own subheading, always shown so a player sees from
  // the shop alone that it exists, that ASCEND opens it, and that Nova Cores feed it.
  const novaSection = el('div', 'nova-section');
  const novaNote = el('div', 'nova-note', NOVA_NOTE);
  const novaBonus = el('div', 'nova-bonus', '');
  novaBonus.hidden = true;
  const novaList = el('div', 'shop-list nova-list');
  const novaGhost = el('div', 'locked-ghost nova-ghost', 'LOCKED until your first ASCEND');
  novaSection.append(el('div', 'sub-title nova-title', 'NOVA'), novaNote, novaBonus, novaList, novaGhost);
  shop.append(el('div', 'panel-title', 'INJECTORS'), shopList, lockedGhost, novaSection);

  // toasts
  const toasts = el('div', 'toasts');
  toasts.setAttribute('aria-live', 'polite');
  const toastEls = [];
  for (let i = 0; i < TOAST_SLOTS; i++) { const t = el('div', 'toast'); t.hidden = true; toasts.appendChild(t); toastEls.push(t); }
  left.append(fluxBlock, shop, toasts);

  // stage block (top right): flex rows so mute can never overlap the play time (D4)
  const stageBlock = el('div', 'panel stage-block');
  const stageHead = el('div', 'stage-head');
  const stageName = el('div', 'stage-name', '');
  const muteBtn = el('button', 'mute-btn', '🔊');
  muteBtn.type = 'button';
  muteBtn.title = 'Mute (M)';
  muteBtn.setAttribute('aria-label', 'Toggle sound');
  stageHead.append(stageName, muteBtn);
  const stageBar = el('div', 'bar stage-bar');
  const stageBarFill = el('div', 'bar-fill');
  stageBar.appendChild(stageBarFill);
  const stageMeta = el('div', 'stage-meta');
  const stageNext = el('span', 'stage-next', '');
  const playTime = el('span', 'play-time', '');
  stageMeta.append(stageNext, playTime);
  stageBlock.append(stageHead, stageBar, stageMeta);

  // tabbed panel
  const tabsPanel = el('div', 'panel tabs-panel');
  const tabBar = el('div', 'tab-bar');
  tabBar.setAttribute('role', 'tablist');
  const TAB_DEFS = [['upgrades', 'UPGRADES'], ['prestige', 'COLLAPSE/ASCEND'], ['stats', 'STATS']];
  const tabBtns = {};
  const tabBodies = {};
  for (const [id, label] of TAB_DEFS) {
    const b = el('button', 'tab-btn', label);
    b.type = 'button';
    b.dataset.tab = id;
    b.setAttribute('role', 'tab');
    tabBar.appendChild(b);
    tabBtns[id] = b;
    const body = el('div', 'tab-body');
    body.dataset.tab = id;
    tabBodies[id] = body;
  }
  tabsPanel.append(tabBar, tabBodies.upgrades, tabBodies.prestige, tabBodies.stats);
  right.append(stageBlock, tabsPanel);

  // upgrades tab
  const upgEmpty = el('div', 'empty-note', 'Nothing to buy yet — keep pulsing.');
  const upgLive = el('div', 'upg-live');
  // Mechanic upgrades change how the game plays (some automate resets); they get their own
  // group so they never read like a stat boost.
  const upgMechTitle = el('div', 'sub-title mech-title', 'MECHANICS');
  upgMechTitle.hidden = true;
  const upgMech = el('div', 'upg-mech');
  const upgLockedTitle = el('div', 'sub-title', 'COMING UP');
  const upgLocked = el('div', 'upg-locked');
  tabBodies.upgrades.append(upgEmpty, upgLive, upgMechTitle, upgMech, upgLockedTitle, upgLocked);

  // prestige tab
  function prestigeCard(kind, title) {
    const card = el('button', 'prestige-card');
    card.type = 'button';
    card.dataset.prestige = kind;
    const t = el('div', 'pc-title', title);
    const gain = el('div', 'pc-gain', '');
    const note = el('div', 'pc-note', '');
    const reason = el('div', 'pc-reason', '');
    card.append(t, gain, note, reason);
    return { card, t, gain, note, reason, armedUntil: 0 };
  }
  const collapseCard = prestigeCard('collapse', 'COLLAPSE');
  collapseCard.gain.classList.add('pc-cost'); // line 2: what a collapse takes away (muted)
  const ascendCard = prestigeCard('ascend', 'ASCEND');
  const shardLine = el('div', 'currency-line', '');
  const perkList = el('div', 'perk-list');
  // Ascension Boons: the offer panel (only while a choice is pending) sits above the prestige
  // cards; the owned list sits under the perks so the player can see the rules of this run.
  const boonPanel = el('div', 'boon-panel');
  boonPanel.hidden = true;
  const boonOfferList = el('div', 'boon-offers');
  boonPanel.append(el('div', 'sub-title boon-title', 'CHOOSE A BOON'),
    el('div', 'boon-note', 'Pick one — it changes the rules for every run from now on. No rush: keep playing and decide later.'),
    boonOfferList);
  const boonOwnedTitle = el('div', 'sub-title', 'BOONS');
  boonOwnedTitle.hidden = true;
  const boonOwnedList = el('div', 'boon-owned');
  tabBodies.prestige.append(boonPanel, collapseCard.card, ascendCard.card, shardLine, el('div', 'sub-title', 'PERKS (spend shards)'), perkList, boonOwnedTitle, boonOwnedList);

  // stats tab + save
  const statsGrid = el('dl', 'stats-grid');
  const STAT_DEFS = [
    ['playSec', 'Play time'], ['totalFlux', 'Total flux'], ['runFlux', 'Flux this run'],
    ['bestRate', 'Best rate'], ['spent', 'Flux spent'], ['pulses', 'Pulses'], ['crits', 'Crits'],
    ['perfects', 'Perfects'], ['collapses', 'Collapses'], ['totalShards', 'Total shards'],
    ['ascends', 'Ascends'], ['cores', 'Nova cores'],
  ];
  const statEls = {};
  for (const [k, label] of STAT_DEFS) {
    const dd = el('dd', null, '');
    statsGrid.append(el('dt', null, label), dd);
    statEls[k] = dd;
  }
  const saveBox = el('div', 'save-box');
  const saveText = el('textarea', 'save-text');
  saveText.rows = 3;
  saveText.spellcheck = false;
  saveText.placeholder = 'Export fills this box; paste a save here and press Import.';
  const saveRow = el('div', 'save-row');
  const exportBtn = el('button', 'btn', 'Export');
  const importBtn = el('button', 'btn', 'Import');
  exportBtn.type = importBtn.type = 'button';
  saveRow.append(exportBtn, importBtn);
  saveBox.append(el('div', 'sub-title', 'SAVE'), saveText, saveRow);
  tabBodies.stats.append(statsGrid, saveBox);

  // bottom-centre meters
  const comboMeter = el('div', 'panel meter combo-meter');
  const comboFill = el('div', 'meter-fill');
  const comboText = el('div', 'meter-text', 'COMBO x1');
  comboMeter.append(comboFill, comboText);
  const odMeter = el('button', 'panel meter od-meter');
  odMeter.type = 'button';
  odMeter.title = 'Overdrive (O)';
  odMeter.dataset.state = 'charging';
  const odFill = el('div', 'meter-fill');
  const odText = el('div', 'meter-text', 'OVERDRIVE 0%');
  odMeter.append(odFill, odText);
  meters.append(comboMeter, odMeter);

  // ------------------------------------------------------------ rows (created once per id)
  const injRows = new Map();
  function injRow(inj) {
    let r = injRows.get(inj.id);
    if (r) return r;
    const nova = inj.family === 'nova' || NOVA_IDS.has(inj.id);
    const row = el('div', nova ? 'injector-row nova-row' : 'injector-row');
    row.dataset.injector = inj.id;
    if (nova) row.dataset.family = 'nova';
    if (nova) row.title = (inj.blurb ? inj.blurb + ' ' : '') + NOVA_TIP.trim();
    row.dataset.affordable = '0';
    row.setAttribute('role', 'button');
    row.tabIndex = 0;
    const name = el('span', 'inj-name', inj.name);
    const owned = el('span', 'inj-owned', '');
    const cost = el('span', 'inj-cost', '');
    const rate = el('span', 'inj-rate', '');
    row.append(name, owned, rate, cost);
    (nova ? novaList : shopList).appendChild(row);
    r = { row, name, owned, cost, rate };
    injRows.set(inj.id, r);
    return r;
  }

  const upgRows = new Map();
  function upgRow(u) {
    let r = upgRows.get(u.id);
    if (r) return r;
    const row = el('div', 'upgrade-row');
    row.dataset.upgrade = u.id;
    row.dataset.kind = u.kind === 'mechanic' ? 'mechanic' : 'mult';
    row.dataset.affordable = '0';
    row.dataset.locked = '0';
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    const name = el('span', 'upg-name', u.name);
    const cost = el('span', 'upg-cost', '');
    const info = el('span', 'upg-info', '');
    row.append(name, cost, info);
    r = { row, name, cost, info, mechanic: u.kind === 'mechanic', effect: upgradeEffect(u), blurb: u.blurb || '' };
    upgRows.set(u.id, r);
    return r;
  }

  const perkRows = new Map();
  function perkRow(p) {
    let r = perkRows.get(p.id);
    if (r) return r;
    const row = el('div', 'perk-row');
    row.dataset.perk = p.id;
    row.dataset.affordable = '0';
    row.dataset.owned = '0';
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    const name = el('span', 'perk-name', p.name);
    const cost = el('span', 'perk-cost', '');
    const info = el('span', 'perk-info', p.blurb || '');
    row.append(name, cost, info);
    perkList.appendChild(row);
    r = { row, name, cost, info };
    perkRows.set(p.id, r);
    return r;
  }

  // Boon offer cards: 3 fixed slots, rewritten when the offer changes (rare).
  const boonSlots = [];
  for (let i = 0; i < 3; i++) {
    const row = el('div', 'boon-row');
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.hidden = true;
    const name = el('span', 'boon-name', '');
    const blurb = el('span', 'boon-blurb', '');
    const mods = el('span', 'boon-mods', '');
    row.append(name, blurb, mods);
    boonOfferList.appendChild(row);
    boonSlots.push({ row, name, blurb, mods });
  }
  const boonOwnedRows = new Map();
  function boonOwnedRow(b) {
    let r = boonOwnedRows.get(b.id);
    if (r) return r;
    const row = el('div', 'boon-owned-row');
    row.append(el('span', 'boon-name', b.name), el('span', 'boon-blurb', b.blurb || ''));
    boonOwnedList.appendChild(row);
    r = { row };
    boonOwnedRows.set(b.id, r);
    return r;
  }
  let boonOfferKey = '';
  function renderBoons(snap) {
    const bn = snap.boons && typeof snap.boons === 'object' ? snap.boons : { offers: [], owned: [], pending: false };
    const offers = Array.isArray(bn.offers) ? bn.offers : [];
    const pending = !!bn.pending && offers.length > 0;
    setHidden(boonPanel, !pending);
    setData(tabBtns.prestige, 'boon', pending ? '1' : '0');
    const key = offers.map((o) => o.id).join(',');
    if (key !== boonOfferKey) {
      boonOfferKey = key;
      boonSlots.forEach((slot, i) => {
        const o = offers[i];
        setHidden(slot.row, !o);
        if (!o) { delete slot.row.dataset.boon; return; }
        slot.row.dataset.boon = o.id;
        setText(slot.name, o.name);
        setText(slot.blurb, o.blurb);
        slot.mods.textContent = '';
        for (const m of boonModParts(o.mods)) {
          const chip = el('span', 'boon-mod', m.text);
          chip.dataset.good = m.good ? '1' : '0';
          slot.mods.appendChild(chip);
        }
      });
    }
    const owned = Array.isArray(bn.owned) ? bn.owned : [];
    setHidden(boonOwnedTitle, owned.length === 0);
    for (const b of owned) boonOwnedRow(b);
  }

  // ------------------------------------------------------------ input (all read `latest`)
  function activate(target) {
    if (!latest || !target) return;
    const injRowEl = target.closest('[data-injector]');
    if (injRowEl) {
      const id = injRowEl.dataset.injector;
      const inj = latest.injectors.find((i) => i.id === id);
      if (inj && inj.unlocked) api.buyInjector(id);
      return;
    }
    const upgEl = target.closest('[data-upgrade]');
    if (upgEl) {
      const id = upgEl.dataset.upgrade;
      const u = latest.upgrades.find((x) => x.id === id);
      if (u && u.unlocked) api.buyUpgrade(id);
      return;
    }
    const boonEl = target.closest('[data-boon]');
    if (boonEl && boonEl.classList.contains('boon-row')) {
      const id = boonEl.dataset.boon;
      const offers = latest.boons && Array.isArray(latest.boons.offers) ? latest.boons.offers : [];
      if (offers.some((o) => o.id === id) && api.chooseBoon) api.chooseBoon(id);
      return;
    }
    const perkEl = target.closest('[data-perk]');
    if (perkEl) {
      const id = perkEl.dataset.perk;
      const p = latest.perks.find((x) => x.id === id);
      if (p && !p.owned) api.buyPerk(id);
      return;
    }
    const pEl = target.closest('[data-prestige]');
    if (pEl) {
      const kind = pEl.dataset.prestige;
      const card = kind === 'collapse' ? collapseCard : ascendCard;
      const ok = kind === 'collapse' ? latest.collapse.available : latest.ascend.available;
      if (!ok) return;
      const now = performance.now();
      // Collapse: confirm only until the player has seen one happen this session (no nagging).
      // Ascend: always 2-step.
      const needConfirm = kind === 'collapse' ? !collapsedThisSession : true;
      if (needConfirm && now > card.armedUntil) { card.armedUntil = now + CONFIRM_MS; render(); return; }
      card.armedUntil = 0;
      if (kind === 'collapse') api.collapse(); else api.ascend();
    }
  }
  const panelClick = (e) => activate(e.target);
  const panelKey = (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"]')) { e.preventDefault(); activate(e.target); }
  };
  // Any click outside the armed collapse card disarms it.
  on(document, 'pointerdown', (e) => {
    if (collapseCard.armedUntil && !(e.target && e.target.closest && collapseCard.card.contains(e.target))) {
      collapseCard.armedUntil = 0;
      render();
    }
  }, true);
  on(left, 'click', panelClick);
  on(right, 'click', panelClick);
  on(left, 'keydown', panelKey);
  on(right, 'keydown', panelKey);
  on(tabBar, 'click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) { activeTab = b.dataset.tab; applyTab(); }
  });
  on(muteBtn, 'click', () => { if (api.toggleMute) api.toggleMute(); renderMute(); });
  // O / M keys are bound in main.js; the meter is the touch/click affordance.
  on(odMeter, 'click', () => { api.toggleOverdrive(); });
  on(exportBtn, 'click', () => {
    try { saveText.value = api.exportSave(); saveText.select(); toast('Save exported — copy the text.'); }
    catch (err) { toast('Export failed'); }
  });
  on(importBtn, 'click', () => {
    const txt = saveText.value.trim();
    if (!txt) { toast('Paste a save first.'); return; }
    toast(api.importSave(txt) ? 'Save imported.' : 'Import failed: not a valid save.');
  });

  function applyTab() {
    for (const [id] of TAB_DEFS) {
      const sel = id === activeTab;
      tabBtns[id].classList.toggle('active', sel);
      tabBtns[id].setAttribute('aria-selected', sel ? 'true' : 'false');
      setHidden(tabBodies[id], !sel);
    }
  }
  applyTab();

  function renderMute() {
    const muted = api.isMuted ? api.isMuted() : false;
    muteBtn.classList.toggle('muted', muted);
    setText(muteBtn, muted ? '🔇' : '🔊');
  }

  // ------------------------------------------------------------ toasts
  let toastIdx = 0;
  const toastTimers = new Array(TOAST_SLOTS).fill(0);
  function toast(text) {
    if (!text) return;
    const i = toastIdx; toastIdx = (toastIdx + 1) % TOAST_SLOTS;
    const t = toastEls[i];
    t.textContent = text;
    t.hidden = false;
    toasts.appendChild(t); // newest at the bottom
    clearTimeout(toastTimers[i]);
    toastTimers[i] = setTimeout(() => { t.hidden = true; }, TOAST_MS);
  }
  onBus(EVT.LOG, (p) => {
    if (!p) return;
    if (p.text) toast(p.text);
    else if (p.kind === 'offline' && p.gain > 0) toast('While you were away: +' + formatNumber(p.gain) + ' flux');
  });
  onBus(EVT.STAGE_UP, (p) => toast('Stage reached: ' + ((p && p.name) || '')));
  onBus(EVT.ACHIEVEMENT, (p) => toast('Achievement: ' + ((p && p.name) || '')));
  onBus(EVT.OVERDRIVE_START, () => toast('OVERDRIVE!'));
  onBus(EVT.COLLAPSE, (p) => {
    collapsedThisSession = true; // manual or auto: from now on one click is enough
    collapseCard.armedUntil = 0;
    toast('Collapsed: +' + formatNumber((p && p.shards) || 0) + ' shards');
  });
  onBus(EVT.ASCEND, (p) => toast('Ascended: +' + formatNumber((p && p.cores) || 0) + ' cores'));
  onBus(EVT.BOON, (p) => toast('Boon taken: ' + ((p && p.name) || '')));

  // ------------------------------------------------------------ per-frame render
  let upgOrderKey = '';
  function render() {
    const snap = latest;
    if (!snap) return;

    // Degrade, never crash: a snapshot without an optional section renders without it. main.js
    // already keeps a HUD fault from killing the game, but a missing section should not even log.
    if (!snap.collapse) snap.collapse = { available: false, shards: 0 };
    if (!snap.ascend) snap.ascend = { available: false, cores: 0 };
    if (!snap.boons) snap.boons = { offers: [], owned: [], pending: false };

    // palette -> CSS vars (only when the stage changes)
    const pal = snap.stage && snap.stage.palette;
    const palKey = pal ? (pal.core || '') + (pal.glow || '') + (pal.accent || '') : '';
    if (palKey && palKey !== lastPalette) {
      lastPalette = palKey;
      if (pal.core) root.style.setProperty('--hn-core', pal.core);
      if (pal.glow) root.style.setProperty('--hn-glow', pal.glow);
      if (pal.accent) root.style.setProperty('--hn-accent', pal.accent);
    }

    // flux
    setText(fluxValue, formatNumber(snap.flux));
    setText(fluxRate, formatRate(snap.rate));
    const odActive = snap.overdriveTimer > 0;
    setText(fluxMult, 'combo ' + formatMult(snap.comboMult) + (odActive ? '  ·  overdrive ' + formatMult(TUNE.overdrive.mult) : ''));

    // stage
    const st = snap.stage;
    setText(stageName, st.name);
    stageBarFill.style.width = (progress01(st.progress, 1) * 100) + '%';
    setText(stageNext, st.nextAt != null ? 'next at ' + formatNumber(st.nextAt) + ' (' + pct(progress01(st.progress, 1)) + ')' : 'final stage');
    setText(playTime, formatTime(snap.playSec));
    renderMute();

    // injectors (D1, D2)
    let nextLocked = null;
    let nextNova = null;
    let novaListed = 0;
    for (const inj of snap.injectors) {
      const r = injRow(inj);
      const nova = inj.family === 'nova' || NOVA_IDS.has(inj.id);
      if (nova) novaListed += 1;
      if (!inj.unlocked) {
        setHidden(r.row, true);
        if (nova) { if (!nextNova) nextNova = inj; } else if (!nextLocked) nextLocked = inj;
        continue;
      }
      setHidden(r.row, false);
      setData(r.row, 'affordable', inj.affordable ? '1' : '0');
      setText(r.owned, 'x' + formatNumber(inj.owned));
      setText(r.rate, formatRate(inj.rate));
      setText(r.cost, 'cost ' + formatNumber(inj.cost));
    }
    if (nextLocked) {
      setHidden(lockedGhost, false);
      setText(lockedGhost, 'LOCKED at ' + formatNumber(nextLocked.unlockAt) + ' flux');
    } else setHidden(lockedGhost, true);
    // NOVA: before the first ascend the snapshot lists no nova rows at all.
    const asc = Number(snap.ascends) || 0;
    const cores = Number(snap.cores) || 0;
    setHidden(novaBonus, novaListed === 0);
    if (novaListed > 0) {
      setText(novaBonus, 'now ' + formatMult(1 + cores * (TUNE.prestige.novaPerCore || 0)) + ' from '
        + formatNumber(cores) + (cores === 1 ? ' Nova Core' : ' Nova Cores'));
    }
    if (novaListed === 0) {
      setHidden(novaGhost, false);
      setText(novaGhost, 'LOCKED until your first ASCEND');
    } else if (nextNova) {
      setHidden(novaGhost, false);
      const need = Number(nextNova.requiresAscends) || 0;
      setText(novaGhost, need > asc
        ? 'next: LOCKED until ASCEND #' + formatNumber(need)
        : 'next: LOCKED at ' + formatNumber(nextNova.unlockAt) + ' flux');
    } else setHidden(novaGhost, true);

    // upgrades (D6): unlocked rows live, next three locked rows greyed with requirement
    const upgList = Array.isArray(snap.upgrades) ? snap.upgrades : [];
    const live = [];
    const locked = [];
    for (const u of upgList) (u.unlocked ? live : locked).push(u);
    live.sort((a, b) => a.cost - b.cost);
    locked.sort((a, b) => a.cost - b.cost);
    const liveMult = live.filter((u) => u.kind !== 'mechanic');
    const liveMech = live.filter((u) => u.kind === 'mechanic');
    const shownLocked = locked.slice(0, LOCKED_UPGRADES_SHOWN);
    const key = liveMult.map((u) => u.id).join(',') + '|' + liveMech.map((u) => u.id).join(',') + '|' + shownLocked.map((u) => u.id).join(',');
    if (key !== upgOrderKey) { // membership changed: re-slot rows (rare; appendChild moves nodes)
      upgOrderKey = key;
      for (const r of upgRows.values()) setHidden(r.row, true);
      for (const u of liveMult) { const r = upgRow(u); setData(r.row, 'locked', '0'); upgLive.appendChild(r.row); setHidden(r.row, false); }
      for (const u of liveMech) { const r = upgRow(u); setData(r.row, 'locked', '0'); upgMech.appendChild(r.row); setHidden(r.row, false); }
      for (const u of shownLocked) { const r = upgRow(u); setData(r.row, 'locked', '1'); upgLocked.appendChild(r.row); setHidden(r.row, false); }
      setHidden(upgEmpty, live.length > 0);
      setHidden(upgMechTitle, liveMech.length === 0);
      setHidden(upgLockedTitle, shownLocked.length === 0);
    }
    for (const u of live) {
      const r = upgRows.get(u.id);
      setData(r.row, 'affordable', u.affordable ? '1' : '0');
      setText(r.cost, formatNumber(u.cost));
      // Mechanics show their full blurb (what it actually does), never the raw key/value.
      setText(r.info, r.mechanic ? (r.blurb || r.effect) : (r.effect || r.blurb));
    }
    for (const u of shownLocked) {
      const r = upgRows.get(u.id);
      setData(r.row, 'affordable', '0');
      setText(r.cost, formatNumber(u.cost));
      setText(r.info, requirementText(u.id));
    }

    // prestige (D7)
    const P = TUNE.prestige;
    const now = performance.now();
    const cc = collapseCard;
    const col = snap.collapse || {};
    const cAvail = !!col.available;
    const shardsTxt = formatNumber(col.shards || 0);
    if (!cAvail) cc.armedUntil = 0;
    const cArmed = cAvail && now < cc.armedUntil;
    if (!cArmed && cc.armedUntil) cc.armedUntil = 0; // timer expired -> disarmed
    setData(cc.card, 'available', cAvail ? '1' : '0');
    setData(cc.card, 'armed', cArmed ? '1' : '0');
    cc.card.setAttribute('aria-disabled', cAvail ? 'false' : 'true');
    if (cAvail) {
      // Line 1 = reward, line 2 = what it costs you.
      setText(cc.t, cArmed ? 'CONFIRM — reset everything for +' + shardsTxt : 'COLLAPSE  +' + shardsTxt + ' Shards');
      setText(cc.gain, collapseLossText(snap));
      setText(cc.note, 'Each Shard +' + formatNumber(P.shardGainPct * 100) + '% flux forever. Keeps stage, shards, perks.');
      setText(cc.reason, cArmed ? 'click again to collapse' : (collapsedThisSession ? 'Click to collapse' : 'Click to collapse (asks to confirm)'));
    } else {
      setText(cc.t, 'COLLAPSE');
      setText(cc.gain, '');
      setText(cc.note, 'Resets flux, injectors and upgrades. Keeps stage, shards, perks.');
      setText(cc.reason, 'Unavailable: needs ' + formatNumber(P.shardDiv) + ' flux this run (now ' + formatNumber(snap.runFlux) + ')');
    }
    setHidden(cc.gain, !cAvail);
    // Teach it once: the first time a collapse becomes available for a player who has never collapsed.
    if (cAvail && !collapseCoached) {
      collapseCoached = true;
      if (!(snap.collapses > 0)) { try { bus.emit(EVT.LOG, { text: COLLAPSE_COACH }); } catch { /* coaching is optional */ } }
    }

    const ac = ascendCard;
    const aAvail = !!snap.ascend.available;
    setData(ac.card, 'available', aAvail ? '1' : '0');
    ac.card.setAttribute('aria-disabled', aAvail ? 'false' : 'true');
    setText(ac.gain, '+' + formatNumber(snap.ascend.cores) + ' cores (each ' + formatMult(1 + P.coreGainPct) + ' forever, compounding)');
    setText(ac.note, 'Resets everything incl. total flux, shards and perks. Keeps stages and achievements.');
    if (!aAvail) setText(ac.reason, 'Unavailable: needs ' + formatNumber(P.ascendAt) + ' total flux (now ' + formatNumber(snap.totalFlux) + ')');
    else setText(ac.reason, now < ac.armedUntil ? 'Click again to confirm' : 'Click to ascend');
    setData(ac.card, 'armed', now < ac.armedUntil ? '1' : '0');

    setText(shardLine, 'Shards: ' + formatNumber(snap.shards) + '  ·  total ' + formatNumber(snap.totalShards) + '  ·  Cores: ' + formatNumber(snap.cores));
    for (const p of snap.perks) {
      const r = perkRow(p);
      setData(r.row, 'owned', p.owned ? '1' : '0');
      setData(r.row, 'affordable', !p.owned && p.affordable ? '1' : '0');
      setText(r.cost, p.owned ? 'OWNED' : formatNumber(p.cost) + ' shards');
      if (!p.owned && !p.affordable) {
        const req = REQ.get(p.id);
        setText(r.info, req ? requirementText(p.id) : (p.blurb || ''));
      } else setText(r.info, p.blurb || '');
    }

    renderBoons(snap);

    // stats
    const s = snap.stats || {};
    setText(statEls.playSec, formatTime(snap.playSec));
    setText(statEls.totalFlux, formatNumber(snap.totalFlux));
    setText(statEls.runFlux, formatNumber(snap.runFlux));
    setText(statEls.bestRate, formatRate(s.bestRate || 0));
    setText(statEls.spent, formatNumber(s.spent || 0));
    setText(statEls.pulses, formatNumber(s.pulses || 0));
    setText(statEls.crits, formatNumber(s.crits || 0));
    setText(statEls.perfects, formatNumber(s.perfects || 0));
    setText(statEls.collapses, formatNumber(snap.collapses));
    setText(statEls.totalShards, formatNumber(snap.totalShards));
    setText(statEls.ascends, formatNumber(snap.ascends));
    setText(statEls.cores, formatNumber(snap.cores));

    // combo meter
    comboFill.style.width = (progress01(snap.combo, TUNE.combo.maxCombo) * 100) + '%';
    setText(comboText, 'COMBO ' + formatMult(snap.comboMult));

    // overdrive meter (D5)
    const need = TUNE.overdrive.need;
    if (odActive) {
      setData(odMeter, 'state', 'active');
      const dur = Math.max(TUNE.overdrive.duration, snap.overdriveTimer);
      odFill.style.width = (progress01(snap.overdriveTimer, dur) * 100) + '%';
      setText(odText, 'OVERDRIVE ' + formatTime(Math.ceil(snap.overdriveTimer)) + ' left');
    } else if (snap.overdrive >= need) {
      setData(odMeter, 'state', 'ready');
      odFill.style.width = '100%';
      setText(odText, 'READY — press O');
    } else {
      setData(odMeter, 'state', 'charging');
      const f = progress01(snap.overdrive, need);
      odFill.style.width = (f * 100) + '%';
      setText(odText, 'OVERDRIVE ' + pct(f));
    }
  }

  return {
    update(snap) {
      latest = snap;
      render();
    },
    dispose() {
      for (const d of disposers) d();
      disposers.length = 0;
      for (const t of toastTimers) clearTimeout(t);
      left.remove(); right.remove(); meters.remove();
    },
  };
}
