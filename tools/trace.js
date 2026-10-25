import { TUNE } from '../src/core/tune.js';
import { EventBus } from '../src/core/events.js';
import * as eco from '../src/core/economy.js';

const bus = new EventBus();
const s = eco.createState(42);
const DT = TUNE.sim.dt;
let snap = eco.snapshot(s);
let buyTimer = 0, pulseTimer = 0, snapTimer = 0;
const log = (t) => {
  const owned = Object.entries(s.injectors).filter(([, n]) => n > 0).map(([k, n]) => k + ':' + n).join(' ');
  console.log(`t=${t.toFixed(0).padStart(4)} flux=${snap.flux.toExponential(2)} total=${snap.totalFlux.toExponential(2)} rate=${snap.rate.toExponential(2)} stage=${snap.stage.name} od=${s.overdrive.toFixed(0)} odT=${s.overdriveTimer.toFixed(1)} combo=${s.combo.toFixed(0)} upg=${Object.keys(s.upgrades).length} [${owned}]`);
};
for (let t = 0; t < 300; t += DT) {
  pulseTimer += DT;
  if (pulseTimer >= 1 / 6) { pulseTimer -= 1 / 6; eco.pulse(s, bus); }
  const cs = eco.chargeState(s);
  if (cs.ready) eco.fireCharge(s, bus, 0);
  if (s.overdrive >= TUNE.overdrive.need && s.overdriveTimer <= 0) eco.triggerOverdrive(s, bus);
  buyTimer += DT;
  if (buyTimer >= 0.5) {
    buyTimer = 0;
    for (const inj of snap.injectors) if (inj.unlocked && inj.affordable) eco.buyInjector(s, bus, inj.id);
    for (const up of snap.upgrades) if (up.unlocked && !up.owned && up.affordable) eco.buyUpgrade(s, bus, up.id);
  }
  eco.tick(s, DT, bus);
  snapTimer += DT;
  if (snapTimer >= 0.25) { snapTimer = 0; snap = eco.snapshot(s); }
  if (Math.abs(t % 10) < DT) log(t);
}
