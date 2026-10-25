// src/core/audio.js — HYPERNOVA audio worker.
// Pure-synthesis WebAudio layer: no audio files, no fetch, no libraries.
// Oscillators, gain envelopes, a noise buffer, biquad filters and a master
// dynamics compressor. The AudioContext is only created inside start().
import { EVT } from './events.js';

// Hard polyphony cap: drop new voices beyond this.
const MAX_VOICES = 12;
// Master gain default.
const MASTER_GAIN = 0.35;

// 3-octave minor pentatonic ladder rooted at A2 (220 Hz), semitone steps
// 0 3 7 10 12 | 12 15 19 22 24 | 24 27 31 34 36. PULSE pitches clamp to this
// ladder so a rising combo always stays musical, never noisy.
const PENT_STEPS = [0, 3, 7, 10, 12, 12, 15, 19, 22, 24, 24, 27, 31, 34, 36];
const PENT = PENT_STEPS.map((s) => 220 * Math.pow(2, s / 12));

let ctx = null;
let master = null;
let comp = null;
let enabled = false;
let noiseBuffer = null;

const voices = new Set(); // { osc, g, f? } — every live synthesis voice
let drone = null; // { osc, g, v } — sustained overdrive drone (one voice)
const unsubs = [];

function now() { return ctx ? ctx.currentTime : 0; }
function ready() { return ctx != null && enabled; }

function ensureNoise() {
  if (noiseBuffer) return;
  const len = ctx.sampleRate * 2; // 2 seconds of white noise, looped per voice
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buf;
}

