// HYPERNOVA — title card. PM-owned, self-contained. Doubles as the audio-unlock gesture:
// browsers only allow AudioContext after a real user gesture, so the game starts on a press.
const STYLE = `
#hn-title {
  position: fixed; inset: 0; z-index: 40; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 18px; cursor: pointer;
  background: radial-gradient(ellipse at 50% 45%, rgba(30,16,6,.55), rgba(4,3,8,.92) 70%);
  transition: opacity .6s ease; text-align: center; padding: 24px;
}
#hn-title.gone { opacity: 0; pointer-events: none; }
#hn-title h1 {
  margin: 0; font: 800 clamp(34px, 9vw, 92px)/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: .14em; color: #fff3d6;
  text-shadow: 0 0 26px rgba(255,150,40,.55), 0 0 70px rgba(255,90,10,.35);
}
#hn-title .tag {
  font: 600 clamp(11px, 2.2vw, 16px)/1.6 ui-monospace, monospace; letter-spacing: .34em;
  text-transform: uppercase; color: #ffb347;
}
#hn-title .keys {
  margin-top: 10px; font: 500 12px/2 ui-monospace, monospace; color: rgba(255,240,220,.62);
  letter-spacing: .08em;
}
#hn-title .keys b { color: #fff; }
#hn-title .go {
  margin-top: 16px; font: 700 13px/1 ui-monospace, monospace; letter-spacing: .3em;
  text-transform: uppercase; color: #0a0603; background: #ffd9a0; padding: 12px 22px;
  border-radius: 2px; animation: hn-pulse 1.6s ease-in-out infinite;
}
@keyframes hn-pulse { 0%,100% { opacity: .55; } 50% { opacity: 1; } }
`;

export function createTitleCard(onStart) {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);
  const el = document.createElement('div');
  el.id = 'hn-title';
  el.innerHTML = `
    <div class="tag">feed the core</div>
    <h1>HYPERNOVA</h1>
    <div class="tag">break the scale</div>
    <div class="keys">
      <b>CLICK / HOLD</b> the core — pulse, keep the combo<br>
      <b>SPACE</b> — fire the charge ring when the marker crosses the bright arc<br>
      <b>O</b> — overdrive &nbsp;·&nbsp; <b>M</b> mute &nbsp;·&nbsp; <b>P</b> pause
    </div>
    <div class="go">click to ignite</div>`;
  document.body.appendChild(el);

  let fired = false;
  const dismiss = () => {
    if (fired) return;
    fired = true;
    el.classList.add('gone');
    setTimeout(() => el.remove(), 700);
    onStart();
  };
  el.addEventListener('pointerdown', dismiss);
  window.addEventListener('keydown', (e) => {
    if (!fired && (e.key === ' ' || e.key === 'Enter')) dismiss();
  });
  return { dismiss };
}
