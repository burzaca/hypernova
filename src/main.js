// HYPERNOVA — integration core. PM-owned: this is the only file that wires state, render, UI, audio.
import { EventBus, EVT } from './core/events.js';
import { TUNE } from './core/tune.js';
import { clamp, angleDelta } from './core/math.js';
import * as eco from './core/economy.js';
import { createHUD } from './ui/hud.js';
import { createCoach } from './ui/onboarding.js';
import { createTitleCard } from './ui/titlecard.js';
import { createAudio } from './core/audio.js';

const FIXED_DT = 1 / 120;
const SNAP_HZ = 30;
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
let hudBroken = false;
let sceneBroken = false;
let coach = null;
let hiddenAt = 0;
let started = false;

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
  coach = createCoach(bus, api);

  // ?state=<json> loads a save straight from the URL: a debug hook and a "share my run" handle.
  const urlState = new URLSearchParams(location.search).get('state');
  const saved = eco.load(urlState || localStorage.getItem(TUNE.save.key));
  state = saved || eco.createState(1);
  if (saved && !urlState) {
    const away = (Date.now() - (state.lastSave || Date.now())) / 1000;
    const gained = eco.applyOffline(state, away, bus);
    if (gained > 0) bus.emit(EVT.LOG, { text: 'While you were away: +' + gained });
  }

  resize();
  snap = eco.snapshot(state);   // first frame paints the star behind the title card
  window.addEventListener('resize', resize);
  bindInput();
  if (bootEl) bootEl.style.display = 'none';
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      running = false;
      save();
    } else {
      // A backgrounded tab stops ticking; credit that time like an absence, so nobody loses
      // progress by switching tabs.
      if (hiddenAt) {
        const away = (Date.now() - hiddenAt) / 1000;
        if (away > 10) {
          const gained = eco.applyOffline(state, away, bus);
          if (gained > 0) bus.emit(EVT.LOG, { text: 'While you were away: +' + gained });
        }
        hiddenAt = 0;
      }
      last = performance.now();
      acc = 0;
      if (started) running = true;
    }
  });
  window.addEventListener('pagehide', save);
  // The title card is the user gesture browsers require for audio; the sim waits for it.
  running = false;
  createTitleCard(() => {
    unlockAudio();
    started = true;
    running = true;
    last = performance.now();
  });
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
    doPulse();
  });
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
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;              // tab was throttled: do not fast-forward the economy

  if (running) {
    // input rate limiting — one pulse per deliberate press, capped so mashing cannot outrun design
    pulseBudget = Math.min(MAX_PPS / 60, pulseBudget + dt * MAX_PPS);

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
      if (coach) { try { coach.update(snap); } catch { /* coaching is optional */ } }
    }

    saveTimer += dt;
    if (saveTimer >= TUNE.save.autosaveSec) { saveTimer = 0; save(); }
  }

  // The star keeps turning even while paused or behind the title card: a live backdrop, not a
  // blank canvas. dt=0 freezes the game clock but not the visuals.
  if (snap) {
    try {
      scene.update(snap, running ? dt : 0);
    } catch (err) {
      if (!sceneBroken) { sceneBroken = true; console.error('scene update failed', err); }
    }
  }
}

boot().catch(fail);
