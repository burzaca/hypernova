// HYPERNOVA — first-run onboarding. PM-owned, self-contained (injects its own styles so it
// never collides with the HUD's stylesheet). Teaches the three verbs in the order the player
// meets them, then gets out of the way forever.
const KEY = 'hypernova.onboarded.v1';

const STYLE = `
#hn-coach {
  position: fixed; left: 50%; bottom: 128px; transform: translateX(-50%);
  z-index: 30; pointer-events: none;
  font: 600 13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: .12em; text-transform: uppercase;
  color: #ffe9c9; text-shadow: 0 0 18px rgba(0,0,0,.9);
  padding: 8px 16px; border: 1px solid rgba(255,220,160,.25);
  background: rgba(8,6,10,.55); border-radius: 3px;
  opacity: 0; transition: opacity .45s ease, transform .45s ease;
}
#hn-coach.show { opacity: .92; }
#hn-coach b { color: #fff; }
@media (max-width: 720px) {
  #hn-coach { bottom: auto; top: 132px; font-size: 11px; max-width: 86vw; text-align: center; }
}
`;

export function createCoach(bus, api) {
  let el = null;
  let step = -1;
  let done = false;
  try { done = localStorage.getItem(KEY) === '1'; } catch { /* storage may be blocked */ }

  function ensure() {
    if (el || done) return el;
    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.appendChild(style);
    el = document.createElement('div');
    el.id = 'hn-coach';
    document.body.appendChild(el);
    return el;
  }

  function say(text, idx) {
    if (done || idx === step) return;
    step = idx;
    ensure();
    el.innerHTML = text;
    el.classList.add('show');
  }
  function hide() {
    if (el) el.classList.remove('show');
    done = true;
    try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
  }

  // The coach only ever reacts to what the player actually did.
  let pulses = 0, crits = 0, bought = 0, overdrives = 0;
  const off = [];
  off.push(bus.on('pulse', () => {
    pulses += 1;
    if (pulses === 3) say('Keep the rhythm — <b>combo</b> multiplies every pulse', 0);
  }));
  off.push(bus.on('crit', () => {
    crits += 1;
    if (crits === 1) say('Perfect hit. <b>Space</b> when the marker crosses the bright arc', 1);
  }));
  off.push(bus.on('buy', () => {
    bought += 1;
    if (bought === 1) say('Everything grows from <b>injectors</b>. Buy the next tier when you can', 2);
  }));
  off.push(bus.on('overdrive_start', () => {
    overdrives += 1;
    if (overdrives === 1) say('<b>Overdrive</b> — ride it', 3);
  }));
  off.push(bus.on('stage_up', (p) => {
    if (p && p.index === 1) say('Your star is <b>evolving</b>. It never stops', 4);
  }));

  function update(snap) {
    if (done) return;
    if (snap.stats.pulses >= 12 && snap.injectors.some((i) => i.id === 'ion_spark' && i.affordable) && step < 0) {
      say('Click the core. Then <b>buy</b> what the shop offers', 0);
    }
    if (snap.stats.playSec > 240) hide(); // never nag an experienced player
  }

  function dispose() {
    for (const f of off) { try { f(); } catch { /* ignore */ } }
    if (el) el.remove();
    el = null;
  }

  return { update, hide, dispose };
}
