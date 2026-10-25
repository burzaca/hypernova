You are the AUDIO worker on the HYPERNOVA game build. You write a pure-synthesis WebAudio layer:
no audio files, no fetch, no libraries. The game's feedback needs to feel designed — the sound
must rise with the player's combo and go huge during overdrive.

READ FIRST:
1. docs/INTERFACES.md §9 (your contract) and §3 (the EVT names you subscribe to).
2. src/core/events.js — import { EVT } from './events.js'.

WRITE THIS ONE FILE AND NOTHING ELSE: src/core/audio.js
  export function createAudio(bus) -> { start(), setEnabled(bool), isEnabled(), dispose() }

REQUIREMENTS:
- No AudioContext until `start()` is called (browsers require a user gesture). Before start(),
  every method must be a no-op, never throw.
- Subscribe to: EVT.PULSE, EVT.CRIT, EVT.PERFECT, EVT.OVERDRIVE_START, EVT.OVERDRIVE_END,
  EVT.BUY, EVT.UPGRADE, EVT.STAGE_UP, EVT.COLLAPSE, EVT.ASCEND, EVT.ACHIEVEMENT.
- Sound design (all synthesis: OscillatorNode / custom PeriodicWave / noise AudioBuffer /
  GainNode envelopes / BiquadFilter; a compressor on the master bus):
  * PULSE — short bright blip; pitch climbs with the combo in the event payload
    (payload has { combo }); clamp to a musical pentatonic ladder so it never sounds like noise.
  * CRIT — two-oscillator chord stab with a fast downward filter sweep.
  * PERFECT — CRIT plus a bell partial (inharmonic, e.g. ratios 1, 2.76, 5.40).
  * OVERDRIVE_START — rising sweep + a sustained drone that lives while overdrive is active.
  * OVERDRIVE_END — drone fades out.
  * BUY — soft click. UPGRADE — brighter confirm. ACHIEVEMENT — 3-note arpeggio.
  * STAGE_UP / COLLAPSE / ASCEND — a swell (filtered noise + rising saw) of increasing size.
- Polyphony guard: at most 12 simultaneous voices; drop new voices beyond that. Every node must
  be stopped and disconnected when its envelope ends (no leaks over an hour of play).
- Master gain default 0.35; setEnabled(false) must silence immediately and dispose() must close
  the context.
- Never use setInterval/setTimeout for scheduling — use ctx.currentTime envelopes.

SELF-TEST (must pass, paste real output):
  cd /home/hermes/projects/hypernova
  node --check src/core/audio.js
  node -e "import('./src/core/audio.js').then(async m=>{const {EventBus,EVT}=await import('./src/core/events.js');const b=new EventBus();const a=m.createAudio(b);a.pulse&&a.pulse();b.emit(EVT.PULSE,{combo:5});a.start();a.setEnabled(false);a.dispose();console.log('audio module ok, no crash without AudioContext')}).catch(e=>{console.error('FAIL',e.message);process.exit(1)})"
  Node has no WebAudio, so your module must tolerate a missing AudioContext gracefully (guard with
  `typeof AudioContext` / try-catch) — that is exactly what this test checks.

Finish by printing the absolute path you wrote, the self-test output, and the word DONE.
