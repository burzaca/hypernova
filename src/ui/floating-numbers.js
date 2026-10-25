// Floating click numbers — the player asked to SEE what a click is worth, not only the counter.
// Self-contained overlay: it injects its own style, tracks the pointer itself (the PULSE event has
// no coordinates), and caps live nodes so a 6 CPS player cannot make the page stutter.
import { formatNumber } from '../core/format.js';
import { EVT } from '../core/events.js';

const MAX_LIVE = 24;
const LIFE_MS = 950;

const STYLE = `
@keyframes hnFloatUp {
  0%   { transform: translate(-50%, 0) scale(1);    opacity: 1; }
  70%  { opacity: .9; }
  100% { transform: translate(-50%, -80px) scale(.92); opacity: 0; }
}
.hn-float-layer { position: fixed; inset: 0; pointer-events: none; z-index: 60; overflow: hidden; }
.hn-float {
  position: absolute; pointer-events: none; will-change: transform, opacity;
  font: 700 1.15rem/1 var(--hn-font, ui-monospace, monospace);
  color: var(--hn-accent, #ffb347); text-shadow: 0 1px 4px rgba(0,0,0,.75);
  animation: hnFloatUp ${LIFE_MS}ms ease-out forwards;
}
.hn-float.crit { font-size: 2rem; font-weight: 800; color: #fff3c4; text-shadow: 0 0 14px var(--hn-accent, #ffb347); }
.hn-float.auto { font-size: .85rem; opacity: .55; }
`;

export function createFloatingNumbers(bus) {
  const layer = document.createElement('div');
  layer.className = 'hn-float-layer';
  const style = document.createElement('style');
  style.textContent = STYLE;
  layer.appendChild(style);

  let pointer = null;
  const onPointer = (e) => { pointer = { x: e.clientX, y: e.clientY }; };
  const live = [];

  function spawn(text, cls, at) {
    while (live.length >= MAX_LIVE) { const old = live.shift(); old.remove(); }
    const el = document.createElement('div');
    el.className = 'hn-float' + (cls ? ' ' + cls : '');
    el.textContent = text;
    // Manual pulses land under the cursor; auto-pulse drifts away from it so the two never stack.
    const jitter = (n) => (Math.random() * 2 - 1) * n;
    const base = at || pointer;
    const x = base ? base.x + jitter(cls === 'auto' ? 26 : 12) : window.innerWidth * 0.5 + jitter(120);
    const y = base ? base.y + jitter(10) : window.innerHeight * 0.5 + jitter(80);
    el.style.left = Math.round(x) + 'px';
    el.style.top = Math.round(y) + 'px';
    layer.appendChild(el);
    live.push(el);
    setTimeout(() => { el.remove(); const i = live.indexOf(el); if (i >= 0) live.splice(i, 1); }, LIFE_MS);
  }

  const onPulse = (p) => {
    if (!p || !(p.gain > 0)) return;
    spawn('+' + formatNumber(p.gain), p.auto ? 'auto' : '', p.auto ? null : pointer);
  };
  const onCrit = (p) => {
    if (!p || !(p.gain > 0)) return;
    spawn('+' + formatNumber(p.gain) + (p.perfect ? ' PERFECT' : ''), 'crit', pointer);
  };

  const unsubs = [];
  return {
    mount(root) {
      (root || document.body).appendChild(layer);
      window.addEventListener('pointerdown', onPointer, true);
      unsubs.push(bus.on(EVT.PULSE, onPulse), bus.on(EVT.CRIT, onCrit));
    },
    update() { /* animation is CSS-driven; nothing to tick */ },
    dispose() {
      window.removeEventListener('pointerdown', onPointer, true);
      while (unsubs.length) unsubs.pop()();
      while (live.length) live.shift().remove();
      layer.remove();
    },
  };
}