function playOsc(o) {
  if (!ready() || voices.size >= MAX_VOICES) return null;
  const t = o.t != null ? o.t : now();
  const dur = o.dur != null ? o.dur : 0.2;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  let f = null;
  osc.type = o.type != null ? o.type : 'sine';
  if (o.filterSweep || o.filter) {
    f = ctx.createBiquadFilter();
    f.type = (o.filter && o.filter.type) || 'lowpass';
    osc.connect(f);
    f.connect(g);
  } else {
    osc.connect(g);
  }
  g.connect(master);
  const baseFreq = o.freqRamp ? o.freqRamp[0] : (o.freq != null ? o.freq : 440);
  osc.frequency.value = baseFreq;
  if (o.freqRamp) {
    osc.frequency.setValueAtTime(o.freqRamp[0], t);
    osc.frequency.linearRampToValueAtTime(o.freqRamp[1], t + dur);
  }
  if (o.detune) osc.detune.value = o.detune;
  if (f) {
    if (o.filterSweep) {
      f.frequency.setValueAtTime(o.filterSweep[0], t);
      f.frequency.exponentialRampToValueAtTime(o.filterSweep[1], t + dur);
    } else {
      f.frequency.value = o.filter.freq != null ? o.filter.freq : 3000;
    }
  }
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(o.peak != null ? o.peak : 0.1, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  const stop = t + dur + 0.06;
  osc.start(t);
  osc.stop(stop);
  const v = { osc, g, f };
  voices.add(v);
  osc.onended = () => {
    voices.delete(v);
    try { osc.disconnect(); } catch {}
    try { g.disconnect(); } catch {}
    if (f) { try { f.disconnect(); } catch {} }
  };
  return v;
}

function playNoise(o) {
  if (!ready() || voices.size >= MAX_VOICES) return null;
  ensureNoise();
  const t = o.t != null ? o.t : now();
  const dur = o.dur != null ? o.dur : 0.1;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  const g = ctx.createGain();
  let f = null;
  if (o.filt) {
    f = ctx.createBiquadFilter();
    f.type = o.filt.type || 'lowpass';
    src.connect(f);
    f.connect(g);
    if (o.filt.sweep) {
      f.frequency.setValueAtTime(o.filt.sweep[0], t);
      f.frequency.exponentialRampToValueAtTime(o.filt.sweep[1], t + dur);
    } else {
      f.frequency.value = o.filt.freq != null ? o.filt.freq : 2000;
    }
  } else {
    src.connect(g);
  }
  g.connect(master);
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(o.peak != null ? o.peak : 0.08, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  const stop = t + dur + 0.06;
  src.start(t);
  src.stop(stop);
  const v = { osc: src, g, f };
  voices.add(v);
  src.onended = () => {
    voices.delete(v);
    try { src.disconnect(); } catch {}
    try { g.disconnect(); } catch {}
    if (f) { try { f.disconnect(); } catch {} }
  };
  return v;
}

function startDrone(t) {
  if (drone || voices.size >= MAX_VOICES) return;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 73.42;
  const g = ctx.createGain();
  osc.connect(g);
  g.connect(master);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.06, t + 0.8);
  osc.start(t);
  const v = { osc, g };
  drone = { osc, g, v };
  voices.add(v);
  osc.onended = () => {
    voices.delete(v);
    try { osc.disconnect(); } catch {}
    try { g.disconnect(); } catch {}
  };
}

function stopDrone(t) {
  if (!drone) return;
  const { osc, g, v } = drone;
  drone = null;
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(g.gain.value, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
  osc.stop(t + 1.05);
  osc.onended = () => {
    voices.delete(v);
    try { osc.disconnect(); } catch {}
    try { g.disconnect(); } catch {}
  };
}

// ---- event-driven sounds -----------------------------------------------

function onPulse(p) {
  if (!ready()) return;
  const t = now();
  const raw = p && p.combo != null ? Number(p.combo) : 0;
  const combo = Math.max(0, Math.floor(isNaN(raw) ? 0 : raw));
  const idx = Math.min(combo, PENT.length - 1);
  playOsc({ type: 'triangle', freq: PENT[idx], t, dur: 0.15, peak: 0.13 });
  playNoise({ t, dur: 0.03, peak: 0.07, filt: { type: 'highpass', freq: 4000 } });
}

function onCrit() {
  if (!ready()) return;
  const t = now();
  const root = 329.63;
  playOsc({ type: 'sine', freq: root, t, dur: 0.28, peak: 0.18, filterSweep: [6000, 260] });
  playOsc({ type: 'sine', freq: root * 1.49831, detune: 5, t, dur: 0.28, peak: 0.13, filterSweep: [6000, 260] });
}

function onPerfect() {
  if (!ready()) return;
  onCrit();
  const t = now();
  const base = 523.25;
  for (const ratio of [1, 2.76, 5.40]) {
    playOsc({ type: 'sine', freq: base * ratio, t, dur: 1.5, peak: 0.06 });
  }
}

function onOverdriveStart() {
  if (!ready()) return;
  const t = now();
  playOsc({ type: 'sawtooth', freq: 110, t, dur: 1.8, peak: 0.05, freqRamp: [110, 880] });
  startDrone(t);
}

function onOverdriveEnd() {
  stopDrone(now());
}

function onBuy() {
  if (!ready()) return;
  playNoise({ t: now(), dur: 0.04, peak: 0.05, filt: { type: 'lowpass', freq: 1200 } });
}

function onUpgrade() {
  if (!ready()) return;
  const t = now();
  playNoise({ t, dur: 0.06, peak: 0.06, filt: { type: 'lowpass', freq: 5000 } });
  playOsc({ type: 'triangle', freq: 987.77, t, dur: 0.12, peak: 0.1 });
}

function onAchievement() {
  if (!ready()) return;
  const t = now();
  for (let i = 0; i < 3; i++) {
    playOsc({ type: 'triangle', freq: 523.25 * (1 + i * 0.25), t: t + i * 0.11, dur: 0.28, peak: 0.1 });
  }
}

const SWELL = {
  stage_up: { dur: 1.0, peak: 0.09, saw: [55, 440], filt: [150, 7000] },
  collapse: { dur: 1.5, peak: 0.15, saw: [55, 520], filt: [120, 9000] },
  ascend: { dur: 2.2, peak: 0.22, saw: [55, 620], filt: [100, 11000] },
};

function onSwell(kind) {
  const s = SWELL[kind];
  if (!s || !ready()) return;
  const t = now();
  playOsc({ type: 'sawtooth', freq: s.saw[0], t, dur: s.dur, peak: s.peak * 0.6, freqRamp: s.saw });
  playNoise({ t, dur: s.dur, peak: s.peak, filt: { type: 'lowpass', sweep: s.filt } });
}

function onStageUp() { onSwell('stage_up'); }
function onCollapse() { onSwell('collapse'); }
function onAscend() { onSwell('ascend'); }

export function createAudio(bus) {
  function start() {
    if (ctx) return;
    let AC = null;
    try {
      if (typeof AudioContext !== 'undefined') AC = AudioContext;
      else if (typeof webkitAudioContext !== 'undefined') AC = webkitAudioContext;
    } catch {}
    if (!AC) return; // Node / unsupported: stay silent, never throw
    try {
      ctx = new AC();
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -24;
      comp.knee.value = 30;
      comp.ratio.value = 12;
      comp.attack.value = 0.003;
      comp.release.value = 0.25;
      comp.connect(ctx.destination);
      master = ctx.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(comp);
      enabled = true;
    } catch (err) {
      ctx = null; comp = null; master = null; enabled = false;
    }
  }

  function setEnabled(on) {
    enabled = !!on;
    if (master) {
      const t = now();
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(enabled ? MASTER_GAIN : 0, t);
    }
  }

  function isEnabled() { return enabled; }

  function dispose() {
    stopDrone(now());
    for (const v of voices) {
      try { v.osc.stop(now()); } catch {}
      try { v.osc.disconnect(); } catch {}
      try { v.g.disconnect(); } catch {}
      if (v.f) { try { v.f.disconnect(); } catch {} }
    }
    voices.clear();
    if (master) { try { master.disconnect(); } catch {} }
    if (comp) { try { comp.disconnect(); } catch {} }
    if (ctx) { try { ctx.close().catch(() => {}); } catch {} }
    ctx = null; master = null; comp = null; enabled = false;
    noiseBuffer = null;
    unsubs.forEach((u) => u());
    unsubs.length = 0;
  }

  function onPulseBus(p) { onPulse(p); }
  function onCritBus() { onCrit(); }
  function onPerfectBus() { onPerfect(); }
  function onODStartBus() { onOverdriveStart(); }
  function onODEndBus() { onOverdriveEnd(); }
  function onBuyBus() { onBuy(); }
  function onUpgradeBus() { onUpgrade(); }
  function onStageUpBus() { onStageUp(); }
  function onCollapseBus() { onCollapse(); }
  function onAscendBus() { onAscend(); }
  function onAchievementBus() { onAchievement(); }

  unsubs.push(
    bus.on(EVT.PULSE, onPulseBus),
    bus.on(EVT.CRIT, onCritBus),
    bus.on(EVT.PERFECT, onPerfectBus),
    bus.on(EVT.OVERDRIVE_START, onODStartBus),
    bus.on(EVT.OVERDRIVE_END, onODEndBus),
    bus.on(EVT.BUY, onBuyBus),
    bus.on(EVT.UPGRADE, onUpgradeBus),
    bus.on(EVT.STAGE_UP, onStageUpBus),
    bus.on(EVT.COLLAPSE, onCollapseBus),
    bus.on(EVT.ASCEND, onAscendBus),
    bus.on(EVT.ACHIEVEMENT, onAchievementBus)
  );

  return { start, setEnabled, isEnabled, dispose };
}
