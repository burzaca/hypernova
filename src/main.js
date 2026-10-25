// HYPERNOVA — integration core. PM-owned: this is the only file that wires state, render, UI, audio.
import { EventBus, EVT } from './core/events.js';
import { TUNE } from './core/tune.js';
import { clamp, angleDelta } from './core/math.js';
import * as eco from './core/economy.js';
import { createHUD } from './ui/hud.js';
import { createAudio } from './core/audio.js';

const FIXED_DT = 1 / 120;
const SNAP_HZ = 30;
const HOLD_PPS = 8;          // pulses per second while the pointer is held down
const MAX_PPS = 12;          // hard input cap so mashing cannot break the sim
const RING_TARGET = 0;       // the ring's hit angle, shared with the renderer

const canvas = document.getElementById('stage');
const hudRoot = document.getElementById('hud');
const bootEl = document.getElementById('boot');

const bus = new EventBus();
let state = null;
let scene = null;
let hud = null;
let audio = null;

let acc = 0;
let last = performance.now();
let snapAcc = 0;
let snap = null;
let running = true;
let saveTimer = 0;
let pulseBudget = 0;
let holding = false;
let holdAcc = 0;
let hudBroken = false;
let sceneBroken = false;

function fail(err) {
  console.error(err);
  if (bootEl) {
    bootEl.style.display = 'block';
    bootEl.textContent = 'HYPERNOVA failed to start: ' + (err && err.message ? err.message : err);
  }
}

// ---------------------------------------------------------------- boot
async function boot() {
  const { createScene } = await import('./render/scene.js');
  scene = createScene(canvas, bus);
  audio = createAudio(bus);
  hud = createHUD(hudRoot, bus, api);

  const saved = eco.load(localStorage.getItem(TUNE.save.key));
  state = saved || eco.createState(1);
  if (saved) {
    const away = (Date.now() - (state.lastSave || Date.now())) / 1000;
    const gained = eco.applyOffline(state, away, bus);
    if (gained > 0) bus.emit(EVT.LOG, { text: 'While you were away: +' + gained });
  }

  resize();
  window.addEventListener('resize', resize);
  bindInput();
  if (bootEl) bootEl.style.display = 'none';
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      running = false;
      save();
    } else {
      last = performance.now();
      running = true;
    }
  });
  window.addEventListener('pagehide', save);
  requestAnimationFrame(frame);
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  if (scene) scene.resize(w, h);
}

// ---------------------------------------------------------------- input
function bindInput() {
  const doPulse = () => {
    if (pulseBudget <= 0) return;
    pulseBudget -= 1;
    const gain = eco.pulse(state, bus);
    if (gain > 0) audio.pulse && audio.pulse(state.combo);
  };
  const fire = () => {
    const cs = eco.chargeState(state);
    if (!cs.ready) return;
    const offset = angleDelta(cs.angle, RING_TARGET);
    eco.fireCharge(state, bus, offset);
  };

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    unlockAudio();
    holding = true;
    holdAcc = 0;
    doPulse();
  });
  window.addEventListener('pointerup', () => { holding = false; });
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    unlockAudio();
    fire();
  });
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'enter') { e.preventDefault(); unlockAudio(); fire(); }
    else if (k === 'o') { unlockAudio(); api.toggleOverdrive(); }
    else if (k === 'm') { api.toggleMute(); }
    else if (k === 'p') { running = !running; last = performance.now(); }
  });
}

let audioStarted = false;
function unlockAudio() {
  if (audioStarted) return;
  audioStarted = true;
  try { audio.start(); } catch (err) { /* audio is optional */ }
}

// ---------------------------------------------------------------- api for the UI
const api = {
  buyInjector: (id) => { unlockAudio(); return eco.buyInjector(state, bus, id); },
  buyUpgrade: (id) => { unlockAudio(); return eco.buyUpgrade(state, bus, id); },
  buyPerk: (id) => { unlockAudio(); return eco.buyPerk(state, bus, id); },
  collapse: () => { state = eco.doCollapse(state, bus); return true; },
  ascend: () => { state = eco.doAscend(state, bus); return true; },
  toggleOverdrive: () => eco.triggerOverdrive(state, bus),
  toggleMute: () => { audio.setEnabled(!audio.isEnabled()); return audio.isEnabled(); },
  isMuted: () => audio.isEnabled() === false,
  exportSave: () => eco.save(state),
  importSave: (text) => { const s = eco.load(text); if (s) { state = s; save(); return true; } return false; },
  canCollapse: () => eco.canCollapse(state),
  canAscend: () => eco.canAscend(state),
};

function save() {
  try {
    state.lastSave = Date.now();
    localStorage.setItem(TUNE.save.key, eco.save(state));
  } catch (err) { /* storage may be full or blocked */ }
}

// ---------------------------------------------------------------- loop
function frame(now) {
  requestAnimationFrame(frame);
  if (!running) return;
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;              // tab was throttled: do not fast-forward the economy

  // input rate limiting
  pulseBudget = Math.min(MAX_PPS / 60, pulseBudget + dt * MAX_PPS);
  if (holding) {
    holdAcc += dt;
    while (holdAcc >= 1 / HOLD_PPS) { holdAcc -= 1 / HOLD_PPS; const g = eco.pulse(state, bus); if (g > 0) audio.pulse && audio.pulse(state.combo); }
  }

  acc += dt;
  let steps = 0;
  while (acc >= FIXED_DT && steps < 20) {
    eco.tick(state, FIXED_DT, bus);
    acc -= FIXED_DT;
    steps += 1;
  }
  if (steps >= 20) acc = 0;

  snapAcc += dt;
  if (snapAcc >= 1 / SNAP_HZ || !snap) {
    snapAcc = 0;
    snap = eco.snapshot(state);
    // A HUD fault must never take the game (or the star) down with it.
    try {
      hud.update(snap);
    } catch (err) {
      if (!hudBroken) { hudBroken = true; console.error('HUD update failed', err); bus.emit(EVT.ERROR, { where: 'hud', err: String(err) }); }
    }
  }
  try {
    scene.update(snap, dt);
  } catch (err) {
    if (!sceneBroken) { sceneBroken = true; console.error('scene update failed', err); }
  }

  saveTimer += dt;
  if (saveTimer >= TUNE.save.autosaveSec) { saveTimer = 0; save(); }
}

boot().catch(fail);
