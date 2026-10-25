import { formatNumber, formatRate, formatMult, formatTime, progress01 } from '../core/format.js';
import { TUNE } from '../core/tune.js';
import { EVT } from '../core/events.js';

// Helper to create DOM elements with IDs for easy caching
function createElement(tag, id) {
  const el = document.createElement(tag);
  el.id = id;
  return el;
}

// Helper to set text content safely
function setText(el, text) {
  el.textContent = text;
}

// Main HUD class
export function createHUD(root, bus, api) {
  // Cache DOM elements by ID to avoid querySelector per frame
  const cache = new Map();
  
  // Build the HUD structure
  const fluxBlock = createElement('div', 'flux-block');
  fluxBlock.style.position = 'absolute';
  fluxBlock.style.left = '16px';
  fluxBlock.style.top = '16px';
  fluxBlock.style.zIndex = '10';
  root.appendChild(fluxBlock);
  
  // FLUX value (huge)
  const fluxValue = createElement('div', 'flux-value');
  fluxValue.style.fontSize = '3.5rem';
  fluxValue.style.fontVariantNumeric = 'tabular-nums';
  fluxValue.style.fontFamily = 'monospace';
  fluxBlock.appendChild(fluxValue);
  
  // FLUX rate
  const fluxRate = createElement('div', 'flux-rate');
  fluxRate.style.fontSize = '1.5rem';
  fluxBlock.appendChild(fluxRate);
  
  // FLUX multiplier
  const fluxMult = createElement('div', 'flux-mult');
  fluxMult.style.fontSize = '1.5rem';
  fluxBlock.appendChild(fluxMult);
  
  // Stage block (top-right)
  const stageBlock = createElement('div', 'stage-block');
  stageBlock.style.position = 'absolute';
  stageBlock.style.right = '16px';
  stageBlock.style.top = '16px';
  stageBlock.style.zIndex = '10';
  root.appendChild(stageBlock);
  
  // Stage name
  const stageName = createElement('div', 'stage-name');
  stageBlock.appendChild(stageName);
  
  // Stage progress bar
  const stageBar = createElement('div', 'stage-bar');
  stageBar.style.position = 'relative';
  stageBar.style.height = '8px';
  stageBar.style.width = '120px';
  stageBar.style.backgroundColor = 'rgba(255,255,255,0.2)';
  stageBar.style.borderRadius = '4px';
  stageBlock.appendChild(stageBar);
  
  const stageBarFill = createElement('div', 'stage-bar-fill');
  stageBar.appendChild(stageBarFill);
  
  // Play time
  const playTime = createElement('div', 'play-time');
  stageBlock.appendChild(playTime);
  
  // Mute button
  const muteBtn = createElement('button', 'mute-btn');
  muteBtn.textContent = '🔊';
  muteBtn.title = 'Mute';
  muteBtn.style.position = 'absolute';
  muteBtn.style.right = '10px';
  muteBtn.style.bottom = '10px';
  stageBlock.appendChild(muteBtn);
  
  // Injectors list (left column)
  const injectorList = createElement('div', 'injector-list');
  injectorList.style.position = 'absolute';
  injectorList.style.left = '16px';
  injectorList.style.top = '140px';
  injectorList.style.width = '40%';
  injectorList.style.height = 'calc(100vh - 200px)';
  injectorList.style.overflow = 'auto';
  injectorList.style.backgroundColor = 'rgba(0,0,0,0.6)';
  injectorList.style.borderRadius = '4px';
  injectorList.style.padding = '8px';
  root.appendChild(injectorList);
  
  // Right column panels (tabs)
  const panelsContainer = createElement('div', 'panels-container');
  panelsContainer.style.position = 'absolute';
  panelsContainer.style.right = '16px';
  panelsContainer.style.top = '140px';
  panelsContainer.style.width = '35%';
  panelsContainer.style.height = 'calc(100vh - 200px)';
  panelsContainer.style.overflow = 'hidden';
  root.appendChild(panelsContainer);
  
  // Tabs
  const tabs = createElement('div', 'panels-tabs');
  tabs.style.position = 'absolute';
  tabs.style.left = '0';
  tabs.style.bottom = '0';
  tabs.style.height = '32px';
  tabs.style.display = 'flex';
  tabs.style.borderTop = '1px solid rgba(255,255,255,0.2)';
  panelsContainer.appendChild(tabs);
  
  const tabUpgrades = createElement('button', 'tab-upgrades');
  tabUpgrades.textContent = 'UPGRADES';
  tabUpgrades.style.flex = '1';
  tabs.appendChild(tabUpgrades);
  
  const tabPrestige = createElement('button', 'tab-prestige');
  tabPrestige.textContent = 'COLLAPSE/ASCEND';
  tabPrestige.style.flex = '1';
  tabs.appendChild(tabPrestige);
  
  const tabStats = createElement('button', 'tab-stats');
  tabStats.textContent = 'STATS';
  tabStats.style.flex = '1';
  tabs.appendChild(tabStats);
  
  const panelContent = createElement('div', 'panel-content');
  panelsContainer.appendChild(panelContent);
  
  // Combo meter (bottom center)
  const comboMeter = createElement('div', 'combo-meter');
  comboMeter.style.position = 'absolute';
  comboMeter.style.bottom = '16px';
  comboMeter.style.left = '50%';
  comboMeter.style.transform = 'translateX(-50%)';
  comboMeter.style.width = '160px';
  comboMeter.style.height = '24px';
  comboMeter.style.backgroundColor = 'rgba(0,0,0,0.5)';
  comboMeter.style.borderRadius = '4px';
  comboMeter.style.alignItems = 'center';
  comboMeter.style.display = 'flex';
  comboMeter.style.justifyContent = 'center';
  comboMeter.style.alignItems = 'center';
  root.appendChild(comboMeter);
  
  const comboFill = createElement('div', 'combo-fill');
  comboFill.style.height = '100%';
  comboFill.style.width = '0%';
  comboFill.style.backgroundColor = '#ffd9a0';
  comboMeter.appendChild(comboFill);
  
  const comboText = createElement('div', 'combo-text');
  comboMeter.appendChild(comboText);
  
  // Overdrive meter (bottom center)
  const overdriveMeter = createElement('div', 'overdrive-meter');
  overdriveMeter.style.position = 'absolute';
  overdriveMeter.style.bottom = '16px';
  overdriveMeter.style.left = '50%';
  overdriveMeter.style.transform = 'translateX(-50%)';
  overdriveMeter.style.width = '160px';
  overdriveMeter.style.height = '24px';
  overdriveMeter.style.backgroundColor = 'rgba(0,0,0,0.5)';
  overdriveMeter.style.borderRadius = '4px';
  overdriveMeter.style.alignItems = 'center';
  overdriveMeter.style.display = 'flex';
  overdriveMeter.style.justifyContent = 'center';
  overdriveMeter.style.alignItems = 'center';
  root.appendChild(overdriveMeter);
  
  const overdriveFill = createElement('div', 'overdrive-fill');
  overdriveFill.style.height = '100%';
  overdriveFill.style.width = '0%';
  overdriveFill.style.backgroundColor = '#ff7a1a';
  overdriveMeter.appendChild(overdriveFill);
  
  const overdriveStatus = createElement('div', 'overdrive-status');
  overdriveMeter.appendChild(overdriveStatus);
  
  // Toast log (bottom left)
  const toastContainer = createElement('div', 'toast-container');
  toastContainer.style.position = 'absolute';
  toastContainer.style.bottom = '16px';
  toastContainer.style.left = '16px';
  toastContainer.style.width = '240px';
  toastContainer.style.height = '60px';
  toastContainer.style.overflow = 'hidden';
  root.appendChild(toastContainer);
  
  // Overdrive button (mobile only)
  const overdriveBtn = createElement('button', 'overdrive-btn');
  overdriveBtn.textContent = 'READY — press O';
  overdriveBtn.style.position = 'absolute';
  overdriveBtn.style.bottom = '16px';
  overdriveBtn.style.left = '50%';
  overdriveBtn.style.transform = 'translateX(-50%)';
  overdriveBtn.style.display = 'none';
  overdriveBtn.style.padding = '8px 16px';
  overdriveBtn.style.backgroundColor = '#ff7a1a';
  overdriveBtn.style.color = 'white';
  overdriveBtn.style.border = 'none';
  overdriveBtn.style.borderRadius = '4px';
  overdriveBtn.style.cursor = 'pointer';
  root.appendChild(overdriveBtn);
  
  // Cache all elements for performance
  cache.set('flux-value', fluxValue);
  cache.set('flux-rate', fluxRate);
  cache.set('flux-mult', fluxMult);
  cache.set('stage-name', stageName);
  cache.set('stage-bar-fill', stageBarFill);
  cache.set('play-time', playTime);
  cache.set('mute-btn', muteBtn);
  cache.set('combo-fill', comboFill);
  cache.set('combo-text', comboText);
  cache.set('overdrive-fill', overdriveFill);
  cache.set('overdrive-status', overdriveStatus);
  cache.set('combo-meter', comboMeter);
  cache.set('overdrive-meter', overdriveMeter);
  cache.set('overdrive-btn', overdriveBtn);
  cache.set('injector-list', injectorList);
  cache.set('panels-container', panelsContainer);
  cache.set('tabs', tabs);
  cache.set('tab-upgrades', tabUpgrades);
  cache.set('tab-prestige', tabPrestige);
  cache.set('tab-stats', tabStats);
  cache.set('panel-content', panelContent);
  
  // Event listeners
  window.addEventListener('keydown', (e) => {
    if (e.key === 'o') {
      api.toggleOverdrive();
    }
  });
  
  // Mute button
  muteBtn.addEventListener('click', () => {
    api.toggleMute();
  });
  
  // Overdrive button (mobile)
  overdriveBtn.addEventListener('click', () => {
    api.toggleOverdrive();
  });
  
  // Injector rows
  const injectorRows = new Map();
  
  // Initialize with empty state
  function updateUI(snap) {
    // Update flux values
    setText(cache.get('flux-value'), formatNumber(snap.flux));
    setText(cache.get('flux-rate'), formatRate(snap.rate));
    const effectiveMult = snap.comboMult * (snap.overdriveTimer > 0 ? TUNE.overdrive.mult : 1);
    setText(cache.get('flux-mult'), formatMult(effectiveMult));
    
    // Update stage info
    const stage = snap.stage;
    setText(cache.get('stage-name'), stage.name);
    // Stage progress arrives normalised from the economy; do not re-normalise it.
    stageBarFill.style.width = `${Math.max(0, Math.min(1, stage.progress || 0)) * 100}%`;
    setText(cache.get('stage-bar-fill'), '');
    setText(cache.get('play-time'), formatTime(snap.playSec));

    // Mute state is owned by the audio layer; read it through the api, never assume it.
    const muted = api.isMuted ? api.isMuted() : false;
    muteBtn.classList.toggle('muted', muted);
    muteBtn.textContent = muted ? '🔇' : '🔊';
    
    // Combo meter
    const comboFill = cache.get('combo-fill');
    const comboText = cache.get('combo-text');
    const comboFillWidth = Math.min(1, snap.combo / (TUNE.combo.maxCombo || 1)) * 100;
    comboFill.style.width = `${comboFillWidth}%`;
    setText(comboText, formatMult(snap.comboMult));
    
    // Overdrive meter
    const overdriveFill = cache.get('overdrive-fill');
    const overdriveStatus = cache.get('overdrive-status');
    const overdriveTimer = snap.overdriveTimer || 0;
    const overdriveFull = snap.overdrive >= TUNE.overdrive.need;
    const overdriveActive = overdriveTimer > 0;
    const overdriveFillWidth = Math.min(1, overdriveFull ? 1 : overdriveFull);
    overdriveFill.style.width = `${overdriveFillWidth * 100}%`;
    if (overdriveActive && overdriveFull) {
      overdriveFill.style.border = '2px solid #ffd9a0';
      overdriveFill.style.boxShadow = '0 0 24px rgba(255,217,16,0.5)';
      setText(overdriveStatus, 'READY — press O');
      overdriveBtn.style.display = 'block';
    } else {
      setText(overdriveStatus, overdriveFull ? 'OVERDRIVE ACTIVE' : 'WAITING');
      overdriveBtn.style.display = 'none';
    }
    
    // Injector list
    const injectorListEl = cache.get('injector-list');
    injectorListEl.innerHTML = ''; // Clear and rebuild (only 12 injectors, acceptable)
    const unlockedInjectors = snap.injectors.filter(i => i.unlocked);
    const lockedInjector = unlockLockedInjector(snap.injectors);
    
    unlockedInjectors.forEach(injector => {
      const row = createElement('div', `injector-row-${injector.id}`);
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.padding = '4px 0';
      row.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
      row.style.fontSize = '0.9rem';
      
      // Check if affordable
      const isAffordable = injector.affordable;
      row.dataset.affordable = isAffordable ? '1' : '0';
      
      // Name
      const nameEl = createElement('span', `injector-name-${injector.id}`);
      setText(nameEl, injector.name);
      row.appendChild(nameEl);
      
      // Owned count
      const ownedEl = createElement('span', `injector-owned-${injector.id}`);
      setText(ownedEl, formatNumber(injector.owned));
      row.appendChild(ownedEl);
      
      // Cost
      const costEl = createElement('span', `injector-cost-${injector.id}`);
      setText(costEl, formatNumber(injector.cost));
      row.appendChild(costEl);
      
      // Rate
      const rateEl = createElement('span', `injector-rate-${injector.id}`);
      setText(rateEl, formatRate(injector.rate));
      row.appendChild(rateEl);
      
      // Delta on hover/focus
      const deltaEl = createElement('span', `injector-delta-${injector.id}`);
      deltaEl.style.display = 'none';
      row.addEventListener('mouseenter', () => {
        setText(deltaEl, '+' + formatRate(injector.rate));
        deltaEl.style.display = 'block';
      });
      row.addEventListener('mouseleave', () => {
        setText(deltaEl, '');
        deltaEl.style.display = 'none';
      });
      row.addEventListener('focus', () => {
        setText(deltaEl, '+' + formatRate(injector.rate));
        deltaEl.style.display = 'block';
      });
      row.addEventListener('focusout', () => {
        setText(deltaEl, '');
        deltaEl.style.display = 'none';
      });
      
      row.appendChild(deltaEl);
      injectorListEl.appendChild(row);
      cache.set(`injector-row-${injector.id}`, row);
    });
    
    // Update prestige panel (tabs)
    const panelContent = cache.get('panel-content');
    panelContent.innerHTML = '';
    
    // Upgrades tab
    const upgradesPanel = createElement('div', 'upgrades-panel');
    panelContent.appendChild(upgradesPanel);
    
    // Show upgrades
    snap.upgrades.forEach(upgrade => {
      const upgradeEl = createElement('div', `upgrade-${upgrade.id}`);
      upgradeEl.style.display = 'flex';
      upgradeEl.style.justifyContent = 'space-between';
      upgradeEl.style.padding = '4px 0';
      upgradeEl.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
      upgradeEl.style.fontSize = '0.8rem';
      
      // Name and cost
      const nameEl = createElement('span', `upgrade-name-${upgrade.id}`);
      setText(nameEl, upgrade.name);
      upgradeEl.appendChild(nameEl);
      
      const costEl = createElement('span', `upgrade-cost-${upgrade.id}`);
      setText(costEl, formatNumber(upgrade.cost));
      upgradeEl.appendChild(costEl);
      
      // Affordable flag
      const affordable = upgrade.affordable;
      upgradeEl.dataset.affordable = affordable ? '1' : '0';
      
      // Next 3 locked upgrades
      const lockedNext = getLockedNextUpgrades(upgrade, 3);
      lockedNext.forEach(nextUpgrade => {
        const lockedEl = createElement('div', `upgrade-locked-${nextUpgrade.id}`);
        lockedEl.style.display = 'flex';
        lockedEl.style.justifyContent = 'space-between';
        lockedEl.style.padding = '4px 0';
        lockedEl.style.fontSize = '0.7rem';
        lockedEl.style.color = '#aaa';
        lockedEl.style.opacity = '0.6';
        lockedEl.style.pointerEvents = 'none';
        
        const nameEl = createElement('span', `upgrade-locked-name-${nextUpgrade.id}`);
        setText(nameEl, nextUpgrade.name);
        lockedEl.appendChild(nameEl);
        
        const costEl = createElement('span', `upgrade-locked-cost-${nextUpgrade.id}`);
        setText(costEl, formatNumber(nextUpgrade.cost));
        lockedEl.appendChild(costEl);
        
        upgradeEl.appendChild(lockedEl);
      });
      
      upgradesPanel.appendChild(upgradeEl);
    });
    
    // Prestige panel
    const prestigePanel = createElement('div', 'prestige-panel');
    panelContent.appendChild(prestigePanel);
    
    const collapseAvailable = snap.collapse.available;
    const collapseShards = snap.collapse.shards;
    const ascendAvailable = snap.ascend.available;
    const ascendCores = snap.ascend.cores;
    
    const collapseBtn = createElement('div', 'prestige-collapse');
    const collapseInfo = createElement('div', 'prestige-info');
    setText(collapseInfo, `COLLAPSE: ${formatNumber(collapseShards)} shards`);
    collapseBtn.appendChild(collapseInfo);
    if (!collapseAvailable) {
      const reason = 'insufficient shards';
      const reasonEl = createElement('div', 'prestige-reason');
      setText(reasonEl, `Unavailable: ${reason}`);
      collapseBtn.appendChild(reasonEl);
    }
    prestigePanel.appendChild(collapseBtn);
    
    const ascendBtn = createElement('div', 'prestige-ascend');
    const ascendInfo = createElement('div', 'prestige-info');
    setText(ascendInfo, `ASCEND: ${formatNumber(ascendCores)} cores`);
    ascendBtn.appendChild(ascendInfo);
    if (!ascendAvailable) {
      const reason = 'insufficient flux';
      const reasonEl = createElement('div', 'prestige-reason');
      setText(reasonEl, `Unavailable: ${reason}`);
      ascendBtn.appendChild(reasonEl);
    }
    prestigePanel.appendChild(ascendBtn);
    
    // Stats panel
    const statsPanel = createElement('div', 'stats-panel');
    panelContent.appendChild(statsPanel);
    
    const stats = snap.stats;
    const statsEl = createElement('div', 'stats-info');
    setText(statsEl, `Pulses: ${formatNumber(stats.pulses)} | Crits: ${formatNumber(stats.crits)} | Perfects: ${formatNumber(stats.perfects)} | Play: ${formatTime(stats.playSec)} | Spent: ${formatNumber(stats.spent)} | Best Rate: ${formatRate(stats.bestRate)}`);
    statsPanel.appendChild(statsEl);
  }
  
  // Helper to find locked injector ghost
  function unlockLockedInjector(injectors) {
    const locked = injectors.find(i => !i.unlocked);
    if (!locked) return null;
    const ghost = createElement('div', 'locked-ghost');
    setText(ghost, `LOCKED at ${formatNumber(locked.unlockAt != null ? locked.unlockAt : 0)}`);
    return ghost;
  }
  
  // Helper to get next locked upgrades
  function getLockedNextUpgrades(upgrade, count) {
    const locked = snap.upgrades.filter(u => !u.affordable);
    return locked.slice(0, count);
  }
  
  // Handle buy actions
  const buyHandlers = {
    injector: (id) => {
      const injector = snap.injectors.find(i => i.id === id);
      if (injector && injector.affordable) {
        api.buyInjector(id);
      }
    },
    upgrade: (id) => {
      const upgrade = snap.upgrades.find(u => u.id === id);
      if (upgrade && upgrade.affordable) {
        api.buyUpgrade(id);
      }
    },
    perk: (id) => {
      const perk = snap.perks.find(p => p.id === id);
      if (perk && perk.owned) {
        // Perks are permanent, no buy action needed
      }
    }
  };
  
  // Set up event listeners for UI updates
  bus.on(EVT.LOG, (payload) => {
    const toastText = payload.text || '';
    addToast(toastText);
  });
  
  // Update function
  function update(snap) {
    // Update UI elements
    updateUI(snap);
    
    // Update overdrive button visibility
    const overdriveFill = cache.get('overdrive-fill');
    const overdriveStatus = cache.get('overdrive-status');
    const overdriveFull = snap.overdrive >= TUNE.overdrive.need;
    const overdriveActive = snap.overdriveTimer > 0;
    const overdriveFillWidth = Math.min(1, overdriveFull ? 1 : overdriveFull);
    overdriveFill.style.width = `${overdriveFillWidth * 100}%`;
    
    // Update overdrive status
    if (overdriveActive && overdriveFull) {
      overdriveStatus.textContent = 'READY — press O';
    } else {
      overdriveStatus.textContent = overdriveFull ? 'OVERDRIVE ACTIVE' : 'WAITING';
    }
  }
  
  // Toast log management
  const toastSlots = 5;
  const toastSlotsEl = createElement('div', 'toast-slots');
  toastContainer.appendChild(toastSlotsEl);
  
  const toastElements = [];
  for (let i = 0; i < toastSlots; i++) {
    const el = createElement('div', `toast-slot-${i}`);
    el.style.display = 'none';
    toastSlotsEl.appendChild(el);
    toastElements.push(el);
  }
  
  function addToast(text) {
    const slotIndex = (toastElements.length + 1) % toastSlots;
    const slotEl = toastElements[slotIndex];
    setText(slotEl, text);
    slotEl.style.display = 'block';
    setTimeout(() => {
      slotEl.style.display = 'none';
    }, 3000);
  }
  
  // Return the public API
  return {
    update(snap) {
      updateUI(snap);
    },
    dispose() {
      // Clean up event listeners
      window.removeEventListener('keydown', () => {});
      muteBtn.removeEventListener('click', () => {});
      overdriveBtn.removeEventListener('click', () => {});
    }
  };
}